import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DesignerAssignmentRequestModel } from "../src/models/DesignerAssignmentRequest.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { createDesignerAssignmentService, readDesignerAssignmentEvidence } from "../src/services/designer-assignment.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { canAccessProjectForCurrentOperation } from "../src/services/workflow.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-11-25T09:00:00.000Z");
const actor = (id: string, role: PublicUser["role"]): PublicUser => ({ id, role, name: id, email: `${id}@example.test` });
const admin = actor("super-admin", "super_admin");
const designer = actor("designer-a", "designer");
const replacement = actor("designer-b", "designer");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let clock: Date;
const audit = createAuditService(createMongoRepository());
const service = () => createDesignerAssignmentService({ audit, now: () => clock });

beforeAll(async () => {
  replica = await startMongoReplicaSet("designer-assignment-tests");
  await Promise.all([DesignerAssignmentRequestModel, EstimateModel, EstimateClientReviewRoundModel, LeadModel, ProjectModel,
    ProjectWorkflowTaskModel, ProjectAccessGrantModel, UserModel, AuditEventModel, AuthorizationCoordinationModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); clock = NOW; });
afterAll(async () => { await replica?.stop(); });

async function fixture(collaborative = true) {
  await UserModel.create([admin, designer, replacement, actor("staff-admin", "admin"), actor("client", "client")].map(user => ({
    _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "unused", role: user.role, active: true
  })));
  await ProjectModel.create({ _id: "project", name: "Residence", clientId: "client", clientName: "Client", clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test", clientMobile: "9000000000", location: "Kothrud, Pune", cityName: "Pune", cityKey: "pune",
    status: "planning", assignedDesignerIds: [], primaryDesignerId: null, secondaryDesignerIds: [], designTeamVersion: 0,
    ...(collaborative ? { estimationWorkflowVersion: 3 } : {}), estimateRequirementsVersion: 0, plannedStartAt: NOW, plannedEndAt: NOW });
  await LeadModel.create({ _id: "lead", projectId: "project", ownerId: "sales", clientName: "Client", clientEmail: "client@example.test",
    clientMobile: "9000000000", projectName: "Residence", location: "Kothrud, Pune", propertyType: "villa", source: "direct",
    stage: "won", nextAction: "Assign Designer", nextActionAt: NOW, languagesKnown: ["hindi"], preferredLanguage: "hindi" });
  const snapshot = { propertyType: "villa", bedroomCount: null, rooms: ["Living Room"], scopes: ["carpentry"], selectedMainBasketIds: [], selectedMainBasketClassifications: [],
    lineItems: [{ catalogueId: "unit", roomName: "Living Room", specification: "Unit", unit: "nos", rate: 1000, quantity: 1, included: true, amount: 1000 }],
    subtotal: 1000, gst: 180, total: 1180, subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000 };
  const sourceDigest = quotationSnapshotDigest(snapshot);
  const salesApproval = { actorId: "sales", estimateVersion: 1, pricedRevision: 1, sourceDigest, approvedAt: NOW.toISOString() };
  await EstimateModel.collection.insertOne({ _id: "estimate", leadId: "lead", ownerId: "sales", projectId: "project", version: 2,
    designLifecycleVersion: 1, status: "client_approved", designPlanStatus: "pending_assignment", designPlanVersion: 0, designPlanDesignerId: null,
    ...snapshot, clientDecisionAt: NOW, createdAt: NOW, updatedAt: NOW,
    ...(collaborative ? { estimation: { ...newQuotationLifecycle(), phase: "post", status: "draft", salesApproval,
      preApproval: { reviewRoundId: "pre-round", estimateVersion: 1, approvedAt: NOW.toISOString() } } } : {}) } as never);
  if (collaborative) await EstimateClientReviewRoundModel.collection.insertOne({ _id: "pre-round", dedupeKey: "pre-round", estimateId: "estimate", projectId: "project",
    estimateVersion: 1, workflowVersion: 3, phase: "pre", requirementsVersion: 0, pricedRevision: 1, designScopeRevision: 1,
    sourceDigest, estimateSnapshot: snapshot, submittedById: "sales", salesApproval, status: "approved", decision: "approve",
    decisionSource: "client_portal", decidedById: "client", decidedAt: NOW, sendGeneration: 1, version: 2 } as never);
  return service();
}

async function requestAssignment(target = designer, key = "request-1") {
  const s = service();
  const suggestions = await s.suggestions(admin, "project");
  expect(suggestions.canRequest).toBe(true);
  return s.createRequest(admin, "project", { designerId: target.id, expectedSourceRevision: suggestions.sourceRevision!, idempotencyKey: key });
}
const accept = (id: string, target = designer, key = "accept-1") => service().decideRequest(target, id, { expectedVersion: 1, decision: "accept", idempotencyKey: key });

describe("transactional Designer assignment requests", () => {
  it("keeps a pending request private and activates all assignment effects exactly once on acceptance", async () => {
    const s = await fixture();
    const request = await requestAssignment();
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ assignedDesignerIds: [], primaryDesignerId: null });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
    expect(await ProjectAccessGrantModel.countDocuments()).toBe(0);
    const canReadProject = () => runWithHumanOperation("GET /projects/:projectId", () => canAccessProjectForCurrentOperation(createMongoRepository(), designer, "project"));
    expect(await canReadProject()).toBe(false);
    expect((await s.listInbox(replacement)).items).toEqual([]);
    const preview = (await s.listInbox(designer)).items[0]!;
    expect(preview).toMatchObject({ id: request.id, projectName: "Residence", preferredLanguage: "hindi", canDecide: true, scopeSummary: { itemCount: 1, roomCount: 1 } });
    expect(JSON.stringify(preview)).not.toMatch(/email|clientMobile|decisionNote|sourceSnapshot|salesApproval/u);
    await expect(s.decideRequest(replacement, request.id, { expectedVersion: 1, decision: "accept", idempotencyKey: "wrong" })).rejects.toMatchObject({ status: 404 });
    await expect(s.decideRequest(admin, request.id, { expectedVersion: 1, decision: "accept", idempotencyKey: "wrong" })).rejects.toMatchObject({ status: 403 });
    const accepted = await accept(request.id);
    expect(accepted).toMatchObject({ status: "accepted", version: 2, canDecide: false });
    const project = await ProjectModel.findById("project").lean();
    const task = await ProjectWorkflowTaskModel.findOne({ estimateId: "estimate" }).lean();
    expect(project).toMatchObject({ primaryDesignerId: designer.id, assignedDesignerIds: [designer.id], secondaryDesignerIds: [], designTeamVersion: 1 });
    expect(await canReadProject()).toBe(true);
    expect(await EstimateModel.findById("estimate").lean()).toMatchObject({ designPlanDesignerId: designer.id, designPlanAssignedById: admin.id, designPlanAssignedAt: NOW });
    expect(await LeadModel.findById("lead").lean()).toMatchObject({ nextAction: "Complete Internal Kick off" });
    expect(task).toMatchObject({ assigneeUserId: designer.id, openedAt: NOW });
    expect(await readDesignerAssignmentEvidence("project")).toMatchObject({ pendingRequests: [], acceptedRequest: { id: request.id, designerId: designer.id } });
    const assignmentAudit = await AuditEventModel.findOne({ action: "design_plan_designer_assigned" }).lean();
    expect(assignmentAudit).toMatchObject({ actorId: designer.id, newValues: { proposedById: admin.id, nextAction: "Complete Internal Kick off" } });
    clock = new Date(NOW.getTime() + 86400000);
    expect(await accept(request.id)).toEqual(accepted);
    expect(await ProjectWorkflowTaskModel.findById(task!._id).lean()).toEqual(task);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_accepted" })).toBe(1);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(1);
  });

  it("ranks distinct current workload before language and city and paginates after ordering", async () => {
    const s = await fixture();
    await UserModel.updateOne({ _id: designer.id }, { $set: { preferredLanguage: "hindi", languagesKnown: ["hindi"], location: "Kothrud, Pune" } });
    await UserModel.updateOne({ _id: replacement.id }, { $set: { preferredLanguage: "english", languagesKnown: ["english", "hindi"], location: "Pune" } });
    await UserModel.create({ _id: "designer-c", name: "C", email: "c@example.test", emailNormalized: "c@example.test", role: "designer", active: true, passwordHash: "unused" });
    await ProjectModel.collection.insertMany([
      { _id: "busy-one", name: "One", status: "on_hold", primaryDesignerId: designer.id, assignedDesignerIds: [designer.id], secondaryDesignerIds: [designer.id] },
      { _id: "busy-two", name: "Two", status: "active", assignedDesignerIds: [designer.id] },
      { _id: "busy-three", name: "Three", status: "planning", secondaryDesignerIds: [replacement.id] },
      { _id: "done", name: "Done", status: "completed", assignedDesignerIds: [replacement.id] },
      { _id: "historical", name: "Historical", status: "planning", initiatingDesignerId: replacement.id }
    ] as never);
    const all = await s.suggestions(admin, "project");
    expect(all.items.map(item => [item.id, item.activeProjectCount])).toEqual([["designer-c", 0], [replacement.id, 1], [designer.id, 2]]);
    expect(all.items[1]).toMatchObject({ languageMatch: "known", locationMatch: "city_text" });
    expect(all.items[2]).toMatchObject({ languageMatch: "preferred", locationMatch: "same_location" });
    expect((await s.suggestions(admin, "project", { limit: 1, offset: 1 })).items.map(item => item.id)).toEqual([replacement.id]);
    await LeadModel.updateOne({ _id: "lead" }, { $set: { preferredLanguage: "english", languagesKnown: ["english"] } });
    await ProjectModel.updateOne({ _id: "project" }, { $set: { location: "Mumbai", cityName: "Mumbai", cityKey: "mumbai" } });
    expect((await s.suggestions(admin, "project")).items[1]).toMatchObject({ languageMatch: "preferred", locationMatch: "none" });
    await expect(s.suggestions(actor("staff-admin", "admin"), "project")).rejects.toMatchObject({ status: 403 });
  });

  it("serializes competing creates and replays one creation without granting access", async () => {
    const s = await fixture();
    const source = (await s.suggestions(admin, "project")).sourceRevision!;
    const input = { designerId: designer.id, expectedSourceRevision: source, idempotencyKey: "same" };
    const results = await Promise.all([s.createRequest(admin, "project", input), s.createRequest(admin, "project", input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_requested" })).toBe(1);
    await expect(s.createRequest(admin, "project", { ...input, designerId: replacement.id })).rejects.toMatchObject({ status: 409 });
    await expect(s.createRequest(admin, "project", { ...input, idempotencyKey: "duplicate-target" })).rejects.toMatchObject({ status: 409 });
    await expect(s.createRequest(admin, "project", { ...input, designerId: replacement.id, idempotencyKey: "different" })).resolves.toMatchObject({ designer: { id: replacement.id }, status: "pending" });
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending" })).toBe(2);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
  });

  it("resolves accept/cancel races as one atomic outcome", async () => {
    const s = await fixture();
    const request = await requestAssignment();
    const outcomes = await Promise.allSettled([accept(request.id), s.cancelRequest(admin, "project", request.id, { expectedVersion: 1, idempotencyKey: "cancel" })]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const stored = await DesignerAssignmentRequestModel.findById(request.id).lean();
    expect(["accepted", "cancelled"]).toContain(stored!.status);
    const project = await ProjectModel.findById("project").lean();
    expect(project!.primaryDesignerId).toBe(stored!.status === "accepted" ? designer.id : null);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(stored!.status === "accepted" ? 1 : 0);
    expect(await AuditEventModel.countDocuments({ action: { $in: ["designer_assignment_accepted", "designer_assignment_cancelled"] } })).toBe(1);
  });

  it("allows different-target concurrent requests and commits only the first acceptance", async () => {
    const s = await fixture();
    const source = (await s.suggestions(admin, "project")).sourceRevision!;
    const requests = await Promise.all([designer, replacement].map(target => s.createRequest(admin, "project", {
      designerId: target.id, expectedSourceRevision: source, idempotencyKey: `request-${target.id}`
    })));
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending" })).toBe(2);
    const outcomes = await Promise.allSettled(requests.map((request, index) => accept(request.id, [designer, replacement][index])));
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409, message: expect.stringContaining("no longer available") } });
    const winnerIndex = outcomes.findIndex(result => result.status === "fulfilled");
    const winner = [designer, replacement][winnerIndex]!;
    const loser = [designer, replacement][1 - winnerIndex]!;
    const winnerRequest = requests[winnerIndex]!;
    const loserRequest = requests[1 - winnerIndex]!;
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: winner.id, designTeamVersion: 1 });
    expect(await DesignerAssignmentRequestModel.findById(loserRequest.id).lean()).toMatchObject({ status: "cancelled", closureReason: "assigned_elsewhere",
      version: 2, decidedById: winner.id, decidedAt: NOW, decisionIdempotencyKey: null, decisionPayloadDigest: null });
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending" })).toBe(0);
    expect(await AuditEventModel.findOne({ action: "designer_assignment_cancelled" }).lean()).toMatchObject({ actorId: winner.id,
      newValues: { requestId: loserRequest.id, acceptedRequestId: winnerRequest.id, automatic: true, closureReason: "assigned_elsewhere" } });
    const loserInbox = (await s.listInbox(loser, { status: "cancelled" })).items[0]!;
    expect(loserInbox).toMatchObject({ closureReason: "assigned_elsewhere", canDecide: false, blockedReason: expect.stringContaining("no longer available") });
    expect(JSON.stringify(loserInbox)).not.toContain(JSON.stringify(winner.id));
    expect(JSON.stringify(loserInbox)).not.toContain(winnerRequest.id);
    for (const target of [winner, loser]) {
      expect(await runWithHumanOperation("GET /projects/:projectId", () => canAccessProjectForCurrentOperation(createMongoRepository(), target, "project"))).toBe(target.id === winner.id);
    }
    const winnerResult = outcomes[winnerIndex] as PromiseFulfilledResult<Awaited<ReturnType<typeof accept>>>;
    expect(await accept(winnerRequest.id, winner)).toEqual(winnerResult.value);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_accepted" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_cancelled" })).toBe(1);
  });

  it("returns all pending requests across search/pages and scopes evidence and closures to the project", async () => {
    const s = await fixture();
    const third = actor("designer-third", "designer");
    await UserModel.create({ _id: third.id, name: third.name, email: third.email, emailNormalized: third.email, role: third.role, active: true, passwordHash: "unused" });
    const first = await requestAssignment();
    const single = await s.suggestions(admin, "project");
    expect(single).toMatchObject({ canRequest: true, pendingRequest: { id: first.id }, pendingRequests: [{ id: first.id }] });
    expect(single.items.find(item => item.id === designer.id)).toMatchObject({ eligible: false });
    expect(single.items.find(item => item.id === replacement.id)).toMatchObject({ eligible: true });
    const second = await requestAssignment(replacement, "second");
    const thirdRequest = await requestAssignment(third, "third");
    const stored = await DesignerAssignmentRequestModel.findById(first.id).lean();
    await DesignerAssignmentRequestModel.collection.insertOne({ ...stored, _id: "other-project-request", projectId: "other-project", createIdempotencyKey: "other" } as never);
    const page = await s.suggestions(admin, "project", { search: replacement.name, limit: 1, offset: 0 });
    expect(page.items.map(item => item.id)).toEqual([replacement.id]);
    expect(page).toMatchObject({ canRequest: true, pendingRequest: null });
    expect(page.pendingRequests.map(request => request.id).sort()).toEqual([first.id, second.id, thirdRequest.id].sort());
    const evidence = await readDesignerAssignmentEvidence("project");
    expect(evidence.pendingRequests.map(request => request.id).sort()).toEqual([first.id, second.id, thirdRequest.id].sort());
    expect(evidence.acceptedRequest).toBeNull();
    await accept(first.id);
    expect(await DesignerAssignmentRequestModel.findById("other-project-request").lean()).toMatchObject({ status: "pending", version: 1 });
    expect(await DesignerAssignmentRequestModel.countDocuments({ projectId: "project", status: "cancelled", closureReason: "assigned_elsewhere" })).toBe(2);
    expect(await readDesignerAssignmentEvidence("project")).toMatchObject({ pendingRequests: [], acceptedRequest: { id: first.id } });
  });

  it("closes older-source competitors and preserves already declined or cancelled history", async () => {
    const s = await fixture();
    const stale = await requestAssignment();
    await EstimateModel.updateOne({ _id: "estimate" }, { $inc: { version: 1 } });
    const winner = await requestAssignment(replacement, "fresh");
    await expect(accept(stale.id)).rejects.toMatchObject({ code: "DESIGN_ASSIGNMENT_SOURCE_CHANGED" });
    const row = await DesignerAssignmentRequestModel.findById(stale.id).lean();
    await DesignerAssignmentRequestModel.collection.insertMany([
      { ...row, _id: "old-declined", createIdempotencyKey: "old-declined", status: "declined", version: 2, decisionNote: "Historical note" },
      { ...row, _id: "old-cancelled", createIdempotencyKey: "old-cancelled", status: "cancelled", version: 2, closureReason: "cancelled_by_admin" }
    ] as never);
    const history = await DesignerAssignmentRequestModel.find({ _id: { $in: ["old-declined", "old-cancelled"] } }).sort({ _id: 1 }).lean();
    await accept(winner.id, replacement);
    expect(await DesignerAssignmentRequestModel.findById(stale.id).lean()).toMatchObject({ status: "cancelled", closureReason: "assigned_elsewhere", version: 2 });
    expect(await DesignerAssignmentRequestModel.find({ _id: { $in: ["old-declined", "old-cancelled"] } }).sort({ _id: 1 }).lean()).toEqual(history);
  });

  it("does not leave an old-source request actionable when creation races with acceptance", async () => {
    const s = await fixture();
    const first = await requestAssignment();
    const source = (await s.suggestions(admin, "project")).sourceRevision!;
    const [created, accepted] = await Promise.allSettled([
      s.createRequest(admin, "project", { designerId: replacement.id, expectedSourceRevision: source, idempotencyKey: "racing-create" }),
      accept(first.id)
    ]);
    expect(accepted.status).toBe("fulfilled");
    if (created.status === "fulfilled") {
      expect(await DesignerAssignmentRequestModel.findById(created.value.id).lean()).toMatchObject({ status: "cancelled", closureReason: "assigned_elsewhere" });
    } else expect(created.reason).toMatchObject({ code: "DESIGN_ASSIGNMENT_SOURCE_CHANGED" });
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending" })).toBe(0);
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: designer.id });
    // A new, deliberate replacement request still works after refreshing the source.
    expect(await requestAssignment(replacement, "fresh-replacement")).toMatchObject({ status: "pending" });
  });

  it.each(["cancel", "decline"] as const)("keeps a competing %s decision truthful when it races with acceptance", async action => {
    const s = await fixture();
    const first = await requestAssignment();
    const second = await requestAssignment(replacement, "second");
    const decision = () => action === "cancel"
      ? s.cancelRequest(admin, "project", second.id, { expectedVersion: 1, idempotencyKey: "cancel-second" })
      : s.decideRequest(replacement, second.id, { expectedVersion: 1, decision: "decline", idempotencyKey: "decline-second" });
    const [decided, accepted] = await Promise.allSettled([decision(), accept(first.id)]);
    expect(accepted.status).toBe("fulfilled");
    const closed = await DesignerAssignmentRequestModel.findById(second.id).lean();
    if (decided.status === "fulfilled") {
      expect(closed).toMatchObject({ status: action === "cancel" ? "cancelled" : "declined", closureReason: action === "cancel" ? "cancelled_by_admin" : null,
        decidedById: action === "cancel" ? admin.id : replacement.id, version: 2 });
    } else {
      expect(decided.reason).toMatchObject({ status: 409 });
      expect(closed).toMatchObject({ status: "cancelled", closureReason: "assigned_elsewhere", decidedById: designer.id, version: 2 });
    }
    expect(await AuditEventModel.countDocuments({ action: { $in: ["designer_assignment_declined", "designer_assignment_cancelled"] } })).toBe(1);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(1);
  });

  it.each(["cancel", "decline"] as const)("leaves other requests pending after an individual %s", async action => {
    const s = await fixture();
    const first = await requestAssignment();
    const second = await requestAssignment(replacement, "second");
    if (action === "cancel") await s.cancelRequest(admin, "project", first.id, { expectedVersion: 1, idempotencyKey: "cancel" });
    else await s.decideRequest(designer, first.id, { expectedVersion: 1, decision: "decline", idempotencyKey: "decline" });
    expect(await DesignerAssignmentRequestModel.findById(second.id).lean()).toMatchObject({ status: "pending", version: 1 });
    expect((await s.listInbox(replacement)).items[0]).toMatchObject({ canDecide: true });
    await accept(second.id, replacement);
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: replacement.id });
  });

  it("rejects ambiguous project/estimate lineage and completed design reassignment", async () => {
    const s = await fixture();
    const original = await EstimateModel.findById("estimate").lean();
    await EstimateModel.collection.insertOne({ ...original, _id: "second-estimate", leadId: "conflicting-lead" } as never);
    await expect(s.suggestions(admin, "project")).rejects.toMatchObject({ status: 409 });
    await EstimateModel.deleteOne({ _id: "second-estimate" });
    await EstimateModel.updateOne({ _id: "estimate" }, { $set: { designPlanStatus: "approved" } });
    expect(await s.suggestions(admin, "project")).toMatchObject({ canRequest: false, blockedReason: "The approved Design plan cannot be reassigned." });
    expect(await DesignerAssignmentRequestModel.countDocuments()).toBe(0);
  });

  it("rolls back request, team, estimate, lead, task and audit when acceptance fails", async () => {
    await fixture();
    const request = await requestAssignment();
    const competing = await requestAssignment(replacement, "competing");
    const before = await Promise.all([ProjectModel.findById("project").lean(), EstimateModel.findById("estimate").lean(), LeadModel.findById("lead").lean()]);
    const failingAudit = { ...audit, appendInMongoTransaction: async (...args: Parameters<typeof audit.appendInMongoTransaction>) => {
      const result = await audit.appendInMongoTransaction(...args);
      if (args[0].action === "designer_assignment_accepted") throw new Error("Synthetic audit failure");
      return result;
    } };
    const failing = createDesignerAssignmentService({ audit: failingAudit, now: () => clock });
    await expect(failing.decideRequest(designer, request.id, { decision: "accept", expectedVersion: 1, idempotencyKey: "accept" })).rejects.toThrow("Synthetic audit failure");
    expect(await Promise.all([ProjectModel.findById("project").lean(), EstimateModel.findById("estimate").lean(), LeadModel.findById("lead").lean()])).toEqual(before);
    expect(await DesignerAssignmentRequestModel.findById(request.id).lean()).toMatchObject({ status: "pending", version: 1 });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
    expect(await DesignerAssignmentRequestModel.findById(competing.id).lean()).toMatchObject({ status: "pending", version: 1, closureReason: null, decidedAt: null });
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it("retains the old Designer until replacement acceptance and preserves the original task deadline", async () => {
    await fixture();
    const first = await requestAssignment();
    await accept(first.id);
    const originalTask = await ProjectWorkflowTaskModel.findOne({ estimateId: "estimate" }).lean();
    const next = await requestAssignment(replacement, "replacement");
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: designer.id });
    clock = new Date(NOW.getTime() + 12 * 3600000);
    await accept(next.id, replacement, "replacement-accept");
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: replacement.id, designTeamVersion: 2 });
    expect(await ProjectWorkflowTaskModel.findById(originalTask!._id).lean()).toMatchObject({ assigneeUserId: replacement.id, openedAt: originalTask!.openedAt, dueAt: originalTask!.dueAt });
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "accepted" })).toBe(2);
  });

  it("declines and cancels idempotently without changing the assignment or exposing the decline note", async () => {
    const s = await fixture();
    const request = await requestAssignment();
    const body = { expectedVersion: 1, decision: "decline" as const, idempotencyKey: "decline", note: "Private workload explanation" };
    const declined = await s.decideRequest(designer, request.id, body);
    expect(await s.decideRequest(designer, request.id, body)).toEqual(declined);
    expect(JSON.stringify(declined)).not.toContain("Private workload");
    expect((await s.listProjectRequests(admin, "project")).items[0]!.note).toBe("Private workload explanation");
    const next = await requestAssignment(replacement, "next");
    const cancellation = { expectedVersion: 1, idempotencyKey: "cancel" };
    const cancelled = await s.cancelRequest(admin, "project", next.id, cancellation);
    expect(await s.cancelRequest(admin, "project", next.id, cancellation)).toEqual(cancelled);
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: null });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_declined" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_cancelled" })).toBe(1);
  });

  it("rejects stale source, deactivated target, completed project and invalid approval without partial state", async () => {
    const s = await fixture();
    const request = await requestAssignment();
    await UserModel.updateOne({ _id: designer.id }, { $set: { active: false } });
    await expect(accept(request.id)).rejects.toMatchObject({ status: 403 });
    await UserModel.updateOne({ _id: designer.id }, { $set: { active: true } });
    await EstimateModel.updateOne({ _id: "estimate" }, { $inc: { version: 1 } });
    await expect(accept(request.id)).rejects.toMatchObject({ code: "DESIGN_ASSIGNMENT_SOURCE_CHANGED" });
    expect((await s.listInbox(designer)).items[0]).toMatchObject({ canDecide: false, blockedReason: expect.any(String) });
    await EstimateModel.updateOne({ _id: "estimate" }, { $inc: { version: -1 } });
    await ProjectModel.updateOne({ _id: "project" }, { $set: { status: "completed" } });
    await expect(accept(request.id)).rejects.toMatchObject({ status: 409 });
    await ProjectModel.updateOne({ _id: "project" }, { $set: { status: "planning" } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "pre-round" } as never, { $set: { decidedById: "wrong-client" } });
    await expect(accept(request.id)).rejects.toMatchObject({ code: "DESIGN_ASSIGNMENT_SOURCE_CHANGED" });
    expect(await DesignerAssignmentRequestModel.findById(request.id).lean()).toMatchObject({ status: "pending" });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
  });

  it("leaves every request pending when the proposing Super Admin is no longer active", async () => {
    await fixture();
    const first = await requestAssignment();
    await requestAssignment(replacement, "second");
    await UserModel.updateOne({ _id: admin.id }, { $set: { active: false } });
    await expect(accept(first.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Super Admin is no longer active") });
    expect(await DesignerAssignmentRequestModel.countDocuments({ status: "pending", version: 1 })).toBe(2);
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ primaryDesignerId: null });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "designer_assignment_cancelled" })).toBe(0);
  });

  it("reads historical cancellation without inventing a closure reason", async () => {
    const s = await fixture();
    const request = await requestAssignment();
    await DesignerAssignmentRequestModel.collection.updateOne({ _id: request.id } as never,
      { $set: { status: "cancelled", decidedAt: NOW, version: 2 }, $unset: { closureReason: "" } });
    expect((await s.listProjectRequests(admin, "project")).items[0]).toMatchObject({ status: "cancelled", closureReason: null });
    expect((await s.listInbox(designer, { status: "cancelled" })).items[0]).toMatchObject({ status: "cancelled", closureReason: null, canDecide: false });
  });

  it("blocks immediate assignment and treats legacy accepted assignments as existing without fabricated request history", async () => {
    await fixture(false);
    const workflow = createProjectWorkflowService({ storage: {} as never, mailer: { deliveryKind: "disabled" }, portalUrl: "https://portal.example.test", audit });
    await expect(workflow.assignDesigner(admin, "project", designer.id)).rejects.toMatchObject({ code: "DESIGNER_ACCEPTANCE_REQUIRED" });
    await ProjectModel.updateOne({ _id: "project" }, { $set: { assignedDesignerIds: [designer.id] } });
    await EstimateModel.updateOne({ _id: "estimate" }, { $set: { designPlanDesignerId: designer.id, designPlanStatus: "assigned", designPlanAssignedAt: NOW } });
    expect(await readDesignerAssignmentEvidence("project")).toEqual({ pendingRequests: [], acceptedRequest: null });
    expect((await service().suggestions(admin, "project")).currentDesigner).toEqual({ id: designer.id, name: designer.name });
    const replacementRequest = await requestAssignment(replacement);
    await accept(replacementRequest.id, replacement);
    expect(await ProjectModel.findById("project").lean()).toMatchObject({ assignedDesignerIds: [replacement.id] });
  });
});
