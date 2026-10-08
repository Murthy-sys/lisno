import { apiClient } from "../../api/client";
import type { PurchaseOrderModeResolution } from "./purchaseOrderApi";

export interface BasketEstimateSource {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
}

export type MainBasketClassification = "standard" | "special";

export type ProcurementEstimateMode = "in_house" | "sub_vendor" | "pmc";
export type ProcurementEstimateModeGroupKey = ProcurementEstimateMode | "unrecorded";

export interface ProcurementEstimateModeSelection {
  approvedClassification: MainBasketClassification | null;
  approvedPricingMode: ProcurementEstimateMode | null;
  mode: ProcurementEstimateMode | null;
  provenance: "line" | "legacy_basket" | "unrecorded";
  issues: Array<{ code: string; message: string }>;
}

export interface ProcurementModeGroupMetrics {
  includedLineCount: number;
  boqReadyLineCount: number;
  readinessPercent: number | null;
  approvedEstimatePaise: number;
  currentCostPaise: number | null;
  currentCostComplete: boolean;
  unpricedLineCount: number;
  committedNetPaise: number;
  modeIssueCount: number;
}

export interface ProcurementModeBasketSubset extends ProcurementModeGroupMetrics {
  id: string;
  name: string;
  sourceLineItemKeys: string[];
}

export interface ProcurementBasketModeGroup extends ProcurementModeGroupMetrics {
  mode: ProcurementEstimateModeGroupKey;
  basketCount: number;
  baskets: ProcurementModeBasketSubset[];
}

export interface StandardBasketCost {
  totalPaise: number | null;
  complete: boolean;
  provisional: boolean;
  pricedLineCount: number;
}

export interface StandardBasketLineCost {
  state: "suggested" | "observed_unverified" | "saved" | "unavailable";
  mode: "pmc" | "sub_vendor" | "in_house" | null;
  calculationQuantity: string | null;
  baseRates: Array<{ scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material"; ratePaise: number }>;
  baseCostPaise: number | null;
  adjustedCostPaise: number | null;
  issues: Array<{ code: string; message: string }>;
}

export interface ProcurementBasketSummary {
  id: string;
  name: string;
  classification: MainBasketClassification;
  automaticSubVendor: boolean;
  boqReady: boolean;
  standardCost: StandardBasketCost | null;
  includedLineCount: number;
  readyLineCount: number;
  approvedEstimatePaise: number;
  baseCostPaise: number;
  adjustedCostPaise: number;
  workingTotalPaise: number;
  workingTotalComplete: boolean;
  committedNetPaise: number;
  state: string;
}

export interface ProcurementBasketLine {
  sourceLineItemKey: string;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string;
  approvedQuantity: string;
  approvedUnit: string;
  approvedAmountPaise: number | null;
  included: boolean;
  source: "configuration" | "legacy";
  mode: PurchaseOrderModeResolution | null;
  baseUnitRatePaise: number | null;
  projectRate: { version: number; overridePaise: number | null };
  standardCost: StandardBasketLineCost | null;
  estimateMode?: ProcurementEstimateModeSelection;
}

export interface SaveBasketBaseRateInput {
  sourceLineItemKey: string;
  baseRatePaise: number | null;
  expectedVersion: number;
  expectedEstimateSource: BasketEstimateSource;
  expectedPreparationDigest: string;
  idempotencyKey: string;
}

export interface SavedBasketBaseRate {
  projectId: string;
  mainBasketId: string;
  estimateSource: BasketEstimateSource;
  sourceLineItemKey: string;
  projectRate: ProcurementBasketLine["projectRate"];
}

export interface ProcurementBasketDetail extends ProcurementBasketSummary {
  projectId: string;
  estimateSource: BasketEstimateSource;
  preparationDigest: string;
  lines: ProcurementBasketLine[];
}

export interface ProcurementBasketList {
  projectId: string;
  estimateSource: BasketEstimateSource;
  baskets: ProcurementBasketSummary[];
  modeGroups?: ProcurementBasketModeGroup[];
}

const nonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";

function validModeMetrics(value: Record<string, unknown>): boolean {
  if (![value.includedLineCount, value.boqReadyLineCount, value.approvedEstimatePaise, value.unpricedLineCount,
    value.committedNetPaise, value.modeIssueCount].every(nonNegativeInteger)) return false;
  const included = value.includedLineCount as number;
  if ((value.boqReadyLineCount as number) > included || (value.unpricedLineCount as number) > included) return false;
  if (included === 0 ? value.readinessPercent !== null : typeof value.readinessPercent !== "number" ||
    !Number.isFinite(value.readinessPercent) || value.readinessPercent < 0 || value.readinessPercent > 100) return false;
  return value.currentCostComplete === true
    ? nonNegativeInteger(value.currentCostPaise) && value.unpricedLineCount === 0
    : value.currentCostComplete === false && value.currentCostPaise === null && (value.unpricedLineCount as number) > 0;
}

/** Reject incompatible overview metadata without affecting the canonical basket drill-down. */
export function hasValidProcurementModeGroups(data: ProcurementBasketList): data is ProcurementBasketList & { modeGroups: ProcurementBasketModeGroup[] } {
  const groups: unknown = data.modeGroups;
  if (!Array.isArray(groups) || (groups.length !== 3 && groups.length !== 4)) return false;
  const order = ["in_house", "sub_vendor", "pmc", "unrecorded"];
  const canonicalIds = new Set(data.baskets.map((basket) => basket.id));
  const sourceKeys = new Set<string>();
  return groups.every((group: unknown, index) => {
    if (!record(group) || group.mode !== order[index] || !Array.isArray(group.baskets) ||
      group.basketCount !== group.baskets.length || !validModeMetrics(group)) return false;
    if (group.mode === "unrecorded" && group.baskets.length === 0) return false;
    const basketIds = new Set<string>();
    return group.baskets.every((basket: unknown) => {
      if (!record(basket) || typeof basket.id !== "string" || !canonicalIds.has(basket.id) || basketIds.has(basket.id) ||
        typeof basket.name !== "string" || !basket.name.trim() || !validModeMetrics(basket) ||
        !Array.isArray(basket.sourceLineItemKeys) || basket.sourceLineItemKeys.length === 0 ||
        (basket.includedLineCount as number) > basket.sourceLineItemKeys.length) return false;
      basketIds.add(basket.id);
      return basket.sourceLineItemKeys.every((key: unknown) => {
        if (typeof key !== "string" || !key || sourceKeys.has(key)) return false;
        sourceKeys.add(key);
        return true;
      });
    });
  });
}

export type VendorCityMatch = "same_city" | "outside_city" | "unknown";
export interface ProcurementVendorCandidate {
  vendorId: string;
  code: string;
  name: string;
  contactEmail: string | null;
  kpiScoreBps: number | null;
  city: { name: string; key: string } | null;
  cityVersion: number;
  cityMatch: VendorCityMatch;
  eligible: boolean;
  blockers: string[];
}
export interface ProcurementVendorCandidates {
  projectCity: { name: string; key: string } | null;
  items: ProcurementVendorCandidate[];
  total: number;
  matchingVendorCount: number;
  blockedReasonCounts: Record<string, number>;
  limit: number;
  offset: number;
}

export type BasketBoqScope = "supply" | "execution" | "supply_and_execution";
export interface BasketBoqLineInput {
  sourceLineItemKey: string;
}
export interface BasketBoqLine extends BasketBoqLineInput {
  description: string;
  quantityMilliUnits: number;
  scopeType?: BasketBoqScope;
  targetDate?: string;
  deliveryLocation?: string;
  id: string;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string | null;
  approvedQuantity: string;
  approvedQuoteAmountPaise?: number | null;
  approvedUnit: string;
  uomId: string;
  uomCode: string;
  uomDecimalScale: number;
}
export type BasketEnquiryStatus = "draft" | "sent" | "award_pending" | "issued" | "cancelled";
export interface BasketEnquiry {
  id: string;
  projectId: string;
  mainBasketId: string;
  version: number;
  status: BasketEnquiryStatus;
  estimateSource: BasketEstimateSource;
  preparationDigest: string;
  vendorScopeCurrent: boolean | null;
  boqRevisionId: string | null;
  boqRevision: number | null;
  boqDigest: string | null;
  lines: BasketBoqLine[];
  invitations: Array<{ id: string; vendorId: string; vendorName: string; vendorCode: string; kind: "initial" | "resend" | "counteroffer"; status: string; expiresAt: string; sentAt: string | null; generation: number }>;
  bidCount: number;
  awardId: string | null;
}
export type BasketInvitationSelection =
  | { kind: "vendors"; vendorIds: string[] }
  | { kind: "all_eligible"; excludedVendorIds?: string[] };
export type BasketInvitationAction = "first_invitation" | "retry" | "updated_bid_request" | "already_invited";
export interface BasketInvitationPreview {
  enquiryId: string;
  enquiryVersion: number;
  boqRevisionId: string;
  boqDigest: string;
  selectedCount: number;
  requiresReason: boolean;
  actions: Array<{ vendorId: string; vendorName: string; action: BasketInvitationAction;
    invitationStatus: string | null; priorBidId: string | null }>;
}
export interface BasketInvitationBatchResult {
  enquiry: BasketEnquiry;
  selectedCount: number;
  results: Array<{ vendorId: string; action: BasketInvitationAction;
    status: "sent" | "failed" | "pending" | "consumed" | "expired" | "superseded" | "revoked" | "already_invited";
    invitationId: string | null }>;
}
export interface BasketInvitationBatchInput {
  expectedVersion: number;
  boqRevisionId: string;
  boqDigest: string;
  selection: BasketInvitationSelection;
}
export interface BasketHistorySummary {
  id: string;
  revision: number;
  sentAt: string;
  boqDigest: string;
  lineCount: number;
  bidCount: number;
  counterofferCount: number;
}
export interface BasketHistoryList {
  enquiryId: string;
  currentBoqRevisionId: string | null;
  revisions: BasketHistorySummary[];
  nextBeforeRevision: number | null;
}
export interface BasketHistoryRevision {
  enquiryId: string;
  boq: { id: string; revision: number; sentAt: string; digest: string; lines: BasketBoqLine[] };
  bids: Array<{ bidId: string; vendorId: string; vendorName: string; revision: number; submittedAt: string;
    totals: { netPaise: number; gstPaise: number; totalPaise: number }; lines: BasketBidLine[] }>;
  bidTotal: number;
  counteroffers: Array<{ id: string; vendorId: string; vendorName: string; priorBidId: string;
    reason: string; targetNetPaise: number | null; requestedById: string; requestedAt: string;
    invitationStatus: string; answeredBidId: string | null }>;
  counterofferTotal: number;
  canAward: false;
}

export interface BasketBidLine {
  boqLineId: string;
  description: string;
  quantityMilliUnits: number;
  uomCode: string;
  unitPricePaise: number;
  gstBasisPoints: number;
  netPaise: number;
  gstPaise: number;
  totalPaise: number;
}
export interface BasketBidComparisonRow {
  bidId: string;
  vendorId: string;
  vendorName: string;
  officialKpiScoreBps: number | null;
  quoteNetPaise: number;
  quoteGstPaise: number;
  quoteGrossPaise: number;
  priceScoreBps: number | null;
  comparisonScoreBps: number | null;
  eligible: boolean;
  blockers: string[];
  recommended: boolean;
  priorityRank: number | null;
  bidRevision: number;
  lines: BasketBidLine[];
}
export interface BasketComparison {
  enquiryId: string;
  boqRevisionId: string;
  boqDigest: string;
  comparisonDigest: string;
  averageBidNetPaise: number | null;
  recommendedBidId: string | null;
  awardId: string | null;
  rows: BasketBidComparisonRow[];
  bidHistory: Array<{ bidId: string; vendorId: string; revision: number; submittedAt: string;
    totals: { netPaise: number; gstPaise: number; totalPaise: number }; lines: BasketBidLine[] }>;
  bidHistoryHasMore: boolean;
  counteroffers: Array<{ id: string; vendorId: string; priorBidId: string; reason: string;
    targetNetPaise: number | null; requestedById: string; requestedAt: string;
    invitationStatus: string; answeredBidId: string | null }>;
  counteroffersHasMore: boolean;
}

export interface BasketAwardMilestone {
  id: "advance" | "mobilisation" | "progress_50" | "progress_85" | "final";
  name: string;
  basisPoints: number;
  amountPaise: number;
  reviewerSlots?: BasketMilestoneReviewerSlot[];
}
export type BasketMilestoneReviewerSlot = "program_manager" | "designer" | "procurement" | "finance_head";
export interface BasketMilestoneReviewers {
  id: BasketAwardMilestone["id"];
  reviewerSlots: BasketMilestoneReviewerSlot[];
}
export interface BasketAwardApproval {
  slot: "program_manager" | "designer" | "procurement" | "finance_head" | "budget_override";
  actorId: string;
  decision: "approve" | "reject";
  reason: string | null;
  decidedAt: string;
}
export interface BasketAwardPreview {
  bidId: string;
  vendorId: string;
  vendorName: string;
  totals: { netPaise: number; gstPaise: number; totalPaise: number };
  milestones: BasketAwardMilestone[];
  requiredSlots: BasketAwardApproval["slot"][];
  budgetOverrideRequired: boolean;
  designerOptions: Array<{ id: string; name: string }>;
  assignedSiteManager: { id: string; name: string } | null;
  assignedDesigner: { id: string; name: string } | null;
  approverBlockers: Array<{ slot: "program_manager" | "designer"; code: string; message: string }>;
  recommendedBidId: string | null;
  programManagerId: string | null;
  lines: BasketBidLine[];
}
export interface BasketAwardProposal {
  revision: number;
  proposalDigest: string;
  boqRevisionId: string;
  bidId: string;
  vendorId: string;
  vendorName: string;
  totals: BasketAwardPreview["totals"];
  approvedEstimatePaise: number;
  committedNetPaise: number;
  terms: string | null;
  lineTerms?: BasketAwardLineTerms[];
  advanceBasisPoints: number;
  milestones: BasketAwardMilestone[];
  requiredSlots: BasketAwardApproval["slot"][];
  budgetOverrideRequired: boolean;
  recommendedBidId: string | null;
  nonRecommendedReason: string | null;
  programManagerId: string | null;
  designerId: string | null;
  officialKpiAssessmentId: string;
  officialKpiAssessmentRevision: number;
}
export interface BasketAwardLineTerms {
  boqLineId: string;
  scopeType?: BasketBoqScope;
  targetDate?: string;
  deliveryLocation?: string;
}
export interface BasketAward {
  id: string;
  enquiryId: string;
  projectId: string;
  mainBasketId: string;
  version: number;
  proposalRevisionId: string | null;
  status: string;
  requiresRevision: boolean;
  withdrawal: { priorProposalRevisionId: string; reason: string; withdrawnAt: string; withdrawnById: string } | null;
  bidId: string;
  vendorId: string;
  proposal: BasketAwardProposal;
  approvals: BasketAwardApproval[];
  lines: BasketBidLine[];
  issuedPurchaseOrderId: string | null;
  autoIssueOnApproval?: boolean;
  issueBlocker?: { code: string; message: string } | null;
}

export interface VendorBoqInspection {
  projectName: string;
  basketName: string;
  expiresAt: string;
  lines: Array<{ id: string; description: string; quantityMilliUnits: number; approvedQuantity: string; approvedUnit: string | null; approvedQuoteAmountPaise: number | null; uomCode: string; scopeType?: BasketBoqScope; targetDate?: string; deliveryLocation?: string }>;
}
export interface VendorBoqReceipt { bidId: string; submittedAt: string; totals: { netPaise: number; gstPaise: number; totalPaise: number } }

export interface BasketPackageMonitor {
  award: { id: string; status: "issued"; vendorId: string };
  order: {
    id: string; orderNumber: string; status: string; revision: number; terms: string | null;
    vendor: { name: string };
    lines: Array<{ id: string; description: string; quantityMilliUnits: number; uomCode: string; unitPricePaise: number; gstBasisPoints: number; netPaise: number; gstPaise: number; totalPaise: number; targetDate: string | null; deliveryLocation: string | null }>;
    totals: { netPaise: number; gstPaise: number; totalPaise: number };
  };
  boqLines: Array<{ id: string; description: string; roomName: string; quantityMilliUnits: number; uomCode: string }>;
  site: {
    status: string;
    progressPercent: number | null;
    tasks: Array<{ id: string; label: string; status: string; progressPercent: number; evidenceCount: number; reviewOwnerName: string | null }>;
  };
  finance: {
    assessmentStatus: "pending" | "reviewed";
    invoiceTotalPaise: number | null;
    tdsPaise: number | null;
    netPayablePaise: number | null;
    recordedCostPaise: number | null;
    paidPaise: null;
    gstRegistration: { registered: boolean | null; gstin: string | null };
    paymentSchedule: Array<{ id: string; name: string; basisPoints: number; amountPaise: number; reviewerSlots?: BasketMilestoneReviewerSlot[] }>;
  };
  vendorAlerts: Array<{ id: string; message: string; ownerName: string; createdAt: string; severity: "info" | "warning" | "critical" }>;
}

const root = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/baskets`;
const basketPath = (projectId: string, basketId: string) => `${root(projectId)}/${encodeURIComponent(basketId)}`;
const enquiriesPath = (projectId: string, basketId: string) => `${basketPath(projectId, basketId)}/enquiries`;
const enquiryPath = (projectId: string, basketId: string, enquiryId: string) => `${enquiriesPath(projectId, basketId)}/${encodeURIComponent(enquiryId)}`;

export const procurementBasketKeys = {
  lists: () => ["procurement", "baskets"] as const,
  details: () => ["procurement", "basket"] as const,
  list: (projectId: string) => ["procurement", "baskets", projectId] as const,
  detail: (projectId: string, basketId: string) => ["procurement", "basket", projectId, basketId] as const,
  candidates: (projectId: string, basketId: string, search: string, city: string, offset: number) => ["procurement", "basket-vendors", projectId, basketId, search, city, offset] as const,
  enquiries: (projectId: string, basketId: string) => ["procurement", "basket-enquiries", projectId, basketId] as const,
  enquiry: (projectId: string, basketId: string, enquiryId: string) => ["procurement", "basket-enquiry", projectId, basketId, enquiryId] as const,
  history: (projectId: string, basketId: string, enquiryId: string, beforeRevision: number | null) => ["procurement", "basket-history", projectId, basketId, enquiryId, beforeRevision] as const,
  historyRevision: (projectId: string, basketId: string, enquiryId: string, revisionId: string, bidOffset: number, counterofferOffset: number) => ["procurement", "basket-history-revision", projectId, basketId, enquiryId, revisionId, bidOffset, counterofferOffset] as const,
  comparison: (projectId: string, basketId: string, enquiryId: string) => ["procurement", "basket-comparison", projectId, basketId, enquiryId] as const,
  invitationPreview: (projectId: string, basketId: string, enquiryId: string, input: BasketInvitationBatchInput) =>
    ["procurement", "basket-invitation-preview", projectId, basketId, enquiryId, input] as const,
  award: (projectId: string, basketId: string, awardId: string) => ["procurement", "basket-award", projectId, basketId, awardId] as const,
  monitor: (projectId: string, basketId: string, awardId: string) => ["procurement", "basket-monitor", projectId, basketId, awardId] as const
};

export async function getProcurementBaskets(projectId: string, signal?: AbortSignal) {
  const data = await apiClient.get<ProcurementBasketList>(root(projectId), { signal, showGlobalLoader: false });
  if (data.projectId !== projectId) throw new Error("The basket list belongs to another project. Refresh this page.");
  return data;
}
export async function getProcurementBasket(projectId: string, basketId: string, signal?: AbortSignal) {
  const data = await apiClient.get<ProcurementBasketDetail>(basketPath(projectId, basketId), { signal, showGlobalLoader: false });
  if (data.projectId !== projectId || data.id !== basketId) throw new Error("The basket details changed. Refresh this page.");
  return data;
}
export async function saveBasketBaseRate(projectId: string, basketId: string, input: SaveBasketBaseRateInput) {
  const saved = await apiClient.put<SavedBasketBaseRate>(`${basketPath(projectId, basketId)}/base-rate`, input, { showGlobalLoader: false });
  if (saved.projectId !== projectId || saved.mainBasketId !== basketId || saved.sourceLineItemKey !== input.sourceLineItemKey ||
    saved.estimateSource.estimateId !== input.expectedEstimateSource.estimateId ||
    saved.estimateSource.estimateVersion !== input.expectedEstimateSource.estimateVersion ||
    saved.estimateSource.estimateReviewRoundId !== input.expectedEstimateSource.estimateReviewRoundId)
    throw new Error("The saved base amount belongs to another basket line. Refresh the basket.");
  return saved;
}
export function getProcurementVendorCandidates(projectId: string, basketId: string, search: string, city: "all" | VendorCityMatch, offset = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: search, city, limit: "50", offset: String(offset) });
  return apiClient.get<ProcurementVendorCandidates>(`${basketPath(projectId, basketId)}/vendor-candidates?${params}`, { signal, showGlobalLoader: false });
}
export function saveProcurementVendorServiceCity(vendorId: string, expectedVersion: number, cityName: string | null) {
  return apiClient.put<{ vendorId: string; city: { name: string; key: string } | null; version: number }>(`/procurement/vendors/${encodeURIComponent(vendorId)}/service-city`, { expectedVersion, cityName });
}
export function listBasketEnquiries(projectId: string, basketId: string, signal?: AbortSignal) {
  return apiClient.get<BasketEnquiry[]>(enquiriesPath(projectId, basketId), { signal, showGlobalLoader: false });
}
export async function getBasketEnquiryHistory(projectId: string, basketId: string, enquiryId: string, beforeRevision: number | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "20" });
  if (beforeRevision !== null) params.set("beforeRevision", String(beforeRevision));
  const result = await apiClient.get<BasketHistoryList>(`${enquiryPath(projectId, basketId, enquiryId)}/history?${params}`, { signal, showGlobalLoader: false });
  if (result.enquiryId !== enquiryId) throw new Error("This BOQ history belongs to another enquiry. Refresh the basket.");
  return result;
}
export async function getBasketEnquiryHistoryRevision(projectId: string, basketId: string, enquiryId: string, revisionId: string, bidOffset: number, counterofferOffset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ bidOffset: String(bidOffset), counterofferOffset: String(counterofferOffset), limit: "20" });
  const result = await apiClient.get<BasketHistoryRevision>(`${enquiryPath(projectId, basketId, enquiryId)}/history/${encodeURIComponent(revisionId)}?${params}`, { signal, showGlobalLoader: false });
  if (result.enquiryId !== enquiryId || result.boq.id !== revisionId || result.canAward !== false)
    throw new Error("This historical BOQ revision is unavailable for read-only review.");
  return result;
}
export function createBasketEnquiry(projectId: string, basketId: string, input: { expectedPreparationDigest: string; idempotencyKey: string; lines: BasketBoqLineInput[] }) {
  return apiClient.post<BasketEnquiry>(enquiriesPath(projectId, basketId), input);
}
export function updateBasketEnquiry(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; expectedPreparationDigest: string; idempotencyKey: string; lines: BasketBoqLineInput[] }) {
  return apiClient.put<BasketEnquiry>(enquiryPath(projectId, basketId, enquiryId), input);
}
export function dispatchBasketEnquiry(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; expectedPreparationDigest: string; idempotencyKey: string } & (
  { vendorIds: string[]; selection?: never } | { selection: BasketInvitationSelection; vendorIds?: never })) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/dispatch`, input);
}
export function previewBasketInvitationBatch(projectId: string, basketId: string, enquiryId: string, input: BasketInvitationBatchInput, signal?: AbortSignal) {
  return apiClient.post<BasketInvitationPreview>(`${enquiryPath(projectId, basketId, enquiryId)}/invitation-batches/preview`, input,
    { signal, showGlobalLoader: false });
}
export function submitBasketInvitationBatch(projectId: string, basketId: string, enquiryId: string,
  input: BasketInvitationBatchInput & { idempotencyKey: string; counterofferReason?: string }) {
  return apiClient.post<BasketInvitationBatchResult>(`${enquiryPath(projectId, basketId, enquiryId)}/invitation-batches`, input);
}
export function resendBasketInvitation(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; vendorId: string; idempotencyKey: string }) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/resend-invitation`, input);
}
export function createBasketWhatsAppShareIntent(projectId: string, basketId: string, enquiryId: string, vendorId: string) {
  return apiClient.post<{ available: boolean; shareUrl: string | null; blocker: string | null; expiresAt: string | null }>(
    `${enquiryPath(projectId, basketId, enquiryId)}/invitations/${encodeURIComponent(vendorId)}/whatsapp-share-intent`, {},
    { showGlobalLoader: false }
  );
}
export function getBasketComparison(projectId: string, basketId: string, enquiryId: string, signal?: AbortSignal) {
  return apiClient.get<BasketComparison>(`${enquiryPath(projectId, basketId, enquiryId)}/comparison`, { signal, showGlobalLoader: false });
}
export function requestBasketCounteroffer(projectId: string, basketId: string, enquiryId: string, input: { vendorId: string; expectedVersion: number; reason: string; targetNetPaise?: number | null; idempotencyKey: string }) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/counteroffers`, input);
}
export function createBasketAward(projectId: string, basketId: string, enquiryId: string, input: { bidId: string; nonRecommendedReason?: string | null; advanceBasisPoints: number; designerId?: string | null; terms?: string; lineTerms?: BasketAwardLineTerms[]; milestoneReviewers: BasketMilestoneReviewers[]; expectedVersion: number; idempotencyKey: string }) {
  return apiClient.post<BasketAward>(`${enquiryPath(projectId, basketId, enquiryId)}/awards`, input);
}
export function previewBasketAward(projectId: string, basketId: string, enquiryId: string, input: { bidId: string; advanceBasisPoints: number; milestoneReviewers: BasketMilestoneReviewers[]; designerId?: string }) {
  return apiClient.post<BasketAwardPreview>(`${enquiryPath(projectId, basketId, enquiryId)}/award-preview`, input, { showGlobalLoader: false });
}
const awardPath = (projectId: string, basketId: string, enquiryId: string, awardId: string) => `${enquiryPath(projectId, basketId, enquiryId)}/awards/${encodeURIComponent(awardId)}`;
export function getBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketAward>(awardPath(projectId, basketId, enquiryId, awardId), { signal, showGlobalLoader: false });
}
export function updateBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; bidId?: string; advanceBasisPoints: number; designerId?: string | null; terms?: string; lineTerms?: BasketAwardLineTerms[]; milestoneReviewers: BasketMilestoneReviewers[]; nonRecommendedReason?: string | null }) {
  return apiClient.put<BasketAward>(awardPath(projectId, basketId, enquiryId, awardId), input);
}
export function withdrawBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; reason: string }) {
  return apiClient.post<BasketAward>(`${awardPath(projectId, basketId, enquiryId, awardId)}/withdraw`, input);
}
export function submitBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; autoIssueOnApproval?: boolean }) {
  return apiClient.post<BasketAward>(`${awardPath(projectId, basketId, enquiryId, awardId)}/submit`, input);
}
export interface BasketApprovalQueueItem {
  awardId: string;
  projectId: string;
  enquiryId: string;
  mainBasketId: string;
  projectName: string;
  basketName: string;
  vendorName: string;
  grossPaise: number;
  slot: BasketAwardApproval["slot"];
  status: string;
}
export const procurementBasketApprovalKeys = {
  queue: ["work-order-approvals"] as const,
  detail: (awardId: string) => ["work-order-approvals", awardId] as const
};
export function getBasketApprovalQueue(signal?: AbortSignal) {
  return apiClient.get<BasketApprovalQueueItem[]>("/work-order-approvals", { signal, showGlobalLoader: false });
}
export function getBasketApprovalDetail(awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketAward>(`/work-order-approvals/${encodeURIComponent(awardId)}`, { signal, showGlobalLoader: false });
}
export function decideBasketApproval(awardId: string, input: { expectedVersion: number; proposalRevisionId: string; slot: BasketAwardApproval["slot"]; decision: "approve" | "reject"; reason?: string | null; idempotencyKey: string }) {
  return apiClient.post<BasketAward>(`/work-order-approvals/${encodeURIComponent(awardId)}/decision`, input);
}
export function issueBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string }) {
  return apiClient.post<{ awardId: string; purchaseOrderId: string; orderNumber: string; status: "issued" }>(
    `${awardPath(projectId, basketId, enquiryId, awardId)}/issue`, input);
}
const monitorPath = (projectId: string, basketId: string, awardId: string) => `${basketPath(projectId, basketId)}/awards/${encodeURIComponent(awardId)}`;
export function getBasketPackageMonitor(projectId: string, basketId: string, awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketPackageMonitor>(`${monitorPath(projectId, basketId, awardId)}/monitor`, { signal, showGlobalLoader: false });
}
export function getBasketWorkOrderPdf(projectId: string, basketId: string, awardId: string) {
  return apiClient.getBlob(`${monitorPath(projectId, basketId, awardId)}/work-order.pdf`, { maxBytes: 12_000_000, showGlobalLoader: false });
}
export function createBasketShareIntent(projectId: string, basketId: string, awardId: string) {
  return apiClient.post<{ available: boolean; shareUrl: string | null; blocker: string | null }>(`${monitorPath(projectId, basketId, awardId)}/share-intent`, { idempotencyKey: crypto.randomUUID() });
}
export function inspectPublicVendorBoq(token: string) {
  return apiClient.postPublic<VendorBoqInspection>("/vendor-boq/inspect", { token }, { cache: "no-store", referrerPolicy: "no-referrer", showGlobalLoader: false });
}
export function submitPublicVendorBoq(input: { token: string; idempotencyKey: string; lines: Array<{ boqLineId: string; unitPricePaise: number; gstBasisPoints: number }> }) {
  return apiClient.postPublic<VendorBoqReceipt>("/vendor-boq/submit", input, { cache: "no-store", referrerPolicy: "no-referrer", showGlobalLoader: false });
}
