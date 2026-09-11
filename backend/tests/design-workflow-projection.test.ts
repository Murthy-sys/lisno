import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createProjectService } from "../src/services/project.service.js";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const OPERATION = "GET /projects/:projectId/design-workflow" as const;
function setup() {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects.find((item) => item.id === "project-aurora-villa")!;
  const baseUser = seed.users[0]!;
  seed.users.push({ ...baseUser, id: "workflow-client", role: "client", name: "Client", active: true });
  seed.users.push({ ...baseUser, id: "workflow-unrelated-client", role: "client", active: true });
  seed.users.push({ ...baseUser, id: "workflow-admin", role: "admin", active: true });
  seed.users.push({ ...baseUser, id: "workflow-revoked-admin", role: "admin", active: true });
  project.clientId = "workflow-client";
  seed.projectAccessGrants.push({
    id: "workflow-grant", projectId: project.id, userId: "workflow-admin", module: "projects", source: "admin_initiator", accessRequestId: null,
    grantedById: baseUser.id, active: true, grantedAt: NOW.toISOString(), revokedAt: null, revokedById: null, revocationReason: null, version: 1,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString()
  });
  const stage = seed.stages.find((item) => item.id === "stage-ground-plan")!;
  seed.stages.push({ ...stage, id: "empty-workflow-stage", name: "Saved empty stage", order: 99 });
  const task = seed.tasks.find((item) => item.stageId === stage.id)!;
  task.description = "Internal private design note";
  const repository = createMemoryRepository(seed);
  const service = createProjectService(repository, createAuditService(repository), () => NOW);
  const actor = (id: string): PublicUser => {
    const user = seed.users.find((item) => item.id === id)!;
    return { id, role: user.role, name: user.name, email: user.email };
  };
  const app = express();
  app.use(createProjectsRouter({ authenticate: async (id: string) => actor(id) } as unknown as AuthService, service));
  app.use(errorHandler);
  return { seed, project, stage, task, repository, service, actor, app };
}

describe("saved Design workflow projection", () => {
  it("preserves every saved stage, order and dependency, with deadlines from unfinished tasks", async () => {
    const { service, actor, project, seed, repository } = setup();
    const before = await repository.getProjectHierarchy(project.id);
    const view = await runWithHumanOperation(OPERATION, () => service.designWorkflow(actor("user-designer-ananya"), project.id));
    expect(view.serverNow).toBe(NOW.toISOString());
    expect(view.projectId).toBe(project.id);
    const stages = view.floors.flatMap((floor) => floor.stages);
    expect(stages).toHaveLength(seed.stages.filter((stage) => stage.projectId === project.id).length);
    for (const floor of view.floors) {
      expect(floor.stages.map((stage) => stage.order)).toEqual(floor.stages.map((stage) => stage.order).sort((a, b) => a - b));
      for (const stage of floor.stages) {
        const saved = seed.stages.find((item) => item.id === stage.id)!;
        expect(stage.name).toBe(saved.name);
        expect(stage.dependencyStageIds).toEqual(saved.dependencyStageIds);
        const deadline = stage.tasks.filter((task) => task.status !== "completed")
          .sort((a, b) => Date.parse(a.currentDeadlineAt) - Date.parse(b.currentDeadlineAt) || a.id.localeCompare(b.id))[0];
        expect(stage.deadlineAt).toBe(deadline?.currentDeadlineAt ?? null);
        expect(stage.deadlineTaskId).toBe(deadline?.id ?? null);
      }
    }
    expect(stages.find((stage) => stage.id === "empty-workflow-stage")).toMatchObject({ status: null, progress: null, deadlineAt: null, tasks: [] });
    expect(await repository.getProjectHierarchy(project.id)).toEqual(before);
  });

  it("sanitizes Client projection without contacts, internal notes or user credentials", async () => {
    const { app, project } = setup();
    const result = await request(app).get(`/projects/${project.id}/design-workflow`).set("Authorization", "Bearer workflow-client").expect(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(Object.keys(result.body.data)).toEqual(["projectId", "projectName", "serverNow", "floors"]);
    const tasks = result.body.data.floors.flatMap((floor: any) => floor.stages.flatMap((stage: any) => stage.tasks));
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task: any) => task.description === "")).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(/Internal private|clientEmail|clientMobile|passwordHash|ownerId/);
  });

  it.each(["workflow-unrelated-client", "workflow-revoked-admin"])("does not disclose another project's workflow to %s", async (id) => {
    const { app, project } = setup();
    const denied = await request(app).get(`/projects/${project.id}/design-workflow`).set("Authorization", `Bearer ${id}`).expect(404);
    const absent = await request(app).get("/projects/missing/design-workflow").set("Authorization", `Bearer ${id}`).expect(404);
    expect(denied.body).toEqual(absent.body);
  });

  it("rejects a forged Super Admin identity before reading project data", async () => {
    const { service, actor, project } = setup();
    await expect(runWithHumanOperation(OPERATION, () => service.designWorkflow({ ...actor("workflow-client"), role: "super_admin" }, project.id))).rejects.toMatchObject({ status: 404 });
  });

  it("allows only the active Sales Manager project grant and canonical Super Admin read", async () => {
    const { app, project, seed } = setup();
    await request(app).get(`/projects/${project.id}/design-workflow`).set("Authorization", "Bearer workflow-admin").expect(200);
    const superAdmin = seed.users.find((user) => user.role === "super_admin")!;
    await request(app).get(`/projects/${project.id}/design-workflow`).set("Authorization", `Bearer ${superAdmin.id}`).expect(200);
  });
});
