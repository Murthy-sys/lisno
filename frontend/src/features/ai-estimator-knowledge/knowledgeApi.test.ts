import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import {
  listKnowledgeItems,
  resolveKnowledgeContext,
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

  it("uses the read-only context namespace with stable IDs and canonical quantities", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
    const input = {
      mainBasketId: "basket-1",
      mainLineId: "line-1",
      quantity: "1500.000",
      uomId: "uom-1"
    } as const;

    await resolveKnowledgeContext(input);

    expect(post).toHaveBeenCalledWith(
      "/ai-estimator-knowledge/context",
      input
    );
  });
});
