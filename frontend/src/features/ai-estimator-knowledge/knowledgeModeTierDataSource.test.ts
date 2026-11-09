import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./knowledgeApi";
import { liveKnowledgeEditorDataSource } from "./knowledgeEditorDataSource";
import { knowledgeModeTierDataSource } from "./knowledgeModeTierDataSource";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeSectionEnvelope, KnowledgeSectionMutationEnvelope } from "./knowledgeTypes";
import { KNOWLEDGE_MODE_CONFIGURATION_SCOPES } from "../../../../shared/knowledge/knowledgeModeTiers";

vi.mock("./knowledgeApi", async original => ({ ...await original<typeof import("./knowledgeApi")>(), getKnowledgeSection: vi.fn(), updateKnowledgeSection: vi.fn() }));
const section = { id: "advanced", mainLineId: "line", revisionId: "revision", sectionKey: "advanced", applicability: "configured",
  version: 3, payload: { pmcMarginBps: 1500 }, createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z", createdById: "admin", updatedById: "admin" } as KnowledgeSectionEnvelope;
beforeEach(() => vi.clearAllMocks());

describe("Mode tier data source", () => {
  it("inherits only an explicitly provided specification catalog capability", () => {
    expect(knowledgeModeTierDataSource("premium").specificationItemNames).toBe(liveKnowledgeEditorDataSource.specificationItemNames);
    const { specificationItemNames: _catalog, ...source } = liveKnowledgeEditorDataSource;
    const isolated = { ...source, scopeKey: "private-proposal" };
    expect(knowledgeModeTierDataSource("signature", isolated).specificationItemNames).toBeUndefined();
    expect(knowledgeModeTierDataSource("functional", isolated).specificationItemNames).toBeUndefined();
  });
  it("keeps Signature on the existing source and scopes independent tier caches", () => {
    expect(knowledgeModeTierDataSource("signature").scopeKey).toBe(liveKnowledgeEditorDataSource.scopeKey);
    expect(knowledgeModeTierDataSource("signature").sectionKey("line", "revision", "advanced")).toEqual(knowledgeQueryKeys.section("line", "revision", "advanced"));
    const premium = knowledgeModeTierDataSource("premium"); const functional = knowledgeModeTierDataSource("functional");
    expect(premium.scopeKey).not.toBe(functional.scopeKey);
    expect(premium.sectionKey("line", "revision", "advanced")).not.toEqual(functional.sectionKey("line", "revision", "advanced"));
    expect(premium.sectionKey("line", "revision", "overview")).toEqual(knowledgeQueryKeys.section("line", "revision", "overview"));
    expect(premium.supportsLiveConfigurationRequests).toBe(true);
  });

  it.each(["default", "premium", "functional"] as const)("reads and writes %s while leaving shared Overview reads unscoped", async tier => {
    const premium = knowledgeModeTierDataSource(tier);
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section, modeTier: tier, payload: {} });
    expect((await premium.getSection("line", "revision", "advanced")).payload).toEqual({});
    expect(api.getKnowledgeSection).toHaveBeenCalledWith("line", "revision", "advanced", { modeTier: tier });
    await premium.getSection("line", "revision", "overview");
    expect(api.getKnowledgeSection).toHaveBeenLastCalledWith("line", "revision", "overview");
    const input = { expectedVersion: 3, expectedAggregateVersion: 4, payload: { pmcMarginBps: 1200 } };
    vi.mocked(api.updateKnowledgeSection).mockResolvedValue({ ...section, modeTier: tier, version: 4, aggregateVersion: 5, payload: input.payload });
    await premium.updateSection("line", "revision", "advanced", input);
    expect(api.updateKnowledgeSection).toHaveBeenCalledExactlyOnceWith("line", "revision", "advanced", { ...input, modeTier: tier });
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

  it("keeps all four unequal scopes and two Main Lines isolated when default is committed", () => {
    const client = new QueryClient();
    for (const [lineIndex, id] of ["line", "other"].entries()) {
      KNOWLEDGE_MODE_CONFIGURATION_SCOPES.forEach((scope, index) => {
        const source = knowledgeModeTierDataSource(scope);
        client.setQueryData(source.sectionKey(id, "revision", "advanced"), {
          ...section, mainLineId: id, modeTier: scope, payload: { pmcMarginBps: 1000 * (index + 1) + lineIndex * 100 }
        });
      });
    }
    const saved = { ...section, modeTier: "default", payload: { pmcMarginBps: 5500 }, aggregateVersion: 6 } as KnowledgeSectionMutationEnvelope;
    knowledgeModeTierDataSource("default").commitSection(client, saved);
    for (const [lineIndex, id] of ["line", "other"].entries()) {
      KNOWLEDGE_MODE_CONFIGURATION_SCOPES.forEach((scope, index) => {
        expect(client.getQueryData(knowledgeModeTierDataSource(scope).sectionKey(id, "revision", "advanced")))
          .toMatchObject({ mainLineId: id, payload: { pmcMarginBps: id === "line" && scope === "default" ? 5500 : 1000 * (index + 1) + lineIndex * 100 } });
      });
    }
    client.clear();
  });

  it("verifies Signature identity and scope while retaining omitted-scope API compatibility", async () => {
    const signature = knowledgeModeTierDataSource("signature");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue(section);
    expect(await signature.getSection("line", "revision", "advanced")).toEqual(section);
    expect(api.getKnowledgeSection).toHaveBeenCalledWith("line", "revision", "advanced");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section, modeTier: "default" });
    await expect(signature.getSection("line", "revision", "advanced")).rejects.toThrow("could not be verified");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue({ ...section, mainLineId: "other" });
    await expect(signature.getSection("line", "revision", "advanced")).rejects.toThrow("could not be verified");
    vi.mocked(api.getKnowledgeSection).mockResolvedValue(section);
    await expect(knowledgeModeTierDataSource("default").getSection("line", "revision", "advanced")).rejects.toThrow("could not be verified");
  });

  it.each(KNOWLEDGE_MODE_CONFIGURATION_SCOPES)("keeps %s pricing reads and commits in their selected namespace", async scope => {
    const client = new QueryClient();
    for (const other of KNOWLEDGE_MODE_CONFIGURATION_SCOPES) {
      client.setQueryData(knowledgeModeTierDataSource(other).sectionKey("line", "revision", "pricing"), {
        ...section, sectionKey: "pricing", modeTier: other, payload: { brands: [{ id: other, name: `${other} brand` }] }
      });
    }
    const source = knowledgeModeTierDataSource(scope);
    const saved = { ...section, sectionKey: "pricing", modeTier: scope, payload: { brands: [{ id: scope, name: `${scope} changed` }] }, aggregateVersion: 6 } as KnowledgeSectionMutationEnvelope;
    vi.mocked(api.getKnowledgeSection).mockResolvedValue(saved);
    expect(await source.getSection("line", "revision", "pricing")).toEqual(saved);
    source.commitSection(client, saved);
    for (const other of KNOWLEDGE_MODE_CONFIGURATION_SCOPES) {
      expect(client.getQueryData(knowledgeModeTierDataSource(other).sectionKey("line", "revision", "pricing")))
        .toMatchObject({ payload: { brands: [{ id: other, name: `${other} ${other === scope ? "changed" : "brand"}` }] } });
    }
    client.clear();
  });
});
