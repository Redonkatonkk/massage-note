import { formatUsdPrecise } from "../../lib/money";
import type { PayrollSettlement } from "../../lib/types";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";
import { dateOnly } from "./date-utils";

export function PayrollLedger({ settlements, canManage, busy, onEdit, onDelete, onRestore }: {
  settlements: PayrollSettlement[]; canManage: boolean; busy: boolean;
  onEdit: (item: PayrollSettlement) => void; onDelete: (item: PayrollSettlement) => void; onRestore: (item: PayrollSettlement) => void;
}) {
  const scope = (item: PayrollSettlement) => item.paymentScope === "CASH" ? "现金" : item.paymentScope === "NON_CASH" ? "刷卡＋礼物卡" : item.paymentScope === "ALL" ? "全部" : "历史记录未指定";
  const actions = (item: PayrollSettlement) => !canManage ? null : item.deletedAt
    ? <button className="table-action" type="button" disabled={busy} onClick={() => onRestore(item)}>恢复</button>
    : <><button className="table-action" type="button" disabled={busy} onClick={() => onEdit(item)}>修改</button><button className="table-action danger" type="button" disabled={busy} onClick={() => onDelete(item)}>删除</button></>;
  if (!settlements.length) return <p className="empty-state">还没有工资结算记录。</p>;
  return <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>日期范围</th><th>金额</th><th>工资来源</th>{canManage && <th>操作</th>}</tr></thead><tbody>{settlements.map(item => <tr key={item.id} className={item.deletedAt ? "deleted-row" : undefined}><td>{item.membership.displayName}</td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}{item.historyChangedAfterSettlement && <strong className="history-warning">结算后历史数据发生过修改</strong>}</td><td>{formatUsdPrecise(item.totalPaidCents)}</td><td>{scope(item)}</td>{canManage && <td><span className="table-actions">{actions(item)}</span></td>}</tr>)}</tbody></table></div>}>
    <ul className="mobile-data-list">{settlements.map(item => <li key={item.id}><MobileDataCard title={item.membership.displayName} subtitle={`${dateOnly(item.periodStart)} 至 ${dateOnly(item.periodEnd)}`} status={item.deletedAt ? <span className="status-chip warning">已删除</span> : undefined} actions={actions(item)}>
      <RecordFacts items={[{ label: "实付工资", value: formatUsdPrecise(item.totalPaidCents) }, { label: "工资来源", value: scope(item) }]} />
      {item.historyChangedAfterSettlement && <p className="history-warning">结算后历史数据发生过修改</p>}
    </MobileDataCard></li>)}</ul>
  </ResponsiveDataView>;
}
