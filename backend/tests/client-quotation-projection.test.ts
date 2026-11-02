import { describe, expect, it, vi } from "vitest";
import { createClientQuotationProjectionService } from "../src/services/client-quotation-projection.service.js";
import { presentClientEstimateWithVisibility } from "../src/services/estimate-client-presentation.js";
import type { EstimateClientReviewSnapshot } from "../src/domain/estimate-client-review.js";
import { createEstimateProposal } from "../src/domain/estimate-proposal.js";

const line = (id: string, visible?: boolean) => ({
  id, source: "configuration" as const, catalogueId: id, mainLineId: id,
  roomId: "room-a", roomName: "Living room", specification: null,
  unit: "sqft", quantity: 2, rate: 125, ratePaise: 12_500, amount: 250, amountPaise: 25_000, included: true,
  mainBasketId: `basket-${id}`, subBasketId: `sub-${id}`, revisionId: `old-${id}`, uomId: "sqft",
  mainBasketName: `Basket ${id}`, subBasketName: `Sub ${id}`, mainLineName: `Item ${id}`, uomName: "Square feet",
  ...(visible === undefined ? {} : { clientVisible: visible })
});
const snapshot = (): EstimateClientReviewSnapshot => ({
  clientName: "Test Client", projectName: "Test project", location: "Test city", propertyType: "Apartment",
  lineItems: [line("shown", true), line("hidden", false), line("newly-hidden", true), line("historical")],
  selectedMainBasketIds: ["basket-shown", "basket-hidden", "basket-newly-hidden", "basket-historical"],
  subtotal: 1_000, gst: 180, total: 1_180, subtotalPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000
});
function service(options: { missing?: string; malformed?: unknown; revision?: string; visible?: boolean } = {}) {
  const current = ["shown", "hidden", "newly-hidden", "historical"].filter(id => id !== options.missing).map(id => ({
    mainLineId: id, revisionId: options.revision ?? `draft-${id}`, itemVersion: 4, revisionVersion: 7,
    clientVisible: id === "newly-hidden" ? options.visible ?? false : true
  }));
  const resolve = vi.fn(async () => new Map(current.map(row => [row.mainLineId, { line: row }])));
  const readOverviews = vi.fn(async () => current.map(row => ({ mainLineId: row.mainLineId, revisionId: row.revisionId,
    payload: row.mainLineId === "historical" ? {} : { clientVisible: row.mainLineId === "shown" && Object.hasOwn(options, "malformed") ? options.malformed : row.clientVisible } })));
  return { projection: createClientQuotationProjectionService({ resolve: resolve as never, readOverviews }), resolve, readOverviews };
}

describe("client quotation current visibility", () => {
  it("preserves frozen proposal terms and includes them in rendition cache identity", async () => {
    const proposal = createEstimateProposal({ issuedAt: new Date("2026-11-02T18:45:00Z"), estimateId: "estimate-one", projectNumber: "Lisno000001" });
    const original = { ...snapshot(), proposal };
    const first = await service().projection.project(original);
    const changed = { ...original, proposal: { ...proposal, terms: { ...proposal.terms, designWorkingDays: 34 } } };
    const second = await service().projection.project(changed);
    const legacy = await service().projection.project(snapshot());
    expect(first.snapshot.proposal).toEqual(proposal);
    expect(second.snapshot.proposal?.terms.designWorkingDays).toBe(34);
    expect(first.visibilityDigest).not.toBe(second.visibilityDigest);
    expect(first.visibilityDigest).not.toBe(legacy.visibilityDigest);
    expect(legacy.snapshot).not.toHaveProperty("proposal");
    expect(first.snapshot.lineItems.map(row => row.id)).toEqual(["shown", "historical"]);
    expect(first.snapshot.totalPaise).toBe(118_000);
  });
  it("rejects malformed explicit proposal metadata instead of silently using legacy defaults", async () => {
    await expect(service().projection.project({ ...snapshot(), proposal: { templateVersion: "unknown" } }))
      .rejects.toMatchObject({ code: "QUOTATION_SOURCE_UNAVAILABLE" });
  });
  it("intersects frozen and current visibility without repricing or modifying the approved source", async () => {
    const source = snapshot(); const before = structuredClone(source);
    const { projection } = service();
    const result = await projection.project(source);
    expect(result.snapshot.lineItems.map(row => row.id)).toEqual(["shown", "historical"]);
    expect(result.snapshot).toMatchObject({ totalPaise: 118_000, subtotalPaise: 100_000, gstPaise: 18_000,
      selectedMainBasketIds: ["basket-shown", "basket-historical"] });
    expect(JSON.stringify(result.snapshot)).not.toContain("newly-hidden");
    expect(JSON.stringify(result.snapshot)).not.toContain("basket-hidden");
    expect(source).toEqual(before);
  });
  it("does not fall back to a frozen visible line when the current source disappears", async () => {
    const result = await service({ missing: "shown" }).projection.project(snapshot());
    expect(result.snapshot.lineItems.map(row => row.id)).toEqual(["historical"]);
    expect(result.dependencies.find(row => row.mainLineId === "shown")).toMatchObject({ available: false, visible: false });
  });
  it.each([null, "false", 0, {}, []])("fails closed for malformed current visibility %j", async malformed => {
    await expect(service({ malformed }).projection.project(snapshot())).rejects.toMatchObject({ code: "QUOTATION_VISIBILITY_UNAVAILABLE" });
  });
  it("uses the current saved revision and invalidates its identity when visibility changes", async () => {
    const first = await service({ revision: "saved-draft" }).projection.project(snapshot());
    const second = await service({ revision: "saved-draft", visible: true }).projection.project(snapshot());
    expect(first.dependencies.every(row => row.revisionId === "saved-draft")).toBe(true);
    expect(first.visibilityDigest).not.toBe(second.visibilityDigest);
    expect(second.snapshot.totalPaise).toBe(first.snapshot.totalPaise);
  });
  it("preserves the true total when all displayed rows are hidden", async () => {
    const source = snapshot(); source.lineItems = source.lineItems.map(row => ({ ...row, clientVisible: false }));
    const result = await service().projection.project(source);
    expect(result.snapshot).toMatchObject({ lineItems: [], selectedMainBasketIds: [], totalPaise: 118_000 });
  });
  it("rejects inconsistent approved rupee and paise totals before producing a client copy", async () => {
    await expect(service().projection.project({ ...snapshot(), total: 1179 }))
      .rejects.toMatchObject({ code: "QUOTATION_SOURCE_UNAVAILABLE" });
  });
  it("does not expose hidden IDs through current/pre-approved review differences", async () => {
    const actor = { id: "client", name: "Client", email: "client@example.test", role: "client" as const };
    const source = snapshot();
    const pre = { _id: "pre", estimateId: "estimate", leadId: "lead", projectId: "project", estimateVersion: 2,
      status: "approved", decision: "approve", estimateSnapshot: source };
    const round = { ...pre, _id: "post", estimateVersion: 4, version: 1, sendGeneration: 2, status: "pending", decision: null,
      createdAt: new Date("2026-10-30T12:00:00Z"), recipientEmailNormalized: actor.email,
      estimateSnapshot: { ...source, lineItems: source.lineItems.map(row => row.id === "newly-hidden" ? { ...row, mainLineName: "Private changed name" } : row) } };
    const estimate = { _id: "estimate", leadId: "lead", projectId: "project", version: 4, status: "client_approved",
      estimation: { workflowVersion: 3, phase: "post", status: "sent_to_client", editClosedAt: null,
        preApproval: { reviewRoundId: "pre", estimateVersion: 2 }, pendingReviewRoundId: "post" } };
    const output = await presentClientEstimateWithVisibility(service().projection, actor, estimate,
      { _id: "lead", projectId: "project", clientEmail: actor.email }, round, { id: "project", clientId: actor.id }, pre);
    expect(output?.changesFromPre).toMatchObject({ changedLineIds: [], addedLineIds: [], removedLineIds: [] });
    expect(output?.publishedReview).toMatchObject({ workflowVersion: 3, canDecide: true });
    expect(JSON.stringify(output)).not.toContain("Private changed name");
    expect(JSON.stringify(output)).not.toContain("newly-hidden");
  });
});
