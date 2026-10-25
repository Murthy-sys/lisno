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

export interface KnowledgeSubBasketMarginSummary {
  readonly basketId: string;
  readonly subBasketId: string;
  readonly source: { readonly mainLineId: string; readonly mainLineName: string } | null;
  readonly totalMainLines: number;
  readonly versionToken: string;
  readonly modes: Readonly<Record<KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState>>;
}

export interface KnowledgeApplySubBasketMarginsInput {
  readonly mode: KnowledgeSubBasketMarginMode;
  readonly versionToken: string;
}

export interface KnowledgeApplySubBasketMarginsResult {
  readonly updatedMainLineIds: readonly string[];
  readonly summary: KnowledgeSubBasketMarginSummary;
}
