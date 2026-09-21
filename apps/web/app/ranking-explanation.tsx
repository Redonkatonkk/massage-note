"use client";

import { useRef } from "react";
import type { BoardResponse } from "../lib/types";
import { rankingOrderChanged, rankingReason } from "../lib/ranking-explanation";
import { useLanguage } from "./language-provider";

export function RankingExplanationButton({ board }: { board: BoardResponse }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const text = (zh: string, english: string) => en ? english : zh;
  const snapshot = board.ranking.explanation;
  const visible = board.rows.filter((row) => !row.isHidden);
  const changed = snapshot && rankingOrderChanged(snapshot, visible.map((row) => row.membershipId));
  const currentIds = board.rows.map((row) => row.membershipId);
  const ids = [...visible.map((row) => row.membershipId), ...board.rows.filter((row) => row.isHidden).map((row) => row.membershipId), ...(snapshot?.entries.filter((entry) => !currentIds.includes(entry.membershipId)).map((entry) => entry.membershipId) ?? [])];

  return <>
    <button className="ranking-help-button" type="button" aria-label={text("查看今日排序依据", "View today's ranking explanation")} title={text("为什么这样排序？", "Why this order?")} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>?</button>
    <dialog ref={dialog} className="board-delivery-dialog ranking-explanation-dialog" aria-labelledby="ranking-explanation-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="modal-heading">
        <h2 id="ranking-explanation-title">{text("今日排序依据", "Today's ranking explanation")}</h2>
        <button className="close-button" type="button" onClick={() => dialog.current?.close()}>{text("关闭", "Close")}</button>
      </div>
      {!snapshot ? <p>{board.ranking.rankedAt
        ? text("上次生成时尚未保存排序依据。重新生成今日顺序后即可查看；重新生成会覆盖手动顺序。", "The previous ranking has no saved explanation. Generate the order again to save one; this will replace manual ordering.")
        : text("尚未生成今日顺序。生成后，这里会逐人说明排位原因。", "No order has been generated today. Generate it to see an explanation for each employee.")}</p> : <>
        <p className="field-help">{text("生成时间：", "Generated: ")}{new Date(snapshot.generatedAt).toLocaleString(locale, { hour12: false })}</p>
        {changed && <p className="ranking-change-notice" role="status">{text("生成后名单或顺序已调整。下方区分当前位置与生成时名次；原排序依据保持不变。", "The list or order has changed since generation. Current and generated positions are shown separately; the original explanation is preserved.")}</p>}
        <div className="ranking-explanation-list">
          {ids.map((id) => {
            const row = board.rows.find((item) => item.membershipId === id);
            const entry = snapshot.entries.find((item) => item.membershipId === id);
            const position = visible.findIndex((item) => item.membershipId === id) + 1;
            const name = row?.membership.displayName ?? entry?.displayName;
            const status = !row ? text("已移除", "Removed") : row.isHidden ? text("已隐藏，不参与当前排位", "Hidden; not in current order") : text(`当前第 ${position}`, `Current position ${position}`);
            return <article className="ranking-explanation-entry" key={id}>
              <h3>{name}<span>{status}</span></h3>
              {entry ? <>
                <p className="field-help">{text(`生成时第 ${entry.generatedPosition} · ${entry.employmentType === "FULL_TIME" ? "全职" : "兼职"}`, `Generated position ${entry.generatedPosition} · ${entry.employmentType === "FULL_TIME" ? "Full-time" : "Part-time"}`)}{entry.displayName !== name && text(` · 生成时姓名：${entry.displayName}`, ` · Name at generation: ${entry.displayName}`)}</p>
                {position > 0 && position !== entry.generatedPosition && <p>{text("当前位置已因生成后的名单或顺序调整而改变，不是原自动排位结果。", "The current position reflects later list or order changes, not the original generated result.")}</p>}
                <ul>{rankingReason(entry, snapshot, en).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
              </> : <p>{text("未参与上次生成（可能是之后新增、恢复显示，或当时已隐藏），没有本次自动排序依据。", "Not included in the last generation (added later, restored, or hidden then). No saved ranking explanation is available.")}</p>}
            </article>;
          })}
        </div>
      </>}
    </dialog>
  </>;
}
