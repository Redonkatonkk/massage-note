import { randomInt, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { PayrollSettlementsService } from "../src/finance/payroll-settlements.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const workRecords = new WorkRecordsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const cash = new CashSettlementsService(prisma, access, idempotency);
const payroll = new PayrollSettlementsService(prisma, access, idempotency);
const finance = new FinanceQueriesService(prisma, access);
const storeId = randomUUID();
const ownerId = randomUUID();
const managerId = randomUUID();
const employeeId = randomUUID();
const ownerMembershipId = randomUUID();
const managerMembershipId = randomUUID();
const employeeMembershipId = randomUUID();
const serviceItemId = randomUUID();
const actor = (id: string) => ({ id }) as User;

describe.skipIf(!enabled).sequential("日结、现金、工资与财务持久化", () => {
  let businessDate = "";
  let recordId = "";
  let recordVersion = 0;
  let closingVersion = 0;
  let payrollId = "";
  let payrollVersion = 0;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, managerId, employeeId].map((id, index) => ({
        id,
        firebaseUid: `finance-test-${id}`,
        phoneE164: `+1646${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
      })),
    });
    await prisma.store.create({
      data: {
        id: storeId,
        storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"),
        name: "财务集成测试店",
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
          displayName: "财务店主",
          displayNameNormalized: "财务店主",
        },
        {
          id: managerMembershipId,
          storeId,
          userId: managerId,
          role: "MANAGER",
          displayName: "财务经理",
          displayNameNormalized: "财务经理",
        },
        {
          id: employeeMembershipId,
          storeId,
          userId: employeeId,
          role: "EMPLOYEE",
          displayName: "财务员工",
          displayNameNormalized: "财务员工",
        },
      ],
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
    await prisma.serviceItem.create({
      data: {
        id: serviceItemId,
        storeId,
        fullName: "100 元测试项目",
        shortName: "100元",
        durationMinutes: 60,
        priceCents: 10_000n,
        defaultCommissionBps: 6_000,
        position: 1,
        priceOptions: { create: { durationMinutes: 60, priceCents: 10_000n, position: 0 } },
      },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.payrollSettlement.deleteMany({ where: { storeId } });
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.paymentBreakdown.deleteMany({
        where: { workRecord: { storeId } },
      });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({
        where: { id: storeId },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, managerId, employeeId] } },
      });
    }
    await prisma.$disconnect();
  });

  it("确认付款后按现金比例计算每日现金与老板尚欠", async () => {
    const created = await workRecords.create(
      actor(employeeId),
      storeId,
      {
        employeeMembershipId,
        startAt: new Date().toISOString(),
        serviceItemId,
        isHighlighted: true,
      },
      "finance-create-record-0001",
      "finance-create-record",
    );
    expect(created.isHighlighted).toBe(true);
    const confirmed = await workRecords.confirmPayment(
      actor(employeeId),
      storeId,
      created.id,
      {
        version: created.version,
        cashServiceCents: 4_000,
        cardServiceCents: 6_000,
        cashTipCents: 1_000,
        cardTipCents: 2_000,
      },
      "finance-confirm-record-0001",
      "finance-confirm-record",
    );
    businessDate = confirmed.businessDate.toISOString().slice(0, 10);
    recordId = confirmed.id;
    recordVersion = confirmed.version;

    const preview = await cash.list(actor(managerId), storeId, businessDate);
    expect(preview.rows.map((row) => row.membershipId)).toEqual([
      employeeMembershipId,
    ]);
    const employeeCash = preview.rows.find(
      (row) => row.membershipId === employeeMembershipId,
    );
    expect(employeeCash).toMatchObject({
      cashServiceCents: 4_000n,
      cashTipCents: 1_000n,
      cashReceivedCents: 5_000n,
      cashAllocatedServiceWageCents: 2_400n,
      cashAcquiredServiceWageCents: 2_400n,
      cashWageShortfallCents: 0n,
      cashRetainedCents: 3_400n,
      cashToSubmitToStoreCents: 1_600n,
      status: "UNSETTLED",
      version: 0,
    });

    const attempts = await Promise.allSettled([
      cash.settle(
        actor(managerId),
        storeId,
        businessDate,
        employeeMembershipId,
        { version: 0, note: "员工已交现金" },
        "cash-settle-employee-0001",
        "cash-settle-employee-1",
      ),
      cash.settle(
        actor(managerId),
        storeId,
        businessDate,
        employeeMembershipId,
        { version: 0, note: "并发重复结清" },
        "cash-settle-employee-0002",
        "cash-settle-employee-2",
      ),
    ]);
    const fulfilled = attempts.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<CashSettlementsService["settle"]>>> =>
        result.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);
    const settled = fulfilled[0]!.value;
    expect(settled).toMatchObject({ status: "SETTLED", version: 1 });

    const balance = await finance.myBalance(actor(employeeId), storeId);
    expect(balance).toMatchObject({
      cumulativeEmployeeIncomeCents: 9_000n,
      settledCashAcquiredCents: 3_400n,
      payrollPaidCents: 0n,
      employerOwesCents: 5_600n,
      overpaidCents: 0n,
    });
  });

  it("个人日结只返回目标员工数据，普通员工不能查看他人或全店日结", async () => {
    const own = await closings.previewMember(
      actor(employeeId),
      storeId,
      businessDate,
      employeeMembershipId,
    );
    expect(own).toMatchObject({
      storeName: "财务集成测试店",
      businessDate,
      isClosed: false,
      employee: {
        membershipId: employeeMembershipId,
        displayName: "财务员工",
        recordCount: 1,
        grossFeeBaseCents: 10_000,
        totalTipCents: 3_000,
        totalLargeFeeWageCents: 6_000,
        employeeIncomeCents: 9_000,
        cashToSubmitToStoreCents: 4_000,
        cashLargeFeeDividendCents: 2_400,
        cashTipDividendCents: 1_000,
        cardLargeFeeDividendCents: 3_600,
        cardTipDividendCents: 2_000,
      },
    });
    expect(own).not.toHaveProperty("storeTotals");
    expect(own).not.toHaveProperty("employees");
    await expect(
      closings.previewMember(
        actor(employeeId),
        storeId,
        businessDate,
        managerMembershipId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      closings.preview(actor(employeeId), storeId, businessDate),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const managerView = await closings.previewMember(
      actor(managerId),
      storeId,
      businessDate,
      employeeMembershipId,
    );
    expect(managerView.employee.membershipId).toBe(employeeMembershipId);
  });

  it("工资账本支持部分支付、超付、软删除与恢复，并排除店主", async () => {
    const settlement = await payroll.create(
      actor(managerId),
      storeId,
      {
        membershipId: employeeMembershipId,
        settlementDate: businessDate,
        periodStart: businessDate,
        periodEnd: businessDate,
        serviceWageCents: 3_000,
        cashTipCents: 0,
        cardTipCents: 0,
        adjustmentCents: 0,
        paymentMethod: "ZELLE",
        note: "部分支付",
      },
      "payroll-create-0001",
      "payroll-create",
    );
    payrollId = settlement.id;
    payrollVersion = settlement.version;
    expect(settlement.totalPaidCents).toBe(3_000n);
    await expect(
      payroll.create(
        actor(managerId),
        storeId,
        {
          membershipId: ownerMembershipId,
          settlementDate: businessDate,
          periodStart: businessDate,
          periodEnd: businessDate,
          serviceWageCents: 1,
          cashTipCents: 0,
          cardTipCents: 0,
          adjustmentCents: 0,
          paymentMethod: "CASH",
          note: "不应成功",
        },
        "owner-payroll-forbidden-0001",
        "owner-payroll-forbidden",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const updated = await payroll.update(
      actor(managerId),
      storeId,
      payrollId,
      { version: payrollVersion, serviceWageCents: 6_000, note: "超额支付" },
      "payroll-update-0001",
      "payroll-update",
    );
    payrollVersion = updated.version;
    expect(updated.totalPaidCents).toBe(6_000n);
    await expect(finance.myBalance(actor(employeeId), storeId)).resolves.toMatchObject({
      employerOwesCents: 0n,
      overpaidCents: 400n,
    });

    const deleted = await payroll.remove(
      actor(managerId),
      storeId,
      payrollId,
      { version: payrollVersion, reason: "测试删除" },
      "payroll-delete-0001",
      "payroll-delete",
    );
    payrollVersion = deleted.version;
    await expect(finance.myBalance(actor(employeeId), storeId)).resolves.toMatchObject({
      employerOwesCents: 5_600n,
      overpaidCents: 0n,
    });
    const restored = await payroll.restore(
      actor(managerId),
      storeId,
      payrollId,
      { version: payrollVersion },
      "payroll-restore-0001",
      "payroll-restore",
    );
    payrollVersion = restored.version;
    await expect(finance.myBalance(actor(employeeId), storeId)).resolves.toMatchObject({
      employerOwesCents: 0n,
      overpaidCents: 400n,
    });
  });

  it("正常日结锁定记工，取消日结会回退现金状态", async () => {
    const preview = await closings.preview(actor(managerId), storeId, businessDate);
    expect(preview).toMatchObject({ hasWarnings: false, isClosed: false });
    const closed = await closings.close(
      actor(managerId),
      storeId,
      businessDate,
      { force: false },
      "closing-normal-0001",
      "closing-normal",
    );
    closingVersion = closed.closing.version;
    expect(closed.closing).toMatchObject({ status: "CLOSED", cycleNo: 1 });
    await expect(
      workRecords.update(
        actor(employeeId),
        storeId,
        recordId,
        { version: recordVersion, note: "日结后不允许" },
        "closed-record-update-0001",
        "closed-record-update",
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const cancelled = await closings.cancel(
      actor(managerId),
      storeId,
      businessDate,
      { version: closingVersion, reason: "需要补充记录" },
      "closing-cancel-0001",
      "closing-cancel",
    );
    expect(cancelled).toMatchObject({ reopenedCashSettlementCount: 1 });
    const afterCancel = await cash.list(actor(managerId), storeId, businessDate);
    expect(
      afterCancel.rows.find((row) => row.membershipId === employeeMembershipId),
    ).toMatchObject({ status: "UNSETTLED", version: 2 });
  });

  it("一键现金结清使用完整版本集合，修改记工后自动回退", async () => {
    const managerRecord = await workRecords.create(
      actor(managerId),
      storeId,
      {
        employeeMembershipId: managerMembershipId,
        startAt: `${businessDate}T17:00:00.000Z`,
        serviceItemId,
      },
      "finance-create-manager-record-0001",
      "finance-create-manager-record",
    );
    await workRecords.confirmPayment(
      actor(managerId),
      storeId,
      managerRecord.id,
      {
        version: managerRecord.version,
        cashServiceCents: 0,
        cardServiceCents: 10_000,
        cashTipCents: 0,
        cardTipCents: 0,
      },
      "finance-confirm-manager-record-0001",
      "finance-confirm-manager-record",
    );
    const before = await cash.list(actor(managerId), storeId, businessDate);
    expect(before.rows).toHaveLength(2);
    expect(before.rows.some((row) => row.membershipId === ownerMembershipId)).toBe(
      false,
    );
    const settled = await cash.settleAll(
      actor(managerId),
      storeId,
      businessDate,
      {
        settlements: before.rows.map((row) => ({
          membershipId: row.membershipId,
          version: row.version,
        })),
      },
      "cash-settle-all-0001",
      "cash-settle-all",
    );
    expect(settled.settlements).toHaveLength(2);
    expect(settled.settlements.every((item) => item.status === "SETTLED")).toBe(
      true,
    );

    const updated = await workRecords.update(
      actor(employeeId),
      storeId,
      recordId,
      { version: recordVersion, note: "触发现金回退" },
      "record-reopen-cash-0001",
      "record-reopen-cash",
    );
    recordVersion = updated.version;
    const reopened = await cash.list(actor(managerId), storeId, businessDate);
    expect(reopened.rows.every((row) => row.status === "UNSETTLED")).toBe(true);
    const automaticAudits = await prisma.auditLog.count({
      where: { storeId, action: "cash_settlement.reopened_automatically" },
    });
    expect(automaticAudits).toBe(2);

    await cash.settleAll(
      actor(managerId),
      storeId,
      businessDate,
      {
        settlements: reopened.rows.map((row) => ({
          membershipId: row.membershipId,
          version: row.version,
        })),
      },
      "cash-settle-all-0002",
      "cash-settle-all-again",
    );

    const allSettled = await cash.list(actor(managerId), storeId, businessDate);
    const unchangedEmployee = allSettled.rows.find(
      (row) => row.membershipId === employeeMembershipId,
    );
    const managerRow = allSettled.rows.find(
      (row) => row.membershipId === managerMembershipId,
    );
    expect(unchangedEmployee?.status).toBe("SETTLED");
    expect(managerRow?.status).toBe("SETTLED");
    await cash.reopen(
      actor(managerId),
      storeId,
      businessDate,
      managerMembershipId,
      { version: managerRow!.version, reason: "验证部分回退后的一键结清" },
      "cash-partial-reopen-0001",
      "cash-partial-reopen",
    );
    const mixed = await cash.list(actor(managerId), storeId, businessDate);
    await cash.settleAll(
      actor(managerId),
      storeId,
      businessDate,
      {
        settlements: mixed.rows.map((row) => ({
          membershipId: row.membershipId,
          version: row.version,
        })),
      },
      "cash-settle-only-unsettled-0001",
      "cash-settle-only-unsettled",
    );
    const afterPartial = await cash.list(actor(managerId), storeId, businessDate);
    expect(
      afterPartial.rows.find((row) => row.membershipId === employeeMembershipId),
    ).toMatchObject({
      status: "SETTLED",
      version: unchangedEmployee!.version,
      settledAt: unchangedEmployee!.settledAt,
    });
  });

  it("财务汇总按员工权限返回小计、日计和累计余额", async () => {
    const summary = await finance.summary(actor(managerId), storeId, {
      dateFrom: businessDate,
      dateTo: businessDate,
      membershipIds: [employeeMembershipId],
      paymentMethod: "ALL",
      amountType: "ALL",
      highlightFilter: "ALL",
    });
    expect(summary.totals).toMatchObject({
      recordCount: 1,
      mainServiceAmountCents: 10_000n,
      grossFeeBaseCents: 10_000n,
      actualServiceCollectedCents: 10_000n,
      totalTipCents: 3_000n,
      totalLargeFeeWageCents: 6_000n,
      employeeIncomeCents: 9_000n,
      settledCashAcquiredWithinRangeCents: 3_400n,
      employerOwesCents: 0n,
      overpaidCents: 400n,
    });
    expect(summary.employees).toHaveLength(1);
    expect(summary.days).toHaveLength(1);
    const payrollLedger = await payroll.list(actor(managerId), storeId, { includeDeleted: true });
    expect(payrollLedger.find((item) => item.id === payrollId)).toMatchObject({ historyChangedAfterSettlement: true });
    const csv = await finance.exportCsv(actor(managerId), storeId, {
      dateFrom: businessDate,
      dateTo: businessDate,
      membershipIds: [employeeMembershipId],
      paymentMethod: "ALL",
      amountType: "ALL",
      highlightFilter: "ALL",
    });
    expect(csv.startsWith("\uFEFF\"记录类型\",\"营业日\"")).toBe(true);
    expect(csv).toContain("\"财务员工\"");
    expect(csv).toContain("\"100.00\"");
    expect(csv).toContain("\"高亮标记\"");
    expect(csv).toContain("\"高亮\"");
    const highlighted = await finance.summary(actor(managerId), storeId, {
      dateFrom: businessDate,
      dateTo: businessDate,
      membershipIds: [employeeMembershipId],
      paymentMethod: "ALL",
      amountType: "ALL",
      highlightFilter: "ONLY_HIGHLIGHTED",
    });
    expect(highlighted.totals.recordCount).toBe(1);
    const withoutHighlighted = await finance.summary(actor(managerId), storeId, {
      dateFrom: businessDate,
      dateTo: businessDate,
      membershipIds: [employeeMembershipId],
      paymentMethod: "ALL",
      amountType: "ALL",
      highlightFilter: "EXCLUDE_HIGHLIGHTED",
    });
    expect(withoutHighlighted.totals.recordCount).toBe(0);
    await expect(
      finance.summary(actor(employeeId), storeId, {
        dateFrom: businessDate,
        dateTo: businessDate,
        membershipIds: [managerMembershipId],
        paymentMethod: "ALL",
        amountType: "ALL",
        highlightFilter: "ALL",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("手动改价只保留提醒，并允许正常日结", async () => {
    const repriced = await workRecords.update(
      actor(employeeId),
      storeId,
      recordId,
      { version: recordVersion, mainServiceAmountCents: 11_000 },
      "manual-price-closing-update-0001",
      "manual-price-closing-update",
    );
    const reconfirmed = await workRecords.confirmPayment(
      actor(employeeId),
      storeId,
      recordId,
      {
        version: repriced.version,
        cashServiceCents: 4_000,
        cardServiceCents: 7_000,
        cashTipCents: 1_000,
        cardTipCents: 2_000,
      },
      "manual-price-closing-payment-0001",
      "manual-price-closing-payment",
    );
    recordVersion = reconfirmed.version;

    const preview = await closings.preview(actor(managerId), storeId, businessDate);
    expect(preview.warnings).toEqual([
      expect.objectContaining({
        code: "MANUAL_PRICE",
        labelZh: "手动改价提醒",
        blocking: false,
        count: 1,
        recordIds: [recordId],
      }),
    ]);

    const closed = await closings.close(
      actor(managerId),
      storeId,
      businessDate,
      { force: false },
      "manual-price-closing-normal-0001",
      "manual-price-closing-normal",
    );
    expect(closed.closing).toMatchObject({
      status: "CLOSED",
      isForced: false,
      cycleNo: 2,
    });
    expect(closed.preview.warnings).toEqual(preview.warnings);

    await closings.cancel(
      actor(managerId),
      storeId,
      businessDate,
      { version: closed.closing.version, reason: "继续验证阻塞异常" },
      "manual-price-closing-cancel-0001",
      "manual-price-closing-cancel",
    );
  });

  it("待结账异常阻止普通日结，但可填写原因强制日结", async () => {
    const currentCash = await cash.list(actor(managerId), storeId, businessDate);
    for (const row of currentCash.rows.filter((item) => item.status === "SETTLED")) {
      await cash.reopen(
        actor(managerId),
        storeId,
        businessDate,
        row.membershipId,
        { version: row.version, reason: "准备异常日结测试" },
        `cash-reopen-${row.membershipId}`,
        "cash-reopen-test",
      );
    }
    const pending = await workRecords.create(
      actor(employeeId),
      storeId,
      {
        employeeMembershipId,
        startAt: new Date().toISOString(),
        serviceItemId,
      },
      "finance-pending-record-0001",
      "finance-pending-record",
    );
    const preview = await closings.preview(actor(managerId), storeId, businessDate);
    expect(preview.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["PENDING_PAYMENT", "TIP_MISSING"]),
    );
    await expect(
      closings.close(
        actor(managerId),
        storeId,
        businessDate,
        { force: false },
        "closing-warning-normal-0001",
        "closing-warning-normal",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const forced = await closings.close(
      actor(managerId),
      storeId,
      businessDate,
      { force: true, forceReason: "员工已离店，明日补充付款" },
      "closing-warning-force-0001",
      "closing-warning-force",
    );
    expect(forced.closing).toMatchObject({
      status: "CLOSED",
      isForced: true,
      cycleNo: 3,
    });
    expect(pending.status).toBe("PENDING_PAYMENT");
  });
});
