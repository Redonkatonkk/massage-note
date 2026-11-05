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
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { StoreDataService } from "../src/store-data/store-data.service.js";
import { anonymizeBackup, remapBackupData, validateBackup } from "../src/store-data/store-backup.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const ranking = new DailyRankingService(access, idempotency);
const audit = new AuditService(prisma, access, idempotency);
const records = new WorkRecordsService(prisma, access, idempotency);
const storeId = randomUUID(), userId = randomUUID(), ownerId = randomUUID();
const [a, b, c, d, part] = Array.from({ length: 5 }, () => randomUUID()) as [string, string, string, string, string];
const full = [a, b, c, d], all = [...full, part];
const actor = { id: userId } as User;
const at = <T>(date: string, fn: () => T) => deviceTimeContext.run({ timezone: "UTC", now: new Date(`${date}T12:00:00Z`) }, fn);
const schedule = () => ({ monday: all, tuesday: all, wednesday: all, thursday: all, friday: all, saturday: all, sunday: all });
const read = (date: string) => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(date) } }, include: { rows: { orderBy: { position: "asc" } } } });
async function board(date: string, ids = all, anchor?: string[]) {
  return prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(date), ...(anchor ? { fullTimeOrderOverride: anchor } : {}), rows: { create: ids.map((membershipId, index) => ({ storeId, membershipId, position: index + 1, addedBy: userId })) } } });
}
async function rank(date: string, now = date) {
  const current = await read(date);
  return at(now, () => ranking.rank(actor, storeId, date, { version: current.version }, randomUUID(), randomUUID()));
}
async function remove(date: string, membershipId: string, hidden = false, now = date) {
  const row = (await read(date)).rows.find(row => row.membershipId === membershipId)!;
  await at(now, () => hidden
    ? boards.updateRow(actor, storeId, date, row.id, { version: row.version, isHidden: true }, randomUUID(), randomUUID())
    : boards.removeRow(actor, storeId, date, row.id, { version: row.version }, randomUUID(), randomUUID()));
  return prisma.auditLog.findFirstOrThrow({ where: { storeId, entityId: row.id, action: { in: ["board.row_hidden", "board.row_removed"] } }, orderBy: { createdAt: "desc" } });
}
async function save(date: string, order?: string[], weekly = schedule()) {
  const config = await at(date, () => boards.getWeeklyDispatch(actor, storeId, date));
  return at(date, () => boards.saveWeeklyDispatch(actor, storeId, {
    version: config.version, schedule: weekly,
    ...(order ? { businessDate: date, boardVersion: config.boardVersion, fullTimeOrder: order } : {}),
  }, randomUUID(), randomUUID()));
}
const explanation = (value: { rankingExplanation: unknown }) => rankingExplanationSchema.parse(value.rankingExplanation);

describe.skipIf(!enabled).sequential("full-time leave returns", () => {
  beforeEach(async () => {
    await prisma.user.create({ data: { id: userId, firebaseUid: `leave-${userId}`, phoneE164: `+1917${randomInt(10000000, 99999999)}` } });
    await prisma.store.create({ data: { id: storeId, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: "Leave rotation", timezone: "UTC", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE", automaticDispatchEnabled: true, weeklyDispatchJson: schedule(), weeklyDispatchEffectiveFrom: new Date("2027-01-01") } });
    await prisma.storeMembership.createMany({ data: [{ id: ownerId, storeId, userId, role: "OWNER", isServiceProvider: false, displayName: "Owner", displayNameNormalized: "owner" }, ...all.map((id, index) => ({ id, storeId, role: "EMPLOYEE" as const, employmentType: id === part ? "PART_TIME" as const : "FULL_TIME" as const, displayName: `Staff ${index}`, displayNameNormalized: `staff ${index}`, joinedAt: new Date("2026-01-01") }))] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerId } });
  });
  afterEach(async () => {
    await prisma.storeDataImportPreview.deleteMany({ where: { storeId } });
    await prisma.auditLog.deleteMany({ where: { storeId } });
    await prisma.domainOutbox.deleteMany({ where: { storeId } });
    await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
    await prisma.businessDayClosing.deleteMany({ where: { storeId } });
    await prisma.workRecordServiceSnapshot.deleteMany({ where: { workRecord: { storeId } } });
    await prisma.workRecord.deleteMany({ where: { storeId } });
    await prisma.shift.deleteMany({ where: { storeId } });
    await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
    await prisma.dailyBoard.deleteMany({ where: { storeId } });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
    await prisma.storeMembership.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.user.delete({ where: { id: userId } });
  });
  afterAll(() => prisma.$disconnect());

  it("keeps continuous leave pending across rest days and continues from the changed queue once", async () => {
    await board("2027-01-04", all, full);
    expect((await remove("2027-01-04", a)).afterJson).toMatchObject({ isFullTimeLeave: true });
    await board("2027-01-05");
    await remove("2027-01-05", a);
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([b, c, d, a]);
    await save("2027-01-05", undefined, { ...schedule(), wednesday: [b, c, d, part] });
    await board("2027-01-06", [b, c, d, part]);
    await rank("2027-01-06");
    await board("2027-01-07");
    const returned = await rank("2027-01-07");
    expect(returned.fullTimeOrder).toEqual([d, b, c, a]);
    expect(explanation(returned).entries.find(entry => entry.membershipId === a)?.leaveStartDate).toBe("2027-01-04");
    expect((await rank("2027-01-07")).fullTimeOrder).toEqual(returned.fullTimeOrder);
    await board("2027-01-08");
    const next = await rank("2027-01-08");
    expect(next.fullTimeOrder).toEqual([b, c, a, d]);
    expect(explanation(next).entries.every(entry => !entry.leaveStartDate)).toBe(true);
  });

  it("keeps simultaneous returners in rotated relative order behind resting full-time staff", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", a);
    await remove("2027-01-04", b);
    await board("2027-01-05", [a, b, c, part]);
    const result = await rank("2027-01-05");
    expect(result.fullTimeOrder).toEqual([c, d, b, a]);
    expect(result.rows.filter(row => full.includes(row.membershipId)).map(row => row.membershipId)).toEqual([c, b, a]);
  });

  it("cancels leave when a removed employee is added back on the same day", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", b);
    await at("2027-01-04", () => boards.addRow(actor, storeId, "2027-01-04", { membershipId: b }, randomUUID(), randomUUID()));
    await board("2027-01-05");
    const result = await rank("2027-01-05");
    expect(result.fullTimeOrder).toEqual([b, c, d, a]);
    expect(explanation(result).entries.every(entry => !entry.leaveStartDate)).toBe(true);
  });

  it.each([false, true])("handles hiding an employee with work records, restored=%s", async restored => {
    await board("2027-01-04", all, full);
    const record = await at("2027-01-04", () => records.create(actor, storeId, { employeeMembershipId: b, startAt: "2027-01-04T14:00:00Z", customService: { name: "Massage", shortName: "M", amountCents: 10000, durationMinutes: 60 } }, randomUUID(), randomUUID()));
    const before = await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } });
    const log = await remove("2027-01-04", b, true);
    expect(log.action).toBe("board.row_hidden");
    expect(log.afterJson).toMatchObject({ isFullTimeLeave: true, removed: false });
    if (restored) {
      const row = (await read("2027-01-04")).rows.find(row => row.membershipId === b)!;
      await at("2027-01-04", () => boards.updateRow(actor, storeId, "2027-01-04", row.id, { version: row.version, isHidden: false }, randomUUID(), randomUUID()));
    }
    await board("2027-01-05");
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual(restored ? [b, c, d, a] : [c, d, a, b]);
    expect(await prisma.workRecord.findUnique({ where: { id: record.id } })).toEqual(before);
  });

  it("applies leave after the return date's saved manual order without reordering during save", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", a);
    await remove("2027-01-04", b);
    await board("2027-01-05");
    const before = await read("2027-01-05");
    await save("2027-01-05", [a, c, b, d]);
    const saved = await read("2027-01-05");
    expect(saved.rows).toEqual(before.rows);
    expect(saved.rankingPending).toBe(true);
    expect((await at("2027-01-05", () => boards.getWeeklyDispatch(actor, storeId, "2027-01-05"))).fullTimeOrder).toEqual([c, d, a, b]);
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([c, d, a, b]);
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([c, d, a, b]);
  });

  it("carries pending leave across an intermediate manual anchor and freezes its qualification", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", a);
    await board("2027-01-05", [b, c, d, part]);
    await save("2027-01-05", [d, a, c, b], { ...schedule(), monday: [] });
    await rank("2027-01-05");
    await board("2027-01-06");
    expect((await rank("2027-01-06")).fullTimeOrder).toEqual([c, b, d, a]);
  });

  it("shares the rule between future automatic initialization and explicit regeneration", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", b);
    await at("2027-01-04", () => boards.applyWeeklyDispatch(actor, storeId, "2027-01-05", randomUUID()));
    const automatic = await read("2027-01-05");
    expect(automatic.fullTimeOrder).toEqual([c, d, a, b]);
    expect(explanation(automatic).entries.find(entry => entry.membershipId === b)?.leaveStartDate).toBe("2027-01-04");
    expect(await at("2027-01-04", () => boards.applyWeeklyDispatch(actor, storeId, "2027-01-05", randomUUID()))).toEqual({ applied: false });
    expect((await rank("2027-01-05", "2027-01-04")).fullTimeOrder).toEqual(automatic.fullTimeOrder);
  });

  it("records a future manual removal without immediately reordering the board", async () => {
    await board("2027-01-04", all, full);
    await board("2027-01-05");
    expect((await remove("2027-01-05", c, false, "2027-01-04")).afterJson).toMatchObject({ isFullTimeLeave: true });
    expect((await read("2027-01-05")).rankedAt).toBeNull();
    await board("2027-01-06");
    expect((await rank("2027-01-06", "2027-01-04")).fullTimeOrder).toEqual([d, a, b, c]);
  });

  it.each(["rest", "part-time", "unconfigured", "not-effective", "past"])("does not infer leave for %s removals", async kind => {
    await board("2027-01-04", all, full);
    if (kind === "rest") await prisma.store.update({ where: { id: storeId }, data: { weeklyDispatchJson: { ...schedule(), monday: [a, c, d, part] } } });
    if (kind === "unconfigured") await prisma.store.update({ where: { id: storeId }, data: { weeklyDispatchEffectiveFrom: null } });
    if (kind === "not-effective") await prisma.store.update({ where: { id: storeId }, data: { weeklyDispatchEffectiveFrom: new Date("2027-01-05") } });
    const log = await remove("2027-01-04", kind === "part-time" ? part : b, kind === "past", kind === "past" ? "2027-01-05" : "2027-01-04");
    expect(log.afterJson).not.toHaveProperty("isFullTimeLeave");
    await board("2027-01-05");
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([b, c, d, a]);
  });

  it("ignores old removal audits without a new leave marker", async () => {
    await board("2027-01-04", [a, c, d, part], full);
    await prisma.auditLog.create({ data: { storeId, source: "api", action: "board.row_removed", entityType: "daily_employee_row", entityId: randomUUID(), businessDate: new Date("2027-01-04"), beforeJson: { membershipId: b }, afterJson: { boardVersion: 2 }, requestId: randomUUID() } });
    await board("2027-01-05");
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([b, c, d, a]);
  });

  it("excludes undone leave even when a later rest-day removal leaves the employee absent", async () => {
    await board("2027-01-04", all, full);
    const log = await remove("2027-01-04", b);
    await at("2027-01-04", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    await save("2027-01-04", undefined, { ...schedule(), monday: [a, c, d, part] });
    expect((await remove("2027-01-04", b)).afterJson).not.toHaveProperty("isFullTimeLeave");
    await board("2027-01-05");
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([b, c, d, a]);
  });

  it("restores pending leave when undoing a same-day addition", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", b);
    const added = await at("2027-01-04", () => boards.addRow(actor, storeId, "2027-01-04", { membershipId: b }, randomUUID(), randomUUID()));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { storeId, entityId: added.row.id, action: "board.row_added" } });
    await at("2027-01-04", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    await board("2027-01-05");
    expect((await rank("2027-01-05")).fullTimeOrder).toEqual([c, d, a, b]);
  });

  it("preserves qualification and explanation dates through backup, anonymization and import mapping", async () => {
    await board("2027-01-04", all, full);
    await remove("2027-01-04", b);
    await board("2027-01-05");
    await rank("2027-01-05");
    const backup = await new StoreDataService(prisma, access).export(actor, storeId, "full");
    const demo = validateBackup(anonymizeBackup(backup));
    const mapped = remapBackupData(demo, randomUUID(), randomUUID());
    const signal = mapped.tables.auditLog.find(row => (row.afterJson as { isFullTimeLeave?: boolean } | null)?.isFullTimeLeave);
    expect(signal).toBeDefined();
    const mappedId = (signal!.beforeJson as { membershipId: string }).membershipId;
    expect(mappedId).not.toBe(b);
    expect(mapped.tables.storeMembership.some(row => row.id === mappedId)).toBe(true);
    const returned = mapped.tables.dailyBoard.find(row => String(row.businessDate).startsWith("2027-01-05"))!;
    expect(explanation(returned as { rankingExplanation: unknown }).entries.find(entry => entry.membershipId === mappedId)?.leaveStartDate).toBe("2027-01-04");
    expect((await fullTimeContext(prisma, storeId, "2027-01-05")).order).toEqual([c, d, a, b]);
  });

  it("keeps undone leave cancelled after exporting, anonymizing and actually importing the backup", async () => {
    await board("2027-01-04", all, full);
    const log = await remove("2027-01-04", b);
    await at("2027-01-04", () => audit.undo(actor, storeId, log.id, randomUUID(), randomUUID()));
    await save("2027-01-04", undefined, { ...schedule(), monday: [a, c, d, part] });
    await remove("2027-01-04", b);
    await board("2027-01-05");
    const service = new StoreDataService(prisma, access);
    const backup = await service.export(actor, storeId, "anonymized");
    const signal = backup.data.tables.auditLog.find(row => (row.afterJson as { isFullTimeLeave?: boolean } | null)?.isFullTimeLeave);
    expect(signal?.afterJson).toMatchObject({ isFullTimeLeave: true, isFullTimeLeaveUndone: true });
    const preview = await service.preview(actor, storeId, backup);
    await service.export(actor, storeId, "full", preview.previewId);
    await service.confirm(actor, storeId, { backup, previewId: preview.previewId, confirmName: preview.targetName }, randomUUID(), randomUUID());
    const anchor = (await read("2027-01-04")).fullTimeOrderOverride as string[];
    expect((await fullTimeContext(prisma, storeId, "2027-01-05")).order).toEqual([...anchor.slice(1), anchor[0]]);
  });
});
