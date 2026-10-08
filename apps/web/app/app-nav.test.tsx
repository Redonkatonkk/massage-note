// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount(element: ReactElement) { await act(async () => root.render(element)); }
function toggle(label: string) { return container.querySelector<HTMLButtonElement>(`button.app-nav-toggle[aria-label="${label}"]`)!; }
function submenu(button: HTMLButtonElement) { return document.getElementById(button.getAttribute("aria-controls")!)!; }
async function clickLink(link: HTMLAnchorElement, options: MouseEventInit = {}) {
  let prevented = false;
  // Observe the component's decision, then suppress jsdom's unsupported page navigation.
  document.addEventListener("click", event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
  await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...options })));
  return prevented;
}

describe("侧栏目录展开与导航", () => {
  it.each(["today", "finance", "manage"] as const)("%s 页面初始收起，父项重复点击独立展开和收起", async active => {
    const onTabChange = vi.fn();
    await mount(<AppNav active={active} role="OWNER" onTabChange={onTabChange} />);
    const finance = toggle("财务"), manage = toggle("店铺设置");
    for (const button of [finance, manage]) {
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(submenu(button).hidden).toBe(true);
    }
    await act(async () => finance.click());
    expect(finance.getAttribute("aria-expanded")).toBe("true");
    expect(submenu(finance).hidden).toBe(false);
    await act(async () => manage.click());
    expect(submenu(finance).hidden).toBe(false);
    expect(submenu(manage).hidden).toBe(false);
    await act(async () => finance.click());
    expect(finance.getAttribute("aria-expanded")).toBe("false");
    expect(submenu(finance).hidden).toBe(true);
    expect(submenu(manage).hidden).toBe(false);
    await act(async () => manage.click());
    expect(submenu(manage).hidden).toBe(true);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("子目录保留角色权限和带店铺参数的深链接，无下级项仍直接导航", async () => {
    await mount(<AppNav active="today" role="EMPLOYEE" storeId="store /&店" />);
    expect([...submenu(toggle("财务")).querySelectorAll("a")].map(node => node.textContent)).toEqual(["财务汇总", "我的日结", "工资结算明细"]);
    expect([...submenu(toggle("店铺设置")).querySelectorAll("a")].map(node => node.textContent)).toEqual(["店铺信息", "项目说明"]);
    expect(submenu(toggle("财务")).querySelector("a")?.getAttribute("href")).toBe("/finance?store=store+%2F%26%E5%BA%97&tab=summary");
    expect(container.querySelector('a[aria-label="记工"]')?.getAttribute("href")).toBe("/");
    expect(container.querySelector('a[aria-label="我的"]')?.getAttribute("href")).toBe("/profile");
    expect(container.querySelectorAll(".app-nav-toggle")).toHaveLength(2);
  });

  it("仅当前页面子项调用分区回调，跨页和组合键点击使用原生链接", async () => {
    const onTabChange = vi.fn();
    await mount(<AppNav active="manage" activeTab="catalog" role="OWNER" onTabChange={onTabChange} />);
    await act(async () => { toggle("财务").click(); toggle("店铺设置").click(); });
    const catalog = submenu(toggle("店铺设置")).querySelector<HTMLAnchorElement>('a[href="/manage?tab=catalog"]')!;
    expect(catalog.getAttribute("aria-current")).toBe("page");
    expect(await clickLink(catalog)).toBe(true);
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith("catalog");
    onTabChange.mockClear();
    expect(await clickLink(catalog, { ctrlKey: true })).toBe(false);
    const summary = submenu(toggle("财务")).querySelector<HTMLAnchorElement>("a")!;
    expect(summary.hasAttribute("aria-current")).toBe(false);
    expect(await clickLink(summary)).toBe(false);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("真实导航在小屏仅显示链接，桌面仅显示按钮，侧栏展开也不显示已收起的子目录", async () => {
    const checkerPath = pathToFileURL(resolve(process.cwd(), "../../scripts/check-mobile-ui.mjs")).href;
    const { stylesAtWidth } = await import(/* @vite-ignore */ checkerPath);
    const sources = await Promise.all(["globals.css", "design-system.css", "responsive.css"].map(async name => ({ name, css: await readFile(resolve(process.cwd(), "app", name), "utf8") })));
    await mount(<AppNav active="finance" role="OWNER" />);
    for (const expanded of [false, true, false]) {
      if (expanded || toggle("财务").getAttribute("aria-expanded") === "true") await act(async () => toggle("财务").click());
      for (const width of [390, 1199, 1200]) {
        const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${container.innerHTML}`);
        try {
          const button = dom.window.document.querySelector<HTMLButtonElement>(".app-nav-toggle")!;
          const link = dom.window.document.querySelector(".app-nav-parent-link")!;
          const menu = dom.window.document.getElementById(button.getAttribute("aria-controls")!)!;
          button.focus();
          const style = (node: Element) => dom.window.getComputedStyle(node);
          expect(style(button).display, `${width}px toggle`).toBe(width < 1200 ? "none" : "flex");
          expect(style(link).display, `${width}px link`).toBe(width < 1200 ? "grid" : "none");
          expect(style(menu).display, `${width}px submenu, expanded=${expanded}`).toBe(width >= 1200 && expanded ? "grid" : "none");
        } finally { dom.window.close(); }
      }
    }
  }, 30000);
});
