import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserModel } from "../src/models/User.js";
import { ProjectModel } from "../src/models/Project.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectVendorSuggestionModel } from "../src/models/ProjectVendorSuggestion.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { createPMEstimateReadService, pmEstimateLines } from "../src/services/project-manager/estimates.js";
import { approvedProcurementSnapshotFromRows } from "../src/services/procurement.service.js";
import { readPMApprovedSource, requirePMMainLineScope } from "../src/services/project-manager/approved-source.js";
import { migrateVendorSuggestionScopeIndexes } from "../src/migrations/project-vendor-suggestion-scope.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedPMEstimateHandoffFixture, handoffAt } from "./helpers/pm-estimate-handoff.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let fixture: Awaited<ReturnType<typeof seedPMEstimateHandoffFixture>>;
const service = createPMEstimateReadService({ now: () => handoffAt });
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-estimate-reads");
  await ProjectVendorSuggestionModel.createCollection();
  await migrateVendorSuggestionScopeIndexes(mongoose.connection.db!.collection("projectVendorSuggestions"), {
    mode: "apply", writesQuiesced: true, backupIndexMetadata: async () => {} });
}, 120000);
beforeEach(async () => { await replica.clear(); fixture = await seedPMEstimateHandoffFixture(); });
afterAll(async () => replica?.stop());

describe("PM approved estimate reads", () => {
  it("uses immutable approved amounts and groups repeated Main Line room occurrences", async () => {
    approvedProcurementSnapshotFromRows((await EstimateModel.findById(fixture.estimateId).lean())!,
      await EstimateClientReviewRoundModel.find({ estimateId: fixture.estimateId }).lean());
    const view = await service.estimate(fixture.pm, fixture.projectId);
    expect(view.availability).toBe("available");
    expect(view.source).toMatchObject({ estimateId: fixture.estimateId, estimateVersion: 1,
      estimateReviewRoundId: fixture.roundId, phase: "legacy", designPlanVersion: 1 });
    expect(view.totals).toEqual({ subtotalPaise: 215000, gstPaise: 38700, totalPaise: 253700 });
    expect(view.approvedAt).toBe(handoffAt.toISOString());
    expect(view.writeAvailability.available).toBe(true);
    expect(view.mainLines).toHaveLength(3);
    expect(view.mainLines[0]).toMatchObject({ mainLineName: "Current Main Line 1", canSuggest: true,
      occurrences: [{ sourceLineItemKey: "scope-1" }, { sourceLineItemKey: "scope-2" }] });
    expect(view.lines[0]).toMatchObject({ mainLineName: "Approved Main Line 1", quantity: 2, ratePaise: 10000, amountPaise: 20000 });
    expect(view.lines.at(-1)).toMatchObject({ included: false, amountPaise: 0 });
    await EstimateModel.collection.updateOne({ _id: fixture.estimateId }, { $set: { subtotal: 999999,
      "lineItems.0.ratePaise": 999999, "lineItems.0.quantity": 99 } });
    expect((await service.estimate(fixture.pm, fixture.projectId)).totals).toEqual(view.totals);
    const other = await service.estimate(fixture.otherPM, fixture.otherProjectId);
    expect(other.totals.subtotalPaise).toBe(645000);
    expect(JSON.stringify(view)).not.toMatch(/componentPricing|passwordHash|recipientEmail|pdfStorageReference|internalCost|margin/);
  });

  it("does not fall back from a broken latest saved draft to an old active Main Line", async () => {
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: "main-line-1" }, { $set: { draftRevisionId: "new-draft", version: 2 } });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "new-draft", mainLineId: "main-line-1", status: "draft", version: 1,
      completeness: { sections: [{ sectionKey: "overview", state: "complete" }, { sectionKey: "advanced", state: "complete" }] } } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: "draft-overview", mainLineId: "main-line-1", revisionId: "new-draft",
      sectionKey: "overview", applicability: "configured", payload: { uomId: "missing-uom" } } as never);
    const view = await service.estimate(fixture.pm, fixture.projectId);
    expect(view.lines[0]?.amountPaise).toBe(20000);
    expect(view.mainLines.find(item => item.mainLineId === "main-line-1")).toMatchObject({ canSuggest: false,
      unavailableReason: expect.stringContaining("Configuration") });
    await expect(service.candidates(fixture.pm, fixture.projectId, { expectedSource: view.source!, mainLineId: "main-line-1", limit: 20, offset: 0 }))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
  });

  it("includes approved temporary items with their frozen type and vendor candidates", async () => {
    await replica.clear();
    fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
    const view = await service.estimate(fixture.pm, fixture.projectId);
    expect(view.lines.slice(0, 2)).toMatchObject([
      { itemType: "temporary", mainLineId: "main-line-1", ratePaise: 10000, amountPaise: 20000 },
      { itemType: "temporary", mainLineId: "main-line-1", ratePaise: 10000, amountPaise: 30000 }
    ]);
    expect(view.mainLines.find(line => line.mainLineId === "main-line-1")).toMatchObject({ itemType: "temporary",
      canSuggest: true, occurrences: [{ sourceLineItemKey: "scope-1" }, { sourceLineItemKey: "scope-2" }] });
    const candidates = await service.candidates(fixture.pm, fixture.projectId, {
      expectedSource: view.source!, mainLineId: "main-line-1", limit: 20, offset: 0 });
    expect(candidates.mainLine.itemType).toBe("temporary");
    expect(candidates.items).toHaveLength(2);
    expect(candidates.items.every(vendor => vendor.canSuggest && vendor.bidEligible)).toBe(true);
    expect(view.totals).toEqual({ subtotalPaise: 215000, gstPaise: 38700, totalPaise: 253700 });
  });

  it("keeps regular scope digests stable for historical Configuration rows without an explicit type", async () => {
    const before = await service.estimate(fixture.pm, fixture.projectId);
    const scope = before.mainLines.find(line => line.mainLineId === "main-line-1")!;
    expect(scope.scopeDigest).toBe(createHash("sha256").update(JSON.stringify({ source: before.source,
      mainLineId: scope.mainLineId, mainBasketId: scope.mainBasketId, occurrences: scope.occurrences })).digest("hex"));
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: fixture.roundId }, { $unset: {
      "estimateSnapshot.lineItems.0.itemType": "", "estimateSnapshot.lineItems.1.itemType": "" } });
    const after = await service.estimate(fixture.pm, fixture.projectId);
    expect(after.mainLines.find(line => line.mainLineId === "main-line-1")).toMatchObject({
      itemType: "main_line", canSuggest: true, scopeDigest: scope.scopeDigest });
    expect(after.lines[0]).not.toHaveProperty("itemType");
  });

  it("refuses ambiguous item types across approved occurrences of the same stable item", async () => {
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: fixture.roundId }, { $set: {
      "estimateSnapshot.lineItems.1.itemType": "temporary" } });
    const view = await service.estimate(fixture.pm, fixture.projectId);
    expect(view.mainLines.find(line => line.mainLineId === "main-line-1")).toMatchObject({
      canSuggest: false, unavailableReason: expect.stringContaining("conflicting item types") });
    await expect(service.candidates(fixture.pm, fixture.projectId, {
      expectedSource: view.source!, mainLineId: "main-line-1", limit: 20, offset: 0 }))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
  });

  it("labels approved pre-estimates without a Design approval and prefers a later immutable final approval", async () => {
    const lifecycle = { ...newEstimationLifecycle(), phase: "post", status: "draft",
      preApproval: { reviewRoundId: fixture.roundId, estimateVersion: 1, approvedAt: handoffAt.toISOString() } };
    await ProjectModel.collection.updateOne({ _id: fixture.projectId }, { $set: { estimationWorkflowVersion: 2, estimateRequirementsVersion: 0 } });
    await EstimateModel.collection.updateOne({ _id: fixture.estimateId }, { $set: { estimation: lifecycle,
      designPlanStatus: "pending", designPlanVersion: 0, designPlanApprovedAt: null, designPlanApprovedById: null } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: fixture.roundId }, { $set: { phase: "pre" } });
    const pre = await service.estimate(fixture.pm, fixture.projectId);
    expect(pre.source).toMatchObject({ phase: "pre", designPlanVersion: 0, estimateReviewRoundId: fixture.roundId,
      sourceSnapshotId: fixture.roundId, sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const saved = await EstimateClientReviewRoundModel.findById(fixture.roundId).lean();
    await EstimateClientReviewRoundModel.collection.insertOne({ ...saved, _id: "final-handoff", estimateVersion: 2,
      phase: "post", dedupeKey: "f".repeat(64) } as never);
    await EstimateModel.collection.updateOne({ _id: fixture.estimateId }, { $set: { version: 3,
      "estimation.finalApproval": { reviewRoundId: "final-handoff", estimateVersion: 2, approvedAt: handoffAt.toISOString() },
      designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: handoffAt, designPlanApprovedById: fixture.admin.id } });
    const final = await service.estimate(fixture.pm, fixture.projectId);
    expect(final.source).toMatchObject({ phase: "post", estimateVersion: 2, estimateReviewRoundId: "final-handoff", sourceSnapshotId: "final-handoff" });
    expect(final.totals).toEqual(pre.totals);
  });

  it("keeps missing and ambiguous approval explicit and rechecks active assignment and role", async () => {
    for (const actor of [fixture.otherPM, fixture.buyer, fixture.admin]) {
      await expect(service.estimate(actor, fixture.projectId)).rejects.toMatchObject({ status: 404 });
    }
    await UserModel.updateOne({ _id: fixture.pm.id }, { $set: { active: false } });
    await expect(service.estimate(fixture.pm, fixture.projectId)).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: fixture.pm.id }, { $set: { active: true } });
    await EstimateClientReviewRoundModel.deleteMany({ estimateId: fixture.estimateId });
    const unavailable = await service.estimate(fixture.pm, fixture.projectId);
    expect(unavailable).toMatchObject({ availability: "unavailable", source: null, lines: [],
      totals: { subtotalPaise: null, gstPaise: null, totalPaise: null }, writeAvailability: { available: false } });
    await EstimateModel.collection.insertOne({ _id: "ambiguous", projectId: fixture.projectId } as never);
    expect((await service.estimate(fixture.pm, fixture.projectId)).reason).toContain("ambiguous");
  });

  it("keeps approved units unchanged and disables incompatible current UOM code or precision", async () => {
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "uom-handoff" }, { $set: { code: "sqft", decimalScale: 2 } });
    const view = await service.estimate(fixture.pm, fixture.projectId);
    expect(view.lines[0]?.unit).toBe("nos");
    expect(view.mainLines.every(line => !line.canSuggest && line.unavailableReason?.includes("UOM"))).toBe(true);
  });

  it("returns bounded safe vendor search with activation and classification reasons", async () => {
    const view = await service.estimate(fixture.pm, fixture.projectId);
    const query = { expectedSource: view.source!, mainLineId: "main-line-1", limit: 1, offset: 0 };
    const first = await service.candidates(fixture.pm, fixture.projectId, query);
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ canSuggest: true, bidEligible: true });
    const next = await service.candidates(fixture.pm, fixture.projectId, { ...query, offset: 1 });
    expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fixture.vendorIds[0] }, {
      $set: { "procurementProfile.mainBasketIds": ["basket-b"] } });
    const mismatch = await service.candidates(fixture.pm, fixture.projectId, { ...query, q: "VH0" });
    expect(mismatch.items[0]).toMatchObject({ bidEligible: false, reasons: expect.arrayContaining([expect.stringContaining("classified")]) });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "inactive" } });
    expect((await service.candidates(fixture.pm, fixture.projectId, { ...query, q: "VH0" })).items[0]?.canSuggest).toBe(false);
    expect(JSON.stringify(first)).not.toMatch(/contactEmail|email|kpiScore|procurementProfile|msme|token/);
    await expect(service.candidates(fixture.pm, fixture.projectId, { ...query,
      expectedSource: { ...view.source!, estimateReviewRoundId: "another-round" } })).rejects.toMatchObject({ status: 409 });
  });

  it("shows scoped suggestions and retains unverified project-wide history without guessed line targets", async () => {
    await mongoose.connection.transaction(async session => {
      const approved = await readPMApprovedSource(fixture.projectId, session);
      const scope = await requirePMMainLineScope(approved, "main-line-1", session);
      await ProjectVendorSuggestionModel.create([{ _id: "suggestion-main-line", projectId: fixture.projectId,
        estimateId: fixture.estimateId, estimateVersion: 1, estimateReviewRoundId: fixture.roundId, designPlanVersion: 1,
        sourcePhase: "legacy", scope: "main_line", mainLineId: scope.mainLineId, mainLineNameSnapshot: scope.mainLineName,
        mainBasketId: scope.mainBasketId, mainBasketNameSnapshot: scope.mainBasketName, scopeOccurrences: scope.occurrences,
        scopeDigest: scope.scopeDigest, vendorId: fixture.vendorIds[0], vendorCodeSnapshot: "VH0", vendorNameSnapshot: "Vendor 0",
        note: "Suitable for this work", status: "suggested", version: 1, idempotencyKey: "read-fixture-key", requestHash: "a".repeat(64),
        createdById: fixture.pm.id, createdByName: fixture.pm.name, updatedById: fixture.pm.id, updatedByName: fixture.pm.name,
        createdAt: handoffAt, updatedAt: handoffAt }], { session });
    });
    await ProjectVendorSuggestionModel.collection.insertOne({ _id: "legacy-history", projectId: fixture.projectId,
      estimateId: fixture.estimateId, estimateVersion: 8, estimateReviewRoundId: null, designPlanVersion: 1,
      vendorId: fixture.vendorIds[0], vendorCodeSnapshot: "VH0", vendorNameSnapshot: "Vendor 0", note: "Historical",
      status: "suggested", version: 1, idempotencyKey: "legacy-history-key", createdById: fixture.admin.id,
      createdByName: fixture.admin.name, updatedById: fixture.admin.id, updatedByName: fixture.admin.name,
      createdAt: handoffAt, updatedAt: handoffAt } as never);
    const current = await service.suggestions(fixture.pm, fixture.projectId, { source: "current", limit: 20, offset: 0 });
    expect(current.items).toHaveLength(1);
    expect(current.items[0]).toMatchObject({ id: "suggestion-main-line", sourceState: "current", canEdit: true,
      mainLine: { mainLineId: "main-line-1", occurrences: expect.arrayContaining([expect.objectContaining({ sourceLineItemKey: "scope-2" })]) },
      activity: { availability: "available", items: [] } });
    const history = await service.suggestions(fixture.pm, fixture.projectId, { source: "history", limit: 20, offset: 0 });
    expect(history.items[0]).toMatchObject({ scope: "project", mainLine: null, sourceState: "unverified", canEdit: false,
      storedSource: { estimateId: fixture.estimateId, estimateVersion: 8, estimateReviewRoundId: null } });
  });

  it("preserves exact saved dimensions and explicitly normalizes a fractional legacy rupee rate", () => {
    const source = { estimateId: "e", estimateVersion: 1, estimateReviewRoundId: "r", phase: "legacy" as const,
      designPlanVersion: 1, sourceSnapshotId: null, sourceDigest: null };
    const lines = pmEstimateLines({ source, estimate: null, issues: [], round: { estimateSnapshot: { lineItems: [{ id: "l", rate: 1.23,
      dimensions: { length: "2.125", width: "3", height: "4" }, dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "u", decimalScale: 3 } }] } },
      snapshot: { allLineItems: [{ key: "l", sectionId: "s", roomName: "Room", quantity: 0, unit: "nos", included: false, amountPaise: null, specification: "Legacy" }] } as never });
    expect(lines[0]).toMatchObject({ ratePaise: 123, amountPaise: null, quantity: 0,
      dimensions: [{ label: "Length", value: "2.125", unit: "ft" }, { label: "Width", value: "3", unit: "ft" }, { label: "Height", value: "4", unit: "ft" }] });
  });
});
