import { deviceTimeContext } from "../src/common/device-time.js";
import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoardsService } from "../src/boards/boards.service.js";
import { DailyRankingService } from "../src/boards/daily-ranking.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const ranking = new DailyRankingService(access, idempotency);
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

  it("明天手动移除优先于模板，支持重加，空行隐藏和全员移除也不会恢复", async () => {
    const previewDay = "2026-10-19";
    const target = "2026-10-20";
    const nextWeek = "2026-10-27";
    const schedule = { ...empty(), tuesday: [ownerMembershipId, employeeMembershipId] };
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: config.version, schedule }, "manual-remove-save-01", "manual-remove-save"));
    const apply = (date = target) => at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, date, "manual-remove-apply"));
    const read = () => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${target}T00:00:00Z`) } }, include: { rows: true } });
    await apply();
    const employeeRow = (await read()).rows.find(row => row.membershipId === employeeMembershipId)!;
    await at(previewDay, () => boards.removeRow(actor(ownerId), storeId, target, employeeRow.id, { version: employeeRow.version }, "manual-remove-employee", "manual-remove"));
    await apply();
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId]);
    const stable = await read();
    expect(await apply()).toEqual({ applied: false });
    expect((await read()).version).toBe(stable.version);

    // Template edits do not undo a daily removal, and the next week is unaffected.
    const latest = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: latest.version, schedule: { ...empty(), tuesday: [ownerMembershipId] } }, "manual-remove-save-02", "manual-remove-resave"));
    await apply();
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId]);
    const edited = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: edited.version, schedule }, "manual-remove-save-03", "manual-remove-restore-template"));
    await apply();
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId]);
    await apply(nextWeek);
    expect(await prisma.dailyEmployeeRow.count({ where: { storeId, board: { businessDate: new Date(`${nextWeek}T00:00:00Z`) } } })).toBe(2);

    await at(previewDay, () => boards.addRow(actor(ownerId), storeId, target, { membershipId: employeeMembershipId }, "manual-readd-employee", "manual-readd"));
    await apply();
    expect((await read()).rows.map(row => row.membershipId)).toContain(employeeMembershipId);
    const readded = (await read()).rows.find(row => row.membershipId === employeeMembershipId)!;
    expect(await at(previewDay, () => boards.updateRow(actor(ownerId), storeId, target, readded.id, { version: readded.version, isHidden: true }, "manual-hide-employee", "manual-hide"))).toMatchObject({ removed: true });
    await apply();
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId]);
    const ownerRow = (await read()).rows[0]!;
    await at(previewDay, () => boards.removeRow(actor(ownerId), storeId, target, ownerRow.id, { version: ownerRow.version }, "manual-remove-owner", "manual-remove-all"));
    await apply();
    expect((await read()).rows).toHaveLength(0);
    expect(await apply()).toEqual({ applied: false });
    expect(await at(target, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "manual-remove-today"))).toEqual({ applied: false });
    expect((await read()).rows).toHaveLength(0);
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

  it("应用当前勾选覆盖当日手动名单，不保存模板，重放不重复写入", async () => {
    const date = "2026-11-02";
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    const input = { version: config.version, schedule: { ...empty(), monday: [employeeMembershipId] } };
    await at(date, () => boards.addRow(actor(ownerId), storeId, date, { membershipId: ownerMembershipId }, "replace-manual-row-01", "replace-manual"));
    await at(date, () => boards.addRow(actor(ownerId), storeId, date, { membershipId: employeeMembershipId }, "replace-manual-row-02", "replace-manual"));
    const initial = await prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${date}T00:00:00Z`) } }, include: { rows: true } });
    await at(date, () => boards.removeRow(actor(ownerId), storeId, date, initial.rows.find(row => row.membershipId === employeeMembershipId)!.id, { version: 1 }, "replace-remove-row-01", "replace-remove"));
    const apply = () => at(date, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, date, input, "replace-dispatch-0001", "replace-dispatch"));
    const result = await apply();
    expect(result).toMatchObject({ applied: true, addedCount: 1, ranked: true });
    const read = () => prisma.dailyBoard.findUniqueOrThrow({ where: { id: initial.id }, include: { rows: true } });
    const applied = await read();
    expect(applied.rows.map(row => row.membershipId)).toEqual([employeeMembershipId]);
    expect(applied.rankingExplanation).toBeTruthy();
    expect(await boards.getWeeklyDispatch(actor(ownerId), storeId)).toEqual(config);
    expect(await apply()).toEqual(result);
    expect((await read()).version).toBe(applied.version);
    expect(await at(date, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, date, "replace-refresh"))).toEqual({ applied: false });
    await expect(at(date, () => boards.replaceWeeklyDispatch(actor(employeeId), storeId, date, input, "replace-forbidden-01", "replace-forbidden"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(at(date, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, date, { ...input, version: input.version - 1 }, "replace-conflict-0001", "replace-conflict"))).rejects.toBeInstanceOf(ConflictException);
    await at(date, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, date, { ...input, schedule: empty() }, "replace-empty-000001", "replace-empty"));
    expect((await read()).rows).toHaveLength(0);
    expect((await read()).rankingExplanation).toBeNull();
  });

  it("任何员工已有记工（含待结账与删除历史）时应用失败且不更改排工", async () => {
    const date = "2026-11-03";
    await at(date, () => boards.addRow(actor(ownerId), storeId, date, { membershipId: ownerMembershipId }, "replace-record-row01", "replace-record-row"));
    const read = () => prisma.dailyBoard.findUniqueOrThrow({ where: { storeId_businessDate: { storeId, businessDate: new Date(`${date}T00:00:00Z`) } }, include: { rows: true } });
    const before = await read();
    const record = await prisma.workRecord.create({ data: {
      storeId, employeeMembershipId: ownerMembershipId, businessDate: new Date(`${date}T00:00:00Z`),
      storeTimezoneSnapshot: "Asia/Tokyo", businessCutoffSnapshot: "00:00", startAt: new Date(`${date}T00:30:00Z`), status: "PENDING_PAYMENT",
      mainServiceAmountCents: 0, grossFeeBaseCents: 0, discountedFeePerformanceCents: 0,
      mainServiceWageCents: 0, totalLargeFeeWageCents: 0, createdBy: ownerId, updatedBy: ownerId,
    } });
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    const input = { version: config.version, schedule: { ...empty(), tuesday: [employeeMembershipId] } };
    for (const deleted of [false, true]) {
      if (deleted) await prisma.workRecord.update({ where: { id: record.id }, data: { deletedAt: new Date(), deletedBy: ownerId, deleteReason: "测试" } });
      await expect(at(date, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, date, input, `replace-record-${deleted}`, "replace-record"))).rejects.toMatchObject({ response: { code: "WEEKLY_DISPATCH_HAS_WORK_RECORDS" } });
      expect(await read()).toEqual(before);
      expect(await boards.getWeeklyDispatch(actor(ownerId), storeId)).toEqual(config);
    }
  });

  it("应用目标日期拒绝历史和日结，未来日期采用该星期当前勾选", async () => {
    const date = "2026-11-09";
    const target = "2026-11-10";
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    const input = { version: config.version, schedule: { ...empty(), tuesday: [employeeMembershipId] } };
    await expect(at(target, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, date, input, "replace-past-000001", "replace-past"))).rejects.toBeInstanceOf(ForbiddenException);
    await at(date, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, target, input, "replace-future-0001", "replace-future"));
    expect(await at(date, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "replace-future-refresh"))).toEqual({ applied: false });
    expect(await prisma.dailyEmployeeRow.count({ where: { storeId, membershipId: employeeMembershipId, board: { businessDate: new Date(`${target}T00:00:00Z`) } } })).toBe(1);
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date(`${target}T00:00:00Z`), closedBy: ownerId, cycleNo: 1, warningSnapshotJson: [], totalsSnapshotJson: {} } });
    await expect(at(target, () => boards.replaceWeeklyDispatch(actor(ownerId), storeId, target, input, "replace-closed-0001", "replace-closed"))).rejects.toMatchObject({ response: { code: "BUSINESS_DAY_CLOSED" } });
  });

  const prepareFuture = async (previewDay: string, target: string, apply = true) => {
    const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
    await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, {
      version: config.version, schedule: { ...empty(), tuesday: [ownerMembershipId, employeeMembershipId] },
    }, `manual-order-template-${target}`, "manual-order-template"));
    const previous = await prisma.dailyBoard.create({ data: { storeId, businessDate: new Date(`${previewDay}T00:00:00Z`) } });
    await prisma.dailyEmployeeRow.createMany({ data: [
      { boardId: previous.id, storeId, membershipId: ownerMembershipId, position: 1, addedBy: ownerId },
      { boardId: previous.id, storeId, membershipId: employeeMembershipId, position: 2, addedBy: ownerId },
    ] });
    const refresh = () => at(previewDay, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "manual-order-refresh"));
    const read = () => prisma.dailyBoard.findUniqueOrThrow({
      where: { storeId_businessDate: { storeId, businessDate: new Date(`${target}T00:00:00Z`) } },
      include: { rows: { orderBy: { position: "asc" } } },
    });
    if (apply) await refresh();
    return { previous, refresh, read };
  };

  it("未来手动上下移动在刷新和历史变化后保持，模板增删仍同步且不重排已有员工", async () => {
    const previewDay = "2026-11-16";
    const target = "2026-11-17";
    const { previous, refresh, read } = await prepareFuture(previewDay, target);
    const initial = await read();
    expect(initial.rows.map(row => row.membershipId)).toEqual([employeeMembershipId, ownerMembershipId]);
    const input = { version: initial.version, rowIds: initial.rows.map(row => row.id).reverse() };
    const reorder = () => at(previewDay, () => boards.reorder(actor(ownerId), storeId, target, input, "future-manual-order-01", "future-manual-order"));
    const moved = await reorder();
    const stable = await read();
    const auditCount = await prisma.auditLog.count({ where: { storeId, entityId: stable.id } });
    const outboxCount = await prisma.domainOutbox.count({ where: { storeId, aggregateId: stable.id } });
    expect(await refresh()).toEqual({ applied: false });
    expect(await read()).toEqual(stable);
    await prisma.dailyEmployeeRow.updateMany({ where: { boardId: previous.id, membershipId: ownerMembershipId }, data: { position: 3 } });
    expect(await refresh()).toEqual({ applied: false });
    expect(await read()).toEqual(stable);
    expect(await prisma.auditLog.count({ where: { storeId, entityId: stable.id } })).toBe(auditCount);
    expect(await prisma.domainOutbox.count({ where: { storeId, aggregateId: stable.id } })).toBe(outboxCount);
    expect(await reorder()).toEqual(JSON.parse(JSON.stringify(moved)));
    await expect(at(previewDay, () => boards.reorder(actor(ownerId), storeId, target, input, "future-manual-stale-01", "future-manual-stale"))).rejects.toMatchObject({ response: { code: "BOARD_VERSION_CONFLICT" } });
    await expect(at(previewDay, () => boards.reorder(actor(employeeId), storeId, target, { ...input, version: stable.version }, "future-manual-denied-01", "future-manual-denied"))).rejects.toBeInstanceOf(ForbiddenException);

    const extra = await prisma.storeMembership.create({ data: {
      storeId, role: "EMPLOYEE", employmentType: "FULL_TIME", displayName: "调序新增员工", displayNameNormalized: "调序新增员工",
    } });
    const saveTemplate = async (ids: string[], key: string) => {
      const config = await boards.getWeeklyDispatch(actor(ownerId), storeId);
      await at(previewDay, () => boards.saveWeeklyDispatch(actor(ownerId), storeId, { version: config.version, schedule: { ...empty(), tuesday: ids } }, key, key));
    };
    await saveTemplate([extra.id, employeeMembershipId, ownerMembershipId], "future-manual-add-template");
    expect(await refresh()).toMatchObject({ applied: true, addedCount: 1, ranked: false });
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId, employeeMembershipId, extra.id]);
    await saveTemplate([ownerMembershipId, employeeMembershipId], "future-manual-remove-template");
    expect(await refresh()).toMatchObject({ applied: true, addedCount: 0, ranked: false });
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId, employeeMembershipId]);
    expect(await refresh()).toEqual({ applied: false });
    expect(await at(target, () => boards.applyWeeklyDispatch(actor(ownerId), storeId, target, "future-manual-becomes-today"))).toEqual({ applied: false });
  });

  it("主动重新生成解除手动顺序保护，之后再上下移动仍保持，并按版本区分同毫秒审计", async () => {
    const previewDay = "2026-11-23";
    const target = "2026-11-24";
    const { previous, refresh, read } = await prepareFuture(previewDay, target);
    const initial = await read();
    await at(previewDay, () => boards.reorder(actor(ownerId), storeId, target, { version: initial.version, rowIds: initial.rows.map(row => row.id).reverse() }, "future-regenerate-move-01", "future-regenerate-move"));
    const manual = await read();
    await at(previewDay, () => ranking.rank(actor(ownerId), storeId, target, { version: manual.version }, "future-regenerate-rank-01", "future-regenerate-rank"));
    const regenerated = await read();
    expect(regenerated.rows.map(row => row.membershipId)).toEqual([employeeMembershipId, ownerMembershipId]);
    // UUID order and millisecond timestamps do not identify the latest action.
    const sameTime = new Date("2026-10-04T12:00:00Z");
    await prisma.auditLog.updateMany({ where: { storeId, entityId: initial.id, action: { in: ["board.rows_reordered", "board.rows_ranked"] } }, data: { createdAt: sameTime } });
    await prisma.dailyEmployeeRow.updateMany({ where: { boardId: previous.id, membershipId: ownerMembershipId }, data: { position: 3 } });
    expect(await refresh()).toMatchObject({ applied: true, ranked: true });
    const refreshed = await read();
    expect(refreshed.rows.map(row => row.membershipId)).toEqual([ownerMembershipId, employeeMembershipId]);
    await at(previewDay, () => boards.reorder(actor(ownerId), storeId, target, { version: refreshed.version, rowIds: refreshed.rows.map(row => row.id).reverse() }, "future-regenerate-move-02", "future-regenerate-move-again"));
    await prisma.auditLog.updateMany({ where: { storeId, entityId: initial.id, action: "board.rows_reordered" }, data: { createdAt: sameTime } });
    const movedAgain = await read();
    expect(await refresh()).toEqual({ applied: false });
    expect(await read()).toEqual(movedAgain);
  });

  it("未来日期首次应用模板也保留此前手动排序", async () => {
    const previewDay = "2026-11-30";
    const target = "2026-12-01";
    const { refresh, read } = await prepareFuture(previewDay, target, false);
    for (const membershipId of [employeeMembershipId, ownerMembershipId]) {
      await at(previewDay, () => boards.addRow(actor(ownerId), storeId, target, { membershipId }, `before-template-add-${membershipId}`, "before-template-add"));
    }
    const initial = await read();
    await at(previewDay, () => boards.reorder(actor(ownerId), storeId, target, { version: initial.version, rowIds: initial.rows.map(row => row.id).reverse() }, "before-template-reorder", "before-template-reorder"));
    expect(await refresh()).toMatchObject({ applied: true, addedCount: 0, ranked: false });
    expect((await read()).rows.map(row => row.membershipId)).toEqual([ownerMembershipId, employeeMembershipId]);
    expect(await refresh()).toEqual({ applied: false });
  });

});
