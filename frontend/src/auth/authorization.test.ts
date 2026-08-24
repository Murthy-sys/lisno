import { describe, expect, it } from "vitest";

import {
  AUTHORIZATION_POLICY_VERSION,
  ROLE_CODES
} from "../api/authorization-contract";
import { authorizationFor } from "../test/authFixtures";
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

const invitationPermissions = [
  "identity.user_invitations.read",
  "identity.user_invitations.create",
  "identity.user_invitations.resend",
  "identity.user_invitations.revoke"
] as const;

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
      policyVersion: "2026-08-23.staff-invitations.v1",
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

  it("accepts the 129-item permission ceiling and rejects 130 items", () => {
    expect(
      parseAuthorizationSnapshot(
        { ...validSnapshot, permissions: Array(129).fill("unknown.action") },
        "designer"
      )
    ).toEqual({
      role: "designer",
      policyVersion: "2026-08-23.staff-invitations.v1",
      permissions: []
    });
    expect(
      parseAuthorizationSnapshot(
        { ...validSnapshot, permissions: Array(130).fill("unknown.action") },
        "designer"
      )
    ).toBeNull();
  });

  it("retains the four canonical invitation permissions in catalog order", () => {
    expect(
      parseAuthorizationSnapshot(
        {
          role: "super_admin",
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: [...invitationPermissions].reverse()
        },
        "super_admin"
      )
    ).toEqual({
      role: "super_admin",
      policyVersion: "2026-08-23.staff-invitations.v1",
      permissions: invitationPermissions
    });
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

  it("grants invitation permissions only to the Super Admin fixture", () => {
    expect(
      authorizationFor("super_admin").permissions.filter((permission) =>
        permission.startsWith("identity.user_invitations.")
      )
    ).toEqual(invitationPermissions);

    for (const role of ROLE_CODES) {
      if (role === "super_admin") continue;
      expect(
        authorizationFor(role).permissions.some((permission) =>
          permission.startsWith("identity.user_invitations.")
        ),
        role
      ).toBe(false);
    }
  });
});
