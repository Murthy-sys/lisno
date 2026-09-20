import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeQualityControlOptionReference } from "../src/contracts/ai-estimator-knowledge.js";
import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeQualityControlOptionModel } from "../src/models/AiEstimatorKnowledgeQualityControlOption.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AiEstimatorKnowledgeActorGuard } from "../src/services/ai-estimator-knowledge-actor.js";
import {
  createAiEstimatorKnowledgeQualityControlOptionService
} from "../src/services/ai-estimator-knowledge-quality-control-option.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-20T04:30:00.000Z");
const ACTOR: PublicUser = {
  id: "quality-option-super-admin",
  name: "Quality Option Administrator",
  email: "quality-option-admin@example.invalid",
  role: "super_admin"
};
const actorGuard: AiEstimatorKnowledgeActorGuard = {
  requireReadActor: vi.fn(async () => ({ id: ACTOR.id, role: "super_admin" as const })),
  requireMutationActor: vi.fn(async () => ({ id: ACTOR.id, role: "super_admin" as const }))
};

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;

beforeAll(async () => {
  replica = await startMongoReplicaSet("ai-estimator-knowledge-quality-control-options");
  await Promise.all([
    AiEstimatorKnowledgeQualityControlOptionModel.syncIndexes(),
    AuditEventModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  sequence = 0;
  await replica.clear();
  vi.clearAllMocks();
});

afterAll(async () => {
  await replica?.stop();
});

describe("Quality Control option append-only catalog", { timeout: 30_000 }, () => {
  it("normalizes, audits, and lists custom values deterministically without seeding built-ins", async () => {
    const service = createService();
    const later = await service.create(ACTOR, { kind: "frequency", name: "  Per   FLOOR  " });
    const earlier = await service.create(ACTOR, { kind: "frequency", name: "After each room" });

    expect(later).toMatchObject({
      id: expect.stringMatching(/^qco_[0-9a-f]{24}$/u),
      kind: "frequency",
      name: "Per FLOOR",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });
    expect((await service.list(ACTOR, "frequency")).items.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: earlier.id, name: "After each room" },
      { id: later.id, name: "Per FLOOR" }
    ]);
    expect((await service.list(ACTOR, "performer")).items).toEqual([]);
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(2);
    expect(await AuditEventModel.find({ action: "ai_estimator_knowledge_quality_control_option_created" }).lean())
      .toEqual(expect.arrayContaining([
        expect.objectContaining(
        {
          actorId: ACTOR.id,
          entityType: "ai_estimator_knowledge_quality_control_option",
          entityId: later.id,
          newValues: {
            kind: "frequency",
            optionId: later.id,
            name: "Per FLOOR",
            normalizedName: "per floor",
            version: 1
          }
        }),
        expect.objectContaining({
          actorId: ACTOR.id,
          entityType: "ai_estimator_knowledge_quality_control_option",
          entityId: earlier.id
        })
      ]));
  });

  it("keeps normalized uniqueness per kind and returns the matching custom option on conflict", async () => {
    const service = createService();
    const performer = await service.create(ACTOR, { kind: "performer", name: "Site Engineer" });
    const frequency = await service.create(ACTOR, { kind: "frequency", name: "site engineer" });
    expect(performer.id).not.toBe(frequency.id);

    await expect(service.create(ACTOR, { kind: "performer", name: "  site   ENGINEER " }))
      .rejects.toMatchObject({
        status: 409,
        code: "QUALITY_CONTROL_OPTION_EXISTS",
        fields: {
          existingOptionId: performer.id,
          existingOptionName: "Site Engineer"
        }
      });
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(2);
    expect(await AuditEventModel.countDocuments()).toBe(2);
  });

  it.each([
    ["frequency", " per  ROOM ", "Per room"],
    ["frequency", "once PER project", "Once per project"],
    ["performer", " site ", "Site"],
    ["performer", "procurement", "Procurement"]
  ] as const)("reserves built-in %s name %s", async (kind, name, existingOptionName) => {
    const service = createService();
    await expect(service.create(ACTOR, { kind, name })).rejects.toMatchObject({
      status: 409,
      code: "QUALITY_CONTROL_OPTION_EXISTS",
      fields: { existingOptionName }
    });
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("uses the unique index to allow exactly one concurrent same-name create", async () => {
    const service = createService();
    const outcomes = await Promise.allSettled([
      service.create(ACTOR, { kind: "frequency", name: "Per elevation" }),
      service.create(ACTOR, { kind: "frequency", name: " per  ELEVATION " })
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const failure = outcomes.find(({ status }) => status === "rejected");
    expect(failure?.status === "rejected" ? failure.reason : null).toMatchObject({
      status: 409,
      code: "QUALITY_CONTROL_OPTION_EXISTS"
    });
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("rolls the option back when its audit append fails", async () => {
    const service = createAiEstimatorKnowledgeQualityControlOptionService({
      audit: {
        appendInMongoTransaction: vi.fn(async () => {
          throw new Error("audit unavailable");
        })
      },
      actorGuard,
      now: () => NOW,
      createId: nextId
    });
    await expect(service.create(ACTOR, { kind: "frequency", name: "Per facade" }))
      .rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("enforces the frozen reference shape and immutable append-only fields at the model boundary", async () => {
    const invalid = new AiEstimatorKnowledgeQualityControlOptionModel({
      _id: "qco_NOT_HEX",
      kind: "frequency",
      name: "Per facade",
      normalizedName: "per facade",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id
    });
    await expect(invalid.validate()).rejects.toThrow();

    const service = createService();
    const created = await service.create(ACTOR, { kind: "performer", name: "Safety lead" });
    const before = await AiEstimatorKnowledgeQualityControlOptionModel.findById(created.id).lean();
    await AiEstimatorKnowledgeQualityControlOptionModel.updateOne(
      { _id: created.id },
      { $set: { name: "Changed", normalizedName: "changed", kind: "frequency", version: 2 } },
      { runValidators: true }
    );
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.findById(created.id).lean()).toEqual(before);
    const indexes = await AiEstimatorKnowledgeQualityControlOptionModel.collection.indexes();
    expect(indexes).toContainEqual(expect.objectContaining({
      key: { kind: 1, normalizedName: 1 },
      unique: true
    }));
  });

  it("rejects an invalid generated ID before any write", async () => {
    const service = createAiEstimatorKnowledgeQualityControlOptionService({
      audit: createAuditService(createMemoryRepository()),
      actorGuard,
      now: () => NOW,
      createId: () => "qco_invalid" as KnowledgeQualityControlOptionReference
    });
    await expect(service.create(ACTOR, { kind: "performer", name: "Supervisor" }))
      .rejects.toThrow("invalid reference");
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("authorizes a direct service create before name validation or duplicate disclosure", async () => {
    const deniedGuard: AiEstimatorKnowledgeActorGuard = {
      requireReadActor: vi.fn(async () => {
        throw new ApiError(403, "FORBIDDEN", "Denied.");
      }),
      requireMutationActor: vi.fn(async () => {
        throw new ApiError(403, "FORBIDDEN", "Denied.");
      })
    };
    const service = createAiEstimatorKnowledgeQualityControlOptionService({
      audit: createAuditService(createMemoryRepository()),
      actorGuard: deniedGuard,
      now: () => NOW,
      createId: nextId
    });
    await expect(service.create({ ...ACTOR, role: "admin" }, {
      kind: "frequency",
      name: "Per room"
    })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await AiEstimatorKnowledgeQualityControlOptionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
});

function createService() {
  return createAiEstimatorKnowledgeQualityControlOptionService({
    audit: createAuditService(createMemoryRepository()),
    actorGuard,
    now: () => NOW,
    createId: nextId
  });
}

function nextId(): KnowledgeQualityControlOptionReference {
  sequence += 1;
  return `qco_${sequence.toString(16).padStart(24, "0")}` as KnowledgeQualityControlOptionReference;
}
