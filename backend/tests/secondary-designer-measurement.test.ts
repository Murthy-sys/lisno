import { describe, expect, it } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { secondaryMeasurementDesigners } from "../src/domain/measurement-ownership.js";
import { instructionsForStage } from "../src/domain/design-workflow-instructions.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { SeedData } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { createMemoryProjectChatRepository } from "../src/repositories/project-chat-memory.js";
import { createProjectStatusService } from "../src/services/project-status.service.js";
import { resolveChatMembership } from "../src/domain/project-chat-membership.js";

const AT = "2026-11-05T10:00:00.000Z";
const media = { id: "synthetic-photo", storageReference: "synthetic-measurement-photo", originalFilename: "site.png", mimeType: "image/png", byteSize: 5, sha256: sha256Hex("photo"), kind: "image" as const };

function fixture(configure?: (seed: SeedData) => void) {
  const seed = structuredClone(demoSeedData);
  const baseUser = seed.users[0]!;
  const identities = [
    ["primary-a", "designer"], ["secondary-a1", "designer"], ["secondary-a2", "designer"], ["secondary-a3", "designer"],
    ["primary-b", "designer"], ["secondary-b", "designer"], ["removed", "designer"], ["inactive", "designer"],
    ["deleted", "designer"], ["wrong-role", "estimator_sales"], ["client-a", "client"], ["sales", "estimator_sales"],
    ["super", "super_admin"], ["manager", "design_manager"], ["admin", "admin"], ["finance", "finance_head"],
    ["procurement", "procurement"], ["site", "site_manager"]] as const;
  seed.users = identities.map(([id, role]) => ({ ...baseUser, id, role, name: `Synthetic ${id}`, email: `${id}@example.test`, emailNormalized: `${id}@example.test`,
    active: id !== "inactive", ...(id === "deleted" ? { deletedAt: AT } : {}) }));
  const baseProject = seed.projects[0]!;
  seed.projects = ["a", "b"].map(suffix => ({ ...baseProject, id: `measurement-${suffix}`, name: `Synthetic project ${suffix}`, status: "planning",
    estimationWorkflowVersion: 3, primaryDesignerId: `primary-${suffix}`, secondaryDesignerIds: suffix === "a" ? ["secondary-a1", "secondary-a2"] : ["secondary-b"],
    assignedDesignerIds: suffix === "a" ? ["primary-a", "secondary-a1", "secondary-a2"] : ["primary-b", "secondary-b"], initiatingDesignerId: `primary-${suffix}`,
    clientId: "client-a", assignedEstimatorId: "sales", managerId: "manager", designWorkflowStages: createProjectDesignWorkflow(`measurement-${suffix}`) }));
  seed.floors = []; seed.stages = []; seed.tasks = []; seed.auditEvents = [];
  seed.projectAccessGrants = [{ id: "measurement-admin", projectId: "measurement-a", userId: "admin", module: "projects", source: "admin_initiator", active: true,
    grantedById: "super", grantedAt: AT, revokedAt: null, revokedById: null, revocationReason: null, version: 1, createdAt: AT, updatedAt: AT, accessRequestId: null }];
  seed.estimateSummaries = seed.projects.map((project, index) => ({ id: `estimate-${project.id}`, leadId: `lead-${project.id}`, projectId: project.id, version: 5,
    status: "client_approved", propertyType: "2BHK", subtotal: 1000 * (index + 1), gst: 0, total: 1000 * (index + 1), subtotalPaise: 100_000 * (index + 1), gstPaise: 0, totalPaise: 100_000 * (index + 1), clientDecisionAt: AT, clientDecisionSource: "client_portal",
    assignedAdminId: "super", approvedBaseline: null, clientReview: null, createdAt: AT, updatedAt: AT,
    rooms: [{ id: `room-${project.id}`, label: "Synthetic room" }], lineItems: [{ id: `line-${project.id}`, catalogueId: "CUSTOM", roomId: `room-${project.id}`, roomName: "Synthetic room", specification: "Synthetic work", unit: "nos", quantity: index + 1, included: true, amount: 1000 * (index + 1) }],
    estimation: { ...newQuotationLifecycle(), phase: "post", status: "client_approved", pricedRevision: 2, designStartedAt: AT, editClosedAt: AT,
      preApproval: { reviewRoundId: `pre-${project.id}`, estimateVersion: 2, approvedAt: AT },
      finalApproval: { reviewRoundId: `post-${project.id}`, estimateVersion: 4, approvedAt: AT, requirementsVersion: 0, designReviewRoundId: null, designPlanVersion: null, designScopeRevision: 1 } } }));
  seed.estimateReviewRounds = seed.estimateSummaries.flatMap(estimate => {
    const snapshot = { clientName: "Synthetic Client", projectName: "Synthetic project", location: "Synthetic location", propertyType: estimate.propertyType!,
      rooms: estimate.rooms!, scopes: [], lineItems: estimate.lineItems!, subtotal: estimate.subtotal, gst: estimate.gst, total: estimate.total,
      subtotalPaise: estimate.subtotalPaise, gstPaise: estimate.gstPaise, totalPaise: estimate.totalPaise };
    const sourceDigest = quotationSnapshotDigest(snapshot);
    return [2, 4].map(version => ({ id: `${version === 2 ? "pre" : "post"}-${estimate.projectId}`,
      estimateId: estimate.id, projectId: estimate.projectId!, estimateVersion: version, workflowVersion: 3, phase: version === 2 ? "pre" : "post", requirementsVersion: 0, designScopeRevision: 1,
      pricedRevision: version / 2, sourceDigest, estimateSnapshot: snapshot, submittedById: version === 2 ? "sales" : `primary-${estimate.projectId!.slice(-1)}`,
      salesApproval: version === 2 ? { actorId: "sales", estimateVersion: 2, pricedRevision: 1, sourceDigest, approvedAt: AT } : null,
      status: "approved", decision: "approve", decidedById: "client-a", decidedAt: AT, decisionSource: "client_portal", lineItems: estimate.lineItems! }));
  });
  seed.designWorkflowStates = seed.projects.map(project => ({ ...emptyDesignWorkflowState(project.id), version: 1, estimationWorkflowVersion: 3, designStartedAt: AT,
    stages: { internal_kickoff: { completedAt: AT, calendarAcceptedAt: AT }, client_kickoff: { completedAt: AT }, key_collection: { completedAt: AT, handedOverAt: AT, receivedAt: AT },
      site_measurement: { assignedDesignerId: project.primaryDesignerId! } } }));
  seed.leads = seed.projects.map(project => ({ ...seed.leads![0]!, id: `lead-${project.id}`, projectId: project.id, ownerId: "sales" }));
  seed.projectStatusEstimateEvidence = seed.estimateSummaries.map(estimate => ({ projectId: estimate.projectId!, estimates: [{ id: estimate.id, leadId: estimate.leadId,
    projectId: estimate.projectId, version: estimate.version, status: estimate.status, clientDecisionAt: AT, estimation: structuredClone(estimate.estimation) }],
    rounds: seed.estimateReviewRounds!.filter(round => round.estimateId === estimate.id).map(round => ({ ...round, leadId: estimate.leadId,
      sendGeneration: round.estimateVersion / 2, createdAt: AT, proofValid: false })),
    financeSource: { estimateId: estimate.id, estimateVersion: 4, reviewRoundId: `post-${estimate.projectId}` } }));
  configure?.(seed);
  const repository = createMemoryRepository(seed), audit = createAuditService(repository), clock = () => new Date(AT);
  const service = createDesignWorkflowStateService(repository, audit, clock), projects = createProjectService(repository, audit, clock);
  const chatRepository = createMemoryProjectChatRepository(repository, { estimates: seed.estimateSummaries!.map(estimate => ({ ...estimate, ownerId: "sales",
    assignedDesignerId: seed.projects.find(project => project.id === estimate.projectId)!.primaryDesignerId!, designPlanDesignerId: seed.projects.find(project => project.id === estimate.projectId)!.primaryDesignerId!, designPlanStatus: "assigned", designPlanVersion: 0 })) });
  const status = createProjectStatusService({ repository, chatRepository, clock });
  const actor = (id: string): PublicUser => { const user = seed.users.find(user => user.id === id)!; return { id, role: user.role, name: user.name, email: user.email }; };
  const input = (projectId = "measurement-a", action: WorkflowActionInput["action"] = "measurement_complete"): WorkflowActionInput => ({ action, stageId: seed.projects.find(project => project.id === projectId)!.designWorkflowStages!.find(stage => stage.type === "site_measurement")!.id,
    expectedVersion: 1, idempotencyKey: `measurement-${action}`, note: "Synthetic measurement", data: action === "measurement_assign" ? { designerId: "primary-a" } : {} });
  const view = async (id: string, projectId = "measurement-a") => { const workflow = await projects.designWorkflow(actor(id), projectId); return { workflow, stage: workflow.projectStages!.find(stage => stage.type === "site_measurement")! }; };
  const statusActor = (id: string) => ({ id, role: actor(id).role, sessionVersion: 1, expiresAt: Date.parse(AT) / 1000 + 3600 });
  return { seed, repository, service, projects, actor, input, view, chatRepository, status, statusActor };
}

function addKickoffEvidence(seed: SeedData) {
  for (const state of seed.designWorkflowStates!) {
    const project = seed.projects.find(project => project.id === state.projectId)!;
    state.history.push({ id: `kickoff-${project.id}`, idempotencyKey: `kickoff-${project.id}`, requestHash: "synthetic-kickoff", action: "internal_kickoff_complete",
      stageId: project.designWorkflowStages!.find(stage => stage.type === "internal_kickoff")!.id, actorId: project.primaryDesignerId!, actorName: "Synthetic Primary", actorRole: "designer",
      onBehalfOfClient: false, at: AT, note: "", data: {}, proof: { storageReference: "synthetic-kickoff-proof", originalFilename: "kickoff.pdf", mimeType: "application/pdf", byteSize: 5, sha256: sha256Hex("proof") } });
  }
}

describe("Secondary Designer measurement ownership", () => {
  it.each(["secondary-a1", "secondary-a2"])("lets %s complete the shared stage without a measurement assignment", async id => {
    const f = fixture();
    const { workflow, stage } = await f.view(id);
    expect(workflow).not.toHaveProperty("measurementDesigners");
    expect(stage.operational).toMatchObject({ status: "in_progress", availableActions: [{ id: "measurement_complete" }],
      facts: [{ label: "Secondary Designers", value: "Synthetic secondary-a1, Synthetic secondary-a2" }] });
    await expect(f.service.act(f.actor(id), "measurement-a", f.input(), null, [media])).resolves.toMatchObject({ version: 2, replayed: false });
    const saved = (await f.repository.findDesignWorkflowState("measurement-a"))!;
    expect(saved.stages.site_measurement).toMatchObject({ completedAt: AT, assignedDesignerId: "primary-a" });
    expect(saved.history).toMatchObject([{ actorId: id, action: "measurement_complete", mediaFiles: [media] }]);
    expect((await f.view(id === "secondary-a1" ? "secondary-a2" : "secondary-a1")).stage.operational!.availableActions).toEqual([]);
    expect((await f.view("primary-a")).stage.operational!.facts).toContainEqual({ label: "Measurement completed by", value: `Synthetic ${id}` });
    expect((await f.repository.findDesignWorkflowState("measurement-b"))!.history).toEqual([]);
    expect((await f.repository.pageAuditEvents({}, { offset: 0, limit: 100 })).items).toHaveLength(1);
  });

  it.each([
    { id: "primary-a", status: 403 }, { id: "primary-b", status: 404 }, { id: "secondary-b", status: 404 }, { id: "removed", status: 404 },
    { id: "inactive", status: 401 }, { id: "deleted", status: 404 }, { id: "wrong-role", status: 404 }, { id: "client-a", status: 403 },
    { id: "sales", status: 403 }, { id: "super", status: 403 }, { id: "manager", status: 403 }, { id: "admin", status: 403 },
    { id: "finance", status: 403 }, { id: "procurement", status: 404 }, { id: "site", status: 404 }
  ])("denies direct completion by $id without writes", async ({ id, status }) => {
    const f = fixture(seed => { seed.projects[0]!.secondaryDesignerIds!.push("inactive", "deleted", "wrong-role", "primary-a"); });
    const before = await f.repository.findDesignWorkflowState("measurement-a");
    await expect(f.service.act(f.actor(id), "measurement-a", f.input(), null, [media])).rejects.toMatchObject({ status });
    expect(await f.repository.findDesignWorkflowState("measurement-a")).toEqual(before);
    expect((await f.repository.pageAuditEvents({}, { offset: 0, limit: 100 })).items).toEqual([]);
  });

  it.each(["primary-a", "secondary-a1", "super"])("rejects new manual assignment requests from %s", async id => {
    const f = fixture();
    await expect(f.service.act(f.actor(id), "measurement-a", f.input("measurement-a", "measurement_assign"), null)).rejects.toMatchObject({ status: 403 });
    expect((await f.repository.findDesignWorkflowState("measurement-a"))!.history).toEqual([]);
  });

  it("preserves an authorized exact replay of a historical manual assignment without a new write", async () => {
    const f = fixture(seed => {
      const stageId = seed.projects[0]!.designWorkflowStages!.find(stage => stage.type === "site_measurement")!.id;
      const data = { designerId: "primary-a" }, note = "Synthetic measurement";
      seed.designWorkflowStates![0]!.history.push({ id: "historical-assignment", idempotencyKey: "measurement-measurement_assign",
        requestHash: sha256Hex(Buffer.from(JSON.stringify({ action: "measurement_assign", stageId, data, note }))),
        action: "measurement_assign", stageId, actorId: "primary-a", actorName: "Original Primary", actorRole: "designer", onBehalfOfClient: false, at: AT, data, note, proof: null });
    });
    const before = await f.repository.findDesignWorkflowState("measurement-a");
    await expect(f.service.act(f.actor("primary-a"), "measurement-a", f.input("measurement-a", "measurement_assign"), null)).resolves.toMatchObject({ replayed: true });
    expect(await f.repository.findDesignWorkflowState("measurement-a")).toEqual(before);
    expect((await f.repository.pageAuditEvents({}, { offset: 0, limit: 100 })).items).toEqual([]);
  });

  it.each([{ ids: [] }, { ids: ["inactive", "deleted", "wrong-role"] }])("shows assignment guidance when no eligible secondary remains: $ids", async ({ ids }) => {
    const f = fixture(seed => { seed.projects[0]!.secondaryDesignerIds = ids; });
    const { stage } = await f.view("primary-a");
    expect(stage.operational!.status).toBe("blocked");
    expect(stage.operational!.blockingReasons).toContain(ids.length ? "Assign an active Secondary Designer in Design team to carry out onsite measurement." : "Assign a Secondary Designer in Design team to carry out onsite measurement.");
    expect(stage.operational!.availableActions).toEqual([]);
    expect(stage.operational!.timing).toMatchObject({ state: "running", startsAt: AT });
    expect(stage.operational!.facts).not.toContainEqual(expect.objectContaining({ label: "Assigned measurement Designer" }));
  });

  it("resolves three eligible owners without depending on compatibility assignments or user names", async () => {
    const f = fixture(seed => { seed.projects[0]!.secondaryDesignerIds = ["secondary-a3", "secondary-a1", "secondary-a2"]; seed.projects[0]!.assignedDesignerIds = ["primary-a"]; seed.users.find(user => user.id === "secondary-b")!.name = "Synthetic secondary-a1"; });
    const { stage } = await f.view("secondary-a3");
    expect(stage.operational!.facts).toContainEqual({ label: "Secondary Designers", value: "Synthetic secondary-a1, Synthetic secondary-a2, Synthetic secondary-a3" });
    expect(secondaryMeasurementDesigners(f.seed.projects[0]!, f.seed.users).map(user => user.id)).toEqual(["secondary-a1", "secondary-a2", "secondary-a3"]);
    await expect(f.service.act(f.actor("secondary-b"), "measurement-a", f.input(), null, [media])).rejects.toMatchObject({ status: 404 });
  });

  it.each(["keys", "kickoff", "access"])("preserves the %s prerequisite for a current secondary", async blocker => {
    const f = fixture(seed => {
      const state = seed.designWorkflowStates![0]!;
      if (blocker === "keys") delete state.stages.key_collection;
      if (blocker === "kickoff") delete state.stages.client_kickoff;
      if (blocker === "access") state.pauses.push({ startedAt: AT, endedAt: null });
    });
    await expect(f.service.act(f.actor("secondary-a1"), "measurement-a", f.input(), null, [media])).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect((await f.view("secondary-a1")).stage.operational!.availableActions.some(action => action.id === "measurement_complete")).toBe(false);
  });

  it("requires evidence, rejects stale versions and preserves same-actor idempotency", async () => {
    const f = fixture(), actor = f.actor("secondary-a1"), input = f.input();
    await expect(f.service.act(actor, "measurement-a", input, null)).rejects.toMatchObject({ code: "WORKFLOW_MEDIA_REQUIRED" });
    await expect(f.service.act(actor, "measurement-a", { ...input, expectedVersion: 0 }, null, [media])).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    await f.service.act(actor, "measurement-a", input, null, [media]);
    await expect(f.service.act(actor, "measurement-a", input, null, [media])).resolves.toMatchObject({ replayed: true, version: 2 });
    await expect(f.service.act(f.actor("secondary-a2"), "measurement-a", input, null, [media])).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await f.repository.findDesignWorkflowState("measurement-a"))!.history).toHaveLength(1);
  });

  it("keeps completed actor history when the current team differs and performs no read writes", async () => {
    const f = fixture(seed => {
      const state = seed.designWorkflowStates![0]!;
      state.stages.site_measurement!.completedAt = AT;
      state.history.push({ id: "historic-measurement", idempotencyKey: "historic-measurement", requestHash: "historic-hash", action: "measurement_complete",
        stageId: seed.projects[0]!.designWorkflowStages!.find(stage => stage.type === "site_measurement")!.id,
        actorId: "removed", actorName: "Original measurement taker", actorRole: "designer", onBehalfOfClient: false, at: AT, note: "", data: {}, proof: null, mediaFiles: [media] });
    });
    const before = await f.repository.findDesignWorkflowState("measurement-a");
    const { stage } = await f.view("primary-a");
    expect(stage.operational).toMatchObject({ status: "completed", availableActions: [] });
    expect(stage.operational!.facts).toEqual(expect.arrayContaining([{ label: "Current Secondary Designers", value: "Synthetic secondary-a1, Synthetic secondary-a2" }, { label: "Measurement completed by", value: "Original measurement taker" }]));
    expect(await f.repository.findDesignWorkflowState("measurement-a")).toEqual(before);
  });

  it("changes only current-workflow instructions and preserves legacy assignment guidance", () => {
    expect(instructionsForStage("site_measurement", 3)).toMatchObject({ owner: "Secondary Designers" });
    expect(instructionsForStage("site_measurement", 3)!.completion.join(" ")).toContain("Any assigned Secondary Designer");
    expect(instructionsForStage("site_measurement", 2)!.completion[0]).toContain("Assign a measurement taker");
    expect(instructionsForStage("site_measurement")!.owner).toBe("Designer · assigned measurement taker");
  });

  it("projects live secondary responsibility through the actual status service despite a stale compatibility mirror", async () => {
    const f = fixture(seed => { seed.projects[0]!.assignedDesignerIds = ["primary-a"]; addKickoffEvidence(seed); });
    const membership = () => f.chatRepository.snapshot(async tx => resolveChatMembership((await tx.sources("measurement-a"))!, await tx.selections("measurement-a")));
    const before = await membership();
    expect(before.participants.some(person => person.id === "secondary-a1")).toBe(false);
    const result = await f.status.get(f.statusActor("primary-a"), "measurement-a");
    expect(result).toMatchObject({ currentStage: { key: "site_measurement" }, pendingActions: [{ id: "measurement-a:measurement:complete", people: [
      { id: "secondary-a1", name: "Synthetic secondary-a1", role: "designer" }, { id: "secondary-a2", name: "Synthetic secondary-a2", role: "designer" }
    ] }] });
    expect(await membership()).toEqual(before);
    expect((await f.status.get(f.statusActor("primary-b"), "measurement-b")).pendingActions[0]!.people.map(person => person.id)).toEqual(["secondary-b"]);
  });

  it.each([{ ids: [] }, { ids: ["inactive", "deleted", "wrong-role"] }])("returns the current primary's team-assignment task for $ids in Project status", async ({ ids }) => {
    const f = fixture(seed => { seed.projects[0]!.secondaryDesignerIds = ids; addKickoffEvidence(seed); });
    expect(await f.status.get(f.statusActor("primary-a"), "measurement-a")).toMatchObject({ currentStage: { key: "site_measurement" },
      pendingActions: [{ id: "measurement-a:measurement:assign-secondary", people: [{ id: "primary-a" }], action: expect.stringContaining("Secondary Designer in Design team") }] });
  });
});
