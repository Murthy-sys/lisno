import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";

const nestedSensitiveValues = {
  displayName: "Safe Name",
  profile: {
    password_hash: "never persist",
    preferences: [
      { label: "safe", apiToken: "never persist" },
      { "client-secret": "never persist", enabled: true }
    ]
  },
  reset: [{ "Password Hash": "never persist", status: "requested" }]
};

describe("audit persistence security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrubs recursively normalized sensitive keys before repository persistence", async () => {
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
      profile: {
        preferences: [{ label: "safe" }, { enabled: true }]
      },
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
            profile: {
              preferences: [{ label: "safe" }, { enabled: true }]
            },
            reset: [{ status: "requested" }]
          },
          newValues: {
            displayName: "Safe Name",
            profile: {
              preferences: [{ label: "safe" }, { enabled: true }]
            },
            reset: [{ status: "requested" }]
          }
        })
      ],
      { session }
    );
  });
});
