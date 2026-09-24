export const KNOWLEDGE_SECTION_KEYS = [
  "overview",
  "pricing",
  "quantity-margin",
  "scope",
  "recommendations",
  "quality",
  "execution",
  "advanced"
] as const;

export type KnowledgeSectionKey = (typeof KNOWLEDGE_SECTION_KEYS)[number];

export const KNOWLEDGE_MASTER_TYPES = [
  "uoms",
  "vendors",
  "taxes",
  "priorities",
  "surfaces",
  "modes"
] as const;

export type KnowledgeMasterType = (typeof KNOWLEDGE_MASTER_TYPES)[number];
export type KnowledgeItemStatus = "draft" | "active" | "inactive" | "archived";
export type KnowledgeRevisionStatus = "draft" | "active" | "superseded";
export type KnowledgeMasterStatus = "active" | "inactive" | "archived";
export type KnowledgePrioritySemanticTier =
  | "non_negotiable"
  | "high"
  | "medium"
  | "low";
export type KnowledgeModeKind = "pmc" | "execution";
export type KnowledgeExecutionSource = "sub_vendor" | "in_house";
export type KnowledgeSectionApplicability =
  | "configured"
  | "not_configured"
  | "not_applicable";
export type KnowledgeCompletenessState =
  | "complete"
  | "needs_attention"
  | "not_configured"
  | "not_applicable";
export type KnowledgeAvailabilityState =
  | "available"
  | "not_configured"
  | "not_applicable"
  | "not_resolvable";
export type KnowledgeDurationUnit = "minutes" | "hours" | "days" | "weeks";
export type KnowledgeQualityControlOptionKind = "frequency" | "performer";
/** Public custom-option reference. Runtime validation requires qco_<24 lowercase hex>. */
export type KnowledgeQualityControlOptionReference = `qco_${string}`;

export type KnowledgeAllowedAction =
  | "update_section"
  | "review_and_activate"
  | "create_revision"
  | "duplicate"
  | "deactivate"
  | "archive";

export type KnowledgeJsonScalar = string | number | boolean | null;
export type KnowledgeJsonValue =
  | KnowledgeJsonScalar
  | KnowledgeJsonObject
  | readonly KnowledgeJsonValue[];

export interface KnowledgeJsonObject {
  readonly [key: string]: KnowledgeJsonValue;
}

export interface KnowledgeBudgetAlterationBase {
  readonly id: string;
  readonly trigger: "added" | "removed";
  readonly action: "add" | "remove";
  readonly requirement: "must" | "can";
  readonly targetBasketId: string;
  readonly reason: string;
  readonly active: boolean;
}

export interface KnowledgeMainLineBudgetAlteration extends KnowledgeBudgetAlterationBase {
  /** Missing on legacy responses; normalize to main_line before editing. */
  readonly targetKind?: "main_line";
  readonly targetType: "catalog" | "temporary";
  readonly targetSubBasketId: string | null;
  readonly targetMainLineId: string;
}

export interface KnowledgeSubBasketBudgetAlteration extends KnowledgeBudgetAlterationBase {
  readonly targetKind: "sub_basket";
  readonly targetType: null;
  readonly targetSubBasketId: string;
  readonly targetMainLineId: null;
}

export type KnowledgeBudgetAlteration = KnowledgeMainLineBudgetAlteration | KnowledgeSubBasketBudgetAlteration;

export interface KnowledgeActorMetadata {
  readonly createdById: string;
  readonly updatedById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeVersionedResource extends KnowledgeActorMetadata {
  readonly id: string;
  readonly version: number;
}

/** Append-only reusable value for a Quality Parameter control. */
export interface KnowledgeQualityControlOptionSummary {
  readonly id: string;
  readonly kind: KnowledgeQualityControlOptionKind;
  readonly name: string;
}

export interface KnowledgeQualityControlOption extends KnowledgeVersionedResource, KnowledgeQualityControlOptionSummary {}

export interface KnowledgeQualityControlOptionListResponse {
  readonly items: readonly KnowledgeQualityControlOptionSummary[];
}

export interface KnowledgeCreateQualityControlOptionInput {
  readonly kind: KnowledgeQualityControlOptionKind;
  readonly name: string;
}

export interface KnowledgeMaster extends KnowledgeVersionedResource {
  readonly masterType: KnowledgeMasterType;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly status: KnowledgeMasterStatus;
  readonly semanticTier?: KnowledgePrioritySemanticTier;
  readonly decimalScale?: number;
  readonly taxVersions?: readonly KnowledgeTaxVersion[];
  readonly procurementSummary?: ProcurementVendorSummary;
}

export interface KnowledgeSurface extends KnowledgeMaster {
  readonly masterType: "surfaces";
}

export interface KnowledgeTaxVersion extends KnowledgeVersionedResource {
  readonly taxRuleId: string;
  readonly versionNumber: number;
  readonly rateBps: number;
  readonly treatment: "exclusive" | "inclusive";
  readonly applicability: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: "draft" | "active" | "inactive";
}

export interface KnowledgeCompletenessFinding {
  readonly code: string;
  readonly sectionKey: KnowledgeSectionKey;
  readonly message: string;
  readonly blocking: boolean;
}

export interface KnowledgeSectionCompleteness {
  readonly sectionKey: KnowledgeSectionKey;
  readonly state: KnowledgeCompletenessState;
  readonly findings: readonly KnowledgeCompletenessFinding[];
}

export interface KnowledgeCompleteness {
  readonly percentage: number;
  readonly sections: readonly KnowledgeSectionCompleteness[];
  readonly blockers: readonly KnowledgeCompletenessFinding[];
  readonly warnings: readonly KnowledgeCompletenessFinding[];
}

export interface KnowledgePagination {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface KnowledgePageEnvelope<TItem> {
  readonly items: readonly TItem[];
  readonly pagination: KnowledgePagination;
}

export interface KnowledgeBasket extends KnowledgeVersionedResource {
  readonly name: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly status: KnowledgeMasterStatus;
}

export interface KnowledgeBasketQuality {
  readonly basketId: string;
  readonly basketName: string;
  readonly basketStatus: KnowledgeMasterStatus;
  /** Main Basket CAS version, independent of the item revision. */
  readonly version: number;
  readonly revisionId: string | null;
  readonly revisionNumber: number;
  readonly contentDigest: string | null;
  readonly parameters: readonly KnowledgeJsonObject[];
  readonly updatedAt: string | null;
}

/** Shared Sub Basket identity, retained by vendor classifications as well as items. */
export interface KnowledgeSubBasket extends Omit<KnowledgeBasket, "description" | "status"> {
  readonly basketId: string;
}

export interface KnowledgeSubBasketListResponse extends KnowledgePageEnvelope<KnowledgeSubBasket> {}

export interface KnowledgeSubBasketDeletionImpact {
  readonly basketId: string;
  readonly subBasketId: string;
  readonly subBasketName: string;
  readonly version: number;
  readonly mainLineCount: number;
  readonly referenceCount: number;
  readonly vendorReferenceCount?: number;
  readonly impactToken: string;
}

export interface KnowledgePermanentDeleteSubBasketResult {
  readonly basketId: string;
  readonly subBasketId: string;
  readonly deleted: true;
  readonly deletedAt: string;
  readonly deletedMainLineIds: readonly string[];
  readonly deletedReferenceCount: number;
}

export interface KnowledgeBasketDeletionImpact {
  readonly basketId: string;
  readonly basketName: string;
  readonly version: number;
  /** Main Lines deleted with the Basket, along with their revision history. */
  readonly mainLineCount: number;
  readonly subBasketCount?: number;
  /** Relationship rows in other configurations that are stripped. */
  readonly historicalReferenceCount: number;
  readonly vendorReferenceCount?: number;
  /** Seeded by the knowledge bootstrap; deletable, but worth saying out loud. */
  readonly bootstrapOwned: boolean;
}

export interface KnowledgeMainLineDeletionResult {
  readonly mainLineId: string;
  readonly deleted: true;
  readonly deletedAt: string;
}

export interface KnowledgePermanentDeleteBasketResult {
  readonly basketId: string;
  readonly deleted: true;
  readonly deletedAt: string;
}

export interface KnowledgeMainLine extends KnowledgeVersionedResource {
  readonly itemType?: "main_line" | "temporary";
  readonly completionRequired: boolean;
  readonly subBasketId?: string | null;
  readonly basketId: string;
  readonly name: string;
  readonly description: string | null;
  readonly displayOrder: number;
  readonly status: KnowledgeItemStatus;
  readonly activeRevisionId: string | null;
  readonly draftRevisionId: string | null;
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
  rules: Array<{ id: string; trigger: "added" | "removed"; action: "add" | "remove"; requirement: "must" | "can"; targetKind?: "main_line" | "sub_basket"; reason: string; active: boolean }>;
}

export interface KnowledgeItemListItem extends KnowledgeVersionedResource {
  readonly linkedMainLines?: readonly KnowledgeTemporaryMainLineReference[];
  readonly itemType?: "main_line" | "temporary";
  readonly completionRequired: boolean;
  readonly basketId: string;
  readonly basketName: string;
  readonly subBasketId?: string | null;
  readonly subBasketName?: string | null;
  readonly mainLineId: string;
  readonly mainLineName: string;
  readonly description: string | null;
  readonly status: KnowledgeItemStatus;
  readonly activeRevisionId: string | null;
  readonly draftRevisionId: string | null;
  readonly revisionNumber: number | null;
  readonly uomId: string | null;
  readonly priorityId: string | null;
  readonly modeIds: readonly string[];
  readonly surfaceIds: readonly string[];
  readonly vendorIds: readonly string[];
  readonly completeness: KnowledgeCompleteness;
  readonly allowedActions: readonly string[];
}

export interface KnowledgeRevision extends KnowledgeVersionedResource {
  readonly mainLineId: string;
  readonly revisionNumber: number;
  readonly status: KnowledgeRevisionStatus;
  readonly sourceRevisionId: string | null;
  readonly contentDigest: string | null;
  readonly completeness: KnowledgeCompleteness;
  readonly activatedAt: string | null;
  readonly activatedById: string | null;
  readonly supersededAt: string | null;
  readonly supersededById: string | null;
}

export interface KnowledgeItemDetail extends KnowledgeItemListItem {
  readonly activeRevision: KnowledgeRevision | null;
  readonly draftRevision: KnowledgeRevision | null;
  readonly blockers: readonly KnowledgeCompletenessFinding[];
  readonly warnings: readonly KnowledgeCompletenessFinding[];
}

export interface KnowledgeSectionEnvelope<
  TPayload extends KnowledgeJsonValue = KnowledgeJsonObject
> extends KnowledgeVersionedResource {
  readonly mainLineId: string;
  readonly revisionId: string;
  readonly sectionKey: KnowledgeSectionKey;
  readonly applicability: KnowledgeSectionApplicability;
  readonly payload: TPayload;
  readonly referenceState?: {
    readonly specificationIds: readonly string[];
  };
}

export interface KnowledgeSectionMutationEnvelope<
  TPayload extends KnowledgeJsonValue = KnowledgeJsonObject
> extends KnowledgeSectionEnvelope<TPayload> {
  readonly aggregateVersion: number;
}

export interface KnowledgeActivationReview {
  readonly mainLineId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly expectedVersion: number;
  readonly completeness: KnowledgeCompleteness;
  readonly canActivate: boolean;
  readonly allowedActions: readonly string[];
}

export interface KnowledgeHistoryEntry extends KnowledgeRevision {}

/** Business-only Budgeting command. Every omitted pricing field is server-owned. */
export interface KnowledgeBudgetSetCommand {
  readonly operation: "set_budget";
  readonly sourcePriceVersionId?: string | null;
  readonly vendorId: string;
  readonly uomId: string;
  readonly inputAmountPaise: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

/** Compact immutable reference returned by the server and retained unchanged. */
export interface KnowledgeBudgetReferenceCommand {
  readonly operation: "reference";
  readonly priceEntryId: string;
  readonly priceVersionId: string;
}

export interface KnowledgePreviewAmountComponent {
  readonly amountPaise: number;
  readonly basisAmountPaise: number;
  readonly rateBps: number | null;
}

export interface KnowledgePreview {
  /** Selling price is adjusted cost / (1 − Lisno margin); amounts retain the PMC-shaped breakdown, not its formula. */
  readonly subVendorCalculation?: Omit<NonNullable<KnowledgePreview["pmcCalculation"]>, "pmcMarginBps" | "pmcMarginAmountPaise"> & {
    readonly subVendorMarginBps: number;
    /** Rounded selling price before discount minus adjusted cost, in paise. */
    readonly subVendorMarginAmountPaise: number;
  };
  readonly pmcCalculation?: {
    readonly baseAmountPaise: number;
    readonly lowQuantityImpactAmountPaise: number;
    readonly revisedUnitRatePaise: number;
    readonly revisedAmountPaise: number;
    readonly totalPaise: number;
    readonly appliedImpactBps: number;
    readonly pmcMarginBps: number;
    readonly pmcMarginAmountPaise: number;
    readonly totalBeforeDiscountPaise: number;
    /** Preserved adjusted cost for PMC; Sub-Vendor retains its legacy signed remainder semantics. */
    readonly finalVendorChargesPaise: number;
    readonly discount?: {
      readonly rateBps: number;
      readonly totalBeforeDiscountPaise: number;
      readonly amountPaise: number;
    };
  };
  readonly inHouseCalculation?: {
    readonly labor: NonNullable<KnowledgePreview["modeCalculation"]>;
    readonly material: NonNullable<KnowledgePreview["modeCalculation"]>;
    readonly totalPaise: number;
  };
  readonly modeCalculation?: {
    readonly revisedUnitRatePaise: number;
    readonly revisedAmountPaise: number;
    /** Rounded selling price at the configured minimum In-house gross margin. */
    readonly floorPricePaise: number;
    /** Amount-aware selling-price discount cap for the selected In-house margin. */
    readonly maximumDiscountBps: number;
    readonly discountBasis: "selling_price";
    readonly totalPaise: number;
    readonly appliedImpactBps: number;
    readonly discount?: {
      readonly rateBps: number;
      readonly totalBeforeDiscountPaise: number;
      readonly amountPaise: number;
    };
  };
  readonly formulaVersion: "knowledge-preview-v1";
  readonly effectivePriceVersionId: string | null;
  readonly taxVersionId: string | null;
  readonly effectiveUnitRatePaise: number | null;
  readonly adjustedUnitRate: KnowledgePreviewAmountComponent | null;
  readonly requiredQuantity: string | null;
  readonly procurementQuantity: string | null;
  readonly vendorPreTax: KnowledgePreviewAmountComponent | null;
  readonly vendorTax: KnowledgePreviewAmountComponent | null;
  readonly vendorTotal: KnowledgePreviewAmountComponent | null;
  readonly startMargin: KnowledgePreviewAmountComponent | null;
  readonly bottomMargin: KnowledgePreviewAmountComponent | null;
  readonly pmcMarkup: KnowledgePreviewAmountComponent | null;
  readonly duration: {
    readonly raw: string;
    readonly clamped: string;
    readonly unit: KnowledgeDurationUnit;
  } | null;
}

export interface KnowledgeAvailability {
  readonly sectionKey: KnowledgeSectionKey;
  readonly state: KnowledgeAvailabilityState;
  readonly reasonCode: string | null;
}

export interface KnowledgeContextLineage {
  readonly mainLineId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly priceVersionId: string | null;
  readonly taxVersionId: string | null;
  readonly formulaVersion: "knowledge-preview-v1";
  readonly contentDigest: string;
  readonly basketQualityRevisionId?: string;
  readonly basketQualityContentDigest?: string;
  readonly evaluatedAt: string;
}

export interface KnowledgeContext {
  readonly lineage: KnowledgeContextLineage;
  readonly availability: readonly KnowledgeAvailability[];
  readonly sections: Readonly<
    Partial<Record<KnowledgeSectionKey, KnowledgeJsonValue>>
  >;
  readonly preview: KnowledgePreview | null;
  readonly configuration: KnowledgeConfigurationContext;
}

export type KnowledgeCalculationScope = "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material";

/** Active-revision configuration. Monetary amounts are paise and percentage rates are basis points. */
export interface KnowledgeConfigurationContext {
  readonly formulaVersion: "mode-margin-v2";
  readonly moneyUnit: "paise";
  readonly percentageUnit: "basis_points";
  readonly selection: {
    readonly modeKind: KnowledgeModeKind | null;
    readonly executionSource: KnowledgeExecutionSource | null;
  };
  readonly uom: { readonly id: string; readonly name: string; readonly decimalScale: number } | null;
  readonly shared: {
    readonly paragraph: string | null;
    readonly scopeConfigurationId: string | null;
    readonly inclusions: readonly { readonly id: string; readonly name: string }[];
    readonly exclusions: readonly { readonly id: string; readonly name: string }[];
  };
  readonly state: "ready" | "selection_required" | "not_configured" | "invalid";
  readonly issues: readonly { readonly code: string; readonly scope: KnowledgeCalculationScope | null }[];
  readonly calculations: readonly {
    readonly scope: KnowledgeCalculationScope;
    readonly source: "scoped" | "legacy_shared" | "legacy_in_house" | null;
    readonly settings: {
      readonly baseRatePaise: number;
      readonly lowQuantityLimit: string;
      readonly impactBps: number;
      readonly minimumMarkupBps: number;
      readonly startingMarkupBps: number;
    } | null;
    readonly maximumDiscountBps: number | null;
  }[];
}

export interface KnowledgeItemListResponse
  extends KnowledgePageEnvelope<KnowledgeItemListItem> {}

export interface KnowledgeHistoryResponse
  extends KnowledgePageEnvelope<KnowledgeHistoryEntry> {}

export interface KnowledgeMasterListResponse
  extends KnowledgePageEnvelope<KnowledgeMaster> {
  readonly directoryOverview?: ProcurementVendorDirectoryOverview;
}

export interface KnowledgeSurfaceListResponse
  extends KnowledgePageEnvelope<KnowledgeSurface> {}

export interface KnowledgeBasketListResponse
  extends KnowledgePageEnvelope<KnowledgeBasket> {}

export interface KnowledgeMainLineListResponse
  extends KnowledgePageEnvelope<KnowledgeMainLine> {}

/** Public procurement shapes. Never include storage keys, hashes, or raw file metadata. */
export interface ProcurementVendorProfile {
  vendorType: "execution" | "supplier";
  executionType: ("labor" | "material_labour")[] | null;
  supplier: boolean | null;
  nameOfRepresentative: string;
  position: string;
  gstRegistered: boolean;
  msmeRegistered: boolean;
  turnoverSelfDeclaredPaise: number;
  turnoverVerifiedPaise: number | null;
  reference: string;
  workProfile: string;
  email: string;
  phoneNumber: string;
  address: string;
  aadhar: string;
  pan: string;
  currentAddress: string;
  currentAddressVerifiedPhysically: boolean;
  mainBasketId: string;
  subBasketId: string;
}

export interface ProcurementVendorStoredProfile extends ProcurementVendorProfile {
  physicalAddressVerifiedAt: string | null;
  physicalAddressVerifiedById: string | null;
}

export interface ProcurementVendorSummary {
  vendorType: ProcurementVendorProfile["vendorType"] | null;
  executionType?: ProcurementVendorProfile["executionType"];
  profileComplete: boolean;
  currentAddressVerifiedPhysically: boolean | null;
  mainBasket: { id: string; name: string | null; status: "active" | "inactive" | "archived" | "unavailable" } | null;
  subBasket: { id: string; name: string | null } | null;
}

export interface ProcurementVendorDirectoryOverview {
  totalVendors: number;
  activeVendors: number;
  underReviewVendors: number;
}

export interface ProcurementVendorPhotoDescriptor {
  id: string;
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  uploadedAt: string;
}

/** Intersect with the existing KnowledgeMaster DTO, keeping its canonical identity. */
export interface ProcurementVendorDetailFields {
  procurementSummary: ProcurementVendorSummary;
  procurementProfile: ProcurementVendorStoredProfile | null;
  geoTaggedPicture: ProcurementVendorPhotoDescriptor | null;
}

export interface ProcurementVendorPhotoMutationResult {
  vendorId: string;
  version: number;
  geoTaggedPicture: ProcurementVendorPhotoDescriptor | null;
}

export interface ProcurementVendorBaselineRow {
  itemId: string;
  projectId: string;
  projectName: string;
  itemName: string;
  brand: string;
  version: number;
}

export interface ProcurementVendorBaselinePage {
  items: ProcurementVendorBaselineRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProcurementVendorBaselineInput {
  expectedVersion: number;
  allocatedWorkPaise: number;
  reason: string;
  idempotencyKey: string;
}

export interface ProcurementVendorBaselineResult {
  itemId: string;
  projectId: string;
  vendorId: string;
  allocatedWorkPaise: number;
  version: number;
  recordedAt: string;
}

export type ProcurementVendorDetail = KnowledgeMaster & ProcurementVendorDetailFields;
