import { describe, expect, it, vi } from "vitest";

import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import type {
  KnowledgeMaster,
  KnowledgeMasterListResponse,
  KnowledgeSurface
} from "./knowledgeTypes";

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

    await expect(collectAllKnowledgeMasterPages(loadPage, "Unit")).rejects.toThrow(
      "Unit list pagination did not advance."
    );
  });

  it("loads UOM records beyond the first page with their decimal scales", async () => {
    const uoms = Array.from({ length: 101 }, (_, index) => ({
      id: `uom-${index + 1}`,
      masterType: "uoms" as const,
      code: `UOM_${index + 1}`,
      name: `Unit ${index + 1}`,
      description: null,
      displayOrder: index,
      status: "active" as const,
      decimalScale: index === 100 ? 3 : 0,
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z"
    }));
    const loadPage = vi.fn(async ({ offset = 0 }: { readonly offset?: number }) =>
      response(uoms.slice(offset, offset + 100), offset, uoms.length)
    );

    const result = await collectAllKnowledgeMasterPages(loadPage, "Unit");

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.items.at(-1)).toMatchObject({ id: "uom-101", decimalScale: 3 });
  });

  it("loads canonical Priority semantic tiers beyond the first page", async () => {
    const priorities = Array.from({ length: 104 }, (_, index) => ({
      id: `priority-${index + 1}`,
      masterType: "priorities" as const,
      code: `PRIORITY_${index + 1}`,
      name: `Priority ${index + 1}`,
      description: null,
      displayOrder: index,
      status: "active" as const,
      semanticTier: index === 103 ? "low" as const : undefined,
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T08:00:00.000Z"
    }));
    const loadPage = vi.fn(async ({ offset = 0 }: { readonly offset?: number }) =>
      response(priorities.slice(offset, offset + 100), offset, priorities.length)
    );

    const result = await collectAllKnowledgeMasterPages(loadPage, "Priority");

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.items.at(-1)).toMatchObject({ id: "priority-104", semanticTier: "low" });
  });

  it("keeps Surface records beyond record 100", async () => {
    const surfaces: readonly KnowledgeSurface[] = Array.from({ length: 101 }, (_, index) => ({
      id: `surface-${index + 1}`,
      masterType: "surfaces" as const,
      code: `SURFACE_${index + 1}`,
      name: `Surface ${index + 1}`,
      description: index === 100 ? "Last page surface" : null,
      displayOrder: index,
      status: "active" as const,
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: "2026-09-03T08:00:00.000Z",
      updatedAt: "2026-09-03T08:00:00.000Z"
    }));
    const loadPage = vi.fn(async ({ offset = 0 }: { readonly offset?: number }) => ({
      ...response(surfaces.slice(offset, offset + 100), offset, surfaces.length),
      items: surfaces.slice(offset, offset + 100)
    }));

    const result = await collectAllKnowledgeMasterPages<KnowledgeSurface>(loadPage, "Surface");

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.items.at(-1)).toMatchObject({
      id: "surface-101",
      description: "Last page surface"
    });
  });
});
