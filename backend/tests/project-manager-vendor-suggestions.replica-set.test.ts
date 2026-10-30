import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PMApprovedSourceRef, PMVendorSuggestionCreate, PMVendorSuggestionUpdate } from "../src/contracts/project-manager-estimates.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME } from "../src/domain/project-vendor-suggestion-scope-index.js";
import { migrateVendorSuggestionScopeIndexes } from "../src/migrations/project-vendor-suggestion-scope.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ExecutionChangeEventModel } from "../src/models/ExecutionChangeEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { ProjectVendorSuggestionModel } from "../src/models/ProjectVendorSuggestion.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProcurementBasketInvitationModel, ProcurementBasketBidModel, ProcurementBasketEnquiryModel } from "../src/models/ProcurementBasketTender.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProjectVendorSuggestionService } from "../src/services/project-vendor-suggestions.service.js";
import { approvedProcurementSnapshotFromRows } from "../src/services/procurement.service.js";
import { readPMApprovedSource } from "../src/services/project-manager/approved-source.js";
import { createPMVendorSuggestionCommandService } from "../src/services/project-manager/vendor-suggestion-commands.js";
import { createPMEstimateReadService } from "../src/services/project-manager/estimates.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { handoffAt, seedPMEstimateHandoffFixture, setPMFixtureVendorLinks } from "./helpers/pm-estimate-handoff.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let fixture: Awaited<ReturnType<typeof seedPMEstimateHandoffFixture>>;
let source: PMApprovedSourceRef;
const audit = createAuditService(createMemoryRepository());
const service = createPMVendorSuggestionCommandService({ audit, now: () => handoffAt });
const legacy = createProjectVendorSuggestionService({ audit, now: () => handoffAt });
const currentSource = async (projectId: string) => mongoose.connection.transaction(async session => {
  const read = await readPMApprovedSource(projectId, session);
  // Surface a malformed shared fixture's canonical lineage error before testing commands.
  if (read.issues.length && read.estimate) approvedProcurementSnapshotFromRows(read.estimate,
    await EstimateClientReviewRoundModel.find({ estimateId: read.estimate._id }).session(session).lean());
  expect(read.issues).toEqual([]);
  expect(read.source).not.toBeNull();
  return read.source!;
});
const createInput = (extra: Partial<PMVendorSuggestionCreate> = {}): PMVendorSuggestionCreate => ({
  expectedSource: source, mainLineId: fixture.mainLineIds[0], vendorId: fixture.vendorIds[0],
  note: "Suitable for this Main Line", idempotencyKey: "suggestion-command-1", ...extra
});
const updateInput = (extra: Partial<PMVendorSuggestionUpdate> = {}): PMVendorSuggestionUpdate => ({
  expectedSource: source, expectedVersion: 1, idempotencyKey: "update-command-1", note: "Updated recommendation", status: "suggested", ...extra
});
async function noCommandWrites() {
  expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
  expect(await ProjectManagerEventModel.countDocuments()).toBe(0);
  expect(await AuditEventModel.countDocuments()).toBe(0);
  expect(await ExecutionChangeEventModel.countDocuments()).toBe(0);
}
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-main-line-suggestion-commands");
  await Promise.all([UserModel, ProjectModel, ProjectAccessGrantModel, EstimateModel, EstimateClientReviewRoundModel,
    ProjectManagerEventModel, ProjectVendorSuggestionModel, AuditEventModel, AuthorizationCoordinationModel,
    ExecutionChangeEventModel, ProjectWorkflowTaskModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  vi.restoreAllMocks();
  await replica.clear();
  await migrateVendorSuggestionScopeIndexes(mongoose.connection.db!.collection(ProjectVendorSuggestionModel.collection.name), {
    mode: "apply", writesQuiesced: true, backupIndexMetadata: async () => {}
  });
  fixture = await seedPMEstimateHandoffFixture();
  source = await currentSource(fixture.projectId);
});
afterAll(async () => { await replica?.stop(); });

describe("assigned PM Main Line vendor suggestion commands", () => {
  it("rejects an unrelated same-basket vendor submitted directly and rolls back every fence", async () => {
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ mainLineId: "main-line-2", vendorId: fixture.vendorIds[1] })))
      .rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_NOT_LINKED" });
    await noCommandWrites();
    expect((await EstimateModel.findById(fixture.estimateId).lean())?.procurementSourceEpoch ?? 0).toBe(0);
    expect((await AiEstimatorKnowledgeMainLineModel.findById("main-line-2").lean())?.dependencyEpoch ?? 0).toBe(0);
  });

  it("rejects unverifiable membership without partial suggestion or receipt writes", async () => {
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "pricing-main-line-1" }, {
      $set: { "payload.priceEntries.0.priceVersionId": "missing-version" }
    });
    await expect(service.create(fixture.pm, fixture.projectId, createInput()))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE" });
    await noCommandWrites();
  });

  it("retains committed create receipts after unlinking and blocks only a new endorsement", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    await setPMFixtureVendorLinks("main-line-1", []);
    expect(await service.create(fixture.pm, fixture.projectId, createInput())).toEqual(saved);
    const edited = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput());
    const withdrawn = await service.update(fixture.pm, fixture.projectId, saved.id,
      updateInput({ expectedVersion: edited.version, status: "withdrawn", idempotencyKey: "unlink-withdraw" }));
    const read = createPMEstimateReadService({ now: () => handoffAt });
    const [row] = (await read.suggestions(fixture.pm, fixture.projectId, { source: "current", limit: 20, offset: 0 })).items;
    expect(row).toMatchObject({ canEdit: true, bidEligible: false, reinstatementAvailability: { available: false } });
    expect(row?.readinessReasons).toContain("Vendor is no longer linked to this Main Line in Configuration.");
    await expect(service.update(fixture.pm, fixture.projectId, saved.id,
      updateInput({ expectedVersion: withdrawn.version, idempotencyKey: "unlink-reinstate" })))
      .rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_NOT_LINKED" });
    expect(await ProjectManagerEventModel.countDocuments()).toBe(3);
    expect(await AuditEventModel.countDocuments()).toBe(3);
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toMatchObject({ status: "withdrawn", version: withdrawn.version });
    await setPMFixtureVendorLinks("main-line-1", [fixture.vendorIds[0]]);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fixture.vendorIds[0] }, {
      $set: { "procurementProfile.mainBasketIds": ["basket-b"] }
    });
    const [restored] = (await read.suggestions(fixture.pm, fixture.projectId, { source: "current", limit: 20, offset: 0 })).items;
    expect(restored).toMatchObject({ canEdit: true, bidEligible: false, reinstatementAvailability: { available: true, reason: null } });
    const reinstated = await service.update(fixture.pm, fixture.projectId, saved.id,
      updateInput({ expectedVersion: withdrawn.version, idempotencyKey: "unlink-reinstate" }));
    expect(reinstated.status).toBe("suggested");
  });

  it("allows note edits on a withdrawn suggestion with unavailable links while refusing reinstatement", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    const withdrawn = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ status: "withdrawn" }));
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "pricing-main-line-1" }, { $set: { payload: null } });
    const edited = await service.update(fixture.pm, fixture.projectId, saved.id,
      updateInput({ expectedVersion: withdrawn.version, status: "withdrawn", note: "Retain this history", idempotencyKey: "unavailable-note" }));
    await expect(service.update(fixture.pm, fixture.projectId, saved.id,
      updateInput({ expectedVersion: edited.version, idempotencyKey: "unavailable-reinstate" })))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE" });
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toMatchObject({ status: "withdrawn", note: "Retain this history" });
  });

  it("preserves both unequal projects' approved customer and Procurement values through link and suggestion changes", async () => {
    const projects = [
      { projectId: fixture.projectId, actor: fixture.pm, expectedSource: source },
      { projectId: fixture.otherProjectId, actor: fixture.otherPM, expectedSource: await currentSource(fixture.otherProjectId) }
    ];
    const approvedValues = async () => Promise.all(projects.map(async ({ projectId }) => {
      // Command coordination may advance its epoch, but no approved document or commercial value may change.
      const estimate = await EstimateModel.findOne({ projectId }).select({ procurementSourceEpoch: 0 }).lean();
      if (!estimate) throw new Error("Missing approved fixture estimate");
      const customerRounds = await EstimateClientReviewRoundModel.find({ estimateId: estimate._id }).sort({ _id: 1 }).lean();
      return { estimate, customerRounds, procurement: approvedProcurementSnapshotFromRows(estimate, customerRounds) };
    }));
    const before = await approvedValues();
    expect(before.map(({ procurement }) => [procurement.subtotalPaise, procurement.gstPaise, procurement.totalPaise]))
      .toEqual([[215000, 38700, 253700], [645000, 116100, 761100]]);

    const saved = [];
    for (const { projectId, actor, expectedSource } of projects) {
      saved.push(await service.create(actor, projectId, createInput({ expectedSource, idempotencyKey: `financial-create-${projectId}` })));
      await expect(service.create(actor, projectId, createInput({ expectedSource, mainLineId: "main-line-2",
        vendorId: fixture.vendorIds[1], idempotencyKey: `financial-reject-${projectId}` })))
        .rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_NOT_LINKED" });
    }
    expect(await approvedValues()).toEqual(before);

    await setPMFixtureVendorLinks("main-line-1", []);
    const reader = createPMEstimateReadService({ now: () => handoffAt });
    for (const [index, { projectId, actor, expectedSource }] of projects.entries()) {
      await reader.estimate(actor, projectId);
      const suggestions = await reader.suggestions(actor, projectId, { source: "current", limit: 20, offset: 0 });
      expect(suggestions.items).toHaveLength(1);
      expect(suggestions.items[0]?.readinessReasons).toContain("Vendor is no longer linked to this Main Line in Configuration.");
      const withdrawn = await service.update(actor, projectId, saved[index]!.id,
        updateInput({ expectedSource, status: "withdrawn", idempotencyKey: `financial-withdraw-${projectId}` }));
      expect(withdrawn.status).toBe("withdrawn");
    }
    expect(await approvedValues()).toEqual(before);
  });

  it.each(["main_line", "temporary"] as const)("persists approved %s scope without changing commercial values or creating a request", async itemType => {
    if (itemType === "temporary") {
      await replica.clear();
      fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
      source = await currentSource(fixture.projectId);
    }
    const beforeEstimate = await EstimateModel.findById(fixture.estimateId).select({ procurementSourceEpoch: 0 }).lean();
    const beforeRound = await EstimateClientReviewRoundModel.findById(fixture.roundId).lean();
    const result = await service.create(fixture.pm, fixture.projectId, createInput());
    expect(result).toMatchObject({ version: 1, status: "suggested" });
    const row = await ProjectVendorSuggestionModel.findById(result.id).lean();
    expect(row).toMatchObject({ projectId: fixture.projectId, estimateId: fixture.estimateId,
      estimateVersion: 1, estimateReviewRoundId: fixture.roundId, designPlanVersion: 1, sourcePhase: "legacy",
      scope: "main_line", mainLineId: "main-line-1", mainBasketId: "basket-a", vendorId: fixture.vendorIds[0],
      createdById: fixture.pm.id, updatedById: fixture.pm.id, version: 1 });
    expect(row!.scopeOccurrences.map((item: any) => item.sourceLineItemKey)).toEqual(["scope-1", "scope-2"]);
    expect(await EstimateModel.findById(fixture.estimateId).select({ procurementSourceEpoch: 0 }).lean()).toEqual(beforeEstimate);
    expect(await EstimateClientReviewRoundModel.findById(fixture.roundId).lean()).toEqual(beforeRound);
    expect(await AuditEventModel.countDocuments({ action: "project_vendor_suggestion_created" })).toBe(1);
    expect(await ProjectManagerEventModel.findOne({ entityId: result.id }).lean()).toMatchObject({ recipientIds: [], result });
    expect(await ProcurementBasketInvitationModel.countDocuments()).toBe(0);
    expect(await ProcurementBasketBidModel.countDocuments()).toBe(0);
    expect(await ProcurementBasketEnquiryModel.countDocuments()).toBe(0);
    expect(await ExecutionChangeEventModel.countDocuments()).toBe(1);
  });

  it("keeps same-vendor recommendations independent across Main Lines and supports several vendors on one line", async () => {
    const first = await service.create(fixture.pm, fixture.projectId, createInput());
    const second = await service.create(fixture.pm, fixture.projectId, createInput({ mainLineId: "main-line-2", note: "Other line", idempotencyKey: "different-line" }));
    const third = await service.create(fixture.pm, fixture.projectId, createInput({ vendorId: fixture.vendorIds[1], idempotencyKey: "different-vendor" }));
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(3);
    expect((await ProjectVendorSuggestionModel.findById(second.id).lean())!.scopeOccurrences.map((item: any) => item.sourceLineItemKey)).toEqual(["scope-3"]);
  });

  it("converges concurrent retries, rejects key reuse on another line and returns the original author on a duplicate", async () => {
    const results = await Promise.all([service.create(fixture.pm, fixture.projectId, createInput()), service.create(fixture.pm, fixture.projectId, createInput())]);
    expect(results[0]).toEqual(results[1]);
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ mainLineId: "main-line-2" }))).rejects.toMatchObject({ status: 409 });
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ idempotencyKey: "another-command" }))).rejects.toMatchObject({
      code: "VENDOR_SUGGESTION_DUPLICATE", fields: { suggestionId: results[0]!.id, suggestedById: fixture.pm.id }
    });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(1);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("converges two distinct concurrent requests for the same line to one suggestion", async () => {
    const results = await Promise.allSettled([service.create(fixture.pm, fixture.projectId, createInput()),
      service.create(fixture.pm, fixture.projectId, createInput({ idempotencyKey: "competing-command" }))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "VENDOR_SUGGESTION_DUPLICATE" } });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("keeps unequal projects separate and denies unassigned, inactive and wrong-role direct commands", async () => {
    const otherSource = await currentSource(fixture.otherProjectId);
    await expect(service.create(fixture.pm, fixture.otherProjectId, createInput({ expectedSource: otherSource }))).rejects.toMatchObject({ status: 404 });
    for (const actor of [fixture.otherPM, fixture.admin, fixture.buyer]) {
      await expect(service.create(actor, fixture.projectId, createInput())).rejects.toMatchObject({ status: 404 });
    }
    await UserModel.updateOne({ _id: fixture.pm.id }, { $set: { active: false } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ status: 404 });
    await noCommandWrites();
    await UserModel.updateOne({ _id: fixture.pm.id }, { $set: { active: true } });
    const first = await service.create(fixture.pm, fixture.projectId, createInput());
    const second = await service.create(fixture.otherPM, fixture.otherProjectId, createInput({ expectedSource: otherSource }));
    expect(first.id).not.toBe(second.id);
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(2);
  });

  it("rechecks assignment before replay and never transfers suggestion ownership to a replacement PM", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    await ProjectModel.updateOne({ _id: fixture.projectId }, { $set: { programManagerId: fixture.otherPM.id } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ status: 404 });
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput())).rejects.toMatchObject({ status: 404 });
    await expect(service.update(fixture.otherPM, fixture.projectId, saved.id, updateInput())).rejects.toMatchObject({ status: 404 });
    await expect(service.create(fixture.otherPM, fixture.projectId, createInput())).rejects.toMatchObject({
      code: "VENDOR_SUGGESTION_DUPLICATE", fields: { suggestedById: fixture.pm.id }
    });
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toMatchObject({ version: 1, createdById: fixture.pm.id });
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("supports owned CAS edits, idempotent withdrawal, reinstatement and no-op receipts without duplicate semantic audit", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    const edited = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput());
    expect(edited.version).toBe(2);
    const withdrawal = updateInput({ expectedVersion: 2, idempotencyKey: "withdraw-command", status: "withdrawn" });
    const withdrawn = await service.update(fixture.pm, fixture.projectId, saved.id, withdrawal);
    expect(await service.update(fixture.pm, fixture.projectId, saved.id, withdrawal)).toEqual(withdrawn);
    expect(withdrawn).toMatchObject({ version: 3, status: "withdrawn" });
    const reinstated = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ expectedVersion: 3, idempotencyKey: "reinstate-command" }));
    expect(reinstated).toMatchObject({ version: 4, status: "suggested" });
    const unchanged = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ expectedVersion: 4, idempotencyKey: "unchanged-command" }));
    expect(unchanged).toEqual(reinstated);
    expect(await AuditEventModel.countDocuments()).toBe(4);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(5);
    expect(await ExecutionChangeEventModel.countDocuments()).toBe(4);
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ expectedVersion: 1, idempotencyKey: "stale-update" }))).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VERSION_CONFLICT" });
  });

  it("permits only one competing update and rejects immutable-target injection", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    const results = await Promise.allSettled([
      service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ note: "First edit" })),
      service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ note: "Second edit", idempotencyKey: "second-update" }))
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "VENDOR_SUGGESTION_VERSION_CONFLICT" } });
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, { ...updateInput({ expectedVersion: 2 }), mainLineId: "main-line-2" } as any))
      .rejects.toMatchObject({ status: 400 });
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it("retains old-source records but refuses edits or new writes against changed approval identity", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    await EstimateModel.updateOne({ _id: fixture.estimateId }, { $set: { designPlanVersion: 2 } });
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput())).rejects.toMatchObject({ code: "PM_ESTIMATE_SOURCE_CHANGED" });
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ mainLineId: "main-line-2", idempotencyKey: "stale-source-new" }))).rejects.toMatchObject({ code: "PM_ESTIMATE_SOURCE_CHANGED" });
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toMatchObject({ designPlanVersion: 1, version: 1 });
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it.each([
    { estimateId: "estimate-handoff-other" }, { estimateVersion: 9 },
    { estimateReviewRoundId: "round-handoff-other" }, { phase: "post" as const },
    { sourceSnapshotId: "forged-snapshot", sourceDigest: "f".repeat(64) }
  ])("requires every submitted approved source field to match: %o", async forged => {
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ expectedSource: { ...source, ...forged } })))
      .rejects.toMatchObject({ code: "PM_ESTIMATE_SOURCE_CHANGED" });
    await noCommandWrites();
  });

  it.each(["missing-line", "excluded-only-line"])("rejects unmapped or excluded target %s", async mainLineId => {
    if (mainLineId === "excluded-only-line") {
      await EstimateClientReviewRoundModel.collection.updateOne({ _id: fixture.roundId }, { $set: {
        "estimateSnapshot.lineItems.4.mainLineId": mainLineId, "estimateSnapshot.lineItems.4.catalogueId": mainLineId
      } });
    }
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ mainLineId }))).rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
    await noCommandWrites();
  });

  it("requires current Configuration mapping and rolls back source fences on failure", async () => {
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "main-line-1" }, { $set: { basketId: "basket-b" } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
    await noCommandWrites();
    expect((await EstimateModel.findById(fixture.estimateId).lean())?.procurementSourceEpoch ?? 0).toBe(0);
  });

  it.each(["main_line", "temporary"] as const)("rejects a current type that differs from approved %s without writes", async itemType => {
    if (itemType === "temporary") {
      await replica.clear();
      fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
      source = await currentSource(fixture.projectId);
    }
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "main-line-1" }, {
      $set: { itemType: itemType === "temporary" ? "main_line" : "temporary" } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput()))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
    await noCommandWrites();
    expect((await EstimateModel.findById(fixture.estimateId).lean())?.procurementSourceEpoch ?? 0).toBe(0);
  });

  it("rejects a temporary item moved to another sub-basket after approval", async () => {
    await replica.clear();
    fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
    source = await currentSource(fixture.projectId);
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "main-line-1" }, { $set: { subBasketId: null } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput()))
      .rejects.toMatchObject({ code: "PM_MAIN_LINE_UNAVAILABLE" });
    await noCommandWrites();
  });

  it("blocks inactive and stale-KPI vendors while allowing withdrawal of a previously valid recommendation", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "inactive" } });
    await expect(service.create(fixture.pm, fixture.projectId, createInput({ mainLineId: "main-line-2", idempotencyKey: "inactive-vendor" }))).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    const withdrawn = await service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ status: "withdrawn" }));
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ expectedVersion: withdrawn.version, idempotencyKey: "inactive-reinstate" }))).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "active", kpiRubricGeneration: 1 } });
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ expectedVersion: withdrawn.version, idempotencyKey: "stale-kpi-reinstate" }))).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it("fails closed when required index readiness disappears", async () => {
    await ProjectVendorSuggestionModel.collection.dropIndex(VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME);
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ status: 503 });
    await noCommandWrites();
  });

  it("keeps Admin project-wide suggestions and updates separate from PM Main Line records", async () => {
    await ProjectAccessGrantModel.create({ _id: "admin-handoff-grant", projectId: fixture.projectId, userId: fixture.admin.id,
      module: "projects", source: "admin_initiator", grantedById: fixture.admin.id, grantedAt: handoffAt, active: true });
    const pmSaved = await service.create(fixture.pm, fixture.projectId, createInput());
    const adminSaved = await legacy.create(fixture.admin, fixture.projectId, { estimateId: source.estimateId,
      estimateVersion: source.estimateVersion, designPlanVersion: source.designPlanVersion, vendorId: fixture.vendorIds[0],
      note: "Project-wide recommendation", idempotencyKey: "admin-project-recommendation" });
    expect((await legacy.list(fixture.buyer, fixture.projectId, { q: "", limit: 20, offset: 0 })).items.map(item => item.id)).toEqual([adminSaved.suggestion.id]);
    await expect(legacy.update(fixture.admin, fixture.projectId, pmSaved.id, { expectedVersion: 1, note: "Wrong scope", status: "withdrawn" })).rejects.toMatchObject({ status: 404 });
    await expect(service.update(fixture.pm, fixture.projectId, adminSaved.suggestion.id, updateInput())).rejects.toMatchObject({ status: 404 });
    expect((await legacy.update(fixture.admin, fixture.projectId, adminSaved.suggestion.id, { expectedVersion: 1, note: "Still project-wide", status: "withdrawn" })).status).toBe("withdrawn");
    expect(await ProjectVendorSuggestionModel.findById(pmSaved.id).lean()).toMatchObject({ status: "suggested", version: 1 });
  });

  it("supports an approved collaborative pre-estimate without inventing a Design approval", async () => {
    await ProjectModel.collection.updateOne({ _id: fixture.projectId }, { $set: { estimationWorkflowVersion: 2, estimateRequirementsVersion: 0 } });
    await EstimateModel.collection.updateOne({ _id: fixture.estimateId }, { $set: {
      estimation: { ...newEstimationLifecycle(), phase: "post", status: "draft", preApproval: {
        reviewRoundId: fixture.roundId, estimateVersion: 1, approvedAt: handoffAt.toISOString()
      } }, designPlanStatus: "pending_assignment", designPlanVersion: 0, designPlanApprovedAt: null,
      designPlanApprovedById: null, designPlanApprovalSource: null
    } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: fixture.roundId }, { $set: { phase: "pre" } });
    source = await currentSource(fixture.projectId);
    expect(source).toMatchObject({ phase: "pre", designPlanVersion: 0, sourceSnapshotId: fixture.roundId });
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    const row = await ProjectVendorSuggestionModel.findById(saved.id).lean();
    expect(row).toMatchObject({ designPlanVersion: 0, sourcePhase: "pre", sourceSnapshotId: fixture.roundId });
    expect(row!.sourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    await expect(new ProjectVendorSuggestionModel({ ...row, _id: "invalid-zero-design-legacy", sourcePhase: "legacy" }).validate()).rejects.toThrow("Zero Design version");
    await expect(new ProjectVendorSuggestionModel({ ...row, _id: "invalid-zero-design-project", scope: "project", mainLineId: null }).validate()).rejects.toThrow("Zero Design version");
  });

  it("rolls back all suggestion, receipt, audit and fence writes when semantic audit fails", async () => {
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("audit failure"); });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toThrow("audit failure");
    await noCommandWrites();
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect((await EstimateModel.findById(fixture.estimateId).lean())?.procurementSourceEpoch ?? 0).toBe(0);
    expect((await ProjectModel.findById(fixture.projectId).lean())?.siteCompletionFenceEpoch ?? 0).toBe(0);
    expect((await AiEstimatorKnowledgeVendorModel.findById(fixture.vendorIds[0]).lean())?.dependencyEpoch ?? 0).toBe(0);
    expect((await AiEstimatorKnowledgeMainLineModel.findById("main-line-1").lean())?.dependencyEpoch ?? 0).toBe(0);
  });

  it("rolls back an owned update and its receipt if audit persistence fails", async () => {
    const saved = await service.create(fixture.pm, fixture.projectId, createInput());
    const before = await ProjectVendorSuggestionModel.findById(saved.id).lean();
    const append = audit.appendInMongoTransaction.bind(audit);
    vi.spyOn(audit, "appendInMongoTransaction").mockImplementationOnce(async (...args) => { await append(...args); throw new Error("update audit failure"); });
    await expect(service.update(fixture.pm, fixture.projectId, saved.id, updateInput({ status: "withdrawn" }))).rejects.toThrow("update audit failure");
    expect(await ProjectVendorSuggestionModel.findById(saved.id).lean()).toEqual(before);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(await ExecutionChangeEventModel.countDocuments()).toBe(1);
  });

  it("retries a concurrent approved-source change and refuses the stale command", async () => {
    const update = EstimateModel.updateOne.bind(EstimateModel);
    vi.spyOn(EstimateModel, "updateOne").mockImplementationOnce((...args) => (async () => {
      await EstimateModel.collection.updateOne({ _id: fixture.estimateId }, { $set: { designPlanVersion: 2 }, $inc: { version: 1 } });
      return update(...args);
    })() as any);
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ code: "PM_ESTIMATE_SOURCE_CHANGED" });
    await noCommandWrites();
  });

  it("retries a real Configuration draft save at the Main Line fence and refuses the removed vendor", async () => {
    const configurationActor = { ...fixture.admin, role: "super_admin" as const };
    // Isolate the Main Line fence from the separate global authorization mutex.
    // All Configuration section/aggregate persistence and PM fences remain real.
    const authorized = async () => ({ id: configurationActor.id, role: configurationActor.role });
    const configuration = createAiEstimatorKnowledgeItemService({ audit, now: () => handoffAt,
      actorGuard: { requireReadActor: authorized, requireMutationActor: authorized } });
    // The handoff fixture uses a legacy Mode payload for Procurement tests. This
    // scenario creates a new draft, which deliberately requires modern validation.
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "advanced-main-line-1" }, { $set: { payload: {} } });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "design-main-line-1" }, { $set: { applicability: "not_configured", payload: {} } });
    const draft = await configuration.createRevision(configurationActor, "main-line-1", { expectedVersion: 1 });
    const beforeAudit = await AuditEventModel.countDocuments();
    const originalUpdate = AiEstimatorKnowledgeMainLineModel.updateOne.bind(AiEstimatorKnowledgeMainLineModel);
    vi.spyOn(AiEstimatorKnowledgeMainLineModel, "updateOne").mockImplementationOnce((...args) => (async () => {
      await configuration.updateSection(configurationActor, "main-line-1", draft.draftRevisionId!, "pricing", {
        expectedVersion: 1, expectedAggregateVersion: draft.version, payload: { priceEntries: [] }
      });
      return originalUpdate(...args);
    })() as any);
    await expect(service.create(fixture.pm, fixture.projectId, createInput()))
      .rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_NOT_LINKED" });
    expect(await ProjectVendorSuggestionModel.countDocuments()).toBe(0);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(0);
    expect(await ExecutionChangeEventModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "project_vendor_suggestion_created" })).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(beforeAudit + 1);
    expect(await AiEstimatorKnowledgeMainLineModel.findById("main-line-1").lean()).toMatchObject({ version: draft.version + 1 });
    expect((await EstimateModel.findById(fixture.estimateId).lean())?.procurementSourceEpoch ?? 0).toBe(0);
  });

  it("retries concurrent vendor deactivation before the activation fence and refuses the command", async () => {
    const find = AiEstimatorKnowledgeVendorModel.findOneAndUpdate.bind(AiEstimatorKnowledgeVendorModel);
    vi.spyOn(AiEstimatorKnowledgeVendorModel, "findOneAndUpdate").mockImplementationOnce((...args) => {
      const query = find(...args);
      const lean = query.lean.bind(query);
      query.lean = (() => (async () => {
        await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "inactive" } });
        return lean();
      })()) as any;
      return query;
    });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ code: "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE" });
    await noCommandWrites();
  });

  it("retries a concurrent project reassignment before its project fence and denies the former manager", async () => {
    const find = ProjectModel.findOneAndUpdate.bind(ProjectModel);
    vi.spyOn(ProjectModel, "findOneAndUpdate").mockImplementationOnce((...args) => {
      const query = find(...args);
      const lean = query.lean.bind(query);
      query.lean = (() => (async () => {
        await ProjectModel.collection.updateOne({ _id: fixture.projectId }, { $set: { programManagerId: fixture.otherPM.id } });
        return lean();
      })()) as any;
      return query;
    });
    await expect(service.create(fixture.pm, fixture.projectId, createInput())).rejects.toMatchObject({ status: 404 });
    await noCommandWrites();
  });
});
