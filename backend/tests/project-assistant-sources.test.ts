import { describe, expect, it, vi } from "vitest";
import type { AssistantCatalogueCandidate, AssistantReadScope } from "../src/contracts/project-chat-assistant.js";
import type { ProjectStatusSummary } from "../src/contracts/project-status.js";
import type { ProjectChatRepository } from "../src/repositories/project-chat.js";
import { createAssistantReadSources, type AssistantSourceReaders } from "../src/services/project-assistant-sources.js";
import { scopeWitness, sourceWitness } from "../src/services/project-assistant-context.js";
import { createChatFixture, membershipSources, chatUser } from "./helpers/project-chat.js";

const scope: AssistantReadScope = { projectId: "a", clientId: "client-a", sessionVersion: 1 };
const candidate: AssistantCatalogueCandidate = { mainLineId: "line", mainBasketId: "basket", subBasketId: "sub", name: "Ceiling", basketName: "POP", subBasketName: "Ceiling", revisionId: "draft", revisionVersion: 1, itemVersion: 2, uom: { id: "uom", code: "sqft", name: "Square feet", decimalScale: 2 }, available: true };
function fixture() {
  const f = createChatFixture();
  let owner = "client-a";
  const wrapper: ProjectChatRepository = { kind: "memory", mutate: vi.fn(async () => { throw new Error("No writes allowed"); }),
    snapshot: operation => f.chatRepository.snapshot(tx => operation({ ...tx, sources: async id => {
      const source = await tx.sources(id); if (source && id === "a") source.project.clientId = owner; return source;
    } })) };
  let revision = 1;
  const status = (projectId = "a"): ProjectStatusSummary => ({ projectId, projectName: `Project ${projectId}`, projectStatus: projectId === "a" ? "active" : "paused", serverNow: f.clock().toISOString(), state: "active", currentStage: { key: "site_execution", label: "Site execution" }, pendingActions: [{ id: "task", stageKey: "site_execution", stageLabel: "Site execution", action: "Review reported work.", state: "pending", responsibleRole: "site_manager", people: [{ id: "site-a", name: "Site A", role: "site_manager" }], scheduledAt: null, deadlineAt: "2026-10-12T12:00:00.000Z", blocker: null }], issue: null });
  const readers: AssistantSourceReaders = {
    status: vi.fn(async context => status(context.sources.project.id)),
    execution: vi.fn(async context => { const facts = [{ id: "report", label: "Reported progress", value: "45% vendor reported, awaiting site verification", source: { id: context.sources.project.id, label: "Execution", href: null } }]; return { facts, freshness: [sourceWitness("assistant-execution", context.sources.project.id, facts)] }; }),
    approved: vi.fn(async context => { const data = { state: "approved" as const, totalPaise: context.sources.project.id === "a" ? 710000 : 390123,
      rooms: [{ id: context.sources.project.id === "a" ? "hall-a" : "room-b", name: "Hall" }], lines: [] };
      return { scope: data, freshness: [sourceWitness("assistant-approved", context.sources.project.id, data)] }; }),
    search: vi.fn(async () => [{ ...candidate, revisionVersion: revision }]),
    lines: vi.fn(async ids => {
      const data = { candidate: { ...candidate, revisionVersion: revision }, temporary: false, advanced: { subVendorMarginBps: 2500, modeCalculations: { sub_vendor: { baseRatePaise: 6500, lowQuantityLimit: "10", impactBps: 1000 } } } };
      return { lines: new Map(ids.includes("line") ? [["line", data]] : []), freshness: ids.map(id => sourceWitness("assistant-line", id, data)) };
    }),
    recommendations: vi.fn(async ids => ({ rules: [], freshness: [sourceWitness("assistant-recommendations", JSON.stringify([...ids].sort()), [])] }))
  };
  const service = (selected = scope) => createAssistantReadSources({ chatRepository: wrapper, scope: selected, clock: f.clock, readers });
  return { ...f, readers, wrapper, service, changeOwner: () => { owner = "client-b"; }, changeRevision: () => { revision++; } };
}

describe("captured Client assistant read boundary", () => {
  it("ignores only the technical site publication fence, preserving semantic project changes", () => {
    const context = { sources: membershipSources(), user: chatUser("client-a", "client") };
    const before = scopeWitness(context);
    Object.assign(context.sources.project, { siteCompletionFenceEpoch: 19 });
    expect(scopeWitness(context)).toEqual(before);
    context.sources.project.status = "paused";
    expect(scopeWitness(context)).not.toEqual(before);
    context.sources.project.status = "active";
    context.sources.project.completionAuthorityVersion = 7;
    expect(scopeWitness(context)).not.toEqual(before);
  });

  it("isolates asymmetric Client projects and rejects role/session/foreign scope before touching data ports", async () => {
    const f = fixture();
    for (const forbidden of [{ ...scope, clientId: "client-b" }, { ...scope, projectId: "b" }, { ...scope, clientId: "super" }, { ...scope, sessionVersion: 8 }]) {
      const service = f.service(forbidden);
      await expect(service.status()).rejects.toMatchObject({ status: 404 });
      await expect(service.searchCatalogue({ query: "Ceiling", limit: 8 })).rejects.toMatchObject({ status: 404 });
    }
    expect(f.readers.status).not.toHaveBeenCalled(); expect(f.readers.search).not.toHaveBeenCalled();
    expect((await f.service().status()).facts[0]!.value).toBe("active");
    expect((await f.service({ projectId: "b", clientId: "client-b", sessionVersion: 1 }).status()).facts[0]!.value).toBe("paused");
    expect(f.wrapper.mutate).not.toHaveBeenCalled();
  });
  it("revalidates before every tool and after a slow tool completes", async () => {
    const f = fixture();
    await f.service().status();
    f.readers.search = vi.fn(async () => { f.changeOwner(); return [candidate]; });
    await expect(f.service().searchCatalogue({ query: "Ceiling", limit: 8 })).rejects.toMatchObject({ status: 404 });
    await expect(f.service().execution()).rejects.toMatchObject({ status: 404 });
  });
  it("invalidates every method after Client deactivation", async () => {
    const f = fixture(); const sources = f.service();
    await f.repository.updateUser("client-a", 1, { active: false, updatedAt: f.clock().toISOString() });
    await expect(sources.status()).rejects.toMatchObject({ status: 404 });
    await expect(sources.preview({ lines: [] })).rejects.toMatchObject({ status: 404 });
    await expect(sources.recommendations({ mainLineIds: ["line"], roomId: null })).rejects.toMatchObject({ status: 404 });
    expect(await sources.revalidate([])).toBe(false);
  });
  it("captures scope instead of accepting later caller mutation and uses an existing transaction without nested snapshots", async () => {
    const f = fixture(); const input = { ...scope }; const sources = f.service(input); input.projectId = "b";
    expect((await sources.status()).facts[0]!.value).toBe("active");
    await f.wrapper.snapshot(async transaction => {
      const noNested = { ...f.wrapper, snapshot: vi.fn(async () => { throw new Error("Nested snapshot"); }) } as ProjectChatRepository;
      const service = createAssistantReadSources({ chatRepository: noNested, scope, transaction, readers: f.readers });
      const result = await service.status(); expect(result.facts[0]!.value).toBe("active");
      expect(await service.revalidate(result.freshness)).toBe(true); expect(noNested.snapshot).not.toHaveBeenCalled();
    });
  });
  it("withholds commercial values from the public tool view while retaining exact authorized snapshot", async () => {
    const f = fixture();
    const result = await f.service().preview({ lines: [{ mainLineId: "line", roomId: "hall-a", quantity: "11", pricingMode: null, optional: false, additiveConfirmed: true }] });
    expect(result.restricted.totalPaise).toBe(112493); expect(result.restricted.hypotheticalTotalPaise).toBe(822493);
    expect(result.public).toEqual({ state: "complete", missingInputs: [] });
    expect(JSON.stringify(result)).not.toMatch(/baseRatePaise|subVendorMarginBps|passwordHash|chat.test|7100000/);
    expect(f.wrapper.mutate).not.toHaveBeenCalled();
    await expect(f.service().recommendations({ mainLineIds: ["line"], roomId: "room-b" })).rejects.toMatchObject({ status: 400 });
  });
  it("detects stale line versions, candidate changes, changed project ownership and unknown witnesses", async () => {
    const f = fixture(); const service = f.service();
    const result = await service.preview({ lines: [{ mainLineId: "line", roomId: "hall-a", quantity: "11", pricingMode: null, optional: false, additiveConfirmed: true }] });
    expect(await service.revalidate(result.freshness)).toBe(true);
    const searchWitness = sourceWitness("assistant-candidate", "line", candidate);
    expect(await service.revalidate([searchWitness])).toBe(true);
    f.changeRevision();
    expect(await service.revalidate(result.freshness)).toBe(false); expect(await service.revalidate([searchWitness])).toBe(false);
    expect(await service.revalidate([sourceWitness("arbitrary-db-tool", "line", candidate)])).toBe(false);
    expect(await service.revalidate([sourceWitness("assistant-recommendations", "malformed-json", [])])).toBe(false);
    f.changeOwner(); expect(await service.revalidate([])).toBe(false);
  });
  it("freshness ignores read-time passage, but status remains explicit about action deadlines", async () => {
    const f = fixture(); const service = f.service(); const before = await service.status();
    f.advance(60000); expect(await service.revalidate(before.freshness)).toBe(true);
    expect(before.facts.some(fact => fact.value.includes("not a final project handover"))).toBe(true);
    expect(JSON.stringify(before.facts)).not.toMatch(/passwordHash|budget|amount|email/);
  });
});
