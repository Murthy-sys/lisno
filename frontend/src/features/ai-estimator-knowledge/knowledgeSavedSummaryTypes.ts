import type {
  KnowledgeBasket,
  KnowledgeBasketQuality,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSubBasket
} from "./knowledgeTypes";

export const SAVED_SUMMARY_SECTION_KEYS = ["overview", "advanced", "pricing", "recommendations"] as const;
export type SavedSummarySectionKey = (typeof SAVED_SUMMARY_SECTION_KEYS)[number];
export type SavedSummaryGroupKey = "overview" | "mode" | "recommendations" | "quality";

export interface SavedSummaryRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface SavedSummaryContent {
  /** At most three concise rows; details retain complete user-facing saved values. */
  readonly preview: readonly SavedSummaryRow[];
  readonly details: readonly SavedSummaryRow[];
}

export interface SavedSummaryNotice {
  readonly key: string;
  readonly tone: "neutral" | "warning" | "error";
  readonly message: string;
  readonly onRetry?: () => void;
}

export interface SavedSummaryGroup extends SavedSummaryContent {
  readonly key: SavedSummaryGroupKey;
  readonly label: string;
  readonly notices: readonly SavedSummaryNotice[];
  /** Only set after a successful empty load or an explicit applicability state. */
  readonly emptyMessage?: string;
}

export interface SavedSummaryProjectionInput {
  readonly sections: Readonly<Partial<Record<SavedSummarySectionKey, KnowledgeJsonObject>>>;
  readonly quality?: KnowledgeBasketQuality;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly baskets: readonly KnowledgeBasket[];
  readonly items: readonly KnowledgeItemListItem[];
  readonly subBaskets: readonly KnowledgeSubBasket[];
}

export type SavedSummaryProjection = Readonly<Record<SavedSummaryGroupKey, SavedSummaryContent>>;
