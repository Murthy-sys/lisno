import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES,
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS
} from "../src/domain/ai-estimator-knowledge-priority.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../src/models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgePriorityModel } from "../src/models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../src/models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import {
  createAiEstimatorKnowledgeItemService
} from "../src/services/ai-estimator-knowledge-item.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-28T10:00:00.000Z");
const ACTOR = {
  id: "user-super-admin",
  name: "Sole Super Admin",
  email: "super-admin@example.test",
  role: "super_admin" as const
};

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("ai-estimator-knowledge-item-tests");
  await Promise.all([
    AiEstimatorKnowledgeBasketModel.syncIndexes(),
    AiEstimatorKnowledgeMainLineModel.syncIndexes(),
    AiEstimatorKnowledgeModeModel.syncIndexes(),
    AiEstimatorKnowledgePriceVersionModel.syncIndexes(),
    AiEstimatorKnowledgePriorityModel.syncIndexes(),
    AiEstimatorKnowledgeRevisionModel.syncIndexes(),
    AiEstimatorKnowledgeSectionModel.syncIndexes(),
    AiEstimatorKnowledgeTaxRuleModel.syncIndexes(),
    AiEstimatorKnowledgeTaxVersionModel.syncIndexes(),
    AiEstimatorKnowledgeUomModel.syncIndexes(),
    AiEstimatorKnowledgeVendorModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
  await seedReferences();
});

afterAll(async () => {
  await replica.stop();
});

describe("AI estimator knowledge item service", () => {
  it("persists only changed active canonical Main Line Priorities and keeps summary/filter identity", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Priority classified line"
    });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview"
    );

    const high = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: overview.version,
        expectedAggregateVersion: created.version,
        payload: {
          description: "High priority",
          uomId: "uom-sqft",
          priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high,
          surfaceIds: [],
          modeIds: []
        }
      }
    );

    expect(high.payload).toMatchObject({
      priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high
    });
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high
    ).lean()).toMatchObject({ dependencyEpoch: 1, version: 1 });
    await expect(service.getItem(ACTOR, created.mainLineId)).resolves.toMatchObject({
      priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high
    });
    await expect(service.listItems(
      ACTOR,
      { priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high },
      { limit: 20, offset: 0 }
    )).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ mainLineId: created.mainLineId })]
    });
    await expect(service.listItems(
      ACTOR,
      { priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low },
      { limit: 20, offset: 0 }
    )).resolves.toMatchObject({ total: 0, items: [] });

    const low = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: high.version,
        expectedAggregateVersion: high.aggregateVersion,
        payload: {
          ...high.payload,
          priorityId: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low
        }
      }
    );
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low
    ).lean()).toMatchObject({ dependencyEpoch: 1, version: 1 });

    const duplicate = await service.duplicate(ACTOR, created.mainLineId, {
      expectedVersion: low.aggregateVersion,
      name: "Priority classified copy"
    });
    expect(duplicate.priorityId).toBe(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low);
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low
    ).lean()).toMatchObject({ dependencyEpoch: 2, version: 1 });

    const cleared = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: low.version,
        expectedAggregateVersion: low.aggregateVersion,
        payload: { ...low.payload, priorityId: null }
      }
    );
    expect(cleared.payload).toMatchObject({ priorityId: null });

    await AiEstimatorKnowledgePriorityModel.create({
      _id: "knowledge-priority-custom",
      code: "CUSTOM",
      codeNormalized: "custom",
      name: "Custom",
      nameNormalized: "custom",
      description: null,
      displayOrder: 10,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: cleared.version,
        expectedAggregateVersion: cleared.aggregateVersion,
        payload: { ...cleared.payload, priorityId: "knowledge-priority-custom" }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.priorityId": expect.stringContaining("canonical") }
    });
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      "knowledge-priority-custom"
    ).lean()).toMatchObject({ dependencyEpoch: 0, version: 1 });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);

    await AiEstimatorKnowledgePriorityModel.updateOne(
      { _id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high },
      { $set: { status: "inactive" } }
    ).exec();
    await AiEstimatorKnowledgePriorityModel.collection.updateOne(
      { _id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium },
      { $unset: { semanticTier: "" } }
    );
    for (const priorityId of [
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high,
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium
    ]) {
      await expect(service.updateSection(
        ACTOR,
        created.mainLineId,
        revisionId,
        "overview",
        {
          expectedVersion: cleared.version,
          expectedAggregateVersion: cleared.aggregateVersion,
          payload: { ...cleared.payload, priorityId }
        }
      )).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        fields: { "payload.priorityId": expect.any(String) }
      });
    }
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("retains an unchanged inactive legacy Main Line Priority but never substitutes it", async () => {
    await AiEstimatorKnowledgePriorityModel.create({
      _id: "knowledge-priority-legacy-inactive",
      code: "LEGACY",
      codeNormalized: "legacy",
      name: "Legacy inactive",
      nameNormalized: "legacy inactive",
      description: null,
      displayOrder: 10,
      status: "inactive",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Legacy priority retention"
    });
    const revisionId = created.draftRevisionId!;
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { mainLineId: created.mainLineId, revisionId, sectionKey: "overview" },
      {
        $set: {
          applicability: "configured",
          payload: {
            description: "Legacy saved value",
            uomId: "uom-sqft",
            priorityId: "knowledge-priority-legacy-inactive",
            surfaceIds: [],
            modeIds: []
          }
        }
      }
    ).exec();
    const overview = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview"
    );

    const retained = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: overview.version,
        expectedAggregateVersion: created.version,
        payload: { ...overview.payload, description: "Unrelated edit" }
      }
    );
    expect(retained.payload).toMatchObject({
      description: "Unrelated edit",
      priorityId: "knowledge-priority-legacy-inactive"
    });

    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "overview",
      {
        expectedVersion: retained.version,
        expectedAggregateVersion: retained.aggregateVersion,
        payload: {
          ...retained.payload,
          priorityId: "knowledge-priority-custom-missing"
        }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.priorityId": expect.any(String) }
    });
    expect((await AiEstimatorKnowledgeSectionModel.findById(retained.id).lean())?.payload)
      .toMatchObject({ priorityId: "knowledge-priority-legacy-inactive" });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("retains and coordinates an active legacy Main Line Priority during duplication", async () => {
    await AiEstimatorKnowledgePriorityModel.create({
      _id: "knowledge-priority-legacy-active",
      code: "LEGACY_ACTIVE",
      codeNormalized: "legacy_active",
      name: "Legacy active",
      nameNormalized: "legacy active",
      description: null,
      displayOrder: 10,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service } = createService();
    const source = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Legacy priority duplicate source"
    });
    await AiEstimatorKnowledgeSectionModel.updateOne(
      {
        mainLineId: source.mainLineId,
        revisionId: source.draftRevisionId,
        sectionKey: "overview"
      },
      {
        $set: {
          applicability: "configured",
          payload: {
            description: "Retained legacy selection",
            uomId: "uom-sqft",
            priorityId: "knowledge-priority-legacy-active",
            surfaceIds: [],
            modeIds: []
          }
        }
      }
    ).exec();

    const duplicate = await service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: source.version,
      name: "Legacy priority duplicate"
    });

    expect(duplicate.priorityId).toBe("knowledge-priority-legacy-active");
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      "knowledge-priority-legacy-active"
    ).lean()).toMatchObject({ dependencyEpoch: 1, status: "active", version: 1 });
  });

  it("creates one Draft aggregate atomically and rejects a stale aggregate mutation", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Wardrobe",
      description: "Modular wardrobe",
      displayOrder: 10
    });

    expect(created.status).toBe("draft");
    expect(created.draftRevisionId).toBeTruthy();
    expect(created.version).toBe(1);
    expect(created).not.toHaveProperty("dependencyEpoch");
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-carpentry").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments({
      mainLineId: created.mainLineId,
      revisionId: created.draftRevisionId
    })).toBe(8);
    expect(appendAudit).toHaveBeenCalledTimes(1);

    await service.updateMainLine(ACTOR, created.mainLineId, {
      expectedVersion: 1,
      description: "Updated"
    });
    await expect(service.updateMainLine(ACTOR, created.mainLineId, {
      expectedVersion: 1,
      description: "Stale"
    })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())
      .toMatchObject({ description: "Updated", displayOrder: 10 });
    expect(appendAudit).toHaveBeenCalledTimes(2);
    expect(appendAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_updated",
        oldValues: { version: 1 },
        newValues: { version: 2 }
      }),
      expect.anything()
    );
  });

  it("initializes a missing legacy Basket dependency guard during Main Line creation", async () => {
    await AiEstimatorKnowledgeBasketModel.collection.insertOne({
      _id: "basket-legacy-without-guard",
      name: "Legacy Basket Without Guard",
      nameNormalized: "legacy basket without guard",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    });
    const { service } = createService();

    const created = await service.createMainLine(
      ACTOR,
      "basket-legacy-without-guard",
      { name: "Legacy Basket Item" }
    );

    expect(created).not.toHaveProperty("dependencyEpoch");
    expect(await AiEstimatorKnowledgeBasketModel.findById(
      "basket-legacy-without-guard"
    ).lean()).toMatchObject({ dependencyEpoch: 1, version: 1 });
  });

  it("appends within each Basket while explicit orders advance but never lower the high-water mark", async () => {
    await AiEstimatorKnowledgeBasketModel.create({
      _id: "basket-painting",
      name: "Painting",
      nameNormalized: "painting",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service, appendAudit } = createService();

    const explicitlyOrdered = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Explicitly ordered",
      displayOrder: 5
    });
    const appended = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Automatically appended"
    });
    const independent = await service.createMainLine(ACTOR, "basket-painting", {
      name: "Independent Basket"
    });

    await expectMainLineOrder(explicitlyOrdered.mainLineId, 5);
    await expectMainLineOrder(appended.mainLineId, 6);
    await expectMainLineOrder(independent.mainLineId, 0);

    const raised = await service.updateMainLine(ACTOR, explicitlyOrdered.mainLineId, {
      expectedVersion: explicitlyOrdered.version,
      displayOrder: 9
    });
    const afterRaise = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "After explicit raise"
    });
    await expectMainLineOrder(raised.mainLineId, 9);
    await expectMainLineOrder(afterRaise.mainLineId, 10);
    const lowered = await service.updateMainLine(ACTOR, explicitlyOrdered.mainLineId, {
      expectedVersion: raised.version,
      displayOrder: 2
    });
    const afterLower = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "After explicit lower"
    });

    await expectMainLineOrder(lowered.mainLineId, 2);
    await expectMainLineOrder(afterLower.mainLineId, 11);
    expect(appendAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_created",
        newValues: expect.objectContaining({
          basketId: "basket-carpentry",
          displayOrder: 5,
          version: 1
        })
      }),
      expect.anything()
    );
    expect(appendAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_created",
        newValues: expect.objectContaining({
          basketId: "basket-carpentry",
          displayOrder: 6,
          version: 1
        })
      }),
      expect.anything()
    );
    expect(appendAudit).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_updated",
        oldValues: { version: 1, displayOrder: 5 },
        newValues: { version: 2, displayOrder: 9 }
      }),
      expect.anything()
    );
    expect(appendAudit).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_updated",
        oldValues: { version: 2, displayOrder: 9 },
        newValues: { version: 3, displayOrder: 2 }
      }),
      expect.anything()
    );
  });

  it("materializes immutable price append commands and stores only stable references", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Kitchen" });
    const revisionId = created.draftRevisionId!;
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");

    const saved = await service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: created.version,
      payload: {
        specifications: [{ id: "spec-plywood", name: "Plywood" }],
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-plywood",
          vendorId: "vendor-local",
          uomId: "uom-sqft",
          specificationId: null,
          modeId: null,
          taxRuleId: "tax-gst",
          taxVersionId: "tax-gst-v1",
          inputAmountPaise: 11_800,
          treatment: "inclusive",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }]
      }
    });

    const price = await AiEstimatorKnowledgePriceVersionModel.findOne({
      revisionId,
      priceEntryId: "price-entry-plywood"
    }).lean();
    expect(price).toMatchObject({
      specificationId: null,
      treatment: "inclusive",
      inputAmountPaise: 11_800,
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800,
      status: "active",
      reviewRequired: false
    });
    expect(saved.payload.priceEntries).toEqual([expect.objectContaining({
      operation: "reference",
      priceEntryId: "price-entry-plywood",
      priceVersionId: price?._id,
      priceVersion: expect.objectContaining({ id: price?._id, versionNumber: 1 })
    })]);

    const auditCountBeforeRejectedLink = appendAudit.mock.calls.length;
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: saved.version,
      expectedAggregateVersion: saved.aggregateVersion,
      payload: {
        specifications: [{ id: "spec-plywood", name: "Plywood" }],
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-linked",
          vendorId: "vendor-local",
          uomId: "uom-sqft",
          specificationId: "spec-plywood",
          modeId: null,
          taxRuleId: "tax-gst",
          taxVersionId: "tax-gst-v1",
          inputAmountPaise: 11_800,
          treatment: "inclusive",
          effectiveFrom: "2027-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.priceEntries.0.specificationId": expect.stringContaining("must be null")
      }
    });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId })).toBe(1);
    expect(appendAudit).toHaveBeenCalledTimes(auditCountBeforeRejectedLink);

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: created.version,
      payload: {
        ...saved.payload,
        priceEntries: [{
          operation: "reference",
          priceEntryId: "price-entry-plywood",
          priceVersionId: price?._id
        }]
      }
    })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId })).toBe(1);
    expect(appendAudit).toHaveBeenCalledTimes(3);
  });

  it("preserves stored typed Specifications and historical price references without allowing new typed writes", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Referenced Specification"
    });
    const revisionId = created.draftRevisionId!;
    const storedTypedSpecification = {
      id: "spec-referenced",
      name: "Board thickness",
      description: "Saved against immutable pricing.",
      type: "text",
      options: [],
      value: "18 mm"
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { mainLineId: created.mainLineId, revisionId, sectionKey: "pricing" },
      {
        $set: {
          payload: {
            specifications: [
              storedTypedSpecification,
              { id: "spec-unreferenced", name: "Unreferenced legacy row" }
            ],
            priceEntries: []
          }
        }
      }
    );
    const priceVersionId = "price-version-historical-specification";
    await AiEstimatorKnowledgePriceVersionModel.create({
      _id: priceVersionId,
      mainLineId: created.mainLineId,
      revisionId,
      priceEntryId: "price-entry-referenced-spec",
      versionNumber: 1,
      vendorId: "vendor-local",
      uomId: "uom-sqft",
      specificationId: "spec-referenced",
      modeId: null,
      taxRuleId: "tax-gst",
      taxVersionId: "tax-gst-v1",
      treatment: "inclusive",
      inputAmountPaise: 11_800,
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      status: "active",
      reviewRequired: false,
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const reference = {
      operation: "reference",
      priceEntryId: "price-entry-referenced-spec",
      priceVersionId
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { mainLineId: created.mainLineId, revisionId, sectionKey: "pricing" },
      { $set: { "payload.priceEntries": [reference] } }
    );
    const saved = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    const auditCountBeforeCompatibilityRejections = appendAudit.mock.calls.length;

    const incompatibleTypedWrites = [
      {
        path: "payload.specifications.2.type",
        specifications: [
          storedTypedSpecification,
          { id: "spec-unreferenced", name: "Unreferenced legacy row" },
          { id: "spec-new-typed", name: "New typed row", type: "text", options: [], value: null }
        ]
      },
      {
        path: "payload.specifications.1.type",
        specifications: [
          storedTypedSpecification,
          {
            id: "spec-unreferenced",
            name: "Promoted legacy row",
            type: "text",
            options: [],
            value: null
          }
        ]
      }
    ];
    for (const incompatible of incompatibleTypedWrites) {
      await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
        expectedVersion: saved.version,
        expectedAggregateVersion: created.version,
        payload: { specifications: incompatible.specifications, priceEntries: [reference] }
      })).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        fields: {
          [incompatible.path]: expect.any(String)
        }
      });
    }

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: saved.version,
      expectedAggregateVersion: created.version,
      payload: {
        specifications: [{ ...storedTypedSpecification, value: "19 mm" }],
        priceEntries: [reference]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.specifications.0.value": expect.stringContaining("immutable")
      }
    });
    expect(appendAudit).toHaveBeenCalledTimes(auditCountBeforeCompatibilityRejections);
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId })).toBe(1);

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: saved.version,
      expectedAggregateVersion: saved.aggregateVersion,
      payload: {
        specifications: [{ id: "spec-unreferenced", name: "Unreferenced legacy row" }],
        priceEntries: [reference]
      }
    })).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REFERENCE_INVALID",
      fields: {
        "payload.specifications": expect.stringContaining("immutable saved price history")
      }
    });

    const afterUnreferencedRemoval = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: saved.version,
        expectedAggregateVersion: saved.aggregateVersion,
        payload: {
          specifications: [{
            id: "spec-referenced",
            name: "Renamed thickness",
            description: "Still linked by stable ID.",
            type: "text",
            options: [],
            value: "18 mm"
          }],
          priceEntries: [reference]
        }
      }
    );
    expect(afterUnreferencedRemoval.payload.specifications).toEqual([
      expect.objectContaining({
        id: "spec-referenced",
        name: "Renamed thickness",
        value: "18 mm"
      })
    ]);

    const historyOnly = await service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: afterUnreferencedRemoval.version,
      expectedAggregateVersion: afterUnreferencedRemoval.aggregateVersion,
      payload: {
        specifications: [{
          id: "spec-referenced",
          name: "Renamed thickness",
          description: "Still linked by stable ID.",
        }],
        priceEntries: []
      }
    });
    expect(historyOnly.payload.priceEntries).toEqual([]);
    expect(historyOnly.payload.specifications).toEqual([
      expect.objectContaining({
        id: "spec-referenced",
        name: "Renamed thickness",
        type: "text",
        options: [],
        value: "18 mm"
      })
    ]);
    expect(historyOnly.referenceState).toEqual({
      specificationIds: ["spec-referenced"]
    });

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: historyOnly.version,
      expectedAggregateVersion: historyOnly.aggregateVersion,
      payload: { specifications: [], priceEntries: [] }
    })).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REFERENCE_INVALID"
    });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId })).toBe(1);

    await AiEstimatorKnowledgeSectionModel.updateOne(
      { mainLineId: created.mainLineId, revisionId, sectionKey: "pricing" },
      {
        $set: {
          "payload.specifications": [],
          "payload.priceEntries": [reference]
        }
      }
    );
    const compatibleRetainedReferenceSave = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: historyOnly.version,
        expectedAggregateVersion: historyOnly.aggregateVersion,
        payload: {
          specifications: [],
          qualityLevel: "Compatibility edit",
          priceEntries: [reference]
        }
      }
    );
    expect(compatibleRetainedReferenceSave.payload).toMatchObject({
      specifications: [],
      qualityLevel: "Compatibility edit",
      priceEntries: [expect.objectContaining(reference)]
    });
    expect(compatibleRetainedReferenceSave.referenceState).toEqual({
      specificationIds: ["spec-referenced"]
    });

    const compatibleLegacySave = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: compatibleRetainedReferenceSave.version,
        expectedAggregateVersion: compatibleRetainedReferenceSave.aggregateVersion,
        payload: {
          specifications: [],
          qualityLevel: "Compatibility edit",
          priceEntries: []
        }
      }
    );
    expect(compatibleLegacySave.payload).toMatchObject({ specifications: [], priceEntries: [] });

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: compatibleLegacySave.version,
      expectedAggregateVersion: compatibleLegacySave.aggregateVersion,
      payload: { specifications: [], priceEntries: [reference] }
    })).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REFERENCE_INVALID"
    });
  });

  it("persists asymmetric definition-only Mode configurations without dropping other Advanced keys", async () => {
    const { service, appendAudit } = createService();
    await AiEstimatorKnowledgeModeModel.deleteMany({});
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Dynamic mode fields"
    });
    const revisionId = created.draftRevisionId!;
    const advanced = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced"
    );
    const payload = {
      dependencies: [],
      modeOverrides: [],
      revisionLineage: [],
      modeConfigurations: [
        {
          id: "configuration-pmc",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-mark",
            type: "text",
            label: "PMC mark",
            options: []
          }]
        },
        {
          id: "configuration-execution-sub-vendor",
          modeKind: "execution",
          executionSource: "sub_vendor",
          fields: [{
            id: "field-crew-code",
            type: "text",
            label: "Crew code",
            options: []
          }]
        },
        {
          id: "configuration-execution-in-house",
          modeKind: "execution",
          executionSource: "in_house",
          fields: [{
            id: "field-work-package",
            type: "dropdown",
            label: "Work package",
            options: ["Carpentry", "Electrical"]
          }]
        }
      ]
    };

    const saved = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload
      }
    );

    expect(saved.payload).toEqual(payload);
    expect(saved.version).toBe(advanced.version + 1);
    expect(saved.aggregateVersion).toBe(created.version + 1);
    expect((await service.getItem(ACTOR, created.mainLineId)).version).toBe(saved.aggregateVersion);
    expect(await AiEstimatorKnowledgeModeModel.countDocuments()).toBe(0);
    expect(appendAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "ai_estimator_knowledge_section_updated",
        entityId: advanced.id
      }),
      expect.anything()
    );

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload
      }
    )).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });

    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: saved.version,
        expectedAggregateVersion: saved.aggregateVersion,
        payload: {
          ...payload,
          modeConfigurations: payload.modeConfigurations.map((configuration, index) => index === 0
            ? {
                ...configuration,
                fields: configuration.fields.map((field) => ({ ...field, value: "promoted" }))
              }
            : configuration)
        }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.modeConfigurations.0.fields.0.value": expect.stringContaining("compatibility-only")
      }
    });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
    const nextPayload = {
      ...payload,
      modeConfigurations: payload.modeConfigurations.map((configuration) => ({
        ...configuration,
        fields: configuration.fields.map((field) => ({
          ...field,
          label: `${field.label} updated`
        }))
      }))
    };
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: saved.version,
        expectedAggregateVersion: saved.aggregateVersion,
        payload: nextPayload
      }
    )).resolves.toMatchObject({
      payload: nextPayload,
      version: saved.version + 1,
      aggregateVersion: saved.aggregateVersion + 1
    });
    expect(await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced"
    )).toMatchObject({ version: saved.version + 1, payload: nextPayload });
    expect((await service.getItem(ACTOR, created.mainLineId)).version).toBe(created.version + 2);
    expect(await AiEstimatorKnowledgeModeModel.countDocuments()).toBe(0);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount + 1);
  });

  it("preserves legacy values by stable configuration/field ID and rejects value or identity promotion", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Legacy Mode compatibility"
    });
    const revisionId = created.draftRevisionId!;
    const advanced = await service.getSection(ACTOR, created.mainLineId, revisionId, "advanced");
    const historicalPayload = {
      dependencies: [],
      modeConfigurations: [
        {
          id: "configuration-pmc",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-mark",
            type: "text",
            label: "PMC mark",
            options: [],
            value: "A1"
          }]
        },
        {
          id: "configuration-execution-recovery",
          modeKind: "execution",
          fields: [{
            id: "field-recovery-package",
            type: "dropdown",
            label: "Recovery package",
            options: ["Old"],
            value: "Old"
          }]
        }
      ]
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: advanced.id },
      { $set: { payload: historicalPayload } }
    ).exec();

    const edited = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload: {
          dependencies: [],
          modeConfigurations: [
            {
              id: "configuration-pmc",
              modeKind: "pmc",
              fields: [{
                id: "field-pmc-mark",
                type: "dropdown",
                label: "PMC grade",
                options: ["Premium", "Standard"]
              }]
            },
            historicalPayload.modeConfigurations[1]!
          ]
        }
      }
    );
    expect(edited.payload).toMatchObject({
      modeConfigurations: [
        {
          id: "configuration-pmc",
          fields: [{
            id: "field-pmc-mark",
            type: "dropdown",
            label: "PMC grade",
            options: ["Premium", "Standard"],
            value: "A1"
          }]
        },
        historicalPayload.modeConfigurations[1]!
      ]
    });

    const auditCount = appendAudit.mock.calls.length;
    const baseInput = {
      expectedVersion: edited.version,
      expectedAggregateVersion: edited.aggregateVersion
    };
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      ...baseInput,
      payload: {
        dependencies: [],
        modeConfigurations: [{
          id: "configuration-pmc",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-mark",
            type: "text",
            label: "PMC mark",
            options: [],
            value: "A2"
          }]
        }]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.modeConfigurations.0.fields.0.value": expect.stringContaining("immutable") }
    });
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      ...baseInput,
      payload: {
        dependencies: [],
        modeConfigurations: [{
          id: "configuration-new-execution",
          modeKind: "execution",
          fields: []
        }]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.modeConfigurations.0.executionSource": expect.stringContaining("Sub-Vendor") }
    });
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      ...baseInput,
      payload: {
        dependencies: [],
        modeConfigurations: [{
          id: "configuration-new-pmc",
          modeKind: "pmc",
          fields: [{
            id: "field-new-valued",
            type: "checkbox",
            label: "New valued field",
            options: [],
            value: false
          }]
        }]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.modeConfigurations.0.fields.0.value": expect.stringContaining("compatibility-only") }
    });
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      ...baseInput,
      payload: {
        dependencies: [],
        modeConfigurations: [{
          id: "configuration-new-legacy-mode",
          modeId: "mode-pmc",
          fields: []
        }]
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.modeConfigurations.0.modeId": expect.stringContaining("compatibility-only") }
    });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
    expect((await service.getSection(ACTOR, created.mainLineId, revisionId, "advanced")).version)
      .toBe(edited.version);
  });

  it("requires explicit unscoped Execution recovery into a previously empty source", async () => {
    const { service } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Execution recovery"
    });
    const revisionId = created.draftRevisionId!;
    const advanced = await service.getSection(ACTOR, created.mainLineId, revisionId, "advanced");
    const historicalPayload = {
      modeConfigurations: [
        {
          id: "configuration-execution-recovery",
          modeKind: "execution",
          fields: [{
            id: "field-recovery",
            type: "text",
            label: "Recovery field",
            options: [],
            value: "hidden"
          }]
        },
        {
          id: "configuration-execution-in-house",
          modeKind: "execution",
          executionSource: "in_house",
          fields: []
        }
      ]
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: advanced.id },
      { $set: { payload: historicalPayload } }
    ).exec();

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload: {
          modeConfigurations: [
            {
              ...historicalPayload.modeConfigurations[0]!,
              fields: [{
                ...historicalPayload.modeConfigurations[0]!.fields[0]!,
                label: "Silently classified recovery"
              }]
            },
            historicalPayload.modeConfigurations[1]!
          ]
        }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.modeConfigurations.0": expect.stringContaining("remain unchanged")
      }
    });
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload: {
          modeConfigurations: [
            {
              ...historicalPayload.modeConfigurations[0]!,
              executionSource: "in_house"
            },
            historicalPayload.modeConfigurations[1]!
          ]
        }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.modeConfigurations.1.executionSource": expect.stringContaining("unique")
      }
    });

    const assigned = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: created.version,
        payload: {
          modeConfigurations: [
            {
              id: "configuration-execution-recovery",
              modeKind: "execution",
              executionSource: "sub_vendor",
              fields: [{
                id: "field-recovery",
                type: "text",
                label: "Recovered Sub-Vendor field",
                options: []
              }]
            },
            historicalPayload.modeConfigurations[1]!
          ]
        }
      }
    );
    expect(assigned.payload).toMatchObject({
      modeConfigurations: [
        {
          id: "configuration-execution-recovery",
          executionSource: "sub_vendor",
          fields: [{ value: "hidden" }]
        },
        { executionSource: "in_house" }
      ]
    });
  });

  it("retains active-reference validation for legacy modeId configurations", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Legacy dynamic mode fields"
    });
    const revisionId = created.draftRevisionId!;
    const advanced = await service.getSection(ACTOR, created.mainLineId, revisionId, "advanced");
    const payload = {
      modeConfigurations: [{
        id: "configuration-legacy",
        modeId: "mode-pmc",
        fields: [{
          id: "field-legacy",
          type: "text",
          label: "Legacy marker",
          options: [],
          value: "L1"
        }]
      }]
    };

    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: advanced.id },
      { $set: { payload } }
    ).exec();
    const saved = await service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      expectedVersion: advanced.version,
      expectedAggregateVersion: created.version,
      payload: {
        modeConfigurations: [{
          id: "configuration-legacy",
          modeId: "mode-pmc",
          fields: [{
            id: "field-legacy",
            type: "text",
            label: "Legacy marker",
            options: []
          }]
        }]
      }
    });
    expect(saved.payload).toEqual(payload);
    expect(await AiEstimatorKnowledgeModeModel.findById("mode-pmc").lean())
      .toMatchObject({ dependencyEpoch: 0, status: "active" });

    await AiEstimatorKnowledgeModeModel.updateOne(
      { _id: "mode-pmc" },
      { $set: { status: "inactive", version: 2, updatedAt: NOW } }
    ).exec();
    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "advanced", {
      expectedVersion: saved.version,
      expectedAggregateVersion: saved.aggregateVersion,
      payload
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.modeConfigurations.0.modeId": expect.stringContaining("not active")
      }
    });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("activates immutable history and clones revision-scoped price references into a new Draft", async () => {
    const { service } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "TV Unit" });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    const afterOverview = await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: { description: "TV Unit", uomId: "uom-sqft", priorityId: null, surfaceIds: [], modeIds: [] }
    });
    expect(afterOverview.version).toBe(2);
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: 2,
      payload: {
        specifications: [{ id: "spec-tv", name: "Standard" }],
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-tv",
          vendorId: "vendor-local",
          uomId: "uom-sqft",
          specificationId: null,
          modeId: null,
          taxRuleId: "tax-gst",
          taxVersionId: "tax-gst-v1",
          inputAmountPaise: 10_000,
          treatment: "inclusive",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }]
      }
    });

    const active = await service.activate(ACTOR, created.mainLineId, revisionId, { expectedVersion: 3 });
    expect(active.status).toBe("active");
    expect(active.activeRevision?.contentDigest).toMatch(/^[a-f0-9]{64}$/u);
    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: 2,
      expectedAggregateVersion: 4,
      payload: { description: "Forbidden" }
    })).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_REVISION_IMMUTABLE" });

    const withDraft = await service.createRevision(ACTOR, created.mainLineId, { expectedVersion: 4 });
    const newRevisionId = withDraft.draftRevisionId!;
    const copiedPricing = await service.getSection(ACTOR, created.mainLineId, newRevisionId, "pricing");
    const copiedReference = (copiedPricing.payload.priceEntries as Array<Record<string, string>>)[0]!;
    expect(copiedReference.priceVersionId).not.toBe(
      (await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing")).payload.priceEntries?.[0]?.priceVersionId
    );
    expect(await AiEstimatorKnowledgePriceVersionModel.findById(copiedReference.priceVersionId).lean())
      .toMatchObject({ revisionId: newRevisionId, status: "active", reviewRequired: false });
  });

  it("lets a Draft replace an unretained open-ended copied price without deleting its history", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Replace Price" });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: { description: "Replace Price", uomId: "uom-sqft", priorityId: null, surfaceIds: [], modeIds: [] }
    });
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: 2,
      payload: {
        specifications: [{ id: "spec-replacement", name: "Standard" }],
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-original",
          vendorId: "vendor-local",
          uomId: "uom-sqft",
          specificationId: null,
          modeId: null,
          taxRuleId: "tax-gst",
          taxVersionId: "tax-gst-v1",
          inputAmountPaise: 11_800,
          treatment: "inclusive",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }]
      }
    });
    const active = await service.activate(ACTOR, created.mainLineId, revisionId, { expectedVersion: 3 });
    const withDraft = await service.createRevision(ACTOR, created.mainLineId, { expectedVersion: active.version });
    const draftRevisionId = withDraft.draftRevisionId!;
    const copiedPricing = await service.getSection(ACTOR, created.mainLineId, draftRevisionId, "pricing");
    const copiedEntry = (copiedPricing.payload.priceEntries as Array<Record<string, unknown>>)[0]!;
    const copiedReference = {
      operation: "reference",
      priceEntryId: copiedEntry.priceEntryId,
      priceVersionId: copiedEntry.priceVersionId
    };
    expect(copiedEntry.priceVersion).toMatchObject({
      id: copiedEntry.priceVersionId,
      priceEntryId: "price-entry-original",
      versionNumber: 1,
      vendorId: "vendor-local",
      inputAmountPaise: 11_800,
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800
    });
    const replacement = {
      operation: "append",
      priceEntryId: "price-entry-original",
      vendorId: "vendor-local",
      uomId: "uom-sqft",
      specificationId: null,
      modeId: null,
      taxRuleId: "tax-gst",
      taxVersionId: "tax-gst-v1",
      inputAmountPaise: 12_980,
      treatment: "inclusive",
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveTo: null,
      status: "active"
    };
    const historicalCount = await AiEstimatorKnowledgePriceVersionModel.countDocuments({
      revisionId: draftRevisionId
    });
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(ACTOR, created.mainLineId, draftRevisionId, "pricing", {
      expectedVersion: copiedPricing.version,
      expectedAggregateVersion: withDraft.version,
      payload: {
        ...copiedPricing.payload,
        priceEntries: [copiedReference, replacement]
      }
    })).rejects.toMatchObject({ status: 409, code: "EFFECTIVE_WINDOW_OVERLAP" });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId: draftRevisionId }))
      .toBe(historicalCount);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);

    const saved = await service.updateSection(ACTOR, created.mainLineId, draftRevisionId, "pricing", {
      expectedVersion: copiedPricing.version,
      expectedAggregateVersion: withDraft.version,
      payload: {
        ...copiedPricing.payload,
        priceEntries: [replacement]
      }
    });
    expect(saved.payload.priceEntries).toEqual([expect.objectContaining({
      operation: "reference",
      priceEntryId: "price-entry-original",
      priceVersion: expect.objectContaining({
        versionNumber: 2,
        inputAmountPaise: 12_980,
        baseAmountPaise: 11_000,
        taxAmountPaise: 1_980,
        totalAmountPaise: 12_980
      })
    })]);
    expect(await AiEstimatorKnowledgePriceVersionModel.findById(copiedReference.priceVersionId).lean())
      .toMatchObject({ revisionId: draftRevisionId, status: "active" });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId: draftRevisionId }))
      .toBe(historicalCount + 1);

    await AiEstimatorKnowledgeVendorModel.create({
      _id: "vendor-replacement",
      code: "REPLACEMENT",
      codeNormalized: "replacement",
      name: "Replacement Vendor",
      nameNormalized: "replacement vendor",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const vendorReplaced = await service.updateSection(ACTOR, created.mainLineId, draftRevisionId, "pricing", {
      expectedVersion: saved.version,
      expectedAggregateVersion: withDraft.version + 1,
      payload: {
        specifications: [{ id: "spec-replacement", name: "Standard" }],
        priceEntries: [{
          ...replacement,
          vendorId: "vendor-replacement",
          inputAmountPaise: 14_160
        }]
      }
    });
    const localVendorMatches = await service.listItems(ACTOR, { vendorId: "vendor-local" }, { limit: 20, offset: 0 });
    const replacementVendorMatches = await service.listItems(
      ACTOR,
      { vendorId: "vendor-replacement" },
      { limit: 20, offset: 0 }
    );
    expect(localVendorMatches.items.map((item) => item.mainLineId)).not.toContain(created.mainLineId);
    expect(replacementVendorMatches.items.map((item) => item.mainLineId)).toContain(created.mainLineId);

    await service.updateSection(ACTOR, created.mainLineId, draftRevisionId, "pricing", {
      expectedVersion: vendorReplaced.version,
      expectedAggregateVersion: withDraft.version + 2,
      payload: {
        specifications: [{ id: "spec-replacement", name: "Standard" }],
        priceEntries: []
      }
    });
    const removedVendorMatches = await service.listItems(
      ACTOR,
      { vendorId: "vendor-replacement" },
      { limit: 20, offset: 0 }
    );
    expect(removedVendorMatches.items.map((item) => item.mainLineId)).not.toContain(created.mainLineId);
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId: draftRevisionId }))
      .toBe(historicalCount + 2);
  });

  it("duplicates a Draft at the end of its Basket with remapped identities marked for review", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Partition" });
    const revisionId = created.draftRevisionId!;
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: 1,
      payload: {
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-partition",
          vendorId: "vendor-local",
          uomId: "uom-sqft",
          specificationId: null,
          modeId: null,
          taxRuleId: "tax-gst",
          taxVersionId: "tax-gst-v1",
          inputAmountPaise: 5_900,
          treatment: "inclusive",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }]
      }
    });
    const execution = await service.getSection(ACTOR, created.mainLineId, revisionId, "execution");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "execution", {
      expectedVersion: execution.version,
      expectedAggregateVersion: 2,
      payload: {
        steps: [
          {
            id: "step-a",
            order: 1,
            name: "Measure",
            description: null,
            durationValue: null,
            durationUnit: null,
            crewSize: null,
            skillType: null,
            mandatory: true,
            parallelizable: false,
            active: true,
            dependencyStepIds: []
          },
          {
            id: "step-b",
            order: 2,
            name: "Install",
            description: null,
            durationValue: null,
            durationUnit: null,
            crewSize: null,
            skillType: null,
            mandatory: true,
            parallelizable: false,
            active: true,
            dependencyStepIds: ["step-a"]
          }
        ]
      }
    });

    const duplicate = await service.duplicate(ACTOR, created.mainLineId, {
      expectedVersion: 3,
      name: "Partition Copy"
    });
    await expectMainLineOrder(created.mainLineId, 0);
    await expectMainLineOrder(duplicate.mainLineId, 1);
    const duplicatePricing = await service.getSection(
      ACTOR,
      duplicate.mainLineId,
      duplicate.draftRevisionId!,
      "pricing"
    );
    const duplicateReference = (duplicatePricing.payload.priceEntries as Array<Record<string, string>>)[0]!;
    expect(duplicateReference.priceEntryId).not.toBe("price-entry-partition");
    expect(await AiEstimatorKnowledgePriceVersionModel.findById(duplicateReference.priceVersionId).lean())
      .toMatchObject({
        mainLineId: duplicate.mainLineId,
        revisionId: duplicate.draftRevisionId,
        status: "draft",
        reviewRequired: true
      });
    const duplicateExecution = await service.getSection(
      ACTOR,
      duplicate.mainLineId,
      duplicate.draftRevisionId!,
      "execution"
    );
    const steps = duplicateExecution.payload.steps as Array<{ id: string; dependencyStepIds: string[] }>;
    expect(steps[0]!.id).not.toBe("step-a");
    expect(steps[1]!.dependencyStepIds).toEqual([steps[0]!.id]);
    expect(appendAudit.mock.calls.map(([event]) => event)).toContainEqual(
      expect.objectContaining({
        action: "ai_estimator_knowledge_main_line_duplicated",
        entityId: duplicate.mainLineId,
        newValues: expect.objectContaining({
          sourceMainLineId: created.mainLineId,
          basketId: "basket-carpentry",
          displayOrder: 1,
          version: 1
        })
      })
    );
  });

  it("rolls back a duplicate's allocated order and aggregate when its audit write fails", async () => {
    const { service, appendAudit } = createService();
    const source = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Rollback source"
    });
    appendAudit.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: source.version,
      name: "Failed duplicate"
    })).rejects.toThrow();
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: "basket-carpentry"
    })).toBe(1);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-carpentry").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });

    const duplicate = await service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: source.version,
      name: "Successful duplicate"
    });
    await expectMainLineOrder(duplicate.mainLineId, 1);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: "basket-carpentry"
    })).toBe(2);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-carpentry").lean())
      .toMatchObject({ dependencyEpoch: 2, version: 1 });
  });

  it("revalidates copied slab quantities against the current UOM scale and rolls back its dependency guard", async () => {
    const { service, appendAudit } = createService();
    const source = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Slab scale copy source"
    });
    const revisionId = source.draftRevisionId!;
    const pricing = await service.getSection(ACTOR, source.mainLineId, revisionId, "pricing");
    const savedPricing = await service.updateSection(
      ACTOR,
      source.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: source.version,
        payload: {
          specifications: [{ id: "specification-plywood", name: "Plywood" }],
          priceEntries: []
        }
      }
    );
    const quantityMargin = await service.getSection(
      ACTOR,
      source.mainLineId,
      revisionId,
      "quantity-margin"
    );
    const savedQuantity = await service.updateSection(
      ACTOR,
      source.mainLineId,
      revisionId,
      "quantity-margin",
      {
        expectedVersion: quantityMargin.version,
        expectedAggregateVersion: savedPricing.aggregateVersion,
        payload: {
          slabRates: [{
            id: "slab-rate-plywood",
            specificationId: "specification-plywood",
            uomId: "uom-sqft",
            quantity: "1.25",
            unitRatePaise: 8_000
          }]
        }
      }
    );
    await AiEstimatorKnowledgeUomModel.updateOne(
      { _id: "uom-sqft" },
      { $set: { decimalScale: 1 } }
    ).exec();
    const auditCount = appendAudit.mock.calls.length;
    const mainLineCount = await AiEstimatorKnowledgeMainLineModel.countDocuments();

    await expect(service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: savedQuantity.aggregateVersion,
      name: "Rejected slab scale copy"
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.slabRates.0.quantity": expect.any(String) }
    });

    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(mainLineCount);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-sqft").lean())
      .toMatchObject({ decimalScale: 1, dependencyEpoch: 1, version: 1 });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("coordinates every copied Basket relationship and rolls back when a stale target disappeared", async () => {
    await AiEstimatorKnowledgeBasketModel.insertMany([
      basketDocument("basket-copy-scope", "Copy Scope Target", "active", 2),
      basketDocument("basket-copy-recommendation", "Copy Recommendation Target", "inactive", 3),
      basketDocument("basket-copy-advanced", "Copy Advanced Target", "active", 4)
    ]);
    const { service } = createService();
    const source = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Relationship Copy Source"
    });
    const revisionId = source.draftRevisionId!;

    const scope = await service.getSection(ACTOR, source.mainLineId, revisionId, "scope");
    await service.updateSection(ACTOR, source.mainLineId, revisionId, "scope", {
      expectedVersion: scope.version,
      expectedAggregateVersion: 1,
      payload: {
        exclusions: [{
          id: "copy-scope-inactive",
          targetBasketId: "basket-copy-scope",
          targetMainLineId: null,
          reason: "Active scope relationship",
          active: true
        }]
      }
    });
    const recommendations = await service.getSection(
      ACTOR,
      source.mainLineId,
      revisionId,
      "recommendations"
    );
    await service.updateSection(ACTOR, source.mainLineId, revisionId, "recommendations", {
      expectedVersion: recommendations.version,
      expectedAggregateVersion: 2,
      payload: {
        recommendations: [{
          id: "copy-recommendation-active",
          targetBasketId: "basket-copy-recommendation",
          targetMainLineId: "historical-recommendation-main-line",
          type: "recommended",
          priorityId: null,
          reason: "Retained inactive recommendation",
          quantityRelationship: "same_quantity",
          quantityValue: null,
          dependency: false,
          active: false
        }]
      }
    });
    const advanced = await service.getSection(ACTOR, source.mainLineId, revisionId, "advanced");
    await service.updateSection(ACTOR, source.mainLineId, revisionId, "advanced", {
      expectedVersion: advanced.version,
      expectedAggregateVersion: 3,
      payload: {
        dependencies: [{
          id: "copy-advanced-inactive",
          targetBasketId: "basket-copy-advanced",
          targetMainLineId: "historical-advanced-main-line",
          reason: "Retained inactive dependency",
          active: false
        }]
      }
    });

    for (const basketId of [
      "basket-copy-scope",
      "basket-copy-recommendation",
      "basket-copy-advanced"
    ]) {
      expect(await AiEstimatorKnowledgeBasketModel.findById(basketId).lean())
        .toMatchObject({ dependencyEpoch: 1, version: 1 });
    }

    const duplicate = await service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: 4,
      name: "Relationship Copy"
    });
    for (const basketId of [
      "basket-copy-scope",
      "basket-copy-recommendation",
      "basket-copy-advanced"
    ]) {
      expect(await AiEstimatorKnowledgeBasketModel.findById(basketId).lean())
        .toMatchObject({ dependencyEpoch: 2, version: 1 });
    }
    const copiedRelationshipSections = await AiEstimatorKnowledgeSectionModel.find({
      mainLineId: duplicate.mainLineId,
      sectionKey: { $in: ["scope", "recommendations", "advanced"] }
    }).lean();
    expect(JSON.stringify(copiedRelationshipSections)).toContain("basket-copy-scope");
    expect(JSON.stringify(copiedRelationshipSections)).toContain("basket-copy-recommendation");
    expect(JSON.stringify(copiedRelationshipSections)).toContain("basket-copy-advanced");

    await AiEstimatorKnowledgeBasketModel.deleteOne({ _id: "basket-copy-advanced" });
    await expect(service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: 4,
      name: "Rejected Stale Relationship Copy"
    })).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: "basket-carpentry"
    })).toBe(2);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-carpentry").lean())
      .toMatchObject({ dependencyEpoch: 2, version: 1 });
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-copy-scope").lean())
      .toMatchObject({ dependencyEpoch: 2, version: 1 });
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-copy-recommendation").lean())
      .toMatchObject({ dependencyEpoch: 2, version: 1 });
  });

  it("accepts a basket-only scope exclusion without treating it as an item dependency", async () => {
    await AiEstimatorKnowledgeBasketModel.create({
      _id: "basket-painting",
      name: "Painting",
      nameNormalized: "painting",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Scope Rules" });
    const scope = await service.getSection(ACTOR, created.mainLineId, created.draftRevisionId!, "scope");

    const updated = await service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "scope",
      {
        expectedVersion: scope.version,
        expectedAggregateVersion: created.version,
        payload: {
          modeIds: [],
          surfaceIds: [],
          exclusions: [{
            id: "scope-exclusion-painting",
            targetBasketId: "basket-painting",
            targetMainLineId: null,
            reason: "Handled by the painting trade.",
            active: true
          }]
        }
      }
    );

    expect(updated.payload.exclusions).toEqual([expect.objectContaining({
      targetBasketId: "basket-painting",
      targetMainLineId: null
    })]);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-painting").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "scope",
      {
        expectedVersion: updated.version,
        expectedAggregateVersion: 2,
        payload: {
          modeIds: [],
          surfaceIds: [],
          exclusions: [{
            id: "scope-exclusion-missing",
            targetBasketId: "basket-unavailable",
            targetMainLineId: null,
            reason: null,
            active: true
          }]
        }
      }
    )).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" });
    expect((await AiEstimatorKnowledgeSectionModel.findById(updated.id).lean())?.version).toBe(updated.version);
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(2);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-painting").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
  });

  it("coordinates only newly introduced Basket relationships, including inactive historical rows", async () => {
    await AiEstimatorKnowledgeBasketModel.create({
      _id: "basket-history-target",
      name: "Historical Target",
      nameNormalized: "historical target",
      description: null,
      displayOrder: 2,
      status: "inactive",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Historical Reference Source"
    });
    const scope = await service.getSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "scope"
    );
    const firstPayload = {
      modeIds: [],
      surfaceIds: [],
      exclusions: [{
        id: "inactive-history-reference",
        targetBasketId: "basket-history-target",
        targetMainLineId: null,
        reason: "Retained history",
        active: false
      }]
    };

    const first = await service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "scope",
      {
        expectedVersion: scope.version,
        expectedAggregateVersion: created.version,
        payload: firstPayload
      }
    );
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-history-target").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });

    await service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "scope",
      {
        expectedVersion: first.version,
        expectedAggregateVersion: 2,
        payload: {
          ...firstPayload,
          exclusions: [{ ...firstPayload.exclusions[0], reason: "Still retained" }]
        }
      }
    );
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-history-target").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
  });

  it("coordinates newly introduced Recommendation and Advanced Basket relationships", async () => {
    await AiEstimatorKnowledgeBasketModel.insertMany([
      basketDocument("basket-recommendation-target", "Recommendation Target", "inactive", 2),
      basketDocument("basket-advanced-target", "Advanced Target", "active", 3)
    ]);
    const { service } = createService();
    const source = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Recommendation and Advanced Source"
    });
    const revisionId = source.draftRevisionId!;
    const recommendations = await service.getSection(
      ACTOR,
      source.mainLineId,
      revisionId,
      "recommendations"
    );
    await service.updateSection(ACTOR, source.mainLineId, revisionId, "recommendations", {
      expectedVersion: recommendations.version,
      expectedAggregateVersion: 1,
      payload: {
        recommendations: [{
          id: "inactive-recommendation-reference",
          targetBasketId: "basket-recommendation-target",
          targetMainLineId: "historical-recommendation-line",
          type: "recommended",
          priorityId: null,
          reason: "Retained inactive recommendation",
          quantityRelationship: "same_quantity",
          quantityValue: null,
          dependency: false,
          active: false
        }]
      }
    });
    const advanced = await service.getSection(ACTOR, source.mainLineId, revisionId, "advanced");
    await service.updateSection(ACTOR, source.mainLineId, revisionId, "advanced", {
      expectedVersion: advanced.version,
      expectedAggregateVersion: 2,
      payload: {
        dependencies: [{
          id: "inactive-advanced-reference",
          targetBasketId: "basket-advanced-target",
          targetMainLineId: "historical-advanced-line",
          reason: "Retained inactive dependency",
          active: false
        }]
      }
    });

    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-recommendation-target").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
    expect(await AiEstimatorKnowledgeBasketModel.findById("basket-advanced-target").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
  });

  it("rejects invalid UOM precision, overlapping slabs, and rejected gaps without writes or audit", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Quantity Rules" });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: { description: "Quantity Rules", uomId: "uom-sqft", priorityId: null, surfaceIds: [], modeIds: [] }
    });
    const quantity = await service.getSection(ACTOR, created.mainLineId, revisionId, "quantity-margin");
    const auditCount = appendAudit.mock.calls.length;

    const invalidPayloads = [
      {
        quantitySlabs: [{ id: "slab-precision", minimumQuantity: "0", maximumQuantity: "1.001", adjustmentBps: 0 }],
        gapBehavior: "reject"
      },
      {
        quantitySlabs: [
          { id: "slab-overlap-a", minimumQuantity: "0", maximumQuantity: "2", adjustmentBps: 0 },
          { id: "slab-overlap-b", minimumQuantity: "1", maximumQuantity: "3", adjustmentBps: 100 }
        ],
        gapBehavior: "reject"
      },
      {
        quantitySlabs: [
          { id: "slab-gap-a", minimumQuantity: "0", maximumQuantity: "1", adjustmentBps: 0 },
          { id: "slab-gap-b", minimumQuantity: "2", maximumQuantity: null, adjustmentBps: 100 }
        ],
        gapBehavior: "reject"
      }
    ] as const;

    for (const payload of invalidPayloads) {
      await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "quantity-margin", {
        expectedVersion: quantity.version,
        expectedAggregateVersion: 2,
        payload: structuredClone(payload)
      })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
      expect((await AiEstimatorKnowledgeSectionModel.findById(quantity.id).lean())?.version).toBe(quantity.version);
      expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(2);
      expect(appendAudit).toHaveBeenCalledTimes(auditCount);
    }
  });

  it("persists priced slab inputs and protects their same-revision Specification", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Priced quantity slabs"
    });
    const revisionId = created.draftRevisionId!;
    const pricing = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing"
    );
    const savedPricing = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: created.version,
        payload: {
          specifications: [{ id: "specification-plywood", name: "Plywood" }],
          priceEntries: []
        }
      }
    );
    const quantity = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin"
    );
    const savedQuantity = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin",
      {
        expectedVersion: quantity.version,
        expectedAggregateVersion: savedPricing.aggregateVersion,
        payload: {
          slabRates: [{
            id: "slab-rate-plywood",
            specificationId: "specification-plywood",
            uomId: "uom-sqft",
            quantity: "12.5",
            unitRatePaise: 8_000
          }]
        }
      }
    );

    expect(savedQuantity.payload).toEqual({
      slabRates: [{
        id: "slab-rate-plywood",
        specificationId: "specification-plywood",
        uomId: "uom-sqft",
        quantity: "12.5",
        unitRatePaise: 8_000
      }]
    });
    expect(savedQuantity.payload.slabRates).not.toEqual([
      expect.objectContaining({ estimatedCostPaise: expect.anything() })
    ]);
    expect(await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing"
    )).toMatchObject({
      referenceState: { specificationIds: ["specification-plywood"] }
    });
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-sqft").lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });

    const auditCount = appendAudit.mock.calls.length;
    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: savedPricing.version,
        expectedAggregateVersion: savedQuantity.aggregateVersion,
        payload: { specifications: [], priceEntries: [] }
      }
    )).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REFERENCE_INVALID",
      fields: {
        "payload.specifications": expect.stringContaining("priced quantity slab")
      }
    });
    expect((await AiEstimatorKnowledgeSectionModel.findById(savedPricing.id).lean())?.payload)
      .toMatchObject({ specifications: [{ id: "specification-plywood" }] });
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version)
      .toBe(savedQuantity.aggregateVersion);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("rejects dangling Specifications, inactive UOMs, precision overflow, and unsafe slab costs atomically", async () => {
    await AiEstimatorKnowledgeUomModel.create({
      _id: "uom-inactive",
      code: "INACTIVE",
      codeNormalized: "inactive",
      name: "Inactive UOM",
      nameNormalized: "inactive uom",
      description: null,
      decimalScale: 2,
      displayOrder: 2,
      status: "inactive",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Invalid priced quantity slabs"
    });
    const revisionId = created.draftRevisionId!;
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    const savedPricing = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: created.version,
        payload: {
          specifications: [{ id: "specification-plywood", name: "Plywood" }],
          priceEntries: []
        }
      }
    );
    const quantity = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin"
    );
    const invalidRows = [
      {
        id: "slab-rate-missing-specification",
        specificationId: "specification-missing",
        uomId: "uom-sqft",
        quantity: "1",
        unitRatePaise: 100
      },
      {
        id: "slab-rate-inactive-uom",
        specificationId: "specification-plywood",
        uomId: "uom-inactive",
        quantity: "1",
        unitRatePaise: 100
      },
      {
        id: "slab-rate-precision",
        specificationId: "specification-plywood",
        uomId: "uom-sqft",
        quantity: "1.001",
        unitRatePaise: 100
      },
      {
        id: "slab-rate-overflow",
        specificationId: "specification-plywood",
        uomId: "uom-sqft",
        quantity: "2",
        unitRatePaise: Number.MAX_SAFE_INTEGER
      }
    ];
    const auditCount = appendAudit.mock.calls.length;

    for (const slabRate of invalidRows) {
      await expect(service.updateSection(
        ACTOR,
        created.mainLineId,
        revisionId,
        "quantity-margin",
        {
          expectedVersion: quantity.version,
          expectedAggregateVersion: savedPricing.aggregateVersion,
          payload: { slabRates: [slabRate] }
        }
      )).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR"
      });
      expect((await AiEstimatorKnowledgeSectionModel.findById(quantity.id).lean())?.version)
        .toBe(quantity.version);
      expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version)
        .toBe(savedPricing.aggregateVersion);
      expect(appendAudit).toHaveBeenCalledTimes(auditCount);
    }
  });

  it("retains an unavailable saved slab UOM during Draft edits but blocks activation", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Unavailable saved slab UOM"
    });
    const revisionId = created.draftRevisionId!;
    const pricing = await service.getSection(ACTOR, created.mainLineId, revisionId, "pricing");
    const savedPricing = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: created.version,
        payload: {
          specifications: [{ id: "specification-plywood", name: "Plywood" }],
          priceEntries: []
        }
      }
    );
    const quantity = await service.getSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin"
    );
    const savedQuantity = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin",
      {
        expectedVersion: quantity.version,
        expectedAggregateVersion: savedPricing.aggregateVersion,
        payload: {
          slabRates: [{
            id: "slab-rate-plywood",
            specificationId: "specification-plywood",
            uomId: "uom-sqft",
            quantity: "1.5",
            unitRatePaise: 8_000
          }]
        }
      }
    );
    await AiEstimatorKnowledgeUomModel.updateOne(
      { _id: "uom-sqft" },
      { $set: { status: "inactive" } }
    ).exec();

    const retained = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "quantity-margin",
      {
        expectedVersion: savedQuantity.version,
        expectedAggregateVersion: savedQuantity.aggregateVersion,
        payload: {
          slabRates: [{
            id: "slab-rate-plywood",
            specificationId: "specification-plywood",
            uomId: "uom-sqft",
            quantity: "2.5",
            unitRatePaise: 9_000
          }]
        }
      }
    );
    expect(retained.payload).toMatchObject({
      slabRates: [{ uomId: "uom-sqft", quantity: "2.5", unitRatePaise: 9_000 }]
    });
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.activate(ACTOR, created.mainLineId, revisionId, {
      expectedVersion: retained.aggregateVersion
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean())
      .toMatchObject({ status: "draft" });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("rejects irrelevant quality fields without changing the Draft", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Quality Rules" });
    const quality = await service.getSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "quality"
    );
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "quality",
      {
        expectedVersion: quality.version,
        expectedAggregateVersion: created.version,
        payload: {
          parameters: [{
            id: "quality-text",
            type: "text",
            label: "Finish",
            unit: "mm",
            allowedValues: [],
            minimum: null,
            maximum: null,
            defaultValue: null,
            required: true,
            category: null,
            active: true
          }]
        }
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { "payload.parameters.0.minimum": expect.stringMatching(/Numeric bounds and unit/u) }
    });
    expect((await AiEstimatorKnowledgeSectionModel.findById(quality.id).lean())?.version).toBe(quality.version);
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(created.version);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("rejects invalid execution and productivity numeric ranges atomically", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Execution Rules" });
    const execution = await service.getSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution"
    );
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution",
      {
        expectedVersion: execution.version,
        expectedAggregateVersion: created.version,
        payload: {
          steps: [{
            id: "step-invalid",
            order: 0,
            name: "Invalid execution",
            description: null,
            durationValue: "1.0000001",
            durationUnit: "days",
            crewSize: 0,
            skillType: null,
            mandatory: true,
            parallelizable: false,
            active: true,
            dependencyStepIds: []
          }],
          productivity: [{
            id: "productivity-invalid",
            value: "0.001",
            uomId: "uom-sqft",
            crewSize: 0,
            skillType: null,
            minimumDuration: "2",
            maximumDuration: "1",
            durationUnit: "days",
            active: true
          }]
        }
      }
    )).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect((await AiEstimatorKnowledgeSectionModel.findById(execution.id).lean())?.version).toBe(execution.version);
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(created.version);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("validates every productivity-row UOM reference inside the transaction", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Productivity References" });
    const execution = await service.getSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution"
    );
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution",
      {
        expectedVersion: execution.version,
        expectedAggregateVersion: created.version,
        payload: {
          productivity: [
            {
              id: "productivity-valid",
              value: "1.25",
              uomId: "uom-sqft",
              crewSize: 2,
              skillType: "Carpenter",
              minimumDuration: "1",
              maximumDuration: "2",
              durationUnit: "hours",
              active: true
            },
            {
              id: "productivity-missing-uom",
              value: "2",
              uomId: "uom-unavailable",
              crewSize: 1,
              skillType: null,
              minimumDuration: null,
              maximumDuration: null,
              durationUnit: "hours",
              active: true
            }
          ]
        }
      }
    )).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" });
    expect((await AiEstimatorKnowledgeSectionModel.findById(execution.id).lean())?.version).toBe(execution.version);
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(created.version);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("rejects active productivity values exceeding their referenced UOM precision", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Productivity Precision" });
    const execution = await service.getSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution"
    );
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(
      ACTOR,
      created.mainLineId,
      created.draftRevisionId!,
      "execution",
      {
        expectedVersion: execution.version,
        expectedAggregateVersion: created.version,
        payload: {
          productivity: [{
            id: "productivity-too-precise",
            value: "1.001",
            uomId: "uom-sqft",
            crewSize: 1,
            skillType: null,
            minimumDuration: null,
            maximumDuration: null,
            durationUnit: "hours",
            active: true
          }]
        }
      }
    )).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect((await AiEstimatorKnowledgeSectionModel.findById(execution.id).lean())?.version).toBe(execution.version);
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(created.version);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("rolls back an Overview UOM change that invalidates existing quantity slabs", async () => {
    await AiEstimatorKnowledgeUomModel.create({
      _id: "uom-nos",
      code: "NOS",
      codeNormalized: "nos",
      name: "Numbers",
      nameNormalized: "numbers",
      description: null,
      decimalScale: 0,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "UOM Change" });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: { description: "UOM Change", uomId: "uom-sqft", priorityId: null, surfaceIds: [], modeIds: [] }
    });
    const quantity = await service.getSection(ACTOR, created.mainLineId, revisionId, "quantity-margin");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "quantity-margin", {
      expectedVersion: quantity.version,
      expectedAggregateVersion: 2,
      payload: {
        quantitySlabs: [{ id: "slab-decimal", minimumQuantity: "0", maximumQuantity: "1.5", adjustmentBps: 0 }],
        gapBehavior: "no_adjustment"
      }
    });
    const currentOverview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: currentOverview.version,
      expectedAggregateVersion: 3,
      payload: { description: "UOM Change", uomId: "uom-nos", priorityId: null, surfaceIds: [], modeIds: [] }
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect((await AiEstimatorKnowledgeSectionModel.findById(currentOverview.id).lean())?.payload)
      .toMatchObject({ uomId: "uom-sqft" });
    expect((await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())?.version).toBe(3);
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("revalidates cross-section quantity precision at activation", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", { name: "Activation Validation" });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: { description: "Activation Validation", uomId: "uom-sqft", priorityId: null, surfaceIds: [], modeIds: [] }
    });
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { mainLineId: created.mainLineId, revisionId, sectionKey: "quantity-margin" },
      {
        $set: {
          applicability: "configured",
          payload: {
            quantitySlabs: [{ id: "legacy-invalid", minimumQuantity: "0", maximumQuantity: "1.001", adjustmentBps: 0 }],
            gapBehavior: "reject"
          }
        }
      }
    ).exec();
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.activate(ACTOR, created.mainLineId, revisionId, { expectedVersion: 2 }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean()).toMatchObject({ status: "draft" });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())
      .toMatchObject({ status: "draft", draftRevisionId: revisionId, activeRevisionId: null, version: 2 });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);
  });

  it("blocks activation until an unscoped canonical Execution recovery row is assigned or removed", async () => {
    const { service, appendAudit } = createService();
    const created = await service.createMainLine(ACTOR, "basket-carpentry", {
      name: "Execution activation recovery"
    });
    const revisionId = created.draftRevisionId!;
    const overview = await service.getSection(ACTOR, created.mainLineId, revisionId, "overview");
    await service.updateSection(ACTOR, created.mainLineId, revisionId, "overview", {
      expectedVersion: overview.version,
      expectedAggregateVersion: created.version,
      payload: {
        description: "Execution activation recovery",
        uomId: "uom-sqft",
        priorityId: null,
        surfaceIds: [],
        modeIds: []
      }
    });
    const advanced = await service.getSection(ACTOR, created.mainLineId, revisionId, "advanced");
    const recoveryConfiguration = {
      id: "configuration-execution-activation-recovery",
      modeKind: "execution",
      fields: [{
        id: "field-execution-activation-recovery",
        type: "text",
        label: "Recovery field",
        options: []
      }]
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: advanced.id },
      {
        $set: {
          applicability: "configured",
          payload: { modeConfigurations: [recoveryConfiguration] }
        }
      }
    ).exec();
    const auditCount = appendAudit.mock.calls.length;

    await expect(service.activate(
      ACTOR,
      created.mainLineId,
      revisionId,
      { expectedVersion: 2 }
    )).rejects.toMatchObject({
      status: 422,
      code: "KNOWLEDGE_ACTIVATION_BLOCKED",
      fields: {
        activation: expect.stringContaining("UNSCOPED_EXECUTION_RECOVERY_REQUIRED")
      }
    });
    expect(await AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean())
      .toMatchObject({ status: "draft" });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(created.mainLineId).lean())
      .toMatchObject({
        status: "draft",
        draftRevisionId: revisionId,
        activeRevisionId: null,
        version: 2
      });
    expect(await AiEstimatorKnowledgeSectionModel.findById(advanced.id).lean())
      .toMatchObject({
        applicability: "configured",
        payload: { modeConfigurations: [recoveryConfiguration] }
      });
    expect(appendAudit).toHaveBeenCalledTimes(auditCount);

    const assigned = await service.updateSection(
      ACTOR,
      created.mainLineId,
      revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: 2,
        applicability: "configured",
        payload: {
          modeConfigurations: [{
            ...recoveryConfiguration,
            executionSource: "sub_vendor"
          }]
        }
      }
    );
    const activated = await service.activate(
      ACTOR,
      created.mainLineId,
      revisionId,
      { expectedVersion: assigned.aggregateVersion }
    );
    expect(activated).toMatchObject({
      status: "active",
      activeRevision: { id: revisionId, status: "active" },
      draftRevision: null
    });
  });
});

function createService() {
  let sequence = 0;
  const appendAudit = vi.fn(async () => ({ id: `audit-${sequence}` }));
  const actorGuard = {
    requireReadActor: vi.fn(async () => ({ id: ACTOR.id, role: ACTOR.role })),
    requireMutationActor: vi.fn(async () => ({ id: ACTOR.id, role: ACTOR.role }))
  };
  return {
    appendAudit,
    service: createAiEstimatorKnowledgeItemService({
      audit: { appendInMongoTransaction: appendAudit } as never,
      actorGuard,
      now: () => NOW,
      uuid: () => `generated-${++sequence}`
    })
  };
}

async function expectMainLineOrder(mainLineId: string, displayOrder: number): Promise<void> {
  expect(await AiEstimatorKnowledgeMainLineModel.findById(mainLineId).lean())
    .toMatchObject({ displayOrder });
}

function basketDocument(
  id: string,
  name: string,
  status: "active" | "inactive",
  displayOrder: number
) {
  return {
    _id: id,
    name,
    nameNormalized: name.toLowerCase(),
    description: null,
    displayOrder,
    status,
    version: 1,
    createdById: ACTOR.id,
    updatedById: ACTOR.id,
    createdAt: NOW,
    updatedAt: NOW
  };
}

async function seedReferences(): Promise<void> {
  await Promise.all([
    AiEstimatorKnowledgePriorityModel.insertMany(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => ({
        _id: priority.id,
        code: priority.code,
        codeNormalized: priority.code.toLowerCase(),
        name: priority.name,
        nameNormalized: priority.name.toLowerCase(),
        description: null,
        displayOrder: priority.displayOrder,
        status: "active",
        semanticTier: priority.semanticTier,
        version: 1,
        createdById: ACTOR.id,
        updatedById: ACTOR.id,
        createdAt: NOW,
        updatedAt: NOW
      }))
    ),
    AiEstimatorKnowledgeBasketModel.create({
      _id: "basket-carpentry",
      name: "Carpentry",
      nameNormalized: "carpentry",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeModeModel.create({
      _id: "mode-pmc",
      code: "PMC",
      codeNormalized: "pmc",
      name: "PMC",
      nameNormalized: "pmc",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeModeModel.create({
      _id: "mode-execution",
      code: "EXECUTION",
      codeNormalized: "execution",
      name: "Execution",
      nameNormalized: "execution",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeUomModel.create({
      _id: "uom-sqft",
      code: "SQFT",
      codeNormalized: "sqft",
      name: "Square foot",
      nameNormalized: "square foot",
      description: null,
      decimalScale: 2,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeVendorModel.create({
      _id: "vendor-local",
      code: "LOCAL",
      codeNormalized: "local",
      name: "Local Vendor",
      nameNormalized: "local vendor",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeTaxRuleModel.create({
      _id: "tax-gst",
      code: "GST18",
      codeNormalized: "gst18",
      name: "GST 18%",
      nameNormalized: "gst 18%",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeTaxVersionModel.create({
      _id: "tax-gst-v1",
      taxRuleId: "tax-gst",
      versionNumber: 1,
      rateBps: 1_800,
      treatment: "inclusive",
      applicability: "interior work",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      status: "active",
      version: 1,
      createdById: ACTOR.id,
      updatedById: ACTOR.id,
      createdAt: NOW,
      updatedAt: NOW
    })
  ]);
}
