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

  it("defaults local MongoDB to the documented transaction-capable replica set", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters"
      }).MONGODB_URI
    ).toBe("mongodb://127.0.0.1:27017/lisno?replicaSet=rs0");
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
