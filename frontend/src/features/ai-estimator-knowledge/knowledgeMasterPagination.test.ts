import { describe, expect, it, vi } from "vitest";

import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import type { KnowledgeMaster, KnowledgeMasterListResponse } from "./knowledgeTypes";

function response(
  items: readonly KnowledgeMaster[],
  offset: number,
  total: number
): KnowledgeMasterListResponse {
  return {
    items,
    pagination: {
      limit: 100,
      offset,
      total,
      hasMore: offset + items.length < total
    }
  };
}

describe("knowledge master pagination", () => {
  it("loads Mode records beyond the first 100 without truncating stable IDs", async () => {
    const masters = Array.from({ length: 102 }, (_, index) => ({
      id: `mode-${index + 1}`,
      masterType: "modes" as const,
      code: `MODE_${index + 1}`,
      name: `Mode ${index + 1}`,
      description: null,
      displayOrder: index,
      status: "active" as const,
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z"
    }));
    const loadPage = vi.fn(async ({ offset = 0 }: { readonly offset?: number }) =>
      response(masters.slice(offset, offset + 100), offset, masters.length)
    );

    const result = await collectAllKnowledgeMasterPages(loadPage);

    expect(loadPage).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 });
    expect(loadPage).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
    expect(result.items).toHaveLength(102);
    expect(result.items.at(-1)?.id).toBe("mode-102");
    expect(result.pagination).toEqual({ limit: 100, offset: 0, total: 102, hasMore: false });
  });

  it("fails safely when a server claims another page without advancing", async () => {
    const loadPage = vi.fn().mockResolvedValue({
      items: [],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: true }
    });

    await expect(collectAllKnowledgeMasterPages(loadPage)).rejects.toThrow(
      "Mode list pagination did not advance."
    );
  });
});
