export type EmploymentType = "FULL_TIME" | "PART_TIME";

export interface RotationCandidate {
  membershipId: string;
  employmentType: EmploymentType;
  lastPosition: number | null;
  lastBusinessDate: string | null;
  addedAt: string;
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

      const target = (position: number | null) => {
        if (position === null) return Number.POSITIVE_INFINITY;
        return position <= 1 ? Number.MAX_SAFE_INTEGER : position - 1;
      };
      const leftTarget = target(left.lastPosition);
      const rightTarget = target(right.lastPosition);
      if (leftTarget !== rightTarget) return leftTarget < rightTarget ? -1 : 1;

      if (left.employmentType !== right.employmentType) {
        return left.employmentType === "FULL_TIME" ? -1 : 1;
      }

      const dateDifference = (right.lastBusinessDate ?? "").localeCompare(
        left.lastBusinessDate ?? "",
      );
      if (dateDifference !== 0) return dateDifference;

      const addedDifference = left.addedAt.localeCompare(right.addedAt);
      if (addedDifference !== 0) return addedDifference;
      return left.membershipId.localeCompare(right.membershipId);
    })
    .map((candidate) => candidate.membershipId);
}
