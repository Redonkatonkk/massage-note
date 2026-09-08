import { createHash, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";

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
    await prisma.employeeSettlementDelivery.deleteMany({ where: { storeId } });
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
});
