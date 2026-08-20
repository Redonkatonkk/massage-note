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
});
