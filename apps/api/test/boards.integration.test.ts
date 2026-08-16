import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("打卡与今日表格", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `board-test-${id}`,
        phoneE164: `+1347${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "表格集成测试店",
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
          displayName: "表格店主",
          displayNameNormalized: "表格店主",
        },
        {
          id: employeeMembershipId,
          storeId,
          userId: employeeId,
          role: "EMPLOYEE",
          displayName: "表格员工",
          displayNameNormalized: "表格员工",
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
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.shift.deleteMany({ where: { storeId } });
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

  let businessDate = "";
  let shiftId = "";
  let employeeRowId = "";
  let ownerRowId = "";
  let boardVersion = 0;

  it("员工上班可把本人加入今日表格，并发重复点击只建立一条班次和员工行", async () => {
    const current = await boards.currentBusinessDay(actor(employeeId), storeId);
    businessDate = current.businessDate;
    const [first, replay] = await Promise.all([
      boards.clockIn(
        actor(employeeId),
        storeId,
        "board-clock-in-key-0001",
        "clock-in-1",
      ),
      boards.clockIn(
        actor(employeeId),
        storeId,
        "board-clock-in-key-0001",
        "clock-in-2",
      ),
    ]);
    shiftId = first.shift.id;
    employeeRowId = first.row.id;
    boardVersion = first.board.version;

    expect(replay.shift.id).toBe(shiftId);
    expect(first.row.membershipId).toBe(employeeMembershipId);
    await expect(
      prisma.shift.count({ where: { storeId, membershipId: employeeMembershipId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.dailyEmployeeRow.count({ where: { storeId } }),
    ).resolves.toBe(1);
    await expect(
      boards.clockIn(
        actor(employeeId),
        storeId,
        "board-clock-in-key-0002",
        "clock-in-again",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("店主可手动加人，普通员工不可排序", async () => {
    const added = await boards.addRow(
      actor(ownerId),
      storeId,
      businessDate,
      { membershipId: ownerMembershipId },
      "board-add-row-key-0001",
      "add-owner-row",
    );
    ownerRowId = added.row.id;
    boardVersion = added.board.version;

    const snapshot = await boards.getBoard(actor(employeeId), storeId, businessDate);
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.isClosed).toBe(false);
    await expect(
      boards.reorder(
        actor(employeeId),
        storeId,
        businessDate,
        { version: boardVersion, rowIds: [ownerRowId, employeeRowId] },
        "employee-reorder-key-0001",
        "employee-reorder",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("手动加入今日表格后可打卡，并自动结束旧营业日遗留班次", async () => {
    const previousDate = new Date(`${businessDate}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const stale = await prisma.shift.create({
      data: {
        storeId,
        membershipId: ownerMembershipId,
        businessDate: previousDate,
        clockInAt: new Date(Date.now() - 24 * 60 * 60 * 1_000),
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });

    const result = await boards.clockIn(
      actor(ownerId),
      storeId,
      "owner-clock-in-key-0001",
      "owner-clock-in",
    );
    expect(result.row.id).toBe(ownerRowId);
    expect(result.shift.businessDate.toISOString().slice(0, 10)).toBe(businessDate);
    await expect(prisma.shift.findUniqueOrThrow({ where: { id: stale.id } })).resolves.toMatchObject({
      clockOutAt: expect.any(Date),
      version: 2,
    });
  });

  it("排序和隐藏使用乐观锁，不会覆盖其他设备", async () => {
    const reordered = await boards.reorder(
      actor(ownerId),
      storeId,
      businessDate,
      { version: boardVersion, rowIds: [ownerRowId, employeeRowId] },
      "board-reorder-key-0001",
      "reorder",
    );
    boardVersion = reordered.version;
    expect(reordered.rows.map((row) => row.id)).toEqual([
      ownerRowId,
      employeeRowId,
    ]);

    const employeeRow = reordered.rows.find((row) => row.id === employeeRowId);
    if (!employeeRow) throw new Error("缺少员工行");
    const hidden = await boards.updateRow(
      actor(ownerId),
      storeId,
      businessDate,
      employeeRowId,
      { version: employeeRow.version, isHidden: true },
      "board-hide-key-0001",
      "hide-row",
    );
    boardVersion = hidden.board.version;
    expect(hidden.row.isHidden).toBe(true);

    await expect(
      boards.reorder(
        actor(ownerId),
        storeId,
        businessDate,
        { version: boardVersion - 1, rowIds: [employeeRowId, ownerRowId] },
        "board-stale-reorder-key-0001",
        "stale-reorder",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("员工只能结束自己的未结束班次，旧版本不能重复下班", async () => {
    const shift = await boards.clockOut(
      actor(employeeId),
      storeId,
      shiftId,
      { version: 1 },
      "board-clock-out-key-0001",
      "clock-out",
    );
    expect(shift.clockOutAt).not.toBeNull();
    expect(shift.version).toBe(2);

    await expect(
      boards.clockOut(
        actor(employeeId),
        storeId,
        shiftId,
        { version: 1 },
        "board-stale-clock-out-key-0001",
        "stale-clock-out",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const snapshot = await boards.getBoard(actor(employeeId), storeId, businessDate);
    const row = snapshot.rows.find((entry) => entry.id === employeeRowId);
    expect(row?.shifts[0]?.clockOutAt).not.toBeNull();
  });

  it("员工可查看历史营业日，但服务端只返回本人的行、班次、记工和统计", async () => {
    const date = new Date(`${businessDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 2);
    const historicalBusinessDate = date.toISOString().slice(0, 10);
    const historicalBoard = await prisma.dailyBoard.create({
      data: { storeId, businessDate: date },
    });
    await prisma.dailyEmployeeRow.createMany({
      data: [
        {
          boardId: historicalBoard.id,
          storeId,
          membershipId: employeeMembershipId,
          position: 1,
          isHidden: true,
          addedBy: ownerId,
        },
        {
          boardId: historicalBoard.id,
          storeId,
          membershipId: ownerMembershipId,
          position: 2,
          addedBy: ownerId,
        },
      ],
    });
    await prisma.shift.createMany({
      data: [
        {
          storeId,
          membershipId: employeeMembershipId,
          businessDate: date,
          clockInAt: new Date(`${historicalBusinessDate}T14:00:00.000Z`),
          clockOutAt: new Date(`${historicalBusinessDate}T22:00:00.000Z`),
          createdBy: employeeId,
          updatedBy: employeeId,
        },
        {
          storeId,
          membershipId: ownerMembershipId,
          businessDate: date,
          clockInAt: new Date(`${historicalBusinessDate}T15:00:00.000Z`),
          clockOutAt: new Date(`${historicalBusinessDate}T23:00:00.000Z`),
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      ],
    });
    const [employeeRecord, ownerRecord] = await Promise.all([
      prisma.workRecord.create({
        data: {
          storeId,
          employeeMembershipId,
          businessDate: date,
          storeTimezoneSnapshot: "America/New_York",
          businessCutoffSnapshot: "22:00",
          startAt: new Date(`${historicalBusinessDate}T16:00:00.000Z`),
          endAt: new Date(`${historicalBusinessDate}T17:00:00.000Z`),
          status: "CONFIRMED",
          mainServiceAmountCents: 10_000,
          grossFeeBaseCents: 10_000,
          discountTotalCents: 1_000,
          discountedFeePerformanceCents: 9_000,
          cashServiceCents: 0,
          cardServiceCents: 9_000,
          cashTipCents: 0,
          cardTipCents: 2_000,
          totalTipCents: 2_000,
          actualServiceCollectedCents: 9_000,
          customerTotalPaidCents: 11_000,
          paymentDifferenceCents: 0,
          mainServiceWageCents: 6_000,
          totalLargeFeeWageCents: 6_000,
          employeeTotalIncomeCents: 8_000,
          cashAllocatedServiceWageCents: 0,
          cashAcquiredServiceWageCents: 0,
          cashWageShortfallCents: 0,
          createdBy: employeeId,
          updatedBy: employeeId,
        },
      }),
      prisma.workRecord.create({
        data: {
          storeId,
          employeeMembershipId: ownerMembershipId,
          businessDate: date,
          storeTimezoneSnapshot: "America/New_York",
          businessCutoffSnapshot: "22:00",
          startAt: new Date(`${historicalBusinessDate}T18:00:00.000Z`),
          endAt: new Date(`${historicalBusinessDate}T19:00:00.000Z`),
          status: "CONFIRMED",
          mainServiceAmountCents: 20_000,
          grossFeeBaseCents: 20_000,
          discountTotalCents: 2_000,
          discountedFeePerformanceCents: 18_000,
          cashServiceCents: 0,
          cardServiceCents: 18_000,
          cashTipCents: 0,
          cardTipCents: 4_000,
          totalTipCents: 4_000,
          actualServiceCollectedCents: 18_000,
          customerTotalPaidCents: 22_000,
          paymentDifferenceCents: 0,
          mainServiceWageCents: 10_000,
          totalLargeFeeWageCents: 10_000,
          employeeTotalIncomeCents: 14_000,
          cashAllocatedServiceWageCents: 0,
          cashAcquiredServiceWageCents: 0,
          cashWageShortfallCents: 0,
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      }),
    ]);
    await prisma.businessDayClosing.create({
      data: {
        storeId,
        businessDate: date,
        cycleNo: 1,
        warningSnapshotJson: {},
        totalsSnapshotJson: { privateStoreGrossFeeCents: 30_000 },
        closedBy: ownerId,
      },
    });

    const employeeView = await boards.getBoard(
      actor(employeeId),
      storeId,
      historicalBusinessDate,
    );
    expect(employeeView.rows).toHaveLength(1);
    expect(employeeView.rows[0]).toMatchObject({
      membershipId: employeeMembershipId,
      isHidden: true,
      workRecords: [{ id: employeeRecord.id }],
      shifts: [{ membershipId: employeeMembershipId }],
      statistics: {
        grossFeeBaseCents: 10_000n,
        discountTotalCents: 1_000n,
        totalTipCents: 2_000n,
        employeeIncomeCents: 8_000n,
        storeIncomeCents: 3_000n,
      },
    });
    expect(employeeView.statistics).toMatchObject({
      recordCount: 1,
      grossFeeBaseCents: 10_000n,
      discountTotalCents: 1_000n,
      employeeIncomeCents: 8_000n,
      storeIncomeCents: 3_000n,
    });
    expect(employeeView.isClosed).toBe(true);
    expect(employeeView.closing).toBeNull();
    expect(employeeView.rows[0]?.workRecords.map((record) => record.id)).not.toContain(
      ownerRecord.id,
    );

    const ownerView = await boards.getBoard(
      actor(ownerId),
      storeId,
      historicalBusinessDate,
    );
    expect(ownerView.rows).toHaveLength(2);
    expect(ownerView.statistics).toMatchObject({
      recordCount: 2,
      grossFeeBaseCents: 30_000n,
      discountTotalCents: 3_000n,
      employeeIncomeCents: 22_000n,
      storeIncomeCents: 11_000n,
    });
    expect(ownerView.closing).toMatchObject({
      totalsSnapshotJson: { privateStoreGrossFeeCents: 30_000 },
    });

    const hiddenEmployeeRow = ownerView.rows.find(
      (row) => row.membershipId === employeeMembershipId,
    );
    if (!hiddenEmployeeRow) throw new Error("缺少已隐藏员工行");
    const restored = await boards.updateRow(
      actor(ownerId),
      storeId,
      historicalBusinessDate,
      hiddenEmployeeRow.id,
      { version: hiddenEmployeeRow.version, isHidden: false },
      "restore-hidden-closed-row-0001",
      "restore-hidden-closed-row",
    );
    expect(restored.row.isHidden).toBe(false);
    await expect(
      prisma.businessDayClosing.findFirstOrThrow({
        where: { storeId, businessDate: date, status: "CLOSED" },
      }),
    ).resolves.toBeTruthy();
  });
});
