export type EmploymentType = "FULL_TIME" | "PART_TIME";
export interface RotationCandidate {
  membershipId: string;
  employmentType: EmploymentType;
  lastPosition: number | null;
  lastBusinessDate: string | null;
}
export function rotateFullTimeOrder(order: string[], days = 1): string[] {
  if (!order.length) return [];
  const offset = days % order.length;
  return [...order.slice(offset), ...order.slice(0, offset)];
}
/** Reserve part-time slots, fill gaps with full-time staff, then append newcomers. */
export function rankRotationCandidates(candidates: RotationCandidate[], fullTimeOrder: string[] = []): string[] {
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
  return [...order, ...tail.map(candidate => candidate.membershipId), ...newcomers.map(candidate => candidate.membershipId)];
}
export function explainRotationCandidates(candidates: RotationCandidate[], fullTimeOrder: string[] = []) {
  const order = rankRotationCandidates(candidates, fullTimeOrder);
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
