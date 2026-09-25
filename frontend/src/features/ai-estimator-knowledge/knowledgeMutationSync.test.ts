import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  commitKnowledgeMainLineMutation,
  commitKnowledgeMainLineRemoval,
  commitKnowledgeSubBasketMutation,
  refreshKnowledgeSubBasketCatalog,
  syncKnowledgeBasketMutation,
  syncKnowledgeBasketDeletion,
  syncKnowledgeSubBasketDeletion,
  syncKnowledgeMainLineDeletion,
  syncKnowledgeLifecycleMutation,
  syncKnowledgeMasterMutation,
  syncKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { projectProcurementKeys } from "../procurement/projectProcurementApi";
import { vendorSuggestionKeys } from "../procurement/vendorSuggestionsApi";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeMaster,
  KnowledgeSectionMutationEnvelope
} from "./knowledgeTypes";

const completeness: KnowledgeCompleteness = {
  percentage: 25,
  sections: [],
  blockers: [],
  warnings: []
};

const actor = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z"
} as const;

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
}

function itemDetail(overrides: Partial<KnowledgeItemDetail> = {}): KnowledgeItemDetail {
  return {
    ...actor,
    id: "line-1",
    itemType: "main_line",
    completionRequired: false,
    basketId: "basket-1",
    basketName: "Electrical",
    subBasketId: "sub-1",
    subBasketName: "Functional Lights",
    mainLineId: "line-1",
    mainLineName: "Lights Supply",
    description: "Saved catalog description",
    status: "draft",
    activeRevisionId: null,
    draftRevisionId: null,
    revisionNumber: null,
    uomId: null,
    priorityId: null,
    modeIds: [],
    surfaceIds: [],
    vendorIds: [],
    completeness,
    allowedActions: [],
    activeRevision: null,
    draftRevision: null,
    blockers: [],
    warnings: [],
    version: 1,
    ...overrides
  };
}

describe("knowledge mutation cache synchronization", () => {
  it("refreshes a fresh global vendor overview after a vendor mutation without changing unrelated catalogs", async () => {
    const client = queryClient();
    let overview = { totalVendors: 9, activeVendors: 7, underReviewVendors: 4 };
    const load = vi.fn(async () => ({ directoryOverview: { ...overview } }));
    const options = { queryKey: knowledgeQueryKeys.vendorDirectoryOverview(), queryFn: load, staleTime: 60_000 };
    await client.fetchQuery(options);
    client.setQueryData(knowledgeQueryKeys.masterCatalog("uoms"), { items: [] });
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    try {
      overview = { totalVendors: 8, activeVendors: 6, underReviewVendors: 3 };
      await syncKnowledgeMasterMutation(client, "vendors");
      expect(load).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(options.queryKey)).toEqual({ directoryOverview: overview });
      expect(client.getQueryState(knowledgeQueryKeys.masterCatalog("uoms"))?.isInvalidated).toBe(false);
    } finally {
      unsubscribe(); client.clear();
    }
  });
  it.each(["Main Basket", "Sub Basket"])("refreshes fresh vendor lists and private details after a %s mutation", async (kind) => {
    const client = queryClient();
    const listKey = knowledgeQueryKeys.masterList("vendors", { limit: 20, offset: 0 });
    const detailKey = knowledgeQueryKeys.vendorDetail("vendor-1");
    const unrelatedKey = knowledgeQueryKeys.masterCatalog("uoms");
    const before = {
      mainBasket: { id: "basket-1", name: "Old basket", status: "active" },
      subBasket: { id: "sub-1", name: "Old group" }
    };
    const after = kind === "Main Basket"
      ? { ...before, mainBasket: { ...before.mainBasket, name: "Renamed basket", status: "inactive" } }
      : { ...before, subBasket: { ...before.subBasket, name: "Renamed group" } };
    let summary = before;
    const loadList = vi.fn(async () => ({ items: [{ id: "vendor-1", procurementSummary: summary }] }));
    const loadDetail = vi.fn(async () => ({ id: "vendor-1", procurementSummary: summary, procurementProfile: { email: "synthetic@example.test" } }));
    const listOptions = { queryKey: listKey, queryFn: loadList, staleTime: 30_000 };
    const detailOptions = { queryKey: detailKey, queryFn: loadDetail, staleTime: 30_000 };
    await Promise.all([client.fetchQuery(listOptions), client.fetchQuery(detailOptions)]);
    client.setQueryData(unrelatedKey, { items: [{ id: "unit-1" }] });
    const listObserver = new QueryObserver(client, listOptions);
    const detailObserver = new QueryObserver(client, detailOptions);
    const unsubscribeList = listObserver.subscribe(() => {});
    const unsubscribeDetail = detailObserver.subscribe(() => {});
    expect(listObserver.getCurrentResult().isStale).toBe(false);
    expect(detailObserver.getCurrentResult().isStale).toBe(false);
    summary = after;

    try {
      if (kind === "Main Basket") {
        await syncKnowledgeBasketMutation(client, {
          ...actor, id: "basket-1", name: "Renamed basket", description: null,
          displayOrder: 1, status: "inactive", version: 2
        });
      } else {
        await refreshKnowledgeSubBasketCatalog(client, "basket-1");
      }
      expect(loadList).toHaveBeenCalledTimes(2);
      expect(loadDetail).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(listKey)).toEqual({ items: [{ id: "vendor-1", procurementSummary: after }] });
      expect(client.getQueryData(detailKey)).toMatchObject({ procurementSummary: after, procurementProfile: { email: "synthetic@example.test" } });
      expect(JSON.stringify(client.getQueryData(listKey))).not.toContain("procurementProfile");
      expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    } finally {
      unsubscribeList(); unsubscribeDetail(); client.clear();
    }
  });

  it("refreshes shared vendor options and suggestions across projects while preserving item drafts", async () => {
    const client = queryClient();
    const keys = [projectProcurementKeys.vendorSearch("timber"), vendorSuggestionKeys.page("one", 0), vendorSuggestionKeys.page("two", 20)];
    keys.forEach((key) => client.setQueryData(key, { available: true }));
    client.setQueryData(["item-draft"], { vendorId: "vendor-one", price: "150" });
    await syncKnowledgeMasterMutation(client, "vendors");
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryData(["item-draft"])).toEqual({ vendorId: "vendor-one", price: "150" });
    expect(client.getQueryState(["item-draft"])?.isInvalidated).toBe(false);
  });
  it("refreshes temporary Main Line references after source edits, lifecycle changes and deletion without invalidating other drafts", async () => {
    const client = queryClient();
    const targetKey = knowledgeQueryKeys.item("temporary-1");
    const otherKey = knowledgeQueryKeys.item("other-line");
    const draftKey = knowledgeQueryKeys.section("temporary-1", "revision-1", "advanced");
    const seed = () => {
      client.setQueryData(targetKey, { itemType: "temporary", linkedMainLines: [{ mainLineId: "source" }] });
      client.setQueryData(otherKey, { itemType: "main_line" });
      client.setQueryData(draftKey, { payload: { modeDescription: "Keep this draft" } });
    };
    const assert = () => {
      expect(client.getQueryState(targetKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
      expect(client.getQueryState(draftKey)?.isInvalidated).toBe(false);
      expect(client.getQueryData(draftKey)).toEqual({ payload: { modeDescription: "Keep this draft" } });
    };
    seed();
    await syncKnowledgeSectionMutation(client, { ...actor, id: "saved-section", mainLineId: "source", revisionId: "revision-source", sectionKey: "recommendations", applicability: "configured", version: 2, aggregateVersion: 4, payload: { budgetAlterations: [] } });
    assert(); seed();
    await syncKnowledgeLifecycleMutation(client, { mainLineId: "source" } as KnowledgeItemDetail);
    assert(); seed();
    await syncKnowledgeMainLineDeletion(client, "source");
    assert();
  });

  it("removes a permanently deleted Basket and invalidates every dependent knowledge cache", async () => {
    const client = queryClient();
    const activeListKey = knowledgeQueryKeys.basketList({ limit: 100, offset: 0 });
    const managementFirstPageKey = knowledgeQueryKeys.basketList({
      includeArchived: true,
      limit: 100,
      offset: 0
    });
    const managementSecondPageKey = knowledgeQueryKeys.basketList({
      includeArchived: true,
      limit: 100,
      offset: 100
    });
    const basketList = {
      items: [
        { id: "basket-1", name: "Mistake" },
        { id: "basket-2", name: "Keep" }
      ],
      pagination: { limit: 100, offset: 0, total: 2, hasMore: false }
    };
    client.setQueryData(activeListKey, basketList);
    client.setQueryData(managementFirstPageKey, {
      items: [{ id: "basket-2", name: "Keep" }],
      pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
    });
    client.setQueryData(managementSecondPageKey, {
      items: [{ id: "basket-1", name: "Mistake" }],
      pagination: { limit: 100, offset: 100, total: 101, hasMore: false }
    });
    client.setQueryData(knowledgeQueryKeys.basketDeletionImpact("basket-1"), {
      canDelete: true
    });
    client.setQueryData(knowledgeQueryKeys.itemLists(), []);
    client.setQueryData(knowledgeQueryKeys.mainLineLists(), []);
    client.setQueryData(knowledgeQueryKeys.items(), []);
    client.setQueryData(knowledgeQueryKeys.contexts(), {});
    client.setQueryData(["unrelated"], { preserved: true });

    await syncKnowledgeBasketDeletion(client, "basket-1");

    expect(client.getQueryData<typeof basketList>(activeListKey)?.items).toEqual([
      { id: "basket-2", name: "Keep" }
    ]);
    expect(client.getQueryData<typeof basketList>(managementFirstPageKey)?.pagination.total).toBe(100);
    expect(client.getQueryData<typeof basketList>(managementSecondPageKey)?.items).toEqual([]);
    expect(client.getQueryData<typeof basketList>(managementSecondPageKey)?.pagination.total).toBe(100);
    expect(client.getQueryData(knowledgeQueryKeys.basketDeletionImpact("basket-1"))).toBeUndefined();
    expect(client.getQueryState(activeListKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(managementFirstPageKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(managementSecondPageKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(knowledgeQueryKeys.itemLists())?.isInvalidated).toBe(true);
    expect(client.getQueryState(knowledgeQueryKeys.mainLineLists())?.isInvalidated).toBe(true);
    expect(client.getQueryState(knowledgeQueryKeys.items())?.isInvalidated).toBe(true);
    expect(client.getQueryState(knowledgeQueryKeys.contexts())?.isInvalidated).toBe(true);
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  });

  it("removes only a deleted group and its children before reporting refresh failure", async () => {
    const client = queryClient();
    const subgroupKey = [...knowledgeQueryKeys.subBasketLists("basket-1"), { limit: 100, offset: 0 }];
    const otherGroupKey = [...knowledgeQueryKeys.subBasketLists("basket-2"), { limit: 100, offset: 0 }];
    const itemListKey = knowledgeQueryKeys.itemList({});
    const mainLinesKey = knowledgeQueryKeys.mainLineList("basket-1", {});
    const child = itemDetail();
    const sibling = itemDetail({ id: "sibling", mainLineId: "sibling", subBasketId: "sub-2" });
    const pagination = { limit: 100, offset: 0, total: 2, hasMore: false };
    client.setQueryData(subgroupKey, { items: [{ id: "sub-1" }, { id: "sub-2" }], pagination });
    client.setQueryData(otherGroupKey, { items: [{ id: "other-sub", name: "Same name" }], pagination: { ...pagination, total: 1 } });
    client.setQueryData(itemListKey, { items: [child, sibling], allItems: [child, sibling], pagination });
    client.setQueryData(mainLinesKey, { items: [{ id: "line-1" }, { id: "sibling" }], pagination });
    client.setQueryData(knowledgeQueryKeys.item("line-1"), child);
    const deletedSection = knowledgeQueryKeys.section("line-1", "revision-1", "overview");
    const survivingSection = knowledgeQueryKeys.section("sibling", "revision-2", "recommendations");
    client.setQueryData(deletedSection, { payload: { gone: true } });
    client.setQueryData(survivingSection, { payload: { reason: "Preserve unsaved draft" } });
    client.setQueryData(knowledgeQueryKeys.subBasketDeletionImpact("basket-1", "sub-1"), { impactToken: "old" });
    const invalidation = vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("offline"));
    await expect(syncKnowledgeSubBasketDeletion(client, {
      basketId: "basket-1", subBasketId: "sub-1", deleted: true, deletedAt: "2026-09-23T00:00:00.000Z",
      deletedMainLineIds: ["line-1"], deletedReferenceCount: 2
    })).rejects.toThrow("could not refresh");
    expect(client.getQueryData(subgroupKey)).toMatchObject({ items: [{ id: "sub-2" }], pagination: { total: 1 } });
    expect(client.getQueryData(otherGroupKey)).toMatchObject({ items: [{ id: "other-sub" }] });
    expect(client.getQueryData(itemListKey)).toMatchObject({ items: [sibling], allItems: [sibling] });
    expect(client.getQueryData(mainLinesKey)).toMatchObject({ items: [{ id: "sibling" }] });
    expect(client.getQueryData(knowledgeQueryKeys.item("line-1"))).toBeUndefined();
    expect(client.getQueryData(deletedSection)).toBeUndefined();
    expect(client.getQueryData(survivingSection)).toEqual({ payload: { reason: "Preserve unsaved draft" } });
    expect(client.getQueryData(knowledgeQueryKeys.subBasketDeletionImpact("basket-1", "sub-1"))).toBeUndefined();
    invalidation.mockRestore();
  });

  it("cancels an older group response so it cannot restore a deleted row", async () => {
    const client = queryClient();
    const key = [...knowledgeQueryKeys.subBasketLists("basket-1"), "catalog"];
    const prior = { items: [{ id: "sub-1" }, { id: "sub-2" }], pagination: { limit: 100, offset: 0, total: 2, hasMore: false } };
    client.setQueryData(key, prior);
    let resolveRead!: (value: typeof prior) => void;
    const read = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<typeof prior>((resolve) => { resolveRead = resolve; }) }).catch(() => undefined);
    await syncKnowledgeSubBasketDeletion(client, {
      basketId: "basket-1", subBasketId: "sub-1", deleted: true, deletedAt: "2026-09-23T00:00:00.000Z",
      deletedMainLineIds: [], deletedReferenceCount: 0
    });
    resolveRead(prior);
    await read;
    expect(client.getQueryData(key)).toMatchObject({ items: [{ id: "sub-2" }] });
  });

  it("publishes a renamed Basket by stable ID and refreshes every name-bearing cache", async () => {
    const client = queryClient();
    const basketListKey = knowledgeQueryKeys.basketList({ limit: 100, offset: 0 });
    const itemKey = knowledgeQueryKeys.item("line-1");
    const itemListKey = knowledgeQueryKeys.itemList({ limit: 20, offset: 0 });
    const sectionKey = knowledgeQueryKeys.section("line-1", "revision-1", "advanced");
    const qualityKey = knowledgeQueryKeys.basketQuality("basket-1");
    const impactKey = knowledgeQueryKeys.basketDeletionImpact("basket-1");
    client.setQueryData(basketListKey, {
      items: [{ id: "basket-1", name: "Old name", status: "active" }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
    });
    client.setQueryData(itemKey, { mainLineId: "line-1", basketId: "basket-1", basketName: "Old name" });
    client.setQueryData(itemListKey, {
      items: [
        { mainLineId: "line-1", basketId: "basket-1", basketName: "Old name", linkedMainLines: [
          { mainLineId: "linked-1", basketId: "basket-1", basketName: "Old name" }
        ] },
        { mainLineId: "line-2", basketId: "basket-2", basketName: "Other basket" }
      ],
      pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
    });
    client.setQueryData(sectionKey, { payload: { modeDescription: "Keep this draft" } });
    client.setQueryData(qualityKey, { basketId: "basket-1", basketName: "Old name", basketStatus: "active", parameters: [] });
    client.setQueryData(impactKey, { basketId: "basket-1", basketName: "Old name", version: 4, canDelete: true });
    client.setQueryData(knowledgeQueryKeys.mainLineLists(), []);
    client.setQueryData(knowledgeQueryKeys.contexts(), {});
    const renamed = {
      ...actor,
      id: "basket-1",
      name: "Renamed basket",
      description: null,
      displayOrder: 2,
      status: "inactive" as const,
      version: 5
    };

    await syncKnowledgeBasketMutation(client, renamed);

    expect(client.getQueryData<{ items: { id: string; name: string }[] }>(basketListKey)?.items[0]?.name)
      .toBe("Renamed basket");
    expect(client.getQueryData(itemKey)).toMatchObject({ basketId: "basket-1", basketName: "Renamed basket" });
    expect(client.getQueryData<{ items: Array<{ basketName: string; linkedMainLines?: Array<{ basketName: string }> }> }>(itemListKey)?.items)
      .toMatchObject([
        { basketName: "Renamed basket", linkedMainLines: [{ basketName: "Renamed basket" }] },
        { basketName: "Other basket" }
      ]);
    expect(client.getQueryData(qualityKey)).toMatchObject({ basketName: "Renamed basket", basketStatus: "inactive" });
    expect(client.getQueryData(impactKey)).toMatchObject({ basketName: "Renamed basket", version: 5 });
    expect(client.getQueryData(sectionKey)).toEqual({ payload: { modeDescription: "Keep this draft" } });
    for (const key of [basketListKey, itemKey, itemListKey, qualityKey, impactKey,
      knowledgeQueryKeys.mainLineLists(), knowledgeQueryKeys.contexts()]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("reconciles Sub-Basket and child mutations by stable ID without touching the open section draft", async () => {
    const client = queryClient();
    const subBasketKey = [...knowledgeQueryKeys.subBasketLists("basket-1"), "catalog"] as const;
    const itemListKey = knowledgeQueryKeys.itemList({ limit: 100, offset: 0 });
    const itemKey = knowledgeQueryKeys.item("line-1");
    const sectionKey = knowledgeQueryKeys.section("source", "revision-1", "recommendations");
    const relationshipItems = [
      { ...actor, mainLineId: "line-1", mainLineName: "Lights Supply", basketId: "basket-1", subBasketId: "sub-1", subBasketName: "Functional Lights", version: 1 },
      { ...actor, mainLineId: "source", mainLineName: "False ceiling", basketId: "basket-2", subBasketId: null, subBasketName: null, version: 1,
        linkedMainLines: [{ mainLineId: "line-1", mainLineName: "Lights Supply", basketId: "basket-1", basketName: "Electrical", subBasketId: "sub-1", subBasketName: "Functional Lights", status: "draft", revisionId: "revision-line", revisionStatus: "draft", rules: [] }] }
    ];
    client.setQueryData(subBasketKey, {
      items: [{ ...actor, id: "sub-1", basketId: "basket-1", name: "Functional Lights", displayOrder: 0, version: 1 }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
    });
    client.setQueryData(itemListKey, {
      items: relationshipItems,
      allItems: relationshipItems,
      pagination: { limit: 100, offset: 0, total: 2, hasMore: false }
    });
    client.setQueryData(itemKey, { ...actor, mainLineId: "line-1", mainLineName: "Lights Supply", basketId: "basket-1", subBasketId: "sub-1", subBasketName: "Functional Lights", version: 1 });
    client.setQueryData(sectionKey, { payload: { budgetAlterations: [{ targetSubBasketId: "sub-1", reason: "Keep this draft" }] } });

    commitKnowledgeSubBasketMutation(client, { ...actor, id: "sub-1", basketId: "basket-1", name: "False Ceiling Lights", displayOrder: 0, version: 2 });
    expect(client.getQueryData<{ items: Array<{ name: string }> }>(subBasketKey)?.items[0]?.name).toBe("False Ceiling Lights");
    expect(client.getQueryData<{ items: Array<{ subBasketName: string | null }> }>(itemListKey)?.items[0]?.subBasketName).toBe("False Ceiling Lights");
    expect(client.getQueryData<{ allItems: Array<{ subBasketName: string | null }> }>(itemListKey)?.allItems[0]?.subBasketName).toBe("False Ceiling Lights");

    const renamed = { ...client.getQueryData<Record<string, unknown>>(itemKey), mainLineId: "line-1", mainLineName: "Ceiling spotlights", version: 2 } as KnowledgeItemDetail;
    commitKnowledgeMainLineMutation(client, renamed);
    expect(client.getQueryData<{ items: Array<{ mainLineName: string; linkedMainLines?: Array<{ mainLineName: string }> }> }>(itemListKey)?.items)
      .toMatchObject([{ mainLineName: "Ceiling spotlights" }, { linkedMainLines: [{ mainLineName: "Ceiling spotlights" }] }]);
    expect(client.getQueryData<{ allItems: Array<{ mainLineName: string; linkedMainLines?: Array<{ mainLineName: string }> }> }>(itemListKey)?.allItems)
      .toMatchObject([{ mainLineName: "Ceiling spotlights" }, { linkedMainLines: [{ mainLineName: "Ceiling spotlights" }] }]);

    commitKnowledgeMainLineRemoval(client, "line-1");
    expect(client.getQueryData<{ items: Array<{ mainLineId: string; linkedMainLines?: unknown[] }> }>(itemListKey)?.items)
      .toMatchObject([{ mainLineId: "source", linkedMainLines: [] }]);
    expect(client.getQueryData<{ allItems: Array<{ mainLineId: string; linkedMainLines?: unknown[] }> }>(itemListKey)?.allItems)
      .toMatchObject([{ mainLineId: "source", linkedMainLines: [] }]);
    expect(client.getQueryData(itemKey)).toBeUndefined();
    expect(client.getQueryData(sectionKey)).toEqual({ payload: { budgetAlterations: [{ targetSubBasketId: "sub-1", reason: "Keep this draft" }] } });
  });

  it("updates linked references in every exact item detail cache and preserves them when refresh fails", async () => {
    const client = queryClient();
    const childKey = knowledgeQueryKeys.item("line-1");
    const sourceKey = knowledgeQueryKeys.item("source-line");
    const sourceSectionKey = knowledgeQueryKeys.section("source-line", "revision-source", "recommendations");
    const linkedChild = {
      mainLineId: "line-1",
      mainLineName: "Lights Supply",
      basketId: "basket-1",
      basketName: "Electrical",
      subBasketId: "sub-1",
      subBasketName: "Functional Lights",
      status: "draft" as const,
      revisionId: "revision-child",
      revisionStatus: "draft" as const,
      rules: [{ id: "rule-child", trigger: "removed" as const, action: "remove" as const, requirement: "must" as const, reason: "Keep linked metadata", active: true }]
    };
    const untouchedLink = {
      ...linkedChild,
      mainLineId: "other-line",
      mainLineName: "Other item",
      revisionId: "revision-other",
      rules: [{ ...linkedChild.rules[0]!, id: "rule-other", reason: "Preserve this reference" }]
    };
    const source = itemDetail({
      id: "source-line",
      itemType: "temporary",
      mainLineId: "source-line",
      mainLineName: "Temporary lighting group",
      description: "Preserve the open workspace detail",
      linkedMainLines: [linkedChild, untouchedLink]
    });
    client.setQueryData(childKey, itemDetail());
    client.setQueryData(sourceKey, source);
    client.setQueryData(sourceSectionKey, { payload: { sentinel: "Keep the open draft" } });

    commitKnowledgeMainLineMutation(client, itemDetail({ mainLineName: "False Ceiling Lights", version: 2 }));
    await expect(client.fetchQuery({
      queryKey: sourceKey,
      queryFn: async () => { throw new Error("Item detail refresh unavailable"); }
    })).rejects.toThrow("Item detail refresh unavailable");

    expect(client.getQueryData<KnowledgeItemDetail>(sourceKey)).toEqual({
      ...source,
      linkedMainLines: [{ ...linkedChild, mainLineName: "False Ceiling Lights" }, untouchedLink]
    });
    expect(client.getQueryData(sourceSectionKey)).toEqual({ payload: { sentinel: "Keep the open draft" } });

    commitKnowledgeMainLineRemoval(client, "line-1");
    await expect(client.fetchQuery({
      queryKey: sourceKey,
      queryFn: async () => { throw new Error("Item detail refresh still unavailable"); }
    })).rejects.toThrow("Item detail refresh still unavailable");

    expect(client.getQueryData(childKey)).toBeUndefined();
    expect(client.getQueryData<KnowledgeItemDetail>(sourceKey)).toEqual({
      ...source,
      linkedMainLines: [untouchedLink]
    });
    expect(client.getQueryData(sourceSectionKey)).toEqual({ payload: { sentinel: "Keep the open draft" } });
  });

  it("cancels older item reads and removes deleted item caches without changing a surviving section draft", async () => {
    const client = queryClient();
    const deleted = itemDetail({ mainLineId: "deleted", id: "deleted" });
    const survivor = itemDetail({ mainLineId: "survivor", id: "survivor" });
    const pagination = { limit: 100, offset: 0, total: 2, hasMore: false };
    const listKey = [...knowledgeQueryKeys.itemLists(), "relationship-catalog"];
    const linesKey = knowledgeQueryKeys.mainLineList("basket-1", {});
    const detailKey = knowledgeQueryKeys.item("deleted");
    const deletedKeys = [detailKey, knowledgeQueryKeys.section("deleted", "revision", "overview"),
      knowledgeQueryKeys.history("deleted"), knowledgeQueryKeys.activationReview("deleted", "revision")];
    const sourceSection = knowledgeQueryKeys.section("survivor", "source-revision", "recommendations");
    const draft = { version: 2, payload: { budgetAlterations: [{ id: "keep-rule", reason: "Keep my draft" }] } };
    client.setQueryData(sourceSection, draft);
    deletedKeys.forEach((key) => client.setQueryData(key, deleted));
    const priorLists = [
      { key: listKey, data: { items: [deleted, survivor], allItems: [deleted, survivor], pagination } },
      { key: linesKey, data: { items: [{ id: "deleted" }, { id: "survivor" }], pagination } },
      { key: detailKey, data: deleted }
    ];
    const finishReads: (() => void)[] = [];
    const reads = priorLists.map(({ key, data }) => {
      client.setQueryData(key, data);
      return client.fetchQuery({ queryKey: key, queryFn: () => new Promise((resolve) => {
        finishReads.push(() => resolve(data));
      }) }).catch(() => undefined);
    });

    commitKnowledgeMainLineRemoval(client, "deleted");
    finishReads.forEach((resolve) => resolve());
    await Promise.all(reads);

    expect(client.getQueryData(listKey)).toMatchObject({ items: [survivor], allItems: [survivor], pagination: { total: 1 } });
    expect(client.getQueryData(linesKey)).toMatchObject({ items: [{ id: "survivor" }], pagination: { total: 1 } });
    deletedKeys.forEach((key) => expect(client.getQueryData(key)).toBeUndefined());
    expect(client.getQueryData(sourceSection)).toEqual(draft);
    expect(client.getQueryState(sourceSection)?.isInvalidated).toBe(false);
  });

  it("invalidates every cache family that can expose Sub-Basket membership or references", async () => {
    const client = queryClient();
    const keys = [
      knowledgeQueryKeys.itemLists(),
      knowledgeQueryKeys.items(),
      knowledgeQueryKeys.mainLineLists("basket-1"),
      knowledgeQueryKeys.subBasketLists("basket-1"),
      knowledgeQueryKeys.basketDeletionImpact("basket-1"),
      knowledgeQueryKeys.subBasketDeletionImpacts("basket-1"),
      knowledgeQueryKeys.histories(),
      knowledgeQueryKeys.activationReviews(),
      knowledgeQueryKeys.contexts()
    ];
    keys.forEach((key) => client.setQueryData(key, { cached: true }));
    client.setQueryData(["unrelated"], { preserved: true });

    await refreshKnowledgeSubBasketCatalog(client, "basket-1");

    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  });

  it("updates the section and invalidates related summaries and resolved contexts", async () => {
    const client = queryClient();
    const section: KnowledgeSectionMutationEnvelope = {
      ...actor,
      id: "section-1",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "pricing",
      applicability: "configured",
      version: 2,
      aggregateVersion: 8,
      payload: { vendorId: "vendor-1" }
    };
    client.setQueryData(knowledgeQueryKeys.itemLists(), []);
    client.setQueryData(knowledgeQueryKeys.item("line-1"), {
      mainLineId: "line-1",
      version: 7,
      preserved: true
    });
    client.setQueryData(knowledgeQueryKeys.contexts(), {});
    client.setQueryData(["leads", "list"], ["unchanged"]);

    await syncKnowledgeSectionMutation(client, section);

    expect(
      client.getQueryData(
        knowledgeQueryKeys.section("line-1", "revision-1", "pricing")
      )
    ).toEqual(section);
    expect(
      client.getQueryState(knowledgeQueryKeys.itemLists())?.isInvalidated
    ).toBe(true);
    expect(client.getQueryData(knowledgeQueryKeys.item("line-1"))).toMatchObject({
      mainLineId: "line-1",
      version: 8,
      preserved: true
    });
    expect(client.getQueryState(knowledgeQueryKeys.contexts())?.isInvalidated).toBe(true);
    expect(client.getQueryState(["leads", "list"])?.isInvalidated).toBe(false);
  });

  it("retains the committed section and aggregate cache when secondary invalidation fails", async () => {
    const client = queryClient();
    const section: KnowledgeSectionMutationEnvelope = {
      ...actor,
      id: "section-1",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "advanced",
      applicability: "configured",
      version: 3,
      aggregateVersion: 9,
      payload: { modeConfigurations: [] }
    };
    client.setQueryData(knowledgeQueryKeys.item("line-1"), {
      mainLineId: "line-1",
      version: 8,
      preserved: true
    });
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(
      new Error("Background refresh failed.")
    );

    await expect(syncKnowledgeSectionMutation(client, section)).resolves.toBeUndefined();

    expect(client.getQueryData(
      knowledgeQueryKeys.section("line-1", "revision-1", "advanced")
    )).toEqual(section);
    expect(client.getQueryData(knowledgeQueryKeys.item("line-1"))).toMatchObject({
      version: 9,
      preserved: true
    });
  });

  it("invalidates context for lifecycle changes", async () => {
    const client = queryClient();
    const item: KnowledgeItemDetail = {
      ...actor,
      id: "line-1",
      completionRequired: false,
      mainLineId: "line-1",
      basketId: "basket-1",
      basketName: "Interiors",
      mainLineName: "Painting",
      description: null,
      status: "active",
      activeRevisionId: "revision-1",
      draftRevisionId: null,
      revisionNumber: 1,
      uomId: "uom-1",
      priorityId: null,
      modeIds: [],
      surfaceIds: [],
      vendorIds: [],
      completeness,
      allowedActions: ["create_revision"],
      version: 3,
      activeRevision: null,
      draftRevision: null,
      blockers: [],
      warnings: []
    };
    client.setQueryData(knowledgeQueryKeys.contexts(), { available: true });
    client.setQueryData(["estimates", "current"], { untouched: true });

    await syncKnowledgeLifecycleMutation(client, item);

    expect(client.getQueryState(knowledgeQueryKeys.contexts())?.isInvalidated).toBe(
      true
    );
    expect(client.getQueryState(["estimates", "current"])?.isInvalidated).toBe(
      false
    );
  });

  it("invalidates the selected reusable master family and resolved contexts", async () => {
    const client = queryClient();
    client.setQueryData(knowledgeQueryKeys.masterLists("vendors"), []);
    client.setQueryData(knowledgeQueryKeys.masterLists("uoms"), []);
    client.setQueryData(knowledgeQueryKeys.contexts(), { available: true });

    await syncKnowledgeMasterMutation(client, "vendors");

    expect(
      client.getQueryState(knowledgeQueryKeys.masterLists("vendors"))?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(knowledgeQueryKeys.masterLists("uoms"))?.isInvalidated
    ).toBe(false);
    expect(client.getQueryState(knowledgeQueryKeys.contexts())?.isInvalidated).toBe(true);
  });

  it("refreshes every Surface catalog consumer after create, edit, or lifecycle changes", async () => {
    const client = queryClient();
    const surfacePage = knowledgeQueryKeys.masterList("surfaces", { limit: 25, offset: 0 });
    const surfaceCatalog = knowledgeQueryKeys.masterCatalog("surfaces");
    const unitCatalog = knowledgeQueryKeys.masterCatalog("uoms");
    client.setQueryData(surfacePage, { items: [] });
    client.setQueryData(surfaceCatalog, { items: [] });
    client.setQueryData(unitCatalog, { items: [] });
    client.setQueryData(knowledgeQueryKeys.itemLists(), []);
    client.setQueryData(knowledgeQueryKeys.contexts(), {});

    await syncKnowledgeMasterMutation(client, "surfaces");

    expect(client.getQueryState(surfacePage)?.isInvalidated).toBe(true);
    expect(client.getQueryState(surfaceCatalog)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unitCatalog)?.isInvalidated).toBe(false);
    expect(client.getQueryState(knowledgeQueryKeys.itemLists())?.isInvalidated).toBe(true);
    expect(client.getQueryState(knowledgeQueryKeys.contexts())?.isInvalidated).toBe(true);
  });

  it("commits a returned Surface before non-blocking refresh failures", async () => {
    const client = queryClient();
    const surfaceCatalog = knowledgeQueryKeys.masterCatalog("surfaces");
    client.setQueryData(surfaceCatalog, {
      items: [],
      pagination: { limit: 100, offset: 0, total: 0, hasMore: false }
    });
    const returnedSurface: KnowledgeMaster = {
      id: "surface-returned-id",
      masterType: "surfaces",
      code: "GENERATED_CODE",
      name: "Counter surface",
      description: "Granite, quartz",
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt
    };
    const invalidate = vi.spyOn(client, "invalidateQueries").mockRejectedValue(
      new Error("Background refresh failed.")
    );

    await expect(
      syncKnowledgeMasterMutation(client, "surfaces", returnedSurface)
    ).resolves.toBeUndefined();

    expect(client.getQueryData<{ items: readonly KnowledgeMaster[] }>(surfaceCatalog)?.items)
      .toEqual([returnedSurface]);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
