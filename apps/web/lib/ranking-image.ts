/** Wrap by Unicode code point so Chinese and long names cannot overflow. */
export function wrapImageText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const character of paragraph) {
      if (line && measure(line + character) > maxWidth) {
        lines.push(line);
        line = character;
      } else line += character;
    }
    lines.push(line);
  }
  return lines;
}

export async function saveRankingImage(title: string, content: string, date: string) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const font = '20px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.font = font;
  const lines = wrapImageText(content, 640, (value) => ctx.measureText(value).width);
  // Bound canvas dimensions on mobile; unusually long explanations become numbered images.
  const pageSize = 200;
  const pages = Math.max(1, Math.ceil(lines.length / pageSize));
  const files: { blob: Blob; name: string }[] = [];
  for (let page = 0; page < pages; page++) {
    const pageLines = lines.slice(page * pageSize, (page + 1) * pageSize);
    const height = 120 + pageLines.length * 32;
    canvas.width = 1080;
    canvas.height = Math.ceil(height * 1.5);
    ctx.scale(1.5, 1.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 720, height);
    ctx.fillStyle = "#262626";
    ctx.font = `bold ${font}`;
    ctx.fillText(`${title}${pages > 1 ? ` (${page + 1}/${pages})` : ""}`, 40, 48);
    ctx.fillStyle = "#c8783c";
    ctx.fillRect(40, 66, 640, 2);
    ctx.fillStyle = "#262626";
    ctx.font = font;
    pageLines.forEach((line, index) => ctx.fillText(line, 40, 104 + index * 32));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image export failed")), "image/png"));
    files.push({ blob, name: `ranking-${date}${pages > 1 ? `-${page + 1}` : ""}.png` });
  }
  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
