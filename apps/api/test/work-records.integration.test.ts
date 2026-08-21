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
import { BoardsService } from "../src/boards/boards.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const catalog = new CatalogService(prisma, access, idempotency);
const commissions = new CommissionsService(prisma, access, idempotency);
const workRecords = new WorkRecordsService(prisma, access, idempotency);
const boards = new BoardsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
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
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
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
  let historicalRecordId = "";
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

  it("快速记工优先保存员工默认提成快照", async () => {
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
        commissionBps: 5_500,
        commissionSource: "EMPLOYEE_DEFAULT",
      },
    });
    expect(Number(created.mainServiceAmountCents)).toBe(10_000);
    expect(Number(created.mainServiceWageCents)).toBe(5_500);
    expect(Number(created.serviceSnapshot?.amountCents)).toBe(10_000);
  });

  it("同一员工可同时保留两笔待结账且时间允许重叠", async () => {
    const first = await prisma.workRecord.findUniqueOrThrow({
      where: { id: recordId },
    });
    const second = await workRecords.create(
      actor(employeeId),
      storeId,
      {
        employeeMembershipId,
        startAt: first.startAt.toISOString(),
        serviceItemId,
        serviceDurationMinutes: 30,
      },
      "create-overlapping-pending-key-0001",
      "create-overlapping-pending",
    );

    expect(first.status).toBe("PENDING_PAYMENT");
    expect(second.status).toBe("PENDING_PAYMENT");
    expect(second.startAt.getTime()).toBeLessThan(first.endAt?.getTime() ?? 0);
    await expect(prisma.workRecord.count({
      where: {
        id: { in: [first.id, second.id] },
        employeeMembershipId,
        status: "PENDING_PAYMENT",
      },
    })).resolves.toBe(2);
  });

  it("修改项目时长会自动重算下工时间", async () => {
    await prisma.serviceItemPriceOption.create({
      data: {
        serviceItemId,
        durationMinutes: 90,
        priceCents: 15_000,
        position: 2,
      },
    });
    const startAt = new Date();
    startAt.setUTCSeconds(0, 0);
    const durationRecord = await workRecords.create(
      actor(employeeId),
      storeId,
      {
        employeeMembershipId,
        startAt: startAt.toISOString(),
        serviceItemId,
        serviceDurationMinutes: 60,
      },
      "duration-change-create-key-0001",
      "duration-change-create",
    );

    const updated = await workRecords.update(
      actor(employeeId),
      storeId,
      durationRecord.id,
      {
        version: durationRecord.version,
        serviceItemId,
        serviceDurationMinutes: 90,
      },
      "duration-change-update-key-0001",
      "duration-change-update",
    );

    expect(updated.serviceSnapshot?.durationMinutes).toBe(90);
    expect(updated.endAt).toEqual(new Date(startAt.getTime() + 90 * 60_000));
    expect(updated.actualDurationMinutes).toBe(90);
  });

  it("增减额外项目会调整结束时间，修改开始时间会保留工作时长", async () => {
    const startAt = new Date();
    startAt.setUTCSeconds(0, 0);
    const durationRecord = await workRecords.create(
      actor(employeeId),
      storeId,
      {
        employeeMembershipId,
        startAt: startAt.toISOString(),
        serviceItemId,
        serviceDurationMinutes: 60,
      },
      "addon-duration-create-key-0001",
      "addon-duration-create",
    );

    const withAddon = await workRecords.update(
      actor(employeeId),
      storeId,
      durationRecord.id,
      {
        version: durationRecord.version,
        addons: [
          {
            sourceItemId: addonItemId,
            isCustom: false,
            name: "热石",
            shortName: "热石",
            amountCents: 2_500,
          },
        ],
      },
      "addon-duration-add-key-0001",
      "addon-duration-add",
    );
    expect(withAddon.endAt).toEqual(new Date(startAt.getTime() + 75 * 60_000));
    expect(withAddon.actualDurationMinutes).toBe(75);

    const shiftedStart = new Date(startAt.getTime() + 30 * 60_000);
    const shifted = await workRecords.update(
      actor(employeeId),
      storeId,
      durationRecord.id,
      {
        version: withAddon.version,
        startAt: shiftedStart.toISOString(),
      },
      "addon-duration-shift-key-0001",
      "addon-duration-shift",
    );
    expect(shifted.endAt).toEqual(
      new Date(shiftedStart.getTime() + 75 * 60_000),
    );
    expect(shifted.actualDurationMinutes).toBe(75);

    const withoutAddon = await workRecords.update(
      actor(employeeId),
      storeId,
      durationRecord.id,
      { version: shifted.version, addons: [] },
      "addon-duration-remove-key-0001",
      "addon-duration-remove",
    );
    expect(withoutAddon.endAt).toEqual(
      new Date(shiftedStart.getTime() + 60 * 60_000),
    );
    expect(withoutAddon.actualDurationMinutes).toBe(60);
  });

  it("周一至周四达到大费门槛会自动折扣且不减少员工收入", async () => {
    await prisma.store.update({
      where: { id: storeId },
      data: {
        mondayThursdayAutoDiscountEnabled: true,
        mondayThursdayAutoDiscountThresholdCents: 10_000,
        mondayThursdayAutoDiscountAmountCents: 1_000,
      },
    });
    try {
      const mondayRecord = await workRecords.create(
        actor(ownerId),
        storeId,
        {
          employeeMembershipId,
          startAt: "2026-08-10T16:00:00.000Z",
          serviceItemId,
          serviceDurationMinutes: 60,
        },
        "monday-auto-discount-create-key-0001",
        "monday-auto-discount-create",
      );
      historicalRecordId = mondayRecord.id;
      expect(mondayRecord).toMatchObject({
        grossFeeBaseCents: 10_000n,
        discountTotalCents: 1_000n,
        discountedFeePerformanceCents: 9_000n,
        mainServiceWageCents: 5_500n,
        totalLargeFeeWageCents: 5_500n,
      });
      expect(mondayRecord.discountSnapshots).toEqual([
        expect.objectContaining({
          name: "周一至周四自动折扣",
          amountCents: 1_000n,
          isAutomatic: true,
          isCustom: false,
        }),
      ]);

      const withManualDiscount = await workRecords.update(
        actor(ownerId),
        storeId,
        mondayRecord.id,
        {
          version: mondayRecord.version,
          discounts: [{
            sourceItemId: discountItemId,
            isCustom: false,
            name: "新客优惠",
            amountCents: 1_000,
          }],
        },
        "monday-auto-discount-update-key-0001",
        "monday-auto-discount-update",
      );
      expect(withManualDiscount.discountSnapshots).toHaveLength(2);
      expect(withManualDiscount.discountSnapshots.filter((item) => item.isAutomatic)).toHaveLength(1);
      expect(withManualDiscount).toMatchObject({
        discountTotalCents: 2_000n,
        discountedFeePerformanceCents: 8_000n,
        totalLargeFeeWageCents: 5_500n,
      });

      const withoutAutomaticDiscount = await workRecords.update(
        actor(ownerId),
        storeId,
        mondayRecord.id,
        {
          version: withManualDiscount.version,
          automaticDiscountSuppressed: true,
        },
        "monday-auto-discount-remove-key-0001",
        "monday-auto-discount-remove",
      );
      expect(withoutAutomaticDiscount.automaticDiscountSuppressed).toBe(true);
      expect(withoutAutomaticDiscount.discountSnapshots).toHaveLength(1);
      expect(withoutAutomaticDiscount.discountSnapshots.some((item) => item.isAutomatic)).toBe(false);
      expect(withoutAutomaticDiscount).toMatchObject({
        discountTotalCents: 1_000n,
        discountedFeePerformanceCents: 9_000n,
        totalLargeFeeWageCents: 5_500n,
      });

      const stillWithoutAutomaticDiscount = await workRecords.update(
        actor(ownerId),
        storeId,
        mondayRecord.id,
        {
          version: withoutAutomaticDiscount.version,
          note: "自动折扣已手动移除",
        },
        "monday-auto-discount-persist-key-0001",
        "monday-auto-discount-persist",
      );
      expect(stillWithoutAutomaticDiscount.automaticDiscountSuppressed).toBe(true);
      expect(stillWithoutAutomaticDiscount.discountSnapshots.some((item) => item.isAutomatic)).toBe(false);

      const restoredAutomaticDiscount = await workRecords.update(
        actor(ownerId),
        storeId,
        mondayRecord.id,
        {
          version: stillWithoutAutomaticDiscount.version,
          automaticDiscountSuppressed: false,
        },
        "monday-auto-discount-restore-key-0001",
        "monday-auto-discount-restore",
      );
      expect(restoredAutomaticDiscount.automaticDiscountSuppressed).toBe(false);
      expect(restoredAutomaticDiscount.discountSnapshots).toHaveLength(2);
      expect(restoredAutomaticDiscount.discountSnapshots.filter((item) => item.isAutomatic)).toHaveLength(1);

      const fridayRecord = await workRecords.create(
        actor(ownerId),
        storeId,
        {
          employeeMembershipId,
          startAt: "2026-08-14T16:00:00.000Z",
          serviceItemId,
          serviceDurationMinutes: 60,
        },
        "friday-auto-discount-create-key-0001",
        "friday-auto-discount-create",
      );
      expect(fridayRecord.discountSnapshots).toHaveLength(0);
      expect(fridayRecord.discountTotalCents).toBe(0n);
    } finally {
      await prisma.store.update({
        where: { id: storeId },
        data: {
          mondayThursdayAutoDiscountEnabled: false,
          mondayThursdayAutoDiscountThresholdCents: 0,
          mondayThursdayAutoDiscountAmountCents: 0,
        },
      });
    }
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
    expect(employeeDefault.refreshedCurrentDayRecordCount).toBeGreaterThan(0);
    const afterEmployeeDefault = await prisma.workRecord.findUniqueOrThrow({
      where: { id: recordId },
      include: { serviceSnapshot: true },
    });
    expect(afterEmployeeDefault).toMatchObject({
      mainServiceWageCents: 6_200n,
      totalLargeFeeWageCents: 6_200n,
      serviceSnapshot: {
        commissionBps: 6_200,
        commissionSource: "EMPLOYEE_DEFAULT",
        wageCents: 6_200n,
      },
    });
    await expect(prisma.workRecord.findUniqueOrThrow({
      where: { id: historicalRecordId },
      include: { serviceSnapshot: true },
    })).resolves.toMatchObject({
      totalLargeFeeWageCents: 5_500n,
      serviceSnapshot: {
        commissionBps: 5_500,
        commissionSource: "EMPLOYEE_DEFAULT",
      },
    });
    await prisma.workRecordServiceSnapshot.update({
      where: { workRecordId: recordId },
      data: {
        commissionBps: 6_000,
        commissionSource: "ITEM_DEFAULT",
        wageCents: 6_000,
      },
    });
    await prisma.workRecord.update({
      where: { id: recordId },
      data: {
        mainServiceWageCents: 6_000,
        totalLargeFeeWageCents: 6_000,
      },
    });
    const settledCash = await prisma.dailyCashSettlement.create({
      data: {
        storeId,
        businessDate: afterEmployeeDefault.businessDate,
        membershipId: employeeMembershipId,
        cashServiceCents: 0,
        cashTipCents: 0,
        cashReceivedCents: 0,
        cashAllocatedServiceWageCents: 0,
        cashAcquiredServiceWageCents: 0,
        cashWageShortfallCents: 0,
        cashRetainedCents: 0,
        cashToSubmitToStoreCents: 0,
        status: "SETTLED",
        settledBy: ownerId,
        settledAt: new Date(),
      },
    });
    const sameEmployeeDefault = await commissions.setDefault(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      {
        version: employeeDefault.membership.version,
        commissionBps: 6_200,
      },
      "commission-default-refresh-key-0001",
      "refresh-same-default-commission",
    );
    expect(sameEmployeeDefault.refreshedCurrentDayRecordCount).toBeGreaterThan(0);
    await expect(prisma.employeeDefaultCommission.count({
      where: { storeId, membershipId: employeeMembershipId },
    })).resolves.toBe(1);
    await expect(prisma.dailyCashSettlement.findUniqueOrThrow({
      where: { id: settledCash.id },
    })).resolves.toMatchObject({
      status: "UNSETTLED",
      settledBy: null,
      settledAt: null,
      version: 2,
    });
    const itemOverride = await commissions.setItem(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      {
        version: sameEmployeeDefault.membership.version,
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
    expect(cleared.membership.version).toBe(5);
    const history = await commissions.list(
      actor(ownerId),
      storeId,
      employeeMembershipId,
    );
    expect(history.defaultHistory[0]?.commissionBps).toBe(6_200);
    expect(history.itemHistory[0]?.effectiveTo).not.toBeNull();
    const afterItemClear = await prisma.workRecord.findUniqueOrThrow({
      where: { id: recordId },
      include: { serviceSnapshot: true },
    });
    expect(afterItemClear.serviceSnapshot).toMatchObject({
      commissionBps: 6_200,
      commissionSource: "EMPLOYEE_DEFAULT",
      wageCents: 6_200n,
    });
    const currentBusinessDate = afterItemClear.businessDate
      .toISOString()
      .slice(0, 10);
    await boards.addRow(
      actor(ownerId),
      storeId,
      currentBusinessDate,
      { membershipId: employeeMembershipId },
      "commission-summary-board-row-key-0001",
      "commission-summary-board-row",
    );
    const currentRecords = await prisma.workRecord.findMany({
      where: {
        storeId,
        employeeMembershipId,
        businessDate: afterItemClear.businessDate,
        deletedAt: null,
      },
    });
    const expectedLargeFeeWage = currentRecords.reduce(
      (sum, record) => sum + record.totalLargeFeeWageCents,
      0n,
    );
    const expectedTip = currentRecords.reduce(
      (sum, record) => sum + (record.totalTipCents ?? 0n),
      0n,
    );
    const board = await boards.getBoard(
      actor(ownerId),
      storeId,
      currentBusinessDate,
    );
    expect(board.rows.find((row) => row.membershipId === employeeMembershipId)?.statistics)
      .toMatchObject({
        totalLargeFeeWageCents: expectedLargeFeeWage,
        employeeIncomeCents: expectedLargeFeeWage + expectedTip,
      });
    const closing = await closings.previewMember(
      actor(ownerId),
      storeId,
      currentBusinessDate,
      employeeMembershipId,
    );
    expect(closing.employee).toMatchObject({
      totalLargeFeeWageCents: Number(expectedLargeFeeWage),
      employeeIncomeCents: Number(expectedLargeFeeWage + expectedTip),
    });
    recordVersion = afterItemClear.version;
  });

  it("后来修改项目价格不改变旧记工，付款确认按现金上限计算", async () => {
    await prisma.serviceItemPriceOption.update({
      where: { serviceItemId_durationMinutes: { serviceItemId, durationMinutes: 60 } },
      data: { priceCents: 15_000n },
    });
    const paymentInput = {
      version: recordVersion,
      cashServiceCents: 1_000,
      cardServiceCents: 1_000,
      giftCardSerialNumber: "GC-WORK-0001",
      giftCardServiceCents: 8_000,
      cashTipCents: 0,
      cardTipCents: 1_000,
      giftCardTipCents: 1_000,
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
    expect(Number(confirmed.employeeTotalIncomeCents)).toBe(8_200);
    expect(Number(confirmed.cashAllocatedServiceWageCents)).toBe(620);
    expect(Number(confirmed.cashAcquiredServiceWageCents)).toBe(620);
    expect(Number(confirmed.cashWageShortfallCents)).toBe(0);
    expect(confirmed.payment).toMatchObject({
      cashServiceCents: expect.anything(),
      cardServiceCents: expect.anything(),
      giftCardSerialNumber: "GC-WORK-0001",
      giftCardServiceCents: expect.anything(),
      cashTipCents: expect.anything(),
      cardTipCents: expect.anything(),
      giftCardTipCents: expect.anything(),
    });
    expect(Number(confirmed.payment?.cashServiceCents)).toBe(1_000);
    expect(Number(confirmed.payment?.cardServiceCents)).toBe(1_000);
    expect(Number(confirmed.payment?.giftCardServiceCents)).toBe(8_000);
    expect(Number(confirmed.payment?.cashTipCents)).toBe(0);
    expect(Number(confirmed.payment?.cardTipCents)).toBe(1_000);
    expect(Number(confirmed.payment?.giftCardTipCents)).toBe(1_000);
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
      addonWageCents: 2_170n,
      totalLargeFeeWageCents: 8_670n,
      employeeTotalIncomeCents: 10_670n,
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
    const membership = await prisma.storeMembership.findUniqueOrThrow({
      where: { id: employeeMembershipId },
    });
    const closedDayCommission = await commissions.setDefault(
      actor(ownerId),
      storeId,
      employeeMembershipId,
      { version: membership.version, commissionBps: 6_500 },
      "closed-day-commission-key-0001",
      "closed-day-commission",
    );
    expect(closedDayCommission.refreshedCurrentDayRecordCount).toBe(0);
    await expect(prisma.workRecordServiceSnapshot.findUniqueOrThrow({
      where: { workRecordId: custom.id },
    })).resolves.toMatchObject({
      commissionBps: 6_200,
      commissionSource: "EMPLOYEE_DEFAULT",
      wageCents: 7_440n,
    });
  });
});
