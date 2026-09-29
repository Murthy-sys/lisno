import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { item, section, squareFoot, squareMetre } from "../../test/fixtures/enterpriseKnowledgeData";
import * as api from "./knowledgeApi";
import { commitKnowledgeSectionMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { useKnowledgeSavedSummary, type KnowledgeSavedSummaryInput } from "./useKnowledgeSavedSummary";
import type { KnowledgeBasketQuality, KnowledgeJsonObject, KnowledgeSectionEnvelope } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (original) => ({
  ...await original<typeof import("./knowledgeApi")>(),
  getKnowledgeSection: vi.fn(), getKnowledgeBasketQuality: vi.fn(), getKnowledgeItem: vi.fn(),
  listKnowledgeSubBaskets: vi.fn(), listKnowledgeQualityControlOptions: vi.fn(), previewKnowledge: vi.fn(), updateKnowledgeSection: vi.fn()
}));

const checklist: KnowledgeBasketQuality = { basketId: item.basketId, basketName: item.basketName, basketStatus: "active",
  version: 1, revisionId: "checklist-1", revisionNumber: 1, contentDigest: null, updatedAt: null,
  parameters: [{ id: "q-1", label: "Saved basket alignment", type: "text", acceptanceCriteria: "Level joints" }] };
const input: KnowledgeSavedSummaryInput = { item, revisionId: "revision-1", masters: { uoms: [squareFoot, squareMetre] }, baskets: [], items: [] };
const configuredPmc: KnowledgeJsonObject = {
  pmcMinimumMarginBps: 1_000,
  pmcMarginBps: 2_000,
  modeCalculations: {
    pmc: { baseRatePaise: 12_345, lowQuantityLimit: "0", impactBps: 750, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 }
  }
};

function setup(props: KnowledgeSavedSummaryInput = input) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook((next: KnowledgeSavedSummaryInput) => useKnowledgeSavedSummary(next), { wrapper, initialProps: props }) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (lineId, revisionId, key) => ({
    ...section(key, key === "overview" ? { uomId: squareFoot.id } : {}), mainLineId: lineId, revisionId
  }));
  vi.mocked(api.getKnowledgeBasketQuality).mockImplementation(async (basketId) => ({ ...checklist, basketId }));
  vi.mocked(api.getKnowledgeItem).mockRejectedValue(new Error("Related item unavailable"));
  vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue({ items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } });
  vi.mocked(api.listKnowledgeQualityControlOptions).mockResolvedValue({ items: [] });
});

describe("saved summary queries", () => {
  it("loads every saved source initially and shares existing editor query keys without repeat reads", async () => {
    const { result, client, rerender } = setup();
    await waitFor(() => expect(result.current.every((group) => !group.notices.length)).toBe(true));
    expect(api.getKnowledgeSection).toHaveBeenCalledTimes(4);
    expect(api.getKnowledgeSection).toHaveBeenCalledWith(item.mainLineId, "revision-1", "pricing");
    expect(api.getKnowledgeSection).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "quality");
    expect(api.getKnowledgeBasketQuality).toHaveBeenCalledWith(item.basketId);
    expect(JSON.stringify(result.current)).toContain("Square foot");
    expect(JSON.stringify(result.current)).toContain("Saved basket alignment");
    await client.fetchQuery({ queryKey: knowledgeQueryKeys.section(item.mainLineId, "revision-1", "overview"),
      queryFn: () => api.getKnowledgeSection(item.mainLineId, "revision-1", "overview") });
    rerender({ ...input });
    expect(api.getKnowledgeSection).toHaveBeenCalledTimes(4);
    expect(api.previewKnowledge).not.toHaveBeenCalled();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("resolves reusable Quality controls through shared catalog queries without exposing references", async () => {
    const frequencyId = "qco_111111111111111111111111";
    const performerId = "qco_222222222222222222222222";
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({
      ...checklist,
      parameters: [{ id: "q-1", label: "Saved basket alignment", type: "boolean", severity: "minor", responsibleRole: performerId, sampling: { method: "all", unit: frequencyId } }]
    });
    vi.mocked(api.listKnowledgeQualityControlOptions).mockImplementation(async kind => ({ items: [{
      id: kind === "frequency" ? frequencyId : performerId,
      kind,
      name: kind === "frequency" ? "Per elevation" : "Quality lead",
      version: 1, createdById: "user-1", updatedById: "user-1",
      createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z"
    }] }));
    const { result } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[3])).toContain("Per elevation"));
    expect(JSON.stringify(result.current[3])).toContain("Quality lead");
    expect(JSON.stringify(result.current[3])).not.toContain("qco_");
    expect(result.current[3].notices).toEqual([]);
    expect(api.listKnowledgeQualityControlOptions).toHaveBeenCalledWith("frequency");
    expect(api.listKnowledgeQualityControlOptions).toHaveBeenCalledWith("performer");
  });

  it("keeps saved Quality readable when a reusable-value catalog cannot load", async () => {
    const unavailableId = "qco_333333333333333333333333";
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({
      ...checklist,
      parameters: [{ id: "q-1", label: "Saved basket alignment", type: "boolean", severity: "minor", responsibleRole: unavailableId, sampling: { method: "all", unit: unavailableId } }]
    });
    vi.mocked(api.listKnowledgeQualityControlOptions).mockRejectedValue(new Error("Catalog offline"));
    const { result } = setup();
    await waitFor(() => expect(result.current[3].notices.filter(notice => notice.tone === "error")).toHaveLength(2));
    expect(JSON.stringify(result.current[3])).toContain("Unavailable frequency value");
    expect(JSON.stringify(result.current[3])).toContain("Unavailable performed-by value");
    expect(JSON.stringify(result.current[3])).not.toContain("qco_");
  });

  it("updates from confirmed section and shared Quality cache writes without mixing local buffers", async () => {
    const { result, client, rerender } = setup();
    await waitFor(() => expect(result.current[0].details.length).toBeGreaterThan(0));
    const unsavedOverview = { uomId: squareMetre.id };
    rerender({ ...input });
    expect(JSON.stringify(result.current[0])).toContain("Square foot");
    expect(JSON.stringify(result.current[0])).not.toContain("Square metre");
    await act(async () => {
      commitKnowledgeSectionMutation(client, { ...section("overview", unsavedOverview, 3), aggregateVersion: 5 });
      client.setQueryData(knowledgeQueryKeys.basketQuality(item.basketId), { ...checklist,
        parameters: [{ id: "q-2", label: "Confirmed electrical safety", type: "boolean" }], version: 2 });
    });
    await waitFor(() => expect(JSON.stringify(result.current[0])).toContain("Square metre"));
    await waitFor(() => expect(JSON.stringify(result.current[3])).toContain("Confirmed electrical safety"));
    expect(JSON.stringify(result.current[3])).not.toContain("Saved basket alignment");
  });

  it("updates saved Mode details from confirmed Advanced cache writes without retaining removed fields", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key,
      key === "advanced" ? { pmcMarginBps: 1_000, modeDescription: "Previous saved description" } : {}));
    const { result, client } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Previous saved description"));
    expect(result.current[1].details.find(row => row.label === "PMC")?.value).toBe("Not configured");
    await act(async () => { commitKnowledgeSectionMutation(client, { ...section("advanced", configuredPmc, 3), aggregateVersion: 5 }); });
    await waitFor(() => expect(result.current[1].details.find(row => row.label === "PMC")?.value).toBe("Unit price ₹123.45 · Low quantity ≤0 · Impact 7.5% · Min 10% · Max 20%"));
    expect(JSON.stringify(result.current[1])).not.toContain("Previous saved description");
    expect(api.getKnowledgeSection).toHaveBeenCalledWith(item.mainLineId, "revision-1", "pricing");
  });

  it("updates saved Specifications and Brands from a confirmed Pricing cache write", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key,
      key === "pricing" ? {
        brands: [{ id: "saved-brand", name: "Original brand", description: "Original warranty" }],
        specifications: [{ id: "saved-spec", name: "Original finish", brandId: "saved-brand", description: "Original grade" }]
      } : {}));
    const { result, client } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Original finish"));
    await act(async () => { commitKnowledgeSectionMutation(client, { ...section("pricing", {
      brands: [{ id: "saved-brand", name: "Confirmed brand", description: "Confirmed warranty" }],
      specifications: [{ id: "saved-spec", name: "Confirmed finish", brandId: "saved-brand", description: "Confirmed grade" }]
    }, 3), aggregateVersion: 5 }); });
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Confirmed finish"));
    expect(JSON.stringify(result.current[1])).toContain("Confirmed brand");
    expect(JSON.stringify(result.current[1])).not.toContain("Original finish");
    expect(JSON.stringify(result.current[1])).not.toContain("Original brand");
  });

  it("keeps available sources visible through an independent failure and scoped retry", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => {
      if (key === "advanced") throw new Error("Unavailable");
      return section(key, key === "pricing" ? { specifications: [{ id: "saved-spec", name: "Saved finish" }] } : {});
    });
    const { result } = setup();
    await waitFor(() => expect(result.current[1].notices.some((notice) => notice.tone === "error")).toBe(true));
    expect(result.current[1].details.find((row) => row.value === "Saved finish")).toBeDefined();
    expect(result.current[1].preview.find((row) => row.value === "Saved finish")).toBeDefined();
    expect(JSON.stringify(result.current[3])).toContain("Saved basket alignment");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue(section("advanced", configuredPmc));
    await act(async () => { result.current[1].notices.find((notice) => notice.onRetry)?.onRetry?.(); });
    await waitFor(() => expect(result.current[1].notices).toEqual([]));
    expect(api.getKnowledgeSection).toHaveBeenCalledTimes(5);
    expect(result.current[1].details.find(row => row.label === "PMC")?.value).toBe("Unit price ₹123.45 · Low quantity ≤0 · Impact 7.5% · Min 10% · Max 20%");
  });

  it("keeps saved Advanced rows visible while Pricing is still loading", async () => {
    const pricing = deferred<KnowledgeSectionEnvelope<KnowledgeJsonObject>>();
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => key === "pricing"
      ? pricing.promise : section(key, key === "advanced" ? configuredPmc : {}));
    const { result } = setup();
    await waitFor(() => expect(result.current[1].preview[0]?.value).toContain("Unit price ₹123.45"));
    expect(result.current[1].preview).toHaveLength(4);
    expect(result.current[1].notices.find((notice) => notice.key === "pricing")?.message).toBe("Loading Mode specifications and brands…");
    await act(async () => { pricing.resolve(section("pricing", { specifications: [{ id: "spec-1", name: "Late saved finish" }] })); });
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Late saved finish"));
    expect(result.current[1].notices).toEqual([]);
  });

  it("keeps confirmed Advanced rows visible while Pricing fails, then retries only Pricing", async () => {
    let pricingUnavailable = true;
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => {
      if (key === "pricing" && pricingUnavailable) throw new Error("Pricing unavailable");
      return section(key, key === "advanced" ? { ...configuredPmc, modeDescription: "Saved work scope" }
        : key === "pricing" ? { specifications: [{ id: "spec-1", name: "Recovered finish" }] } : {});
    });
    const { result } = setup();
    await waitFor(() => expect(result.current[1].notices.find((notice) => notice.key === "pricing")?.tone).toBe("error"));
    expect(result.current[1].preview).toHaveLength(4);
    expect(JSON.stringify(result.current[1])).toContain("Saved work scope");
    expect(JSON.stringify(result.current[1])).not.toContain("Recovered finish");
    expect(result.current[1].notices.find((notice) => notice.key === "pricing")?.message).toContain("Mode specifications and brands");
    pricingUnavailable = false;
    await act(async () => { result.current[1].notices.find((notice) => notice.key === "pricing")?.onRetry?.(); });
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Recovered finish"));
    expect(result.current[1].notices).toEqual([]);
    expect(vi.mocked(api.getKnowledgeSection).mock.calls.filter(([, , key]) => key === "pricing")).toHaveLength(2);
    expect(vi.mocked(api.getKnowledgeSection).mock.calls.filter(([, , key]) => key === "advanced")).toHaveLength(1);
  });

  it("rejects mismatched Pricing identity and hides its cached details after access is denied", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => key === "pricing"
      ? { ...section(key, { specifications: [{ id: "spec-1", name: "Another revision finish" }] }), revisionId: "revision-other" }
      : section(key, key === "advanced" ? { modeDescription: "Confirmed work scope" } : {}));
    const { result, client } = setup();
    await waitFor(() => expect(result.current[1].notices.find((notice) => notice.key === "pricing")?.tone).toBe("error"));
    expect(JSON.stringify(result.current[1])).toContain("Confirmed work scope");
    expect(JSON.stringify(result.current[1])).not.toContain("Another revision finish");

    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key,
      key === "pricing" ? { brands: [{ id: "brand-1", name: "Saved fittings" }] } : {}));
    await act(async () => { result.current[1].notices.find((notice) => notice.key === "pricing")?.onRetry?.(); });
    await waitFor(() => expect(JSON.stringify(result.current[1])).toContain("Saved fittings"));
    vi.mocked(api.getKnowledgeSection).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access denied"));
    await act(async () => { await client.refetchQueries({ queryKey: knowledgeQueryKeys.section(item.mainLineId, "revision-1", "pricing"), exact: true }); });
    await waitFor(() => expect(result.current[1].notices.find((notice) => notice.key === "pricing")?.tone).toBe("error"));
    expect(JSON.stringify(result.current[1])).not.toContain("Saved fittings");
    expect(result.current[1].preview).toHaveLength(4);
  });

  it("marks failed refreshes stale, but hides cached data after an authorization denial", async () => {
    const { result, client } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[0])).toContain("Square foot"));
    vi.mocked(api.getKnowledgeSection).mockRejectedValue(new Error("Offline"));
    await act(async () => { await client.refetchQueries({ queryKey: knowledgeQueryKeys.section(item.mainLineId, "revision-1", "overview"), exact: true }); });
    expect(JSON.stringify(result.current[0])).toContain("Square foot");
    await waitFor(() => expect(result.current[0].notices[0]?.message).toContain("last saved data"));
    vi.mocked(api.getKnowledgeSection).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access denied"));
    await act(async () => { await client.refetchQueries({ queryKey: knowledgeQueryKeys.section(item.mainLineId, "revision-1", "overview"), exact: true }); });
    await waitFor(() => expect(JSON.stringify(result.current[0])).not.toContain("Square foot"));
    expect(result.current[0].notices[0].tone).toBe("error");
  });

  it("does not reuse prior Main Line, revision or Basket values during delayed identity changes", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(JSON.stringify(result.current)).toContain("Saved basket alignment"));
    const nextSection = deferred<KnowledgeSectionEnvelope<KnowledgeJsonObject>>();
    const nextQuality = deferred<KnowledgeBasketQuality>();
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (line, revision, key) => ({ ...await nextSection.promise, mainLineId: line, revisionId: revision, sectionKey: key }));
    vi.mocked(api.getKnowledgeBasketQuality).mockReturnValue(nextQuality.promise);
    rerender({ ...input, item: { ...item, mainLineId: "line-unequal", basketId: "basket-other" }, revisionId: "revision-new" });
    expect(JSON.stringify(result.current)).not.toContain("Square foot");
    expect(JSON.stringify(result.current)).not.toContain("Saved basket alignment");
    await act(async () => {
      nextSection.resolve(section("overview", { uomId: squareMetre.id }));
      nextQuality.resolve({ ...checklist, basketId: "basket-other", parameters: [{ id: "q-other", label: "Other Basket checklist", type: "text" }] });
    });
    await waitFor(() => expect(JSON.stringify(result.current[0])).toContain("Square metre"));
    expect(JSON.stringify(result.current[3])).toContain("Other Basket checklist");
  });

  it("skips revision-owned requests without a revision, then loads temporary recommendations", async () => {
    const { result, rerender } = setup({ ...input, revisionId: undefined });
    await waitFor(() => expect(JSON.stringify(result.current[3])).toContain("Saved basket alignment"));
    expect(api.getKnowledgeSection).not.toHaveBeenCalled();
    expect(result.current[0].emptyMessage).toBe("No revision available");
    expect(result.current[2].emptyMessage).toBe("No revision available");
    rerender({ ...input, item: { ...item, itemType: "temporary" } });
    await waitFor(() => expect(result.current[2].notices).toEqual([]));
    expect(api.getKnowledgeSection).toHaveBeenCalledTimes(4);
    expect(api.getKnowledgeSection).toHaveBeenCalledWith(item.mainLineId, "revision-1", "recommendations");
    expect(result.current[2].emptyMessage).toBe("Not configured");
  });

  it("shows confirmed legacy temporary rules, retry errors, and an empty saved replacement", async () => {
    const initial = { ...section("recommendations", { exclusions: [{ id: "saved-rule", name: "Saved access clearance", active: true }] }),
      applicability: "not_applicable" as const };
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (lineId, revisionId, key) => ({
      ...(key === "recommendations" ? initial : section(key)), mainLineId: lineId, revisionId
    }));
    const temporaryInput = { ...input, item: { ...item, itemType: "temporary" as const } };
    const { result, client } = setup(temporaryInput);
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("Saved access clearance"));
    expect(result.current[2].emptyMessage).toBeUndefined();
    vi.mocked(api.getKnowledgeSection).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { await client.refetchQueries({ queryKey: knowledgeQueryKeys.section(item.mainLineId, "revision-1", "recommendations"), exact: true }); });
    expect(JSON.stringify(result.current[2])).toContain("Saved access clearance");
    await waitFor(() => expect(result.current[2].notices[0]?.message).toContain("last saved data"));
    await act(async () => {
      commitKnowledgeSectionMutation(client, { ...section("recommendations", { exclusions: [] }, 3), aggregateVersion: 5 });
    });
    await waitFor(() => expect(result.current[2].emptyMessage).toBe("Not configured"));
    expect(JSON.stringify(result.current[2])).not.toContain("Saved access clearance");
  });

  it("does not reuse another temporary revision's recommendation summary", async () => {
    const next = deferred<KnowledgeSectionEnvelope<KnowledgeJsonObject>>();
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (lineId, revisionId, key) => {
      if (key !== "recommendations") return { ...section(key), mainLineId: lineId, revisionId };
      if (revisionId === "revision-2") return next.promise;
      return { ...section(key, { exclusions: [{ id: "first", name: "First revision exclusion", active: true }] }), mainLineId: lineId, revisionId };
    });
    const temporaryInput = { ...input, item: { ...item, itemType: "temporary" as const } };
    const { result, rerender } = setup(temporaryInput);
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("First revision exclusion"));
    rerender({ ...temporaryInput, revisionId: "revision-2" });
    expect(JSON.stringify(result.current[2])).not.toContain("First revision exclusion");
    expect(result.current[2].notices[0]?.message).toContain("Loading Recommendation & Exclusions");
    await act(async () => next.resolve({ ...section("recommendations", { exclusions: [{ id: "second", name: "Second revision exclusion", active: true }] }), revisionId: "revision-2" }));
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("Second revision exclusion"));
    expect(JSON.stringify(result.current[2])).not.toContain("First revision exclusion");
  });

  it("resolves missing saved target context by ID without requesting unrelated catalogs", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? {
      budgetAlterations: [{ id: "rule", trigger: "added", action: "add", requirement: "must", targetType: "catalog",
        targetBasketId: "electrical", targetSubBasketId: "lighting", targetMainLineId: "target-unequal", reason: "Supply power", active: true }]
    } : {}));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...item, mainLineId: "target-unequal", basketId: "electrical", basketName: "Electrical",
      subBasketId: "lighting", subBasketName: "Lighting", mainLineName: "Target downlight" });
    const { result, rerender } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("Target downlight"));
    expect(JSON.stringify(result.current[2])).toContain("Lighting");
    expect(api.getKnowledgeItem).toHaveBeenCalledExactlyOnceWith("target-unequal");
    expect(vi.mocked(api.listKnowledgeSubBaskets).mock.calls.every(([basketId]) => basketId === "electrical")).toBe(true);
    rerender({ ...input });
    expect(api.getKnowledgeItem).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.current)).not.toContain("target-unequal");
  });

  it("resolves a whole Sub-Basket without requesting a nullable Main Line target", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? {
      budgetAlterations: [{ id: "rule", trigger: "added", action: "add", requirement: "must", targetKind: "sub_basket",
        targetType: null, targetBasketId: "electrical", targetSubBasketId: "lighting", targetMainLineId: null,
        reason: "Add lighting scope", active: true }]
    } : {}));
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue({
      items: [{ id: "lighting", basketId: "electrical", name: "Lighting", displayOrder: 0,
        version: 1, createdById: "actor", updatedById: "actor", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
    });
    const { result } = setup();
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("Whole Sub-Basket"));
    expect(JSON.stringify(result.current[2])).toContain("Lighting");
    expect(JSON.stringify(result.current[2])).not.toMatch(/targetMainLineId|targetType/iu);
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
    expect(api.listKnowledgeSubBaskets).toHaveBeenCalledExactlyOnceWith("electrical", { limit: 100, offset: 0 });
  });

  it("does not display mismatched envelope identities or report them as empty configuration", async () => {
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section("overview", { uomId: squareFoot.id }), revisionId: "wrong-revision" });
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...checklist, basketId: "wrong-basket" });
    const { result } = setup();
    await waitFor(() => expect(result.current.every((group) => group.notices.some((notice) => notice.tone === "error"))).toBe(true));
    expect(JSON.stringify(result.current)).not.toContain("Square foot");
    expect(JSON.stringify(result.current)).not.toContain("Saved basket alignment");
    expect(result.current.every((group) => !group.emptyMessage)).toBe(true);
  });

  it("hides denied reference catalogs and stops supplementary lookups while retaining unrelated saved data", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? {
      budgetAlterations: [{ id: "rule", trigger: "added", action: "add", requirement: "must", targetType: "catalog",
        targetBasketId: "electrical", targetSubBasketId: "lighting", targetMainLineId: "target", active: true }]
    } : key === "overview" ? { uomId: squareFoot.id } : {}));
    const target = { ...item, mainLineId: "target", basketId: "electrical", basketName: "Electrical", subBasketId: "lighting",
      subBasketName: "Lighting", mainLineName: "Protected downlight" };
    const props = { ...input, items: [target] };
    const { result, rerender } = setup(props);
    await waitFor(() => expect(JSON.stringify(result.current[2])).toContain("Protected downlight"));
    rerender({ ...props, referenceStates: { masters: { uoms: { status: "ready", denied: true } },
      relationships: { status: "ready", denied: true } } });
    expect(JSON.stringify(result.current)).not.toContain("Protected downlight");
    expect(JSON.stringify(result.current)).not.toContain("Lighting");
    expect(JSON.stringify(result.current)).not.toContain("Square foot");
    expect(result.current[0].notices[0]?.message).toContain("access unavailable");
    expect(result.current[2].notices[0]?.message).toContain("access unavailable");
    expect(JSON.stringify(result.current[3])).toContain("Saved basket alignment");
    expect(api.getKnowledgeItem).not.toHaveBeenCalled();
    expect(api.listKnowledgeSubBaskets).not.toHaveBeenCalled();
  });

  it("shares the existing editor Sub-Basket catalog cache", async () => {
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? {
      budgetAlterations: [{ id: "rule", trigger: "added", action: "add", requirement: "must", targetType: "catalog",
        targetBasketId: "electrical", targetSubBasketId: "lighting", active: true }]
    } : {}));
    const { result, client } = setup();
    await waitFor(() => expect(result.current[2].details.length).toBeGreaterThan(0));
    await waitFor(() => expect(api.listKnowledgeSubBaskets).toHaveBeenCalledTimes(1));
    await client.fetchQuery({ queryKey: [...knowledgeQueryKeys.subBasketLists("electrical"), "catalog"],
      queryFn: () => api.listKnowledgeSubBaskets("electrical", { limit: 100, offset: 0 }) });
    expect(api.listKnowledgeSubBaskets).toHaveBeenCalledTimes(1);
  });
});
