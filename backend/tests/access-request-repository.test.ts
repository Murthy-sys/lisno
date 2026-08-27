import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "../src/repositories/memory.js";
import {
  RepositoryConflictError,
  type NewAccessRequest,
  type NewProjectAccessGrant
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const now = "2026-08-17T10:00:00.000Z";
const request = (overrides: Partial<NewAccessRequest> = {}): NewAccessRequest => ({
  id: "request-1",
  requesterId: "user-designer-ananya",
  projectId: "project-aurora-villa",
  module: "design",
  reason: "Need design project access",
  createdAt: now,
  updatedAt: now,
  ...overrides
});
const grant = (
  overrides: Partial<NewProjectAccessGrant> = {}
): NewProjectAccessGrant => ({
  id: "grant-1",
  projectId: "project-aurora-villa",
  userId: "user-designer-ananya",
  module: "design",
  source: "access_request",
  accessRequestId: "request-1",
  grantedById: "user-super-admin",
  grantedAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

describe("access-request memory repository", () => {
  it("atomically finds or creates one pending request", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const [first, second] = await Promise.all([
      repository.findOrCreatePendingAccessRequest(request()),
      repository.findOrCreatePendingAccessRequest(
        request({ id: "request-2", reason: "A retry with another reason" })
      )
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.record.id).toBe(second.record.id);
    await expect(
      repository.findPendingAccessRequest(
        "user-designer-ananya",
        "project-aurora-villa",
        "design"
      )
    ).resolves.toMatchObject({ id: first.record.id, status: "pending", version: 1 });
  });

  it("uses expected versions for request transitions and grant revocation", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const pending = await repository.createAccessRequest(request());
    const approvedGrant = await repository.createProjectAccessGrant(grant());
    const approved = await repository.transitionAccessRequest(pending.id, 1, {
      status: "approved",
      reviewerId: "user-super-admin",
      decisionReason: null,
      decisionFingerprint: "a".repeat(64),
      approvedGrantId: approvedGrant.id,
      reviewedAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:00.000Z"
    });
    expect(approved).toMatchObject({ status: "approved", version: 2 });
    await expect(
      repository.transitionAccessRequest(pending.id, 1, {
        status: "cancelled",
        reviewerId: null,
        decisionReason: null,
        decisionFingerprint: null,
        approvedGrantId: null,
        reviewedAt: null,
        updatedAt: "2026-08-18T11:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const revoked = await repository.revokeProjectAccessGrant(approvedGrant.id, 1, {
      revokedAt: "2026-08-19T10:00:00.000Z",
      revokedById: "user-super-admin",
      revocationReason: "Access no longer required",
      updatedAt: "2026-08-19T10:00:00.000Z"
    });
    expect(revoked).toMatchObject({ active: false, version: 2 });
    await expect(
      repository.revokeProjectAccessGrant(approvedGrant.id, 1, {
        revokedAt: "2026-08-19T11:00:00.000Z",
        revokedById: "user-super-admin",
        revocationReason: "Stale retry",
        updatedAt: "2026-08-19T11:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("pages own requests by filters and newest chronology", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await repository.createAccessRequest(request({ id: "request-old" }));
    await repository.createAccessRequest(
      request({
        id: "request-new",
        module: "finance",
        createdAt: "2026-08-18T10:00:00.000Z",
        updatedAt: "2026-08-18T10:00:00.000Z"
      })
    );
    await repository.createAccessRequest(
      request({ id: "request-other", requesterId: "user-other" })
    );

    await expect(
      repository.pageAccessRequestsForRequester(
        "user-designer-ananya",
        { status: "pending" },
        { limit: 1, offset: 0 }
      )
    ).resolves.toMatchObject({ total: 2, items: [{ id: "request-new" }] });
  });

  it("reviews globally but limits Admin to existing initiated projects", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projectAccessGrants.push({
      id: "grant-admin",
      projectId: "project-aurora-villa",
      userId: "admin-1",
      module: "projects",
      source: "admin_initiator",
      accessRequestId: null,
      grantedById: "super-admin-1",
      active: true,
      grantedAt: now,
      revokedAt: null,
      revokedById: null,
      revocationReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    seed.projectAccessGrants.push({
      ...seed.projectAccessGrants[0]!,
      id: "grant-unresolved",
      projectId: "opaque-missing-project"
    });
    seed.accessRequests.push(
      { ...pendingRecord("visible-request"), projectId: "project-aurora-villa" },
      { ...pendingRecord("unknown-request"), projectId: "opaque-missing-project" }
    );
    const repository = createMemoryRepository(seed);

    await expect(
      repository.pageAccessRequestsForReview(
        { kind: "global" },
        {},
        { limit: 20, offset: 0 }
      )
    ).resolves.toMatchObject({ total: 2 });
    await expect(
      repository.pageAccessRequestsForReview(
        { kind: "admin_initiator", adminId: "admin-1" },
        {},
        { limit: 20, offset: 0 }
      )
    ).resolves.toMatchObject({ total: 1, items: [{ id: "visible-request" }] });
  });

  it("finds active grants and revokes every active grant for a user", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await repository.createProjectAccessGrant(grant());
    await repository.createProjectAccessGrant(
      grant({
        id: "grant-2",
        projectId: "project-celeste-office",
        accessRequestId: "request-2"
      })
    );
    await expect(
      repository.listActiveProjectAccessGrants("user-designer-ananya", "design")
    ).resolves.toHaveLength(2);
    const revoked = await repository.revokeActiveProjectAccessGrantsForUser(
      "user-designer-ananya",
      {
        revokedAt: "2026-08-19T10:00:00.000Z",
        revokedById: "user-super-admin",
        revocationReason: "Account role changed",
        updatedAt: "2026-08-19T10:00:00.000Z"
      }
    );
    expect(revoked).toHaveLength(2);
    await expect(
      repository.listActiveProjectAccessGrants("user-designer-ananya", "design")
    ).resolves.toEqual([]);
  });

  it("rolls back request grant and audit state together", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await expect(
      repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        await transaction.createAccessRequest(request());
        await transaction.createProjectAccessGrant(grant());
        await transaction.appendAuditEvent({
          id: "audit-access",
          actorId: "user-super-admin",
          action: "access_request_approved",
          entityType: "access_request",
          entityId: "request-1",
          occurredAt: now,
          oldValues: {},
          newValues: {},
          reason: null,
          createdAt: now
        });
        throw new Error("simulated decision failure");
      })
    ).rejects.toThrow("simulated decision failure");
    await expect(repository.findAccessRequestById("request-1")).resolves.toBeNull();
    await expect(repository.findProjectAccessGrantById("grant-1")).resolves.toBeNull();
    await expect(repository.listAuditEvents({})).resolves.not.toContainEqual(
      expect.objectContaining({ id: "audit-access" })
    );
  });

  it("does not expose uncommitted transaction state", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let release!: () => void;
    let written!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (written = resolve));
    const transaction = repository.runInTransaction(async (unit) => {
      await unit.createAccessRequest(request());
      written();
      await gate;
      throw new Error("rollback");
    });
    await ready;
    await expect(repository.findAccessRequestById("request-1")).resolves.toBeNull();
    release();
    await expect(transaction).rejects.toThrow("rollback");
  });
});

function pendingRecord(id: string) {
  return {
    id,
    requesterId: "user-designer-ananya",
    projectId: "project-aurora-villa",
    module: "design" as const,
    reason: "Need access",
    status: "pending" as const,
    reviewerId: null,
    decisionReason: null,
    decisionFingerprint: null,
    approvedGrantId: null,
    reviewedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}
