import type { ReactNode } from "react";

export function StoreSettingRule({ title, description, enabled, disabled, onChange, children }: {
  title: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
  children?: ReactNode;
}) {
  return <section className="store-setting-rule" role="group" aria-label={title}>
    <div className="store-setting-rule__header">
      <div><h3>{title}</h3><p>{description}</p></div>
      <label className="inline-check">
        <input type="checkbox" aria-label={title} disabled={disabled} checked={enabled} onChange={event => onChange(event.target.checked)} />
        开启
      </label>
    </div>
    {children}
  </section>;
}
