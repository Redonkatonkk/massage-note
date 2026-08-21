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
    expect(translateText("空白按 0", "en-US")).toBe("Blank = 0");
    expect(translateText("刷卡、现金和礼物卡大费至少填一项。各类小费可以留空，系统会按 0 处理。", "en-US"))
      .toContain("card, cash, or gift-card");
    expect(translateText("✓ 成员资料与默认提成已保存", "en-US"))
      .toBe("✓ Member details and default commission saved");
    expect(translateText("✓ 成员资料与默认提成已保存，今日记工小结已同步", "en-US"))
      .toContain("today's record totals are updated");
    expect(translateText("员工页面不显示全店经营汇总；今日可查看同事记工，但每行的大费、小费和应得小结只显示本人。", "en-US"))
      .toContain("totals are shown only on their own row");
    expect(translateText("提成优先顺序：员工项目专属比例 → 员工默认比例 → 项目默认比例 → 全店默认比例。保存员工提成后会重算未日结的当前营业日；已日结和历史记工继续使用原快照。", "en-US"))
      .toContain("employee default → service default");
  });

  it("translates dynamic status text without changing user names", () => {
    expect(translateText("已隐藏 Amy", "en-US")).toBe("Hidden Amy");
    expect(translateText("Amy的个人日结", "en-US")).toBe("Amy's employee closing");
    expect(translateText("3 项需要核对", "en-US")).toBe("3 items to review");
    expect(translateText("1 项提醒", "en-US")).toBe("1 reminder");
    expect(translateText("手动改价提醒", "en-US")).toBe("Manual price reminders");
    expect(translateText("仅提醒，不影响正常日结", "en-US"))
      .toBe("For awareness only; normal closing is available");
    expect(translateText("日结完成", "en-US")).toBe("Daily closing completed");
    expect(translateText("已取消日结，可以继续修改记工", "en-US"))
      .toContain("records can now be edited");
    expect(translateText("主要项目“Body”60 分钟价格必须是非负金额，最多两位小数", "en-US"))
      .toBe("Body 60-minute price must be non-negative with at most two decimal places");
    expect(translateText("Body第 2 个价格", "en-US")).toBe("Body price #2");
    expect(translateText("12 单", "en-US")).toBe("12 records");
    expect(translateText("2 张", "en-US")).toBe("2 cards");
    expect(translateText("礼物卡销售", "en-US")).toBe("Gift card sales");
    expect(translateText("使用礼物卡付款", "en-US")).toBe("Pay with a gift card");
    expect(translateText("3 张 · 实际收入", "en-US")).toBe("3 cards · Actual income");
    expect(translateText("折扣 -US$5 · 实收 US$95", "en-US"))
      .toBe("Discount -$5 · Collected $95");
    expect(translateText("2 条 · 共 US$40", "en-US"))
      .toBe("2 entries · $40 total");
    expect(translateText("仅查看高亮记工", "en-US"))
      .toBe("Highlighted records only");
    expect(translateText("高亮标记", "en-US")).toBe("Highlight");
    expect(translateText("礼卡", "en-US")).toBe("Gift card");
    expect(translateText("刷卡 30 美元", "en-US")).toBe("Card 30 dollars");
    expect(translateText("现金 50 美元", "en-US")).toBe("Cash 50 dollars");
    expect(translateText("记工卡片的付款金额中，细线框内是刷卡，未加框是现金；混合付款按“框内刷卡金额 + 无框现金金额”显示，例如刷卡 $30、现金 $50 会显示为 `[30]+50`。礼物卡付款会直接标出“礼卡”。", "en-US"))
      .toContain("outlined amount is a card payment");
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
    expect(translateText("瑞典 · US$80", "en-US")).toBe("Swedish · US$80");
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
    expect(translateText("有加项", "en-US")).toBe("Add-ons");
    expect(translateText(" · 有加项", "en-US")).toBe(" · Add-ons");
  });

  it("uses stable API error codes for English errors", () => {
    expect(translateApiError("INVALID_SESSION", "登录已过期，请重新登录", "en-US"))
      .toBe("Your session expired. Sign in again.");
    expect(translateApiError("GIFT_CARD_SERIAL_DUPLICATE", "重复", "en-US"))
      .toContain("already been recorded");
    expect(translateApiError("FUTURE_CODE", "未来错误", "en-US"))
      .toBe("Request failed (FUTURE_CODE).");
  });

  it("explains that highlighted cards use only the yellow card background", () => {
    expect(translateText("需要重点跟进时，点击弹窗顶部的“高亮标记”；保存后首页整张记工卡会显示黄色背景，不另显示右上角星标。详情页也可随时添加或取消高亮。", "en-US"))
      .toContain("without a separate star badge at the upper right");
  });

  it("explains custom gift card serial numbers and duplicate checks", () => {
    expect(translateText("默认使用系统建议号码；也可以直接修改为自定义号码，保存时会检查同店重复。多人同时使用默认号码时，以保存后的号码为准。", "en-US"))
      .toContain("edit it to a custom number");
  });
});
