import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "../src/repositories/memory.js";
import {
  RepositoryConflictError,
  type UserInvitationRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const ISSUED_AT = "2026-08-24T09:00:00.000Z";
const EXPIRES_AT = "2026-08-25T09:00:00.000Z";
const NOW = "2026-08-24T12:00:00.000Z";
const HASHES = "abcdef0123456789";

function hash(index: number): string {
  return HASHES[index % HASHES.length]!.repeat(64);
}

function pendingInvitation(
  id: string,
  overrides: Partial<UserInvitationRecord> = {}
): UserInvitationRecord {
  return {
    id,
    name: `Invitee ${id}`,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    role: "designer",
    mobile: "+91 90000 00000",
    tokenHash: hash(Number(id.replace(/\D/gu, "")) || id.length),
    tokenGeneration: 1,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    status: "pending",
    invitedById: "user-super-admin",
    tokenIssuedById: "user-super-admin",
    tokenIssuerVersion: 1,
    acceptedUserId: null,
    acceptedAt: null,
    revokedById: null,
    revokedAt: null,
    supersededByInvitationId: null,
    supersededAt: null,
    deliveryStatus: "queued",
    deliveryAttemptedAt: null,
    sentAt: null,
    deliveryFailureCode: null,
    version: 1,
    createdAt: ISSUED_AT,
    updatedAt: ISSUED_AT,
    ...overrides
  };
}

function terminalInvitation(
  id: string,
  status: "accepted" | "revoked" | "superseded",
  overrides: Partial<UserInvitationRecord> = {}
): UserInvitationRecord {
  const terminalAt = "2026-08-24T10:00:00.000Z";
  return pendingInvitation(id, {
    tokenHash: null,
    status,
    ...(status === "accepted"
      ? { acceptedUserId: `accepted-${id}`, acceptedAt: terminalAt }
      : {}),
    ...(status === "revoked"
      ? { revokedById: "user-super-admin", revokedAt: terminalAt }
      : {}),
    ...(status === "superseded"
      ? {
          supersededByInvitationId: `successor-${id}`,
          supersededAt: terminalAt
        }
      : {}),
    version: 2,
    updatedAt: terminalAt,
    ...overrides
  });
}

function repositoryWith(...invitations: UserInvitationRecord[]) {
  const seed = structuredClone(demoSeedData);
  seed.userInvitations = invitations;
  return createMemoryRepository(seed);
}

describe("memory user invitation repository", () => {
  it("normalizes create identity fields and supports full-record locators and history", async () => {
    const repository = repositoryWith(
      terminalInvitation("history-1", "revoked", {
        email: "History@Example.Test",
        emailNormalized: "history@example.test",
        issuedAt: "2026-08-22T09:00:00.000Z",
        expiresAt: "2026-08-23T09:00:00.000Z"
      })
    );
    const created = await repository.createUserInvitation(
      pendingInvitation("history-2", {
        name: "  Asha  Rao  ",
        email: "  History@Example.Test  ",
        emailNormalized: "WRONG@example.test",
        mobile: " +91  90000  00000 ",
        issuedAt: "2026-08-24T09:00:00.000Z",
        expiresAt: "2026-08-25T09:00:00.000Z"
      })
    );

    expect(created).toMatchObject({
      name: "Asha  Rao",
      email: "History@Example.Test",
      emailNormalized: "history@example.test",
      mobile: "+91 90000 00000",
      version: 1
    });
    expect(created).not.toHaveProperty("title");
    await expect(repository.findUserInvitationById(created.id)).resolves.toEqual(created);
    await expect(
      repository.findPendingUserInvitationByEmail(" HISTORY@EXAMPLE.TEST ")
    ).resolves.toEqual(created);
    await expect(
      repository.findPendingUserInvitationByTokenHash(created.tokenHash!)
    ).resolves.toEqual(created);
    await expect(
      repository.findLatestUserInvitationIssuedAtByEmail("History@Example.Test")
    ).resolves.toBe("2026-08-24T09:00:00.000Z");
  });

  it("enforces one pending recipient, unique live digests and accepted users, and exact states", async () => {
    const first = pendingInvitation("unique-1", {
      email: "unique@example.test",
      emailNormalized: "unique@example.test"
    });
    const repository = repositoryWith(first);

    await expect(
      repository.createUserInvitation(
        pendingInvitation("unique-2", {
          email: "UNIQUE@example.test",
          emailNormalized: "unique@example.test"
        })
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      repository.createUserInvitation(
        pendingInvitation("unique-3", {
          tokenHash: first.tokenHash,
          email: "other@example.test",
          emailNormalized: "other@example.test"
        })
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const duplicateAccepted = structuredClone(demoSeedData);
    duplicateAccepted.userInvitations = [
      terminalInvitation("accepted-1", "accepted", {
        acceptedUserId: "accepted-user"
      }),
      terminalInvitation("accepted-2", "accepted", {
        acceptedUserId: "accepted-user"
      })
    ];
    expect(() => createMemoryRepository(duplicateAccepted)).toThrow(
      RepositoryConflictError
    );

    const invalid = structuredClone(demoSeedData);
    invalid.userInvitations = [
      terminalInvitation("invalid-terminal", "revoked", {
        tokenHash: hash(15)
      })
    ];
    expect(() => createMemoryRepository(invalid)).toThrow(
      RepositoryConflictError
    );
  });

  it("supersedes then creates a replacement atomically and rejects stale semantic versions", async () => {
    const current = pendingInvitation("replace-1", {
      email: "replace@example.test",
      emailNormalized: "replace@example.test"
    });
    const repository = repositoryWith(current);
    const successor = pendingInvitation("replace-2", {
      email: "replace@example.test",
      emailNormalized: "replace@example.test",
      tokenHash: hash(10),
      issuedAt: "2026-08-24T11:00:00.000Z",
      expiresAt: "2026-08-25T11:00:00.000Z",
      createdAt: "2026-08-24T11:00:00.000Z",
      updatedAt: "2026-08-24T11:00:00.000Z"
    });

    await repository.runInTransaction(async (transaction) => {
      await transaction.coordinateClientEmail("replace@example.test");
      await transaction.supersedeUserInvitation(current.id, 1, {
        supersededByInvitationId: successor.id,
        supersededAt: successor.createdAt,
        updatedAt: successor.updatedAt
      });
      await transaction.createUserInvitation(successor);
    });

    await expect(repository.findUserInvitationById(current.id)).resolves.toMatchObject({
      status: "superseded",
      tokenHash: null,
      version: 2
    });
    await expect(
      repository.findPendingUserInvitationByEmail("replace@example.test")
    ).resolves.toMatchObject({ id: successor.id, version: 1 });
    await expect(
      repository.supersedeUserInvitation(successor.id, 9, {
        supersededByInvitationId: "replace-3",
        supersededAt: NOW,
        updatedAt: NOW
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("resends the same row with a new digest/generation and resets delivery telemetry", async () => {
    const oldHash = hash(1);
    const repository = repositoryWith(
      pendingInvitation("resend-1", {
        tokenHash: oldHash,
        tokenGeneration: 3,
        deliveryStatus: "failed",
        deliveryAttemptedAt: "2026-08-24T10:00:00.000Z",
        deliveryFailureCode: "MAILBOX_UNAVAILABLE"
      })
    );
    const newHash = hash(2);
    const resent = await repository.resendUserInvitation("resend-1", 1, {
      tokenHash: newHash,
      tokenGeneration: 4,
      issuedAt: "2026-08-24T11:00:00.000Z",
      expiresAt: "2026-08-25T11:00:00.000Z",
      tokenIssuedById: "user-super-admin",
      tokenIssuerVersion: 1,
      updatedAt: "2026-08-24T11:00:00.000Z"
    });

    expect(resent).toMatchObject({
      tokenHash: newHash,
      tokenGeneration: 4,
      deliveryStatus: "queued",
      deliveryAttemptedAt: null,
      sentAt: null,
      deliveryFailureCode: null,
      version: 2
    });
    await expect(repository.findPendingUserInvitationByTokenHash(oldHash)).resolves.toBeNull();
    await expect(repository.findPendingUserInvitationByTokenHash(newHash)).resolves.toEqual(resent);
    await expect(
      repository.resendUserInvitation("resend-1", 1, {
        tokenHash: hash(3),
        tokenGeneration: 5,
        issuedAt: NOW,
        expiresAt: "2026-08-25T12:00:00.000Z",
        tokenIssuedById: "user-super-admin",
        tokenIssuerVersion: 1,
        updatedAt: NOW
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("requires an exact next resend generation and rejects stale delivery for the replaced generation", async () => {
    const repository = repositoryWith(
      pendingInvitation("resend-generation-1", {
        tokenGeneration: 3,
        deliveryStatus: "queued"
      })
    );

    for (const tokenGeneration of [3, 2, 5]) {
      await expect(
        repository.resendUserInvitation("resend-generation-1", 1, {
          tokenHash: hash(tokenGeneration),
          tokenGeneration,
          issuedAt: "2026-08-24T11:00:00.000Z",
          expiresAt: "2026-08-25T11:00:00.000Z",
          tokenIssuedById: "user-super-admin",
          tokenIssuerVersion: 1,
          updatedAt: "2026-08-24T11:00:00.000Z"
        })
      ).rejects.toBeInstanceOf(RepositoryConflictError);
    }

    await expect(
      repository.findUserInvitationById("resend-generation-1")
    ).resolves.toMatchObject({
      tokenGeneration: 3,
      deliveryStatus: "queued",
      version: 1
    });

    await expect(
      repository.resendUserInvitation("resend-generation-1", 1, {
        tokenHash: hash(4),
        tokenGeneration: 4,
        issuedAt: "2026-08-24T11:00:00.000Z",
        expiresAt: "2026-08-25T11:00:00.000Z",
        tokenIssuedById: "user-super-admin",
        tokenIssuerVersion: 1,
        updatedAt: "2026-08-24T11:00:00.000Z"
      })
    ).resolves.toMatchObject({ tokenGeneration: 4, version: 2 });

    const deliveryChange = {
      status: "sent" as const,
      attemptedAt: "2026-08-24T11:01:00.000Z",
      sentAt: "2026-08-24T11:01:01.000Z",
      updatedAt: "2026-08-24T11:01:01.000Z"
    };
    await expect(
      repository.updateUserInvitationDelivery(
        "resend-generation-1",
        3,
        deliveryChange
      )
    ).resolves.toBeNull();
    await expect(
      repository.updateUserInvitationDelivery(
        "resend-generation-1",
        4,
        deliveryChange
      )
    ).resolves.toMatchObject({
      tokenGeneration: 4,
      deliveryStatus: "sent",
      version: 2
    });
  });

  it("requires matching version, generation and digest to accept, then preserves terminality", async () => {
    const digest = hash(4);
    const repository = repositoryWith(
      pendingInvitation("accept-1", { tokenHash: digest, tokenGeneration: 2 }),
      pendingInvitation("revoke-1", { tokenHash: hash(5) })
    );
    const change = {
      acceptedUserId: "new-staff-user",
      acceptedAt: NOW,
      updatedAt: NOW
    };

    await expect(
      repository.acceptUserInvitation("accept-1", 1, 9, digest, change)
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      repository.acceptUserInvitation("accept-1", 1, 2, hash(6), change)
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      repository.acceptUserInvitation("accept-1", 1, 2, digest, change)
    ).resolves.toMatchObject({
      status: "accepted",
      tokenHash: null,
      acceptedUserId: "new-staff-user",
      version: 2
    });
    await expect(
      repository.revokeUserInvitation("accept-1", 2, {
        revokedById: "user-super-admin",
        revokedAt: NOW,
        updatedAt: NOW
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await expect(
      repository.revokeUserInvitation("revoke-1", 1, {
        revokedById: "user-super-admin",
        revokedAt: NOW,
        updatedAt: NOW
      })
    ).resolves.toMatchObject({ status: "revoked", tokenHash: null, version: 2 });
    await expect(
      repository.acceptUserInvitation("revoke-1", 2, 1, hash(5), change)
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("updates only current queued delivery telemetry without changing semantic version", async () => {
    const repository = repositoryWith(pendingInvitation("delivery-1"));
    const sent = await repository.updateUserInvitationDelivery("delivery-1", 1, {
      status: "sent",
      attemptedAt: "2026-08-24T09:01:00.000Z",
      sentAt: "2026-08-24T09:01:01.000Z",
      updatedAt: "2026-08-24T09:01:01.000Z"
    });
    expect(sent).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptedAt: "2026-08-24T09:01:00.000Z",
      sentAt: "2026-08-24T09:01:01.000Z",
      deliveryFailureCode: null,
      version: 1
    });
    await expect(
      repository.updateUserInvitationDelivery("delivery-1", 1, {
        status: "failed",
        attemptedAt: NOW,
        failureCode: "PROVIDER_REJECTED",
        updatedAt: NOW
      })
    ).resolves.toBeNull();
    await expect(
      repository.updateUserInvitationDelivery("delivery-1", 2, {
        status: "failed",
        attemptedAt: NOW,
        failureCode: "PROVIDER_REJECTED",
        updatedAt: NOW
      })
    ).resolves.toBeNull();
  });

  it("derives all Admin presentation filters, ownership reservations, actions and a redacted projection", async () => {
    const seed = structuredClone(demoSeedData);
    seed.users.push({
      ...structuredClone(seed.users.find(({ id }) => id === "user-designer-kabir")!),
      id: "claimed-user",
      email: "claimed@example.test",
      emailNormalized: "claimed@example.test"
    });
    seed.projects.push({
      ...structuredClone(seed.projects[0]!),
      id: "reserved-project",
      clientId: null,
      clientEmail: "reserved@example.test",
      clientEmailNormalized: "reserved@example.test"
    });
    seed.userInvitations = [
      pendingInvitation("page-1", { tokenHash: hash(1) }),
      pendingInvitation("page-2", {
        email: "invalidated@example.test",
        emailNormalized: "invalidated@example.test",
        tokenHash: hash(2),
        tokenIssuerVersion: 99
      }),
      pendingInvitation("page-3", {
        email: "failed@example.test",
        emailNormalized: "failed@example.test",
        tokenHash: hash(3),
        deliveryStatus: "failed",
        deliveryAttemptedAt: "2026-08-24T10:00:00.000Z",
        deliveryFailureCode: "PROVIDER_REJECTED"
      }),
      pendingInvitation("page-4", {
        email: "expired@example.test",
        emailNormalized: "expired@example.test",
        tokenHash: hash(4),
        issuedAt: "2026-08-22T09:00:00.000Z",
        expiresAt: "2026-08-23T09:00:00.000Z"
      }),
      pendingInvitation("page-5", {
        email: "claimed@example.test",
        emailNormalized: "claimed@example.test",
        tokenHash: hash(5)
      }),
      pendingInvitation("page-6", {
        email: "reserved@example.test",
        emailNormalized: "reserved@example.test",
        tokenHash: hash(6)
      }),
      terminalInvitation("page-7", "accepted", { tokenHash: null }),
      terminalInvitation("page-8", "revoked", { tokenHash: null }),
      terminalInvitation("page-9", "superseded", { tokenHash: null })
    ];
    const repository = createMemoryRepository(seed);
    const page = await repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW);

    expect(new Set(page.items.map(({ id }) => id))).toEqual(
      new Set(["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"])
    );
    const normal = page.items.find(({ id }) => id === "page-1")!;
    const invalidated = page.items.find(({ id }) => id === "page-2")!;
    const claimed = page.items.find(({ id }) => id === "page-5")!;
    const reserved = page.items.find(({ id }) => id === "page-6")!;
    expect(normal).toMatchObject({
      tokenValidity: "current",
      presentationStatus: "pending",
      currentLinkAvailable: true,
      availableActions: ["resend", "revoke"]
    });
    expect(invalidated).toMatchObject({
      tokenValidity: "invalidated",
      presentationStatus: "pending",
      currentLinkAvailable: false,
      availableActions: ["resend", "revoke"]
    });
    for (const protectedInvitation of [claimed, reserved]) {
      expect(protectedInvitation).toMatchObject({
        currentLinkAvailable: false,
        availableActions: ["revoke"]
      });
    }
    for (const forbidden of [
      "tokenHash",
      "emailNormalized",
      "acceptedUserId",
      "deliveryFailureCode",
      "passwordHash",
      "accountKind",
      "providerMessageId",
      "claimedByUser",
      "reservedByProject"
    ]) {
      expect(normal).not.toHaveProperty(forbidden);
    }

    const expectedByStatus = {
      pending: ["page-1", "page-2", "page-5", "page-6"],
      delivery_failed: ["page-3"],
      expired: ["page-4"],
      accepted: ["page-7"],
      revoked: ["page-8"],
      superseded: ["page-9"]
    } as const;
    for (const [status, expectedIds] of Object.entries(expectedByStatus)) {
      const filtered = await repository.pageUserInvitations(
        { status: status as keyof typeof expectedByStatus },
        { limit: 20, offset: 0 },
        NOW
      );
      expect(new Set(filtered.items.map(({ id }) => id))).toEqual(new Set(expectedIds));
      if (["accepted", "revoked", "superseded"].includes(status)) {
        expect(filtered.items[0]?.availableActions).toEqual([]);
      }
    }
    await expect(
      repository.pageUserInvitations(
        { search: "FAILED@", role: "designer", deliveryStatus: "failed" },
        { limit: 20, offset: 0 },
        NOW
      )
    ).resolves.toMatchObject({ items: [{ id: "page-3" }], total: 1 });
  });

  it("detects unclaimed Client-project reservations by normalized email", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects.push({
      ...structuredClone(seed.projects[0]!),
      id: "unclaimed-project",
      clientId: null,
      clientEmail: " Reserved@Example.Test ",
      clientEmailNormalized: "reserved@example.test"
    });
    const repository = createMemoryRepository(seed);
    await expect(
      repository.hasUnclaimedClientProjectByEmail(" RESERVED@example.test ")
    ).resolves.toBe(true);
    await expect(
      repository.hasUnclaimedClientProjectByEmail("missing@example.test")
    ).resolves.toBe(false);
  });

  it("rolls back invitation state when a memory transaction fails", async () => {
    const original = pendingInvitation("rollback-1", {
      email: "rollback@example.test",
      emailNormalized: "rollback@example.test"
    });
    const repository = repositoryWith(original);

    await expect(
      repository.runInTransaction(async (transaction) => {
        await transaction.supersedeUserInvitation(original.id, 1, {
          supersededByInvitationId: "rollback-2",
          supersededAt: NOW,
          updatedAt: NOW
        });
        await transaction.createUserInvitation(
          pendingInvitation("rollback-2", {
            email: "rollback@example.test",
            emailNormalized: "rollback@example.test",
            tokenHash: hash(12)
          })
        );
        throw new Error("abort transaction");
      })
    ).rejects.toThrow("abort transaction");

    await expect(repository.findUserInvitationById(original.id)).resolves.toEqual(original);
    await expect(repository.findUserInvitationById("rollback-2")).resolves.toBeNull();
  });
});
