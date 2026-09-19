import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  ROLE_CODES
} from "../src/contracts/authorization";
import { PROTECTED_OPERATIONS, PUBLIC_API_OPERATIONS } from "../src/contracts/operations";

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function quotedArray(code: string, constant: string): readonly string[] {
  const match = code.match(new RegExp(`export const ${constant} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match?.[1]) throw new Error(`Unable to read ${constant}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]!);
}

describe("mobile contract provenance", () => {
  const frontendAuthorization = source("frontend/src/api/authorization-contract.ts");
  const backendRoles = source("backend/src/domain/roles.ts");
  const backendAuthorization = source("backend/src/domain/authorization.ts");
  const backendOperations = source("backend/src/domain/route-operations.ts");

  it("tracks canonical roles, permissions and policy", () => {
    const canonicalRoles = quotedArray(backendRoles, "ROLE_CODES");
    const canonicalPermissions = quotedArray(backendAuthorization, "PERMISSION_CODES");
    expect(ROLE_CODES).toEqual(canonicalRoles);
    expect(PERMISSION_CODES).toEqual(canonicalPermissions);
    expect(quotedArray(frontendAuthorization, "ROLE_CODES")).toEqual(canonicalRoles);
    expect(quotedArray(frontendAuthorization, "PERMISSION_CODES")).toEqual(canonicalPermissions);
    expect(PERMISSION_CODES).toHaveLength(134);
    expect(AUTHORIZATION_POLICY_VERSION).toBe("2026-09-18.vendor-procurement.v1");
    expect(frontendAuthorization).toContain(`"${AUTHORIZATION_POLICY_VERSION}" as const`);
  });

  it("tracks every protected operation, permission and Super Admin behavior", () => {
    const canonical = [
      ...backendOperations.matchAll(
        /\{ key: "([^"]+)", permission: "([^"]+)"[^\n]+superAdminBehavior: "([^"]+)"/g
      )
    ].map((entry) => ({
      operation: entry[1]!,
      permission: entry[2]!,
      superAdminBehavior: entry[3]!
    }));
    expect(canonical).toHaveLength(221);
    expect(PROTECTED_OPERATIONS).toEqual(canonical);
  });

  it("keeps the reviewed public route manifest explicit", () => {
    expect(new Set(PUBLIC_API_OPERATIONS).size).toBe(PUBLIC_API_OPERATIONS.length);
    expect(PUBLIC_API_OPERATIONS).toEqual(expect.arrayContaining([
      "POST /auth/login",
      "POST /auth/password-reset/request",
      "POST /auth/user-invitations/accept"
    ]));
    expect(PUBLIC_API_OPERATIONS).not.toContain("POST /auth/resend-verification");
    expect(PUBLIC_API_OPERATIONS).not.toContain("GET /auth/sso");
  });
});
