"use client";

import { apiRequest } from "../../lib/api";
import { formatUsd } from "../../lib/money";
import type { DeletedGiftCardSale, DeletedWorkRecord } from "../../lib/types";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

const time = (value: string) => new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });

export function RecoveryPanel({ storeId, records, giftCardSales, busy, run, reload }: {
  storeId: string; records: DeletedWorkRecord[]; giftCardSales: DeletedGiftCardSale[]; busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>;
}) {
  const restoreRecord = (record: DeletedWorkRecord) => {
    if (!window.confirm(record.status === "PLACEHOLDER" ? `确认恢复 ${record.employee.displayName} 的这张占位小卡吗？恢复后只在主表占位，不计入财务。` : `确认恢复 ${record.employee.displayName} 的这条记工吗？恢复后会重新计入财务。`)) return;
    void run(async () => { await apiRequest(`/stores/${storeId}/work-records/${record.id}/restore`, { method: "POST", idempotent: true, body: { version: record.version } }); await reload(); });
  };
  const restoreSale = (sale: DeletedGiftCardSale) => {
    if (!window.confirm(`确认恢复礼物卡 ${sale.serialNumber} 的销售记录吗？恢复后会重新计入店铺收入。`)) return;
    void run(async () => { await apiRequest(`/stores/${storeId}/gift-card-sales/${sale.id}/restore`, { method: "POST", idempotent: true, body: { version: sale.version } }); await reload(); });
  };
  const recordAction = (record: DeletedWorkRecord) => <button className="primary-action compact" disabled={busy} type="button" onClick={() => restoreRecord(record)}>{record.status === "PLACEHOLDER" ? "恢复占位" : "恢复记工"}</button>;
  const recordName = (record: DeletedWorkRecord) => record.status === "PLACEHOLDER" ? "占位" : record.serviceSnapshot?.shortName ?? "自定义项目";
  const saleAction = (sale: DeletedGiftCardSale) => <button className="primary-action compact" disabled={busy} type="button" onClick={() => restoreSale(sale)}>恢复卖卡记录</button>;

  return <section className="manage-section">
    <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">软删除记录</p><h2>记工回收站</h2></div><span className="status-chip">{records.length} 条</span></div>
      <p className="field-help">恢复后会重新显示在主表；普通记工重新计入财务，占位不计入记工数或任何金额。若该营业日已日结，请先到财务页面取消日结。</p>
      {records.length === 0 ? <p className="empty-state">目前没有已删除的记工记录。</p> : <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table"><thead><tr><th>营业日</th><th>员工</th><th>项目</th><th>开始时间</th><th>大费基数</th><th>删除时间</th><th>删除原因</th><th>操作</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td>{record.businessDate.slice(0, 10)}</td><td>{record.employee.displayName}</td><td>{recordName(record)}</td><td>{time(record.startAt)}</td><td>{record.status === "PLACEHOLDER" ? "—" : formatUsd(record.grossFeeBaseCents)}</td><td>{record.deletedAt ? time(record.deletedAt) : "—"}</td><td>{record.deleteReason || "未填写"}</td><td>{recordAction(record)}</td></tr>)}</tbody></table></div>}>
        <ul className="mobile-data-list">{records.map(record => <li key={record.id}><MobileDataCard title={record.employee.displayName} subtitle={`${record.businessDate.slice(0, 10)} · ${recordName(record)}`} actions={recordAction(record)}>
          <RecordFacts items={[...(record.status === "PLACEHOLDER" ? [] : [{ label: "大费基数", value: formatUsd(record.grossFeeBaseCents) }]), { label: "开始时间", value: time(record.startAt) }, { label: "删除时间", value: record.deletedAt ? time(record.deletedAt) : "—" }, { label: "删除原因", value: record.deleteReason || "未填写", wide: true }]} />
        </MobileDataCard></li>)}</ul>
      </ResponsiveDataView>}
    </section>
    <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">软删除记录</p><h2>礼物卡销售回收站</h2></div><span className="status-chip">{giftCardSales.length} 条</span></div>
      <p className="field-help">恢复后会重新计入对应营业日的店铺收入；若该营业日已日结，请先到财务页面取消日结。</p>
      {giftCardSales.length === 0 ? <p className="empty-state">目前没有已删除的礼物卡销售记录。</p> : <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table"><thead><tr><th>营业日</th><th>序列号</th><th>金额</th><th>操作人</th><th>删除时间</th><th>删除原因</th><th>操作</th></tr></thead><tbody>{giftCardSales.map(sale => <tr key={sale.id}><td>{sale.businessDate.slice(0, 10)}</td><td>{sale.serialNumber}</td><td>{formatUsd(sale.amountCents)}</td><td>{sale.operator.displayName}</td><td>{sale.deletedAt ? time(sale.deletedAt) : "—"}</td><td>{sale.deleteReason || "未填写"}</td><td>{saleAction(sale)}</td></tr>)}</tbody></table></div>}>
        <ul className="mobile-data-list">{giftCardSales.map(sale => <li key={sale.id}><MobileDataCard title={`礼物卡 ${sale.serialNumber}`} subtitle={sale.businessDate.slice(0, 10)} actions={saleAction(sale)}>
          <RecordFacts items={[{ label: "金额", value: formatUsd(sale.amountCents) }, { label: "操作人", value: sale.operator.displayName }, { label: "删除时间", value: sale.deletedAt ? time(sale.deletedAt) : "—" }, { label: "删除原因", value: sale.deleteReason || "未填写", wide: true }]} />
        </MobileDataCard></li>)}</ul>
      </ResponsiveDataView>}
    </section>
  </section>;
}
