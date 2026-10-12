"use client";

import { useAutoDismissState } from "./use-auto-dismiss-state";

import { useEffect, useRef, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import type { AppLocale } from "../lib/i18n";
import { EmployeeClosingStatement } from "./employee-closing-statement";
import { generateEmployeeClosingImage, type GeneratedClosingImage } from "../lib/employee-closing-image";
import { formatUsd } from "../lib/money";
import type { EmployeeClosingPreview } from "../lib/types";
import { useStoreRealtime } from "../lib/realtime";
import { useLanguage } from "./language-provider";

interface EmployeeClosingSummaryProps {
  preview: EmployeeClosingPreview;
  canSend?: boolean;
}

interface EmployeeClosingModalProps {
  storeId: string;
  businessDate: string;
  membershipId: string;
  displayName: string;
  canSend?: boolean;
  onClose: () => void;
}

function money(cents: number, locale: AppLocale = "zh-CN"): string {
  return formatUsd(cents, locale);
}

function downloadImage(image: GeneratedClosingImage) {
  const link = document.createElement("a");
  link.href = image.url;
  link.download = image.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function EmployeeClosingSummary({ preview: initialPreview, canSend = false }: EmployeeClosingSummaryProps) {
  const [preview, setPreview] = useState(initialPreview);
  useEffect(() => { setPreview(initialPreview); }, [initialPreview]);
  const { locale, t } = useLanguage();
  const generationContext = useRef({ preview, locale });
  generationContext.current = { preview, locale };
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedClosingImage | null>(null);
  const [imageMessage, setImageMessage] = useAutoDismissState("");
  const [imageError, setImageError] = useAutoDismissState("");
  const [sending, setSending] = useState(false);
  const [cashSettlement, setCashSettlement] = useState(preview.cashSettlement);
  const [settlingCash, setSettlingCash] = useState(false);

  useEffect(() => { setCashSettlement(preview.cashSettlement); }, [preview]);

  async function toggleCashSettlement() {
    setSettlingCash(true);
    setImageError("");
    try {
      const result = await apiRequest<EmployeeClosingPreview["cashSettlement"]>(
        `/stores/${preview.storeId}/cash-settlements/${preview.businessDate}/${preview.employee.membershipId}/${cashSettlement.status === "SETTLED" ? "reopen" : "settle"}`,
        { method: "POST", idempotent: true, body: { version: cashSettlement.version, dailySettlementEnabled: preview.dailySettlementEnabled ?? false } },
      );
      setCashSettlement(result);
      const latest = await apiRequest<EmployeeClosingPreview>(`/stores/${preview.storeId}/closings/${preview.businessDate}/members/${preview.employee.membershipId}/preview`);
      setPreview(latest);
    } catch (caught) {
      setImageError(errorMessage(caught));
      const latest = await apiRequest<EmployeeClosingPreview>(`/stores/${preview.storeId}/closings/${preview.businessDate}/members/${preview.employee.membershipId}/preview`).catch(() => null);
      if (latest) { setPreview(latest); setCashSettlement(latest.cashSettlement); }
    } finally {
      setSettlingCash(false);
    }
  }

  useEffect(() => () => {
    if (generated) URL.revokeObjectURL(generated.url);
  }, [generated]);

  useEffect(() => {
    setGenerated(null);
    setImageMessage("");
    setImageError("");
  }, [locale, preview]);

  async function createImage() {
    setGenerating(true);
    setImageError("");
    setImageMessage("");
    try {
      const next = await generateEmployeeClosingImage(preview, locale);
      if (generationContext.current.preview !== preview || generationContext.current.locale !== locale) {
        URL.revokeObjectURL(next.url);
        return;
      }
      setGenerated(next);
      setImageMessage(`已按当前设备宽度生成 ${next.width} × ${next.height} PNG`);
    } catch (caught) {
      setImageError(errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function saveImage() {
    if (!generated) return;
    setImageError("");
    try {
      const file = new File([generated.blob], generated.fileName, { type: "image/png" });
      if (
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: t(`${preview.employee.displayName} ${preview.businessDate} 个人日结`),
          text: t("个人日结图片"),
        });
        setImageMessage("已打开系统分享菜单；请选择“存储图像”保存到相册");
        return;
      }
      downloadImage(generated);
      setImageMessage("当前浏览器不支持直接写入相册，已下载 PNG 图片");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      downloadImage(generated);
      setImageMessage("系统分享不可用，已改为下载 PNG 图片");
    }
  }

  async function sendToEmployee() {
    setSending(true);
    setImageError("");
    try {
      await apiRequest(`/stores/${preview.storeId}/closings/${preview.businessDate}/deliveries/members/${preview.employee.membershipId}`, { method: "POST", idempotent: true });
      setImageMessage("已加入 Mac 信息发送队列，可在全店日结页面查看发送状态");
    } catch (caught) {
      setImageError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  const employee = preview.employee;
  return (
    <section className="employee-closing-card" aria-label={`${employee.displayName}个人日结`}>
      <div className="employee-closing-toolbar">
        <div className="employee-closing-image-actions">
          <button className="primary-action" type="button" disabled={generating} onClick={() => void createImage()}>{generating ? "正在生成…" : generated ? "重新生成图片" : "生成日结图片"}</button>
          {generated && <button className="secondary-action" type="button" onClick={() => void saveImage()}>保存到相册 / 分享</button>}
          {canSend && <button className="secondary-action" type="button" disabled={sending} onClick={() => void sendToEmployee()}>{sending ? "正在排队…" : "短信发送给员工"}</button>}
        </div>
        {imageMessage && <p className="employee-closing-image-message" role="status">{imageMessage}</p>}
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
      </div>
      <EmployeeClosingStatement snapshot={preview} locale={locale} />

      <section className="employee-closing-handoff" aria-labelledby="employee-closing-settlement-title">
        <div><h3 id="employee-closing-settlement-title">现金交接</h3><p>{preview.dailySettlementEnabled ? (locale === "en-US" ? "All service wages and card/gift card tips; cash tips are received directly from guests." : "当天全部大费工资＋刷卡/礼物卡小费；现金小费已由客人直接给员工，不计入交接。") : "店里应发给员工的现金大费工资；现金小费由员工自行收取。"}</p></div>
        <article><span>{preview.dailySettlementEnabled ? (locale === "en-US" ? "Daily wages to pay" : "当日应发工资") : "现金大费"}</span><strong>{money(preview.dailySettlementEnabled ? preview.dailySettlementPayoutCents ?? 0 : employee.cashLargeFeeDividendCents, locale)}</strong><small>{preview.dailySettlementEnabled ? (locale === "en-US" ? "Includes service wages from every payment method and card/gift card tips." : "包含现金、刷卡和礼物卡的全部大费提成，以及刷卡/礼物卡小费。") : "已确认项目按折前金额和提成比例计算，混合付款按现金占比分摊；折扣由店里承担。"}</small></article>
      </section>

      <div className="employee-closing-image-actions">
        <span role="status">{preview.dailySettlementEnabled ? (cashSettlement.status === "SETTLED" ? (locale === "en-US" ? "Daily wages fully settled" : "已结：当天工资已全部结清") : (locale === "en-US" ? "Daily wages pending" : "当天工资尚未结清")) : (cashSettlement.status === "SETTLED" ? "已结现金：当天现金大费工资已发放" : "现金尚未结清")}</span>
        {canSend && preview.records.length > 0 && <button className="secondary-action" type="button" disabled={settlingCash} onClick={() => void toggleCashSettlement()}>{settlingCash ? "正在保存…" : cashSettlement.status === "SETTLED" ? (preview.dailySettlementEnabled ? (locale === "en-US" ? "Undo settlement" : "取消已结") : "取消已结现金") : (preview.dailySettlementEnabled ? (locale === "en-US" ? "Settled" : "已结") : "已结现金")}</button>}
      </div>

      {generated && <figure className="employee-closing-image-preview"><img src={generated.url} alt={`${employee.displayName}的个人日结图片预览`} /><figcaption>图片包含全部逐笔记工；手机可通过系统分享菜单保存到相册。</figcaption></figure>}
    </section>
  );
}

export function EmployeeClosingModal({
  storeId,
  businessDate,
  membershipId,
  displayName,
  canSend = false,
  onClose,
}: EmployeeClosingModalProps) {
  const [preview, setPreview] = useState<EmployeeClosingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissState("");

  useStoreRealtime(storeId, async () => {
    const latest = await apiRequest<EmployeeClosingPreview>(`/stores/${storeId}/closings/${businessDate}/members/${membershipId}/preview`);
    setPreview(latest);
  });

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    let cancelled = false;
    void apiRequest<EmployeeClosingPreview>(
      `/stores/${storeId}/closings/${businessDate}/members/${membershipId}/preview`,
    ).then((result) => {
      if (!cancelled) setPreview(result);
    }).catch((caught) => {
      if (!cancelled) setError(errorMessage(caught));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [businessDate, membershipId, storeId]);

  return (
    <div className="modal-backdrop employee-closing-backdrop" role="presentation">
      <section className="employee-closing-modal" role="dialog" aria-modal="true" aria-labelledby="employee-closing-title">
        <div className="modal-heading employee-closing-modal-heading">
          <div><p className="eyebrow">个人日结</p><h2 id="employee-closing-title">{displayName}</h2></div>
          <button className="close-button" type="button" onClick={onClose}>关闭</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!preview && loading && <div className="loading-card"><span className="spinner" /><strong>正在核对个人日结…</strong></div>}
        {preview && <EmployeeClosingSummary preview={preview} canSend={canSend} />}
      </section>
    </div>
  );
}
