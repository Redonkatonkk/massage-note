import type { WorkBotParsedIntent } from "@massage-note/contracts";

export function normalizeWorkBotValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[@＠][^\s，,。！？!?：:]+/gu, " ")
    .replace(/[\s，,。！？!?：:、;；]+/gu, "")
    .trim();
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
    if (amounts.length === 2 && paymentMethod) {
      return {
        kind: "FINISH",
        serviceAmount: amounts[0]!,
        tipAmount: amounts[1]!,
        paymentMethod,
        ...(cleanOperand(text.slice(0, finish.index)) ? { memberName: cleanOperand(text.slice(0, finish.index)) } : {}),
        ...(/评论/u.test(tail) ? { discounts: [{ name: "评论", mention: "评论" }] } : {}),
      };
    }
    return { kind: "HELP" };
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

export function parsedIntentAppearsInRawText(intent: WorkBotParsedIntent, rawText: string): boolean {
  const normalizedRaw = normalizeWorkBotValue(rawText);
  const appears = (value: string) => {
    const normalized = normalizeWorkBotValue(value);
    return normalized.length > 0 && normalizedRaw.includes(normalized);
  };
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
      return (Boolean(intent.discounts?.length || intent.addons?.length))
        && (!intent.memberName || appears(intent.memberMention ?? intent.memberName))
        && [...(intent.discounts ?? []), ...(intent.addons ?? [])].every(item => appears(item.mention));
    case "FINISH": {
      const text = rawText.normalize("NFKC").replace(/[@＠][^\s，,。！？!?：:]+/gu, " ");
      const amounts = amountTokens(text);
      const methods = paymentMethods(text);
      const methodPresent = intent.paymentMention
        ? appears(intent.paymentMention)
        : intent.paymentMethod === "CASH"
          ? methods.cash : methods.card;
      return amounts.length === 2 && amounts[0] === intent.serviceAmount && amounts[1] === intent.tipAmount
        && methodPresent && !methods.gift && !(methods.cash && methods.card)
        && !(intent.paymentMethod === "CASH" ? methods.card : methods.cash)
        && (!intent.memberName || appears(intent.memberMention ?? intent.memberName))
        && [...(intent.discounts ?? []), ...(intent.addons ?? [])].every(item => appears(item.mention));
    }
    case "HELP":
      return true;
  }
}
