import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type { AiMessageInput, AiWorkToolArguments, FinanceQuery } from "@massage-note/contracts";
import { aiWorkToolArgumentsSchema } from "@massage-note/contracts";
import { businessDateFor } from "@massage-note/domain";
import { randomUUID } from "node:crypto";
import { toJsonSafe } from "../common/json-safe.interceptor.js";
import { PrismaService } from "../database/prisma.service.js";
import { CashSettlementsService } from "../finance/cash-settlements.service.js";
import { FinanceQueriesService } from "../finance/finance-queries.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { WorkRecordsService } from "../work-records/work-records.service.js";
import { MiniMaxLanguageModelProvider } from "./language-model.provider.js";
import { formatWholeUsd, normalizeWholeUsdText } from "./money-display.js";
import { MiniMaxSpeechToTextProvider } from "./speech-to-text.provider.js";

const money = formatWholeUsd;

const namedAmountToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "预设项目名称或简称；自定义项目填写清楚名称" },
    amountCents: { type: "integer", minimum: 0, description: "仅自定义项目需要，单位为美分" },
  },
  required: ["name"],
};

const workChangeToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: { enum: ["CREATE", "UPDATE", "DELETE"] },
    employeeName: { type: "string", description: "新增时必填；修改时仅在更换员工时填写" },
    serviceName: { type: "string", description: "新增时必填；修改时仅在更换主要项目时填写" },
    serviceDurationMinutes: { type: "integer", minimum: 1, maximum: 720, description: "新增或更换主要项目时必填的服务时长（分钟）" },
    recordId: { type: "string", description: "修改或删除时必须使用上下文中现有记录 ID" },
    startAt: { type: "string", description: "带时区偏移的 ISO 时间" },
    endAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    addons: { type: "array", maxItems: 30, items: namedAmountToolSchema, description: "修改时表示变更后的完整额外项目列表" },
    discounts: { type: "array", maxItems: 30, items: namedAmountToolSchema, description: "修改时表示变更后的完整折扣列表" },
    mainServiceAmountCents: { type: "integer", minimum: 0 },
    cashServiceCents: { type: "integer", minimum: 0 },
    cardServiceCents: { type: "integer", minimum: 0 },
    cashTipCents: { type: "integer", minimum: 0 },
    cardTipCents: { type: "integer", minimum: 0 },
    note: { type: "string" },
    reason: { type: "string" },
  },
  required: ["operation"],
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly finance: FinanceQueriesService,
    private readonly cash: CashSettlementsService,
    private readonly workRecords: WorkRecordsService,
    private readonly model: MiniMaxLanguageModelProvider,
    private readonly speech: MiniMaxSpeechToTextProvider,
  ) {}

  async transcribe(actor: User, storeId: string, audio: Buffer, locale: "zh-CN" | "en-US" = "zh-CN") {
    await this.access.requireActiveMembership(actor.id, storeId);
    if (audio.length > 8 * 1024 * 1024) throw new BadRequestException({ code: "AUDIO_TOO_LARGE", messageZh: "录音不能超过 8 MB 或 60 秒" });
    const result = await this.speech.transcribe(audio, locale);
    if (result.durationSeconds !== undefined && result.durationSeconds > 60.5) {
      throw new BadRequestException({ code: "AUDIO_TOO_LARGE", messageZh: "录音不能超过 8 MB 或 60 秒" });
    }
    return result;
  }

  async financeMessage(actor: User, storeId: string, input: AiMessageInput) {
    const started = Date.now();
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    const conversation = await this.conversation(actor, storeId, "FINANCE", input.conversationId);
    const members = await this.prisma.storeMembership.findMany({
      where: { storeId, status: "ACTIVE", deletedAt: null, ...(membership.role === "EMPLOYEE" ? { id: membership.id } : {}) },
      select: { id: true, displayName: true },
    });
    const locale = input.locale ?? "zh-CN";
    const lowerText = input.text.toLocaleLowerCase();
    const mentioned = members.filter((item) => lowerText.includes(item.displayName.toLocaleLowerCase()));
    const membershipIds = membership.role === "EMPLOYEE" ? [membership.id] : mentioned.map((item) => item.id);
    const mentionsCash = input.text.includes("现金") || /\bcash\b/i.test(input.text);
    const mentionsCard = input.text.includes("刷卡") || /\b(?:card|credit|debit)\b/i.test(input.text);
    const mentionsGiftCard = /礼物卡|礼卡/u.test(input.text) || /\bgift cards?\b/i.test(input.text);
    const mentionsNonCash = mentionsCard || mentionsGiftCard;
    const mentionsTips = input.text.includes("小费") || /\btips?\b/i.test(input.text);
    const mentionsServiceFees = input.text.includes("大费") || /\b(?:service fees?|service charges?)\b/i.test(input.text);
    const paymentMethod: FinanceQuery["paymentMethod"] = mentionsCash && !mentionsNonCash ? "CASH" : mentionsNonCash && !mentionsCash ? "NON_CASH" : "ALL";
    const amountType: FinanceQuery["amountType"] = mentionsTips && !mentionsServiceFees ? "TIP" : mentionsServiceFees && !mentionsTips ? "SERVICE" : "ALL";
    const dates = await this.financeDates(storeId, input.text);
    const query: FinanceQuery = {
      ...dates,
      membershipIds,
      paymentMethod,
      amountType,
      highlightFilter: "ALL",
    };
    try {
      const summary = await this.finance.summary(actor, storeId, query);
      let cashContext: unknown = null;
      if (mentionsCash && (/(结清|应交|保留)/u.test(input.text) || /\b(?:settled?|submit|keep|retain)\b/i.test(input.text))) {
        cashContext = await this.cash.list(actor, storeId, dates.dateTo!);
      }
      const safeContext = toJsonSafe({ summary, cash: cashContext });
      let answer: string;
      let provider = "deterministic";
      let model = "finance-engine";
      if (this.model.isConfigured()) {
        const result = await this.model.complete({
          system: locale === "en-US"
            ? "You are a massage-store finance explanation assistant. Use only the supplied deterministic statistics. Do not calculate independently, guess, request, or expose data from other stores. Answer in English and state the date range, employee scope, and payment scope. Use U.S. dollars and display every amount as a whole dollar without a decimal point."
            : "你是按摩店财务解释助手。只能依据提供的确定性统计上下文回答，不自行计算、不猜测、不得要求或暴露其他店铺数据。回答必须用中文，注明日期范围、员工范围和付款口径。金额使用美元，并统一显示为不带小数点的整美元。",
          user: `用户问题：${input.text}\n\n后端确定性统计上下文：${JSON.stringify(safeContext)}`,
        });
        answer = normalizeWholeUsdText(result.content);
        provider = result.provider;
        model = result.model;
      } else {
        answer = this.deterministicFinanceAnswer(
          summary,
          membership.role === "EMPLOYEE" ? [membership.displayName] : mentioned.map((item) => item.displayName),
          paymentMethod,
          amountType,
          locale,
        );
        if (cashContext && typeof cashContext === "object" && "rows" in cashContext) {
          const rows = (cashContext as { rows: Array<{ displayName: string; status: string; cashToSubmitToStoreCents: bigint; cashRetainedCents: bigint }> }).rows;
          const unsettled = rows.filter((row) => row.status === "UNSETTLED");
          answer += locale === "en-US"
            ? unsettled.length === 0
              ? " All cash settlements in this range are fully settled."
              : ` Unsettled cash: ${unsettled.map((row) => `${row.displayName} (submit ${money(row.cashToSubmitToStoreCents)} to the store; keep ${money(row.cashRetainedCents)})`).join("; ")}.`
            : unsettled.length === 0
              ? " 当前范围内的现金结算已经全部结清。"
              : ` 尚未结清现金：${unsettled.map((row) => `${row.displayName}（应提交店铺 ${money(row.cashToSubmitToStoreCents)}，应保留 ${money(row.cashRetainedCents)}）`).join("；")}。`;
        }
      }
      await this.logQuery(conversation.id, storeId, actor.id, provider, model, input.text, { query }, safeContext, "SUCCESS", Date.now() - started);
      return { conversationId: conversation.id, answer, context: { filters: summary.filters, totals: summary.totals }, providerConfigured: this.model.isConfigured() };
    } catch (error) {
      await this.logQuery(conversation.id, storeId, actor.id, this.model.provider, process.env.MINIMAX_MODEL || "MiniMax-M3", input.text, { query }, null, "ERROR", Date.now() - started);
      throw error;
    }
  }

  async workMessage(actor: User, storeId: string, input: AiMessageInput) {
    const started = Date.now();
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    const conversation = await this.conversation(actor, storeId, "WORK_RECORD", input.conversationId);
    const context = await this.workContext(storeId);
    let parsed: AiWorkToolArguments | null = null;
    let content = "";
    let provider = "deterministic";
    let modelName = "safe-parser";
    const locale = input.locale ?? "zh-CN";
    if (this.model.isConfigured()) {
      const result = await this.model.complete({
        system: locale === "en-US"
          ? `You are a massage-store work-record assistant. Select only from the supplied employees, main services and duration/price options, add-ons, discounts, and today's records; never invent IDs. Creating or changing a main service requires both serviceName and serviceDurationMinutes. Ask a clarifying question without calling a tool if information is incomplete or ambiguous. Convert every amount to integer cents. When addons or discounts are present in an edit, they must be the complete updated list and must retain existing items the user did not ask to remove. Deletion requires an explicit reason. The current user is “${membership.displayName}”. Respond in English.`
          : `你是中文按摩店记工助手。只能从给定员工、主要项目及其时长价格、额外项目、折扣和今日记录中选择，不得编造 ID。新增或更换主要项目时必须同时提供 serviceName 和 serviceDurationMinutes；信息不完整或有歧义时直接追问，不调用工具。所有金额参数必须换算为整数美分。修改记录时 addons 和 discounts 若出现，必须表示修改后的完整列表；结合记录上下文保留用户没有要求删除的原有项目。删除必须有明确原因。当前调用者是“${membership.displayName}”。`,
        user: `用户输入：${input.text}\n可选员工、项目和今日记录：${JSON.stringify(toJsonSafe(context))}`,
        tools: [{ type: "function", function: { name: "prepare_work_change", description: "只生成记工变更预览，不直接写入", parameters: workChangeToolParameters } }],
      });
      provider = result.provider;
      modelName = result.model;
      content = result.content;
      if (result.toolCall?.name === "prepare_work_change") {
        const validation = aiWorkToolArgumentsSchema.safeParse(result.toolCall.arguments);
        if (validation.success) parsed = validation.data;
        else content = locale === "en-US"
          ? "I could not uniquely identify the employee, service, or record. Add the employee display name, service short name, time, and amounts, then try again."
          : "我还不能唯一确定要操作的员工、项目或记工记录。请补充员工显示名、项目简称、时间和金额后再试。";
      }
      if (!parsed && !content) content = locale === "en-US"
        ? "I need more specific information. Include the employee display name, service short name, time, and amounts. For an edit or deletion, identify the record and give the reason."
        : "我还需要更明确的信息。请说出员工显示名、项目简称、时间和金额；如需修改或删除，也请说明具体记录和原因。";
    } else {
      parsed = this.fallbackCreate(input.text, context, membership.displayName);
      if (!parsed) content = locale === "en-US"
        ? "The AI model is not configured. I can still recognize simple new records. Include the employee display name, service short name, and cash/card service fees and tips—for example, “Add a 60 min record for Amy, cash service fee 100, card tip 20.” Configure MiniMax for edits and deletions, or use record details."
        : "AI 模型尚未配置。我仍可识别简单新增记工：请明确说出员工显示名、项目简称，以及现金/刷卡大费和小费，例如“给 Amy 记 60分，现金大费100，刷卡小费20”。修改或删除请先配置 MiniMax，或使用记工详情页。";
    }
    const preview = parsed ? await this.preparePreview(actor, storeId, parsed, context) : null;
    await this.logQuery(conversation.id, storeId, actor.id, provider, modelName, input.text, parsed ? { parsed } : null, preview ? { previewId: preview.previewId, operation: preview.operation } : { clarification: content }, preview ? "PREVIEW" : "CLARIFICATION", Date.now() - started);
    return { conversationId: conversation.id, answer: preview ? locale === "en-US" ? "I prepared a structured preview. Check the employee, service, time, and amounts; it will only be saved after you confirm." : "我已整理成结构化预览。请核对员工、项目、时间和金额，确认后才会写入。" : content, preview, providerConfigured: this.model.isConfigured() };
  }

  async getPreview(actor: User, storeId: string, previewId: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const preview = await this.findPreview(actor.id, storeId, previewId);
    return this.previewResponse(preview);
  }

  async cancelPreview(actor: User, storeId: string, previewId: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const changed = await this.prisma.aiChangePreview.updateMany({ where: { id: previewId, storeId, userId: actor.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (changed.count !== 1) throw new ConflictException({ code: "AI_PREVIEW_NOT_PENDING", messageZh: "该预览已执行、已放弃或已过期" });
    return { previewId, status: "CANCELLED" };
  }

  async confirmPreview(actor: User, storeId: string, previewId: string, requestId: string) {
    const actorMembership = await this.access.requireActiveMembership(actor.id, storeId);
    const preview = await this.findPreview(actor.id, storeId, previewId);
    if (preview.expiresAt <= new Date()) {
      await this.prisma.aiChangePreview.updateMany({ where: { id: preview.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      throw new ConflictException({ code: "AI_PREVIEW_EXPIRED", messageZh: "预览已过期，请重新生成" });
    }
    if (preview.consumedAt) throw new ConflictException({ code: "AI_PREVIEW_ALREADY_CONSUMED", messageZh: "该预览已经执行，不能重复提交" });
    const claimed = await this.prisma.aiChangePreview.updateMany({
      where: { id: preview.id, storeId, userId: actor.id, status: "PENDING", consumedAt: null },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (claimed.count !== 1) {
      const latest = await this.findPreview(actor.id, storeId, previewId);
      if (latest.consumedAt) throw new ConflictException({ code: "AI_PREVIEW_ALREADY_CONSUMED", messageZh: "该预览已经执行，不能重复提交" });
      if (latest.status === "CONFIRMED") throw new ConflictException({ code: "AI_PREVIEW_EXECUTING", messageZh: "该预览正在执行，请勿重复提交" });
      throw new ConflictException({ code: "AI_PREVIEW_NOT_CONFIRMABLE", messageZh: "该预览不能执行" });
    }

    try {
      const payload = preview.canonicalPayloadJson as Record<string, unknown>;
      let result: unknown;
      if (preview.operation === "CREATE_WORK_RECORD") {
        let record = await this.workRecords.create(actor, storeId, payload.create as never, `ai-${preview.id}-create`, requestId);
        if (payload.updateAfterCreate) record = await this.workRecords.update(actor, storeId, record.id, { version: record.version, ...(payload.updateAfterCreate as object) } as never, `ai-${preview.id}-update`, requestId);
        if (payload.payment) record = await this.workRecords.confirmPayment(actor, storeId, record.id, { version: record.version, ...(payload.payment as object) } as never, `ai-${preview.id}-payment`, requestId);
        result = record;
      } else if (preview.operation === "UPDATE_WORK_RECORD") {
        const recordId = String(payload.recordId);
        const baseVersion = Number((preview.baseVersionsJson as Record<string, unknown>).workRecord);
        let record: Awaited<ReturnType<WorkRecordsService["update"]>> = await this.workRecords.get(actor, storeId, recordId);
        if (payload.update) record = await this.workRecords.update(actor, storeId, recordId, payload.update as never, `ai-${preview.id}-update`, requestId);
        if (payload.payment) record = await this.workRecords.confirmPayment(actor, storeId, recordId, { version: payload.update ? record.version : baseVersion, ...(payload.payment as object) } as never, `ai-${preview.id}-payment`, requestId);
        result = record;
      } else if (preview.operation === "DELETE_WORK_RECORD") {
        result = await this.workRecords.remove(actor, storeId, String(payload.recordId), payload.delete as never, `ai-${preview.id}-delete`, requestId);
      } else {
        throw new BadRequestException({ code: "AI_OPERATION_UNSUPPORTED", messageZh: "该 AI 操作暂不支持" });
      }
      await this.prisma.$transaction(async (transaction) => {
        const consumed = await transaction.aiChangePreview.updateMany({ where: { id: preview.id, status: "CONFIRMED", consumedAt: null }, data: { consumedAt: new Date() } });
        if (consumed.count !== 1) throw new ConflictException({ code: "AI_PREVIEW_ALREADY_CONSUMED", messageZh: "该预览已经执行，不能重复提交" });
        await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: actorMembership.id, source: "ai", action: "ai.preview_consumed", entityType: "ai_change_preview", entityId: preview.id, afterJson: { operation: preview.operation }, requestId } });
      });
      return { previewId, status: "CONSUMED", result };
    } catch (error) {
      // 业务写入自身带有固定幂等键；执行失败后释放预览，安全重试会读取既有结果而不会重复入账。
      await this.prisma.aiChangePreview.updateMany({
        where: { id: preview.id, status: "CONFIRMED", consumedAt: null },
        data: { status: "PENDING", confirmedAt: null },
      });
      throw error;
    }
  }

  private async preparePreview(actor: User, storeId: string, args: AiWorkToolArguments, context: Awaited<ReturnType<AiService["workContext"]>>) {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    if (args.operation === "CREATE") {
      const employee = this.uniqueMatch(context.members, args.employeeName, "员工");
      const service = this.uniqueMatch(context.services, args.serviceName, "项目", ["shortName", "fullName"]);
      const option = this.serviceOption(service, args.serviceDurationMinutes);
      const payment = this.paymentFrom(args);
      const addons = this.addonInputs(args.addons, context);
      const discounts = this.discountInputs(args.discounts, context);
      const create = { employeeMembershipId: employee.id, startAt: args.startAt ?? new Date().toISOString(), serviceItemId: service.id, serviceDurationMinutes: option.durationMinutes };
      const updateAfterCreate = {
        ...(args.endAt !== undefined ? { endAt: args.endAt } : {}),
        ...(args.note !== undefined ? { note: args.note } : {}),
        ...(args.mainServiceAmountCents !== undefined ? { mainServiceAmountCents: args.mainServiceAmountCents } : {}),
        ...(addons !== undefined ? { addons } : {}),
        ...(discounts !== undefined ? { discounts } : {}),
      };
      const hasUpdate = Object.keys(updateAfterCreate).length > 0;
      const warnings = payment ? [] : ["未提供付款金额，保存后会显示为待结账"];
      const stored = await this.prisma.aiChangePreview.create({ data: { storeId, userId: actor.id, operation: "CREATE_WORK_RECORD", canonicalPayloadJson: this.json({ create, ...(hasUpdate ? { updateAfterCreate } : {}), ...(payment ? { payment } : {}) }), baseVersionsJson: {}, warningsJson: warnings, expiresAt } });
      return { previewId: stored.id, operation: stored.operation, expiresAt: stored.expiresAt, target: { employeeDisplayName: employee.displayName, businessDate: context.businessDate }, before: null, after: { employee: employee.displayName, service: service.fullName, durationMinutes: option.durationMinutes, amountCents: args.mainServiceAmountCents ?? option.priceCents, ...create, ...updateAfterCreate, payment }, warnings: stored.warningsJson };
    }
    const record = context.records.find((item) => item.id === args.recordId);
    if (!record) throw new BadRequestException({ code: "AI_RECORD_NOT_UNIQUE", messageZh: "没有在今日可见记录中找到这条记工，请重新描述员工、时间和项目" });
    if (args.operation === "DELETE") {
      const stored = await this.prisma.aiChangePreview.create({ data: { storeId, userId: actor.id, operation: "DELETE_WORK_RECORD", canonicalPayloadJson: this.json({ recordId: record.id, delete: { version: record.version, reason: args.reason } }), baseVersionsJson: { workRecord: record.version }, warningsJson: ["删除后记录进入回收站，必须再次确认"], expiresAt } });
      return { previewId: stored.id, operation: stored.operation, expiresAt: stored.expiresAt, target: record, before: record, after: { deleted: true, reason: args.reason }, warnings: stored.warningsJson };
    }
    const payment = this.paymentFrom(args);
    const employee = args.employeeName ? this.uniqueMatch(context.members, args.employeeName, "员工") : null;
    const service = args.serviceName ? this.uniqueMatch(context.services, args.serviceName, "项目", ["shortName", "fullName"]) : null;
    const serviceOption = service ? this.serviceOption(service, args.serviceDurationMinutes) : null;
    const addons = this.addonInputs(args.addons, context);
    const discounts = this.discountInputs(args.discounts, context);
    const update = {
      version: record.version,
      ...(employee ? { employeeMembershipId: employee.id } : {}),
      ...(service && serviceOption ? { serviceItemId: service.id, serviceDurationMinutes: serviceOption.durationMinutes } : {}),
      ...(args.startAt !== undefined ? { startAt: args.startAt } : {}),
      ...(args.endAt !== undefined ? { endAt: args.endAt } : {}),
      ...(args.mainServiceAmountCents !== undefined ? { mainServiceAmountCents: args.mainServiceAmountCents } : {}),
      ...(addons !== undefined ? { addons } : {}),
      ...(discounts !== undefined ? { discounts } : {}),
      ...(args.note !== undefined ? { note: args.note } : {}),
    };
    const hasUpdate = Object.keys(update).length > 1;
    if (!hasUpdate && !payment) throw new BadRequestException({ code: "AI_UPDATE_EMPTY", messageZh: "没有识别到需要修改的字段" });
    const stored = await this.prisma.aiChangePreview.create({ data: { storeId, userId: actor.id, operation: "UPDATE_WORK_RECORD", canonicalPayloadJson: this.json({ recordId: record.id, ...(hasUpdate ? { update } : {}), ...(payment ? { payment } : {}) }), baseVersionsJson: { workRecord: record.version }, warningsJson: [], expiresAt } });
    return { previewId: stored.id, operation: stored.operation, expiresAt: stored.expiresAt, target: record, before: record, after: { ...(hasUpdate ? update : {}), ...(employee ? { employee: employee.displayName } : {}), ...(service && serviceOption ? { service: service.fullName, durationMinutes: serviceOption.durationMinutes, amountCents: args.mainServiceAmountCents ?? serviceOption.priceCents } : args.mainServiceAmountCents !== undefined ? { amountCents: args.mainServiceAmountCents } : {}), payment }, warnings: [] };
  }

  private async workContext(storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null }, select: { timezone: true, businessCutoffLocal: true } });
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在" });
    const businessDate = businessDateFor({ startAt: new Date(), timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
    const [members, services, addons, discounts, records] = await Promise.all([
      this.prisma.storeMembership.findMany({ where: { storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true }, select: { id: true, displayName: true } }),
      this.prisma.serviceItem.findMany({ where: { storeId, isEnabled: true, deletedAt: null }, select: { id: true, fullName: true, shortName: true, priceOptions: { select: { durationMinutes: true, priceCents: true }, orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } } }),
      this.prisma.addonItem.findMany({ where: { storeId, isEnabled: true, deletedAt: null }, select: { id: true, name: true, shortName: true, amountCents: true, durationMinutes: true } }),
      this.prisma.discountItem.findMany({ where: { storeId, isEnabled: true, deletedAt: null }, select: { id: true, name: true, shortName: true, amountCents: true } }),
      this.prisma.workRecord.findMany({ where: { storeId, businessDate: new Date(`${businessDate}T00:00:00.000Z`), deletedAt: null }, select: { id: true, employeeMembershipId: true, startAt: true, endAt: true, status: true, mainServiceAmountCents: true, grossFeeBaseCents: true, cashServiceCents: true, cardServiceCents: true, cashTipCents: true, cardTipCents: true, note: true, version: true, employee: { select: { displayName: true } }, serviceSnapshot: { select: { shortName: true, name: true } }, addonSnapshots: { select: { name: true, shortName: true, amountCents: true } }, discountSnapshots: { select: { name: true, amountCents: true } } }, orderBy: { startAt: "desc" } }),
    ]);
    return { businessDate, timezone: store.timezone, businessCutoffLocal: store.businessCutoffLocal, members, services, addons, discounts, records };
  }

  private fallbackCreate(text: string, context: Awaited<ReturnType<AiService["workContext"]>>, ownName: string): AiWorkToolArguments | null {
    if ((!text.includes("记") && !/\b(?:add|record|log)\b/i.test(text)) || /(删除|修改)/u.test(text) || /\b(?:delete|remove|edit|change|update)\b/i.test(text)) return null;
    const employee = context.members.find((item) => text.includes(item.displayName)) ?? context.members.find((item) => item.displayName === ownName);
    const service = context.services.find((item) => text.includes(item.shortName) || text.includes(item.fullName));
    if (!employee || !service) return null;
    const durationMatch = text.match(/(\d+)\s*(?:分钟|分|mins?)/i);
    const durationMinutes = durationMatch?.[1]
      ? Number(durationMatch[1])
      : service.priceOptions.length === 1
        ? service.priceOptions[0]!.durationMinutes
        : null;
    if (!durationMinutes || !service.priceOptions.some((option) => option.durationMinutes === durationMinutes)) return null;
    const amount = (...labels: string[]) => {
      const match = labels.map((label) => text.match(new RegExp(`${label}\\s*[：:]?\\s*\\$?(\\d+(?:\\.\\d{1,2})?)`, "i"))).find(Boolean);
      return match?.[1] ? Math.round(Number(match[1]) * 100) : undefined;
    };
    const addons = context.addons.filter((item) => text.includes(item.name) || text.includes(item.shortName)).map((item) => ({ name: item.shortName }));
    const discounts = context.discounts.filter((item) => text.includes(item.name) || text.includes(item.shortName)).map((item) => ({ name: item.shortName }));
    const cashServiceCents = amount("现金大费", "cash\\s+(?:service\\s+)?fee");
    const cardServiceCents = amount("刷卡大费", "(?:card|credit|debit)\\s+(?:service\\s+)?fee");
    const cashTipCents = amount("现金小费", "cash\\s+tip");
    const cardTipCents = amount("刷卡小费", "(?:card|credit|debit)\\s+tip");
    return { operation: "CREATE", employeeName: employee.displayName, serviceName: service.shortName, serviceDurationMinutes: durationMinutes, ...(addons.length ? { addons } : {}), ...(discounts.length ? { discounts } : {}), ...(cashServiceCents !== undefined ? { cashServiceCents } : {}), ...(cardServiceCents !== undefined ? { cardServiceCents } : {}), ...(cashTipCents !== undefined ? { cashTipCents } : {}), ...(cardTipCents !== undefined ? { cardTipCents } : {}) };
  }

  private addonInputs(items: Array<{ name: string; amountCents?: number | undefined }> | undefined, context: Awaited<ReturnType<AiService["workContext"]>>) {
    if (items === undefined) return undefined;
    return items.map((item) => {
      const preset = this.optionalCatalogMatch(context.addons, item.name, "额外项目");
      if (preset) return { sourceItemId: preset.id, isCustom: false, name: preset.name, shortName: preset.shortName, amountCents: Number(preset.amountCents), durationMinutes: preset.durationMinutes };
      if (item.amountCents === undefined) throw new BadRequestException({ code: "AI_CUSTOM_ADDON_AMOUNT_REQUIRED", messageZh: `“${item.name}”不是预设额外项目；如需自定义，请明确金额` });
      return { isCustom: true, name: item.name, shortName: item.name.slice(0, 30), amountCents: item.amountCents, durationMinutes: null };
    });
  }

  private discountInputs(items: Array<{ name: string; amountCents?: number | undefined }> | undefined, context: Awaited<ReturnType<AiService["workContext"]>>) {
    if (items === undefined) return undefined;
    return items.map((item) => {
      const preset = this.optionalCatalogMatch(context.discounts, item.name, "折扣");
      if (preset) return { sourceItemId: preset.id, isCustom: false, name: preset.name, amountCents: Number(preset.amountCents) };
      if (item.amountCents === undefined) throw new BadRequestException({ code: "AI_CUSTOM_DISCOUNT_AMOUNT_REQUIRED", messageZh: `“${item.name}”不是预设折扣；如需自定义，请明确金额` });
      return { isCustom: true, name: item.name, amountCents: item.amountCents };
    });
  }

  private optionalCatalogMatch<T extends { id: string }>(items: T[], input: string, label: string): T | null {
    const needle = input.trim().toLocaleLowerCase();
    const matches = items.filter((item) => ["name", "shortName"].some((field) => String((item as Record<string, unknown>)[field] ?? "").toLocaleLowerCase() === needle));
    if (matches.length > 1) throw new BadRequestException({ code: "AI_SELECTION_AMBIGUOUS", messageZh: `“${input}”对应多个${label}，请说得更明确` });
    return matches[0] ?? null;
  }

  private serviceOption(
    service: { fullName: string; priceOptions: Array<{ durationMinutes: number; priceCents: bigint }> },
    durationMinutes: number | undefined,
  ) {
    const option = durationMinutes === undefined
      ? service.priceOptions.length === 1
        ? service.priceOptions[0]
        : undefined
      : service.priceOptions.find((candidate) => candidate.durationMinutes === durationMinutes);
    if (!option) {
      throw new BadRequestException({
        code: "AI_SERVICE_DURATION_AMBIGUOUS",
        messageZh: durationMinutes === undefined
          ? `“${service.fullName}”有多个时长，请明确选择分钟数`
          : `“${service.fullName}”没有 ${durationMinutes} 分钟的价格`,
      });
    }
    return option;
  }

  private paymentFrom(args: { cashServiceCents?: number | undefined; cardServiceCents?: number | undefined; cashTipCents?: number | undefined; cardTipCents?: number | undefined }) {
    const values = [args.cashServiceCents, args.cardServiceCents, args.cashTipCents, args.cardTipCents];
    if (values.every((value) => value === undefined)) return null;
    return { cashServiceCents: args.cashServiceCents ?? 0, cardServiceCents: args.cardServiceCents ?? 0, cashTipCents: args.cashTipCents ?? 0, cardTipCents: args.cardTipCents ?? 0 };
  }

  private uniqueMatch<T extends { id: string }>(items: T[], input: string, label: string, fields: string[] = ["displayName"]) {
    const needle = input.trim().toLocaleLowerCase();
    const matches = items.filter((item) => fields.some((field) => String((item as Record<string, unknown>)[field] ?? "").toLocaleLowerCase() === needle));
    if (matches.length !== 1) throw new BadRequestException({ code: "AI_SELECTION_AMBIGUOUS", messageZh: matches.length === 0 ? `没有找到“${input}”对应的${label}` : `“${input}”对应多个${label}，请说得更明确` });
    return matches[0]!;
  }

  private async financeDates(storeId: string, text: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true, businessCutoffLocal: true } });
    const today = businessDateFor({ startAt: new Date(), timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
    const from = new Date(`${today}T00:00:00.000Z`);
    if (text.includes("今天") || text.includes("今日") || /\btoday\b/i.test(text)) return { dateFrom: today, dateTo: today };
    if (text.includes("本月") || /\bthis month\b/i.test(text)) return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today };
    const days = Number(text.match(/(?:最近|近)\s*(\d+)\s*天/u)?.[1] ?? text.match(/(?:last|recent)\s*(\d+)\s*days?/i)?.[1] ?? 7);
    from.setUTCDate(from.getUTCDate() - Math.max(1, Math.min(days, 366)) + 1);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: today };
  }

  private deterministicFinanceAnswer(summary: Awaited<ReturnType<FinanceQueriesService["summary"]>>, names: string[], method: string, amountType: string, locale: "zh-CN" | "en-US" = "zh-CN") {
    if (locale === "en-US") {
      const scope = names.length ? names.join(", ") : "all employees within your permissions";
      const methodText = method === "CASH" ? "cash" : method === "NON_CASH" ? "card + gift card" : "all payment methods";
      const typeText = amountType === "TIP" ? "tips only" : amountType === "SERVICE" ? "service fees only" : "service fees and tips";
      return `Range: ${summary.filters.dateFrom} to ${summary.filters.dateTo}; ${scope}; ${methodText}; ${typeText}. ${summary.totals.itemCount} total items (${summary.totals.recordCount} work records and ${summary.totals.giftCardSaleCount} gift card sales); customer payments ${money(summary.totals.customerTotalPaidCents)}, performance after discounts ${money(summary.totals.discountedFeePerformanceCents)}, service fees collected ${money(summary.totals.actualServiceCollectedCents)}, tips ${money(summary.totals.totalTipCents)}, gift card sale income ${money(summary.totals.giftCardSalesAmountCents)}, gift card redemption expense ${money(summary.totals.giftCardRedemptionCents)}, store income ${money(summary.totals.storeIncomeCents)}, employee earnings ${money(summary.totals.employeeIncomeCents)}, payroll still owed ${money(summary.totals.employerOwesCents)}. Gift card sales count as store income and gift card redemptions count as store expense. Every amount comes from the deterministic server-side finance engine.`;
    }
    const scope = names.length ? names.join("、") : "当前权限范围内的全部员工";
    const methodText = method === "CASH" ? "现金" : method === "NON_CASH" ? "刷卡＋礼物卡" : "全部付款方式";
    const typeText = amountType === "TIP" ? "仅小费" : amountType === "SERVICE" ? "仅大费" : "大费与小费";
    return `统计范围：${summary.filters.dateFrom} 至 ${summary.filters.dateTo}，${scope}，${methodText}，${typeText}。共 ${summary.totals.itemCount} 项（${summary.totals.recordCount} 条记工、${summary.totals.giftCardSaleCount} 张礼物卡销售）；客人总付款 ${money(summary.totals.customerTotalPaidCents)}，折后大费业绩 ${money(summary.totals.discountedFeePerformanceCents)}，实际收到大费 ${money(summary.totals.actualServiceCollectedCents)}，小费 ${money(summary.totals.totalTipCents)}，礼物卡销售收入 ${money(summary.totals.giftCardSalesAmountCents)}，礼物卡核销支出 ${money(summary.totals.giftCardRedemptionCents)}，店铺收入 ${money(summary.totals.storeIncomeCents)}，员工总收入 ${money(summary.totals.employeeIncomeCents)}，老板尚欠 ${money(summary.totals.employerOwesCents)}。卖卡算店铺收入，用卡核销算店铺支出；这些金额均来自后端确定性财务引擎。`;
  }

  private async conversation(actor: User, storeId: string, type: "WORK_RECORD" | "FINANCE", conversationId?: string) {
    if (conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, storeId, userId: actor.id, assistantType: type } });
      if (!existing) throw new NotFoundException({ code: "AI_CONVERSATION_NOT_FOUND", messageZh: "没有找到这段 AI 对话" });
      return this.prisma.aiConversation.update({ where: { id: existing.id }, data: { lastMessageAt: new Date() } });
    }
    return this.prisma.aiConversation.create({ data: { storeId, userId: actor.id, assistantType: type } });
  }

  private async findPreview(userId: string, storeId: string, previewId: string) {
    const preview = await this.prisma.aiChangePreview.findFirst({ where: { id: previewId, storeId, userId } });
    if (!preview) throw new NotFoundException({ code: "AI_PREVIEW_NOT_FOUND", messageZh: "没有找到该 AI 预览" });
    return preview;
  }

  private previewResponse(preview: Awaited<ReturnType<AiService["findPreview"]>>) {
    return { previewId: preview.id, operation: preview.operation, status: preview.status, expiresAt: preview.expiresAt, payload: preview.canonicalPayloadJson, baseVersions: preview.baseVersionsJson, warnings: preview.warningsJson, consumedAt: preview.consumedAt };
  }

  private json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

  private async logQuery(conversationId: string, storeId: string, userId: string, provider: string, modelName: string, inputText: string, toolCalls: unknown, results: unknown, outcome: string, latencyMs: number) {
    await this.prisma.aiQueryLog.create({ data: { id: randomUUID(), conversationId, storeId, userId, modelProvider: provider, modelName, inputText, toolCallsJson: toolCalls === null ? Prisma.JsonNull : this.json(toolCalls), toolResultsRedactedJson: results === null ? Prisma.JsonNull : this.json(results), outcome, latencyMs } });
  }
}
