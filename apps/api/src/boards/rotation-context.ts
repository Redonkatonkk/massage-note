import { Prisma } from "@massage-note/database";
import { explainRotationCandidates, rotateFullTimeOrder } from "@massage-note/domain";

const atUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const previousDate = (date: string) => new Date(atUtc(date).getTime() - 86400000).toISOString().slice(0, 10);
export function orderIds(value: Prisma.JsonValue): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === "string") && new Set(value).size === value.length ? value as string[] : null;
}
/** Read dated manual anchors, never infer a complete queue from visible rows. */
export async function fullTimeContext(tx: Prisma.TransactionClient, storeId: string, date: string) {
  const roster = await tx.storeMembership.findMany({ where: { storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true, employmentType: "FULL_TIME" }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], select: { id: true, joinedAt: true } });
  if (!roster.length) return { order: [] as string[], missingDate: null as string | null };
  const boards = await tx.dailyBoard.findMany({ where: { storeId, businessDate: { lte: atUtc(date) } }, orderBy: { businessDate: "desc" }, select: { businessDate: true, fullTimeOrderOverride: true, fullTimeOrder: true, rows: { where: { isHidden: false }, select: { id: true } } } });
  const byDate = new Map(boards.map(board => [board.businessDate.toISOString().slice(0, 10), board]));
  const today = byDate.get(date);
  const activeIds = new Set(roster.map(member => member.id));
  const existing = (order: string[]) => order.filter(id => activeIds.has(id));
  const current = today && orderIds(today.fullTimeOrderOverride);
  if (current) return { order: [...existing(current), ...roster.map(member => member.id).filter(id => !current.includes(id))], missingDate: null };
  const days = [date];
  let cursor = previousDate(date);
  while (true) {
    const board = byDate.get(cursor);
    if (!board) return { order: null, missingDate: cursor };
    const anchor = orderIds(board.fullTimeOrderOverride);
    if (anchor) {
      let order = [...anchor];
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
        order = [...order, ...eligible.filter(id => !order.includes(id))];
      }
      return { order, missingDate: null };
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
    return { membershipId: row.membershipId, employmentType: row.membership.employmentType!, lastPosition: previous ? previous.board.rows.findIndex(item => item.membershipId === row.membershipId) + 1 : null, lastBusinessDate: previous?.board.businessDate.toISOString().slice(0, 10) ?? null };
  }));
  return { ...full, entries: explainRotationCandidates(candidates, full.order).map(entry => ({ ...entry, displayName: rows.find(row => row.membershipId === entry.membershipId)!.membership.displayName })) };
}
