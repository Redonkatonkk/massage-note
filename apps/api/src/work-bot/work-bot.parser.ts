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
    const serviceAlias = cleanOperand(text.slice((start.index ?? 0) + start[0].length));
    return serviceAlias ? { kind: "START", serviceAlias } : { kind: "HELP" };
  }

  return { kind: "HELP" };
}

export function parsedIntentAppearsInRawText(intent: WorkBotParsedIntent, rawText: string): boolean {
  const normalizedRaw = normalizeWorkBotValue(rawText);
  switch (intent.kind) {
    case "BIND_STORE":
      return normalizedRaw.includes(intent.storeCode);
    case "BIND_MEMBER":
      return normalizedRaw.includes(normalizeWorkBotValue(intent.memberName));
    case "START":
      return normalizedRaw.includes(normalizeWorkBotValue(intent.serviceAlias));
    case "FINISH": {
      const amountTokens = [...rawText.normalize("NFKC").matchAll(/(?<![\d.])(\d+(?:\.\d{1,2})?)(?![\d.])/gu)].map((match) => match[1]);
      const methodPresent = intent.paymentMethod === "CASH"
        ? /(?:现金|cash)/iu.test(rawText)
        : /(?:信用卡|刷卡|银行卡|card|(?:^|[\s，,])卡(?:$|[\s，,。]))/iu.test(rawText);
      return amountTokens.includes(intent.serviceAmount) && amountTokens.includes(intent.tipAmount) && methodPresent;
    }
    case "HELP":
      return true;
  }
}
