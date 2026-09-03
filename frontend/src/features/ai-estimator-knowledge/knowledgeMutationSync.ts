import type { QueryClient } from "@tanstack/react-query";

import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeBasketListResponse,
  KnowledgeItemDetail,
  KnowledgeMaster,
  KnowledgeMasterListResponse,
  KnowledgeMasterType,
  KnowledgeSectionMutationEnvelope
} from "./knowledgeTypes";

export function commitKnowledgeSectionMutation(
  queryClient: QueryClient,
  section: KnowledgeSectionMutationEnvelope
): void {
  queryClient.setQueryData(
    knowledgeQueryKeys.section(
      section.mainLineId,
      section.revisionId,
      section.sectionKey
    ),
    section
  );
  queryClient.setQueryData<KnowledgeItemDetail>(
    knowledgeQueryKeys.item(section.mainLineId),
    (current) => current
      ? { ...current, version: section.aggregateVersion }
      : current
  );
}

export async function invalidateKnowledgeSectionMutation(
  queryClient: QueryClient,
  mainLineId: string
): Promise<void> {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.item(mainLineId)
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.histories()
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.activationReviews()
    }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

export async function syncKnowledgeSectionMutation(
  queryClient: QueryClient,
  section: KnowledgeSectionMutationEnvelope
): Promise<void> {
  commitKnowledgeSectionMutation(queryClient, section);
  await invalidateKnowledgeSectionMutation(queryClient, section.mainLineId);
}

export async function syncKnowledgeBasketDeletion(
  queryClient: QueryClient,
  basketId: string
): Promise<void> {
  const cachedBasketLists = queryClient.getQueriesData<KnowledgeBasketListResponse>({
    queryKey: knowledgeQueryKeys.basketLists()
  });
  const affectedFamilies = new Set(
    cachedBasketLists
      .filter(([, current]) => current?.items.some((basket) => basket.id === basketId))
      .map(([queryKey]) => basketListFilterFamily(queryKey))
  );

  for (const [queryKey, current] of cachedBasketLists) {
    if (!current) continue;
    const familyAffected = affectedFamilies.has(basketListFilterFamily(queryKey));
    const items = current.items.filter((basket) => basket.id !== basketId);
    queryClient.setQueryData<KnowledgeBasketListResponse>(queryKey, {
      ...current,
      items,
      pagination: familyAffected
        ? {
            ...current.pagination,
            total: Math.max(0, current.pagination.total - 1)
          }
        : current.pagination
    });
  }
  queryClient.removeQueries({
    queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId),
    exact: true
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.items() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

function basketListFilterFamily(queryKey: readonly unknown[]): string {
  const params = queryKey[2];
  if (!params || typeof params !== "object" || Array.isArray(params)) return "[]";
  return JSON.stringify(
    Object.entries(params)
      .filter(([key, value]) => key !== "limit" && key !== "offset" && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export async function syncKnowledgeLifecycleMutation(
  queryClient: QueryClient,
  item: KnowledgeItemDetail
): Promise<void> {
  queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.item(item.mainLineId)
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.histories()
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.activationReviews()
    }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

export async function syncKnowledgeMasterMutation(
  queryClient: QueryClient,
  masterType: KnowledgeMasterType,
  master?: KnowledgeMaster
): Promise<void> {
  if (master) commitKnowledgeMasterCatalogMutation(queryClient, master);

  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.masterLists(masterType)
    }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

export function commitKnowledgeMasterCatalogMutation(
  queryClient: QueryClient,
  master: KnowledgeMaster
): void {
  queryClient.setQueryData<KnowledgeMasterListResponse>(
    knowledgeQueryKeys.masterCatalog(master.masterType),
    (current) => {
      if (!current) {
        return {
          items: [master],
          pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
        };
      }
      const existing = current.items.some(({ id }) => id === master.id);
      return {
        ...current,
        items: existing
          ? current.items.map((item) => item.id === master.id ? master : item)
          : [...current.items, master],
        pagination: existing
          ? current.pagination
          : {
              ...current.pagination,
              total: current.pagination.total + 1
            }
      };
    }
  );
}
