import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/client/index.js";
import { describe, expect, it } from "vitest";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const migration = await readFile(new URL("../prisma/migrations/20261110210000_cash_commission_discount_basis/migration.sql", import.meta.url), "utf8");

describe.skipIf(!enabled)("现金提成折扣基数前向修复", () => {
  it("修复已有及已删除订单，保留实收、总工资、已付与冻结快照，重跑不重复修改", async () => {
    const prisma = new PrismaClient();
    const schema = `cash_commission_${randomUUID().replaceAll("-", "")}`;
    const fixtures = [
      { id: "reported", cash: 2500n, card: 10000n, gift: 0n, discount: 500n, wage: 7800n, expected: 1800n },
      { id: "deleted", cash: 2500n, card: 10000n, gift: 0n, discount: 500n, wage: 7800n, expected: 1800n },
      { id: "gift", cash: 2000n, card: 6000n, gift: 3000n, discount: 1000n, wage: 7000n, expected: 1750n },
      { id: "shortfall", cash: 1n, card: 1n, gift: 0n, discount: 99n, wage: 51n, expected: 50n },
      { id: "half-cent", cash: 2n, card: 1n, gift: 0n, discount: 1n, wage: 2n, expected: 2n },
      { id: "large", cash: 2500000000000000n, card: 10000000000000000n, gift: 0n, discount: 500000000000000n, wage: 7800000000000000n, expected: 1800000000000000n },
      { id: "mismatch", cash: 1000n, card: 3000n, gift: 0n, discount: 1000n, wage: 6000n, expected: 2400n },
      { id: "no-discount", cash: 2500n, card: 10000n, gift: 0n, discount: 0n, wage: 7500n, expected: 1500n },
      { id: "card-only", cash: 0n, card: 9500n, gift: 0n, discount: 500n, wage: 6000n, expected: 0n },
      { id: "gift-only", cash: 0n, card: 0n, gift: 9500n, discount: 500n, wage: 6000n, expected: 0n },
      { id: "free", cash: 0n, card: 0n, gift: 0n, discount: 10000n, wage: 6000n, expected: 0n },
      { id: "cash-only", cash: 1000n, card: 0n, gift: 0n, discount: 9000n, wage: 6000n, expected: 6000n },
      { id: "pending", cash: 0n, card: 0n, gift: 0n, discount: 500n, wage: 6000n, expected: 0n },
    ];
    const snapshotTables = ["daily_cash_settlements", "payroll_settlements", "business_day_closings", "employee_closing_deliveries", "employee_settlement_shares"];
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(`CREATE TABLE work_records (
          id TEXT PRIMARY KEY, status TEXT, cash_service_cents BIGINT, card_service_cents BIGINT, gift_card_service_cents BIGINT,
          discount_total_cents BIGINT, total_large_fee_wage_cents BIGINT, employee_total_income_cents BIGINT,
          cash_allocated_service_wage_cents BIGINT, cash_acquired_service_wage_cents BIGINT, cash_wage_shortfall_cents BIGINT,
          version INT DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT '2026-09-01', deleted_at TIMESTAMPTZ)`);
        const round = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);
        for (const row of fixtures) {
          const paid = row.cash + row.card + row.gift;
          const allocated = paid === 0n ? 0n : round(row.wage * row.cash, paid);
          const acquired = row.cash < allocated ? row.cash : allocated;
          await tx.$executeRaw`INSERT INTO work_records (id, status, cash_service_cents, card_service_cents, gift_card_service_cents,
            discount_total_cents, total_large_fee_wage_cents, employee_total_income_cents,
            cash_allocated_service_wage_cents, cash_acquired_service_wage_cents, cash_wage_shortfall_cents, deleted_at)
            VALUES (${row.id}, ${row.id === "pending" ? "PENDING_PAYMENT" : "CONFIRMED"}, ${row.cash}, ${row.card}, ${row.gift},
              ${row.discount}, ${row.wage}, ${row.wage + 3500n}, ${allocated}, ${acquired}, ${allocated - acquired},
              ${row.id === "deleted" ? new Date("2026-09-02") : null})`;
        }
        for (const table of snapshotTables) {
          await tx.$executeRawUnsafe(`CREATE TABLE ${table} (snapshot_json JSONB)`);
          await tx.$executeRawUnsafe(`INSERT INTO ${table} VALUES ('{"cashAllocatedServiceWageCents":1560,"paidCents":5060}')`);
        }
        const read = () => tx.$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM work_records ORDER BY id');
        const before = await read();
        await tx.$executeRawUnsafe(migration);
        const after = await read();
        for (const row of after) {
          const fixture = fixtures.find(item => item.id === row.id)!;
          const original = before.find(item => item.id === row.id)!;
          expect(row.cash_allocated_service_wage_cents).toBe(fixture.expected);
          const acquired = fixture.cash < fixture.expected ? fixture.cash : fixture.expected;
          expect(row.cash_acquired_service_wage_cents).toBe(acquired);
          expect(row.cash_wage_shortfall_cents).toBe(fixture.expected - acquired);
          const changed = original.cash_allocated_service_wage_cents !== fixture.expected;
          expect(row.version).toBe(changed ? 2 : 1);
          expect(row.updated_at).toEqual(changed ? expect.any(Date) : original.updated_at);
          const { cash_allocated_service_wage_cents: _allocated, cash_acquired_service_wage_cents: _acquired,
            cash_wage_shortfall_cents: _shortfall, version: _version, updated_at: _updated, ...preserved } = row;
          expect(original).toMatchObject(preserved);
        }
        for (const table of snapshotTables) {
          expect(await tx.$queryRawUnsafe(`SELECT * FROM ${table}`)).toEqual([{ snapshot_json: { cashAllocatedServiceWageCents: 1560, paidCents: 5060 } }]);
        }
        await tx.$executeRawUnsafe(migration);
        expect(await read()).toEqual(after);
        await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      }, { timeout: 20_000 });
    } finally { await prisma.$disconnect(); }
  });
});
