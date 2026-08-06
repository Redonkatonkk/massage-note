export type StoreRole = "OWNER" | "MANAGER" | "EMPLOYEE";

export type StoreCapability =
  | "WORK_RECORD_READ_TODAY_ALL"
  | "WORK_RECORD_WRITE_TODAY_ALL"
  | "WORK_RECORD_WRITE_HISTORY"
  | "FINANCE_READ_SELF"
  | "FINANCE_READ_STORE"
  | "CATALOG_MANAGE"
  | "MEMBERSHIP_MANAGE"
  | "DAY_CLOSE_MANAGE"
  | "CASH_SETTLEMENT_MANAGE"
  | "PAYROLL_MANAGE"
  | "AUDIT_READ_STORE"
  | "STORE_SETTINGS_MANAGE"
  | "OWNER_TRANSFER"
  | "STORE_DELETE";

const employeeCapabilities = new Set<StoreCapability>([
  "WORK_RECORD_READ_TODAY_ALL",
  "WORK_RECORD_WRITE_TODAY_ALL",
  "FINANCE_READ_SELF",
]);

const managerCapabilities = new Set<StoreCapability>([
  ...employeeCapabilities,
  "WORK_RECORD_WRITE_HISTORY",
  "FINANCE_READ_STORE",
  "CATALOG_MANAGE",
  "MEMBERSHIP_MANAGE",
  "DAY_CLOSE_MANAGE",
  "CASH_SETTLEMENT_MANAGE",
  "PAYROLL_MANAGE",
  "AUDIT_READ_STORE",
  "STORE_SETTINGS_MANAGE",
]);

const ownerCapabilities = new Set<StoreCapability>([
  ...managerCapabilities,
  "OWNER_TRANSFER",
  "STORE_DELETE",
]);

export function hasStoreCapability(
  role: StoreRole,
  capability: StoreCapability,
): boolean {
  switch (role) {
    case "OWNER":
      return ownerCapabilities.has(capability);
    case "MANAGER":
      return managerCapabilities.has(capability);
    case "EMPLOYEE":
      return employeeCapabilities.has(capability);
  }
}

export function canReadEmployeeFinance(input: {
  role: StoreRole;
  actorMembershipId: string;
  targetMembershipId: string;
}): boolean {
  return (
    input.actorMembershipId === input.targetMembershipId ||
    hasStoreCapability(input.role, "FINANCE_READ_STORE")
  );
}

export function canWriteWorkRecord(input: {
  role: StoreRole;
  isCurrentBusinessDay: boolean;
  isDayClosed: boolean;
}): boolean {
  if (input.isDayClosed) return false;
  if (input.isCurrentBusinessDay) {
    return hasStoreCapability(input.role, "WORK_RECORD_WRITE_TODAY_ALL");
  }
  return hasStoreCapability(input.role, "WORK_RECORD_WRITE_HISTORY");
}

