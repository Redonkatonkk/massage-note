"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import type { EmployeeClosingPreview } from "../lib/types";

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

function money(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function chineseDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
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
): Promise<GeneratedClosingImage> {
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
  context.fillText(`${preview.storeName} · 个人日结`, margin, y + 12 * scale, contentWidth);
  y += 32 * scale;

  context.fillStyle = "#211d18";
  context.font = `900 ${Math.round((landscape ? 25 : 30) * scale)}px ${imageFont}`;
  context.fillText(preview.employee.displayName, margin, y + 29 * scale, contentWidth);
  y += 42 * scale;
  context.fillStyle = "#6b635a";
  context.font = `600 ${Math.round(14 * scale)}px ${imageFont}`;
  context.fillText(chineseDate(preview.businessDate), margin, y + 14 * scale, contentWidth);
  y += 30 * scale;

  const statusText = preview.isClosed
    ? `营业日已日结${preview.activeClosing ? ` · 第 ${preview.activeClosing.cycleNo} 次` : ""}`
    : preview.hasWarnings
      ? `${preview.warningCount} 项需要核对`
      : "个人记录已完整";
  const statusColor = preview.isClosed ? "#176b45" : preview.hasWarnings ? "#9a5a0c" : "#176b45";
  const statusBackground = preview.isClosed ? "#e7f5ed" : preview.hasWarnings ? "#fff0d8" : "#e7f5ed";
  context.font = `800 ${Math.round(12 * scale)}px ${imageFont}`;
  const statusWidth = Math.min(contentWidth, context.measureText(statusText).width + 24 * scale);
  fillRoundedRect(context, margin, y, statusWidth, 30 * scale, 15 * scale, statusBackground);
  context.fillStyle = statusColor;
  context.fillText(statusText, margin + 12 * scale, y + 20 * scale, statusWidth - 24 * scale);
  y += 42 * scale;

  const heroHeight = (landscape ? 74 : 112) * scale;
  fillRoundedRect(context, margin, y, contentWidth, heroHeight, 22 * scale, "#8e3e2f");
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.font = `700 ${Math.round(13 * scale)}px ${imageFont}`;
  context.fillText("今日总收入", margin + 20 * scale, y + 27 * scale);
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round((landscape ? 27 : 36) * scale)}px ${imageFont}`;
  context.fillText(money(preview.employee.employeeIncomeCents), margin + 20 * scale, y + (landscape ? 61 : 78) * scale, contentWidth - 40 * scale);
  if (!landscape) {
    context.fillStyle = "rgba(255,255,255,0.72)";
    context.font = `600 ${Math.round(12 * scale)}px ${imageFont}`;
    context.fillText(
      `大费工资 ${money(preview.employee.totalLargeFeeWageCents)} ＋ 小费 ${money(preview.employee.totalTipCents)}`,
      margin + 20 * scale,
      y + 98 * scale,
    );
  }
  y += heroHeight + 14 * scale;

  const metrics: Array<[string, string]> = [
    ["记工单数", `${preview.employee.recordCount} 单`],
    ["大费基数", money(preview.employee.grossFeeBaseCents)],
    ["应提交现金", money(preview.employee.cashToSubmitToStoreCents)],
    ["折后大费", money(preview.employee.discountedFeePerformanceCents)],
    ["小费", money(preview.employee.totalTipCents)],
    ["大费工资", money(preview.employee.totalLargeFeeWageCents)],
  ];
  const columns = landscape ? 3 : 2;
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
    context.fillText("待核对", margin + 13 * scale, y + 20 * scale);
    context.font = `700 ${Math.round(10 * scale)}px ${imageFont}`;
    preview.warnings.slice(0, landscape ? 2 : 4).forEach((warning, index) => {
      context.fillText(
        `${warning.labelZh} ${warning.count} 条`,
        margin + 13 * scale,
        y + (39 + index * 17) * scale,
      );
    });
  }

  context.fillStyle = "#756b62";
  context.font = `600 ${Math.round(10 * scale)}px ${imageFont}`;
  context.textAlign = "left";
  context.fillText("Massage note · 数据以系统保存的营业日快照为准", margin, footerY, contentWidth);

  const blob = await canvasBlob(canvas);
  return {
    blob,
    fileName: `个人日结-${preview.employee.displayName.replace(/[\\/:*?"<>|]/g, "-")}-${preview.businessDate}.png`,
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
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedClosingImage | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => () => {
    if (generated) URL.revokeObjectURL(generated.url);
  }, [generated]);

  async function createImage() {
    setGenerating(true);
    setImageError("");
    setImageMessage("");
    try {
      const next = await generateClosingImage(preview);
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
          title: `${preview.employee.displayName} ${preview.businessDate} 个人日结`,
          text: "个人日结图片",
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
        <div>
          <p className="eyebrow">{preview.storeName} · {chineseDate(preview.businessDate)}</p>
          <h2>{employee.displayName}的个人日结</h2>
          <span className={`employee-closing-status ${preview.hasWarnings ? "warning" : "ready"}`}>
            {preview.isClosed
              ? `营业日已日结${preview.activeClosing ? ` · 第 ${preview.activeClosing.cycleNo} 次` : ""}`
              : preview.hasWarnings
                ? `${preview.warningCount} 项需要核对`
                : "个人记录已完整"}
          </span>
        </div>
        <div className="employee-closing-income"><span>今日总收入</span><strong>{money(employee.employeeIncomeCents)}</strong><small>大费工资＋小费</small></div>
      </header>

      <div className="employee-closing-metrics">
        <article><span>记工单数</span><strong>{employee.recordCount} 单</strong><small>{employee.incompleteRecordCount > 0 ? `${employee.incompleteRecordCount} 单待结账` : "全部已确认"}</small></article>
        <article><span>大费基数</span><strong>{money(employee.grossFeeBaseCents)}</strong><small>主要项目＋加项</small></article>
        <article><span>应提交现金</span><strong>{money(employee.cashToSubmitToStoreCents)}</strong><small>现金大费项目折前基数 × 40%</small></article>
        <article className="highlight"><span>折后大费</span><strong>{money(employee.discountedFeePerformanceCents)}</strong><small>折扣后店铺业绩</small></article>
        <article><span>小费</span><strong>{money(employee.totalTipCents)}</strong><small>现金＋刷卡小费</small></article>
        <article className="income"><span>大费工资</span><strong>{money(employee.totalLargeFeeWageCents)}</strong><small>项目提成合计</small></article>
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
