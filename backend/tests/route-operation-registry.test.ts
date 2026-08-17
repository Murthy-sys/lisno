import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

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

describe("human JWT operation registry", () => {
  it.each(slices)("%s", (_name, start, end, expected) => {
    expect(HUMAN_JWT_OPERATION_LIST.slice(start, end)).toEqual(expected);
  });

  it("matches all normative operation rows", () => {
    expect(Object.values(HUMAN_JWT_OPERATIONS)).toEqual(EXPECTED_HUMAN_JWT_OPERATIONS);
    expect(Object.keys(HUMAN_JWT_OPERATIONS)).toHaveLength(93);
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
