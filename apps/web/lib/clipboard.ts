export async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch { /* Older browsers may still allow copying with a selected field. */ }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.setAttribute("readonly", "");
  document.body.append(field);
  const previous = document.activeElement;
  try {
    field.select();
    if (document.execCommand?.("copy")) return;
    throw new Error("自动复制失败，请选中下方分享内容手动复制。");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus();
  }
}
