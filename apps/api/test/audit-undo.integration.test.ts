import { randomInt, randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { confirmPaymentSchema } from "@massage-note/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../src/audit/audit.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { LostCustomersService } from "../src/lost-customers/lost-customers.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import { BoardsService } from "../src/boards/boards.service.js";
import { deviceTimeContext } from "../src/common/device-time.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const audit = new AuditService(prisma, access, idempotency);
const records = new WorkRecordsService(prisma, access, idempotency);
const lost = new LostCustomersService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const cash = new CashSettlementsService(prisma, access, idempotency);
const boards = new BoardsService(prisma, access, idempotency);
const stores = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID(), randomUUID()];
const members = [randomUUID(), randomUUID(), randomUUID()];
const actor = { id: users[0]! } as User;
const storeId = stores[0]!;
async function entry(entityId: string, action: string) {
  return prisma.auditLog.findFirstOrThrow({ where: { storeId, entityId, action }, orderBy: { createdAt: "desc" } });
}
async function createRecord(day: string) {
  return records.create(actor, storeId, { employeeMembershipId: members[1]!, startAt: `${day}T14:00:00Z`, customService: { name: "Massage", shortName: "M", amountCents: 10000, durationMinutes: 60 } }, randomUUID(), randomUUID());
}

describe.skipIf(!enabled).sequential("operation undo", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map(id => ({ id, firebaseUid: `undo-${id}`, phoneE164: `+1917${randomInt(10_000_000, 99_000_000)}` })) });
    for (const id of stores) {
      await prisma.store.create({ data: { id, storeCode: randomInt(0, 1000000).toString().padStart(6, "0"), name: "Undo test", timezone: "America/New_York", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE" } });
      await prisma.storeMembership.create({ data: { ...(id === storeId ? { id: members[0]! } : {}), storeId: id, userId: actor.id, role: "OWNER", displayName: "Owner", displayNameNormalized: "owner" } });
    }
    await prisma.storeMembership.createMany({ data: [
      { id: members[1]!, storeId, userId: users[1]!, role: "EMPLOYEE", displayName: "Employee", displayNameNormalized: "employee" },
      { id: members[2]!, storeId, userId: users[2]!, role: "MANAGER", displayName: "Manager", displayNameNormalized: "manager" },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: members[0]! } });
  });
  afterAll(async () => {
    if (enabled) {
      await prisma.auditLog.deleteMany({ where: { storeId: { in: stores } } });
      await prisma.domainOutbox.deleteMany({ where: { storeId: { in: stores } } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId: { in: stores } } });
      await prisma.employeeClosingDelivery.deleteMany({ where: { storeId } });
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.paymentBreakdown.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecordServiceSnapshot.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecordAddonSnapshot.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecordDiscountSnapshot.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.lostCustomer.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.shift.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({ where: { id: { in: stores } }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId: { in: stores } } });
      await prisma.store.deleteMany({ where: { id: { in: stores } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await prisma.$disconnect();
  });

  it("soft-deletes a new record with its complete snapshots retained and replays safely", async () => {
    const record = await createRecord("2026-09-01");
    const original = await entry(record.id, "work_record.created_with_custom_service");
    expect((await audit.list(actor, storeId, { limit: 100 })).items.find(row => row.id === original.id)?.undo.available).toBe(true);
    const key = randomUUID();
    const result = await audit.undo(actor, storeId, original.id, key, randomUUID());
    expect(await audit.undo(actor, storeId, original.id, key, randomUUID())).toEqual(result);
    expect(await audit.undo(actor, storeId, original.id, randomUUID(), randomUUID())).toEqual(result);
    expect(await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ deletedAt: expect.any(Date), version: record.version + 1 });
    expect(await prisma.workRecordServiceSnapshot.count({ where: { workRecordId: record.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { storeId, id: original.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { storeId, action: "audit.undone", entityId: original.id } })).toBe(1);
    expect((await audit.list(actor, storeId, { limit: 100 })).items.find(row => row.id === original.id)?.undo.undone).toBe(true);
    expect(await prisma.domainOutbox.findFirst({ where: { storeId, aggregateType: "audit_operation", aggregateId: original.id } })).not.toBeNull();
  });

  it("restores detail and child snapshots together, with monotonically increasing versions", async () => {
    const original = await createRecord("2026-09-02");
    const changed = await records.update(actor, storeId, original.id, { version: original.version, mainServiceAmountCents: 12000, note: "Changed", addons: [{ isCustom: true, name: "Addon", shortName: "A", amountCents: 1500, commissionBps: 5000 }] }, randomUUID(), randomUUID());
    const operation = await entry(original.id, "work_record.updated");
    await audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID());
    const restored = await prisma.workRecord.findUniqueOrThrow({ where: { id: original.id }, include: { serviceSnapshot: true, addonSnapshots: true } });
    expect(restored).toMatchObject({ mainServiceAmountCents: 10000n, note: "", version: changed.version + 1, addonSnapshots: [] });
    expect(restored.serviceSnapshot!.amountCents).toBe(10000n);
  });

  it("reverses all entries of a detailed submission together and preserves its final snapshots", async () => {
    const record = await records.createDetailed(actor, storeId, {
      create: { employeeMembershipId: members[1]!, startAt: "2026-09-06T14:00:00Z", customService: { name: "Massage", shortName: "M", amountCents: 10000, durationMinutes: 60 } },
      details: { version: 1, note: "Detailed submission", addons: [{ isCustom: true, name: "Addon", shortName: "A", amountCents: 1500, commissionBps: 5000 }] },
    }, randomUUID(), randomUUID());
    const original = await entry(record.id, "work_record.created_with_custom_service");
    const details = await entry(record.id, "work_record.updated");
    const result = await audit.undo(actor, storeId, details.id, randomUUID(), randomUUID());
    expect(await audit.undo(actor, storeId, original.id, randomUUID(), randomUUID())).toEqual(result);
    expect(await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ deletedAt: expect.any(Date), note: "Detailed submission" });
    expect(await prisma.workRecordAddonSnapshot.count({ where: { workRecordId: record.id } })).toBe(1);
  });

  it("restores a deleted paid record and its automatic cash reopening in one transaction", async () => {
    const day = "2026-09-11";
    const created = await createRecord(day);
    const paid = await records.confirmPayment(actor, storeId, created.id, confirmPaymentSchema.parse({ version: created.version, cashServiceCents: 10000, cashTipCents: 1000 }), randomUUID(), randomUUID());
    await cash.settle(actor, storeId, day, members[1]!, { version: 0 }, randomUUID(), randomUUID());
    await records.remove(actor, storeId, paid.id, { version: paid.version }, randomUUID(), randomUUID());
    const operation = await entry(paid.id, "work_record.deleted");
    expect((await prisma.dailyCashSettlement.findFirstOrThrow({ where: { storeId, businessDate: new Date(`${day}T00:00:00Z`) } })).status).toBe("UNSETTLED");
    await audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID());
    expect(await prisma.workRecord.findUniqueOrThrow({ where: { id: paid.id }, include: { payment: true } })).toMatchObject({ deletedAt: null, status: "CONFIRMED", payment: { cashServiceCents: 10000n, cashTipCents: 1000n } });
    const settlement = await prisma.dailyCashSettlement.findFirstOrThrow({ where: { storeId, businessDate: new Date(`${day}T00:00:00Z`) } });
    expect(settlement.status).toBe("SETTLED");
    await audit.undo(actor, storeId, (await entry(settlement.id, "cash_settlement.settled")).id, randomUUID(), randomUUID());
    const reopened = (await cash.list(actor, storeId, day)).rows.find(row => row.membershipId === members[1])!;
    expect(reopened.status).toBe("UNSETTLED");
    await expect(cash.settle(actor, storeId, day, members[1]!, { version: reopened.version }, randomUUID(), randomUUID())).resolves.toMatchObject({ status: "SETTLED" });
  });

  it("cancels a closing and its unclaimed queue together, and protects claimed jobs", async () => {
    await prisma.storeMembership.update({ where: { id: members[1]! }, data: { closingDeliveryEnabled: true } });
    for (const [day, claimed] of [["2026-09-07", false], ["2026-09-08", true]] as const) {
      await createRecord(day);
      const closed = await closings.close(actor, storeId, day, { force: true, forceReason: "Undo test" }, randomUUID(), randomUUID());
      const operation = await entry(closed.closing.id, "business_day.force_closed");
      const job = await prisma.employeeClosingDelivery.findFirstOrThrow({ where: { storeId, closingId: closed.closing.id } });
      if (claimed) {
        await prisma.employeeClosingDelivery.update({ where: { id: job.id }, data: { status: "CLAIMED", leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) } });
        await expect(audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
        expect((await prisma.businessDayClosing.findUniqueOrThrow({ where: { id: closed.closing.id } })).status).toBe("CLOSED");
      } else {
        await audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID());
        expect((await prisma.businessDayClosing.findUniqueOrThrow({ where: { id: closed.closing.id } })).status).toBe("CANCELLED");
        expect((await prisma.employeeClosingDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
      }
    }
    await prisma.storeMembership.update({ where: { id: members[1]! }, data: { closingDeliveryEnabled: false } });
  });

  it("allows financial undo after a later operation was itself undone", async () => {
    const original = await prisma.$transaction(async tx => {
      const closing = await tx.businessDayClosing.create({ data: { storeId, businessDate: new Date("2026-09-09T00:00:00Z"), cycleNo: 1, status: "CANCELLED", closedBy: actor.id, warningSnapshotJson: [], totalsSnapshotJson: {} } });
      return tx.auditLog.create({ data: { storeId, action: "business_day.closing_cancelled", entityType: "business_day_closing", entityId: closing.id, source: "api", requestId: randomUUID() } });
    });
    const value = await lost.create(actor, storeId, { businessDate: "2026-09-09", occurredTime: "12:00", customerCount: 1, isWalkIn: false }, randomUUID(), randomUUID());
    await expect(audit.undo(actor, storeId, original.id, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
    await audit.undo(actor, storeId, (await entry(value.id, "lost_customer.created")).id, randomUUID(), randomUUID());
    await expect(audit.undo(actor, storeId, original.id, randomUUID(), randomUUID())).resolves.toMatchObject({ undone: true });
  });

  it("keeps undone schedule applications, removals and ordering stable across automatic refresh", async () => {
    const at = <T>(action: () => Promise<T>) => deviceTimeContext.run({ timezone: "America/New_York", now: new Date("2026-11-01T16:00:00Z") }, action);
    await prisma.storeMembership.updateMany({ where: { id: { in: [members[0]!, members[1]!] } }, data: { employmentType: "FULL_TIME" } });
    await prisma.store.update({ where: { id: storeId }, data: { automaticDispatchEnabled: true, weeklyDispatchEffectiveFrom: new Date("2026-11-01T00:00:00Z"), weeklyDispatchJson: { monday: [members[0]!, members[1]!], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } });
    const firstDay = "2026-11-02", secondDay = "2026-11-09";
    const read = (day: string) => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${day}T00:00:00Z`) } }, include: { rows: { orderBy: { position: "asc" } } } });
    await at(() => boards.applyWeeklyDispatch(actor, storeId, firstDay, randomUUID()));
    const first = await read(firstDay);
    await at(async () => audit.undo(actor, storeId, (await entry(first.id, "board.weekly_dispatch_applied")).id, randomUUID(), randomUUID()));
    expect(await at(() => boards.applyWeeklyDispatch(actor, storeId, firstDay, randomUUID()))).toEqual({ applied: false });
    expect((await read(firstDay)).rows).toHaveLength(0);

    await at(() => boards.applyWeeklyDispatch(actor, storeId, secondDay, randomUUID()));
    const second = await read(secondDay), row = second.rows.find(value => value.membershipId === members[1])!;
    await at(() => boards.removeRow(actor, storeId, secondDay, row.id, { version: row.version }, randomUUID(), randomUUID()));
    const removed = await entry(row.id, "board.row_removed");
    await at(() => audit.undo(actor, storeId, removed.id, randomUUID(), randomUUID()));
    await at(() => boards.applyWeeklyDispatch(actor, storeId, secondDay, randomUUID()));
    const restored = await read(secondDay);
    expect(restored.rows.map(value => value.membershipId)).toContain(members[1]);
    await at(() => boards.reorder(actor, storeId, secondDay, { version: restored.version, rowIds: restored.rows.map(value => value.id).reverse() }, randomUUID(), randomUUID()));
    const reordered = await entry(restored.id, "board.rows_reordered");
    await at(() => audit.undo(actor, storeId, reordered.id, randomUUID(), randomUUID()));
    await at(() => boards.applyWeeklyDispatch(actor, storeId, secondDay, randomUUID()));
    expect((await read(secondDay)).rows.map(value => value.membershipId)).toEqual(restored.rows.map(value => value.membershipId));
    await prisma.store.update({ where: { id: storeId }, data: { automaticDispatchEnabled: false, weeklyDispatchEffectiveFrom: null } });
  });

  it("rejects later changes atomically, employee access and cross-store IDs", async () => {
    const value = await lost.create(actor, storeId, { businessDate: "2026-09-03", occurredTime: "12:00", customerCount: 1, isWalkIn: false }, randomUUID(), randomUUID());
    const first = await lost.update(actor, storeId, value.id, { version: value.version, occurredTime: "13:00", note: "First" }, randomUUID(), randomUUID());
    const operation = await entry(value.id, "lost_customer.updated");
    await lost.update(actor, storeId, value.id, { version: first.version, occurredTime: "14:00", note: "Later" }, randomUUID(), randomUUID());
    await expect(audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
    expect((await prisma.lostCustomer.findUniqueOrThrow({ where: { id: value.id } })).note).toBe("Later");
    expect(await prisma.auditUndo.count({ where: { auditLogId: operation.id } })).toBe(0);
    await expect(audit.undo({ id: users[1]! } as User, storeId, operation.id, randomUUID(), randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(audit.undo(actor, stores[1]!, operation.id, randomUUID(), randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  it("serializes concurrent undo requests without duplicate reversal", async () => {
    const value = await lost.create(actor, storeId, { businessDate: "2026-09-12", occurredTime: "12:00", customerCount: 1, isWalkIn: false }, randomUUID(), randomUUID());
    const operation = await entry(value.id, "lost_customer.created");
    const results = await Promise.allSettled([audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID()), audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID())]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 409 });
    expect(await prisma.auditUndo.count({ where: { storeId, auditLogId: operation.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { storeId, action: "audit.undone", entityId: operation.id } })).toBe(1);
  });

  it("protects later work records when undo would remove unchanged attendance rows", async () => {
    const clocked = await boards.clockIn(actor, storeId, randomUUID(), randomUUID());
    const day = clocked.shift.businessDate.toISOString().slice(0, 10);
    const record = await records.create(actor, storeId, { employeeMembershipId: members[0]!, startAt: `${day}T14:00:00Z`, customService: { name: "Massage", shortName: "M", amountCents: 10000, durationMinutes: 60 } }, randomUUID(), randomUUID());
    const clockIn = await entry(clocked.shift.id, "shift.clocked_in");
    await expect(audit.undo(actor, storeId, clockIn.id, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
    expect(await prisma.dailyEmployeeRow.findUnique({ where: { id: clocked.row.id } })).not.toBeNull();
    await audit.undo(actor, storeId, (await entry(record.id, "work_record.created_with_custom_service")).id, randomUUID(), randomUUID());
    await expect(audit.undo(actor, storeId, clockIn.id, randomUUID(), randomUUID())).resolves.toMatchObject({ undone: true });
    expect((await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } })).deletedAt).not.toBeNull();
  });

  it("requires reopening a closed day before undo", async () => {
    const value = await lost.create(actor, storeId, { businessDate: "2026-09-04", occurredTime: "12:00", customerCount: 1, isWalkIn: false }, randomUUID(), randomUUID());
    const operation = await entry(value.id, "lost_customer.created");
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date("2026-09-04T00:00:00Z"), cycleNo: 1, status: "CLOSED", closedBy: actor.id, warningSnapshotJson: [], totalsSnapshotJson: {} } });
    await expect(audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID())).rejects.toMatchObject({ response: { code: "AUDIT_UNDO_CONFLICT" } });
    expect((await prisma.lostCustomer.findUniqueOrThrow({ where: { id: value.id } })).deletedAt).toBeNull();
  });

  it("preserves integer precision and blocks managers from reversing owner changes", async () => {
    const operation = await prisma.$transaction(async tx => {
      await tx.store.update({ where: { id: storeId }, data: { mondayThursdayAutoDiscountThresholdCents: 9007199254740993n } });
      return tx.auditLog.create({ data: { storeId, action: "store.settings_updated", entityType: "store", entityId: storeId, source: "api", requestId: randomUUID() } });
    });
    await audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID());
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).mondayThursdayAutoDiscountThresholdCents).toBe(0n);
    const protectedOperation = await prisma.$transaction(async tx => {
      await tx.storeMembership.update({ where: { id: members[0]! }, data: { displayName: "New owner name", version: { increment: 1 } } });
      return tx.auditLog.create({ data: { storeId, action: "membership.updated", entityType: "store_membership", entityId: members[0]!, source: "api", requestId: randomUUID() } });
    });
    await expect(audit.undo({ id: users[2]! } as User, storeId, protectedOperation.id, randomUUID(), randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("uses existing recovery rules for a legacy deletion and rejects incomplete history", async () => {
    const record = await createRecord("2026-09-05");
    await records.remove(actor, storeId, record.id, { version: record.version }, randomUUID(), randomUUID());
    const operation = await entry(record.id, "work_record.deleted");
    await prisma.auditLogTransaction.delete({ where: { auditLogId: operation.id } });
    await audit.undo(actor, storeId, operation.id, randomUUID(), randomUUID());
    expect((await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } })).deletedAt).toBeNull();
    const incomplete = await prisma.auditLog.create({ data: { storeId, action: "membership.updated", entityType: "store_membership", entityId: members[1]!, source: "api", requestId: randomUUID() } });
    await expect(audit.undo(actor, storeId, incomplete.id, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
  });

  it("works with append-only production privileges without exposing writable journal tables", async () => {
    const role = `undo_test_${randomUUID().replaceAll("-", "")}`;
    const password = randomUUID();
    await prisma.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    const url = new URL(process.env.DATABASE_URL!); url.username = role; url.password = password;
    const restricted = new PrismaService({ datasourceUrl: url.toString() });
    try {
      await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await prisma.$executeRawUnsafe(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, domain_outbox, audit_row_changes, audit_log_transactions, audit_undos FROM "${role}"`);
      await prisma.$executeRawUnsafe(`REVOKE INSERT ON audit_row_changes, audit_log_transactions FROM "${role}"`);
      const restrictedAccess = new StoreAccessService(restricted);
      const operations = new AuditService(restricted, restrictedAccess);
      const walkouts = new LostCustomersService(restricted, restrictedAccess, new IdempotencyService(restricted));
      const value = await walkouts.create(actor, storeId, { businessDate: "2026-09-10", occurredTime: "12:00", customerCount: 1, isWalkIn: false }, randomUUID(), randomUUID());
      const original = await entry(value.id, "lost_customer.created");
      await expect(operations.undo(actor, storeId, original.id, randomUUID(), randomUUID())).resolves.toMatchObject({ undone: true });
      await expect(restricted.auditRowChange.deleteMany({ where: { storeId } })).rejects.toThrow();
      await expect(restricted.auditLog.deleteMany({ where: { storeId } })).rejects.toThrow();
    } finally {
      await restricted.$disconnect();
      await prisma.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
      await prisma.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
  });
});
