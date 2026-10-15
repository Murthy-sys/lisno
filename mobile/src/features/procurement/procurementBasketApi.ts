import type { JsonApiClient } from "../../core/http/apiClient";
import { createIdempotencyKey } from "../finance/money";
import type { EstimationPreparationSource } from "./procurementTypes";
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
  preparationSource?: EstimationPreparationSource;
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
  preparationSource?: EstimationPreparationSource;
  sourceReconciliation?: { id: string; preparationSource: EstimationPreparationSource; unchangedLineKeys: string[] };
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

/** Native transport adapter; endpoint and version contracts match the web workflow. */
export function createProcurementBasketApi(apiClient: JsonApiClient["authenticated"]) {
function requireEnquiry(value: BasketEnquiry, projectId: string, basketId: string, enquiryId?: string) { if (value.projectId !== projectId || value.mainBasketId !== basketId || (enquiryId && value.id !== enquiryId)) throw new Error("The enquiry does not match this project and basket. Reload before continuing."); return value; }

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

function hasValidProcurementModeGroups(data: ProcurementBasketList): data is ProcurementBasketList & { modeGroups: ProcurementBasketModeGroup[] } {
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

const root = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/baskets`;

const basketPath = (projectId: string, basketId: string) => `${root(projectId)}/${encodeURIComponent(basketId)}`;

const enquiriesPath = (projectId: string, basketId: string) => `${basketPath(projectId, basketId)}/enquiries`;

const enquiryPath = (projectId: string, basketId: string, enquiryId: string) => `${enquiriesPath(projectId, basketId)}/${encodeURIComponent(enquiryId)}`;

async function getProcurementBaskets(projectId: string, signal?: AbortSignal) {
  const data = await apiClient.get<ProcurementBasketList>(root(projectId), { signal });
  if (data.projectId !== projectId) throw new Error("The basket list belongs to another project. Refresh this page.");
  return data;
}

async function getProcurementBasket(projectId: string, basketId: string, signal?: AbortSignal) {
  const data = await apiClient.get<ProcurementBasketDetail>(basketPath(projectId, basketId), { signal });
  if (data.projectId !== projectId || data.id !== basketId) throw new Error("The basket details changed. Refresh this page.");
  return data;
}

async function saveBasketBaseRate(projectId: string, basketId: string, input: SaveBasketBaseRateInput) {
  const saved = await apiClient.put<SavedBasketBaseRate>(`${basketPath(projectId, basketId)}/base-rate`, input, {});
  if (saved.projectId !== projectId || saved.mainBasketId !== basketId || saved.sourceLineItemKey !== input.sourceLineItemKey ||
    saved.estimateSource.estimateId !== input.expectedEstimateSource.estimateId ||
    saved.estimateSource.estimateVersion !== input.expectedEstimateSource.estimateVersion ||
    saved.estimateSource.estimateReviewRoundId !== input.expectedEstimateSource.estimateReviewRoundId)
    throw new Error("The saved base amount belongs to another basket line. Refresh the basket.");
  return saved;
}

function getProcurementVendorCandidates(projectId: string, basketId: string, search: string, city: "all" | VendorCityMatch, offset = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: search, city, limit: "50", offset: String(offset) });
  return apiClient.get<ProcurementVendorCandidates>(`${basketPath(projectId, basketId)}/vendor-candidates?${params}`, { signal });
}

function saveProcurementVendorServiceCity(vendorId: string, expectedVersion: number, cityName: string | null) {
  return apiClient.put<{ vendorId: string; city: { name: string; key: string } | null; version: number }>(`/procurement/vendors/${encodeURIComponent(vendorId)}/service-city`, { expectedVersion, cityName });
}

async function listBasketEnquiries(projectId: string, basketId: string, signal?: AbortSignal) {
  const values = await apiClient.get<BasketEnquiry[]>(enquiriesPath(projectId, basketId), { signal });
  values.forEach(value => requireEnquiry(value, projectId, basketId)); return values;
}

async function getBasketEnquiryHistory(projectId: string, basketId: string, enquiryId: string, beforeRevision: number | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "20" });
  if (beforeRevision !== null) params.set("beforeRevision", String(beforeRevision));
  const result = await apiClient.get<BasketHistoryList>(`${enquiryPath(projectId, basketId, enquiryId)}/history?${params}`, { signal });
  if (result.enquiryId !== enquiryId) throw new Error("This BOQ history belongs to another enquiry. Refresh the basket.");
  return result;
}

async function getBasketEnquiryHistoryRevision(projectId: string, basketId: string, enquiryId: string, revisionId: string, bidOffset: number, counterofferOffset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ bidOffset: String(bidOffset), counterofferOffset: String(counterofferOffset), limit: "20" });
  const result = await apiClient.get<BasketHistoryRevision>(`${enquiryPath(projectId, basketId, enquiryId)}/history/${encodeURIComponent(revisionId)}?${params}`, { signal });
  if (result.enquiryId !== enquiryId || result.boq.id !== revisionId || result.canAward !== false)
    throw new Error("This historical BOQ revision is unavailable for read-only review.");
  return result;
}

function createBasketEnquiry(projectId: string, basketId: string, input: { expectedPreparationDigest: string; idempotencyKey: string; lines: BasketBoqLineInput[] }) {
  return apiClient.post<BasketEnquiry>(enquiriesPath(projectId, basketId), input);
}

function updateBasketEnquiry(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; expectedPreparationDigest: string; idempotencyKey: string; lines: BasketBoqLineInput[] }) {
  return apiClient.put<BasketEnquiry>(enquiryPath(projectId, basketId, enquiryId), input);
}

function dispatchBasketEnquiry(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; expectedPreparationDigest: string; idempotencyKey: string } & (
  { vendorIds: string[]; selection?: never } | { selection: BasketInvitationSelection; vendorIds?: never })) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/dispatch`, input);
}

function previewBasketInvitationBatch(projectId: string, basketId: string, enquiryId: string, input: BasketInvitationBatchInput, signal?: AbortSignal) {
  return apiClient.post<BasketInvitationPreview>(`${enquiryPath(projectId, basketId, enquiryId)}/invitation-batches/preview`, input,
    { signal });
}

function submitBasketInvitationBatch(projectId: string, basketId: string, enquiryId: string,
  input: BasketInvitationBatchInput & { idempotencyKey: string; counterofferReason?: string }) {
  return apiClient.post<BasketInvitationBatchResult>(`${enquiryPath(projectId, basketId, enquiryId)}/invitation-batches`, input);
}

function resendBasketInvitation(projectId: string, basketId: string, enquiryId: string, input: { expectedVersion: number; vendorId: string; idempotencyKey: string }) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/resend-invitation`, input);
}

function createBasketWhatsAppShareIntent(projectId: string, basketId: string, enquiryId: string, vendorId: string) {
  return apiClient.post<{ available: boolean; shareUrl: string | null; blocker: string | null; expiresAt: string | null }>(
    `${enquiryPath(projectId, basketId, enquiryId)}/invitations/${encodeURIComponent(vendorId)}/whatsapp-share-intent`, {},
    {}
  );
}

async function getBasketComparison(projectId: string, basketId: string, enquiryId: string, signal?: AbortSignal) {
  const value = await apiClient.get<BasketComparison>(`${enquiryPath(projectId, basketId, enquiryId)}/comparison`, { signal });
  if (value.enquiryId !== enquiryId) throw new Error("The bid comparison belongs to another enquiry."); return value;
}

function requestBasketCounteroffer(projectId: string, basketId: string, enquiryId: string, input: { vendorId: string; expectedVersion: number; reason: string; targetNetPaise?: number | null; idempotencyKey: string }) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/counteroffers`, input);
}

function createBasketAward(projectId: string, basketId: string, enquiryId: string, input: { bidId: string; nonRecommendedReason?: string | null; advanceBasisPoints: number; designerId?: string | null; terms?: string; lineTerms?: BasketAwardLineTerms[]; milestoneReviewers: BasketMilestoneReviewers[]; expectedVersion: number; idempotencyKey: string }) {
  return apiClient.post<BasketAward>(`${enquiryPath(projectId, basketId, enquiryId)}/awards`, input);
}

async function previewBasketAward(projectId: string, basketId: string, enquiryId: string, input: { bidId: string; advanceBasisPoints: number; milestoneReviewers: BasketMilestoneReviewers[]; designerId?: string }) {
  const value = await apiClient.post<BasketAwardPreview>(`${enquiryPath(projectId, basketId, enquiryId)}/award-preview`, input, {});
  if (value.bidId !== input.bidId) throw new Error("The preview belongs to another bid."); return value;
}

const awardPath = (projectId: string, basketId: string, enquiryId: string, awardId: string) => `${enquiryPath(projectId, basketId, enquiryId)}/awards/${encodeURIComponent(awardId)}`;

function getBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketAward>(awardPath(projectId, basketId, enquiryId, awardId), { signal });
}

function updateBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; bidId?: string; advanceBasisPoints: number; designerId?: string | null; terms?: string; lineTerms?: BasketAwardLineTerms[]; milestoneReviewers: BasketMilestoneReviewers[]; nonRecommendedReason?: string | null }) {
  return apiClient.put<BasketAward>(awardPath(projectId, basketId, enquiryId, awardId), input);
}

function withdrawBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; reason: string }) {
  return apiClient.post<BasketAward>(`${awardPath(projectId, basketId, enquiryId, awardId)}/withdraw`, input);
}

function submitBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string; autoIssueOnApproval?: boolean }) {
  return apiClient.post<BasketAward>(`${awardPath(projectId, basketId, enquiryId, awardId)}/submit`, input);
}

function getBasketApprovalQueue(signal?: AbortSignal) {
  return apiClient.get<BasketApprovalQueueItem[]>("/work-order-approvals", { signal });
}

function getBasketApprovalDetail(awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketAward>(`/work-order-approvals/${encodeURIComponent(awardId)}`, { signal });
}

function decideBasketApproval(awardId: string, input: { expectedVersion: number; proposalRevisionId: string; slot: BasketAwardApproval["slot"]; decision: "approve" | "reject"; reason?: string | null; idempotencyKey: string }) {
  return apiClient.post<BasketAward>(`/work-order-approvals/${encodeURIComponent(awardId)}/decision`, input);
}

function issueBasketAward(projectId: string, basketId: string, enquiryId: string, awardId: string, input: { expectedVersion: number; idempotencyKey: string }) {
  return apiClient.post<{ awardId: string; purchaseOrderId: string; orderNumber: string; status: "issued" }>(
    `${awardPath(projectId, basketId, enquiryId, awardId)}/issue`, input);
}

const monitorPath = (projectId: string, basketId: string, awardId: string) => `${basketPath(projectId, basketId)}/awards/${encodeURIComponent(awardId)}`;

function getBasketPackageMonitor(projectId: string, basketId: string, awardId: string, signal?: AbortSignal) {
  return apiClient.get<BasketPackageMonitor>(`${monitorPath(projectId, basketId, awardId)}/monitor`, { signal });
}

function createBasketShareIntent(projectId: string, basketId: string, awardId: string) {
  return apiClient.post<{ available: boolean; shareUrl: string | null; blocker: string | null }>(`${monitorPath(projectId, basketId, awardId)}/share-intent`, { idempotencyKey: createIdempotencyKey() });
}

function reconcileBasketEnquirySource(projectId: string, basketId: string, enquiryId: string, input: {
  expectedVersion: number; expectedSourceSnapshotId: string; reason: string; idempotencyKey: string;
}) {
  return apiClient.post<BasketEnquiry>(`${enquiryPath(projectId, basketId, enquiryId)}/reconcile-source`, input);
}
return {hasValidProcurementModeGroups, getProcurementBaskets, getProcurementBasket, saveBasketBaseRate, getProcurementVendorCandidates, saveProcurementVendorServiceCity, listBasketEnquiries, getBasketEnquiryHistory, getBasketEnquiryHistoryRevision, createBasketEnquiry, updateBasketEnquiry, dispatchBasketEnquiry, previewBasketInvitationBatch, submitBasketInvitationBatch, resendBasketInvitation, createBasketWhatsAppShareIntent, getBasketComparison, requestBasketCounteroffer, createBasketAward, previewBasketAward, getBasketAward, updateBasketAward, withdrawBasketAward, submitBasketAward, getBasketApprovalQueue, getBasketApprovalDetail, decideBasketApproval, issueBasketAward, getBasketPackageMonitor, createBasketShareIntent, reconcileBasketEnquirySource};
}
