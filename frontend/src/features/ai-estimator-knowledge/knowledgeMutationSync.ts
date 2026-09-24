import type { QueryClient } from "@tanstack/react-query";

import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { projectProcurementKeys } from "../procurement/projectProcurementApi";
import { vendorSuggestionKeys } from "../procurement/vendorSuggestionsApi";
import type {
  KnowledgeBasket,
  KnowledgeBasketDeletionImpact,
  KnowledgeBasketQuality,
  KnowledgeBasketListResponse,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeItemListResponse,
  KnowledgeMainLineListResponse,
  KnowledgePermanentDeleteSubBasketResult,
  KnowledgeMaster,
  KnowledgeMasterListResponse,
  KnowledgeMasterType,
  KnowledgeSectionMutationEnvelope,
  KnowledgeSubBasket,
  KnowledgeSubBasketListResponse
} from "./knowledgeTypes";

interface KnowledgeRelationshipItemListResponse extends KnowledgeItemListResponse {
  readonly allItems?: readonly KnowledgeItemListItem[];
}

/**
 * Publish a Sub-Basket rename by stable ID before any background refresh. This
 * keeps an open recommendation draft pointed at the same target while every
 * cached presentation name moves to the server-returned value.
 */
export function commitKnowledgeSubBasketMutation(
  queryClient: QueryClient,
  subBasket: KnowledgeSubBasket
): void {
  queryClient.setQueriesData<KnowledgeSubBasketListResponse>(
    { queryKey: knowledgeQueryKeys.subBasketLists(subBasket.basketId) },
    (current) => current?.items.some((entry) => entry.id === subBasket.id)
      ? {
          ...current,
          items: current.items.map((entry) => entry.id === subBasket.id ? subBasket : entry)
        }
      : current
  );

  queryClient.setQueriesData<KnowledgeRelationshipItemListResponse>(
    { queryKey: knowledgeQueryKeys.itemLists() },
    (current) => current ? {
      ...current,
      items: renameSubBasketInItems(current.items, subBasket),
      ...(current.allItems ? { allItems: renameSubBasketInItems(current.allItems, subBasket) } : {})
    } : current
  );

  for (const [queryKey, current] of queryClient.getQueriesData<KnowledgeItemDetail>({
    queryKey: knowledgeQueryKeys.items()
  })) {
    if (queryKey.length !== 3 || !current) continue;
    queryClient.setQueryData<KnowledgeItemDetail>(queryKey, {
      ...current,
      ...(current.basketId === subBasket.basketId && current.subBasketId === subBasket.id
        ? { subBasketName: subBasket.name }
        : {}),
      ...(current.linkedMainLines ? {
        linkedMainLines: current.linkedMainLines.map((linked) => linked.basketId === subBasket.basketId && linked.subBasketId === subBasket.id
          ? { ...linked, subBasketName: subBasket.name }
          : linked)
      } : {})
    });
  }
}

/** Publish a renamed Main Line immediately while the authoritative lists reload. */
export function commitKnowledgeMainLineMutation(
  queryClient: QueryClient,
  item: KnowledgeItemDetail
): void {
  const cachedDetails = queryClient.getQueriesData<KnowledgeItemDetail>({
    queryKey: knowledgeQueryKeys.items()
  });
  queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);
  for (const [queryKey, current] of cachedDetails) {
    if (
      queryKey.length !== 3
      || queryKey[2] === item.mainLineId
      || !current?.linkedMainLines?.some((linked) => linked.mainLineId === item.mainLineId)
    ) continue;
    const linkedMainLines = current.linkedMainLines.map((linked) => linked.mainLineId === item.mainLineId
      ? { ...linked, mainLineName: item.mainLineName }
      : linked);
    queryClient.setQueryData<KnowledgeItemDetail>(queryKey, { ...current, linkedMainLines });
  }
  queryClient.setQueriesData<KnowledgeRelationshipItemListResponse>(
    { queryKey: knowledgeQueryKeys.itemLists() },
    (current) => current ? {
      ...current,
      items: renameMainLineInItems(current.items, item),
      ...(current.allItems ? { allItems: renameMainLineInItems(current.allItems, item) } : {})
    } : current
  );
}

/** Remove a deleted child from every visible relationship list before refetch. */
export function commitKnowledgeMainLineRemoval(
  queryClient: QueryClient,
  mainLineId: string
): void {
  // Query cancellation takes effect synchronously. Cancel older reads before
  // publishing removal so their eventual response cannot restore this item.
  for (const queryKey of [knowledgeQueryKeys.items(), knowledgeQueryKeys.itemLists(), knowledgeQueryKeys.mainLineLists()]) {
    void queryClient.cancelQueries({ queryKey });
  }
  const cachedDetails = queryClient.getQueriesData<KnowledgeItemDetail>({
    queryKey: knowledgeQueryKeys.items()
  });
  queryClient.removeQueries({ queryKey: knowledgeQueryKeys.item(mainLineId) });
  queryClient.removeQueries({ queryKey: ["ai-estimator-knowledge", "history", mainLineId] });
  queryClient.removeQueries({ queryKey: ["ai-estimator-knowledge", "activation-review", mainLineId] });
  for (const [queryKey, current] of cachedDetails) {
    if (
      queryKey.length !== 3
      || queryKey[2] === mainLineId
      || !current?.linkedMainLines?.some((linked) => linked.mainLineId === mainLineId)
    ) continue;
    queryClient.setQueryData<KnowledgeItemDetail>(queryKey, {
      ...current,
      linkedMainLines: current.linkedMainLines.filter((linked) => linked.mainLineId !== mainLineId)
    });
  }
  queryClient.setQueriesData<KnowledgeRelationshipItemListResponse>(
    { queryKey: knowledgeQueryKeys.itemLists() },
    (current) => {
      if (!current) return current;
      const removed = current.items.some((entry) => entry.mainLineId === mainLineId);
      return {
        ...current,
        items: removeMainLineFromItems(current.items, mainLineId),
        ...(current.allItems ? { allItems: removeMainLineFromItems(current.allItems, mainLineId) } : {}),
        pagination: removed
          ? { ...current.pagination, total: Math.max(0, current.pagination.total - 1) }
          : current.pagination
      };
    }
  );
  queryClient.setQueriesData<KnowledgeMainLineListResponse>(
    { queryKey: knowledgeQueryKeys.mainLineLists() },
    (current) => {
      if (!current?.items) return current;
      const items = current.items.filter((entry) => entry.id !== mainLineId);
      return { ...current, items, pagination: { ...current.pagination,
        total: Math.max(0, current.pagination.total - (current.items.length - items.length)) } };
    }
  );
}

function renameSubBasketInItems(
  items: readonly KnowledgeItemListItem[],
  subBasket: KnowledgeSubBasket
): readonly KnowledgeItemListItem[] {
  return items.map((item) => ({
    ...item,
    ...(item.basketId === subBasket.basketId && item.subBasketId === subBasket.id
      ? { subBasketName: subBasket.name }
      : {}),
    ...(item.linkedMainLines ? {
      linkedMainLines: item.linkedMainLines.map((linked) => linked.basketId === subBasket.basketId && linked.subBasketId === subBasket.id
        ? { ...linked, subBasketName: subBasket.name }
        : linked)
    } : {})
  }));
}

function renameMainLineInItems(
  items: readonly KnowledgeItemListItem[],
  renamed: KnowledgeItemDetail
): readonly KnowledgeItemListItem[] {
  return items.map((entry) => ({
    ...(entry.mainLineId === renamed.mainLineId ? renamed : entry),
    ...(entry.linkedMainLines ? {
      linkedMainLines: entry.linkedMainLines.map((linked) => linked.mainLineId === renamed.mainLineId
        ? { ...linked, mainLineName: renamed.mainLineName }
        : linked)
    } : {})
  }));
}

function removeMainLineFromItems(
  items: readonly KnowledgeItemListItem[],
  mainLineId: string
): readonly KnowledgeItemListItem[] {
  return items
    .filter((entry) => entry.mainLineId !== mainLineId)
    .map((entry) => entry.linkedMainLines
      ? { ...entry, linkedMainLines: entry.linkedMainLines.filter((linked) => linked.mainLineId !== mainLineId) }
      : entry);
}

/**
 * Reload every query family that can expose Sub-Basket membership, lifecycle,
 * names, references or deletion impact. Callers distinguish this read failure
 * from a successful write and must never repeat the mutation automatically.
 */
export async function refreshKnowledgeSubBasketCatalog(
  queryClient: QueryClient,
  basketId: string
): Promise<void> {
  const results = await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDetails() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.items() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(basketId) }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(basketId) }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId) }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts(basketId) }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.histories() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.activationReviews() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }, { throwOnError: true })
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Some catalog lists could not refresh.");
  }
}

/**
 * Publish the authoritative Basket result immediately, then refresh every
 * query family that can carry its presentation name. Stable IDs remain the
 * join key throughout; no cached record is matched by its old or new name.
 */
export async function syncKnowledgeBasketMutation(
  queryClient: QueryClient,
  basket: KnowledgeBasket
): Promise<void> {
  for (const [queryKey, current] of queryClient.getQueriesData<KnowledgeBasketListResponse>({
    queryKey: knowledgeQueryKeys.basketLists()
  })) {
    if (!current?.items.some((entry) => entry.id === basket.id)) continue;
    queryClient.setQueryData<KnowledgeBasketListResponse>(queryKey, {
      ...current,
      items: current.items.map((entry) => entry.id === basket.id ? basket : entry)
    });
  }

  queryClient.setQueriesData<KnowledgeItemListResponse>(
    { queryKey: knowledgeQueryKeys.itemLists() },
    (current) => current ? {
      ...current,
      items: current.items.map((item) => ({
        ...item,
        ...(item.basketId === basket.id ? { basketName: basket.name } : {}),
        ...(item.linkedMainLines ? {
          linkedMainLines: item.linkedMainLines.map((linked) => linked.basketId === basket.id
            ? { ...linked, basketName: basket.name }
            : linked)
        } : {})
      }))
    } : current
  );

  queryClient.setQueriesData<KnowledgeItemDetail>(
    { queryKey: knowledgeQueryKeys.items() },
    (current) => current?.basketId === basket.id
      ? { ...current, basketName: basket.name }
      : current
  );
  queryClient.setQueriesData<KnowledgeBasketQuality>(
    { queryKey: knowledgeQueryKeys.basketQualities() },
    (current) => current?.basketId === basket.id
      ? { ...current, basketName: basket.name, basketStatus: basket.status }
      : current
  );
  queryClient.setQueryData<KnowledgeBasketDeletionImpact>(
    knowledgeQueryKeys.basketDeletionImpact(basket.id),
    (current) => current
      ? { ...current, basketName: basket.name, version: basket.version }
      : current
  );

  const refreshed = await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDetails() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.items() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketQualities() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts(basket.id) }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }, { throwOnError: true })
  ]);
  if (refreshed.some((result) => result.status === "rejected")) throw new Error("The basket was saved, but some catalog lists could not refresh.");
}

/** Commit a confirmed group deletion before refresh; retry only reads on failure. */
export async function syncKnowledgeSubBasketDeletion(
  queryClient: QueryClient,
  result: KnowledgePermanentDeleteSubBasketResult
): Promise<void> {
  const deletedIds = new Set(result.deletedMainLineIds);
  await Promise.all([
    queryClient.cancelQueries({ queryKey: knowledgeQueryKeys.subBasketLists(result.basketId) }),
    queryClient.cancelQueries({ queryKey: knowledgeQueryKeys.mainLineLists(result.basketId) }),
    queryClient.cancelQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.cancelQueries({ queryKey: knowledgeQueryKeys.items() })
  ]);
  queryClient.setQueriesData<KnowledgeSubBasketListResponse>(
    { queryKey: knowledgeQueryKeys.subBasketLists(result.basketId) },
    (current) => {
      if (!current?.items) return current;
      const items = current.items.filter((item) => item.id !== result.subBasketId);
      return { ...current, items, pagination: { ...current.pagination,
        total: Math.max(0, current.pagination.total - (current.items.length - items.length)) } };
    }
  );
  queryClient.setQueriesData<KnowledgeMainLineListResponse>(
    { queryKey: knowledgeQueryKeys.mainLineLists(result.basketId) },
    (current) => {
      if (!current?.items) return current;
      const items = current.items.filter((item) => !deletedIds.has(item.id));
      return { ...current, items, pagination: { ...current.pagination,
        total: Math.max(0, current.pagination.total - (current.items.length - items.length)) } };
    }
  );
  const pruneItems = (items: readonly KnowledgeItemListItem[]) => items
    .filter((item) => !deletedIds.has(item.mainLineId))
    .map((item) => item.linkedMainLines
      ? { ...item, linkedMainLines: item.linkedMainLines.filter((linked) => !deletedIds.has(linked.mainLineId)) }
      : item);
  queryClient.setQueriesData<KnowledgeRelationshipItemListResponse>(
    { queryKey: knowledgeQueryKeys.itemLists() },
    (current) => {
      if (!current?.items) return current;
      const items = pruneItems(current.items);
      return { ...current, items,
        ...(current.allItems ? { allItems: pruneItems(current.allItems) } : {}),
        pagination: { ...current.pagination, total: Math.max(0, current.pagination.total - (current.items.length - items.length)) }
      };
    }
  );
  for (const [key, current] of queryClient.getQueriesData<KnowledgeItemDetail>({ queryKey: knowledgeQueryKeys.items() })) {
    if (key.length !== 3 || !current?.linkedMainLines || deletedIds.has(String(key[2]))) continue;
    queryClient.setQueryData(key, { ...current, linkedMainLines: current.linkedMainLines.filter((line) => !deletedIds.has(line.mainLineId)) });
  }
  for (const mainLineId of deletedIds) {
    queryClient.removeQueries({ queryKey: knowledgeQueryKeys.item(mainLineId) });
    queryClient.removeQueries({ queryKey: ["ai-estimator-knowledge", "history", mainLineId] });
    queryClient.removeQueries({ queryKey: ["ai-estimator-knowledge", "activation-review", mainLineId] });
  }
  queryClient.removeQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpact(result.basketId, result.subBasketId) });
  await refreshKnowledgeSubBasketCatalog(queryClient, result.basketId);
}

export function invalidateTemporaryMainLineDetails(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: knowledgeQueryKeys.items(),
    predicate: (query) => query.queryKey.length === 3 && (query.state.data as KnowledgeItemDetail | undefined)?.itemType === "temporary"
  });
}

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
    invalidateTemporaryMainLineDetails(queryClient),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
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
  queryClient.removeQueries({ queryKey: knowledgeQueryKeys.subBasketLists(basketId) });
  queryClient.removeQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts(basketId) });
  queryClient.removeQueries({
    queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId),
    exact: true
  });

  const refreshed = await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.items() }, { throwOnError: true }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }, { throwOnError: true })
  ]);
  if (refreshed.some((result) => result.status === "rejected")) throw new Error("The basket was deleted, but some catalog lists could not refresh.");
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

/**
 * A deleted Main Line has no row to write back, so its cached detail is dropped
 * rather than refetched — a refetch would only 404 on the way to the same place.
 */
export async function syncKnowledgeMainLineDeletion(
  queryClient: QueryClient,
  mainLineId: string
): Promise<void> {
  queryClient.removeQueries({
    queryKey: knowledgeQueryKeys.item(mainLineId),
    exact: true
  });

  await Promise.all([
    invalidateTemporaryMainLineDetails(queryClient),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.histories() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.activationReviews() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

export async function syncKnowledgeLifecycleMutation(
  queryClient: QueryClient,
  item: KnowledgeItemDetail
): Promise<void> {
  queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);

  await Promise.all([
    invalidateTemporaryMainLineDetails(queryClient),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
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
    ...(masterType === "vendors" ? [
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDetails() }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketDeletionImpacts() }),
      queryClient.invalidateQueries({ queryKey: projectProcurementKeys.vendors }),
      queryClient.invalidateQueries({ queryKey: vendorSuggestionKeys.all })
    ] : []),
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
