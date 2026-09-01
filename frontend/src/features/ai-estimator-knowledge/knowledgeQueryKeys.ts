import type {
  KnowledgeContextRequest,
  KnowledgeListParams,
  KnowledgePageParams,
  KnowledgePreviewRequest,
  KnowledgeReferenceListParams
} from "./knowledgeApi";
import type {
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";

export const knowledgeQueryKeys = {
  all: ["ai-estimator-knowledge"] as const,
  itemLists: () => ["ai-estimator-knowledge", "items"] as const,
  itemList: (filters: KnowledgeListParams) =>
    ["ai-estimator-knowledge", "items", filters] as const,
  items: () => ["ai-estimator-knowledge", "item"] as const,
  item: (itemId: string) =>
    ["ai-estimator-knowledge", "item", itemId] as const,
  sections: (itemId: string, revisionId: string) =>
    ["ai-estimator-knowledge", "item", itemId, "revision", revisionId, "section"] as const,
  section: (
    itemId: string,
    revisionId: string,
    sectionKey: KnowledgeSectionKey
  ) =>
    [
      "ai-estimator-knowledge",
      "item",
      itemId,
      "revision",
      revisionId,
      "section",
      sectionKey
    ] as const,
  histories: () => ["ai-estimator-knowledge", "history"] as const,
  history: (itemId: string, pagination: Pick<KnowledgePageParams, "limit" | "offset"> = {}) =>
    ["ai-estimator-knowledge", "history", itemId, pagination] as const,
  activationReviews: () =>
    ["ai-estimator-knowledge", "activation-review"] as const,
  activationReview: (itemId: string, revisionId: string) =>
    ["ai-estimator-knowledge", "activation-review", itemId, revisionId] as const,
  basketLists: () => ["ai-estimator-knowledge", "baskets"] as const,
  basketList: (params: KnowledgeReferenceListParams) =>
    ["ai-estimator-knowledge", "baskets", params] as const,
  basketDeletionImpacts: () =>
    ["ai-estimator-knowledge", "basket-deletion-impact"] as const,
  basketDeletionImpact: (basketId: string) =>
    ["ai-estimator-knowledge", "basket-deletion-impact", basketId] as const,
  mainLineLists: (basketId?: string) =>
    basketId
      ? (["ai-estimator-knowledge", "main-lines", basketId] as const)
      : (["ai-estimator-knowledge", "main-lines"] as const),
  mainLineList: (
    basketId: string,
    params: KnowledgePageParams
  ) => ["ai-estimator-knowledge", "main-lines", basketId, params] as const,
  masterLists: (type?: KnowledgeMasterType) =>
    type
      ? (["ai-estimator-knowledge", "masters", type] as const)
      : (["ai-estimator-knowledge", "masters"] as const),
  masterList: (type: KnowledgeMasterType, params: KnowledgePageParams) =>
    ["ai-estimator-knowledge", "masters", type, params] as const,
  masterCatalog: (type: KnowledgeMasterType) =>
    ["ai-estimator-knowledge", "masters", type, "catalog"] as const,
  previews: () => ["ai-estimator-knowledge", "preview"] as const,
  preview: (input: KnowledgePreviewRequest) =>
    ["ai-estimator-knowledge", "preview", input] as const,
  contexts: () => ["ai-estimator-knowledge", "context"] as const,
  context: (input: KnowledgeContextRequest) =>
    ["ai-estimator-knowledge", "context", input] as const
};
