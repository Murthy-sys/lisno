export type KnowledgeSubBasketMarginMode = "pmc" | "sub_vendor" | "in_house";

export interface KnowledgeSubBasketMarginRange {
  readonly key: "margin" | "labor" | "material";
  readonly component?: { readonly basketId: string; readonly subBasketId: string | null; readonly name?: string };
  readonly minimumBps: number | null;
  /** Maximum for PMC/Sub-vendor; starting gross margin for In-house. */
  readonly maximumBps: number | null;
}

export interface KnowledgeSubBasketMarginMismatch {
  readonly mainLineId: string;
  readonly mainLineName: string;
  readonly ranges: readonly KnowledgeSubBasketMarginRange[];
  readonly blockedReason: string | null;
}

export interface KnowledgeSubBasketMarginState {
  readonly ranges: readonly KnowledgeSubBasketMarginRange[];
  /** Null when the first main line has no valid saved default. */
  readonly mismatchCount: number | null;
  readonly mismatches: readonly KnowledgeSubBasketMarginMismatch[];
  readonly canApply: boolean;
  readonly unavailableReason: string | null;
}

export interface KnowledgeDefaultModeCalculation {
  readonly scope: "pmc" | "sub_vendor" | "in_house" | "in_house_labor" | "in_house_material";
  readonly component?: { readonly id: string; readonly basketId: string; readonly subBasketId: string | null; readonly name?: string };
  readonly baseRatePaise: number | null;
  readonly lowQuantityLimit: string | null;
  readonly impactBps: number | null;
}

export interface KnowledgeSubBasketSourceConfiguration {
  readonly revisionId: string;
  readonly revisionStatus: "draft" | "active";
  readonly itemVersion: number;
  readonly revisionVersion: number;
  readonly sectionVersion: number;
  readonly uom: { readonly id: string; readonly code: string; readonly name: string; readonly decimalScale: number } | null;
  readonly modes: Readonly<Record<KnowledgeSubBasketMarginMode, { readonly calculations: readonly KnowledgeDefaultModeCalculation[] }>>;
}

export interface KnowledgeSubBasketMarginSummary {
  /** True when margin values are owned by the Sub-Basket, independently of the source price configuration. */
  readonly ownedMargins?: boolean;
  readonly exceptions?: readonly MarginCandidate[];
  readonly defaults?: readonly MarginDefault[];
  readonly basketId: string;
  readonly subBasketId: string;
  readonly source: { readonly mainLineId: string; readonly mainLineName: string } | null;
  readonly sourceConfiguration?: KnowledgeSubBasketSourceConfiguration | null;
  readonly totalMainLines: number;
  readonly versionToken: string;
  readonly modes: Readonly<Record<KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState>>;
}

export interface KnowledgeApplySubBasketMarginsInput {
  readonly mode: KnowledgeSubBasketMarginMode;
  readonly versionToken: string;
  /** Omit for the existing Sub-Basket bulk action; provide for a single Main Line. */
  readonly targetMainLineId?: string;
}

export interface KnowledgeApplySubBasketMarginsResult {
  readonly updatedMainLineIds: readonly string[];
  readonly summary: KnowledgeSubBasketMarginSummary;
}

export type MarginTier = "signature" | "premium" | "functional";
export type MarginComponent = { basketId: string; subBasketId: string | null };
/** Identifies a percentage control explicitly edited within the tier of a section save. */
export interface MarginEditField {
  mode: KnowledgeSubBasketMarginMode;
  component?: MarginComponent;
  key: MarginPair["key"];
  bound: "minimumBps" | "maximumBps";
}
export interface MarginScope {
  tier: MarginTier;
  mode: KnowledgeSubBasketMarginMode;
  /** Identifies an originating or targeted cost component. A shared In-house default omits this field. */
  component?: MarginComponent;
}
export interface MarginPair {
  key: "margin" | "labor" | "material";
  minimumBps: number;
  maximumBps: number;
}
export interface MarginChange extends MarginScope { ranges: MarginPair[] }
export interface MarginDefaultChoice {
  component?: MarginComponent;
  componentName?: string;
  ranges: MarginPair[];
}
export interface MarginDefault extends MarginScope {
  ranges: MarginPair[];
  provenance: "existing" | "approved" | "unset";
  componentName?: string;
  resolution?: "shared" | "suggested" | "choose" | "unset";
  choices?: MarginDefaultChoice[];
  canApplyPrefilled?: boolean;
}
export interface MarginProposal extends MarginChange {
  componentName?: string;
  mainLineId: string;
  mainLineName: string;
}
export interface MarginCandidate extends MarginProposal {
  /** Component-level evidence grouped into one Main Line notification for this tier. */
  proposals?: MarginProposal[];
  requiresDefault?: boolean;
}
export interface MarginIssue extends MarginScope {
  componentName?: string;
  mainLineId: string;
  mainLineName: string;
  reason: string;
}
export interface MarginMatrix {
  basketId: string;
  subBasketId: string;
  versionToken: string;
  baselineVersion: number;
  totalMainLines: number;
  defaults: MarginDefault[];
  /** Saved manual changes currently eligible for review and approval. */
  exceptions: MarginCandidate[];
  issues: MarginIssue[];
}
export type MarginDecision =
  | { kind: "edit"; changes: MarginChange[] }
  | { kind: "approve"; candidate: MarginScope & { mainLineId: string } };
export interface MarginPreviewInput {
  versionToken: string;
  decision: MarginDecision;
  /** Opt in to applying In-house values to all eligible components of the owning Sub-Basket tier. */
  inHouseScope?: "sub_basket";
}
export interface MarginImpact extends MarginChange {
  previous: MarginPair[];
  affected: { mainLineId: string; mainLineName: string }[];
  componentChanges?: {
    mainLineId: string;
    mainLineName: string;
    component: MarginComponent;
    componentName?: string;
    previous: Array<Pick<KnowledgeSubBasketMarginRange, "key" | "minimumBps" | "maximumBps">>;
  }[];
  competing: MarginCandidate[];
  excluded: MarginIssue[];
  blockers: MarginIssue[];
}
export interface MarginPreview {
  basketId: string;
  subBasketId: string;
  reviewToken: string;
  impacts: MarginImpact[];
}
export interface MarginCommitInput extends MarginPreviewInput { reviewToken: string; operationId: string }
export interface MarginCommitResult {
  basketId: string;
  subBasketId: string;
  operationId: string;
  alreadyApplied: boolean;
  updatedMainLineIds: string[];
}
