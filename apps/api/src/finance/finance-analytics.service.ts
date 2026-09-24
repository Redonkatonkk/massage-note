import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import type { FinanceAnalyticsQuery, FinanceAnalyticsResponse } from "@massage-note/contracts";
import { calculateFinanceAnalytics, hasStoreCapability, shiftAnalyticsDate } from "@massage-note/domain";
import { businessDateFor, deviceNow } from "../common/device-time.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

@Injectable()
export class FinanceAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly access: StoreAccessService) {}

  async analytics(actor: User, storeId: string, query: FinanceAnalyticsQuery): Promise<FinanceAnalyticsResponse> {
    return this.prisma.$transaction(async client => {
      const membership = await this.access.requireActiveMembership(actor.id, storeId, client);
      if (!hasStoreCapability(membership.role, "FINANCE_READ_STORE")) throw new ForbiddenException("普通员工不能查看全店经营分析");
      const store = await client.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null } });
      if (!store) throw new NotFoundException("店铺不存在或已停用");
      const today = businessDateFor({ startAt: deviceNow(), timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
      const dateTo = query.dateTo ?? today;
      const base = { storeId, deletedAt: null };
      const closingBase = { storeId, status: "CLOSED" as const };
      const [recordStart, saleStart, closingStart, lostCustomerStart] = await Promise.all([
        client.workRecord.aggregate({ where: { ...base, businessDate: { lte: asDate(dateTo) } }, _min: { businessDate: true } }),
        client.giftCardSale.aggregate({ where: { ...base, businessDate: { lte: asDate(dateTo) } }, _min: { businessDate: true } }),
        client.businessDayClosing.aggregate({ where: { ...closingBase, businessDate: { lte: asDate(dateTo) } }, _min: { businessDate: true } }),
        client.lostCustomer.aggregate({ where: { ...base, businessDate: { lte: asDate(dateTo) } }, _min: { businessDate: true } }),
      ]);
      const starts = [recordStart, saleStart, closingStart, lostCustomerStart].flatMap(r => r._min.businessDate ? [dateOnly(r._min.businessDate)] : []).sort();
      const dateFrom = query.dateFrom ?? starts[0] ?? dateTo;
      if (dateFrom > dateTo || dateTo > today) throw new BadRequestException("日期范围无效，结束日期不能晚于今天");
      const businessDate = { gte: asDate(shiftAnalyticsDate(dateFrom, -6)), lte: asDate(dateTo) };
      const [records, sales, closings, lostCustomers] = await Promise.all([
        client.workRecord.findMany({ where: { ...base, businessDate }, select: { businessDate: true, startAt: true, storeTimezoneSnapshot: true, discountedFeePerformanceCents: true } }),
        client.giftCardSale.findMany({ where: { ...base, businessDate }, select: { businessDate: true, amountCents: true } }),
        client.businessDayClosing.findMany({ where: { ...closingBase, businessDate }, select: { businessDate: true }, distinct: ["businessDate"] }),
        client.lostCustomer.findMany({ where: { ...base, businessDate }, select: { businessDate: true, customerCount: true } }),
      ]);
      return calculateFinanceAnalytics({ dateFrom, dateTo,
        records: records.map(r => ({ businessDate: dateOnly(r.businessDate), startAt: r.startAt, timezone: r.storeTimezoneSnapshot, revenueCents: r.discountedFeePerformanceCents })),
        sales: sales.map(r => ({ businessDate: dateOnly(r.businessDate), revenueCents: r.amountCents })),
        lostCustomers: lostCustomers.map(r => ({ businessDate: dateOnly(r.businessDate), customerCount: r.customerCount })),
        closedDates: closings.map(r => dateOnly(r.businessDate)),
      });
    }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  }
}
