import { describe, expect, it } from "vitest";

import { safeReturnPath } from "./routePaths";

describe("safeReturnPath", () => {
  it.each([
    ["client", "/client", "/client"],
    ["client", "/client/projects/project-1", "/client/projects/project-1"],
    [
      "designer",
      "/designer/projects/project-1?tab=tasks#task-2",
      "/designer/projects/project-1?tab=tasks#task-2"
    ]
  ] as const)("keeps a %s return inside its role routes", (role, candidate, expected) => {
    expect(safeReturnPath(role, candidate)).toBe(expected);
  });

  it.each([
    ["client", "/manager"],
    ["designer", "/manager/designers/designer-1"],
    ["designer", "https://evil.example/designer"],
    ["designer", "//evil.example/designer"],
    ["designer", "\\\\evil.example\\designer"],
    ["client", "/client\\projects\\project-1"],
    ["client", "/client/%2e%2e/manager"],
    ["client", "/client/%2e%2e%2fmanager"],
    ["client", "/client/%252e%252e/manager"],
    ["client", "/client/%ZZ"],
    ["client", "?from=/client/projects/project-1"],
    ["client", "#/client/projects/project-1"]
  ] as const)("falls back from an unsafe %s candidate %s", (role, candidate) => {
    expect(safeReturnPath(role, candidate)).toBe(
      role === "client" ? "/client" : "/designer"
    );
  });

  it.each([null, undefined, ""])(
    "never throws for an absent client return path: %s",
    (candidate) => {
      expect(() => safeReturnPath("client", candidate)).not.toThrow();
      expect(safeReturnPath("client", candidate)).toBe("/client");
    }
  );
});
