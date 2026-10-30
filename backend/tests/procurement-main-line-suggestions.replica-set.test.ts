import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProjectVendorSuggestionModel } from "../src/models/ProjectVendorSuggestion.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketInvitationModel,
  ProcurementBasketBidModel, ProcurementBasketSourceReconciliationModel } from "../src/models/ProcurementBasketTender.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { createPMEstimateReadService } from "../src/services/project-manager/estimates.js";
import { createPMVendorSuggestionCommandService } from "../src/services/project-manager/vendor-suggestion-commands.js";
import { createProcurementMainLineSuggestionService } from "../src/services/procurement-main-line-suggestions.service.js";
import { createProcurementBasketService } from "../src/services/procurement-basket.service.js";
import { createProcurementBasketEnquiryService } from "../src/services/procurement-basket-enquiry.service.js";
import { readPMVendorSuggestionActivity } from "../src/services/project-manager/vendor-suggestion-activity.js";
import { readBasketVendorCandidates } from "../src/services/procurement-basket-vendor-eligibility.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { migrateVendorSuggestionScopeIndexes } from "../src/migrations/project-vendor-suggestion-scope.js";
import type { PMVendorSuggestion } from "../src/contracts/project-manager-estimates.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedPMEstimateHandoffFixture, setPMFixtureVendorLinks, handoffAt } from "./helpers/pm-estimate-handoff.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let fixture: Awaited<ReturnType<typeof seedPMEstimateHandoffFixture>>;
const reader = createPMEstimateReadService({ now: () => handoffAt });
const commands = createPMVendorSuggestionCommandService({ audit: createAuditService(createMemoryRepository()), now: () => handoffAt });
const procurement = createProcurementMainLineSuggestionService({ now: () => handoffAt });
const query = { source: "current" as const, limit: 20, offset: 0 };
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-estimate-procurement-reads");
  await ProjectVendorSuggestionModel.createCollection();
  await Promise.all([ProjectManagerEventModel, AuditEventModel].map(model => model.syncIndexes()));
  await migrateVendorSuggestionScopeIndexes(mongoose.connection.db!.collection("projectVendorSuggestions"), {
    mode: "apply", writesQuiesced: true, backupIndexMetadata: async () => {} });
}, 120000);
beforeEach(async () => { await replica.clear(); fixture = await seedPMEstimateHandoffFixture(); });
afterAll(async () => replica?.stop());

async function suggest(line = "main-line-1", vendorId = fixture.vendorIds[0]) {
  const view = await reader.estimate(fixture.pm, fixture.projectId);
  return commands.create(fixture.pm, fixture.projectId, { expectedSource: view.source!, mainLineId: line, vendorId,
    note: `For ${line}`, idempotencyKey: `request-${line}-${vendorId}` });
}
async function event(id: string, options: { keys?: string[]; status?: string; projectId?: string; vendorId?: string;
  bidKeys?: string[]; ageMinutes?: number; expired?: boolean; round?: string; receiptMissing?: boolean } = {}) {
  const projectId = options.projectId ?? fixture.projectId, vendorId = options.vendorId ?? fixture.vendorIds[0];
  const enquiryId = `enquiry-${projectId}`, revisionId = `revision-${id}`, invitationId = `invitation-${id}`;
  const estimateId = projectId === fixture.projectId ? fixture.estimateId : "estimate-handoff-other";
  const estimateReviewRoundId = options.round ?? (projectId === fixture.projectId ? fixture.roundId : "round-handoff-other");
  const keys = options.keys ?? ["scope-1", "scope-2"];
  const lines = keys.map(key => ({ id: `boq-${id}-${key}`, mainLineId: key === "scope-3" ? "main-line-2" : "main-line-1", sourceLineItemKey: key }));
  const requestedAt = new Date(handoffAt.getTime() - (options.ageMinutes ?? 2) * 60_000);
  await ProcurementBasketEnquiryModel.collection.updateOne({ _id: enquiryId }, { $setOnInsert: { projectId, mainBasketId: "basket-a" } }, { upsert: true });
  await ProcurementBasketBoqRevisionModel.collection.insertOne({ _id: revisionId, projectId, enquiryId, mainBasketId: "basket-a",
    revision: 1, sentAt: requestedAt, digest: "b".repeat(64), lines, estimateSource: { estimateId, estimateVersion: 1, estimateReviewRoundId } } as never);
  const bidId = options.bidKeys || options.receiptMissing ? `bid-${id}` : null;
  await ProcurementBasketInvitationModel.collection.insertOne({ _id: invitationId, projectId, enquiryId, mainBasketId: "basket-a",
    boqRevisionId: revisionId, vendorId, status: options.status ?? "sent", requestedAt,
    sentAt: options.status === "pending" || options.status === "failed" ? null : requestedAt,
    expiresAt: new Date(handoffAt.getTime() + (options.expired ? -60_000 : 86400_000)), receiptBidId: bidId,
    tokenHash: `private-token-${id}`, recipientEmailHash: `private-email-${id}` } as never);
  if (options.bidKeys) await ProcurementBasketBidModel.collection.insertOne({ _id: bidId, projectId, enquiryId,
    mainBasketId: "basket-a", boqRevisionId: revisionId, invitationId, vendorId, submittedAt: requestedAt,
    lines: options.bidKeys.map(key => ({ boqLineId: `boq-${id}-${key}`, unitPricePaise: 999999, totalPaise: 999999 })),
    totals: { netPaise: 999999, totalPaise: 999999 } } as never);
  return { enquiryId, revisionId, invitationId, lines };
}

describe("Main Line recommendation handoff and actual activity", () => {
  it("retains removed-link recommendations and actual bid activity without restricting ordinary vendor selection", async () => {
    await suggest();
    await event("issued-before-unlink", { bidKeys: ["scope-1"] });
    const before = await reader.suggestions(fixture.pm, fixture.projectId, query);
    const invitations = await ProcurementBasketInvitationModel.find().lean();
    const bids = await ProcurementBasketBidModel.find().lean();
    await setPMFixtureVendorLinks("main-line-1", []);
    const after = await reader.suggestions(fixture.pm, fixture.projectId, query);
    const buyer = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", query);
    expect(after.items[0]).toMatchObject({ id: before.items[0]!.id, canEdit: true, bidEligible: false, status: "suggested" });
    expect(after.items[0]!.activity).toEqual(before.items[0]!.activity);
    expect(buyer.items[0]).toMatchObject({ id: before.items[0]!.id, canEdit: false, bidEligible: false });
    expect(buyer.items[0]!.readinessReasons).toContain("Vendor is no longer linked to this Main Line in Configuration.");
    const ordinary = await mongoose.connection.transaction(session => readBasketVendorCandidates(fixture.projectId, "basket-a", session));
    expect(ordinary.items.map(row => row.vendorId)).toContain(fixture.vendorIds[0]);
    expect(await ProcurementBasketInvitationModel.find().lean()).toEqual(invitations);
    expect(await ProcurementBasketBidModel.find().lean()).toEqual(bids);
  });

  it("marks an unverifiable vendor link explicitly while preserving other Main Line recommendations", async () => {
    await suggest();
    await suggest("main-line-2");
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "pricing-main-line-1" }, { $set: { payload: null } });
    const buyer = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", query);
    const unavailable = buyer.items.find(row => row.mainLine?.mainLineId === "main-line-1")!;
    const valid = buyer.items.find(row => row.mainLine?.mainLineId === "main-line-2")!;
    expect(buyer.total).toBe(2);
    expect(unavailable.bidEligible).toBe(false);
    expect(unavailable.readinessReasons).toEqual(expect.arrayContaining([expect.stringContaining("cannot be verified")]));
    expect(unavailable.readinessReasons).not.toContain("Vendor is no longer linked to this Main Line in Configuration.");
    expect(valid.bidEligible).toBe(true);
  });

  it("shows the same saved scoped record in the Procurement basket regardless of directory page", async () => {
    await suggest();
    await suggest("main-line-2");
    const pm = await reader.suggestions(fixture.pm, fixture.projectId, query);
    const buyer = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", { ...query, limit: 1, offset: 1 });
    expect(pm.total).toBe(2);
    expect(buyer.total).toBe(2);
    expect(buyer.items).toHaveLength(1);
    expect(pm.items.some(item => item.id === buyer.items[0]!.id && item.note === buyer.items[0]!.note)).toBe(true);
    expect(buyer.items[0]?.canEdit).toBe(false);
    expect(buyer.items[0]?.readinessReasons).toEqual([]);
    expect(buyer.items[0]?.bidEligible).toBe(true);
    expect(buyer.mainLines.map(line => line.id).sort()).toEqual(["main-line-1", "main-line-2"]);
    const filtered = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", { ...query, mainLineId: "main-line-2" });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.mainLine?.mainLineId).toBe("main-line-2");
    expect((await procurement.list(fixture.buyer, fixture.projectId, "basket-b", query)).items).toEqual([]);
    expect(await ProcurementBasketInvitationModel.countDocuments()).toBe(0);
    await expect(procurement.list(fixture.pm, fixture.projectId, "basket-a", query)).rejects.toMatchObject({ status: 403 });
  });

  it.each(["main_line", "temporary"] as const)("tracks approved %s recommendations through actual Procurement dispatch", async itemType => {
    if (itemType === "temporary") {
      await replica.clear();
      fixture = await seedPMEstimateHandoffFixture({ temporaryMainLineIds: ["main-line-1"] });
    }
    await suggest();
    const recommended = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", query);
    expect(recommended.items[0]?.bidEligible).toBe(true);
    expect(recommended.items[0]?.mainLine?.itemType).toBe(itemType);
    const basket = await createProcurementBasketService().get(fixture.buyer, fixture.projectId, "basket-a");
    let deliveries = 0;
    const enquiries = createProcurementBasketEnquiryService({ audit: createAuditService(createMemoryRepository()),
      now: () => handoffAt, mailer: { deliveryKind: "local_test", sendRequest: async () => { deliveries++; } } });
    const draft = await enquiries.create(fixture.buyer, fixture.projectId, "basket-a", {
      expectedPreparationDigest: basket.preparationDigest, idempotencyKey: "handoff-real-enquiry",
      lines: basket.lines.filter(line => line.included && (line.approvedAmountPaise ?? 0) > 0).map(line => ({
        sourceLineItemKey: line.sourceLineItemKey, scopeType: "supply_and_execution" as const,
        targetDate: "2027-01-01", deliveryLocation: "Synthetic site" })) });
    expect(deliveries).toBe(0);
    const sent = await enquiries.dispatch(fixture.buyer, fixture.projectId, "basket-a", draft.id, {
      expectedVersion: draft.version, expectedPreparationDigest: basket.preparationDigest,
      idempotencyKey: "handoff-real-dispatch", vendorIds: [recommended.items[0]!.vendor.id] });
    expect(deliveries).toBe(1);
    expect(sent.invitations).toMatchObject([{ status: "sent", vendorId: fixture.vendorIds[0] }]);
    const refreshed = await reader.suggestions(fixture.pm, fixture.projectId, query);
    expect(refreshed.items[0]?.mainLine?.itemType).toBe(itemType);
    expect(refreshed.items[0]?.activity).toMatchObject({ availability: "available", items: [{
      enquiryId: draft.id, deliveryStatus: "sent", coverage: "full", coveredSourceLineItemKeys: ["scope-1", "scope-2"], bidReceivedAt: null }] });
  });

  it("matches immutable Main Line keys, partial room coverage and real line receipts without leaking prices", async () => {
    await suggest(); await suggest("main-line-2");
    await event("older-bid", { status: "consumed", bidKeys: ["scope-1"], ageMinutes: 30 });
    await event("latest", { status: "pending", keys: ["scope-1"], ageMinutes: 1 });
    await event("other-line", { keys: ["scope-3"] });
    await event("other-project", { projectId: fixture.otherProjectId });
    const page = await reader.suggestions(fixture.pm, fixture.projectId, query);
    const first = page.items.find(item => item.mainLine?.mainLineId === "main-line-1")!;
    expect(first.activity.availability).toBe("available");
    expect(first.activity.items).toHaveLength(2);
    expect(first.activity.items[0]).toMatchObject({ invitationId: "invitation-latest", deliveryStatus: "pending",
      coverage: "partial", coveredSourceLineItemKeys: ["scope-1"], bidReceivedAt: null, lineResponded: false });
    expect(first.activity.items[1]).toMatchObject({ invitationId: "invitation-older-bid", deliveryStatus: "consumed", coverage: "full",
      lineResponded: true, respondedSourceLineItemKeys: ["scope-1"], bidReceivedAt: expect.any(String) });
    expect(page.items.find(item => item.mainLine?.mainLineId === "main-line-2")?.activity.items).toMatchObject([
      { invitationId: "invitation-other-line" }]);
    expect(JSON.stringify(page)).not.toMatch(/tokenHash|recipientEmailHash|unitPricePaise|netPaise|private-token|999999/);
  });

  it("derives failed, expired, stalled and historical requests independently of suggestion status", async () => {
    await suggest();
    for (const status of ["failed", "revoked", "superseded"]) await event(status, { status });
    await event("expired", { status: "sent", expired: true });
    await event("stalled", { status: "pending", ageMinutes: 11 });
    await ProjectVendorSuggestionModel.updateOne({ projectId: fixture.projectId }, { $set: { status: "withdrawn" } });
    const page = await reader.suggestions(fixture.pm, fixture.projectId, query);
    expect(page.items[0]?.activity.items.map(item => item.deliveryStatus).sort()).toEqual(["expired", "failed", "revoked", "stalled", "superseded"]);
    expect(page.items[0]?.status).toBe("withdrawn");
  });

  it("does not claim a received bid from consumed state without a matching persisted receipt", async () => {
    await suggest();
    await event("broken-receipt", { status: "consumed", receiptMissing: true });
    const page = await reader.suggestions(fixture.pm, fixture.projectId, query);
    expect(page.items[0]?.activity).toMatchObject({ availability: "unavailable", items: [{ bidReceivedAt: null, lineResponded: false }] });
  });

  it("requires exact reconciliation proof and limits retained coverage to unchanged source keys", async () => {
    await suggest();
    const stored = (await reader.suggestions(fixture.pm, fixture.projectId, query)).items[0]!;
    const target: PMVendorSuggestion = { ...stored, source: { ...stored.source!, phase: "post", sourceSnapshotId: "new-round",
      estimateReviewRoundId: "new-round", estimateVersion: 3, sourceDigest: "c".repeat(64) } };
    const old = await event("reconciled", { round: "old-round" });
    const proof = { _id: "reconciliation", projectId: fixture.projectId, mainBasketId: "basket-a", enquiryId: old.enquiryId,
      boqRevisionId: old.revisionId, boqDigest: "b".repeat(64), previousEstimateSource: { estimateId: fixture.estimateId,
        estimateVersion: 1, estimateReviewRoundId: "old-round" }, preparationSource: { ...target.source!, workflowVersion: 2, kind: "approved_final" },
      unchangedLineKeys: ["scope-1"] };
    await ProcurementBasketSourceReconciliationModel.collection.insertOne(proof as never);
    const read = () => mongoose.connection.transaction(session => readPMVendorSuggestionActivity(fixture.projectId, [target], session, handoffAt));
    expect((await read()).get(target.id)?.items).toMatchObject([{ sourceRelation: "reconciled_history", coverage: "partial", coveredSourceLineItemKeys: ["scope-1"] }]);
    await ProcurementBasketSourceReconciliationModel.collection.updateOne({ _id: proof._id }, { $set: { boqDigest: "d".repeat(64) } });
    expect((await read()).get(target.id)?.items).toEqual([]);
  });

  it("keeps inactive and unmatched vendor recommendations visible but unavailable for selection", async () => {
    await suggest();
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: fixture.vendorIds[0] }, { $set: { status: "inactive" } });
    const buyer = await procurement.list(fixture.buyer, fixture.projectId, "basket-a", query);
    expect(buyer.items[0]).toMatchObject({ bidEligible: false, readinessReasons: expect.arrayContaining(["Vendor is inactive."]) });
  });

  it("marks bounded event history as truncated and never infers absence beyond an incomplete scan", async () => {
    await suggest();
    for (let index = 0; index < 21; index++) await event(`history-${index}`, { ageMinutes: index + 1 });
    const first = (await reader.suggestions(fixture.pm, fixture.projectId, query)).items[0]!;
    expect(first.activity).toMatchObject({ availability: "available", truncated: true });
    expect(first.activity.items).toHaveLength(20);
    await ProcurementBasketBoqRevisionModel.deleteMany({ projectId: fixture.projectId });
    await ProcurementBasketInvitationModel.deleteMany({ projectId: fixture.projectId });
    await ProcurementBasketBoqRevisionModel.collection.insertMany(Array.from({ length: 1001 }, (_, index) => ({
      _id: `unmatched-revision-${index}`, projectId: fixture.projectId, mainBasketId: "basket-a", enquiryId: `enquiry-${fixture.projectId}`,
      revision: index + 1, sentAt: handoffAt, estimateSource: { estimateId: fixture.estimateId, estimateVersion: 1, estimateReviewRoundId: fixture.roundId },
      lines: [{ id: `unmatched-${index}`, mainLineId: "main-line-1", sourceLineItemKey: "not-the-recommended-occurrence" }]
    })) as never[]);
    const incomplete = (await reader.suggestions(fixture.pm, fixture.projectId, query)).items[0]!;
    expect(incomplete.activity).toMatchObject({ availability: "unavailable", truncated: true, items: [] });
  });

  it("rejects a receipt linked to another vendor even when an invitation names its bid ID", async () => {
    await suggest();
    await event("wrong-receipt", { status: "consumed", bidKeys: ["scope-1"] });
    await ProcurementBasketBidModel.collection.updateOne({ _id: "bid-wrong-receipt" }, { $set: { vendorId: fixture.vendorIds[1] } });
    const activity = (await reader.suggestions(fixture.pm, fixture.projectId, query)).items[0]!.activity;
    expect(activity).toMatchObject({ availability: "unavailable", items: [{ bidReceivedAt: null, lineResponded: false }] });
  });
});
