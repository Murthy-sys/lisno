import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./knowledgeApi";
import { liveKnowledgeEditorDataSource } from "./knowledgeEditorDataSource";
import { knowledgeModeTierDataSource } from "./knowledgeModeTierDataSource";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeSectionEnvelope, KnowledgeSectionMutationEnvelope } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async original => ({ ...await original<typeof import("./knowledgeApi")>(), getKnowledgeSection: vi.fn(), updateKnowledgeSection: vi.fn() }));
const section = { id: "advanced", mainLineId: "line", revisionId: "revision", sectionKey: "advanced", applicability: "configured",
  version: 3, payload: { pmcMarginBps: 1500 }, createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z", createdById: "admin", updatedById: "admin" } as KnowledgeSectionEnvelope;
beforeEach(() => vi.clearAllMocks());

describe("Mode tier data source", () => {
  it("keeps Signature on the existing source and scopes independent tier caches", () => {
    expect(knowledgeModeTierDataSource("signature")).toBe(liveKnowledgeEditorDataSource);
    const premium = knowledgeModeTierDataSource("premium"); const functional = knowledgeModeTierDataSource("functional");
    expect(premium.scopeKey).not.toBe(functional.scopeKey);
    expect(premium.sectionKey("line", "revision", "advanced")).not.toEqual(functional.sectionKey("line", "revision", "advanced"));
    expect(premium.sectionKey("line", "revision", "overview")).toEqual(knowledgeQueryKeys.section("line", "revision", "overview"));
    expect(premium.supportsLiveConfigurationRequests).toBe(true);
  });

  it("reads and writes the selected tier while leaving shared Overview reads unscoped", async () => {
    const premium = knowledgeModeTierDataSource("premium");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section, modeTier: "premium", payload: {} });
    expect((await premium.getSection("line", "revision", "advanced")).payload).toEqual({});
    expect(api.getKnowledgeSection).toHaveBeenCalledWith("line", "revision", "advanced", { modeTier: "premium" });
    await premium.getSection("line", "revision", "overview");
    expect(api.getKnowledgeSection).toHaveBeenLastCalledWith("line", "revision", "overview");
    const input = { expectedVersion: 3, expectedAggregateVersion: 4, payload: { pmcMarginBps: 1200 } };
    vi.mocked(api.updateKnowledgeSection).mockResolvedValue({ ...section, modeTier: "premium", version: 4, aggregateVersion: 5, payload: input.payload });
    await premium.updateSection("line", "revision", "advanced", input);
    expect(api.updateKnowledgeSection).toHaveBeenCalledExactlyOnceWith("line", "revision", "advanced", { ...input, modeTier: "premium" });
  });

  it("commits Premium without putting its payload in Signature or Functional caches", () => {
    const client = new QueryClient(); const premium = knowledgeModeTierDataSource("premium"); const functional = knowledgeModeTierDataSource("functional");
    const baseKey = knowledgeQueryKeys.section("line", "revision", "advanced");
    client.setQueryData(baseKey, section);
    client.setQueryData(functional.sectionKey("line", "revision", "advanced"), { ...section, modeTier: "functional", payload: { pmcMarginBps: 900 } });
    client.setQueryData(knowledgeQueryKeys.item("line"), { version: 4 });
    const saved = { ...section, modeTier: "premium", payload: { pmcMarginBps: 1200 }, aggregateVersion: 5 } as KnowledgeSectionMutationEnvelope;
    premium.commitSection(client, saved);
    expect(client.getQueryData(premium.sectionKey("line", "revision", "advanced"))).toEqual(saved);
    expect(client.getQueryData(baseKey)).toEqual(section);
    expect(client.getQueryData(functional.sectionKey("line", "revision", "advanced"))).toMatchObject({ payload: { pmcMarginBps: 900 } });
    expect(client.getQueryData(knowledgeQueryKeys.item("line"))).toEqual({ version: 5 });
    client.clear();
  });

  it.each([undefined, "functional"] as const)("rejects a mismatched tier response (%s)", async modeTier => {
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section, ...(modeTier ? { modeTier } : {}) });
    await expect(knowledgeModeTierDataSource("premium").getSection("line", "revision", "advanced")).rejects.toThrow("could not be verified");
  });
});
