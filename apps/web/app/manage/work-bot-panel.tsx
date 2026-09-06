"use client";

import { useState } from "react";
import { apiRequest } from "../../lib/api";
import type { CatalogResponse, ServiceItem, WorkBotAlias, WorkBotSettings } from "../../lib/types";

interface Props {
  storeId: string;
  catalog: CatalogResponse;
  settings: WorkBotSettings;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
}

function shortId(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function WorkBotPanel({ storeId, catalog, settings, busy, run, reload }: Props) {
  const services = catalog.serviceItems.filter((item) => item.isEnabled && !item.deletedAt);
  const [alias, setAlias] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((item) => item.id === serviceId) ?? null;
  const [duration, setDuration] = useState(service?.priceOptions[0]?.durationMinutes.toString() ?? "");

  function selectService(id: string) {
    setServiceId(id);
    const selected = services.find((item) => item.id === id);
    setDuration(selected?.priceOptions[0]?.durationMinutes.toString() ?? "");
  }

  return <section className="manage-section">
    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">微信群接入</p><h2>记工机器人</h2></div><span className="status-chip">{settings.groups.length} 个群</span></div>
      <p className="field-help">群内首次发送“绑定店铺 6位店铺代码”。绑定成功后只能在这里解除，防止群员把整群误绑到其他店铺。</p>
      {settings.groups.length === 0 ? <p className="empty-state">还没有微信群绑定到这家店。</p> : settings.groups.map((group) => <article className="catalog-item" key={group.id}>
        <div className="catalog-item-heading"><div className="catalog-summary"><div className="catalog-summary-title"><strong>{group.platform}</strong><span>群 {shortId(group.groupId)}</span></div><div className="catalog-summary-facts"><em>机器人 {shortId(group.botId)}</em><em>{group.memberBindings.length} 个员工绑定</em><small>更新于 {formatTime(group.updatedAt)}</small></div></div><button className="table-action danger" disabled={busy} type="button" onClick={() => { if (!window.confirm("确认解除这个群的店铺绑定吗？群员需要重新执行绑定店铺。")) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/groups/${group.id}`, { method: "DELETE", body: { version: group.version } }); await reload(); }); }}>解除群绑定</button></div>
        {group.memberBindings.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>微信标识</th><th>状态</th><th>操作</th></tr></thead><tbody>{group.memberBindings.map((member) => <tr key={member.id}><td>{member.membership.displayName}</td><td>{shortId(member.senderId)}</td><td>{member.activeWorkRecordId ? "正在记工" : "空闲"}</td><td><button className="table-action danger" disabled={busy || Boolean(member.activeWorkRecordId)} type="button" onClick={() => { if (!window.confirm(`确认解除 ${member.membership.displayName} 的微信绑定吗？`)) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/members/${member.id}`, { method: "DELETE", body: { version: member.version } }); await reload(); }); }}>解除</button></td></tr>)}</tbody></table></div>}
      </article>)}
    </section>

    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">结构化词典</p><h2>记工黑话</h2></div><span className="status-chip">{settings.aliases.length} 条</span></div>
      <p className="field-help">黑话必须明确对应一个项目和时长。机器人不会从知识库或模型中猜价格。</p>
      <form className="manage-form-grid" onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await apiRequest(`/stores/${storeId}/work-bot/aliases`, { method: "POST", body: { alias, serviceItemId: serviceId, durationMinutes: Number(duration) } });
        setAlias(""); await reload();
      }); }}>
        <label>黑话<input required maxLength={80} placeholder="例如 大力" value={alias} onChange={(event) => setAlias(event.target.value)} /></label>
        <label>项目<select required value={serviceId} onChange={(event) => selectService(event.target.value)}><option value="">请选择</option>{services.map((item) => <option key={item.id} value={item.id}>{item.shortName} · {item.fullName}</option>)}</select></label>
        <label>时长<select required value={duration} onChange={(event) => setDuration(event.target.value)}><option value="">请选择</option>{service?.priceOptions.map((option) => <option key={option.id} value={option.durationMinutes}>{option.durationMinutes} 分钟</option>)}</select></label>
        <div className="catalog-form-actions"><button className="primary-action compact" disabled={busy || !serviceId || !duration} type="submit">添加黑话</button></div>
      </form>
      <div className="catalog-list">{settings.aliases.length ? settings.aliases.map((item) => <AliasRow key={`${item.id}-${item.version}`} storeId={storeId} item={item} services={services} busy={busy} run={run} reload={reload} />) : <p className="empty-state">尚未配置黑话。请先添加“大力”等常用说法。</p>}</div>
    </section>

    <section className="manage-card">
      <div className="manage-heading"><div><p className="eyebrow">最近 100 条</p><h2>机器人操作</h2></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>时间</th><th>意图</th><th>结果</th><th>原消息</th><th>回复</th></tr></thead><tbody>{settings.operations.slice(0, 100).map((item) => <tr key={item.id}><td>{formatTime(item.createdAt)}</td><td>{item.intent}</td><td>{item.outcome}</td><td>{item.rawText}</td><td>{item.reply}</td></tr>)}</tbody></table>{settings.operations.length === 0 && <p className="empty-state">还没有机器人操作。</p>}</div>
    </section>
  </section>;
}

function AliasRow({ storeId, item, services, busy, run, reload }: { storeId: string; item: WorkBotAlias; services: ServiceItem[]; busy: boolean; run: Props["run"]; reload: Props["reload"] }) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(item.alias);
  const [serviceId, setServiceId] = useState(item.serviceItemId);
  const [duration, setDuration] = useState(item.durationMinutes.toString());
  const selected = services.find((service) => service.id === serviceId);
  return <article className={`catalog-item ${item.isEnabled ? "" : "deleted"}`}><div className="catalog-item-heading"><div className="catalog-summary"><div className="catalog-summary-title"><strong>{item.alias}</strong><span>{item.serviceItem.shortName}</span></div><div className="catalog-summary-facts"><em>{item.durationMinutes} 分钟</em><small>{item.isEnabled ? "启用中" : "已停用"}</small></div></div><div className="catalog-item-actions"><button className="secondary-action compact" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "收起" : "修改"}</button><button className="table-action danger" disabled={busy} type="button" onClick={() => { if (!window.confirm(`确认删除黑话“${item.alias}”吗？`)) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/aliases/${item.id}`, { method: "DELETE", body: { version: item.version } }); await reload(); }); }}>删除</button></div></div>
    {editing && <form className="manage-form-grid" onSubmit={(event) => { event.preventDefault(); void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/aliases/${item.id}`, { method: "PATCH", body: { alias, serviceItemId: serviceId, durationMinutes: Number(duration), isEnabled: item.isEnabled, version: item.version } }); await reload(); setEditing(false); }); }}><label>黑话<input required value={alias} onChange={(event) => setAlias(event.target.value)} /></label><label>项目<select value={serviceId} onChange={(event) => { setServiceId(event.target.value); const next = services.find((service) => service.id === event.target.value); setDuration(next?.priceOptions[0]?.durationMinutes.toString() ?? ""); }}>{services.map((service) => <option key={service.id} value={service.id}>{service.shortName}</option>)}</select></label><label>时长<select value={duration} onChange={(event) => setDuration(event.target.value)}>{selected?.priceOptions.map((option) => <option key={option.id} value={option.durationMinutes}>{option.durationMinutes} 分钟</option>)}</select></label><label className="catalog-enabled-toggle"><input type="checkbox" checked={item.isEnabled} onChange={() => void run(async () => { await apiRequest(`/stores/${storeId}/work-bot/aliases/${item.id}`, { method: "PATCH", body: { alias, serviceItemId: serviceId, durationMinutes: Number(duration), isEnabled: !item.isEnabled, version: item.version } }); await reload(); })} /><span>启用</span></label><div className="catalog-form-actions"><button className="primary-action compact" disabled={busy} type="submit">保存</button></div></form>}
  </article>;
}
