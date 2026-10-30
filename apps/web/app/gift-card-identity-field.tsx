import { useId } from "react";

export function GiftCardIdentityField({
  value, onChange, disabled = false, autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return <div className="field-label gift-card-identity-field">
    <label htmlFor={id}>礼物卡序列号或用户名</label>
    <div className="gift-card-identity-field__controls">
      <input id={id} type="text" autoFocus={autoFocus} autoComplete="off" maxLength={120} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
    <span className="field-help">四位数字自动识别为序列号，其他内容识别为用户名。</span>
  </div>;
}
