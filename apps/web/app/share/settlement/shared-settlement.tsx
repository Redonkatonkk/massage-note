"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { employeeSettlementShareTokenSchema } from "@massage-note/contracts";
import { apiBase, ApiError } from "../../../lib/api";
import type { SharedEmployeeSettlement } from "../../../lib/types";
import { formatUsdPrecise } from "../../../lib/money";
import { useLanguage } from "../../language-provider";
import { SettlementRecords } from "../../finance/settlement-records";
import { SettlementSummary } from "../../finance/settlement-summary";

export function SharedSettlement() {
  const token = useSearchParams().get("token") ?? "";
  const { locale, setLocale } = useLanguage();
  const en = locale === "en-US";
  const [value, setValue] = useState<SharedEmployeeSettlement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setValue(null);
    if (!employeeSettlementShareTokenSchema.safeParse(token).success) { setState("unavailable"); return; }
    setState("loading");
    void fetch(`${apiBase}/public/employee-settlements/${token}`, { credentials: "omit", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
        return response.json() as Promise<SharedEmployeeSettlement>;
      })
      .then(result => { if (!controller.signal.aborted) { setValue(result); setState(Date.parse(result.expiresAt) > Date.now() ? "ready" : "unavailable"); } })
      .catch(error => { if (!controller.signal.aborted) setState(error instanceof ApiError && [400, 404, 410].includes(error.status) ? "unavailable" : "error"); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => {
    if (!value) return;
    const expire = () => { if (Date.now() >= Date.parse(value.expiresAt)) { setState("unavailable"); setValue(null); } };
    const timer = window.setTimeout(expire, Math.max(0, Date.parse(value.expiresAt) - Date.now()));
    window.addEventListener("focus", expire);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", expire); };
  }, [value]);
  const statement = state === "ready" ? value?.snapshot : null;
  const stamp = (date: string) => new Intl.DateTimeFormat(locale, { timeZone: statement?.storeTimezone ?? "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
  return <div className="settlement-share-shell">
    <header className="settlement-share-bar"><span>Massage note</span><button type="button" onClick={() => setLocale(en ? "zh-CN" : "en-US")} aria-label={en ? "Switch to Chinese" : "切换至英文"}>{en ? "中文" : "English"}</button></header>
    <main className="settlement-share">
      {statement && value ? <>
        <header className="settlement-share-heading">
          <p>{statement.storeName}</p>
          <h1>{statement.employee.displayName} · {en ? "Payroll statement" : "工资结算单"}</h1>
          <p className="settlement-share-period">{en ? "Settlement period" : "结算日期"} <time dateTime={statement.dateFrom}>{statement.dateFrom}</time> — <time dateTime={statement.dateTo}>{statement.dateTo}</time></p>
          <p>{en ? ({ CASH: "Cash", NON_CASH: "Card + gift card", ALL: "All payment sources" })[statement.paymentScope] : ({ CASH: "现金", NON_CASH: "刷卡＋礼物卡", ALL: "全部付款来源" })[statement.paymentScope]} · {en ? ({ SERVICE: "Service wages only", TIP: "Tips only", ALL: "Service wages + tips" })[statement.amountType ?? "ALL"] : ({ SERVICE: "仅大费", TIP: "仅小费", ALL: "大费＋小费" })[statement.amountType ?? "ALL"]}</p>
        </header>
        <section className="settlement-share-total" aria-label={en ? "Statement totals" : "结算合计"}>
          <div className="settlement-share-lead"><h2>{en ? "Total earnings" : "收入合计"}</h2><strong>{formatUsdPrecise(statement.summary.totalIncomeCents)}</strong></div>
          <SettlementSummary preview={statement} />
          <p>{en ? "Earnings from confirmed work records. This statement does not confirm payment." : "收入来自已确认记工；结算单不代表工资已支付。"}</p>
        </section>
        <SettlementRecords preview={statement} />
        <footer className="settlement-share-footer"><p>{en ? "Statement generated" : "结算单生成于"} {stamp(statement.generatedAt)}</p><p>{en ? "Link expires" : "链接有效期至"} {stamp(value.expiresAt)}</p><p>{en ? "This is a saved statement. Later ledger changes are not reflected here." : "这是生成时保存的结算单，后续账目修改不会同步。"}</p></footer>
      </> : <section className="settlement-share-state">
        <h1>{en ? "Payroll statement" : "工资结算单"}</h1>
        {state === "loading" ? <p role="status">{en ? "Loading statement…" : "正在读取结算单…"}</p> : state === "unavailable" ? <p>{en ? "This link has expired or does not exist. Ask the sender for a new link." : "分享链接已过期或不存在，请联系发送人重新生成。"}</p> : <><p role="alert">{en ? "Unable to load the statement. Please try again." : "暂时无法读取结算单，请重试。"}</p><button className="secondary-action" type="button" onClick={() => setAttempt(value => value + 1)}>{en ? "Retry" : "重试"}</button></>}
      </section>}
    </main>
  </div>;
}
