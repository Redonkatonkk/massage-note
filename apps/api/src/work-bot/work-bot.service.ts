import { createHash, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CreateWorkBotAliasInput,
  UpdateWorkBotAliasInput,
  WorkBotContextRequest,
  WorkBotEventInput,
  WorkBotParsedIntent,
} from "@massage-note/contracts";
import {
  businessDateFor,
  calculateWorkRecordFinance,
  multiplyByBps,
  resolveCommission,
} from "@massage-note/domain";
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

const HELP_REPLY = "我只处理记工：绑定店铺 123456、绑定 张三、大力 90、Jessie 脚 30、下工 80 20 现金（或卡）。信息不完整时不会写账。";
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
        store: { select: { name: true } },
        memberBindings: {
          where: { senderId: input.senderId },
          select: { membership: { select: { displayName: true } } },
          take: 1,
        },
      },
    });
    if (!group) {
      return { status: "UNBOUND" as const, storeName: null, actorName: null, aliases: [], members: [] };
    }
    const [aliases, members] = await Promise.all([
      this.prisma.workBotAlias.findMany({
        where: {
          storeId: group.storeId,
          isEnabled: true,
          serviceItem: { isEnabled: true, deletedAt: null },
        },
        select: {
          alias: true,
          durationMinutes: true,
          serviceItem: {
            select: {
              fullName: true,
              shortName: true,
              priceOptions: {
                select: { durationMinutes: true },
                orderBy: [{ position: "asc" }, { durationMinutes: "asc" }],
              },
            },
          },
        },
        orderBy: [{ aliasNormalized: "asc" }],
      }),
      this.prisma.storeMembership.findMany({
        where: {
          storeId: group.storeId,
          status: "ACTIVE",
          deletedAt: null,
          isServiceProvider: true,
        },
        select: { displayName: true },
        orderBy: [{ displayNameNormalized: "asc" }],
      }),
    ]);
    return {
      status: "BOUND" as const,
      storeName: group.store.name,
      actorName: group.memberBindings[0]?.membership.displayName ?? null,
      aliases: aliases.map((item) => ({
        alias: item.alias,
        serviceName: item.serviceItem.fullName,
        serviceShortName: item.serviceItem.shortName,
        defaultDurationMinutes: item.durationMinutes,
        availableDurationMinutes: item.serviceItem.priceOptions.map((option) => option.durationMinutes),
      })),
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
      return this.operationReply(existing);
    }

    let intent = input.parsedIntent ?? parseWorkBotMessage(input.rawText);
    if (!parsedIntentAppearsInRawText(intent, input.rawText)) intent = { kind: "HELP" };

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
        if (duplicate) return this.operationReply(duplicate);

        switch (intent.kind) {
          case "BIND_STORE":
            return this.bindStore(transaction, input, intent, requestId);
          case "BIND_MEMBER":
            return this.bindMember(transaction, input, intent, requestId);
          case "START":
            return this.startWork(transaction, secret, input, intent, requestId);
          case "FINISH":
            return this.finishWork(transaction, secret, input, intent, requestId);
          case "HELP":
            return this.persistReply(transaction, input, intent, {
              outcome: "HELP",
              reply: HELP_REPLY,
            });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.findOperation(input);
        if (duplicate) return this.operationReply(duplicate);
      }
      throw error;
    }
  }

  async getSettings(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    const [groups, aliases, operations] = await Promise.all([
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
    ]);
    return { groups, aliases, operations };
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
      storeId: group.storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true,
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
      ? await transaction.workBotMemberBinding.update({ where: { id: delegatedPlaceholder.id }, data: { senderId: input.senderId, version: { increment: 1 } } })
      : current
        ? await transaction.workBotMemberBinding.update({ where: { id: current.id }, data: { membershipId: target.id, version: { increment: 1 } } })
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
    const alias = await transaction.workBotAlias.findUnique({
      where: { storeId_aliasNormalized: { storeId: group.storeId, aliasNormalized: normalizeWorkBotValue(intent.serviceAlias) } },
      include: { serviceItem: { include: { priceOptions: true } } },
    });
    if (!alias || !alias.isEnabled || !alias.serviceItem.isEnabled || alias.serviceItem.deletedAt) {
      return this.persistReply(transaction, input, intent, { outcome: "SERVICE_ALIAS_UNKNOWN", reply: `没有配置“${intent.serviceAlias}”这个记工黑话，请让店主或经理到网页添加。` }, group);
    }
    const durationMinutes = intent.durationMinutes ?? alias.durationMinutes;
    const option = alias.serviceItem.priceOptions.find((candidate) => candidate.durationMinutes === durationMinutes);
    if (!option) {
      return this.persistReply(transaction, input, intent, { outcome: "SERVICE_DURATION_UNKNOWN", reply: `${alias.serviceItem.shortName} 没有 ${durationMinutes} 分钟这个价格档，请检查项目设置。` }, group);
    }
    const store = await this.requireStoreSettings(transaction, group.storeId);
    const startAt = new Date(input.occurredAt);
    const businessDate = businessDateFor({ startAt, timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
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

  private async finishWork(transaction: Prisma.TransactionClient, secret: string, input: WorkBotEventInput, intent: Extract<WorkBotParsedIntent, { kind: "FINISH" }>, requestId: string) {
    const context = await this.requireBoundMember(transaction, input, intent);
    if ("reply" in context) return context.reply;
    const { group, binding } = context;
    if (!binding.activeWorkRecordId) return this.persistReply(transaction, input, intent, { outcome: "NO_ACTIVE_WORK", reply: "没有找到你当前进行中的机器人记工，请先上工。" }, group);
    const record = await transaction.workRecord.findFirst({
      where: { id: binding.activeWorkRecordId, storeId: group.storeId, employeeMembershipId: binding.membershipId, deletedAt: null, status: "PENDING_PAYMENT" },
      include: { employee: true, serviceSnapshot: true, addonSnapshots: true, discountSnapshots: true },
    });
    if (!record?.serviceSnapshot) return this.persistReply(transaction, input, intent, { outcome: "ACTIVE_WORK_INVALID", reply: "进行中的记工状态异常，请到网页检查并联系管理员解除绑定。" }, group);
    const store = await this.requireStoreSettings(transaction, group.storeId);
    const businessDate = record.businessDate.toISOString().slice(0, 10);
    await this.assertBusinessDayOpen(transaction, store, businessDate);
    const endAt = new Date(input.occurredAt);
    if (endAt < record.startAt) return this.persistReply(transaction, input, intent, { outcome: "END_BEFORE_START", reply: "下工时间早于上工时间，未写入账目。" }, group);
    const serviceAmount = this.parseDollars(intent.serviceAmount);
    const tipAmount = this.parseDollars(intent.tipAmount);
    const manualDiscounts = record.discountSnapshots.filter((discount) => !discount.isAutomatic).map((discount, position) => ({
      sourceDiscountItemId: discount.sourceDiscountItemId, isCustom: discount.isCustom, isAutomatic: false,
      name: discount.name, amountCents: discount.amountCents, position,
    }));
    const discounts = [...manualDiscounts, ...this.automaticDiscounts(store, businessDate, serviceAmount, manualDiscounts.length)];
    const cash = intent.paymentMethod === "CASH";
    const finance = calculateWorkRecordFinance({
      mainServiceAmountCents: serviceAmount,
      mainServiceCommissionBps: record.serviceSnapshot.commissionBps,
      addons: record.addonSnapshots.map((addon) => ({ amountCents: addon.amountCents, commissionBps: addon.commissionBps })),
      discountAmountsCents: discounts.map((discount) => discount.amountCents),
      cashServiceCents: cash ? serviceAmount : 0n, cardServiceCents: cash ? 0n : serviceAmount,
      giftCardServiceCents: 0n, cashTipCents: cash ? tipAmount : 0n, cardTipCents: cash ? 0n : tipAmount, giftCardTipCents: 0n,
    });
    const actorId = this.integrationActorId(secret);
    const actualDurationMinutes = Math.round((endAt.getTime() - record.startAt.getTime()) / 60_000);
    await transaction.workRecordServiceSnapshot.update({ where: { workRecordId: record.id }, data: { amountCents: serviceAmount, wageCents: finance.mainServiceWageCents } });
    await transaction.workRecordDiscountSnapshot.deleteMany({ where: { workRecordId: record.id } });
    if (discounts.length) await transaction.workRecordDiscountSnapshot.createMany({ data: discounts.map((discount) => ({ workRecordId: record.id, ...discount })) });
    const changed = await transaction.workRecord.updateMany({ where: { id: record.id, storeId: store.id, version: record.version, status: "PENDING_PAYMENT", deletedAt: null }, data: {
      endAt, actualDurationMinutes, status: "CONFIRMED",
      mainServiceAmountCents: finance.mainServiceAmountCents, addonTotalCents: finance.addonTotalCents,
      grossFeeBaseCents: finance.grossFeeBaseCents, discountTotalCents: finance.discountTotalCents,
      discountedFeePerformanceCents: finance.discountedFeePerformanceCents,
      cashServiceCents: finance.cashServiceCents, cardServiceCents: finance.cardServiceCents,
      giftCardSerialNumber: null, giftCardServiceCents: 0n, cashTipCents: finance.cashTipCents,
      cardTipCents: finance.cardTipCents, giftCardTipCents: 0n, totalTipCents: finance.totalTipCents,
      actualServiceCollectedCents: finance.actualServiceCollectedCents, customerTotalPaidCents: finance.customerTotalPaidCents,
      paymentDifferenceCents: finance.paymentDifferenceCents, mainServiceWageCents: finance.mainServiceWageCents,
      addonWageCents: finance.addonWageCents, totalLargeFeeWageCents: finance.totalLargeFeeWageCents,
      employeeTotalIncomeCents: finance.employeeTotalIncomeCents, cashAllocatedServiceWageCents: finance.cashAllocatedServiceWageCents,
      cashAcquiredServiceWageCents: finance.cashAcquiredServiceWageCents, cashWageShortfallCents: finance.cashWageShortfallCents,
      manualPriceFlag: serviceAmount !== record.serviceSnapshot.amountCents, updatedBy: actorId, version: { increment: 1 },
    } });
    if (changed.count !== 1) throw new ConflictException({ code: "WORK_BOT_RECORD_CONFLICT", messageZh: "记工已被其他设备修改，请到网页核对" });
    await transaction.paymentBreakdown.upsert({ where: { workRecordId: record.id }, create: {
      workRecordId: record.id, cashServiceCents: finance.cashServiceCents, cardServiceCents: finance.cardServiceCents,
      giftCardSerialNumber: null, giftCardServiceCents: 0n, cashTipCents: finance.cashTipCents,
      cardTipCents: finance.cardTipCents, giftCardTipCents: 0n, confirmedAt: endAt, confirmedBy: actorId,
    }, update: {
      cashServiceCents: finance.cashServiceCents, cardServiceCents: finance.cardServiceCents,
      giftCardSerialNumber: null, giftCardServiceCents: 0n, cashTipCents: finance.cashTipCents,
      cardTipCents: finance.cardTipCents, giftCardTipCents: 0n, confirmedAt: endAt, confirmedBy: actorId, version: { increment: 1 },
    } });
    const released = await transaction.workBotMemberBinding.updateMany({ where: { id: binding.id, activeWorkRecordId: record.id, version: binding.version }, data: { activeWorkRecordId: null, version: { increment: 1 } } });
    if (released.count !== 1) throw new ConflictException({ code: "WORK_BOT_CONCURRENT_FINISH", messageZh: "另一条下工指令正在处理，请稍后重试" });
    await this.reopenCashSettlements(transaction, store.id, businessDate, actorId, record.employeeMembershipId, requestId);
    await transaction.auditLog.create({ data: {
      storeId: store.id, actorUserId: null, actorMembershipId: record.employeeMembershipId, source: "langbot",
      action: "work_bot.work_finished", entityType: "work_record", entityId: record.id, businessDate: record.businessDate,
      beforeJson: { status: record.status, endAt: record.endAt?.toISOString() ?? null, amountCents: record.serviceSnapshot.amountCents.toString(), version: record.version },
      afterJson: { status: "CONFIRMED", endAt: endAt.toISOString(), actualDurationMinutes, amountCents: serviceAmount.toString(), tipCents: tipAmount.toString(), paymentMethod: intent.paymentMethod, version: record.version + 1 }, requestId,
    } });
    return this.persistReply(transaction, input, intent, {
      outcome: "WORK_FINISHED", reply: `✅ ${record.employee.displayName} 已下工：${record.serviceSnapshot.shortName}；大费 ${this.formatMoney(serviceAmount)}，小费 ${this.formatMoney(tipAmount)}，${cash ? "现金" : "信用卡"}；结束 ${this.formatTime(endAt, store.timezone)}。`,
      recordId: record.id, businessDate,
    }, group);
  }

  private async requireBoundMember(transaction: Prisma.TransactionClient, input: WorkBotEventInput, intent: WorkBotParsedIntent): Promise<{ group: Awaited<ReturnType<WorkBotService["findGroupBinding"]>> & {}; binding: NonNullable<Awaited<ReturnType<typeof transaction.workBotMemberBinding.findUnique>>> } | { reply: WorkBotReply }> {
    const group = await this.findGroupBinding(transaction, input);
    if (!group) return { reply: await this.persistReply(transaction, input, intent, { outcome: "GROUP_NOT_BOUND", reply: "请先发送“绑定店铺 6位店铺代码”。" }) };
    const binding = await transaction.workBotMemberBinding.findUnique({ where: { groupBindingId_senderId: { groupBindingId: group.id, senderId: input.senderId } } });
    if (!binding) return { reply: await this.persistReply(transaction, input, intent, { outcome: "MEMBER_NOT_BOUND", reply: "请先发送“绑定 你的员工姓名”。" }, group) };
    return { group, binding };
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

  private findGroupBinding(transaction: Prisma.TransactionClient, input: WorkBotEventInput) {
    return transaction.workBotGroupBinding.findUnique({ where: { platform_botId_groupId: {
      platform: input.platform, botId: input.botId, groupId: input.groupId,
    } }, include: { store: true } });
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
    return `$${(Number(value) / 100).toFixed(2)}`;
  }

  private formatTime(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  }

  private aliasNotFound(): never { throw new NotFoundException({ code: "WORK_BOT_ALIAS_NOT_FOUND", messageZh: "没有找到这个记工黑话" }); }
  private bindingNotFound(): never { throw new NotFoundException({ code: "WORK_BOT_BINDING_NOT_FOUND", messageZh: "没有找到这个机器人绑定" }); }
  private invalidAlias(): never { throw new BadRequestException({ code: "WORK_BOT_ALIAS_INVALID", messageZh: "记工黑话不能为空" }); }
  private versionConflict(): never { throw new ConflictException({ code: "WORK_BOT_VERSION_CONFLICT", messageZh: "机器人设置已被修改，请刷新后重试" }); }
}
