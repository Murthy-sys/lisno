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
  KnowledgeQualityParameterType,
  KnowledgeRevisionStatus,
  KnowledgeSectionApplicability,
  KnowledgeSectionKey,
  KnowledgeSpecificationFieldType,
  KnowledgeTaxTreatment,
  KnowledgeVersionStatus
} from "../domain/ai-estimator-knowledge.js";
import type { KnowledgePrioritySemanticTier } from "../domain/ai-estimator-knowledge-priority.js";

export type { KnowledgePrioritySemanticTier } from "../domain/ai-estimator-knowledge-priority.js";

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

export type KnowledgeSurface = KnowledgeMaster;

export interface KnowledgePriority extends KnowledgeMaster {
  semanticTier?: KnowledgePrioritySemanticTier;
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

export interface KnowledgeTemporaryMainLineReference {
  mainLineId: string;
  mainLineName: string;
  basketId: string;
  basketName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  status: KnowledgeItemStatus;
  revisionId: string;
  revisionStatus: "draft" | "active";
  rules: Array<Pick<KnowledgeBudgetAlteration, "id" | "trigger" | "action" | "requirement" | "reason" | "active">>;
}

export interface KnowledgeItemListItem extends KnowledgeVersionedResource {
  itemType?: "main_line" | "temporary";
  linkedMainLines?: KnowledgeTemporaryMainLineReference[];
  basketId: KnowledgeStableId;
  basketName: string;
  subBasketId?: KnowledgeStableId | null;
  subBasketName?: string | null;
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
  /** Current display projection, including the Main Basket checklist when configured. */
  completeness: KnowledgeCompletenessSummary;
  allowedActions: string[];
}

export interface KnowledgeRevision extends KnowledgeVersionedResource {
  mainLineId: KnowledgeStableId;
  revisionNumber: number;
  status: KnowledgeRevisionStatus;
  sourceRevisionId: KnowledgeStableId | null;
  contentDigest: string | null;
  /** Stored item-revision snapshot; shared Basket edits do not rewrite this history. */
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

export interface KnowledgeSlabRate {
  id: KnowledgeStableId;
  specificationId: KnowledgeStableId;
  uomId: KnowledgeStableId;
  quantity: KnowledgeCanonicalDecimal;
  unitRatePaise: KnowledgePaise;
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

/** @deprecated Compatibility-only. New Budgeting writes use KnowledgeBudgetSetCommand. */
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

export interface KnowledgeBudgetSetCommand {
  operation: "set_budget";
  sourcePriceVersionId?: KnowledgeStableId | null;
  vendorId: KnowledgeStableId;
  uomId: KnowledgeStableId;
  inputAmountPaise: KnowledgePaise;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface KnowledgePriceEntryReference {
  operation: "reference";
  priceEntryId: KnowledgeStableId;
  priceVersionId: KnowledgeStableId;
}

export type KnowledgePriceEntryCommand =
  | KnowledgeBudgetSetCommand
  | KnowledgePriceEntryAppendCommand
  | KnowledgePriceEntryReference;

export interface KnowledgeRecommendation {
  id: KnowledgeStableId;
  name: string;
  priorityId: KnowledgeStableId;
  reason: string | null;
  dependency: boolean;
  active: boolean;
}

/** Conditional scope guidance, never an instruction to mutate an estimate automatically. */
export interface KnowledgeBudgetAlteration {
  id: KnowledgeStableId;
  trigger: "added" | "removed";
  action: "add" | "remove";
  requirement: "must" | "can";
  targetType: "catalog" | "temporary";
  targetBasketId: KnowledgeStableId;
  targetSubBasketId: KnowledgeStableId | null;
  targetMainLineId: KnowledgeStableId;
  reason: string;
  active: boolean;
}

export interface KnowledgeExclusion {
  id: KnowledgeStableId;
  name: string;
  reason: string | null;
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
  instructions?: string | null;
  acceptanceCriteria?: string | null;
  stage?: string | null;
  checkMethod?: "visual" | "measurement" | "functional_test" | "document_review" | null;
  severity?: "critical" | "major" | "minor" | null;
  responsibleRole?: string | null;
  failureAction?: string | null;
  sampling?: { method: "all" | "percentage" | "fixed_count"; value?: number | null; unit: string } | null;
  evidence?: { photos: boolean; documents: boolean; video: boolean; minPhotosPerSample?: number | null; instructions?: string | null } | null;
}

export interface KnowledgeModeField {
  id: KnowledgeStableId;
  type: KnowledgeModeFieldType;
  label: string;
  options: string[];
}

export interface KnowledgePmcScopeItem {
  id: KnowledgeStableId;
  name: string;
  selected: boolean;
}

interface KnowledgeModeConfigurationBase {
  id: KnowledgeStableId;
  fields: KnowledgeModeField[];
}

export type KnowledgeModeConfiguration =
  | (KnowledgeModeConfigurationBase & {
      modeKind: Extract<KnowledgeModeKind, "pmc">;
      inclusions?: KnowledgePmcScopeItem[];
      exclusions?: KnowledgePmcScopeItem[];
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

export interface KnowledgeModeCalculationSettings {
  baseRatePaise: KnowledgePaise;
  lowQuantityLimit: KnowledgeCanonicalDecimal;
  /** Defaults to 1,000 (10%) for configurations saved before editable Impact. */
  impactBps?: KnowledgeBasisPoints;
  minimumMarkupBps: KnowledgeBasisPoints;
  startingMarkupBps: KnowledgeBasisPoints;
}

/** Each scope owns its settings; null means that scope has not been configured. */
export type KnowledgeModeCalculations = Record<"pmc" | "sub_vendor", KnowledgeModeCalculationSettings | null> & (
  | { in_house_labor: KnowledgeModeCalculationSettings | null; in_house_material: KnowledgeModeCalculationSettings | null;
      /** Retained legacy In-house snapshot; split costs never inherit later changes. */
      in_house?: KnowledgeModeCalculationSettings | null }
  | { in_house: KnowledgeModeCalculationSettings | null; in_house_labor?: never; in_house_material?: never }
);

export interface KnowledgeModeCalculationPreview {
  revisedUnitRatePaise: KnowledgePaise;
  revisedAmountPaise: KnowledgePaise;
  totalPaise: KnowledgePaise;
  appliedImpactBps: KnowledgeBasisPoints;
  discount?: {
    rateBps: KnowledgeBasisPoints;
    effectiveMarkupBps: KnowledgeBasisPoints;
    totalBeforeDiscountPaise: KnowledgePaise;
    amountPaise: KnowledgePaise;
  };
}

/** Simulator inputs; PMC uses the separate saved margin, never Mode markups. */
export interface KnowledgePmcCalculationSettings {
  baseRatePaise: KnowledgePaise;
  lowQuantityLimit: KnowledgeCanonicalDecimal;
  impactBps?: KnowledgeBasisPoints;
  pmcMarginBps: KnowledgeBasisPoints;
}

export interface KnowledgePmcCalculationPreview {
  baseAmountPaise: KnowledgePaise;
  lowQuantityImpactAmountPaise: KnowledgePaise;
  revisedUnitRatePaise: KnowledgePaise;
  revisedAmountPaise: KnowledgePaise;
  totalPaise: KnowledgePaise;
  appliedImpactBps: KnowledgeBasisPoints;
  pmcMarginBps: KnowledgeBasisPoints;
  pmcMarginAmountPaise: KnowledgePaise;
  totalBeforeDiscountPaise: KnowledgePaise;
  /** Signed remainder after the configured margin; can be negative for a large custom discount. */
  finalVendorChargesPaise: KnowledgePaise;
  discount?: {
    rateBps: KnowledgeBasisPoints;
    totalBeforeDiscountPaise: KnowledgePaise;
    amountPaise: KnowledgePaise;
  };
}

/** Independent Sub-Vendor margin settings; shares PMC's pricing arithmetic. */
export interface KnowledgeSubVendorCalculationSettings {
  baseRatePaise: KnowledgePaise;
  lowQuantityLimit: KnowledgeCanonicalDecimal;
  impactBps?: KnowledgeBasisPoints;
  subVendorMarginBps: KnowledgeBasisPoints;
}

export interface KnowledgeSubVendorCalculationPreview extends Omit<KnowledgePmcCalculationPreview, "pmcMarginBps" | "pmcMarginAmountPaise"> {
  subVendorMarginBps: KnowledgeBasisPoints;
  subVendorMarginAmountPaise: KnowledgePaise;
}

export interface KnowledgeInHouseCalculationSettings {
  labor: KnowledgeModeCalculationSettings;
  material: KnowledgeModeCalculationSettings;
}

export interface KnowledgeInHouseCalculationPreview {
  labor: KnowledgeModeCalculationPreview;
  material: KnowledgeModeCalculationPreview;
  totalPaise: KnowledgePaise;
}

export interface KnowledgePreview {
  modeCalculation?: KnowledgeModeCalculationPreview;
  inHouseCalculation?: KnowledgeInHouseCalculationPreview;
  pmcCalculation?: KnowledgePmcCalculationPreview;
  subVendorCalculation?: KnowledgeSubVendorCalculationPreview;
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
  basketQualityRevisionId?: KnowledgeStableId;
  basketQualityContentDigest?: string;
  evaluatedAt: string;
}

export interface KnowledgeContext {
  lineage: KnowledgeContextLineage;
  availability: KnowledgeAvailability[];
  sections: Partial<Record<KnowledgeSectionKey, unknown>>;
  preview: KnowledgePreview | null;
  configuration: KnowledgeConfigurationContext;
}

export type KnowledgeCalculationScope = "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material";

/** Active-revision settings for future analysis, separate from the legacy price-version preview. */
export interface KnowledgeConfigurationContext {
  formulaVersion: "mode-markup-v1";
  moneyUnit: "paise";
  percentageUnit: "basis_points";
  selection: {
    modeKind: KnowledgeModeKind | null;
    executionSource: KnowledgeExecutionSource | null;
  };
  uom: { id: string; name: string; decimalScale: number } | null;
  shared: {
    /** Saved wording only. The structured lists remain authoritative even if wording differs. */
    paragraph: string | null;
    scopeConfigurationId: string | null;
    inclusions: Array<{ id: string; name: string }>;
    exclusions: Array<{ id: string; name: string }>;
  };
  state: "ready" | "selection_required" | "not_configured" | "invalid";
  issues: Array<{ code: string; scope: KnowledgeCalculationScope | null }>;
  calculations: Array<{
    scope: KnowledgeCalculationScope;
    source: "scoped" | "legacy_shared" | "legacy_in_house" | null;
    settings: Required<KnowledgeModeCalculationSettings> | null;
    /** A difference in markup percentage points, not a selling-price discount. */
    maximumDiscountBps: number | null;
  }>;
}
