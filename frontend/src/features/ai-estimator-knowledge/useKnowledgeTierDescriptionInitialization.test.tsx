import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { useKnowledgeTierDescriptionInitialization } from "./useKnowledgeTierDescriptionInitialization";
import { knowledgeModeTierDataSource } from "./knowledgeModeTierDataSource";
import * as api from "./knowledgeApi";
import { invalidateKnowledgeSectionMutation } from "./knowledgeMutationSync";
import type { KnowledgeItemDetail, KnowledgeSectionEnvelope, KnowledgeTierDescriptionInitializationResult } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async original => ({ ...await original<typeof import("./knowledgeApi")>(),
  getKnowledgeItem: vi.fn(), getKnowledgeSection: vi.fn(), initializeKnowledgeTierDescriptions: vi.fn()
}));
vi.mock("./knowledgeMutationSync", async original => ({ ...await original<typeof import("./knowledgeMutationSync")>(),
  invalidateKnowledgeSectionMutation: vi.fn().mockResolvedValue(undefined)
}));

let version: number;
let aggregateVersion: number;
let descriptions: Record<string, string>;
const input = { mainLineId: "line", revisionId: "revision", modeTier: "signature" as const,
  overviewVersion: 1, enabled: true, hasPendingWork: false };
const result = (): KnowledgeTierDescriptionInitializationResult => ({ mainLineId: "line", revisionId: "revision",
  version, aggregateVersion, sourceTier: null, copiedTiers: [] });
const metadata = { createdById: "actor", updatedById: "actor", createdAt: "2026-11-18T00:00:00Z", updatedAt: "2026-11-18T00:00:00Z" };
const completeness = { percentage: 0, sections: [], blockers: [], warnings: [] };
const item = (id = "line"): KnowledgeItemDetail => ({ ...metadata, id, mainLineId: id, mainLineName: "Synthetic ceiling", status: "draft",
  basketId: "basket", basketName: "Ceiling", completionRequired: false, description: null, activeRevisionId: null, draftRevisionId: "revision",
  revisionNumber: 1, uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [], completeness, activeRevision: null,
  blockers: [], warnings: [], draftRevision: { ...metadata, id: "revision", mainLineId: id, status: "draft", revisionNumber: 1,
    sourceRevisionId: null, contentDigest: null, completeness, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null, version: 1 },
  version: aggregateVersion, allowedActions: ["update_section"] });
function setup(overrides: Partial<Parameters<typeof useKnowledgeTierDescriptionInitialization>[0]> = {}, strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{strict ? <StrictMode>{children}</StrictMode> : children}</QueryClientProvider>;
  return { client, ...renderHook(props => useKnowledgeTierDescriptionInitialization(props), { wrapper, initialProps: { ...input, ...overrides } }) };
}

beforeEach(() => {
  vi.clearAllMocks(); version = 3; aggregateVersion = 10; descriptions = { signature: "Existing Signature" };
  vi.mocked(api.getKnowledgeItem).mockImplementation(async id => item(id));
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey, options) => ({
    mainLineId, revisionId, sectionKey, version, applicability: "configured",
    ...(options?.modeTier ? { modeTier: options.modeTier } : {}),
    payload: descriptions[options?.modeTier ?? "signature"] ? { modeDescription: descriptions[options?.modeTier ?? "signature"] } : {}
  }) as KnowledgeSectionEnvelope);
  vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementation(async (mainLineId, revisionId) => ({ ...result(), mainLineId, revisionId }));
});

describe("live tier description initialization", () => {
  it("deduplicates Strict Mode and rapid tier switching, then publishes authoritative saved sibling data", async () => {
    let finish!: (value: KnowledgeTierDescriptionInitializationResult) => void;
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const hook = setup({}, true);
    expect(hook.result.current.pending).toBe(true);
    await waitFor(() => expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1));
    hook.client.setQueryData(knowledgeModeTierDataSource("functional").sectionKey("line", "revision", "advanced"), {
      mainLineId: "line", revisionId: "revision", sectionKey: "advanced", modeTier: "functional", version: 3, payload: {}
    });
    hook.rerender({ ...input, modeTier: "functional" });
    expect(hook.result.current.pending).toBe(true);
    descriptions.functional = "Existing Signature"; descriptions.premium = "Existing Signature";
    version++; aggregateVersion++;
    await act(async () => finish({ ...result(), sourceTier: "signature", copiedTiers: ["premium", "functional"] }));
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledExactlyOnceWith("line", "revision", { expectedVersion: 3, expectedAggregateVersion: 10 });
    expect(invalidateKnowledgeSectionMutation).toHaveBeenCalledExactlyOnceWith(hook.client, "line");
    expect(hook.client.getQueryData(knowledgeModeTierDataSource("functional").sectionKey("line", "revision", "advanced")))
      .toMatchObject({ version: 4, payload: { modeDescription: "Existing Signature" } });
    hook.client.clear();
  });

  it("preserves a pending default Mode read when a named initialization finishes after switching", async () => {
    let finishInitialization!: (value: KnowledgeTierDescriptionInitializationResult) => void;
    let finishDefaultRead!: (value: KnowledgeSectionEnvelope) => void;
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementationOnce(() => new Promise(resolve => { finishInitialization = resolve; }));
    const hook = setup();
    await waitFor(() => expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1));
    hook.rerender({ ...input, modeTier: "default" });
    const defaultSource = knowledgeModeTierDataSource("default");
    const observer = new QueryObserver(hook.client, {
      queryKey: defaultSource.sectionKey("line", "revision", "advanced"),
      queryFn: () => new Promise<KnowledgeSectionEnvelope>(resolve => { finishDefaultRead = resolve; })
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await act(async () => finishInitialization(result()));
    await waitFor(() => expect(hook.client.getQueryData(knowledgeModeTierDataSource("signature").sectionKey("line", "revision", "advanced")))
      .toMatchObject({ version: 3 }));
    expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
    const savedDefault: KnowledgeSectionEnvelope = { ...metadata, id: "advanced-section", mainLineId: "line", revisionId: "revision", sectionKey: "advanced",
      modeTier: "default", version: 3, applicability: "configured", payload: { modeDescription: "Independent default" } };
    await act(async () => finishDefaultRead(savedDefault));
    await waitFor(() => expect(observer.getCurrentResult().data).toEqual(savedDefault));
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1);
    unsubscribe();
    hook.client.clear();
  });

  it.each([{ enabled: false }, { modeTier: "default" as const }, { hasPendingWork: true }])("does not mutate excluded or dirty entries: %j", overrides => {
    const hook = setup(overrides);
    expect(hook.result.current.pending).toBe(false);
    expect(api.initializeKnowledgeTierDescriptions).not.toHaveBeenCalled();
    hook.client.clear();
  });

  it("does not loop after a no-op, and defers changed applicability until local work is safe", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1);
    hook.rerender({ ...input });
    hook.rerender({ ...input, overviewVersion: 2, hasPendingWork: true });
    expect(hook.result.current.pending).toBe(false);
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1);
    hook.rerender({ ...input, overviewVersion: 2 });
    await waitFor(() => expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(invalidateKnowledgeSectionMutation).not.toHaveBeenCalled();
    hook.client.clear();
  });

  it("refreshes and retries a conflict once, then requires an explicit retry after failure", async () => {
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementation(async () => {
      version++; aggregateVersion++;
      throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere");
    });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.error?.message).toBe("Changed elsewhere"));
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.initializeKnowledgeTierDescriptions).mock.calls[1]![2]).toEqual({ expectedVersion: 4, expectedAggregateVersion: 11 });
    hook.rerender({ ...input });
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(2);
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockResolvedValue(result());
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(hook.result.current.error).toBeUndefined();
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(3);
    hook.client.clear();
  });

  it("rejects a fresh read whose draft is no longer editable before sending a mutation", async () => {
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...item(), draftRevision: null, allowedActions: ["create_revision"] });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.error?.message).toMatch(/editable draft changed/));
    expect(api.initializeKnowledgeTierDescriptions).not.toHaveBeenCalled();
    hook.client.clear();
  });

  it("keeps editing gated after a committed initialization whose authoritative refresh fails", async () => {
    const read = vi.mocked(api.getKnowledgeSection).getMockImplementation()!;
    let reads = 0;
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (...args) => {
      if (++reads === 2) throw new Error("Saved descriptions could not refresh");
      return read(...args);
    });
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementationOnce(async () => {
      version++; aggregateVersion++; descriptions.functional = "Existing Signature";
      return { ...result(), sourceTier: "signature", copiedTiers: ["functional"] };
    });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.error?.message).toBe("Saved descriptions could not refresh"));
    expect(version).toBe(4);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(hook.result.current.error).toBeUndefined();
    expect(version).toBe(4);
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(2);
    expect(invalidateKnowledgeSectionMutation).toHaveBeenCalledTimes(1);
    hook.client.clear();
  });

  it("does not let an obsolete item's completion mark the current item's failed entry ready", async () => {
    let finish!: (value: KnowledgeTierDescriptionInitializationResult) => void;
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error("Other item unavailable"));
    const hook = setup();
    await waitFor(() => expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1));
    hook.rerender({ ...input, mainLineId: "other" });
    await waitFor(() => expect(hook.result.current.error?.message).toBe("Other item unavailable"));
    await act(async () => finish(result()));
    expect(hook.result.current.error?.message).toBe("Other item unavailable");
    hook.client.clear();
  });
});
