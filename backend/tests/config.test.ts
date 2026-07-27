import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/env.js";

describe("environment authentication configuration", () => {
  it("fails closed when JWT_SECRET is missing", () => {
    expect(() => loadEnvironment({})).toThrow();
  });

  it("rejects a weak JWT_SECRET", () => {
    expect(() => loadEnvironment({ JWT_SECRET: "development-only-secret" })).toThrow();
  });

  it("accepts an explicitly supplied strong JWT_SECRET", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters"
      }).JWT_SECRET
    ).toBe("runtime-secret-with-at-least-32-characters");
  });

  it("parses local MongoDB origins into a CORS allow-list", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        CORS_ORIGIN: "http://localhost:5173, https://lisno.example"
      }).CORS_ORIGIN
    ).toEqual(["http://localhost:5173", "https://lisno.example"]);
  });

  it("loads a positive configurable upload size in megabytes", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        MAX_UPLOAD_MB: "12.5"
      }).MAX_UPLOAD_MB
    ).toBe(12.5);

    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        MAX_UPLOAD_MB: "0"
      })
    ).toThrow();
  });
});
