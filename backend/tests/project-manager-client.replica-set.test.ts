import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectManagerClientService } from "../src/services/project-manager/client.js";
import { createProjectCompletionService } from "../src/services/project-completion.service.js";
import { createSiteCompletionService } from "../src/services/site-completion.service.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectSnagModel } from "../src/models/ProjectSnag.js";
import { ProjectSnagVisitModel } from "../src/models/ProjectSnagVisit.js";
import { ProjectClientEscalationModel } from "../src/models/ProjectClientEscalation.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { ProjectManagerEvidenceModel } from "../src/models/ProjectManagerEvidence.js";
import { ProjectCompletionDecisionModel } from "../src/models/ProjectCompletionDecision.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { SiteCompletionReviewModel } from "../src/models/SiteCompletionReview.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const user = (id: string, role: PublicUser["role"]): PublicUser => ({ id, role, name: id, email: `${id}@example.test` });
const pm = user("pm-a", "site_manager");
const otherPM = user("pm-b", "site_manager");
const designer = user("designer-a", "designer");
const client = user("client-a", "client");
const otherClient = user("client-b", "client");
const admin = user("admin-a", "super_admin");
const audit = createAuditService(createMemoryRepository());
let clock = new Date("2026-10-27T08:00:00Z");
const service = createProjectManagerClientService({ audit, now: () => clock });
const closure = createProjectCompletionService({ audit, now: () => clock });
const completion = createSiteCompletionService({ audit, now: () => clock });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;
const key = () => `pm-client-command-${++sequence}`;
const snagInput = () => ({ expectedVersion: 0, idempotencyKey: key(), title: "Cabinet edge", description: "Repair sharp exposed corner", severity: "critical", evidenceIds: [] });
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-manager-client-tests");
  for (const model of [UserModel, ProjectModel, ProjectSnagModel, ProjectSnagVisitModel, ProjectClientEscalationModel,
    ProjectManagerEventModel, ProjectManagerEvidenceModel, SiteCompletionStateModel, SiteCompletionReviewModel, ProjectCompletionDecisionModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => {
  await replica.clear(); sequence = 0; clock = new Date("2026-10-27T08:00:00Z");
  await UserModel.create([pm, otherPM, designer, client, otherClient, admin].map(actor => ({ _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email, role: actor.role, active: true, passwordHash: "fixture-only" })));
  for (const [id, manager, owner] of [["project-a", pm, client], ["project-b", otherPM, otherClient]] as const) {
    await ProjectModel.create({ _id: id, name: id, programManagerId: manager.id, assignedDesignerIds: id === "project-a" ? [designer.id] : [], clientId: owner.id, clientName: owner.name, clientEmail: owner.email,
      clientEmailNormalized: owner.email, clientMobile: "9000000000", status: "active", location: "Test site", completionAuthority: "vendor_client",
      completionAuthorityVersion: 1, plannedStartAt: clock, plannedEndAt: new Date("2026-11-01T00:00:00Z") });
  }

});
afterAll(async () => { await replica?.stop(); });

async function readyForReview() {
  const lineItems = [{ id: "source-a", catalogueId: "CA01", roomName: "Living", specification: "Cabinet", unit: "sheet", rate: 250, quantity: 1, included: true, amount: 250 }];
  await EstimateModel.create({ _id: "estimate-a", leadId: "lead-a", ownerId: admin.id, version: 2, status: "client_approved", propertyType: "villa", rooms: [], scopes: [],
    lineItems, subtotal: 250, gst: 0, total: 250, approvalRequired: false, projectId: "project-a", reviews: [{ actorId: admin.id, action: "client_approved", note: "Approved", occurredAt: clock }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: clock, designPlanApprovedById: admin.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: clock });
  await ProjectWorkflowTaskModel.create({ _id: "site-task", dedupeKey: "site-task", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "site_execution", title: "Site execution", assigneeRole: "site_manager", assigneeUserId: pm.id, status: "open", progress: 0, version: 1, openedAt: clock });
  await EstimateClientReviewRoundModel.create({ _id: "round-a", estimateId: "estimate-a", leadId: "lead-a", projectId: null, estimateVersion: 1, sendGeneration: 1,
    dedupeKey: "a".repeat(64), recipientEmail: client.email, recipientEmailNormalized: client.email,
    estimateSnapshot: { clientName: client.name, projectName: "Project", location: "Test site", propertyType: "villa", lineItems, subtotal: 250, gst: 0, total: 250 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64), pdfStorageReference: "fixture-approved",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: clock, deliveredAt: clock, assignedAdminId: admin.id,
    status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "Approved", decidedById: admin.id, decidedAt: clock, version: 2 });
  await closure.except(admin, "project-a", { sourceLineItemKey: "source-a", kind: "externally_fulfilled", reason: "Client supplied and installed the approved cabinet", expectedAuthorityVersion: 1, idempotencyKey: key() });
  return completion.progress(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), progress: 100, note: "Physical inspection completed" });
}
async function resolveSnag(id: string, version = 1) {
  const resolved = await service.actSnag(pm, "project-a", id, { action: "resolve", expectedVersion: version, idempotencyKey: key(), reason: "Sharp edge repaired" });
  return service.actSnag(pm, "project-a", id, { action: "verify", expectedVersion: resolved.version, idempotencyKey: key(), reason: "Inspected repaired edge on site" });
}

describe("PM operational client and snag records", () => {
  it("persists and notifies only a current project owner, including reasoned reassignment", async () => {
    const defaultOwned = await service.createSnag(pm, "project-a", snagInput());
    expect(defaultOwned).toMatchObject({ ownerId: pm.id, ownerName: pm.name });
    await expect(service.createSnag(pm, "project-a", { ...snagInput(), ownerId: otherPM.id })).rejects.toMatchObject({ status: 409 });
    const siteOwned = await service.createSnag(pm, "project-a", { ...snagInput(), ownerId: designer.id });
    expect((await ProjectSnagModel.findById(siteOwned.id).lean())?.ownerId).toBe(designer.id);
    expect((await ProjectManagerEventModel.findOne({ entityId: siteOwned.id, action: "create" }).lean())?.recipientIds).toContain(designer.id);
    const reassigned = await service.actSnag(pm, "project-a", siteOwned.id, { expectedVersion: siteOwned.version, idempotencyKey: key(), action: "assign", ownerId: client.id, reason: "Client to confirm access before repair" });
    expect(reassigned).toMatchObject({ status: "open", ownerId: client.id, version: 2 });
    expect((await ProjectManagerEventModel.findOne({ entityId: siteOwned.id, action: "assign" }).lean())?.recipientIds).toContain(client.id);
    await UserModel.updateOne({ _id: client.id }, { $set: { active: false } });
    await expect(service.actSnag(pm, "project-a", siteOwned.id, { expectedVersion: 2, idempotencyKey: key(), action: "start", reason: "Cannot reuse inactive owner" })).rejects.toMatchObject({ status: 409 });
    expect((await service.snagging(pm, "project-a")).items.find(item => item.id === siteOwned.id)?.ownerName).toBe("Assigned owner unavailable");
  });
  it("filters rooms, trades, vendors and status by stable issued identities with exact totals", async () => {
    await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", name: "Joinery partner" }, { _id: "vendor-b", name: "Flooring partner" }] as any);
    const entries = [
      { id: "late-work-101", roomId: "room-a", section: "trade-a", vendor: "vendor-a" },
      { id: "late-work-102", roomId: "room-b", section: "trade-a", vendor: "vendor-a" },
      { id: "late-work-103", roomId: "room-a", section: "trade-b", vendor: "vendor-b" }
    ];
    for (const entry of entries) {
      const source = `source-${entry.id}`;
      await EstimateClientReviewRoundModel.collection.insertOne({ _id: `round-${entry.id}`, estimateId: "estimate-source", estimateVersion: 1,
        projectId: "project-a", status: "approved", decision: "approve", estimateSnapshot: { lineItems: [{ id: source, roomId: entry.roomId,
          roomName: "Bedroom", mainBasketId: entry.section, mainBasketName: entry.section === "trade-a" ? "Carpentry" : "Flooring" }] } } as any);
      await ProjectPurchaseOrderModel.collection.insertOne({ _id: `order-${entry.id}`, projectId: "project-a", vendorId: entry.vendor, approvedRevision: 1, approvedRevisionId: `revision-${entry.id}`, cancelledAt: null } as any);
      await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: `revision-${entry.id}`, orderId: `order-${entry.id}`, projectId: "project-a", vendorId: entry.vendor, revision: 1,
        lines: [{ id: "line-a", sourceLineItemKey: source, sourceSectionId: entry.section }] } as any);
      await VendorWorkAssignmentModel.collection.insertOne({ _id: entry.id, projectId: "project-a", vendorId: entry.vendor, orderId: `order-${entry.id}`, orderRevision: 1, lineId: "line-a",
        estimateId: "estimate-source", estimateVersion: 1, estimateReviewRoundId: `round-${entry.id}`, sourceLineItemKey: source, sourceSectionId: entry.section,
        roomName: "Bedroom", itemName: "Finish repair", status: "ready" } as any);
    }
    const created = [];
    for (const entry of entries) created.push(await service.createSnag(pm, "project-a", { ...snagInput(), assignmentId: entry.id, title: entry.id }));
    await service.actSnag(pm, "project-a", created[2]!.id, { action: "start", expectedVersion: 1, idempotencyKey: key(), reason: "Repair started" });
    const page = await service.snagging(pm, "project-a", { roomId: "room-a", limit: 1, offset: 0 });
    expect(page.total).toBe(2); expect(page.items).toHaveLength(1);
    expect(page.items[0]!.roomId).toBe("room-a");
    expect(page.snagFilters?.rooms).toEqual([{ id: "room-a", label: "Bedroom" }, { id: "room-b", label: "Bedroom" }]);
    const next = await service.snagging(pm, "project-a", { roomId: "room-a", limit: 1, offset: 1 });
    expect(next.items[0]!.id).not.toBe(page.items[0]!.id);
    const combined = await service.snagging(pm, "project-a", { roomId: "room-a", tradeId: "trade-a", vendorId: "vendor-a", status: "open" });
    expect(combined.total).toBe(1); expect(combined.items[0]).toMatchObject({ assignmentId: "late-work-101", tradeName: "Carpentry", vendorName: "Joinery partner" });
    expect(combined.sources).toEqual([]);
    const none = await service.snagging(pm, "project-a", { roomId: "room-b", vendorId: "vendor-b" });
    expect(none.total).toBe(0); expect(none.items).toEqual([]);
    clock = new Date("2026-10-27T10:00:00Z");
    for (const snag of created) await service.logVisit(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), snagIds: [snag.id], visitedAt: "2026-10-27T09:00:00Z", reason: "Inspected linked defect" });
    const visits = await service.snagging(pm, "project-a", { kind: "visits", roomId: "room-a", tradeId: "trade-a", limit: 1 });
    expect(visits.total).toBe(1); expect(visits.items[0]?.kind).toBe("snag_visit");
    const clientView = await service.snagging(client, "project-a", { roomId: "room-a" });
    expect(clientView.snagFilters?.vendors).toEqual([]);
    expect(clientView.items.every(item => item.ownerId === null && item.vendorId === undefined)).toBe(true);
  });
  it("offers WhatsApp composition only for an explicit valid international client number", async () => {
    expect((await service.client(pm, "project-a")).actions.some(action => action.id === "whatsapp")).toBe(false);
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { clientMobile: "+919000000000" } });
    const action = (await service.client(pm, "project-a")).actions.find(action => action.id === "whatsapp");
    expect(action?.href).toMatch(/^https:\/\/wa.me\/919000000000\?text=/);
    expect((await service.client(client, "project-a")).actions).toEqual([]);
  });
  it("persists exact idempotent receipts, rejects cross-project actors, and denies replay after reassignment", async () => {
    const input = snagInput();
    const first = await service.createSnag(pm, "project-a", input);
    expect(await service.createSnag(pm, "project-a", input)).toEqual(first);
    expect(await ProjectSnagModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "project_manager_action_recorded" })).toBe(1);
    await expect(service.createSnag(pm, "project-a", { ...input, title: "Different defect" })).rejects.toMatchObject({ status: 409 });
    await expect(service.snagging(otherPM, "project-a")).rejects.toMatchObject({ status: 404 });
    await expect(service.actSnag(designer, "project-a", first.id, { expectedVersion: 1, idempotencyKey: key(), action: "resolve", reason: "Outside PM authority" })).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: otherPM.id } });
    await expect(service.createSnag(pm, "project-a", input)).rejects.toMatchObject({ status: 404 });
  });
  it("serializes competing updates and records separate repair and verification history", async () => {
    const first = await service.createSnag(pm, "project-a", snagInput());
    const results = await Promise.allSettled(["start", "resolve"].map(action => service.actSnag(pm, "project-a", first.id, { action, expectedVersion: 1, idempotencyKey: key(), reason: "Work inspected on site" })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const current = (await ProjectSnagModel.findById(first.id).lean())!;
    const repaired = current.status === "resolved" ? current : await service.actSnag(pm, "project-a", first.id, { action: "resolve", expectedVersion: current.version, idempotencyKey: key(), reason: "Repair finished" });
    const verified = await service.actSnag(pm, "project-a", first.id, { action: "verify", expectedVersion: repaired.version, idempotencyKey: key(), reason: "Inspected repair" });
    expect(verified.status).toBe("verified");
    expect(verified.history?.map(row => row.action)).toContain("resolve");
    await service.actSnag(pm, "project-a", first.id, { action: "reopen", expectedVersion: verified.version, idempotencyKey: key(), reason: "Defect recurred after inspection" });
    expect((await ProjectSnagModel.findById(first.id).lean())?.verifiedAt).toBeNull();
    expect(await ProjectManagerEventModel.countDocuments({ entityId: first.id, action: "verify" })).toBe(1);
  });
  it("validates evidence parent, current owners and actual visit dates with rollback", async () => {
    await ProjectManagerEvidenceModel.collection.insertOne({ _id: "evidence-other", projectId: "project-b", entityId: "pm-snag-localrecord", uploaderId: otherPM.id } as any);
    await expect(service.createSnag(pm, "project-a", { ...snagInput(), recordId: "pm-snag-localrecord", evidenceIds: ["evidence-other"] })).rejects.toMatchObject({ status: 409 });
    expect(await ProjectSnagModel.countDocuments()).toBe(0);
    await expect(service.createEscalation(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), title: "Timeline delay", description: "Client requests delivery update", ownerId: otherClient.id })).rejects.toMatchObject({ status: 409 });
    const snag = await service.createSnag(pm, "project-a", snagInput());
    await expect(service.logVisit(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), snagIds: [snag.id], visitedAt: "2026-10-28T08:00:00Z", reason: "Inspect repair" })).rejects.toMatchObject({ code: "PM_VISIT_IN_FUTURE" });
    clock = new Date("2026-10-27T10:00:00Z");
    const visit = await service.logVisit(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), snagIds: [snag.id], visitedAt: "2026-10-27T09:00:00Z", reason: "Inspected existing defect" });
    expect(visit.status).toBe("recorded");
    expect(await ProjectSnagVisitModel.countDocuments()).toBe(1);
    expect((await service.snagging(client, "project-a")).items.find(item => item.id === snag.id)).toMatchObject({ evidenceIds: [], actions: [] });
  });
  it("records follow-up, explicit escalation recipient and resolution without applying estimate changes", async () => {
    const first = await service.createEscalation(pm, "project-a", { expectedVersion: 0, idempotencyKey: key(), title: "Design change", description: "Client requested a finish change" });
    const escalated = await service.actEscalation(pm, "project-a", first.id, { expectedVersion: first.version, idempotencyKey: key(), action: "escalate", ownerId: designer.id, reason: "Confirm site impact", followUpAt: "2026-10-28T08:00:00Z" });
    expect(escalated.ownerId).toBe(designer.id);
    expect((await ProjectManagerEventModel.findOne({ entityId: first.id, action: "escalate" }).lean())?.recipientIds).toContain(designer.id);
    const resolved = await service.actEscalation(pm, "project-a", first.id, { expectedVersion: escalated.version, idempotencyKey: key(), action: "resolve", reason: "Discussed with Client; approval workflow remains separate" });
    expect(resolved.status).toBe("resolved");
    expect(await EstimateModel.countDocuments()).toBe(0);
    await expect(service.actEscalation(pm, "project-a", first.id, { expectedVersion: resolved.version, idempotencyKey: key(), action: "follow_up", reason: "Cannot change closed record", followUpAt: null })).rejects.toMatchObject({ status: 409 });
  });
});

describe("snag coordination with handover", () => {
  it("blocks Site submission until repaired and verified, then blocks Client approval while allowing return for correction", async () => {
    const saved = await readyForReview();
    const snag = await service.createSnag(pm, "project-a", snagInput());
    expect((await closure.summary(admin, "project-a")).blockers).toContainEqual(expect.objectContaining({ code: "SNAGS_PENDING" }));
    await expect(completion.submit(pm, "project-a", { expectedVersion: saved.version, idempotencyKey: key(), note: "Ready" })).rejects.toMatchObject({ code: "SITE_COMPLETION_BLOCKED" });
    const verified = await resolveSnag(snag.id);
    const sent = await completion.submit(pm, "project-a", { expectedVersion: saved.version, idempotencyKey: key(), note: "Repair verified" });
    await service.actSnag(pm, "project-a", snag.id, { expectedVersion: verified.version, idempotencyKey: key(), action: "reopen", reason: "Defect recurred while awaiting Client" });
    await expect(completion.decide(client, "project-a", { expectedVersion: sent.review!.version, idempotencyKey: key(), decision: "approve", reason: null })).rejects.toMatchObject({ code: "SITE_COMPLETION_CONFLICT" });
    const returned = await completion.decide(client, "project-a", { expectedVersion: sent.review!.version, idempotencyKey: key(), decision: "request_changes", reason: "Repair the recurring defect" });
    expect(returned.status).toBe("changes_requested");
  });
  it("serializes new snags with final completion and preserves completed decisions for later defects", async () => {
    const saved = await readyForReview();
    const sent = await completion.submit(pm, "project-a", { expectedVersion: saved.version, idempotencyKey: key(), note: "Inspected" });
    await completion.decide(client, "project-a", { expectedVersion: sent.review!.version, idempotencyKey: key(), decision: "approve", reason: null });
    const ready = await closure.summary(admin, "project-a");
    const [closing, logging] = await Promise.allSettled([
      closure.complete(admin, "project-a", { expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: key() }),
      service.createSnag(pm, "project-a", snagInput())
    ]);
    expect(logging.status).toBe("fulfilled");
    const snag = (await ProjectSnagModel.findOne({ projectId: "project-a" }).lean())!;
    if (closing.status === "fulfilled") {
      expect(snag.postHandover).toBe(true);
      expect(await ProjectCompletionDecisionModel.countDocuments()).toBe(1);
    } else {
      expect(closing.reason).toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
      expect(snag.postHandover).toBe(false);
      expect(await ProjectCompletionDecisionModel.countDocuments()).toBe(0);
    }
    expect((await ProjectModel.findById("project-a").lean())?.siteCompletionFenceEpoch).toBeGreaterThan(0);
  });
});
