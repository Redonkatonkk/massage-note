"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import { type AppLocale, translateText } from "../lib/i18n";
import { formatUsd } from "../lib/money";
import type { EmployeeClosingPreview } from "../lib/types";
import { useLanguage } from "./language-provider";

interface EmployeeClosingSummaryProps {
  preview: EmployeeClosingPreview;
}

interface EmployeeClosingModalProps {
  storeId: string;
  businessDate: string;
  membershipId: string;
  displayName: string;
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
  const logicalHeight = Math.max(1, Math.round(window.screen?.height || window.innerHeight));
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(logicalWidth * pixelRatio);
  canvas.height = Math.round(logicalHeight * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成图片");
  context.scale(pixelRatio, pixelRatio);

  const landscape = logicalWidth > logicalHeight;
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

  const dividendMetrics: Array<[string, string, string]> = [
    [tr("现金大费分红"), money(preview.employee.cashLargeFeeDividendCents, locale), "#fff2dc"],
    [tr("现金小费分红"), money(preview.employee.cashTipDividendCents, locale), "#fff2dc"],
    [tr("刷卡／礼物卡大费分红"), money(preview.employee.cardLargeFeeDividendCents, locale), "#edf8f1"],
    [tr("刷卡／礼物卡小费分红"), money(preview.employee.cardTipDividendCents, locale), "#edf8f1"],
  ];
  const overviewGap = 12 * scale;
  const dividendGap = 8 * scale;
  const dividendColumns = 2;
  const dividendCardHeight = (landscape ? 48 : 58) * scale;
  const incomeWidth = landscape ? contentWidth * 0.34 : contentWidth;
  const incomeHeight = landscape
    ? 132 * scale
    : 92 * scale;
  const dividendPanelX = landscape ? margin + incomeWidth + overviewGap : margin;
  const dividendPanelY = landscape ? y : y + incomeHeight + overviewGap;
  const dividendPanelWidth = landscape
    ? contentWidth - incomeWidth - overviewGap
    : contentWidth;
  const dividendPanelHeight =
    36 * scale + dividendCardHeight * 2 + dividendGap + 12 * scale;

  fillRoundedRect(context, margin, y, incomeWidth, incomeHeight, 22 * scale, "#8e3e2f");
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.font = `700 ${Math.round(13 * scale)}px ${imageFont}`;
  context.fillText(tr("今日总收入"), margin + 20 * scale, y + 27 * scale, incomeWidth - 40 * scale);
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round((landscape ? 25 : 32) * scale)}px ${imageFont}`;
  context.fillText(
    money(preview.employee.employeeIncomeCents, locale),
    margin + 20 * scale,
    y + (landscape ? 68 : 66) * scale,
    incomeWidth - 40 * scale,
  );
  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = `600 ${Math.round(11 * scale)}px ${imageFont}`;
  context.fillText(tr("大费工资＋小费"), margin + 20 * scale, y + (landscape ? 96 : 82) * scale, incomeWidth - 40 * scale);

  fillRoundedRect(
    context,
    dividendPanelX,
    dividendPanelY,
    dividendPanelWidth,
    dividendPanelHeight,
    20 * scale,
    "rgba(255,255,255,0.86)",
  );
  context.fillStyle = "#6b635a";
  context.font = `800 ${Math.round(11 * scale)}px ${imageFont}`;
  context.fillText(tr("已确认收入分配 · 按现金／非现金拆分"), dividendPanelX + 14 * scale, dividendPanelY + 23 * scale, dividendPanelWidth - 28 * scale);
  const dividendCardWidth =
    (dividendPanelWidth - 28 * scale - dividendGap * (dividendColumns - 1)) /
    dividendColumns;
  dividendMetrics.forEach(([label, value, backgroundColor], index) => {
    const column = index % dividendColumns;
    const row = Math.floor(index / dividendColumns);
    const x = dividendPanelX + 14 * scale + column * (dividendCardWidth + dividendGap);
    const cardY = dividendPanelY + 34 * scale + row * (dividendCardHeight + dividendGap);
    fillRoundedRect(context, x, cardY, dividendCardWidth, dividendCardHeight, 12 * scale, backgroundColor);
    context.fillStyle = "#756b62";
    context.font = `700 ${Math.round(9 * scale)}px ${imageFont}`;
    context.fillText(label, x + 10 * scale, cardY + 17 * scale, dividendCardWidth - 20 * scale);
    context.fillStyle = "#211d18";
    context.font = `900 ${Math.round((landscape ? 13 : 15) * scale)}px ${imageFont}`;
    context.fillText(value, x + 10 * scale, cardY + (landscape ? 38 : 42) * scale, dividendCardWidth - 20 * scale);
  });
  y += landscape
    ? Math.max(incomeHeight, dividendPanelHeight) + 14 * scale
    : incomeHeight + overviewGap + dividendPanelHeight + 14 * scale;

  const metrics: Array<[string, string]> = [
    [tr("大费基数"), money(preview.employee.grossFeeBaseCents, locale)],
    [tr("大费工资"), money(preview.employee.totalLargeFeeWageCents, locale)],
    [tr("小费"), money(preview.employee.totalTipCents, locale)],
    [tr("应提交现金"), money(preview.employee.cashToSubmitToStoreCents, locale)],
  ];
  const columns = landscape ? 4 : 2;
  const gap = 10 * scale;
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
  const cardHeight = (landscape ? 56 : 72) * scale;
  metrics.forEach(([label, value], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);
    fillRoundedRect(context, x, cardY, cardWidth, cardHeight, 15 * scale, "rgba(255,255,255,0.84)");
    context.fillStyle = "#756b62";
    context.font = `700 ${Math.round(11 * scale)}px ${imageFont}`;
    context.fillText(label, x + 13 * scale, cardY + 21 * scale);
    context.fillStyle = "#211d18";
    context.font = `900 ${Math.round((landscape ? 15 : 17) * scale)}px ${imageFont}`;
    context.fillText(value, x + 13 * scale, cardY + (landscape ? 44 : 51) * scale, cardWidth - 26 * scale);
  });
  y += Math.ceil(metrics.length / columns) * (cardHeight + gap);

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

export function EmployeeClosingSummary({ preview }: EmployeeClosingSummaryProps) {
  const { locale, t } = useLanguage();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedClosingImage | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");

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
      setImageMessage(`已按当前设备屏幕生成 ${next.width} × ${next.height} PNG`);
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

  const employee = preview.employee;
  return (
    <section className="employee-closing-card" aria-label={`${employee.displayName}个人日结`}>
      <header className="employee-closing-hero">
        <div className="employee-closing-heading">
          <p className="eyebrow">{preview.storeName} · {localizedDate(preview.businessDate, locale)}</p>
          <h2>{employee.displayName}的个人日结</h2>
          <span className={`employee-closing-status ${preview.hasWarnings ? "warning" : "ready"}`}>
            {preview.isClosed
              ? `营业日已日结${preview.activeClosing ? ` · 第 ${preview.activeClosing.cycleNo} 次` : ""}`
              : preview.hasWarnings
                ? `${preview.warningCount} 项需要核对`
                : "个人记录已完整"}
          </span>
        </div>
        <div className="employee-closing-overview">
          <div className="employee-closing-income"><span>今日总收入</span><strong>{money(employee.employeeIncomeCents)}</strong><small>大费工资＋小费</small></div>
          <section className="employee-closing-dividends" aria-labelledby="employee-closing-dividends-title">
            <div className="employee-closing-dividends-heading">
              <h3 id="employee-closing-dividends-title">已确认收入分配</h3>
              <small>按现金／非现金拆分，待结账记录暂不计入</small>
            </div>
            <div className="employee-closing-dividend-grid">
              <article className="cash"><span>现金大费分红</span><strong>{money(employee.cashLargeFeeDividendCents)}</strong><small>现金付款对应的大费工资</small></article>
              <article className="cash"><span>现金小费分红</span><strong>{money(employee.cashTipDividendCents)}</strong><small>已确认现金小费</small></article>
              <article className="card"><span>刷卡／礼物卡大费分红</span><strong>{money(employee.cardLargeFeeDividendCents)}</strong><small>非现金付款对应的大费工资</small></article>
              <article className="card"><span>刷卡／礼物卡小费分红</span><strong>{money(employee.cardTipDividendCents)}</strong><small>已确认非现金小费</small></article>
            </div>
          </section>
        </div>
      </header>

      <div className="employee-closing-breakdown">
        <section aria-labelledby="employee-closing-income-title">
          <h3 id="employee-closing-income-title">收入基础</h3>
          <div className="employee-closing-metrics">
            <article><span>大费基数</span><strong>{money(employee.grossFeeBaseCents)}</strong><small>主要项目＋加项</small></article>
            <article className="income"><span>大费工资</span><strong>{money(employee.totalLargeFeeWageCents)}</strong><small>全部项目提成合计</small></article>
            <article><span>小费</span><strong>{money(employee.totalTipCents)}</strong><small>现金＋刷卡＋礼物卡小费</small></article>
          </div>
        </section>
        <section className="employee-closing-handoff" aria-labelledby="employee-closing-settlement-title">
          <div><h3 id="employee-closing-settlement-title">现金交接</h3><p>这笔金额是员工需要交给店铺的现金，不属于收入分红。</p></div>
          <article><span>应提交现金</span><strong>{money(employee.cashToSubmitToStoreCents)}</strong><small>所有含现金大费的已确认项目，按折前大费基数 × 40%</small></article>
        </section>
      </div>

      {preview.warnings.length > 0 ? (
        <section className="employee-closing-warnings" aria-label="个人日结待核对项目">
          <strong>请先核对</strong>
          <div>{preview.warnings.map((warning) => <span key={warning.code}>{warning.labelZh}<b>{warning.count} 条</b></span>)}</div>
        </section>
      ) : <p className="employee-closing-complete">✓ 当前个人记录没有待结账或异常提示</p>}

      <div className="employee-closing-image-actions">
        <button className="primary-action" type="button" disabled={generating} onClick={() => void createImage()}>{generating ? "正在生成…" : generated ? "重新生成图片" : "生成日结图片"}</button>
        {generated && <button className="secondary-action" type="button" onClick={() => void saveImage()}>保存到相册 / 分享</button>}
      </div>
      {imageMessage && <p className="employee-closing-image-message" role="status">{imageMessage}</p>}
      {imageError && <p className="form-error" role="alert">{imageError}</p>}
      {generated && <figure className="employee-closing-image-preview"><img src={generated.url} alt={`${employee.displayName}的个人日结图片预览`} /><figcaption>图片比例与当前设备屏幕一致；手机可通过系统分享菜单保存到相册。</figcaption></figure>}
    </section>
  );
}

export function EmployeeClosingModal({
  storeId,
  businessDate,
  membershipId,
  displayName,
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
        {preview && <EmployeeClosingSummary preview={preview} />}
      </section>
    </div>
  );
}
