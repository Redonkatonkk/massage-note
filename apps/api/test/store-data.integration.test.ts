import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type User } from "@massage-note/database";
import { storeBackupTables, type StoreBackup } from "@massage-note/contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { StoreDataService } from "../src/store-data/store-data.service.js";
import { anonymizeBackup, checksum, delegate, sealBackup, tableScope, validateBackup } from "../src/store-data/store-backup.js";
import { AuditService } from "../src/audit/audit.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const service = new StoreDataService(prisma, access);
const stores = [randomUUID(), randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID(), randomUUID()];
const owners = stores.map(() => randomUUID());
const memberId = randomUUID();
const managerId = randomUUID();
const actor = (id = users[0]!) => ({ id }) as User;
const date = new Date("2026-10-01T00:00:00Z");
const secret = "PRIVATE_" + "PERSON_5829";
let full: StoreBackup;
let demo: StoreBackup;

async function prepare(backup: StoreBackup, target = stores[1]!) {
  const preview = await service.preview(actor(), target, backup);
  await service.export(actor(), target, "full", preview.previewId);
  return { backup, previewId: preview.previewId, confirmName: preview.targetName };
}

describe.skipIf(!enabled).sequential("single-store backup and recovery", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map((id, index) => ({ id, firebaseUid: `store-data-${id}`, phoneE164: `+1917${randomInt(10000000, 99999990) + index}`, firstName: secret, lastName: "Secret", passwordHash: "PRIVATE_PASSWORD" })) });
    for (const [index, id] of stores.entries()) {
      await prisma.store.create({ data: { id, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: `${secret}-${index}`, timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 5000, status: "ACTIVE", workBotInstructions: secret } });
      await prisma.storeMembership.create({ data: { id: owners[index]!, storeId: id, userId: users[0]!, role: "OWNER", displayName: `${secret}-owner`, displayNameNormalized: `${secret}-owner` } });
      await prisma.store.update({ where: { id }, data: { ownerMembershipId: owners[index]! } });
    }
    const storeId = stores[0]!;
    await prisma.storeMembership.createMany({ data: [
      { id: memberId, storeId, userId: users[1]!, role: "EMPLOYEE", displayName: secret, displayNameNormalized: secret.toLowerCase(), closingDeliveryPhoneE164: "+12025550123", closingDeliveryEnabled: true },
      { id: managerId, storeId, userId: users[2]!, role: "MANAGER", displayName: `${secret}-manager`, displayNameNormalized: `${secret}-manager` },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { weeklyDispatchJson: { monday: [memberId], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } });
    const serviceItem = await prisma.serviceItem.create({ data: { storeId, fullName: secret, shortName: secret, durationMinutes: 60, priceCents: 10000n, position: 0 } });
    await prisma.serviceItemPriceOption.create({ data: { id: `10000000-0000-f000-0000-${randomUUID().slice(24)}`, serviceItemId: serviceItem.id, durationMinutes: 60, priceCents: 10000n, position: 0 } });
    const addon = await prisma.addonItem.create({ data: { storeId, name: `${secret}-addon`, shortName: `${secret}-addon`, amountCents: 2000n, position: 0 } });
    const discount = await prisma.discountItem.create({ data: { storeId, name: `${secret}-discount`, shortName: `${secret}-discount`, amountCents: 1000n, position: 0 } });
    await prisma.employeeDefaultCommission.create({ data: { storeId, membershipId: memberId, commissionBps: 6000, effectiveFrom: date, createdBy: users[0]! } });
    await prisma.employeeItemCommission.create({ data: { storeId, membershipId: memberId, itemType: "SERVICE", itemId: serviceItem.id, commissionBps: 5500, effectiveFrom: date, createdBy: users[0]! } });
    await prisma.shift.create({ data: { storeId, membershipId: memberId, businessDate: date, clockInAt: date, createdBy: users[0]!, updatedBy: users[0]! } });
    const board = await prisma.dailyBoard.create({ data: { storeId, businessDate: date, rankingExplanation: { schemaVersion: 1, generatedAt: date.toISOString(), entries: [{ membershipId: memberId, displayName: secret, position: 1 }] } } });
    await prisma.dailyEmployeeRow.create({ data: { storeId, boardId: board.id, membershipId: memberId, position: new Prisma.Decimal("0.0000000001"), addedBy: users[0]! } });
    const work = await prisma.workRecord.create({ data: { storeId, employeeMembershipId: memberId, businessDate: date, startAt: date, status: "CONFIRMED", storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "22:00", mainServiceAmountCents: 10000n, addonTotalCents: 2000n, grossFeeBaseCents: 12000n, discountTotalCents: 1000n, discountedFeePerformanceCents: 11000n, mainServiceWageCents: 5500n, addonWageCents: 1000n, totalLargeFeeWageCents: 6500n, giftCardSerialNumber: "PRIVATE_ONLINE_USER", giftCardIsOnline: true, giftCardServiceCents: 11000n, cashServiceCents: 0n, cardServiceCents: 0n, cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n, totalTipCents: 0n, actualServiceCollectedCents: 11000n, customerTotalPaidCents: 11000n, paymentDifferenceCents: 0n, employeeTotalIncomeCents: 6500n, cashAllocatedServiceWageCents: 0n, cashAcquiredServiceWageCents: 0n, cashWageShortfallCents: 0n, createdBy: users[0]!, updatedBy: users[0]!, note: secret } });
    await prisma.workRecordServiceSnapshot.create({ data: { workRecordId: work.id, sourceServiceItemId: serviceItem.id, isCustom: false, name: secret, shortName: secret, amountCents: 10000n, durationMinutes: 60, commissionBps: 5500, commissionSource: "EMPLOYEE_ITEM", wageCents: 5500n } });
    await prisma.workRecordAddonSnapshot.create({ data: { workRecordId: work.id, sourceAddonItemId: addon.id, isCustom: false, name: `${secret}-addon`, shortName: `${secret}-addon`, amountCents: 2000n, commissionBps: 5000, commissionSource: "STORE_DEFAULT", wageCents: 1000n, position: 0 } });
    await prisma.workRecordDiscountSnapshot.create({ data: { workRecordId: work.id, sourceDiscountItemId: discount.id, isCustom: false, name: `${secret}-discount`, amountCents: 1000n, position: 0 } });
    await prisma.paymentBreakdown.create({ data: { workRecordId: work.id, giftCardSerialNumber: "PRIVATE_ONLINE_USER", giftCardIsOnline: true, giftCardServiceCents: 11000n } });
    await prisma.giftCardSale.create({ data: { storeId, businessDate: date, serialNumber: "PRIVATE_ONLINE_USER", serialNumberNormalized: "private_online_user", isOnline: true, faceValueCents: 11000n, amountCents: 11000n, cardCents: 11000n, operatorMembershipId: memberId, createdBy: users[0]!, updatedBy: users[0]! } });
    await prisma.lostCustomer.create({ data: { storeId, businessDate: date, occurredTime: "12:30", note: memberId, deletedAt: date, createdBy: users[0]!, updatedBy: users[0]! } });
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: date, cycleNo: 1, closedBy: users[0]!, totalsSnapshotJson: { store: { totalIncomeCents: 11000 }, employees: [{ membershipId: memberId, displayName: secret, employeeTotalIncomeCents: 6500 }] }, warningSnapshotJson: [{ messageZh: secret, code: "PENDING_PAYMENT", membershipId: memberId }], forceReason: secret } });
    await prisma.dailyCashSettlement.create({ data: { storeId, membershipId: memberId, businessDate: date, cashServiceCents: 0n, cashTipCents: 0n, cashReceivedCents: 0n, cashAllocatedServiceWageCents: 0n, cashAcquiredServiceWageCents: 0n, cashWageShortfallCents: 0n, cashRetainedCents: 0n, cashToSubmitToStoreCents: 0n, note: secret } });
    const payroll = await prisma.payrollSettlement.create({ data: { storeId, membershipId: memberId, settlementDate: date, periodStart: date, periodEnd: date, serviceWageCents: 6500n, cashTipCents: 0n, cardTipCents: 0n, adjustmentCents: 0n, totalPaidCents: 6500n, paymentMethod: "CASH", createdBy: users[0]!, updatedBy: users[0]!, note: secret } });
    await prisma.payrollSettlementConfirmation.create({ data: { payrollSettlementId: payroll.id, unsettledCents: 6500n, deductionCents: 0n } });
    const expense = await prisma.expenseItem.create({ data: { storeId, name: secret, kind: "RECURRING", createdBy: users[0]!, updatedBy: users[0]!, note: secret } });
    const rule = await prisma.expenseRuleRevision.create({ data: { itemId: expense.id, startDate: date, unit: "MONTH", interval: 1, amountMode: "BUDGET", defaultAmountFrom: date, amountCents: 100000n } });
    await prisma.expensePeriodOverride.create({ data: { ruleId: rule.id, periodStart: date, amountCents: 90000n } });
    await prisma.workBotAlias.create({ data: { storeId, serviceItemId: serviceItem.id, alias: secret, aliasNormalized: secret.toLowerCase(), durationMinutes: 60 } });
    await prisma.auditLog.create({ data: { storeId, actorUserId: users[1]!, actorMembershipId: memberId, source: "ai", action: "work_record.created", entityType: "work_record", entityId: work.id, beforeJson: { displayName: secret, phoneE164: "+12025550123", unknownField: { secret } }, afterJson: { records: [{ employeeMembershipId: memberId, displayName: secret, note: secret, giftCardSerialNumber: "PRIVATE_ONLINE_USER", totalPaidCents: 6500 }] }, reason: secret, requestId: secret } });
    full = await service.export(actor(), storeId, "full");
    demo = await service.export(actor(), storeId, "anonymized");
  });

  afterAll(async () => {
    if (enabled) for (const storeId of stores) {
      await prisma.store.updateMany({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeDataImportPreview.deleteMany({ where: { storeId } });
      await prisma.employeeClosingDelivery.deleteMany({ where: { storeId } });
      await prisma.employeeSettlementDelivery.deleteMany({ where: { storeId } });
      await prisma.closingDeliveryAgent.deleteMany({ where: { storeId } });
      await prisma.workBotGroupBinding.deleteMany({ where: { storeId } });
      for (const table of [...storeBackupTables].reverse()) await delegate(prisma, table).deleteMany({ where: tableScope(table, storeId) });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (enabled) await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it("exports every supported table, preserves precision and masks the entire file", async () => {
    for (const table of storeBackupTables) expect(full.data.tables[table].length, table).toBeGreaterThan(0);
    expect(JSON.stringify(full)).toContain(secret);
    expect(JSON.stringify(full)).not.toContain("PRIVATE_PASSWORD");
    const text = JSON.stringify(demo);
    for (const value of [secret, "+12025550123", "PRIVATE_ONLINE_USER", stores[0]!, memberId, users[0]!, "unknownField"]) expect(text).not.toContain(value);
    expect(validateBackup(demo)).toEqual(demo);
    expect(demo.data.tables.auditLog[0]!.action).toBe(full.data.tables.auditLog[0]!.action);
    expect(demo.data.tables.dailyEmployeeRow[0]!.position).toBe(full.data.tables.dailyEmployeeRow[0]!.position);
    expect(full.data.tables.dailyEmployeeRow[0]!.position).toBe("0.0000000001");
    expect(demo.data.tables.workRecord[0]!.giftCardSerialNumber).toBe(demo.data.tables.giftCardSale[0]!.serialNumber);
    expect(demo.data.tables.workRecordServiceSnapshot[0]!.name).toBe(demo.data.tables.serviceItem[0]!.fullName);
    const member = demo.data.tables.storeMembership.find(row => row.id === demo.data.tables.workRecord[0]!.employeeMembershipId)!;
    expect((demo.data.tables.businessDayClosing[0]!.totalsSnapshotJson as { employees: { displayName: string }[] }).employees[0]!.displayName).toBe(member.displayName);
    expect(await service.capture(prisma, stores[0]!)).toEqual(full.data);
  });

  it("rejects managers, employees and cross-store access", async () => {
    for (const userId of [users[1]!, users[2]!]) {
      await expect(service.export(actor(userId), stores[0]!, "full")).rejects.toMatchObject({ status: 403 });
      await expect(service.preview(actor(userId), stores[0]!, full)).rejects.toMatchObject({ status: 403 });
    }
    await expect(service.export(actor(users[1]!), stores[1]!, "full")).rejects.toMatchObject({ status: 403 });
  });

  it("uses consistent gift-card aliases even for UUIDs or differently spaced identifiers", () => {
    for (const serial of [randomUUID(), "Customer  with   spaces"]) {
      const backup = structuredClone(full);
      backup.data.tables.giftCardSale[0]!.serialNumber = serial;
      backup.data.tables.giftCardSale[0]!.serialNumberNormalized = serial.replace(/\s+/g, " ").toUpperCase();
      backup.data.tables.workRecord[0]!.giftCardSerialNumber = serial;
      backup.data.tables.paymentBreakdown[0]!.giftCardSerialNumber = serial.toUpperCase();
      const output = anonymizeBackup(backup);
      const identifier = output.data.tables.giftCardSale[0]!.serialNumber;
      expect(output.data.tables.giftCardSale[0]!.serialNumberNormalized).toBe(identifier);
      expect(output.data.tables.workRecord[0]!.giftCardSerialNumber).toBe(identifier);
      expect(output.data.tables.paymentBreakdown[0]!.giftCardSerialNumber).toBe(identifier);
    }
  });

  it("normalizes verified older backups without earnings types and rejects invalid types", () => {
    const older = structuredClone(full);
    for (const table of ["payrollSettlement"] as const) {
      for (const row of older.data.tables[table]) delete row.amountType;
    }
    const normalized = validateBackup(sealBackup(older));
    expect(normalized.data.tables.payrollSettlement.every(row => row.amountType === "ALL")).toBe(true);
    expect(validateBackup(normalized)).toEqual(normalized);
    const invalid = structuredClone(full);
    invalid.data.tables.payrollSettlement[0]!.amountType = "OTHER";
    expect(() => validateBackup(sealBackup(invalid))).toThrow();
  });

  it("rejects checksum, format, duplicate IDs and missing references", () => {
    expect(() => validateBackup({ ...full, checksum: "0".repeat(64) })).toThrow();
    expect(() => validateBackup({ ...full, formatVersion: 2 })).toThrow();
    const duplicate = structuredClone(full); duplicate.data.tables.storeMembership.push(duplicate.data.tables.storeMembership[0]!);
    expect(() => validateBackup(sealBackup(duplicate))).toThrow();
    const broken = structuredClone(full); broken.data.tables.workRecord[0]!.employeeMembershipId = randomUUID();
    expect(() => validateBackup(sealBackup(broken))).toThrow();
  });

  it("requires the full recovery download and rejects changed, expired or mismatched previews", async () => {
    const p = await service.preview(actor(), stores[1]!, full);
    const input = { backup: full, previewId: p.previewId, confirmName: p.targetName };
    await expect(service.confirm(actor(), stores[1]!, input, randomUUID(), "test")).rejects.toMatchObject({ response: { code: "STORE_IMPORT_RECOVERY_REQUIRED" } });
    await expect(service.export(actor(), stores[1]!, "anonymized", p.previewId)).rejects.toThrow();
    await service.export(actor(), stores[1]!, "full", p.previewId);
    await expect(service.confirm(actor(), stores[1]!, { ...input, backup: demo }, randomUUID(), "test")).rejects.toMatchObject({ status: 409 });
    await prisma.store.update({ where: { id: stores[1]! }, data: { version: { increment: 1 } } });
    await expect(service.confirm(actor(), stores[1]!, input, randomUUID(), "test")).rejects.toMatchObject({ response: { code: "STORE_IMPORT_DATA_CHANGED" } });
    await prisma.storeDataImportPreview.update({ where: { id: p.previewId }, data: { expiresAt: new Date(0) } });
    await expect(service.confirm(actor(), stores[1]!, input, randomUUID(), "test")).rejects.toMatchObject({ response: { code: "STORE_IMPORT_PREVIEW_EXPIRED" } });
  });

  it("restores full and demo files without changing global users or another store", async () => {
    const sourceBefore = checksum(await service.capture(prisma, stores[0]!));
    const userBefore = await prisma.user.findMany({ where: { id: { in: users } }, orderBy: { id: "asc" } });
    for (const [index, backup] of [full, demo].entries()) {
      const target = stores[index + 1]!;
      await prisma.closingDeliveryAgent.create({ data: { storeId: target, tokenHash: "private-token-hash", tokenPrefix: randomUUID(), createdBy: users[0]! } });
      const input = await prepare(backup, target);
      const key = randomUUID();
      const result = await service.confirm(actor(), target, input, key, "import-test");
      expect(await service.confirm(actor(), target, input, key, "import-retry")).toEqual(result);
      await expect(service.confirm(actor(), target, { ...input, confirmName: "different request" }, key, "changed-retry")).rejects.toMatchObject({ status: 409 });
      const restored = await service.export(actor(), target, "full");
      for (const table of storeBackupTables.filter(table => table !== "auditLog")) expect(restored.data.tables[table], table).toHaveLength(backup.data.tables[table].length);
      expect(restored.data.store.id).toBe(target);
      expect(restored.data.store.ownerMembershipId).toBe(owners[index + 1]);
      expect(restored.data.tables.storeMembership.filter(row => row.userId !== null).map(row => row.userId)).toEqual([users[0]]);
      expect(restored.data.tables.storeMembership.every(row => row.closingDeliveryEnabled === false)).toBe(true);
      expect(restored.data.tables.workRecord[0]!.grossFeeBaseCents).toBe("12000");
      expect(restored.data.tables.workRecord[0]!.businessDate).toBe(date.toISOString());
      expect(restored.data.tables.lostCustomer[0]!.note).toBe(backup.data.tables.lostCustomer[0]!.note);
      expect((await prisma.closingDeliveryAgent.findUniqueOrThrow({ where: { storeId: target } })).revokedAt).not.toBeNull();
      const audit = await new AuditService(prisma, access).list(actor(), target, { limit: 100 });
      expect(audit.items.some(row => (row.actor as { displayName?: string } | null)?.displayName === backup.data.tables.storeMembership.find(member => member.id === backup.data.tables.auditLog[0]!.actorMembershipId)?.displayName)).toBe(true);
      const originalAuditCount = restored.data.tables.auditLog.length;
      await service.confirm(actor(), target, await prepare(backup, target), randomUUID(), "import-again");
      expect(await prisma.auditLog.count({ where: { storeId: target } })).toBe(originalAuditCount + 1);
    }
    expect(checksum(await service.capture(prisma, stores[0]!))).toBe(sourceBefore);
    expect(await prisma.user.findMany({ where: { id: { in: users } }, orderBy: { id: "asc" } })).toEqual(userBefore);
  });

  it("rolls back all deletions and writes if a database constraint fails midway", async () => {
    const broken = structuredClone(full);
    broken.data.tables.storeMembership[1]!.displayNameNormalized = broken.data.tables.storeMembership[0]!.displayNameNormalized!;
    const backup = sealBackup(broken);
    const before = await service.capture(prisma, stores[1]!);
    const input = await prepare(backup);
    await expect(service.confirm(actor(), stores[1]!, input, randomUUID(), "rollback-test")).rejects.toMatchObject({ status: 409 });
    expect(await service.capture(prisma, stores[1]!)).toEqual(before);
  });

  it("imports with production-style append-only audit and outbox privileges", async () => {
    const role = `backup_test_${randomUUID().replaceAll("-", "")}`;
    const password = randomUUID();
    await prisma.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    const url = new URL(process.env.DATABASE_URL!); url.username = role; url.password = password;
    const restricted = new PrismaService({ datasourceUrl: url.toString() });
    try {
      await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await prisma.$executeRawUnsafe(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, ai_query_logs, domain_outbox FROM "${role}"`);
      const data = new StoreDataService(restricted, new StoreAccessService(restricted));
      const p = await data.preview(actor(), stores[1]!, full);
      await data.export(actor(), stores[1]!, "full", p.previewId);
      await expect(data.confirm(actor(), stores[1]!, { backup: full, previewId: p.previewId, confirmName: p.targetName }, randomUUID(), "restricted-import")).resolves.toMatchObject({ imported: true });
      await expect(restricted.auditLog.deleteMany({ where: { storeId: stores[1]! } })).rejects.toThrow();
    } finally {
      await restricted.$disconnect();
      await prisma.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
      await prisma.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
  });

  it("times out behind concurrent database writes without partially importing", async () => {
    const input = await prepare(full);
    const before = await service.capture(prisma, stores[1]!);
    let ready!: () => void;
    const locked = new Promise<void>(resolve => { ready = resolve; });
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const writer = prisma.$transaction(async tx => { await tx.$executeRawUnsafe("LOCK TABLE stores IN ROW EXCLUSIVE MODE"); ready(); await wait; }, { timeout: 15000 });
    await locked;
    try { await expect(service.confirm(actor(), stores[1]!, input, randomUUID(), "locked")).rejects.toMatchObject({ status: 409 }); }
    finally { release(); await writer; }
    expect(await service.capture(prisma, stores[1]!)).toEqual(before);
  }, 15000);

  it("never exports an unrecognized top-level string as anonymized data", async () => {
    const spy = vi.spyOn(service, "capture").mockImplementationOnce(async () => {
      const data = structuredClone(full.data); data.tables.workRecordServiceSnapshot[0]!.commissionSource = secret; return data;
    });
    await expect(service.export(actor(), stores[0]!, "anonymized")).rejects.toMatchObject({ status: 400 });
    spy.mockRestore();
  });
});
