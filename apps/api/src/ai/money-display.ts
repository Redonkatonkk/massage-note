export function formatWholeUsd(
  value: bigint | number | string | null | undefined,
): string {
  const cents = BigInt(value ?? 0);
  const absoluteCents = cents < 0n ? -cents : cents;
  const roundedDollars = (absoluteCents + 50n) / 100n;
  const sign = cents < 0n && roundedDollars !== 0n ? "-" : "";
  return `${sign}$${roundedDollars.toString()}`;
}

/** 外部模型可能自行补小数位；返回页面前统一整理为整美元。 */
export function normalizeWholeUsdText(value: string): string {
  return value.replace(
    /(-?)\$(\d[\d,]*)(?:\.(\d+))?/gu,
    (_match, sign: string, dollars: string, fraction: string | undefined) => {
      const hundredths = Number((fraction ?? "").padEnd(2, "0").slice(0, 2));
      const roundedDollars = BigInt(dollars.replaceAll(",", "")) +
        (hundredths >= 50 ? 1n : 0n);
      const normalizedSign = sign === "-" && roundedDollars !== 0n ? "-" : "";
      return `${normalizedSign}$${roundedDollars.toLocaleString("en-US")}`;
    },
  );
}
