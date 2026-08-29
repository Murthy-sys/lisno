import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
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
    AiEstimatorKnowledgePriceVersionModel.syncIndexes(),
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
          specificationId: "spec-plywood",
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
          specificationId: "spec-tv",
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
          specificationId: "spec-replacement",
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
      specificationId: "spec-replacement",
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

    const duplicate = await service.duplicate(ACTOR, source.mainLineId, {
      expectedVersion: source.version,
      name: "Successful duplicate"
    });
    await expectMainLineOrder(duplicate.mainLineId, 1);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: "basket-carpentry"
    })).toBe(2);
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

async function seedReferences(): Promise<void> {
  await Promise.all([
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
