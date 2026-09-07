import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/middleware/errors.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS,
  findCanonicalKnowledgePriorityById
} from "../src/domain/ai-estimator-knowledge-priority.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import { AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS } from "../src/operations/ai-estimator-knowledge-bootstrap.manifest.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../src/models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgePriorityModel } from "../src/models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../src/models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../src/models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import {
  createAiEstimatorKnowledgeReferenceService,
  type AiEstimatorKnowledgeReferenceServiceDependencies
} from "../src/services/ai-estimator-knowledge-reference.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor: PublicUser = {
  id: "user-super-admin",
  name: "Super Admin",
  email: "admin@example.invalid",
  role: "super_admin"
};

const fixedNow = new Date("2026-08-28T10:00:00.000Z");
let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replicaSet = await startMongoReplicaSet("ai-estimator-knowledge-reference-test");
  await Promise.all([
    AiEstimatorKnowledgeBasketModel.init(),
    AiEstimatorKnowledgeDisplayOrderSequenceModel.init(),
    AiEstimatorKnowledgeMainLineModel.init(),
    AiEstimatorKnowledgeModeModel.init(),
    AiEstimatorKnowledgeRevisionModel.init(),
    AiEstimatorKnowledgeSectionModel.init(),
    AiEstimatorKnowledgeSurfaceModel.init(),
    AiEstimatorKnowledgePriceVersionModel.init(),
    AiEstimatorKnowledgePriorityModel.init(),
    AiEstimatorKnowledgeUomModel.init(),
    AiEstimatorKnowledgeVendorModel.init(),
    AiEstimatorKnowledgeTaxRuleModel.init(),
    AiEstimatorKnowledgeTaxVersionModel.init()
  ]);
}, 60_000);

afterEach(async () => {
  await replicaSet.clear();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await replicaSet.stop();
});

function harness(overrides: Partial<AiEstimatorKnowledgeReferenceServiceDependencies> = {}) {
  let nextId = 0;
  const audit = {
    appendInMongoTransaction: vi.fn(async () => ({ id: "audit-id" }) as never)
  };
  const actorGuard = {
    requireReadActor: vi.fn(async () => ({ id: actor.id, role: "super_admin" as const })),
    requireMutationActor: vi.fn(async () => ({ id: actor.id, role: "super_admin" as const }))
  };
  const dependencies: AiEstimatorKnowledgeReferenceServiceDependencies = {
    audit,
    actorGuard,
    now: () => fixedNow,
    createId: () => `id-${++nextId}`,
    ...overrides
  };
  return {
    service: createAiEstimatorKnowledgeReferenceService(dependencies),
    audit,
    actorGuard
  };
}

function expectApiError(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status, code });
}

async function createPriceVersionReferencingTax(input: {
  id: string;
  taxRuleId: string;
  taxVersionId: string;
  effectiveTo: Date | null;
}): Promise<void> {
  await AiEstimatorKnowledgePriceVersionModel.create({
    _id: input.id,
    mainLineId: `line-${input.id}`,
    revisionId: `revision-${input.id}`,
    priceEntryId: `entry-${input.id}`,
    versionNumber: 1,
    vendorId: "vendor-1",
    uomId: "uom-1",
    specificationId: null,
    modeId: null,
    taxRuleId: input.taxRuleId,
    taxVersionId: input.taxVersionId,
    currency: "INR",
    treatment: "exclusive",
    inputAmountPaise: 10_000,
    baseAmountPaise: 10_000,
    taxAmountPaise: 1_800,
    totalAmountPaise: 11_800,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: input.effectiveTo,
    status: "inactive",
    reviewRequired: false,
    version: 1,
    createdById: actor.id,
    updatedById: actor.id
  });
}

describe("AI estimator knowledge reference service", () => {
  it("creates, audits, lists, and deterministically paginates Baskets", async () => {
    const { service, audit, actorGuard } = harness();
    await service.createBasket(actor, { name: "Electrical", displayOrder: 1 });
    await service.createBasket(actor, { name: "POP / Gypsum", displayOrder: 0 });

    const firstPage = await service.listBaskets(actor, {}, { limit: 1, offset: 0 });
    const secondPage = await service.listBaskets(actor, {}, { limit: 1, offset: 1 });
    expect(firstPage).toMatchObject({ total: 2, items: [{ name: "POP / Gypsum", version: 1 }] });
    expect(secondPage).toMatchObject({ total: 2, items: [{ name: "Electrical", version: 1 }] });
    expect(firstPage.items[0]).not.toHaveProperty("dependencyEpoch");
    expect(secondPage.items[0]).not.toHaveProperty("dependencyEpoch");
    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(2);
    expect(actorGuard.requireMutationActor).toHaveBeenCalledTimes(2);
    expect(actorGuard.requireReadActor).toHaveBeenCalledTimes(2);
  });

  it("appends omitted Basket orders while explicit creates and updates only raise the high-water mark", async () => {
    const { service, audit } = harness();
    const first = await service.createBasket(actor, { name: "Electrical" });
    const explicit = await service.createBasket(actor, { name: "POP / Gypsum", displayOrder: 5 });
    const appended = await service.createBasket(actor, { name: "Painting" });

    expect([first.displayOrder, explicit.displayOrder, appended.displayOrder]).toEqual([0, 5, 6]);

    const unchanged = await service.updateBasket(actor, first.id, {
      expectedVersion: 1,
      description: "Electrical works"
    });
    const lowered = await service.updateBasket(actor, explicit.id, {
      expectedVersion: 1,
      displayOrder: 1
    });
    const next = await service.createBasket(actor, { name: "Carpentry" });

    expect(unchanged.displayOrder).toBe(0);
    expect(lowered.displayOrder).toBe(1);
    expect(next.displayOrder).toBe(7);
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_estimator_knowledge_basket_created",
        newValues: expect.objectContaining({ displayOrder: 7 })
      }),
      expect.anything()
    );
  });

  it("deletes an eligible legacy Basket that predates the dependency guard", async () => {
    await AiEstimatorKnowledgeBasketModel.collection.insertOne({
      _id: "legacy-empty-basket",
      name: "Legacy Empty Basket",
      nameNormalized: "legacy empty basket",
      description: null,
      displayOrder: 7,
      status: "inactive",
      version: 2,
      createdById: actor.id,
      updatedById: actor.id,
      archivedAt: null,
      archivedById: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    });
    const { service } = harness();

    await expect(service.permanentlyDeleteBasket(actor, "legacy-empty-basket", {
      expectedVersion: 2,
      confirmationName: "Legacy Empty Basket",
      reason: "Remove pre-guard empty Basket"
    })).resolves.toMatchObject({
      basketId: "legacy-empty-basket",
      deleted: true
    });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: "legacy-empty-basket" }))
      .toBeNull();
  });

  it("maps normalized duplicate races to 409 and frees the identity once deleted", async () => {
    const { service } = harness();
    const created = await service.createBasket(actor, { name: "  ＰＯＰ  / Gypsum " });
    await expect(service.createBasket(actor, { name: "pop / gypsum" })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "DUPLICATE_IDENTITY");
      return true;
    });
    await service.permanentlyDeleteBasket(actor, created.id, {
      expectedVersion: 1,
      confirmationName: created.name,
      reason: "Replaced taxonomy"
    });
    /* Adding the same Basket back is the whole point of deleting it. */
    await expect(service.createBasket(actor, { name: "pop / gypsum" })).resolves.toMatchObject({ status: "active", version: 1 });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "pop / gypsum" })).toBe(1);
  });

  it("uses guarded CAS and never overwrites a stale Basket", async () => {
    const { service } = harness();
    const created = await service.createBasket(actor, { name: "Electrical" });
    const updated = await service.updateBasket(actor, created.id, { expectedVersion: 1, description: "Electrical scope" });
    expect(updated).toMatchObject({ version: 2, description: "Electrical scope" });
    await expect(service.updateBasket(actor, created.id, { expectedVersion: 1, name: "Old writer" })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "VERSION_CONFLICT");
      return true;
    });
    expect((await AiEstimatorKnowledgeBasketModel.findById(created.id).lean())?.name).toBe("Electrical");
  });

  it("rolls back Basket creation when the audit append fails", async () => {
    const audit = { appendInMongoTransaction: vi.fn(async () => { throw new Error("audit unavailable"); }) };
    const { service } = harness({ audit });
    await expect(service.createBasket(actor, { name: "Electrical" })).rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    const recovered = await harness().service.createBasket(actor, { name: "Electrical" });
    expect(recovered.displayOrder).toBe(0);
  });

  it("takes the Basket's Main Lines and everything they own with it", async () => {
    const { service } = harness();
    const basket = await service.createBasket(actor, { name: "Electrical" });
    await AiEstimatorKnowledgeMainLineModel.create({
      _id: "line-1",
      basketId: basket.id,
      name: "Wiring",
      description: null,
      displayOrder: 0,
      status: "draft",
      activeRevisionId: null,
      draftRevisionId: null,
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    });
    await AiEstimatorKnowledgeSectionModel.create({
      _id: "line-1-scope",
      mainLineId: "line-1",
      revisionId: "line-1-revision",
      sectionKey: "scope",
      applicability: "configured",
      payload: { exclusions: [] },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });

    await expect(service.getBasketDeletionImpact(actor, basket.id)).resolves.toMatchObject({
      mainLineCount: 1
    });
    await service.permanentlyDeleteBasket(actor, basket.id, {
      expectedVersion: 1,
      confirmationName: "Electrical",
      reason: "Wrong taxonomy"
    });

    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: basket.id })).toBeNull();
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: "line-1" })).toBeNull();
    /* A section cannot outlive the Main Line that owns it. */
    expect(await AiEstimatorKnowledgeSectionModel.exists({ _id: "line-1-scope" })).toBeNull();
  });

  it("strips references to the deleted Basket out of the configurations that survive", async () => {
    const { service } = harness();
    const [target, survivor] = await Promise.all([
      service.createBasket(actor, { name: "Doomed Basket" }),
      service.createBasket(actor, { name: "Surviving Basket" })
    ]);
    await AiEstimatorKnowledgeSectionModel.create({
      _id: "survivor-scope",
      mainLineId: "survivor-line",
      revisionId: "survivor-revision",
      sectionKey: "scope",
      applicability: "configured",
      payload: {
        exclusions: [
          { id: "points-at-doomed", targetBasketId: target.id, targetMainLineId: null, reason: "Excluded", active: true },
          { id: "points-elsewhere", targetBasketId: survivor.id, targetMainLineId: null, reason: "Kept", active: true }
        ]
      },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });

    await service.permanentlyDeleteBasket(actor, target.id, {
      expectedVersion: 1,
      confirmationName: "Doomed Basket",
      reason: "Merged into another Basket"
    });

    const section = await AiEstimatorKnowledgeSectionModel.findById("survivor-scope").lean() as {
      payload: { exclusions: Array<{ id: string }> };
    };
    /* Only the row that pointed at the deleted Basket is gone. */
    expect(section.payload.exclusions.map(({ id }) => id)).toEqual(["points-elsewhere"]);
  });

  it("preflights and atomically deletes a custom empty Basket", async () => {
    const { service, audit } = harness();
    const basket = await service.createBasket(actor, { name: "Accidental Basket" });

    await expect(service.getBasketDeletionImpact(actor, basket.id)).resolves.toEqual({
      basketId: basket.id,
      basketName: "Accidental Basket",
      version: 1,
      mainLineCount: 0,
      historicalReferenceCount: 0,
      bootstrapOwned: false
    });
    await expect(service.permanentlyDeleteBasket(actor, basket.id, {
      expectedVersion: 1,
      confirmationName: "Accidental Basket",
      reason: "Created by mistake"
    })).resolves.toEqual({
      basketId: basket.id,
      deleted: true,
      deletedAt: fixedNow.toISOString()
    });

    expect(await AiEstimatorKnowledgeBasketModel.findById(basket.id).lean()).toBeNull();
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_estimator_knowledge_basket_permanently_deleted",
        entityType: "ai_estimator_knowledge_basket",
        entityId: basket.id,
        occurredAt: fixedNow.toISOString(),
        oldValues: {
          name: "Accidental Basket",
          status: "active",
          displayOrder: 0,
          version: 1,
          bootstrapOwned: false,
          deletedMainLineIds: [],
          deletedRevisionCount: 0,
          deletedSectionCount: 0,
          deletedPriceVersionCount: 0,
          strippedReferenceCount: 0
        },
        reason: "Created by mistake"
      }),
      expect.anything()
    );
    const next = await service.createBasket(actor, { name: "After Deletion" });
    expect(next.displayOrder).toBe(1);
  });

  it("reports what a deletion carries away and refuses none of it", async () => {
    const { service } = harness();
    const [lineBasket, referencedBasket] = await Promise.all([
      service.createBasket(actor, { name: "Used Basket" }),
      service.createBasket(actor, { name: "Historically Referenced Basket" })
    ]);
    await AiEstimatorKnowledgeBasketModel.create({
      _id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.electricalBasket,
      name: "Electrical",
      nameNormalized: "electrical",
      description: null,
      displayOrder: 10,
      status: "active",
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      archivedAt: null,
      archivedById: null
    });
    await AiEstimatorKnowledgeMainLineModel.create({
      _id: "archived-line-1",
      basketId: lineBasket.id,
      name: "Archived Item",
      description: null,
      displayOrder: 0,
      status: "archived",
      activeRevisionId: null,
      draftRevisionId: null,
      version: 4,
      createdById: actor.id,
      updatedById: actor.id,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: fixedNow,
      archivedById: actor.id
    });
    await AiEstimatorKnowledgeSectionModel.insertMany([
      {
        _id: "historical-superseded-scope",
        mainLineId: "historical-source-line",
        revisionId: "historical-superseded-revision",
        sectionKey: "scope",
        applicability: "configured",
        payload: {
          exclusions: [{
            id: "inactive-historical-exclusion",
            targetBasketId: referencedBasket.id,
            targetMainLineId: null,
            reason: "Retained inactive history",
            active: false
          }]
        },
        version: 2,
        createdById: actor.id,
        updatedById: actor.id
      },
      {
        _id: "historical-superseded-recommendations",
        mainLineId: "historical-source-line",
        revisionId: "historical-superseded-revision",
        sectionKey: "recommendations",
        applicability: "configured",
        payload: {
          /* Named text, so this row no longer blocks the Basket. Scope and
             Advanced below still carry the historical reference. */
          recommendations: [{
            id: "inactive-historical-recommendation",
            name: "Historical recommendation",
            priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high,
            reason: "Retained recommendation history",
            dependency: false,
            active: false
          }]
        },
        version: 2,
        createdById: actor.id,
        updatedById: actor.id
      },
      {
        _id: "historical-superseded-advanced",
        mainLineId: "historical-source-line",
        revisionId: "historical-superseded-revision",
        sectionKey: "advanced",
        applicability: "configured",
        payload: {
          dependencies: [{
            id: "inactive-historical-dependency",
            targetBasketId: referencedBasket.id,
            targetMainLineId: "historical-target-line",
            reason: "Retained dependency history",
            active: false
          }]
        },
        version: 2,
        createdById: actor.id,
        updatedById: actor.id
      }
    ]);

    /*
     * None of these three is refused any more. A seeded Basket, one that still
     * holds a Main Line, and one other configurations point at all delete —
     * the impact only tells the reader what goes with each.
     */
    const cases = [
      {
        id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.electricalBasket,
        name: "Electrical",
        impact: expect.objectContaining({ bootstrapOwned: true })
      },
      {
        id: lineBasket.id,
        name: lineBasket.name,
        impact: expect.objectContaining({ mainLineCount: 1 })
      },
      {
        id: referencedBasket.id,
        name: referencedBasket.name,
        /* Scope and Advanced only; Recommendations no longer bind a Basket. */
        impact: expect.objectContaining({ historicalReferenceCount: 2 })
      }
    ];

    for (const candidate of cases) {
      await expect(service.getBasketDeletionImpact(actor, candidate.id))
        .resolves.toEqual(candidate.impact);
      await expect(service.permanentlyDeleteBasket(actor, candidate.id, {
        expectedVersion: 1,
        confirmationName: candidate.name,
        reason: "Removed by the Super Admin"
      })).resolves.toMatchObject({ deleted: true });
      expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: candidate.id })).toBeNull();
    }

    /* The Main Line inside the deleted Basket went with it. */
    expect(await AiEstimatorKnowledgeMainLineModel.exists({ _id: "archived-line-1" })).toBeNull();
    /* And the historical rows that pointed at the deleted Basket were stripped. */
    const advanced = await AiEstimatorKnowledgeSectionModel
      .findById("historical-superseded-advanced").lean() as { payload: { dependencies: unknown[] } };
    expect(advanced.payload.dependencies).toEqual([]);
  });

  it("leaves the Basket unchanged for unknown identity, stale version, or inexact confirmation", async () => {
    const { service } = harness();
    const basket = await service.createBasket(actor, { name: "Exact Name" });

    await expect(service.getBasketDeletionImpact(actor, "unknown-basket"))
      .rejects.toSatisfy((error) => {
        expectApiError(error, 404, "NOT_FOUND");
        return true;
      });
    await expect(service.permanentlyDeleteBasket(actor, "unknown-basket", {
      expectedVersion: 1,
      confirmationName: "Unknown",
      reason: "Unknown identity"
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 404, "NOT_FOUND");
      return true;
    });
    await expect(service.permanentlyDeleteBasket(actor, basket.id, {
      expectedVersion: 2,
      confirmationName: "Exact Name",
      reason: "Stale writer"
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "VERSION_CONFLICT");
      return true;
    });
    for (const input of [
      { expectedVersion: 1, confirmationName: "Exact Name ", reason: "Mismatch" },
      { expectedVersion: 1, confirmationName: "Exact Name", reason: "   " }
    ]) {
      await expect(service.permanentlyDeleteBasket(actor, basket.id, input))
        .rejects.toSatisfy((error) => {
          expectApiError(error, 400, "VALIDATION_ERROR");
          return true;
        });
    }
    expect(await AiEstimatorKnowledgeBasketModel.findById(basket.id).lean())
      .toMatchObject({ name: "Exact Name", version: 1 });
  });

  it("rolls back permanent deletion when the audit append fails", async () => {
    const basket = await harness().service.createBasket(actor, { name: "Audit Protected" });
    const audit = {
      appendInMongoTransaction: vi.fn(async () => {
        throw new Error("audit unavailable");
      })
    };
    const { service } = harness({ audit });

    await expect(service.permanentlyDeleteBasket(actor, basket.id, {
      expectedVersion: 1,
      confirmationName: "Audit Protected",
      reason: "Deletion must be atomic"
    })).rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeBasketModel.findById(basket.id).lean())
      .toMatchObject({ name: "Audit Protected", version: 1 });
  });

  it("creates, updates, filters, and archives reusable masters without label joins", async () => {
    const { service } = harness();
    const uom = await service.createMaster(actor, "uoms", {
      code: "SFT",
      name: "Square feet",
      decimalScale: 2,
      displayOrder: 1
    });
    await service.createMaster(actor, "uoms", {
      code: "NOS",
      name: "Numbers",
      decimalScale: 0,
      displayOrder: 0
    });
    expect(await service.listMasters(actor, "uoms", { search: "square" }, { limit: 10, offset: 0 })).toMatchObject({
      total: 1,
      items: [{ id: uom.id, code: "SFT", decimalScale: 2 }]
    });
    const updated = await service.updateMaster(actor, "uoms", uom.id, { expectedVersion: 1, status: "inactive", decimalScale: 3 });
    expect(updated).toMatchObject({ status: "inactive", decimalScale: 3, version: 2 });
    const archived = await service.archiveMaster(actor, "uoms", uom.id, { expectedVersion: 2 });
    expect(archived).toMatchObject({ status: "archived", version: 3 });
    expect((await service.listMasters(actor, "uoms", {}, { limit: 10, offset: 0 })).items.map(({ code }) => code)).toEqual(["NOS"]);
  });

  it("creates Surface guidance with generated or explicit technical codes and legacy-safe DTOs", async () => {
    const { service, audit } = harness();

    const created = await service.createMaster(actor, "surfaces", {
      name: "Counter surface",
      description: "Granite, quartz, marble"
    });
    expect(created).toMatchObject({
      masterType: "surfaces",
      name: "Counter surface",
      description: "Granite, quartz, marble",
      status: "active",
      version: 1
    });
    expect(created.code).toMatch(/^surface-[a-f0-9]{48}$/u);
    expect(created).not.toHaveProperty("dependencyEpoch");
    expect(created).not.toHaveProperty("typicalUomIds");
    expect(audit.appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_estimator_knowledge_master_created",
        entityType: "ai_estimator_knowledge_surface",
        newValues: expect.objectContaining({
          masterType: "surfaces",
          name: "Counter surface",
          description: "Granite, quartz, marble",
          status: "active",
          version: 1
        })
      }),
      expect.anything()
    );

    await expect(service.createMaster(actor, "surfaces", {
      code: "WALL",
      name: "Wall surface"
    })).resolves.toMatchObject({ code: "WALL" });

    await AiEstimatorKnowledgeSurfaceModel.collection.insertOne({
      _id: "knowledge-surface-legacy",
      code: "LEGACY",
      codeNormalized: "legacy",
      name: "Legacy surface",
      nameNormalized: "legacy surface",
      description: null,
      displayOrder: 99,
      status: "active",
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      archivedAt: null,
      archivedById: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    });
    const listed = await service.listMasters(
      actor,
      "surfaces",
      { includeArchived: true },
      { limit: 20, offset: 0 }
    );
    expect(listed.items.find(({ id }) => id === "knowledge-surface-legacy"))
      .toMatchObject({ name: "Legacy surface" });
  });

  it("rolls back Surface creation and display allocation when audit persistence fails", async () => {
    const audit = {
      appendInMongoTransaction: vi.fn(async () => {
        throw new Error("audit unavailable");
      })
    };
    const { service } = harness({ audit });

    await expect(service.createMaster(actor, "surfaces", {
      name: "Rolled back surface"
    })).rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeSurfaceModel.countDocuments()).toBe(0);
  });

  it("rolls back Surface edits and archival when audit persistence fails", async () => {
    const setup = harness();
    const surface = await setup.service.createMaster(actor, "surfaces", {
      name: "Audit rollback Surface"
    });
    const audit = {
      appendInMongoTransaction: vi.fn(async () => {
        throw new Error("audit unavailable");
      })
    };
    const { service } = harness({ audit });

    await expect(service.updateMaster(actor, "surfaces", surface.id, {
      expectedVersion: surface.version,
      description: "Rolled back description"
    })).rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeSurfaceModel.findById(surface.id).lean())
      .toMatchObject({
        status: "active",
        description: null,
        version: surface.version
      });

    await expect(service.archiveMaster(actor, "surfaces", surface.id, {
      expectedVersion: surface.version,
      reason: "Exercise archive rollback"
    })).rejects.toThrow("audit unavailable");
    expect(await AiEstimatorKnowledgeSurfaceModel.findById(surface.id).lean())
      .toMatchObject({ status: "active", version: surface.version });
  });

  it("projects canonical Priority semantics without exposing epochs and protects system identity", async () => {
    const high = findCanonicalKnowledgePriorityById(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high
    )!;
    await AiEstimatorKnowledgePriorityModel.create({
      _id: high.id,
      code: high.code,
      codeNormalized: high.code.toLowerCase(),
      name: high.name,
      nameNormalized: high.name.toLowerCase(),
      description: null,
      displayOrder: high.displayOrder,
      status: "active",
      semanticTier: high.semanticTier,
      dependencyEpoch: 7,
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      createdAt: fixedNow,
      updatedAt: fixedNow
    });
    const { service, audit } = harness();
    const custom = await service.createMaster(actor, "priorities", {
      code: "CUSTOM",
      name: "Custom Priority",
      displayOrder: 10
    });

    const listed = await service.listMasters(
      actor,
      "priorities",
      { includeArchived: true },
      { limit: 20, offset: 0 }
    );
    const canonicalDto = listed.items.find((item) => item.id === high.id);
    const customDto = listed.items.find((item) => item.id === custom.id);
    expect(canonicalDto).toMatchObject({
      id: high.id,
      semanticTier: "high",
      code: "HIGH",
      name: "High",
      displayOrder: 1,
      status: "active"
    });
    expect(canonicalDto).not.toHaveProperty("dependencyEpoch");
    expect(customDto).not.toHaveProperty("semanticTier");
    expect(customDto).not.toHaveProperty("dependencyEpoch");

    const described = await service.updateMaster(actor, "priorities", high.id, {
      expectedVersion: 1,
      description: "Estimator classification"
    });
    expect(described).toMatchObject({
      semanticTier: "high",
      description: "Estimator classification",
      version: 2
    });

    for (const mutation of [
      { name: "Urgent" },
      { code: "URGENT" },
      { displayOrder: 20 },
      { status: "inactive" as const }
    ]) {
      await expect(service.updateMaster(actor, "priorities", high.id, {
        expectedVersion: 2,
        ...mutation
      })).rejects.toSatisfy((error) => {
        expectApiError(error, 409, "CANONICAL_PRIORITY_IMMUTABLE");
        return true;
      });
    }
    await expect(service.archiveMaster(actor, "priorities", high.id, {
      expectedVersion: 2,
      reason: "Must remain available"
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "CANONICAL_PRIORITY_IMMUTABLE");
      return true;
    });
    expect(await AiEstimatorKnowledgePriorityModel.findById(high.id).lean())
      .toMatchObject({
        name: "High",
        code: "HIGH",
        displayOrder: 1,
        status: "active",
        dependencyEpoch: 7,
        version: 2
      });
    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(2);

    await expect(service.archiveMaster(actor, "priorities", custom.id, {
      expectedVersion: custom.version
    })).resolves.toMatchObject({
      id: custom.id,
      status: "archived",
      version: 2
    });
  });

  it("appends reusable values independently per type and preserves a non-lowering high-water mark", async () => {
    const { service } = harness();
    const firstUom = await service.createMaster(actor, "uoms", {
      code: "SFT",
      name: "Square feet",
      decimalScale: 2
    });
    const secondUom = await service.createMaster(actor, "uoms", {
      code: "NOS",
      name: "Numbers",
      decimalScale: 0
    });
    const explicitVendor = await service.createMaster(actor, "vendors", {
      code: "V1",
      name: "Vendor one",
      displayOrder: 5
    });
    const firstPriority = await service.createMaster(actor, "priorities", {
      code: "STANDARD",
      name: "Standard"
    });

    expect([firstUom.displayOrder, secondUom.displayOrder]).toEqual([0, 1]);
    expect(explicitVendor.displayOrder).toBe(5);
    expect(firstPriority.displayOrder).toBe(0);

    const unchangedUom = await service.updateMaster(actor, "uoms", firstUom.id, {
      expectedVersion: 1,
      description: "Area unit"
    });
    const loweredVendor = await service.updateMaster(actor, "vendors", explicitVendor.id, {
      expectedVersion: 1,
      displayOrder: 1
    });
    const appendedVendor = await service.createMaster(actor, "vendors", {
      code: "V2",
      name: "Vendor two"
    });

    expect(unchangedUom.displayOrder).toBe(0);
    expect(loweredVendor.displayOrder).toBe(1);
    expect(appendedVendor.displayOrder).toBe(6);
  });

  it("never changes a UOM scale after any historical Section or Price reference", async () => {
    const { service, audit } = harness();
    const sectionUom = await service.createMaster(actor, "uoms", {
      code: "SFT",
      name: "Square feet",
      decimalScale: 2
    });
    const priceUom = await service.createMaster(actor, "uoms", {
      code: "NOS",
      name: "Numbers",
      decimalScale: 0
    });
    await AiEstimatorKnowledgeSectionModel.create({
      _id: "historical-section-1",
      mainLineId: "historical-line-1",
      revisionId: "historical-revision-1",
      sectionKey: "overview",
      applicability: "configured",
      payload: { uomId: sectionUom.id },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });
    await AiEstimatorKnowledgePriceVersionModel.create({
      _id: "historical-price-1",
      mainLineId: "historical-line-2",
      revisionId: "historical-revision-2",
      priceEntryId: "historical-price-entry-1",
      versionNumber: 1,
      vendorId: "historical-vendor-1",
      uomId: priceUom.id,
      specificationId: null,
      modeId: null,
      taxRuleId: "historical-tax-1",
      taxVersionId: "historical-tax-version-1",
      currency: "INR",
      treatment: "exclusive",
      inputAmountPaise: 10_000,
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800,
      effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-01T00:00:00.000Z"),
      status: "inactive",
      reviewRequired: false,
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });

    for (const [uom, decimalScale] of [[sectionUom, 3], [priceUom, 1]] as const) {
      await expect(service.updateMaster(actor, "uoms", uom.id, {
        expectedVersion: 1,
        decimalScale
      })).rejects.toSatisfy((error) => {
        expectApiError(error, 409, "REFERENCED_UOM_SCALE_IMMUTABLE");
        return true;
      });
    }
    expect((await AiEstimatorKnowledgeUomModel.findById(sectionUom.id).lean())?.decimalScale).toBe(2);
    expect((await AiEstimatorKnowledgeUomModel.findById(priceUom.id).lean())?.decimalScale).toBe(0);
    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(2);

    const inactivated = await service.updateMaster(actor, "uoms", sectionUom.id, {
      expectedVersion: 1,
      status: "inactive"
    });
    expect(inactivated).toMatchObject({ status: "inactive", decimalScale: 2, version: 2 });
    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(3);
  });

  it("protects a UOM referenced by a priced slab while allowing label-only edits", async () => {
    const { service } = harness();
    const basket = await service.createBasket(actor, { name: "Priced slab basket" });
    const uom = await service.createMaster(actor, "uoms", {
      code: "SFT",
      name: "Square feet",
      decimalScale: 2
    });
    await AiEstimatorKnowledgeMainLineModel.create({
      _id: "line-priced-slab",
      basketId: basket.id,
      name: "Priced slab line",
      nameNormalized: "priced slab line",
      description: null,
      displayOrder: 0,
      status: "draft",
      activeRevisionId: null,
      draftRevisionId: "revision-priced-slab",
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    });
    await AiEstimatorKnowledgeRevisionModel.create({
      _id: "revision-priced-slab",
      mainLineId: "line-priced-slab",
      revisionNumber: 1,
      status: "draft",
      sourceRevisionId: null,
      contentDigest: null,
      completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      activatedAt: null,
      activatedById: null,
      supersededAt: null,
      supersededById: null
    });
    await AiEstimatorKnowledgeSectionModel.insertMany([
      {
        _id: "section-priced-slab-pricing",
        mainLineId: "line-priced-slab",
        revisionId: "revision-priced-slab",
        sectionKey: "pricing",
        applicability: "configured",
        payload: {
          specifications: [{ id: "specification-plywood", name: "Plywood" }],
          priceEntries: []
        },
        version: 1,
        createdById: actor.id,
        updatedById: actor.id
      },
      {
        _id: "section-priced-slab-quantity",
        mainLineId: "line-priced-slab",
        revisionId: "revision-priced-slab",
        sectionKey: "quantity-margin",
        applicability: "configured",
        payload: {
          slabRates: [{
            id: "slab-rate-plywood",
            specificationId: "specification-plywood",
            uomId: uom.id,
            quantity: "12.5",
            unitRatePaise: 8_000
          }]
        },
        version: 1,
        createdById: actor.id,
        updatedById: actor.id
      }
    ]);

    const renamed = await service.updateMaster(actor, "uoms", uom.id, {
      expectedVersion: uom.version,
      name: "Square foot"
    });
    expect(renamed).toMatchObject({ name: "Square foot", decimalScale: 2, version: 2 });
    await expect(service.updateMaster(actor, "uoms", uom.id, {
      expectedVersion: renamed.version,
      decimalScale: 3
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "REFERENCED_UOM_SCALE_IMMUTABLE");
      return true;
    });
    await expect(service.archiveMaster(actor, "uoms", uom.id, {
      expectedVersion: renamed.version
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "ACTIVE_REFERENCE_CONFLICT");
      return true;
    });
    expect(await AiEstimatorKnowledgeUomModel.findById(uom.id).lean())
      .toMatchObject({ name: "Square foot", decimalScale: 2, status: "active", version: 2 });
  });

  it("rejects cross-type fields at the service boundary", async () => {
    const { service } = harness();
    await expect(service.createMaster(actor, "vendors", { code: "V1", name: "Vendor one", decimalScale: 2 })).rejects.toSatisfy((error) => {
      expectApiError(error, 400, "VALIDATION_ERROR");
      return true;
    });
    await expect(service.createMaster(actor, "uoms", { code: "SFT", name: "Square feet" })).rejects.toSatisfy((error) => {
      expectApiError(error, 400, "VALIDATION_ERROR");
      return true;
    });
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
  });

  it("protects masters referenced by current Draft or Active sections", async () => {
    const { service } = harness();
    const basket = await service.createBasket(actor, { name: "POP / Gypsum" });
    const uom = await service.createMaster(actor, "uoms", { code: "SFT", name: "Square feet", decimalScale: 2 });
    await AiEstimatorKnowledgeMainLineModel.create({
      _id: "line-1", basketId: basket.id, name: "Plain False Ceiling", description: null, displayOrder: 0,
      status: "draft", activeRevisionId: null, draftRevisionId: "revision-1", version: 1,
      createdById: actor.id, updatedById: actor.id, deactivatedAt: null, deactivatedById: null, archivedAt: null, archivedById: null
    });
    await AiEstimatorKnowledgeRevisionModel.create({
      _id: "revision-1", mainLineId: "line-1", revisionNumber: 1, status: "draft", sourceRevisionId: null,
      contentDigest: null, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, version: 1,
      createdById: actor.id, updatedById: actor.id, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null
    });
    await AiEstimatorKnowledgeSectionModel.create({
      _id: "section-1", mainLineId: "line-1", revisionId: "revision-1", sectionKey: "overview",
      applicability: "configured", payload: { uomId: uom.id }, version: 1, createdById: actor.id, updatedById: actor.id
    });
    await expect(service.archiveMaster(actor, "uoms", uom.id, { expectedVersion: 1 })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "ACTIVE_REFERENCE_CONFLICT");
      return true;
    });
  });

  it("atomically blocks archiving Modes referenced only by Draft or Active dynamic configurations", async () => {
    const { service, audit } = harness();
    const basket = await service.createBasket(actor, { name: "Dynamic Mode Basket" });
    const draftMode = await service.createMaster(actor, "modes", {
      code: "PMC",
      name: "PMC"
    });
    const activeMode = await service.createMaster(actor, "modes", {
      code: "EXECUTION",
      name: "Execution"
    });
    expect(draftMode).not.toHaveProperty("dependencyEpoch");
    expect(activeMode).not.toHaveProperty("dependencyEpoch");
    const references = [
      {
        suffix: "draft",
        mode: draftMode,
        revisionStatus: "draft" as const,
        mainLineStatus: "draft" as const,
        activeRevisionId: null,
        draftRevisionId: "revision-dynamic-draft"
      },
      {
        suffix: "active",
        mode: activeMode,
        revisionStatus: "active" as const,
        mainLineStatus: "active" as const,
        activeRevisionId: "revision-dynamic-active",
        draftRevisionId: null
      }
    ];

    await AiEstimatorKnowledgeMainLineModel.insertMany(references.map((reference, index) => ({
      _id: `line-dynamic-${reference.suffix}`,
      basketId: basket.id,
      name: `Dynamic ${reference.suffix} line`,
      description: null,
      displayOrder: index,
      status: reference.mainLineStatus,
      activeRevisionId: reference.activeRevisionId,
      draftRevisionId: reference.draftRevisionId,
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    })));
    await AiEstimatorKnowledgeRevisionModel.insertMany(references.map((reference, index) => ({
      _id: `revision-dynamic-${reference.suffix}`,
      mainLineId: `line-dynamic-${reference.suffix}`,
      revisionNumber: index + 1,
      status: reference.revisionStatus,
      sourceRevisionId: null,
      contentDigest: reference.revisionStatus === "active" ? "a".repeat(64) : null,
      completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      activatedAt: reference.revisionStatus === "active" ? fixedNow : null,
      activatedById: reference.revisionStatus === "active" ? actor.id : null,
      supersededAt: null,
      supersededById: null
    })));
    await AiEstimatorKnowledgeSectionModel.insertMany(references.map((reference) => ({
      _id: `section-dynamic-${reference.suffix}`,
      mainLineId: `line-dynamic-${reference.suffix}`,
      revisionId: `revision-dynamic-${reference.suffix}`,
      sectionKey: "advanced",
      applicability: "configured",
      payload: {
        modeConfigurations: [{
          id: `configuration-${reference.suffix}`,
          modeId: reference.mode.id,
          fields: [{
            id: `field-${reference.suffix}`,
            type: "text",
            label: `${reference.suffix} marker`,
            options: [],
            value: reference.suffix
          }]
        }]
      },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    })));
    audit.appendInMongoTransaction.mockClear();

    for (const reference of references) {
      await expect(service.archiveMaster(actor, "modes", reference.mode.id, {
        expectedVersion: 1,
        reason: `Must retain ${reference.suffix} reference`
      })).rejects.toSatisfy((error) => {
        expectApiError(error, 409, "ACTIVE_REFERENCE_CONFLICT");
        return true;
      });
      expect(await AiEstimatorKnowledgeModeModel.findById(reference.mode.id).lean())
        .toMatchObject({
          status: "active",
          version: 1,
          dependencyEpoch: 0,
          archivedAt: null,
          archivedById: null
        });
    }
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("does not treat canonical modeKind configurations as reusable Mode references", async () => {
    const { service } = harness();
    const basket = await service.createBasket(actor, { name: "Canonical Mode Basket" });
    const reusableMode = await service.createMaster(actor, "modes", {
      code: "PMC",
      name: "Legacy PMC master"
    });
    await AiEstimatorKnowledgeMainLineModel.create({
      _id: "line-canonical-mode-kind",
      basketId: basket.id,
      name: "Canonical Mode line",
      description: null,
      displayOrder: 0,
      status: "draft",
      activeRevisionId: null,
      draftRevisionId: "revision-canonical-mode-kind",
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    });
    await AiEstimatorKnowledgeRevisionModel.create({
      _id: "revision-canonical-mode-kind",
      mainLineId: "line-canonical-mode-kind",
      revisionNumber: 1,
      status: "draft",
      sourceRevisionId: null,
      contentDigest: null,
      completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id,
      activatedAt: null,
      activatedById: null,
      supersededAt: null,
      supersededById: null
    });
    await AiEstimatorKnowledgeSectionModel.create({
      _id: "section-canonical-mode-kind",
      mainLineId: "line-canonical-mode-kind",
      revisionId: "revision-canonical-mode-kind",
      sectionKey: "advanced",
      applicability: "configured",
      payload: {
        modeConfigurations: [{
          id: "configuration-canonical-pmc",
          modeKind: "pmc",
          fields: [{
            id: "field-canonical-pmc",
            type: "text",
            label: "PMC marker",
            options: [],
            value: "A1"
          }]
        }]
      },
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });

    await expect(service.archiveMaster(actor, "modes", reusableMode.id, {
      expectedVersion: reusableMode.version,
      reason: "Canonical configurations do not retain reusable Mode masters"
    })).resolves.toMatchObject({
      id: reusableMode.id,
      status: "archived",
      version: reusableMode.version + 1
    });
  });

  it("appends immutable effective Tax versions and rejects active overlap atomically", async () => {
    const { service, audit } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2027-01-01T00:00:00.000Z",
        status: "active"
      }
    });
    expect(tax.taxVersions).toEqual([
      expect.objectContaining({
        id: "knowledge-tax-version-id-2",
        taxRuleId: tax.id,
        versionNumber: 1,
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2027-01-01T00:00:00.000Z",
        status: "active",
        version: 1
      })
    ]);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: tax.id })).toBe(1);
    await expect(service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 1_800,
        treatment: "inclusive",
        applicability: "interior works",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "EFFECTIVE_WINDOW_OVERLAP");
      return true;
    });
    expect((await AiEstimatorKnowledgeTaxRuleModel.findById(tax.id).lean())?.version).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: tax.id })).toBe(1);

    const updated = await service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 2_000,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    expect(updated.version).toBe(2);
    expect(updated.taxVersions?.map(({ versionNumber }) => versionNumber)).toEqual([1, 2]);
    expect(updated.taxVersions?.[1]).toMatchObject({
      taxRuleId: tax.id,
      rateBps: 2_000,
      treatment: "exclusive",
      effectiveFrom: "2027-01-01T00:00:00.000Z",
      effectiveTo: null,
      status: "active"
    });
    const listed = await service.listMasters(actor, "taxes", {}, { limit: 10, offset: 0 });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.taxVersions?.map(({ versionNumber }) => versionNumber)).toEqual([1, 2]);
    expect((await AiEstimatorKnowledgeTaxVersionModel.find({ taxRuleId: tax.id }).sort({ versionNumber: 1 }).lean()).map(({ versionNumber }) => versionNumber)).toEqual([1, 2]);
    expect(audit.appendInMongoTransaction.mock.calls.flatMap(([event]) => [(event as { action: string }).action])).toContain("ai_estimator_knowledge_tax_version_created");
  });

  it("rejects generic update, rollover, and archive operations for the canonical fixed GST policy", async () => {
    const { service, audit } = harness();
    const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
    await AiEstimatorKnowledgeTaxRuleModel.create({
      _id: policy.rule.id,
      code: policy.rule.code,
      codeNormalized: "gst_18",
      name: policy.rule.name,
      nameNormalized: "gst 18%",
      description: null,
      displayOrder: policy.rule.displayOrder,
      status: policy.rule.status,
      version: 1,
      dependencyEpoch: 0,
      createdById: actor.id,
      updatedById: actor.id
    });
    await AiEstimatorKnowledgeTaxVersionModel.create({
      _id: policy.version.id,
      taxRuleId: policy.rule.id,
      versionNumber: policy.version.versionNumber,
      rateBps: policy.version.rateBps,
      treatment: policy.version.treatment,
      applicability: policy.version.applicability,
      effectiveFrom: new Date(policy.version.effectiveFrom),
      effectiveTo: null,
      status: policy.version.status,
      version: 1,
      createdById: actor.id,
      updatedById: actor.id
    });
    const operations = [
      () => service.updateMaster(actor, "taxes", policy.rule.id, {
        expectedVersion: 1,
        description: "not allowed"
      }),
      () => service.updateMaster(actor, "taxes", policy.rule.id, {
        expectedVersion: 1,
        taxVersion: {
          rateBps: 1_800,
          treatment: "exclusive" as const,
          applicability: policy.version.applicability,
          effectiveFrom: "2027-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active" as const,
          rolloverFromVersionId: policy.version.id
        }
      }),
      () => service.archiveMaster(actor, "taxes", policy.rule.id, {
        expectedVersion: 1,
        reason: "not allowed"
      })
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        status: 409,
        code: "CANONICAL_TAX_POLICY_IMMUTABLE"
      });
    }
    expect(await AiEstimatorKnowledgeTaxRuleModel.findById(policy.rule.id).lean())
      .toMatchObject({ status: "active", version: 1 });
    expect(await AiEstimatorKnowledgeTaxVersionModel.findById(policy.version.id).lean())
      .toMatchObject({ status: "active", effectiveTo: null, version: 1 });
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
  });

  it("atomically rolls an open-ended Tax version into an explicitly named successor", async () => {
    const { service, audit, actorGuard } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    const predecessor = tax.taxVersions![0]!;
    const rolled = await service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 2_000,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active",
        rolloverFromVersionId: predecessor.id
      }
    });

    expect(rolled.version).toBe(2);
    expect(rolled.taxVersions).toEqual([
      expect.objectContaining({
        id: predecessor.id,
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2027-01-01T00:00:00.000Z",
        version: 2
      }),
      expect.objectContaining({
        versionNumber: 2,
        rateBps: 2_000,
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        version: 1
      })
    ]);
    expect(actorGuard.requireMutationActor).toHaveBeenCalledTimes(2);
    expect(audit.appendInMongoTransaction.mock.calls.map(([event]) =>
      (event as { action: string }).action
    )).toEqual(expect.arrayContaining([
      "ai_estimator_knowledge_tax_version_created",
      "ai_estimator_knowledge_tax_version_rolled_over",
      "ai_estimator_knowledge_master_updated"
    ]));
  });

  it("rejects Tax rollover when any historical Price window crosses the cutoff without changing lineage", async () => {
    const { service, audit } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    const predecessor = tax.taxVersions![0]!;
    await createPriceVersionReferencingTax({
      id: "price-crossing-rollover",
      taxRuleId: tax.id,
      taxVersionId: predecessor.id,
      effectiveTo: null
    });
    const auditCountBefore = audit.appendInMongoTransaction.mock.calls.length;

    await expect(service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 2_000,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active",
        rolloverFromVersionId: predecessor.id
      }
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "TAX_VERSION_PRICE_WINDOW_CONFLICT");
      return true;
    });

    expect(audit.appendInMongoTransaction).toHaveBeenCalledTimes(auditCountBefore);
    expect((await AiEstimatorKnowledgeTaxRuleModel.findById(tax.id).lean())?.version).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: tax.id })).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.findById(predecessor.id).lean()).toMatchObject({
      rateBps: 1_800,
      effectiveTo: null,
      version: 1
    });
    expect(await AiEstimatorKnowledgePriceVersionModel.findById("price-crossing-rollover").lean()).toMatchObject({
      taxRuleId: tax.id,
      taxVersionId: predecessor.id,
      inputAmountPaise: 10_000,
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800,
      effectiveTo: null,
      status: "inactive",
      version: 1
    });
  });

  it("allows Tax rollover when every referencing Price window ends at the cutoff", async () => {
    const { service } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    const predecessor = tax.taxVersions![0]!;
    const cutoff = new Date("2027-01-01T00:00:00.000Z");
    await createPriceVersionReferencingTax({
      id: "price-ending-at-rollover",
      taxRuleId: tax.id,
      taxVersionId: predecessor.id,
      effectiveTo: cutoff
    });

    await expect(service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 2_000,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: cutoff.toISOString(),
        effectiveTo: null,
        status: "active",
        rolloverFromVersionId: predecessor.id
      }
    })).resolves.toMatchObject({ version: 2 });

    expect((await AiEstimatorKnowledgeTaxVersionModel.findById(predecessor.id).lean())?.effectiveTo?.toISOString()).toBe(cutoff.toISOString());
    expect(await AiEstimatorKnowledgePriceVersionModel.findById("price-ending-at-rollover").lean()).toMatchObject({
      taxVersionId: predecessor.id,
      inputAmountPaise: 10_000,
      effectiveTo: cutoff,
      version: 1
    });
  });

  it("rolls back the Tax rule, predecessor close, successor, and audits when rollover audit fails", async () => {
    const { service, audit } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    const predecessor = tax.taxVersions![0]!;
    audit.appendInMongoTransaction.mockImplementation(async (event) => {
      if ((event as { action: string }).action === "ai_estimator_knowledge_tax_version_rolled_over") {
        throw new Error("rollover audit unavailable");
      }
      return { id: "audit-id" } as never;
    });

    await expect(service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 2_000,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active",
        rolloverFromVersionId: predecessor.id
      }
    })).rejects.toThrow("rollover audit unavailable");

    expect((await AiEstimatorKnowledgeTaxRuleModel.findById(tax.id).lean())?.version).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: tax.id })).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.findById(predecessor.id).lean()).toMatchObject({
      rateBps: 1_800,
      effectiveTo: null,
      version: 1
    });
  });

  it("allows only one concurrent Tax rollover for the same master CAS version", async () => {
    const { service } = harness();
    const tax = await service.createMaster(actor, "taxes", {
      code: "GST18",
      name: "GST 18%",
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    });
    const predecessorId = tax.taxVersions![0]!.id;
    const rollover = (rateBps: number) => service.updateMaster(actor, "taxes", tax.id, {
      expectedVersion: 1,
      taxVersion: {
        rateBps,
        treatment: "exclusive",
        applicability: "interior works",
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active",
        rolloverFromVersionId: predecessorId
      }
    });
    const results = await Promise.allSettled([rollover(2_000), rollover(2_100)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rejection = results.find(({ status }) => status === "rejected");
    expectApiError((rejection as PromiseRejectedResult).reason, 409, "VERSION_CONFLICT");
    expect((await AiEstimatorKnowledgeTaxRuleModel.findById(tax.id).lean())?.version).toBe(2);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: tax.id })).toBe(2);
    expect((await AiEstimatorKnowledgeTaxVersionModel.findById(predecessorId).lean())?.effectiveTo?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rolls back reusable master creation when audit persistence fails", async () => {
    const audit = { appendInMongoTransaction: vi.fn(async () => { throw new Error("audit failed"); }) };
    const { service } = harness({ audit });
    await expect(service.createMaster(actor, "vendors", { code: "V1", name: "Vendor one" })).rejects.toThrow("audit failed");
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    const recovered = await harness().service.createMaster(actor, "vendors", {
      code: "V1",
      name: "Vendor one"
    });
    expect(recovered.displayOrder).toBe(0);
  });

  it("rejects unsupported master types without leaking model details", async () => {
    const { service } = harness();
    await expect(service.listMasters(actor, "invented" as never, {}, { limit: 10, offset: 0 })).rejects.toSatisfy((error) => {
      expectApiError(error, 400, "INVALID_MASTER_TYPE");
      return true;
    });
  });

  it("reloads and authorizes the mutation actor before validating a malformed body", async () => {
    const actorGuard = {
      requireReadActor: vi.fn(async () => { throw new ApiError(403, "FORBIDDEN", "Forbidden"); }),
      requireMutationActor: vi.fn(async () => { throw new ApiError(403, "FORBIDDEN", "Forbidden"); })
    };
    const { service } = harness({ actorGuard });
    await expect(service.createMaster(actor, "uoms", {
      code: "",
      name: "",
      decimalScale: 99
    })).rejects.toSatisfy((error) => {
      expectApiError(error, 403, "FORBIDDEN");
      return true;
    });
    expect(actorGuard.requireMutationActor).toHaveBeenCalledOnce();
  });
});
