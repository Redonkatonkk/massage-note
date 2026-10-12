// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmployeeClosingSummary } from "./employee-closing";
import { generateEmployeeClosingImage, type GeneratedClosingImage } from "../lib/employee-closing-image";
import { apiRequest } from "../lib/api";
import type { EmployeeClosingPreview } from "../lib/types";

vi.mock("../lib/employee-closing-image", () => ({ generateEmployeeClosingImage: vi.fn() }));
vi.mock("../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../lib/realtime", () => ({ useStoreRealtime: () => {} }));
vi.mock("./language-provider", () => ({ useLanguage: () => ({ locale: "zh-CN", t: (value: string) => value }) }));
const preview: EmployeeClosingPreview = {
  storeId: "store", storeName: "门店", storeTimezone: "America/New_York", businessDate: "2026-10-12", isClosed: false, activeClosing: null,
  hasWarnings: false, warningCount: 0, warnings: [], cashSettlement: { status: "UNSETTLED", version: 0, settledAt: null },
  employee: { membershipId: "employee", displayName: "小美", role: "EMPLOYEE", recordCount: 0, grossFeeBaseCents: 0, discountTotalCents: 0, discountedFeePerformanceCents: 0, totalTipCents: 0, customerTotalPaidCents: 0, totalLargeFeeWageCents: 0, employeeIncomeCents: 0, incompleteRecordCount: 0, cashToSubmitToStoreCents: 0, cashLargeFeeDividendCents: 0, cardLargeFeeDividendCents: 0, cashTipDividendCents: 0, cardTipDividendCents: 0, confirmedLargeFeeWageCents: 0, confirmedTipWageCents: 0, confirmedIncomeCents: 0 }, records: [],
};
const image: GeneratedClosingImage = { blob: new Blob(["png"], { type: "image/png" }), fileName: "closing.png", width: 1170, height: 1000, url: "blob:closing" };
let root: Root, container: HTMLDivElement;
const revoke = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  URL.revokeObjectURL = revoke;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (value = preview, canSend = false) => { await act(async () => root.render(<EmployeeClosingSummary preview={value} canSend={canSend} />)); };
const click = async (label: string) => { const button = [...container.querySelectorAll("button")].find(button => button.textContent === label)!; expect(button).toBeDefined(); await act(async () => button.click()); };

it("模板之外保留生成、分享和管理者短信操作，预览更新后回收旧图片", async () => {
  vi.mocked(generateEmployeeClosingImage).mockResolvedValue(image); vi.mocked(apiRequest).mockResolvedValue({});
  await render(preview, true);
  expect(container.querySelector(".closing-template")).not.toBeNull();
  expect(container.querySelector(".closing-template button")).toBeNull();
  await click("生成日结图片");
  expect(generateEmployeeClosingImage).toHaveBeenCalledWith(preview, "zh-CN");
  expect(container.querySelector("img")!.getAttribute("src")).toBe(image.url);
  expect(container.textContent).toContain("保存到相册 / 分享");
  await click("短信发送给员工");
  expect(apiRequest).toHaveBeenCalledWith("/stores/store/closings/2026-10-12/deliveries/members/employee", { method: "POST", idempotent: true });
  await render({ ...preview, employee: { ...preview.employee, confirmedIncomeCents: 12345 } }, true);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".closing-template-total")!.textContent).toBe("$123.45");
  expect(revoke).toHaveBeenCalledWith(image.url);
});

it("生成期间切换预览时丢弃过期图片，员工仍没有短信管理操作", async () => {
  let resolveImage!: (value: GeneratedClosingImage) => void;
  vi.mocked(generateEmployeeClosingImage).mockReturnValue(new Promise(resolve => { resolveImage = resolve; }));
  await render();
  expect(container.textContent).not.toContain("短信发送给员工");
  await click("生成日结图片");
  await render({ ...preview, businessDate: "2026-10-11" });
  await act(async () => resolveImage(image));
  expect(container.querySelector("img")).toBeNull();
  expect(revoke).toHaveBeenCalledWith(image.url);
});
