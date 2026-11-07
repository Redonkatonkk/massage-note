import { randomInt, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@massage-note/database";
import { rankingExplanationSchema } from "@massage-note/contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { BoardsService } from "../src/boards/boards.service.js";
import { DailyRankingService } from "../src/boards/daily-ranking.service.js";
import { fullTimeContext } from "../src/boards/rotation-context.js";
import { deviceTimeContext } from "../src/common/device-time.js";
import { AuditService } from "../src/audit/audit.service.js";
import { StoreDataService } from "../src/store-data/store-data.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService(), access = new StoreAccessService(prisma), idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency), ranking = new DailyRankingService(access, idempotency);
const audit = new AuditService(prisma, access, idempotency), storeData = new StoreDataService(prisma, access);
const storeId = randomUUID(), userId = randomUUID(), ownerId = randomUUID();
const [a, b, c, d, k] = Array.from({ length: 5 }, () => randomUUID()) as [string, string, string, string, string];
const full = [a, b, c, d], all = [...full, k];
const actor = { id: userId } as User;
const at = <T>(date: string, action: () => T) => deviceTimeContext.run({ timezone: "UTC", now: new Date(`${date}T12:00:00Z`) }, action);
const read = (date: string) => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(date) } }, include: { rows: { orderBy: { position: "asc" } } } });
const explanation = (board: { rankingExplanation: unknown }) => rankingExplanationSchema.parse(board.rankingExplanation);
async function board(date: string, ids = all, anchor?: string[]) {
  return prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(date), ...(anchor ? { fullTimeOrderOverride: anchor } : {}), rows: { create: ids.map((membershipId, index) => ({ storeId, membershipId, position: index + 1, addedBy: userId })) } } });
}
async function rank(date: string, now = date) {
  const current = await read(date);
  return at(now, () => ranking.rank(actor, storeId, date, { version: current.version }, randomUUID(), randomUUID()));
}
async function start(ids = full, order = full) {
  await board("2027-02-01", ids, order);
  return rank("2027-02-01");
}
async function reorder(date: string, ids: string[]) {
  const current = await read(date);
  await at(date, () => boards.reorder(actor, storeId, date, { version: current.version, rowIds: ids.map(id => current.rows.find(row => row.membershipId === id)!.id) }, randomUUID(), randomUUID()));
}

describe.skipIf(!enabled).sequential("rotation by the actual first employee", () => {
  beforeEach(async () => {
    await prisma.user.create({ data: { id: userId, firebaseUid: `head-${userId}`, phoneE164: `+1917${randomInt(10000000, 99999999)}` } });
    const schedule = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => [day, all]));
    await prisma.store.create({ data: { id: storeId, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: "Actual head rotation", timezone: "UTC", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE", automaticDispatchEnabled: true, weeklyDispatchJson: schedule, weeklyDispatchEffectiveFrom: new Date("2027-01-01") } });
    await prisma.storeMembership.createMany({ data: [{ id: ownerId, storeId, userId, role: "OWNER", isServiceProvider: false, displayName: "Owner", displayNameNormalized: "owner" }, ...all.map((id, index) => ({ id, storeId, role: "EMPLOYEE" as const, employmentType: id === k ? "PART_TIME" as const : "FULL_TIME" as const, displayName: ["A", "B", "C", "D", "K"][index]!, displayNameNormalized: ["a", "b", "c", "d", "k"][index]!, joinedAt: new Date("2026-01-01") }))] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerId } });
    await board("2027-01-31", all, full); // Prior attendance, without a new-rule marker.
  });
  afterEach(async () => {
    await prisma.storeDataImportPreview.deleteMany({ where: { storeId } });
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
  });
  afterAll(() => prisma.$disconnect());

  it("keeps ABC after KBC when part-time K led and A rested", async () => {
    await prisma.storeMembership.update({ where: { id: d }, data: { status: "INACTIVE" } });
    await start([k, b, c], [a, b, c]);
    await reorder("2027-02-01", [k, b, c]);
    await board("2027-02-02", [a, b, c]);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([a, b, c]);
    expect(result.rows.map(row => row.membershipId)).toEqual([a, b, c]);
    expect(explanation(result).fullTimeRotation).toMatchObject({ rule: "PART_TIME_HEAD", referenceHead: { membershipId: k, employmentType: "PART_TIME", businessDate: "2027-02-01" } });
  });

  it.each([false, true])("rotates ABCD through actual head B, even when B rests tomorrow=%s", async rests => {
    await start([b, c, d]);
    await board("2027-02-02", rests ? [a, c, d] : full);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([c, d, a, b]);
    expect(result.rows.map(row => row.membershipId)).toEqual(rests ? [c, d, a] : [c, d, a, b]);
    expect(explanation(result).fullTimeRotation).toMatchObject({ rule: "FULL_TIME_HEAD", referenceHead: { membershipId: b }, movedMembershipIds: [a, b] });
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual(result.fullTimeOrder);
    await board("2027-02-03", full);
    expect((await rank("2027-02-03")).fullTimeOrder).toEqual([d, a, b, c]);
  });

  it("moves multiple resting predecessors together and honors the final manually chosen head", async () => {
    await start();
    await reorder("2027-02-01", [c, d, a, b]);
    await board("2027-02-02", full);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([d, a, b, c]);
    expect(explanation(result).fullTimeRotation?.movedMembershipIds).toEqual([a, b, c]);
  });

  it("moves two resting predecessors before actual head C without looking at tomorrow's attendance", async () => {
    await start([c, d]);
    await board("2027-02-02", full);
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual([d, a, b, c]);
  });

  it("uses the head's saved part-time type when that employee later converts to full-time", async () => {
    await start(all);
    await reorder("2027-02-01", [k, a, b, c, d]);
    await prisma.storeMembership.update({ where: { id: k }, data: { employmentType: "FULL_TIME" } });
    await board("2027-02-02", all);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([...full, k]);
    expect(explanation(result).fullTimeRotation).toMatchObject({ rule: "PART_TIME_HEAD", referenceHead: { membershipId: k, employmentType: "PART_TIME" } });
  });

  it("rotates through the previous head before removing a departed member from the new queue", async () => {
    await start([b, c, d]);
    await prisma.storeMembership.update({ where: { id: b }, data: { status: "INACTIVE" } });
    await board("2027-02-02", [a, c, d]);
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual([c, d, a]);
  });

  it("puts a new full-time employee before the previous head even without attendance history", async () => {
    await start([b]);
    await prisma.storeMembership.updateMany({ where: { id: { in: [a, c, d] } }, data: { status: "INACTIVE" } });
    const newcomer = await prisma.storeMembership.create({ data: { storeId, role: "EMPLOYEE", employmentType: "FULL_TIME", displayName: "New", displayNameNormalized: "new", joinedAt: new Date("2027-02-02") } });
    await board("2027-02-02", [b, newcomer.id]);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([newcomer.id, b]);
    expect(result.rows.map(row => row.membershipId)).toEqual([newcomer.id, b]);
  });

  it("skips whole-store rest days but still blocks missing dates", async () => {
    await start([b, c, d]);
    await board("2027-02-02", []);
    await board("2027-02-03", full);
    expect((await rank("2027-02-03")).fullTimeOrder).toEqual([c, d, a, b]);
    await board("2027-02-05", full);
    await expect(rank("2027-02-05")).rejects.toMatchObject({ response: { code: "DAILY_RANKING_SETUP_REQUIRED", missingDate: "2027-02-04" } });
  });

  it("ignores old heads on the first generated day and never retrofits old replay days", async () => {
    await prisma.dailyBoard.update({ where: { storeId_businessDate: { storeId, businessDate: new Date("2027-01-31") } }, data: { rankingExplanation: { schemaVersion: 2, generatedAt: "2027-01-31", entries: [] } } });
    await reorder("2027-01-31", [k, a, b, c, d]);
    await board("2027-02-01", full);
    const first = await rank("2027-02-01");
    expect(first.fullTimeOrder).toEqual([b, c, d, a]);
    expect(explanation(first)).toMatchObject({ schemaVersion: 3, fullTimeRotation: { rule: "LEGACY_ONE_STEP" } });
    expect(explanation(await read("2027-01-31")).schemaVersion).toBe(2);
    await board("2027-02-02", full);
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual([c, d, a, b]);
  });

  it("does not skip an unranked working day to reuse an older new-rule head", async () => {
    await start([b, c, d]);
    await board("2027-02-02", full);
    await board("2027-02-03", full);
    const result = await rank("2027-02-03");
    expect(result.fullTimeOrder).toEqual([c, d, a, b]); // Both unmarked days use one step.
    expect(explanation(result).fullTimeRotation?.rule).toBe("LEGACY_ONE_STEP");
  });

  it("lets a saved manual anchor override head rotation while retaining leave return rules", async () => {
    await start([b, c, d]);
    const removed = (await read("2027-02-01")).rows.find(row => row.membershipId === c)!;
    await at("2027-02-01", () => boards.removeRow(actor, storeId, "2027-02-01", removed.id, { version: removed.version }, randomUUID(), randomUUID()));
    await board("2027-02-02", full);
    const config = await at("2027-02-02", () => boards.getWeeklyDispatch(actor, storeId, "2027-02-02"));
    await at("2027-02-02", () => boards.saveWeeklyDispatch(actor, storeId, { version: config.version, schedule: { monday: full, tuesday: full, wednesday: full, thursday: full, friday: full, saturday: full, sunday: full }, businessDate: "2027-02-02", boardVersion: config.boardVersion, fullTimeOrder: [b, c, a, d] }, randomUUID(), randomUUID()));
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([b, a, d, c]);
    expect(explanation(result).fullTimeRotation?.rule).toBe("MANUAL_ORDER");
  });

  it("places the previous full-time head after leave returners", async () => {
    await start([b, c, d]);
    const row = (await read("2027-02-01")).rows.find(row => row.membershipId === c)!;
    await at("2027-02-01", () => boards.removeRow(actor, storeId, "2027-02-01", row.id, { version: row.version }, randomUUID(), randomUUID()));
    await board("2027-02-02", full);
    const result = await rank("2027-02-02");
    expect(result.fullTimeOrder).toEqual([d, a, c, b]);
    expect(explanation(result).entries.find(entry => entry.membershipId === c)?.leaveStartDate).toBe("2027-02-01");
  });

  it("matches weekly order reads, future automatic generation and explicit regeneration", async () => {
    await start([b, c, d]);
    const expected = [c, d, a, b];
    const preview = await at("2027-02-01", () => boards.getWeeklyDispatch(actor, storeId, "2027-02-02"));
    expect(preview.fullTimeOrder).toEqual(expected);
    expect(await prisma.dailyBoard.count({ where: { storeId, businessDate: new Date("2027-02-02") } })).toBe(0);
    await at("2027-02-01", () => boards.applyWeeklyDispatch(actor, storeId, "2027-02-02", randomUUID()));
    const automatic = await read("2027-02-02");
    expect(automatic.fullTimeOrder).toEqual(expected);
    expect(await at("2027-02-01", () => boards.applyWeeklyDispatch(actor, storeId, "2027-02-02", randomUUID()))).toEqual({ applied: false });
    expect(await read("2027-02-02")).toEqual(automatic);
    const explicit = await rank("2027-02-02", "2027-02-01");
    expect(explicit.fullTimeOrder).toEqual(automatic.fullTimeOrder);
    expect(explanation(explicit).fullTimeRotation).toEqual(explanation(automatic).fullTimeRotation);
  });

  it("uses the final restored head after an order change is undone", async () => {
    await start();
    await reorder("2027-02-01", [c, d, a, b]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { storeId, action: "board.rows_reordered" } });
    await at("2027-02-01", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    await board("2027-02-02", full);
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual([b, c, d, a]);
  });

  it("undoes new-rule generation and regenerates the same order without consuming another turn", async () => {
    await start([b, c, d]);
    await board("2027-02-02", full);
    const result = await rank("2027-02-02");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { storeId, entityId: result.id, action: "board.rows_ranked" } });
    await at("2027-02-02", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    expect((await read("2027-02-02")).rankingExplanation).toBeNull();
    expect((await rank("2027-02-02")).fullTimeOrder).toEqual(result.fullTimeOrder);
  });

  it("preserves reference-head IDs, types and prefix order through actual anonymized import", async () => {
    await start([b, c, d]);
    await board("2027-02-02", full);
    const result = await rank("2027-02-02");
    const basis = explanation(result).fullTimeRotation!;
    const backup = await storeData.export(actor, storeId, "anonymized");
    const preview = await storeData.preview(actor, storeId, backup);
    await storeData.export(actor, storeId, "full", preview.previewId);
    await storeData.confirm(actor, storeId, { backup, previewId: preview.previewId, confirmName: preview.targetName }, randomUUID(), randomUUID());
    const imported = await read("2027-02-02");
    const mapped = explanation(imported).fullTimeRotation!;
    expect(mapped.rule).toBe(basis.rule);
    expect(mapped.referenceHead).toMatchObject({ businessDate: "2027-02-01", employmentType: "FULL_TIME" });
    expect(mapped.referenceHead!.membershipId).not.toBe(b);
    expect(mapped.movedMembershipIds.at(-1)).toBe(mapped.referenceHead!.membershipId);
    expect(mapped.referenceHead!.displayName).not.toBe("B");
    expect((await fullTimeContext(prisma, storeId, "2027-02-02")).order).toEqual(imported.fullTimeOrder);
  });
});
