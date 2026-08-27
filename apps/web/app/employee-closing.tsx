"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import { type AppLocale, translateText } from "../lib/i18n";
import { formatUsd } from "../lib/money";
import type { EmployeeClosingPreview, EmployeeClosingRecord } from "../lib/types";
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
  const screenHeight = Math.max(1, Math.round(window.screen?.height || window.innerHeight));
  const landscape = logicalWidth > screenHeight;
  const logicalHeight = Math.max(
    screenHeight,
    Math.round((landscape ? 430 : 520) + preview.records.length * (landscape ? 62 : 82)),
  );
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(logicalWidth * pixelRatio);
  canvas.height = Math.round(logicalHeight * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成图片");
  context.scale(pixelRatio, pixelRatio);

  const scale = Math.max(
    0.72,
    Math.min(1.55, logicalWidth / 390, logicalHeight / (landscape ? 500 : 844)),
  );
  const margin = Math.max(16, Math.min(52, logicalWidth * 0.06));
  const contentWidth = logicalWidth - margin * 2;
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
  context.font = `900 ${Math.round((landscape ? 25 : 30) * scale)}px ${imageFont}`;
  context.fillText(preview.employee.displayName, margin, y + 29 * scale, contentWidth);
  y += 42 * scale;
  context.fillStyle = "#6b635a";
  context.font = `600 ${Math.round(14 * scale)}px ${imageFont}`;
  context.fillText(localizedDate(preview.businessDate, locale), margin, y + 14 * scale, contentWidth);
  y += 30 * scale;

  const statusText = preview.isClosed
    ? `营业日已日结${preview.activeClosing ? ` · 第 ${preview.activeClosing.cycleNo} 次` : ""}`
    : preview.hasWarnings
      ? `${preview.warningCount} 项需要核对`
      : "个人记录已完整";
  const statusColor = preview.isClosed ? "#176b45" : preview.hasWarnings ? "#9a5a0c" : "#176b45";
  const statusBackground = preview.isClosed ? "#e7f5ed" : preview.hasWarnings ? "#fff0d8" : "#e7f5ed";
  context.font = `800 ${Math.round(12 * scale)}px ${imageFont}`;
  const localizedStatusText = tr(statusText);
  const statusWidth = Math.min(contentWidth, context.measureText(localizedStatusText).width + 24 * scale);
  fillRoundedRect(context, margin, y, statusWidth, 30 * scale, 15 * scale, statusBackground);
  context.fillStyle = statusColor;
  context.fillText(localizedStatusText, margin + 12 * scale, y + 20 * scale, statusWidth - 24 * scale);
  y += 42 * scale;

  const formulaRows = [
    [
      tr("现金大费工资"),
      money(preview.employee.cashLargeFeeDividendCents, locale),
      tr("非现金大费工资"),
      money(preview.employee.cardLargeFeeDividendCents, locale),
      tr("大费工资"),
      money(preview.employee.confirmedLargeFeeWageCents, locale),
    ],
    [
      tr("现金小费"),
      money(preview.employee.cashTipDividendCents, locale),
      tr("非现金小费"),
      money(preview.employee.cardTipDividendCents, locale),
      tr("小费工资"),
      money(preview.employee.confirmedTipWageCents, locale),
    ],
    [
      tr("大费工资"),
      money(preview.employee.confirmedLargeFeeWageCents, locale),
      tr("小费工资"),
      money(preview.employee.confirmedTipWageCents, locale),
      tr("今日总收入"),
      money(preview.employee.confirmedIncomeCents, locale),
    ],
  ];
  const formulaGap = 6 * scale;
  const formulaHeaderHeight = 30 * scale;
  const formulaRowHeight = 44 * scale;
  const formulaPanelHeight =
    formulaHeaderHeight + formulaRows.length * formulaRowHeight + (formulaRows.length - 1) * formulaGap + 12 * scale;
  fillRoundedRect(context, margin, y, contentWidth, formulaPanelHeight, 18 * scale, "rgba(255,255,255,0.9)");
  context.fillStyle = "#6b635a";
  context.font = `800 ${Math.round(10 * scale)}px ${imageFont}`;
  context.fillText(tr("已确认收入公式"), margin + 13 * scale, y + 20 * scale);
  const formulaInnerWidth = contentWidth - 26 * scale;
  const operatorWidth = 16 * scale;
  const formulaCardWidth = (formulaInnerWidth - operatorWidth * 2) / 3;
  formulaRows.forEach((row, index) => {
    const rowY = y + formulaHeaderHeight + index * (formulaRowHeight + formulaGap);
    const resultBackground = index === formulaRows.length - 1 ? "#8e3e2f" : "#f6ece7";
    [0, 1, 2].forEach((column) => {
      const x = margin + 13 * scale + column * (formulaCardWidth + operatorWidth);
      fillRoundedRect(
        context,
        x,
        rowY,
        formulaCardWidth,
        formulaRowHeight,
        10 * scale,
        column === 2 ? resultBackground : index === 1 ? "#edf8f1" : "#fff2dc",
      );
      context.fillStyle = column === 2 && index === formulaRows.length - 1 ? "rgba(255,255,255,.76)" : "#756b62";
      context.font = `700 ${Math.round(8 * scale)}px ${imageFont}`;
      context.fillText(row[column * 2]!, x + 8 * scale, rowY + 15 * scale, formulaCardWidth - 16 * scale);
      context.fillStyle = column === 2 && index === formulaRows.length - 1 ? "#fff" : "#211d18";
      context.font = `900 ${Math.round(12 * scale)}px ${imageFont}`;
      context.fillText(row[column * 2 + 1]!, x + 8 * scale, rowY + 35 * scale, formulaCardWidth - 16 * scale);
      if (column < 2) {
        context.fillStyle = "#8e3e2f";
        context.font = `900 ${Math.round(13 * scale)}px ${imageFont}`;
        context.textAlign = "center";
        context.fillText(column === 0 ? "+" : "=", x + formulaCardWidth + operatorWidth / 2, rowY + 28 * scale);
        context.textAlign = "left";
      }
    });
  });
  y += formulaPanelHeight + 10 * scale;

  const handoffHeight = 48 * scale;
  fillRoundedRect(context, margin, y, contentWidth, handoffHeight, 14 * scale, "#fff1de");
  context.fillStyle = "#8a4b08";
  context.font = `700 ${Math.round(9 * scale)}px ${imageFont}`;
  context.fillText(tr("大费基数"), margin + 13 * scale, y + 17 * scale);
  context.fillText(tr("应提交现金"), margin + contentWidth / 2, y + 17 * scale);
  context.fillStyle = "#211d18";
  context.font = `900 ${Math.round(14 * scale)}px ${imageFont}`;
  context.fillText(money(preview.employee.grossFeeBaseCents, locale), margin + 13 * scale, y + 38 * scale);
  context.fillText(money(preview.employee.cashToSubmitToStoreCents, locale), margin + contentWidth / 2, y + 38 * scale);
  y += handoffHeight + 14 * scale;

  context.fillStyle = "#6b635a";
  context.font = `800 ${Math.round(11 * scale)}px ${imageFont}`;
  context.fillText(`${tr("逐笔记工")} · ${preview.records.length} ${tr("条")}`, margin, y + 12 * scale);
  y += 22 * scale;
  const recordHeight = (landscape ? 50 : 68) * scale;
  preview.records.forEach((record) => {
    fillRoundedRect(context, margin, y, contentWidth, recordHeight, 13 * scale, "rgba(255,255,255,.88)");
    context.fillStyle = "#211d18";
    context.font = `900 ${Math.round(11 * scale)}px ${imageFont}`;
    context.fillText(recordLabel(record), margin + 12 * scale, y + 18 * scale, contentWidth * 0.58);
    context.fillStyle = record.status === "CONFIRMED" ? "#176b45" : "#9a5a0c";
    context.font = `800 ${Math.round(9 * scale)}px ${imageFont}`;
    context.textAlign = "right";
    context.fillText(
      tr(record.status === "CONFIRMED" ? "已确认" : "待结账"),
      margin + contentWidth - 12 * scale,
      y + 18 * scale,
    );
    context.textAlign = "left";
    context.fillStyle = "#756b62";
    context.font = `700 ${Math.round(8 * scale)}px ${imageFont}`;
    const time = `${recordTime(record.startAt, preview.storeTimezone, locale)}–${recordTime(record.endAt, preview.storeTimezone, locale)}`;
    const servicePayments = `${tr("大费")} ${tr("现金")} ${paymentMoney(record.cashServiceCents, locale)} · ${tr("刷卡")} ${paymentMoney(record.cardServiceCents, locale)} · ${tr("礼卡")} ${paymentMoney(record.giftCardServiceCents, locale)}`;
    const tipPayments = `${tr("小费")} ${tr("现金")} ${paymentMoney(record.cashTipCents, locale)} · ${tr("刷卡")} ${paymentMoney(record.cardTipCents, locale)} · ${tr("礼卡")} ${paymentMoney(record.giftCardTipCents, locale)}`;
    context.fillText(time, margin + 12 * scale, y + 34 * scale, contentWidth * 0.28);
    context.fillText(servicePayments, margin + 12 * scale, y + 50 * scale, contentWidth - 24 * scale);
    if (!landscape) context.fillText(tipPayments, margin + 12 * scale, y + 64 * scale, contentWidth - 24 * scale);
    else context.fillText(tipPayments, margin + contentWidth * 0.48, y + 34 * scale, contentWidth * 0.48);
    y += recordHeight + 7 * scale;
  });

  const footerY = logicalHeight - margin;
  const availableForWarnings = footerY - y - 30 * scale;
  if (preview.warnings.length > 0 && availableForWarnings >= 44 * scale) {
    const warningHeight = Math.min(availableForWarnings, (42 + preview.warnings.length * 18) * scale);
    fillRoundedRect(context, margin, y, contentWidth, warningHeight, 15 * scale, "rgba(255,240,216,0.94)");
    context.fillStyle = "#8a4b08";
    context.font = `800 ${Math.round(11 * scale)}px ${imageFont}`;
    context.fillText(tr("待核对"), margin + 13 * scale, y + 20 * scale);
    context.font = `700 ${Math.round(10 * scale)}px ${imageFont}`;
    preview.warnings.slice(0, landscape ? 2 : 4).forEach((warning, index) => {
      context.fillText(
        tr(`${warning.labelZh} ${warning.count} 条`),
        margin + 13 * scale,
        y + (39 + index * 17) * scale,
      );
    });
  }

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
            <p className="eyebrow">{preview.storeName} · {localizedDate(preview.businessDate, locale)}</p>
            <h2>{employee.displayName}的个人日结</h2>
          </div>
          <span className={`employee-closing-status ${preview.hasWarnings ? "warning" : "ready"}`}>
            {preview.isClosed
              ? `营业日已日结${preview.activeClosing ? ` · 第 ${preview.activeClosing.cycleNo} 次` : ""}`
              : preview.hasWarnings
                ? `${preview.warningCount} 项需要核对`
                : "个人记录已完整"}
          </span>
        </div>
        <div className="employee-closing-formula" aria-label="已确认收入公式">
          <div className="employee-closing-formula-heading"><strong>已确认收入</strong><small>待结账记工暂不计入</small></div>
          <div className="employee-closing-equation-row">
            <article><span>现金大费工资</span><strong>{money(employee.cashLargeFeeDividendCents, locale)}</strong></article>
            <b aria-hidden="true">＋</b>
            <article><span>刷卡／礼物卡大费工资</span><strong>{money(employee.cardLargeFeeDividendCents, locale)}</strong></article>
            <b aria-hidden="true">＝</b>
            <article className="result"><span>大费工资</span><strong>{money(employee.confirmedLargeFeeWageCents, locale)}</strong></article>
          </div>
          <div className="employee-closing-equation-row">
            <article><span>现金小费</span><strong>{money(employee.cashTipDividendCents, locale)}</strong></article>
            <b aria-hidden="true">＋</b>
            <article><span>刷卡／礼物卡小费</span><strong>{money(employee.cardTipDividendCents, locale)}</strong></article>
            <b aria-hidden="true">＝</b>
            <article className="result"><span>小费工资</span><strong>{money(employee.confirmedTipWageCents, locale)}</strong></article>
          </div>
          <div className="employee-closing-equation-row total">
            <article><span>大费工资</span><strong>{money(employee.confirmedLargeFeeWageCents, locale)}</strong></article>
            <b aria-hidden="true">＋</b>
            <article><span>小费工资</span><strong>{money(employee.confirmedTipWageCents, locale)}</strong></article>
            <b aria-hidden="true">＝</b>
            <article className="result"><span>今日总收入</span><strong>{money(employee.confirmedIncomeCents, locale)}</strong></article>
          </div>
        </div>
        <div className="employee-closing-compact-meta">
          <span>大费基数 <strong>{money(employee.grossFeeBaseCents, locale)}</strong></span>
          <span>全部记工 <strong>{preview.records.length} 条</strong></span>
          {employee.incompleteRecordCount > 0 && <span className="warning">待结账 <strong>{employee.incompleteRecordCount} 条</strong></span>}
        </div>
      </header>

      <section className="employee-closing-records" aria-labelledby="employee-closing-records-title">
        <div className="employee-closing-section-heading">
          <div><h3 id="employee-closing-records-title">逐笔记工</h3><p>每笔分别列出客人的大费和小费付款。</p></div>
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
              <div className="employee-closing-payment-grid">
                <span />
                <b>现金</b><b>刷卡</b><b>礼物卡</b>
                <strong>大费</strong>
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

      <section className="employee-closing-handoff" aria-labelledby="employee-closing-settlement-title">
        <div><h3 id="employee-closing-settlement-title">现金交接</h3><p>员工需要交给店铺的现金，不属于工资收入。</p></div>
        <article><span>应提交现金</span><strong>{money(employee.cashToSubmitToStoreCents, locale)}</strong><small>含现金大费的已确认项目，折前大费基数 × 40%</small></article>
      </section>

      {preview.warnings.length > 0 ? (
        <section className="employee-closing-warnings" aria-label="个人日结待核对项目">
          <strong>请先核对</strong>
          <div>{preview.warnings.map((warning) => <span key={warning.code}>{warning.labelZh}<b>{warning.count} 条</b></span>)}</div>
        </section>
      ) : <p className="employee-closing-complete">✓ 当前个人记录没有待结账或异常提示</p>}

      <div className="employee-closing-image-actions">
        <button className="primary-action" type="button" disabled={generating} onClick={() => void createImage()}>{generating ? "正在生成…" : generated ? "重新生成图片" : "生成日结图片"}</button>
        {generated && <button className="secondary-action" type="button" onClick={() => void saveImage()}>保存到相册 / 分享</button>}
        {canSend && preview.isClosed && <button className="secondary-action" type="button" disabled={sending} onClick={() => void sendToEmployee()}>{sending ? "正在排队…" : "短信发送给员工"}</button>}
      </div>
      {imageMessage && <p className="employee-closing-image-message" role="status">{imageMessage}</p>}
      {imageError && <p className="form-error" role="alert">{imageError}</p>}
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
