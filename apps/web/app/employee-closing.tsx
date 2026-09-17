"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import { type AppLocale, translateText } from "../lib/i18n";
import { formatUsd } from "../lib/money";
import type { EmployeeClosingPreview, EmployeeClosingRecord } from "../lib/types";
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

interface GeneratedClosingImage {
  blob: Blob;
  fileName: string;
  height: number;
  url: string;
  width: number;
}

const imageFont = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function money(cents: number, locale: AppLocale = "zh-CN"): string {
  return formatUsd(cents, locale);
}

function compactMoney(cents: number, locale: AppLocale = "zh-CN"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function localizedDate(value: string, locale: AppLocale = "zh-CN"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function recordTime(
  instant: string | null,
  timezone: string,
  locale: AppLocale = "zh-CN",
): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

function recordLabel(record: EmployeeClosingRecord): string {
  const addons = record.addons.map((addon) => addon.shortName || addon.name);
  return [record.serviceShortName || record.serviceName, ...addons].join(" ＋ ");
}

function paymentMoney(cents: number | null, locale: AppLocale = "zh-CN"): string {
  return cents === null ? "—" : money(cents, locale);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片生成失败，请重试"));
    }, "image/png");
  });
}

async function generateClosingImage(
  preview: EmployeeClosingPreview,
  locale: AppLocale,
): Promise<GeneratedClosingImage> {
  const tr = (value: string) => translateText(value, locale);
  const logicalWidth = Math.max(1, Math.round(window.screen?.width || window.innerWidth));
  const scale = logicalWidth / 390;
  const margin = 24 * scale;
  const contentWidth = logicalWidth - margin * 2;
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成图片");
  const padding = 12 * scale;
  const leftWidth = (contentWidth - padding * 3) * 0.43;
  const rightWidth = contentWidth - padding * 3 - leftWidth;
  const lineHeight = 14 * scale;
  const wrap = (text: string, width: number, fontSize: number) => {
    context.font = `800 ${Math.round(fontSize * scale)}px ${imageFont}`;
    const lines: string[] = [];
    let line = "";
    for (const character of text) {
      if (line && context.measureText(line + character).width > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    if (line) lines.push(line);
    return lines;
  };
  const payments = (label: string, cash: number | null, card: number | null, gift: number | null) => {
    const values = [["现金", cash], ["刷卡", card], ["礼卡", gift]] as const;
    return `${tr(label)}  ${values.filter(([, value]) => value !== null && value !== 0)
      .map(([kind, value]) => `${tr(kind)} ${paymentMoney(value, locale)}`).join(" · ") || "—"}`;
  };
  const layouts = preview.records.map((record) => {
    const names = wrap(recordLabel(record), leftWidth, 11);
    const metadata = wrap(`${recordTime(record.startAt, preview.storeTimezone, locale)}–${recordTime(record.endAt, preview.storeTimezone, locale)} · ${tr(record.status === "CONFIRMED" ? "已确认" : "待结账")}`, leftWidth, 8);
    const left = [
      ...wrap(`${tr("员工大费（折前）")} ${money(record.grossFeeBaseCents, locale)}`, leftWidth, 9),
      ...wrap(`${tr("本笔收入")} ${paymentMoney(record.employeeIncomeCents, locale)}`, leftWidth, 9),
    ];
    const right = [
      wrap(payments("大费实收", record.cashServiceCents, record.cardServiceCents, record.giftCardServiceCents), rightWidth, 9),
      wrap(payments("小费", record.cashTipCents, record.cardTipCents, record.giftCardTipCents), rightWidth, 9),
    ] as const;
    const height = Math.max(names.length + metadata.length + left.length, right[0].length + right[1].length + 0.5) * lineHeight + 20 * scale;
    return { names, metadata, left, right, height };
  });
  const logicalHeight = Math.ceil(margin * 2 + 290 * scale + layouts.reduce((sum, row) => sum + row.height + 7 * scale, 0));
  canvas.width = Math.round(logicalWidth * pixelRatio);
  canvas.height = Math.round(logicalHeight * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  const background = context.createLinearGradient(0, 0, logicalWidth, logicalHeight);
  background.addColorStop(0, "#fffaf3");
  background.addColorStop(0.55, "#f9eadf");
  background.addColorStop(1, "#f2d7cb");
  context.fillStyle = background;
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  context.fillStyle = "rgba(142, 62, 47, 0.08)";
  context.beginPath();
  context.arc(logicalWidth * 0.88, logicalHeight * 0.08, logicalWidth * 0.3, 0, Math.PI * 2);
  context.fill();

  let y = margin;
  context.fillStyle = "#8e3e2f";
  context.font = `800 ${Math.round(12 * scale)}px ${imageFont}`;
  context.fillText(tr(`${preview.storeName} · 个人日结`), margin, y + 12 * scale, contentWidth);
  y += 32 * scale;

  context.fillStyle = "#211d18";
  context.font = `900 ${Math.round(30 * scale)}px ${imageFont}`;
  context.fillText(preview.employee.displayName, margin, y + 29 * scale, contentWidth);
  y += 42 * scale;
  context.fillStyle = "#6b635a";
  context.font = `600 ${Math.round(14 * scale)}px ${imageFont}`;
  context.fillText(localizedDate(preview.businessDate, locale), margin, y + 14 * scale, contentWidth);
  y += 30 * scale;

  const summaryHeight = 132 * scale;
  const totalWidth = Math.min(138 * scale, contentWidth * 0.34);
  const tableWidth = contentWidth - totalWidth - 10 * scale;
  fillRoundedRect(context, margin, y, contentWidth, summaryHeight, 18 * scale, "rgba(255,255,255,0.94)");
  const labelWidth = tableWidth * 0.32;
  const valueWidth = (tableWidth - labelWidth) / 3;
  [tr("现金"), tr("刷卡"), tr("合计")].forEach((label, index) => {
    context.fillStyle = "#756b62";
    context.font = `800 ${Math.round(9 * scale)}px ${imageFont}`;
    context.textAlign = "center";
    context.fillText(label, margin + labelWidth + valueWidth * (index + 0.5), y + 24 * scale);
  });
  const summaryRows = [
    [tr("大费工资"), preview.employee.cashLargeFeeDividendCents, preview.employee.cardLargeFeeDividendCents, preview.employee.confirmedLargeFeeWageCents],
    [tr("小费工资"), preview.employee.cashTipDividendCents, preview.employee.cardTipDividendCents, preview.employee.confirmedTipWageCents],
  ] as const;
  summaryRows.forEach((row, rowIndex) => {
    const baseline = y + (60 + rowIndex * 45) * scale;
    context.textAlign = "left";
    context.fillStyle = "#211d18";
    context.font = `800 ${Math.round(10 * scale)}px ${imageFont}`;
    context.fillText(row[0], margin + 12 * scale, baseline, labelWidth - 16 * scale);
    [row[1], row[2], row[3]].forEach((value, column) => {
      context.textAlign = "center";
      context.font = `900 ${Math.round(12 * scale)}px ${imageFont}`;
      context.fillText(compactMoney(value, locale), margin + labelWidth + valueWidth * (column + 0.5), baseline, valueWidth - 4 * scale);
    });
  });
  context.strokeStyle = "#eee4dd";
  context.lineWidth = 1.5 * scale;
  context.beginPath();
  context.moveTo(margin + 12 * scale, y + 75 * scale);
  context.lineTo(margin + tableWidth - 8 * scale, y + 75 * scale);
  context.stroke();
  const totalX = margin + tableWidth + 2 * scale;
  fillRoundedRect(context, totalX, y + 12 * scale, totalWidth, summaryHeight - 24 * scale, 14 * scale, "#f8dfcc");
  context.textAlign = "left";
  context.fillStyle = "#72311f";
  context.font = `800 ${Math.round(11 * scale)}px ${imageFont}`;
  context.fillText(tr("今日总收入"), totalX + 12 * scale, y + 42 * scale, totalWidth - 24 * scale);
  context.fillStyle = "#632719";
  context.font = `900 ${Math.round(23 * scale)}px ${imageFont}`;
  context.fillText(money(preview.employee.confirmedIncomeCents, locale), totalX + 12 * scale, y + 86 * scale, totalWidth - 24 * scale);
  y += summaryHeight + 10 * scale;

  context.fillStyle = "#6b635a";
  context.font = `800 ${Math.round(11 * scale)}px ${imageFont}`;
  context.fillText(`${tr("逐笔记工")} · ${preview.records.length} ${tr("条")}`, margin, y + 12 * scale);
  y += 22 * scale;
  layouts.forEach((row) => {
    fillRoundedRect(context, margin, y, contentWidth, row.height, 13 * scale, "rgba(255,255,255,.88)");
    let leftY = y + 18 * scale;
    context.textAlign = "left";
    context.fillStyle = "#211d18";
    context.font = `900 ${Math.round(11 * scale)}px ${imageFont}`;
    row.names.forEach((line) => { context.fillText(line, margin + padding, leftY); leftY += lineHeight; });
    context.fillStyle = "#756b62";
    context.font = `800 ${Math.round(8 * scale)}px ${imageFont}`;
    row.metadata.forEach((line) => { context.fillText(line, margin + padding, leftY); leftY += lineHeight; });
    row.left.forEach((line) => {
      context.fillStyle = "#8e3e2f";
      context.font = `800 ${Math.round(9 * scale)}px ${imageFont}`;
      context.fillText(line, margin + padding, leftY);
      leftY += lineHeight;
    });
    const rightX = margin + padding * 2 + leftWidth;
    context.strokeStyle = "#eadfd7";
    context.beginPath();
    context.moveTo(rightX - padding / 2, y + 10 * scale);
    context.lineTo(rightX - padding / 2, y + row.height - 10 * scale);
    context.stroke();
    let rightY = y + 18 * scale;
    context.font = `800 ${Math.round(9 * scale)}px ${imageFont}`;
    context.fillStyle = "#514a43";
    row.right.forEach((lines) => {
      lines.forEach((line) => { context.fillText(line, rightX, rightY); rightY += lineHeight; });
      rightY += lineHeight / 2;
    });
    y += row.height + 7 * scale;
  });

  const footerY = logicalHeight - margin;
  context.fillStyle = "#756b62";
  context.font = `600 ${Math.round(10 * scale)}px ${imageFont}`;
  context.textAlign = "left";
  context.fillText(tr("Massage note · 数据以系统保存的营业日快照为准"), margin, footerY, contentWidth);

  const blob = await canvasBlob(canvas);
  return {
    blob,
    fileName: `${locale === "en-US" ? "employee-closing" : "个人日结"}-${preview.employee.displayName.replace(/[\\/:*?"<>|]/g, "-")}-${preview.businessDate}.png`,
    height: canvas.height,
    url: URL.createObjectURL(blob),
    width: canvas.width,
  };
}

function downloadImage(image: GeneratedClosingImage) {
  const link = document.createElement("a");
  link.href = image.url;
  link.download = image.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function EmployeeClosingSummary({ preview, canSend = false }: EmployeeClosingSummaryProps) {
  const { locale, t } = useLanguage();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedClosingImage | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");
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
        { method: "POST", idempotent: true, body: { version: cashSettlement.version } },
      );
      setCashSettlement(result);
    } catch (caught) {
      setImageError(errorMessage(caught));
      const latest = await apiRequest<EmployeeClosingPreview>(`/stores/${preview.storeId}/closings/${preview.businessDate}/members/${preview.employee.membershipId}/preview`).catch(() => null);
      if (latest) setCashSettlement(latest.cashSettlement);
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
  }, [locale]);

  async function createImage() {
    setGenerating(true);
    setImageError("");
    setImageMessage("");
    try {
      const next = await generateClosingImage(preview, locale);
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
      <header className="employee-closing-hero">
        <div className="employee-closing-heading">
          <div>
            <p className="eyebrow">{preview.storeName} · 个人日结</p>
            <h2>{employee.displayName}</h2>
            <p className="employee-closing-date">{localizedDate(preview.businessDate, locale)}{preview.activeClosing ? ` · #${preview.activeClosing.cycleNo}` : ""}</p>
          </div>
          <div className="employee-closing-heading-actions">
            <div className="employee-closing-image-actions">
              <button className="primary-action" type="button" disabled={generating} onClick={() => void createImage()}>{generating ? "正在生成…" : generated ? "重新生成图片" : "生成日结图片"}</button>
              {generated && <button className="secondary-action" type="button" onClick={() => void saveImage()}>保存到相册 / 分享</button>}
              {canSend && <button className="secondary-action" type="button" disabled={sending} onClick={() => void sendToEmployee()}>{sending ? "正在排队…" : "短信发送给员工"}</button>}
            </div>
            {imageMessage && <p className="employee-closing-image-message" role="status">{imageMessage}</p>}
            {imageError && <p className="form-error" role="alert">{imageError}</p>}
          </div>
        </div>
        <div className="employee-closing-income-summary" aria-label="已确认收入">
          <div className="employee-closing-income-table" role="table" aria-label="现金刷卡工资汇总">
            <div className="employee-closing-income-row heading" role="row">
              <span role="columnheader" />
              <span role="columnheader">现金</span>
              <span role="columnheader">刷卡</span>
              <span role="columnheader">合计</span>
            </div>
            <div className="employee-closing-income-row" role="row">
              <strong role="rowheader">大费工资</strong>
              <span>{compactMoney(employee.cashLargeFeeDividendCents, locale)}</span>
              <span>{compactMoney(employee.cardLargeFeeDividendCents, locale)}</span>
              <span>{compactMoney(employee.confirmedLargeFeeWageCents, locale)}</span>
            </div>
            <div className="employee-closing-income-row" role="row">
              <strong role="rowheader">小费工资</strong>
              <span>{compactMoney(employee.cashTipDividendCents, locale)}</span>
              <span>{compactMoney(employee.cardTipDividendCents, locale)}</span>
              <span>{compactMoney(employee.confirmedTipWageCents, locale)}</span>
            </div>
          </div>
          <article className="employee-closing-income-total">
            <span>今日总收入</span>
            <strong>{money(employee.confirmedIncomeCents, locale)}</strong>
          </article>
        </div>
      </header>

      <section className="employee-closing-handoff" aria-labelledby="employee-closing-settlement-title">
        <div><h3 id="employee-closing-settlement-title">现金交接</h3><p>员工需要交给店铺的现金，不属于工资收入。</p></div>
        <article><span>应提交现金</span><strong>{money(employee.cashToSubmitToStoreCents, locale)}</strong><small>含现金大费的已确认项目，折前大费基数 × 40%</small></article>
      </section>

      <div className="employee-closing-image-actions">
        <span role="status">{cashSettlement.status === "SETTLED" ? "已结现金：当天现金大费和小费已结清" : "现金尚未结清"}</span>
        {canSend && preview.records.length > 0 && <button className="secondary-action" type="button" disabled={settlingCash} onClick={() => void toggleCashSettlement()}>{settlingCash ? "正在保存…" : cashSettlement.status === "SETTLED" ? "取消已结现金" : "已结现金"}</button>}
      </div>

      <section className="employee-closing-records" aria-labelledby="employee-closing-records-title">
        <div className="employee-closing-section-heading">
          <div><h3 id="employee-closing-records-title">逐笔记工</h3><p>员工大费显示折扣前金额；实收付款拆分仅供核对。</p></div>
          <strong>{preview.records.length} 条</strong>
        </div>
        <div className="employee-closing-record-list">
          {preview.records.map((record, index) => (
            <article className={`employee-closing-record ${record.status === "CONFIRMED" ? "confirmed" : "pending"}`} key={record.id}>
              <header>
                <div>
                  <span>#{index + 1} · {recordTime(record.startAt, preview.storeTimezone, locale)}–{recordTime(record.endAt, preview.storeTimezone, locale)}</span>
                  <strong>{recordLabel(record)}</strong>
                </div>
                <em>{record.status === "CONFIRMED" ? "已确认" : "待结账"}</em>
              </header>
              <div className="employee-closing-record-gross">
                <span>员工大费（折前）</span>
                <strong>{money(record.grossFeeBaseCents, locale)}</strong>
              </div>
              <div className="employee-closing-payment-grid">
                <span />
                <b>现金</b><b>刷卡</b><b>礼物卡</b>
                <strong>大费实收</strong>
                <span>{paymentMoney(record.cashServiceCents, locale)}</span>
                <span>{paymentMoney(record.cardServiceCents, locale)}</span>
                <span>{paymentMoney(record.giftCardServiceCents, locale)}</span>
                <strong>小费</strong>
                <span>{paymentMoney(record.cashTipCents, locale)}</span>
                <span>{paymentMoney(record.cardTipCents, locale)}</span>
                <span>{paymentMoney(record.giftCardTipCents, locale)}</span>
              </div>
              <footer>
                <span>大费工资 <strong>{money(record.totalLargeFeeWageCents, locale)}</strong></span>
                <span>小费工资 <strong>{paymentMoney(record.totalTipCents, locale)}</strong></span>
                <span className="total">本单收入 <strong>{paymentMoney(record.employeeIncomeCents, locale)}</strong></span>
              </footer>
            </article>
          ))}
          {preview.records.length === 0 && <p className="employee-closing-empty">这个营业日还没有记工。</p>}
        </div>
      </section>

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
  const [error, setError] = useState("");

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
    });
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
        {!preview && !error && <div className="loading-card"><span className="spinner" /><strong>正在核对个人日结…</strong></div>}
        {preview && <EmployeeClosingSummary preview={preview} canSend={canSend} />}
      </section>
    </div>
  );
}
