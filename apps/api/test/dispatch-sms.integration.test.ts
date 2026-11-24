import { createHash, randomInt, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@massage-note/database";
import { BoardsService } from "../src/boards/boards.service.js";
import { DispatchSmsDeliveriesService } from "../src/boards/dispatch-sms-deliveries.service.js";
import { DispatchSmsScheduler } from "../src/boards/dispatch-sms-scheduler.service.js";
import { dispatchSmsClock, firstDispatchDate } from "../src/common/dispatch-sms-time.js";
import { deviceTimeContext } from "../src/common/device-time.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { StoreManagementService } from "../src/stores/store-management.service.js";

const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const scheduler = new DispatchSmsScheduler(prisma, boards);
const deliveries = new DispatchSmsDeliveriesService(prisma, access);
const stores = new StoreManagementService(prisma, access, idempotency);
const storeId = randomUUID();
const owner = { id: randomUUID() } as User;
const employee = { id: randomUUID() } as User;
const ownerId = randomUUID(), alex = randomUUID(), sam = randomUUID(), pat = randomUUID();
const timezone = "America/New_York";
const prefix = randomUUID().slice(0, 10).replace("-", "") + "a";
const token = `mna_${prefix}_${randomUUID()}`;
const auth = `Bearer ${token}`;
const config = { enabled: true, sendTimeLocal: "21:00", phoneE164: "+16465550123" };
const update = async (settings: { automaticDispatchEnabled?: boolean; dispatchSms?: typeof config }) => {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return stores.update(owner, storeId, { version: store.version, ...settings }, randomUUID(), randomUUID());
};
const at = (time: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(time));
};
const findDelivery = (date: string) => prisma.dispatchSmsDelivery.findUniqueOrThrow({
  where: { storeId_targetDate: { storeId, targetDate: new Date(date) } },
});

describe("dispatch SMS clock", () => {
  it("uses the store's calendar, including spring gaps, repeated hours and year changes", () => {
    expect(dispatchSmsClock(new Date("2026-12-31T05:05:00Z"), timezone)).toEqual({ date: "2026-12-31", time: "00:05", targetDate: "2027-01-01" });
    expect(dispatchSmsClock(new Date("2026-03-08T06:59:00Z"), timezone).time).toBe("01:59");
    expect(dispatchSmsClock(new Date("2026-03-08T07:00:00Z"), timezone).time).toBe("03:00");
    expect(dispatchSmsClock(new Date("2026-11-01T05:30:00Z"), timezone)).toEqual(dispatchSmsClock(new Date("2026-11-01T06:30:00Z"), timezone));
    expect(firstDispatchDate(new Date("2026-11-25T02:00:00Z"), timezone, "21:00")).toEqual(new Date("2026-11-25"));
  });
});

describe.skipIf(process.env.DATABASE_INTEGRATION_TESTS !== "1").sequential("automatic dispatch SMS", () => {
  beforeAll(async () => {
    for (const user of [owner, employee]) {
      await prisma.user.create({ data: { id: user.id, firebaseUid: `dispatch-${user.id}`, phoneE164: `+1917${randomInt(10000000, 99999999)}` } });
    }
    await prisma.store.create({ data: {
      id: storeId, name: "Dispatch test", storeCode: String(randomInt(0, 1_000_000)).padStart(6, "0"),
      status: "ACTIVE", timezone, businessCutoffLocal: "22:00", globalCommissionBps: 6000,
      weeklyDispatchEffectiveFrom: new Date("2026-11-24"),
      weeklyDispatchJson: { wednesday: [alex, sam], thursday: [alex, sam, pat], saturday: [alex] },
    } });
    await prisma.storeMembership.createMany({ data: [
      { id: ownerId, userId: owner.id, storeId, role: "OWNER", isServiceProvider: false, displayName: "Owner", displayNameNormalized: "owner" },
      { id: alex, userId: employee.id, storeId, role: "EMPLOYEE", employmentType: "PART_TIME", displayName: "Alex", displayNameNormalized: "alex" },
      { id: sam, storeId, role: "EMPLOYEE", employmentType: "PART_TIME", displayName: "Sam", displayNameNormalized: "sam" },
      { id: pat, storeId, role: "EMPLOYEE", employmentType: "PART_TIME", displayName: "Pat", displayNameNormalized: "pat" },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerId } });
    await prisma.closingDeliveryAgent.create({
      data: { storeId, tokenPrefix: prefix, tokenHash: createHash("sha256").update(token).digest("hex"), createdBy: owner.id },
    });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await prisma.dispatchSmsDelivery.deleteMany({ where: { storeId } });
    await prisma.dispatchSmsSettings.deleteMany({ where: { storeId } });
    await prisma.closingDeliveryAgent.deleteMany({ where: { storeId } });
    await prisma.auditLog.deleteMany({ where: { storeId } });
    await prisma.domainOutbox.deleteMany({ where: { storeId } });
    await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
    await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
    await prisma.dailyBoard.deleteMany({ where: { storeId } });
    await prisma.store.updateMany({ where: { id: storeId }, data: { ownerMembershipId: null } });
    await prisma.storeMembership.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, employee.id] } } });
    await prisma.$disconnect();
  });

  it("protects settings, initializes an unvisited board and authorizes only one send across instances", async () => {
    at("2026-11-25T01:59:00Z");
    await expect(update({ dispatchSms: config })).rejects.toMatchObject({ response: { code: "DISPATCH_SMS_RANKING_DISABLED" } });
    await update({ automaticDispatchEnabled: true, dispatchSms: config });
    expect(await stores.get(owner, storeId)).toMatchObject({ dispatchSms: config });
    expect(await stores.get(employee, storeId)).not.toHaveProperty("dispatchSms");
    await expect(deliveries.status(employee.id, storeId)).rejects.toThrow();
    await scheduler.tick();
    expect(await deliveries.claim(auth)).toBeNull();

    at("2026-11-25T02:00:00Z");
    await Promise.all([scheduler.tick(), new DispatchSmsScheduler(prisma, boards).tick()]);
    const job = await findDelivery("2026-11-25");
    expect(await prisma.dispatchSmsDelivery.count({ where: { storeId } })).toBe(1);
    expect(job.body?.split("\n")).toEqual(["2026-11-25排工顺序", expect.stringMatching(/^第一：(Alex|Sam)$/), expect.stringMatching(/^第二：(Alex|Sam)$/)]);
    expect(job.body).toContain("Alex");
    expect(job.body).toContain("Sam");
    const lease = (await deliveries.claim(auth))!;
    expect(await deliveries.prepare(auth, job.id, lease.leaseToken)).toEqual({ authorized: true, text: job.body });
    const authorized = await Promise.all(Array.from({ length: 2 }, () => deliveries.authorize(auth, job.id, lease.leaseToken)));
    expect(authorized.filter(value => value.authorized)).toEqual([{ authorized: true, dispatchRecorded: true }]);

    at("2026-11-25T05:01:00Z");
    const resumed = (await deliveries.claim(auth))!;
    expect(resumed).toMatchObject({ id: job.id, dispatchStarted: true });
    expect(await deliveries.authorize(auth, job.id, resumed.leaseToken)).toEqual({ authorized: false });
    await expect(deliveries.fail(auth, job.id, { leaseToken: resumed.leaseToken, code: "PRE_SEND_FAILURE", message: "Lost response", retryable: true })).resolves.toEqual({ retryScheduled: false });
    const receipt = { messageGuid: "dispatch-guid", state: "DELIVERED" as const, errorCode: 0, service: "SMS" };
    await expect(deliveries.receipt(auth, job.id, { attemptCount: 1, receipt })).resolves.toEqual({ recorded: true });
    expect(await deliveries.status(owner.id, storeId)).toMatchObject({ targetDate: "2026-11-25", status: "SENT", deliveryStatus: "DELIVERED" });
  });

  it("keeps manual ordering and visibility, then invalidates a claimed job after a number change", async () => {
    const date = "2026-11-26";
    at("2026-11-26T01:30:00Z");
    const expectedOrder = await deviceTimeContext.run({ timezone, now: new Date() }, async () => {
      await boards.applyWeeklyDispatch(owner, storeId, date, randomUUID());
      const board = await prisma.dailyBoard.findUniqueOrThrow({
        where: { storeId_businessDate: { storeId, businessDate: new Date(date) } },
        include: { rows: { orderBy: { position: "asc" }, include: { membership: { select: { displayName: true } } } } },
      });
      await boards.reorder(owner, storeId, date, { version: board.version, rowIds: board.rows.map(row => row.id).reverse() }, randomUUID(), randomUUID());
      await prisma.dailyEmployeeRow.update({ where: { id: board.rows[0]!.id }, data: { isHidden: true } });
      return board.rows.slice(1).reverse().map(row => row.membership.displayName);
    });
    at("2026-11-26T02:20:00Z");
    await scheduler.tick();
    const job = await findDelivery(date);
    expect(job.body).toBe(`2026-11-26排工顺序\n第一：${expectedOrder[0]}\n第二：${expectedOrder[1]}`);
    const claimed = (await deliveries.claim(auth))!;
    await update({ dispatchSms: { ...config, phoneE164: "+16465550124" } });
    expect(await deliveries.authorize(auth, job.id, claimed.leaseToken)).toEqual({ authorized: false });
    await scheduler.tick();
    expect(await findDelivery(date)).toMatchObject({ status: "CANCELLED", lastErrorCode: "SETTINGS_CHANGED" });
    expect(await deliveries.claim(auth)).toBeNull();
  });

  it("queues a known rest day, expires it at midnight and skips a board pending generation", async () => {
    at("2026-11-27T02:00:00Z");
    await scheduler.tick();
    expect(await findDelivery("2026-11-27")).toMatchObject({ body: "2026-11-27排工顺序\n明日暂无排工", status: "QUEUED" });
    at("2026-11-27T05:01:00Z");
    expect(await deliveries.claim(auth)).toBeNull();
    await scheduler.tick();
    expect(await findDelivery("2026-11-27")).toMatchObject({ status: "CANCELLED", lastErrorCode: "EXPIRED" });

    await prisma.dailyBoard.create({ data: { storeId, businessDate: new Date("2026-11-28"), rankingPending: true } });
    at("2026-11-28T02:00:00Z");
    await scheduler.tick();
    expect(await findDelivery("2026-11-28")).toMatchObject({ status: "CANCELLED", lastErrorCode: "RANKING_NOT_READY" });
    await update({ automaticDispatchEnabled: false });
    await update({ automaticDispatchEnabled: true });
    expect(await stores.get(owner, storeId)).toMatchObject({ dispatchSms: { enabled: false, sendTimeLocal: "21:00", phoneE164: "+16465550124" } });
  });
});
