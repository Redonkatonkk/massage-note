import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/client/index.js";
import { describe, expect, it } from "vitest";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const migration = await readFile(new URL("../prisma/migrations/20261017010000_expense_usual_amount/migration.sql", import.meta.url), "utf8");

describe.skipIf(!enabled)("旧支出规则前向迁移", () => {
  it("按店铺当地月首向上对齐合法边界，保留金额、规则、账单和审计", async () => {
    const prisma = new PrismaClient();
    const schema = `expense_migration_${randomUUID().replaceAll("-", "")}`;
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe('CREATE TABLE stores (id TEXT PRIMARY KEY, timezone TEXT NOT NULL)');
        await tx.$executeRawUnsafe('CREATE TABLE expense_items (id TEXT PRIMARY KEY, store_id TEXT NOT NULL)');
        await tx.$executeRawUnsafe('CREATE TABLE expense_rule_revisions (id TEXT PRIMARY KEY, item_id TEXT, start_date DATE, end_exclusive DATE, unit TEXT, interval INT, amount_mode TEXT, amount_cents BIGINT)');
        await tx.$executeRawUnsafe('CREATE TABLE expense_period_overrides (id TEXT, rule_id TEXT, period_start DATE, amount_cents BIGINT)');
        await tx.$executeRawUnsafe('CREATE TABLE audit_logs (id TEXT, after_json JSONB)');
        await tx.$executeRawUnsafe(`INSERT INTO stores VALUES ('ny', 'America/New_York'), ('utc', 'UTC')`);
        await tx.$executeRawUnsafe(`INSERT INTO expense_items VALUES ('ny', 'ny'), ('utc', 'utc')`);
        await tx.$executeRawUnsafe(`INSERT INTO expense_rule_revisions VALUES
          ('fixed', 'ny', '2020-01-01', NULL, 'MONTH', 3, 'FIXED', 90001),
          ('quarter', 'ny', '2026-02-01', NULL, 'MONTH', 3, 'BUDGET', 90001),
          ('days', 'ny', '2026-09-29', NULL, 'DAY', 5, 'BUDGET', 11),
          ('monthly', 'ny', '2026-01-01', NULL, 'MONTH', 1, 'BUDGET', 0),
          ('future', 'ny', '2027-02-01', NULL, 'MONTH', 3, 'BUDGET', 5),
          ('stopped', 'ny', '2026-02-01', '2026-05-01', 'MONTH', 3, 'BUDGET', 9),
          ('utc-days', 'utc', '2026-09-29', NULL, 'DAY', 5, 'BUDGET', 11)`);
        await tx.$executeRawUnsafe(`INSERT INTO expense_period_overrides VALUES ('bill', 'quarter', '2026-08-01', 0)`);
        await tx.$executeRawUnsafe(`INSERT INTO audit_logs VALUES ('audit', '{"amountMode":"BUDGET","amountCents":"90001"}')`);
        const before = await tx.$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM expense_rule_revisions ORDER BY id');
        // Freeze the upgrade instant: New York is still in October, UTC is in November.
        for (const statement of migration.replaceAll('CURRENT_TIMESTAMP', "TIMESTAMPTZ '2026-11-01 02:30:00+00'").split(';').filter(sql => sql.trim())) await tx.$executeRawUnsafe(statement);
        const after = await tx.$queryRawUnsafe<Record<string, unknown>[]>('SELECT r.* FROM expense_rule_revisions r ORDER BY id');
        expect(after.map(({ default_amount_from: _effective, ...rule }) => rule)).toEqual(before);
        expect(Object.fromEntries(after.map(rule => [rule.id, (rule.default_amount_from as Date).toISOString().slice(0, 10)]))).toEqual({ fixed: '2020-01-01', quarter: '2026-11-01', days: '2026-10-04', monthly: '2026-10-01', future: '2027-02-01', stopped: '2026-11-01', 'utc-days': '2026-11-03' });
        expect(await tx.$queryRawUnsafe('SELECT * FROM expense_period_overrides')).toEqual([{ id: 'bill', rule_id: 'quarter', period_start: new Date('2026-08-01T00:00:00Z'), amount_cents: 0n }]);
        expect(await tx.$queryRawUnsafe('SELECT * FROM audit_logs')).toEqual([{ id: 'audit', after_json: { amountMode: 'BUDGET', amountCents: '90001' } }]);
        await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      });
    } finally { await prisma.$disconnect(); }
  });
});
