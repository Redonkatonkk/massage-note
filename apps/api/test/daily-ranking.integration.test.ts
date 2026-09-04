import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { businessDateFor } from "@massage-note/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { DailyRankingService } from "../src/boards/daily-ranking.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { MembershipsService } from "../src/stores/memberships.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const ranking = new DailyRankingService(prisma, access, idempotency);
const boards = new BoardsService(prisma, access, idempotency);
const memberships = new MembershipsService(prisma, access);
const workRecords = new WorkRecordsService(prisma, access, idempotency);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeUserId = randomUUID();
const applicantUserId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const actor = (id: string) => ({ id }) as User;
const storeTimezone = "UTC";
const storeCutoff = "00:00";
const today = businessDateFor({
  startAt: new Date(),
  timezone: storeTimezone,
  cutoffLocal: storeCutoff,
});
const relativeDate = (days: number) => {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const yesterday = relativeDate(-1);
const olderDay = relativeDate(-3);
const serviceItemId = randomUUID();
let workRecordId = "";

describe.skipIf(!enabled).sequential("每日开门排位", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeUserId, applicantUserId].map((id, index) => ({
        id,
        firebaseUid: `daily-ranking-${id}`,
        phoneE164: `+1646${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "排位测试店",
        timezone: storeTimezone,
        businessCutoffLocal: storeCutoff,
        globalCommissionBps: 5_000,
        automaticDispatchEnabled: true,
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
          displayName: "店主",
          displayNameNormalized: "店主",
          isServiceProvider: false,
        },
        {
          id: employeeIds[0],
          storeId,
          userId: employeeUserId,
          role: "EMPLOYEE",
          displayName: "A",
          displayNameNormalized: "a",
          employmentType: "PART_TIME",
        },
        {
          id: employeeIds[1],
          storeId,
          role: "EMPLOYEE",
          displayName: "B",
          displayNameNormalized: "b",
          employmentType: "FULL_TIME",
        },
        {
          id: employeeIds[2],
          storeId,
          role: "EMPLOYEE",
          displayName: "C",
          displayNameNormalized: "c",
          employmentType: "PART_TIME",
        },
        {
          id: employeeIds[3],
          storeId,
          role: "EMPLOYEE",
          displayName: "D",
          displayNameNormalized: "d",
          employmentType: "PART_TIME",
        },
      ],
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
    await prisma.serviceItem.create({
      data: {
        id: serviceItemId,
        storeId,
        fullName: "60 分钟按摩",
        shortName: "按摩",
        durationMinutes: 60,
        priceCents: 10_000n,
        defaultCommissionBps: 6_000,
        position: 1,
        priceOptions: {
          create: { durationMinutes: 60, priceCents: 10_000n, position: 1 },
        },
      },
    });
    await prisma.dailyBoard.create({
      data: {
        storeId,
        businessDate: new Date(`${olderDay}T00:00:00.000Z`),
        rows: {
          create: [
            { storeId, membershipId: employeeIds[0], position: 1, addedBy: ownerId },
            { storeId, membershipId: employeeIds[2], position: 2, addedBy: ownerId },
          ],
        },
      },
    });
    await prisma.dailyBoard.create({
      data: {
        storeId,
        businessDate: new Date(`${yesterday}T00:00:00.000Z`),
        rows: {
          create: [
            { storeId, membershipId: employeeIds[0], position: 1, addedBy: ownerId },
            { storeId, membershipId: employeeIds[1], position: 2, addedBy: ownerId },
            { storeId, membershipId: employeeIds[2], position: 3, isHidden: true, addedBy: ownerId },
          ],
        },
      },
    });
    await prisma.dailyBoard.create({
      data: {
        storeId,
        businessDate: new Date(`${today}T00:00:00.000Z`),
        rows: {
          create: employeeIds.map((membershipId, index) => ({
            storeId,
            membershipId,
            position: index + 1,
            addedBy: ownerId,
          })),
        },
      },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.shift.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.storeJoinRequest.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, employeeUserId, applicantUserId] } },
      });
    }
    await prisma.$disconnect();
  });

  it("uses the most recent visible history and puts new employees last", async () => {
    const board = await currentBoard();
    const result = await ranking.rank(
      actor(ownerId),
      storeId,
      today,
      { version: board.version },
      "daily-ranking-order-0001",
      "daily-ranking-order",
    );
    expect(result.rows.map((row) => row.membershipId)).toEqual([
      employeeIds[1],
      employeeIds[2],
      employeeIds[0],
      employeeIds[3],
    ]);
    expect(result.rankedAt).not.toBeNull();
  });

  it("does not couple ordinary or AI-compatible work records to ranking", async () => {
    const record = await workRecords.create(
      actor(employeeUserId),
      storeId,
      {
        employeeMembershipId: employeeIds[0],
        startAt: new Date().toISOString(),
        serviceItemId,
        serviceDurationMinutes: 60,
      },
      "daily-ranking-record-0001",
      "daily-ranking-record",
    );
    workRecordId = record.id;
    const board = await currentBoard();
    await expect(
      ranking.rank(
        actor(ownerId),
        storeId,
        today,
        { version: board.version },
        "daily-ranking-after-record-0001",
        "daily-ranking-after-record",
      ),
    ).resolves.toMatchObject({ version: board.version + 1 });
  });

  it("replays the same idempotency key without ranking twice", async () => {
    const board = await currentBoard();
    const first = await ranking.rank(
      actor(ownerId), storeId, today, { version: board.version },
      "daily-ranking-replay-0001", "daily-ranking-replay-first",
    );
    const replay = await ranking.rank(
      actor(ownerId), storeId, today, { version: board.version },
      "daily-ranking-replay-0001", "daily-ranking-replay-second",
    );
    expect(replay.version).toBe(first.version);
    expect((await currentBoard()).version).toBe(first.version);
  });

  it("allows only one device to use a board version", async () => {
    const board = await currentBoard();
    const results = await Promise.allSettled([
      ranking.rank(actor(ownerId), storeId, today, { version: board.version }, "daily-ranking-concurrent-a", "concurrent-a"),
      ranking.rank(actor(ownerId), storeId, today, { version: board.version }, "daily-ranking-concurrent-b", "concurrent-b"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects employees and non-current business dates", async () => {
    const board = await currentBoard();
    await expect(
      ranking.rank(actor(employeeUserId), storeId, today, { version: board.version }, "employee-ranking-0001", "employee-ranking"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const oldBoard = await prisma.dailyBoard.findUniqueOrThrow({
      where: { storeId_businessDate: { storeId, businessDate: new Date(`${yesterday}T00:00:00.000Z`) } },
    });
    await expect(
      ranking.rank(actor(ownerId), storeId, yesterday, { version: oldBoard.version }, "past-ranking-0001", "past-ranking"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects missing employment types during every membership lifecycle", async () => {
    await expect(
      memberships.createEmployee(actor(ownerId), storeId, { name: "无类型新员工" }, "create-untyped"),
    ).rejects.toBeInstanceOf(ConflictException);

    const current = await prisma.storeMembership.findUniqueOrThrow({ where: { id: employeeIds[0] } });
    await expect(
      memberships.updateMember(actor(ownerId), storeId, employeeIds[0], { version: current.version, employmentType: null }, "clear-type"),
    ).rejects.toBeInstanceOf(ConflictException);

    const inactiveId = randomUUID();
    await prisma.storeMembership.create({
      data: {
        id: inactiveId,
        storeId,
        role: "EMPLOYEE",
        displayName: "待恢复员工",
        displayNameNormalized: "待恢复员工",
        isServiceProvider: true,
        status: "INACTIVE",
      },
    });
    await expect(
      memberships.restoreMember(actor(ownerId), storeId, inactiveId, { version: 1 }, "restore-untyped"),
    ).rejects.toBeInstanceOf(ConflictException);

    const joinRequest = await prisma.storeJoinRequest.create({
      data: {
        storeId,
        userId: applicantUserId,
        requestedDisplayName: "申请员工",
      },
    });
    await expect(
      memberships.approveJoinRequest(actor(ownerId), storeId, joinRequest.id, { version: joinRequest.version, role: "EMPLOYEE", isServiceProvider: true }, "approve-untyped"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("counts deleted work records as activity when removing a row", async () => {
    await prisma.workRecord.update({
      where: { id: workRecordId },
      data: { deletedAt: new Date(), deletedBy: ownerId, deleteReason: "测试" },
    });
    const row = await prisma.dailyEmployeeRow.findUniqueOrThrow({
      where: {
        boardId_membershipId: {
          boardId: (await currentBoard()).id,
          membershipId: employeeIds[0],
        },
      },
    });
    await expect(
      boards.removeRow(actor(ownerId), storeId, today, row.id, { version: row.version }, "remove-used-row-0001", "remove-used-row"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

async function currentBoard() {
  return prisma.dailyBoard.findUniqueOrThrow({
    where: {
      storeId_businessDate: {
        storeId,
        businessDate: new Date(`${today}T00:00:00.000Z`),
      },
    },
  });
}
