import { afterEach, describe, expect, it, vi } from "vitest";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { projectPricingFromPublication, readAssistantProjectEstimate } from "../src/services/project-assistant-estimate.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createAssistantReadSources } from "../src/services/project-assistant-sources.js";
import { createChatFixture } from "./helpers/project-chat.js";
import { sourceWitness } from "../src/services/project-assistant-context.js";

const at = "2026-10-15T00:00:00.000Z";
const configuredLine = () => ({ id: "published-line", source: "configuration", itemType: "main_line", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", catalogueId: "ceiling", roomId: "room-a", roomName: "Hall", specification: null,
  mainBasketId: "pop", mainBasketName: "POP", subBasketId: "pop-sub", subBasketName: "Ceiling", mainLineId: "ceiling", mainLineName: "Published ceiling", revisionId: "old-approved-revision", uomId: "uom", uomName: "Square feet", unit: "sqft", quantity: 2, rate: 10, amount: 20, ratePaise: 1000, amountPaise: 2000, included: true });
const snapshot = () => ({ clientName: "Client A", projectName: "Project A", location: "Synthetic", propertyType: "villa", lineItems: [configuredLine()], subtotal: 20, gst: 3.6, total: 23.6, subtotalPaise: 2000, gstPaise: 360, totalPaise: 2360 });
const round = () => ({ _id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 3, version: 1, sendGeneration: 1, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedAt: at, createdAt: at, recipientEmailNormalized: "client-a@chat.test", estimateSnapshot: snapshot() });
const chain = (value: unknown) => { const query: any = { session: () => query, lean: () => query, limit: () => query, exec: async () => value }; return query; };
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const estimate: any = { _id: "estimate-a", leadId: "lead-a", projectId: "a", version: 4, status: "client_approved", clientDecisionAt: at, totalPaise: 99999999, lineItems: [{ private: "draft" }] };
  const rounds: any[] = [round()];
  const evidence: any = { projectId: "a", rounds: [{ id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 3, sendGeneration: 1, decidedAt: at, proofValid: false }], financeSource: null };
  const context: any = { user: { id: "client-a", name: "Client A", email: "client-a@chat.test", role: "client", active: true }, sources: { project: { id: "a", clientId: "client-a" }, estimates: [{ id: "estimate-a", projectId: "a", leadId: "lead-a", status: "client_approved" }], leads: [{ id: "lead-a", projectId: "a", clientEmail: "client-a@chat.test" }] } };
  const tx: any = { session: {}, app: { findProjectStatusEstimateEvidence: vi.fn(async () => evidence) } };
  vi.spyOn(EstimateModel, "findById").mockImplementation(() => chain(estimate));
  vi.spyOn(EstimateClientReviewRoundModel, "find").mockImplementation(() => chain(rounds));
  return { estimate, rounds, evidence, context, tx, read: (basis: "current" | "published" | "approved" = "current") => readAssistantProjectEstimate(context, { basis }, tx) };
}

describe("immutable customer estimate projection", () => {
  it("returns exact published selling amounts with no configuration metadata or working copy values", () => {
    const report = projectPricingFromPublication({ estimateId: "estimate-a", projectId: "a", round: round(), snapshot: snapshot(), approved: true });
    expect(report).toMatchObject({ totalPaise: 2360, subtotalPaise: 2000, gstPaise: 360, state: "approved", source: { href: null } });
    expect(report?.lines[0]).toEqual({ id: "published-line", label: "Published ceiling", quantity: "2", unit: "sqft", ratePaise: 1000, amountPaise: 2000 });
    expect(JSON.stringify(report)).not.toMatch(/mainLineId|margin|revisionId|clientName|rateSource/);
  });
  it("rejects missing, negative, unsafe and inconsistent paise instead of manufacturing zero", () => {
    for (const edit of [
      (s: any) => { s.totalPaise = 0; }, (s: any) => { s.totalPaise = Number.MAX_SAFE_INTEGER + 1; },
      (s: any) => { s.lineItems[0].amountPaise = null; }, (s: any) => { s.lineItems[0].amountPaise = -1; },
      (s: any) => { s.subtotalPaise = 2001; s.subtotal = 20.01; s.total = 23.61; s.totalPaise = 2361; }
    ]) { const s = snapshot(); edit(s); expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: false })).toBeNull(); }
  });
  it("converts legacy whole rupees explicitly and rejects fractional legacy totals", () => {
    const s: any = { lineItems: [{ id: "legacy", specification: "Published item", unit: "nos", quantity: 2, included: true, rate: 10, amount: 20 }], subtotal: 20, gst: 4, total: 24 };
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: false })?.totalPaise).toBe(2400);
    s.gst = 3.6; s.total = 23.6;
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: false })).toBeNull();
  });
  it("caps displayed lines while totals still reconcile all included source lines", () => {
    const s = snapshot(); s.lineItems = Array.from({ length: 101 }, (_, i) => ({ ...configuredLine(), id: `line-${i}` }));
    Object.assign(s, { subtotal: 2020, subtotalPaise: 202000, gst: 0, gstPaise: 0, total: 2020, totalPaise: 202000 });
    const report = projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true });
    expect(report).toMatchObject({ lineCount: 101, hasMoreLines: true, totalPaise: 202000 }); expect(report?.lines).toHaveLength(100);
  });
});

describe("published estimate read boundary", () => {
  it("reads approval lineage and immutable snapshot only", async () => {
    const f = fixture(); const result = await f.read();
    expect(result.report).toMatchObject({ totalPaise: 2360, state: "approved", estimateVersion: 3 });
    expect(JSON.stringify(result)).not.toContain("99999999"); expect(result.freshness[0]?.kind).toBe("assistant-project-estimate");
    f.rounds[0].estimateSnapshot.totalPaise = 999;
    expect((await f.read()).report).toBeNull();
  });
  it("uses the pinned pre-approval while a later unpublished working copy changes", async () => {
    const f = fixture(); f.estimate.version = 9; f.estimate.estimation = { ...newEstimationLifecycle(), phase: "post", status: "draft", preApproval: { reviewRoundId: "review-a", estimateVersion: 3, approvedAt: at } };
    f.context.sources.project.estimationWorkflowVersion = 2;
    expect((await f.read()).report).toMatchObject({ totalPaise: 2360, reviewRoundId: "review-a", state: "approved" });
    f.estimate.estimation.preApproval.estimateVersion = 2;
    expect((await f.read()).report).toBeNull();
  });
  it("selects only the latest valid published round for unapproved estimates", async () => {
    const f = fixture(); f.estimate.status = "sent_to_client"; f.estimate.version = 4;
    f.rounds.push({ ...round(), _id: "latest", estimateVersion: 4, sendGeneration: 2, status: "pending", decision: null, decidedAt: null, decidedById: null });
    expect((await f.read("published")).report).toMatchObject({ state: "published", reviewRoundId: "latest", estimateVersion: 4 });
    f.rounds.push({ ...f.rounds[1], _id: "duplicate-generation" });
    expect((await f.read("published")).unavailableReason).toBe("source_conflict");
  });
  it.each(["recipient", "project", "actor", "proof", "source", "finance", "ambiguous"])("rejects conflicting %s evidence", async failure => {
    const f = fixture();
    if (failure === "recipient") f.rounds[0].recipientEmailNormalized = "another@chat.test";
    if (failure === "project") f.rounds[0].projectId = "other";
    if (failure === "actor") f.rounds[0].decidedById = "other-client";
    if (failure === "proof") f.rounds[0].decisionSource = "admin_proof";
    if (failure === "source") f.rounds[0].decisionSource = "unsupported";
    if (failure === "finance") f.evidence.financeSource = { estimateId: "other", estimateVersion: 3, reviewRoundId: "review-a" };
    if (failure === "ambiguous") f.context.sources.estimates.push({ id: "other", projectId: "a", leadId: "lead-a" });
    expect((await f.read()).report).toBeNull();
  });
  it("rechecks scoped authorization and exact witness changes through the typed reader port", async () => {
    const f = createChatFixture(); let amount = 100; const read = vi.fn(async () => ({ report: null, unavailableReason: "not_published" as const, freshness: [sourceWitness("assistant-project-estimate", "a:current", amount)] }));
    const service = createAssistantReadSources({ chatRepository: f.chatRepository, scope: { projectId: "a", clientId: "client-a", sessionVersion: 1 }, readers: { projectEstimate: read } });
    const before = await service.projectEstimate!({ basis: "current" }); expect(await service.revalidate(before.freshness)).toBe(true);
    amount = 200; expect(await service.revalidate(before.freshness)).toBe(false);
    await f.repository.updateUser("client-a", 1, { active: false, updatedAt: f.clock().toISOString() });
    await expect(service.projectEstimate!({ basis: "current" })).rejects.toMatchObject({ status: 404 });
  });
});
