import { assistantProjectPricingSchema } from "../src/contracts/assistant-project-pricing.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import * as catalogue from "../src/services/estimator-catalogue.service.js";
import { projectPricingFromPublication, readAssistantProjectEstimate } from "../src/services/project-assistant-estimate.js";
import { newEstimationLifecycle, newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createAssistantReadSources } from "../src/services/project-assistant-sources.js";
import { createChatFixture } from "./helpers/project-chat.js";
import { sourceWitness } from "../src/services/project-assistant-context.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";

const at = "2026-10-15T00:00:00.000Z";
const configuredLine = () => ({ id: "published-line", source: "configuration", itemType: "main_line", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", catalogueId: "ceiling", roomId: "room-a", roomName: "Hall", specification: null,
  mainBasketId: "pop", mainBasketName: "POP", subBasketId: "pop-sub", subBasketName: "Ceiling", mainLineId: "ceiling", mainLineName: "Published ceiling", revisionId: "old-approved-revision", uomId: "uom", uomName: "Square feet", unit: "sqft", quantity: 2, rate: 10, amount: 20, ratePaise: 1000, amountPaise: 2000, included: true });
const snapshot = () => ({ clientName: "Client A", projectName: "Project A", location: "Synthetic", propertyType: "villa", lineItems: [configuredLine()], subtotal: 20, gst: 3.6, total: 23.6, subtotalPaise: 2000, gstPaise: 360, totalPaise: 2360 });
const round = () => ({ _id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 3, version: 1, sendGeneration: 1, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedAt: at, createdAt: at, recipientEmailNormalized: "client-a@chat.test", estimateSnapshot: snapshot() });
const chain = (value: unknown) => { const query: any = { select: () => query, session: () => query, lean: () => query, limit: () => query,
  exec: async () => value, then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) }; return query; };
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const estimate: any = { _id: "estimate-a", leadId: "lead-a", projectId: "a", version: 4, status: "client_approved", clientDecisionAt: at, totalPaise: 99999999, lineItems: [{ private: "draft" }] };
  const rounds: any[] = [round()];
  const evidence: any = { projectId: "a", rounds: [{ id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 3, sendGeneration: 1, decidedAt: at, proofValid: false }], financeSource: null };
  const context: any = { user: { id: "client-a", name: "Client A", email: "client-a@chat.test", role: "client", active: true }, sources: { project: { id: "a", clientId: "client-a" }, estimates: [{ id: "estimate-a", projectId: "a", leadId: "lead-a", status: "client_approved" }], leads: [{ id: "lead-a", projectId: "a", clientEmail: "client-a@chat.test" }] } };
  const tx: any = { session: {}, app: { findProjectStatusEstimateEvidence: vi.fn(async () => evidence) } };
  vi.spyOn(EstimateModel, "findById").mockImplementation(() => chain(estimate));
  vi.spyOn(EstimateClientReviewRoundModel, "find").mockImplementation(() => chain(rounds));
  const currentLine = { mainLineId: "ceiling", revisionId: "current-saved-revision", itemVersion: 3, revisionVersion: 5, clientVisible: true };
  vi.spyOn(catalogue, "resolveEstimatorCatalogueLines").mockImplementation(async () => new Map([["ceiling", { line: currentLine }]]) as never);
  vi.spyOn(AiEstimatorKnowledgeSectionModel, "find").mockImplementation(() => chain([
    { mainLineId: currentLine.mainLineId, revisionId: currentLine.revisionId, payload: { clientVisible: currentLine.clientVisible } }
  ]));
  return { estimate, rounds, evidence, context, tx, currentLine, read: (basis: "current" | "published" | "approved" = "current") => readAssistantProjectEstimate(context, { basis }, tx) };
}

describe("immutable customer estimate projection", () => {
  it.each([[360, 2_400, 40], [350, 2_300, -50], [300, 2_300, 0]])(
    "preserves validated published final rounding and rejects altered evidence (%i GST)", (gstPaise, totalPaise, roundOffPaise) => {
      const saved = { ...snapshot(), gst: gstPaise / 100, gstPaise, total: totalPaise / 100, totalPaise, roundOffPaise };
      const input = { estimateId: "estimate-a", projectId: "a", round: round(), snapshot: saved, approved: true };
      const report = projectPricingFromPublication(input)!;
      expect(report).toMatchObject({ subtotalPaise: 2_000, gstPaise, totalPaise, roundOffPaise });
      expect(report.lines[0]).toMatchObject({ ratePaise: 1_000, amountPaise: 2_000 });
      expect(assistantProjectPricingSchema.safeParse(report).success).toBe(true);
      expect(assistantProjectPricingSchema.safeParse({ ...report, roundOffPaise: roundOffPaise + 1 }).success).toBe(false);
      expect(projectPricingFromPublication({ ...input, snapshot: { ...saved, roundOffPaise: roundOffPaise + 1 } })).toBeNull();
      if (roundOffPaise) {
        expect(projectPricingFromPublication({ ...input, snapshot: { ...saved, roundOffPaise: undefined } })).toBeNull();
        expect(assistantProjectPricingSchema.safeParse({ ...report, roundOffPaise: undefined }).success).toBe(false);
      }
      const legacy = projectPricingFromPublication({ ...input, snapshot: snapshot() })!;
      expect(legacy.totalPaise).toBe(2_360);
      expect(legacy).not.toHaveProperty("roundOffPaise");
      expect(assistantProjectPricingSchema.safeParse(legacy).success).toBe(true);
    });

  it("reads a rounded approved estimate through its finance lineage", async () => {
    const f = fixture();
    Object.assign(f.rounds[0].estimateSnapshot, { total: 24, totalPaise: 2_400, roundOffPaise: 40 });
    const result = await f.read();
    expect(result.unavailableReason).toBeNull();
    expect(result.report).toMatchObject({ subtotalPaise: 2_000, gstPaise: 360, totalPaise: 2_400, roundOffPaise: 40 });
  });

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
  it("validates every quoted amount but emits only visible lines and visible pagination counts", () => {
    const s: any = snapshot();
    s.lineItems = [
      { ...configuredLine(), id: "hidden-line", mainLineName: "Hidden name", clientVisible: false },
      { ...configuredLine(), id: "visible-default" }, { ...configuredLine(), id: "visible-yes", clientVisible: true }
    ];
    Object.assign(s, { subtotal: 60, subtotalPaise: 6000, gst: 0, gstPaise: 0, total: 60, totalPaise: 6000 });
    const original = structuredClone(s);
    const report = projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true });
    expect(report).toMatchObject({ lineCount: 2, hasMoreLines: false, totalPaise: 6000 });
    expect(report?.lines.map(line => line.id)).toEqual(["visible-default", "visible-yes"]);
    expect(JSON.stringify(report)).not.toMatch(/Hidden name|hidden-line|clientVisible/);
    expect(s).toEqual(original);
    s.lineItems[0].amount = 19; s.lineItems[0].amountPaise = 1900;
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true })).toBeNull();
  });
  it("returns the complete verified total when every included line is hidden", () => {
    const s = { ...snapshot(), lineItems: [{ ...configuredLine(), clientVisible: false }] };
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true }))
      .toMatchObject({ lines: [], lineCount: 0, hasMoreLines: false, subtotalPaise: 2000, gstPaise: 360, totalPaise: 2360 });
  });
  it("applies current visibility before pagination while reconciling every approved amount", () => {
    const s = snapshot();
    s.lineItems = Array.from({ length: 102 }, (_, index) => ({ ...configuredLine(), id: `line-${index}`, mainLineId: index === 101 ? "shown" : "hidden" }));
    Object.assign(s, { subtotal: 2040, subtotalPaise: 204000, gst: 0, gstPaise: 0, total: 2040, totalPaise: 204000 });
    const report = projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true, visibleMainLineIds: new Set(["shown"]) });
    expect(report).toMatchObject({ lineCount: 1, hasMoreLines: false, totalPaise: 204000 });
    expect(report?.lines.map(line => line.id)).toEqual(["line-101"]);
    s.lineItems[0].amountPaise = 1900;
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true, visibleMainLineIds: new Set(["shown"]) })).toBeNull();
  });
  it.each(["false", 0, null, {}])("rejects malformed frozen visibility instead of showing a row: %j", clientVisible => {
    const s = { ...snapshot(), lineItems: [{ ...configuredLine(), clientVisible }] };
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: false })).toBeNull();
  });
  it("does not let hidden rows consume the visible line limit or bypass identity checks", () => {
    const s: any = snapshot();
    s.lineItems = Array.from({ length: 102 }, (_, index) => ({ ...configuredLine(), id: `line-${index}`, clientVisible: index > 0 }));
    Object.assign(s, { subtotal: 2040, subtotalPaise: 204000, gst: 0, gstPaise: 0, total: 2040, totalPaise: 204000 });
    const report = projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true });
    expect(report).toMatchObject({ lineCount: 101, hasMoreLines: true, totalPaise: 204000 });
    expect(report?.lines).toHaveLength(100); expect(report?.lines[0].id).toBe("line-1");
    s.lineItems[101].id = "line-0";
    expect(projectPricingFromPublication({ estimateId: "e", projectId: "a", round: round(), snapshot: s, approved: true })).toBeNull();
  });
});

describe("published estimate read boundary", () => {
  it("hides a currently restricted line while preserving its immutable approved total and source", async () => {
    const f = fixture();
    const original = structuredClone(f.rounds[0].estimateSnapshot);
    f.currentLine.clientVisible = false;

    const result = await f.read();

    expect(result.report).toMatchObject({ lines: [], lineCount: 0, totalPaise: 2360, state: "approved" });
    expect(JSON.stringify(result)).not.toContain("Published ceiling");
    expect(f.rounds[0].estimateSnapshot).toEqual(original);
    expect(catalogue.resolveEstimatorCatalogueLines).toHaveBeenCalledWith(["ceiling"], f.tx.session);
  });
  it("changes the freshness witness when Configuration hides a previously visible approved line", async () => {
    const f = fixture();
    const before = await f.read();
    f.currentLine.clientVisible = false;
    const after = await f.read();
    expect(before.report?.lines).toHaveLength(1);
    expect(after.report?.lines).toHaveLength(0);
    expect(after.report?.totalPaise).toBe(before.report?.totalPaise);
    expect(after.freshness).not.toEqual(before.freshness);
  });

  it("reconciles an authorized full round before returning an all-hidden screen projection", async () => {
    const f = fixture(); f.rounds[0].estimateSnapshot.lineItems[0].clientVisible = false;
    const result = await f.read();
    expect(result).toMatchObject({ unavailableReason: null, report: { lines: [], lineCount: 0, hasMoreLines: false, totalPaise: 2360, state: "approved" } });
    expect(JSON.stringify(result)).not.toContain("Published ceiling");
    expect(f.rounds[0].estimateSnapshot.lineItems).toHaveLength(1);
    f.rounds[0].estimateSnapshot.lineItems[0].amount = 19;
    f.rounds[0].estimateSnapshot.lineItems[0].amountPaise = 1900;
    expect((await f.read()).report).toBeNull();
  });
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
  it("fails the workflow-v3 current basis closed after an unapproved saved revision", async () => {
    const f = fixture();
    const sourceDigest = quotationSnapshotDigest(f.rounds[0].estimateSnapshot);
    Object.assign(f.rounds[0], { workflowVersion: 3, phase: "pre", requirementsVersion: 0, pricedRevision: 1,
      designScopeRevision: 1, sourceDigest, submittedById: "sales-a",
      salesApproval: { actorId: "sales-a", estimateVersion: 3, pricedRevision: 1, sourceDigest, approvedAt: at } });
    f.estimate.estimation = { ...newQuotationLifecycle(), phase: "post", status: "draft", pricedRevision: 2,
      designScopeRevision: 1, preApproval: { reviewRoundId: "review-a", estimateVersion: 3, approvedAt: at } };
    vi.spyOn(ProjectModel, "findById").mockImplementation(() => chain({ clientId: "client-a", primaryDesignerId: "designer-a" }));

    await expect(f.read("current")).resolves.toMatchObject({ report: null, unavailableReason: "source_conflict" });
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


it("does not report a forged dimension-owned frozen quantity", () => {
  const frozen = snapshot();
  Object.assign(frozen.lineItems[0]!, { dimensionsMandatory: true, dimensions: { length: "2", width: "1", height: "9" },
    dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "uom", decimalScale: 2 }, uomDecimalScale: 2 });
  const input = { estimateId: "estimate-a", projectId: "a", round: round(), snapshot: frozen, approved: true };
  expect(projectPricingFromPublication(input)?.lines[0]?.quantity).toBe("2");
  frozen.lineItems[0]!.quantity = 18;
  expect(projectPricingFromPublication(input)).toBeNull();
});
