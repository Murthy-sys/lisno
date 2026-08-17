import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { PERMISSION_CODES } from "../src/domain/authorization.js";
import { currentHumanOperation } from "../src/domain/operation-context.js";
import {
  HUMAN_JWT_OPERATION_LIST,
  HUMAN_JWT_OPERATIONS,
  isHumanOperationHandler,
  operationKeyForHandler,
  splitHumanOperationKey
} from "../src/domain/route-operations.js";
import { requireOperation } from "../src/middleware/authorization.js";
import { authenticate, isAuthenticationHandler } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errors.js";
import type { AuthService } from "../src/services/auth.service.js";
import {
  EXPECTED_HUMAN_JWT_OPERATIONS,
  EXPECTED_HUMAN_JWT_OPERATIONS_1_23,
  EXPECTED_HUMAN_JWT_OPERATIONS_24_39,
  EXPECTED_HUMAN_JWT_OPERATIONS_40_65,
  EXPECTED_HUMAN_JWT_OPERATIONS_66_84,
  EXPECTED_HUMAN_JWT_OPERATIONS_85_93
} from "./fixtures/prompt-1-route-operations.js";

const slices = [
  ["matches manifest rows 1 through 23", 0, 23, EXPECTED_HUMAN_JWT_OPERATIONS_1_23],
  ["matches manifest rows 24 through 39", 23, 39, EXPECTED_HUMAN_JWT_OPERATIONS_24_39],
  ["matches manifest rows 40 through 65", 39, 65, EXPECTED_HUMAN_JWT_OPERATIONS_40_65],
  ["matches manifest rows 66 through 84", 65, 84, EXPECTED_HUMAN_JWT_OPERATIONS_66_84],
  ["matches manifest rows 85 through 93", 84, 93, EXPECTED_HUMAN_JWT_OPERATIONS_85_93]
] as const;

type RouterLayer = {
  handle?: { stack?: RouterLayer[] } | RequestHandler;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
};

type MountedRoute = {
  key: string;
  authenticationIndices: number[];
  operationMarkers: Array<{ index: number; key: string | undefined }>;
};

type MountedRouter = { routes: MountedRoute[] };

const TASK_SIX_EXPECTED_ROUTE_GROUPS = [
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(1, 8).map(({ key }) => key),
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(8, 11).map(({ key }) => key),
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(11, 16).map(({ key }) => key),
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(16, 18).map(({ key }) => key),
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(18, 20).map(({ key }) => key),
  EXPECTED_HUMAN_JWT_OPERATIONS.slice(20, 23).map(({ key }) => key)
] as const;

const DESIGN_VERSION_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(23, 29)
  .map(({ key }) => key);
const DESIGN_SECTION_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(29, 39)
  .map(({ key }) => key);
const ESTIMATE_DESIGN_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(39, 53)
  .map(({ key }) => key);
const ESTIMATE_PLAN_REVIEW_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(53, 65)
  .map(({ key }) => key);
const LEAD_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(65, 71)
  .map(({ key }) => key);
const ESTIMATE_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(71, 84)
  .map(({ key }) => key);

function mountedHumanRouters(): MountedRouter[] {
  const app = createApp({
    auth: {
      jwtSecret: "route-registry-test-secret-with-enough-entropy",
      jwtExpiresInSeconds: 900
    }
  });
  const stack = (app as unknown as { router: { stack: RouterLayer[] } }).router.stack;
  return stack.flatMap((outer) => {
    const routes = ((typeof outer.handle === "object" || typeof outer.handle === "function")
      ? outer.handle.stack ?? []
      : []).flatMap((layer) => {
      if (!layer.route) return [];
      const method = Object.keys(layer.route.methods)[0]?.toUpperCase();
      if (!method) return [];
      return [{
        key: `${method} ${layer.route.path}`,
        authenticationIndices: layer.route.stack.flatMap(({ handle }, index) =>
          isAuthenticationHandler(handle) ? [index] : []
        ),
        operationMarkers: layer.route.stack.flatMap(({ handle }, index) =>
          isHumanOperationHandler(handle)
            ? [{ index, key: operationKeyForHandler(handle) }]
            : []
        )
      }];
    });
    return routes.length === 0 ? [] : [{ routes }];
  });
}

function assertTaskSixRouteMounts(routers: MountedRouter[]): void {
  const allRoutes = routers.flatMap(({ routes }) => routes);
  const expectedKeys = TASK_SIX_EXPECTED_ROUTE_GROUPS.flat();

  expect(allRoutes.filter(({ key }) => expectedKeys.includes(key as never))).toHaveLength(22);
  for (const expectedKey of expectedKeys) {
    expect(
      allRoutes.filter(({ key }) => key === expectedKey),
      `${expectedKey} mounted route count`
    ).toHaveLength(1);
  }

  const matchedRouterIndices: number[] = [];
  for (const expectedGroup of TASK_SIX_EXPECTED_ROUTE_GROUPS) {
    const matches = routers.flatMap((router, index) =>
      router.routes.some(({ key }) => expectedGroup.includes(key as never))
        ? [{ index, router }]
        : []
    );
    expect(matches, `${expectedGroup[0]} router group`).toHaveLength(1);
    const match = matches[0]!;
    matchedRouterIndices.push(match.index);
    expect(
      match.router.routes.map(({ key }) => key).sort(),
      `${expectedGroup[0]} exact route multiset`
    ).toEqual([...expectedGroup].sort());

    for (const route of match.router.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
  }
  expect(new Set(matchedRouterIndices).size).toBe(TASK_SIX_EXPECTED_ROUTE_GROUPS.length);
}

function validTaskSixRouterFixture(): MountedRouter[] {
  return TASK_SIX_EXPECTED_ROUTE_GROUPS.map((expectedGroup) => ({
    routes: expectedGroup.map((key) => ({
      key,
      authenticationIndices: [0],
      operationMarkers: [{ index: 1, key }]
    }))
  }));
}

describe("human JWT operation registry", () => {
  it.each(slices)("%s", (_name, start, end, expected) => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(start, end)).toEqual(expected);
  });

  it("matches all normative operation rows", () => {
    expect(Object.values(HUMAN_JWT_OPERATIONS)).toEqual(EXPECTED_HUMAN_JWT_OPERATIONS);
    expect(Object.keys(HUMAN_JWT_OPERATIONS)).toHaveLength(93);
  });

  it("mounts rows 2 through 23 as exact router groups with one ordered marker pair", () => {
    assertTaskSixRouteMounts(mountedHumanRouters());
  });

  it("classifies rows 24 through 29 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => DESIGN_VERSION_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...DESIGN_VERSION_EXPECTED_ROUTES].sort()
    );
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
  });

  it("classifies rows 30 through 39 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => DESIGN_SECTION_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...DESIGN_SECTION_EXPECTED_ROUTES].sort()
    );
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
  });

  it("classifies Estimate Design rows 40 through 53 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => ESTIMATE_DESIGN_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...ESTIMATE_DESIGN_EXPECTED_ROUTES].sort()
    );
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
  });

  it("classifies Estimate Plan Review rows 54 through 65 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => ESTIMATE_PLAN_REVIEW_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...ESTIMATE_PLAN_REVIEW_EXPECTED_ROUTES].sort()
    );
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
  });

  it("classifies Lead operations rows 66 through 71 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => LEAD_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual([...LEAD_EXPECTED_ROUTES].sort());
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(route.authenticationIndices[0]!);
    }
  });

  it("classifies Estimate operations rows 72 through 84 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => ESTIMATE_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual([...ESTIMATE_EXPECTED_ROUTES].sort());
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(route.authenticationIndices[0]!);
    }
  });

  it("mounts exactly the 84 baseline human operations and leaves only rows 86 through 93 unmounted", () => {
    const mountedOperations = mountedHumanRouters().flatMap(({ routes }) => routes)
      .flatMap(({ operationMarkers }) => operationMarkers.map(({ key }) => key))
      .filter((key): key is string => Boolean(key));
    const baselineOperations = EXPECTED_HUMAN_JWT_OPERATIONS
      .filter((operation) => operation.availability === "baseline")
      .map(({ key }) => key);
    const mountedBaselineOperations = mountedOperations.filter((key) => baselineOperations.includes(key as never));

    expect([...mountedBaselineOperations].sort()).toEqual([...baselineOperations].sort());
    expect(mountedBaselineOperations).toHaveLength(84);
    expect(mountedOperations).toHaveLength(85);
    expect(mountedOperations).toContain("GET /auth/authorization");
    expect(EXPECTED_HUMAN_JWT_OPERATIONS.filter(({ key }) => !mountedOperations.includes(key)).map(({ key }) => key))
      .toEqual(EXPECTED_HUMAN_JWT_OPERATIONS.slice(85).map(({ key }) => key));
  });

  it.each([
    ["a duplicate route", (routers: MountedRouter[]) => {
      routers[0]!.routes.push(structuredClone(routers[0]!.routes[0]!));
    }],
    ["an extra unclassified route", (routers: MountedRouter[]) => {
      routers[0]!.routes.push({
        key: "GET /projects/unclassified",
        authenticationIndices: [0],
        operationMarkers: [{ index: 1, key: "GET /projects/unclassified" }]
      });
    }],
    ["duplicate authentication markers", (routers: MountedRouter[]) => {
      routers[0]!.routes[0]!.authenticationIndices.push(2);
    }],
    ["duplicate operation markers", (routers: MountedRouter[]) => {
      routers[0]!.routes[0]!.operationMarkers.push({
        index: 2,
        key: routers[0]!.routes[0]!.key
      });
    }],
    ["a mismatched operation key", (routers: MountedRouter[]) => {
      routers[0]!.routes[0]!.operationMarkers[0]!.key = "GET /projects/:projectId";
    }],
    ["operation middleware before authentication", (routers: MountedRouter[]) => {
      routers[0]!.routes[0]!.authenticationIndices[0] = 2;
    }]
  ] as const)("rejects %s in the Task 6 mount assertion", (_label, mutate) => {
    const routers = validTaskSixRouterFixture();
    mutate(routers);

    expect(() => assertTaskSixRouteMounts(routers)).toThrow();
  });

  it("has unique keys and exactly 90 routed permissions", () => {
    expect(new Set(HUMAN_JWT_OPERATION_LIST.map(({ key }) => key)).size).toBe(93);
    expect(new Set(HUMAN_JWT_OPERATION_LIST.map(({ permission }) => permission)).size).toBe(90);
    expect(HUMAN_JWT_OPERATION_LIST.every(({ permission }) =>
      (PERMISSION_CODES as readonly string[]).includes(permission)
    )).toBe(true);
  });

  it("keeps public auth, health, and extraction-worker routes outside the human registry", () => {
    const nonHumanKeys = [
      "GET /health",
      "POST /auth/login",
      "POST /auth/client-signup",
      "POST /internal/extraction-jobs/:jobId/complete"
    ];
    for (const key of nonHumanKeys) {
      expect(HUMAN_JWT_OPERATIONS).not.toHaveProperty(key);
    }
  });

  it("classifies project and estimation scopes without wildcard inference", () => {
    for (const operation of HUMAN_JWT_OPERATION_LIST) {
      if (operation.scope.kind === "project") {
        expect(["projects", "design"]).toContain(operation.scope.module);
      }
      if (operation.permission.startsWith("estimation.") && operation.scope.kind === "non_project") {
        expect(["estimation_ownership", "organization"]).toContain(operation.scope.namespace);
        expect(operation.scope).not.toHaveProperty("module");
      }
    }
  });

  it("uses the shared key parser and read-only operation marker", () => {
    const key = "GET /auth/me" as const;
    expect(splitHumanOperationKey(key)).toEqual({ method: "GET", path: "/auth/me" });
    const handler = requireOperation(key);
    expect(isHumanOperationHandler(handler)).toBe(true);
    expect(operationKeyForHandler(handler)).toBe(key);
  });

  it("does not inherit a human-operation marker through a wrapper prototype", () => {
    const markedHandler = requireOperation("GET /auth/me");
    const wrapper: RequestHandler = (_request, _response, next) => next();
    Object.setPrototypeOf(wrapper, markedHandler);

    expect(isHumanOperationHandler(wrapper)).toBe(false);
    expect(operationKeyForHandler(wrapper)).toBeUndefined();
  });

  it("marks authentication separately from human operations", () => {
    const authService = { authenticate: async () => ({}) } as AuthService;
    const handler = authenticate(authService);
    expect(isAuthenticationHandler(handler)).toBe(true);
    expect(isHumanOperationHandler(handler)).toBe(false);
  });

  it("does not inherit an authentication marker through a wrapper prototype", () => {
    const authService = { authenticate: async () => ({}) } as AuthService;
    const markedHandler = authenticate(authService);
    const wrapper: RequestHandler = (_request, _response, next) => next();
    Object.setPrototypeOf(wrapper, markedHandler);

    expect(isAuthenticationHandler(wrapper)).toBe(false);
  });

  it("rejects unregistered operation configuration", () => {
    expect(() => requireOperation("GET /health" as never)).toThrow(
      "Unregistered human operation: GET /health"
    );
  });

  it("propagates registered operation context across await", async () => {
    const app = express();
    const authenticateDesigner: RequestHandler = (req, _res, next) => {
      req.authenticatedUser = {
        id: "designer-1", name: "Designer", email: "designer@example.com", role: "designer"
      };
      next();
    };
    app.get(
      "/context",
      authenticateDesigner,
      requireOperation("GET /auth/me"),
      async (_req, res) => {
        await Promise.resolve();
        res.json({ key: currentHumanOperation().key });
      }
    );
    app.use(errorHandler);
    await request(app).get("/context").expect(200, { key: "GET /auth/me" });
  });
});
