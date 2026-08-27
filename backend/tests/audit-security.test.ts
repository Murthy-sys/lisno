import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ESTIMATE_CLIENT_REVIEW_AUDIT_ACTIONS } from "../src/domain/audit-actions.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";

const nestedSensitiveValues = {
  displayName: "Safe Name",
  tokenGeneration: 4,
  profile: {
    tokenGeneration: 3,
    password_hash: "never persist",
    passwordConfirmation: "never persist",
    preferences: [
      {
        label: "safe",
        tokenGeneration: 2,
        apiToken: "never persist",
        rawToken: "never persist",
        tokenHash: "never persist"
      },
      {
        "client-secret": "never persist",
        smtpPassword: "never persist",
        enabled: true
      }
    ]
  },
  untrustedMetadata: {
    tokenGeneration: "never persist",
    status: "requested"
  },
  reset: [{ "Password Hash": "never persist", status: "requested" }]
};

describe("audit persistence security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves numeric token-generation metadata while recursively scrubbing normalized secrets before repository persistence", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const audit = createAuditService(repository);

    await audit.append({
      actorId: "user-super-admin",
      action: "user.role_changed",
      entityType: "user",
      entityId: "user-designer-ananya",
      occurredAt: "2026-08-17T12:00:00.000Z",
      oldValues: nestedSensitiveValues,
      newValues: nestedSensitiveValues
    });

    const rawPersistedPage = await repository.pageAuditEvents(
      { entityType: "user", entityId: "user-designer-ananya" },
      { limit: 20, offset: 0 }
    );
    expect(rawPersistedPage.items).toHaveLength(1);
    expect(rawPersistedPage.items[0]?.oldValues).toEqual({
      displayName: "Safe Name",
      tokenGeneration: 4,
      profile: {
        tokenGeneration: 3,
        preferences: [
          { label: "safe", tokenGeneration: 2 },
          { enabled: true }
        ]
      },
      untrustedMetadata: { status: "requested" },
      reset: [{ status: "requested" }]
    });
    expect(rawPersistedPage.items[0]?.newValues).toEqual(
      rawPersistedPage.items[0]?.oldValues
    );
  });

  it("scrubs values before direct Mongo transaction persistence", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const audit = createAuditService(repository);
    const session = { id: "audit-security-session" };
    const create = vi.spyOn(AuditEventModel, "create").mockResolvedValueOnce([
      {
        toObject: () => ({
          _id: "audit-security",
          actorId: "user-super-admin",
          action: "user.role_changed",
          entityType: "user",
          entityId: "user-designer-ananya",
          occurredAt: new Date("2026-08-17T12:00:00.000Z"),
          oldValues: {},
          newValues: {},
          reason: null,
          createdAt: new Date("2026-08-17T12:00:00.000Z")
        })
      }
    ] as never);

    await audit.appendInMongoTransaction(
      {
        actorId: "user-super-admin",
        action: "user.role_changed",
        entityType: "user",
        entityId: "user-designer-ananya",
        occurredAt: "2026-08-17T12:00:00.000Z",
        oldValues: nestedSensitiveValues,
        newValues: nestedSensitiveValues
      },
      session as never
    );

    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          oldValues: {
            displayName: "Safe Name",
            tokenGeneration: 4,
            profile: {
              tokenGeneration: 3,
              preferences: [
                { label: "safe", tokenGeneration: 2 },
                { enabled: true }
              ]
            },
            untrustedMetadata: { status: "requested" },
            reset: [{ status: "requested" }]
          },
          newValues: {
            displayName: "Safe Name",
            tokenGeneration: 4,
            profile: {
              tokenGeneration: 3,
              preferences: [
                { label: "safe", tokenGeneration: 2 },
                { enabled: true }
              ]
            },
            untrustedMetadata: { status: "requested" },
            reset: [{ status: "requested" }]
          }
        })
      ],
      { session }
    );
  });

  it("registers exactly the nine estimate client review audit actions", () => {
    expect(ESTIMATE_CLIENT_REVIEW_AUDIT_ACTIONS).toEqual([
      "estimate_client_review_published",
      "estimate_email_delivery_sent",
      "estimate_email_delivery_failed",
      "estimate_email_retry_requested",
      "estimate_client_response_task_assigned",
      "estimate_client_approval_recorded_by_admin",
      "estimate_client_changes_recorded_by_admin",
      "estimate_client_response_recorded_through_portal",
      "estimate_client_proof_stored"
    ]);
  });

  it("rejects estimate review storage, recipient, provider, and byte payloads while preserving safe proof metadata", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const audit = createAuditService(repository);

    await audit.append({
      actorId: "user-super-admin",
      action: "estimate_client_proof_stored",
      entityType: "estimate_client_review",
      entityId: "review-round-1",
      occurredAt: "2026-08-24T12:00:00.000Z",
      newValues: {
        reviewRoundId: "review-round-1",
        storageReference: "proofs/private.pdf",
        pdfStorageReference: "estimates/private.pdf",
        recipientEmail: "client@example.com",
        providerResponse: "550 rejected client@example.com",
        providerMessage: "private provider diagnostic",
        attachmentBytes: Buffer.from("private proof"),
        nested: {
          recipient_email: "client@example.com",
          smtpProviderResponse: "mailbox unavailable",
          bytes: Buffer.from("private pdf")
        },
        sha256: "d".repeat(64),
        byteSize: 2_048,
        mimeType: "application/pdf"
      } as never
    });

    const page = await repository.pageAuditEvents(
      { entityType: "estimate_client_review", entityId: "review-round-1" },
      { limit: 20, offset: 0 }
    );
    expect(page.items[0]?.newValues).toEqual({
      reviewRoundId: "review-round-1",
      nested: {},
      sha256: "d".repeat(64),
      byteSize: 2_048,
      mimeType: "application/pdf"
    });
  });

  it("rejects recipient and provider leaks expressed as natural nested audit paths", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const audit = createAuditService(repository);

    await audit.append({
      actorId: "user-super-admin",
      action: "estimate_email_delivery_failed",
      entityType: "estimate_client_review",
      entityId: "review-round-nested-leak",
      occurredAt: "2026-08-24T12:30:00.000Z",
      newValues: {
        recipient: { email: "client@example.com" },
        provider: {
          response: "550 rejected client@example.com",
          message: "private SMTP diagnostic"
        },
        failureCode: "SMTP_REJECTED"
      }
    });

    const page = await repository.pageAuditEvents(
      {
        entityType: "estimate_client_review",
        entityId: "review-round-nested-leak"
      },
      { limit: 20, offset: 0 }
    );
    expect(page.items[0]?.newValues).toEqual({
      recipient: {},
      provider: {},
      failureCode: "SMTP_REJECTED"
    });
  });
});
