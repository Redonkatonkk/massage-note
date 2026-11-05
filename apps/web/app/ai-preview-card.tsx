import { aiPreviewRows, previewValue } from "../lib/ai-preview";
import type { AiPreview } from "../lib/types";

const operationText = {
  CREATE_WORK_RECORD: "新增记工",
  UPDATE_WORK_RECORD: "修改记工",
  DELETE_WORK_RECORD: "删除记工",
} as const;

export function AiPreviewCard({
  preview,
  timezone,
  busy,
  confirm,
  cancel,
}: {
  preview: AiPreview;
  timezone: string;
  busy: boolean;
  confirm: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}) {
  const rows = aiPreviewRows(preview, timezone);
  return (
    <section className={`ai-preview ${preview.operation === "DELETE_WORK_RECORD" ? "delete" : ""}`}>
      <header>
        <div>
          <strong>{operationText[preview.operation]}</strong>
          <span>预览将在 {new Date(preview.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 过期</span>
        </div>
        <em>尚未写入</em>
      </header>
      <dl>{rows.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{previewValue(value)}</dd></div>)}</dl>
      {preview.warnings.length > 0 && <div className="preview-warnings">{preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
      <div className="preview-actions">
        <button className={preview.operation === "DELETE_WORK_RECORD" ? "danger-button" : "primary-action"} type="button" disabled={busy} onClick={() => void confirm(preview.previewId)}>确认执行</button>
        <button className="secondary-action" type="button" disabled={busy} onClick={() => void cancel(preview.previewId)}>放弃</button>
      </div>
    </section>
  );
}
