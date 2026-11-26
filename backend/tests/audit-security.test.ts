import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ESTIMATE_CLIENT_REVIEW_AUDIT_ACTIONS } from "../src/domain/audit-actions.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService, sanitizeAuditPage } from "../src/services/audit.service.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { defaultWorkflowTimelines } from "../src/contracts/workflow-timelines.js";
import { createWorkflowTimelinesService } from "../src/services/workflow-timelines.service.js";

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


describe("user location audit privacy", () => {
  it("redacts user language values for a Design Head while preserving stored and Super Admin values", async () => {
    const seed = structuredClone(demoSeedData);
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const superAdmin = seed.users.find(user => user.role === "super_admin")!;
    const designHead = seed.users.find(user => user.role === "design_head")!;
    const oldValues = { languagesKnown: ["english"], preferredLanguage: "tamil", version: 1 };
    const newValues = { languagesKnown: [], preferredLanguage: null, version: 2 };
    await audit.append({ actorId: superAdmin.id, action: "user.languages_updated", entityType: "user", entityId: "language-user", occurredAt: "2026-11-25T10:00:00.000Z", oldValues, newValues });
    expect((await audit.list(designHead, {}, { limit: 20, offset: 0 })).items[0]).toMatchObject({ oldValues: { version: 1 }, newValues: { version: 2 } });
    const head = (await audit.list(designHead, {}, { limit: 20, offset: 0 })).items[0]!;
    expect(head.oldValues).not.toHaveProperty("languagesKnown");
    expect(head.newValues).not.toHaveProperty("preferredLanguage");
    expect((await audit.list(superAdmin, {}, { limit: 20, offset: 0 })).items[0]).toMatchObject({ oldValues, newValues });
    expect((await repository.pageAuditEvents({}, { limit: 20, offset: 0 })).items[0]).toMatchObject({ oldValues, newValues });
  });
  it("keeps stored and Super Admin locations while redacting both values for a Design Head", async () => {
    const seed = structuredClone(demoSeedData);
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const superAdmin = seed.users.find(user => user.role === "super_admin")!;
    const designHead = seed.users.find(user => user.role === "design_head")!;
    const designer = seed.users.find(user => user.role === "designer")!;
    const locationEvent = await audit.append({
      actorId: superAdmin.id, action: "user.location_updated", entityType: "user", entityId: designer.id,
      occurredAt: "2026-11-25T10:00:00.000Z",
      oldValues: { location: "Bengaluru", version: 1 },
      newValues: { location: "Chennai", version: 2 }
    });
    const projectEvent = await audit.append({
      actorId: superAdmin.id, action: "project_created", entityType: "project", entityId: "location-project",
      occurredAt: "2026-11-25T10:01:00.000Z",
      oldValues: { location: "Mysuru" }, newValues: { location: "Pune" }
    });
    const before = await repository.pageAuditEvents({}, { limit: 20, offset: 0 });
    const headPage = await audit.list(designHead, {}, { limit: 20, offset: 0 });
    const redacted = headPage.items.find(event => event.id === locationEvent.id)!;
    expect(redacted.oldValues).toEqual({ version: 1 });
    expect(redacted.newValues).toEqual({ version: 2 });
    expect(headPage.items.find(event => event.id === projectEvent.id)).toMatchObject({ oldValues: { location: "Mysuru" }, newValues: { location: "Pune" } });
    const adminPage = await audit.list(superAdmin, {}, { limit: 20, offset: 0 });
    expect(adminPage.items.find(event => event.id === locationEvent.id)).toMatchObject({ oldValues: { location: "Bengaluru", version: 1 }, newValues: { location: "Chennai", version: 2 } });
    expect(await repository.pageAuditEvents({}, { limit: 20, offset: 0 })).toEqual(before);
  });

  it("applies the same actor-specific redaction to designer activity projections without mutating repository results", async () => {
    const seed = structuredClone(demoSeedData);
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const superAdmin = seed.users.find(user => user.role === "super_admin")!;
    const designHead = seed.users.find(user => user.role === "design_head")!;
    const designer = seed.users.find(user => user.role === "designer")!;
    const event = await audit.append({ actorId: superAdmin.id, action: "user.location_updated", entityType: "user", entityId: designer.id, occurredAt: "2026-11-25T10:00:00.000Z", oldValues: { location: "Bengaluru" }, newValues: { location: "Chennai" } });
    const storedPage = { items: [event], total: 1 };
    const read = vi.spyOn(repository, "pageAuditEvents").mockResolvedValue(storedPage);
    try {
      const headPage = await audit.listForDesigner(designHead, designer.id, { limit: 20, offset: 0 });
      expect(headPage.items[0]).toMatchObject({ oldValues: {}, newValues: {} });
      expect(headPage.items[0]?.oldValues).not.toHaveProperty("location");
      expect(headPage.items[0]?.newValues).not.toHaveProperty("location");
      const adminPage = await audit.listForDesigner(superAdmin, designer.id, { limit: 20, offset: 0 });
      expect(adminPage.items[0]).toMatchObject({ oldValues: { location: "Bengaluru" }, newValues: { location: "Chennai" } });
      expect(storedPage.items[0]).toMatchObject({ oldValues: { location: "Bengaluru" }, newValues: { location: "Chennai" } });
    } finally {
      read.mockRestore();
    }
  });
});

describe("workflow timeline configuration audit privacy", () => {
  it("redacts configuration values for every non-Super-Admin projection while preserving history and pagination", async () => {
    const seed = structuredClone(demoSeedData);
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const event = await audit.append({
      actorId: "user-super-admin", action: "workflow_timelines_updated", entityType: "workflow_timelines", entityId: "organization",
      occurredAt: "2026-11-27T10:00:00.000Z",
      oldValues: { version: 1, bases: defaultWorkflowTimelines().bases },
      newValues: { version: 2, bases: defaultWorkflowTimelines().bases.map(row => ({ ...row, designWorkdays: 37 })) }
    });
    const storedPage = { items: [event], total: 7 };
    const original = structuredClone(storedPage);
    for (const role of [...ROLE_CODES.filter(value => value !== "super_admin"), undefined]) {
      const redacted = sanitizeAuditPage(storedPage, role);
      expect(redacted).toEqual({ items: [{ ...event, oldValues: {}, newValues: {} }], total: 7 });
    }
    expect(sanitizeAuditPage(storedPage, "super_admin")).toEqual(original);
    expect(storedPage).toEqual(original);
    expect((await repository.pageAuditEvents({ entityType: "workflow_timelines" }, { limit: 1, offset: 0 })).items[0]).toEqual(event);
  });

  it("prevents a Design Head from reading saved timeline bases through the global audit list", async () => {
    const seed = structuredClone(demoSeedData);
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const superAdmin = seed.users.find(user => user.role === "super_admin")!;
    const designHead = seed.users.find(user => user.role === "design_head")!;
    const timelines = createWorkflowTimelinesService(repository, audit, () => new Date("2026-11-27T10:00:00.000Z"));
    const defaults = defaultWorkflowTimelines().bases;
    const bases = defaults.map(row => ({ ...row, executionWorkdays: row.executionWorkdays + 7 }));
    await timelines.update(superAdmin, { expectedVersion: 0, bases });
    await expect(timelines.read(designHead)).rejects.toMatchObject({ status: 403 });
    const filters = { entityType: "workflow_timelines" };
    const pagination = { limit: 1, offset: 0 };
    const stored = await repository.pageAuditEvents(filters, pagination);
    const head = await audit.list(designHead, filters, pagination);
    expect(head).toEqual({ ...stored, items: stored.items.map(event => ({ ...event, oldValues: {}, newValues: {} })) });
    expect(head.total).toBe(1);
    const admin = await audit.list(superAdmin, filters, pagination);
    expect(admin.items[0]).toMatchObject({ oldValues: { version: 0, bases: defaults }, newValues: { version: 1, bases } });
    expect(await repository.pageAuditEvents(filters, pagination)).toEqual(stored);
  });
});
