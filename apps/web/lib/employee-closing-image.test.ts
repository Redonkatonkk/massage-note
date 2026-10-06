import { afterEach, describe, expect, it, vi } from "vitest";
import { generateEmployeeClosingImage } from "./employee-closing-image";
import type { EmployeeClosingPreview } from "./types";

const record: EmployeeClosingPreview["records"][number] = {
  id: "record", status: "CONFIRMED", startAt: "2026-10-05T14:00:00Z", endAt: null,
  serviceName: "Massage <test>", serviceShortName: "", addons: [], grossFeeBaseCents: 10000,
  cashServiceCents: 0, cardServiceCents: 10000, giftCardServiceCents: 0,
  cashTipCents: 0, cardTipCents: 1001, giftCardTipCents: 0,
  totalLargeFeeWageCents: 6000, totalTipCents: 1001, employeeIncomeCents: 7001,
};
const preview: EmployeeClosingPreview = {
  storeId: "store", storeName: "Store & Spa", storeTimezone: "America/New_York", businessDate: "2026-10-05",
  isClosed: false, activeClosing: null, hasWarnings: false, warningCount: 0, warnings: [],
  cashSettlement: { status: "UNSETTLED", version: 0, settledAt: null },
  employee: {
    membershipId: "employee", displayName: "Amy/测试", role: "EMPLOYEE", recordCount: 1,
    grossFeeBaseCents: 10000, discountTotalCents: 0, discountedFeePerformanceCents: 10000, totalTipCents: 1001,
    customerTotalPaidCents: 11001, totalLargeFeeWageCents: 6000, employeeIncomeCents: 7001, incompleteRecordCount: 0,
    cashToSubmitToStoreCents: 0, cashLargeFeeDividendCents: 0, cardLargeFeeDividendCents: 6000,
    cashTipDividendCents: 0, cardTipDividendCents: 1001,
    confirmedLargeFeeWageCents: 6000, confirmedTipWageCents: 1001, confirmedIncomeCents: 7001,
  }, records: [record],
};

function setup(failure?: "image" | "context" | "blob", width = 390, ratio = 3) {
  vi.stubGlobal("Image", class {
    onload: () => void = () => {};
    onerror: () => void = () => {};
    set src(_value: string) { queueMicrotask(() => failure === "image" ? this.onerror() : this.onload()); }
  });
  vi.stubGlobal("window", { screen: { width }, innerWidth: width, devicePixelRatio: ratio });
  const drawImage = vi.fn();
  const canvas = {
    width: 0, height: 0, getContext: () => failure === "context" ? null : { drawImage },
    toBlob: (callback: (blob: Blob | null) => void) => callback(failure === "blob" ? null : new Blob(["png"], { type: "image/png" })),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:svg").mockReturnValue("blob:png");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { canvas, drawImage, create, revoke };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("个人日结图片导出", () => {
  it.each(["zh-CN", "en-US"] as const)("%s 使用短信共享模板并按设备像素导出完整PNG", async locale => {
    const { canvas, create, revoke, drawImage } = setup();
    const result = await generateEmployeeClosingImage(preview, locale);
    expect(result).toMatchObject({ url: "blob:png", width: 1170, fileName: `${locale === "en-US" ? "employee-closing" : "个人日结"}-Amy-测试-2026-10-05.png` });
    const svg = await (create.mock.calls[0]![0] as Blob).text();
    expect(svg).toContain("Store &amp; Spa");
    expect(svg).toContain("Massage &lt;test&gt;");
    expect(svg).toContain(locale === "en-US" ? "$70.01" : "US$70.01");
    expect(create.mock.calls[1]?.[0]).toMatchObject({ type: "image/png" });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, canvas.width, canvas.height);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:svg");
  });

  it.each(["image", "context", "blob"] as const)("%s 失败后回收临时SVG", async failure => {
    const { revoke } = setup(failure);
    await expect(generateEmployeeClosingImage(preview, "zh-CN")).rejects.toThrow();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:svg");
  });

  it("大量长记录导出保留所有内容并满足手机画布容量", async () => {
    const { canvas, create } = setup(undefined, 1440, 3);
    const records = Array.from({ length: 60 }, (_, index) => ({ ...record, serviceName: `完整服务项目-${index}-` + "中英文longName".repeat(15) }));
    await generateEmployeeClosingImage({ ...preview, records }, "zh-CN");
    const svg = await (create.mock.calls[0]![0] as Blob).text();
    expect(svg).toContain("完整服务项目-59-");
    expect(canvas.height).toBeLessThanOrEqual(16_384);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_000_000);
  });
});
