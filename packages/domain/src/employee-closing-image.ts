import { imageTheme as theme, imageTextUnits as units, imageTextLines as textLines, imageLineHeight as textHeight, imageDivider as divider } from "./image-layout.js";
import { escapeImageXml, type ImageLocale } from "./image-format.js";
import { createEmployeeClosingTemplate, type ClosingSnapshot, type ClosingPaymentPart, type EmployeeClosingTemplate } from "./employee-closing-template.js";
export type { ClosingSnapshot } from "./employee-closing-template.js";

// Three source pixels per CSS pixel at the shared 390px phone template width.
const WIDTH = 1170, MARGIN = 48, GAP = 30, PADDING = 36;
const INNER = WIDTH - MARGIN * 2, CARD_WIDTH = (INNER - GAP) / 2;
type Section = { height: number; svg: string };
const text = (...args: Parameters<typeof textLines>) => textLines(...args).replace("<text ", `<text font-size="${args[2]}" `);

function surface(x: number, y: number, width: number, height: number, kind: string, fill = theme.surface, stroke = theme.line, radius = 30) {
  return `<rect data-card-kind="${kind}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

function flow(x: number, top: number, width: number) {
  let cursor = top;
  const parts: string[] = [];
  return {
    parts, get cursor() { return cursor; },
    line(value: string, size: number, className: string, height = size + 12, gap = 12) {
      parts.push(text(value, width, size, x, cursor + size, className, height));
      cursor += textHeight(value, width, size, height) + gap;
    },
    rule() { cursor += 12; parts.push(divider(x, cursor, width)); cursor += 24; },
    amount(label: string, value: string, className: string, size = 42) {
      const valueWidth = units(value) * size;
      if (units(label) * 36 + valueWidth + 24 <= width) {
        parts.push(text(label, width - valueWidth - 24, 36, x, cursor + size, "note", 48));
        parts.push(text(value, valueWidth + 1, size, x + width, cursor + size, className, size + 12, "end"));
        cursor += size + 24;
      } else {
        this.line(label, 36, "note", 48, 6);
        parts.push(text(value, width, size, x + width, cursor + size, className, size + 12, "end"));
        cursor += textHeight(value, width, size, size + 12) + 12;
      }
    },
    payments(label: string, paymentParts: ClosingPaymentPart[]) {
      const labelWidth = Math.min(width * .25, units(label) * 36);
      const paymentWidth = width - labelWidth - 15;
      parts.push(text(label, labelWidth, 36, x, cursor + 39, "payment-label", 48));
      let offset = 0, rowHeight = textHeight(label, labelWidth, 36, 48) + 12;
      for (const [index, part] of paymentParts.entries()) {
        const padding = part.method === "card" || part.method === "gift" ? 12 : 0;
        const partWidth = Math.min(paymentWidth, units(part.text) * 36 + padding * 2 + 2);
        const partHeight = textHeight(part.text, partWidth - padding * 2, 36, 48) + 12;
        const separatorWidth = index > 0 ? 42 : 0;
        if (offset && offset + separatorWidth + partWidth > paymentWidth) { cursor += rowHeight + 9; offset = 0; rowHeight = 0; }
        if (index > 0 && offset) { parts.push(text("＋", 36, 36, x + labelWidth + 15 + offset, cursor + 39, "note", 48)); offset += separatorWidth; }
        const boxX = x + labelWidth + 15 + offset;
        if (part.method === "card" || part.method === "gift") parts.push(`<rect data-payment-method="${part.method}" x="${boxX}" y="${cursor}" width="${partWidth}" height="${partHeight}" rx="9" fill="${part.method === "gift" ? theme.brandSoft : theme.surface}"${part.method === "card" ? ` stroke="${theme.ink}" stroke-width="3"` : ""}/>`);
        parts.push(text(part.text, partWidth - padding * 2, 36, boxX + padding, cursor + 39, `payment-detail payment-${part.method}`, 48));
        offset += partWidth + 12; rowHeight = Math.max(rowHeight, partHeight);
      }
      cursor += rowHeight + 12;
    },
  };
}

function summary(top: number, model: EmployeeClosingTemplate): Section {
  const x = MARGIN + PADDING, width = INNER - PADDING * 2;
  const block = flow(x, top + PADDING, width);
  block.line(`${model.labels.income} · ${model.labels.currency}`, 42, "income-label", 54, 9);
  block.line(model.income, 108, "primary-amount", 126, 18);
  block.line(`${model.labels.serviceWages} ${model.serviceWages} ＋ ${model.labels.tips} ${model.tips}`, 39, "note", 51, 9);
  block.rule();
  let cursor = block.cursor;
  const widths = [width * .36, width * .32, width * .32];
  const xs = [x, x + widths[0]! + widths[1]!, x + width];
  const row = (values: string[], heading: boolean) => {
    const heights = values.map((value, i) => textHeight(value, widths[i]! - 18, 39, 51));
    values.forEach((value, i) => block.parts.push(text(value, widths[i]! - 18, 39, xs[i]!, cursor + 39, heading ? "source-heading" : i === 0 ? "source-label" : "amount source-amount", 51, i === 0 ? "start" : "end")));
    cursor += Math.max(...heights) + 15;
  };
  row([model.labels.source, model.labels.serviceWages, model.labels.tips], true);
  model.sources.forEach(source => row([source.label, source.wages, source.tips], false));
  const height = cursor - top + PADDING - 12;
  return { height, svg: surface(MARGIN, top, INNER, height, "income") + block.parts.join("") };
}

function recordCard(x: number, top: number, model: EmployeeClosingTemplate, record: EmployeeClosingTemplate["records"][number]): Section {
  const width = CARD_WIDTH - PADDING * 2;
  const block = flow(x + PADDING, top + PADDING, width);
  const badges = [
    ...(record.addon ? [{ value: "＋", className: "addon", fill: theme.brandSoft, width: 60 }] : []),
    ...(record.discount ? [{ value: record.discount, className: "discount", fill: theme.danger, width: units(record.discount) * 36 + 24 }] : []),
  ];
  const badgeWidth = Math.min(width * .5, badges.reduce((sum, badge) => sum + badge.width + 12, -12));
  const titleWidth = width - (badges.length ? badgeWidth + 18 : 0);
  const titleHeight = textHeight(record.title, titleWidth, 45, 57);
  block.parts.push(text(record.title, titleWidth, 45, x + PADDING, block.cursor + 45, "record-title", 57));
  let badgeHeight = 0, badgeOffset = 0, badgeRowHeight = 0;
  for (const badge of badges) {
    const badgeSize = Math.min(badgeWidth, badge.width);
    const badgeItemHeight = textHeight(badge.value, badgeSize - 12, 36, 48) + 12;
    if (badgeOffset && badgeOffset + badgeSize > badgeWidth) { badgeHeight += badgeRowHeight + 12; badgeOffset = 0; badgeRowHeight = 0; }
    const badgeX = x + PADDING + width - badgeWidth + badgeOffset;
    const badgeY = block.cursor + badgeHeight;
    block.parts.push(`<rect x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeItemHeight}" rx="${badge.className === "discount" ? 12 : 30}" fill="${badge.fill}"/>`);
    block.parts.push(text(badge.value, badgeSize - 12, 36, badgeX + 6, badgeY + 39, badge.className, 48));
    badgeOffset += badgeSize + 12; badgeRowHeight = Math.max(badgeRowHeight, badgeItemHeight);
  }
  badgeHeight += badgeRowHeight;
  const body = flow(x + PADDING, top + PADDING + Math.max(titleHeight, badgeHeight) + 12, width);
  body.line(record.time, 36, "record-meta", 48, 6);
  if (record.addon) body.line(record.addon, 36, "note", 48, 6);
  if (record.pending) body.line(record.pendingText, 36, "pending-note", 48, 6);
  body.amount(model.labels.gross, record.gross, "amount record-gross", 57);
  body.payments(model.labels.received, record.service);
  body.payments(model.labels.tips, record.tips);
  body.rule();
  body.amount(model.labels.recordIncome, record.income, "amount record-income");
  const height = body.cursor - top + PADDING - 12;
  const fill = record.pending ? theme.pending : record.highlighted ? theme.highlight : theme.surface;
  const stroke = record.pending ? theme.pendingLine : record.highlighted ? theme.highlightLine : theme.line;
  return { height, svg: surface(x, top, CARD_WIDTH, height, "record", fill, stroke, 18) + block.parts.join("") + body.parts.join("") };
}

/** The same content and two-column record cards as the employee closing page. */
export function createEmployeeClosingSvg(snapshot: ClosingSnapshot, locale: ImageLocale) {
  const model = createEmployeeClosingTemplate(snapshot, locale);
  const content: string[] = [];
  const header = flow(MARGIN, MARGIN, INNER);
  header.line(model.store, 39, "store", 51, 12);
  header.line(model.title, 60, "employee-name", 75, 12);
  header.line(`${model.date} · ${model.state}`, 39, "date closing-state", 51, 0);
  content.push(header.parts.join(""));
  let cursor = header.cursor + 48;
  const income = summary(cursor, model);
  content.push(income.svg); cursor += income.height + 48;
  const heading = flow(MARGIN, cursor, INNER);
  heading.line(`${model.labels.records} · ${model.labels.count}`, 42, "section-title", 54, 0);
  content.push(heading.parts.join("")); cursor = heading.cursor + 24;
  for (let index = 0; index < model.records.length; index += 2) {
    const row = model.records.slice(index, index + 2).map((record, col) => recordCard(MARGIN + col * (CARD_WIDTH + GAP), cursor, model, record));
    content.push(...row.map(card => card.svg)); cursor += Math.max(...row.map(card => card.height)) + GAP;
  }
  if (!model.records.length) {
    const empty = flow(MARGIN + PADDING, cursor + PADDING, INNER - PADDING * 2);
    empty.line(model.labels.empty, 42, "note", 54, 0);
    const height = empty.cursor - cursor + PADDING;
    content.push(surface(MARGIN, cursor, INNER, height, "empty") + empty.parts.join("")); cursor += height + GAP;
  }
  const footer = flow(MARGIN, cursor + 18, INNER);
  footer.line(model.labels.legend, 36, "footer", 48, 6);
  footer.line(model.labels.footer, 36, "footer", 48, 0);
  content.push(footer.parts.join(""));
  const height = Math.ceil(footer.cursor + MARGIN);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeImageXml(model.title)}" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><defs><style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;fill:${theme.ink};font-weight:400}.store,.date,.note,.record-meta,.source-heading,.payment-label,.footer{fill:${theme.muted}}.primary-amount{font-weight:600;fill:${theme.brand}}.employee-name,.section-title,.record-title,.record-gross{font-weight:600}.amount,.payment-detail,.primary-amount{font-variant-numeric:tabular-nums lining-nums}.record-income{font-weight:500}.discount{fill:${theme.surface}}.addon,.payment-gift{fill:${theme.brand}}.pending-note{fill:${theme.pendingInk}}</style></defs><rect x="0" y="0" width="${WIDTH}" height="${height}" fill="${theme.page}"/><g>${content.join("")}</g></svg>`;
  return { width: WIDTH, height, svg };
}
