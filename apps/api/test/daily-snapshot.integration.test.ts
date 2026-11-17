import { createHash, randomInt, randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { CLOSING_DELIVERY_TEXT_PROTOCOL, DAILY_SNAPSHOT_TTL_MS } from "@massage-note/contracts";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deviceTimeContext } from "../src/common/device-time.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { ClosingDeliveriesService } from "../src/finance/closing-deliveries.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { DailySnapshotSharesService } from "../src/finance/daily-snapshot-shares.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const work = new WorkRecordsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const deliveries = new ClosingDeliveriesService(prisma, access, closings);
const shares = new DailySnapshotSharesService(prisma, closings);
const storeId = randomUUID();
const owner = { id: randomUUID() } as User;
const ownerMembership = randomUUID();
const employee = randomUUID();
const other = randomUUID();
const serviceItemId = randomUUID();
const phone = "+12025550101";
const anchor = "2026-10-10";
const prior = "2026-10-02";
const first = "2026-09-30";

async function record(date: string, employeeMembershipId = employee, hour = "16", confirmed = true) {
  const saved = await work.create(owner, storeId, {
    employeeMembershipId, serviceItemId, startAt: `${date}T${hour}:00:00Z`,
  }, randomUUID(), randomUUID());
  return confirmed ? work.confirmPayment(owner, storeId, saved.id, {
    version: saved.version, cashServiceCents: 4000, cardServiceCents: 6000,
    cashTipCents: 1000, cardTipCents: 2000, giftCardTipCents: 300, giftCardSerialNumber: "SNAPSHOT-TEST",
  }, randomUUID(), randomUUID()) : saved;
}

describe.skipIf(!enabled).sequential("Employee daily snapshot and text delivery", () => {
  let priorRecordId: string;

  beforeAll(async () => {
    await prisma.user.create({ data: { id: owner.id, firebaseUid: `snapshot-${owner.id}`, phoneE164: `+1646${randomInt(10000000, 99999999)}` } });
    await prisma.store.create({ data: {
      id: storeId, name: "Snapshot test store", storeCode: String(randomInt(0, 1000000)).padStart(6, "0"),
      timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 6000, status: "ACTIVE",
    } });
    await prisma.storeMembership.createMany({ data: [
      { id: ownerMembership, storeId, userId: owner.id, role: "OWNER", displayName: "Owner", displayNameNormalized: "owner" },
      { id: employee, storeId, role: "EMPLOYEE", displayName: "Lily\u2028Test", displayNameNormalized: "lily test", closingDeliveryEnabled: true, closingDeliveryPhoneE164: phone },
      { id: other, storeId, role: "EMPLOYEE", displayName: "Other Employee", displayNameNormalized: "other employee" },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerMembership } });
    await prisma.serviceItem.create({ data: {
      id: serviceItemId, storeId, fullName: "Body massage", shortName: "Body", durationMinutes: 60,
      priceCents: 10000n, position: 0, priceOptions: { create: { durationMinutes: 60, priceCents: 10000n, position: 0 } },
    } });
    await record(first);
    priorRecordId = (await record(prior)).id;
    await record("2026-10-03", other);
    await record("2026-10-04", employee, "16", false);
    await record(anchor);
    await record(anchor, employee, "18", false);
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.paymentBreakdown.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.employeeClosingDelivery.deleteMany({ where: { storeId } });
      await prisma.closingDeliveryAgent.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
    await prisma.$disconnect();
  });

  it("creates one grant for the queued text and scopes snapshot history, calendar and receipts", async () => {
    vi.stubEnv("WEB_ORIGIN", "https://snapshot.example.test");
    try {
      await closings.close(owner, storeId, prior, { force: false }, randomUUID(), randomUUID(), true);
      // Keep only the requested anchor queued, while preserving a closed historical day.
      await prisma.employeeClosingDelivery.updateMany({ where: { storeId }, data: { status: "CANCELLED" } });
      await closings.close(owner, storeId, anchor, { force: true, forceReason: "Pending sample record" }, randomUUID(), randomUUID());
      const agent = await deliveries.rotateAgentCredential(owner, storeId, randomUUID());
      const agentAuthorization = `Bearer ${agent.token}`;
      await expect(deliveries.claim(agentAuthorization)).resolves.toBeNull();
      const claim = await deliveries.claim(agentAuthorization, CLOSING_DELIVERY_TEXT_PROTOCOL);
      expect(claim).toMatchObject({ deliveryMode: "TEXT", phoneE164: phone });
      await expect(deliveries.prepareText(agentAuthorization, claim!.id, randomUUID())).rejects.toThrow(ForbiddenException);

      const beforeIssue = Date.now();
      const prepared = await deliveries.prepareText(agentAuthorization, claim!.id, claim!.leaseToken);
      if (!prepared.authorized) throw new Error("Text preparation was refused");
      const line = prepared.text.split("\n");
      expect(line).toEqual([
        "名字：Lily Test", "日期：2026-10-10", "今日总收入：$93.00",
        expect.stringMatching(/^详情页面：https:\/\/snapshot\.example\.test\/share\/daily-snapshot#[A-Za-z0-9_-]{43}$/),
      ]);
      const token = line[3]!.split("#")[1]!;
      const accessHeader = `Bearer ${token}`;
      const grant = await prisma.employeeDailySnapshotShare.findUniqueOrThrow({ where: { deliveryId: claim!.id } });
      expect(grant.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(grant.expiresAt.getTime()).toBeGreaterThanOrEqual(beforeIssue + DAILY_SNAPSHOT_TTL_MS);
      expect(grant.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DAILY_SNAPSHOT_TTL_MS);
      const repeated = await deliveries.prepareText(agentAuthorization, claim!.id, claim!.leaseToken);
      expect(repeated).toEqual(prepared);
      expect(await prisma.employeeDailySnapshotShare.findUnique({ where: { deliveryId: claim!.id } })).toEqual(grant);

      const initial = await shares.read(accessHeader, undefined);
      expect(initial).toMatchObject({
        snapshot: { businessDate: anchor, isClosed: true, employee: { confirmedIncomeCents: 9300 } },
        minDate: first, maxDate: anchor, locale: "zh_CN", expiresAt: grant.expiresAt.toISOString(),
        monthToDate: { dateFrom: "2026-10-01", dateTo: anchor, cashIncomeCents: 6800, nonCashIncomeCents: 11800, totalIncomeCents: 18600 },
      });
      expect(initial.snapshot.records.map(row => row.status)).toEqual(["CONFIRMED", "PENDING_PAYMENT"]);
      expect(initial.snapshot).not.toHaveProperty("storeId");
      expect(initial.snapshot).not.toHaveProperty("activeClosing");
      expect(initial.snapshot.employee).not.toHaveProperty("membershipId");
      expect(initial.snapshot.employee).not.toHaveProperty("cashToSubmitToStoreCents");
      expect(initial.snapshot.records[0]).not.toHaveProperty("id");
      expect(JSON.stringify(initial)).not.toContain(token);
      expect(JSON.stringify(initial)).not.toContain(phone);

      const earlier = await deviceTimeContext.run({ now: new Date(0), timezone: "UTC" }, () => shares.read(accessHeader, prior));
      expect(earlier.monthToDate).toMatchObject({ dateFrom: "2026-10-01", dateTo: prior, totalIncomeCents: 9300 });
      expect(earlier.snapshot.records).toHaveLength(1);
      const empty = await shares.read(accessHeader, "2026-10-03");
      expect(empty.snapshot.records).toEqual([]);
      expect(empty.monthToDate.totalIncomeCents).toBe(9300);
      expect((await shares.read(accessHeader, first)).monthToDate).toMatchObject({ dateFrom: "2026-09-01", totalIncomeCents: 9300 });
      await expect(shares.calendar(accessHeader, "2026-10")).resolves.toEqual({
        dates: ["2026-10-04"],
        closedDates: [{ date: prior, revenueCents: 9300 }, { date: anchor, revenueCents: 9300 }],
      });
      await expect(shares.calendar(accessHeader, "2026-11")).rejects.toThrow(NotFoundException);
      await expect(shares.read(accessHeader, "2026-10-11")).rejects.toThrow(NotFoundException);
      await expect(shares.read(accessHeader, "2026-09-29")).rejects.toThrow(NotFoundException);
      await expect(shares.read(token, undefined)).rejects.toThrow(NotFoundException);
      await expect(shares.read(`Bearer ${"A".repeat(43)}`, undefined)).rejects.toThrow(NotFoundException);

      await prisma.workRecord.update({ where: { id: priorRecordId }, data: { deletedAt: new Date() } });
      expect(await shares.read(accessHeader, undefined)).toEqual(initial);
      expect((await shares.read(accessHeader, prior)).monthToDate.totalIncomeCents).toBe(0);
      await deliveries.complete(agentAuthorization, claim!.id, claim!.leaseToken, {
        messageGuid: "test-guid", state: "SENT", errorCode: 0, service: "SMS",
      });
      const receipts = await deliveries.receiptCandidates(agentAuthorization);
      expect(receipts).toContainEqual({
        id: claim!.id, attemptCount: 1, recipientPhoneE164: phone, deliveryMode: "TEXT", deliveryMessageGuid: "test-guid",
      });
      expect(JSON.stringify(receipts)).not.toContain(token);

      await prisma.storeMembership.update({ where: { id: employee }, data: { closingDeliveryPhoneE164: "+12025550102" } });
      await expect(shares.read(accessHeader, undefined)).rejects.toThrow(NotFoundException);
      await prisma.storeMembership.update({ where: { id: employee }, data: { closingDeliveryPhoneE164: phone, closingDeliveryEnabled: false } });
      await expect(shares.calendar(accessHeader, "2026-10")).rejects.toThrow(NotFoundException);
      await prisma.storeMembership.update({ where: { id: employee }, data: { closingDeliveryEnabled: true } });
      await prisma.employeeDailySnapshotShare.delete({ where: { deliveryId: claim!.id } });
      await prisma.employeeDailySnapshotShare.create({ data: { ...grant, expiresAt: new Date(0), monthToDateJson: initial.monthToDate } });
      await expect(shares.read(accessHeader, undefined)).rejects.toThrow(NotFoundException);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
