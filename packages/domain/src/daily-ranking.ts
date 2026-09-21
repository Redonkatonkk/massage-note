export type EmploymentType = "FULL_TIME" | "PART_TIME";

export interface RotationCandidate {
  membershipId: string;
  employmentType: EmploymentType;
  lastPosition: number | null;
  lastBusinessDate: string | null;
}

/**
 * Produces the opening order from each employee's most recent visible day.
 * Historical positions advance by one, the previous first moves behind other
 * historical employees, and employees without history remain at the end.
 */
export function rankRotationCandidates(
  candidates: RotationCandidate[],
): string[] {
  return [...candidates]
    .sort((left, right) => {
      const leftHasHistory = left.lastPosition !== null;
      const rightHasHistory = right.lastPosition !== null;
      if (leftHasHistory !== rightHasHistory) return leftHasHistory ? -1 : 1;

      const leftTarget = rotationTarget(left.lastPosition);
      const rightTarget = rotationTarget(right.lastPosition);
      if (leftTarget !== rightTarget) return leftTarget < rightTarget ? -1 : 1;

      if (left.employmentType !== right.employmentType) {
        return left.employmentType === "FULL_TIME" ? -1 : 1;
      }

      const dateDifference = (right.lastBusinessDate ?? "").localeCompare(
        left.lastBusinessDate ?? "",
      );
      if (dateDifference !== 0) return dateDifference;

      // Keep exact ties deterministic without using arrival time or input order.
      return left.membershipId.localeCompare(right.membershipId);
    })
    .map((candidate) => candidate.membershipId);
}

function rotationTarget(position: number | null): number {
  if (position === null) return Number.POSITIVE_INFINITY;
  return position <= 1 ? Number.MAX_SAFE_INTEGER : position - 1;
}

/** Explain exactly the same ordering used by rankRotationCandidates. */
export function explainRotationCandidates(candidates: RotationCandidate[]) {
  const order = rankRotationCandidates(candidates);
  return order.map((membershipId, index) => {
    const candidate = candidates.find((item) => item.membershipId === membershipId)!;
    return {
      ...candidate,
      generatedPosition: index + 1,
      ties: order.filter((id) => id !== membershipId).flatMap((id) => {
        const other = candidates.find((item) => item.membershipId === id)!;
        if (rotationTarget(candidate.lastPosition) !== rotationTarget(other.lastPosition)) return [];
        const rule = candidate.employmentType !== other.employmentType
          ? "EMPLOYMENT_TYPE" as const
          : candidate.lastBusinessDate !== other.lastBusinessDate
            ? "RECENT_ATTENDANCE" as const : "STABLE_ID" as const;
        return [{ membershipId: id, ahead: index < order.indexOf(id), rule }];
      }),
    };
  });
}
