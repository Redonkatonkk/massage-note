"use client";

import { useMemo, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import type { GiftCardSale, StoreMember } from "../lib/types";

interface GiftCardSalesProps {
  storeId: string;
  businessDate: string;
  sales: GiftCardSale[];
  members: StoreMember[];
  defaultOperatorMembershipId: string;
  canEdit: boolean;
  onReload: () => Promise<void>;
}

function money(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function cents(value: string, label: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) {
    throw new Error(`${label}必须是非负金额，最多保留两位小数`);
  }
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result)) throw new Error(`${label}超出系统允许范围`);
  return result;
}

export function GiftCardSales({
  storeId,
  businessDate,
  sales,
  members,
  defaultOperatorMembershipId,
  canEdit,
  onReload,
}: GiftCardSalesProps) {
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "ACTIVE" && !member.deletedAt),
    [members],
  );
  const [editing, setEditing] = useState<GiftCardSale | null | undefined>(undefined);
  const [serialNumber, setSerialNumber] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [operatorMembershipId, setOperatorMembershipId] = useState(
    defaultOperatorMembershipId,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cashCents = cashAmount.trim() === ""
    ? 0
    : /^\d+(?:\.\d{0,2})?$/.test(cashAmount.trim())
      ? Math.round(Number(cashAmount) * 100)
      : null;
  const cardCents = cardAmount.trim() === ""
    ? 0
    : /^\d+(?:\.\d{0,2})?$/.test(cardAmount.trim())
      ? Math.round(Number(cardAmount) * 100)
      : null;
  const totalCents = cashCents !== null && cardCents !== null
    ? cashCents + cardCents
    : null;

  function openCreate() {
    setEditing(null);
    setSerialNumber("");
    setCashAmount("");
    setCardAmount("");
    setOperatorMembershipId(
      activeMembers.some((member) => member.id === defaultOperatorMembershipId)
        ? defaultOperatorMembershipId
        : (activeMembers[0]?.id ?? ""),
    );
    setError("");
  }

  function openEdit(sale: GiftCardSale) {
    setEditing(sale);
    setSerialNumber(sale.serialNumber);
    setCashAmount(dollars(sale.cashCents));
    setCardAmount(dollars(sale.cardCents));
    setOperatorMembershipId(sale.operatorMembershipId);
    setError("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const input = {
        serialNumber: serialNumber.trim(),
        cashCents: cashAmount.trim() === "" ? 0 : cents(cashAmount, "现金金额"),
        cardCents: cardAmount.trim() === "" ? 0 : cents(cardAmount, "刷卡金额"),
        operatorMembershipId,
      };
      if (!input.serialNumber) throw new Error("请填写礼物卡序列号");
      if (!input.operatorMembershipId) throw new Error("请选择操作人");
      if (input.cashCents + input.cardCents <= 0) throw new Error("付款总额必须大于 0");
      if (editing) {
        await apiRequest(`/stores/${storeId}/gift-card-sales/${editing.id}`, {
          method: "PATCH",
          idempotent: true,
          body: { version: editing.version, ...input },
        });
        setNotice("礼物卡销售记录已更新");
      } else {
        await apiRequest(`/stores/${storeId}/gift-card-sales`, {
          method: "POST",
          idempotent: true,
          body: { businessDate, ...input },
        });
        setNotice("礼物卡销售已记录，金额全部计入店铺收入");
      }
      setEditing(undefined);
      await onReload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!window.confirm("确认删除这条礼物卡销售记录吗？店铺收入会同步更新。")) return;
    const answer = window.prompt("删除原因（可不填）");
    if (answer === null) return;
    setBusy(true);
    setError("");
    try {
      const reason = answer.trim();
      await apiRequest(`/stores/${storeId}/gift-card-sales/${editing.id}`, {
        method: "DELETE",
        idempotent: true,
        body: { version: editing.version, ...(reason ? { reason } : {}) },
      });
      setEditing(undefined);
      setNotice("礼物卡销售记录已删除");
      await onReload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gift-card-sales" aria-label="店铺礼物卡销售">
      <header className="gift-card-sales__header">
        <div>
          <p className="eyebrow">店铺项目</p>
          <h2>礼物卡销售</h2>
          <p>卖卡金额由现金＋刷卡自动计算，全部计入店铺收入，不参与员工分成。</p>
        </div>
        <div className="gift-card-sales__summary">
          <span>{sales.length} 张</span>
          <strong>{money(sales.reduce((sum, sale) => sum + sale.amountCents, 0))}</strong>
        </div>
      </header>
      <div className="gift-card-sales__track">
        {sales.map((sale) => (
          <button
            className="gift-card-sale-card"
            key={sale.id}
            type="button"
            disabled={!canEdit}
            onClick={() => openEdit(sale)}
          >
            <span><small>序列号</small><strong>{sale.serialNumber}</strong></span>
            <b>{money(sale.amountCents)}</b>
            <span className="gift-card-sale-card__payments">现金 {money(sale.cashCents)} · 刷卡 {money(sale.cardCents)}</span>
            <span className="gift-card-sale-card__operator">操作人 · {sale.operator.displayName}</span>
          </button>
        ))}
        {sales.length === 0 && <p className="gift-card-sales__empty">这个营业日还没有卖出礼物卡。</p>}
        {canEdit && (
          <button className="add-record gift-card-sales__add" type="button" onClick={openCreate}>
            <span aria-hidden="true">＋</span>记录卖卡
          </button>
        )}
      </div>
      {notice && <p className="success-banner" role="status">✓ {notice}</p>}

      {editing !== undefined && (
        <div className="modal-backdrop" role="presentation">
          <section className="quick-modal gift-card-sale-modal" role="dialog" aria-modal="true" aria-labelledby="gift-card-sale-title">
            <div className="modal-heading">
              <div><p className="eyebrow">礼物卡记工</p><h2 id="gift-card-sale-title">{editing ? "修改卖卡记录" : "记录卖出的礼物卡"}</h2></div>
              <button className="close-button" type="button" disabled={busy} onClick={() => setEditing(undefined)}>关闭</button>
            </div>
            <div className="gift-card-sale-form">
              <label className="field-label">礼物卡序列号<input autoFocus autoComplete="off" maxLength={120} value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></label>
              <label className="field-label">现金付款（美元）<input inputMode="decimal" placeholder="可留空，按 0 计算" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} /></label>
              <label className="field-label">刷卡付款（美元）<input inputMode="decimal" placeholder="可留空，按 0 计算" value={cardAmount} onChange={(event) => setCardAmount(event.target.value)} /></label>
              <label className="field-label">操作人<select value={operatorMembershipId} onChange={(event) => setOperatorMembershipId(event.target.value)}><option value="">请选择员工</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
              <div className="gift-card-sale-total"><span>礼物卡金额（自动计算）</span><strong>{totalCents === null ? "请检查付款金额" : money(totalCents)}</strong></div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer className="editor-actions gift-card-sale-actions">
              {editing ? <button className="delete-record" type="button" disabled={busy} onClick={() => void remove()}>删除记录</button> : <span />}
              <span />
              <button className="secondary-action" type="button" disabled={busy} onClick={() => setEditing(undefined)}>取消</button>
              <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{busy ? "正在保存…" : "保存卖卡记录"}</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
