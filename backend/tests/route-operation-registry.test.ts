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
import { EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS } from "./fixtures/prompt-2-route-operations.js";
import { EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS } from "./fixtures/staff-invitation-route-operations.js";
import { EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS } from "./fixtures/estimate-client-response-route-operations.js";
import { EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS } from "./fixtures/project-workflow-route-operations.js";
import { EXPECTED_PROJECT_FINANCE_HUMAN_JWT_OPERATIONS } from "./fixtures/project-finance-route-operations.js";
import { EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS } from "./fixtures/ai-estimator-knowledge-route-operations.js";
import { EXPECTED_SUPER_ADMIN_DASHBOARD_OPERATIONS } from "./fixtures/super-admin-dashboard-route-operations.js";

const EXPECTED_ALL_HUMAN_JWT_OPERATIONS = [
  ...EXPECTED_HUMAN_JWT_OPERATIONS,
  ...EXPECTED_PROJECT_FINANCE_HUMAN_JWT_OPERATIONS,
  ...EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS,
  ...EXPECTED_SUPER_ADMIN_DASHBOARD_OPERATIONS
] as const;
const EXPECTED_STAFF_INVITATION_OPERATIONS =
  EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS.slice(
    EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS.length
  );
const STAFF_INVITATION_PROTECTED_KEYS = EXPECTED_STAFF_INVITATION_OPERATIONS.map(
  ({ key }) => key
);
const STAFF_INVITATION_PUBLIC_KEYS = [
  "POST /auth/user-invitations/inspect",
  "POST /auth/user-invitations/accept"
] as const;
const EXPECTED_ESTIMATE_CLIENT_RESPONSE_OPERATIONS =
  EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS.slice(
    EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS.length
  );
const EXPECTED_PROJECT_WORKFLOW_OPERATIONS =
  EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS.slice(
    EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS.length
  );
const EXPECTED_PROJECT_FINANCE_OPERATIONS =
  EXPECTED_PROJECT_FINANCE_HUMAN_JWT_OPERATIONS.slice(
    EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS.length
  );

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
const ADMIN_USER_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(85, 87)
  .map(({ key }) => key);
const ACCESS_REQUEST_EXPECTED_ROUTES = EXPECTED_HUMAN_JWT_OPERATIONS
  .slice(87, 93)
  .map(({ key }) => key);

function mountedHumanRouters(includeExtractionWorker = false): MountedRouter[] {
  const app = createApp({
    auth: {
      jwtSecret: "route-registry-test-secret-with-enough-entropy",
      jwtExpiresInSeconds: 900
    },
    ...(includeExtractionWorker
      ? { ocrWorkerToken: "route-registry-worker-token" }
      : {})
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

  it("matches all 175 normative operation rows", () => {
    expect(Object.values(HUMAN_JWT_OPERATIONS)).toEqual(EXPECTED_ALL_HUMAN_JWT_OPERATIONS);
    expect(Object.keys(HUMAN_JWT_OPERATIONS)).toHaveLength(175);
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

  it("classifies Access Request rows 88 through 93 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => ACCESS_REQUEST_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...ACCESS_REQUEST_EXPECTED_ROUTES].sort()
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

  it("classifies Admin User rows 86 through 87 with one ordered marker pair", () => {
    const routers = mountedHumanRouters();
    const matches = routers.filter((router) =>
      router.routes.some(({ key }) => ADMIN_USER_EXPECTED_ROUTES.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...ADMIN_USER_EXPECTED_ROUTES].sort()
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

  it("mounts all four Prompt 2 Admin project operations in one authenticated router", () => {
    const expected = EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS.map(({ key }) => key);
    const matches = mountedHumanRouters().filter((router) =>
      router.routes.some(({ key }) => expected.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual([...expected].sort());
    for (const route of matches[0]!.routes) {
      expect(route.authenticationIndices).toHaveLength(1);
      expect(route.operationMarkers).toEqual([{ index: 1, key: route.key }]);
    }
  });

  it("appends exactly four identity-provisioning operations with the approved scope and access metadata", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(97, 101)).toEqual(
      EXPECTED_STAFF_INVITATION_OPERATIONS
    );
    expect(
      HUMAN_JWT_OPERATION_LIST.filter(
        ({ availability }) => availability === "identity_provisioning"
      )
    ).toEqual(EXPECTED_STAFF_INVITATION_OPERATIONS);
  });

  it("composes exactly six estimate-client-response operations after the staff-invitation layer", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(101, 107)).toEqual(
      EXPECTED_ESTIMATE_CLIENT_RESPONSE_OPERATIONS
    );
    expect(
      HUMAN_JWT_OPERATION_LIST.filter(
        ({ availability }) => availability === "estimate_client_response"
      )
    ).toEqual(EXPECTED_ESTIMATE_CLIENT_RESPONSE_OPERATIONS);
    for (const operation of EXPECTED_ESTIMATE_CLIENT_RESPONSE_OPERATIONS) {
      expect(operation.scope).toEqual({
        kind: "non_project",
        namespace: "estimate_client_response"
      });
      expect(operation.availability).toBe("estimate_client_response");
    }
  });

  it("appends exactly seventeen project-workflow operations with explicit scope and access metadata", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(107, 124)).toEqual(
      EXPECTED_PROJECT_WORKFLOW_OPERATIONS
    );
    expect(
      HUMAN_JWT_OPERATION_LIST.filter(
        ({ availability }) => availability === "project_workflow"
      )
    ).toEqual(EXPECTED_PROJECT_WORKFLOW_OPERATIONS);
  });

  it("mounts all seventeen project-workflow operations across authenticated workflow routers", () => {
    const expectedKeys = EXPECTED_PROJECT_WORKFLOW_OPERATIONS.map(({ key }) => key);
    const matches = mountedHumanRouters().filter((router) =>
      router.routes.some(({ key }) => expectedKeys.includes(key as never))
    );
    expect(matches).toHaveLength(2);
    expect(matches.flatMap(({ routes }) => routes.map(({ key }) => key)).sort()).toEqual(
      [...expectedKeys].sort()
    );
    for (const route of matches.flatMap(({ routes }) => routes)) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toEqual([
        { index: 1, key: route.key }
      ]);
    }
  });

  it("appends and mounts five project-finance operations in one authenticated router", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(124, 129)).toEqual(
      EXPECTED_PROJECT_FINANCE_OPERATIONS
    );
    expect(HUMAN_JWT_OPERATION_LIST.filter(
      ({ availability }) => availability === "project_finance"
    )).toEqual(EXPECTED_PROJECT_FINANCE_OPERATIONS);
    const expectedKeys = EXPECTED_PROJECT_FINANCE_OPERATIONS.map(({ key }) => key);
    const matches = mountedHumanRouters().filter((router) =>
      router.routes.some(({ key }) => expectedKeys.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...expectedKeys].sort()
    );
  });

  it("appends exactly 43 AI Estimator Knowledge operations with one closed namespace", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(129, 172)).toEqual(
      EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS
    );
    expect(EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS).toHaveLength(43);
    expect(HUMAN_JWT_OPERATION_LIST.filter(
      ({ availability }) => availability === "ai_estimator_knowledge"
    )).toEqual(EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS);
    for (const operation of EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS) {
      expect(operation.scope).toEqual({
        kind: "non_project",
        namespace: "ai_estimator_knowledge"
      });
      expect(operation.availability).toBe("ai_estimator_knowledge");
    }
  });

  it("appends exactly three Super Admin dashboard reads", () => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(172)).toEqual(
      EXPECTED_SUPER_ADMIN_DASHBOARD_OPERATIONS
    );
  });

  it("mounts four protected invitation operations and two explicit public non-human routes in one router", () => {
    const matches = mountedHumanRouters().filter((router) =>
      router.routes.some(({ key }) => STAFF_INVITATION_PROTECTED_KEYS.includes(key as never))
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.routes.map(({ key }) => key).sort()).toEqual(
      [...STAFF_INVITATION_PROTECTED_KEYS, ...STAFF_INVITATION_PUBLIC_KEYS].sort()
    );
    for (const route of matches[0]!.routes) {
      if (STAFF_INVITATION_PUBLIC_KEYS.includes(route.key as never)) {
        expect(route.authenticationIndices, `${route.key} authentication markers`).toEqual([]);
        expect(route.operationMarkers, `${route.key} operation markers`).toEqual([]);
        continue;
      }
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toEqual([
        { index: 1, key: route.key }
      ]);
    }
  });

  it("mounts the exact 175-operation manifest with one ordered marker pair each", () => {
    const expectedKeys = EXPECTED_ALL_HUMAN_JWT_OPERATIONS.map(
      ({ key }) => key
    ).sort();
    const mountedRoutes = mountedHumanRouters()
      .flatMap(({ routes }) => routes)
      .filter(({ operationMarkers }) => operationMarkers.length > 0);
    const mountedOperations = mountedRoutes.map(({ key }) => key);

    expect([...mountedOperations].sort()).toEqual(expectedKeys);
    expect(expectedKeys).toHaveLength(175);
    expect(new Set(expectedKeys).size).toBe(175);
    expect(mountedOperations).toContain(
      "POST /execution/worker-assignments/override"
    );
    for (const route of mountedRoutes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toHaveLength(1);
      expect(route.operationMarkers, `${route.key} operation markers`).toHaveLength(1);
      expect(route.operationMarkers[0]?.key, `${route.key} operation key`).toBe(route.key);
      expect(route.operationMarkers[0]!.index, `${route.key} middleware order`).toBeGreaterThan(
        route.authenticationIndices[0]!
      );
    }
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

  it("has 175 unique keys and exactly 119 routed permissions", () => {
    expect(new Set(HUMAN_JWT_OPERATION_LIST.map(({ key }) => key)).size).toBe(175);
    expect(new Set(HUMAN_JWT_OPERATION_LIST.map(({ permission }) => permission)).size).toBe(119);
    expect(HUMAN_JWT_OPERATION_LIST.every(({ permission }) =>
      (PERMISSION_CODES as readonly string[]).includes(permission)
    )).toBe(true);
  });

  it("keeps public auth, health, and extraction-worker routes outside the human registry", () => {
    const nonHumanKeys = [
      "GET /health",
      "POST /auth/login",
      "POST /auth/client-signup",
      ...STAFF_INVITATION_PUBLIC_KEYS,
      "POST /internal/extraction-jobs/:jobId/complete"
    ];
    for (const key of nonHumanKeys) {
      expect(HUMAN_JWT_OPERATIONS).not.toHaveProperty(key);
    }

    const mountedRoutes = mountedHumanRouters(true).flatMap(({ routes }) => routes);
    const publicRoutes = mountedRoutes.filter(
      ({ key }) =>
        key === "GET /health" ||
        key === "POST /auth/login" ||
        key === "POST /auth/client-signup" ||
        STAFF_INVITATION_PUBLIC_KEYS.includes(key as never) ||
        key.startsWith("POST /internal/extraction-jobs") ||
        key.startsWith("GET /internal/extraction-jobs")
    );
    expect(publicRoutes.length).toBeGreaterThanOrEqual(8);
    for (const key of STAFF_INVITATION_PUBLIC_KEYS) {
      expect(publicRoutes.filter((route) => route.key === key), `${key} mount count`).toHaveLength(1);
    }
    for (const route of publicRoutes) {
      expect(route.authenticationIndices, `${route.key} authentication markers`).toEqual([]);
      expect(route.operationMarkers, `${route.key} operation markers`).toEqual([]);
    }
  });

  it("classifies project and estimation scopes without wildcard inference", () => {
    for (const operation of HUMAN_JWT_OPERATION_LIST) {
      if (operation.scope.kind === "project") {
        expect(["projects", "design", "finance"]).toContain(operation.scope.module);
      }
      if (operation.permission.startsWith("estimation.") && operation.scope.kind === "non_project") {
        expect(["estimation_ownership", "organization", "estimate_client_response"]).toContain(
          operation.scope.namespace
        );
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

  it("denies non-Super-Admin knowledge mutations before validation", async () => {
    const app = express();
    let validationReached = false;
    app.post(
      "/knowledge-baskets",
      (incoming, _response, next) => {
        incoming.authenticatedUser = {
          id: "user-admin",
          name: "Admin",
          email: "admin@example.test",
          role: "admin"
        };
        next();
      },
      requireOperation("POST /admin/ai-estimator-knowledge/baskets"),
      (_incoming, _response, next) => {
        validationReached = true;
        next(new Error("validation should not run"));
      }
    );
    app.use(errorHandler);

    await request(app)
      .post("/knowledge-baskets")
      .send({ malformed: true })
      .expect(403, {
        error: {
          code: "FORBIDDEN",
          message: "You are not authorized to perform this action."
        }
      });
    expect(validationReached).toBe(false);
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
