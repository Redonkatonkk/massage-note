import { useId } from "react";

export function GiftCardIdentityField({
  isOnline, onModeChange, value, onChange, actionLabel, disabled = false, autoFocus = false,
}: {
  isOnline: boolean;
  onModeChange: (online: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  actionLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return <div className="field-label gift-card-identity-field">
    <label htmlFor={id}>{isOnline ? "用户名" : "礼物卡序列号"}</label>
    <div className="gift-card-identity-field__controls">
      <input id={id} type="text" autoFocus={autoFocus} autoComplete="off" maxLength={120} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="secondary-action compact" aria-pressed={isOnline} disabled={disabled} onClick={() => onModeChange(!isOnline)}>{actionLabel}</button>
    </div>
  </div>;
}
