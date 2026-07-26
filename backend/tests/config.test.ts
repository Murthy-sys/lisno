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
});
