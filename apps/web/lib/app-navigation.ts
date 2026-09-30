import type { MembershipSummary } from "./types";

export type NavigationRole = MembershipSummary["role"];
export type AppNavPage = "today" | "finance" | "manage" | "profile";
export type FinanceTab = "analytics" | "summary" | "cash" | "closing" | "giftCards" | "payroll";
export type ManageTab = "store" | "members" | "catalog" | "work-bot" | "recovery" | "audit";

export function financeNavigationTabs(role: NavigationRole): Array<[FinanceTab, string]> {
  const canManage = role !== "EMPLOYEE";
  const tabs: Array<[FinanceTab, string]> = [["summary", "财务汇总"]];
  if (canManage) tabs.push(["analytics", "经营分析"]);
  tabs.push(["cash", "现金结算"], ["closing", canManage ? "日结" : "我的日结"]);
  if (canManage) tabs.push(["giftCards", "礼物卡"]);
  tabs.push(["payroll", canManage ? "工资结算" : "工资结算明细"]);
  return tabs;
}

export function manageNavigationTabs(role: NavigationRole): Array<[ManageTab, string]> {
  return role === "EMPLOYEE"
    ? [["store", "店铺信息"], ["catalog", "项目说明"]]
    : [["store", "店铺设置"], ["members", "成员管理"], ["catalog", "项目与提成"], ["work-bot", "记工机器人"], ["recovery", "业务回收站"], ["audit", "审计记录"]];
}

export function resolveFinanceTab(value: string | null, role: NavigationRole): FinanceTab {
  return financeNavigationTabs(role).find(([tab]) => tab === value)?.[0] ?? "summary";
}

export function resolveManageTab(value: string | null, role: NavigationRole): ManageTab {
  return manageNavigationTabs(role).find(([tab]) => tab === value)?.[0] ?? "store";
}

export function navigationTabHref(page: "finance" | "manage", tab: FinanceTab | ManageTab, storeId?: string | undefined): string {
  const params = new URLSearchParams();
  if (storeId) params.set("store", storeId);
  params.set("tab", tab);
  return `/${page}?${params.toString()}`;
}
