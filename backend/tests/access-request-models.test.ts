import { describe, expect, it } from "vitest";

import { AccessRequestModel } from "../src/models/AccessRequest.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";

const request = (overrides: Record<string, unknown> = {}) =>
  new AccessRequestModel({
    _id: "request-1",
    requesterId: "user-1",
    projectId: "project-aurora_villa:phase.1",
    module: "design",
    reason: "Need design access",
    ...overrides
  });

const grant = (overrides: Record<string, unknown> = {}) =>
  new ProjectAccessGrantModel({
    _id: "grant-1",
    projectId: "project-aurora_villa:phase.1",
    userId: "user-1",
    module: "design",
    source: "direct_assignment",
    accessRequestId: null,
    grantedById: "admin-1",
    grantedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides
  });

describe("access-request persistence models", () => {
  it.each([
    "project-aurora-villa",
    "550e8400-e29b-41d4-a716-446655440000"
  ])("accepts seeded and UUID-derived opaque project IDs: %s", async (projectId) => {
    await expect(request({ projectId }).validate()).resolves.toBeUndefined();
    await expect(grant({ projectId }).validate()).resolves.toBeUndefined();
  });

  it.each(["project id", "project/id", `p${"x".repeat(128)}`])(
    "rejects whitespace slash and overlong project IDs: %s",
    async (projectId) => {
      await expect(request({ projectId }).validate()).rejects.toThrow();
      await expect(grant({ projectId }).validate()).rejects.toThrow();
    }
  );

  it("declares one pending request per requester project and module", () => {
    expect(AccessRequestModel.schema.indexes()).toContainEqual([
      { requesterId: 1, projectId: 1, module: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } }
    ]);
  });

  it("declares one active grant per user project and module", () => {
    expect(ProjectAccessGrantModel.schema.indexes()).toContainEqual([
      { userId: 1, projectId: 1, module: 1 },
      { unique: true, partialFilterExpression: { active: true } }
    ]);
  });

  it("declares one grant per accessRequestId", () => {
    expect(ProjectAccessGrantModel.schema.indexes()).toContainEqual([
      { accessRequestId: 1 },
      {
        unique: true,
        partialFilterExpression: { accessRequestId: { $type: "string" } }
      }
    ]);
  });

  it("requires accessRequestId only for access_request source", async () => {
    await expect(
      grant({ source: "access_request", accessRequestId: null }).validate()
    ).rejects.toThrow(/accessRequestId/i);
    await expect(
      grant({ source: "direct_assignment", accessRequestId: "request-1" }).validate()
    ).rejects.toThrow(/accessRequestId/i);
    await expect(
      grant({ source: "access_request", accessRequestId: "request-1" }).validate()
    ).resolves.toBeUndefined();
  });

  it("requires complete revocation metadata on inactive grants", async () => {
    await expect(grant({ active: false }).validate()).rejects.toThrow(/revocation/i);
    await expect(
      grant({
        active: false,
        revokedAt: new Date("2026-08-18T10:00:00.000Z"),
        revokedById: "admin-2",
        revocationReason: "Assignment ended"
      }).validate()
    ).resolves.toBeUndefined();
    await expect(
      grant({ active: true, revocationReason: "Should be absent" }).validate()
    ).rejects.toThrow(/revocation/i);
  });

  it("stores a stable terminal decision fingerprint", async () => {
    const rejected = {
      status: "rejected",
      reviewerId: "reviewer-1",
      decisionReason: "Out of scope",
      reviewedAt: new Date("2026-08-18T10:00:00.000Z")
    };
    await expect(
      request({ ...rejected, decisionFingerprint: "a".repeat(64) }).validate()
    ).resolves.toBeUndefined();
    await expect(
      request({ ...rejected, decisionFingerprint: "A".repeat(64) }).validate()
    ).rejects.toThrow(/decisionFingerprint/i);
  });

  it("requires the exact approved grant id only for approved requests", async () => {
    const terminal = {
      reviewerId: "reviewer-1",
      decisionFingerprint: "b".repeat(64),
      reviewedAt: new Date("2026-08-18T10:00:00.000Z")
    };
    await expect(
      request({ status: "approved", ...terminal, approvedGrantId: null }).validate()
    ).rejects.toThrow(/approvedGrantId/i);
    await expect(
      request({ status: "rejected", ...terminal, approvedGrantId: "grant-1" }).validate()
    ).rejects.toThrow(/approvedGrantId/i);
    await expect(
      request({ status: "approved", ...terminal, approvedGrantId: "grant-1" }).validate()
    ).resolves.toBeUndefined();
  });

  it("defines the singleton authorization coordination contract", async () => {
    const document = new AuthorizationCoordinationModel({
      _id: "authorization",
      revision: 1,
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    });
    await expect(document.validate()).resolves.toBeUndefined();
    document.set("_id", "another-key");
    await expect(document.validate()).rejects.toThrow();
  });
});
