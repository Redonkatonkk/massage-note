import { randomInt, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { CatalogService } from "../src/stores/catalog.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { CommissionsService } from "../src/stores/commissions.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const catalog = new CatalogService(prisma, access, idempotency);
const commissions = new CommissionsService(prisma, access, idempotency);
const workRecords = new WorkRecordsService(prisma, access, idempotency);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("项目与记工持久化", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `work-test-${id}`,
        phoneE164: `+1917${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "记工集成测试店",
        timezone: "America/New_York",
        businessCutoffLocal: "22:00",
        globalCommissionBps: 5_000,
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
          displayName: "记工店主",
          displayNameNormalized: "记工店主",
        },
        {
          id: employeeMembershipId,
          storeId,
          userId: employeeId,
          role: "EMPLOYEE",
          displayName: "记工员工",
          displayNameNormalized: "记工员工",
          defaultCommissionBps: 5_500,
        },
      ],
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.paymentBreakdown.deleteMany({
        where: { workRecord: { storeId } },
      });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.addonItem.deleteMany({ where: { storeId } });
      await prisma.discountItem.deleteMany({ where: { storeId } });
      await prisma.employeeItemCommission.deleteMany({ where: { storeId } });
      await prisma.employeeDefaultCommission.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({
        where: { id: storeId },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, employeeId] } },
      });
    }
    await prisma.$disconnect();
  });

  let serviceItemId = "";
  let addonItemId = "";
  let discountItemId = "";
  let recordId = "";
  let recordVersion = 0;

  it("店主一次性初始化项目，员工可读取项目", async () => {
    const setup = {
      serviceItems: [
        {
          fullName: "Body Massage",
          shortName: "Body",
          priceOptions: [
            { durationMinutes: 30, priceCents: 6_000 },
            { durationMinutes: 60, priceCents: 10_000 },
          ],
          defaultCommissionBps: 6_000,
        },
      ],
      addonItems: [],
      discountItems: [],
    };
    const concurrent = await Promise.allSettled([
      catalog.initialize(
        actor(ownerId),
        storeId,
        setup,
        "catalog-setup-key-0001",
        "catalog-setup-1",
      ),
      catalog.initialize(
        actor(ownerId),
        storeId,
        setup,
        "catalog-setup-key-0002",
        "catalog-setup-2",
      ),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    const initialized = concurrent.find(
      (result) => result.status === "fulfilled",
    );
    if (!initialized || initialized.status !== "fulfilled") {
      throw new Error("项目初始化并发测试未得到成功结果");
    }
    serviceItemId = initialized.value.serviceItems[0]?.id ?? "";
    expect(serviceItemId).not.toBe("");

    await expect(catalog.list(actor(employeeId), storeId)).resolves.toMatchObject({
      serviceItems: [{ id: serviceItemId, priceOptions: [
        { durationMinutes: 30, priceCents: 6_000n },
        { durationMinutes: 60, priceCents: 10_000n },
      ] }],
    });
    await expect(
      catalog.initialize(
        actor(ownerId),
        storeId,
        {
          serviceItems: [
            {
              fullName: "Body Massage",
              shortName: "Body",
              priceOptions: [{ durationMinutes: 60, priceCents: 10_000 }],
            defaultCommissionBps: 6_000,
          },
        ],
          addonItems: [],
          discountItems: [],
        },
        "repeat-catalog-key-0001",
        "repeat-setup",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("经理权限可以逐项维护项目，普通员工不能修改", async () => {
    const renamed = await catalog.updateItem(
      actor(ownerId),
      storeId,
      serviceItemId,
      { type: "SERVICE", version: 1, shortName: "60分钟" },
      "catalog-update-service-key-0001",
      "update-service",
    );
    expect(renamed).toMatchObject({ shortName: "60分钟", version: 2 });

    const addon = await catalog.createItem(
      actor(ownerId),
      storeId,
      {
        type: "ADDON",
        name: "热石",
        shortName: "热石",
        amountCents: 2_000,
        durationMinutes: 15,
        defaultCommissionBps: 5_000,
      },
      "catalog-create-addon-key-0001",
      "create-addon",
    );
    const discount = await catalog.createItem(
      actor(ownerId),
      storeId,
      {
        type: "DISCOUNT",
        name: "新客优惠",
        shortName: "新客",
        amountCents: 1_000,
      },
      "catalog-create-discount-key-0001",
      "create-discount",
    );
    expect(addon).toMatchObject({ amountCents: 2_000n, version: 1 });
    expect(discount).toMatchObject({ amountCents: 1_000n, version: 1 });
    addonItemId = addon.id;
    discountItemId = discount.id;

    const updatedAddon = await catalog.updateItem(
      actor(ownerId),
      storeId,
      addon.id,
      { type: "ADDON", version: 1, amountCents: 2_500 },
      "catalog-update-addon-key-0001",
      "update-addon",
    );
    const deletedAddon = await catalog.deleteItem(
      actor(ownerId),
      storeId,
      addon.id,
      { type: "ADDON", version: updatedAddon.version, reason: "暂时停用" },
      "catalog-delete-addon-key-0001",
      "delete-addon",
    );
    expect(deletedAddon.deletedAt).not.toBeNull();
    const restoredAddon = await catalog.restoreItem(
      actor(ownerId),
      storeId,
      addon.id,
      { type: "ADDON", version: deletedAddon.version },
      "catalog-restore-addon-key-0001",
      "restore-addon",
    );
    expect(restoredAddon).toMatchObject({
      isEnabled: true,
      deletedAt: null,
      amountCents: 2_500n,
    });

    await expect(
      catalog.createItem(
        actor(employeeId),
        storeId,
        {
          type: "DISCOUNT",
          name: "越权优惠",
          shortName: "越权",
          amountCents: 100,
        },
        "employee-catalog-key-0001",
        "employee-catalog",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("三类项目都能按完整版本列表原子调整顺序", async () => {
    await catalog.createItem(
      actor(ownerId),
      storeId,
      {
        type: "SERVICE",
        fullName: "Foot Massage",
        shortName: "Foot",
        priceOptions: [{ durationMinutes: 60, priceCents: 8_000 }],
      },
      "catalog-create-service-key-0002",
      "create-second-service",
    );
    await catalog.createItem(
      actor(ownerId),
      storeId,
      {
        type: "ADDON",
        name: "精油",
        shortName: "精油",
        amountCents: 500,
      },
      "catalog-create-addon-key-0002",
      "create-second-addon",
    );
    await catalog.createItem(
      actor(ownerId),
      storeId,
      {
        type: "DISCOUNT",
        name: "会员优惠",
        shortName: "会员",
        amountCents: 500,
      },
      "catalog-create-discount-key-0002",
      "create-second-discount",
    );

    const before = await catalog.list(actor(ownerId), storeId);
    for (const [type, items] of [
      ["SERVICE", before.serviceItems],
      ["ADDON", before.addonItems],
      ["DISCOUNT", before.discountItems],
    ] as const) {
      const reversed = [...items].reverse();
      const result = await catalog.reorderItems(
        actor(ownerId),
        storeId,
        { type, items: reversed.map((item) => ({ id: item.id, version: item.version })) },
        `catalog-reorder-${type.toLowerCase()}-key-0001`,
        `reorder-${type.toLowerCase()}`,
      );
      expect(result.items.map((item) => item.id)).toEqual(reversed.map((item) => item.id));
    }

    const ordered = await catalog.list(actor(ownerId), storeId);
    expect(ordered.serviceItems[1]?.id).toBe(serviceItemId);
    expect(ordered.addonItems[1]?.id).toBe(addonItemId);
    expect(ordered.discountItems[1]?.id).toBe(discountItemId);
    await expect(
      catalog.reorderItems(
        actor(employeeId),
        storeId,
        {
          type: "SERVICE",
          items: ordered.serviceItems.map((item) => ({ id: item.id, version: item.version })),
        },
        "employee-catalog-reorder-key-0001",
        "employee-catalog-reorder",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("快速记工保存价格、时长和项目默认提成快照", async () => {
    await expect(
      workRecords.create(
        actor(employeeId),
        storeId,
        { employeeMembershipId, startAt: new Date().toISOString(), serviceItemId },
        "create-record-without-duration-key-0001",
        "create-record-without-duration",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const createInput = {
      employeeMembershipId,
      startAt: new Date().toISOString(),
      serviceItemId,
      serviceDurationMinutes: 60,
    };
    const [created, replayed] = await Promise.all([
      workRecords.create(
        actor(employeeId),
        storeId,
        createInput,
        "create-record-key-0001",
        "create-record-1",
      ),
      workRecords.create(
        actor(employeeId),
        storeId,
        createInput,
        "create-record-key-0001",
        "create-record-2",
      ),
    ]);
    recordId = created.id;
    recordVersion = created.version;

    expect(replayed.id).toBe(recordId);
    await expect(
      prisma.workRecord.count({ where: { storeId } }),
    ).resolves.toBe(1);

    expect(created).toMatchObject({
      status: "PENDING_PAYMENT",
      actualDurationMinutes: 60,
      serviceSnapshot: {
        sourceServiceItemId: serviceItemId,
        commissionBps: 6_000,
        commissionSource: "ITEM_DEFAULT",
      },
    });
    expect(Number(created.mainServiceAmountCents)).toBe(10_000);
    expect(Number(created.mainServiceWageCents)).toBe(6_000);
    expect(Number(created.serviceSnapshot?.amountCents)).toBe(10_000);
  });

  it("员工项目特殊提成优先，并可回退到员工默认提成", async () => {
    const employeeDefault = await commissions.setDefault(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      { version: 1, commissionBps: 6_200 },
      "commission-default-key-0001",
      "set-default-commission",
    );
    const itemOverride = await commissions.setItem(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      {
        version: employeeDefault.membership.version,
        itemType: "SERVICE",
        itemId: serviceItemId,
        commissionBps: 7_000,
      },
      "commission-item-key-0001",
      "set-item-commission",
    );
    const specialRecord = await workRecords.create(
      actor(ownerId),
      storeId,
      {
        employeeMembershipId,
        startAt: new Date().toISOString(),
        serviceItemId,
        serviceDurationMinutes: 30,
      },
      "special-commission-record-key-0001",
      "special-commission-record",
    );
    expect(specialRecord.serviceSnapshot).toMatchObject({
      commissionBps: 7_000,
      commissionSource: "EMPLOYEE_ITEM",
      amountCents: 6_000n,
      durationMinutes: 30,
      wageCents: 4_200n,
    });

    const cleared = await commissions.setItem(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      {
        version: itemOverride.membership.version,
        itemType: "SERVICE",
        itemId: serviceItemId,
        commissionBps: null,
      },
      "commission-item-clear-key-0001",
      "clear-item-commission",
    );
    expect(cleared.membership.version).toBe(4);
    const history = await commissions.list(
      actor(ownerId),
      storeId,
      employeeMembershipId,
    );
    expect(history.defaultHistory[0]?.commissionBps).toBe(6_200);
    expect(history.itemHistory[0]?.effectiveTo).not.toBeNull();
  });

  it("后来修改项目价格不改变旧记工，付款确认按现金上限计算", async () => {
    await prisma.serviceItemPriceOption.update({
      where: { serviceItemId_durationMinutes: { serviceItemId, durationMinutes: 60 } },
      data: { priceCents: 15_000n },
    });
    const paymentInput = {
      version: recordVersion,
      cashServiceCents: 1_000,
      cardServiceCents: 9_000,
      cashTipCents: 0,
      cardTipCents: 2_000,
    };
    const [confirmed, replayed] = await Promise.all([
      workRecords.confirmPayment(
        actor(employeeId),
        storeId,
        recordId,
        paymentInput,
        "confirm-payment-key-0001",
        "confirm-payment-1",
      ),
      workRecords.confirmPayment(
        actor(employeeId),
        storeId,
        recordId,
        paymentInput,
        "confirm-payment-key-0001",
        "confirm-payment-2",
      ),
    ]);
    recordVersion = confirmed.version;

    expect(replayed.id).toBe(recordId);
    expect(replayed.version).toBe(recordVersion);
    expect(confirmed).toMatchObject({
      status: "CONFIRMED",
    });
    expect(Number(confirmed.mainServiceAmountCents)).toBe(10_000);
    expect(Number(confirmed.actualServiceCollectedCents)).toBe(10_000);
    expect(Number(confirmed.employeeTotalIncomeCents)).toBe(8_000);
    expect(Number(confirmed.cashAllocatedServiceWageCents)).toBe(600);
    expect(Number(confirmed.cashAcquiredServiceWageCents)).toBe(600);
    expect(Number(confirmed.cashWageShortfallCents)).toBe(0);
    expect(confirmed.payment).toMatchObject({
      cashServiceCents: expect.anything(),
      cardServiceCents: expect.anything(),
      cashTipCents: expect.anything(),
      cardTipCents: expect.anything(),
    });
    expect(Number(confirmed.payment?.cashServiceCents)).toBe(1_000);
    expect(Number(confirmed.payment?.cardServiceCents)).toBe(9_000);
    expect(Number(confirmed.payment?.cashTipCents)).toBe(0);
    expect(Number(confirmed.payment?.cardTipCents)).toBe(2_000);
  });

  it("旧版本不能覆盖已确认付款", async () => {
    await expect(
      workRecords.confirmPayment(
        actor(ownerId),
        storeId,
        recordId,
        {
          version: recordVersion - 1,
          cashServiceCents: 10_000,
          cardServiceCents: 0,
          cashTipCents: 0,
          cardTipCents: 0,
        },
        "stale-payment-key-0001",
        "stale-payment",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("详情修改支持多加项、多折扣、单笔提成与人工结算标记", async () => {
    await expect(
      workRecords.update(
        actor(employeeId),
        storeId,
        recordId,
        { version: recordVersion, mainServiceCommissionBps: 6_500 },
        "employee-override-key-0001",
        "employee-override",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const updated = await workRecords.update(
      actor(ownerId),
      storeId,
      recordId,
      {
        version: recordVersion,
        mainServiceCommissionBps: 6_500,
        addons: [
          {
            sourceItemId: addonItemId,
            isCustom: false,
            name: "热石",
            shortName: "热石",
            amountCents: 2_500,
          },
          {
            isCustom: true,
            name: "自定义精油",
            shortName: "精油",
            amountCents: 1_000,
            durationMinutes: 10,
          },
        ],
        discounts: [
          {
            sourceItemId: discountItemId,
            isCustom: false,
            name: "新客优惠",
            amountCents: 1_000,
          },
          {
            isCustom: true,
            name: "临时优惠",
            amountCents: 500,
          },
        ],
        tipSettledManualFlag: true,
        largeFeeSettledManualFlag: true,
        note: "完整详情修改",
      },
      "record-detail-update-key-0001",
      "record-detail-update",
    );
    recordVersion = updated.version;

    expect(updated.serviceSnapshot).toMatchObject({
      commissionBps: 6_500,
      commissionSource: "MANAGER_OVERRIDE",
      wageCents: 6_500n,
    });
    expect(updated.addonSnapshots).toHaveLength(2);
    expect(updated.discountSnapshots).toHaveLength(2);
    expect(updated).toMatchObject({
      addonTotalCents: 3_500n,
      grossFeeBaseCents: 13_500n,
      discountTotalCents: 1_500n,
      discountedFeePerformanceCents: 12_000n,
      addonWageCents: 1_870n,
      totalLargeFeeWageCents: 8_370n,
      employeeTotalIncomeCents: 10_370n,
      paymentDifferenceCents: -2_000n,
      tipSettledManualFlag: true,
      largeFeeSettledManualFlag: true,
      note: "完整详情修改",
    });
    const detail = await workRecords.get(actor(employeeId), storeId, recordId);
    expect(detail.auditTrail.some((entry) => entry.action === "work_record.updated"))
      .toBe(true);
  });

  it("当天记工可软删除，只有店长或经理能查看并恢复", async () => {
    const deleted = await workRecords.remove(
      actor(employeeId),
      storeId,
      recordId,
      { version: recordVersion },
      "record-delete-key-0001",
      "record-delete",
    );
    recordVersion = deleted.version;
    expect(deleted.deletedAt).not.toBeNull();
    await expect(
      workRecords.get(actor(employeeId), storeId, recordId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      workRecords.listDeleted(actor(employeeId), storeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const deletedRecords = await workRecords.listDeleted(actor(ownerId), storeId);
    expect(deletedRecords.some((record) => record.id === recordId)).toBe(true);
    await expect(
      workRecords.restore(
        actor(employeeId),
        storeId,
        recordId,
        { version: recordVersion },
        "employee-restore-key-0001",
        "employee-restore",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const restored = await workRecords.restore(
      actor(ownerId),
      storeId,
      recordId,
      { version: recordVersion },
      "record-restore-key-0001",
      "record-restore",
    );
    recordVersion = restored.version;
    expect(restored).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
    });
  });

  it("自定义项目跳过项目默认比例，使用员工默认比例", async () => {
    const custom = await workRecords.create(
      actor(ownerId),
      storeId,
      {
        employeeMembershipId,
        startAt: new Date().toISOString(),
        customService: {
          name: "自定义 75 分钟",
          shortName: "75分",
          amountCents: 12_000,
          durationMinutes: 75,
        },
      },
      "custom-record-key-0001",
      "custom-record",
    );
    expect(custom.serviceSnapshot).toMatchObject({
      isCustom: true,
      sourceServiceItemId: null,
      commissionBps: 6_200,
      commissionSource: "EMPLOYEE_DEFAULT",
      wageCents: 7_440n,
    });

    await expect(
      workRecords.confirmPayment(
        actor(ownerId),
        storeId,
        custom.id,
        {
          version: custom.version,
          cashServiceCents: Number.MAX_SAFE_INTEGER,
          cardServiceCents: 0,
          cashTipCents: Number.MAX_SAFE_INTEGER,
          cardTipCents: 0,
        },
        "oversized-payment-key-0001",
        "oversized-payment",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      prisma.workRecord.findUniqueOrThrow({ where: { id: custom.id } }),
    ).resolves.toMatchObject({ status: "PENDING_PAYMENT", version: custom.version });

    await prisma.businessDayClosing.create({
      data: {
        storeId,
        businessDate: custom.businessDate,
        cycleNo: 1,
        status: "CLOSED",
        warningSnapshotJson: {},
        totalsSnapshotJson: {},
        closedBy: ownerId,
      },
    });
    await expect(
      workRecords.confirmPayment(
        actor(ownerId),
        storeId,
        custom.id,
        {
          version: custom.version,
          cashServiceCents: 12_000,
          cardServiceCents: 0,
          cashTipCents: 0,
          cardTipCents: 0,
        },
        "closed-day-payment-key-0001",
        "closed-day-payment",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
