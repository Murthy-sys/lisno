import type { QueryClient } from "@tanstack/react-query";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import {
  getKnowledgeItem, getKnowledgeSection, updateKnowledgeSection,
  getKnowledgeBasketQuality, updateKnowledgeBasketQuality,
  listKnowledgeQualityControlOptions, listKnowledgeSubBaskets, listKnowledgeSpecificationItemNames
} from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { commitKnowledgeSectionMutation, invalidateKnowledgeSectionMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasketQuality, KnowledgeItemDetail, KnowledgeSectionMutationEnvelope, KnowledgeSubBasketListResponse } from "./knowledgeTypes";

export interface KnowledgeSpecificationItemNameLookup {
  readonly queryKey: typeof knowledgeQueryKeys.specificationItemNameList;
  readonly list: typeof listKnowledgeSpecificationItemNames;
}

/** Explicitly scopes every editor read, write and cache operation to its owner. */
export interface KnowledgeEditorDataSource {
  readonly scopeKey: string;
  readonly specificationItemNames?: KnowledgeSpecificationItemNameLookup;
  readonly modeTier?: KnowledgeModeTier;
  readonly supportsLiveConfigurationRequests?: boolean;
  readonly supportsLegacyQuality: boolean;
  readonly itemKey: (mainLineId: string) => readonly unknown[];
  readonly sectionKey: (...args: Parameters<typeof knowledgeQueryKeys.section>) => readonly unknown[];
  readonly basketQualityKey: (basketId: string) => readonly unknown[];
  readonly qualityControlOptionsKey: (...args: Parameters<typeof knowledgeQueryKeys.qualityControlOptions>) => readonly unknown[];
  readonly subBasketCatalogKey: (basketId: string) => readonly unknown[];
  readonly getItem: typeof getKnowledgeItem;
  readonly getSection: typeof getKnowledgeSection;
  readonly updateSection: typeof updateKnowledgeSection;
  readonly getBasketQuality: typeof getKnowledgeBasketQuality;
  readonly updateBasketQuality: typeof updateKnowledgeBasketQuality;
  readonly listQualityControlOptions: typeof listKnowledgeQualityControlOptions;
  readonly getSubBasketCatalog: (basketId: string) => Promise<KnowledgeSubBasketListResponse>;
  readonly commitSection: (client: QueryClient, section: KnowledgeSectionMutationEnvelope) => void;
  readonly invalidateSection: (client: QueryClient, mainLineId: string) => Promise<void>;
  readonly commitQuality: (client: QueryClient, quality: KnowledgeBasketQuality) => void;
  readonly invalidateQuality: (client: QueryClient, basketId: string) => Promise<void>;
}

/** Existing Configuration screens always retain this default data source. */
export const liveKnowledgeEditorDataSource: KnowledgeEditorDataSource = {
  scopeKey: "live-configuration",
  specificationItemNames: {
    queryKey: knowledgeQueryKeys.specificationItemNameList,
    get list() { return listKnowledgeSpecificationItemNames; }
  },
  supportsLegacyQuality: true,
  itemKey: knowledgeQueryKeys.item,
  sectionKey: knowledgeQueryKeys.section,
  basketQualityKey: knowledgeQueryKeys.basketQuality,
  qualityControlOptionsKey: knowledgeQueryKeys.qualityControlOptions,
  subBasketCatalogKey: basketId => [...knowledgeQueryKeys.subBasketLists(basketId), "catalog"],
  get getItem() { return getKnowledgeItem; },
  get getSection() { return getKnowledgeSection; },
  get updateSection() { return updateKnowledgeSection; },
  get getBasketQuality() { return getKnowledgeBasketQuality; },
  get updateBasketQuality() { return updateKnowledgeBasketQuality; },
  get listQualityControlOptions() { return listKnowledgeQualityControlOptions; },
  getSubBasketCatalog: basketId => collectAllKnowledgeMasterPages(params => listKnowledgeSubBaskets(basketId, params), "Sub Basket"),
  commitSection: commitKnowledgeSectionMutation,
  invalidateSection: invalidateKnowledgeSectionMutation,
  commitQuality: (client, quality) => { client.setQueryData(knowledgeQueryKeys.basketQuality(quality.basketId), quality); },
  invalidateQuality: async (client, basketId) => {
    await Promise.allSettled([
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.items(), predicate: entry => entry.queryKey.length === 3 && (entry.state.data as KnowledgeItemDetail | undefined)?.basketId === basketId })
    ]);
  }
};
