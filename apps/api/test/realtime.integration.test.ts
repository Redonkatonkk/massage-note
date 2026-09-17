import { randomInt, randomUUID } from "node:crypto";
import type { MessageEvent } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { RealtimeService } from "../src/realtime/realtime.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const records = new WorkRecordsService(prisma, access, new IdempotencyService(prisma));
const realtime = new RealtimeService(prisma, access);
const storeId = randomUUID();
const users = [randomUUID(), randomUUID()];
const memberships = [randomUUID(), randomUUID()];
const owner = { id: users[0] } as User;
const employee = { id: users[1] } as User;

describe.skipIf(!enabled)("记工事务到多设备 SSE", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map(id => ({ id, firebaseUid: `realtime-${id}`, phoneE164: `+1917${randomInt(10000000, 99999999)}` })) });
    await prisma.store.create({ data: { id: storeId, storeCode: randomInt(0, 1000000).toString().padStart(6, "0"), name: "实时同步测试", timezone: "America/New_York", businessCutoffLocal: "22:00", status: "ACTIVE", globalCommissionBps: 5000 } });
    await prisma.storeMembership.createMany({ data: users.map((userId, index) => ({ id: memberships[index]!, storeId, userId, role: index === 0 ? "OWNER" as const : "EMPLOYEE" as const, displayName: `实时${index}`, displayNameNormalized: `实时${index}` })) });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: memberships[0]! } });
  });
  afterAll(async () => {
    realtime.onModuleDestroy();
    if (enabled) {
      await prisma.paymentBreakdown.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await prisma.$disconnect();
  });

  it("同账号两个独立订阅及另一账号收到新增、修改、删除、恢复，失败事务不广播", async () => {
    const received: MessageEvent[][] = [[], [], []];
    const subscriptions = await Promise.all([owner, owner, employee].map(async (actor, index) =>
      (await realtime.stream(actor, storeId)).subscribe(event => received[index]!.push(event)),
    ));
    const waitForAction = async (id: string, action: string) => {
      await expect.poll(() => received.every(events => events.some(event => {
        const data = event.data as { entityId?: string; action?: string };
        return data.entityId === id && data.action === action;
      })), { timeout: 5000, interval: 50 }).toBe(true);
    };
    try {
      const created = await records.create(owner, storeId, {
        employeeMembershipId: memberships[1]!, startAt: new Date().toISOString(),
        customService: { name: "实时", shortName: "实时", durationMinutes: 60, amountCents: 10000 },
      }, randomUUID(), "realtime-create");
      await waitForAction(created.id, "work_record.created_with_custom_service");
      const updated = await records.update(owner, storeId, created.id, { version: created.version, note: "另一设备应看到此备注" }, randomUUID(), "realtime-update");
      await waitForAction(created.id, "work_record.updated");
      expect((await records.get(employee, storeId, created.id)).note).toBe("另一设备应看到此备注");
      const outboxCount = await prisma.domainOutbox.count({ where: { storeId } });
      await expect(records.update(owner, storeId, created.id, { version: created.version, note: "冲突" }, randomUUID(), "realtime-conflict")).rejects.toThrow();
      expect(await prisma.domainOutbox.count({ where: { storeId } })).toBe(outboxCount);
      const deleted = await records.remove(owner, storeId, created.id, { version: updated.version }, randomUUID(), "realtime-delete");
      await waitForAction(created.id, "work_record.deleted");
      await records.restore(owner, storeId, created.id, { version: deleted.version }, randomUUID(), "realtime-restore");
      await waitForAction(created.id, "work_record.restored");
      expect((await records.get(employee, storeId, created.id)).deletedAt).toBeNull();
    } finally { subscriptions.forEach(subscription => subscription.unsubscribe()); }
  }, 25000);
});
