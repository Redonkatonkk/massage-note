import { readFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../src/generated/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaClient();
const ownerId = randomUUID();
const applicantId = randomUUID();
const duplicateNameUserId = randomUUID();
const storeId = randomUUID();
const ownerMembershipId = randomUUID();

function expectUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

describe.skipIf(!enabled)("PostgreSQL 初始迁移", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          firebaseUid: `test-owner-${ownerId}`,
          phoneE164: `+1202${randomInt(10_000_000, 99_999_999).toString()}`,
        },
        {
          id: applicantId,
          firebaseUid: `test-applicant-${applicantId}`,
          phoneE164: `+1301${randomInt(10_000_000, 99_999_999).toString()}`,
        },
        {
          id: duplicateNameUserId,
          firebaseUid: `test-name-${duplicateNameUserId}`,
          phoneE164: `+1410${randomInt(10_000_000, 99_999_999).toString()}`,
        },
      ],
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "迁移集成测试店",
        timezone: "America/New_York",
        businessCutoffLocal: "22:00",
        globalCommissionBps: 5_000,
        status: "ACTIVE",
      },
    });
    await prisma.storeMembership.create({
      data: {
        id: ownerMembershipId,
        storeId,
        userId: ownerId,
        role: "OWNER",
        displayName: "测试老板",
        displayNameNormalized: "测试老板",
      },
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.employeeSettlementDelivery.deleteMany({ where: { storeId } });
      await prisma.storeJoinRequest.deleteMany({ where: { storeId } });
      await prisma.store.update({
        where: { id: storeId },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, applicantId, duplicateNameUserId] } },
      });
    }
    await prisma.$disconnect();
  });

  it("同一用户在同一店只能存在一个待审核申请", async () => {
    await prisma.storeJoinRequest.create({
      data: {
        storeId,
        userId: applicantId,
        requestedDisplayName: "测试员工",
      },
    });

    await expect(
      prisma.storeJoinRequest.create({
        data: {
          storeId,
          userId: applicantId,
          requestedDisplayName: "另一个名称",
        },
      }),
    ).rejects.toSatisfy(expectUniqueConstraint);
  });

  it("当前在职成员的规范化显示名不能重复", async () => {
    await expect(
      prisma.storeMembership.create({
        data: {
          storeId,
          userId: duplicateNameUserId,
          role: "EMPLOYEE",
          displayName: "测试老板",
          displayNameNormalized: "测试老板",
        },
      }),
    ).rejects.toSatisfy(expectUniqueConstraint);
  });

  it("允许先创建尚未关联登录账号的员工关系", async () => {
    const membership = await prisma.storeMembership.create({
      data: {
        storeId,
        userId: null,
        role: "EMPLOYEE",
        displayName: "待注册员工",
        displayNameNormalized: "待注册员工",
      },
    });

    expect(membership).toMatchObject({
      userId: null,
      displayName: "待注册员工",
      status: "ACTIVE",
    });
  });

  it("员工区间结算发送记录使用迁移定义的 last_error 列", async () => {
    const delivery = await prisma.employeeSettlementDelivery.create({
      data: {
        storeId,
        membershipId: ownerMembershipId,
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-07T00:00:00.000Z"),
        paymentScope: "ALL",
        recipientPhoneE164: "+12025550123",
        locale: "zh_CN",
        snapshotJson: { records: [] },
        queuedBy: ownerId,
        requestKey: randomUUID(),
        lastError: "测试错误",
      },
    });

    expect(delivery.lastError).toBe("测试错误");
    await expect(prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).resolves.toMatchObject({ lastError: "测试错误" });
  });

  it("数据库包含迁移追加的关键检查约束", async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'stores_commission_range',
        'stores_gift_card_auto_discount_valid',
        'gift_card_sales_valid_amounts',
        'service_item_price_options_valid_values',
        'work_records_non_negative_money',
        'work_records_confirmed_finance_complete'
      )
      ORDER BY conname
    `;

    expect(rows.map((row) => row.conname)).toEqual([
      "gift_card_sales_valid_amounts",
      "service_item_price_options_valid_values",
      "stores_commission_range",
      "stores_gift_card_auto_discount_valid",
      "work_records_confirmed_finance_complete",
      "work_records_non_negative_money",
    ]);
  });

  it("1.0.1 只保留每日排位结构并清除逐工状态", async () => {
    const rankingColumns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('stores', 'automatic_dispatch_enabled'),
          ('store_memberships', 'employment_type'),
          ('daily_boards', 'ranked_at')
        )
      ORDER BY table_name, column_name
    `;
    expect(rankingColumns).toEqual([
      { table_name: "daily_boards", column_name: "ranked_at" },
      { table_name: "store_memberships", column_name: "employment_type" },
      { table_name: "stores", column_name: "automatic_dispatch_enabled" },
    ]);

    const removedTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('dispatch_intents', 'dispatch_makeup_turns', 'dispatch_events')
    `;
    expect(removedTables).toEqual([]);

    const removedColumns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('daily_boards', 'dispatch_sequence'),
          ('daily_employee_rows', 'normal_turns_processed'),
          ('daily_employee_rows', 'crossed_turns'),
          ('daily_employee_rows', 'rotation_ranked_at'),
          ('work_records', 'dispatch_kind')
        )
    `;
    expect(removedColumns).toEqual([]);
  });
  it("历史看板修复只补缺失行，保留隐藏顺序并清理过期机器人指针", async () => {
    const migration = await readFile(new URL("../prisma/migrations/20260908020000_repair_work_record_board_links/migration.sql", import.meta.url), "utf8");
    await prisma.$transaction(async tx => {
      // Temporary shadow tables isolate the backfill from all concurrent fixtures.
      await tx.$executeRawUnsafe("CREATE TEMP TABLE work_records (id uuid, store_id uuid, business_date date, employee_membership_id uuid, created_by uuid, start_at timestamptz, deleted_at timestamptz, status text) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE daily_boards (id uuid PRIMARY KEY, store_id uuid, business_date date, version int DEFAULT 1, updated_at timestamptz, UNIQUE(store_id,business_date)) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE daily_employee_rows (id uuid, board_id uuid, store_id uuid, membership_id uuid, position numeric, is_hidden boolean DEFAULT false, added_by uuid, updated_at timestamptz, UNIQUE(board_id,membership_id)) ON COMMIT DROP");
      await tx.$executeRawUnsafe("CREATE TEMP TABLE work_bot_member_bindings (id uuid, membership_id uuid, active_work_record_id uuid, version int DEFAULT 1, updated_at timestamptz) ON COMMIT DROP");
      const boardId = randomUUID(), member1 = randomUUID(), member2 = randomUUID(), record1 = randomUUID(), record2 = randomUUID();
      await tx.$executeRaw`INSERT INTO daily_boards (id,store_id,business_date) VALUES (${boardId}::uuid,${storeId}::uuid,'2026-09-01')`;
      await tx.$executeRaw`INSERT INTO daily_employee_rows (id,board_id,store_id,membership_id,position,is_hidden,added_by) VALUES (gen_random_uuid(),${boardId}::uuid,${storeId}::uuid,${member1}::uuid,5,true,${ownerId}::uuid)`;
      await tx.$executeRaw`INSERT INTO work_records (id,store_id,business_date,employee_membership_id,created_by,start_at,status) VALUES (${record1}::uuid,${storeId}::uuid,'2026-09-01',${member1}::uuid,${ownerId}::uuid,now(),'CONFIRMED'),(${record2}::uuid,${storeId}::uuid,'2026-09-01',${member2}::uuid,${ownerId}::uuid,now(),'PENDING_PAYMENT')`;
      await tx.$executeRaw`INSERT INTO work_bot_member_bindings (id,membership_id,active_work_record_id) VALUES (gen_random_uuid(),${member1}::uuid,${record1}::uuid),(gen_random_uuid(),${member2}::uuid,${record2}::uuid)`;
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const statement of migration.replace(/--[^\n]*/g, "").split(";").filter(part => part.trim())) await tx.$executeRawUnsafe(statement);
      }
      expect(await tx.$queryRaw`SELECT position::text, is_hidden FROM daily_employee_rows ORDER BY position`).toEqual([{ position: "5", is_hidden: true }, { position: "6", is_hidden: false }]);
      expect(await tx.$queryRaw`SELECT version FROM daily_boards`).toEqual([{ version: 2 }]);
      expect(await tx.$queryRaw`SELECT active_work_record_id FROM work_bot_member_bindings WHERE membership_id = ${member1}::uuid`).toEqual([{ active_work_record_id: null }]);
      expect(await tx.$queryRaw`SELECT active_work_record_id FROM work_bot_member_bindings WHERE membership_id = ${member2}::uuid`).toEqual([{ active_work_record_id: record2 }]);
    });
  });

});
