"use client";

import type { ClosingDeliveryItem, ClosingDeliveryList, ClosingDeliveryStatus } from "../lib/types";

const statusLabels: Record<ClosingDeliveryStatus, string> = {
  QUEUED: "排队",
  CLAIMED: "发送中",
  SENT: "已发送",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";

interface ClosingDeliveryQueueProps {
  value: ClosingDeliveryList;
  busy: boolean;
  onCancel: (delivery: ClosingDeliveryItem) => void;
}

export function ClosingDeliveryQueue({ value, busy, onCancel }: ClosingDeliveryQueueProps) {
  const deliveries = value.deliveries;
  if (deliveries.length === 0) return null;

  return (
    <div className="closing-delivery-queue">
      <div className="delivery-status-strip" aria-label="员工小结发送状态">
        {(Object.keys(statusLabels) as ClosingDeliveryStatus[]).map((status) => {
          const count = deliveries.filter((item) => item.status === status).length;
          return count > 0 ? <span key={status}>{statusLabels[status]} <strong>{count}</strong></span> : null;
        })}
      </div>
      <details className="delivery-queue-details">
        <summary>查看短信队列详情 <strong>{deliveries.length}</strong></summary>
        <div className="table-scroll">
          <table className="data-table delivery-queue-table">
            <thead>
              <tr><th>员工</th><th>接收号码</th><th>日结</th><th>类型</th><th>语言</th><th>状态</th><th>尝试</th><th>排队时间</th><th>发送时间／错误</th><th>操作</th></tr>
            </thead>
            <tbody>
              {deliveries.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.membership.displayName}</strong></td>
                  <td className={item.recipientPhoneE164 ? "delivery-phone" : "delivery-phone invalid"}>{item.recipientPhoneE164 || "号码缺失"}</td>
                  <td>第 {item.closing.cycleNo} 次</td>
                  <td>{item.kind === "INITIAL" ? "首次" : "补发"}</td>
                  <td>{item.locale === "zh_CN" ? "中文" : "English"}</td>
                  <td><span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></td>
                  <td>{item.attemptCount}</td>
                  <td>{formatTime(item.createdAt)}</td>
                  <td>{item.status === "SENT" ? formatTime(item.sentAt) : item.lastError || "—"}</td>
                  <td>{item.status === "QUEUED" ? <button className="table-action danger" type="button" disabled={busy} onClick={() => {
                    if (window.confirm(`确认取消 ${item.membership.displayName} 的这条短信发送任务？`)) onCancel(item);
                  }}>取消发送</button> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
