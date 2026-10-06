import { escapeImageXml as escapeXml } from "./image-format.js";

// Exported images use the same semantic palette and panel radius as globals.css.
// Keep these values in sync: the domain renderer also runs outside the Web app.
export const imageTheme = {
  page: "#f4f5f3", surface: "#ffffff", ink: "#242c28",
  muted: "#626c65", line: "#dfe4df", brand: "#315b49", radius: 10,
};

export function imageTextUnits(value: string) {
  return [...value].reduce((sum, character) => sum + (
    /[\u3400-\u9fff\uff00-\uffef]|\p{Extended_Pictographic}/u.test(character) ? 1
      : /[MWmw@%]/u.test(character) ? .9 : /[A-Z]/u.test(character) ? .75 : .62
  ), 0);
}

export function wrapImageText(value: string, maxUnits: number) {
  const tokens = value.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|\s+/gu) ?? [value];
  const lines: string[] = [];
  let line = "";
  let units = 0;
  const pushLine = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
    units = 0;
  };
  for (const token of tokens) {
    const tokenUnits = imageTextUnits(token);
    if (tokenUnits <= maxUnits) {
      if (units + tokenUnits > maxUnits && line.trim()) pushLine();
      line += token;
      units += tokenUnits;
      continue;
    }
    for (const character of token) {
      const characterUnits = imageTextUnits(character);
      if (units + characterUnits > maxUnits && line.trim()) pushLine();
      line += character;
      units += characterUnits;
    }
  }
  pushLine();
  return lines.length ? lines : [""];
}

export function imageTextLines(value: string, width: number, fontSize: number, x: number, y: number, className: string, lineHeight: number, anchor = "start") {
  const lines = wrapImageText(value, width / fontSize);
  return `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}"${lines.length > 1 ? ` aria-label="${escapeXml(value)}"` : ""}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

export const imageLineHeight = (value: string, width: number, fontSize: number, lineHeight: number) => wrapImageText(value, width / fontSize).length * lineHeight;
export const imagePanel = (x: number, y: number, width: number, height: number, kind = "") => `<rect${kind ? ` data-card-kind="${kind}"` : ""} x="${x}" y="${y}" width="${width}" height="${height}" rx="${imageTheme.radius}" fill="${imageTheme.surface}" stroke="${imageTheme.line}"/>`;
export const imageDivider = (x: number, y: number, width: number) => `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${imageTheme.line}"/>`;
