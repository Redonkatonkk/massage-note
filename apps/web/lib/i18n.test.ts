import { describe, expect, it } from "vitest";
import {
  isAppLocale,
  registerCatalogNamesFromPayload,
  translateApiError,
  translateText,
} from "./i18n";

describe("bilingual UI translation", () => {
  it("keeps Chinese as the default source language", () => {
    expect(translateText("今日", "zh-CN")).toBe("今日");
    expect(isAppLocale("zh-CN")).toBe(true);
    expect(isAppLocale(undefined)).toBe(false);
  });

  it("translates fixed labels and preserves surrounding whitespace", () => {
    expect(translateText("  店铺设置 ", "en-US")).toBe("  Store settings ");
    expect(translateText("现金大费", "en-US")).toBe("Cash service fees");
  });

  it("translates dynamic status text without changing user names", () => {
    expect(translateText("已隐藏 Amy", "en-US")).toBe("Hidden Amy");
    expect(translateText("Amy的个人日结", "en-US")).toBe("Amy's employee closing");
    expect(translateText("3 项需要核对", "en-US")).toBe("3 items to review");
    expect(translateText("主要项目“Body”60 分钟价格必须是非负金额，最多两位小数", "en-US"))
      .toBe("Body 60-minute price must be non-negative with at most two decimal places");
    expect(translateText("Body第 2 个价格", "en-US")).toBe("Body price #2");
    expect(translateText("12 单", "en-US")).toBe("12 records");
  });

  it("translates appended status lines while retaining arbitrary messages", () => {
    expect(translateText("Customer note\n已确认并写入。", "en-US"))
      .toBe("Customer note\nConfirmed and saved.");
  });

  it("automatically translates Chinese store-defined catalog names", () => {
    registerCatalogNamesFromPayload({
      serviceItems: [
        { fullName: "60分钟深层组织按摩", shortName: "深层组织" },
        { fullName: "瑞典按摩", shortName: "瑞典" },
      ],
      addonItems: [{ name: "热石加项", shortName: "热石" }],
      discountItems: [{ name: "会员优惠", shortName: "会员折扣" }],
    });

    expect(translateText("60分钟深层组织按摩", "en-US"))
      .toBe("60-minute Deep Tissue Massage");
    expect(translateText("瑞典 · US$80.00", "en-US")).toBe("Swedish · US$80.00");
    expect(translateText("热石加项", "en-US")).toBe("Hot Stone Add-on");
    expect(translateText("会员优惠", "en-US")).toBe("Member Discount");
  });

  it("translates historical catalog snapshots but leaves store and employee names unchanged", () => {
    registerCatalogNamesFromPayload({
      rows: [{
        membership: { displayName: "安心" },
        workRecords: [{
          serviceSnapshot: { name: "全身按摩", shortName: "全身" },
          addonSnapshots: [{ name: "精油", shortName: "精油" }],
          discountSnapshots: [{ name: "新客优惠" }],
        }],
      }],
    });

    expect(translateText("全身按摩", "en-US")).toBe("Full Body Massage");
    expect(translateText("精油", "en-US")).toBe("Essential Oil");
    expect(translateText("新客优惠", "en-US")).toBe("New Customer Discount");
    expect(translateText("安心", "en-US")).toBe("安心");
  });

  it("translates the store's existing Chinese service aliases in record summaries", () => {
    registerCatalogNamesFromPayload({
      rows: [{
        workRecords: [
          { serviceSnapshot: { name: "大身体", shortName: "大身体" } },
          { serviceSnapshot: { name: "小身体", shortName: "小身体" } },
        ],
      }],
    });

    expect(translateText("大身体", "en-US")).toBe("Large Body Massage");
    expect(translateText("小身体", "en-US")).toBe("Small Body Massage");
    expect(translateText("大费：刷卡 · 小费：刷卡 · 有加项", "en-US"))
      .toBe("Service fees: Card · Tips: Card · Add-ons");
    expect(translateText(" · 有加项", "en-US")).toBe(" · Add-ons");
  });

  it("uses stable API error codes for English errors", () => {
    expect(translateApiError("INVALID_SESSION", "登录已过期，请重新登录", "en-US"))
      .toBe("Your session expired. Sign in again.");
    expect(translateApiError("FUTURE_CODE", "未来错误", "en-US"))
      .toBe("Request failed (FUTURE_CODE).");
  });
});
