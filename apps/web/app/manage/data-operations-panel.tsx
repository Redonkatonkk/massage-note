"use client";

import { useEffect, useRef, useState } from "react";
import { STORE_BACKUP_MAX_BYTES, storeBackupSchema, type StoreBackup, type StoreBackupMode, type StoreImportPreview } from "@massage-note/contracts";
import { apiRequest, errorMessage } from "../../lib/api";
import { clearStoreDataDrafts, downloadStoreBackup } from "../../lib/store-data";

export function DataOperationsPanel({ storeId, memberIds, onImported }: { storeId: string; memberIds: string[]; onImported: () => void }) {
  const [mode, setMode] = useState<StoreBackupMode>("anonymized");
  const [backup, setBackup] = useState<StoreBackup | null>(null);
  const [preview, setPreview] = useState<StoreImportPreview | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const key = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { controller.current = new AbortController(); return () => controller.current?.abort(); }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => { setDownloaded(false); setSaved(false); setPreview(null); setError("导入预览已过期，请重新校验文件"); }, Math.max(0, Date.parse(preview.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(signal); } catch (caught) { if (!signal.aborted) setError(errorMessage(caught)); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  function chooseFile(file?: File) {
    setBackup(null); setPreview(null); setDownloaded(false); setSaved(false); setConfirmName("");
    if (!file) return;
    void run(async signal => {
      if (file.size > STORE_BACKUP_MAX_BYTES) throw new Error("数据文件不能超过 50 MiB");
      const parsed = storeBackupSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("数据文件格式或版本不受支持");
      if (!signal.aborted) setBackup(parsed.data);
    });
  }
  return <section className="data-operations manage-card" aria-label="数据导入导出">
    <div className="manage-heading"><div><p className="eyebrow">单店铺数据文件</p><h2>导入与导出</h2></div></div>
    <div className="data-operations-grid">
      <section><h3>导出数据</h3><p className="field-help">下载一个 JSON 文件，可在另一套部署中导入。</p>
        <label>导出内容<select value={mode} disabled={busy} onChange={event => setMode(event.target.value as StoreBackupMode)}><option value="anonymized">脱敏演示数据</option><option value="full">完整数据</option></select></label>
        <p className="field-help">{mode === "anonymized" ? "替换姓名、电话、备注和身份标识；金额和日期保留真实值。" : "包含真实业务资料，请妥善保存完整备份。"}</p>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(async signal => { await downloadStoreBackup(storeId, mode, signal); if (!signal.aborted) setNotice("数据文件已准备下载"); })}>下载数据文件</button>
      </section>
      <section><h3>导入数据</h3><p className="field-help">导入会覆盖当前店铺的业务数据。其他成员需重新绑定账号，外部发送需重新配置。</p>
        <label>选择 JSON 文件<input ref={fileInput} type="file" accept=".json,application/json" disabled={busy} onChange={event => chooseFile(event.target.files?.[0])} /></label>
        <p className="field-help">支持完整或脱敏文件，最大 50 MiB。</p>
        <button type="button" className="secondary-action" disabled={busy || !backup} onClick={() => void run(async signal => {
          const value = await apiRequest<StoreImportPreview>(`/stores/${storeId}/data/import/preview`, { method: "POST", body: { backup }, signal });
          if (!signal.aborted) { setPreview(value); setDownloaded(false); setSaved(false); setConfirmName(""); key.current = crypto.randomUUID(); }
        })}>校验并预览</button>
      </section>
    </div>
    {preview && <section className="data-import-preview" aria-label="导入预览"><h3>确认覆盖当前店铺</h3>
      <dl className="record-facts"><div><dt>来源店铺</dt><dd>{preview.source.storeName}</dd></div><div><dt>目标店铺</dt><dd>{preview.targetName}</dd></div><div><dt>文件类型</dt><dd>{preview.mode === "anonymized" ? "脱敏演示数据" : "完整数据"}</dd></div><div><dt>营业日期范围</dt><dd>{preview.source.dateFrom && preview.source.dateTo ? `${preview.source.dateFrom} – ${preview.source.dateTo}` : "没有营业记录"}</dd></div></dl>
      <details><summary>查看各类记录数量</summary><dl className="record-facts">{Object.entries(preview.counts).map(([table, count]) => <div key={table}><dt>{tableLabels[table] ?? table}</dt><dd>{count}</dd></div>)}</dl></details>
      <p className="field-help">预览有效期十分钟；店铺数据发生变化后需要重新校验。</p>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(async signal => { await downloadStoreBackup(storeId, "full", signal, preview.previewId); if (!signal.aborted) setDownloaded(true); })}>下载覆盖前完整备份</button>
      <label className="data-import-check"><input type="checkbox" disabled={busy || !downloaded} checked={saved} onChange={event => setSaved(event.target.checked)} />我已保存完整备份，并确认覆盖当前店铺</label>
      <label>输入目标店铺名称确认<input value={confirmName} disabled={busy} autoComplete="off" onChange={event => setConfirmName(event.target.value)} /></label>
      <button type="button" className="secondary-action danger" disabled={busy || !downloaded || !saved || confirmName !== preview.targetName} onClick={() => void run(async signal => {
        await apiRequest(`/stores/${storeId}/data/import/confirm`, { method: "POST", headers: { "Idempotency-Key": key.current }, body: { backup, previewId: preview.previewId, confirmName }, signal });
        if (!signal.aborted) { clearStoreDataDrafts(storeId, memberIds); onImported(); }
      })}>确认覆盖导入</button>
    </section>}
    {busy && <p role="status">正在处理数据，请稍候…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

const tableLabels: Record<string, string> = {
  storeMembership: "成员档案", serviceItem: "主要项目", serviceItemPriceOption: "项目价格档位", addonItem: "额外项目", discountItem: "折扣项目",
  employeeDefaultCommission: "员工默认提成历史", employeeItemCommission: "员工项目提成历史", shift: "上下班记录", dailyBoard: "营业日表格", dailyEmployeeRow: "员工表格行",
  workRecord: "记工记录", workRecordServiceSnapshot: "记工项目快照", workRecordAddonSnapshot: "记工加项快照", workRecordDiscountSnapshot: "记工折扣快照", paymentBreakdown: "付款明细",
  giftCardSale: "礼物卡销售", lostCustomer: "跑客记录", businessDayClosing: "日结记录", dailyCashSettlement: "现金结算", payrollSettlement: "工资结算", payrollSettlementConfirmation: "工资确认记录",
  expenseItem: "店铺支出", expenseRuleRevision: "支出规则历史", expensePeriodOverride: "支出实际账单", workBotAlias: "记工黑话", auditLog: "操作历史",
};
