import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  syncKnowledgeLifecycleMutation,
  syncKnowledgeMasterMutation,
  syncKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeSectionEnvelope
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
  it("updates the section and invalidates only related knowledge summaries", async () => {
    const client = queryClient();
    const section: KnowledgeSectionEnvelope = {
      ...actor,
      id: "section-1",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "pricing",
      applicability: "configured",
      version: 2,
      payload: { vendorId: "vendor-1" }
    };
    client.setQueryData(knowledgeQueryKeys.itemLists(), []);
    client.setQueryData(knowledgeQueryKeys.item("line-1"), {});
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
    expect(client.getQueryState(["leads", "list"])?.isInvalidated).toBe(false);
  });

  it("invalidates context only for lifecycle changes", async () => {
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
