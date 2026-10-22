import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Always create a fresh, isolated database. Never read the developer/business database.
const root = resolve(import.meta.dirname, "..");
const database = `massage_note_portfolio_${process.pid}`;
const today = "2026-10-22";
const storeId = "10000000-0000-4000-8000-000000000001";
const store = `/stores/${storeId}`;
const member = index => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const shift = amount => new Date(Date.parse(`${today}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: "pipe", ...options });
const docker = args => run("docker", ["compose", "exec", "-T", "postgres", ...args]);
let app;
let created = false;
try {
  docker(["createdb", "-U", "massage", database]);
  created = true;
  process.env.DATABASE_URL = `postgresql://massage:massage@localhost:5432/${database}`;
  process.env.DEV_AUTH_ENABLED = "true";
  process.env.DEV_AUTH_SECRET = randomUUID() + randomUUID();
  process.env.NODE_ENV = "development";
  run("pnpm", ["--filter", "@massage-note/database", "migrate:deploy"], { env: process.env });
  let sql = readFileSync(resolve(root, "scripts/seed-local-demo.sql"), "utf8")
    .replaceAll("(timezone('America/New_York', now()))::date", `DATE '${today}'`);
  const names = {
    "本地演示店": "Willow Wellness · Demo", "本地": "Alex", "店主": "Morgan", "测试店主": "Alex",
    "小美": "Mia", "安娜": "Anna", "莉莉": "Lily", "大卫": "David",
    "60 分钟深层组织按摩": "Deep tissue massage", "深层": "Deep tissue",
    "60 分钟足部按摩": "Foot massage", "足部": "Foot",
    "热石": "Hot stones", "精油": "Aromatherapy",
  };
  // Longest keys first, so partial Chinese names cannot shadow full labels.
  for (const [from, to] of Object.entries(names).sort((a, b) => b[0].length - a[0].length)) sql = sql.replaceAll(from, to);
  run("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "massage", "-d", database, "-v", "ON_ERROR_STOP=1"], { input: sql });
  const requireApi = createRequire(resolve(root, "apps/api/package.json"));
  requireApi("reflect-metadata");
  const { NestFactory } = requireApi("@nestjs/core");
  const { AppModule } = await import(pathToFileURL(resolve(root, "apps/api/dist/app.module.js")));
  const { ApiExceptionFilter } = await import(pathToFileURL(resolve(root, "apps/api/dist/common/api-exception.filter.js")));
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.use((_req, res, next) => { res.locals.requestId = randomUUID(); next(); });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  let cookie = "";
  async function request(path, body) {
    const response = await fetch(`${base}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": randomUUID(), "X-Device-Timezone": "America/New_York", "X-Device-Time": `${today}T16:00:00Z` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    const content = await response.text();
    const value = content ? JSON.parse(content) : null;
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  await request("/auth/dev-session", { phoneE164: "+17705750450" });
  console.log("Created isolated seed and demo session.");
  // Three months of synthetic services, calculated and closed by the real API.
  for (let offset = -84; offset < -6; offset++) {
    const date = shift(offset);
    for (let index = 0; index < 2 + (Math.abs(offset) % 4); index++) {
      const record = await request(`${store}/work-records`, {
        employeeMembershipId: member(1 + index % 5), startAt: `${date}T${String(14 + index).padStart(2, "0")}:00:00Z`,
        customService: { name: "Swedish massage", shortName: "Swedish", amountCents: 8000 + (Math.abs(offset) % 5) * 1000, durationMinutes: 60 },
        isHighlighted: index === 1,
      });
      await request(`${store}/work-records/${record.id}/confirm-payment`, {
        version: record.version, cashServiceCents: index % 2 ? 0 : record.grossFeeBaseCents,
        cardServiceCents: index % 2 ? record.grossFeeBaseCents : 0, cashTipCents: index % 2 ? 0 : 1500, cardTipCents: index % 2 ? 2000 : 0,
      });
    }
  }
  for (let offset = -84; offset < 0; offset++) await request(`${store}/closings/${shift(offset)}`, { force: true, forceReason: "Synthetic portfolio scenario" });
  await request(`${store}/work-records`, { employeeMembershipId: member(3), startAt: `${today}T19:00:00Z`, serviceItemId: "30000000-0000-4000-8000-000000000001" });
  for (const expense of [
    { kind: "RECURRING", name: "Studio rent", rule: { startDate: "2026-08-01", unit: "MONTH", interval: 1, amountCents: 240000 } },
    { kind: "RECURRING", name: "Insurance", rule: { startDate: "2026-08-01", unit: "MONTH", interval: 1, amountCents: 18000 } },
    { kind: "ONCE", name: "Linens and supplies", occurredOn: shift(-3), amountCents: 16850 },
  ]) await request(`${store}/expenses`, expense);
  const responses = {};
  async function capture(path) { responses[path] = await request(path); }
  for (const suffix of ["", "/catalog", "/members", "/join-requests", "/work-records/deleted", "/gift-card-sales/deleted", "/work-bot", "/closing-delivery-agent/status", "/weekly-dispatch", "/business-days/current", "/gift-card-sales", "/payroll-settlements", "/audit-logs", "/employee-settlements/deliveries"]) await capture(store + suffix);
  await capture("/me");
  await capture(`${store}/audit-logs?limit=30`);
  for (let offset = -6; offset <= 0; offset++) {
    const date = shift(offset);
    for (const suffix of [`/boards/${date}`, `/cash-settlements/${date}`, `/closings/${date}/preview`, `/closings/${date}/deliveries`, `/lost-customers?businessDate=${date}`]) await capture(store + suffix);
  }
  const ranges = [[shift(-6), today], [shift(-29), today], ["2026-09-01", today], ["2026-10-01", today], ["2026-09-01", "2026-09-22"], ["2026-08-01", "2026-08-22"]];
  for (const highlightFilter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]) {
    const path = `${store}/finance/analytics?highlightFilter=${highlightFilter}`;
    await capture(path);
    const { dateFrom, dateTo } = responses[path];
    for (const endpoint of ["summary", "details"]) await capture(`${store}/finance/${endpoint}?dateFrom=${dateFrom}&dateTo=${dateTo}&highlightFilter=${highlightFilter}`);
  }
  for (const [dateFrom, dateTo] of ranges) for (const highlightFilter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]) {
    const params = new URLSearchParams({ dateFrom, dateTo, highlightFilter });
    for (const endpoint of ["summary", "details", "analytics"]) await capture(`${store}/finance/${endpoint}?${params}`);
  }
  for (let offset = -6; offset <= 0; offset++) for (const endpoint of ["summary", "details"]) await capture(`${store}/finance/${endpoint}?dateFrom=${shift(offset)}&dateTo=${shift(offset)}&highlightFilter=ALL`);
  for (const month of ["2026-08", "2026-09", "2026-10"]) {
    await capture(`${store}/expenses?month=${month}`);
    const last = new Date(Date.UTC(2026, Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    await capture(`${store}/business-days/open-work-dates?dateFrom=${month}-01&dateTo=${last}`);
    for (let index = 1; index <= 5; index++) await capture(`${store}/employee-settlements/calendar?membershipId=${member(index)}&month=${month}`);
  }
  for (let index = 1; index <= 5; index++) {
    await capture(`${store}/members/${member(index)}/commissions`);
    await capture(`${store}/employee-settlements/preview?membershipId=${member(index)}&dateFrom=2026-10-01&dateTo=${today}&paymentScope=ALL`);
  }
  // The seed identity is a setup convenience, never a public contact detail.
  const serialized = JSON.stringify({ today, source: "Isolated synthetic database; generated by the real API", responses })
    .replaceAll("+17705750450", "+12025550100");
  mkdirSync(resolve(root, "apps/web/demo"), { recursive: true });
  writeFileSync(resolve(root, "apps/web/demo/responses.json"), serialized + "\n");
  console.log(`Captured ${Object.keys(responses).length} synthetic responses (${Math.round(serialized.length / 1024)} KB).`);
} finally {
  if (app) await app.close();
  if (created) docker(["dropdb", "-U", "massage", "--force", database]);
}
