import { describe, expect, it } from "vitest";
import { financeNavigationTabs, manageNavigationTabs, navigationTabHref, resolveFinanceTab, resolveManageTab } from "./app-navigation";

describe("角色菜单与分区深链接", () => {
  it("员工侧栏只显示原有可用分区，并保留本人日结与工资文案", () => {
    expect(financeNavigationTabs("EMPLOYEE")).toEqual([["summary", "财务汇总"], ["cash", "现金结算"], ["closing", "我的日结"], ["payroll", "工资结算明细"]]);
    expect(manageNavigationTabs("EMPLOYEE")).toEqual([["store", "店铺信息"], ["catalog", "项目说明"]]);
    expect(resolveFinanceTab("analytics", "EMPLOYEE")).toBe("summary");
    expect(resolveFinanceTab("giftCards", "EMPLOYEE")).toBe("summary");
    expect(resolveManageTab("audit", "EMPLOYEE")).toBe("store");
    expect(resolveManageTab("members", "EMPLOYEE")).toBe("store");
  });

  it.each(["OWNER", "MANAGER"] as const)("%s 的菜单和 URL 校验采用同一分区范围", role => {
    for (const [tab] of financeNavigationTabs(role)) expect(resolveFinanceTab(tab, role)).toBe(tab);
    for (const [tab] of manageNavigationTabs(role)) expect(resolveManageTab(tab, role)).toBe(tab);
    expect(resolveFinanceTab("analytics", role)).toBe("analytics");
    expect(resolveManageTab("work-bot", role)).toBe("work-bot");
    expect(resolveManageTab("unknown", role)).toBe("store");
    expect(resolveFinanceTab(null, role)).toBe("summary");
  });

  it("子菜单深链接编码店铺 ID，并能在无店铺上下文时正常使用", () => {
    expect(navigationTabHref("manage", "catalog", "store /&店")).toBe("/manage?store=store+%2F%26%E5%BA%97&tab=catalog");
    expect(navigationTabHref("finance", "payroll")).toBe("/finance?tab=payroll");
  });
});
