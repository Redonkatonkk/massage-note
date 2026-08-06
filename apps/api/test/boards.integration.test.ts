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

  it("服务端给出当前营业日，并发重复打卡只建立一条班次和员工行", async () => {
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
});
