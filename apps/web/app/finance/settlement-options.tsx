"use client";

import type { EmployeeSettlementAmountType, EmployeeSettlementPaymentScope } from "@massage-note/contracts";
import { useLanguage } from "../language-provider";

type Choice = EmployeeSettlementPaymentScope | EmployeeSettlementAmountType | "";

function Options({ legend, value, options, disabled, onChange }: {
  legend: string; value: Choice; options: readonly [Choice, string][]; disabled: boolean; onChange: (value: Choice) => void;
}) {
  return <fieldset className="settlement-options" disabled={disabled}>
    <legend>{legend}</legend>
    <div>{options.map(([key, label]) => <label key={key}>
      <input type="checkbox" checked={value === "ALL" || value === key} onChange={() => {
        if (value === "ALL") onChange(options.find(([other]) => other !== key)![0]);
        else if (value !== key) onChange(value ? "ALL" : key);
      }} />
      <span>{label}</span>
    </label>)}</div>
  </fieldset>;
}

export function SettlementOptions({ paymentScope, amountType, disabled, onPaymentScope, onAmountType }: {
  paymentScope: EmployeeSettlementPaymentScope | ""; amountType: EmployeeSettlementAmountType; disabled: boolean;
  onPaymentScope: (value: EmployeeSettlementPaymentScope) => void; onAmountType: (value: EmployeeSettlementAmountType) => void;
}) {
  const { t } = useLanguage();
  return <>
    <Options legend={t("工资来源")} value={paymentScope} options={[["NON_CASH", t("刷卡")], ["CASH", t("现金")]]} disabled={disabled} onChange={value => onPaymentScope(value as EmployeeSettlementPaymentScope)} />
    <Options legend={t("工资类型")} value={amountType} options={[["SERVICE", t("大费")], ["TIP", t("小费")]]} disabled={disabled} onChange={value => onAmountType(value as EmployeeSettlementAmountType)} />
  </>;
}
