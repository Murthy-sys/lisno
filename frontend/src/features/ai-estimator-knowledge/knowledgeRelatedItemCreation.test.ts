import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import * as api from "./knowledgeApi";
import { reconcileRelatedItemCreation, requiresRelatedItemReconciliation, type RelatedItemCreationInput } from "./knowledgeRelatedItemCreation";
import type { KnowledgeItemDetail, KnowledgeMainLine, KnowledgeSubBasket } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ listKnowledgeMainLines: vi.fn(), listKnowledgeSubBaskets: vi.fn(), getKnowledgeItem: vi.fn() }));

function page<T>(items: T[], offset = 0, hasMore = false) {
  return { items, pagination: { limit: 100, offset, total: items.length + offset + (hasMore ? 1 : 0), hasMore } };
}
const input: RelatedItemCreationInput = { basketId: "electrical", subBasketName: "Ceiling lighting", itemType: "main_line", name: "Recessed LED downlight", excludeMainLineId: "source-line" };
const line = { id: "downlight", basketId: "electrical", subBasketId: "ceiling-lighting", itemType: "main_line", name: input.name, status: "draft" } as KnowledgeMainLine;
const detail = { ...line, mainLineId: line.id, mainLineName: line.name } as unknown as KnowledgeItemDetail;
const subBasket = { id: "ceiling-lighting", name: "Ceiling lighting", basketId: "electrical" } as KnowledgeSubBasket;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([line]));
  vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([subBasket]));
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(detail);
});

describe("related item creation reconciliation", () => {
  it("returns confirmed detail only after complete inventory and exact-context reads", async () => {
    const result = await reconcileRelatedItemCreation({ ...input, name: "  RECESSED   LED DOWNLIGHT ", subBasketName: "Ｃｅｉｌｉｎｇ lighting" });
    expect(result).toEqual({ kind: "match", item: detail });
    expect(api.listKnowledgeMainLines).toHaveBeenCalledWith("electrical", { limit: 100, offset: 0, includeArchived: true });
    expect(api.getKnowledgeItem).toHaveBeenCalledWith("downlight");
  });

  it("finds matches on later item and Sub Basket pages", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValueOnce(page([{ ...line, id: "other", name: "Surface light" }], 0, true)).mockResolvedValueOnce(page([line], 1));
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValueOnce(page([{ ...subBasket, id: "cove", name: "Cove lighting" }], 0, true)).mockResolvedValueOnce(page([subBasket], 1));
    expect(await reconcileRelatedItemCreation(input)).toEqual({ kind: "match", item: detail });
    expect(api.listKnowledgeMainLines).toHaveBeenLastCalledWith("electrical", { limit: 100, offset: 1, includeArchived: true });
    expect(api.listKnowledgeSubBaskets).toHaveBeenLastCalledWith("electrical", { limit: 100, offset: 1 });
  });

  it.each([
    { status: "inactive" }, { status: "archived" }, { id: "source-line" },
    { itemType: "temporary" }, { subBasketId: "cove-lighting" }
  ])("does not offer an unavailable, source, or incompatible item: %j", async (change) => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...line, ...change } as KnowledgeMainLine]));
    expect(await reconcileRelatedItemCreation(input)).toMatchObject({ kind: "conflict" });
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
  });

  it("does not treat a same name in a different basket as a match", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...line, basketId: "modular" }]));
    expect(await reconcileRelatedItemCreation(input)).toEqual({ kind: "absent" });
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous eligible ID instead of selecting a name", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([line, { ...line, id: "another-line" }]));
    expect(await reconcileRelatedItemCreation(input)).toMatchObject({ kind: "conflict" });
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
  });

  it.each([
    { mainLineId: "other-line" }, { mainLineName: "Renamed item" }, { basketId: "modular" },
    { subBasketId: "other-sub" }, { itemType: "temporary" }, { status: "inactive" }
  ])("rechecks authoritative detail before offering reuse: %j", async (change) => {
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...detail, ...change } as KnowledgeItemDetail);
    expect(await reconcileRelatedItemCreation(input)).toMatchObject({ kind: "conflict" });
  });

  it("preserves temporary items without a Sub Basket", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...line, itemType: "temporary", subBasketId: null }]));
    const temporaryDetail = { ...detail, itemType: "temporary" as const, subBasketId: null };
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(temporaryDetail);
    expect(await reconcileRelatedItemCreation({ ...input, itemType: "temporary", subBasketName: "" })).toEqual({ kind: "match", item: temporaryDetail });
  });

  it("does not report absence if a later page fails", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValueOnce(page([{ ...line, name: "Surface light" }], 0, true)).mockRejectedValueOnce(new Error("Offline"));
    await expect(reconcileRelatedItemCreation(input)).rejects.toThrow("Offline");
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
  });

  it("does not report absence from non-advancing pagination", async () => {
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([], 0, true));
    await expect(reconcileRelatedItemCreation(input)).rejects.toThrow("pagination did not advance");
  });

  it.each([new Error("Network response lost"), new ApiError(0, "REQUEST_FAILED", "Network error"), new ApiError(408, "REQUEST_FAILED", "Timeout"), new ApiError(409, "DUPLICATE", "Duplicate"), new ApiError(500, "INTERNAL_ERROR", "Unknown server outcome")])("reconciles uncertain or conflicting writes (%s)", (error) => {
    expect(requiresRelatedItemReconciliation(error)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422, 429])("allows correction after a definite rejected write (%s)", (status) => {
    expect(requiresRelatedItemReconciliation(new ApiError(status, "REJECTED", "Rejected"))).toBe(false);
  });
});
