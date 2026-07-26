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

describe("project workflows", () => {
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
    expect(listed.body.data.map((project: { id: string }) => project.id)).toContain(
      created.body.data.id
    );
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
    expect(listed.body.data.map((project: { id: string }) => project.id)).toEqual([
      "project-aurora-studio",
      "project-aurora-villa"
    ]);
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
    expect(tree.body.data).toHaveLength(2);
    expect(tree.body.data[0]).toMatchObject({
      id: "user-manager-aarav",
      summary: {
        teamKpi: { score: expect.any(Number) },
        workload: expect.any(Number),
        redCount: expect.any(Number),
        yellowCount: expect.any(Number),
        evaluationCoverage: 50
      },
      designers: [
        {
          id: "user-designer-ananya",
          summary: { kpi: { score: expect.any(Number) } }
        },
        { id: "user-designer-kabir", summary: expect.any(Object) }
      ]
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
      tasks: expect.arrayContaining([
        expect.objectContaining({
          id: "task-circulation",
          risk: expect.objectContaining({
            level: expect.any(String),
            reason: expect.any(String)
          })
        })
      ])
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
    expect(managerKpi.body.data.tasks.map((task: { id: string }) => task.id)).toEqual(
      expect.arrayContaining([
        "task-furniture-layout",
        "task-circulation",
        "task-blocked-materials"
      ])
    );
    expect(
      managerKpi.body.data.tasks.map((task: { id: string }) => task.id)
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
      expect.arrayContaining([
        expect.objectContaining({ id: original.body.data.id, revisionOf: null }),
        expect.objectContaining({
          id: correction.body.data.id,
          revisionOf: original.body.data.id
        })
      ])
    );
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
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "user-head",
          action: "evaluation_created",
          entityType: "evaluation",
          entityId: evaluation.body.data.id
        })
      ])
    );

    const otherManager = await request(app)
      .get("/api/v1/audit?entityId=task-furniture-layout")
      .set("Authorization", bearer(users.managerMeera));
    expect(otherManager.status).toBe(200);
    expect(otherManager.body.data).toEqual([]);

    const client = await request(app)
      .get("/api/v1/audit")
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
