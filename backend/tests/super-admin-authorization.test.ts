import type { Server } from "node:http";

import express, { type Express, type RequestHandler, type Router } from "express";
import jwt from "jsonwebtoken";
import request, { type Test } from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import { isHumanOperationHandler } from "../src/domain/route-operations.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  AppRepository,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { createAuditRouter } from "../src/routes/audit.js";
import { createEvaluationsRouter } from "../src/routes/evaluations.js";
import { createKpisRouter } from "../src/routes/kpis.js";
import { createOrganizationRouter } from "../src/routes/organization.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createTasksRouter } from "../src/routes/tasks.js";
import { demoSeedData } from "../src/seed/data.js";
import type { AuditService } from "../src/services/audit.service.js";
import {
  authorizationSnapshotFor,
  InvalidTokenError,
  type AuthService,
  type PublicUser
} from "../src/services/auth.service.js";
import type { EvaluationService } from "../src/services/evaluation.service.js";
import type { HierarchyService } from "../src/services/hierarchy.service.js";
import type { KpiService } from "../src/services/kpi.service.js";
import type { ProjectActivityService } from "../src/services/project-activity.service.js";
import type { ProjectService } from "../src/services/project.service.js";
import type { TaskService } from "../src/services/task.service.js";

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

const listeningServers = new Map<Express, Server>();

function listeningServerFor(app: Express): Server {
  const existing = listeningServers.get(app);
  if (existing) return existing;
  const server = app.listen(0, "127.0.0.1");
  listeningServers.set(app, server);
  return server;
}

afterEach(async () => {
  const servers = [...listeningServers.values()];
  listeningServers.clear();
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  })));
});

function authenticatedRequest(
  app: Express,
  method: "GET" | "POST" | "PATCH",
  path: string,
  actor: readonly [string, Role],
  body?: unknown
): Test {
  const server = listeningServerFor(app);
  const pending = method === "GET"
    ? request(server).get(path)
    : method === "POST"
      ? request(server).post(path)
      : request(server).patch(path);
  pending.set("Authorization", bearer(actor));
  return body === undefined ? pending : pending.send(body);
}

type ServiceEntryCounters = Map<string, number>;

function recordServiceEntry<T>(
  calls: ServiceEntryCounters,
  key: string,
  result: T
): Promise<T> {
  calls.set(key, (calls.get(key) ?? 0) + 1);
  return Promise.resolve(result);
}

function emptyPage() {
  return { items: [], total: 0 };
}

function createRouterServiceDoubles(calls: ServiceEntryCounters): {
  project: ProjectService;
  task: TaskService;
  hierarchy: HierarchyService;
  kpi: KpiService;
  evaluation: EvaluationService;
  audit: AuditService;
  projectActivity: ProjectActivityService;
} {
  const project = {
    list: () => recordServiceEntry(calls, "project.list", emptyPage()),
    clientSummaries: () => recordServiceEntry(calls, "project.clientSummaries", emptyPage()),
    create: () => recordServiceEntry(calls, "project.create", {} as never),
    get: () => recordServiceEntry(calls, "project.get", {} as never),
    createFloor: () => recordServiceEntry(calls, "project.createFloor", {} as never),
    createStage: () => recordServiceEntry(calls, "project.createStage", {} as never),
    createTask: () => recordServiceEntry(calls, "project.createTask", {} as never)
  } satisfies ProjectService;
  const task = {
    listEvents: () => recordServiceEntry(calls, "task.listEvents", emptyPage()),
    update: () => recordServiceEntry(calls, "task.update", {} as never),
    reviseDeadline: () => recordServiceEntry(calls, "task.reviseDeadline", {} as never)
  } satisfies TaskService;
  const hierarchy = {
    managers: () => recordServiceEntry(calls, "hierarchy.managers", emptyPage()),
    tree: () => recordServiceEntry(calls, "hierarchy.tree", emptyPage()),
    team: () => recordServiceEntry(calls, "hierarchy.team", emptyPage()),
    managerDesigners: () => recordServiceEntry(calls, "hierarchy.managerDesigners", emptyPage()),
    designerSummary: () => recordServiceEntry(calls, "hierarchy.designerSummary", {} as never)
  } satisfies HierarchyService;
  const kpi = {
    listTasks: () => recordServiceEntry(calls, "kpi.listTasks", emptyPage()),
    get: () => recordServiceEntry(calls, "kpi.get", {
      userId: "router-subject",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: 0,
      components: [],
      aggregates: {
        taskCounts: { total: 0, completed: 0, active: 0 },
        riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 },
        effort: {
          planned: 0,
          completed: 0,
          remaining: 0,
          workloadPercentage: 0
        },
        projects: [],
        recentActivity: []
      },
      tasks: emptyPage()
    })
  } satisfies KpiService;
  const evaluation = {
    create: () => recordServiceEntry(calls, "evaluation.create", {} as never),
    list: () => recordServiceEntry(calls, "evaluation.list", emptyPage())
  } satisfies EvaluationService;
  const audit = {
    append: () => recordServiceEntry(calls, "audit.append", {} as never),
    appendInMongoTransaction: () => recordServiceEntry(
      calls,
      "audit.appendInMongoTransaction",
      {} as never
    ),
    list: () => recordServiceEntry(calls, "audit.list", emptyPage()),
    listForDesigner: () => recordServiceEntry(calls, "audit.listForDesigner", emptyPage())
  } satisfies AuditService;
  const projectActivity = {
    list: () => recordServiceEntry(calls, "projectActivity.list", emptyPage())
  } satisfies ProjectActivityService;
  return { project, task, hierarchy, kpi, evaluation, audit, projectActivity };
}

function publicActor([id, role]: readonly [string, Role]): PublicUser {
  return {
    id,
    role,
    name: id,
    email: `${id}@router-authorization.test`
  };
}

const routerActors = new Map(
  Object.values(actors).map((actor) => [actor[0], publicActor(actor)])
);

const deterministicRouterAuth = {
  async login() {
    throw new Error("Router authorization tests do not call login.");
  },
  async signupClient() {
    throw new Error("Router authorization tests do not call signup.");
  },
  async authenticate(token) {
    const actor = routerActors.get(token);
    if (!actor) throw new InvalidTokenError();
    return actor;
  },
  authorization: authorizationSnapshotFor
} satisfies AuthService;

type MutableRouteLayer = {
  route?: { stack: Array<{ handle: RequestHandler }> };
};

function removeOperationAuthorization(router: Router): Router {
  const layers = (router as unknown as { stack: MutableRouteLayer[] }).stack;
  for (const layer of layers) {
    if (!layer.route) continue;
    layer.route.stack = layer.route.stack.filter(
      ({ handle }) => !isHumanOperationHandler(handle)
    );
  }
  return router;
}

function createRouterServiceEntryHarness(
  withoutOperationAuthorization = false
): { app: Express; calls: ServiceEntryCounters } {
  const calls: ServiceEntryCounters = new Map();
  const services = createRouterServiceDoubles(calls);
  const routers = [
    createProjectsRouter(deterministicRouterAuth, services.project),
    createTasksRouter(deterministicRouterAuth, services.task),
    createOrganizationRouter(deterministicRouterAuth, services.hierarchy),
    createKpisRouter(deterministicRouterAuth, services.kpi),
    createEvaluationsRouter(deterministicRouterAuth, services.evaluation),
    createAuditRouter(
      deterministicRouterAuth,
      services.audit,
      services.projectActivity
    )
  ];
  const app = express();
  app.use(express.json());
  for (const router of routers) {
    app.use(
      "/api/v1",
      withoutOperationAuthorization ? removeOperationAuthorization(router) : router
    );
  }
  app.use(errorHandler);
  return { app, calls };
}

function routerAuthenticatedRequest(
  app: Express,
  method: "GET" | "POST" | "PATCH",
  path: string,
  actor: readonly [string, Role],
  body?: unknown
): Test {
  const server = listeningServerFor(app);
  const pending = method === "GET"
    ? request(server).get(path)
    : method === "POST"
      ? request(server).post(path)
      : request(server).patch(path);
  pending.set("Authorization", `Bearer ${actor[0]}`);
  return body === undefined ? pending : pending.send(body);
}

function snapshotServiceEntries(calls: ServiceEntryCounters): Map<string, number> {
  return new Map(calls);
}

function serviceEntryDelta(
  calls: ServiceEntryCounters,
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

type RouterServiceEntryCase = {
  label: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  serviceMethod: string;
  successStatus: 200 | 201;
  body?: unknown;
  superAdminPersonal?: true;
};

const taskSixRouterServiceEntryCases: readonly RouterServiceEntryCase[] = [
  {
    label: "project list",
    method: "GET",
    path: "/api/v1/projects?limit=20&offset=0",
    serviceMethod: "project.list",
    successStatus: 200
  },
  {
    label: "client project summaries",
    method: "GET",
    path: "/api/v1/client/project-summaries?limit=20&offset=0",
    serviceMethod: "project.clientSummaries",
    successStatus: 200
  },
  {
    label: "project create",
    method: "POST",
    path: "/api/v1/projects",
    body: projectInput,
    serviceMethod: "project.create",
    successStatus: 201,
    superAdminPersonal: true
  },
  {
    label: "project detail",
    method: "GET",
    path: "/api/v1/projects/project-router-fixture",
    serviceMethod: "project.get",
    successStatus: 200
  },
  {
    label: "floor create",
    method: "POST",
    path: "/api/v1/projects/project-router-fixture/floors",
    body: floorInput,
    serviceMethod: "project.createFloor",
    successStatus: 201,
    superAdminPersonal: true
  },
  {
    label: "stage create",
    method: "POST",
    path: "/api/v1/floors/floor-router-fixture/stages",
    body: stageInput,
    serviceMethod: "project.createStage",
    successStatus: 201,
    superAdminPersonal: true
  },
  {
    label: "task create",
    method: "POST",
    path: "/api/v1/stages/stage-router-fixture/tasks",
    body: taskInput,
    serviceMethod: "project.createTask",
    successStatus: 201,
    superAdminPersonal: true
  },
  {
    label: "task events",
    method: "GET",
    path: "/api/v1/tasks/task-router-fixture/events?limit=20&offset=0&sort=asc",
    serviceMethod: "task.listEvents",
    successStatus: 200
  },
  {
    label: "task personal update",
    method: "PATCH",
    path: "/api/v1/tasks/task-router-fixture",
    body: { version: 1, progress: 10 },
    serviceMethod: "task.update",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "task deadline update",
    method: "PATCH",
    path: "/api/v1/tasks/task-router-fixture/deadline",
    body: {
      version: 1,
      currentDeadlineAt: "2026-09-01T00:00:00.000Z",
      reason: "Router authorization coverage"
    },
    serviceMethod: "task.reviseDeadline",
    successStatus: 200
  },
  {
    label: "organization managers",
    method: "GET",
    path: "/api/v1/organization/managers?search=&limit=20&offset=0",
    serviceMethod: "hierarchy.managers",
    successStatus: 200
  },
  {
    label: "organization team",
    method: "GET",
    path: "/api/v1/organization/team?limit=20&offset=0",
    serviceMethod: "hierarchy.team",
    successStatus: 200
  },
  {
    label: "organization tree",
    method: "GET",
    path: "/api/v1/organization/tree?limit=20&offset=0",
    serviceMethod: "hierarchy.tree",
    successStatus: 200
  },
  {
    label: "manager designers",
    method: "GET",
    path: "/api/v1/organization/managers/manager-router-fixture/designers?limit=20&offset=0",
    serviceMethod: "hierarchy.managerDesigners",
    successStatus: 200
  },
  {
    label: "designer summary",
    method: "GET",
    path: "/api/v1/designers/designer-router-fixture/summary",
    serviceMethod: "hierarchy.designerSummary",
    successStatus: 200
  },
  {
    label: "KPI task list",
    method: "GET",
    path: `/api/v1/kpis/users/designer-router-fixture/tasks?${kpiQuery}`,
    serviceMethod: "kpi.listTasks",
    successStatus: 200
  },
  {
    label: "KPI detail",
    method: "GET",
    path: `/api/v1/kpis/users/designer-router-fixture?${kpiQuery}`,
    serviceMethod: "kpi.get",
    successStatus: 200
  },
  {
    label: "evaluation create",
    method: "POST",
    path: "/api/v1/evaluations",
    body: evaluationInput,
    serviceMethod: "evaluation.create",
    successStatus: 201
  },
  {
    label: "evaluation list",
    method: "GET",
    path: "/api/v1/evaluations/designer-router-fixture?limit=20&offset=0",
    serviceMethod: "evaluation.list",
    successStatus: 200
  },
  {
    label: "project activity",
    method: "GET",
    path: "/api/v1/projects/project-router-fixture/activity?limit=20&offset=0",
    serviceMethod: "projectActivity.list",
    successStatus: 200
  },
  {
    label: "designer audit",
    method: "GET",
    path: "/api/v1/designers/designer-router-fixture/audit?limit=20&offset=0&sort=desc",
    serviceMethod: "audit.listForDesigner",
    successStatus: 200
  },
  {
    label: "audit list",
    method: "GET",
    path: "/api/v1/audit?limit=20&offset=0&sort=desc",
    serviceMethod: "audit.list",
    successStatus: 200
  }
];

const superAdminPersonalServiceEntryCases = taskSixRouterServiceEntryCases.filter(
  (entry) => entry.superAdminPersonal
);

describe("Task 6 router service-entry boundary", () => {
  it.each(taskSixRouterServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "proves valid future-role %s input reaches its service without operation authorization",
    async (_label, entry) => {
      const { app, calls } = createRouterServiceEntryHarness(true);
      const before = snapshotServiceEntries(calls);

      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actors.procurement,
        entry.body
      ).expect(entry.successStatus);
      expect(serviceEntryDelta(calls, before)).toEqual({
        [entry.serviceMethod]: 1
      });
    }
  );

  it.each(superAdminPersonalServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "proves valid Super Admin personal %s input reaches its service without operation authorization",
    async (_label, entry) => {
      const { app, calls } = createRouterServiceEntryHarness(true);
      const before = snapshotServiceEntries(calls);

      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actors.superAdmin,
        entry.body
      ).expect(entry.successStatus);
      expect(serviceEntryDelta(calls, before)).toEqual({
        [entry.serviceMethod]: 1
      });
    }
  );

  it.each(superAdminPersonalServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "denies Super Admin personal %s before service entry",
    async (_label, entry) => {
      const { app, calls } = createRouterServiceEntryHarness();
      const before = snapshotServiceEntries(calls);

      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actors.superAdmin,
        entry.body
      ).expect(403);
      expect(serviceEntryDelta(calls, before)).toEqual({});
    }
  );

  it.each([
    [actors.procurement],
    [actors.finance],
    [actors.siteManager],
    [actors.worker]
  ])("denies future role %s before every Task 6 service entry", async (actor) => {
    const { app, calls } = createRouterServiceEntryHarness();

    for (const entry of taskSixRouterServiceEntryCases) {
      const before = snapshotServiceEntries(calls);
      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actor,
        entry.body
      ).expect(403);
      expect(serviceEntryDelta(calls, before), entry.label).toEqual({});
    }
  });
});
