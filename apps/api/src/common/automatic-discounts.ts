export interface MondayThursdayAutoDiscountSettings {
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: bigint;
  mondayThursdayAutoDiscountAmountCents: bigint;
}

export function automaticDiscounts(
  settings: MondayThursdayAutoDiscountSettings,
  businessDate: string,
  grossFeeBaseCents: bigint,
  position = 0,
) {
  const weekday = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
  const threshold = settings.mondayThursdayAutoDiscountThresholdCents;
  const amount = settings.mondayThursdayAutoDiscountAmountCents;
  if (!settings.mondayThursdayAutoDiscountEnabled || weekday < 1 || weekday > 4
      || threshold <= 0n || amount <= 0n || amount > threshold || grossFeeBaseCents < threshold) {
    return [];
  }
  return [{
    sourceDiscountItemId: null,
    isCustom: false,
    isAutomatic: true,
    name: "周一至周四自动折扣",
    amountCents: amount,
    position,
  }];
}
