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
    const amounts = [...tail.matchAll(/(?<![\d.])(\d+(?:\.\d{1,2})?)(?![\d.])/gu)].map((match) => match[1]!);
    const paymentMethod = /(?:现金|cash)/iu.test(tail)
      ? "CASH"
      : /(?:信用卡|刷卡|银行卡|card|(?:^|[\s，,])卡(?:$|[\s，,。]))/iu.test(tail)
        ? "CARD"
        : null;
    if (amounts.length === 2 && paymentMethod) {
      return {
        kind: "FINISH",
        serviceAmount: amounts[0]!,
        tipAmount: amounts[1]!,
        paymentMethod,
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

export function parsedIntentAppearsInRawText(intent: WorkBotParsedIntent, rawText: string): boolean {
  const normalizedRaw = normalizeWorkBotValue(rawText);
  switch (intent.kind) {
    case "BIND_STORE":
      return normalizedRaw.includes(intent.storeCode);
    case "BIND_MEMBER":
      return normalizedRaw.includes(normalizeWorkBotValue(intent.memberMention ?? intent.memberName));
    case "START":
      return normalizedRaw.includes(normalizeWorkBotValue(intent.serviceMention ?? intent.serviceAlias))
        && (intent.durationMinutes === undefined || normalizedRaw.includes(normalizeWorkBotValue(intent.durationMention ?? String(intent.durationMinutes))))
        && (intent.memberName === undefined || normalizedRaw.includes(normalizeWorkBotValue(intent.memberMention ?? intent.memberName)));
    case "FINISH": {
      const amountTokens = [...rawText.normalize("NFKC").matchAll(/(?<![\d.])(\d+(?:\.\d{1,2})?)(?![\d.])/gu)].map((match) => match[1]);
      const methodPresent = intent.paymentMention
        ? normalizedRaw.includes(normalizeWorkBotValue(intent.paymentMention))
        : intent.paymentMethod === "CASH"
          ? /(?:现金|cash)/iu.test(rawText)
          : /(?:信用卡|刷卡|银行卡|card|(?:^|[\s，,])卡(?:$|[\s，,。]))/iu.test(rawText);
      return amountTokens.includes(intent.serviceAmount) && amountTokens.includes(intent.tipAmount) && methodPresent;
    }
    case "HELP":
      return true;
  }
}
