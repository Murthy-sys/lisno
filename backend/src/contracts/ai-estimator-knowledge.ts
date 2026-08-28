import type {
  KnowledgeAvailabilityState,
  KnowledgeCompletenessState,
  KnowledgeDurationUnit,
  KnowledgeItemStatus,
  KnowledgeMasterStatus,
  KnowledgeQuantityGapBehavior,
  KnowledgeQuantityRelationship,
  KnowledgeQualityParameterType,
  KnowledgeRecommendationType,
  KnowledgeRevisionStatus,
  KnowledgeSectionApplicability,
  KnowledgeSectionKey,
  KnowledgeTaxTreatment,
  KnowledgeVersionStatus
} from "../domain/ai-estimator-knowledge.js";

export type KnowledgeStableId = string;
export type KnowledgeCanonicalDecimal = string;
export type KnowledgePaise = number;
export type KnowledgeBasisPoints = number;

export interface KnowledgeActorMetadata {
  createdById: KnowledgeStableId;
  updatedById: KnowledgeStableId;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersionedResource extends KnowledgeActorMetadata {
  id: KnowledgeStableId;
  version: number;
}

export interface KnowledgeMaster extends KnowledgeVersionedResource {
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  status: KnowledgeMasterStatus;
}

export interface KnowledgeUom extends KnowledgeMaster {
  decimalScale: 0 | 1 | 2 | 3;
}

export interface KnowledgeTaxVersion extends KnowledgeVersionedResource {
  taxRuleId: KnowledgeStableId;
  versionNumber: number;
  rateBps: KnowledgeBasisPoints;
  treatment: KnowledgeTaxTreatment;
  applicability: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: KnowledgeVersionStatus;
}

export interface KnowledgeCompletenessFinding {
  code: string;
  sectionKey: KnowledgeSectionKey;
  message: string;
  blocking: boolean;
}

export interface KnowledgeSectionCompleteness {
  sectionKey: KnowledgeSectionKey;
  state: KnowledgeCompletenessState;
  findings: KnowledgeCompletenessFinding[];
}

export interface KnowledgeCompletenessSummary {
  percentage: number;
  sections: KnowledgeSectionCompleteness[];
  blockers: KnowledgeCompletenessFinding[];
  warnings: KnowledgeCompletenessFinding[];
}

export interface KnowledgeItemListItem extends KnowledgeVersionedResource {
  basketId: KnowledgeStableId;
  basketName: string;
  mainLineId: KnowledgeStableId;
  mainLineName: string;
  description: string | null;
  status: KnowledgeItemStatus;
  activeRevisionId: KnowledgeStableId | null;
  draftRevisionId: KnowledgeStableId | null;
  revisionNumber: number | null;
  uomId: KnowledgeStableId | null;
  priorityId: KnowledgeStableId | null;
  modeIds: KnowledgeStableId[];
  surfaceIds: KnowledgeStableId[];
  vendorIds: KnowledgeStableId[];
  completeness: KnowledgeCompletenessSummary;
  allowedActions: string[];
}

export interface KnowledgeRevision extends KnowledgeVersionedResource {
  mainLineId: KnowledgeStableId;
  revisionNumber: number;
  status: KnowledgeRevisionStatus;
  sourceRevisionId: KnowledgeStableId | null;
  contentDigest: string | null;
  completeness: KnowledgeCompletenessSummary;
  activatedAt: string | null;
  activatedById: KnowledgeStableId | null;
  supersededAt: string | null;
  supersededById: KnowledgeStableId | null;
}

export interface KnowledgeSectionEnvelope<TPayload = unknown>
  extends KnowledgeVersionedResource {
  mainLineId: KnowledgeStableId;
  revisionId: KnowledgeStableId;
  sectionKey: KnowledgeSectionKey;
  applicability: KnowledgeSectionApplicability;
  payload: TPayload;
}

export interface KnowledgeQuantitySlab {
  id: KnowledgeStableId;
  minimumQuantity: KnowledgeCanonicalDecimal;
  maximumQuantity: KnowledgeCanonicalDecimal | null;
  adjustmentBps: number;
}

export interface KnowledgeQuantityRules {
  gapBehavior: KnowledgeQuantityGapBehavior;
  slabs: KnowledgeQuantitySlab[];
}

export interface KnowledgePriceEntryAppendCommand {
  operation: "append";
  priceEntryId: KnowledgeStableId;
  vendorId: KnowledgeStableId;
  uomId: KnowledgeStableId;
  specificationId: KnowledgeStableId | null;
  modeId: KnowledgeStableId | null;
  taxRuleId: KnowledgeStableId;
  taxVersionId: KnowledgeStableId;
  inputAmountPaise: KnowledgePaise;
  treatment: KnowledgeTaxTreatment;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: KnowledgeVersionStatus;
}

export interface KnowledgePriceEntryReference {
  operation: "reference";
  priceEntryId: KnowledgeStableId;
  priceVersionId: KnowledgeStableId;
}

export type KnowledgePriceEntryCommand =
  | KnowledgePriceEntryAppendCommand
  | KnowledgePriceEntryReference;

export interface KnowledgeRecommendation {
  id: KnowledgeStableId;
  targetBasketId: KnowledgeStableId;
  targetMainLineId: KnowledgeStableId;
  type: KnowledgeRecommendationType;
  priorityId: KnowledgeStableId | null;
  reason: string;
  quantityRelationship: KnowledgeQuantityRelationship;
  quantityValue: KnowledgeCanonicalDecimal | null;
  dependency: boolean;
  active: boolean;
}

export interface KnowledgeQualityParameter {
  id: KnowledgeStableId;
  type: KnowledgeQualityParameterType;
  label: string;
  unit: string | null;
  allowedValues: string[];
  minimum: KnowledgeCanonicalDecimal | null;
  maximum: KnowledgeCanonicalDecimal | null;
  defaultValue: unknown;
  required: boolean;
  category: string | null;
  active: boolean;
}

export interface KnowledgeExecutionStep {
  id: KnowledgeStableId;
  order: number;
  name: string;
  description: string | null;
  durationValue: KnowledgeCanonicalDecimal | null;
  durationUnit: KnowledgeDurationUnit | null;
  crewSize: number | null;
  skillType: string | null;
  mandatory: boolean;
  parallelizable: boolean;
  active: boolean;
  dependencyStepIds: KnowledgeStableId[];
}

export interface KnowledgePreviewAmountComponent {
  amountPaise: KnowledgePaise;
  basisAmountPaise: KnowledgePaise;
  rateBps: KnowledgeBasisPoints | null;
}

export interface KnowledgePreview {
  formulaVersion: "knowledge-preview-v1";
  effectivePriceVersionId: KnowledgeStableId | null;
  taxVersionId: KnowledgeStableId | null;
  effectiveUnitRatePaise: KnowledgePaise | null;
  adjustedUnitRate: KnowledgePreviewAmountComponent | null;
  requiredQuantity: KnowledgeCanonicalDecimal | null;
  procurementQuantity: KnowledgeCanonicalDecimal | null;
  vendorPreTax: KnowledgePreviewAmountComponent | null;
  vendorTax: KnowledgePreviewAmountComponent | null;
  vendorTotal: KnowledgePreviewAmountComponent | null;
  startMargin: KnowledgePreviewAmountComponent | null;
  bottomMargin: KnowledgePreviewAmountComponent | null;
  pmcMarkup: KnowledgePreviewAmountComponent | null;
  duration: {
    raw: KnowledgeCanonicalDecimal;
    clamped: KnowledgeCanonicalDecimal;
    unit: KnowledgeDurationUnit;
  } | null;
}

export interface KnowledgeAvailability {
  sectionKey: KnowledgeSectionKey;
  state: KnowledgeAvailabilityState;
  reasonCode: string | null;
}

export interface KnowledgeContextLineage {
  mainLineId: KnowledgeStableId;
  revisionId: KnowledgeStableId;
  revisionNumber: number;
  priceVersionId: KnowledgeStableId | null;
  taxVersionId: KnowledgeStableId | null;
  formulaVersion: "knowledge-preview-v1";
  contentDigest: string;
  evaluatedAt: string;
}

export interface KnowledgeContext {
  lineage: KnowledgeContextLineage;
  availability: KnowledgeAvailability[];
  sections: Partial<Record<KnowledgeSectionKey, unknown>>;
  preview: KnowledgePreview | null;
}
