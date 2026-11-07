export type EmploymentType = "FULL_TIME" | "PART_TIME";
export interface RotationCandidate {
  membershipId: string;
  employmentType: EmploymentType;
  lastPosition: number | null;
  lastBusinessDate: string | null;
  leaveStartDate?: string;
}
export interface FullTimeLeave {
  membershipId: string;
  businessDate: string;
}
export interface FullTimeLeaveReturn extends FullTimeLeave {
  leaveStartDate: string;
}
/** Final daily attendance cancels same-day leave and consumes an earlier leave once. */
export function resolveFullTimeLeaveReturns(
  attendance: Array<{ businessDate: string; membershipIds: string[] }>,
  leaves: FullTimeLeave[],
): FullTimeLeaveReturn[] {
  const byDate = new Map<string, string[]>();
  for (const leave of leaves) {
    const ids = byDate.get(leave.businessDate) ?? [];
    ids.push(leave.membershipId);
    byDate.set(leave.businessDate, ids);
  }
  const pending = new Map<string, string>();
  const returns: FullTimeLeaveReturn[] = [];
  for (const day of [...attendance].sort((a, b) => a.businessDate.localeCompare(b.businessDate))) {
    const visible = new Set(day.membershipIds);
    for (const membershipId of byDate.get(day.businessDate) ?? []) {
      if (!visible.has(membershipId) && !pending.has(membershipId)) pending.set(membershipId, day.businessDate);
    }
    for (const membershipId of visible) {
      const leaveStartDate = pending.get(membershipId);
      if (leaveStartDate) {
        returns.push({ membershipId, businessDate: day.businessDate, leaveStartDate });
        pending.delete(membershipId);
      }
    }
  }
  return returns;
}
/** Move returners behind the entire queue, retaining both groups' relative order. */
export function moveFullTimeLeaveReturnersToTail(order: string[], returners: ReadonlySet<string>): string[] {
  return [...order.filter(id => !returners.has(id)), ...order.filter(id => returners.has(id))];
}
export function rotateFullTimeOrder(order: string[], days = 1): string[] {
  if (!order.length) return [];
  const offset = days % order.length;
  return [...order.slice(offset), ...order.slice(0, offset)];
}
export type FullTimeRotationHead = {
  businessDate: string;
  membershipId: string;
  displayName: string;
  employmentType: EmploymentType;
};
export type FullTimeRotationBasis = {
  rule: "LEGACY_ONE_STEP" | "PART_TIME_HEAD" | "FULL_TIME_HEAD" | "MANUAL_ORDER" | "CLOSED_DAY";
  referenceHead?: FullTimeRotationHead;
  movedMembershipIds: string[];
};
/** The actual first employee consumes the full-time turn only when full-time. */
export function advanceFullTimeOrder(order: string[], head: FullTimeRotationHead | null) {
  const index = head?.employmentType === "FULL_TIME" ? order.indexOf(head.membershipId) : -1;
  const fullTimeRotation: FullTimeRotationBasis = head?.employmentType === "PART_TIME"
    ? { rule: "PART_TIME_HEAD", referenceHead: head, movedMembershipIds: [] }
    : head && index >= 0
      ? { rule: "FULL_TIME_HEAD", referenceHead: head, movedMembershipIds: order.slice(0, index + 1) }
      : { rule: "LEGACY_ONE_STEP", movedMembershipIds: order.slice(0, 1) };
  return { order: rotateFullTimeOrder(order, fullTimeRotation.rule === "PART_TIME_HEAD" ? 0 : fullTimeRotation.movedMembershipIds.length), fullTimeRotation };
}
/** Reserve part-time slots, fill gaps with full-time staff, then append newcomers. */
export function rankRotationCandidates(candidates: RotationCandidate[], fullTimeOrder: string[] = [], fullTimeTailId?: string): string[] {
  const fullIndex = (id: string) => {
    const index = fullTimeOrder.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const byFullOrder = (a: RotationCandidate, b: RotationCandidate) => fullIndex(a.membershipId) - fullIndex(b.membershipId) || a.membershipId.localeCompare(b.membershipId);
  const byAttendance = (a: RotationCandidate, b: RotationCandidate) => (a.lastBusinessDate ?? "").localeCompare(b.lastBusinessDate ?? "") || a.membershipId.localeCompare(b.membershipId);
  const returning = candidates.filter(candidate => candidate.lastPosition !== null);
  const tail = returning.filter(candidate => candidate.employmentType === "PART_TIME" && candidate.lastPosition === 1).sort(byAttendance);
  const part = returning.filter(candidate => candidate.employmentType === "PART_TIME" && candidate.lastPosition! > 1)
    .sort((a, b) => a.lastPosition! - b.lastPosition! || byAttendance(a, b));
  const full = returning.filter(candidate => candidate.employmentType === "FULL_TIME").sort(byFullOrder);
  const capacity = returning.length - tail.length;
  const slots: Array<string | undefined> = Array.from({ length: capacity });
  let previous = 0;
  part.forEach((candidate, index) => {
    const position = Math.min(Math.max(candidate.lastPosition! - 1, previous + 1), capacity - (part.length - index - 1));
    slots[position - 1] = candidate.membershipId;
    previous = position;
  });
  let index = 0;
  const order = slots.map(id => id ?? full[index++]!.membershipId);
  const newcomers = candidates.filter(candidate => candidate.lastPosition === null).sort((a, b) =>
    a.employmentType !== b.employmentType ? a.employmentType === "FULL_TIME" ? -1 : 1
      : a.employmentType === "FULL_TIME" ? byFullOrder(a, b) : a.membershipId.localeCompare(b.membershipId));
  const result = [...order, ...tail.map(candidate => candidate.membershipId), ...newcomers.map(candidate => candidate.membershipId)];
  if (!fullTimeTailId) return result;
  const fullIds = new Set(candidates.filter(candidate => candidate.employmentType === "FULL_TIME").map(candidate => candidate.membershipId));
  if (!fullIds.has(fullTimeTailId)) return result;
  // Newcomers normally follow returning staff. The previous head's final-tail
  // priority also covers new full-time staff, while all part-time slots stay put.
  const fullSlots = result.filter(id => fullIds.has(id) && id !== fullTimeTailId).concat(fullTimeTailId);
  let fullSlot = 0;
  return result.map(id => fullIds.has(id) ? fullSlots[fullSlot++]! : id);
}
export function explainRotationCandidates(candidates: RotationCandidate[], fullTimeOrder: string[] = [], fullTimeTailId?: string) {
  const order = rankRotationCandidates(candidates, fullTimeOrder, fullTimeTailId);
  return order.map((membershipId, index) => {
    const candidate = candidates.find(item => item.membershipId === membershipId)!;
    const targetPosition = candidate.employmentType === "PART_TIME" && candidate.lastPosition !== null && candidate.lastPosition > 1 ? candidate.lastPosition - 1 : null;
    return {
      ...candidate, generatedPosition: index + 1, targetPosition,
      fullTimePosition: candidate.employmentType === "FULL_TIME" ? fullTimeOrder.indexOf(membershipId) + 1 || null : null,
      ties: candidate.employmentType !== "PART_TIME" || candidate.lastPosition === null ? [] : candidates.flatMap(other => {
        if (other.membershipId === membershipId || other.employmentType !== "PART_TIME" || other.lastPosition !== candidate.lastPosition) return [];
        return [{ membershipId: other.membershipId, ahead: index < order.indexOf(other.membershipId), rule: candidate.lastBusinessDate !== other.lastBusinessDate ? "EARLIER_ATTENDANCE" as const : "STABLE_ID" as const }];
      }),
    };
  });
}
