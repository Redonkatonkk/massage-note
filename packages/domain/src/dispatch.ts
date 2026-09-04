export type EmploymentType = "FULL_TIME" | "PART_TIME";

export interface RotationCandidate {
  membershipId: string;
  employmentType: EmploymentType;
  lastPosition: number | null;
  lastBusinessDate: string | null;
  addedAt: string;
}

/**
 * Produces the official daily order. Historical position is an ordering value:
 * second advances to first, third to second, and first moves behind everyone
 * with a non-first history. Members without history always start at the end.
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
      const targetDifference = target(left.lastPosition) - target(right.lastPosition);
      if (targetDifference !== 0) return targetDifference;

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

export interface NormalTurnCandidate {
  membershipId: string;
  normalTurnsProcessed: number;
  position: number;
}

export function sortNormalTurnCandidates<T extends NormalTurnCandidate>(
  candidates: T[],
): T[] {
  return [...candidates].sort(
    (left, right) =>
      left.normalTurnsProcessed - right.normalTurnsProcessed ||
      left.position - right.position ||
      left.membershipId.localeCompare(right.membershipId),
  );
}

export function initialProcessedTurnsForLateArrival(input: {
  nextNormalPosition: number | null;
  newPosition: number;
  minimumProcessedTurns: number;
}): number {
  if (input.nextNormalPosition === null) return 0;
  return input.minimumProcessedTurns +
    (input.newPosition < input.nextNormalPosition ? 1 : 0);
}
