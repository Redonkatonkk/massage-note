"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ComponentProps } from "react";
import { useLanguage } from "./language-provider";

type CashClosingConfirmProps = ComponentProps<"button"> & {
  open: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function CashClosingConfirm({ open, onDismiss, onConfirm, onClick, children, ...buttonProps }: CashClosingConfirmProps) {
  const { t } = useLanguage();
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const left = anchor.current.getBoundingClientRect().left;
      const width = panel.current.offsetWidth;
      panel.current.style.left = `${Math.max(12 - left, Math.min(0, window.innerWidth - 12 - left - width))}px`;
    };
    place();
    cancel.current?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) onDismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      trigger.current?.focus();
      onDismiss();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onDismiss]);

  return <div className="cash-closing-confirm" ref={anchor}>
    <button {...buttonProps} ref={trigger} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => open ? onDismiss() : onClick?.(event)}>{children}</button>
    {open && <div className="cash-closing-confirm__panel" ref={panel} id={id} role="alertdialog" aria-labelledby={`${id}-message`}>
      <p id={`${id}-message`}>{t("还有员工没有结现金，是否强制日结？")}</p>
      <div>
        <button className="secondary-action" type="button" ref={cancel} onClick={() => { trigger.current?.focus(); onDismiss(); }}>{t("取消")}</button>
        <button className="danger-button" type="button" disabled={buttonProps.disabled} onClick={() => { trigger.current?.focus(); onConfirm(); }}>{t("强制日结")}</button>
      </div>
    </div>}
  </div>;
}
