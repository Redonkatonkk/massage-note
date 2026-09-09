import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@massage-note/database";
import { z } from "zod";
import type { PrismaService } from "../database/prisma.service.js";

// Only business models: authentication, agent credentials and internal payloads are not model context.
export const businessTables = ["Store", "StoreMembership", "StoreJoinRequest", "Shift", "DailyBoard", "DailyEmployeeRow", "ServiceItem", "ServiceItemPriceOption", "AddonItem", "DiscountItem", "EmployeeDefaultCommission", "EmployeeItemCommission", "WorkRecord", "WorkRecordServiceSnapshot", "WorkRecordAddonSnapshot", "WorkRecordDiscountSnapshot", "PaymentBreakdown", "GiftCardSale", "BusinessDayClosing", "DailyCashSettlement", "PayrollSettlement"] as const;
const schema = z.object({
  table: z.enum(businessTables), id: z.string().uuid().optional(),
  dateField: z.string().optional(), dateFrom: z.iso.date().optional(), dateTo: z.iso.date().optional(),
  membershipId: z.string().uuid().optional(), includeDeleted: z.boolean().default(false),
  offset: z.number().int().min(0).max(1_000_000).default(0),
}).strict();

export const businessReadTool = { type: "function" as const, function: {
  name: "read_business_data", description: "只读查询本店所有历史业务数据。未指定日期即全部历史；每页100条，hasMore=true需用nextOffset继续。金额汇总使用query_finance，不能把一页当全部。",
  parameters: { type: "object", additionalProperties: false, properties: {
    table: { type: "string", enum: businessTables }, id: { type: "string" },
    dateField: { type: "string", description: "日期字段，例如businessDate、settlementDate、createdAt、effectiveFrom" },
    dateFrom: { type: "string", description: "YYYY-MM-DD，含首日" }, dateTo: { type: "string", description: "YYYY-MM-DD，含末日" },
    membershipId: { type: "string" }, includeDeleted: { type: "boolean" }, offset: { type: "integer", minimum: 0 },
  }, required: ["table"] },
}};

export async function readBusinessData(prisma: PrismaService, storeId: string, member: { id: string; role: string }, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException("Invalid business query");
  const args = parsed.data;
  const metadata = Prisma.dmmf.datamodel.models.find((model) => model.name === args.table)!;
  const has = (field: string) => metadata.fields.some((item) => item.name === field);
  const own = member.role === "EMPLOYEE";
  const recordScope = { storeId, ...(own ? { employeeMembershipId: member.id } : {}) };
  const where: Record<string, unknown> = has("storeId") ? { storeId } : args.table === "Store" ? { id: storeId }
    : args.table === "ServiceItemPriceOption" ? { serviceItem: { storeId } } : { workRecord: recordScope };
  const memberField = args.table === "StoreMembership" ? "id" : has("employeeMembershipId") ? "employeeMembershipId" : has("membershipId") ? "membershipId" : null;
  if (own) {
    if (memberField) where[memberField] = member.id;
    else if (!["ServiceItem", "ServiceItemPriceOption", "AddonItem", "DiscountItem", "WorkRecordServiceSnapshot", "WorkRecordAddonSnapshot", "WorkRecordDiscountSnapshot", "PaymentBreakdown"].includes(args.table)) throw new ForbiddenException("该数据需要店铺管理权限");
  }
  if (args.membershipId) {
    if (!memberField || (own && args.membershipId !== member.id)) throw new ForbiddenException("Invalid employee scope");
    where[memberField] = args.membershipId;
  }
  if (has("deletedAt") && !args.includeDeleted) where.deletedAt = null;
  if (args.dateFrom || args.dateTo) {
    const field = args.dateField ?? (has("businessDate") ? "businessDate" : "createdAt");
    if (!metadata.fields.some((item) => item.name === field && item.type === "DateTime") || (args.dateFrom && args.dateTo && args.dateFrom > args.dateTo)) throw new BadRequestException("Invalid date range or field");
    const end = args.dateTo ? new Date(`${args.dateTo}T00:00:00Z`) : null;
    if (end) end.setUTCDate(end.getUTCDate() + 1);
    where[field] = { ...(args.dateFrom ? { gte: new Date(`${args.dateFrom}T00:00:00Z`) } : {}), ...(end ? { lt: end } : {}) };
  }
  // AND prevents IDs from overriding mandatory tenant or employee scope.
  const select = Object.fromEntries(metadata.fields.filter((field) => field.kind !== "object" && field.type !== "Json" && !/phone|instructions|storeCode/i.test(field.name)).map((field) => [field.name, true]));
  const delegate = (prisma as unknown as Record<string, { findMany: (query: object) => Promise<unknown[]> }>)[args.table[0]!.toLowerCase() + args.table.slice(1)]!;
  const rows = await delegate.findMany({ where: { AND: [where, ...(args.id ? [{ id: args.id }] : [])] }, select, orderBy: { id: "asc" }, skip: args.offset, take: 101 });
  return { table: args.table, dateFrom: args.dateFrom ?? null, dateTo: args.dateTo ?? null, rows: rows.slice(0, 100), hasMore: rows.length > 100, nextOffset: rows.length > 100 ? args.offset + 100 : null };
}
