import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { DesignRequirementsStateModel } from "../src/models/DesignRequirementsState.js";
import { ProjectManagerRequestModel } from "../src/models/ProjectManagerRequest.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { ProjectSupplyMilestoneModel } from "../src/models/ProjectSupplyMilestone.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { normalizeDesignRules } from "../src/domain/main-line-design-rules.js";
import { createProjectManagerRequestsSupplyService } from "../src/services/project-manager/requests.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-27T08:00:00.000Z");
const pm: PublicUser = { id: "pm-a", name: "PM A", email: "pm-a@example.test", role: "site_manager" };
const otherPM: PublicUser = { ...pm, id: "pm-b", email: "pm-b@example.test" };
const designer: PublicUser = { id: "designer-a", name: "Designer A", email: "designer-a@example.test", role: "designer" };
const otherDesigner: PublicUser = { ...designer, id: "designer-b", email: "designer-b@example.test" };
const buyer: PublicUser = { id: "buyer-a", name: "Buyer A", email: "buyer-a@example.test", role: "procurement" };
const otherBuyer: PublicUser = { ...buyer, id: "buyer-b", email: "buyer-b@example.test" };
const audit = createAuditService(createMemoryRepository());
const service = createProjectManagerRequestsSupplyService({ audit, now: () => at });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-requests-isolated");
  await Promise.all([ProjectModel, UserModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, DesignRequirementsStateModel, ProjectManagerRequestModel, ProjectManagerEventModel,
    ProjectSupplyMilestoneModel, ProjectProcurementItemModel, AuditEventModel, AuthorizationCoordinationModel].map(model => model.syncIndexes()));
}, 120_000);
afterAll(async () => replica?.stop());
beforeEach(async () => {
  vi.restoreAllMocks(); await replica.clear();
  await UserModel.create([pm, otherPM, designer, otherDesigner, buyer, otherBuyer].map(user => ({ ...user, _id: user.id, emailNormalized: user.email, passwordHash: "fixture-only", active: true })));
  await ProjectModel.create({ _id: "project-a", name: "Synthetic A", clientName: "Client A", clientEmail: "client-a@example.test", clientEmailNormalized: "client-a@example.test",
    clientMobile: "9000000000", status: "active", programManagerId: pm.id, assignedDesignerIds: [designer.id], plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00Z") });
  await ProjectWorkflowTaskModel.create({ _id: "proc-a", dedupeKey: "proc-a", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
    kind: "procurement", title: "Procurement", assigneeRole: "procurement", assigneeUserId: buyer.id, openedAt: at });
  const line = { id: "line-a", catalogueId: "CA01", roomName: "Living", roomId: "room-a", specification: "Material A", unit: "nos", quantity: 2, rate: 100, included: true, amount: 200 };
  await EstimateModel.create({ _id: "estimate-a", leadId: "lead-a", ownerId: designer.id, projectId: "project-a", status: "client_approved", version: 2, propertyType: "villa", lineItems: [{ ...line, source: "configuration", mainLineId: "main-a" }],
    subtotal: 200, gst: 36, total: 236, reviews: [{ actorId: designer.id, action: "client_approved", note: "Approved", occurredAt: at }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: designer.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: at });
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "round-a", estimateId: "estimate-a", estimateVersion: 1, status: "approved", decision: "approve", decisionSource: "admin_proof", decidedAt: at, decidedById: designer.id,
    estimateSnapshot: { clientName: "Client A", projectName: "Synthetic A", location: "Fixture", propertyType: "villa", lineItems: [line], subtotal: 200, gst: 36, total: 236 } } as never);
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: "main-a", name: "Material A", nameNormalized: "material-a", basketId: "basket-a", subBasketId: "sub-a", status: "draft", itemType: "main_line", draftRevisionId: "revision-a", activeRevisionId: null, version: 1 } as never);
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "revision-a", mainLineId: "main-a", revisionNumber: 1, status: "draft", version: 1 } as never);
  await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: "design-a", mainLineId: "main-a", revisionId: "revision-a", sectionKey: "design", payload: normalizeDesignRules({ answers: { physicalSampleApproval: true, installationMethod: true } }) } as never);
});
const command = (item: { version: number; sourceToken: string | null }, action: string, key: string) => ({ expectedVersion: item.version, sourceToken: item.sourceToken, action, reason: "Recorded inspection details", idempotencyKey: key });

describe("PM request and supply transactions", () => {
  it("scopes reads and acknowledgements, preserves Designer decision authority and replays once", async () => {
    await expect(service.selections(otherPM, "project-a")).rejects.toMatchObject({ status: 404 });
    const view = await service.selections(pm, "project-a"); const item = view.items[0]!;
    expect(item.status).toBe("acknowledgement_required");
    const input = command(item, "acknowledge", "acknowledgement-1");
    const results = await Promise.all([service.actRequest(pm, "project-a", "selection", item.id, input), service.actRequest(pm, "project-a", "selection", item.id, input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(1);
    expect(await DesignRequirementsStateModel.countDocuments({ "history.action": { $in: ["approve", "complete"] } })).toBe(0);
    expect((await service.selections(pm, "project-a")).items[0]!.facts).toContainEqual({ label: "Design decision", value: "pending" });
    await expect(service.actRequest(designer, "project-a", "selection", item.id, input)).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: otherPM.id } });
    await expect(service.actRequest(pm, "project-a", "selection", item.id, input)).rejects.toMatchObject({ status: 404 });
  });
  it("withdraws supply sign-offs from a split manager assignment without changing existing signatures", async () => {
    const item = (await service.supply(pm, "project-a")).items[0]!;
    const first = await service.actSupply(pm, "project-a", item.id, command(item, "sign_off", "supply-before-split"));
    await ProjectWorkflowTaskModel.create({ _id: "site-a", dedupeKey: "site-a", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1,
      kind: "site_execution", title: "Site execution", assigneeRole: "site_manager", assigneeUserId: otherPM.id, openedAt: at });
    await expect(service.supply(pm, "project-a")).rejects.toMatchObject({ status: 404 });
    const counterpart = await service.supply(designer, "project-a");
    expect(counterpart.issues).toContain("Assign an active Project Manager and Designer before recording supply sign-offs.");
    expect(counterpart.people.some(person => person.id === pm.id || person.id === otherPM.id)).toBe(false);
    await expect(service.actSupply(designer, "project-a", item.id, command(first, "sign_off", "supply-after-split"))).rejects.toMatchObject({ status: 409 });
    expect((await ProjectSupplyMilestoneModel.findOne({ projectId: "project-a" }).lean())?.signatures).toHaveLength(1);
    expect(await ProjectManagerEventModel.countDocuments({ family: "supply" })).toBe(1);
  });
  it("records separate current reviewer signatures, keeps old history and invalidates source changes", async () => {
    const view = await service.supply(pm, "project-a"); const item = view.items[0]!;
    const first = await service.actSupply(pm, "project-a", item.id, command(item, "sign_off", "supply-sign-pm"));
    expect(first.status).toBe("awaiting_cosign");
    await expect(service.actSupply(otherDesigner, "project-a", item.id, command(first, "sign_off", "supply-wrong-designer"))).rejects.toMatchObject({ status: 404 });
    const signed = await service.actSupply(designer, "project-a", item.id, command(first, "sign_off", "supply-sign-designer"));
    expect(signed.status).toBe("signed_off");
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: "revision-a" }, { $inc: { version: 1 } });
    await expect(service.actSupply(pm, "project-a", item.id, command(signed, "reopen", "supply-reopen-stale"))).rejects.toMatchObject({ status: 409 });
    const refreshed = await service.supply(pm, "project-a");
    expect(refreshed.items.find(row => row.id === item.id)).toMatchObject({ version: 0, status: "awaiting_signoff" });
    expect(refreshed.items.some(row => row.kind === "supply_history")).toBe(true);
    expect(await ProjectManagerEventModel.countDocuments({ family: "supply" })).toBe(2);
  });
  it("rolls back signatures and notifications on audit failure and rejects cross-record evidence", async () => {
    const item = (await service.supply(pm, "project-a")).items[0]!;
    await expect(service.actSupply(pm, "project-a", item.id, { ...command(item, "sign_off", "supply-cross-evidence"), evidenceIds: ["foreign-evidence"] })).rejects.toMatchObject({ status: 409 });
    const failing = createProjectManagerRequestsSupplyService({ audit: { ...audit, appendInMongoTransaction: vi.fn().mockRejectedValue(new Error("audit unavailable")) }, now: () => at });
    await expect(failing.actSupply(pm, "project-a", item.id, command(item, "sign_off", "supply-audit-failure"))).rejects.toThrow("audit unavailable");
    expect(await ProjectSupplyMilestoneModel.countDocuments()).toBe(0);
    expect(await ProjectManagerEventModel.countDocuments()).toBe(0);
  });
  it("pages current supply records before immutable history without losing the total", async () => {
    const first = await service.supply(pm, "project-a", { limit: 1, offset: 0 });
    const second = await service.supply(pm, "project-a", { limit: 1, offset: 1 });
    expect(first.total).toBe(2); expect(second.total).toBe(2);
    expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    expect((await service.supply(pm, "project-a", { limit: 1, offset: 2 })).items).toEqual([]);
  });
  it("routes material requests to the exact Procurement receiver and validates fulfillment lineage", async () => {
    const panel = await service.procurement(pm, "project-a"); const source = panel.sources[0]!;
    expect(source).toBeDefined();
    const create = { sourceId: source.id, sourceToken: source.sourceToken, expectedVersion: 0, idempotencyKey: "material-create-1", reason: "Required before installation", quantity: 1.25, unit: source.unit };
    await expect(service.createRequest(pm, "project-a", "procurement", { ...create, quantity: 3 })).rejects.toMatchObject({status:409});
    await expect(service.createRequest(pm, "project-a", "procurement", { ...create, unit: "wrong-unit" })).rejects.toMatchObject({status:409});
    const request = await service.createRequest(pm, "project-a", "procurement", create);
    expect(request.facts).toContainEqual({label:"Requested quantity",value:`1.25 ${source.unit}`});
    expect((await ProjectManagerRequestModel.findById(request.id).lean())!.quantityMilliUnits).toBe(1250);
    await expect(service.actRequest(pm, "project-a", "procurement", request.id, { ...command(request, "fulfill", "material-pm-forbidden"), artifact: { kind: "procurement_item", id: "item-a" } })).rejects.toMatchObject({ status: 409 });
    await expect(service.actRequest(otherBuyer, "project-a", "procurement", request.id, command(request, "acknowledge", "material-other-forbidden"))).rejects.toMatchObject({ status: 404 });
    const acknowledged = await service.actRequest(buyer, "project-a", "procurement", request.id, command(request, "acknowledge", "material-acknowledge"));
    await ProjectProcurementItemModel.collection.insertOne({ _id: "item-b", projectId: "project-b", estimateId: "estimate-a", estimateVersion: 1, sourceSectionId: source.sectionId, sourceLineItemKey: source.id, removedAt: null } as never);
    await expect(service.actRequest(buyer, "project-a", "procurement", request.id, { ...command(acknowledged, "fulfill", "material-wrong-project"), artifact: { kind: "procurement_item", id: "item-b" } })).rejects.toMatchObject({ status: 409 });
    await ProjectProcurementItemModel.collection.insertOne({ _id: "item-a", projectId: "project-a", estimateId: "estimate-a", estimateVersion: 1, sourceSectionId: source.sectionId, sourceLineItemKey: source.id, removedAt: null } as never);
    const fulfilled = await service.actRequest(buyer, "project-a", "procurement", request.id, { ...command(acknowledged, "fulfill", "material-fulfilled"), artifact: { kind: "procurement_item", id: "item-a" } });
    expect(fulfilled.status).toBe("fulfilled");
    expect(await ProjectManagerEventModel.countDocuments({ recipientIds: buyer.id })).toBe(1);
    expect(fulfilled.facts.some(fact => fact.value.includes("Paid") || fact.value.includes("Delivered"))).toBe(false);
  });
  it("blocks stale or ambiguous receiving ownership and preserves a reasoned reopened round", async () => {
    const source = (await service.procurement(pm, "project-a")).sources[0]!;
    await ProjectWorkflowTaskModel.create({ _id: "proc-duplicate", dedupeKey: "proc-duplicate", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1, kind: "procurement", title: "Other", assigneeRole: "procurement", assigneeUserId: buyer.id, openedAt: at });
    await expect(service.createRequest(pm, "project-a", "procurement", { sourceId: source.id, sourceToken: source.sourceToken, expectedVersion: 0, idempotencyKey: "material-ambiguous", reason: "Required before installation" })).rejects.toMatchObject({ status: 409 });
    const item = (await service.supply(pm, "project-a")).items[0]!;
    const first = await service.actSupply(pm, "project-a", item.id, command(item, "sign_off", "supply-round-one"));
    const reopened = await service.actSupply(pm, "project-a", item.id, command(first, "reopen", "supply-round-reopen"));
    expect(reopened).toMatchObject({ round: 2, signatures: [] });
    const event = await ProjectManagerEventModel.findOne({ idempotencyKey: "supply-round-one" }).lean();
    expect(event!.result.signatures).toHaveLength(1);
  });
});
