import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import {
  createKnowledgeSurface,
  getKnowledgeBasketDeletionImpact,
  listKnowledgeSurfaces,
  listKnowledgeItems,
  permanentlyDeleteKnowledgeBasket,
  resolveKnowledgeContext,
  updateKnowledgeSurface,
  updateKnowledgeSection
} from "./knowledgeApi";

afterEach(() => vi.restoreAllMocks());

describe("knowledge API", () => {
  it("keeps searched item requests inside the additive admin namespace", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      items: [],
      pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
    });

    await listKnowledgeItems({
      status: "active",
      search: "wall & ceiling",
      modeId: "mode/site"
    });

    expect(get).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/items?modeId=mode%2Fsite&search=wall+%26+ceiling&status=active"
    );
  });

  it("uses encoded Basket deletion paths and sends only the locked confirmation payload", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});
    const input = {
      expectedVersion: 7,
      confirmationName: "Joinery & trim",
      reason: "Created by mistake"
    } as const;

    await getKnowledgeBasketDeletionImpact("basket/one");
    await permanentlyDeleteKnowledgeBasket("basket/one", input);

    expect(get).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/baskets/basket%2Fone/deletion-impact"
    );
    expect(remove).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/baskets/basket%2Fone",
      input
    );
  });

  it("sends section CAS data without changing the payload", async () => {
    const put = vi.spyOn(apiClient, "put").mockResolvedValue({});
    const input = {
      expectedAggregateVersion: 7,
      expectedVersion: 3,
      applicability: "configured",
      payload: {
        vendorId: "vendor-1",
        ratePaise: 7_500,
        marginBps: 2_500
      }
    } as const;

    await updateKnowledgeSection(
      "line/one",
      "revision 3",
      "quantity-margin",
      input
    );

    expect(put).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/main-lines/line%2Fone/revisions/revision%203/sections/quantity-margin",
      input
    );
  });

  it("uses the read-only context namespace with a fixed Mode kind and canonical quantities", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
    const input = {
      mainBasketId: "basket-1",
      mainLineId: "line-1",
      quantity: "1500.000",
      uomId: "uom-1",
      modeKind: "execution",
      executionSource: "sub_vendor"
    } as const;

    await resolveKnowledgeContext(input);

    expect(post).toHaveBeenCalledWith(
      "/ai-estimator-knowledge/context",
      input
    );
  });

  it("uses the specialized Surface contract without manufacturing technical fields", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({});
    const createInput = {
      name: "Counter surface",
      description: "Granite, quartz, marble"
    } as const;
    const updateInput = {
      expectedVersion: 7,
      description: "Granite and marble"
    } as const;

    await listKnowledgeSurfaces({ includeArchived: true, limit: 100, offset: 100 });
    await createKnowledgeSurface(createInput);
    await updateKnowledgeSurface("surface/one", updateInput);

    expect(get).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/surfaces?includeArchived=true&limit=100&offset=100"
    );
    expect(post).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/surfaces",
      createInput
    );
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("code");
    expect(patch).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/surfaces/surface%2Fone",
      updateInput
    );
  });
});
