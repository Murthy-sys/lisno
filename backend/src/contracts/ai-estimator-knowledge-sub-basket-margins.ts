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
