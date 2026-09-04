import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DispatchService } from "../src/boards/dispatch.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const dispatch = new DispatchService(prisma, access, idempotency);
const workRecords = new WorkRecordsService(prisma, access, idempotency, dispatch);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeUserId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeIds = [randomUUID(), randomUUID(), randomUUID()] as const;
const actor = (id: string) => ({ id }) as User;
const today = new Date().toISOString().slice(0, 10);
const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);
const serviceItemId = randomUUID();
let regularIntentId = "";
let regularRecordId = "";
let regularRecordVersion = 0;

describe.skipIf(!enabled).sequential("自动排工", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [ownerId, employeeUserId].map((id, index) => ({ id, firebaseUid: `dispatch-${id}`, phoneE164: `+1646${(randomInt(10_000_000, 99_000_000) + index).toString()}` })) });
    await prisma.store.create({ data: { id: storeId, storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"), name: "排工测试店", timezone: "UTC", businessCutoffLocal: "23:59", globalCommissionBps: 5_000, automaticDispatchEnabled: true, status: "ACTIVE" } });
    await prisma.storeMembership.createMany({ data: [
      { id: ownerMembershipId, storeId, userId: ownerId, role: "OWNER", displayName: "店主", displayNameNormalized: "店主", isServiceProvider: false },
      { id: employeeIds[0], storeId, userId: employeeUserId, role: "EMPLOYEE", displayName: "A", displayNameNormalized: "a", employmentType: "PART_TIME" },
      { id: employeeIds[1], storeId, role: "EMPLOYEE", displayName: "B", displayNameNormalized: "b", employmentType: "FULL_TIME" },
      { id: employeeIds[2], storeId, role: "EMPLOYEE", displayName: "C", displayNameNormalized: "c", employmentType: "PART_TIME" },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId } });
    await prisma.serviceItem.create({ data: { id: serviceItemId, storeId, fullName: "60 分钟按摩", shortName: "按摩", durationMinutes: 60, priceCents: 10_000n, defaultCommissionBps: 6_000, position: 1, priceOptions: { create: { durationMinutes: 60, priceCents: 10_000n, position: 1 } } } });
    for (const date of [yesterday, today]) {
      await prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(`${date}T00:00:00.000Z`), rows: { create: employeeIds.map((membershipId, index) => ({ storeId, membershipId, position: index + 1, addedBy: ownerId })) } } });
    }
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.dispatchEvent.deleteMany({ where: { storeId } });
      await prisma.dispatchMakeupTurn.deleteMany({ where: { storeId } });
      await prisma.dispatchIntent.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeUserId] } } });
    }
    await prisma.$disconnect();
  });

  it("uses the previous board to rotate A B C into B C A", async () => {
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${today}T00:00:00.000Z`) } } });
    const state = await dispatch.rank(actor(ownerId), storeId, today, { version: board.version }, "dispatch-rank-0001", "dispatch-rank");
    expect(state.rankedAt).not.toBeNull();
    const rows = await prisma.dailyEmployeeRow.findMany({ where: { boardId: board.id }, orderBy: { position: "asc" } });
    expect(rows.map((row) => row.membershipId)).toEqual([employeeIds[1], employeeIds[2], employeeIds[0]]);
  });

  it("creates one idempotent regular intent for the next employee", async () => {
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${today}T00:00:00.000Z`) } } });
    const first = await dispatch.createIntent(actor(ownerId), storeId, today, { version: board.version, kind: "REGULAR" }, "dispatch-intent-0001", "intent-first");
    const replay = await dispatch.createIntent(actor(ownerId), storeId, today, { version: board.version, kind: "REGULAR" }, "dispatch-intent-0001", "intent-replay");
    expect(first.id).toBe(replay.id);
    expect(first.employeeMembershipId).toBe(employeeIds[1]);
    regularIntentId = first.id;
  });

  it("links a current-day record to the dispatch intent", async () => {
    const record = await workRecords.create(actor(employeeUserId), storeId, {
      employeeMembershipId: employeeIds[1],
      startAt: new Date().toISOString(),
      serviceItemId,
      serviceDurationMinutes: 60,
      dispatchIntentId: regularIntentId,
    }, "dispatch-record-0001", "dispatch-record");
    expect(record.dispatchKind).toBe("REGULAR");
    regularRecordId = record.id;
    regularRecordVersion = record.version;
    await expect(prisma.dispatchIntent.findUniqueOrThrow({ where: { id: regularIntentId } })).resolves.toMatchObject({ status: "CONSUMED", workRecordId: record.id });
  });

  it("returns a deleted regular record as one pending makeup turn", async () => {
    await workRecords.remove(actor(ownerId), storeId, regularRecordId, { version: regularRecordVersion }, "dispatch-record-delete-0001", "dispatch-record-delete");
    await expect(prisma.dispatchMakeupTurn.findFirstOrThrow({ where: { sourceWorkRecordId: regularRecordId } })).resolves.toMatchObject({
      employeeMembershipId: employeeIds[1],
      reason: "RECORD_DELETED",
      status: "PENDING",
    });
  });

  it("prevents employees from changing dispatch state", async () => {
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${today}T00:00:00.000Z`) } } });
    await expect(dispatch.rank(actor(employeeUserId), storeId, today, { version: board.version }, "employee-rank-0001", "employee-rank")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a selected employee who is not next", async () => {
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${today}T00:00:00.000Z`) } } });
    await expect(dispatch.createIntent(actor(ownerId), storeId, today, { version: board.version, kind: "REGULAR", membershipId: employeeIds[0] }, "dispatch-wrong-0001", "wrong-provider")).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows only one of two devices to dispatch the same board version", async () => {
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${today}T00:00:00.000Z`) } } });
    const results = await Promise.allSettled([
      dispatch.createIntent(actor(ownerId), storeId, today, { version: board.version, kind: "REGULAR" }, "dispatch-concurrent-0001", "concurrent-a"),
      dispatch.createIntent(actor(ownerId), storeId, today, { version: board.version, kind: "REGULAR" }, "dispatch-concurrent-0002", "concurrent-b"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(ConflictException) });
  });
});
