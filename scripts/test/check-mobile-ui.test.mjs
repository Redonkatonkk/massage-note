import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
      .analytics-hero, .analytics-overview__metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .analytics-grid > .analytics-income-bars { contain: size; overflow-y: auto; }
    }
  ` }], [390]);
  for (const selector of [".board-store-projects", ".section-tabs button", ".settlement-payment-amounts", ".employee-settlement-send-actions button", ".member-settings-grid label", "成员目录 input", ".analytics-hero", ".analytics-overview__metrics", ".analytics-grid > .analytics-income-bars"]) {
    assert.ok(issues.some((issue) => issue.includes(selector)), `Did not detect regression: ${selector}`);
  }
});

test("monthly finance preserves desktop proportions and labeled mobile comparison records", async () => {
  const { JSDOM } = createRequire(resolve(import.meta.dirname, "../../apps/web/package.json"))("jsdom");
  const sources = await Promise.all(uiStyleFiles.map(async name => ({ name, css: await readFile(resolve(import.meta.dirname, "../../apps/web/app", name), "utf8") })));
  for (const width of [320, 599, 600, 1099, 1100, 1440]) {
    const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style><section class="monthly-finance"><div class="monthly-finance__metrics"></div><div class="monthly-finance__hero"></div><section class="monthly-finance__comparison"><table><thead><tr><th>Metric</th><th>2026-10</th><th>2026-09</th><th>2026-08</th></tr></thead><tbody><tr><th>Long metric name / 月度指标</th><td data-label="2026-10 (01–22)">US$123,456,789.12</td><td data-label="2026-09 (01–22)">US$123,456.78</td><td data-label="2026-08 (01–22)">US$123.45</td></tr></tbody></table></section></section>`);
    try {
      const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      assert.equal(style(".monthly-finance__metrics").gridTemplateColumns, width < 600 ? "minmax(0, 1fr)" : `repeat(${width < 1100 ? 2 : 4}, minmax(0, 1fr))`);
      assert.equal(style(".monthly-finance__hero").gridTemplateColumns, width < 1100 ? "minmax(0, 1fr)" : "minmax(0, 1.8fr) minmax(0, 1fr)");
      assert.equal(style(".monthly-finance").gridTemplateColumns, "minmax(0, 1fr)");
      assert.equal(dom.window.document.querySelector(".monthly-finance__comparison").parentElement.className, "monthly-finance");
      assert.equal(style("thead").display, width < 600 ? "none" : "table-header-group");
      assert.equal(style("tbody tr").display, width < 600 ? "grid" : "table-row");
      assert.equal(style("td").overflowWrap, "anywhere");
      assert.equal(dom.window.document.querySelector("td").getAttribute("data-label"), "2026-10 (01–22)");
    } finally { dom.window.close(); }
  }
});

test("analytics overview breakpoints and main chart proportions preserve natural row heights", async () => {
  const { JSDOM } = createRequire(resolve(import.meta.dirname, "../../apps/web/package.json"))("jsdom");
  const sources = await Promise.all(uiStyleFiles.map(async name => ({ name, css: await readFile(resolve(import.meta.dirname, "../../apps/web/app", name), "utf8") })));
  for (const width of [320, 599, 600, 1099, 1100, 1440]) {
    const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style><section class="analytics-panel"><dl class="analytics-overview__metrics"></dl><div class="analytics-hero"><section class="analytics-card analytics-average-revenue"></section><section class="analytics-card analytics-revenue-calendar"></section></div><div class="analytics-grid"><section class="analytics-card analytics-weekday-revenue"></section><section class="analytics-card analytics-income-bars"><p class="analytics-income-scroll-hint"></p></section><section class="analytics-card analytics-daily-revenue"></section><section class="analytics-card analytics-heatmap"></section></div></section>`);
    try {
      const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      const columns = width < 600 ? "minmax(0, 1fr)" : `repeat(${width < 1100 ? 2 : 4}, minmax(0, 1fr))`;
      assert.equal(style(".analytics-overview__metrics").gridTemplateColumns, columns, `${width}px overview`);
      assert.equal(style(".analytics-hero").gridTemplateColumns, width < 1100 ? "minmax(0, 1fr)" : "minmax(0, 3fr) minmax(0, 2fr)", `${width}px main charts`);
      assert.equal(style(".analytics-hero").alignItems, "stretch");
      assert.ok(["", "auto"].includes(style(".analytics-grid").gridAutoRows));
      assert.ok(["", "auto"].includes(style(".analytics-card").height));
      assert.ok((width >= 1100 ? ["size"] : ["", "none"]).includes(style(".analytics-income-bars").contain));
      assert.ok((width >= 1100 ? ["auto"] : ["", "visible"]).includes(style(".analytics-income-bars").overflowY));
      assert.equal(style(".analytics-income-scroll-hint").display, width >= 1100 ? "block" : "none");
      assert.ok(["", "none"].includes(style(".analytics-weekday-revenue").contain));
      if (width >= 1100) {
        assert.equal(style(".analytics-daily-revenue").gridColumn, "1 / -1");
        assert.equal(style(".analytics-heatmap").gridColumn, "1 / -1");
        assert.equal(style(".analytics-average-revenue").gridColumn, "");
      }
    } finally { dom.window.close(); }
  }
});

test("trend cards keep semantic directions and complete amounts and periods on phones", async () => {
  const { JSDOM } = createRequire(resolve(import.meta.dirname, "../../apps/web/package.json"))("jsdom");
  const sources = await Promise.all(uiStyleFiles.map(async name => ({ name, css: await readFile(resolve(import.meta.dirname, "../../apps/web/app", name), "utf8") })));
  const cards = ["UP", "DOWN", "FLAT"].map(direction => `<div class="analytics-overview__metric"><dd class="analytics-overview__change" data-direction="${direction}">↑ 123,456.7%</dd><dd class="analytics-overview__value"><strong>-US$123,456,789.12</strong></dd><dd class="analytics-overview__periods">2026-09-08 — 2026-10-07 · 20/30 closed days</dd></div>`).join("");
  for (const width of [320, 600, 1100]) {
    const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style><dl class="analytics-overview__metrics">${cards}</dl>`);
    try {
      const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      assert.notEqual(style('[data-direction="UP"]').color, style('[data-direction="DOWN"]').color);
      assert.notEqual(style('[data-direction="FLAT"]').color, style('[data-direction="DOWN"]').color);
      for (const selector of [".analytics-overview__value", ".analytics-overview__periods"]) {
        assert.equal(style(selector).overflowWrap, "anywhere");
        assert.ok(["", "normal"].includes(style(selector).whiteSpace));
        assert.ok(["", "auto"].includes(style(selector).height));
        assert.notEqual(style(selector).overflow, "hidden");
      }
    } finally { dom.window.close(); }
  }
});
