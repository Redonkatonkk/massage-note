import { basisPoints, type BasisPoints } from "./money.js";

export type CommissionSource =
  | "EMPLOYEE_ITEM"
  | "ITEM_DEFAULT"
  | "EMPLOYEE_DEFAULT"
  | "STORE_DEFAULT";

export interface CommissionResolution {
  bps: BasisPoints;
  source: CommissionSource;
}

export interface ResolveCommissionInput {
  employeeItemBps?: BasisPoints | null;
  itemDefaultBps?: BasisPoints | null;
  employeeDefaultBps?: BasisPoints | null;
  storeDefaultBps: BasisPoints;
}

export function resolveCommission(
  input: ResolveCommissionInput,
): CommissionResolution {
  if (input.employeeItemBps != null) {
    return {
      bps: basisPoints(input.employeeItemBps),
      source: "EMPLOYEE_ITEM",
    };
  }
  if (input.employeeDefaultBps != null) {
    return {
      bps: basisPoints(input.employeeDefaultBps),
      source: "EMPLOYEE_DEFAULT",
    };
  }
  if (input.itemDefaultBps != null) {
    return {
      bps: basisPoints(input.itemDefaultBps),
      source: "ITEM_DEFAULT",
    };
  }
  return {
    bps: basisPoints(input.storeDefaultBps),
    source: "STORE_DEFAULT",
  };
}

export function resolveCustomItemCommission(input: {
  employeeDefaultBps?: BasisPoints | null;
  storeDefaultBps: BasisPoints;
}): CommissionResolution {
  if (input.employeeDefaultBps != null) {
    return {
      bps: basisPoints(input.employeeDefaultBps),
      source: "EMPLOYEE_DEFAULT",
    };
  }
  return {
    bps: basisPoints(input.storeDefaultBps),
    source: "STORE_DEFAULT",
  };
}
