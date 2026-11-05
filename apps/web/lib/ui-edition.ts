export type UiEdition = "legacy" | "new";

export const UI_EDITION_COOKIE = "massage_note_ui_edition";

export function parseUiEdition(value: string | null | undefined): UiEdition {
  return value === "new" ? "new" : "legacy";
}

export function readUiEdition(cookie: string): UiEdition {
  const value = cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${UI_EDITION_COOKIE}=`));
  return parseUiEdition(value?.slice(UI_EDITION_COOKIE.length + 1));
}
