import { Prisma } from "@massage-note/database";
import { explainRotationCandidates, moveFullTimeLeaveReturnersToTail, resolveFullTimeLeaveReturns, rotateFullTimeOrder, type FullTimeLeaveReturn } from "@massage-note/domain";
import { activeAuditWhere } from "../common/active-audit.js";

const atUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const previousDate = (date: string) => new Date(atUtc(date).getTime() - 86400000).toISOString().slice(0, 10);
export function orderIds(value: Prisma.JsonValue): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === "string") && new Set(value).size === value.length ? value as string[] : null;
}
/** Read dated manual anchors, never infer a complete queue from visible rows. */
export async function fullTimeContext(tx: Prisma.TransactionClient, storeId: string, date: string) {
  const roster = await tx.storeMembership.findMany({ where: { storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true, employmentType: "FULL_TIME" }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], select: { id: true, joinedAt: true } });
  if (!roster.length) return { order: [] as string[], missingDate: null as string | null, leaveReturns: [] as FullTimeLeaveReturn[] };
  const boards = await tx.dailyBoard.findMany({ where: { storeId, businessDate: { lte: atUtc(date) } }, orderBy: { businessDate: "desc" }, select: { businessDate: true, fullTimeOrderOverride: true, fullTimeOrder: true, rows: { where: { isHidden: false }, select: { membershipId: true } } } });
  // Only new, explicitly qualified operations are leave signals. Older missing
  // rows and later weekly-template edits cannot manufacture historical leave.
  const leaves = await tx.auditLog.findMany({
    where: { storeId, businessDate: { lte: atUtc(date) }, action: { in: ["board.row_removed", "board.row_hidden"] },
      afterJson: { path: ["isFullTimeLeave"], equals: true }, AND: await activeAuditWhere(tx, storeId) },
    select: { businessDate: true, beforeJson: true, afterJson: true },
  });
  const returns = resolveFullTimeLeaveReturns(
    boards.map(board => ({ businessDate: board.businessDate.toISOString().slice(0, 10), membershipIds: board.rows.map(row => row.membershipId) })),
    leaves.flatMap(leave => {
      if ((leave.afterJson as { isFullTimeLeaveUndone?: boolean } | null)?.isFullTimeLeaveUndone) return [];
      const membershipId = (leave.beforeJson as { membershipId?: string } | null)?.membershipId;
      return leave.businessDate && membershipId ? [{ membershipId, businessDate: leave.businessDate.toISOString().slice(0, 10) }] : [];
    }),
  );
  const returnsByDate = new Map<string, FullTimeLeaveReturn[]>();
  for (const entry of returns) {
    const entries = returnsByDate.get(entry.businessDate) ?? [];
    entries.push(entry);
    returnsByDate.set(entry.businessDate, entries);
  }
  const leaveReturns = returnsByDate.get(date) ?? [];
  const applyReturns = (order: string[], day: string) => moveFullTimeLeaveReturnersToTail(order, new Set((returnsByDate.get(day) ?? []).map(entry => entry.membershipId)));
  const byDate = new Map(boards.map(board => [board.businessDate.toISOString().slice(0, 10), board]));
  const today = byDate.get(date);
  const activeIds = new Set(roster.map(member => member.id));
  const existing = (order: string[]) => order.filter(id => activeIds.has(id));
  const current = today && orderIds(today.fullTimeOrderOverride);
  if (current) return { order: applyReturns([...existing(current), ...roster.map(member => member.id).filter(id => !current.includes(id))], date), missingDate: null, leaveReturns };
  const days = [date];
  let cursor = previousDate(date);
  while (true) {
    const board = byDate.get(cursor);
    if (!board) return { order: null, missingDate: cursor, leaveReturns };
    const anchor = orderIds(board.fullTimeOrderOverride);
    if (anchor) {
      let order = applyReturns([...anchor], cursor);
      for (const day of days.reverse()) {
        const snapshot = byDate.get(day);
        // Historical snapshots describe membership of the internal queue, not
        // a new ordering anchor. Ordinary row moves never change this cohort.
        const recorded = snapshot && orderIds(snapshot.fullTimeOrder);
        const eligible = day === date ? roster.map(member => member.id) : recorded ?? [
          ...order,
          ...roster.filter(member => member.joinedAt.toISOString().slice(0, 10) > cursor && member.joinedAt.toISOString().slice(0, 10) <= day).map(member => member.id),
        ];
        const retained = order.filter(id => eligible.includes(id));
        if (!snapshot || snapshot.rows.length) order = rotateFullTimeOrder(retained);
        else order = retained;
        order = applyReturns([...order, ...eligible.filter(id => !order.includes(id))], day);
      }
      return { order, missingDate: null, leaveReturns };
    }
    days.push(cursor);
    cursor = previousDate(cursor);
  }
}
export async function rotationContext(tx: Prisma.TransactionClient, storeId: string, date: string, rows: Array<{ membershipId: string; membership: { displayName: string; employmentType: "FULL_TIME" | "PART_TIME" | null } }>) {
  const full = await fullTimeContext(tx, storeId, date);
  if (!full.order) return { ...full, entries: null };
  const candidates = await Promise.all(rows.map(async row => {
    const previous = await tx.dailyEmployeeRow.findFirst({ where: { storeId, membershipId: row.membershipId, isHidden: false, board: { businessDate: { lt: atUtc(date) } } }, orderBy: { board: { businessDate: "desc" } }, select: { board: { select: { businessDate: true, rows: { where: { isHidden: false }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { membershipId: true } } } } } });
    const leave = row.membership.employmentType === "FULL_TIME" && full.leaveReturns.find(entry => entry.membershipId === row.membershipId);
    return { membershipId: row.membershipId, employmentType: row.membership.employmentType!, lastPosition: previous ? previous.board.rows.findIndex(item => item.membershipId === row.membershipId) + 1 : null, lastBusinessDate: previous?.board.businessDate.toISOString().slice(0, 10) ?? null, ...(leave ? { leaveStartDate: leave.leaveStartDate } : {}) };
  }));
  return { ...full, entries: explainRotationCandidates(candidates, full.order).map(entry => ({ ...entry, displayName: rows.find(row => row.membershipId === entry.membershipId)!.membership.displayName })) };
}
