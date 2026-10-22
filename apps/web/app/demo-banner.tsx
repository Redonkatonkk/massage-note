"use client";

import { appHref } from "../lib/demo-mode";
import { LanguageSwitcher, useLanguage } from "./language-provider";

export function DemoBanner() {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  return <aside className="demo-banner" aria-label={en ? "Portfolio demo" : "作品演示"}>
    <div className="demo-banner__intro"><strong>{en ? "Portfolio demo" : "作品演示"}</strong><span>{en ? "Synthetic data · Read-only · Oct 22, 2026" : "虚构数据 · 只读 · 2026 年 10 月 22 日"}</span><LanguageSwitcher /><a href="https://github.com/Redonkatonkk/massage-note">GitHub ↗</a></div>
    <nav aria-label={en ? "Demo pages" : "演示页面"}>{[
      ["/", "Work board", "今日记工"], ["/finance?tab=summary", "Monthly summary", "月度汇总"], ["/finance?tab=analytics", "Analytics", "经营分析"],
      ["/finance?tab=closing", "Daily closing", "日结"], ["/finance?tab=payroll", "Payroll", "工资结算"], ["/finance?tab=expenses", "Expenses", "支出"],
      ["/finance?tab=giftCards", "Gift cards", "礼物卡"], ["/manage?tab=members", "Team", "成员管理"], ["/manage?tab=catalog", "Services", "项目与提成"],
      ["/manage?tab=store", "Settings", "店铺设置"], ["/manage?tab=work-bot", "Work bot", "记工机器人"], ["/manage?tab=recovery", "Recovery", "回收站"],
      ["/manage?tab=audit", "Data operations", "数据操作"], ["/assistant", "AI assistant", "AI 助手"], ["/profile", "Profile", "个人资料"], ["/help", "Help", "帮助"], ["/login", "Welcome", "欢迎入口"],
    ].map(([path, english, chinese]) => <a key={path} href={appHref(path!)}>{en ? english : chinese}</a>)}</nav>
    <p>{en ? "Explore the original UI with a fixed snapshot. Forms can be opened; saving, live AI and delivery are disabled. Custom filters may fall outside the snapshot." : "使用固定快照浏览原应用界面。可打开表单；保存、实时 AI 和消息发送已禁用，部分自定义筛选不在快照范围。"}</p>
  </aside>;
}
