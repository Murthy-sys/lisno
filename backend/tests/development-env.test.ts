import { describe, expect, it } from "vitest";

import {
  isBuiltInDevelopmentJwtSecret,
  loadDevelopmentEnvironment,
  withDevelopmentCredentials
} from "../src/config/development-env.js";
import { loadEnvironment } from "../src/config/env.js";

describe("development environment configuration", () => {
  it("supplies valid local credentials when they are missing", () => {
    const env = loadDevelopmentEnvironment({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.OCR_WORKER_TOKEN.length).toBeGreaterThanOrEqual(32);
  });

  it("defaults NODE_ENV only through the development credential helper", () => {
    const credentials = withDevelopmentCredentials({});
    const ordinaryEnvironment = loadEnvironment({
      JWT_SECRET: "ordinary-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "ordinary-worker-token-with-at-least-32-characters"
    });

    expect(credentials.NODE_ENV).toBe("development");
    expect(ordinaryEnvironment.NODE_ENV).toBeUndefined();
  });

  it("preserves explicitly configured credentials", () => {
    const env = loadDevelopmentEnvironment({
      NODE_ENV: "production",
      JWT_SECRET: "explicit-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "explicit-worker-token-with-at-least-32-characters"
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.JWT_SECRET).toBe(
      "explicit-jwt-secret-with-at-least-32-characters"
    );
    expect(env.OCR_WORKER_TOKEN).toBe(
      "explicit-worker-token-with-at-least-32-characters"
    );
  });

  it("recognizes only the built-in development JWT secret", () => {
    const builtInSecret = withDevelopmentCredentials({}).JWT_SECRET;

    expect(isBuiltInDevelopmentJwtSecret(builtInSecret)).toBe(true);
    expect(
      isBuiltInDevelopmentJwtSecret(
        "explicit-jwt-secret-with-at-least-32-characters"
      )
    ).toBe(false);
    expect(isBuiltInDevelopmentJwtSecret(undefined)).toBe(false);
  });

  it("shares the worker credential input with development child processes", () => {
    expect(
      withDevelopmentCredentials({}).OCR_WORKER_TOKEN?.length
    ).toBeGreaterThanOrEqual(32);
    expect(
      withDevelopmentCredentials({
        OCR_WORKER_TOKEN: "explicit-shared-worker-token-with-32-characters"
      }).OCR_WORKER_TOKEN
    ).toBe("explicit-shared-worker-token-with-32-characters");
  });
});
