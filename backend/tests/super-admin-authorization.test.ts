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

type RepositoryCallCounters = Map<string, number>;

function setupWithRepositoryCounters(seed = taskSixSeed()): {
  app: Express;
  repository: AppRepository;
  calls: RepositoryCallCounters;
} {
  const base = createMemoryRepository(seed);
  const calls: RepositoryCallCounters = new Map();
  const repository = new Proxy(base, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const key = String(property);
        calls.set(key, (calls.get(key) ?? 0) + 1);
        return Reflect.apply(value, target, args);
      };
    }
  });
  return {
    repository,
    calls,
    app: createApp({ repository, auth, clock })
  };
}

function snapshotRepositoryCalls(calls: RepositoryCallCounters): Map<string, number> {
  return new Map(calls);
}

function repositoryCallDelta(
  calls: RepositoryCallCounters,
  before: Map<string, number>
): Record<string, number> {
  const keys = new Set([...before.keys(), ...calls.keys()]);
  return Object.fromEntries(
    [...keys]
      .sort()
      .flatMap((key) => {
        const delta = (calls.get(key) ?? 0) - (before.get(key) ?? 0);
        return delta === 0 ? [] : [[key, delta]];
      })
  );
}

function expectDeniedBeforeServiceRepositoryEntry(
  calls: RepositoryCallCounters,
  before: Map<string, number>
): void {
  expect(repositoryCallDelta(calls, before)).toEqual({ findUserById: 1 });
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
    const { app, calls } = setupWithRepositoryCounters();

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
    expect(calls.get("findActiveProjectAccessGrant") ?? 0).toBe(0);
  });

  it.each([
    ["POST", "/api/v1/projects", projectInput],
    ["POST", "/api/v1/projects/project-aurora-villa/floors", floorInput],
    ["POST", "/api/v1/floors/floor-aurora-ground/stages", stageInput],
    ["POST", "/api/v1/stages/stage-ground-plan/tasks", taskInput],
    ["PATCH", "/api/v1/tasks/task-circulation", { version: 1, progress: 10 }]
  ] as const)("denies Super Admin personal operation %s %s", async (method, path, body) => {
    const { app, calls } = setupWithRepositoryCounters();
    const before = snapshotRepositoryCalls(calls);

    await authenticatedRequest(app, method, path, actors.superAdmin, body).expect(403);
    expectDeniedBeforeServiceRepositoryEntry(calls, before);
  });

  it.each([
    [actors.procurement],
    [actors.finance],
    [actors.siteManager],
    [actors.worker]
  ])("denies future role %s before core project or task service entry", async (actor) => {
    const { app, repository, calls } = setupWithRepositoryCounters();
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
      const before = snapshotRepositoryCalls(calls);
      await authenticatedRequest(app, method, path, actor, body).expect(403);
      expectDeniedBeforeServiceRepositoryEntry(calls, before);
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
    const { app, repository, calls } = setupWithRepositoryCounters();
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
      const before = snapshotRepositoryCalls(calls);
      await authenticatedRequest(app, method, path, actor, body).expect(403);
      expectDeniedBeforeServiceRepositoryEntry(calls, before);
    }
    expect(await repository.listEvaluationsForSubject("user-designer-arun")).toEqual(before);
  });
});

function sensitiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(sensitiveKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
    ...(/password|hash|token|secret/i.test(key) ? [key] : []),
    ...sensitiveKeys(nested)
  ]);
}

describe("Audit operations", () => {
  it("gives Super Admin global audit reads with recursive secret-key redaction", async () => {
    const { app, repository, calls } = setupWithRepositoryCounters();
    await repository.appendAuditEvent({
      id: "audit-super-admin-sensitive",
      actorId: "user-manager-meera",
      action: "task_progress_changed",
      entityType: "task",
      entityId: "task-furniture-layout",
      occurredAt: "2026-08-01T00:00:00.000Z",
      oldValues: {
        password: "omit",
        nested: { apiToken: "omit", safe: "keep" },
        entries: [{ secretKey: "omit", note: "keep" }]
      },
      newValues: { passwordHash: "omit", progress: 75 },
      reason: null
    });

    const activity = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/projects/project-aurora-villa/activity?limit=20&offset=0",
      actors.superAdmin
    );
    const designer = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/designers/user-designer-ananya/audit?limit=20&offset=0&sort=desc",
      actors.superAdmin
    );
    const audit = await authenticatedRequest(
      app,
      "GET",
      "/api/v1/audit?limit=20&offset=0&sort=desc",
      actors.superAdmin
    );

    for (const response of [activity, designer, audit]) {
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "audit-super-admin-sensitive" })
        ])
      );
      expect(sensitiveKeys(response.body)).toEqual([]);
    }
    expect(audit.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorId: "user-manager-meera" })
      ])
    );
    expect(audit.body.data.items.find(
      (event: { id: string }) => event.id === "audit-super-admin-sensitive"
    )).toMatchObject({
      oldValues: { nested: { safe: "keep" }, entries: [{ note: "keep" }] },
      newValues: { progress: 75 }
    });
    expect(calls.get("findActiveProjectAccessGrant") ?? 0).toBe(0);
  });

  it.each([
    [actors.procurement],
    [actors.finance],
    [actors.siteManager],
    [actors.worker]
  ])("denies future role %s before audit service entry", async (actor) => {
    const { app, repository, calls } = setupWithRepositoryCounters();
    const before = await repository.listAuditEvents({});

    for (const path of [
      "/api/v1/projects/project-aurora-villa/activity?limit=20&offset=0",
      "/api/v1/designers/user-designer-ananya/audit?limit=20&offset=0",
      "/api/v1/audit?limit=20&offset=0"
    ]) {
      const before = snapshotRepositoryCalls(calls);
      await authenticatedRequest(app, "GET", path, actor).expect(403);
      expectDeniedBeforeServiceRepositoryEntry(calls, before);
    }
    expect(await repository.listAuditEvents({})).toEqual(before);
  });
});
