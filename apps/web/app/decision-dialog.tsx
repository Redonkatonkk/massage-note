"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "./language-provider";
import { useUiEdition } from "./ui-edition-provider";
import { useNativeDialog } from "./use-native-dialog";

interface DecisionOptions {
  action?: string;
  danger?: boolean;
  required?: boolean;
  exact?: string;
}

type DecisionKind = "confirm" | "prompt";
type Decide = (kind: DecisionKind, message: string, options: DecisionOptions, signal: AbortSignal) => Promise<string | null>;

const nativeDecision: Decide = async (kind, message) =>
  kind === "prompt" ? window.prompt(message) : window.confirm(message) ? "" : null;
const DecisionContext = createContext<Decide>(nativeDecision);

interface PendingDecision {
  id: number;
  kind: DecisionKind;
  message: string;
  options: DecisionOptions;
  signal: AbortSignal;
  resolve: (result: string | null) => void;
  cancel: () => void;
}

export function DecisionProvider({ children }: { children: ReactNode }) {
  const { edition } = useUiEdition();
  const sequence = useRef(0);
  const active = useRef<PendingDecision | null>(null);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [dialog, dialogRef] = useNativeDialog();

  function finish(result: string | null) {
    const decision = active.current;
    if (!decision) return;
    active.current = null;
    decision.signal.removeEventListener("abort", decision.cancel);
    if (dialog.current?.open) dialog.current.close();
    setPending(null);
    decision.resolve(result);
  }

  useEffect(() => () => {
    const decision = active.current;
    if (decision) {
      decision.signal.removeEventListener("abort", decision.cancel);
      active.current = null;
      decision.resolve(null);
    }
  }, []);

  const decide: Decide = (kind, message, options, signal) => {
    if (signal.aborted || active.current) return Promise.resolve(null);
    if (edition === "legacy") return nativeDecision(kind, message, options, signal);
    return new Promise(resolve => {
      const decision = { id: ++sequence.current, kind, message, options, signal, resolve, cancel: () => finish(null) };
      active.current = decision;
      signal.addEventListener("abort", decision.cancel, { once: true });
      setPending(decision);
    });
  };

  useLayoutEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
  }, [pending, dialog]);

  return <DecisionContext.Provider value={decide}>
    {children}
    {pending && <DecisionDialog key={pending.id} decision={pending} dialogRef={dialogRef} finish={finish} />}
  </DecisionContext.Provider>;
}

function DecisionDialog({ decision, dialogRef, finish }: {
  decision: PendingDecision;
  dialogRef: (element: HTMLDialogElement | null) => void;
  finish: (result: string | null) => void;
}) {
  const { locale, t } = useLanguage();
  const titleId = useId();
  const messageId = useId();
  const [value, setValue] = useState("");
  const chinese = locale === "zh-CN";
  const prompt = decision.kind === "prompt";
  const { action, danger, required, exact } = decision.options;
  const valid = (exact === undefined || value === exact) && (!required || Boolean(value.trim()));
  const title = action ? t(action) : prompt ? (chinese ? "补充确认信息" : "Confirm details") : (chinese ? "确认操作" : "Confirm action");
  const submitLabel = exact !== undefined ? (chinese ? "继续" : "Continue") : action ? t(action) : (chinese ? "确认" : "Confirm");
  return <dialog ref={dialogRef} className="decision-dialog" role={danger && !prompt ? "alertdialog" : undefined} aria-labelledby={titleId} aria-describedby={messageId} onCancel={event => { event.preventDefault(); finish(null); }}>
    <form className="decision-dialog-body" onSubmit={event => { event.preventDefault(); if (valid) finish(value); }} translate="no">
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{t(decision.message)}</p>
      {prompt && <label className="decision-field">
        {exact !== undefined ? (chinese ? "店铺名称" : "Store name") : (chinese ? (required ? "原因（必填）" : "原因（选填）") : (required ? "Reason (required)" : "Reason (optional)"))}
        <input value={value} onChange={event => setValue(event.target.value)} required={required || exact !== undefined} autoComplete="off" />
      </label>}
      <div className="decision-actions">
        <button className="secondary-action" type="button" autoFocus onClick={() => finish(null)}>{chinese ? "取消" : "Cancel"}</button>
        <button className={danger ? "danger-button" : "primary-action"} type="submit" disabled={!valid}>{submitLabel}</button>
      </div>
    </form>
  </dialog>;
}

export function useDecision() {
  const decide = useContext(DecisionContext);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  function request(kind: DecisionKind, message: string, options: DecisionOptions = {}) {
    controller.current ??= new AbortController();
    return decide(kind, message, options, controller.current.signal);
  }

  return {
    confirm: async (message: string, options?: DecisionOptions) => (await request("confirm", message, options)) !== null,
    prompt: (message: string, options?: DecisionOptions) => request("prompt", message, options),
  };
}
