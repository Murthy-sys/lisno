import { describe, expect, it } from "vitest";

import { loadDevelopmentEnvironment } from "../src/config/development-env.js";

describe("development environment configuration", () => {
  it("supplies valid local credentials when they are missing", () => {
    const env = loadDevelopmentEnvironment({});

    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.OCR_WORKER_TOKEN.length).toBeGreaterThanOrEqual(32);
  });

  it("preserves explicitly configured credentials", () => {
    const env = loadDevelopmentEnvironment({
      JWT_SECRET: "explicit-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "explicit-worker-token-with-at-least-32-characters"
    });

    expect(env.JWT_SECRET).toBe(
      "explicit-jwt-secret-with-at-least-32-characters"
    );
    expect(env.OCR_WORKER_TOKEN).toBe(
      "explicit-worker-token-with-at-least-32-characters"
    );
  });
});
