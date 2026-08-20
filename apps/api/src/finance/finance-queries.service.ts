import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { User } from "@massage-note/database";
import type { FinanceQuery } from "@massage-note/contracts";
import {
  businessDateFor,
  calculatePayrollBalance,
  hasStoreCapability,
} from "@massage-note/domain";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

interface FinanceTotals {
  recordCount: number;
  incompleteRecordCount: number;
  mainServiceAmountCents: bigint;
  addonTotalCents: bigint;
  grossFeeBaseCents: bigint;
  discountTotalCents: bigint;
  discountedFeePerformanceCents: bigint;
  actualServiceCollectedCents: bigint;
  cashServiceCents: bigint;
  cardServiceCents: bigint;
  giftCardServiceCents: bigint;
  cashTipCents: bigint;
  cardTipCents: bigint;
  giftCardTipCents: bigint;
  totalTipCents: bigint;
  customerTotalPaidCents: bigint;
  totalLargeFeeWageCents: bigint;
  employeeIncomeCents: bigint;
  cashAcquiredServiceWageCents: bigint;
}

@Injectable()
export class FinanceQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async summary(actor: User, storeId: string, query: FinanceQuery) {
    const context = await this.resolveQueryContext(actor, storeId, query);
    const records = await this.findRecords(storeId, context);
    const total = this.emptyTotals();
    const employees = new Map<
      string,
      FinanceTotals & { membershipId: string; displayName: string; role: string }
    >();
    const days = new Map<string, FinanceTotals & { businessDate: string }>();
    for (const record of records) {
      this.addRecord(total, record, context.query);
      const employee = employees.get(record.employeeMembershipId) ?? {
        membershipId: record.employeeMembershipId,
        displayName: record.employee.displayName,
        role: record.employee.role,
        ...this.emptyTotals(),
      };
      this.addRecord(employee, record, context.query);
      employees.set(record.employeeMembershipId, employee);
      const businessDate = dateOnly(record.businessDate);
      const day = days.get(businessDate) ?? {
        businessDate,
        ...this.emptyTotals(),
      };
      this.addRecord(day, record, context.query);
      days.set(businessDate, day);
    }
    const balances = await Promise.all(
      context.membershipIds.map((membershipId) =>
        this.calculateMembershipBalance(storeId, membershipId),
      ),
    );
    const [payrollWithinRange, settledCashWithinRange] = await Promise.all([
      this.prisma.payrollSettlement.aggregate({
        where: {
          storeId,
          membershipId: { in: context.membershipIds },
          settlementDate: {
            gte: dateAtUtc(context.dateFrom),
            lte: dateAtUtc(context.dateTo),
          },
          deletedAt: null,
        },
        _sum: { totalPaidCents: true },
      }),
      this.prisma.dailyCashSettlement.aggregate({
        where: {
          storeId,
          membershipId: { in: context.membershipIds },
          businessDate: {
            gte: dateAtUtc(context.dateFrom),
            lte: dateAtUtc(context.dateTo),
          },
          status: "SETTLED",
          deletedAt: null,
        },
        _sum: { cashAcquiredServiceWageCents: true, cashTipCents: true },
      }),
    ]);
    const includeSettledCash =
      context.query.paymentMethod === "ALL" || context.query.paymentMethod === "CASH";
    const settledCashAcquiredWithinRangeCents = includeSettledCash
      ? (context.query.amountType !== "TIP"
          ? settledCashWithinRange._sum.cashAcquiredServiceWageCents ?? 0n
          : 0n) +
        (context.query.amountType !== "SERVICE"
          ? settledCashWithinRange._sum.cashTipCents ?? 0n
          : 0n)
      : 0n;
    return {
      filters: {
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        membershipIds: context.membershipIds,
        paymentMethod: context.query.paymentMethod,
        amountType: context.query.amountType,
        highlightFilter: context.query.highlightFilter,
      },
      totals: {
        ...total,
        payrollPaidWithinRangeCents:
          payrollWithinRange._sum.totalPaidCents ?? 0n,
        settledCashAcquiredWithinRangeCents,
        employerOwesCents: balances.reduce(
          (sum, balance) => sum + balance.employerOwesCents,
          0n,
        ),
        overpaidCents: balances.reduce(
          (sum, balance) => sum + balance.overpaidCents,
          0n,
        ),
      },
      employees: [...employees.values()],
      days: [...days.values()].sort((left, right) =>
        right.businessDate.localeCompare(left.businessDate),
      ),
      balances,
    };
  }

  async details(actor: User, storeId: string, query: FinanceQuery) {
    const context = await this.resolveQueryContext(actor, storeId, query);
    const records = await this.findRecords(storeId, context);
    return {
      filters: {
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        membershipIds: context.membershipIds,
        paymentMethod: context.query.paymentMethod,
        amountType: context.query.amountType,
        highlightFilter: context.query.highlightFilter,
      },
      records,
    };
  }

  async exportCsv(actor: User, storeId: string, query: FinanceQuery) {
    const result = await this.details(actor, storeId, query);
    const headers = [
      "营业日", "员工", "开始时间", "结束时间", "主要项目", "额外项目",
      "大费基数", "折扣", "折后大费业绩", "现金大费", "刷卡大费",
      "礼物卡序列号", "礼物卡大费", "现金小费", "刷卡小费", "礼物卡小费",
      "大费工资", "员工总收入", "高亮标记", "状态", "备注",
    ];
    const cents = (value: bigint | null) => ((value ?? 0n) / 100n).toString() + "." + ((value ?? 0n) % 100n).toString().padStart(2, "0");
    const cell = (value: unknown) => {
      let text = value === null || value === undefined ? "" : String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = result.records.map((record) => [
      dateOnly(record.businessDate),
      record.employee.displayName,
      record.startAt.toISOString(),
      record.endAt?.toISOString() ?? "",
      record.serviceSnapshot?.name ?? "",
      record.addonSnapshots.map((item) => item.name).join("、"),
      cents(record.grossFeeBaseCents),
      cents(record.discountTotalCents),
      cents(record.discountedFeePerformanceCents),
      cents(record.cashServiceCents),
      cents(record.cardServiceCents),
      record.giftCardSerialNumber ?? "",
      cents(record.giftCardServiceCents),
      cents(record.cashTipCents),
      cents(record.cardTipCents),
      cents(record.giftCardTipCents),
      cents(record.totalLargeFeeWageCents),
      cents(record.employeeTotalIncomeCents),
      record.isHighlighted ? "高亮" : "普通",
      record.status === "CONFIRMED" ? "已确认" : "待结账",
      record.note,
    ].map(cell).join(","));
    return `\uFEFF${headers.map(cell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
  }

  async myBalance(actor: User, storeId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    return this.calculateMembershipBalance(storeId, membership.id);
  }

  private async resolveQueryContext(
    actor: User,
    storeId: string,
    query: FinanceQuery,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: { timezone: true, businessCutoffLocal: true },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }
    const today = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    const defaultFromDate = new Date(`${today}T00:00:00.000Z`);
    defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 6);
    const dateFrom = query.dateFrom ?? defaultFromDate.toISOString().slice(0, 10);
    const dateTo = query.dateTo ?? today;
    if (dateTo < dateFrom) {
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        messageZh: "结束日期不能早于开始日期",
      });
    }
    const mayReadAll = hasStoreCapability(
      actorMembership.role,
      "FINANCE_READ_STORE",
    );
    const membershipIds = mayReadAll
      ? query.membershipIds.length > 0
        ? query.membershipIds
        : (
            await this.prisma.storeMembership.findMany({
              where: { storeId },
              select: { id: true },
            })
          ).map((membership) => membership.id)
      : [actorMembership.id];
    if (!mayReadAll && query.membershipIds.some((id) => id !== actorMembership.id)) {
      throw new ForbiddenException({
        code: "FINANCE_READ_FORBIDDEN",
        messageZh: "普通员工只能查看自己的财务",
      });
    }
    const validCount = await this.prisma.storeMembership.count({
      where: { storeId, id: { in: membershipIds } },
    });
    if (validCount !== new Set(membershipIds).size) {
      throw new BadRequestException({
        code: "FINANCE_MEMBERSHIP_INVALID",
        messageZh: "筛选条件包含不属于该店的员工",
      });
    }
    return { query, dateFrom, dateTo, membershipIds };
  }

  private async findRecords(
    storeId: string,
    context: {
      dateFrom: string;
      dateTo: string;
      membershipIds: string[];
      query: FinanceQuery;
    },
  ) {
    const records = await this.prisma.workRecord.findMany({
      where: {
        storeId,
        employeeMembershipId: { in: context.membershipIds },
        businessDate: {
          gte: dateAtUtc(context.dateFrom),
          lte: dateAtUtc(context.dateTo),
        },
        ...(context.query.highlightFilter === "ONLY_HIGHLIGHTED"
          ? { isHighlighted: true }
          : context.query.highlightFilter === "EXCLUDE_HIGHLIGHTED"
            ? { isHighlighted: false }
            : {}),
        deletedAt: null,
      },
      orderBy: [{ businessDate: "desc" }, { startAt: "desc" }],
      include: {
        employee: { select: { id: true, displayName: true, role: true } },
        serviceSnapshot: true,
        addonSnapshots: { orderBy: { position: "asc" } },
        discountSnapshots: { orderBy: { position: "asc" } },
        payment: true,
      },
    });
    return records.filter((record) => this.matchesPaymentFilter(record, context.query));
  }

  private matchesPaymentFilter(
    record: {
      cashServiceCents: bigint | null;
      cardServiceCents: bigint | null;
      giftCardServiceCents: bigint | null;
      cashTipCents: bigint | null;
      cardTipCents: bigint | null;
      giftCardTipCents: bigint | null;
    },
    query: FinanceQuery,
  ) {
    if (query.paymentMethod === "ALL") return true;
    const service = query.paymentMethod === "CASH"
      ? record.cashServiceCents ?? 0n
      : query.paymentMethod === "CARD"
        ? record.cardServiceCents ?? 0n
        : record.giftCardServiceCents ?? 0n;
    const tip = query.paymentMethod === "CASH"
      ? record.cashTipCents ?? 0n
      : query.paymentMethod === "CARD"
        ? record.cardTipCents ?? 0n
        : record.giftCardTipCents ?? 0n;
    if (query.amountType === "SERVICE") return service > 0n;
    if (query.amountType === "TIP") return tip > 0n;
    return service > 0n || tip > 0n;
  }

  private addRecord(
    totals: FinanceTotals,
    record: {
      status: string;
      mainServiceAmountCents: bigint;
      addonTotalCents: bigint;
      grossFeeBaseCents: bigint;
      discountTotalCents: bigint;
      discountedFeePerformanceCents: bigint;
      actualServiceCollectedCents: bigint | null;
      cashServiceCents: bigint | null;
      cardServiceCents: bigint | null;
      giftCardServiceCents: bigint | null;
      cashTipCents: bigint | null;
      cardTipCents: bigint | null;
      giftCardTipCents: bigint | null;
      totalTipCents: bigint | null;
      customerTotalPaidCents: bigint | null;
      totalLargeFeeWageCents: bigint;
      employeeTotalIncomeCents: bigint | null;
      cashAcquiredServiceWageCents: bigint | null;
    },
    query: FinanceQuery,
  ) {
    const includeService = query.amountType !== "TIP";
    const includeTip = query.amountType !== "SERVICE";
    const includeCash = query.paymentMethod === "ALL" || query.paymentMethod === "CASH";
    const includeCard = query.paymentMethod === "ALL" || query.paymentMethod === "CARD";
    const includeGiftCard =
      query.paymentMethod === "ALL" || query.paymentMethod === "GIFT_CARD";
    totals.recordCount += 1;
    if (record.status === "PENDING_PAYMENT") totals.incompleteRecordCount += 1;
    if (includeService) {
      totals.mainServiceAmountCents += record.mainServiceAmountCents;
      totals.addonTotalCents += record.addonTotalCents;
      totals.grossFeeBaseCents += record.grossFeeBaseCents;
      totals.discountTotalCents += record.discountTotalCents;
      totals.discountedFeePerformanceCents +=
        record.discountedFeePerformanceCents;
      totals.actualServiceCollectedCents +=
        (includeCash ? record.cashServiceCents ?? 0n : 0n) +
        (includeCard ? record.cardServiceCents ?? 0n : 0n) +
        (includeGiftCard ? record.giftCardServiceCents ?? 0n : 0n);
      totals.cashServiceCents += includeCash ? record.cashServiceCents ?? 0n : 0n;
      totals.cardServiceCents += includeCard ? record.cardServiceCents ?? 0n : 0n;
      totals.giftCardServiceCents += includeGiftCard
        ? record.giftCardServiceCents ?? 0n
        : 0n;
      totals.totalLargeFeeWageCents += record.totalLargeFeeWageCents;
      totals.cashAcquiredServiceWageCents +=
        includeCash ? record.cashAcquiredServiceWageCents ?? 0n : 0n;
    }
    if (includeTip) {
      const cashTip = includeCash ? record.cashTipCents ?? 0n : 0n;
      const cardTip = includeCard ? record.cardTipCents ?? 0n : 0n;
      const giftCardTip = includeGiftCard ? record.giftCardTipCents ?? 0n : 0n;
      totals.cashTipCents += cashTip;
      totals.cardTipCents += cardTip;
      totals.giftCardTipCents += giftCardTip;
      totals.totalTipCents += cashTip + cardTip + giftCardTip;
    }
    totals.customerTotalPaidCents =
      totals.actualServiceCollectedCents + totals.totalTipCents;
    totals.employeeIncomeCents +=
      (includeService ? record.totalLargeFeeWageCents : 0n) +
      (includeTip
        ? (includeCash ? record.cashTipCents ?? 0n : 0n) +
          (includeCard ? record.cardTipCents ?? 0n : 0n)
          + (includeGiftCard ? record.giftCardTipCents ?? 0n : 0n)
        : 0n);
  }

  private async calculateMembershipBalance(
    storeId: string,
    membershipId: string,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId },
      select: { ownerMembershipId: true },
    });
    const membership = await this.prisma.storeMembership.findFirst({
      where: { id: membershipId, storeId },
      select: { id: true, displayName: true, role: true },
    });
    if (!store || !membership) {
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        messageZh: "没有找到该店员工",
      });
    }
    if (store.ownerMembershipId === membershipId) {
      return {
        membershipId,
        displayName: membership.displayName,
        role: membership.role,
        excludedOwner: true,
        cumulativeEmployeeIncomeCents: 0n,
        settledCashAcquiredCents: 0n,
        payrollPaidCents: 0n,
        rawBalanceCents: 0n,
        employerOwesCents: 0n,
        overpaidCents: 0n,
      };
    }
    const [income, cash, payroll] = await Promise.all([
      this.prisma.workRecord.aggregate({
        where: {
          storeId,
          employeeMembershipId: membershipId,
          status: "CONFIRMED",
          deletedAt: null,
        },
        _sum: { employeeTotalIncomeCents: true },
      }),
      this.prisma.dailyCashSettlement.aggregate({
        where: {
          storeId,
          membershipId,
          status: "SETTLED",
          deletedAt: null,
        },
        _sum: {
          cashAcquiredServiceWageCents: true,
          cashTipCents: true,
        },
      }),
      this.prisma.payrollSettlement.aggregate({
        where: { storeId, membershipId, deletedAt: null },
        _sum: { totalPaidCents: true },
      }),
    ]);
    const cumulativeEmployeeIncomeCents =
      income._sum.employeeTotalIncomeCents ?? 0n;
    const settledCashAcquiredCents =
      (cash._sum.cashAcquiredServiceWageCents ?? 0n) +
      (cash._sum.cashTipCents ?? 0n);
    const payrollPaidCents = payroll._sum.totalPaidCents ?? 0n;
    const balance = calculatePayrollBalance({
      cumulativeEmployeeIncomeCents,
      settledCashAcquiredCents,
      payrollPaidCents,
    });
    return {
      membershipId,
      displayName: membership.displayName,
      role: membership.role,
      excludedOwner: false,
      cumulativeEmployeeIncomeCents,
      settledCashAcquiredCents,
      payrollPaidCents,
      ...balance,
    };
  }

  private emptyTotals(): FinanceTotals {
    return {
      recordCount: 0,
      incompleteRecordCount: 0,
      mainServiceAmountCents: 0n,
      addonTotalCents: 0n,
      grossFeeBaseCents: 0n,
      discountTotalCents: 0n,
      discountedFeePerformanceCents: 0n,
      actualServiceCollectedCents: 0n,
      cashServiceCents: 0n,
      cardServiceCents: 0n,
      giftCardServiceCents: 0n,
      cashTipCents: 0n,
      cardTipCents: 0n,
      giftCardTipCents: 0n,
      totalTipCents: 0n,
      customerTotalPaidCents: 0n,
      totalLargeFeeWageCents: 0n,
      employeeIncomeCents: 0n,
      cashAcquiredServiceWageCents: 0n,
    };
  }
}
