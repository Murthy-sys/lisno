import { once } from "node:events";
import type { Server } from "node:http";
import { Readable } from "node:stream";

import express, { type Express, type RequestHandler, type Router } from "express";
import jwt from "jsonwebtoken";
import request, { type Test } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import {
  isHumanOperationHandler,
  operationKeyForHandler,
  type HumanJwtOperationKey
} from "../src/domain/route-operations.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  AppRepository,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { createAuditRouter } from "../src/routes/audit.js";
import { createDesignVersionsRouter } from "../src/routes/design-versions.js";
import { createDesignSectionsRouter } from "../src/routes/design-sections.js";
import { createEstimateDesignsRouter } from "../src/routes/estimate-designs.js";
import { createEstimatePlanReviewRouter } from "../src/routes/estimate-plan-review.js";
import { createEstimatesRouter } from "../src/routes/estimates.js";
import { createEvaluationsRouter } from "../src/routes/evaluations.js";
import { createKpisRouter } from "../src/routes/kpis.js";
import { createLeadsRouter } from "../src/routes/leads.js";
import { createOrganizationRouter } from "../src/routes/organization.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createTasksRouter } from "../src/routes/tasks.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";
import {
  createAuditService,
  type AuditService
} from "../src/services/audit.service.js";
import type { DesignVersionService } from "../src/services/design-version.service.js";
import type { DesignSectionService } from "../src/services/design-section.service.js";
import type { EstimateDesignService } from "../src/services/estimate-design.service.js";
import type { EstimatePdfService } from "../src/services/estimate-pdf.service.js";
import type { createEstimatePlanReviewService } from "../src/services/estimate-plan-review.service.js";
import {
  authorizationSnapshotFor,
  createAuthService,
  InvalidTokenError,
  type AuthService,
  type PublicUser
} from "../src/services/auth.service.js";
import type { EvaluationService } from "../src/services/evaluation.service.js";
import type { HierarchyService } from "../src/services/hierarchy.service.js";
import type { KpiService } from "../src/services/kpi.service.js";
import type { LeadService } from "../src/services/lead.service.js";
import type { ProjectActivityService } from "../src/services/project-activity.service.js";
import type { ProjectService } from "../src/services/project.service.js";
import type { TaskService } from "../src/services/task.service.js";
import {
  EXPECTED_HUMAN_JWT_OPERATIONS,
  splitExpectedHumanOperationKey,
  type ExpectedHumanJwtOperation
} from "./fixtures/prompt-1-route-operations.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const JWT_SECRET = "super-admin-test-secret-with-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-07-16T12:00:00.000Z");

const actors = {
  superAdmin: ["user-super-admin", "super_admin"],
  estimator: ["user-estimator-sales", "estimator_sales"],
  client: ["user-client-aurora", "client"],
  designer: ["user-designer-ananya", "designer"],
  manager: ["user-manager-aarav", "design_manager"],
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
    accountKind: "standard",
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

function projectGrantSpiesFor(repository: AppRepository) {
  return {
    findActiveProjectAccessGrant: vi.spyOn(
      repository,
      "findActiveProjectAccessGrant"
    ),
    listProjectsForUserInModule: vi.spyOn(
      repository,
      "listProjectsForUserInModule"
    ),
    pageProjectsForUserInModule: vi.spyOn(
      repository,
      "pageProjectsForUserInModule"
    )
  };
}

type ProjectGrantSpies = ReturnType<typeof projectGrantSpiesFor>;

function expectProjectGrantSpiesUntouched(spies: ProjectGrantSpies): void {
  expect(spies.findActiveProjectAccessGrant).not.toHaveBeenCalled();
  expect(spies.listProjectsForUserInModule).not.toHaveBeenCalled();
  expect(spies.pageProjectsForUserInModule).not.toHaveBeenCalled();
}

function routerAuthorizationDependencies() {
  const repository = createMemoryRepository(taskSixSeed());
  const projectGrantSpies = projectGrantSpiesFor(repository);
  return {
    authService: createAuthService(repository, auth, {
      auditService: createAuditService(repository),
      developmentDemoAuthorization: developmentDemoAuthentication()
    }),
    projectGrantSpies
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

interface ListeningServer {
  server: Server;
  ready: Promise<void>;
}

const listeningServers = new Map<Express, ListeningServer>();

function listenerFor(app: Express): ListeningServer {
  const existing = listeningServers.get(app);
  if (existing) return existing;
  const server = app.listen(0, "127.0.0.1");
  const listener = {
    server,
    ready: once(server, "listening").then(() => undefined)
  };
  listeningServers.set(app, listener);
  return listener;
}

function listeningServerFor(app: Express): Server {
  return listenerFor(app).server;
}

async function readyListeningServerFor(app: Express): Promise<Server> {
  const listener = listenerFor(app);
  await listener.ready;
  return listener.server;
}

async function closeListeningServers(): Promise<void> {
  const listeners = [...listeningServers.values()];
  listeningServers.clear();
  await Promise.all(listeners.map(async ({ server, ready }) => {
    await ready;
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }));
}

afterEach(closeListeningServers);

function authenticatedRequest(
  app: Express,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  actor: readonly [string, Role],
  body?: unknown
): Test {
  const server = listeningServerFor(app);
  const pending = method === "GET"
    ? request(server).get(path)
    : method === "POST"
      ? request(server).post(path)
      : method === "PUT"
        ? request(server).put(path)
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

function createDesignVersionServiceDouble(
  calls: ServiceEntryCounters
): DesignVersionService {
  return {
    upload: () => recordServiceEntry(calls, "designVersion.upload", {} as never),
    list: () => recordServiceEntry(calls, "designVersion.list", emptyPage()),
    listLatestForClient: () => recordServiceEntry(calls, "designVersion.listLatestForClient", []),
    approve: () => recordServiceEntry(calls, "designVersion.approve", {} as never),
    download: () => recordServiceEntry(calls, "designVersion.download", {
      stream: Readable.from(Buffer.from("design-version")),
      filename: "design-version.pdf",
      mimeType: "application/pdf",
      sizeBytes: 14
    }),
    getExtraction: () => recordServiceEntry(calls, "designVersion.getExtraction", {} as never)
  };
}

function createDesignSectionServiceDouble(
  calls: ServiceEntryCounters
): DesignSectionService {
  return {
    listDrafts: () => recordServiceEntry(calls, "designSection.listDrafts", {}),
    add: () => recordServiceEntry(calls, "designSection.add", {}),
    edit: () => recordServiceEntry(calls, "designSection.edit", {}),
    remove: () => recordServiceEntry(calls, "designSection.remove", {}),
    retry: () => recordServiceEntry(calls, "designSection.retry", {}),
    submit: () => recordServiceEntry(calls, "designSection.submit", {}),
    listReview: () => recordServiceEntry(calls, "designSection.listReview", {}),
    decide: () => recordServiceEntry(calls, "designSection.decide", {}),
    pageImage: () => recordServiceEntry(
      calls,
      "designSection.pageImage",
      Readable.from(Buffer.from("page"))
    ),
    revisionImage: () => recordServiceEntry(
      calls,
      "designSection.revisionImage",
      Readable.from(Buffer.from("revision"))
    )
  };
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

function createDesignVersionRouterServiceEntryHarness(
  withoutOperationAuthorization = false
): { app: Express; calls: ServiceEntryCounters } {
  const calls: ServiceEntryCounters = new Map();
  const router = createDesignVersionsRouter(
    deterministicRouterAuth,
    createDesignVersionServiceDouble(calls),
    1024 * 1024
  );
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    withoutOperationAuthorization ? removeOperationAuthorization(router) : router
  );
  app.use(errorHandler);
  return { app, calls };
}

function createDesignSectionRouterServiceEntryHarness(
  withoutOperationAuthorization = false
): { app: Express; calls: ServiceEntryCounters } {
  const calls: ServiceEntryCounters = new Map();
  const router = createDesignSectionsRouter(
    deterministicRouterAuth,
    createDesignSectionServiceDouble(calls)
  );
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    withoutOperationAuthorization ? removeOperationAuthorization(router) : router
  );
  app.use(errorHandler);
  return { app, calls };
}

function createEstimationRouterServiceEntryHarness(
  family: "design" | "plan",
  withoutOperationAuthorization = false
): {
  app: Express;
  calls: ServiceEntryCounters;
  projectGrantSpies: ProjectGrantSpies;
} {
  const { authService, projectGrantSpies } = routerAuthorizationDependencies();
  const calls: ServiceEntryCounters = new Map();
  const record = <T>(key: string, result: T) => recordServiceEntry(calls, key, result);
  const design = new Proxy({} as EstimateDesignService, {
    get(_target, property) {
      const key = `estimateDesign.${String(property)}`;
      if (property === "sourceImage" || property === "revisionImage") {
        return () => record(key, Readable.from(Buffer.from("image")));
      }
      if (property === "listClient") {
        return () => record(key, { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: true, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } });
      }
      if (property === "listEstimator") {
        return () => record(key, { uploads: [], pages: [], drawings: [], revisions: [] });
      }
      return () => record(key, {});
    }
  });
  const plans = new Proxy({} as ReturnType<typeof createEstimatePlanReviewService>, {
    get(_target, property) {
      const key = `estimatePlan.${String(property)}`;
      if (property === "pageImage" || property === "staffPageImage") {
        return () => record(key, Readable.from(Buffer.from("image")));
      }
      if (property === "listStaff" || property === "listClient") {
        return () => record(key, []);
      }
      return () => record(key, {});
    }
  });
  const router = family === "design"
    ? createEstimateDesignsRouter(authService, design, 1024 * 1024)
    : createEstimatePlanReviewRouter(authService, plans);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    withoutOperationAuthorization ? removeOperationAuthorization(router) : router
  );
  app.use(errorHandler);
  return { app, calls, projectGrantSpies };
}

function createLeadRouterServiceEntryHarness(
  withoutOperationAuthorization = false
): {
  app: Express;
  calls: ServiceEntryCounters;
  projectGrantSpies: ProjectGrantSpies;
} {
  const { authService, projectGrantSpies } = routerAuthorizationDependencies();
  const calls: ServiceEntryCounters = new Map();
  const record = <T>(key: string, result: T) => recordServiceEntry(calls, key, result);
  const leads = new Proxy({} as LeadService, {
    get(_target, property) {
      const key = `lead.${String(property)}`;
      if (property === "page") return () => record(key, emptyPage());
      if (property === "listActivities") return () => record(key, []);
      return () => record(key, {});
    }
  });
  const router = createLeadsRouter(authService, leads);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    withoutOperationAuthorization ? removeOperationAuthorization(router) : router
  );
  app.use(errorHandler);
  return { app, calls, projectGrantSpies };
}

function replaceTerminalRouteHandlers(
  router: Router,
  calls: ServiceEntryCounters
): void {
  const layers = (router as unknown as { stack: MutableRouteLayer[] }).stack;
  for (const layer of layers) {
    if (!layer.route) continue;
    const operationKey = layer.route.stack
      .map(({ handle }) => operationKeyForHandler(handle))
      .find((key): key is HumanJwtOperationKey => key !== undefined);
    if (!operationKey) {
      throw new Error("Expected every Estimate route to have an operation marker.");
    }
    const terminal = layer.route.stack.at(-1);
    if (!terminal) {
      throw new Error(`Expected a terminal handler for ${operationKey}.`);
    }
    terminal.handle = ((_request, response) => {
      calls.set(operationKey, (calls.get(operationKey) ?? 0) + 1);
      response.status(204).end();
    }) satisfies RequestHandler;
  }
}

function createEstimateRouterHandlerEntryHarness(
  withoutOperationAuthorization = false
): {
  app: Express;
  calls: ServiceEntryCounters;
  projectGrantSpies: ProjectGrantSpies;
} {
  const { authService, projectGrantSpies } = routerAuthorizationDependencies();
  const calls: ServiceEntryCounters = new Map();
  const router = createEstimatesRouter(
    authService,
    {} as LeadService,
    {} as EstimatePdfService,
    {} as EstimateDesignService,
    {} as AuditService
  );
  replaceTerminalRouteHandlers(router, calls);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    withoutOperationAuthorization ? removeOperationAuthorization(router) : router
  );
  app.use(errorHandler);
  return { app, calls, projectGrantSpies };
}

function routerAuthenticatedRequest(
  app: Express,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  actor: readonly [string, Role],
  body?: unknown
): Test {
  const server = listeningServerFor(app);
  const pending = method === "GET"
    ? request(server).get(path)
    : method === "POST"
      ? request(server).post(path)
      : method === "PUT"
        ? request(server).put(path)
      : method === "PATCH"
        ? request(server).patch(path)
        : request(server).delete(path);
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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

const designVersionRouterServiceEntryCases: readonly RouterServiceEntryCase[] = [
  {
    label: "latest approved Design Versions",
    method: "GET",
    path: "/api/v1/client/latest-approved-versions?limit=20&offset=0",
    serviceMethod: "designVersion.listLatestForClient",
    successStatus: 200
  },
  {
    label: "project Design Version list",
    method: "GET",
    path: "/api/v1/projects/project-router-fixture/design-versions?limit=20&offset=0",
    serviceMethod: "designVersion.list",
    successStatus: 200
  },
  {
    label: "Design Version extraction",
    method: "GET",
    path: "/api/v1/design-versions/version-router-fixture/extraction",
    serviceMethod: "designVersion.getExtraction",
    successStatus: 200
  },
  {
    label: "Design Version approval",
    method: "PATCH",
    path: "/api/v1/design-versions/version-router-fixture/approval",
    body: { approvalStatus: "approved", clientVisible: true },
    serviceMethod: "designVersion.approve",
    successStatus: 200
  },
  {
    label: "Design Version download",
    method: "GET",
    path: "/api/v1/design-versions/version-router-fixture/download",
    serviceMethod: "designVersion.download",
    successStatus: 200
  }
];

const designSectionRouterServiceEntryCases: readonly RouterServiceEntryCase[] = [
  {
    label: "draft section list",
    method: "GET",
    path: "/api/v1/design-versions/version-router-fixture/sections",
    serviceMethod: "designSection.listDrafts",
    successStatus: 200
  },
  {
    label: "section create",
    method: "POST",
    path: "/api/v1/design-versions/version-router-fixture/sections",
    body: {
      sourcePageId: "page-router-fixture",
      label: "Kitchen",
      crop: { x: 0, y: 0, width: 100, height: 80 }
    },
    serviceMethod: "designSection.add",
    successStatus: 201,
    superAdminPersonal: true
  },
  {
    label: "section update",
    method: "PATCH",
    path: "/api/v1/design-sections/section-router-fixture",
    body: { version: 1, label: "Updated kitchen" },
    serviceMethod: "designSection.edit",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "section delete",
    method: "DELETE",
    path: "/api/v1/design-sections/section-router-fixture",
    body: { version: 1 },
    serviceMethod: "designSection.remove",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "section extraction retry",
    method: "POST",
    path: "/api/v1/design-versions/version-router-fixture/retry-extraction",
    serviceMethod: "designSection.retry",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "section submission",
    method: "POST",
    path: "/api/v1/design-versions/version-router-fixture/submit-sections",
    serviceMethod: "designSection.submit",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "client section list",
    method: "GET",
    path: "/api/v1/client/projects/project-router-fixture/design-sections",
    serviceMethod: "designSection.listReview",
    successStatus: 200
  },
  {
    label: "client section decision",
    method: "POST",
    path: "/api/v1/design-section-revisions/revision-router-fixture/decision",
    body: { version: 1, decision: "approved", comment: "Looks good" },
    serviceMethod: "designSection.decide",
    successStatus: 200,
    superAdminPersonal: true
  },
  {
    label: "source page image",
    method: "GET",
    path: "/api/v1/design-source-pages/page-router-fixture/image",
    serviceMethod: "designSection.pageImage",
    successStatus: 200
  },
  {
    label: "section revision image",
    method: "GET",
    path: "/api/v1/design-section-revisions/revision-router-fixture/image",
    serviceMethod: "designSection.revisionImage",
    successStatus: 200
  }
];

const superAdminPersonalServiceEntryCases = taskSixRouterServiceEntryCases.filter(
  (entry) => entry.superAdminPersonal
);

const EMPTY_ANNOTATIONS = {
  schemaVersion: 1,
  imageWidth: 100,
  imageHeight: 100,
  elements: []
} as const;
const MARKED_ANNOTATIONS = {
  ...EMPTY_ANNOTATIONS,
  elements: [{
    id: "mark",
    type: "rectangle",
    color: "#ff0000",
    strokeWidth: 2,
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.3
  }]
} as const;
const CHARACTERIZATION_LEAD_BODY = {
  clientName: "Asha Rao",
  clientEmail: "asha@example.com",
  clientMobile: "9999999999",
  projectName: "Aurora",
  location: "Pune",
  propertyType: "villa",
  source: "referral",
  nextAction: "site visit",
  nextActionAt: "2026-09-01T10:00:00.000Z"
} as const;
const CHARACTERIZATION_ESTIMATE_BODY = {
  propertyType: "villa",
  rooms: [],
  scopes: ["interiors"],
  lineItems: [{
    catalogueId: "cat-paint",
    roomName: "Living",
    specification: "Primer and paint",
    unit: "sqft",
    rate: 10,
    quantity: 100,
    included: true
  }]
} as const;

type EstimationOperationFamily = "design" | "plan" | "lead" | "estimate";
type TaskNineRequestCase = ExpectedHumanJwtOperation & {
  family: EstimationOperationFamily;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  multipart?: { version?: string };
  serviceMethod?: string;
  successStatus: 200 | 201 | 204;
  existingActor: readonly [string, Role];
};

const TASK_NINE_BODIES: Partial<Record<ExpectedHumanJwtOperation["key"], unknown>> = {
  "POST /estimate-design-source-pages/:pageId/drawings": {
    displayTitle: "Manual drawing",
    crop: { x: 0, y: 0, width: 50, height: 50 },
    roomId: "room-living",
    catalogueId: "FC01"
  },
  "PUT /client/estimate-design-revisions/:revisionId/annotation-draft": {
    version: 0,
    annotations: EMPTY_ANNOTATIONS
  },
  "POST /client/estimate-design-revisions/:revisionId/decision": {
    version: 1,
    decision: "approve"
  },
  "PATCH /estimate-design-drawings/:drawingId": {
    version: 1,
    verified: true
  },
  "PUT /estimate-design-drawings/:drawingId/estimate-item": {
    version: 1,
    roomId: "room-living",
    catalogueId: "FC01"
  },
  "DELETE /estimate-design-drawings/:drawingId": { version: 1 },
  "PUT /client/estimate-plan-pages/:pageId/annotation-draft": {
    version: 0,
    annotations: EMPTY_ANNOTATIONS
  },
  "POST /client/estimate-plan-pages/:pageId/target-preview": {
    annotations: EMPTY_ANNOTATIONS
  },
  "POST /client/estimate-plan-pages/:pageId/change-requests": {
    version: 1,
    summary: "Move wall",
    annotations: MARKED_ANNOTATIONS,
    targetDrawingIds: ["drawing-router-fixture"],
    snapshotToken: "a".repeat(64),
    idempotencyKey: "fixture-request"
  },
  "PUT /client/estimate-plan-change-requests/:requestId": {
    version: 1,
    summary: "Move wall",
    annotations: MARKED_ANNOTATIONS
  },
  "PUT /estimate-plan-change-requests/:requestId/targets": {
    version: 1,
    targetDrawingIds: ["drawing-router-fixture"]
  },
  "POST /estimate-plan-change-requests/:requestId/resolve-page": {
    version: 1,
    note: "Resolved by fixture actor"
  },
  "POST /leads": CHARACTERIZATION_LEAD_BODY,
  "PATCH /leads/:leadId": { stage: "negotiation" },
  "POST /leads/:leadId/activities": {
    type: "call",
    note: "Confirmed site visit",
    occurredAt: "2026-07-29T10:00:00.000Z"
  },
  "PUT /leads/:leadId/estimate": CHARACTERIZATION_ESTIMATE_BODY,
  "POST /estimates/:estimateId/assign": {
    designerId: "user-designer-ananya"
  },
  "POST /estimates/:estimateId/designer-decision": {
    decision: "approve",
    note: "Approved"
  },
  "POST /client/estimates/:estimateId/decision": {
    decision: "request_changes",
    note: "Please revise"
  }
};

const TASK_NINE_SERVICE_METHODS: Partial<
  Record<ExpectedHumanJwtOperation["key"], string>
> = {
  "POST /estimates/:estimateId/design-uploads": "estimateDesign.upload",
  "GET /estimates/:estimateId/design-uploads": "estimateDesign.listEstimator",
  "POST /estimate-design-uploads/:uploadId/retry": "estimateDesign.retryUpload",
  "GET /estimate-design-source-pages/:pageId/image": "estimateDesign.sourceImage",
  "POST /estimate-design-source-pages/:pageId/drawings": "estimateDesign.createManualDrawing",
  "GET /estimate-design-revisions/:revisionId/image": "estimateDesign.revisionImage",
  "GET /client/estimates/:estimateId/design-drawings": "estimateDesign.listClient",
  "PUT /client/estimate-design-revisions/:revisionId/annotation-draft": "estimateDesign.saveAnnotationDraft",
  "POST /client/estimate-design-revisions/:revisionId/decision": "estimateDesign.decideDrawing",
  "PATCH /estimate-design-drawings/:drawingId": "estimateDesign.editDrawing",
  "PUT /estimate-design-drawings/:drawingId/estimate-item": "estimateDesign.assignEstimateItem",
  "DELETE /estimate-design-drawings/:drawingId": "estimateDesign.removeDrawing",
  "POST /estimate-design-drawings/:drawingId/replacement": "estimateDesign.replaceDrawing",
  "POST /estimates/:estimateId/design-drawings/submit": "estimateDesign.submitDrawings",
  "GET /client/estimates/:estimateId/plan-review": "estimatePlan.listClient",
  "GET /client/estimate-plan-pages/:pageId/thumbnail": "estimatePlan.pageImage",
  "GET /client/estimate-plan-pages/:pageId/current-image": "estimatePlan.pageImage",
  "PUT /client/estimate-plan-pages/:pageId/annotation-draft": "estimatePlan.saveDraft",
  "POST /client/estimate-plan-pages/:pageId/target-preview": "estimatePlan.previewTargets",
  "POST /client/estimate-plan-pages/:pageId/change-requests": "estimatePlan.submitRequest",
  "PUT /client/estimate-plan-change-requests/:requestId": "estimatePlan.updateClientRequest",
  "GET /estimate-plan-change-requests": "estimatePlan.listStaff",
  "GET /estimate-plan-change-requests/:requestId": "estimatePlan.getStaff",
  "PUT /estimate-plan-change-requests/:requestId/targets": "estimatePlan.updateTargets",
  "POST /estimate-plan-change-requests/:requestId/resolve-page": "estimatePlan.resolvePage",
  "GET /estimate-plan-pages/:pageId/current-image": "estimatePlan.staffPageImage",
  "GET /leads": "lead.page",
  "POST /leads": "lead.create",
  "GET /leads/:leadId": "lead.get",
  "PATCH /leads/:leadId": "lead.update",
  "GET /leads/:leadId/activities": "lead.listActivities",
  "POST /leads/:leadId/activities": "lead.addActivity"
};

const TASK_NINE_CREATED_KEYS = new Set<ExpectedHumanJwtOperation["key"]>([
  "POST /estimates/:estimateId/design-uploads",
  "POST /estimate-design-source-pages/:pageId/drawings",
  "POST /estimate-design-drawings/:drawingId/replacement",
  "POST /client/estimate-plan-pages/:pageId/change-requests",
  "POST /leads",
  "POST /leads/:leadId/activities"
]);
const TASK_NINE_CLIENT_CONTROL_KEYS = new Set<ExpectedHumanJwtOperation["key"]>([
  "GET /estimate-design-revisions/:revisionId/image",
  "GET /client/estimates/:estimateId/design-drawings",
  "PUT /client/estimate-design-revisions/:revisionId/annotation-draft",
  "POST /client/estimate-design-revisions/:revisionId/decision",
  "GET /client/estimates/:estimateId/plan-review",
  "GET /client/estimate-plan-pages/:pageId/thumbnail",
  "GET /client/estimate-plan-pages/:pageId/current-image",
  "PUT /client/estimate-plan-pages/:pageId/annotation-draft",
  "POST /client/estimate-plan-pages/:pageId/target-preview",
  "POST /client/estimate-plan-pages/:pageId/change-requests",
  "PUT /client/estimate-plan-change-requests/:requestId",
  "GET /client/estimates",
  "GET /client/estimates/:estimateId/pdf",
  "POST /client/estimates/:estimateId/decision"
]);
const TASK_NINE_DESIGNER_CONTROL_KEYS = new Set<ExpectedHumanJwtOperation["key"]>([
  "GET /estimate-plan-change-requests/:requestId",
  "GET /estimates/review-queue",
  "POST /estimates/:estimateId/designer-decision"
]);
const TASK_NINE_MANAGER_CONTROL_KEYS = new Set<ExpectedHumanJwtOperation["key"]>([
  "PUT /estimate-plan-change-requests/:requestId/targets",
  "GET /estimate-plan-pages/:pageId/current-image",
  "GET /estimates/designers",
  "POST /estimates/:estimateId/assign"
]);

function existingActorFor(
  operation: ExpectedHumanJwtOperation
): readonly [string, Role] {
  if (TASK_NINE_CLIENT_CONTROL_KEYS.has(operation.key)) return actors.client;
  if (TASK_NINE_DESIGNER_CONTROL_KEYS.has(operation.key)) return actors.designer;
  if (TASK_NINE_MANAGER_CONTROL_KEYS.has(operation.key)) return actors.manager;
  return actors.estimator;
}

function materializeTaskNinePath(path: `/${string}`): string {
  return `/api/v1${path}`
    .replaceAll(":estimateId", "estimate-router-fixture")
    .replaceAll(":uploadId", "upload-router-fixture")
    .replaceAll(":pageId", "page-router-fixture")
    .replaceAll(":revisionId", "revision-router-fixture")
    .replaceAll(":drawingId", "drawing-router-fixture")
    .replaceAll(":requestId", "request-router-fixture")
    .replaceAll(":leadId", "lead-router-fixture");
}

function requestCaseFor(
  operation: ExpectedHumanJwtOperation,
  family: EstimationOperationFamily
): TaskNineRequestCase {
  const { method, path: operationPath } = splitExpectedHumanOperationKey(operation.key);
  const basePath = materializeTaskNinePath(operationPath);
  const path = operation.key === "GET /leads" ||
    operation.key === "GET /leads/:leadId/activities"
    ? `${basePath}?limit=20&offset=0`
    : basePath;
  const multipart = operation.key === "POST /estimates/:estimateId/design-uploads"
    ? {}
    : operation.key === "POST /estimate-design-drawings/:drawingId/replacement"
      ? { version: "1" }
      : undefined;
  return {
    ...operation,
    family,
    method,
    path,
    ...(Object.hasOwn(TASK_NINE_BODIES, operation.key)
      ? { body: TASK_NINE_BODIES[operation.key] }
      : {}),
    ...(multipart ? { multipart } : {}),
    ...(TASK_NINE_SERVICE_METHODS[operation.key]
      ? { serviceMethod: TASK_NINE_SERVICE_METHODS[operation.key] }
      : {}),
    successStatus: family === "estimate"
      ? 204
      : TASK_NINE_CREATED_KEYS.has(operation.key) ? 201 : 200,
    existingActor: existingActorFor(operation)
  };
}

const ESTIMATE_DESIGN_CASES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(39, 53)
  .map((operation) => requestCaseFor(operation, "design"));
const ESTIMATE_PLAN_REVIEW_CASES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(53, 65)
  .map((operation) => requestCaseFor(operation, "plan"));
const LEAD_CASES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(65, 71)
  .map((operation) => requestCaseFor(operation, "lead"));
const ESTIMATE_CASES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(71, 84)
  .map((operation) => requestCaseFor(operation, "estimate"));

const TASK_NINE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

function taskNineRequest(
  app: Express,
  entry: TaskNineRequestCase,
  actor: readonly [string, Role]
): Test {
  const server = listeningServerFor(app);
  const pending = entry.method === "GET"
    ? request(server).get(entry.path)
    : entry.method === "POST"
      ? request(server).post(entry.path)
      : entry.method === "PUT"
        ? request(server).put(entry.path)
        : entry.method === "PATCH"
          ? request(server).patch(entry.path)
          : request(server).delete(entry.path);
  pending.set("Authorization", bearer(actor));
  if (entry.multipart) {
    pending.attach("file", TASK_NINE_PNG, {
      filename: "task-nine.png",
      contentType: "image/png"
    });
    if (entry.multipart.version) {
      pending.field("version", entry.multipart.version);
    }
    return pending;
  }
  return entry.body === undefined ? pending : pending.send(entry.body);
}

function serviceHarnessFor(entry: TaskNineRequestCase, withoutOperation = false) {
  return entry.family === "lead"
    ? createLeadRouterServiceEntryHarness(withoutOperation)
    : createEstimationRouterServiceEntryHarness(entry.family as "design" | "plan", withoutOperation);
}

async function expectServiceOperationBoundary(entry: TaskNineRequestCase): Promise<void> {
  const serviceMethod = entry.serviceMethod;
  if (!serviceMethod) throw new Error(`Missing service method for ${entry.key}.`);
  const normal = serviceHarnessFor(entry);
  const beforeSuperAdmin = snapshotServiceEntries(normal.calls);
  if (entry.superAdminBehavior === "deny_personal") {
    await taskNineRequest(normal.app, entry, actors.superAdmin).expect(403);
    expect(serviceEntryDelta(normal.calls, beforeSuperAdmin)).toEqual({});
  } else {
    await taskNineRequest(normal.app, entry, actors.superAdmin).expect(entry.successStatus);
    expect(serviceEntryDelta(normal.calls, beforeSuperAdmin)).toEqual({
      [serviceMethod]: 1
    });
  }
  expectProjectGrantSpiesUntouched(normal.projectGrantSpies);

  const beforeExistingRole = snapshotServiceEntries(normal.calls);
  await taskNineRequest(normal.app, entry, entry.existingActor).expect(entry.successStatus);
  expect(serviceEntryDelta(normal.calls, beforeExistingRole)).toEqual({
    [serviceMethod]: 1
  });
  expectProjectGrantSpiesUntouched(normal.projectGrantSpies);

  if (entry.superAdminBehavior === "deny_personal") {
    const stripped = serviceHarnessFor(entry, true);
    const beforeStripped = snapshotServiceEntries(stripped.calls);
    await taskNineRequest(stripped.app, entry, actors.superAdmin).expect(entry.successStatus);
    expect(serviceEntryDelta(stripped.calls, beforeStripped)).toEqual({
      [serviceMethod]: 1
    });
    expectProjectGrantSpiesUntouched(stripped.projectGrantSpies);
  }
}

async function expectEstimateOperationBoundary(entry: TaskNineRequestCase): Promise<void> {
  const normal = createEstimateRouterHandlerEntryHarness();
  const beforeSuperAdmin = snapshotServiceEntries(normal.calls);
  if (entry.superAdminBehavior === "deny_personal") {
    await taskNineRequest(normal.app, entry, actors.superAdmin).expect(403);
    expect(serviceEntryDelta(normal.calls, beforeSuperAdmin)).toEqual({});
  } else {
    await taskNineRequest(normal.app, entry, actors.superAdmin).expect(204);
    expect(serviceEntryDelta(normal.calls, beforeSuperAdmin)).toEqual({
      [entry.key]: 1
    });
  }
  expectProjectGrantSpiesUntouched(normal.projectGrantSpies);

  const beforeExistingRole = snapshotServiceEntries(normal.calls);
  await taskNineRequest(normal.app, entry, entry.existingActor).expect(204);
  expect(serviceEntryDelta(normal.calls, beforeExistingRole)).toEqual({
    [entry.key]: 1
  });
  expectProjectGrantSpiesUntouched(normal.projectGrantSpies);

  if (entry.superAdminBehavior === "deny_personal") {
    const stripped = createEstimateRouterHandlerEntryHarness(true);
    const beforeStripped = snapshotServiceEntries(stripped.calls);
    await taskNineRequest(stripped.app, entry, actors.superAdmin).expect(204);
    expect(serviceEntryDelta(stripped.calls, beforeStripped)).toEqual({
      [entry.key]: 1
    });
    expectProjectGrantSpiesUntouched(stripped.projectGrantSpies);
  }
}

describe("Estimate Design operations", () => {
  it.each(ESTIMATE_DESIGN_CASES.map((entry) => [entry.key, entry] as const))(
    "%s enforces the fixture-derived operation boundary",
    async (_key, entry) => expectServiceOperationBoundary(entry)
  );
});

describe("Estimate Plan Review operations", () => {
  it.each(ESTIMATE_PLAN_REVIEW_CASES.map((entry) => [entry.key, entry] as const))(
    "%s enforces the fixture-derived operation boundary",
    async (_key, entry) => expectServiceOperationBoundary(entry)
  );
});

describe("Lead operations", () => {
  it.each(LEAD_CASES.map((entry) => [entry.key, entry] as const))(
    "%s enforces the fixture-derived operation boundary",
    async (_key, entry) => expectServiceOperationBoundary(entry)
  );
});

describe("Estimate operations", () => {
  it.each(ESTIMATE_CASES.map((entry) => [entry.key, entry] as const))(
    "%s enforces the fixture-derived operation boundary",
    async (_key, entry) => expectEstimateOperationBoundary(entry)
  );
});

describe("Task 6 router service-entry boundary", () => {
  it("closes a loopback listener even when teardown races its startup", async () => {
    const app = express();
    const server = listeningServerFor(app);
    const started = once(server, "listening");

    try {
      await closeListeningServers();
      await started;

      expect(server.listening).toBe(false);
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
    }
  });

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
    await readyListeningServerFor(app);

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

describe("Design Version operations service-entry boundary", () => {
  it.each(designVersionRouterServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "proves valid future-role %s input reaches its service without operation authorization",
    async (_label, entry) => {
      const { app, calls } = createDesignVersionRouterServiceEntryHarness(true);
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

  it.each(designVersionRouterServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "denies a future role before %s service entry",
    async (_label, entry) => {
      const { app, calls } = createDesignVersionRouterServiceEntryHarness();
      const before = snapshotServiceEntries(calls);

      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actors.procurement,
        entry.body
      ).expect(403);
      expect(serviceEntryDelta(calls, before)).toEqual({});
    }
  );

  it("proves valid Super Admin upload reaches the service without operation authorization", async () => {
    const { app, calls } = createDesignVersionRouterServiceEntryHarness(true);
    const before = snapshotServiceEntries(calls);

    await request(listeningServerFor(app))
      .post("/api/v1/tasks/task-router-fixture/design-versions")
      .set("Authorization", `Bearer ${actors.superAdmin[0]}`)
      .attach("file", Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x00
      ]), { filename: "router.png", contentType: "image/png" })
      .expect(201);
    expect(serviceEntryDelta(calls, before)).toEqual({
      "designVersion.upload": 1
    });
  });

  it("denies Super Admin upload before multipart or service entry", async () => {
    const { app, calls } = createDesignVersionRouterServiceEntryHarness();
    const before = snapshotServiceEntries(calls);

    await request(listeningServerFor(app))
      .post("/api/v1/tasks/task-router-fixture/design-versions")
      .set("Authorization", `Bearer ${actors.superAdmin[0]}`)
      .attach("file", Buffer.from("not parsed"), {
        filename: "forbidden.pdf",
        contentType: "application/pdf"
      })
      .expect(403);
    expect(serviceEntryDelta(calls, before)).toEqual({});
  });
});

describe("Design Section operations service-entry boundary", () => {
  it.each(designSectionRouterServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "proves valid future-role %s input reaches its service without operation authorization",
    async (_label, entry) => {
      const { app, calls } = createDesignSectionRouterServiceEntryHarness(true);
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

  it.each(designSectionRouterServiceEntryCases.map((entry) => [entry.label, entry] as const))(
    "denies a future role before %s service entry",
    async (_label, entry) => {
      const { app, calls } = createDesignSectionRouterServiceEntryHarness();
      const before = snapshotServiceEntries(calls);

      await routerAuthenticatedRequest(
        app,
        entry.method,
        entry.path,
        actors.procurement,
        entry.body
      ).expect(403);
      expect(serviceEntryDelta(calls, before)).toEqual({});
    }
  );

  it.each(
    designSectionRouterServiceEntryCases
      .filter((entry) => entry.superAdminPersonal)
      .map((entry) => [entry.label, entry] as const)
  )(
    "proves valid Super Admin personal %s input reaches its service without operation authorization",
    async (_label, entry) => {
      const { app, calls } = createDesignSectionRouterServiceEntryHarness(true);
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

  it.each(
    designSectionRouterServiceEntryCases
      .filter((entry) => entry.superAdminPersonal)
      .map((entry) => [entry.label, entry] as const)
  )(
    "denies Super Admin personal %s before service entry",
    async (_label, entry) => {
      const { app, calls } = createDesignSectionRouterServiceEntryHarness();
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
});
