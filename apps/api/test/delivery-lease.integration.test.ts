import { createHash, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";
import { ClosingDeliveriesService } from "../src/finance/closing-deliveries.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const storeId = randomUUID();
const userId = randomUUID();
const prefix = randomUUID().replaceAll("-", "").slice(0, 10);
const token = `mna_${prefix}_${randomUUID()}`;
const service = new EmployeeSettlementsService(prisma, {} as never, {} as never);

describe.skipIf(!enabled).sequential("发送租约状态保护", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, firebaseUid: randomUUID(), phoneE164: `+1310${randomInt(10000000, 99999999)}` } });
    await prisma.store.create({ data: { id: storeId, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: "lease test", status: "ACTIVE", timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 5000 } });
    await prisma.closingDeliveryAgent.create({ data: { storeId, tokenPrefix: prefix, tokenHash: createHash("sha256").update(token).digest("hex"), createdBy: userId } });
  });
  afterAll(async () => {
    await prisma.employeeClosingDelivery.deleteMany({ where: { storeId } });
    await prisma.employeeSettlementDelivery.deleteMany({ where: { storeId } });
    await prisma.storeMembership.deleteMany({ where: { storeId } });
    await prisma.closingDeliveryAgent.deleteMany({ where: { storeId } });
    await prisma.auditLog.deleteMany({ where: { storeId } });
    await prisma.domainOutbox.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("过期租约不能授权、完成或回写失败", async () => {
    const leaseToken = randomUUID();
    const job = await prisma.employeeSettlementDelivery.create({ data: { storeId, documentType: "EMPLOYEE_SUMMARY", periodStart: new Date(), periodEnd: new Date(), paymentScope: "ALL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, requestKey: randomUUID(), status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(Date.now() - 1000), detailSentAt: new Date() } });
    await expect(service.authorize(`Bearer ${token}`, job.id, leaseToken)).rejects.toMatchObject({ response: { code: "DELIVERY_LEASE_INVALID" } });
    await expect(service.complete(`Bearer ${token}`, job.id, leaseToken)).rejects.toMatchObject({ response: { code: "DELIVERY_LEASE_INVALID" } });
    await expect(service.fail(`Bearer ${token}`, job.id, { leaseToken, code: "TEST", message: "test", retryable: false })).rejects.toMatchObject({ response: { code: "DELIVERY_LEASE_INVALID" } });
    const replacement = randomUUID();
    await prisma.employeeSettlementDelivery.update({ where: { id: job.id }, data: { leaseToken: replacement, leaseExpiresAt: new Date(Date.now() + 60000) } });
    await expect(service.complete(`Bearer ${token}`, job.id, leaseToken)).rejects.toThrow();
    await expect(service.complete(`Bearer ${token}`, job.id, replacement)).resolves.toMatchObject({ sent: true });
  });

  it("读取之后租约被替换也不能覆盖新状态", async () => {
    const leaseToken = randomUUID();
    const job = await prisma.employeeSettlementDelivery.create({ data: { storeId, documentType: "EMPLOYEE_SUMMARY", periodStart: new Date(), periodEnd: new Date(), paymentScope: "ALL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, requestKey: randomUUID(), status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(Date.now() + 60000), detailSentAt: new Date() } });
    const original = prisma.employeeSettlementDelivery.findFirst.bind(prisma.employeeSettlementDelivery);
    const replacement = randomUUID();
    const spy = vi.spyOn(prisma.employeeSettlementDelivery, "findFirst").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => {
      const result = await original(args);
      await prisma.employeeSettlementDelivery.update({ where: { id: job.id }, data: { leaseToken: replacement } });
      return result;
    }) as unknown as typeof original);
    try { await expect(service.complete(`Bearer ${token}`, job.id, leaseToken)).rejects.toMatchObject({ response: { code: "DELIVERY_LEASE_INVALID" } }); }
    finally { spy.mockRestore(); }
    expect(await prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "CLAIMED", leaseToken: replacement });
    expect(await prisma.auditLog.count({ where: { storeId, entityId: job.id } })).toBe(0);
  });

  it("取消任务的审计失败时，任务状态一起回滚", async () => {
    const job = await prisma.employeeSettlementDelivery.create({ data: { storeId, documentType: "EMPLOYEE_SUMMARY", periodStart: new Date(), periodEnd: new Date(), paymentScope: "ALL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, requestKey: randomUUID() } });
    const access = { requireCapability: async () => ({ id: null }) };
    const managerService = new EmployeeSettlementsService(prisma, access as never, {} as never);
    // An invalid audit UUID causes a database error after the status mutation.
    await expect(managerService.cancel({ id: "invalid-audit-uuid" } as never, storeId, job.id, randomUUID())).rejects.toThrow();
    expect(await prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "QUEUED" });
    expect(await prisma.auditLog.count({ where: { storeId, entityId: job.id } })).toBe(0);
  });

  it.each(["closing", "settlement"] as const)("%s 回执支持延迟送达、手动重试恢复并隔离旧轮次和未知任务", async kind => {
    const member = await prisma.storeMembership.create({ data: { storeId, role: "EMPLOYEE", displayName: randomUUID(), displayNameNormalized: randomUUID() } });
    const job = kind === "closing"
      ? await prisma.employeeClosingDelivery.create({ data: { storeId, membershipId: member.id, businessDate: new Date(), kind: "INITIAL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, status: "SENT", attemptCount: 1, sentAt: new Date() } })
      : await prisma.employeeSettlementDelivery.create({ data: { storeId, periodStart: new Date(), periodEnd: new Date(), paymentScope: "ALL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, requestKey: randomUUID(), status: "SENT", attemptCount: 1, sentAt: new Date() } });
    const target = kind === "closing" ? new ClosingDeliveriesService(prisma, {} as never, {} as never) : service;
    const readJob = () => kind === "closing"
      ? prisma.employeeClosingDelivery.findUniqueOrThrow({ where: { id: job.id } })
      : prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: job.id } });
    const report = { attemptCount: 1, receipt: { messageGuid: "original", state: "FAILED" as const, errorCode: 100, service: "SMS" } };
    expect(await target.receiptCandidates(`Bearer ${token}`)).toContainEqual(expect.objectContaining({ id: job.id, attemptCount: 1 }));
    await expect(target.receipt(undefined, job.id, report)).rejects.toThrow();
    expect(await target.receipt(`Bearer ${token}`, randomUUID(), report)).toEqual({ recorded: false });
    expect(await target.receipt(`Bearer ${token}`, job.id, { ...report, attemptCount: 2 })).toEqual({ recorded: false });
    expect(await target.receipt(`Bearer ${token}`, job.id, report)).toEqual({ recorded: true });
    // Repeating an unchanged observation refreshes checking time without duplicate audits.
    await target.receipt(`Bearer ${token}`, job.id, report);
    expect(await prisma.auditLog.count({ where: { entityId: job.id, action: { endsWith: ".delivery_receipt" } } })).toBe(1);
    expect(await readJob()).toMatchObject({ status: "SENT", deliveryStatus: "FAILED", deliveryErrorCode: 100 });
    await target.receipt(`Bearer ${token}`, job.id, { attemptCount: 1, receipt: { state: "MISSING", messageGuid: null, errorCode: 0, service: null } });
    expect(await readJob()).toMatchObject({ deliveryStatus: "FAILED" });
    const delivered = { attemptCount: 1, receipt: { messageGuid: "manual-retry", state: "DELIVERED" as const, errorCode: 0, service: "RCS" } };
    expect(await target.receipt(`Bearer ${token}`, job.id, delivered)).toEqual({ recorded: true });
    expect(await readJob()).toMatchObject({ status: "SENT", deliveryStatus: "DELIVERED", deliveryMessageGuid: "manual-retry" });
    expect(await target.receiptCandidates(`Bearer ${token}`)).not.toContainEqual(expect.objectContaining({ id: job.id }));
    // A queued resend cannot accept a receipt from the previous attempt.
    if (kind === "closing") await prisma.employeeClosingDelivery.updateMany({ where: { id: job.id }, data: { status: "QUEUED" } });
    else await prisma.employeeSettlementDelivery.updateMany({ where: { id: job.id }, data: { status: "QUEUED" } });
    expect(await target.receipt(`Bearer ${token}`, job.id, delivered)).toEqual({ recorded: false });
  });

  it("完成任务保留实际送达回执，同时兼容旧代理不带回执的完成请求", async () => {
    for (const receipt of [undefined, { messageGuid: "confirmed", state: "DELIVERED" as const, errorCode: 0, service: "RCS" }]) {
      const leaseToken = randomUUID();
      const job = await prisma.employeeSettlementDelivery.create({ data: { storeId, periodStart: new Date(), periodEnd: new Date(), paymentScope: "ALL", recipientPhoneE164: "+13105551234", locale: "zh_CN", snapshotJson: {}, queuedBy: userId, requestKey: randomUUID(), status: "CLAIMED", attemptCount: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60000), detailSentAt: new Date() } });
      await service.complete(`Bearer ${token}`, job.id, leaseToken, receipt);
      expect(await prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SENT", deliveryStatus: receipt?.state ?? null });
    }
  });
});
