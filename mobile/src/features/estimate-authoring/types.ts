import type { EstimateDimensions, EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { EstimateComponentPricing, ESTIMATE_COMPONENT_PRICING_BASIS } from "../../../../shared/estimation/estimateComponentPricing";
export type LeadStage = "new_lead" | "contacted" | "site_visit" | "design_meeting" | "estimate_in_progress" | "estimate_sent" | "negotiation" | "won" | "lost";
export interface StaffLead { stage?: LeadStage | undefined; nextAction?: string | undefined; nextActionAt?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined; budgetMin?: number | null | undefined; budgetMax?: number | null | undefined; id: string; clientName: string; clientEmail: string; clientMobile: string; projectName: string; propertyType: string; location: string; projectId?: string | null | undefined; bedroomCount?: number | null | undefined; estimationWorkflowVersion?: number | undefined; }
export interface EstimateReviewSummary { id: string; version: number; status: "pending" | "approved" | "changes_requested" | "superseded"; deliveryStatus: "queued" | "sending" | "sent" | "failed" | "disabled"; deliveryAttemptCount: number; deliveredAt: string | null; }
export interface LegacyEstimateLineInput {
  source?: "legacy" | undefined;
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
}

export type EstimateClassification = "standard" | "special";
export type EstimateModeTier = "signature" | "premium" | "functional";
export type EstimatePricingMode = "pmc" | "sub_vendor" | "in_house";
export type EstimateRateSource = "configuration" | "manual";

export interface ConfiguredEstimateLineInput {
  source: "configuration";
  itemType?: "main_line" | "temporary" | undefined;
  classification?: EstimateClassification | undefined;
  pricingMode?: EstimatePricingMode | undefined;
  modeTier?: EstimateModeTier | undefined;
  dimensionsMandatory?: boolean | undefined;
  dimensions?: EstimateDimensions | undefined;
  expectedDimensionRule?: EstimateDimensionRule | undefined;
  dimensionRule?: EstimateDimensionRule | null | undefined;
  rateSource?: EstimateRateSource | undefined;
  selectedInHouseComponentIds?: string[] | undefined;
  pricingBasis?: typeof ESTIMATE_COMPONENT_PRICING_BASIS | undefined;
  componentPricingFingerprint?: string | undefined;
  id?: string | undefined;
  catalogueId: string;
  roomId: string;
  roomName: string;
  mainBasketId: string;
  subBasketId: string | null;
  mainLineId: string;
  recommendationSourceMainLineIds?: string[] | undefined;
  revisionId: string;
  itemVersion?: number | undefined;
  revisionVersion?: number | undefined;
  uomId: string;
  quantity: number;
  ratePaise: number | null;
  included: boolean;
}

export type EstimateLineInput = LegacyEstimateLineInput | ConfiguredEstimateLineInput;

export interface ConfiguredEstimateLine extends Omit<ConfiguredEstimateLineInput, "itemType"> {
  componentPricing?: EstimateComponentPricing | undefined;
  estimateNotes?: string[] | undefined;
  itemType?: "main_line" | "temporary" | undefined;
  id: string;
  mainBasketName: string;
  subBasketName: string | null;
  mainLineName: string;
  uomName: string;
  uomCode: string;
  uomDecimalScale: number;
  sourceItemStatus?: "draft" | "active" | "inactive" | undefined;
  sourceRevisionStatus?: "draft" | "active" | undefined;
  sourceItemVersion?: number | undefined;
  sourceRevisionVersion?: number | undefined;
  configurationUomChanged?: boolean | undefined;
  configurationSourceUnavailable?: boolean | undefined;
  configurationTierUnavailable?: boolean | undefined;
  configurationDimensionsChanged?: boolean | undefined;
  previousUomName?: string | undefined;
  unit: string;
  specification: null;
  rate: number | null;
  amount: number | null;
  amountPaise: number | null;
}

export interface LegacyEstimateLine extends LegacyEstimateLineInput {
  id?: string | undefined;
  amount?: number | undefined;
  amountPaise?: number | undefined;
}

export type EstimateLine = LegacyEstimateLine | ConfiguredEstimateLine;

export interface EstimateDraftInput {
  propertyType: string;
  bedroomCount?: number | null | undefined;
  rooms: Array<Record<string, unknown>>;
  scopes: string[];
  selectedMainBasketIds?: string[] | undefined;
  selectedMainBasketClassifications?: Array<{ mainBasketId: string; classification: EstimateClassification }>;
  expectedVersion?: number | undefined;
  lineItems: EstimateLineInput[];
}
export type EstimateStatus = "draft" | "pending_manager_assignment" | "pending_designer_approval" | "designer_changes_requested" | "ready_for_client" | "sent_to_client" | "client_changes_requested" | "client_approved";
export interface EstimationLifecycle {
  workflowVersion: 2;
  phase: "pre" | "post";
  status: EstimateStatus;
  requirementsVersion: number;
  editClosedAt: string | null;
  preApproval: { reviewRoundId: string; estimateVersion: number; approvedAt: string } | null;
  finalApproval: { reviewRoundId: string; estimateVersion: number; approvedAt: string; requirementsVersion: number; designReviewRoundId: string; designPlanVersion: number; designScopeRevision: number } | null;
  designScopeRevision: number;
  approvedDesignScopeRevision: number | null;
  pendingReviewRoundId: string | null;
  preparationSnapshotId: string | null;
}
export interface EstimateDraft extends Omit<EstimateDraftInput, "lineItems"> {
  id: string;
  version?: number | undefined;
  lineItems: EstimateLine[];
  subtotal: number;
  gst: number;
  total: number;
  subtotalPaise?: number | undefined;
  gstPaise?: number | undefined;
  totalPaise?: number | undefined;
  status: EstimateStatus;
  approvalRequired: boolean;
  assignedDesignerId?: string | null | undefined;
  projectId?: string | null | undefined;
  clientReview?: EstimateReviewSummary | null | undefined;
  clientFeedback?: { note: string; occurredAt: string; reviewRoundId: string | null } | null;
  designPlanStatus?: string | null | undefined;
  designPlanVersion?: number | undefined;
  estimation?: EstimationLifecycle | null | undefined;
  preApprovedReview?: { reviewRoundId: string; estimateVersion: number; snapshot: Record<string, unknown> } | null;
}
export interface SavedEstimate extends EstimateDraft {
  leadId: string;
  updatedAt: string;
  lead: StaffLead | null;
}
