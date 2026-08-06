import { randomInt, randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../src/audit/audit.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const audit = new AuditService(prisma, access);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("审计查询与店铺隔离", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `audit-test-${id}`,
        phoneE164: `+1917${randomInt(10_000_000, 99_000_000) + index}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "审计测试店",
        timezone: "America/New_York",
        businessCutoffLocal: "22:00",
        globalCommissionBps: 5_000,
        status: "ACTIVE",
      },
    });
    await prisma.storeMembership.createMany({
      data: [
        { id: ownerMembershipId, storeId, userId: ownerId, role: "OWNER", displayName: "审计店主", displayNameNormalized: "审计店主" },
        { id: employeeMembershipId, storeId, userId: employeeId, role: "EMPLOYEE", displayName: "审计员工", displayNameNormalized: "审计员工" },
      ],
    });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId } });
    await prisma.auditLog.createMany({
      data: [
        { storeId, actorUserId: ownerId, actorMembershipId: ownerMembershipId, source: "api", action: "store.settings_updated", entityType: "store", entityId: storeId, requestId: "audit-test-one" },
        { storeId, actorUserId: ownerId, actorMembershipId: ownerMembershipId, source: "api", action: "membership.updated", entityType: "store_membership", entityId: employeeMembershipId, requestId: "audit-test-two" },
      ],
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeId] } } });
    }
    await prisma.$disconnect();
  });

  it("管理者可分页、筛选并看到操作人名称", async () => {
    const queuedEvents = await prisma.domainOutbox.findMany({ where: { storeId } });
    expect(queuedEvents).toHaveLength(2);
    expect(queuedEvents.map((event) => event.topic)).toEqual(["store.changed", "store.changed"]);
    const first = await audit.list(actor(ownerId), storeId, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.actor?.displayName).toBe("审计店主");
    expect(first.nextCursor).toBeTruthy();
    const second = await audit.list(actor(ownerId), storeId, { limit: 1, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    const filtered = await audit.list(actor(ownerId), storeId, { limit: 30, action: "membership.updated" });
    expect(filtered.items.map((item) => item.action)).toEqual(["membership.updated"]);
  });

  it("员工不能查看全店审计", async () => {
    await expect(audit.list(actor(employeeId), storeId, { limit: 30 })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
