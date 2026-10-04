"use client";

const topics = [["work", "当天记工"], ["closing", "日结与现金"], ["payroll", "工资结算"], ["money", "金额口径"], ["members", "成员与账号"], ["catalog", "项目与提成"]] as const;

export function HelpTopics() {
  return <nav className="help-topics" aria-label="帮助主题">{topics.map(([id, title]) => <a key={id} href={`#help-${id}`} onClick={() => {
    const section = document.getElementById(`help-${id}`);
    if (section instanceof HTMLDetailsElement) {
      section.open = true;
      section.querySelector("summary")?.focus({ preventScroll: true });
    }
  }}>{title}</a>)}</nav>;
}
