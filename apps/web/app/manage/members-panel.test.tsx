// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { CatalogResponse, StoreMember } from "../../lib/types";
import { MembersPanel } from "./members-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../language-provider", () => ({ useLanguage: () => ({ t: (text: string) => text, locale: "zh-CN" }) }));
const request = vi.mocked(apiRequest);
const amy: StoreMember = { id: "amy", displayName: "Amy", role: "EMPLOYEE", status: "ACTIVE", version: 7, isServiceProvider: true, employmentType: "PART_TIME", defaultCommissionBps: 6000, dailySettlementEnabled: false, closingDeliveryEnabled: false, closingDeliveryPhoneE164: null, closingImageLocale: null, deletedAt: null, user: null };
const zoe: StoreMember = { ...amy, id: "zoe", displayName: "Zoe", role: "OWNER" };
const catalog: CatalogResponse = { serviceItems: [], addonItems: [], discountItems: [] };
let root: Root;
let container: HTMLDivElement;
let members: StoreMember[];
let reload: ReturnType<typeof vi.fn<() => Promise<void>>>;
const onDirtyChange = vi.fn();

function element() {
  return createElement(MembersPanel, { storeId: "store", dailyRankingEnabled: true, members, requests: [], catalog, busy: false, run: async action => action(), reload, onDirtyChange });
}
async function render() { await act(async () => root.render(element())); }
function button(text: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(text: string, scope: ParentNode = container) { await act(async () => button(text, scope).click()); }
function field(label: string): HTMLInputElement {
  const found = Array.from(container.querySelectorAll("label")).find(node => node.textContent?.startsWith(label))?.querySelector("input");
  if (!found) throw new Error(`Missing input: ${label}`);
  return found;
}
async function change(label: string, value: string) {
  await act(async () => {
    const input = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector(".member-detail form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.spyOn(window, "confirm").mockReturnValue(false);
  request.mockReset(); onDirtyChange.mockReset();
  members = [amy, zoe]; reload = vi.fn(async () => { root.render(element()); });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("employee-first member management", () => {
  it("requires selection, shows the selected profile, and never writes on selection", async () => {
    expect(container.textContent).toContain("先选择一位员工");
    expect(container.querySelector(".member-detail form")).toBeNull();
    await click("Amy", container.querySelector(".members-roster")!);
    expect(field("店内显示名").value).toBe("Amy");
    expect(button("Amy").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Amy");
    await click("Zoe", container.querySelector(".members-roster")!);
    expect(field("店内显示名").value).toBe("Zoe");
    expect(container.querySelector<HTMLSelectElement>(".member-detail select")!.disabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps a dirty draft when switching employees or detail tabs is declined", async () => {
    await click("Amy", container.querySelector(".members-roster")!);
    await change("店内显示名", "Annie");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await click("Zoe", container.querySelector(".members-roster")!);
    await click("账号与状态");
    expect(field("店内显示名").value).toBe("Annie");
    expect(window.confirm).toHaveBeenCalledTimes(2);
    vi.mocked(window.confirm).mockReturnValue(true);
    await click("Zoe", container.querySelector(".members-roster")!);
    expect(field("店内显示名").value).toBe("Zoe");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("saves metadata and commission with consecutive versions and stays with that employee", async () => {
    await click("Amy", container.querySelector(".members-roster")!);
    await change("店内显示名", "Annie"); await change("员工默认提成", "65.50");
    request.mockImplementation(async (path) => {
      if (path.endsWith("/commissions/default")) { const updated = { ...amy, displayName: "Annie", defaultCommissionBps: 6550, version: 9 }; members = [updated, zoe]; return { membership: updated, refreshedCurrentDayRecordCount: 2 }; }
      return { ...amy, displayName: "Annie", version: 8 };
    });
    await submit();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(2, "/stores/store/members/amy/commissions/default", expect.objectContaining({ body: { version: 8, commissionBps: 6550 } }));
    expect(field("店内显示名").value).toBe("Annie");
    expect(field("员工默认提成").value).toBe("65.5");
    expect(container.textContent).toContain("今日记工小结已同步");
    expect(button("保存修改").disabled).toBe(true);
  });
  it("preserves input on realtime conflicts, and reloading explicitly rebases the editor", async () => {
    await click("Amy", container.querySelector(".members-roster")!); await change("店内显示名", "Local draft");
    members = [{ ...amy, displayName: "Remote update", version: 8 }, zoe]; await render();
    expect(field("店内显示名").value).toBe("Local draft");
    expect(button("保存修改").disabled).toBe(true);
    await click("载入最新资料");
    expect(field("店内显示名").value).toBe("Remote update");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps a draft visible but disables writes when another device deactivates the member", async () => {
    await click("Amy", container.querySelector(".members-roster")!); await change("店内显示名", "Local draft");
    members = [{ ...amy, status: "INACTIVE", version: 8 }, zoe]; await render();
    expect(field("店内显示名").value).toBe("Local draft");
    expect(button("保存修改").disabled).toBe(true);
    await submit();
    expect(request).not.toHaveBeenCalled();
  });
  it("shows stopped employees as read-only and keeps owner deactivation out of account actions", async () => {
    members = [{ ...amy, status: "INACTIVE" }, zoe]; await render(); await click("已停用");
    await click("Amy", container.querySelector(".members-roster")!);
    expect(container.querySelector(".member-detail form")).toBeNull();
    expect(container.querySelector(".member-detail")!.textContent).toContain("恢复成员");
    await click("在职", container.querySelector(".members-filter-tabs")!);
    await click("Zoe", container.querySelector(".members-roster")!); await click("账号与状态");
    expect(container.querySelector(".member-account button")).toBeNull();
    expect(container.textContent).toContain("店主身份通过店铺设置中的转移流程修改");
  });
  it("retains draft and actionable error after a failed save", async () => {
    await click("Amy", container.querySelector(".members-roster")!); await change("店内显示名", "Annie");
    request.mockRejectedValueOnce(new Error("Version conflict")); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Version conflict");
    expect(field("店内显示名").value).toBe("Annie");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
  it("blocks repeated submission and employee switches while saving", async () => {
    await click("Amy", container.querySelector(".members-roster")!); await change("店内显示名", "Annie");
    let resolveSave!: (member: StoreMember) => void;
    request.mockReturnValueOnce(new Promise<StoreMember>(resolve => { resolveSave = resolve; }));
    await submit(); await submit();
    expect(request).toHaveBeenCalledTimes(1);
    expect(button("Zoe", container.querySelector(".members-roster")!).disabled).toBe(true);
    expect(button("正在保存").disabled).toBe(true);
    members = [{ ...amy, displayName: "Annie", version: 8 }, zoe];
    await act(async () => { resolveSave(members[0]!); });
    expect(field("店内显示名").value).toBe("Annie");
    expect(button("保存修改").disabled).toBe(true);
  });
  it("restores a stopped employee through the versioned confirmation form", async () => {
    members = [{ ...amy, status: "INACTIVE", version: 8 }, zoe]; await render();
    await click("已停用"); await click("Amy", container.querySelector(".members-roster")!); await click("恢复成员");
    request.mockImplementation(async () => { members = [{ ...amy, version: 9 }, zoe]; return members[0]; });
    await act(async () => container.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(request).toHaveBeenCalledWith("/stores/store/members/amy/restore", { method: "POST", body: { version: 8, displayName: "Amy", employmentType: "PART_TIME" } });
    expect(container.querySelector("dialog")).toBeNull();
    expect(field("店内显示名").value).toBe("Amy");
    expect(button("Amy", container.querySelector(".members-roster")!).getAttribute("aria-pressed")).toBe("true");
  });
});
