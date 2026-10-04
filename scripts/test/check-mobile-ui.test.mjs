import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { checkMobileUi, stylesAtWidth } from "../check-mobile-ui.mjs";
import { uiStyleFiles } from "../check-ui-styles.mjs";

test("mobile cascade includes matching ranges and resolves chained root tokens", () => {
  const sources = [{ name: "fixture.css", css: `
    :root { --base: #fff; --surface: var(--base); }
    .card { background: var(--surface); }
    @media (max-width: 480px) { .small { display: grid; } }
    @media (min-width: 600px) and (max-width: 900px) { .landscape { display: flex; } }
    @media (min-width: 1200px) { .desktop { display: flex; } }
    @container summary (min-width: 480px) { .container { display: flex; } }
    @keyframes spin { to { transform: rotate(360deg); } }
  ` }];
  const portrait = stylesAtWidth(sources, 390);
  assert.match(portrait, /background: #fff/);
  assert.match(portrait, /\.small/);
  assert.doesNotMatch(portrait, /\.landscape|\.desktop|\.container|rotate/);
  assert.match(stylesAtWidth(sources, 760), /\.landscape/);
  assert.doesNotMatch(stylesAtWidth(sources, 760), /\.small/);
});

test("mobile checks reject layout and control regressions even when colors use tokens", async () => {
  const sources = await Promise.all(uiStyleFiles.map(async (name) => ({
    name, css: await readFile(resolve(import.meta.dirname, "../../apps/web/app", name), "utf8"),
  })));
  const issues = checkMobileUi([...sources, { name: "regression.css", css: `
    @media (max-width: 600px) {
      .board-store-projects { grid-template-columns: 1fr 1fr !important; }
      .section-tabs button { border-radius: var(--radius-control); }
      .settlement-preview-compact .settlement-payment-amounts { grid-template-columns: repeat(3, 1fr); }
      .settlement-preview-compact .employee-settlement-send-actions > button { min-height: 38px; }
      .member-settings-grid > label { flex-direction: row; }
      .members-search input:not([type="checkbox"]):not([type="radio"]) { font-size: 13px; }
    }
  ` }], [390]);
  for (const selector of [".board-store-projects", ".section-tabs button", ".settlement-payment-amounts", ".employee-settlement-send-actions button", ".member-settings-grid label", "成员目录 input"]) {
    assert.ok(issues.some((issue) => issue.includes(selector)), `Did not detect regression: ${selector}`);
  }
});
