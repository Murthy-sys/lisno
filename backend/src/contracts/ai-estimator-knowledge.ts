import type {
  KnowledgeAvailabilityState,
  KnowledgeCompletenessState,
  KnowledgeDurationUnit,
  KnowledgeItemStatus,
  KnowledgeMasterStatus,
  KnowledgeModeFieldType,
  KnowledgeModeKind,
  KnowledgeExecutionSource,
  KnowledgeQuantityGapBehavior,
  KnowledgeQuantityRelationship,
  KnowledgeQualityParameterType,
  KnowledgeRecommendationType,
  KnowledgeRevisionStatus,
  KnowledgeSectionApplicability,
  KnowledgeSectionKey,
  KnowledgeSpecificationFieldType,
  KnowledgeTaxTreatment,
  KnowledgeVersionStatus
} from "../domain/ai-estimator-knowledge.js";

export type KnowledgeStableId = string;
export type KnowledgeCanonicalDecimal = string;
export type KnowledgePaise = number;
export type KnowledgeBasisPoints = number;

export const AI_ESTIMATOR_KNOWLEDGE_BASKET_DELETION_BLOCKER_CODES = [
  "BOOTSTRAP_OWNED",
  "HAS_MAIN_LINES",
  "HAS_HISTORICAL_REFERENCES"
] as const;

export type KnowledgeBasketDeletionBlockerCode =
  (typeof AI_ESTIMATOR_KNOWLEDGE_BASKET_DELETION_BLOCKER_CODES)[number];

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
  referenceState?: KnowledgeSectionReferenceState;
}

export interface KnowledgeSectionReferenceState {
  specificationIds: KnowledgeStableId[];
}

export interface KnowledgeSectionMutationEnvelope<TPayload = unknown>
  extends KnowledgeSectionEnvelope<TPayload> {
  aggregateVersion: number;
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

export interface KnowledgeDescriptiveSpecification {
  id: KnowledgeStableId;
  name: string;
  description?: string | null;
}

/** @deprecated Use KnowledgeDescriptiveSpecification for current writes. */
export type KnowledgeLegacySpecification = KnowledgeDescriptiveSpecification;

interface KnowledgeCanonicalSpecificationBase {
  id: KnowledgeStableId;
  name: string;
  description?: string | null;
}

/** @deprecated Typed Specification rows are retained only for stored-data compatibility. */
export type KnowledgeCanonicalSpecification =
  | (KnowledgeCanonicalSpecificationBase & {
      type: Extract<KnowledgeSpecificationFieldType, "text" | "textarea">;
      options: [];
      value: string | null;
    })
  | (KnowledgeCanonicalSpecificationBase & {
      type: Extract<KnowledgeSpecificationFieldType, "number">;
      options: [];
      value: KnowledgeCanonicalDecimal | null;
    })
  | (KnowledgeCanonicalSpecificationBase & {
      type: Extract<KnowledgeSpecificationFieldType, "radio" | "dropdown">;
      options: string[];
      value: string | null;
    })
  | (KnowledgeCanonicalSpecificationBase & {
      type: Extract<KnowledgeSpecificationFieldType, "checkbox">;
      options: [];
      value: boolean;
    });

export type KnowledgeSpecification =
  | KnowledgeDescriptiveSpecification
  | KnowledgeCanonicalSpecification;

export interface KnowledgePriceEntryAppendCommand {
  operation: "append";
  priceEntryId: KnowledgeStableId;
  vendorId: KnowledgeStableId;
  uomId: KnowledgeStableId;
  specificationId: null;
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

export interface KnowledgeModeField {
  id: KnowledgeStableId;
  type: KnowledgeModeFieldType;
  label: string;
  options: string[];
}

interface KnowledgeModeConfigurationBase {
  id: KnowledgeStableId;
  fields: KnowledgeModeField[];
}

export type KnowledgeModeConfiguration =
  | (KnowledgeModeConfigurationBase & {
      modeKind: Extract<KnowledgeModeKind, "pmc">;
      executionSource?: never;
      modeId?: never;
    })
  | (KnowledgeModeConfigurationBase & {
      modeKind: Extract<KnowledgeModeKind, "execution">;
      executionSource: KnowledgeExecutionSource;
      modeId?: never;
    })
  | (KnowledgeModeConfigurationBase & {
      modeKind?: never;
      executionSource?: never;
      modeId: KnowledgeStableId;
    });

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
