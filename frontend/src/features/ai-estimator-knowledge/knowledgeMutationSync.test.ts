import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  syncKnowledgeBasketDeletion,
  syncKnowledgeLifecycleMutation,
  syncKnowledgeMasterMutation,
  syncKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
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

describe("knowledge mutation cache synchronization", () => {
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
});
