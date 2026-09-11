import type { WorkBotParsedIntent } from "@massage-note/contracts";

export function normalizeWorkBotValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[@＠][^\s，,。！？!?：:]+/gu, " ")
    .replace(/[\s，,。！？!?：:、;；]+/gu, "")
    .trim();
}

function highlightState(text: string): boolean | undefined {
  const value = text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
  // Reject double negation and questions instead of inferring a write.
  if (/不要取消|别取消|不取消|是否|要不要|[?？]|怎么|如何/u.test(value)) return undefined;
  if (/(?:取消|去掉|移除|关闭|不要|不再|不)高亮|unhighlight|removehighlight|clearhighlight/u.test(value)) return false;
  return /高亮|\bhighlight\b/iu.test(text) ? true : undefined;
}

function cleanOperand(value: string): string {
  return value.replace(/^[\s，,。！？!?：:、;；]+|[\s，,。！？!?、;；]+$/gu, "").trim();
}

function amountTokens(text: string): string[] {
  // A sign or extra decimal precision must never turn into a positive amount.
  if (/[+−-]\s*\d/u.test(text) || /\d+\.\d{3,}/u.test(text)) return [];
  return [...text.matchAll(/(?<![\d.])(\d+(?:\.\d{1,2})?)(?![\d.])/gu)].map((match) => match[1]!);
}

function paymentMethods(text: string): { cash: boolean; card: boolean; gift: boolean } {
  return {
    cash: /现金|\bcash\b/iu.test(text),
    card: /信用卡|刷卡|银行卡|卡|\b(?:card|credit|debit)\b/iu.test(text),
    gift: /礼物卡|礼卡|\bgift\s*card/iu.test(text),
  };
}

function parseStartOperand(value: string, requireDuration: boolean): WorkBotParsedIntent {
  const operand = cleanOperand(value);
  if (!operand) return { kind: "HELP" };
  const tokens = operand.split(/[\s，,。！？!?：:、;；]+/u).filter(Boolean);
  const duration = /^(\d{1,3})(?:分钟)?$/u.exec(tokens.at(-1) ?? "");
  if (!duration) return requireDuration ? { kind: "HELP" } : { kind: "START", serviceAlias: operand };

  const durationMinutes = Number(duration[1]);
  if (durationMinutes < 1 || durationMinutes > 720 || tokens.length < 2) return { kind: "HELP" };
  const serviceAlias = tokens.at(-2)!;
  const memberName = tokens.slice(0, -2).join(" ");
  return {
    kind: "START",
    serviceAlias,
    durationMinutes,
    ...(memberName ? { memberName } : {}),
  };
}

export function parseWorkBotMessage(rawText: string): WorkBotParsedIntent {
  const text = rawText
    .normalize("NFKC")
    .replace(/[@＠][^\s，,。！？!?：:]+/gu, " ")
    .trim();

  const store = /(?:^|[\s，,。！？!?：:、;；])绑定店铺\s*(\d{6})(?:$|[\s，,。！？!?、;；])/u.exec(text);
  if (store) return { kind: "BIND_STORE", storeCode: store[1]! };

  const member = /(?:^|[\s，,。！？!?：:、;；])绑定(?:员工)?\s*([^，,。！？!?：:、;；]{1,80})/u.exec(text);
  if (member) return { kind: "BIND_MEMBER", memberName: cleanOperand(member[1]!) };

  const finish = /(?:我)?(?:下了|下工(?:了)?|结束(?:了)?)/u.exec(text);
  if (finish) {
    const tail = text.slice((finish.index ?? 0) + finish[0].length);
    const amounts = amountTokens(tail);
    const methods = paymentMethods(tail);
    const paymentMethod = methods.gift || methods.cash === methods.card
      ? null : methods.cash ? "CASH" : "CARD";
    const hasHighlight = /高亮|highlight/iu.test(tail);
    const isHighlighted = highlightState(tail);
    if (hasHighlight && isHighlighted === undefined) return { kind: "HELP" };
    if (amounts.length === 2 && paymentMethod) {
      return {
        kind: "FINISH",
        ...(hasHighlight ? { isHighlighted: isHighlighted!, highlightMention: tail.trim() } : {}),
        serviceAmount: amounts[0]!,
        tipAmount: amounts[1]!,
        paymentMethod,
        ...(cleanOperand(text.slice(0, finish.index)) ? { memberName: cleanOperand(text.slice(0, finish.index)) } : {}),
        ...(/评论/u.test(tail) ? { discounts: [{ name: "评论", mention: "评论" }] } : {}),
      };
    }
    return { kind: "HELP" };
  }

  const highlightAction = "取消\\s*高亮|去掉\\s*高亮|移除\\s*高亮|关闭\\s*高亮|不\\s*高亮|高亮|unhighlight|highlight";
  const actionFirst = new RegExp(`^(${highlightAction})(?:\\s+(.+?))?[。！!]*$`, "iu").exec(text);
  const targetFirst = new RegExp(`^(.+?)\\s+(${highlightAction})[。！!]*$`, "iu").exec(text);
  if (actionFirst || targetFirst) {
    const target = cleanOperand(actionFirst ? actionFirst[2] ?? "" : targetFirst![1]!);
    const isHighlighted = highlightState(text);
    if (isHighlighted !== undefined) return {
      kind: "ADJUST", isHighlighted, highlightMention: text,
      ...(target ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(target)
        ? { recordId: target } : { memberName: target } : {}),
    };
  }

  const start = /(?:我)?(?:上工(?:了)?|开工(?:了)?|开始(?:了)?)/u.exec(text);
  if (start) {
    return parseStartOperand(text.slice((start.index ?? 0) + start[0].length), false);
  }

  return parseStartOperand(text, true);
}

function numericDurationMatches(mention: string, duration: number): boolean {
  const numeric = /^(\d+(?:\.\d+)?)\s*(分钟|分|mins?|minutes?|小时|hours?|hrs?|h)?$/iu.exec(mention.normalize("NFKC").trim());
  if (!numeric) return true; // Natural-language evidence is checked against the raw message below.
  const hours = /^(小时|hours?|hrs?|h)$/iu.test(numeric[2] ?? "");
  return Number(numeric[1]) * (hours ? 60 : 1) === duration;
}

function managementEvidence(intent: Extract<WorkBotParsedIntent, { kind: "MANAGE" }>, rawText: string): boolean {
  const raw = rawText.normalize("NFKC");
  if ((intent.operation !== "CREATE" && (!intent.recordId || !raw.includes(intent.recordId))) || !raw.includes(intent.evidence.normalize("NFKC"))) return false;
  if (intent.operation === "CREATE" && !/新增|补录|记工|上工|create/iu.test(raw)) return false;
  if (intent.operation === "DELETE" && !/删除|作废|\bdelete\b/iu.test(raw)) return false;
  if (intent.operation === "RESTORE" && !/恢复|\brestore\b/iu.test(raw)) return false;
  if (intent.operation === "PAYMENT" && !/收|付|结账|下工|下了|\bpay(?:ment)?\b/iu.test(raw)) return false;
  if (intent.operation === "UPDATE" && !/改|设|调整|高亮|备注|折扣|加项|add.?on|highlight|update|change/iu.test(raw)) return false;
  const numericRaw = intent.recordId ? raw.replace(intent.recordId, "") : raw;
  const hasNumber = (value: number) => [...numericRaw.matchAll(/(?<![\d.−+\-])(\d+(?:\.\d{1,2})?)(?![\d.])/gu)].some(match => Number(match[1]) === value);
  const check = (value: unknown, field: string): boolean => {
    if (value === null) return /清空|取消|移除|remove|clear/iu.test(raw);
    if (Array.isArray(value)) return value.length ? value.every(item => check(item, field)) : /清空|全部|所有|clear|all/iu.test(raw);
    if (typeof value === "object") return Object.entries(value as Record<string, unknown>).every(([key, child]) => check(child, key));
    if (typeof value === "number") return hasNumber(field.endsWith("Cents") || field.endsWith("Bps") ? value / 100 : value);
    if (typeof value === "boolean") {
      if (field === "isCustom") return true; // The catalog/source constraint is revalidated by the shared contract.
      if (field === "isHighlighted") return highlightState(raw) === value;
      if (field === "automaticDiscountSuppressed") return value ? /取消自动折扣|停用自动折扣|suppress/iu.test(raw) : /恢复自动折扣|启用自动折扣|enable/iu.test(raw);
      if (field.endsWith("SettledManualFlag")) return /结清|结算|settled/iu.test(raw) && (value || /取消|未|unsettled/iu.test(raw));
      return false;
    }
    if (typeof value === "string") {
      if (field.endsWith("ItemId") || field === "employeeMembershipId") return true; // Resolved only from same-store live catalog; service checks ownership.
      return raw.toLowerCase().includes(value.normalize("NFKC").toLowerCase());
    }
    return false;
  };
  return (!intent.create || check(intent.create, "create")) && (!intent.details || check(intent.details, "details")) && (!intent.payment || check(intent.payment, "payment")) && (!intent.reason || raw.includes(intent.reason.normalize("NFKC")));
}

export function parsedIntentAppearsInRawText(intent: WorkBotParsedIntent, rawText: string): boolean {
  // @ can identify an employee as well as address the bot. Keep its text as evidence.
  const normalizeEvidence = (value: string) => normalizeWorkBotValue(value.replace(/[@＠]/gu, ""));
  const normalizedRaw = normalizeEvidence(rawText);
  const appears = (value: string) => {
    const normalized = normalizeEvidence(value);
    return normalized.length > 0 && normalizedRaw.includes(normalized);
  };
  const adjustmentEvidence = (value: Extract<WorkBotParsedIntent, { kind: "ADJUST" | "FINISH" }>) =>
    (!value.recordId || rawText.includes(value.recordId))
    && (value.isHighlighted === undefined || (Boolean(value.highlightMention) && appears(value.highlightMention!)
      && highlightState(value.highlightMention!) === value.isHighlighted
      && highlightState(rawText) === value.isHighlighted))
    && [...(value.discounts ?? []), ...(value.addons ?? [])].every(item => appears(item.mention)
      && (item.action === "REMOVE" ? /删除|取消|移除|去掉|remove/iu.test(item.mention) : !/删除|取消|移除|去掉|remove/iu.test(item.mention)));
  switch (intent.kind) {
    case "BIND_STORE":
      return normalizedRaw.includes(intent.storeCode);
    case "BIND_MEMBER":
      return appears(intent.memberMention ?? intent.memberName);
    case "START":
      return appears(intent.serviceMention ?? intent.serviceAlias)
        && (intent.durationMinutes === undefined || (intent.durationSource === "SKILL" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intent.serviceAlias) && !intent.durationMention) || (intent.durationMention !== undefined ? appears(intent.durationMention) && numericDurationMatches(intent.durationMention, intent.durationMinutes) : new RegExp(`(?<![\\d.])${intent.durationMinutes}(?![\\d.])`, "u").test(rawText.normalize("NFKC"))))
        && (intent.memberName === undefined || appears(intent.memberMention ?? intent.memberName));
    case "ADJUST":
      return (Boolean(intent.discounts?.length || intent.addons?.length) || intent.isHighlighted !== undefined)
        && adjustmentEvidence(intent)
        && (!intent.memberName || appears(intent.memberMention ?? intent.memberName))
        && [...(intent.discounts ?? []), ...(intent.addons ?? [])].every(item => appears(item.mention));
    case "FINISH": {
      const text = rawText.normalize("NFKC").replace(/[@＠][^\s，,。！？!?：:]+/gu, " ");
      const amounts = amountTokens(intent.recordId ? text.replace(intent.recordId, "") : text);
      const methods = paymentMethods(text);
      const methodPresent = intent.paymentMention
        ? appears(intent.paymentMention)
        : intent.paymentMethod === "CASH"
          ? methods.cash : methods.card;
      return adjustmentEvidence(intent) && amounts.length === 2 && amounts[0] === intent.serviceAmount && amounts[1] === intent.tipAmount
        && methodPresent && !methods.gift && !(methods.cash && methods.card)
        && !(intent.paymentMethod === "CASH" ? methods.card : methods.cash)
        && (!intent.memberName || appears(intent.memberMention ?? intent.memberName))
        && [...(intent.discounts ?? []), ...(intent.addons ?? [])].every(item => appears(item.mention));
    }
    case "QUERY":
      return /查|列表|多少|合计|汇总|明细|记录|list|query|show|total/iu.test(rawText)
        && (!intent.memberName || appears(intent.memberMention ?? intent.memberName))
        && (!intent.recordId || rawText.includes(intent.recordId));
    case "MANAGE":
      return managementEvidence(intent, rawText);
    case "HELP":
      return true;
  }
}
