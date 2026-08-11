export type StoreRole = "OWNER" | "MANAGER" | "EMPLOYEE";

export interface StoreSummary {
  id: string;
  storeCode: string;
  name: string;
  timezone: string;
  businessCutoffLocal: string;
  globalCommissionBps?: number;
  status: string;
  version?: number;
}

export interface MembershipSummary {
  id: string;
  role: StoreRole;
  displayName: string;
  isServiceProvider: boolean;
  store: StoreSummary;
}

export interface MeResponse {
  id: string;
  phoneE164: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  needsProfile: boolean;
  hasPassword: boolean;
  memberships: MembershipSummary[];
}

export interface StoreMember {
  id: string;
  role: StoreRole;
  displayName: string;
  isServiceProvider: boolean;
  status: string;
  version: number;
  defaultCommissionBps: number | null;
  deletedAt: string | null;
  user?: { id: string; firstName: string | null; lastName: string | null };
}

export interface StoreDetails extends StoreSummary {
  globalCommissionBps: number;
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: number;
  mondayThursdayAutoDiscountAmountCents: number;
  version: number;
  ownerMembershipId: string | null;
  ownerMembership: null | { id: string; displayName: string; userId: string };
}

export interface JoinRequest {
  id: string;
  requestedDisplayName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  version: number;
  createdAt: string;
  user: { id: string; firstName: string | null; lastName: string | null };
}

export interface CommissionHistoryResponse {
  membership: StoreMember;
  defaultHistory: Array<{
    id: string;
    commissionBps: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
  itemHistory: Array<{
    id: string;
    itemType: "SERVICE" | "ADDON";
    itemId: string;
    commissionBps: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
}

export interface AuditLogItem {
  id: string;
  source: string;
  action: string;
  entityType: string;
  entityId: string;
  businessDate: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  requestId: string;
  createdAt: string;
  actor: null | { id: string; displayName: string; role: StoreRole };
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor: string | null;
}

export interface AiPreview {
  previewId: string;
  operation: "CREATE_WORK_RECORD" | "UPDATE_WORK_RECORD" | "DELETE_WORK_RECORD";
  expiresAt: string;
  target: Record<string, unknown>;
  before: unknown;
  after: Record<string, unknown>;
  warnings: string[];
}

export interface AiMessageResponse {
  conversationId: string;
  answer: string;
  preview?: AiPreview | null;
  context?: { filters: FinanceSummaryResponse["filters"]; totals: FinanceSummaryResponse["totals"] };
  providerConfigured: boolean;
}

export interface ServicePriceOption {
  id: string;
  durationMinutes: number;
  priceCents: number;
  position: number;
}

export interface ServiceItem {
  id: string;
  position: number;
  fullName: string;
  shortName: string;
  priceOptions: ServicePriceOption[];
  defaultCommissionBps: number | null;
  isEnabled: boolean;
  deletedAt: string | null;
  version: number;
}

export interface AddonItem {
  id: string;
  position: number;
  name: string;
  shortName: string;
  amountCents: number;
  durationMinutes: number | null;
  defaultCommissionBps: number | null;
  isEnabled: boolean;
  deletedAt: string | null;
  version: number;
}

export interface DiscountItem {
  id: string;
  position: number;
  name: string;
  shortName: string;
  amountCents: number;
  isEnabled: boolean;
  deletedAt: string | null;
  version: number;
}

export interface CatalogResponse {
  serviceItems: ServiceItem[];
  addonItems: AddonItem[];
  discountItems: DiscountItem[];
}

export interface ServiceSnapshot {
  sourceServiceItemId: string | null;
  isCustom: boolean;
  name: string;
  shortName: string;
  amountCents: number;
  durationMinutes: number;
  commissionBps: number;
  commissionSource: string;
  wageCents: number;
}

export interface AddonSnapshot {
  id: string;
  sourceAddonItemId: string | null;
  isCustom: boolean;
  name: string;
  shortName: string;
  amountCents: number;
  durationMinutes: number | null;
  commissionBps: number;
  commissionSource: string;
  wageCents: number;
  position: number;
}

export interface DiscountSnapshot {
  id: string;
  sourceDiscountItemId: string | null;
  isCustom: boolean;
  isAutomatic: boolean;
  name: string;
  amountCents: number;
  position: number;
}

export interface WorkRecord {
  id: string;
  employeeMembershipId: string;
  businessDate: string;
  storeTimezoneSnapshot: string;
  businessCutoffSnapshot: string;
  startAt: string;
  endAt: string | null;
  actualDurationMinutes: number | null;
  status: "PENDING_PAYMENT" | "CONFIRMED";
  mainServiceAmountCents: number;
  addonTotalCents: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  cashServiceCents: number | null;
  cardServiceCents: number | null;
  cashTipCents: number | null;
  cardTipCents: number | null;
  totalTipCents: number | null;
  actualServiceCollectedCents: number | null;
  customerTotalPaidCents: number | null;
  paymentDifferenceCents: number | null;
  mainServiceWageCents: number;
  addonWageCents: number;
  totalLargeFeeWageCents: number;
  employeeTotalIncomeCents: number | null;
  tipSettledManualFlag: boolean;
  largeFeeSettledManualFlag: boolean;
  note: string;
  version: number;
  deletedAt: string | null;
  serviceSnapshot: ServiceSnapshot | null;
  addonSnapshots: AddonSnapshot[];
  discountSnapshots: DiscountSnapshot[];
  payment: {
    cashServiceCents: number;
    cardServiceCents: number;
    cashTipCents: number;
    cardTipCents: number;
  } | null;
}

export interface DeletedWorkRecord extends WorkRecord {
  employee: { id: string; displayName: string; role: StoreRole; isServiceProvider: boolean };
  deletedBy: string | null;
  deleteReason: string | null;
}

export interface BoardStatistics {
  recordCount: number;
  grossFeeBaseCents: number;
  discountedFeePerformanceCents: number;
  totalTipCents: number;
  totalLargeFeeWageCents: number;
  employeeIncomeCents: number;
}

export interface Shift {
  id: string;
  membershipId: string;
  clockInAt: string;
  clockOutAt: string | null;
  version: number;
}

export interface BoardRow {
  id: string;
  membershipId: string;
  position: string | number;
  isHidden: boolean;
  version: number;
  membership: Pick<
    StoreMember,
    "id" | "displayName" | "role" | "isServiceProvider" | "status"
  >;
  shifts: Shift[];
  workRecords: WorkRecord[];
  statistics: BoardStatistics;
}

export interface BoardResponse {
  id: string | null;
  storeId: string;
  businessDate: string;
  version: number;
  isClosed: boolean;
  rows: BoardRow[];
  statistics: BoardStatistics;
}

export interface CurrentBusinessDay {
  businessDate: string;
  timezone: string;
  businessCutoffLocal: string;
  serverTime: string;
}

export interface FinanceTotals {
  recordCount: number;
  incompleteRecordCount: number;
  mainServiceAmountCents: number;
  addonTotalCents: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  actualServiceCollectedCents: number;
  cashServiceCents: number;
  cardServiceCents: number;
  cashTipCents: number;
  cardTipCents: number;
  totalTipCents: number;
  customerTotalPaidCents: number;
  totalLargeFeeWageCents: number;
  employeeIncomeCents: number;
  cashAcquiredServiceWageCents: number;
}

export interface EmployeeBalance {
  membershipId: string;
  displayName: string;
  role: StoreRole;
  excludedOwner: boolean;
  cumulativeEmployeeIncomeCents: number;
  settledCashAcquiredCents: number;
  payrollPaidCents: number;
  rawBalanceCents: number;
  employerOwesCents: number;
  overpaidCents: number;
}

export interface FinanceSummaryResponse {
  filters: {
    dateFrom: string;
    dateTo: string;
    membershipIds: string[];
    paymentMethod: "ALL" | "CASH" | "CARD";
    amountType: "ALL" | "SERVICE" | "TIP";
  };
  totals: FinanceTotals & {
    payrollPaidWithinRangeCents: number;
    settledCashAcquiredWithinRangeCents: number;
    employerOwesCents: number;
    overpaidCents: number;
  };
  employees: Array<
    FinanceTotals & {
      membershipId: string;
      displayName: string;
      role: StoreRole;
    }
  >;
  days: Array<FinanceTotals & { businessDate: string }>;
  balances: EmployeeBalance[];
}

export interface FinanceDetailsResponse {
  filters: FinanceSummaryResponse["filters"];
  records: Array<WorkRecord & {
    employee: { id: string; displayName: string; role: StoreRole };
  }>;
}

export interface CashSettlementRow {
  membershipId: string;
  displayName: string;
  role: StoreRole;
  cashServiceCents: number;
  cashTipCents: number;
  cashReceivedCents: number;
  cashAllocatedServiceWageCents: number;
  cashAcquiredServiceWageCents: number;
  cashWageShortfallCents: number;
  cashRetainedCents: number;
  cashToSubmitToStoreCents: number;
  status: "UNSETTLED" | "SETTLED";
  note: string;
  settledBy: string | null;
  settledByDisplayName: string | null;
  settledAt: string | null;
  version: number;
  settlementId: string | null;
}

export interface CashSettlementResponse {
  storeId: string;
  businessDate: string;
  rows: CashSettlementRow[];
}

export interface ClosingWarning {
  code: string;
  labelZh: string;
  count: number;
  recordIds: string[];
}

export interface ClosingTotals {
  recordCount: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  totalTipCents: number;
  customerTotalPaidCents: number;
  totalLargeFeeWageCents: number;
  employeeIncomeCents: number;
  incompleteRecordCount: number;
}

export interface ClosingEmployeeTotals extends ClosingTotals {
  membershipId: string;
  displayName: string;
  role: StoreRole;
}

export interface ActiveClosingSummary {
  id: string;
  cycleNo: number;
  status: string;
  isForced: boolean;
  version: number;
  closedAt: string;
}

export interface ClosingPreview {
  storeId: string;
  businessDate: string;
  isClosed: boolean;
  activeClosing: ActiveClosingSummary | null;
  hasWarnings: boolean;
  warningCount: number;
  warnings: ClosingWarning[];
  employees: ClosingEmployeeTotals[];
  storeTotals: ClosingTotals;
}

export interface EmployeeClosingPreview {
  storeId: string;
  storeName: string;
  businessDate: string;
  isClosed: boolean;
  activeClosing: ActiveClosingSummary | null;
  hasWarnings: boolean;
  warningCount: number;
  warnings: ClosingWarning[];
  employee: ClosingEmployeeTotals;
}

export interface PayrollSettlement {
  id: string;
  membershipId: string;
  settlementDate: string;
  periodStart: string;
  periodEnd: string;
  serviceWageCents: number;
  cashTipCents: number;
  cardTipCents: number;
  adjustmentCents: number;
  totalPaidCents: number;
  paymentMethod: "CASH" | "CARD" | "CHECK" | "ZELLE" | "OTHER";
  note: string;
  createdBy: string;
  updatedBy: string;
  createdByDisplayName: string;
  updatedByDisplayName: string;
  historyChangedAfterSettlement: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  deleteReason: string | null;
  membership: Pick<StoreMember, "id" | "displayName" | "role" | "status">;
}
