import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../api/authorization-contract";
import {
  InvalidAuthorizationSnapshotError,
  hasFrontendPermission,
  parseAuthorizationSnapshot
} from "./authorization";

const validSnapshot = {
  role: "designer",
  policyVersion: AUTHORIZATION_POLICY_VERSION,
  permissions: ["projects.read", "identity.self.read"]
};

describe("parseAuthorizationSnapshot", () => {
  it("accepts an exact role and policy version and canonicalizes permissions", () => {
    const result = parseAuthorizationSnapshot(
      {
        ...validSnapshot,
        permissions: [
          "projects.read",
          "identity.self.read",
          "projects.read"
        ]
      },
      "designer"
    );

    expect(result).toEqual({
      role: "designer",
      policyVersion: "2026-08-23.prompt-2",
      permissions: ["identity.self.read", "projects.read"]
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.permissions)).toBe(true);
  });

  it("omits unknown individual permissions so they remain denied", () => {
    const result = parseAuthorizationSnapshot(
      {
        role: "designer",
        policyVersion: AUTHORIZATION_POLICY_VERSION,
        permissions: ["identity.self.read", "unknown.action"]
      },
      "designer"
    );

    expect(result).toEqual({
      role: "designer",
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      permissions: ["identity.self.read"]
    });
    expect(
      hasFrontendPermission(result, "unknown.action" as never)
    ).toBe(false);
  });

  it.each([
    ["role mismatch", { ...validSnapshot, role: "design_manager" }],
    ["unknown role", { ...validSnapshot, role: "unknown_role" }],
    ["stale policy", { ...validSnapshot, policyVersion: "stale" }],
    [
      "missing policy",
      { role: "designer", permissions: ["identity.self.read"] }
    ],
    [
      "missing role",
      {
        policyVersion: AUTHORIZATION_POLICY_VERSION,
        permissions: ["identity.self.read"]
      }
    ],
    [
      "missing permissions",
      { role: "designer", policyVersion: AUTHORIZATION_POLICY_VERSION }
    ],
    ["malformed permissions", { ...validSnapshot, permissions: "projects.read" }],
    ["extra field", { ...validSnapshot, unexpected: true }]
  ])("rejects a %s snapshot", (_label, snapshot) => {
    expect(parseAuthorizationSnapshot(snapshot, "designer")).toBeNull();
  });

  it("rejects an unbounded permission array", () => {
    expect(
      parseAuthorizationSnapshot(
        { ...validSnapshot, permissions: Array(126).fill("unknown.action") },
        "designer"
      )
    ).toBeNull();
  });
});

describe("frontend permission checks", () => {
  it("fails closed for a null snapshot and grants only retained permissions", () => {
    const authorization = parseAuthorizationSnapshot(validSnapshot, "designer");

    expect(hasFrontendPermission(null, "projects.read")).toBe(false);
    expect(hasFrontendPermission(authorization, "projects.read")).toBe(true);
    expect(hasFrontendPermission(authorization, "projects.create")).toBe(false);
  });

  it("uses one stable public error for invalid establishment", () => {
    const error = new InvalidAuthorizationSnapshotError();

    expect(error).toMatchObject({
      name: "InvalidAuthorizationSnapshotError",
      code: "INVALID_AUTHORIZATION_SNAPSHOT",
      message: "The authorization policy could not be established."
    });
  });
});
