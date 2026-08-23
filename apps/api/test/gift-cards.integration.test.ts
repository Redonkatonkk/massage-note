import { randomInt, randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { financeQuerySchema } from "@massage-note/contracts";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { GiftCardsService } from "../src/gift-cards/gift-cards.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const giftCards = new GiftCardsService(prisma, access, idempotency);
const boards = new BoardsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const finance = new FinanceQueriesService(prisma, access);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("礼物卡销售", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `gift-card-test-${id}`,
        phoneE164: `+1646${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "礼物卡集成测试店",
        timezone: "America/New_York",
        businessCutoffLocal: "22:00",
        globalCommissionBps: 6_000,
        status: "ACTIVE",
      },
    });
    await prisma.storeMembership.createMany({
      data: [
        {
          id: ownerMembershipId,
          storeId,
          userId: ownerId,
          role: "OWNER",
          displayName: "礼物卡店主",
          displayNameNormalized: "礼物卡店主",
        },
        {
          id: employeeMembershipId,
          storeId,
          userId: employeeId,
          role: "EMPLOYEE",
          displayName: "卖卡员工",
          displayNameNormalized: "卖卡员工",
        },
      ],
    });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId } });
    await prisma.store.update({
      where: { id: storeId },
      data: {
        giftCardAutoDiscountEnabled: true,
        giftCardAutoDiscountThresholdCents: 10_000,
        giftCardAutoDiscountBps: 500,
      },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.giftCardSale.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({
        where: { id: storeId },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeId] } } });
    }
    await prisma.$disconnect();
  });

  let businessDate = "";
  let saleId = "";
  let saleVersion = 0;

  it("员工可记录当前营业日卖卡，总额由现金和刷卡相加且幂等", async () => {
    businessDate = (await boards.currentBusinessDay(actor(employeeId), storeId)).businessDate;
    const input = {
      businessDate,
      faceValueCents: 10_000,
      cashCents: 4_000,
      cardCents: 5_500,
      operatorMembershipId: employeeMembershipId,
    };
    const [created, replayed] = await Promise.all([
      giftCards.create(
        actor(employeeId),
        storeId,
        input,
        "gift-card-create-key-0001",
        "gift-card-create-1",
      ),
      giftCards.create(
        actor(employeeId),
        storeId,
        input,
        "gift-card-create-key-0001",
        "gift-card-create-2",
      ),
    ]);
    saleId = created.id;
    saleVersion = created.version;
    expect(replayed.id).toBe(saleId);
    expect(created).toMatchObject({
      serialNumber: "1001",
      discountRateBps: 500,
      operatorMembershipId: employeeMembershipId,
    });
    expect(Number(created.faceValueCents)).toBe(10_000);
    expect(Number(created.discountThresholdCents)).toBe(10_000);
    expect(Number(created.discountCents)).toBe(500);
    expect(Number(created.cashCents)).toBe(4_000);
    expect(Number(created.cardCents)).toBe(5_500);
    expect(Number(created.amountCents)).toBe(9_500);
    await expect(prisma.giftCardSale.count({ where: { storeId } })).resolves.toBe(1);
  });

  it("同店礼物卡序列号忽略大小写防止重复售卖", async () => {
    await expect(
      giftCards.create(
        actor(ownerId),
        storeId,
        {
          businessDate,
          serialNumber: "1001",
          faceValueCents: 10_000,
          cashCents: 9_500,
          cardCents: 0,
          operatorMembershipId: ownerMembershipId,
        },
        "gift-card-duplicate-key-0001",
        "gift-card-duplicate",
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "GIFT_CARD_SERIAL_DUPLICATE" }),
    });
  });

  it("修改付款拆分后自动重算总额，并进入今日店铺收入", async () => {
    const updated = await giftCards.update(
      actor(employeeId),
      storeId,
      saleId,
      { version: saleVersion, cashCents: 2_500, cardCents: 7_000 },
      "gift-card-update-key-0001",
      "gift-card-update",
    );
    saleVersion = updated.version;
    expect(updated).toMatchObject({ cashCents: 2_500n, cardCents: 7_000n, amountCents: 9_500n });

    const board = await boards.getBoard(actor(ownerId), storeId, businessDate);
    expect(board.giftCardSales).toHaveLength(1);
    expect(board.statistics).toMatchObject({
      giftCardSaleCount: 1,
      giftCardCashCents: 2_500n,
      giftCardCardCents: 7_000n,
      giftCardSalesAmountCents: 9_500n,
      storeIncomeCents: 9_500n,
    });
  });

  it("删除使用乐观锁和软删除，删除后不再进入当日收入", async () => {
    await expect(
      giftCards.remove(
        actor(ownerId),
        storeId,
        saleId,
        { version: saleVersion - 1 },
        "gift-card-delete-stale-key-0001",
        "gift-card-delete-stale",
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const deleted = await giftCards.remove(
      actor(ownerId),
      storeId,
      saleId,
      { version: saleVersion, reason: "录入测试" },
      "gift-card-delete-key-0001",
      "gift-card-delete",
    );
    expect(deleted.deletedAt).not.toBeNull();
    const board = await boards.getBoard(actor(ownerId), storeId, businessDate);
    expect(board.giftCardSales).toHaveLength(0);
    expect(board.statistics.giftCardSalesAmountCents).toBe(0n);
  });

  it("自定义序列号也检查已软删除的历史号码，避免重新卖出同号礼物卡", async () => {
    await expect(
      giftCards.create(
        actor(ownerId),
        storeId,
        {
          businessDate,
          serialNumber: " 1001 ",
          faceValueCents: 10_000,
          cashCents: 9_500,
          cardCents: 0,
          operatorMembershipId: ownerMembershipId,
        },
        "gift-card-deleted-duplicate-key-0001",
        "gift-card-deleted-duplicate",
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "GIFT_CARD_SERIAL_DUPLICATE" }),
    });
  });

  it("店长可从回收站恢复卖卡记录并重新计入收入", async () => {
    const deleted = await giftCards.listDeleted(actor(ownerId), storeId);
    expect(deleted).toHaveLength(1);
    const restored = await giftCards.restore(
      actor(ownerId),
      storeId,
      saleId,
      { version: deleted[0]!.version },
      "gift-card-restore-key-0001",
      "gift-card-restore",
    );
    expect(restored.deletedAt).toBeNull();
    const board = await boards.getBoard(actor(ownerId), storeId, businessDate);
    expect(board.giftCardSales).toHaveLength(1);
    expect(board.statistics.giftCardSalesAmountCents).toBe(9_500n);
  });

  it("并发卖卡会连续分配不同序列号，台账按序列号排序", async () => {
    const createAutoSale = (idempotencyKey: string, requestId: string) =>
      giftCards.create(
        actor(ownerId),
        storeId,
        {
          businessDate,
          faceValueCents: 10_000,
          cashCents: 9_500,
          cardCents: 0,
          operatorMembershipId: ownerMembershipId,
        },
        idempotencyKey,
        requestId,
      );
    const created = await Promise.all([
      createAutoSale("gift-card-auto-key-0002", "gift-card-auto-2"),
      createAutoSale("gift-card-auto-key-0003", "gift-card-auto-3"),
    ]);
    expect(created.map((sale) => sale.serialNumber).sort()).toEqual(["1002", "1003"]);

    const startAt = new Date(`${businessDate}T15:00:00.000Z`);
    for (const [index, tipCents] of [200, 300].entries()) {
      await prisma.workRecord.create({
        data: {
          storeId,
          employeeMembershipId,
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          storeTimezoneSnapshot: "America/New_York",
          businessCutoffSnapshot: "22:00",
          startAt: new Date(startAt.getTime() + index * 3_600_000),
          endAt: new Date(startAt.getTime() + (index + 1) * 3_600_000),
          actualDurationMinutes: 60,
          status: "CONFIRMED",
          mainServiceAmountCents: 1_000,
          addonTotalCents: 0,
          grossFeeBaseCents: 1_000,
          discountTotalCents: 0,
          discountedFeePerformanceCents: 1_000,
          cashServiceCents: 0,
          cardServiceCents: 0,
          giftCardSerialNumber: " 1001 ",
          giftCardServiceCents: 1_000,
          cashTipCents: 0,
          cardTipCents: 0,
          giftCardTipCents: tipCents,
          totalTipCents: tipCents,
          actualServiceCollectedCents: 1_000,
          customerTotalPaidCents: 1_000 + tipCents,
          paymentDifferenceCents: 0,
          mainServiceWageCents: 600,
          addonWageCents: 0,
          totalLargeFeeWageCents: 600,
          employeeTotalIncomeCents: 600 + tipCents,
          cashAllocatedServiceWageCents: 0,
          cashAcquiredServiceWageCents: 0,
          cashWageShortfallCents: 0,
          createdBy: ownerId,
          updatedBy: ownerId,
          serviceSnapshot: {
            create: {
              isCustom: true,
              name: "礼物卡使用测试",
              shortName: "用卡",
              amountCents: 1_000,
              durationMinutes: 60,
              commissionBps: 6_000,
              commissionSource: "store_global",
              wageCents: 600,
            },
          },
        },
      });
    }

    const ledger = await giftCards.list(actor(ownerId), storeId);
    expect(ledger.nextSerialNumber).toBe("1004");
    expect(ledger.sales.map((sale) => sale.serialNumber)).toEqual(["1001", "1002", "1003"]);
    expect(ledger.sales[0]!.usageRecords).toHaveLength(2);
    expect(ledger.sales[0]!.usageRecords.map((record) => record.amountCents)).toEqual([
      1_200n,
      1_300n,
    ]);
    await expect(giftCards.list(actor(employeeId), storeId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "GIFT_CARD_LEDGER_FORBIDDEN" }),
    });
  });

  it("财务汇总和日结把卖卡记为收入、用卡核销记为支出", async () => {
    const query = financeQuerySchema.parse({
      dateFrom: businessDate,
      dateTo: businessDate,
    });
    const [board, summary, details, closing] = await Promise.all([
      boards.getBoard(actor(ownerId), storeId, businessDate),
      finance.summary(actor(ownerId), storeId, query),
      finance.details(actor(ownerId), storeId, query),
      closings.preview(actor(ownerId), storeId, businessDate),
    ]);

    expect(board.statistics).toMatchObject({
      recordCount: 2,
      giftCardSaleCount: 3,
      giftCardSalesAmountCents: 28_500n,
      giftCardRedemptionCents: 2_500n,
      storeIncomeCents: 26_800n,
    });
    expect(summary.filters.paymentMethod).toBe("ALL");
    expect(summary.totals).toMatchObject({
      itemCount: 5,
      recordCount: 2,
      giftCardSaleCount: 3,
      customerTotalPaidCents: 31_000n,
      giftCardSaleCashCents: 21_500n,
      giftCardSaleCardCents: 7_000n,
      giftCardSalesAmountCents: 28_500n,
      giftCardRedemptionCents: 2_500n,
      storeIncomeCents: 26_800n,
      totalTurnoverCents: 28_000n,
      ownerWorkerIncomeCents: 0n,
      managerWorkerIncomeCents: 0n,
      giftCardNetIncomeCents: 26_000n,
      totalIncomeCents: 52_800n,
    });
    expect(summary.days).toEqual([
      expect.objectContaining({
        businessDate,
        itemCount: 5,
        customerTotalPaidCents: 31_000n,
        dailyTurnoverCents: 28_000n,
      }),
    ]);
    expect(details.records).toHaveLength(2);
    expect(details.giftCardSales).toHaveLength(3);
    expect(closing.storeTotals).toMatchObject({
      itemCount: 5,
      customerTotalPaidCents: 31_000,
      giftCardSalesAmountCents: 28_500,
      giftCardRedemptionCents: 2_500,
      storeIncomeCents: 26_800,
    });

    const employeeOnly = await finance.summary(
      actor(ownerId),
      storeId,
      financeQuerySchema.parse({
        dateFrom: businessDate,
        dateTo: businessDate,
        membershipIds: employeeMembershipId,
      }),
    );
    expect(employeeOnly.totals).toMatchObject({
      itemCount: 2,
      recordCount: 2,
      giftCardSaleCount: 0,
      customerTotalPaidCents: 2_500n,
      giftCardRedemptionCents: 2_500n,
      storeIncomeCents: -1_700n,
    });
  });

  it("允许卖卡时使用自定义序列号，并忽略大小写与首尾空白检测重复", async () => {
    const created = await giftCards.create(
      actor(ownerId),
      storeId,
      {
        businessDate,
        serialNumber: "VIP-SUMMER-01",
        faceValueCents: 10_000,
        cashCents: 9_500,
        cardCents: 0,
        operatorMembershipId: ownerMembershipId,
      },
      "gift-card-custom-key-0001",
      "gift-card-custom",
    );
    expect(created.serialNumber).toBe("VIP-SUMMER-01");

    await expect(
      giftCards.create(
        actor(ownerId),
        storeId,
        {
          businessDate,
          serialNumber: " vip-summer-01 ",
          faceValueCents: 10_000,
          cashCents: 9_500,
          cardCents: 0,
          operatorMembershipId: ownerMembershipId,
        },
        "gift-card-custom-duplicate-key-0001",
        "gift-card-custom-duplicate",
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "GIFT_CARD_SERIAL_DUPLICATE" }),
    });
  });
});
