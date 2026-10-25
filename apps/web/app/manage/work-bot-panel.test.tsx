// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { LOCALE_STORAGE_KEY, type AppLocale } from "../../lib/i18n";
import type { CatalogResponse, WorkBotSettings } from "../../lib/types";
import { LanguageProvider } from "../language-provider";
import { WorkBotPanel } from "./work-bot-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;
let confirm: ReturnType<typeof vi.spyOn>;
const timestamp = "2026-10-22T14:30:00.000Z";
const catalog: CatalogResponse = {
  serviceItems: [{ id: "service", position: 0, fullName: "Deep Tissue", shortName: "Deep", priceOptions: [
    { id: "price-60", durationMinutes: 60, priceCents: 8000, position: 0 },
    { id: "price-90", durationMinutes: 90, priceCents: 12000, position: 1 },
  ], defaultCommissionBps: null, isEnabled: true, deletedAt: null, version: 1 }],
  addonItems: [], discountItems: [],
};
let root: Root;
let container: HTMLDivElement;
let settings: WorkBotSettings;
let busy: boolean;
let reload: ReturnType<typeof vi.fn<() => Promise<void>>>;

function element(locale: AppLocale) {
  return createElement(LanguageProvider, { initialLocale: locale, children: createElement(WorkBotPanel, {
    storeId: "store", catalog, settings, busy, run: async action => action(), reload,
  }) });
}
async function render(locale: AppLocale = "en-US") { await act(async () => root.render(element(locale))); }
function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find(node => node.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function edit(value: string) {
  await act(async () => {
    const input = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  request.mockReset();
  confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  busy = false;
  reload = vi.fn(async () => {});
  settings = {
    instructions: "保存说明", instructionsVersion: 3, aliases: [],
    groups: [{ id: "group", platform: "wechat", botId: "bot", groupId: "wechat-group", version: 2, updatedAt: timestamp,
      memberBindings: [{ id: "binding", senderId: "wx-user", membershipId: "member", activeWorkRecordId: null,
        verifiedAt: null, version: 4, updatedAt: timestamp, membership: { id: "member", displayName: "今日", status: "ACTIVE" }, activeWorkRecord: null }],
    }],
    operations: ["BIND_STORE", "BIND_MEMBER", "START", "FINISH", "ADJUST", "QUERY", "MANAGE", "BATCH", "HELP", "UNKNOWN"].map((intent, index) => ({
      id: `operation-${index}`, senderId: "wx-user", intent, outcome: "OK", rawText: "上工", reply: "说明已保存",
      errorCode: index === 9 ? "ERROR" : null, occurredAt: timestamp, createdAt: timestamp, workRecord: null,
    })),
  };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks();
  window.confirm = originalConfirm; window.prompt = originalPrompt;
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

describe("work bot language switching", () => {
  it("translates the populated page, attributes, counts, all intents and timestamps", async () => {
    await render();
    const text = container.textContent!;
    for (const label of ["Help the bot understand your team", "Team terminology", "Linked WeChat groups", "Bot activity",
      "1 group connected", "1 group", "1 employee", "Latest 10 entries", "60 minutes / 90 minutes", "Bot: bot · Updated",
      "Link store", "Link employee", "Start work", "Finish work", "Adjust work record", "Query records", "Manage work records",
      "Batch operation", "Help", "Bot message", "Processing error", "View reply", "Original message", "Bot reply", "Result:"]) {
      expect(text).toContain(label);
    }
    expect(container.querySelector("textarea")?.placeholder).toContain("For example:");
    expect(container.querySelector("textarea")?.placeholder).toContain("If a message is unclear");
    expect(button("Unlink").title).toBe("Unlink employee");
    expect(container.querySelector("time")?.textContent).toBe(new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp)));
    expect(container.querySelector(".work-bot-member__identity strong")?.textContent).toBe("今日");
    expect(container.querySelector(".work-bot-preview")?.textContent).toBe("上工");
    expect(container.querySelectorAll(".work-bot-message p")[1]?.textContent).toBe("说明已保存");
    expect(container.querySelector("textarea")?.value).toBe("保存说明");
    expect(request).not.toHaveBeenCalled();
  });

  it("switches Chinese to English and back while preserving an unsaved instruction", async () => {
    await render("zh-CN");
    expect(container.textContent).toContain("让机器人听懂店里的话");
    await edit("店内自定义说明：大力 60");
    await click("English");
    expect(container.textContent).toContain("Help the bot understand your team");
    expect(container.textContent).toContain("Unsaved changes");
    expect(container.querySelector(".work-bot-member__identity strong")?.textContent).toBe("今日");
    expect(container.querySelector("textarea")?.value).toBe("店内自定义说明：大力 60");
    await click("中文");
    expect(container.textContent).toContain("让机器人听懂店里的话");
    expect(container.textContent).toContain("已接入 1 个群");
    expect(container.textContent).toContain("60 分钟 / 90 分钟");
    expect(container.querySelector("time")?.textContent).toBe(new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp)));
    expect(container.querySelector("textarea")?.value).toBe("店内自定义说明：大力 60");
  });

  it("translates empty states and busy feedback", async () => {
    settings = { ...settings, groups: [], operations: [] };
    const originalServices = catalog.serviceItems;
    catalog.serviceItems = [];
    try {
      await render();
      expect(container.textContent).toContain("Waiting for a WeChat group");
      expect(container.textContent).toContain("No WeChat groups are linked yet.");
      expect(container.textContent).toContain("No bot activity yet.");
      expect(container.textContent).toContain("Add services in service settings first.");
      busy = true; await render();
      expect(container.querySelector("textarea")?.disabled).toBe(true);
      expect(button("Processing…").disabled).toBe(true);
    } finally { catalog.serviceItems = originalServices; }
  });

  it("translates confirmation prompts without changing the employee name or binding requests", async () => {
    await render();
    await click("Unlink");
    expect(confirm).toHaveBeenLastCalledWith("Unlink 今日's WeChat identity?");
    await click("Unlink group");
    expect(confirm).toHaveBeenLastCalledWith("Unlink this group from the store? Group members will need to link the store again.");
    expect(request).not.toHaveBeenCalled();
    await click("Verify identity and enable data access");
    expect(request).toHaveBeenCalledWith("/stores/store/work-bot/members/binding/verification", { method: "PATCH", body: { version: 4, verified: true } });
    settings.groups[0]!.memberBindings[0]!.verifiedAt = timestamp;
    settings.groups[0]!.memberBindings[0]!.activeWorkRecordId = "record";
    await render();
    expect(button("Disable data access")).toBeDefined();
    expect(container.textContent).toContain("Recording work");
    expect(button("Unlink").disabled).toBe(true);
    expect(button("Unlink").title).toBe("Finish the current work record before unlinking");
  });

  it("saves the original instruction and translates newly rendered save feedback", async () => {
    await render();
    const instructions = "店内自定义说明：大力 60";
    await edit(instructions);
    reload.mockImplementation(async () => {
      settings = { ...settings, instructions, instructionsVersion: 4 };
      root.render(element("en-US"));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(request).toHaveBeenCalledWith("/stores/store/work-bot/instructions", { method: "PATCH", body: { instructions, version: 3 } });
    expect(container.querySelector("[role=status]")?.textContent).toContain("Instructions saved");
    expect(container.querySelector("textarea")?.value).toBe(instructions);
    expect(button("Save instructions").disabled).toBe(true);
  });
});
