import { describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";

describe("estimate design audit persistence", () => {
  it("writes metadata-only events in the caller's Mongo transaction", async () => {
    const audit = createAuditService(createMemoryRepository(demoSeedData));
    const session = { id: "estimate-design-session" };
    const toObject = vi.fn(() => ({
      id: "audit-estimate-design",
      actorId: "user-estimator-sales",
      action: "estimate_design_uploaded",
      entityType: "estimate",
      entityId: "estimate-1",
      occurredAt: "2026-07-30T14:00:00.000Z",
      oldValues: {},
      newValues: { uploadId: "upload-1", sizeBytes: 123 },
      reason: null
    }));
    const create = vi
      .spyOn(AuditEventModel, "create")
      .mockResolvedValueOnce([{ toObject }] as never);

    const event = await audit.appendInMongoTransaction(
      {
        actorId: "user-estimator-sales",
        action: "estimate_design_uploaded",
        entityType: "estimate",
        entityId: "estimate-1",
        occurredAt: "2026-07-30T14:00:00.000Z",
        newValues: { uploadId: "upload-1", sizeBytes: 123 }
      },
      session as never
    );

    expect(create).toHaveBeenCalledWith(
      [expect.objectContaining({
        _id: expect.any(String),
        action: "estimate_design_uploaded",
        newValues: { uploadId: "upload-1", sizeBytes: 123 }
      })],
      { session }
    );
    expect(toObject).toHaveBeenCalledOnce();
    expect(event.action).toBe("estimate_design_uploaded");
  });
});
