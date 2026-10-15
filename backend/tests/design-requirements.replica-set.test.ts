import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDesignRules, type DesignRules } from "../src/domain/main-line-design-rules.js";
import type { DesignRequirementActionInput } from "../src/domain/design-requirements.js";
import { ProjectModel } from "../src/models/Project.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { UserModel } from "../src/models/User.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { DesignRequirementsStateModel } from "../src/models/DesignRequirementsState.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { assertDesignRequirementsPoAllowed, assertDesignRequirementsSubmissionAllowed, createDesignRequirementsService, designRequirementsPoBlockers } from "../src/services/design-requirements.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const PROJECT = "design-requirements-project", ESTIMATE = "design-requirements-estimate";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("design-requirements-regression");
  await Promise.all([ProjectModel, EstimateModel, UserModel, DesignRequirementsStateModel, DesignWorkflowStateModel, ProjectWorkflowTaskModel,
    AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AuditEventModel, AuthorizationCoordinationModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup() {
  const users = ["designer", "client", "procurement", "super_admin"].map(role => demoSeedData.users.find(user => user.role === role)!);
  await UserModel.create(users.map(user => ({ ...user, _id: user.id })));
  const actor = (role: string): PublicUser => { const row = users.find(user => user.role === role)!; return { id: row.id, name: row.name, email: row.email, role: row.role }; };
  const designer = actor("designer"), client = actor("client"), procurement = actor("procurement"), admin = actor("super_admin");
  await ProjectModel.create({ ...demoSeedData.projects[0]!, _id: PROJECT, clientId: client.id, clientMobile: "9000000000", assignedDesignerIds: [designer.id] });
  await EstimateModel.create({ _id: ESTIMATE, leadId: "design-requirements-lead", ownerId: designer.id, projectId: PROJECT, status: "client_approved", version: 5,
    propertyType: "2BHK", lineItems: ["a", "b"].map(id => ({ id: `estimate-line-${id}`, mainLineId: `main-${id}`, catalogueId: `main-${id}`, source: "configuration", roomName: "Living", unit: "nos", quantity: 1, included: true })) });
  await ProjectWorkflowTaskModel.create({ _id: "procurement-task", dedupeKey: "procurement-task", projectId: PROJECT, estimateId: ESTIMATE, designPlanVersion: 0,
    kind: "procurement", title: "Procurement preparation", assigneeRole: "procurement", assigneeUserId: procurement.id, preparationOnly: true, openedAt: new Date("2026-10-10T00:00:00Z") });
  const rules = normalizeDesignRules({ answers: { designerPoApproval: true, physicalSampleApproval: true, clientFinishApproval: true, stockCheck: true, installationMethod: true },
    poApprovalChecklist: [{ id: "point-one", text: "Verify the drawing" }] });
  await configuration("a", rules);
  await configuration("b", normalizeDesignRules());
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const service = createDesignRequirementsService({ repository, audit, clock: () => new Date("2026-10-14T00:00:00Z") });
  let seq = 0;
  const input = async (who: PublicUser, ruleKey: string, action: DesignRequirementActionInput["action"], extra: Partial<DesignRequirementActionInput> = {}) => {
    const view = await service.get(who, PROJECT);
    return { expectedVersion: view.version, sourceToken: view.sourceToken, entryId: view.entries.find(row => row.ruleKey === ruleKey)!.id,
      action, note: "Recorded inspection evidence", checkedPointIds: [], idempotencyKey: `requirement-action-${++seq}`, ...extra } satisfies DesignRequirementActionInput;
  };
  const po = async (keys = ["estimate-line-a"]) => {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => { await assertDesignRequirementsPoAllowed(PROJECT, keys, session); }); }
    finally { await session.endSession(); }
  };
  return { repository, service, audit, designer, client, procurement, admin, rules, input, po };
}
async function configuration(suffix: string, rules: DesignRules) {
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: `main-${suffix}`, name: `Item ${suffix}`, nameNormalized: `item-${suffix}`, basketId: "basket-one", subBasketId: "sub-one",
    status: "draft", itemType: "main_line", draftRevisionId: `revision-${suffix}`, activeRevisionId: null, version: 1 } as never);
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `revision-${suffix}`, mainLineId: `main-${suffix}`, revisionNumber: 1, status: "draft", version: 1 } as never);
  await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: `design-${suffix}`, mainLineId: `main-${suffix}`, revisionId: `revision-${suffix}`, sectionKey: "design", payload: rules } as never);
}

describe("Design requirements transaction and source gates", () => {
  it("keeps reads side-effect free and requires real exact-line Designer PO approval", async () => {
    const f = await setup();
    const view = await f.service.get(f.designer, PROJECT);
    expect(view.entries).toHaveLength(5);
    expect(await DesignRequirementsStateModel.countDocuments()).toBe(0);
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    expect(await DesignRequirementsStateModel.countDocuments()).toBe(0);
    await expect(f.po(["estimate-line-b"])).resolves.toBeUndefined();
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }));
    await expect(f.po()).resolves.toBeUndefined();
    expect(await designRequirementsPoBlockers(PROJECT, ["estimate-line-a"])).toEqual([]);
  });

  it("serializes concurrent actions, replays identical requests and rolls back audit failures", async () => {
    const f = await setup();
    const action = await f.input(f.designer, "installationMethod", "complete");
    const outcomes = await Promise.all([f.service.act(f.designer, PROJECT, action), f.service.act(f.designer, PROJECT, action)]);
    expect(outcomes.map(row => row.replayed).sort()).toEqual([false, true]);
    expect((await DesignRequirementsStateModel.findById(PROJECT).select("+history").lean())!.history).toHaveLength(1);
    const broken = createDesignRequirementsService({ repository: f.repository, audit: { ...f.audit, append: vi.fn().mockRejectedValue(new Error("audit unavailable")) } });
    await expect(broken.act(f.designer, PROJECT, await f.input(f.designer, "physicalSampleApproval", "approve"))).rejects.toThrow("audit unavailable");
    expect((await DesignRequirementsStateModel.findById(PROJECT).select("+history").lean())!.history).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ action: "design_requirement_action_recorded" })).toBe(1);
  });

  it("invalidates source changes and reassignment while preserving old approval evidence", async () => {
    const f = await setup();
    const oldInput = await f.input(f.designer, "physicalSampleApproval", "approve");
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }));
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: "revision-a" }, { $inc: { version: 1 } });
    await expect(f.service.act(f.designer, PROJECT, oldInput)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_CONFLICT" });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    expect((await DesignRequirementsStateModel.findById(PROJECT).select("+history").lean())!.history).toHaveLength(1);
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }));
    await ProjectModel.updateOne({ _id: PROJECT }, { $set: { assignedDesignerIds: [] } });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
  });

  it("lets only the actual Client approve finish and only assigned Procurement close stock", async () => {
    const f = await setup();
    const clientAction = await f.input(f.client, "clientFinishApproval", "approve");
    await expect(f.service.act(f.admin, PROJECT, clientAction)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.act(f.designer, PROJECT, clientAction)).rejects.toMatchObject({ status: 403 });
    await f.service.act(f.client, PROJECT, clientAction);
    await expect(f.service.act(f.designer, PROJECT, await f.input(f.designer, "stockCheck", "complete"))).rejects.toMatchObject({ status: 403 });
    expect((await f.service.get(f.procurement, PROJECT)).entries.find(row => row.ruleKey === "stockCheck")!.dueAt).toBeNull();
    await DesignWorkflowStateModel.create({ _id: PROJECT, projectId: PROJECT, version: 1, initialPaymentAt: "2026-10-14T00:00:00.000Z", stages: {}, pauses: [], history: [] });
    const closed = await f.service.act(f.procurement, PROJECT, await f.input(f.procurement, "stockCheck", "complete"));
    expect(closed.entries.find(row => row.ruleKey === "stockCheck")).toMatchObject({ dueAt: "2026-10-18T00:00:00.000Z", status: "completed" });
  });

  it("permits reasoned selections during execution, blocks other unresolved critical work and freezes returned readiness", async () => {
    const f = await setup();
    await expect(assertDesignRequirementsSubmissionAllowed(f.repository, PROJECT)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_BLOCKED" });
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "physicalSampleApproval", "defer"));
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "clientFinishApproval", "defer"));
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "installationMethod", "complete"));
    const snapshot = await f.repository.runInTransaction(tx => assertDesignRequirementsSubmissionAllowed(tx, PROJECT, true));
    expect(snapshot.entries.filter(row => row.status === "deferred")).toHaveLength(2);
    await f.service.act(f.client, PROJECT, await f.input(f.client, "clientFinishApproval", "approve"));
    expect(snapshot.entries.find(row => row.ruleKey === "clientFinishApproval")!.status).toBe("deferred");
    expect((await f.service.get(f.client, PROJECT)).entries[0]!.status).toBe("approved");
  });

  it("rejects missing or malformed current rules for the selected line without blocking other lines", async () => {
    const f = await setup();
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "design-a" } as never, { $set: { "payload.answers.designerPoApproval": "yes" } });
    await expect(f.po()).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_RULES_UNAVAILABLE" });
    await expect(f.po(["estimate-line-b"])).resolves.toBeUndefined();
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "design-a" } as never, { $set: { payload: f.rules } });
    await f.service.act(f.designer, PROJECT, await f.input(f.designer, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }));
    await AiEstimatorKnowledgeMainLineModel.deleteOne({ _id: "main-a" });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    await expect(f.po(["estimate-line-b"])).resolves.toBeUndefined();
  });

  it("uses the sole consistent design-plan owner for exclusive PO signoff", async () => {
    const f = await setup();
    const original = demoSeedData.users.find(row => row.role === "designer")!;
    const replacement: PublicUser = { id: "designer-replacement", name: "Replacement Designer", email: "replacement@example.test", role: "designer" };
    await UserModel.create({ ...original, _id: replacement.id, email: replacement.email, emailNormalized: replacement.email });
    await ProjectModel.updateOne({ _id: PROJECT }, { $set: { assignedDesignerIds: [f.designer.id, replacement.id] } });
    await EstimateModel.updateOne({ _id: ESTIMATE }, { $set: { designPlanDesignerId: replacement.id } });
    await expect(f.service.act(f.designer, PROJECT, await f.input(f.designer, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }))).rejects.toMatchObject({ status: 403 });
    await f.service.act(replacement, PROJECT, await f.input(replacement, "designerPoApproval", "approve", { checkedPointIds: ["point-one"] }));
    await expect(f.po()).resolves.toBeUndefined();
    await ProjectWorkflowTaskModel.create({ _id: "conflicting-designer-task", dedupeKey: "conflicting-designer-task", projectId: PROJECT, estimateId: ESTIMATE,
      designPlanVersion: 1, kind: "design_plan_upload", title: "Design owner", assigneeRole: "designer", assigneeUserId: f.designer.id, openedAt: new Date() });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
  });

  it("rejects stale source tokens even when the action version has not changed", async () => {
    const f = await setup();
    const stale = await f.input(f.designer, "installationMethod", "complete");
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: "revision-a" }, { $inc: { version: 1 } });
    await expect(f.service.act(f.designer, PROJECT, stale)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_CONFLICT" });
    expect(await DesignRequirementsStateModel.countDocuments()).toBe(0);
    const current = await f.input(f.designer, "installationMethod", "complete");
    const results = await Promise.allSettled([
      f.service.act(f.designer, PROJECT, current),
      f.service.act(f.designer, PROJECT, { ...current, idempotencyKey: "distinct-concurrent-action" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await DesignRequirementsStateModel.findById(PROJECT).select("+history").lean())!.history).toHaveLength(1);
  });

  it("fails closed for removed configured Main Lines before any history while preserving real legacy lines", async () => {
    const f = await setup();
    await AiEstimatorKnowledgeMainLineModel.deleteOne({ _id: "main-a" });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    await expect(assertDesignRequirementsSubmissionAllowed(f.repository, PROJECT)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_BLOCKED" });
    await expect(f.po(["estimate-line-b"])).resolves.toBeUndefined();
    await EstimateModel.updateOne({ _id: ESTIMATE }, { $set: { "lineItems.0.mainLineId": null } });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    await EstimateModel.updateOne({ _id: ESTIMATE }, { $set: { "lineItems.0.source": "legacy", "lineItems.0.mainLineId": null } });
    await expect(f.po()).resolves.toBeUndefined();
  });

  it("rejects duplicate configured estimate-line identities instead of sharing one approval", async () => {
    const f = await setup();
    const estimate = await EstimateModel.findById(ESTIMATE).lean();
    await EstimateModel.updateOne({ _id: ESTIMATE }, { $push: { lineItems: estimate!.lineItems[0] } });
    await expect(f.po()).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_PO_BLOCKED" });
    await expect(assertDesignRequirementsSubmissionAllowed(f.repository, PROJECT)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_BLOCKED" });
  });
});
