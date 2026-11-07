import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@massage-note/database";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { BoardsService } from "../src/boards/boards.service.js";
import { DailyRankingService } from "../src/boards/daily-ranking.service.js";
import { fullTimeContext } from "../src/boards/rotation-context.js";
import { deviceTimeContext } from "../src/common/device-time.js";
import { AuditService } from "../src/audit/audit.service.js";

const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const ranking = new DailyRankingService(access, idempotency);
const audit = new AuditService(prisma, access, idempotency);
const storeId = randomUUID(), userId = randomUUID(), ownerId = randomUUID();
const full: string[] = [randomUUID(), randomUUID(), randomUUID()];
const part: string[] = [randomUUID(), randomUUID()];
const all = [...full, ...part];
const actor = { id: userId } as User;
const empty = () => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
const at = <T>(date: string, fn: () => T) => deviceTimeContext.run({ timezone: "UTC", now: new Date(`${date}T12:00:00Z`) }, fn);
const read = (date: string) => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(date) } }, include: { rows: { orderBy: { position: "asc" } } } });
async function board(date: string, ids = all, anchor?: string[]) {
  return prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(date), ...(anchor ? { fullTimeOrderOverride: anchor } : {}), rows: { create: ids.map((membershipId, index) => ({ storeId, membershipId, position: index + 1, addedBy: userId })) } } });
}
async function save(date: string, order = full) {
  const config = await at(date, () => boards.getWeeklyDispatch(actor, storeId, date));
  const input = { version: config.version, schedule: { ...empty(), monday: all, tuesday: all, wednesday: all }, businessDate: date, boardVersion: config.boardVersion, fullTimeOrder: order };
  await at(date, () => boards.saveWeeklyDispatch(actor, storeId, input, randomUUID(), randomUUID()));
}
async function rank(date: string) {
  const current = await read(date);
  return at(date, () => ranking.rank(actor, storeId, date, { version: current.version }, randomUUID(), randomUUID()));
}
describe.skipIf(process.env.DATABASE_INTEGRATION_TESTS !== "1").sequential("dated full-time rotation settings", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, firebaseUid: `rotation-${userId}`, phoneE164: `+1917${randomInt(10000000, 99999999)}` } });
    await prisma.store.create({ data: { id: storeId, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: "Rotation settings", timezone: "UTC", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE", automaticDispatchEnabled: true } });
    await prisma.storeMembership.createMany({ data: [{ id: ownerId, storeId, userId, role: "OWNER", isServiceProvider: false, displayName: "Owner", displayNameNormalized: "owner" }, ...all.map((id, index) => ({ id, storeId, role: "EMPLOYEE" as const, employmentType: index < 3 ? "FULL_TIME" as const : "PART_TIME" as const, displayName: `Staff ${index}`, displayNameNormalized: `staff ${index}`, joinedAt: new Date("2026-01-01") }))] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerId } });
  });
  afterAll(async () => {
    if (process.env.DATABASE_INTEGRATION_TESTS === "1") {
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });
  it("requires initialization and saves all settings without generating, including on repeated future refresh", async () => {
    await board("2026-11-02");
    await expect(rank("2026-11-02")).rejects.toMatchObject({ response: { code: "DAILY_RANKING_SETUP_REQUIRED" } });
    const initial = await read("2026-11-02");
    await save("2026-11-02", [...full].reverse());
    await at("2026-11-01", () => boards.applyWeeklyDispatch(actor, storeId, "2026-11-02", randomUUID()));
    const saved = await read("2026-11-02");
    expect(saved.rankingPending).toBe(true);
    expect(saved.rankedAt).toBeNull();
    expect(saved.rows.map(row => row.id)).toEqual(initial.rows.map(row => row.id));
    await at("2026-11-01", () => boards.applyWeeklyDispatch(actor, storeId, "2026-11-02", randomUUID()));
    expect(await read("2026-11-02")).toEqual(saved);
    const generated = await rank("2026-11-02");
    expect(generated.rankingPending).toBe(false);
    expect(generated.fullTimeOrder).toEqual([...full].reverse());
    expect(generated.rows.map(row => row.membershipId)).toEqual([...full].reverse().concat([...part].sort()));
    const repeated = await rank("2026-11-02");
    expect(repeated.fullTimeOrder).toEqual(generated.fullTimeOrder);
    expect(repeated.rows.map(row => row.membershipId)).toEqual(generated.rows.map(row => row.membershipId));
  });
  it("keeps Sara Jessie Jessica internally after moving Jessie last on the board, then rotates to Jessie Jessica Sara", async () => {
    const [sara, jessie, jessica] = full as [string, string, string];
    await board("2026-11-03", full, [jessica, sara, jessie]);
    await board("2026-11-04", full);
    const yesterday = await rank("2026-11-04");
    expect(yesterday.fullTimeOrder).toEqual([sara, jessie, jessica]);
    const rowFor = (id: string) => yesterday.rows.find(row => row.membershipId === id)!.id;
    await at("2026-11-04", () => boards.reorder(actor, storeId, "2026-11-04", {
      version: yesterday.version,
      rowIds: [sara, jessica, jessie].map(rowFor),
    }, randomUUID(), randomUUID()));
    expect((await read("2026-11-04")).fullTimeOrder).toEqual([sara, jessie, jessica]);
    await board("2026-11-05", full);
    const settings = await at("2026-11-05", () => boards.getWeeklyDispatch(actor, storeId, "2026-11-05"));
    expect(settings.fullTimeOrder).toEqual([jessie, jessica, sara]);
    const today = await rank("2026-11-05");
    expect(today.fullTimeOrder).toEqual([jessie, jessica, sara]);
    expect(today.rows.map(row => row.membershipId)).toEqual([jessie, jessica, sara]);
  });

  it("rotates through the actual full-time head, skips closed days, and blocks missing days", async () => {
    await board("2026-11-09", all, full);
    await board("2026-11-10", [full[0]!, full[2]!, ...part]);
    const day2 = await rank("2026-11-10");
    expect(day2.fullTimeOrder).toEqual([full[1], full[2], full[0]]);
    expect(day2.rows.filter(row => full.includes(row.membershipId)).map(row => row.membershipId)).toEqual([full[2], full[0]]);
    await board("2026-11-11", []);
    await board("2026-11-12");
    // Staff 2 headed the last working day; the full prefix moves behind them.
    expect((await rank("2026-11-12")).fullTimeOrder).toEqual(full);
    await board("2026-11-14");
    await expect(rank("2026-11-14")).rejects.toMatchObject({ response: { code: "DAILY_RANKING_SETUP_REQUIRED", missingDate: "2026-11-13" } });
    await save("2026-11-14");
    expect((await rank("2026-11-14")).fullTimeOrder).toEqual(full);
  });
  it("keeps the current queue after row moves and uses their final actual head for the next date", async () => {
    await board("2026-11-16", all, full);
    await save("2026-11-16");
    expect(await at("2026-11-16", () => boards.applyWeeklyDispatch(actor, storeId, "2026-11-17", randomUUID()))).toMatchObject({ ranked: true });
    const initial = await read("2026-11-17");
    expect(initial.fullTimeOrder).toEqual([full[1], full[2], full[0]]);
    await at("2026-11-17", () => boards.reorder(actor, storeId, "2026-11-17", { version: initial.version, rowIds: initial.rows.map(row => row.id).reverse() }, randomUUID(), randomUUID()));
    expect((await read("2026-11-17")).fullTimeOrder).toEqual(initial.fullTimeOrder);
    await board("2026-11-18");
    // Reversing the board put Staff 0 first, at the internal queue's tail.
    expect((await rank("2026-11-18")).fullTimeOrder).toEqual([full[1], full[2], full[0]]);
  });
  it("rejects invalid rosters and stale board versions atomically and preserves locks", async () => {
    await board("2026-11-23", all, full);
    const config = await at("2026-11-23", () => boards.getWeeklyDispatch(actor, storeId, "2026-11-23"));
    const input = { version: config.version, schedule: empty(), businessDate: "2026-11-23", boardVersion: config.boardVersion, fullTimeOrder: full.slice(1) };
    await expect(at(input.businessDate, () => boards.saveWeeklyDispatch(actor, storeId, input, randomUUID(), randomUUID()))).rejects.toMatchObject({ response: { code: "FULL_TIME_ORDER_ROSTER_CHANGED" } });
    await expect(at(input.businessDate, () => boards.saveWeeklyDispatch(actor, storeId, { ...input, fullTimeOrder: full, boardVersion: 0 }, randomUUID(), randomUUID()))).rejects.toMatchObject({ response: { code: "BOARD_VERSION_CONFLICT" } });
    expect(await at(input.businessDate, () => boards.getWeeklyDispatch(actor, storeId, input.businessDate))).toEqual(config);
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date(input.businessDate), closedBy: userId, cycleNo: 1, totalsSnapshotJson: {}, warningSnapshotJson: [] } });
    await expect(save(input.businessDate)).rejects.toMatchObject({ response: { code: "BUSINESS_DAY_CLOSED" } });
  });
  it("restores both weekly settings and dated order through operation undo", async () => {
    await board("2026-11-30", all, full);
    await save("2026-11-30", [...full].reverse());
    const log = await prisma.auditLog.findFirstOrThrow({ where: { storeId, action: "board.weekly_dispatch_updated", afterJson: { path: ["businessDate"], equals: "2026-11-30" } } });
    await at("2026-11-30", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    expect((await read("2026-11-30")).fullTimeOrderOverride).toEqual(full);
  });
  it("adds a converted full-time member before the previous full-time head's final tail", async () => {
    await board("2026-12-01", all, full);
    await board("2026-12-02");
    await rank("2026-12-02");
    await prisma.storeMembership.update({ where: { id: part[0]! }, data: { employmentType: "FULL_TIME" } });
    await board("2026-12-03");
    expect((await rank("2026-12-03")).fullTimeOrder).toEqual([full[2], full[0], part[0], full[1]]);
    await prisma.storeMembership.update({ where: { id: part[0]! }, data: { employmentType: "PART_TIME" } });
  });
  it("undoes pre-migration daily board snapshots with default new fields", async () => {
    await board("2026-12-04");
    const initial = await read("2026-12-04");
    await at("2026-12-04", () => boards.reorder(actor, storeId, "2026-12-04", { version: initial.version, rowIds: initial.rows.map(row => row.id).reverse() }, randomUUID(), randomUUID()));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { storeId, entityId: initial.id, action: "board.rows_reordered" }, include: { undoTransaction: true } });
    const changes = await prisma.auditRowChange.findMany({ where: { storeId, transactionId: log.undoTransaction!.transactionId, tableName: "daily_boards" } });
    for (const change of changes) {
      const strip = (image: unknown) => {
        const next = { ...image as Record<string, string | number | boolean | null> };
        delete next.full_time_order; delete next.full_time_order_override; delete next.ranking_pending;
        return next;
      };
      await prisma.auditRowChange.update({ where: { id: change.id }, data: { beforeJson: strip(change.beforeJson), afterJson: strip(change.afterJson) } });
    }
    await at("2026-12-04", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    expect((await read("2026-12-04")).rows.map(row => row.id)).toEqual(initial.rows.map(row => row.id));
  });
  it("reconciles departures and new full-time staff without losing resting staff", async () => {
    await board("2026-12-07", all, full);
    await prisma.storeMembership.update({ where: { id: full[1]! }, data: { employmentType: "PART_TIME" } });
    const newcomer = await prisma.storeMembership.create({ data: { storeId, displayName: "New full-time", displayNameNormalized: "new full-time", role: "EMPLOYEE", employmentType: "FULL_TIME", joinedAt: new Date("2026-12-08") } });
    await board("2026-12-08");
    expect((await fullTimeContext(prisma, storeId, "2026-12-08")).order).toEqual([full[2], full[0], newcomer.id]);
  });
});
