"use client";

import { useState } from "react";
import { apiRequest } from "../../lib/api";
import type { CatalogResponse, WorkBotSettings } from "../../lib/types";

interface Props {
  storeId: string;
  catalog: CatalogResponse;
  settings: WorkBotSettings;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const intentLabels: Record<string, string> = { BIND_STORE: "绑定店铺", BIND_MEMBER: "绑定员工", START: "上工", FINISH: "下工", ADJUST: "调整记工", HELP: "使用帮助" };

export function WorkBotPanel({ storeId, catalog, settings, busy, run, reload }: Props) {
  const [draft, setDraft] = useState<{ text: string; version: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const instructions = draft?.text ?? settings.instructions;
  const dirty = instructions !== settings.instructions;
  const services = catalog.serviceItems.filter((item) => item.isEnabled && !item.deletedAt);

  return <section className="manage-section work-bot-panel">
    <header className="work-bot-intro">
      <div><p className="eyebrow">微信群 · 智能记工</p><h2>让机器人听懂店里的话</h2><p>写下大家常用的说法，机器人会结合店铺项目理解群消息。</p></div>
      <span className="status-chip">{settings.groups.length ? `已接入 ${settings.groups.length} 个群` : "等待绑定微信群"}</span>
    </header>

    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">店铺专属说明</p><h2>记工黑话</h2></div><span className="work-bot-tag">自然语言</span></div>
      <p className="field-help">像教新同事一样，描述黑话、简称和记工习惯。保存后，机器人会在处理下一条消息时读取这些说明。</p>
      <form className="work-bot-editor" onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await apiRequest(`/stores/${storeId}/work-bot/instructions`, { method: "PATCH", body: { instructions, version: draft?.version ?? settings.instructionsVersion } });
        await reload(); setDraft(null); setSaved(true);
      }); }}>
        <label htmlFor="work-bot-instructions">店里怎么说，就在这里怎么写</label>
        <textarea id="work-bot-instructions" maxLength={12000} rows={10} disabled={busy} value={instructions} placeholder={'例如：\n大家说“大力”或 deep 时，通常指深层组织按摩。\n“脚”是足疗，“加石头”是添加热石项目。\n“评论”指评论折扣；没有提到时不要自动添加。\n如果说法不明确，先请员工补充信息。'} onChange={(event) => { setDraft({ text: event.target.value, version: draft?.version ?? settings.instructionsVersion }); setSaved(false); }} />
        <div className="work-bot-editor-footer"><span className="field-help" role="status">{saved ? "说明已保存" : dirty ? "有未保存的修改" : "说明会与项目、员工、折扣和加项一起提供给机器人"} · {instructions.length.toLocaleString()} / 12,000</span><button className="primary-action compact" disabled={busy || !dirty} type="submit">{busy ? "处理中…" : "保存说明"}</button></div>
      </form>
      <details className="work-bot-reference"><summary>机器人可用的项目 <span>{services.length} 项</span></summary><p className="field-help">名称、价格和可用时长以项目设置为准。说明里的项目应能在这里找到。</p><div className="work-bot-services">{services.map((item) => <div key={item.id}><strong>{item.shortName}</strong><span>{item.fullName}</span><small>{item.priceOptions.map((option) => `${option.durationMinutes} 分钟`).join(" / ")}</small></div>)}</div>{!services.length && <p className="empty-state">请先在项目设置中添加服务项目。</p>}</details>
    </section>

    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">连接与成员</p><h2>微信群绑定</h2></div><span className="work-bot-tag">{settings.groups.length} 个群</span></div>
      <p className="work-bot-hint">在群里发送 <strong>绑定店铺 6位店铺代码</strong>，然后让员工发送 <strong>绑定 员工姓名</strong>。</p>
      {!settings.groups.length ? <div className="empty-state">还没有绑定的微信群。完成绑定后，可在这里管理群和员工。</div> : <div className="work-bot-groups">{settings.groups.map((group) => <details className="work-bot-group" key={group.id}>
        <summary><span><strong>微信群</strong><small>{group.groupId}</small></span><span className="work-bot-tag">{group.memberBindings.length} 位员工</span></summary>
        <div className="work-bot-group-body"><p className="field-help">机器人：{group.botId} · 更新于 {formatTime(group.updatedAt)}</p>
          {group.memberBindings.map((member) => <div className="work-bot-member" key={member.id}><div><strong>{member.membership.displayName}</strong><small>{member.senderId}</small></div><span>{member.activeWorkRecordId ? "正在记工" : "空闲"}</span><button className="table-action danger" disabled={busy || Boolean(member.activeWorkRecordId)} title={member.activeWorkRecordId ? "请先完成当前记工再解除绑定" : "解除员工绑定"} type="button" onClick={() => { if (!window.confirm(`确认解除 ${member.membership.displayName} 的微信绑定吗？`)) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/members/${member.id}`, { method: "DELETE", body: { version: member.version } }); await reload(); }); }}>解除</button></div>)}
          {!group.memberBindings.length && <p className="empty-state">群内还没有员工绑定。</p>}
          <div className="work-bot-group-footer"><span className="field-help">解除后，群员需要重新绑定店铺。</span><button className="table-action danger" disabled={busy} type="button" onClick={() => { if (!window.confirm("确认解除这个群的店铺绑定吗？群员需要重新执行绑定店铺。")) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/groups/${group.id}`, { method: "DELETE", body: { version: group.version } }); await reload(); }); }}>解除群绑定</button></div>
        </div>
      </details>)}</div>}
    </section>

    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">最近动态</p><h2>机器人操作</h2></div><span className="work-bot-tag">最近 {Math.min(settings.operations.length, 100)} 条</span></div>
      <div className="work-bot-operations">{settings.operations.slice(0, 100).map((item) => <details className="work-bot-operation" key={item.id}><summary><span className="work-bot-operation-meta"><strong>{intentLabels[item.intent] ?? "机器人消息"}</strong><time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time></span><span className="work-bot-preview">{item.rawText}</span><span className="work-bot-operation-result">{item.errorCode ? "处理异常" : "查看回复"}</span></summary><div className="work-bot-message"><span>原消息</span><p>{item.rawText}</p><span>机器人回复</span><p>{item.reply}</p><small>结果：{item.outcome}</small></div></details>)}</div>
      {!settings.operations.length && <p className="empty-state">还没有机器人操作。群里的记工消息会显示在这里。</p>}
    </section>
  </section>;
}
