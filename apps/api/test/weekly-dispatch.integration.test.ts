import { deviceTimeContext } from "../src/common/device-time.js";
import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const storeId = randomUUID();
const ownerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("每周排工", () => {
  it("今日日期使用设备时间和时区，不受店铺关门时间影响", async () => {
    const day = await deviceTimeContext.run({ timezone: "Asia/Tokyo", now: new Date("2026-09-14T03:30:00Z") }, () => boards.currentBusinessDay(actor(ownerId), storeId));
    expect(day.businessDate).toBe("2026-09-14");
    expect(day.timezone).toBe("Asia/Tokyo");
  });

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `board-test-${id}`,
        phoneE164: `+1347${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "表格集成测试店",
        timezone: "America/New_York",
        businessCutoffLocal: "22:00",
        globalCommissionBps: 5_000,
        status: "ACTIVE",
      },
    });
    await prisma.storeMembership.createMany({
      data: [
        {
          id: ownerMembershipId,
          storeId,
          userId: ownerId,
          role: "OWNER",
          employmentType: "FULL_TIME",
          displayName: "表格店主",
          displayNameNormalized: "表格店主",
        },
        {
          id: employeeMembershipId,
          storeId,
          userId: employeeId,
          role: "EMPLOYEE",
          employmentType: "PART_TIME",
          displayName: "表格员工",
          displayNameNormalized: "表格员工",
        },
      ],
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.shift.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({
        where: { id: storeId },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, employeeId] } },
      });
    }
    await prisma.$disconnect();
  });

  const day = "2026-10-05";
  const tomorrow = "2026-10-06";
  const at = <T>(date: string, task: () => T) => deviceTimeContext.run({ timezone: "Asia/Tokyo", now: new Date(`${date}T00:30:00Z`) }, task);
  const empty = () => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });

  it("模板立即生效，版本冲突和员工权限受保护，重放不重复保存", async () => {
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    const input = { version: config.version, schedule: { ...empty(), tuesday: [employeeMembershipId, ownerMembershipId] } };
    await expect(boards.getWeeklyDispatch(actor(employeeId), storeId)).rejects.toBeInstanceOf(ForbiddenException);
    const result = await at(day, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, input, "weekly-save-00000001", "weekly-save"));
    expect(result.effectiveFrom).toBe(day);
    const replay = await at(day, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, input, "weekly-save-00000001", "weekly-replay"));
    expect(replay).toEqual(result);
    await expect(at(day, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, input, "weekly-save-00000002", "weekly-conflict"))).rejects.toBeInstanceOf(ConflictException);
    await expect(at(day, () => boards.applyWeeklyDispatch(actor(employeeId), storeId, tomorrow, "weekly-future"))).rejects.toBeInstanceOf(ForbiddenException);

  });

  it("普通员工打开当日也自动加入人员，并发初始化只应用一次且沿用轮转规则", async () => {
    await prisma.store.update({ where: { id: storeId }, data: { automaticDispatchEnabled: true } });
    const previous = await prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(`${day}T00:00:00Z`) } });
    await prisma.dailyEmployeeRow.createMany({ data: [
      { boardId: previous.id, storeId, membershipId: ownerMembershipId, position: 1, addedBy: ownerId },
      { boardId: previous.id, storeId, membershipId: employeeMembershipId, position: 2, addedBy: ownerId },
    ] });
    const results = await at(tomorrow, () => Promise.all([
      boards.applyWeeklyDispatch(actor(employeeId), storeId, tomorrow, "weekly-apply-a"),
      boards.applyWeeklyDispatch(actor(ownerId), storeId, tomorrow, "weekly-apply-b"),
    ]));
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    const board = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${tomorrow}T00:00:00Z`) } }, include: { rows: { orderBy: { position: "asc" } } } });
    expect(board.rows.map((row) => row.membershipId)).toEqual([employeeMembershipId, ownerMembershipId]);
    expect(board.rankingExplanation).toBeTruthy();
    expect(board.weeklyDispatchAppliedAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { storeId, action: "board.weekly_dispatch_applied" } })).toBe(1);
    expect(await prisma.domainOutbox.count({ where: { storeId, topic: "board.weekly_dispatch_applied" } })).toBe(1);
    await prisma.dailyEmployeeRow.deleteMany({ where: { boardId: board.id, membershipId: employeeMembershipId } });
    expect(await at(tomorrow, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, tomorrow, "weekly-after-removal"))).toEqual({ applied: false });
    expect(await prisma.dailyEmployeeRow.count({ where: { boardId: board.id } })).toBe(1);
  });

  it("今天即可查看明天，重复刷新不写入，今天调序及模板修改会更新明天", async () => {
    const previewDay = "2026-10-12";
    const target = "2026-10-13";
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: config.version, schedule: { ...empty(), tuesday: [ownerMembershipId, employeeMembershipId] } }, "weekly-preview-save-01", "preview-save"));
    const previous = await prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(`${previewDay}T00:00:00Z`) } });
    await prisma.dailyEmployeeRow.createMany({ data: [
      { boardId: previous.id, storeId, membershipId: ownerMembershipId, position: 1, addedBy: ownerId },
      { boardId: previous.id, storeId, membershipId: employeeMembershipId, position: 2, addedBy: ownerId },
    ] });
    expect(await at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "preview-first"))).toMatchObject({ applied: true, addedCount: 2, ranked: true });
    const read = () => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${target}T00:00:00Z`) } }, include: { rows: { orderBy: { position: "asc" } } } });
    const initial = await read();
    expect(initial.rows.map(row => row.membershipId)).toEqual([employeeMembershipId, ownerMembershipId]);
    expect(await at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "preview-repeat"))).toEqual({ applied: false });
    expect((await read()).version).toBe(initial.version);
    await prisma.dailyEmployeeRow.updateMany({ where: { boardId: previous.id, membershipId: ownerMembershipId }, data: { position: 3 } });
    expect(await at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "preview-new-history"))).toMatchObject({ applied: true, ranked: true });
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId, employeeMembershipId]);
    const latest = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: latest.version, schedule: { ...empty(), tuesday: [employeeMembershipId] } }, "weekly-preview-save-02", "preview-edit"));
    await at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "preview-new-template"));
    expect((await read()).rows.map(row => row.membershipId)).toEqual([employeeMembershipId]);
    await prisma.dailyEmployeeRow.create({ data: { boardId: initial.id, storeId, membershipId: ownerMembershipId, position: 2, addedBy: ownerId } });
    await at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "preview-manual"));
    expect((await read()).rows.map(row => row.membershipId)).toContain(ownerMembershipId);
    await prisma.dailyEmployeeRow.deleteMany({ where: { boardId: initial.id } });
    await prisma.dailyBoard.delete({ where: { id: initial.id } });
  });

  it("跳过历史和日结日期，模板变化不覆盖已安排日期", async () => {
    expect(await at(tomorrow, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, day, "weekly-past"))).toEqual({ applied: false });
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(day, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: config.version, schedule: { ...empty(), tuesday: [employeeMembershipId] } }, "weekly-change-0000001", "weekly-change"));
    expect(await at(tomorrow, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, tomorrow, "weekly-changed"))).toEqual({ applied: false });
    const closedDate = "2026-10-13";
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date(`${closedDate}T00:00:00Z`), closedBy: ownerId, cycleNo: 1, warningSnapshotJson: [], totalsSnapshotJson: {} } });
    expect(await at(closedDate, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, closedDate, "weekly-closed"))).toEqual({ applied: false });
    expect(await prisma.dailyBoard.count({ where: { storeId, businessDate: new Date(`${closedDate}T00:00:00Z`) } })).toBe(0);
  });
});
