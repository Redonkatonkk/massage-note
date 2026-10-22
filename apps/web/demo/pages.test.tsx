// @vitest-environment jsdom
import { act, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_PORTFOLIO_DEMO", "true");
vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/massage-note");

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("original pages with the public demo adapter", () => {
  const cases: Array<[string, string, () => Promise<ComponentType>]> = [
    ["/", ".board-overview", async () => (await import("../app/massage-note-app")).MassageNoteApp],
    ...["summary", "analytics", "closing", "expenses", "giftCards", "payroll"].map(tab => [
      `/finance/?tab=${tab}`, ".finance-shell", async () => (await import("../app/finance/finance-page-client")).FinancePageClient,
    ] as [string, string, () => Promise<ComponentType>]),
    ...["store", "members", "catalog", "work-bot", "recovery", "audit"].map(tab => [
      `/manage/?tab=${tab}`, ".manage-shell", async () => (await import("../app/manage/manage-page-client")).ManagePageClient,
    ] as [string, string, () => Promise<ComponentType>]),
    ["/profile/", ".profile-shell", async () => (await import("../app/profile/profile-page-client")).ProfilePageClient],
    ["/assistant/", ".assistant-shell", async () => (await import("../app/assistant/assistant-page-client")).AssistantPageClient],
  ];
  it.each(cases)("renders %s without live requests or missing initial fixtures", async (path, selector, load) => {
    window.history.replaceState(null, "", `/massage-note${path}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Live network is forbidden in the demo"));
    const Page = await load();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<Page />); });
      for (let i = 0; i < 200 && !host.querySelector(selector); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      for (let i = 0; i < 10; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      expect(host.querySelector(selector), host.textContent ?? "").not.toBeNull();
      expect(host.textContent).not.toContain("outside the demo snapshot");
      expect(host.textContent).not.toContain("read-only");
      expect(fetchSpy).not.toHaveBeenCalled();
      for (const anchor of host.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) expect(anchor.getAttribute("href")).toMatch(/^\/massage-note\//);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      fetchSpy.mockRestore();
    }
  });
});
