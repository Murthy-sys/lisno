import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import {
  createKnowledgeSurface,
  createKnowledgeSubBasket,
  createKnowledgeMainLine,
  createKnowledgeQualityControlOption,
  listKnowledgeSubBaskets,
  getKnowledgeBasketDeletionImpact,
  getKnowledgeSubBasketDeletionImpact,
  listKnowledgeSurfaces,
  listKnowledgeItems,
  listKnowledgeMasters,
  listKnowledgeQualityControlOptions,
  permanentlyDeleteKnowledgeMainLine,
  permanentlyDeleteKnowledgeBasket,
  permanentlyDeleteKnowledgeSubBasket,
  previewKnowledge,
  resolveKnowledgeContext,
  updateKnowledgeSurface,
  updateKnowledgeMainLine,
  updateKnowledgeSubBasket,
  updateKnowledgeSection
} from "./knowledgeApi";

afterEach(() => vi.restoreAllMocks());

describe("knowledge API", () => {
  it("requests the global vendor overview independently of filtered table pages", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    await listKnowledgeMasters("vendors", { includeDirectoryOverview: true, limit: 1, offset: 0 });
    expect(get).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/vendors?includeDirectoryOverview=true&limit=1&offset=0");
    await listKnowledgeMasters("vendors", { limit: 5, offset: 5, search: "Oak", status: "inactive" });
    expect(get).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/vendors?limit=5&offset=5&search=Oak&status=inactive");
  });
  it("preserves preview defaults and passes cancellation/local-loading options separately from the payload", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
    const input = { quantity: "2", quantityScale: 0 };
    await previewKnowledge(input);
    expect(post).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/preview", input);
    const options = { signal: new AbortController().signal, showGlobalLoader: false };
    await previewKnowledge(input, options);
    expect(post).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/preview", input, options);
  });

  it("encodes the parent in Sub Basket endpoints and passes the child ID to Main Line creation", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
    await listKnowledgeSubBaskets("basket/one", { limit: 100, offset: 100 });
    expect(get).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket%2Fone/sub-baskets?limit=100&offset=100");
    await createKnowledgeSubBasket("basket/one", { name: "Doors" });
    expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket%2Fone/sub-baskets", { name: "Doors" });
    await createKnowledgeMainLine("basket/one", { name: "Flush door", subBasketName: "Doors" });
    expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket%2Fone/main-lines", { name: "Flush door", subBasketName: "Doors" });
    await createKnowledgeMainLine("basket/one", { name: "Flush door", subBasketId: "child-1" });
    expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket%2Fone/main-lines", { name: "Flush door", subBasketId: "child-1" });
  });

  it("sends versioned Sub-Basket rename and guarded child mutations without changing their payloads", async () => {
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({});
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});
    const guard = { subBasketId: "sub/one", expectedVersion: 8 } as const;

    await updateKnowledgeSubBasket("basket/one", "sub/one", {
      expectedVersion: 8,
      name: "False Ceiling Lights"
    });
    await updateKnowledgeMainLine("line/one", {
      expectedVersion: 3,
      name: "Ceiling spotlights",
      draftSubBasketGuard: guard
    });
    await permanentlyDeleteKnowledgeMainLine("line/one", {
      expectedVersion: 4,
      reason: "Added by mistake",
      draftSubBasketGuard: guard
    });

    expect(patch).toHaveBeenNthCalledWith(1,
      "/admin/ai-estimator-knowledge/baskets/basket%2Fone/sub-baskets/sub%2Fone",
      { expectedVersion: 8, name: "False Ceiling Lights" }
    );
    expect(patch).toHaveBeenNthCalledWith(2,
      "/admin/ai-estimator-knowledge/main-lines/line%2Fone",
      { expectedVersion: 3, name: "Ceiling spotlights", draftSubBasketGuard: guard }
    );
    expect(remove).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/main-lines/line%2Fone",
      { expectedVersion: 4, reason: "Added by mistake", draftSubBasketGuard: guard }
    );
  });

  it("sends the explicit direct-parent Draft guard with rename and removal", async () => {
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({});
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});
    const draftItemGuard = { basketId: "basket/one", subBasketId: null } as const;
    const update = { expectedVersion: 3, name: "False Ceiling Lights", draftItemGuard };
    const deletion = { expectedVersion: 4, reason: "Added by mistake", draftItemGuard };
    await updateKnowledgeMainLine("line/one", update);
    await permanentlyDeleteKnowledgeMainLine("line/one", deletion);
    expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/main-lines/line%2Fone", update);
    expect(remove).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/main-lines/line%2Fone", deletion);
  });

  it("preserves the confirmed Sub-Basket impact and explicit Configuration rename context", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({});
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});
    const input = { expectedVersion: 3, confirmationName: "Lights", reason: "Remove mistake", impactToken: "a".repeat(64) };
    await getKnowledgeSubBasketDeletionImpact("basket/one", "sub/one");
    await updateKnowledgeSubBasket("basket/one", "sub/one", { expectedVersion: 3, name: "Ceiling lights", managementContext: "configuration" });
    await permanentlyDeleteKnowledgeSubBasket("basket/one", "sub/one", input);
    const path = "/admin/ai-estimator-knowledge/baskets/basket%2Fone/sub-baskets/sub%2Fone";
    expect(get).toHaveBeenCalledWith(`${path}/deletion-impact`);
    expect(patch).toHaveBeenCalledWith(path, { expectedVersion: 3, name: "Ceiling lights", managementContext: "configuration" });
    expect(remove).toHaveBeenCalledWith(path, input);
  });

  it("sends the draft-only Sub-Basket guard with the reviewed deletion impact", async () => {
    const remove = vi.spyOn(apiClient, "delete").mockResolvedValue({});
    const input = { expectedVersion: 3, confirmationName: "Lights", reason: "Remove draft group", impactToken: "a".repeat(64), draftOnly: true } as const;
    await permanentlyDeleteKnowledgeSubBasket("basket/one", "sub/one", input);
    expect(remove).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket%2Fone/sub-baskets/sub%2Fone", input);
  });

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

  it("uses the dedicated kind-scoped Quality Control option endpoints", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ items: [] });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});

    await listKnowledgeQualityControlOptions("frequency");
    await createKnowledgeQualityControlOption({ kind: "performer", name: "  Site engineer  " });

    expect(get).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/quality-control-options?kind=frequency"
    );
    expect(post).toHaveBeenCalledWith(
      "/admin/ai-estimator-knowledge/quality-control-options",
      { kind: "performer", name: "  Site engineer  " }
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
