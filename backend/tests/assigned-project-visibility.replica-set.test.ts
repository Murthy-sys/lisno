import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { errorHandler } from "../src/middleware/errors.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { AppRepository, ProjectAccessGrantRecord, SeedData, UserRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, requireDesignWorkflowReadScope, requireDesignWorkflowScope } from "../src/services/design-workflow-state.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { requireProjectOperationAccess, requireProjectReadAccess } from "../src/services/workflow.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = "2026-10-13T10:00:00.000Z";
const VISIBLE = ["assigned-approved", "assigned-draft", "assigned-none", "assigned-pending"];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("assigned-project-read-visibility"); }, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

function fixtureSeed() {
  const seed = structuredClone(demoSeedData);
  const baseUser = seed.users[0]!;
  seed.users = ["procurement", "site_manager", "designer"].flatMap(role => ["one", "two"].map(suffix => ({
    ...baseUser, id: `${role}-${suffix}`, name: "Same display name", email: `${role}-${suffix}@visibility.test`,
    emailNormalized: `${role}-${suffix}@visibility.test`, role: role as UserRecord["role"], active: true, accountKind: "standard" as const,
    managerId: null, authorizedClientIds: []
  })));
  const baseProject = seed.projects[0]!;
  const ids = [...VISIBLE, "foreign", "wrong-kind", "wrong-role", "superseded", "null-owner", "granted", "revoked", "wrong-module", "wrong-source"];
  seed.projects = ids.map(id => ({ ...baseProject, id, name: id, clientId: null, clientMobile: "9000000000", clientAddress: "Test address",
    assignedDesignerIds: VISIBLE.includes(id) ? ["designer-one"] : ["designer-two"], initiatingDesignerId: null,
    assignedEstimatorId: null, managerId: null, programManagerId: VISIBLE.includes(id) ? "site_manager-one" : "site_manager-two",
    designWorkflowStages: createProjectDesignWorkflow(id) }));
  seed.projectWorkflowAssignments = VISIBLE.map(projectId => ({ projectId, kind: "procurement", assigneeRole: "procurement", assigneeUserId: "procurement-one" }));
  seed.projectWorkflowAssignments.push(
    { projectId: "foreign", kind: "procurement", assigneeRole: "procurement", assigneeUserId: "procurement-two" },
    { projectId: "wrong-kind", kind: "site_execution", assigneeRole: "procurement", assigneeUserId: "procurement-one" },
    { projectId: "wrong-role", kind: "procurement", assigneeRole: "site_manager", assigneeUserId: "procurement-one" },
    { projectId: "superseded", kind: "procurement", assigneeRole: "procurement", assigneeUserId: "procurement-one", supersededAt: NOW },
    { projectId: "null-owner", kind: "procurement", assigneeRole: "procurement", assigneeUserId: null }
  );
  const grant = (projectId: string): ProjectAccessGrantRecord => ({ id: `grant-${projectId}`, userId: "procurement-one", projectId,
    module: "procurement", source: "access_request", active: true, accessRequestId: `request-${projectId}`, grantedById: "reviewer",
    grantedAt: NOW, revokedAt: null, revokedById: null, revocationReason: null, version: 1, createdAt: NOW, updatedAt: NOW });
  seed.projectAccessGrants = [grant("granted"), { ...grant("revoked"), active: false, revokedAt: NOW, revokedById: "reviewer", revocationReason: "Removed", version: 2 },
    { ...grant("wrong-module"), module: "design" }, { ...grant("wrong-source"), source: "admin_initiator", accessRequestId: null }];
  seed.estimateSummaries = ([ ["assigned-draft", "draft"], ["assigned-pending", "sent_to_client"], ["assigned-approved", "client_approved"] ] as const)
    .map(([projectId, status]) => ({ id: `estimate-${projectId}`, projectId, leadId: `lead-${projectId}`, status,
      version: 4, subtotal: 1000, gst: 0, total: 1000, clientDecisionAt: status === "client_approved" ? NOW : null,
      clientDecisionSource: status === "client_approved" ? "client_portal" : null, approvedBaseline: null, clientReview: null,
      assignedAdminId: null, createdAt: NOW, updatedAt: NOW, rooms: [{ id: "room", label: "Hall" }], lineItems: [] }));
  seed.leads = []; seed.estimateResponsibilities = []; seed.leadActivities = []; seed.floors = []; seed.stages = []; seed.tasks = [];
  seed.taskEvents = []; seed.designVersions = []; seed.extractionJobs = []; seed.sourcePages = []; seed.designSections = [];
  seed.designSectionRevisions = []; seed.evaluations = []; seed.auditEvents = []; seed.accessRequests = [];
  seed.userInvitations = []; seed.designWorkflowStates = []; seed.estimateReviewRounds = [];
  return seed;
}

async function setup(kind: "memory" | "mongo", configure?: (seed: SeedData) => void) {
  const seed = fixtureSeed(); configure?.(seed);
  const repository = kind === "memory" ? createMemoryRepository(seed) : createMongoRepository();
  if (kind === "mongo") {
    for (const user of seed.users) await repository.createUser(user);
    for (const project of seed.projects) await repository.createProject(project);
    await ProjectAccessGrantModel.insertMany(seed.projectAccessGrants.map(grant => ({ ...grant, _id: grant.id })));
    await ProjectWorkflowTaskModel.insertMany(seed.projectWorkflowAssignments!.map((task, index) => ({ ...task,
      _id: task.id ?? `assignment-${index}`, dedupeKey: `assignment-${index}`, estimateId: task.estimateId ?? `estimate-${task.projectId}`, designPlanVersion: task.designPlanVersion ?? 0,
      preparationOnly: task.preparationOnly ?? true, title: "Preparation assignment", status: task.status ?? "open", openedAt: new Date(NOW) })));
    // Fixture projection supplies saved estimate heads without invoking publication or delivery.
    await EstimateModel.collection.insertMany(seed.estimateSummaries!.map(row => ({ ...row, _id: row.id,
      createdAt: new Date(NOW), updatedAt: new Date(NOW), clientDecisionAt: row.clientDecisionAt ? new Date(row.clientDecisionAt) : null })));
  }
  const service = createProjectService(repository, createAuditService(repository), () => new Date(NOW));
  const actor = (id: string) => seed.users.find(user => user.id === id)!;
  const app = express(); app.use(express.json());
  app.use(createProjectsRouter({ authenticate: async (id: string) => actor(id) } as unknown as AuthService, service));
  app.use(errorHandler);
  return { seed, repository, service, actor, app };
}

for (const kind of ["memory", "mongo"] as const) describe(`${kind} assigned project read visibility`, () => {
  it.each(["designer", "procurement", "site_manager"] as const)("lists and opens %s assignments independently of estimate state without writes", async role => {
    const f = await setup(kind);
    const actor = f.actor(`${role}-one`);
    const expected = role === "procurement" ? [...VISIBLE, "granted"] : VISIBLE;
    const before = await Promise.all(VISIBLE.map(id => f.repository.getProjectHierarchy(id)));
    const saveWorkflow = vi.spyOn(f.repository, "saveDesignWorkflowState");
    const createTask = vi.spyOn(f.repository, "createTask");
    const transaction = vi.spyOn(f.repository, "runInTransaction");
    const page = await runWithHumanOperation("GET /projects", () => f.service.list(actor, { offset: 1, limit: 2 }));
    expect(page.total).toBe(expected.length); expect(page.items.map(project => project.id)).toEqual(expected.slice(1, 3));
    for (const id of VISIBLE) {
      await request(f.app).get(`/projects/${id}`).set("Authorization", `Bearer ${actor.id}`).expect(200);
      const view = await request(f.app).get(`/projects/${id}/design-workflow`).set("Authorization", `Bearer ${actor.id}`).expect(200);
      expect(view.headers["cache-control"]).toBe("private, no-store");
      expect(view.body.data.projectId).toBe(id);
      if (id !== "assigned-approved") expect(view.body.data.estimateApprovalStatus).toBe("awaiting_approval");
      if (role !== "designer") {
        expect(view.body.data.projectStages.every((stage: any) => stage.operational.availableActions.length === 0)).toBe(true);
        expect((await requireDesignWorkflowReadScope(f.repository, actor, id)).capabilities).toEqual({
          designer: false, client: false, sales: false, finance: false, representative: false, manager: false
        });
      }
    }
    expect(await Promise.all(VISIBLE.map(id => f.repository.getProjectHierarchy(id)))).toEqual(before);
    expect(saveWorkflow).not.toHaveBeenCalled(); expect(createTask).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect((await f.repository.pageAuditEvents({}, { offset: 0, limit: 100 })).total).toBe(0);
  });

  it.each(["task-only", "mismatch", "duplicate"] as const)("denies %s Project Manager ownership consistently in lists and details", async state => {
    const f = await setup(kind, seed => {
      const project = seed.projects.find(row => row.id === "assigned-approved")!;
      const source = seed.estimateSummaries!.find(row => row.projectId === project.id)!;
      Object.assign(source, { designPlanStatus: "approved", designPlanVersion: 1 });
      if (state === "task-only") project.programManagerId = null;
      seed.projectWorkflowAssignments!.push({ id: "site-current", projectId: project.id, estimateId: source.id,
        kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: state === "mismatch" ? "site_manager-two" : "site_manager-one",
        version: 1, designPlanVersion: 1, preparationOnly: false, status: "open" });
      if (state === "duplicate") seed.projectWorkflowAssignments!.push({ ...seed.projectWorkflowAssignments!.at(-1)!, id: "site-duplicate" });
    });
    const manager = f.actor("site_manager-one");
    expect(await f.repository.findProjectForUserRead(manager, "assigned-approved")).toBeNull();
    expect((await f.repository.pageProjectsForUserRead(manager, { offset: 0, limit: 100 })).items.map(row => row.id)).not.toContain("assigned-approved");
    await request(f.app).get("/projects/assigned-approved").set("Authorization", `Bearer ${manager.id}`).expect(404);
  });
  it("returns source conflicts with no observer actions instead of hiding assigned project progress", async () => {
    const f = await setup(kind, seed => {
      seed.estimateSummaries!.push({ ...seed.estimateSummaries!.find(row => row.status === "client_approved")!, id: "conflicting-approved-estimate" });
    });
    for (const role of ["procurement", "site_manager"]) {
      const view = await f.service.designWorkflow(f.actor(`${role}-one`), "assigned-approved");
      expect(view.estimateApprovalStatus).toBe("source_issue");
      expect(view.projectStages!.every(stage => stage.operational!.availableActions.length === 0)).toBe(true);
    }
  });

  it("denies unrelated, role-mismatched, superseded and invalid-grant reads without disclosing existence", async () => {
    const f = await setup(kind);
    for (const role of ["procurement", "site_manager", "designer"]) {
      const actor = f.actor(`${role}-one`);
      for (const id of ["foreign", "wrong-kind", "wrong-role", "superseded", "null-owner", "revoked", "wrong-module", "wrong-source", "missing"]) {
        expect(await f.repository.findProjectForUserRead(actor, id)).toBeNull();
        await request(f.app).get(`/projects/${id}`).set("Authorization", `Bearer ${actor.id}`).expect(404);
        await request(f.app).get(`/projects/${id}/design-workflow`).set("Authorization", `Bearer ${actor.id}`).expect(404);
      }
    }
  });

  it("keeps grant reads out of other roles and preserves separate mutation/module scope", async () => {
    const f = await setup(kind);
    const procurement = f.actor("procurement-one");
    expect(await f.repository.findProjectForUserRead(procurement, "granted")).toMatchObject({ id: "granted" });
    expect(await f.repository.findProjectForUserRead(f.actor("site_manager-one"), "granted")).toBeNull();
    for (const id of ["procurement-one", "site_manager-one"]) {
      const actor = f.actor(id);
      await expect(requireDesignWorkflowScope(f.repository, actor, VISIBLE[0]!)).rejects.toMatchObject({ status: 404 });
      const workflow = createDesignWorkflowStateService(f.repository, createAuditService(f.repository), () => new Date(NOW));
      await expect(workflow.act(actor, VISIBLE[0]!, { expectedVersion: 0, idempotencyKey: `observer-${id}`, action: "confirm_initial_payment", note: "Not allowed", data: {} }, null)).rejects.toMatchObject({ status: 404 });
      await request(f.app).post(`/projects/${VISIBLE[0]}/floors`).set("Authorization", `Bearer ${id}`).send({}).expect(403);
      await expect(runWithHumanOperation("POST /projects/:projectId/floors", () => requireProjectReadAccess(f.repository, actor, VISIBLE[0]!))).rejects.toThrow("Project read scope");
    }
    // A Procurement task creates read visibility, not the old Projects module grant.
    await expect(runWithHumanOperation("GET /projects/:projectId", () => requireProjectOperationAccess(f.repository, procurement, VISIBLE[0]!))).rejects.toMatchObject({ status: 404 });
  });

  it("revalidates actor identity and denies inactive or role-forged observer reads", async () => {
    const f = await setup(kind, seed => { seed.users.find(user => user.id === "procurement-one")!.active = false; });
    for (const actor of [f.actor("procurement-one"), { ...f.actor("site_manager-one"), role: "procurement" as const }]) {
      await expect(runWithHumanOperation("GET /projects", () => f.service.list(actor, { offset: 0, limit: 100 }))).rejects.toMatchObject({ status: 401 });
      await expect(runWithHumanOperation("GET /projects/:projectId", () => f.service.get(actor, VISIBLE[0]!))).rejects.toMatchObject({ status: 401 });
      await expect(f.service.designWorkflow(actor, VISIBLE[0]!)).rejects.toMatchObject({ status: 404 });
    }
  });

  it("removes visibility after exact assignment changes and grant revocation", async () => {
    const f = await setup(kind);
    expect(await f.repository.findProjectForUserRead(f.actor("procurement-one"), "assigned-none")).not.toBeNull();
    const changedSeed = structuredClone(f.seed);
    changedSeed.projectWorkflowAssignments!.find(task => task.projectId === "assigned-none")!.assigneeUserId = "procurement-two";
    changedSeed.projects.find(project => project.id === "assigned-none")!.programManagerId = "site_manager-two";
    changedSeed.projectAccessGrants.find(grant => grant.projectId === "granted")!.active = false;
    let repository: AppRepository;
    if (kind === "memory") repository = createMemoryRepository(changedSeed);
    else {
      await ProjectWorkflowTaskModel.updateOne({ projectId: "assigned-none" }, { $set: { assigneeUserId: "procurement-two" } });
      await ProjectModel.updateOne({ _id: "assigned-none" }, { $set: { programManagerId: "site_manager-two" } });
      await f.repository.revokeProjectAccessGrant("grant-granted", 1, { revokedAt: NOW, revokedById: "reviewer", revocationReason: "Removed", updatedAt: NOW });
      repository = f.repository;
    }
    for (const role of ["procurement", "site_manager"]) {
      expect(await repository.findProjectForUserRead(f.actor(`${role}-one`), "assigned-none")).toBeNull();
      expect(await repository.findProjectForUserRead(f.actor(`${role}-two`), "assigned-none")).toMatchObject({ id: "assigned-none" });
      expect((await repository.pageProjectsForUserRead(f.actor(`${role}-one`), { offset: 0, limit: 100 })).items.map(project => project.id)).not.toContain("assigned-none");
    }
    expect(await repository.findProjectForUserRead(f.actor("procurement-one"), "granted")).toBeNull();
    expect(await repository.pageProjectsForUserRead({ ...f.actor("procurement-one"), active: false }, { offset: 0, limit: 100 })).toEqual({ items: [], total: 0 });
  });
});
