import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository } from "../src/repositories/types.js";
import type { Role } from "../src/contracts/domain.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
const auth = {
  jwtSecret: JWT_SECRET,
  jwtExpiresInSeconds: 900
};
const TEST_NOW = "2026-07-16T12:00:00.000Z";
const clock = () => new Date(TEST_NOW);

const users = {
  head: ["user-head", "design_head"],
  managerAarav: ["user-manager-aarav", "design_manager"],
  managerMeera: ["user-manager-meera", "design_manager"],
  ananya: ["user-designer-ananya", "designer"],
  kabir: ["user-designer-kabir", "designer"],
  ishita: ["user-designer-ishita", "designer"],
  auroraClient: ["user-client-aurora", "client"],
  celesteClient: ["user-client-celeste", "client"]
} as const satisfies Record<string, readonly [string, Role]>;

function bearer([id, role]: readonly [string, Role]) {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

function setup() {
  const repository = createMemoryRepository(structuredClone(demoSeedData));
  return {
    repository,
    app: createApp({ repository, auth, clock })
  };
}

function failAuditWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === "appendAuditEvent") {
        return async () => {
          throw new Error("simulated audit storage failure");
        };
      }
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(
        operation: (transaction: AppRepository) => Promise<T>
      ) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "appendAuditEvent") {
                  return async () => {
                    throw new Error("simulated audit storage failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

describe("project workflows", () => {
  it("paginates projects with validated defaults, limits, totals, and unknown fields", async () => {
    const { app } = setup();
    const page = await request(app)
      .get("/api/v1/projects?limit=1&offset=1")
      .set("Authorization", bearer(users.head));

    expect(page.status).toBe(200);
    expect(page.body).toEqual({
      data: {
        items: [expect.objectContaining({ id: "project-aurora-villa" })],
        pagination: {
          limit: 1,
          offset: 1,
          total: 3,
          hasMore: true
        }
      }
    });

    const tooLarge = await request(app)
      .get("/api/v1/projects?limit=101")
      .set("Authorization", bearer(users.head));
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { limit: expect.any(String) }
    });

    const unknown = await request(app)
      .get("/api/v1/projects?foo=bar")
      .set("Authorization", bearer(users.head));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { foo: expect.any(String) }
    });
  });

  it("lets a designer initiate a project and then exposes it in their project list", async () => {
    const { app } = setup();
    const created = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Courtyard Residence",
        clientId: "user-client-aurora",
        assignedDesignerIds: ["user-designer-ananya"],
        managerId: "user-manager-aarav",
        location: "Mysuru",
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        plannedEndAt: "2026-10-31T17:00:00.000Z"
      });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      id: expect.any(String),
      name: "Courtyard Residence",
      initiatingDesignerId: "user-designer-ananya",
      assignedDesignerIds: ["user-designer-ananya"],
      status: "planning"
    });

    const listed = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", bearer(users.ananya));

    expect(listed.status).toBe(200);
    expect(
      listed.body.data.items.map((project: { id: string }) => project.id)
    ).toContain(created.body.data.id);
  });

  it("validates project timestamps as ISO datetimes", async () => {
    const { app } = setup();
    const response = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Invalid Schedule",
        clientId: "user-client-aurora",
        assignedDesignerIds: ["user-designer-ananya"],
        managerId: "user-manager-aarav",
        location: "Mysuru",
        plannedStartAt: "next Tuesday",
        plannedEndAt: "2026-10-31"
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          plannedStartAt: expect.any(String),
          plannedEndAt: expect.any(String)
        }
      }
    });
  });

  it("rejects unauthorized clients and cross-team project staffing", async () => {
    const { app } = setup();
    const unauthorizedClient = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", bearer(users.kabir))
      .send({
        name: "Unauthorized Client Project",
        clientId: "user-client-celeste",
        assignedDesignerIds: ["user-designer-kabir"],
        managerId: "user-manager-aarav",
        location: "Pune",
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        plannedEndAt: "2026-10-31T17:00:00.000Z"
      });
    expect(unauthorizedClient.status).toBe(403);

    const crossTeam = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Cross Team Project",
        clientId: "user-client-aurora",
        assignedDesignerIds: [
          "user-designer-ananya",
          "user-designer-ishita"
        ],
        managerId: "user-manager-aarav",
        location: "Bengaluru",
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        plannedEndAt: "2026-10-31T17:00:00.000Z"
      });
    expect(crossTeam.status).toBe(400);
    expect(crossTeam.body.error.code).toBe("INVALID_PROJECT");
  });

  it("isolates client projects and removes internal project hierarchy fields", async () => {
    const { app } = setup();
    const listed = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", bearer(users.auroraClient));

    expect(listed.status).toBe(200);
    expect(
      listed.body.data.items.map((project: { id: string }) => project.id)
    ).toEqual(["project-aurora-studio", "project-aurora-villa"]);
    expect(JSON.stringify(listed.body)).not.toContain("project-celeste-office");
    expect(JSON.stringify(listed.body)).not.toContain("assignedDesignerIds");
    expect(JSON.stringify(listed.body)).not.toContain("managerId");

    const ownProject = await request(app)
      .get("/api/v1/projects/project-aurora-villa")
      .set("Authorization", bearer(users.auroraClient));
    expect(ownProject.status).toBe(200);
    expect(ownProject.body.data.floors).toHaveLength(2);
    expect(ownProject.body.data.floors[0]).not.toHaveProperty("stages");
    expect(JSON.stringify(ownProject.body)).not.toContain("task-furniture-layout");

    const otherClientProject = await request(app)
      .get("/api/v1/projects/project-celeste-office")
      .set("Authorization", bearer(users.auroraClient));
    expect(otherClientProject.status).toBe(404);
  });

  it("derives project and floor delivery state from effort-weighted task progress", async () => {
    const seed = structuredClone(demoSeedData);
    const project = seed.projects.find(
      (candidate) => candidate.id === "project-aurora-villa"
    )!;
    project.status = "on_hold";
    for (const floor of seed.floors.filter(
      (candidate) => candidate.projectId === project.id
    )) {
      floor.progress = 99;
    }
    const furniture = seed.tasks.find(
      (candidate) => candidate.id === "task-furniture-layout"
    )!;
    furniture.status = "completed";
    furniture.progress = 100;
    furniture.plannedEffort = 3;
    furniture.completedAt = "2026-07-15T17:00:00.000Z";
    const circulation = seed.tasks.find(
      (candidate) => candidate.id === "task-circulation"
    )!;
    circulation.status = "not_started";
    circulation.progress = 0;
    circulation.plannedEffort = 1;
    circulation.completedAt = null;
    const future = seed.tasks.find(
      (candidate) => candidate.id === "task-future-concept"
    )!;
    future.plannedEffort = 1;

    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    const internal = await request(app)
      .get(`/api/v1/projects/${project.id}`)
      .set("Authorization", bearer(users.ananya));

    expect(internal.status).toBe(200);
    expect(internal.body.data).toMatchObject({
      id: project.id,
      status: "active",
      progress: 60,
      floors: [
        expect.objectContaining({ id: "floor-aurora-ground", progress: 75 }),
        expect.objectContaining({ id: "floor-aurora-first", progress: 0 })
      ]
    });

    const listed = await request(app)
      .get("/api/v1/projects?limit=20&offset=0")
      .set("Authorization", bearer(users.ananya));
    expect(
      listed.body.data.items.find(
        (candidate: { id: string }) => candidate.id === project.id
      )
    ).toMatchObject({ status: "active", progress: 60 });

    const client = await request(app)
      .get("/api/v1/client/project-summaries?limit=1&offset=1")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(200);
    expect(client.body.data).toEqual({
      items: [
        expect.objectContaining({
          id: project.id,
          status: "active",
          progress: 60,
          floorCount: 2
        })
      ],
      pagination: {
        limit: 1,
        offset: 1,
        total: 2,
        hasMore: false
      }
    });
    expect(JSON.stringify(client.body)).not.toContain("assignedDesignerIds");
    expect(JSON.stringify(client.body)).not.toContain("managerId");
    expect(JSON.stringify(client.body)).not.toContain("ownerId");
  });

  it("keeps caller-supplied floor progress out of the creation contract", async () => {
    const { app } = setup();
    const response = await request(app)
      .post("/api/v1/projects/project-aurora-villa/floors")
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Caller Progress Floor",
        number: "CP",
        order: 4,
        progress: 87,
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        plannedEndAt: "2026-08-31T17:00:00.000Z"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { progress: expect.any(String) }
    });
  });

  it("decorates every internal hierarchy task, including teammate work, with server risk", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/api/v1/projects/project-aurora-villa")
      .set("Authorization", bearer(users.ananya));

    expect(response.status).toBe(200);
    const tasks = response.body.data.floors.flatMap(
      (floor: { stages: Array<{ tasks: Array<Record<string, unknown>> }> }) =>
        floor.stages.flatMap((stage) => stage.tasks)
    );
    const teammateTask = tasks.find(
      (candidate: { id: string }) => candidate.id === "task-circulation"
    );
    expect(teammateTask).toMatchObject({
      ownerId: "user-designer-kabir",
      risk: {
        level: expect.any(String),
        reason: expect.any(String),
        elapsedRatio: expect.any(Number),
        progressRatio: 0.2
      }
    });
  });

  it("creates floor and stage records but rejects nonzero initial task progress", async () => {
    const { app } = setup();
    const floor = await request(app)
      .post("/api/v1/projects/project-aurora-villa/floors")
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Terrace",
        number: "T",
        order: 3,
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        plannedEndAt: "2026-08-31T17:00:00.000Z"
      });
    expect(floor.status).toBe(201);

    const stage = await request(app)
      .post(`/api/v1/floors/${floor.body.data.id}/stages`)
      .set("Authorization", bearer(users.ananya))
      .send({
        name: "Terrace concept",
        type: "concept_mood_board",
        order: 1
      });
    expect(stage.status).toBe(201);

    const inconsistentTask = await request(app)
      .post(`/api/v1/stages/${stage.body.data.id}/tasks`)
      .set("Authorization", bearer(users.ananya))
      .send({
        title: "Draft terrace concept",
        order: 1,
        ownerId: "user-designer-ananya",
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        originalDeadlineAt: "2026-08-15T17:00:00.000Z",
        progress: 1
      });
    expect(inconsistentTask.status).toBe(400);
    expect(inconsistentTask.body.error.code).toBe("INVALID_TASK");

    const task = await request(app)
      .post(`/api/v1/stages/${stage.body.data.id}/tasks`)
      .set("Authorization", bearer(users.ananya))
      .send({
        title: "Draft terrace concept",
        order: 1,
        ownerId: "user-designer-ananya",
        plannedStartAt: "2026-08-01T09:00:00.000Z",
        originalDeadlineAt: "2026-08-15T17:00:00.000Z"
      });
    expect(task.status).toBe(201);
    expect(task.body.data).toMatchObject({
      status: "not_started",
      progress: 0,
      originalDeadlineAt: "2026-08-15T17:00:00.000Z",
      currentDeadlineAt: "2026-08-15T17:00:00.000Z",
      version: 1
    });
  });

  it.each([
    ["project", "/api/v1/projects", {
      name: "Atomic Project",
      clientId: "user-client-aurora",
      assignedDesignerIds: ["user-designer-ananya"],
      managerId: "user-manager-aarav",
      location: "Bengaluru",
      plannedStartAt: "2026-08-01T09:00:00.000Z",
      plannedEndAt: "2026-10-31T17:00:00.000Z"
    }, "Atomic Project"],
    ["floor", "/api/v1/projects/project-aurora-villa/floors", {
      name: "Atomic Floor",
      number: "A",
      order: 99,
      plannedStartAt: "2026-08-01T09:00:00.000Z",
      plannedEndAt: "2026-08-31T17:00:00.000Z"
    }, "Atomic Floor"],
    ["stage", "/api/v1/floors/floor-aurora-ground/stages", {
      name: "Atomic Stage",
      type: "concept_mood_board",
      order: 99
    }, "Atomic Stage"],
    ["task", "/api/v1/stages/stage-ground-plan/tasks", {
      title: "Atomic Task",
      order: 99,
      ownerId: "user-designer-ananya",
      plannedStartAt: "2026-07-16T09:00:00.000Z",
      originalDeadlineAt: "2026-07-30T17:00:00.000Z"
    }, "Atomic Task"]
  ] as const)(
    "rolls back %s creation when its audit append fails",
    async (_entityType, path, body, marker) => {
      const base = createMemoryRepository(structuredClone(demoSeedData));
      const app = createApp({
        repository: failAuditWrites(base),
        auth,
        clock
      });

      const response = await request(app)
        .post(path)
        .set("Authorization", bearer(users.ananya))
        .send(body);

      expect(response.status).toBe(500);
      const projects = await base.listProjectsForUser(
        (await base.findUserById("user-head"))!
      );
      const hierarchy = await base.getProjectHierarchy("project-aurora-villa");
      expect(JSON.stringify({ projects, hierarchy })).not.toContain(marker);
    }
  );
});

describe("task workflows", () => {
  it("lets only the owning designer update a task and appends task and audit events", async () => {
    const { app, repository } = setup();
    const denied = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.ananya))
      .send({
        version: 1,
        progress: 35
      });
    expect(denied.status).toBe(403);

    const updated = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        status: "blocked",
        progress: 35,
        note: "Clearance checks are underway"
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      id: "task-circulation",
      status: "blocked",
      progress: 35,
      version: 2,
      latestUpdateAt: TEST_NOW
    });
    await expect(repository.listTaskEvents("task-circulation")).resolves.toMatchObject([
      {
        type: "status_changed",
        actorId: "user-designer-kabir",
        occurredAt: TEST_NOW
      },
      { type: "progress_changed", actorId: "user-designer-kabir" },
      { type: "note_added", note: "Clearance checks are underway" }
    ]);
    await expect(
      repository.listAuditEvents({ entityId: "task-circulation" })
    ).resolves.toMatchObject([
      { action: "task_status_changed" },
      { action: "task_progress_changed" },
      { action: "task_note_added" }
    ]);
  });

  it("rejects stale versions, invalid progress, immutable original deadlines, and invalid completion data", async () => {
    const { app } = setup();

    const stale = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 2,
        progress: 30
      });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");

    const forgedTimestamp = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        progress: 30,
        occurredAt: "2026-07-01T09:00:00.000Z"
      });
    expect(forgedTimestamp.status).toBe(400);
    expect(forgedTimestamp.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { occurredAt: expect.any(String) }
    });

    const forgedCompletion = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        status: "completed",
        progress: 100,
        completedAt: "2026-07-01T09:00:00.000Z"
      });
    expect(forgedCompletion.status).toBe(400);
    expect(forgedCompletion.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { completedAt: expect.any(String) }
    });

    const invalid = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        progress: 101,
        originalDeadlineAt: "2026-08-20T17:00:00.000Z"
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const incompleteCompletion = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        status: "completed",
        progress: 99
      });
    expect(incompleteCompletion.status).toBe(400);
    expect(incompleteCompletion.body.error.code).toBe("INVALID_TASK_UPDATE");
  });

  it("enforces valid task transitions and completed dependencies", async () => {
    const seed = structuredClone(demoSeedData);
    const dependent = seed.tasks.find((task) => task.id === "task-circulation")!;
    dependent.status = "not_started";
    dependent.progress = 0;
    dependent.dependencyTaskIds = ["task-furniture-layout"];
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });

    const blocked = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        status: "in_progress",
        progress: 1
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DEPENDENCY_INCOMPLETE");

    const progressBypass = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        progress: 1
      });
    expect(progressBypass.status).toBe(409);
    expect(progressBypass.body.error.code).toBe("DEPENDENCY_INCOMPLETE");

    const invalidTransition = await request(app)
      .patch("/api/v1/tasks/task-future-concept")
      .set("Authorization", bearer(users.ananya))
      .send({
        version: 1,
        status: "in_review",
        progress: 50
      });
    expect(invalidTransition.status).toBe(400);
    expect(invalidTransition.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("keeps the original deadline immutable and permits only reasoned own-team manager revisions", async () => {
    const { app, repository } = setup();
    const noReason = await request(app)
      .patch("/api/v1/tasks/task-circulation/deadline")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        version: 1,
        currentDeadlineAt: "2026-07-24T17:00:00.000Z",
        reason: ""
      });
    expect(noReason.status).toBe(400);

    const otherManager = await request(app)
      .patch("/api/v1/tasks/task-circulation/deadline")
      .set("Authorization", bearer(users.managerMeera))
      .send({
        version: 99,
        currentDeadlineAt: "2026-07-24T17:00:00.000Z",
        reason: "Client availability changed"
      });
    expect(otherManager.status).toBe(403);

    const revised = await request(app)
      .patch("/api/v1/tasks/task-circulation/deadline")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        version: 1,
        currentDeadlineAt: "2026-07-24T17:00:00.000Z",
        reason: "Client availability changed"
      });
    expect(revised.status).toBe(200);
    expect(revised.body.data).toMatchObject({
      originalDeadlineAt: "2026-07-20T17:00:00.000Z",
      currentDeadlineAt: "2026-07-24T17:00:00.000Z",
      version: 2
    });
    await expect(repository.listTaskEvents("task-circulation")).resolves.toMatchObject([
      {
        type: "deadline_revised",
        note: "Client availability changed",
        from: { currentDeadlineAt: "2026-07-20T17:00:00.000Z" },
        to: { currentDeadlineAt: "2026-07-24T17:00:00.000Z" }
      }
    ]);
    await expect(
      repository.listAuditEvents({ entityId: "task-circulation" })
    ).resolves.toMatchObject([
      {
        action: "task_deadline_revised",
        reason: "Client availability changed"
      }
    ]);
  });

  it("does not permit a completed task deadline to rewrite its KPI outcome", async () => {
    const { app } = setup();
    const completed = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({
        version: 1,
        status: "completed",
        progress: 100
      });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).toBe(TEST_NOW);

    const revision = await request(app)
      .patch("/api/v1/tasks/task-circulation/deadline")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        version: 2,
        currentDeadlineAt: "2026-07-18T17:00:00.000Z",
        reason: "Retroactive adjustment"
      });
    expect(revision.status).toBe(409);
    expect(revision.body.error.code).toBe("TASK_ALREADY_COMPLETED");
  });

  it("rolls task state and history back when an audit append fails", async () => {
    const base = createMemoryRepository(structuredClone(demoSeedData));
    const failingRepository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(
          operation: (transaction: AppRepository) => Promise<T>
        ) =>
          target.runInTransaction((transaction) =>
            operation(
              new Proxy(transaction, {
                get(transactionTarget, transactionProperty, transactionReceiver) {
                  if (transactionProperty === "appendAuditEvent") {
                    return async () => {
                      throw new Error("simulated audit storage failure");
                    };
                  }
                  return Reflect.get(
                    transactionTarget,
                    transactionProperty,
                    transactionReceiver
                  );
                }
              })
            )
          );
      }
    });
    const app = createApp({ repository: failingRepository, auth, clock });

    const response = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({ version: 1, progress: 45 });

    expect(response.status).toBe(500);
    await expect(
      base.findTaskById("task-circulation")
    ).resolves.toMatchObject({ progress: 20, version: 1 });
    await expect(base.listTaskEvents("task-circulation")).resolves.toEqual([]);
    await expect(
      base.listAuditEvents({ entityId: "task-circulation" })
    ).resolves.toEqual([]);
  });
});

describe("organization and KPI workflows", () => {
  it("returns direct-report summaries only to the authenticated design manager", async () => {
    const { app } = setup();

    const response = await request(app)
      .get("/api/v1/organization/team")
      .set("Authorization", bearer(users.managerAarav));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-designer-ananya" }),
          kpi: expect.objectContaining({ score: expect.any(Number) }),
          workload: expect.any(Number),
          overdueCount: expect.any(Number),
          yellowRiskCount: expect.any(Number)
        }),
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-designer-kabir" })
        })
      ]),
      pagination: {
        limit: 20,
        offset: 0,
        total: 2,
        hasMore: false
      }
    });
    expect(response.body.data.items).toHaveLength(2);

    const crossRole = await request(app)
      .get("/api/v1/organization/team")
      .set("Authorization", bearer(users.head));
    expect(crossRole.status).toBe(403);
  });

  it("restricts the full organization tree to the design head and returns safe designer summaries", async () => {
    const { app } = setup();
    const denied = await request(app)
      .get("/api/v1/organization/tree")
      .set("Authorization", bearer(users.managerAarav));
    expect(denied.status).toBe(403);

    const tree = await request(app)
      .get("/api/v1/organization/tree")
      .set("Authorization", bearer(users.head));
    expect(tree.status).toBe(200);
    expect(tree.body.data.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 2,
      hasMore: false
    });
    expect(tree.body.data.items).toHaveLength(2);
    expect(tree.body.data.items[0]).toMatchObject({
      id: "user-manager-aarav",
      summary: {
        teamKpi: { score: expect.any(Number) },
        workload: expect.any(Number),
        redCount: expect.any(Number),
        yellowCount: expect.any(Number),
        evaluationCoverage: 50
      },
      designers: {
        items: [
          {
            id: "user-designer-ananya",
            summary: {
              kpi: { score: expect.any(Number) },
              projects: expect.arrayContaining([
                expect.objectContaining({ id: "project-aurora-villa" })
              ])
            }
          },
          { id: "user-designer-kabir", summary: expect.any(Object) }
        ],
        pagination: {
          limit: 20,
          offset: 0,
          total: 2,
          hasMore: false
        }
      }
    });
    expect(JSON.stringify(tree.body)).not.toContain("passwordHash");

    const otherTeam = await request(app)
      .get("/api/v1/designers/user-designer-ishita/summary")
      .set("Authorization", bearer(users.managerAarav));
    expect(otherTeam.status).toBe(403);

    const ownTeam = await request(app)
      .get("/api/v1/designers/user-designer-ananya/summary")
      .set("Authorization", bearer(users.managerAarav));
    expect(ownTeam.status).toBe(200);
    expect(ownTeam.body.data).toMatchObject({
      user: { id: "user-designer-ananya" },
      activeProjectCount: 2,
      kpi: { score: expect.any(Number) },
      tasks: expect.any(Array)
    });
    expect(JSON.stringify(ownTeam.body)).not.toContain("password");
  });

  it("computes manager aggregates over the full bounded team beyond the nested designer page", async () => {
    const seed = structuredClone(demoSeedData);
    const designerTemplate = seed.users.find(
      (candidate) => candidate.id === "user-designer-ananya"
    )!;
    const evaluationTemplate = seed.evaluations[0]!;
    seed.evaluations.push({
      ...evaluationTemplate,
      id: "evaluation-ananya-june",
      subjectUserId: designerTemplate.id
    });
    for (let index = 0; index < 18; index += 1) {
      const designerId = `user-designer-aggregate-${String(index).padStart(2, "0")}`;
      seed.users.push({
        ...designerTemplate,
        id: designerId,
        name: `Aggregate Designer ${String(index).padStart(2, "0")}`,
        email: `aggregate-designer-${index}@lisno.example`,
        authorizedClientIds: []
      });
      seed.evaluations.push({
        ...evaluationTemplate,
        id: `evaluation-aggregate-${index}`,
        subjectUserId: designerId
      });
    }
    seed.users.push({
      ...designerTemplate,
      id: "user-designer-aggregate-last",
      name: "ZZ Aggregate Designer",
      email: "aggregate-designer-last@lisno.example",
      authorizedClientIds: []
    });
    seed.tasks.push({
      ...seed.tasks.find(
        (candidate) => candidate.id === "task-furniture-layout"
      )!,
      id: "task-aggregate-last-overdue",
      title: "Recover overdue aggregate task",
      ownerId: "user-designer-aggregate-last",
      plannedEffort: 13,
      progress: 40,
      originalDeadlineAt: "2026-07-10T17:00:00.000Z",
      currentDeadlineAt: "2026-07-10T17:00:00.000Z"
    });
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });

    const response = await request(app)
      .get("/api/v1/organization/tree")
      .set("Authorization", bearer(users.head));

    expect(response.status).toBe(200);
    const manager = response.body.data.items.find(
      (candidate: { id: string }) => candidate.id === "user-manager-aarav"
    );
    expect(manager.designers.items).toHaveLength(20);
    expect(manager.designers.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "user-designer-aggregate-last" })
      ])
    );
    expect(manager.designers.pagination).toMatchObject({
      total: 21,
      hasMore: true
    });
    expect(manager.summary).toMatchObject({
      workload: 45,
      redCount: 1,
      evaluationCoverage: 95.2,
      teamKpi: {
        components: expect.arrayContaining([
          expect.objectContaining({
            key: "workloadCompletion",
            eligibleCount: 5
          })
        ])
      }
    });
  });

  it("rejects manager aggregates above the explicit team cardinality limit", async () => {
    const seed = structuredClone(demoSeedData);
    const designerTemplate = seed.users.find(
      (candidate) => candidate.id === "user-designer-ananya"
    )!;
    for (let index = 0; index < 99; index += 1) {
      seed.users.push({
        ...designerTemplate,
        id: `user-designer-over-limit-${index}`,
        name: `Over Limit Designer ${index}`,
        email: `over-limit-designer-${index}@lisno.example`,
        authorizedClientIds: []
      });
    }
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });

    const response = await request(app)
      .get("/api/v1/organization/tree")
      .set("Authorization", bearer(users.head));

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: "TEAM_SUMMARY_LIMIT_EXCEEDED"
    });
  });

  it("paginates more than one page of manager team and head hierarchy records", async () => {
    const seed = structuredClone(demoSeedData);
    const designerTemplate = seed.users.find(
      (candidate) => candidate.id === "user-designer-ananya"
    )!;
    const managerTemplate = seed.users.find(
      (candidate) => candidate.id === "user-manager-aarav"
    )!;
    for (let index = 0; index < 21; index += 1) {
      seed.users.push({
        ...designerTemplate,
        id: `user-designer-page-${String(index).padStart(2, "0")}`,
        name: `Paged Designer ${String(index).padStart(2, "0")}`,
        email: `paged-designer-${index}@lisno.example`,
        managerId: managerTemplate.id,
        authorizedClientIds: []
      });
      seed.users.push({
        ...managerTemplate,
        id: `user-manager-page-${String(index).padStart(2, "0")}`,
        name: `Paged Manager ${String(index).padStart(2, "0")}`,
        email: `paged-manager-${index}@lisno.example`
      });
    }
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });

    const teamFirst = await request(app)
      .get("/api/v1/organization/team?limit=20&offset=0")
      .set("Authorization", bearer(users.managerAarav));
    expect(teamFirst.status).toBe(200);
    expect(teamFirst.body.data.items).toHaveLength(20);
    expect(teamFirst.body.data.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 23,
      hasMore: true
    });

    const teamSecond = await request(app)
      .get("/api/v1/organization/team?limit=20&offset=20")
      .set("Authorization", bearer(users.managerAarav));
    expect(teamSecond.status).toBe(200);
    expect(teamSecond.body.data.items).toHaveLength(3);
    expect(teamSecond.body.data.pagination).toEqual({
      limit: 20,
      offset: 20,
      total: 23,
      hasMore: false
    });

    const treeFirst = await request(app)
      .get("/api/v1/organization/tree?limit=20&offset=0")
      .set("Authorization", bearer(users.head));
    expect(treeFirst.status).toBe(200);
    expect(treeFirst.body.data.items).toHaveLength(20);
    expect(treeFirst.body.data.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 23,
      hasMore: true
    });
    const aarav = treeFirst.body.data.items.find(
      (manager: { id: string }) => manager.id === "user-manager-aarav"
    );
    expect(aarav.designers.items).toHaveLength(20);
    expect(aarav.designers.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 23,
      hasMore: true
    });

    const nestedSecond = await request(app)
      .get(
        "/api/v1/organization/managers/user-manager-aarav/designers?limit=20&offset=20"
      )
      .set("Authorization", bearer(users.head));
    expect(nestedSecond.status).toBe(200);
    expect(nestedSecond.body.data.items).toHaveLength(3);
    expect(nestedSecond.body.data.pagination).toEqual({
      limit: 20,
      offset: 20,
      total: 23,
      hasMore: false
    });

    const treeSecond = await request(app)
      .get("/api/v1/organization/tree?limit=20&offset=20")
      .set("Authorization", bearer(users.head));
    expect(treeSecond.status).toBe(200);
    expect(treeSecond.body.data.items).toHaveLength(3);
    expect(treeSecond.body.data.pagination).toEqual({
      limit: 20,
      offset: 20,
      total: 23,
      hasMore: false
    });
  });

  it("builds the paginated hierarchy with bounded batch reads", async () => {
    const base = createMemoryRepository(structuredClone(demoSeedData));
    let eventBatchCalls = 0;
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property === "listProjectsForUser") {
          return async (user: { role: string }) => {
            if (user.role === "design_head") {
              throw new Error("head-wide project enumeration invoked");
            }
            return target.listProjectsForUser(user as never);
          };
        }
        if (property === "listEvaluationsForSubject") {
          return async () => {
            throw new Error("single-subject evaluation read invoked");
          };
        }
        if (property === "listKpiTaskEventsForTasks") {
          return async (...args: Parameters<AppRepository["listKpiTaskEventsForTasks"]>) => {
            eventBatchCalls += 1;
            return target.listKpiTaskEventsForTasks(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const app = createApp({ repository, auth, clock });

    const response = await request(app)
      .get("/api/v1/organization/tree?limit=20&offset=0")
      .set("Authorization", bearer(users.head));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(eventBatchCalls).toBe(1);
  });

  it("uses the same version-enriched KPI evidence for personal and hierarchy summaries", async () => {
    const seed = structuredClone(demoSeedData);
    const version = seed.designVersions[0]!;
    seed.designVersions.push(
      {
        ...version,
        id: "version-circulation-1",
        taskId: "task-circulation",
        versionNumber: 1,
        approvalStatus: "draft",
        reviewerId: null,
        approvedAt: null,
        clientVisible: false
      },
      {
        ...version,
        id: "version-circulation-2",
        taskId: "task-circulation",
        versionNumber: 2,
        approvalStatus: "in_review",
        reviewerId: "user-manager-aarav",
        approvedAt: null,
        clientVisible: false
      }
    );
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    const range =
      "from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z";

    const personal = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir?${range}`)
      .set("Authorization", bearer(users.managerAarav));
    const team = await request(app)
      .get("/api/v1/organization/team?limit=20&offset=0")
      .set("Authorization", bearer(users.managerAarav));

    expect(personal.status).toBe(200);
    expect(team.status).toBe(200);
    const personalRevision = personal.body.data.components.find(
      (component: { key: string }) => component.key === "revisionEfficiency"
    );
    const hierarchyRevision = team.body.data.items
      .find(
        (summary: { user: { id: string } }) =>
          summary.user.id === "user-designer-kabir"
      )
      .kpi.components.find(
        (component: { key: string }) => component.key === "revisionEfficiency"
      );
    expect(personalRevision).toMatchObject({ score: 100, eligibleCount: 1 });
    expect(hierarchyRevision).toEqual(personalRevision);
  });

  it("persists yellow risk history before a task recovers", async () => {
    const { app, repository } = setup();

    const response = await request(app)
      .patch("/api/v1/tasks/task-circulation")
      .set("Authorization", bearer(users.kabir))
      .send({ version: 1, progress: 90 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ progress: 90, wasYellow: true });
    await expect(repository.findTaskById("task-circulation")).resolves.toMatchObject({
      wasYellow: true
    });
  });

  it("rejects overlong and over-cardinality KPI reports with structured errors", async () => {
    const overlong = await request(setup().app)
      .get(
        "/api/v1/kpis/users/user-designer-kabir?from=2025-01-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(overlong.status).toBe(400);
    expect(overlong.body.error.code).toBe("INVALID_KPI_RANGE");

    const seed = structuredClone(demoSeedData);
    const template = seed.tasks.find(
      (task) => task.id === "task-circulation"
    )!;
    seed.tasks = seed.tasks.filter(
      (task) => task.ownerId !== "user-designer-kabir"
    );
    seed.tasks.push(
      ...Array.from({ length: 1001 }, (_, index) => ({
        ...template,
        id: `task-cardinality-${index}`,
        order: index
      }))
    );
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    const cardinality = await request(app)
      .get(
        "/api/v1/kpis/users/user-designer-kabir?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(cardinality.status).toBe(422);
    expect(cardinality.body.error.code).toBe("KPI_TASK_LIMIT_EXCEEDED");
  });

  it("calculates KPI and risk explanations on read while keeping KPI immutable", async () => {
    const { app } = setup();
    const response = await request(app)
      .get(
        "/api/v1/kpis/users/user-designer-kabir?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      userId: "user-designer-kabir",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: expect.any(Number),
      components: expect.any(Array),
      tasks: {
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "task-circulation",
            risk: expect.objectContaining({
              level: expect.any(String),
              reason: expect.any(String)
            })
          })
        ])
      }
    });
    expect(response.body.data).not.toHaveProperty("evaluations");

    const invalidRange = await request(app)
      .get(
        "/api/v1/kpis/users/user-designer-kabir?from=2026-08-01T00%3A00%3A00.000Z&to=2026-07-01T00%3A00%3A00.000Z"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(invalidRange.status).toBe(400);

    const writeAttempt = await request(app)
      .patch("/api/v1/kpis/users/user-designer-kabir")
      .set("Authorization", bearer(users.head))
      .send({ score: 100 });
    expect(writeAttempt.status).toBe(404);
  });

  it("computes complete KPI aggregates and bounded newest activity beyond the first task page", async () => {
    const seed = structuredClone(demoSeedData);
    const template = seed.tasks.find(
      (task) => task.id === "task-circulation"
    )!;
    seed.tasks = seed.tasks.filter(
      (task) => task.ownerId !== "user-designer-kabir"
    );
    seed.taskEvents = seed.taskEvents.filter(
      (event) => event.actorId !== "user-designer-kabir"
    );
    for (let index = 0; index < 20; index += 1) {
      seed.tasks.push({
        ...template,
        id: `task-aggregate-gray-${index}`,
        title: `Gray task ${index}`,
        order: index + 1,
        status: "not_started",
        progress: 0,
        plannedStartAt: "2026-07-20T09:00:00.000Z",
        originalDeadlineAt: "2026-07-30T17:00:00.000Z",
        currentDeadlineAt: "2026-07-30T17:00:00.000Z",
        plannedEffort: 2,
        completedAt: null
      });
    }
    seed.tasks.push(
      {
        ...template,
        id: "task-aggregate-later-red",
        title: "Later red task",
        order: 21,
        status: "in_progress",
        progress: 10,
        plannedStartAt: "2026-07-01T09:00:00.000Z",
        originalDeadlineAt: "2026-07-10T17:00:00.000Z",
        currentDeadlineAt: "2026-07-10T17:00:00.000Z",
        plannedEffort: 2,
        completedAt: null
      },
      {
        ...template,
        id: "task-aggregate-later-completed",
        title: "Later completed task",
        order: 22,
        status: "completed",
        progress: 100,
        plannedStartAt: "2026-07-01T09:00:00.000Z",
        originalDeadlineAt: "2026-07-20T17:00:00.000Z",
        currentDeadlineAt: "2026-07-20T17:00:00.000Z",
        plannedEffort: 2,
        completedAt: "2026-07-15T17:00:00.000Z"
      }
    );
    for (let day = 1; day <= 6; day += 1) {
      seed.taskEvents.push({
        id: `event-aggregate-${day}`,
        taskId: "task-aggregate-gray-0",
        actorId: "user-designer-kabir",
        type: "note_added",
        occurredAt: `2026-07-0${day}T09:00:00.000Z`,
        from: {},
        to: {},
        note: `Activity ${day}`,
        createdAt: `2026-07-0${day}T09:00:00.000Z`
      });
    }
    seed.taskEvents.push(
      {
        id: "event-aggregate-collaborator",
        taskId: "task-aggregate-gray-0",
        actorId: "user-designer-ananya",
        type: "note_added",
        occurredAt: "2026-07-07T09:00:00.000Z",
        from: {},
        to: {},
        note: "Collaborator activity",
        createdAt: "2026-07-07T09:00:00.000Z"
      },
      {
        id: "event-aggregate-manager",
        taskId: "task-aggregate-gray-0",
        actorId: "user-manager-aarav",
        type: "deadline_revised",
        occurredAt: "2026-07-08T09:00:00.000Z",
        from: { currentDeadlineAt: "2026-07-20T17:00:00.000Z" },
        to: { currentDeadlineAt: "2026-07-22T17:00:00.000Z" },
        note: "Manager deadline revision",
        createdAt: "2026-07-08T09:00:00.000Z"
      }
    );
    const app = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    const range =
      "from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z";

    const response = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir?${range}&limit=20&offset=0`)
      .set("Authorization", bearer(users.managerAarav));

    expect(response.status).toBe(200);
    expect(response.body.data.tasks.pagination).toMatchObject({
      total: 22,
      hasMore: true
    });
    expect(response.body.data.aggregates).toEqual({
      taskCounts: { total: 22, completed: 1, active: 21 },
      riskCounts: { gray: 20, green: 1, yellow: 0, red: 1 },
      effort: {
        planned: 44,
        completed: 2,
        remaining: 42,
        workloadPercentage: 95
      },
      projects: [
        {
          projectId: "project-aurora-villa",
          totalTasks: 22,
          completedTasks: 1,
          progress: 5,
          riskCounts: { gray: 20, green: 1, yellow: 0, red: 1 }
        }
      ],
      recentActivity: [
        expect.objectContaining({
          taskId: "task-aggregate-gray-0",
          taskTitle: "Gray task 0",
          event: expect.objectContaining({
            id: "event-aggregate-manager",
            actorId: "user-manager-aarav",
            type: "deadline_revised",
            occurredAt: "2026-07-08T09:00:00.000Z"
          })
        }),
        expect.objectContaining({
          event: expect.objectContaining({
            id: "event-aggregate-collaborator",
            actorId: "user-designer-ananya"
          })
        }),
        expect.objectContaining({
          event: expect.objectContaining({ id: "event-aggregate-6" })
        }),
        expect.objectContaining({
          event: expect.objectContaining({ id: "event-aggregate-5" })
        }),
        expect.objectContaining({
          event: expect.objectContaining({ id: "event-aggregate-4" })
        })
      ]
    });
  });

  it("serves an authorized lightweight KPI task feed without entering the full calculation path", async () => {
    const base = createMemoryRepository(structuredClone(demoSeedData));
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (
          property === "listKpiTasksForPeriod" ||
          property === "listKpiTaskEventsForPeriod"
        ) {
          return async () => {
            throw new Error("full KPI calculation path invoked");
          };
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const app = createApp({ repository, auth, clock });
    const range =
      "from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z";

    const response = await request(app)
      .get(
        `/api/v1/kpis/users/user-designer-kabir/tasks?${range}&limit=1&offset=1`
      )
      .set("Authorization", bearer(users.managerAarav));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      items: [
        {
          id: "task-circulation",
          projectId: "project-aurora-villa",
          risk: {
            level: expect.any(String),
            reason: expect.any(String)
          }
        }
      ],
      pagination: { limit: 1, offset: 1, total: 2, hasMore: false }
    });
    expect(response.body.data.items[0]).not.toHaveProperty("events");
    expect(response.body.data).not.toHaveProperty("components");
    expect(response.body.data).not.toHaveProperty("score");

    const crossTeam = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir/tasks?${range}`)
      .set("Authorization", bearer(users.managerMeera));
    expect(crossTeam.status).toBe(403);

    const unknown = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir/tasks?${range}&foo=bar`)
      .set("Authorization", bearer(users.managerAarav));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields).toEqual({ foo: expect.any(String) });
  });

  it("aggregates manager KPI from direct-report tasks and excludes manager deadline events from update discipline", async () => {
    const seed = structuredClone(demoSeedData);
    seed.taskEvents.push({
      id: "event-manager-deadline-only",
      taskId: "task-circulation",
      actorId: "user-manager-aarav",
      type: "deadline_revised",
      occurredAt: "2026-07-02T09:00:00.000Z",
      from: { currentDeadlineAt: "2026-07-20T17:00:00.000Z" },
      to: { currentDeadlineAt: "2026-07-21T17:00:00.000Z" },
      note: "Client schedule",
      createdAt: "2026-07-02T09:00:00.000Z"
    });
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });
    const query =
      "?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z";

    const managerKpi = await request(app)
      .get(`/api/v1/kpis/users/user-manager-aarav${query}`)
      .set("Authorization", bearer(users.head));
    expect(managerKpi.status).toBe(200);
    expect(
      managerKpi.body.data.tasks.items.map(
        (task: { id: string }) => task.id
      )
    ).toEqual(
      expect.arrayContaining([
        "task-furniture-layout",
        "task-circulation",
        "task-blocked-materials"
      ])
    );
    expect(
      managerKpi.body.data.tasks.items.map(
        (task: { id: string }) => task.id
      )
    ).not.toContain("task-overdue-measurement");

    const designerKpi = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir${query}`)
      .set("Authorization", bearer(users.managerAarav));
    const updateDiscipline = designerKpi.body.data.components.find(
      (component: { key: string }) => component.key === "updateDiscipline"
    );
    expect(designerKpi.status).toBe(200);
    expect(updateDiscipline.score).toBe(0);
  });

  it("paginates KPI task details, bounds per-task events, and rejects unknown query fields", async () => {
    const seed = structuredClone(demoSeedData);
    for (let index = 0; index < 25; index += 1) {
      seed.taskEvents.push({
        id: `event-circulation-page-${index}`,
        taskId: "task-circulation",
        actorId: "user-designer-kabir",
        type: "progress_changed",
        occurredAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
        from: { progress: index },
        to: { progress: index + 1 },
        note: null,
        createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`
      });
    }
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });
    const range =
      "from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z";

    const page = await request(app)
      .get(
        `/api/v1/kpis/users/user-designer-kabir?${range}&limit=1&offset=1`
      )
      .set("Authorization", bearer(users.managerAarav));

    expect(page.status).toBe(200);
    expect(page.body.data.tasks.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false
    });
    expect(page.body.data.tasks.items).toHaveLength(1);
    expect(page.body.data.tasks.items[0]).toMatchObject({
      id: "task-circulation",
      events: {
        items: expect.any(Array),
        href: "/api/v1/tasks/task-circulation/events",
        pagination: {
          limit: 20,
          offset: 0,
          total: 25,
          hasMore: true
        }
      }
    });
    expect(page.body.data.tasks.items[0].events.items).toHaveLength(20);
    expect(page.body.data.tasks.items[0].events.items[0]).toMatchObject({
      id: "event-circulation-page-24",
      occurredAt: "2026-07-25T09:00:00.000Z"
    });

    const eventPageOne = await request(app)
      .get("/api/v1/tasks/task-circulation/events?limit=20&offset=0")
      .set("Authorization", bearer(users.managerAarav));
    expect(eventPageOne.status).toBe(200);
    expect(eventPageOne.body.data.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 25,
      hasMore: true
    });
    expect(eventPageOne.body.data.items).toHaveLength(20);

    const eventPageTwo = await request(app)
      .get("/api/v1/tasks/task-circulation/events?limit=20&offset=20")
      .set("Authorization", bearer(users.managerAarav));
    expect(eventPageTwo.status).toBe(200);
    expect(eventPageTwo.body.data.pagination).toEqual({
      limit: 20,
      offset: 20,
      total: 25,
      hasMore: false
    });
    expect(eventPageTwo.body.data.items).toHaveLength(5);

    const newestFirst = await request(app)
      .get("/api/v1/tasks/task-circulation/events?sort=desc&limit=3&offset=0")
      .set("Authorization", bearer(users.managerAarav));
    expect(newestFirst.status).toBe(200);
    expect(newestFirst.body.data.pagination).toEqual({
      limit: 3,
      offset: 0,
      total: 25,
      hasMore: true
    });
    expect(
      newestFirst.body.data.items.map(
        (event: { occurredAt: string }) => event.occurredAt
      )
    ).toEqual([
      "2026-07-25T09:00:00.000Z",
      "2026-07-24T09:00:00.000Z",
      "2026-07-23T09:00:00.000Z"
    ]);

    const defaultOldestFirst = await request(app)
      .get("/api/v1/tasks/task-circulation/events?limit=2&offset=0")
      .set("Authorization", bearer(users.managerAarav));
    expect(
      defaultOldestFirst.body.data.items.map(
        (event: { occurredAt: string }) => event.occurredAt
      )
    ).toEqual([
      "2026-07-01T09:00:00.000Z",
      "2026-07-02T09:00:00.000Z"
    ]);

    const assignedDesigner = await request(app)
      .get("/api/v1/tasks/task-circulation/events?limit=1")
      .set("Authorization", bearer(users.ananya));
    expect(assignedDesigner.status).toBe(200);

    const eventUnknown = await request(app)
      .get("/api/v1/tasks/task-circulation/events?foo=bar")
      .set("Authorization", bearer(users.managerAarav));
    expect(eventUnknown.status).toBe(400);
    expect(eventUnknown.body.error.fields).toEqual({
      foo: expect.any(String)
    });

    const crossTeam = await request(app)
      .get("/api/v1/tasks/task-circulation/events")
      .set("Authorization", bearer(users.managerMeera));
    expect(crossTeam.status).toBe(404);

    const crossTeamDesigner = await request(app)
      .get("/api/v1/tasks/task-circulation/events")
      .set("Authorization", bearer(users.ishita));
    expect(crossTeamDesigner.status).toBe(404);

    const client = await request(app)
      .get("/api/v1/tasks/task-circulation/events")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(403);

    const unknown = await request(app)
      .get(`/api/v1/kpis/users/user-designer-kabir?${range}&foo=bar`)
      .set("Authorization", bearer(users.managerAarav));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { foo: expect.any(String) }
    });
  });
});

describe("evaluation and audit workflows", () => {
  it("keeps evaluations separate and revisioned with manager-own-team enforcement", async () => {
    const { app } = setup();
    const forbidden = await request(app)
      .post("/api/v1/evaluations")
      .set("Authorization", bearer(users.managerMeera))
      .send({
        subjectUserId: "user-designer-kabir",
        periodStartAt: "2026-07-01T00:00:00.000Z",
        periodEndAt: "2026-07-31T23:59:59.999Z",
        score: 81,
        comments: "Strong recovery"
      });
    expect(forbidden.status).toBe(403);

    const original = await request(app)
      .post("/api/v1/evaluations")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        subjectUserId: "user-designer-kabir",
        periodStartAt: "2026-07-01T00:00:00.000Z",
        periodEndAt: "2026-07-31T23:59:59.999Z",
        score: 81,
        comments: "Strong recovery"
      });
    expect(original.status).toBe(201);
    expect(original.body.data).toMatchObject({
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      revisionOf: null
    });

    const correction = await request(app)
      .post("/api/v1/evaluations")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        subjectUserId: "user-designer-kabir",
        periodStartAt: "2026-07-01T00:00:00.000Z",
        periodEndAt: "2026-07-31T23:59:59.999Z",
        score: 84,
        comments: "Corrected after review",
        revisionOf: original.body.data.id
      });
    expect(correction.status).toBe(201);
    expect(correction.body.data.revisionOf).toBe(original.body.data.id);

    const evaluations = await request(app)
      .get("/api/v1/evaluations/user-designer-kabir")
      .set("Authorization", bearer(users.kabir));
    expect(evaluations.status).toBe(200);
    expect(evaluations.body.data).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
        expect.objectContaining({ id: original.body.data.id, revisionOf: null }),
        expect.objectContaining({
          id: correction.body.data.id,
          revisionOf: original.body.data.id
        })
        ]),
        pagination: expect.objectContaining({ total: 3 })
      })
    );
  });

  it("paginates evaluation history and rejects limit overflow", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/api/v1/evaluations/user-designer-kabir?limit=1&offset=0")
      .set("Authorization", bearer(users.kabir));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [expect.objectContaining({ id: "evaluation-kabir-june" })],
      pagination: {
        limit: 1,
        offset: 0,
        total: 1,
        hasMore: false
      }
    });

    const invalid = await request(app)
      .get("/api/v1/evaluations/user-designer-kabir?limit=101")
      .set("Authorization", bearer(users.kabir));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields.limit).toEqual(expect.any(String));
  });

  it("lets the head evaluate managers and inspect complete audit history", async () => {
    const { app } = setup();
    const evaluation = await request(app)
      .post("/api/v1/evaluations")
      .set("Authorization", bearer(users.head))
      .send({
        subjectUserId: "user-manager-aarav",
        periodStartAt: "2026-07-01T00:00:00.000Z",
        periodEndAt: "2026-07-31T23:59:59.999Z",
        score: 88,
        comments: "Team delivery remains predictable"
      });
    expect(evaluation.status).toBe(201);
    expect(evaluation.body.data.evaluatorRole).toBe("design_head");

    const audit = await request(app)
      .get("/api/v1/audit?entityType=evaluation")
      .set("Authorization", bearer(users.head));
    expect(audit.status).toBe(200);
    expect(audit.body.data).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
        expect.objectContaining({
          actorId: "user-head",
          action: "evaluation_created",
          entityType: "evaluation",
          entityId: evaluation.body.data.id
        })
        ]),
        pagination: expect.objectContaining({ total: 1 })
      })
    );

    const otherManager = await request(app)
      .get("/api/v1/audit?entityId=task-furniture-layout")
      .set("Authorization", bearer(users.managerMeera));
    expect(otherManager.status).toBe(200);
    expect(otherManager.body.data.items).toEqual([]);

    const client = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(403);
  });

  it("paginates audit history and maps unknown strict query fields", async () => {
    const { app } = setup();
    const page = await request(app)
      .get("/api/v1/audit?limit=1&offset=0")
      .set("Authorization", bearer(users.head));
    expect(page.status).toBe(200);
    expect(page.body.data).toEqual({
      items: [expect.objectContaining({ id: "audit-furniture-progress" })],
      pagination: {
        limit: 1,
        offset: 0,
        total: 1,
        hasMore: false
      }
    });

    const unknown = await request(app)
      .get("/api/v1/audit?foo=bar")
      .set("Authorization", bearer(users.head));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { foo: expect.any(String) }
    });
  });

  it("returns the newest scoped designer task activity when the audit history exceeds one page", async () => {
    const { app, repository } = setup();
    await Promise.all(Array.from({ length: 101 }, (_, index) => repository.appendAuditEvent({
      id: `audit-designer-history-${index}`,
      actorId: "user-manager-aarav",
      action: "task_deadline_revised",
      entityType: "task",
      entityId: "task-furniture-layout",
      occurredAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
      oldValues: {},
      newValues: {},
      reason: `Revision ${index}`
    })));

    const response = await request(app)
      .get("/api/v1/designers/user-designer-ananya/audit?limit=100&offset=0&sort=desc")
      .set("Authorization", bearer(users.managerAarav));

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({ total: 102, hasMore: true });
    expect(response.body.data.items).toHaveLength(100);
    expect(response.body.data.items[0]).toMatchObject({ id: "audit-designer-history-100" });
  });

  it("paginates complete project activity newest first without cross-project leakage", async () => {
    const { app, repository } = setup();
    const events = [
      ["activity-project", "project_created", "project", "project-aurora-villa"],
      ["activity-status", "task_status_changed", "task", "task-circulation"],
      ["activity-progress", "task_progress_changed", "task", "task-circulation"],
      ["activity-deadline", "task_deadline_revised", "task", "task-circulation"],
      ["activity-upload", "design_version_uploaded", "design_version", "version-aurora-plan-1"],
      ["activity-approval", "design_version_approval_changed", "design_version", "version-aurora-plan-1"],
      ["activity-unrelated", "task_progress_changed", "task", "task-overdue-measurement"]
    ] as const;
    await Promise.all(
      events.map(([id, action, entityType, entityId], index) =>
        repository.appendAuditEvent({
          id,
          actorId: "user-manager-aarav",
          action,
          entityType,
          entityId,
          occurredAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
          oldValues: {},
          newValues: {},
          reason: null
        })
      )
    );

    const first = await request(app)
      .get(
        "/api/v1/projects/project-aurora-villa/activity?limit=3&offset=0"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(first.status).toBe(200);
    expect(
      first.body.data.items.map((event: { id: string }) => event.id)
    ).toEqual(["activity-approval", "activity-upload", "activity-deadline"]);
    expect(first.body.data.pagination).toEqual({
      limit: 3,
      offset: 0,
      total: 7,
      hasMore: true
    });

    const second = await request(app)
      .get(
        "/api/v1/projects/project-aurora-villa/activity?limit=3&offset=3"
      )
      .set("Authorization", bearer(users.managerAarav));
    expect(
      second.body.data.items.map((event: { id: string }) => event.id)
    ).toEqual(["activity-progress", "activity-status", "activity-project"]);
    expect(JSON.stringify(second.body)).not.toContain("activity-unrelated");

    const crossTeam = await request(app)
      .get("/api/v1/projects/project-aurora-villa/activity")
      .set("Authorization", bearer(users.managerMeera));
    expect(crossTeam.status).toBe(404);

    const client = await request(app)
      .get("/api/v1/projects/project-aurora-villa/activity")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(403);
  });

  it("rolls an evaluation back when its audit append fails", async () => {
    const base = createMemoryRepository(structuredClone(demoSeedData));
    const failingRepository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(
          operation: (transaction: AppRepository) => Promise<T>
        ) =>
          target.runInTransaction((transaction) =>
            operation(
              new Proxy(transaction, {
                get(transactionTarget, transactionProperty, transactionReceiver) {
                  if (transactionProperty === "appendAuditEvent") {
                    return async () => {
                      throw new Error("simulated evaluation audit failure");
                    };
                  }
                  return Reflect.get(
                    transactionTarget,
                    transactionProperty,
                    transactionReceiver
                  );
                }
              })
            )
          );
      }
    });
    const app = createApp({ repository: failingRepository, auth, clock });

    const response = await request(app)
      .post("/api/v1/evaluations")
      .set("Authorization", bearer(users.managerAarav))
      .send({
        subjectUserId: "user-designer-kabir",
        periodStartAt: "2026-07-01T00:00:00.000Z",
        periodEndAt: "2026-07-31T23:59:59.999Z",
        score: 81,
        comments: "Must remain atomic"
      });

    expect(response.status).toBe(500);
    await expect(
      base.listEvaluationsForSubject("user-designer-kabir")
    ).resolves.toHaveLength(1);
    await expect(
      base.listAuditEvents({ entityType: "evaluation" })
    ).resolves.toEqual([]);
  });
});
