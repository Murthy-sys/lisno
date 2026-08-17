import type { Express } from "express";
import jwt from "jsonwebtoken";
import request, { type Test } from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  AppRepository,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "super-admin-test-secret-with-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-07-16T12:00:00.000Z");

const actors = {
  superAdmin: ["user-super-admin", "super_admin"],
  procurement: ["user-procurement", "procurement"],
  finance: ["user-finance", "finance_head"],
  siteManager: ["user-site-manager", "site_manager"],
  worker: ["user-worker-electrician", "worker_electrician"]
} as const satisfies Record<string, readonly [string, Role]>;

function bearer([id, role]: readonly [string, Role]) {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

function user(id: string, role: Role, overrides: Partial<UserRecord> = {}): UserRecord {
  const template = structuredClone(demoSeedData.users[0]!);
  return {
    ...template,
    id,
    name: id,
    email: `${id}@authorization.lisno.example`,
    emailNormalized: `${id}@authorization.lisno.example`,
    role,
    active: true,
    managerId: null,
    authorizedClientIds: [],
    ...overrides
  };
}

function taskSixSeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.users.push(
    user(...actors.superAdmin),
    user(...actors.procurement),
    user(...actors.finance),
    user(...actors.siteManager),
    user(...actors.worker),
    user("user-manager-maya", "design_manager", {
      name: "Maya Bose"
    }),
    user("user-manager-inactive", "design_manager", {
      name: "Inactive Manager",
      active: false
    }),
    user("user-designer-arun", "designer", {
      name: "Arun Das",
      managerId: "user-manager-maya"
    })
  );
  return seed;
}

function setup(seed = taskSixSeed()): {
  app: Express;
  repository: AppRepository;
} {
  const repository = createMemoryRepository(seed);
  return {
    repository,
    app: createApp({ repository, auth, clock })
  };
}

function authenticatedRequest(
  app: Express,
  method: "GET" | "POST" | "PATCH",
  path: string,
  actor: readonly [string, Role],
  body?: unknown
): Test {
  const pending = method === "GET"
    ? request(app).get(path)
    : method === "POST"
      ? request(app).post(path)
      : request(app).patch(path);
  pending.set("Authorization", bearer(actor));
  return body === undefined ? pending : pending.send(body);
}

const projectInput = {
  name: "Authorization Residence",
  clientName: "Authorization Client",
  clientEmail: "authorization-client@example.test",
  clientMobile: "+91 90000 00000",
  clientAddress: "Authorization Lane",
  assignedDesignerIds: ["user-designer-ananya"],
  managerId: "user-manager-aarav",
  location: "Bengaluru",
  plannedStartAt: "2026-08-01T09:00:00.000Z",
  plannedEndAt: "2026-10-31T17:00:00.000Z"
};

const floorInput = {
  name: "Authorization Floor",
  number: "A",
  order: 10,
  plannedStartAt: "2026-08-01T09:00:00.000Z",
  plannedEndAt: "2026-08-31T17:00:00.000Z"
};

const stageInput = {
  name: "Authorization Stage",
  type: "floor_plan",
  order: 10
};

const taskInput = {
  title: "Authorization Task",
  order: 10,
  ownerId: "user-designer-ananya",
  plannedStartAt: "2026-08-01T09:00:00.000Z",
  originalDeadlineAt: "2026-08-31T17:00:00.000Z"
};

describe("Projects and Tasks operations", () => {
  it("gives Super Admin global project and task-event reads with endpoint redaction", async () => {
    const { app } = setup();

    const projects = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/projects?limit=20&offset=0",
      actors.superAdmin
    );
    const detail = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/projects/project-celeste-office",
      actors.superAdmin
    );
    const summaries = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/client/project-summaries?limit=20&offset=0",
      actors.superAdmin
    );
    const events = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/tasks/task-overdue-measurement/events?limit=20&offset=0",
      actors.superAdmin
    );

    expect(projects.status).toBe(200);
    expect(projects.body.data.items.map((item: { id: string }) => item.id)).toEqual([
      "project-aurora-studio",
      "project-aurora-villa",
      "project-celeste-office"
    ]);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: "project-celeste-office" });
    expect(summaries.status).toBe(200);
    expect(summaries.body.data.items).toHaveLength(3);
    expect(JSON.stringify(summaries.body)).not.toContain("assignedDesignerIds");
    expect(JSON.stringify(summaries.body)).not.toContain("managerId");
    expect(events.status).toBe(200);
  });

  it.each([
    ["POST", "/api/v1/projects", projectInput],
    ["POST", "/api/v1/projects/project-aurora-villa/floors", floorInput],
    ["POST", "/api/v1/floors/floor-aurora-ground/stages", stageInput],
    ["POST", "/api/v1/stages/stage-ground-plan/tasks", taskInput],
    ["PATCH", "/api/v1/tasks/task-circulation", { version: 1, progress: 10 }]
  ] as const)("denies Super Admin personal operation %s %s", async (method, path, body) => {
    const { app } = setup();

    await authenticatedRequest(app, method, path, actors.superAdmin, body).expect(403);
  });

  it.each([
    [actors.procurement],
    [actors.finance],
    [actors.siteManager],
    [actors.worker]
  ])("denies future role %s before core project or task service entry", async (actor) => {
    const { app, repository } = setup();
    const initialProjects = await repository.listProjectsForUserInModule(
      (await repository.findUserById(actor[0]))!,
      "projects"
    );
    const initialEvents = await repository.listTaskEvents("task-circulation");
    const operations = [
      ["GET", "/api/v1/projects?limit=20&offset=0"],
      ["GET", "/api/v1/client/project-summaries?limit=20&offset=0"],
      ["POST", "/api/v1/projects", projectInput],
      ["GET", "/api/v1/projects/project-aurora-villa"],
      ["POST", "/api/v1/projects/project-aurora-villa/floors", floorInput],
      ["POST", "/api/v1/floors/floor-aurora-ground/stages", stageInput],
      ["POST", "/api/v1/stages/stage-ground-plan/tasks", taskInput],
      ["GET", "/api/v1/tasks/task-circulation/events?limit=20&offset=0"],
      ["PATCH", "/api/v1/tasks/task-circulation", { version: 1, progress: 10 }],
      ["PATCH", "/api/v1/tasks/task-circulation/deadline", {
        version: 1,
        currentDeadlineAt: "2026-09-01T00:00:00.000Z",
        reason: "Coverage"
      }]
    ] as const;

    for (const [method, path, body] of operations) {
      await authenticatedRequest(app, method, path, actor, body).expect(403);
    }
    expect(await repository.listProjectsForUserInModule(
      (await repository.findUserById(actor[0]))!,
      "projects"
    )).toEqual(initialProjects);
    expect(await repository.listTaskEvents("task-circulation")).toEqual(initialEvents);
  });
});

const kpiQuery = "from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z&limit=20&offset=0";

const evaluationInput = {
  subjectUserId: "user-designer-arun",
  periodStartAt: "2026-07-01T00:00:00.000Z",
  periodEndAt: "2026-07-31T23:59:59.999Z",
  score: 90,
  comments: "Quarterly review"
};

describe("Organization KPI and Evaluation operations", () => {
  it("gives Super Admin the exact global organization and KPI reads", async () => {
    const { app } = setup();

    const managers = await authenticatedRequest(app, "GET", "/api/v1/organization/managers?limit=20&offset=0", actors.superAdmin);
    const team = await authenticatedRequest(app, "GET", "/api/v1/organization/team?limit=20&offset=0", actors.superAdmin);
    const tree = await authenticatedRequest(app, "GET", "/api/v1/organization/tree?limit=20&offset=0", actors.superAdmin);
    const managerDesigners = await authenticatedRequest(app, "GET", "/api/v1/organization/managers/user-manager-maya/designers?limit=20&offset=0", actors.superAdmin);
    const summary = await authenticatedRequest(app, "GET", "/api/v1/designers/user-designer-arun/summary", actors.superAdmin);
    const tasks = await authenticatedRequest(app, "GET", `/api/v1/kpis/users/user-designer-arun/tasks?${kpiQuery}`, actors.superAdmin);
    const kpi = await authenticatedRequest(app, "GET", `/api/v1/kpis/users/user-designer-arun?${kpiQuery}`, actors.superAdmin);

    expect(managers.status).toBe(200);
    expect(managers.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "user-manager-maya" })])
    );
    expect(managers.body.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "user-manager-inactive" })])
    );
    expect(team.status).toBe(200);
    expect(team.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user: expect.objectContaining({ id: "user-designer-arun" }) })
      ])
    );
    expect(tree.status).toBe(200);
    expect(tree.body.data).toMatchObject({
      items: expect.any(Array),
      pagination: expect.objectContaining({ limit: 20, offset: 0 })
    });
    expect(managerDesigners.status).toBe(200);
    expect(managerDesigners.body.data.items).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ id: "user-designer-arun" }) })
    ]);
    expect(summary.status).toBe(200);
    expect(summary.body.data.user.id).toBe("user-designer-arun");
    expect(tasks.status).toBe(200);
    expect(tasks.body.data).toMatchObject({
      items: expect.any(Array),
      pagination: expect.objectContaining({ limit: 20, offset: 0 })
    });
    expect(kpi.status).toBe(200);
    expect(kpi.body.data.userId).toBe("user-designer-arun");
  });

  it("records Super Admin as the real evaluator and reads evaluations globally", async () => {
    const { app, repository } = setup();

    const created = await authenticatedRequest(app, "POST", "/api/v1/evaluations", actors.superAdmin, evaluationInput);
    const listed = await authenticatedRequest(app, "GET", "/api/v1/evaluations/user-designer-arun?limit=20&offset=0", actors.superAdmin);

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      subjectUserId: "user-designer-arun",
      evaluatorUserId: "user-super-admin",
      evaluatorRole: "super_admin"
    });
    expect(await repository.listEvaluationsForSubject("user-designer-arun")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evaluatorUserId: "user-super-admin",
          evaluatorRole: "super_admin"
        })
      ])
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evaluatorUserId: "user-super-admin" })
      ])
    );
  });

  it.each([
    [actors.procurement],
    [actors.finance],
    [actors.siteManager],
    [actors.worker]
  ])("denies future role %s before organization service entry", async (actor) => {
    const { app, repository } = setup();
    const before = await repository.listEvaluationsForSubject("user-designer-arun");
    const operations = [
      ["GET", "/api/v1/organization/managers?limit=20&offset=0"],
      ["GET", "/api/v1/organization/team?limit=20&offset=0"],
      ["GET", "/api/v1/organization/tree?limit=20&offset=0"],
      ["GET", "/api/v1/organization/managers/user-manager-maya/designers?limit=20&offset=0"],
      ["GET", "/api/v1/designers/user-designer-arun/summary"],
      ["GET", `/api/v1/kpis/users/user-designer-arun/tasks?${kpiQuery}`],
      ["GET", `/api/v1/kpis/users/user-designer-arun?${kpiQuery}`],
      ["POST", "/api/v1/evaluations", evaluationInput],
      ["GET", "/api/v1/evaluations/user-designer-arun?limit=20&offset=0"]
    ] as const;

    for (const [method, path, body] of operations) {
      await authenticatedRequest(app, method, path, actor, body).expect(403);
    }
    expect(await repository.listEvaluationsForSubject("user-designer-arun")).toEqual(before);
  });
});
