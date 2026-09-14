import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createProjectDesignWorkflow, DESIGN_STAGE_TYPES } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { createProjectService } from "../src/services/project.service.js";

const NOW = new Date("2026-09-11T10:00:00.000Z");
const names = ["Internal Kick off", "Client Kick off", "Key Collection", "On Site Actual Measurement", "Collection of existing furniture dimensions", "Designer Uploading Space planning with Tentative look and Feel"];
const floorInput = { name: "Ground floor", number: "0", order: 0, plannedStartAt: NOW.toISOString(), plannedEndAt: "2026-10-11T10:00:00.000Z" };
function setup() {
  const seed = structuredClone(demoSeedData);
  const repository = createMemoryRepository(seed);
  const actor = (id: string): PublicUser => {
    const user = seed.users.find((user) => user.id === id)!;
    return { id, name: user.name, email: user.email, role: user.role };
  };
  const service = createProjectService(repository, createAuditService(repository), () => NOW);
  const designer = actor("user-designer-ananya");
  const create = () => service.create(designer, {
    name: "New Excel workflow", clientName: "Client", clientEmail: "workflow-new@example.test", clientMobile: "9000000000", clientAddress: "Pune",
    assignedDesignerIds: [designer.id], managerId: seed.users.find((user) => user.role === "design_manager")!.id,
    location: "Pune", plannedStartAt: floorInput.plannedStartAt, plannedEndAt: floorInput.plannedEndAt
  });
  const view = (projectId: string) => runWithHumanOperation("GET /projects/:projectId/design-workflow", () => service.designWorkflow(designer, projectId));
  const floor = (projectId: string, overrides = {}) => runWithHumanOperation("POST /projects/:projectId/floors", () => service.createFloor(designer, projectId, { ...floorInput, ...overrides }));
  return { seed, repository, service, actor, designer, create, view, floor };
}

describe("project-owned Excel design workflow", () => {
  it("persists the six exact stages at Designer project creation before floors exist", async () => {
    const { create, view, repository } = setup();
    const project = await create();
    expect(project.designWorkflowStages?.map((stage) => stage.name)).toEqual(names);
    expect(project.designWorkflowStages?.map((stage) => stage.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(project.designWorkflowStages).toEqual(createProjectDesignWorkflow(project.id));
    expect(DESIGN_STAGE_TYPES).toHaveLength(11);
    const before = await repository.getProjectHierarchy(project.id);
    const result = await view(project.id);
    expect(result.floors).toEqual([]);
    expect(result.projectStages).toHaveLength(6);
    expect(result.projectStages?.every((stage) => stage.instructions?.owner && stage.instructions.trigger && stage.instructions.completion.length && stage.instructions.requirements.length)).toBe(true);
    expect(result.projectStages?.find((stage) => stage.type === "space_planning_tentative_look_feel")?.instructions).toMatchObject({ owner: "Assigned Designer", sla: { enabled: false, bands: [], clockOwner: null } });
    expect(result.projectStages?.every((stage) => stage.operational?.version === 0 && stage.operational.timing.state === "waiting" && stage.deadlineAt === null && stage.tasks.length === 0 && stage.dependencyStageIds.length === 0)).toBe(true);
    expect(await repository.getProjectHierarchy(project.id)).toEqual(before);
  });

  it.each(["admin", "estimator_sales"] as const)("snapshots the exact workflow for %s initiation", async (role) => {
    const { seed, actor, repository } = setup();
    const user = seed.users.find((user) => user.role === role)!;
    const admin = createAdminProjectService(repository, createAuditService(repository), () => NOW);
    const result = await admin.initiate(actor(user.id), {
      projectName: "Initiated workflow", clientName: "Client", clientEmail: "new-initiation@example.test", clientMobile: "9000000000", location: "Pune", propertyType: "3BHK", budgetMin: 0, budgetMax: 1000, nextAction: "Site visit", nextActionAt: NOW.toISOString(),
      ...(role === "admin" ? { estimatorId: "user-estimator-sales" } : { salesManagerId: "user-admin" })
    });
    expect((await repository.findProjectById(result.id))?.designWorkflowStages?.map((stage) => stage.name)).toEqual(names);
  });

  it.each([
    { label: "in-progress", complete: false, blocked: false, status: "in_progress", timing: "not_applicable", progress: 65 },
    { label: "completed", complete: true, blocked: false, status: "completed", timing: "completed", progress: 100 },
    { label: "completed but blocked by site access", complete: true, blocked: true, status: "blocked", timing: "waiting", progress: 100 }
  ])("preserves $label space-planning task projection when stage information is present", async ({ complete, blocked, status, timing, progress }) => {
    const { create, floor, view, repository, seed } = setup();
    const project = await create();
    await floor(project.id);
    await floor(project.id, { name: "First floor", number: "1", order: 1 });
    const state = emptyDesignWorkflowState(project.id);
    state.initialPaymentAt = "2026-09-01T10:00:00.000Z";
    state.stages = {
      internal_kickoff: { completedAt: "2026-09-02T10:00:00.000Z" },
      client_kickoff: { completedAt: "2026-09-03T10:00:00.000Z", notRequired: true },
      key_collection: { completedAt: "2026-09-04T10:00:00.000Z", handedOverAt: "2026-09-04T09:00:00.000Z", receivedAt: "2026-09-04T10:00:00.000Z" },
      site_measurement: { completedAt: "2026-09-05T10:00:00.000Z" },
      existing_furniture_dimensions: { completedAt: "2026-09-06T10:00:00.000Z", acceptedAt: "2026-09-06T10:00:00.000Z", noExistingFurniture: true, rooms: [] }
    };
    if (blocked) state.pauses = [{ startedAt: "2026-09-10T12:00:00.000Z", endedAt: null }];
    await repository.saveDesignWorkflowState(project.id, 0, state);
    const hierarchy = (await repository.getProjectHierarchy(project.id))!;
    const completedAt = ["2026-09-09T10:00:00.000Z", "2026-09-10T10:00:00.000Z"];
    const deadlines = ["2026-09-12T10:00:00.000Z", "2026-09-14T10:00:00.000Z"];
    for (const [index, actualFloor] of hierarchy.floors.entries()) {
      const spacePlanning = actualFloor.stages.find((stage) => stage.type === "space_planning_tentative_look_feel")!;
      await repository.createTask({ ...seed.tasks[0]!, id: `space-planning-task-${index}`, projectId: project.id, floorId: actualFloor.id, stageId: spacePlanning.id,
        status: complete ? "completed" : "in_progress", progress: complete ? 100 : index ? 80 : 20, plannedEffort: index ? 3 : 1,
        completedAt: complete ? completedAt[index]! : null, currentDeadlineAt: deadlines[index]!, dependencyTaskIds: [] });
    }
    const before = await repository.getProjectHierarchy(project.id);
    const beforeState = await repository.findDesignWorkflowState(project.id);
    const result = (await view(project.id)).projectStages!.find((stage) => stage.type === "space_planning_tentative_look_feel")!;
    expect(result.instructions).toMatchObject({ owner: "Assigned Designer", sla: { enabled: false, bands: [] } });
    expect(result).toMatchObject({ status, progress, deadlineAt: complete ? null : deadlines[0], deadlineTaskId: complete ? null : "space-planning-task-0" });
    expect(result.tasks).toHaveLength(2);
    expect(result.operational).toMatchObject({ status, availableActions: [], timing: {
      state: timing, startsAt: null, endsAt: complete ? completedAt[1] : null, targetAt: null, originalTargetAt: null,
      slaAllowanceMs: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0
    } });
    expect(result.operational!.blockingReasons).toEqual(blocked ? ["The Client has blocked site access. Restore access to resume the workflow."] : []);
    expect(await repository.getProjectHierarchy(project.id)).toEqual(before);
    expect(await repository.findDesignWorkflowState(project.id)).toEqual(beforeState);
  });

  it("creates six mapped stages per floor, aggregates their real tasks once, and retains custom stages and aliases", async () => {
    const { create, floor, view, repository, seed, designer, service } = setup();
    const project = await create();
    const first = await floor(project.id);
    const second = await floor(project.id, { name: "First floor", number: "1", order: 1 });
    const hierarchy = (await repository.getProjectHierarchy(project.id))!;
    expect(hierarchy.floors.map((item) => item.stages.length)).toEqual([6, 6]);
    expect(hierarchy.floors.flatMap((item) => item.stages.flatMap((stage) => stage.tasks))).toEqual([]);
    const initial = await view(project.id);
    expect(initial.projectStages).toHaveLength(6);
    expect(initial.floors).toEqual([]);
    const sourceTask = seed.tasks[0]!;
    for (const [index, actualFloor] of hierarchy.floors.entries()) {
      await repository.createTask({ ...sourceTask, id: `excel-task-${index}`, projectId: project.id, floorId: actualFloor.id, stageId: actualFloor.stages[0]!.id, progress: index ? 80 : 20, plannedEffort: index ? 3 : 1, status: "in_progress", completedAt: null, currentDeadlineAt: index ? "2026-09-14T10:00:00.000Z" : "2026-09-12T10:00:00.000Z", dependencyTaskIds: [] });
    }
    const custom = await runWithHumanOperation("POST /floors/:floorId/stages", () => service.createStage(designer, first.id, { name: "Custom client revision", type: "client_revisions", order: 10, dependencyStageIds: [hierarchy.floors[0]!.stages[0]!.id] }));
    const before = await repository.getProjectHierarchy(project.id);
    const result = await view(project.id);
    expect(result.projectStages).toHaveLength(6);
    expect(result.projectStages![0]).toMatchObject({ progress: 0, status: "not_started", deadlineAt: "2026-09-12T10:00:00.000Z", sourceStages: [
      { id: hierarchy.floors[0]!.stages[0]!.id, name: names[0], floorName: first.name },
      { id: hierarchy.floors[1]!.stages[0]!.id, name: names[0], floorName: second.name }
    ] });
    expect(result.projectStages![0]!.tasks.map((task) => task.floorName)).toEqual([first.name, second.name]);
    expect(result.floors).toHaveLength(1);
    expect(result.floors[0]!.stages.map((stage) => stage.id)).toEqual([custom.id]);
    expect(result.floors[0]!.stages[0]!.dependencyStageIds).toEqual([hierarchy.floors[0]!.stages[0]!.id]);
    expect(await repository.getProjectHierarchy(project.id)).toEqual(before);
    const audits = await repository.pageAuditEvents({ entityType: "design_stage" }, { limit: 100, offset: 0 });
    expect(audits.items.filter((event) => event.newValues?.projectId === project.id)).toHaveLength(13);
  });

  it("preserves unmatched or wrongly typed stage mappings as visible floor stages", async () => {
    const { create, floor, view, repository } = setup();
    const project = await create();
    const createdFloor = await floor(project.id);
    const stage = (await repository.getProjectHierarchy(project.id))!.floors[0]!.stages[0]!;
    await repository.createDesignStage({ ...stage, id: "foreign-map", workflowStageId: "other-project:stage" });
    await repository.createDesignStage({ ...stage, id: "wrong-type-map", type: "floor_plan" });
    const result = await view(project.id);
    expect(result.floors[0]!.id).toBe(createdFloor.id);
    expect(result.floors[0]!.stages.map((stage) => stage.id)).toEqual(["foreign-map", "wrong-type-map"]);
    expect(result.projectStages![0]!.sourceStages).toHaveLength(1);
  });

  it.each(["existing_furniture_dimensions", "space_planning_tentative_look_feel"] as const)("accepts manual %s stages without allowing forged workflow links", async (type) => {
    const { service, actor, designer, repository } = setup();
    const floorId = (await repository.getProjectHierarchy("project-aurora-villa"))!.floors[0]!.id;
    const app = express();
    app.use(express.json());
    app.use(createProjectsRouter({ authenticate: async (id: string) => actor(id) } as unknown as AuthService, service));
    app.use(errorHandler);
    const input = { name: "Manual custom stage", type, order: 90 };
    const response = await request(app).post(`/floors/${floorId}/stages`).set("Authorization", `Bearer ${designer.id}`).send(input).expect(201);
    expect(response.body.data).toMatchObject(input);
    expect(response.body.data).not.toHaveProperty("workflowStageId");
    await request(app).post(`/floors/${floorId}/stages`).set("Authorization", `Bearer ${designer.id}`).send({ ...input, workflowStageId: "forged-link" }).expect(400);
  });

  it("keeps legacy projects unchanged and does not create default stages on their new floors", async () => {
    const { repository, floor, view } = setup();
    const projectId = "project-aurora-villa";
    const createdFloor = await floor(projectId);
    expect((await repository.getProjectHierarchy(projectId))!.floors.find((floor) => floor.id === createdFloor.id)!.stages).toEqual([]);
    expect(await view(projectId)).not.toHaveProperty("projectStages");
    expect(await repository.findProjectById(projectId)).not.toHaveProperty("designWorkflowStages");
  });
});
