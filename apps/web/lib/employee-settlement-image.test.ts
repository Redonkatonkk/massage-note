import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmployeeSettlementSvg } from "@massage-note/domain";
import { generateEmployeeSettlementImage } from "./employee-settlement-image";
import type { EmployeeSettlementPreview } from "./types";

const record: EmployeeSettlementPreview["records"][number] = {
  id: "record", businessDate: "2026-10-02", startAt: "2026-10-02T14:00:00Z", endAt: null,
  serviceName: "Massage <test>", serviceShortName: "", addons: [], grossFeeBaseCents: 10000,
  cashServiceCents: 0, cardServiceCents: 10000, giftCardServiceCents: 0, nonCashServiceCents: 10000,
  cashLargeFeeWageCents: 0, nonCashLargeFeeWageCents: 6000, cashTipCents: 0,
  cardTipCents: 1001, giftCardTipCents: 0, nonCashTipCents: 1001,
  cashIncomeCents: 0, nonCashIncomeCents: 7001, totalIncomeCents: 7001,
};
const preview: EmployeeSettlementPreview = {
  storeId: "store", storeName: "Store & Spa", storeTimezone: "America/New_York",
  dateFrom: "2026-10-02", dateTo: "2026-10-02", paymentScope: "NON_CASH",
  generatedAt: "2026-10-02T18:00:00Z", employee: { membershipId: "employee", displayName: "Amy/测试" },
  summary: { recordCount: 1, cashServiceCents: 0, nonCashServiceCents: 10000,
    cashLargeFeeWageCents: 0, nonCashLargeFeeWageCents: 6000, cashTipCents: 0, nonCashTipCents: 1001,
    cashIncomeCents: 0, nonCashIncomeCents: 7001, totalIncomeCents: 7001 },
  records: [record],
};

function setup(failure?: "image" | "context" | "blob") {
  vi.stubGlobal("Image", class {
    onload: () => void = () => {};
    onerror: () => void = () => {};
    set src(_value: string) { queueMicrotask(() => failure === "image" ? this.onerror() : this.onload()); }
  });
  const drawImage = vi.fn();
  const canvas = {
    width: 0, height: 0,
    getContext: () => failure === "context" ? null : { drawImage },
    toBlob: (callback: (blob: Blob | null) => void) => callback(failure === "blob" ? null : new Blob(["png"], { type: "image/png" })),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:svg").mockReturnValue("blob:png");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { canvas, drawImage, create, revoke };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("employee settlement image", () => {
  it("复用短信 SVG，保留美分、明细、语言和 XML 转义", () => {
    const chinese = createEmployeeSettlementSvg(preview, "zh_CN").svg;
    const english = createEmployeeSettlementSvg(preview, "en_US").svg;
    expect(chinese).toContain("US$70.01");
    expect(chinese).toContain("当日总结");
    expect(english).toContain("Daily summary");
    expect(english).toContain("Massage &lt;test&gt;");
    expect(english).toContain("Store &amp; Spa");
  });

  it("生成 PNG，文件名包含范围和来源，并回收临时 SVG", async () => {
    const { create, revoke, drawImage } = setup();
    const image = await generateEmployeeSettlementImage(preview, "en-US");
    expect(image).toEqual({ url: "blob:png", fileName: "Amy_测试_2026-10-02_2026-10-02_NON_CASH.png" });
    expect(create.mock.calls[1]?.[0]).toMatchObject({ type: "image/png" });
    expect(drawImage).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:svg");
  });

  it.each(["image", "context", "blob"] as const)("%s 失败时回收 SVG，并允许用户重试", async (failure) => {
    const { create, revoke } = setup(failure);
    await expect(generateEmployeeSettlementImage(preview, "zh-CN")).rejects.toThrow();
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:svg");
  });

  it("整月长图保留全部记录并限制移动设备画布大小", async () => {
    const { canvas } = setup();
    const month = { ...preview, records: Array.from({ length: 31 * 12 }, (_, index) => ({ ...record,
      businessDate: `2026-10-${String(Math.floor(index / 12) + 1).padStart(2, "0")}`,
    })) };
    const svg = createEmployeeSettlementSvg(month, "zh_CN").svg;
    expect(svg.match(/当日总结/g)).toHaveLength(31);
    await generateEmployeeSettlementImage(month, "zh-CN");
    expect(canvas.height).toBeLessThanOrEqual(16_384);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_000_000);
  });
});
