import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type { ConfirmEmployeeSettlementInput, EmployeeSettlementCalendarQuery, EmployeeSettlementQuery } from "@massage-note/contracts";
import { calculateSettlementDays, settlementUnsettledTotal, type SettlementDayIncome, type SettlementScope } from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { businessDateFor, deviceNow } from "../common/device-time.js";
import { IdempotencyService, idempotencyRequestHash } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { EmployeeSettlementsService } from "./employee-settlements.service.js";

const atUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class EmployeeSettlementPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
    private readonly settlements: EmployeeSettlementsService,
  ) {}

  async calendar(actor: User, storeId: string, query: EmployeeSettlementCalendarQuery) {
    await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    const dateFrom = `${query.month}-01`;
    const first = atUtc(dateFrom);
    first.setUTCMonth(first.getUTCMonth() + 1);
    first.setUTCDate(0);
    const dateTo = dateOnly(first);
    return this.prisma.$transaction(async (tx) => {
      await this.requireMember(tx, storeId, query.membershipId);
      const state = await this.readState(tx, storeId, { membershipId: query.membershipId, dateFrom, dateTo, paymentScope: "ALL" });
      return { membershipId: query.membershipId, month: query.month, days: state.days };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async preview(actor: User, storeId: string, query: EmployeeSettlementQuery) {
    await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    return this.prisma.$transaction((tx) => this.quote(tx, storeId, query), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async confirm(actor: User, storeId: string, input: ConfirmEmployeeSettlementInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    return this.idempotency.execute({
      storeId, userId: actor.id, key,
      route: "/api/v1/stores/:storeId/employee-settlements/confirm", payload: input, responseCode: 201,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }, async (tx) => {
      const member = await this.requireMember(tx, storeId, input.membershipId);
      if (member.role === "OWNER" || member.store.ownerMembershipId === member.id) {
        throw new ForbiddenException({ code: "OWNER_PAYROLL_FORBIDDEN", messageZh: "店主本人仅可生成结算资料，不能登记付款" });
      }
      const preview = await this.quote(tx, storeId, input);
      // Work-record and daily-cash writes use the same locks. Serializable also
      // protects range insertions and concurrent ledger edits/confirmations.
      for (const date of [...new Set(preview.records.map((record) => record.businessDate))].sort()) {
        await lockBusinessDay(tx, storeId, date);
      }
      if (preview.payment.revision !== input.revision) {
        throw new ConflictException({ code: "SETTLEMENT_DATA_CHANGED", messageZh: "记工或结算状态已变化，请重新生成结算单后核对付款" });
      }
      if (preview.records.length === 0) {
        throw new BadRequestException({ code: "EMPTY_SETTLEMENT", messageZh: "当前范围没有可登记付款的已确认记工" });
      }
      if (preview.payment.fullyConfirmed) {
        throw new ConflictException({ code: "SETTLEMENT_ALREADY_CONFIRMED", messageZh: "所选范围已确认结清，无需重复登记" });
      }
      const unsettledCents = BigInt(preview.payment.unsettledCents);
      const deductionCents = BigInt(input.deductionCents);
      if (deductionCents > unsettledCents) {
        throw new BadRequestException({ code: "SETTLEMENT_DEDUCTION_TOO_LARGE", messageZh: "抵扣金额不能超过本次未结金额" });
      }
      const totalPaidCents = unsettledCents - deductionCents;
      const ledger = await tx.payrollSettlement.create({ data: {
        storeId, membershipId: input.membershipId,
        settlementDate: atUtc(businessDateFor({ startAt: deviceNow(), timezone: member.store.timezone, cutoffLocal: member.store.businessCutoffLocal })),
        periodStart: atUtc(input.dateFrom), periodEnd: atUtc(input.dateTo),
        serviceWageCents: 0n, cashTipCents: 0n, cardTipCents: 0n, adjustmentCents: totalPaidCents, totalPaidCents,
        paymentMethod: "OTHER", paymentScope: input.paymentScope, note: "", createdBy: actor.id, updatedBy: actor.id,
        confirmation: { create: { unsettledCents, deductionCents } },
      }, include: { confirmation: true } });
      await tx.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api",
        action: "payroll_settlement.confirmed", entityType: "payroll_settlement", entityId: ledger.id,
        afterJson: { membershipId: input.membershipId, dateFrom: input.dateFrom, dateTo: input.dateTo, paymentScope: input.paymentScope,
          unsettledCents: unsettledCents.toString(), deductionCents: deductionCents.toString(), totalPaidCents: totalPaidCents.toString(), revision: input.revision }, requestId,
      } });
      return ledger;
    });
  }

  private async requireMember(tx: Prisma.TransactionClient, storeId: string, membershipId: string) {
    const member = await tx.storeMembership.findFirst({
      where: { id: membershipId, storeId, status: "ACTIVE", deletedAt: null, store: { status: "ACTIVE", deletedAt: null } },
      include: { store: { select: { timezone: true, businessCutoffLocal: true, ownerMembershipId: true } } },
    });
    if (!member) throw new NotFoundException({ code: "SETTLEMENT_MEMBERSHIP_NOT_FOUND", messageZh: "没有找到可结算的在职成员" });
    return member;
  }

  private async quote(tx: Prisma.TransactionClient, storeId: string, query: EmployeeSettlementQuery) {
    const preview = await this.settlements.buildPreview(storeId, query, tx);
    const state = await this.readState(tx, storeId, query);
    const unsettledCents = settlementUnsettledTotal(state.days, query.paymentScope);
    if (unsettledCents > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException({ code: "AMOUNT_TOTAL_TOO_LARGE", messageZh: "结算金额超出系统允许范围" });
    }
    const { generatedAt: _generatedAt, ...document } = preview;
    const selection = { membershipId: query.membershipId, dateFrom: query.dateFrom, dateTo: query.dateTo, paymentScope: query.paymentScope };
    const relevant = state.days.filter((day) => query.paymentScope === "ALL" || (query.paymentScope === "CASH" ? day.hasCash : day.hasNonCash));
    return { ...preview, payment: {
      unsettledCents: Number(unsettledCents),
      fullyConfirmed: relevant.length > 0 && relevant.every((day) =>
        (query.paymentScope === "NON_CASH" || !day.hasCash || (day.cashSettled && day.cashUnsettledCents === 0n)) &&
        (query.paymentScope === "CASH" || !day.hasNonCash || day.nonCashSettled) &&
        (day.hasCash || day.hasNonCash || (day.cashConfirmed && day.nonCashConfirmed))),
      revision: idempotencyRequestHash({ selection, document, records: state.records, cash: state.cash, payroll: state.payroll }),
    } };
  }

  private async readState(tx: Prisma.TransactionClient, storeId: string, query: EmployeeSettlementQuery) {
    const dateRange = { gte: atUtc(query.dateFrom), lte: atUtc(query.dateTo) };
    const [records, cash, payroll] = await Promise.all([
      tx.workRecord.findMany({
        where: { storeId, employeeMembershipId: query.membershipId, businessDate: dateRange, status: "CONFIRMED", deletedAt: null },
        select: { id: true, businessDate: true, updatedAt: true, cashAllocatedServiceWageCents: true, totalLargeFeeWageCents: true,
          cashTipCents: true, cardTipCents: true, giftCardTipCents: true, cashServiceCents: true, cardServiceCents: true, giftCardServiceCents: true },
        orderBy: { id: "asc" },
      }),
      tx.dailyCashSettlement.findMany({
        where: { storeId, membershipId: query.membershipId, businessDate: dateRange, status: "SETTLED", deletedAt: null },
        select: { businessDate: true, cashRetainedCents: true, version: true }, orderBy: { businessDate: "asc" },
      }),
      tx.payrollSettlement.findMany({
        where: { storeId, membershipId: query.membershipId, periodStart: { lte: atUtc(query.dateTo) }, periodEnd: { gte: atUtc(query.dateFrom) }, deletedAt: null },
        select: { id: true, periodStart: true, periodEnd: true, paymentScope: true, version: true, totalPaidCents: true, confirmation: true },
        orderBy: { id: "asc" },
      }),
    ]);
    const byDay = new Map<string, SettlementDayIncome>();
    for (const record of records) {
      const businessDate = dateOnly(record.businessDate);
      const day = byDay.get(businessDate) ?? { businessDate, cashIncomeCents: 0n, nonCashIncomeCents: 0n, hasCash: false, hasNonCash: false };
      const cashWage = record.cashAllocatedServiceWageCents ?? 0n;
      const cashIncome = cashWage + (record.cashTipCents ?? 0n);
      const nonCashIncome = record.totalLargeFeeWageCents - cashWage + (record.cardTipCents ?? 0n) + (record.giftCardTipCents ?? 0n);
      day.cashIncomeCents += cashIncome;
      day.nonCashIncomeCents += nonCashIncome;
      day.hasCash ||= (record.cashServiceCents ?? 0n) !== 0n || (record.cashTipCents ?? 0n) !== 0n || cashIncome !== 0n;
      day.hasNonCash ||= (record.cardServiceCents ?? 0n) !== 0n || (record.giftCardServiceCents ?? 0n) !== 0n || (record.cardTipCents ?? 0n) !== 0n || (record.giftCardTipCents ?? 0n) !== 0n || nonCashIncome !== 0n;
      byDay.set(businessDate, day);
    }
    const confirmations = payroll.flatMap((entry) => entry.confirmation && ["CASH", "NON_CASH", "ALL"].includes(entry.paymentScope ?? "")
      ? [{ periodStart: dateOnly(entry.periodStart), periodEnd: dateOnly(entry.periodEnd), paymentScope: entry.paymentScope as SettlementScope }] : []);
    const days = calculateSettlementDays([...byDay.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate)), confirmations,
      cash.map((item) => ({ businessDate: dateOnly(item.businessDate), cashRetainedCents: item.cashRetainedCents })));
    return { days, records, cash, payroll };
  }
}
