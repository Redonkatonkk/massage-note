import { workBotStartTime } from "./work-bot-start-time.js";
import { parseRequest } from "../common/zod-request.js";
import { z } from "zod";
import { workBotParsedIntentSchema } from "@massage-note/contracts";
import { WorkBotAccess } from "./work-bot-access.js";
import { workBotDateRange } from "./work-bot-query.js";
import { WorkRecordsService } from "../work-records/work-records.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { updateWorkRecordSchema, confirmPaymentSchema } from "@massage-note/contracts";
import { toJsonSafe } from "../common/json-safe.interceptor.js";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CreateWorkBotAliasInput,
  UpdateWorkRecordInput,
  UpdateWorkBotAliasInput,
  WorkBotContextRequest,
  WorkBotEventInput,
  WorkBotParsedIntent,
} from "@massage-note/contracts";
import {
  DomainError,
  hasStoreCapability,
  canWriteWorkRecord,
  businessDateFor,
  calculateWorkRecordFinance,
  multiplyByBps,
  resolveCommission,
} from "@massage-note/domain";
import { ensureBoardRow } from "../common/ensure-board-row.js";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeDisplayName } from "../stores/display-name.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import {
  normalizeWorkBotValue,
  parseWorkBotMessage,
  parsedIntentAppearsInRawText,
} from "./work-bot.parser.js";

interface WorkBotReply {
  outcome: string;
  reply: string;
  recordId?: string;
  businessDate?: string;
}

interface StoreSettings {
  id: string;
  name: string;
  storeCode: string;
  timezone: string;
  businessCutoffLocal: string;
  globalCommissionBps: number;
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: bigint;
  mondayThursdayAutoDiscountAmountCents: bigint;
}

const HELP_REPLY = "支持记工和查账：最近 15 天折后大费列表；查询结果含记录编号，可按编号修改、付款、删除和恢复；高亮/取消高亮；折扣和加项添加/移除。示例：绑定店铺 123456、绑定 张三、大力 90、Jessie 脚 30、Lily 下了，收 75/15卡，评论；Lily 加热石；Lily 加评论折扣。信息不完整时不会写账。";
const AUTO_DISCOUNT_NAME = "周一至周四自动折扣";
const DELEGATED_SENDER_PREFIX = "__massage_note_delegated__:";

@Injectable()
export class WorkBotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async getIntegrationContext(authorization: string | undefined, input: WorkBotContextRequest) {
    this.requireIntegrationSecret(authorization);
    const group = await this.prisma.workBotGroupBinding.findUnique({
      where: {
        platform_botId_groupId: {
          platform: input.platform,
          botId: input.botId,
          groupId: input.groupId,
        },
      },
      include: {
        store: { select: { name: true, workBotInstructions: true, status: true, deletedAt: true, timezone: true, businessCutoffLocal: true } },
        memberBindings: {
          where: { senderId: input.senderId, membership: { status: "ACTIVE", deletedAt: null } },
          select: { membership: { select: { displayName: true } } },
          take: 1,
        },
      },
    });
    if (!group) {
      return { status: "UNBOUND" as const, storeName: null, actorName: null, aliases: [], members: [] };
    }
    if (group.store.status !== "ACTIVE" || group.store.deletedAt) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    }
    const [members, discounts, addons, services] = await Promise.all([
      this.prisma.storeMembership.findMany({
        where: {
          storeId: group.storeId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: { id: true, displayName: true },
        orderBy: [{ displayNameNormalized: "asc" }],
      }),
      this.prisma.discountItem.findMany({ where: { storeId: group.storeId, isEnabled: true, deletedAt: null }, select: { name: true, shortName: true } }),
      this.prisma.addonItem.findMany({ where: { storeId: group.storeId, isEnabled: true, deletedAt: null }, select: { name: true, shortName: true } }),
      this.prisma.serviceItem.findMany({ where: { storeId: group.storeId, isEnabled: true, deletedAt: null }, include: { priceOptions: true }, orderBy: { position: "asc" } }),
    ]);
    return {
      status: "BOUND" as const,
      protocolVersion: 2,
      today: businessDateFor({ startAt: new Date(), timezone: group.store.timezone, cutoffLocal: group.store.businessCutoffLocal }),
      timezone: group.store.timezone,
      managementSchema: z.toJSONSchema(workBotParsedIntentSchema),
      discounts, addons,
      instructions: group.store.workBotInstructions,
      storeName: group.store.name,
      actorName: group.memberBindings[0]?.membership.displayName ?? null,
      aliases: services.map((item) => ({
        alias: item.id,
        serviceName: item.fullName,
        serviceShortName: item.shortName,
        defaultDurationMinutes: item.durationMinutes,
        availableDurationMinutes: item.priceOptions.map((option) => option.durationMinutes),
      })),
      employees: members,
      members: members.map((item) => item.displayName),
    };
  }

  async handleEvent(
    authorization: string | undefined,
    idempotencyKey: string,
    input: WorkBotEventInput,
    requestId: string,
  ): Promise<WorkBotReply> {
    const secret = this.requireIntegrationSecret(authorization);
    const expectedKey = `wechatpad:${input.botId}:${input.messageId}`;
    if (idempotencyKey !== expectedKey) {
      throw new BadRequestException({
        code: "WORK_BOT_IDEMPOTENCY_MISMATCH",
        messageZh: "幂等编号与机器人消息不一致",
      });
    }

    const existing = await this.findOperation(input);
    if (existing) {
      if (existing.senderId !== input.senderId || existing.rawText !== input.rawText) {
        throw new ConflictException({
          code: "WORK_BOT_MESSAGE_ID_REUSED",
          messageZh: "同一个微信消息编号不能用于不同内容",
        });
      }
      if (existing.intent === "QUERY") {
        const query = workBotParsedIntentSchema.parse(existing.parsedJson);
        if (query.kind === "QUERY") return this.prisma.$transaction(transaction => this.queryWork(transaction, input, query, false));
      }
      return this.operationReply(existing);
    }

    let intent = input.parsedIntent ?? parseWorkBotMessage(input.rawText);
    const evidenceRejected = !parsedIntentAppearsInRawText(intent, input.rawText);
    if (evidenceRejected) intent = { kind: "HELP" };

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.workBotOperation.findUnique({
          where: {
            platform_botId_groupId_messageId: {
              platform: input.platform,
              botId: input.botId,
              groupId: input.groupId,
              messageId: input.messageId,
            },
          },
          include: { workRecord: { select: { businessDate: true } } },
        });
        if (duplicate) return this.checkedOperationReply(duplicate, input);

        switch (intent.kind) {
          case "BIND_STORE":
            return this.bindStore(transaction, input, intent, requestId);
          case "BIND_MEMBER":
            return this.bindMember(transaction, input, intent, requestId);
          case "START":
            return this.startWork(transaction, secret, input, intent, requestId);
          case "ADJUST":
          case "FINISH":
            return this.finishWork(transaction, secret, input, intent, requestId);
          case "QUERY":
            return this.queryWork(transaction, input, intent);
          case "MANAGE":
            return this.manageWork(transaction, input, intent, requestId);
          case "HELP":
            return this.persistReply(transaction, input, intent, {
              outcome: evidenceRejected ? "INTENT_EVIDENCE_REJECTED" : "HELP",
              reply: evidenceRejected
                ? "AI 已返回解析结果，但与消息原文的校验未通过，本次没有记账。请重试或到网页核对。"
                : HELP_REPLY,
            });
        }
      });
    } catch (error) {
      if (error instanceof DomainError) throw new BadRequestException({ code: error.code, messageZh: error.message });
      if (error instanceof RangeError) throw new BadRequestException({ code: "AMOUNT_TOTAL_TOO_LARGE", messageZh: "金额超出系统允许范围" });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.findOperation(input);
        if (duplicate) return this.checkedOperationReply(duplicate, input);
      }
      throw error;
    }
  }

  async verifyMemberBinding(actor: User, storeId: string, bindingId: string, version: number, verified: boolean, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async transaction => {
      const binding = await transaction.workBotMemberBinding.findFirst({ where: { id: bindingId, groupBinding: { storeId } } });
      if (!binding || binding.senderId.startsWith(DELEGATED_SENDER_PREFIX)) this.bindingNotFound();
      const result = await transaction.workBotMemberBinding.updateMany({ where: { id: bindingId, version }, data: { verifiedAt: verified ? new Date() : null, version: { increment: 1 } } });
      if (result.count !== 1) this.versionConflict();
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "work_bot.member_verified", entityType: "work_bot_member_binding", entityId: bindingId, beforeJson: { verified: !!binding.verifiedAt }, afterJson: { verified }, requestId } });
      return { verified };
    });
  }

  private async queryWork(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "QUERY" }>, persist = true) {
    const context = await this.requireBoundMember(transaction, input, intent);
    if ("reply" in context) return context.reply;
    const { group, binding } = context;
    if (!binding.verifiedAt) {
      const reply = { outcome: "VERIFICATION_REQUIRED", reply: "请店主或经理在网页「记工机器人 → 微信群绑定」核实此微信身份并开启数据访问，再查询账目。" };
      return persist ? this.persistReply(transaction, input, intent, reply, group) : reply;
    }
    const member = await transaction.storeMembership.findUniqueOrThrow({ where: { id: binding.membershipId } });
    const store = await this.requireStoreSettings(transaction, group.storeId);
    const range = workBotDateRange(intent, store, new Date());
    const storeAccess = hasStoreCapability(member.role, "FINANCE_READ_STORE");
    let target = storeAccess ? undefined : member.id;
    if (intent.memberName) {
      const matches = await transaction.storeMembership.findMany({ where: { storeId: store.id, displayNameNormalized: normalizeDisplayName(intent.memberName) } });
      if (matches.length !== 1) throw new BadRequestException("员工姓名不唯一，请使用完整姓名");
      target = matches[0]!.id;
      if (!storeAccess && target !== member.id) throw new ForbiddenException("普通员工只能查询自己的历史财务");
    }
    const where: Prisma.WorkRecordWhereInput = { storeId: store.id, ...(target ? { employeeMembershipId: target } : {}), ...(intent.recordId ? { id: intent.recordId } : {}),
      businessDate: { gte: range.start, lte: range.end }, deletedAt: intent.status === "DELETED" ? { not: null } : null,
      ...(intent.status && !["ALL", "DELETED"].includes(intent.status) ? { status: intent.status as "CONFIRMED" | "PENDING_PAYMENT" } : intent.status ? {} : { status: "CONFIRMED" }),
      ...(intent.highlightedOnly ? { isHighlighted: true } : {}),
    };
    const page = intent.page ?? 1, size = 20;
    const money = (amount: bigint | null) => this.formatMoney(amount ?? 0n);
    let lines: string[], count: number;
    const totals = await transaction.workRecord.aggregate({ where, _sum: { discountedFeePerformanceCents: true, discountTotalCents: true, totalTipCents: true, actualServiceCollectedCents: true } });
    if (intent.groupBy === "DAY" || intent.groupBy === "EMPLOYEE") {
      const by = intent.groupBy === "DAY" ? "businessDate" : "employeeMembershipId";
      const rows = await transaction.workRecord.groupBy({ by: [by], where, _count: { _all: true }, _sum: { discountedFeePerformanceCents: true, discountTotalCents: true, totalTipCents: true }, orderBy: by === "businessDate" ? { businessDate: "asc" } : { employeeMembershipId: "asc" } });
      count = rows.length;
      const names = by === "employeeMembershipId" ? await transaction.storeMembership.findMany({ where: { storeId: store.id }, select: { id: true, displayName: true } }) : [];
      lines = rows.slice((page - 1) * size, page * size).map(row => `${by === "businessDate" ? row.businessDate.toISOString().slice(0, 10) : names.find(n => n.id === row.employeeMembershipId)?.displayName ?? row.employeeMembershipId}｜${row._count._all} 笔｜折后大费 ${money(row._sum.discountedFeePerformanceCents)}｜折扣 ${money(row._sum.discountTotalCents)}｜小费 ${money(row._sum.totalTipCents)}`);
    } else {
      count = await transaction.workRecord.count({ where });
      const rows = await transaction.workRecord.findMany({ where, orderBy: [{ businessDate: "asc" }, { startAt: "asc" }, { id: "asc" }], skip: (page - 1) * size, take: size, include: { employee: { select: { displayName: true } }, serviceSnapshot: true, addonSnapshots: true, discountSnapshots: true } });
      lines = rows.map(row => `${row.businessDate.toISOString().slice(0, 10)} ${this.formatTime(row.startAt, store.timezone)}｜${row.employee.displayName}｜${row.serviceSnapshot?.shortName ?? "项目缺失"}${row.isHighlighted ? " ★高亮" : ""}｜${row.status === "CONFIRMED" ? "已付款" : "待付款"}\n折后大费 ${money(row.discountedFeePerformanceCents)}｜折扣 ${money(row.discountTotalCents)}｜加项 ${money(row.addonTotalCents)}｜实收 ${row.actualServiceCollectedCents === null ? "未收款" : money(row.actualServiceCollectedCents)}｜小费 ${money(row.totalTipCents)}\n折扣项：${row.discountSnapshots.map(d => d.name).join("、") || "无"}；加项：${row.addonSnapshots.map(a => a.name).join("、") || "无"}\n编号 ${row.id}`);
    }
    const pages = Math.max(1, Math.ceil(count / size));
    const result = { outcome: "WORK_QUERY", reply: `${store.name} · ${storeAccess && !intent.memberName ? "全店" : intent.memberName ?? member.displayName}\n营业日 ${range.from} 至 ${range.to}（${store.timezone}；${intent.status ?? "CONFIRMED"}）\n${lines.join("\n\n") || "本页没有记录"}\n\n全范围折后大费合计 ${money(totals._sum.discountedFeePerformanceCents)}；折扣 ${money(totals._sum.discountTotalCents)}；实收 ${money(totals._sum.actualServiceCollectedCents)}；小费 ${money(totals._sum.totalTipCents)}\n共 ${count} ${intent.groupBy && intent.groupBy !== "RECORD" ? "组" : "笔"}，第 ${page}/${pages} 页${page < pages ? "。更多请重复查询并注明第 " + (page + 1) + " 页。" : "。"}` };
    return persist ? this.persistReply(transaction, input, intent, result, group) : result;
  }

  private async manageWork(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "MANAGE" }>, requestId: string) {
    const context = await this.requireBoundMember(transaction, input, intent);
    if ("reply" in context) return context.reply;
    const { group, binding } = context;
    const service = new WorkRecordsService(this.prisma, new WorkBotAccess(this.prisma, binding.id), new IdempotencyService(this.prisma)).withWorkBotAudit();
    const actor = { id: binding.membershipId } as User;
    const key = `bot-${createHash("sha256").update(`${input.botId}:${input.groupId}:${input.messageId}`).digest("hex")}`;
    if (intent.operation === "CREATE") {
      if (!intent.create || intent.recordId || intent.details || intent.payment) throw new BadRequestException("新增记工请提供完整员工、项目和开始时间");
      const created = await service.create(actor, group.storeId, intent.create, key, requestId, transaction);
      return this.persistReply(transaction, input, intent, { outcome: "WORK_CREATED", recordId: created.id, businessDate: created.businessDate.toISOString().slice(0, 10), reply: `✅ 已新增记工，编号 ${created.id}` }, group);
    }
    if (!intent.recordId || intent.create || (intent.operation === "PAYMENT" && intent.details)) throw new BadRequestException("请指定完整记录编号，并将修改字段放在 UPDATE 中");
    const record = await transaction.workRecord.findFirst({ where: { id: intent.recordId, storeId: group.storeId, ...(intent.operation === "RESTORE" ? {} : { deletedAt: null }) } });
    if (!record) throw new NotFoundException("没有找到本店的指定记工");
    let version = record.version;
    if (intent.operation === "UPDATE") {
      if (!intent.details || !Object.keys(intent.details).length) throw new BadRequestException("请说明要修改的记工字段");
      const details = parseRequest(updateWorkRecordSchema, { ...intent.details, version });
      const updated = await service.update(actor, group.storeId, record.id, details, key, requestId, transaction);
      version = updated.version;
    } else if (intent.operation === "DELETE") {
      if (intent.details || intent.payment) throw new BadRequestException("删除不能同时修改记工");
      await service.remove(actor, group.storeId, record.id, { version, reason: intent.reason }, key, requestId, transaction);
    } else if (intent.operation === "RESTORE") {
      if (intent.details || intent.payment) throw new BadRequestException("恢复不能同时修改记工");
      await service.restore(actor, group.storeId, record.id, { version }, key, requestId, transaction);
    }
    if (intent.payment) {
      if (intent.operation !== "UPDATE" && intent.operation !== "PAYMENT") throw new BadRequestException("操作不支持付款");
      await service.confirmPayment(actor, group.storeId, record.id, parseRequest(confirmPaymentSchema, { ...intent.payment, version }), key, requestId, transaction);
    } else if (intent.operation === "PAYMENT") throw new BadRequestException("请提供付款明细");
    await transaction.auditLog.create({ data: { storeId: group.storeId, actorUserId: null, actorMembershipId: binding.membershipId, source: "langbot", action: `work_bot.${intent.operation.toLowerCase()}`, entityType: "work_record", entityId: record.id, afterJson: { messageId: input.messageId, operation: intent.operation }, requestId } });
    const updated = await transaction.workRecord.findUniqueOrThrow({ where: { id: record.id } });
    return this.persistReply(transaction, input, intent, { outcome: "WORK_MANAGED", recordId: record.id, businessDate: updated.businessDate.toISOString().slice(0, 10), reply: `✅ 记工${intent.operation === "DELETE" ? "已删除" : intent.operation === "RESTORE" ? "已恢复" : "已更新"}：${record.id}\n折后大费 ${this.formatMoney(updated.discountedFeePerformanceCents)}；实收 ${updated.actualServiceCollectedCents === null ? "未收款" : this.formatMoney(updated.actualServiceCollectedCents)}；${updated.isHighlighted ? "已高亮" : "未高亮"}。` }, group);
  }

  async getSettings(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    const [groups, aliases, operations, store] = await Promise.all([
      this.prisma.workBotGroupBinding.findMany({
        where: { storeId },
        include: {
          memberBindings: {
            include: {
              membership: { select: { id: true, displayName: true, status: true } },
              activeWorkRecord: { select: { id: true, startAt: true, endAt: true, status: true } },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.workBotAlias.findMany({
        where: { storeId },
        include: {
          serviceItem: {
            select: {
              id: true,
              fullName: true,
              shortName: true,
              isEnabled: true,
              deletedAt: true,
              priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] },
            },
          },
        },
        orderBy: [{ aliasNormalized: "asc" }],
      }),
      this.prisma.workBotOperation.findMany({
        where: { storeId },
        include: { workRecord: { select: { id: true, businessDate: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { workBotInstructions: true, workBotInstructionsVersion: true } }),
    ]);
    return { groups, aliases, operations, instructions: store.workBotInstructions, instructionsVersion: store.workBotInstructionsVersion };
  }

  async updateInstructions(actor: User, storeId: string, input: { instructions: string; version: number }, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.store.findUniqueOrThrow({ where: { id: storeId } });
      const changed = await transaction.store.updateMany({ where: { id: storeId, workBotInstructionsVersion: input.version }, data: { workBotInstructions: input.instructions, workBotInstructionsVersion: { increment: 1 } } });
      if (!changed.count) throw new ConflictException({ code: "VERSION_CONFLICT", messageZh: "说明已被其他人修改，请刷新后重试" });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "work_bot.instructions_updated", entityType: "store", entityId: storeId, beforeJson: { instructions: current.workBotInstructions }, afterJson: { instructions: input.instructions }, requestId } });
      return { instructions: input.instructions, instructionsVersion: input.version + 1 };
    });
  }

  async createAlias(actor: User, storeId: string, input: CreateWorkBotAliasInput, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      await this.requireServiceOption(transaction, storeId, input.serviceItemId, input.durationMinutes);
      const aliasNormalized = normalizeWorkBotValue(input.alias);
      if (!aliasNormalized) this.invalidAlias();
      const created = await transaction.workBotAlias.create({
        data: { storeId, alias: input.alias.trim(), aliasNormalized, serviceItemId: input.serviceItemId, durationMinutes: input.durationMinutes },
        include: { serviceItem: { include: { priceOptions: true } } },
      });
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "work_bot.alias_created", entityType: "work_bot_alias", entityId: created.id,
        afterJson: { alias: created.alias, serviceItemId: created.serviceItemId, durationMinutes: created.durationMinutes }, requestId,
      } });
      return created;
    });
  }

  async updateAlias(actor: User, storeId: string, aliasId: string, input: UpdateWorkBotAliasInput, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workBotAlias.findFirst({ where: { id: aliasId, storeId } });
      if (!current) this.aliasNotFound();
      await this.requireServiceOption(transaction, storeId, input.serviceItemId, input.durationMinutes);
      const aliasNormalized = normalizeWorkBotValue(input.alias);
      if (!aliasNormalized) this.invalidAlias();
      const changed = await transaction.workBotAlias.updateMany({
        where: { id: aliasId, storeId, version: input.version },
        data: { alias: input.alias.trim(), aliasNormalized, serviceItemId: input.serviceItemId, durationMinutes: input.durationMinutes, isEnabled: input.isEnabled, version: { increment: 1 } },
      });
      if (changed.count !== 1) this.versionConflict();
      const updated = await transaction.workBotAlias.findUniqueOrThrow({ where: { id: aliasId }, include: { serviceItem: { include: { priceOptions: true } } } });
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "work_bot.alias_updated", entityType: "work_bot_alias", entityId: aliasId,
        beforeJson: { alias: current.alias, serviceItemId: current.serviceItemId, durationMinutes: current.durationMinutes, isEnabled: current.isEnabled, version: current.version },
        afterJson: { alias: updated.alias, serviceItemId: updated.serviceItemId, durationMinutes: updated.durationMinutes, isEnabled: updated.isEnabled, version: updated.version }, requestId,
      } });
      return updated;
    });
  }

  async removeAlias(actor: User, storeId: string, aliasId: string, version: number, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workBotAlias.findFirst({ where: { id: aliasId, storeId } });
      if (!current) this.aliasNotFound();
      const deleted = await transaction.workBotAlias.deleteMany({ where: { id: aliasId, storeId, version } });
      if (deleted.count !== 1) this.versionConflict();
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "work_bot.alias_deleted", entityType: "work_bot_alias", entityId: aliasId,
        beforeJson: { alias: current.alias, serviceItemId: current.serviceItemId, durationMinutes: current.durationMinutes, version: current.version }, requestId,
      } });
      return { deleted: true };
    });
  }

  async removeGroupBinding(actor: User, storeId: string, bindingId: string, version: number, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workBotGroupBinding.findFirst({
        where: { id: bindingId, storeId }, include: { memberBindings: true },
      });
      if (!current) this.bindingNotFound();
      if (current.memberBindings.some((item) => item.activeWorkRecordId !== null)) {
        throw new ConflictException({ code: "WORK_BOT_ACTIVE_RECORD", messageZh: "群内还有进行中的机器人记工，暂时不能解除店铺绑定" });
      }
      const deleted = await transaction.workBotGroupBinding.deleteMany({ where: { id: bindingId, storeId, version } });
      if (deleted.count !== 1) this.versionConflict();
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "work_bot.group_unbound", entityType: "work_bot_group_binding", entityId: bindingId,
        beforeJson: { platform: current.platform, botId: current.botId, groupId: current.groupId, version: current.version }, requestId,
      } });
      return { deleted: true };
    });
  }

  async removeMemberBinding(actor: User, storeId: string, bindingId: string, version: number, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workBotMemberBinding.findFirst({
        where: { id: bindingId, groupBinding: { storeId } }, include: { membership: { select: { displayName: true } } },
      });
      if (!current) this.bindingNotFound();
      if (current.activeWorkRecordId) {
        throw new ConflictException({ code: "WORK_BOT_ACTIVE_RECORD", messageZh: "该员工还有进行中的机器人记工，暂时不能解除绑定" });
      }
      const deleted = await transaction.workBotMemberBinding.deleteMany({ where: { id: bindingId, version } });
      if (deleted.count !== 1) this.versionConflict();
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "work_bot.member_unbound", entityType: "work_bot_member_binding", entityId: bindingId,
        beforeJson: { senderId: current.senderId, membershipId: current.membershipId, displayName: current.membership.displayName, version: current.version }, requestId,
      } });
      return { deleted: true };
    });
  }

  private async bindStore(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "BIND_STORE" }>, requestId: string) {
    const existing = await this.findGroupBinding(transaction, input);
    if (existing) {
      const reply = existing.store.storeCode === intent.storeCode
        ? `✅ 本群已经绑定店铺：${existing.store.name}（${existing.store.storeCode}）。`
        : `⛔ 本群已经绑定 ${existing.store.name}。换店请由店主或经理在 Massage Note 的“记工机器人”设置中解除绑定。`;
      return this.persistReply(transaction, input, intent, { outcome: existing.store.storeCode === intent.storeCode ? "STORE_ALREADY_BOUND" : "STORE_REBIND_FORBIDDEN", reply }, existing);
    }
    const store = await transaction.store.findFirst({ where: { storeCode: intent.storeCode, status: "ACTIVE", deletedAt: null } });
    if (!store) return this.persistReply(transaction, input, intent, { outcome: "STORE_NOT_FOUND", reply: "没有找到这个营业中的店铺，请检查 6 位店铺代码。" });
    const binding = await transaction.workBotGroupBinding.create({ data: {
      platform: input.platform, botId: input.botId, groupId: input.groupId, storeId: store.id,
    }, include: { store: true } });
    await transaction.auditLog.create({ data: {
      storeId: store.id, actorUserId: null, actorMembershipId: null, source: "langbot",
      action: "work_bot.group_bound", entityType: "work_bot_group_binding", entityId: binding.id,
      afterJson: { platform: input.platform, botId: input.botId, groupId: input.groupId, storeCode: store.storeCode }, requestId,
    } });
    return this.persistReply(transaction, input, intent, { outcome: "STORE_BOUND", reply: `✅ 本群已绑定店铺：${store.name}（${store.storeCode}）。下一步请各自发送“绑定 员工姓名”。` }, binding);
  }

  private async bindMember(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "BIND_MEMBER" }>, requestId: string) {
    const group = await this.findGroupBinding(transaction, input);
    if (!group) return this.persistReply(transaction, input, intent, { outcome: "GROUP_NOT_BOUND", reply: "请先发送“绑定店铺 6位店铺代码”。" });
    const members = await transaction.storeMembership.findMany({ where: {
      storeId: group.storeId, status: "ACTIVE", deletedAt: null,
    }, orderBy: { displayName: "asc" } });
    const targetName = normalizeDisplayName(intent.memberName);
    const exact = members.filter((member) => member.displayNameNormalized === targetName);
    const fuzzy = exact.length ? exact : members.filter((member) => member.displayNameNormalized.includes(targetName) || targetName.includes(member.displayNameNormalized));
    if (fuzzy.length !== 1) {
      const candidates = fuzzy.length ? fuzzy : members;
      const list = candidates.slice(0, 8).map((member) => member.displayName).join("、");
      return this.persistReply(transaction, input, intent, { outcome: "MEMBER_AMBIGUOUS", reply: fuzzy.length > 1 ? `姓名不唯一，请输入完整姓名：${list}` : `没有唯一匹配的在职员工。可选：${list || "暂无"}` }, group);
    }
    const target = fuzzy[0]!;
    const occupied = await transaction.workBotMemberBinding.findFirst({ where: {
      groupBindingId: group.id, membershipId: target.id, NOT: { senderId: input.senderId },
    } });
    const delegatedPlaceholder = occupied?.senderId.startsWith(DELEGATED_SENDER_PREFIX) ? occupied : null;
    if (occupied && !delegatedPlaceholder) return this.persistReply(transaction, input, intent, { outcome: "MEMBER_ALREADY_CLAIMED", reply: `${target.displayName} 已经绑定其他微信，请联系店主或经理在网页解除原绑定。` }, group);
    const current = await transaction.workBotMemberBinding.findUnique({ where: {
      groupBindingId_senderId: { groupBindingId: group.id, senderId: input.senderId },
    } });
    if (current?.activeWorkRecordId && current.membershipId !== target.id) {
      return this.persistReply(transaction, input, intent, { outcome: "ACTIVE_RECORD_BLOCKS_REBIND", reply: "你还有一条进行中的记工，请先下工后再重新绑定。" }, group);
    }
    if (delegatedPlaceholder && current && current.id !== delegatedPlaceholder.id) {
      return this.persistReply(transaction, input, intent, { outcome: "MEMBER_ALREADY_BOUND", reply: "这个微信已经代表另一名员工，请先下工并由管理员解除原绑定。" }, group);
    }
    const binding = delegatedPlaceholder
      ? await transaction.workBotMemberBinding.update({ where: { id: delegatedPlaceholder.id }, data: { senderId: input.senderId, verifiedAt: null, version: { increment: 1 } } })
      : current
        ? await transaction.workBotMemberBinding.update({ where: { id: current.id }, data: { membershipId: target.id, ...(current.membershipId !== target.id ? { verifiedAt: null } : {}), version: { increment: 1 } } })
        : await transaction.workBotMemberBinding.create({ data: { groupBindingId: group.id, senderId: input.senderId, membershipId: target.id } });
    await transaction.auditLog.create({ data: {
      storeId: group.storeId, actorUserId: null, actorMembershipId: target.id, source: "langbot",
      action: "work_bot.member_bound", entityType: "work_bot_member_binding", entityId: binding.id,
      beforeJson: delegatedPlaceholder
        ? { membershipId: delegatedPlaceholder.membershipId, senderId: "delegated-placeholder" }
        : current
          ? { membershipId: current.membershipId, senderId: current.senderId }
          : Prisma.DbNull,
      afterJson: { membershipId: target.id, displayName: target.displayName, senderId: input.senderId }, requestId,
    } });
    return this.persistReply(transaction, input, intent, { outcome: "MEMBER_BOUND", reply: `✅ 绑定成功：这个微信现在代表 ${target.displayName}。` }, group);
  }

  private async startWork(transaction: Prisma.TransactionClient, secret: string, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "START" }>, requestId: string) {
    const context = await this.requireBoundMember(transaction, input, intent);
    if ("reply" in context) return context.reply;
    const { group, binding: actorBinding } = context;
    let targetMembershipId = actorBinding.membershipId;
    let targetBindingId: string | null = actorBinding.id;
    let targetBindingVersion: number | null = actorBinding.version;
    let targetActiveWorkRecordId = actorBinding.activeWorkRecordId;
    if (intent.memberName) {
      const members = await transaction.storeMembership.findMany({ where: {
        storeId: group.storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true,
      }, orderBy: { displayName: "asc" } });
      const targetName = normalizeDisplayName(intent.memberName);
      const exact = members.filter((member) => member.displayNameNormalized === targetName);
      const fuzzy = exact.length ? exact : members.filter((member) => member.displayNameNormalized.includes(targetName) || targetName.includes(member.displayNameNormalized));
      if (fuzzy.length !== 1) {
        const list = (fuzzy.length ? fuzzy : members).slice(0, 8).map((member) => member.displayName).join("、");
        return this.persistReply(transaction, input, intent, {
          outcome: "TARGET_MEMBER_AMBIGUOUS",
          reply: fuzzy.length > 1 ? `员工姓名不唯一，请输入完整姓名：${list}` : `没有唯一匹配的在职员工。可选：${list || "暂无"}`,
        }, group);
      }
      targetMembershipId = fuzzy[0]!.id;
      const targetBinding = await transaction.workBotMemberBinding.findUnique({ where: {
        groupBindingId_membershipId: { groupBindingId: group.id, membershipId: fuzzy[0]!.id },
      } });
      targetBindingId = targetBinding?.id ?? null;
      targetBindingVersion = targetBinding?.version ?? null;
      targetActiveWorkRecordId = targetBinding?.activeWorkRecordId ?? null;
    }
    if (targetActiveWorkRecordId) return this.persistReply(transaction, input, intent, { outcome: "WORK_ALREADY_ACTIVE", reply: intent.memberName ? "该员工已经有一条进行中的机器人记工，请先下工。" : "你已经有一条进行中的机器人记工，请先下工。", recordId: targetActiveWorkRecordId }, group);
    const activeInAnotherGroup = await transaction.workBotMemberBinding.findFirst({
      where: { membershipId: targetMembershipId, activeWorkRecordId: { not: null } },
      select: { activeWorkRecordId: true },
    });
    if (activeInAnotherGroup?.activeWorkRecordId) {
      return this.persistReply(transaction, input, intent, {
        outcome: "WORK_ALREADY_ACTIVE",
        reply: "这个员工已经在另一个群里有一条进行中的机器人记工，请回原群下工。",
        recordId: activeInAnotherGroup.activeWorkRecordId,
      }, group);
    }
    let alias = await transaction.workBotAlias.findUnique({
      where: { storeId_aliasNormalized: { storeId: group.storeId, aliasNormalized: normalizeWorkBotValue(intent.serviceAlias) } },
      select: { alias: true, durationMinutes: true, isEnabled: true, serviceItem: { include: { priceOptions: true } } },
    });
    // AI returns a catalog ID; legacy aliases still support already queued messages.
    if (/^[0-9a-f-]{36}$/i.test(intent.serviceAlias)) {
      const item = await transaction.serviceItem.findFirst({ where: { id: intent.serviceAlias, storeId: group.storeId, isEnabled: true, deletedAt: null }, include: { priceOptions: true } });
      if (item) alias = { alias: item.shortName, durationMinutes: item.durationMinutes, isEnabled: true, serviceItem: item };
    }
    if (!alias || !alias.isEnabled || !alias.serviceItem.isEnabled || alias.serviceItem.deletedAt) {
      return this.persistReply(transaction, input, intent, { outcome: "SERVICE_ALIAS_UNKNOWN", reply: `没有配置“${intent.serviceAlias}”对应的可用项目，请让店主或经理检查项目和记工说明。` }, group);
    }
    if (intent.durationSource === "SKILL") {
      const skillStore = await transaction.store.findUniqueOrThrow({ where: { id: group.storeId }, select: { workBotInstructions: true } });
      if (!skillStore.workBotInstructions.trim()) return this.persistReply(transaction, input, intent, { outcome: "SERVICE_DURATION_UNKNOWN", reply: "店铺尚未配置默认时长说明，请在消息中说明服务时长。" }, group);
    }
    const durationMinutes = intent.durationMinutes ?? alias.durationMinutes;
    const option = alias.serviceItem.priceOptions.find((candidate) => candidate.durationMinutes === durationMinutes);
    if (!option) {
      return this.persistReply(transaction, input, intent, { outcome: "SERVICE_DURATION_UNKNOWN", reply: `${alias.serviceItem.shortName} 没有 ${durationMinutes} 分钟这个价格档，请检查项目设置。` }, group);
    }
    const store = await this.requireStoreSettings(transaction, group.storeId);
    const startAt = workBotStartTime(input.rawText, input.occurredAt, store.timezone);
    if (!startAt) return this.persistReply(transaction, input, intent, { outcome: "START_TIME_UNCLEAR", reply: "上工时间不明确，尚未记工。请注明最近的实际开始时间，例如‘下午1:00 上工，大力60’；历史补录请在网页处理。" }, group);
    const businessDate = businessDateFor({ startAt, timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
    const actorMembership = await new WorkBotAccess(this.prisma, actorBinding.id).requireActiveMembership(actorBinding.membershipId, store.id, transaction);
    if (!canWriteWorkRecord({ role: actorMembership.role, isCurrentBusinessDay: businessDate === businessDateFor({ startAt: new Date(), timezone: store.timezone, cutoffLocal: store.businessCutoffLocal }), isDayClosed: false })) throw new ForbiddenException("普通员工只能操作当前营业日记工；历史修改需核实经理或店主身份");
    await this.assertBusinessDayOpen(transaction, store, businessDate);
    const employee = await transaction.storeMembership.findFirst({ where: { id: targetMembershipId, storeId: store.id, status: "ACTIVE", deletedAt: null, isServiceProvider: true } });
    if (!employee) return this.persistReply(transaction, input, intent, { outcome: "MEMBER_INACTIVE", reply: "绑定的员工已停用，请联系管理员处理。" }, group);
    const employeeDefaultBps = await this.resolveEmployeeDefaultCommission(transaction, store.id, employee.id, employee.defaultCommissionBps, startAt);
    const employeeItemBps = await this.resolveEmployeeItemCommission(transaction, store.id, employee.id, alias.serviceItem.id, startAt);
    const commission = resolveCommission({ employeeItemBps, itemDefaultBps: alias.serviceItem.defaultCommissionBps, employeeDefaultBps, storeDefaultBps: store.globalCommissionBps });
    const discounts = this.automaticDiscounts(store, businessDate, option.priceCents);
    const discountTotal = discounts.reduce((sum, discount) => sum + discount.amountCents, 0n);
    const wage = multiplyByBps(option.priceCents, commission.bps);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const actorId = this.integrationActorId(secret);
    const record = await transaction.workRecord.create({ data: {
      storeId: store.id, employeeMembershipId: employee.id,
      businessDate: new Date(`${businessDate}T00:00:00.000Z`), storeTimezoneSnapshot: store.timezone,
      businessCutoffSnapshot: store.businessCutoffLocal, startAt, endAt, actualDurationMinutes: durationMinutes,
      status: "PENDING_PAYMENT", mainServiceAmountCents: option.priceCents, addonTotalCents: 0n,
      grossFeeBaseCents: option.priceCents, discountTotalCents: discountTotal,
      discountedFeePerformanceCents: option.priceCents - discountTotal, mainServiceWageCents: wage,
      addonWageCents: 0n, totalLargeFeeWageCents: wage, createdBy: actorId, updatedBy: actorId,
      serviceSnapshot: { create: {
        sourceServiceItemId: alias.serviceItem.id, isCustom: false, name: alias.serviceItem.fullName,
        shortName: alias.serviceItem.shortName, amountCents: option.priceCents, durationMinutes,
        commissionBps: commission.bps, commissionSource: commission.source, wageCents: wage,
      } },
      ...(discounts.length ? { discountSnapshots: { create: discounts } } : {}),
    } });
    await ensureBoardRow(transaction, store.id, businessDate, employee.id, actorId);
    if (!targetBindingId || targetBindingVersion === null) {
      const placeholder = await transaction.workBotMemberBinding.create({ data: {
        groupBindingId: group.id,
        senderId: `${DELEGATED_SENDER_PREFIX}${targetMembershipId}`,
        membershipId: targetMembershipId,
      } });
      targetBindingId = placeholder.id;
      targetBindingVersion = placeholder.version;
    }
    let claimed: { count: number };
    try {
      claimed = await transaction.workBotMemberBinding.updateMany({
        where: { id: targetBindingId, activeWorkRecordId: null, version: targetBindingVersion },
        data: { activeWorkRecordId: record.id, version: { increment: 1 } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "WORK_BOT_CONCURRENT_START", messageZh: "这个员工的另一条上工指令正在处理，请回原群核对" });
      }
      throw error;
    }
    if (claimed.count !== 1) throw new ConflictException({ code: "WORK_BOT_CONCURRENT_START", messageZh: "另一条上工指令正在处理，请刷新后重试" });
    await this.reopenCashSettlements(transaction, store.id, businessDate, actorId, employee.id, requestId);
    await transaction.auditLog.create({ data: {
      storeId: store.id, actorUserId: null, actorMembershipId: employee.id, source: "langbot",
      action: "work_bot.work_started", entityType: "work_record", entityId: record.id,
      businessDate: record.businessDate, afterJson: { employeeMembershipId: employee.id, requestedByMembershipId: actorBinding.membershipId, alias: alias.alias, serviceItemId: alias.serviceItem.id, durationMinutes, startAt: startAt.toISOString(), endAt: endAt.toISOString(), amountCents: option.priceCents.toString(), status: record.status }, requestId,
    } });
    return this.persistReply(transaction, input, intent, {
      outcome: "WORK_STARTED", reply: `✅ ${employee.displayName} 已上工：${alias.serviceItem.shortName} ${durationMinutes} 分钟，开始 ${this.formatTime(startAt, store.timezone)}，预计 ${this.formatTime(endAt, store.timezone)}。`,
      recordId: record.id, businessDate,
    }, group);
  }

  private async finishWork(transaction: Prisma.TransactionClient, secret: string, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "FINISH" | "ADJUST" }>, requestId: string) {
    const context = await this.requireBoundMember(transaction, input, intent);
    if ("reply" in context) return context.reply;
    const { group, binding } = context;
    let targetId: string | undefined = intent.recordId && !intent.memberName ? undefined : binding.membershipId;
    if (intent.memberName) {
      const members = await transaction.storeMembership.findMany({ where: { storeId: group.storeId, status: "ACTIVE", deletedAt: null, displayNameNormalized: normalizeDisplayName(intent.memberName) } });
      if (members.length !== 1) return this.persistReply(transaction, input, intent, { outcome: "TARGET_MEMBER_AMBIGUOUS", reply: "没有唯一匹配的在职员工，请输入完整姓名。" }, group);
      targetId = members[0]!.id;
    }
    const records = await transaction.workRecord.findMany({
      where: { storeId: group.storeId, ...(intent.recordId ? { id: intent.recordId } : {}), ...(targetId ? { employeeMembershipId: targetId } : {}), deletedAt: null,
        ...(!intent.recordId || intent.kind === "FINISH" ? { status: "PENDING_PAYMENT" } : {}), startAt: { lte: new Date(input.occurredAt) } },
      include: { employee: true, addonSnapshots: true, discountSnapshots: true }, take: 2,
    });
    if (records.length !== 1) return this.persistReply(transaction, input, intent, { outcome: records.length ? "ACTIVE_WORK_AMBIGUOUS" : "NO_ACTIVE_WORK", reply: records.length ? "该员工有多条待付款记工，请查询待付款列表后指定完整记录编号。" : "没有找到对应记工，请先上工或核对编号。" }, group);
    const record = records[0]!;
    const details: UpdateWorkRecordInput = { version: record.version };
    if (intent.isHighlighted !== undefined) details.isHighlighted = intent.isHighlighted;
    if (intent.discounts?.length) {
      details.discounts = record.discountSnapshots.filter(d => !d.isAutomatic).map(d => ({ sourceItemId: d.sourceDiscountItemId, isCustom: d.isCustom, name: d.name, amountCents: Number(d.amountCents) }));
      const catalog = await transaction.discountItem.findMany({ where: { storeId: group.storeId, isEnabled: true, deletedAt: null } });
      for (const selection of intent.discounts) {
        if (selection.action === "REMOVE") {
          const existing: NonNullable<UpdateWorkRecordInput["discounts"]> = details.discounts.filter(d => normalizeWorkBotValue(d.name) === normalizeWorkBotValue(selection.name));
          if (existing.length !== 1) throw new BadRequestException(`记工中没有唯一的折扣「${selection.name}」`);
          details.discounts = details.discounts.filter(d => d !== existing[0]);
        } else {
          const items = catalog.filter(d => [d.name, d.shortName].some(name => normalizeWorkBotValue(name) === normalizeWorkBotValue(selection.name)));
          if (items.length !== 1) return this.persistReply(transaction, input, intent, { outcome: "DISCOUNT_UNKNOWN", reply: `折扣「${selection.name}」没有唯一配置，未修改记工。` }, group);
          const item = items[0]!;
          if (!details.discounts.some(d => d.sourceItemId === item.id)) details.discounts.push({ sourceItemId: item.id, isCustom: false, name: item.name, amountCents: Number(item.amountCents) });
        }
      }
    }
    if (intent.addons?.length) {
      details.addons = record.addonSnapshots.map(a => ({ sourceItemId: a.sourceAddonItemId, isCustom: a.isCustom, name: a.name, shortName: a.shortName, amountCents: Number(a.amountCents), durationMinutes: a.durationMinutes }));
      const catalog = await transaction.addonItem.findMany({ where: { storeId: group.storeId, isEnabled: true, deletedAt: null } });
      for (const selection of intent.addons) {
        if (selection.action === "REMOVE") {
          const existing: NonNullable<UpdateWorkRecordInput["addons"]> = details.addons.filter(a => normalizeWorkBotValue(a.name) === normalizeWorkBotValue(selection.name));
          if (existing.length !== 1) throw new BadRequestException(`记工中没有唯一的加项「${selection.name}」`);
          details.addons = details.addons.filter(a => a !== existing[0]);
        } else {
          const items = catalog.filter(a => normalizeWorkBotValue(a.name) === normalizeWorkBotValue(selection.name));
          if (items.length !== 1) return this.persistReply(transaction, input, intent, { outcome: "ADDON_UNKNOWN", reply: `加项「${selection.name}」没有唯一配置，未修改记工。` }, group);
          const item = items[0]!;
          if (!details.addons.some(a => a.sourceItemId === item.id)) details.addons.push({ sourceItemId: item.id, isCustom: false, name: item.name, shortName: item.shortName, amountCents: Number(item.amountCents), durationMinutes: item.durationMinutes });
        }
      }
    }
    if (intent.kind === "FINISH") details.endAt = input.occurredAt;
    const service = new WorkRecordsService(this.prisma, new WorkBotAccess(this.prisma, binding.id), new IdempotencyService(this.prisma)).withWorkBotAudit();
    const actor = { id: binding.membershipId } as User;
    const key = `bot-${createHash("sha256").update(`${input.botId}:${input.groupId}:${input.messageId}`).digest("hex")}`;
    const updated = await service.update(actor, group.storeId, record.id, parseRequest(updateWorkRecordSchema, details), key, requestId, transaction);
    if (intent.kind === "FINISH") {
      const cash = intent.paymentMethod === "CASH";
      await service.confirmPayment(actor, group.storeId, record.id, confirmPaymentSchema.parse({ version: updated.version,
        cashServiceCents: cash ? Number(this.parseDollars(intent.serviceAmount)) : 0,
        cardServiceCents: cash ? 0 : Number(this.parseDollars(intent.serviceAmount)),
        cashTipCents: cash ? Number(this.parseDollars(intent.tipAmount)) : 0,
        cardTipCents: cash ? 0 : Number(this.parseDollars(intent.tipAmount)),
      }), key, requestId, transaction);
    }
    const final = await transaction.workRecord.findUniqueOrThrow({ where: { id: record.id }, include: { discountSnapshots: true, addonSnapshots: true } });
    await transaction.auditLog.create({ data: { storeId: group.storeId, actorUserId: null, actorMembershipId: binding.membershipId, source: "langbot", action: intent.kind === "FINISH" ? "work_bot.work_finished" : "work_bot.work_adjusted", entityType: "work_record", entityId: record.id, businessDate: record.businessDate, afterJson: { requestedByMembershipId: binding.membershipId, messageId: input.messageId }, requestId } });
    if (intent.kind === "FINISH") {
      const amounts: string[] = [];
      if (final.mainServiceAmountCents !== final.actualServiceCollectedCents) {
        amounts.push(`项目金额 ${this.formatMoney(final.mainServiceAmountCents)}`);
      }
      const details: string[] = [];
      if (final.addonSnapshots.length || final.addonTotalCents !== 0n) {
        amounts.push(`加项 ${this.formatMoney(final.addonTotalCents)}`);
        if (final.addonSnapshots.length) details.push(`加项：${final.addonSnapshots.map(a => a.name).join("、")}`);
      }
      if (final.discountSnapshots.length || final.discountTotalCents !== 0n) {
        amounts.push(`折扣 ${this.formatMoney(final.discountTotalCents)}`);
        if (final.discountSnapshots.length) details.push(`折扣项：${final.discountSnapshots.map(d => d.name).join("、")}`);
      }
      const lines = [
        `✅ ${record.employee.displayName} 已下工`,
        ...(amounts.length ? [amounts.join("；")] : []),
        `实收 ${final.actualServiceCollectedCents === null ? "未收款" : this.formatMoney(final.actualServiceCollectedCents)}；小费 ${this.formatMoney(final.totalTipCents ?? 0n)}${final.isHighlighted ? "；已高亮" : ""}`,
      ];
      if (details.length) lines.push(details.join("；"));
      if (final.actualServiceCollectedCents !== null && final.actualServiceCollectedCents !== final.discountedFeePerformanceCents) {
        const difference = final.actualServiceCollectedCents - final.discountedFeePerformanceCents;
        lines.push(`⚠️ 金额不一致：应收 ${this.formatMoney(final.discountedFeePerformanceCents)}，${difference < 0n ? "少收" : "多收"} ${this.formatMoney(difference < 0n ? -difference : difference)}`);
      }
      return this.persistReply(transaction, input, intent, { outcome: "WORK_FINISHED", recordId: record.id, businessDate: record.businessDate.toISOString().slice(0, 10), reply: lines.join("\n") }, group);
    }
    return this.persistReply(transaction, input, intent, { outcome: "WORK_ADJUSTED", recordId: record.id, businessDate: record.businessDate.toISOString().slice(0, 10), reply: `✅ ${record.employee.displayName} 记工已更新\n项目金额 ${this.formatMoney(final.mainServiceAmountCents)}；加项 ${this.formatMoney(final.addonTotalCents)}；折扣 ${this.formatMoney(final.discountTotalCents)}；折后大费 ${this.formatMoney(final.discountedFeePerformanceCents)}\n实收 ${final.actualServiceCollectedCents === null ? "未收款" : this.formatMoney(final.actualServiceCollectedCents)}；小费 ${this.formatMoney(final.totalTipCents ?? 0n)}；${final.isHighlighted ? "已高亮" : "未高亮"}\n折扣项：${final.discountSnapshots.map(d => d.name).join("、") || "无"}；加项：${final.addonSnapshots.map(a => a.name).join("、") || "无"}\n编号 ${record.id}` }, group);
  }

  private async requireBoundMember(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: WorkBotParsedIntent): Promise<{ group: Awaited<ReturnType<WorkBotService["findGroupBinding"]>> & {}; binding: NonNullable<Awaited<ReturnType<typeof transaction.workBotMemberBinding.findUnique>>> } | { reply: WorkBotReply }> {
    const group = await this.findGroupBinding(transaction, input);
    if (!group) return { reply: await this.persistReply(transaction, input, intent, { outcome: "GROUP_NOT_BOUND", reply: "请先发送“绑定店铺 6位店铺代码”。" }) };
    const binding = await transaction.workBotMemberBinding.findUnique({ where: { groupBindingId_senderId: { groupBindingId: group.id, senderId: input.senderId } } });
    if (!binding) return { reply: await this.persistReply(transaction, input, intent, { outcome: "MEMBER_NOT_BOUND", reply: "请先发送“绑定 你的员工姓名”。" }, group) };
    const member = await transaction.storeMembership.findFirst({ where: {
      id: binding.membershipId, storeId: group.storeId, status: "ACTIVE", deletedAt: null,
      OR: [{ userId: null }, { user: { status: "ACTIVE" } }],
    } });
    if (!member) throw new ForbiddenException({ code: "WORK_BOT_MEMBER_INACTIVE", messageZh: "绑定的员工已停用，请联系管理员处理" });
    return { group, binding };
  }

  private checkedOperationReply(operation: NonNullable<Awaited<ReturnType<WorkBotService["findOperation"]>>>, input: WorkBotEventInput) {
    if (operation.senderId !== input.senderId || operation.rawText !== input.rawText) {
      throw new ConflictException({ code: "WORK_BOT_MESSAGE_ID_REUSED", messageZh: "同一个微信消息编号不能用于不同内容" });
    }
    return this.operationReply(operation);
  }

  private async persistReply(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: WorkBotParsedIntent, result: WorkBotReply, group?: { id: string; storeId: string } | null): Promise<WorkBotReply> {
    await transaction.workBotOperation.create({ data: {
      platform: input.platform, botId: input.botId, groupId: input.groupId, senderId: input.senderId,
      messageId: input.messageId, groupBindingId: group?.id ?? null, storeId: group?.storeId ?? null,
      workRecordId: result.recordId ?? null, intent: intent.kind, outcome: result.outcome, rawText: input.rawText,
      parsedJson: intent as Prisma.InputJsonValue, reply: result.reply, occurredAt: new Date(input.occurredAt),
    } });
    return result;
  }

  private findOperation(input: WorkBotEventInput) {
    return this.prisma.workBotOperation.findUnique({ where: { platform_botId_groupId_messageId: {
      platform: input.platform, botId: input.botId, groupId: input.groupId, messageId: input.messageId,
    } }, include: { workRecord: { select: { businessDate: true } } } });
  }

  private operationReply(operation: { outcome: string; reply: string; workRecordId: string | null; workRecord?: { businessDate: Date } | null }): WorkBotReply {
    return {
      outcome: operation.outcome,
      reply: operation.reply,
      ...(operation.workRecordId ? { recordId: operation.workRecordId } : {}),
      ...(operation.workRecord ? { businessDate: operation.workRecord.businessDate.toISOString().slice(0, 10) } : {}),
    };
  }

  private async findGroupBinding(transaction: Prisma.TransactionClient, input: WorkBotEventInput) {
    const group = await transaction.workBotGroupBinding.findUnique({ where: { platform_botId_groupId: {
      platform: input.platform, botId: input.botId, groupId: input.groupId,
    } }, include: { store: true } });
    if (group && (group.store.status !== "ACTIVE" || group.store.deletedAt)) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    return group;
  }

  private async requireStoreSettings(transaction: Prisma.TransactionClient, storeId: string): Promise<StoreSettings> {
    const store = await transaction.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null }, select: {
      id: true, name: true, storeCode: true, timezone: true, businessCutoffLocal: true, globalCommissionBps: true,
      mondayThursdayAutoDiscountEnabled: true, mondayThursdayAutoDiscountThresholdCents: true, mondayThursdayAutoDiscountAmountCents: true,
    } });
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    return store;
  }

  private async assertBusinessDayOpen(transaction: Prisma.TransactionClient, store: StoreSettings, businessDate: string) {
    await lockBusinessDay(transaction, store.id, businessDate);
    const closed = await transaction.businessDayClosing.findFirst({ where: { storeId: store.id, businessDate: new Date(`${businessDate}T00:00:00.000Z`), status: "CLOSED" }, select: { id: true } });
    if (closed) throw new ConflictException({ code: "BUSINESS_DAY_CLOSED", messageZh: "该营业日已经日结，请先到网页取消日结" });
  }

  private async requireServiceOption(transaction: Prisma.TransactionClient, storeId: string, serviceItemId: string, durationMinutes: number) {
    const service = await transaction.serviceItem.findFirst({ where: { id: serviceItemId, storeId, isEnabled: true, deletedAt: null }, include: { priceOptions: true } });
    if (!service || !service.priceOptions.some((option) => option.durationMinutes === durationMinutes)) {
      throw new BadRequestException({ code: "WORK_BOT_SERVICE_OPTION_INVALID", messageZh: "别名必须指向启用中的项目和现有时长价格" });
    }
    return service;
  }

  private async resolveEmployeeDefaultCommission(transaction: Prisma.TransactionClient, storeId: string, membershipId: string, fallback: number | null, effectiveAt: Date) {
    const history = await transaction.employeeDefaultCommission.findFirst({ where: {
      storeId, membershipId, effectiveFrom: { lte: effectiveAt }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
    }, orderBy: { effectiveFrom: "desc" }, select: { commissionBps: true } });
    return history?.commissionBps ?? fallback;
  }

  private async resolveEmployeeItemCommission(transaction: Prisma.TransactionClient, storeId: string, membershipId: string, itemId: string, effectiveAt: Date) {
    const history = await transaction.employeeItemCommission.findFirst({ where: {
      storeId, membershipId, itemType: "SERVICE", itemId, effectiveFrom: { lte: effectiveAt }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
    }, orderBy: { effectiveFrom: "desc" }, select: { commissionBps: true } });
    return history?.commissionBps ?? null;
  }

  private automaticDiscounts(store: StoreSettings, businessDate: string, gross: bigint, position = 0) {
    const weekday = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
    const amount = store.mondayThursdayAutoDiscountAmountCents;
    if (!store.mondayThursdayAutoDiscountEnabled || weekday < 1 || weekday > 4 || store.mondayThursdayAutoDiscountThresholdCents <= 0n || amount <= 0n || amount > store.mondayThursdayAutoDiscountThresholdCents || gross < store.mondayThursdayAutoDiscountThresholdCents) return [];
    return [{ sourceDiscountItemId: null, isCustom: false, isAutomatic: true, name: AUTO_DISCOUNT_NAME, amountCents: amount, position }];
  }

  private async reopenCashSettlements(transaction: Prisma.TransactionClient, storeId: string, businessDate: string, actorId: string, membershipId: string, requestId: string) {
    const date = new Date(`${businessDate}T00:00:00.000Z`);
    const settlements = await transaction.dailyCashSettlement.findMany({ where: { storeId, businessDate: date, status: "SETTLED", deletedAt: null } });
    if (!settlements.length) return;
    await transaction.dailyCashSettlement.updateMany({ where: { id: { in: settlements.map((item) => item.id) } }, data: { status: "UNSETTLED", settledBy: null, settledAt: null, version: { increment: 1 } } });
    for (const settlement of settlements) await transaction.auditLog.create({ data: {
      storeId, actorUserId: null, actorMembershipId: membershipId, source: "langbot",
      action: "cash_settlement.reopened_automatically", entityType: "daily_cash_settlement", entityId: settlement.id,
      businessDate: settlement.businessDate, beforeJson: { status: settlement.status, settledAt: settlement.settledAt?.toISOString() ?? null, version: settlement.version },
      afterJson: { status: "UNSETTLED", settledAt: null, version: settlement.version + 1, integrationActorId: actorId },
      reason: "机器人记工发生变化，需要重新确认现金结算", requestId,
    } });
  }

  private requireIntegrationSecret(authorization: string | undefined): string {
    const secret = process.env.LANGBOT_WORK_TOKEN;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException({ code: "WORK_BOT_NOT_CONFIGURED", messageZh: "记工机器人接口尚未配置" });
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization ?? "");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException({ code: "WORK_BOT_TOKEN_INVALID", messageZh: "记工机器人凭证无效" });
    return secret;
  }

  private integrationActorId(secret: string): string {
    const hex = createHash("sha256").update(`massage-note-work-bot:${secret}`).digest("hex").slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private parseDollars(value: string): bigint {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) throw new BadRequestException({ code: "WORK_BOT_AMOUNT_INVALID", messageZh: "金额必须是整数或最多两位小数" });
    const cents = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException({ code: "AMOUNT_TOTAL_TOO_LARGE", messageZh: "金额超出系统允许范围" });
    return cents;
  }

  private formatMoney(value: bigint): string {
    const absolute = value < 0n ? -value : value;
    return `${value < 0n ? "-" : ""}$${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
  }

  private formatTime(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  }

  private aliasNotFound(): never { throw new NotFoundException({ code: "WORK_BOT_ALIAS_NOT_FOUND", messageZh: "没有找到这个记工黑话" }); }
  private bindingNotFound(): never { throw new NotFoundException({ code: "WORK_BOT_BINDING_NOT_FOUND", messageZh: "没有找到这个机器人绑定" }); }
  private invalidAlias(): never { throw new BadRequestException({ code: "WORK_BOT_ALIAS_INVALID", messageZh: "记工黑话不能为空" }); }
  private versionConflict(): never { throw new ConflictException({ code: "WORK_BOT_VERSION_CONFLICT", messageZh: "机器人设置已被修改，请刷新后重试" }); }
}
