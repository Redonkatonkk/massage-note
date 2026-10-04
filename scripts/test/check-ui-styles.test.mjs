import assert from "node:assert/strict";
import test from "node:test";
import { checkUiStyles } from "../check-ui-styles.mjs";

const check = (css) => checkUiStyles([{ name: "fixture.css", css }]);

test("shared tokens allow semantic states, round markers and compact radii", () => {
  assert.deepEqual(check(`
    :root { --surface: #fff; --radius-panel: 10px; }
    .board-panel { background: var(--surface); border-radius: var(--radius-panel); }
    .record-card--highlighted:hover { background: var(--highlight); }
    .badge { border-radius: 999px; }
    .dot { border-radius: 50%; }
    .calendar-marker { border-radius: 4px; }
  `), []);
});

test("responsive overrides cannot introduce a second palette or large radius", () => {
  const issues = check(`@media (max-width: 600px) {
    .record-card { background: #fff3ae; border-radius: 14px; }
  }`);
  assert.equal(issues.length, 2);
  assert.match(issues[0], /colors belong to :root/);
  assert.match(issues[1], /shared radius token/);
});

test("board modules cannot override the shared frame even with valid tokens", () => {
  const issues = check(".lost-customers { background: var(--surface-soft); }");
  assert.equal(issues.length, 1);
  assert.match(issues[0], /board frames belong to .board-panel/);
});

test("literal colors in focus rings and shadows also need a token", () => {
  assert.equal(check(".input:focus { box-shadow: 0 0 0 3px rgba(120, 80, 20, .2); }").length, 1);
});
