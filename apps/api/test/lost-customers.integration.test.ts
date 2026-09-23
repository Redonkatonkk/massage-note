import { randomInt, randomUUID } from "node:crypto";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { LostCustomersService } from "../src/lost-customers/lost-customers.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const lostCustomers = new LostCustomersService(prisma, access, idempotency);
const storeId = randomUUID();
const secondStoreId = randomUUID();
const employeeId = randomUUID();
const otherEmployeeId = randomUUID();
const employeeMembershipId = randomUUID();
const otherMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("跑客记录", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [employeeId, otherEmployeeId].map((id, index) => ({ id, firebaseUid: `lost-customer-test-${id}`, phoneE164: `+1646${randomInt(10_000_000, 99_000_000) + index}` })) });
    await prisma.store.createMany({ data: [storeId, secondStoreId].map((id, index) => ({ id, storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"), name: `跑客集成测试店${index}`, timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 6_000, status: "ACTIVE" })) });
    await prisma.storeMembership.createMany({ data: [
      { id: employeeMembershipId, storeId, userId: employeeId, role: "EMPLOYEE", displayName: "跑客员工", displayNameNormalized: "跑客员工" },
      { id: otherMembershipId, storeId: secondStoreId, userId: otherEmployeeId, role: "EMPLOYEE", displayName: "另一店员工", displayNameNormalized: "另一店员工" },
    ] });
  });
  afterAll(async () => {
    if (enabled) {
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.lostCustomer.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.storeMembership.deleteMany({ where: { storeId: secondStoreId } });
      await prisma.store.deleteMany({ where: { id: { in: [storeId, secondStoreId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [employeeId, otherEmployeeId] } } });
    }
    await prisma.$disconnect();
  });

  it("员工可按本地时间创建跑客，幂等、按日读取、版本修改并软删除", async () => {
    const businessDate = (await boards.currentBusinessDay(actor(employeeId), storeId)).businessDate;
    const yesterday = new Date(`${businessDate}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await expect(lostCustomers.list(actor(employeeId), storeId, { businessDate: yesterday.toISOString().slice(0, 10) })).rejects.toMatchObject({ response: expect.objectContaining({ code: "LOST_CUSTOMER_HISTORY_FORBIDDEN" }) });
    const tomorrow = new Date(`${businessDate}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await expect(lostCustomers.create(actor(employeeId), storeId, { businessDate: tomorrow.toISOString().slice(0, 10), occurredTime: "09:00" }, "lost-customer-future-key-01", "lost-future")).rejects.toMatchObject({ response: expect.objectContaining({ code: "LOST_CUSTOMER_FUTURE_DATE" }) });
    const input = { businessDate, occurredTime: "09:05" };
    const [created, replayed] = await Promise.all([
      lostCustomers.create(actor(employeeId), storeId, input, "lost-customer-create-key-01", "lost-create-1"),
      lostCustomers.create(actor(employeeId), storeId, input, "lost-customer-create-key-01", "lost-create-2"),
    ]);
    expect(replayed.id).toBe(created.id);
    expect(await prisma.auditLog.count({ where: { storeId, entityType: "lost_customer", entityId: created.id, action: "lost_customer.created" } })).toBe(1);
    expect(await prisma.domainOutbox.count({ where: { storeId, aggregateType: "lost_customer", aggregateId: created.id } })).toBe(1);
    expect(await lostCustomers.list(actor(employeeId), storeId, { businessDate })).toMatchObject([{ id: created.id, occurredTime: "09:05", version: 1 }]);
    const updated = await lostCustomers.update(actor(employeeId), storeId, created.id, { version: 1, occurredTime: "09:20" }, "lost-customer-update-key-01", "lost-update");
    expect(updated).toMatchObject({ occurredTime: "09:20", version: 2 });
    expect(await prisma.auditLog.count({ where: { storeId, entityType: "lost_customer", entityId: created.id, action: "lost_customer.updated" } })).toBe(1);
    expect(await prisma.domainOutbox.count({ where: { storeId, aggregateType: "lost_customer", aggregateId: created.id } })).toBe(2);
    await expect(lostCustomers.remove(actor(employeeId), storeId, created.id, { version: 1 }, "lost-customer-delete-key-01", "lost-delete-stale")).rejects.toMatchObject({ response: expect.objectContaining({ code: "LOST_CUSTOMER_VERSION_CONFLICT" }) });
    await lostCustomers.remove(actor(employeeId), storeId, created.id, { version: 2 }, "lost-customer-delete-key-02", "lost-delete");
    expect(await prisma.auditLog.count({ where: { storeId, entityType: "lost_customer", entityId: created.id, action: "lost_customer.deleted" } })).toBe(1);
    expect(await prisma.domainOutbox.count({ where: { storeId, aggregateType: "lost_customer", aggregateId: created.id } })).toBe(3);
    expect(await lostCustomers.list(actor(employeeId), storeId, { businessDate })).toEqual([]);
    expect(await prisma.lostCustomer.findUnique({ where: { id: created.id } })).toMatchObject({ deletedAt: expect.any(Date), version: 3 });
  });

  it("拒绝未授权和跨店修改或删除", async () => {
    const businessDate = (await boards.currentBusinessDay(actor(employeeId), storeId)).businessDate;
    const created = await lostCustomers.create(actor(employeeId), storeId, { businessDate, occurredTime: "10:15" }, "lost-customer-access-create-01", "lost-access-create");

    await expect(lostCustomers.update(actor(otherEmployeeId), storeId, created.id, { version: 1, occurredTime: "10:30" }, "lost-customer-noaccess-patch-01", "lost-noaccess-patch"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "ACTIVE_MEMBERSHIP_REQUIRED" }) });
    await expect(lostCustomers.remove(actor(otherEmployeeId), storeId, created.id, { version: 1 }, "lost-customer-noaccess-delete-01", "lost-noaccess-delete"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "ACTIVE_MEMBERSHIP_REQUIRED" }) });

    await expect(lostCustomers.update(actor(otherEmployeeId), secondStoreId, created.id, { version: 1, occurredTime: "10:30" }, "lost-customer-cross-patch-key-01", "lost-cross-patch"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "LOST_CUSTOMER_NOT_FOUND" }) });
    await expect(lostCustomers.remove(actor(otherEmployeeId), secondStoreId, created.id, { version: 1 }, "lost-customer-cross-delete-01", "lost-cross-delete"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "LOST_CUSTOMER_NOT_FOUND" }) });
    await lostCustomers.remove(actor(employeeId), storeId, created.id, { version: 1 }, "lost-customer-access-cleanup-01", "lost-access-cleanup");
  });

  it("日结后拒绝创建、修改和删除，失败操作不会产生审计或 outbox", async () => {
    const businessDate = (await boards.currentBusinessDay(actor(employeeId), storeId)).businessDate;
    const created = await lostCustomers.create(actor(employeeId), storeId, { businessDate, occurredTime: "11:00" }, "lost-customer-close-create-01", "lost-close-create");
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date(`${businessDate}T00:00:00.000Z`), cycleNo: 1, warningSnapshotJson: {}, totalsSnapshotJson: {}, closedBy: employeeId } });

    const auditsBefore = await prisma.auditLog.count({ where: { storeId, entityType: "lost_customer" } });
    const outboxBefore = await prisma.domainOutbox.count({ where: { storeId, aggregateType: "lost_customer" } });
    await expect(lostCustomers.create(actor(employeeId), storeId, { businessDate, occurredTime: "11:15" }, "lost-customer-close-create-02", "lost-close-create-rejected"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "BUSINESS_DAY_CLOSED" }) });
    await expect(lostCustomers.update(actor(employeeId), storeId, created.id, { version: 1, occurredTime: "11:30" }, "lost-customer-close-update-01", "lost-close-update-rejected"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "BUSINESS_DAY_CLOSED" }) });
    await expect(lostCustomers.remove(actor(employeeId), storeId, created.id, { version: 1 }, "lost-customer-close-delete-01", "lost-close-delete-rejected"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "BUSINESS_DAY_CLOSED" }) });

    expect(await prisma.auditLog.count({ where: { storeId, entityType: "lost_customer" } })).toBe(auditsBefore);
    expect(await prisma.domainOutbox.count({ where: { storeId, aggregateType: "lost_customer" } })).toBe(outboxBefore);
    expect(await prisma.lostCustomer.findUnique({ where: { id: created.id } })).toMatchObject({ occurredTime: "11:00", deletedAt: null, version: 1 });
  });
});
