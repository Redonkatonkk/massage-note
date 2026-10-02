import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@massage-note/database";
import type { ClearExpensePeriodInput, CreateExpenseInput, ExpenseItemResponse, ExpenseMonthResponse, ExpensePeriodInput, ReviseExpenseInput, StopExpenseInput, UpdateExpenseInput } from "@massage-note/contracts";
import { calculateExpenseMonth, hasStoreCapability, isExpenseBoundary, type ExpenseRule } from "@massage-note/domain";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { toJsonSafe } from "../common/json-safe.interceptor.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const include = { rules: { orderBy: { startDate: "asc" as const }, include: { periods: true } } };
type Item = Prisma.ExpenseItemGetPayload<{ include: typeof include }>;
const dateAt = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
function ruleValue(rule: Item["rules"][number]): ExpenseRule {
  return { id: rule.id, startDate: dateOnly(rule.startDate), endExclusive: rule.endExclusive ? dateOnly(rule.endExclusive) : null, unit: rule.unit as ExpenseRule["unit"], interval: rule.interval, amountMode: rule.amountMode as ExpenseRule["amountMode"], amountCents: rule.amountCents };
}
function dto(item: Item): ExpenseItemResponse {
  return { id: item.id, version: item.version, name: item.name, note: item.note, kind: item.kind as ExpenseItemResponse["kind"], occurredOn: item.occurredOn ? dateOnly(item.occurredOn) : null, amountCents: item.amountCents?.toString() ?? null, deletedAt: item.deletedAt?.toISOString() ?? null, rules: item.rules.map(r => ({ ...ruleValue(r), amountCents: r.amountCents.toString() })) };
}
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly access: StoreAccessService, private readonly idempotency: IdempotencyService) {}

  async month(actor: AuthenticatedUser, storeId: string, month: string): Promise<ExpenseMonthResponse> {
    await this.access.requireCapability(actor.id, storeId, "EXPENSE_MANAGE");
    const items = await this.prisma.expenseItem.findMany({ where: { storeId }, include, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const summary = calculateExpenseMonth(month, items.map(item => ({ id: item.id, name: item.name, kind: item.kind as "ONCE" | "RECURRING", deleted: item.deletedAt !== null, occurredOn: item.occurredOn ? dateOnly(item.occurredOn) : null, amountCents: item.amountCents, rules: item.rules.map(ruleValue), overrides: item.rules.flatMap(r => r.periods.map(p => ({ ruleId: r.id, periodStart: dateOnly(p.periodStart), amountCents: p.amountCents }))) })));
    return { ...summary, items: items.map(dto) };
  }

  async create(actor: AuthenticatedUser, storeId: string, input: CreateExpenseInput, key: string, requestId: string) {
    await this.access.requireCapability(actor.id, storeId, "EXPENSE_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "POST /expenses", payload: input, responseCode: 201 }, async tx => {
      const membership = await this.authorize(tx, actor, storeId);
      const item = await tx.expenseItem.create({ data: { storeId, name: input.name, note: input.note, kind: input.kind, createdBy: actor.id, updatedBy: actor.id, ...(input.kind === "ONCE" ? { occurredOn: dateAt(input.occurredOn), amountCents: BigInt(input.amountCents) } : { rules: { create: { ...input.rule, startDate: dateAt(input.rule.startDate), amountCents: BigInt(input.rule.amountCents) } } }) }, include });
      await this.audit(tx, storeId, actor.id, membership.id, requestId, "created", null, item);
      return dto(item);
    });
  }

  update(actor: AuthenticatedUser, storeId: string, id: string, input: UpdateExpenseInput, key: string, requestId: string) {
    return this.mutate(actor, storeId, id, input, key, requestId, "updated", async (tx, item) => {
      if (item.kind !== "ONCE" && (input.amountCents !== undefined || input.occurredOn !== undefined)) this.invalid("周期费用请修改单期金额或新增生效规则");
      await tx.expenseItem.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.note !== undefined ? { note: input.note } : {}), ...(input.occurredOn !== undefined ? { occurredOn: dateAt(input.occurredOn) } : {}), ...(input.amountCents !== undefined ? { amountCents: BigInt(input.amountCents) } : {}) } });
    });
  }

  revise(actor: AuthenticatedUser, storeId: string, id: string, input: ReviseExpenseInput, key: string, requestId: string) {
    return this.mutate(actor, storeId, id, input, key, requestId, "rule_changed", async (tx, item) => {
      const latest = this.latestRule(item), value = ruleValue(latest), start = input.rule.startDate;
      if (start <= value.startDate || !isExpenseBoundary(value, start)) this.invalid("生效日期必须是最新规则之后的周期起点；历史单期请修改实际金额");
      if (value.endExclusive && start < value.endExclusive) this.invalid("重新开始日期不能早于停止日期");
      // An appended change must not silently hide an already-entered future bill.
      if (latest.periods.some(p => dateOnly(p.periodStart) >= start)) this.invalid("生效日期之后已有单期账单，请先撤销对应覆盖金额再修改规则");
      if (!latest.endExclusive) await tx.expenseRuleRevision.update({ where: { id: latest.id }, data: { endExclusive: dateAt(start) } });
      await tx.expenseRuleRevision.create({ data: { itemId: id, ...input.rule, startDate: dateAt(start), amountCents: BigInt(input.rule.amountCents) } });
    });
  }

  stop(actor: AuthenticatedUser, storeId: string, id: string, input: StopExpenseInput, key: string, requestId: string) {
    return this.mutate(actor, storeId, id, input, key, requestId, "stopped", async (tx, item) => {
      const latest = this.latestRule(item), value = ruleValue(latest);
      if (latest.endExclusive || !isExpenseBoundary(value, input.effectiveFrom)) this.invalid("停止日期必须是仍有效的最新规则的周期起点");
      if (latest.periods.some(p => dateOnly(p.periodStart) >= input.effectiveFrom)) this.invalid("停止日期之后已有账单，请先撤销对应覆盖金额");
      await tx.expenseRuleRevision.update({ where: { id: latest.id }, data: { endExclusive: dateAt(input.effectiveFrom) } });
    });
  }

  period(actor: AuthenticatedUser, storeId: string, id: string, input: ExpensePeriodInput | ClearExpensePeriodInput, key: string, requestId: string) {
    const clear = !("amountCents" in input);
    return this.mutate(actor, storeId, id, input, key, requestId, clear ? "period_cleared" : "period_recorded", async (tx, item) => {
      const rule = item.rules.find(r => r.id === input.ruleId);
      if (!rule || !isExpenseBoundary(ruleValue(rule), input.periodStart) || (rule.endExclusive && input.periodStart >= dateOnly(rule.endExclusive))) this.invalid("没有找到该支出的有效周期");
      const where = { ruleId_periodStart: { ruleId: input.ruleId, periodStart: dateAt(input.periodStart) } };
      if ("amountCents" in input) await tx.expensePeriodOverride.upsert({ where, create: { ruleId: input.ruleId, periodStart: dateAt(input.periodStart), amountCents: BigInt(input.amountCents) }, update: { amountCents: BigInt(input.amountCents) } });
      else await tx.expensePeriodOverride.deleteMany({ where: where.ruleId_periodStart });
    });
  }

  remove(actor: AuthenticatedUser, storeId: string, id: string, input: { version: number }, key: string, requestId: string) {
    return this.mutate(actor, storeId, id, input, key, requestId, "deleted", async tx => {
      await tx.expenseItem.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor.id } });
    });
  }
  restore(actor: AuthenticatedUser, storeId: string, id: string, input: { version: number }, key: string, requestId: string) {
    return this.mutate(actor, storeId, id, input, key, requestId, "restored", async tx => {
      await tx.expenseItem.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
    });
  }

  private async mutate(actor: AuthenticatedUser, storeId: string, id: string, input: { version: number }, key: string, requestId: string, action: string, operation: (tx: Prisma.TransactionClient, item: Item) => Promise<void>) {
    await this.access.requireCapability(actor.id, storeId, "EXPENSE_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: `expense.${action}`, payload: { id, input }, responseCode: 200 }, async tx => {
      const membership = await this.authorize(tx, actor, storeId);
      const item = await tx.expenseItem.findFirst({ where: { id, storeId }, include });
      if (!item || (action === "restored" ? !item.deletedAt : item.deletedAt)) throw new NotFoundException({ code: "EXPENSE_NOT_FOUND", messageZh: "没有找到该支出记录" });
      if (item.version !== input.version) throw new ConflictException({ code: "EXPENSE_VERSION_CONFLICT", messageZh: "支出已被修改，请刷新后核对再重试", latestResource: dto(item) });
      const updated = await tx.expenseItem.updateMany({ where: { id, storeId, version: input.version }, data: { version: { increment: 1 }, updatedBy: actor.id } });
      if (updated.count !== 1) {
        const latest = await tx.expenseItem.findUniqueOrThrow({ where: { id }, include });
        throw new ConflictException({ code: "EXPENSE_VERSION_CONFLICT", messageZh: "支出已被修改，请刷新后核对再重试", latestResource: dto(latest) });
      }
      await operation(tx, item);
      const result = await tx.expenseItem.findUniqueOrThrow({ where: { id }, include });
      await this.audit(tx, storeId, actor.id, membership.id, requestId, action, item, result);
      return dto(result);
    });
  }
  private async authorize(tx: Prisma.TransactionClient, actor: AuthenticatedUser, storeId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId, tx);
    if (!hasStoreCapability(membership.role, "EXPENSE_MANAGE")) throw new ForbiddenException({ code: "STORE_CAPABILITY_REQUIRED", messageZh: "你没有执行此操作的权限" });
    return membership;
  }
  private latestRule(item: Item) {
    const rule = item.rules.at(-1);
    if (item.kind !== "RECURRING" || !rule) this.invalid("一次性支出没有周期规则");
    return rule;
  }
  private invalid(messageZh: string): never { throw new BadRequestException({ code: "INVALID_EXPENSE", messageZh }); }
  private async audit(tx: Prisma.TransactionClient, storeId: string, actorUserId: string, actorMembershipId: string, requestId: string, action: string, before: Item | null, after: Item) {
    await tx.auditLog.create({ data: { storeId, actorUserId, actorMembershipId, requestId, source: "api", action: `expense.${action}`, entityType: "expense_item", entityId: after.id, ...(before ? { beforeJson: toJsonSafe(before) as Prisma.InputJsonValue } : {}), afterJson: toJsonSafe(after) as Prisma.InputJsonValue } });
  }
}
