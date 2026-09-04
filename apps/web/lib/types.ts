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
  automaticDispatchEnabled?: boolean;
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
  employmentType: "FULL_TIME" | "PART_TIME" | null;
  status: string;
  version: number;
  defaultCommissionBps: number | null;
  closingDeliveryEnabled: boolean;
  closingDeliveryPhoneE164: string | null;
  closingImageLocale: "zh_CN" | "en_US" | null;
  deletedAt: string | null;
  user?: null | { id: string; firstName: string | null; lastName: string | null; phoneE164?: string };
}

export interface StoreDetails extends StoreSummary {
  globalCommissionBps: number;
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: number;
  mondayThursdayAutoDiscountAmountCents: number;
  giftCardAutoDiscountEnabled: boolean;
  giftCardAutoDiscountThresholdCents: number;
  giftCardAutoDiscountBps: number;
  closingDefaultLocale: "zh_CN" | "en_US";
  version: number;
  ownerMembershipId: string | null;
  ownerMembership: null | { id: string; displayName: string; userId: string };
  automaticDispatchEnabled: boolean;
}

export type ClosingDeliveryStatus = "QUEUED" | "CLAIMED" | "SENT" | "FAILED" | "CANCELLED";

export interface ClosingDeliveryItem {
  id: string;
  closingId: string;
  membershipId: string;
  kind: "INITIAL" | "RESEND";
  status: ClosingDeliveryStatus;
  recipientPhoneE164: string;
  locale: "zh_CN" | "en_US";
  attemptCount: number;
  lastErrorCode: string | null;
  lastError: string | null;
  sentAt: string | null;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  closing: { cycleNo: number; status: string };
  membership: { displayName: string };
}

export interface ClosingDeliveryList {
  deliveries: ClosingDeliveryItem[];
  batchAllowed: boolean;
  batchBlockedReason: string | null;
  agent: null | {
    tokenPrefix: string;
    lastSeenAt: string | null;
    lastStatusJson: null | { messagesAvailable?: boolean; serviceTypes?: string[]; version?: string; lastError?: string | null };
    revokedAt: string | null;
  };
}

export type EmployeeSettlementPaymentScope = "CASH" | "NON_CASH" | "ALL";

export interface EmployeeSettlementRecord {
  id: string; businessDate: string; startAt: string; endAt: string | null;
  serviceName: string; serviceShortName: string;
  addons: Array<{ name: string; shortName: string }>;
  grossFeeBaseCents: number; cashServiceCents: number; cardServiceCents: number;
  giftCardServiceCents: number; nonCashServiceCents: number;
  cashLargeFeeWageCents: number; nonCashLargeFeeWageCents: number;
  cashTipCents: number; cardTipCents: number; giftCardTipCents: number; nonCashTipCents: number;
  cashIncomeCents: number; nonCashIncomeCents: number; totalIncomeCents: number;
}

export interface EmployeeSettlementPreview {
  storeId: string; storeName: string; storeTimezone: string;
  dateFrom: string; dateTo: string; paymentScope: EmployeeSettlementPaymentScope;
  employee: { membershipId: string; displayName: string };
  summary: {
    recordCount: number; cashServiceCents: number; nonCashServiceCents: number;
    cashLargeFeeWageCents: number; nonCashLargeFeeWageCents: number;
    cashTipCents: number; nonCashTipCents: number;
    cashIncomeCents: number; nonCashIncomeCents: number; totalIncomeCents: number;
  };
  records: EmployeeSettlementRecord[];
  generatedAt: string;
}

export interface EmployeeSettlementDelivery {
  id: string; membershipId: string | null; periodStart: string; periodEnd: string;
  documentType: "RANGE_SETTLEMENT" | "EMPLOYEE_SUMMARY";
  paymentScope: EmployeeSettlementPaymentScope; status: ClosingDeliveryStatus;
  recipientPhoneE164: string; locale: "zh_CN" | "en_US"; attemptCount: number;
  summarySentAt: string | null; detailSentAt: string | null; sentAt: string | null;
  lastErrorCode: string | null; lastError: string | null;
  createdAt: string; updatedAt: string; membership: { displayName: string } | null;
}

export interface EmployeeSettlementDeliveryList {
  deliveries: EmployeeSettlementDelivery[];
  agent: null | { lastSeenAt: string | null; lastStatusJson: null | { messagesAvailable?: boolean; lastError?: string | null }; revokedAt: string | null };
}

export interface JoinRequest {
  id: string;
  requestedDisplayName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  version: number;
  createdAt: string;
  user: { id: string; firstName: string | null; lastName: string | null };
}

export type JoinStoreResponse =
  | { autoMatched: true; membership: StoreMember }
  | (JoinRequest & { autoMatched: false });

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
  giftCardSerialNumber: string | null;
  giftCardServiceCents: number | null;
  cashTipCents: number | null;
  cardTipCents: number | null;
  giftCardTipCents: number | null;
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
  automaticDiscountSuppressed: boolean;
  isHighlighted: boolean;
  note: string;
  version: number;
  deletedAt: string | null;
  serviceSnapshot: ServiceSnapshot | null;
  addonSnapshots: AddonSnapshot[];
  discountSnapshots: DiscountSnapshot[];
  payment: {
    cashServiceCents: number;
    cardServiceCents: number;
    giftCardSerialNumber: string | null;
    giftCardServiceCents: number;
    cashTipCents: number;
    cardTipCents: number;
    giftCardTipCents: number;
  } | null;
}

export interface GiftCardSale {
  id: string;
  businessDate: string;
  serialNumber: string;
  faceValueCents: number;
  discountThresholdCents: number;
  discountRateBps: number;
  discountCents: number;
  cashCents: number;
  cardCents: number;
  amountCents: number;
  operatorMembershipId: string;
  operator: Pick<StoreMember, "id" | "displayName" | "role" | "status">;
  version: number;
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GiftCardUsageRecord {
  id: string;
  businessDate: string;
  startAt: string;
  serviceShortName: string | null;
  employee: { id: string; displayName: string };
  serviceCents: number;
  tipCents: number;
  amountCents: number;
}

export interface GiftCardLedgerSale extends GiftCardSale {
  usageRecords: GiftCardUsageRecord[];
}

export interface GiftCardLedgerResponse {
  nextSerialNumber: string;
  sales: GiftCardLedgerSale[];
}

export type DeletedGiftCardSale = GiftCardSale;

export interface DeletedWorkRecord extends WorkRecord {
  employee: { id: string; displayName: string; role: StoreRole; isServiceProvider: boolean };
  deletedBy: string | null;
  deleteReason: string | null;
}

export interface BoardStatistics {
  recordCount: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  totalTipCents: number;
  totalLargeFeeWageCents: number;
  employeeIncomeCents: number;
  giftCardSaleCount: number;
  giftCardCashCents: number;
  giftCardCardCents: number;
  giftCardSalesAmountCents: number;
  giftCardRedemptionCents: number;
  storeIncomeCents: number;
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
    "id" | "displayName" | "role" | "isServiceProvider" | "status" | "employmentType"
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
  giftCardSales: GiftCardSale[];
  nextGiftCardSerialNumber: string;
  statistics: BoardStatistics;
  ranking: {
    enabled: boolean;
    rankedAt: string | null;
  };
}

export interface CurrentBusinessDay {
  businessDate: string;
  timezone: string;
  businessCutoffLocal: string;
  serverTime: string;
}

export interface FinanceTotals {
  itemCount: number;
  recordCount: number;
  incompleteRecordCount: number;
  giftCardSaleCount: number;
  mainServiceAmountCents: number;
  addonTotalCents: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  actualServiceCollectedCents: number;
  cashServiceCents: number;
  cardServiceCents: number;
  giftCardServiceCents: number;
  cashTipCents: number;
  cardTipCents: number;
  giftCardTipCents: number;
  totalTipCents: number;
  customerTotalPaidCents: number;
  giftCardSaleCashCents: number;
  giftCardSaleCardCents: number;
  giftCardSalesAmountCents: number;
  giftCardRedemptionCents: number;
  storeIncomeCents: number;
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
    paymentMethod: "ALL" | "CASH" | "NON_CASH";
    amountType: "ALL" | "SERVICE" | "TIP";
    highlightFilter: "ALL" | "ONLY_HIGHLIGHTED" | "EXCLUDE_HIGHLIGHTED";
  };
  totals: FinanceTotals & {
    totalTurnoverCents: number;
    ownerWorkerIncomeCents: number;
    managerWorkerIncomeCents: number;
    giftCardNetIncomeCents: number;
    creditCardFeeCents: number;
    totalIncomeCents: number;
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
      defaultCommissionBps: number | null;
      hasDifferentItemCommission: boolean;
    }
  >;
  days: Array<FinanceTotals & { businessDate: string; dailyTurnoverCents: number }>;
  balances: EmployeeBalance[];
}

export interface FinanceDetailsResponse {
  filters: FinanceSummaryResponse["filters"];
  records: Array<WorkRecord & {
    employee: { id: string; displayName: string; role: StoreRole };
    selectedLargeFeeWageCents: number;
    selectedTipCents: number;
    selectedEmployeeIncomeCents: number;
    hasCashAndNonCashPayment: boolean;
  }>;
  giftCardSales: Array<{
    id: string;
    businessDate: string;
    serialNumber: string;
    faceValueCents: number;
    discountCents: number;
    cashCents: number;
    cardCents: number;
    amountCents: number;
    operator: { id: string; displayName: string; role: StoreRole };
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
  blocking?: boolean;
  count: number;
  recordIds: string[];
}

export interface ClosingTotals {
  itemCount: number;
  recordCount: number;
  grossFeeBaseCents: number;
  discountTotalCents: number;
  discountedFeePerformanceCents: number;
  totalTipCents: number;
  customerTotalPaidCents: number;
  totalLargeFeeWageCents: number;
  employeeIncomeCents: number;
  incompleteRecordCount: number;
  giftCardSaleCount: number;
  giftCardSaleCashCents: number;
  giftCardSaleCardCents: number;
  giftCardSalesAmountCents: number;
  giftCardRedemptionCents: number;
  storeIncomeCents: number;
}

export interface ClosingEmployeeTotals extends Omit<ClosingTotals,
  | "itemCount"
  | "giftCardSaleCount"
  | "giftCardSaleCashCents"
  | "giftCardSaleCardCents"
  | "giftCardSalesAmountCents"
  | "giftCardRedemptionCents"
  | "storeIncomeCents"
> {
  membershipId: string;
  displayName: string;
  role: StoreRole;
  cashToSubmitToStoreCents: number;
  cashLargeFeeDividendCents: number;
  cashTipDividendCents: number;
  cardLargeFeeDividendCents: number;
  cardTipDividendCents: number;
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
  storeTimezone: string;
  businessDate: string;
  isClosed: boolean;
  activeClosing: ActiveClosingSummary | null;
  hasWarnings: boolean;
  warningCount: number;
  warnings: ClosingWarning[];
  employee: ClosingEmployeeTotals & {
    confirmedLargeFeeWageCents: number;
    confirmedTipWageCents: number;
    confirmedIncomeCents: number;
  };
  records: EmployeeClosingRecord[];
}

export interface EmployeeClosingRecord {
  id: string;
  status: "PENDING_PAYMENT" | "CONFIRMED";
  startAt: string;
  endAt: string | null;
  serviceName: string;
  serviceShortName: string;
  addons: Array<{ name: string; shortName: string }>;
  grossFeeBaseCents: number;
  cashServiceCents: number | null;
  cardServiceCents: number | null;
  giftCardServiceCents: number | null;
  cashTipCents: number | null;
  cardTipCents: number | null;
  giftCardTipCents: number | null;
  totalLargeFeeWageCents: number;
  totalTipCents: number | null;
  employeeIncomeCents: number | null;
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
