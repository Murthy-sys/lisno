import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES,
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS
} from "../src/domain/ai-estimator-knowledge-priority.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import type { KnowledgeSectionKey } from "../src/domain/ai-estimator-knowledge.js";
import { authorizationSnapshotFor, type AuthService, type PublicUser } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
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
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeAdminRouter } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import {
  createAiEstimatorKnowledgeItemService,
  type AiEstimatorKnowledgeItemService
} from "../src/services/ai-estimator-knowledge-item.service.js";
import {
  createAiEstimatorKnowledgeReferenceService
} from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-28T10:00:00.000Z");
const BASKET_ID = "integration-basket-carpentry";
const UOM_ID = "integration-uom-sqft";
const VENDOR_ID = "integration-vendor-local";
const TAX_RULE_ID = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id;
const TAX_VERSION_ID = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id;
const PMC_MODE_ID = "integration-mode-pmc";
const EXECUTION_MODE_ID = "integration-mode-execution";

const SUPER_ADMIN: PublicUser = {
  id: "integration-super-admin",
  name: "Sole Knowledge Administrator",
  email: "sole-admin@integration.invalid",
  role: "super_admin"
};

const STALE_ADMIN_TOKEN: PublicUser = {
  ...SUPER_ADMIN,
  role: "admin"
};

const ADMIN: PublicUser = {
  id: "integration-admin",
  name: "Asymmetric Administrator",
  email: "admin@integration.invalid",
  role: "admin"
};

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;

beforeAll(async () => {
  replica = await startMongoReplicaSet("ai-estimator-knowledge-integration");
  await Promise.all([
    AuditEventModel.syncIndexes(),
    AiEstimatorKnowledgeBasketModel.syncIndexes(),
    AiEstimatorKnowledgeDisplayOrderSequenceModel.syncIndexes(),
    AiEstimatorKnowledgeMainLineModel.syncIndexes(),
    AiEstimatorKnowledgeModeModel.syncIndexes(),
    AiEstimatorKnowledgePriceVersionModel.syncIndexes(),
    AiEstimatorKnowledgePriorityModel.syncIndexes(),
    AiEstimatorKnowledgeRevisionModel.syncIndexes(),
    AiEstimatorKnowledgeSectionModel.syncIndexes(),
    AiEstimatorKnowledgeSurfaceModel.syncIndexes(),
    AiEstimatorKnowledgeTaxRuleModel.syncIndexes(),
    AiEstimatorKnowledgeTaxVersionModel.syncIndexes(),
    AiEstimatorKnowledgeUomModel.syncIndexes(),
    AiEstimatorKnowledgeVendorModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  sequence = 0;
  await replica.clear();
  await seedActor(SUPER_ADMIN);
  await seedKnowledgeReferences();
});

afterAll(async () => {
  await replica.stop();
});

describe("AI estimator knowledge integrated replica-set invariants", { timeout: 30_000 }, () => {
  it("reloads the stored actor for reads and mutations and requires exactly one active Super Admin", async () => {
    const services = createServices();

    await UserModel.updateOne({ _id: SUPER_ADMIN.id }, { $set: { active: false } }).exec();
    await expect(services.reference.getBasketDeletionImpact(SUPER_ADMIN, BASKET_ID))
      .rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    await expect(services.reference.permanentlyDeleteBasket(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: 1,
      confirmationName: "Carpentry",
      reason: "   "
    })).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    await expect(services.reference.listBaskets(SUPER_ADMIN, {}, page()))
      .rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    await expect(services.reference.createBasket(SUPER_ADMIN, { name: "Forbidden inactive write" }))
      .rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "forbidden inactive write" }))
      .toBe(0);

    await UserModel.updateOne({ _id: SUPER_ADMIN.id }, { $set: { active: true } }).exec();
    await expect(services.reference.listBaskets(STALE_ADMIN_TOKEN, {}, page()))
      .rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });

    await seedActor({
      id: "integration-second-super-admin",
      name: "Unexpected Second Super Admin",
      email: "second-admin@integration.invalid",
      role: "super_admin"
    });
    await expect(services.reference.listBaskets(SUPER_ADMIN, {}, page()))
      .rejects.toMatchObject({ status: 409, code: "SOLE_SUPER_ADMIN_REQUIRED" });
    await expect(services.reference.createBasket(SUPER_ADMIN, { name: "Forbidden ambiguous write" }))
      .rejects.toMatchObject({ status: 409, code: "SOLE_SUPER_ADMIN_REQUIRED" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "forbidden ambiguous write" }))
      .toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
  });

  it("returns 403 before validating an unauthorized malformed route body", async () => {
    await seedActor(ADMIN);
    const services = createServices();
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createAiEstimatorKnowledgeAdminRouter(authFor(ADMIN), services));
    app.use(errorHandler);

    const before = await persistentStateCounts();
    const response = await request(app)
      .post("/api/v1/admin/ai-estimator-knowledge/baskets")
      .set("Authorization", "Bearer admin-token")
      .send({ name: "", displayOrder: -1, unexpected: true });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You are not authorized to perform this action."
      }
    });
    expect(await persistentStateCounts()).toEqual(before);
  });

  it("allows one concurrent CAS writer and commits exactly one matching audit event", async () => {
    const { reference } = createServices();
    const basket = await reference.createBasket(SUPER_ADMIN, { name: "Electrical" });

    const results = await Promise.allSettled([
      reference.updateBasket(SUPER_ADMIN, basket.id, {
        expectedVersion: 1,
        description: "Writer alpha"
      }),
      reference.updateBasket(SUPER_ADMIN, basket.id, {
        expectedVersion: 1,
        description: "Writer beta"
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "VERSION_CONFLICT" }
    });
    const stored = await AiEstimatorKnowledgeBasketModel.findById(basket.id).lean().exec();
    expect(stored?.version).toBe(2);
    expect(["Writer alpha", "Writer beta"]).toContain(stored?.description);
    expect(await AuditEventModel.countDocuments({
      entityId: basket.id,
      action: "ai_estimator_knowledge_basket_updated"
    })).toBe(1);

    await expect(reference.updateBasket(SUPER_ADMIN, basket.id, {
      expectedVersion: 1,
      displayOrder: 50
    })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    const afterStaleReorder = await reference.createBasket(SUPER_ADMIN, {
      name: "After stale reorder"
    });
    expect(afterStaleReorder.displayOrder).toBe(3);
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("baskets")
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 3 });
  });

  it("allocates Basket and reusable-value orders from isolated historical high-water scopes", async () => {
    const { reference } = createServices();
    await AiEstimatorKnowledgeBasketModel.create({
      _id: "integration-basket-archived-maximum",
      name: "Archived maximum",
      nameNormalized: "archived maximum",
      description: null,
      displayOrder: 10,
      status: "archived",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      archivedAt: NOW,
      archivedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW
    });

    const automatic = await reference.createBasket(SUPER_ADMIN, {
      name: "Automatic Basket"
    });
    await expect(reference.createBasket(SUPER_ADMIN, {
      name: "Automatic Basket"
    })).rejects.toMatchObject({ status: 409, code: "DUPLICATE_IDENTITY" });
    const afterIdentityConflict = await reference.createBasket(SUPER_ADMIN, {
      name: "After identity conflict"
    });
    const explicit = await reference.createBasket(SUPER_ADMIN, {
      name: "Explicit Basket",
      displayOrder: 50
    });
    await reference.updateBasket(SUPER_ADMIN, explicit.id, {
      expectedVersion: explicit.version,
      displayOrder: 2
    });
    const afterLowerReorder = await reference.createBasket(SUPER_ADMIN, {
      name: "After lower reorder"
    });

    expect(automatic.displayOrder).toBe(11);
    expect(afterIdentityConflict.displayOrder).toBe(12);
    expect(afterLowerReorder.displayOrder).toBe(51);
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("baskets")
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 51 });

    const [uom, vendor] = await Promise.all([
      reference.createMaster(SUPER_ADMIN, "uoms", {
        code: "LM",
        name: "Linear metre",
        decimalScale: 2
      }),
      reference.createMaster(SUPER_ADMIN, "vendors", {
        code: "PREMIUM",
        name: "Premium Vendor"
      })
    ]);
    expect({ uom: uom.displayOrder, vendor: vendor.displayOrder }).toEqual({
      uom: 2,
      vendor: 2
    });
    const createdAudit = await AuditEventModel.findOne({
      action: "ai_estimator_knowledge_basket_created",
      entityId: automatic.id
    }).lean().exec();
    expect(createdAudit?.newValues).toMatchObject({ displayOrder: 11 });
  });

  it("serializes concurrent automatic creates while keeping Main Line scopes Basket-local", async () => {
    const services = createServices();
    const concurrentBaskets = await Promise.all([
      services.reference.createBasket(SUPER_ADMIN, { name: "Concurrent Basket A" }),
      services.reference.createBasket(SUPER_ADMIN, { name: "Concurrent Basket B" })
    ]);
    expect(
      concurrentBaskets.map((basket) => basket.displayOrder).toSorted((left, right) => left - right)
    ).toEqual([2, 3]);

    const firstBasketLines = await Promise.all([
      services.item.createMainLine(SUPER_ADMIN, BASKET_ID, { name: "Concurrent Line A" }),
      services.item.createMainLine(SUPER_ADMIN, BASKET_ID, { name: "Concurrent Line B" })
    ]);
    const firstBasketRows = await AiEstimatorKnowledgeMainLineModel.find({
      _id: { $in: firstBasketLines.map((line) => line.mainLineId) }
    }).sort({ displayOrder: 1 }).lean().exec();
    expect(firstBasketRows.map((line) => line.displayOrder)).toEqual([0, 1]);

    const secondBasketLine = await services.item.createMainLine(
      SUPER_ADMIN,
      concurrentBaskets[0]!.id,
      { name: "Independent Basket Line" }
    );
    await expect(
      AiEstimatorKnowledgeMainLineModel.findById(secondBasketLine.mainLineId)
        .lean()
        .exec()
    ).resolves.toMatchObject({ displayOrder: 0 });
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById(`main-lines:${BASKET_ID}`)
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 1 });
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById(
        `main-lines:${concurrentBaskets[0]!.id}`
      )
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 0 });
  });

  it("honors explicit Main Line compatibility orders without lowering Basket high-water", async () => {
    const { item } = createServices();
    const explicit = await item.createMainLine(SUPER_ADMIN, BASKET_ID, {
      name: "Explicit ordered line",
      displayOrder: 10
    });
    await item.updateMainLine(SUPER_ADMIN, explicit.mainLineId, {
      expectedVersion: explicit.version,
      displayOrder: 2
    });
    const automatic = await item.createMainLine(SUPER_ADMIN, BASKET_ID, {
      name: "Automatic after lower reorder"
    });

    await expect(
      AiEstimatorKnowledgeMainLineModel.findById(automatic.mainLineId)
        .lean()
        .exec()
    ).resolves.toMatchObject({ displayOrder: 11 });
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById(`main-lines:${BASKET_ID}`)
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 11 });
    const createdAudit = await AuditEventModel.findOne({
      action: "ai_estimator_knowledge_main_line_created",
      entityId: automatic.mainLineId
    }).lean().exec();
    expect(createdAudit?.newValues).toMatchObject({
      basketId: BASKET_ID,
      displayOrder: 11
    });
  });

  it("rolls back the business write, coordination, and audit when audit persistence fails", async () => {
    const reference = createAiEstimatorKnowledgeReferenceService({
      audit: {
        appendInMongoTransaction: async () => {
          throw new Error("injected audit outage");
        }
      },
      now: () => NOW,
      createId: nextId
    });

    await expect(reference.createBasket(SUPER_ADMIN, { name: "Must roll back" }))
      .rejects.toThrow("injected audit outage");
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "must roll back" }))
      .toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);

    const recovered = await createServices().reference.createBasket(SUPER_ADMIN, {
      name: "Recovered after audit outage"
    });
    expect(recovered.displayOrder).toBe(2);
    await expect(
      AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("baskets")
        .lean()
        .exec()
    ).resolves.toMatchObject({ highWaterOrder: 2 });
  });

  it("rolls back Main Line aggregate children and order allocation when audit persistence fails", async () => {
    const failingItem = createAiEstimatorKnowledgeItemService({
      audit: {
        appendInMongoTransaction: async () => {
          throw new Error("injected Main Line audit outage");
        }
      },
      now: () => NOW,
      uuid: nextId
    });

    await expect(
      failingItem.createMainLine(SUPER_ADMIN, BASKET_ID, {
        name: "Must roll back Main Line"
      })
    ).rejects.toBeDefined();
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(0);
    expect(
      await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments({
        _id: `main-lines:${BASKET_ID}`
      })
    ).toBe(0);

    const recovered = await createServices().item.createMainLine(
      SUPER_ADMIN,
      BASKET_ID,
      { name: "Recovered Main Line" }
    );
    await expect(
      AiEstimatorKnowledgeMainLineModel.findById(recovered.mainLineId)
        .lean()
        .exec()
    ).resolves.toMatchObject({ displayOrder: 0 });
  });

  it("rejects exhausted Basket and Main Line scopes without partial resources, children, audits, or sequence changes", async () => {
    await AiEstimatorKnowledgeDisplayOrderSequenceModel.create([
      { _id: "baskets", highWaterOrder: Number.MAX_SAFE_INTEGER },
      {
        _id: `main-lines:${BASKET_ID}`,
        highWaterOrder: Number.MAX_SAFE_INTEGER
      }
    ]);
    const services = createServices();

    await expect(services.reference.createBasket(SUPER_ADMIN, {
      name: "Exhausted Basket"
    })).rejects.toMatchObject({
      status: 409,
      code: "DISPLAY_ORDER_EXHAUSTED"
    });
    await expect(services.item.createMainLine(SUPER_ADMIN, BASKET_ID, {
      name: "Exhausted Main Line"
    })).rejects.toMatchObject({
      status: 409,
      code: "DISPLAY_ORDER_EXHAUSTED"
    });

    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({
      nameNormalized: "exhausted basket"
    })).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    const sequences = await AiEstimatorKnowledgeDisplayOrderSequenceModel.find({})
      .sort({ _id: 1 })
      .lean()
      .exec();
    expect(sequences).toHaveLength(2);
    expect(sequences.every(
      (sequenceRow) => sequenceRow.highWaterOrder === Number.MAX_SAFE_INTEGER
    )).toBe(true);
  });

  it("protects fixed GST, rejects overlapping price windows atomically, and resolves exact non-leaking lineage", async () => {
    const services = createServices();
    await expect(services.reference.updateMaster(SUPER_ADMIN, "taxes", TAX_RULE_ID, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 1_800,
        treatment: "exclusive",
        applicability: "overlapping interior work",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    })).rejects.toMatchObject({ status: 409, code: "CANONICAL_TAX_POLICY_IMMUTABLE" });
    expect((await AiEstimatorKnowledgeTaxRuleModel.findById(TAX_RULE_ID).lean().exec())?.version).toBe(1);
    expect(await AiEstimatorKnowledgeTaxVersionModel.countDocuments({ taxRuleId: TAX_RULE_ID })).toBe(1);

    const draft = await createConfiguredDraft(services.item, "Context Wardrobe", { withPrice: true });
    const pricing = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    );
    const firstEntry = (pricing.payload.priceEntries as Array<{
      operation: "reference";
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;
    const firstReference = {
      operation: firstEntry.operation,
      priceEntryId: firstEntry.priceEntryId,
      priceVersionId: firstEntry.priceVersionId
    };
    const auditCountBeforeOverlap = await AuditEventModel.countDocuments();
    await expect(services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: draft.aggregateVersion,
        payload: {
          specifications: [{ id: "spec-standard", name: "Standard" }],
          internalVendorNotes: "commercially sensitive",
          priceEntries: [
            firstReference,
            priceCommand("price-entry-overlap", "2026-09-02T00:00:00.000Z")
          ]
        }
      }
    )).rejects.toMatchObject({ status: 409, code: "EFFECTIVE_WINDOW_OVERLAP" });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({ revisionId: draft.revisionId })).toBe(1);
    expect((await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    )).version).toBe(pricing.version);
    expect(await AuditEventModel.countDocuments()).toBe(auditCountBeforeOverlap);

    const configuredPricing = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: draft.aggregateVersion,
        payload: {
          specifications: [
            {
              id: "spec-standard",
              name: "Board grade",
              description: "Use the approved board grade."
            },
            {
              id: "spec-private-other",
              name: "Other internal guidance",
              description: "Only returned when explicitly selected."
            }
          ],
          brands: [{ id: "brand-public", name: "Public brand" }],
          technicalDescription: "Public technical detail",
          qualityLevel: "Premium",
          internalVendorNotes: "commercially sensitive",
          priceEntries: [firstReference]
        }
      }
    );

    const quantityMargin = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "quantity-margin"
    );
    const configuredQuantityMargin = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "quantity-margin",
      {
        expectedVersion: quantityMargin.version,
        expectedAggregateVersion: configuredPricing.aggregateVersion,
        payload: {
          slabRates: [{
            id: "slab-rate-context-boundary",
            specificationId: "spec-standard",
            uomId: UOM_ID,
            quantity: "2",
            unitRatePaise: 1
          }]
        }
      }
    );

    const active = await services.item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
      expectedVersion: configuredQuantityMargin.aggregateVersion
    });
    const price = await AiEstimatorKnowledgePriceVersionModel.findOne({
      revisionId: draft.revisionId,
      status: "active"
    }).lean().exec();
    const beforeContext = await persistentStateCounts();
    const context = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "2.00",
      uomId: UOM_ID
    });

    expect(context.lineage).toMatchObject({
      mainLineId: draft.mainLineId,
      revisionId: draft.revisionId,
      revisionNumber: 1,
      priceVersionId: price?._id,
      taxVersionId: TAX_VERSION_ID,
      formulaVersion: "knowledge-preview-v1",
      contentDigest: active.activeRevision?.contentDigest
    });
    expect(context.preview).toMatchObject({
      effectivePriceVersionId: price?._id,
      taxVersionId: TAX_VERSION_ID,
      effectiveUnitRatePaise: 10_000,
      vendorPreTax: { amountPaise: 20_000 },
      vendorTax: { amountPaise: 3_600 },
      vendorTotal: { amountPaise: 23_600 }
    });
    expect(context.preview?.effectiveUnitRatePaise).not.toBe(1);
    expect(context.sections.pricing).not.toHaveProperty("internalVendorNotes");
    expect(context.sections.pricing).not.toHaveProperty("priceEntries");
    expect(context.sections.pricing).toEqual({
      specifications: [{
        id: "spec-standard",
        name: "Board grade",
        description: "Use the approved board grade."
      }],
      brands: [{ id: "brand-public", name: "Public brand" }],
      technicalDescription: "Public technical detail",
      qualityLevel: "Premium"
    });
    expect(JSON.stringify(context)).not.toContain("spec-private-other");
    expect(JSON.stringify(context)).not.toContain("commercially sensitive");
    expect(JSON.stringify(context)).not.toContain(SUPER_ADMIN.id);
    expect(await persistentStateCounts()).toEqual(beforeContext);
  });

  it("commits exactly one concurrent same-scope Budget command without orphan versions or audits", async () => {
    const services = createServices();
    const alternateVendor = await services.reference.createMaster(SUPER_ADMIN, "vendors", {
      code: "BUDGET-ALT",
      name: "Alternate Budget Vendor"
    });
    const draft = await createConfiguredDraft(
      services.item,
      "Concurrent Budget Wardrobe"
    );
    const pricing = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    );
    const command = (vendorId: string, inputAmountPaise: number) => ({
      operation: "set_budget" as const,
      vendorId,
      uomId: UOM_ID,
      inputAmountPaise,
      effectiveFrom: "2026-08-28T00:00:00.000Z",
      effectiveTo: null
    });

    const results = await Promise.allSettled([
      services.item.updateSection(
        SUPER_ADMIN,
        draft.mainLineId,
        draft.revisionId,
        "pricing",
        {
          expectedVersion: pricing.version,
          expectedAggregateVersion: draft.aggregateVersion,
          payload: { priceEntries: [command(VENDOR_ID, 11_800)] }
        }
      ),
      services.item.updateSection(
        SUPER_ADMIN,
        draft.mainLineId,
        draft.revisionId,
        "pricing",
        {
          expectedVersion: pricing.version,
          expectedAggregateVersion: draft.aggregateVersion,
          payload: { priceEntries: [command(alternateVendor.id, 17_500)] }
        }
      )
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "VERSION_CONFLICT" }
    });
    const prices = await AiEstimatorKnowledgePriceVersionModel.find({
      revisionId: draft.revisionId
    }).lean().exec();
    expect(prices).toHaveLength(1);
    expect([VENDOR_ID, alternateVendor.id]).toContain(prices[0]?.vendorId);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_price_version_created",
      "newValues.revisionId": draft.revisionId
    })).toBe(1);
    const persistedPricing = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    );
    expect(persistedPricing.payload.priceEntries).toEqual([
      expect.objectContaining({
        operation: "reference",
        priceVersionId: prices[0]?._id
      })
    ]);
  });

  it.each([
    ["vendors", "Vendor"],
    ["uoms", "UOM"]
  ] as const)(
    "serializes a first Budget %s reference against archive in both commit orders",
    async (masterType, label) => {
      const base = createServices();
      const createTarget = async (suffix: string) => base.reference.createMaster(
        SUPER_ADMIN,
        masterType,
        {
          code: `${label.toUpperCase()}-${suffix}`,
          name: `${label} ${suffix}`,
          ...(masterType === "uoms" ? { decimalScale: 2 } : {}),
        }
      );
      const budgetCommand = (targetId: string) => ({
        operation: "set_budget" as const,
        vendorId: masterType === "vendors" ? targetId : VENDOR_ID,
        uomId: masterType === "uoms" ? targetId : UOM_ID,
        inputAmountPaise: 10_000,
        effectiveFrom: "2026-08-28T00:00:00.000Z",
        effectiveTo: null
      });

      const archiveFirstTarget = await createTarget("archive-first");
      await clearBudgetRaceDependencyEpoch(masterType, archiveFirstTarget.id);
      const archiveFirstDraft = await createConfiguredDraft(
        base.item,
        `${label} archive-first Budget`
      );
      const archiveFirstPricing = await base.item.getSection(
        SUPER_ADMIN,
        archiveFirstDraft.mainLineId,
        archiveFirstDraft.revisionId,
        "pricing"
      );
      const archiveGate = createGatedAudit("ai_estimator_knowledge_master_archived");
      const archiving = createRaceReferenceService(archiveGate.audit).archiveMaster(
        SUPER_ADMIN,
        masterType,
        archiveFirstTarget.id,
        { expectedVersion: archiveFirstTarget.version }
      );
      await archiveGate.entered;
      const losingBudget = createRaceItemService(persistentAudit()).updateSection(
        SUPER_ADMIN,
        archiveFirstDraft.mainLineId,
        archiveFirstDraft.revisionId,
        "pricing",
        {
          expectedVersion: archiveFirstPricing.version,
          expectedAggregateVersion: archiveFirstDraft.aggregateVersion,
          payload: { priceEntries: [budgetCommand(archiveFirstTarget.id)] }
        }
      );
      await nextEventLoopTurn();
      archiveGate.release();

      const [archiveResult, losingBudgetResult] = await Promise.allSettled([
        archiving,
        losingBudget
      ]);
      expect(archiveResult).toMatchObject({
        status: "fulfilled",
        value: { id: archiveFirstTarget.id, status: "archived" }
      });
      expect(losingBudgetResult).toMatchObject({
        status: "rejected",
        reason: { status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" }
      });
      expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({
        revisionId: archiveFirstDraft.revisionId
      })).toBe(0);
      expect(await AuditEventModel.countDocuments({
        action: "ai_estimator_knowledge_price_version_created",
        "newValues.revisionId": archiveFirstDraft.revisionId
      })).toBe(0);

      const budgetFirstTarget = await createTarget("budget-first");
      await clearBudgetRaceDependencyEpoch(masterType, budgetFirstTarget.id);
      const budgetFirstDraft = await createConfiguredDraft(
        base.item,
        `${label} budget-first Budget`
      );
      const budgetFirstPricing = await base.item.getSection(
        SUPER_ADMIN,
        budgetFirstDraft.mainLineId,
        budgetFirstDraft.revisionId,
        "pricing"
      );
      const budgetGate = createGatedAudit(
        "ai_estimator_knowledge_price_version_created"
      );
      const budgeting = createRaceItemService(budgetGate.audit).updateSection(
        SUPER_ADMIN,
        budgetFirstDraft.mainLineId,
        budgetFirstDraft.revisionId,
        "pricing",
        {
          expectedVersion: budgetFirstPricing.version,
          expectedAggregateVersion: budgetFirstDraft.aggregateVersion,
          payload: { priceEntries: [budgetCommand(budgetFirstTarget.id)] }
        }
      );
      await budgetGate.entered;
      const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
        SUPER_ADMIN,
        masterType,
        budgetFirstTarget.id,
        { expectedVersion: budgetFirstTarget.version }
      );
      await nextEventLoopTurn();
      budgetGate.release();

      const [budgetResult, losingArchiveResult] = await Promise.allSettled([
        budgeting,
        losingArchive
      ]);
      expect(budgetResult.status).toBe("fulfilled");
      expect(losingArchiveResult).toMatchObject({
        status: "rejected",
        reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
      });
      expect(await budgetRaceMasterDocument(masterType, budgetFirstTarget.id))
        .toMatchObject({ status: "active", dependencyEpoch: 1, version: 1 });
      expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({
        revisionId: budgetFirstDraft.revisionId
      })).toBe(1);
      expect(await AuditEventModel.countDocuments({
        action: "ai_estimator_knowledge_master_archived",
        entityId: budgetFirstTarget.id
      })).toBe(0);
    }
  );

  it("serializes a legacy Mode-scoped compatibility price against archive in both commit orders and preserves its Budget update scope", async () => {
    const base = createServices();
    const createMode = async (suffix: string) => {
      const mode = await base.reference.createMaster(SUPER_ADMIN, "modes", {
        code: `LEGACY-${suffix}`,
        name: `Legacy ${suffix} Mode`
      });
      await AiEstimatorKnowledgeModeModel.updateOne(
        { _id: mode.id },
        { $unset: { dependencyEpoch: 1 } },
        { timestamps: false }
      ).exec();
      return mode;
    };
    const appendCommand = (modeId: string, priceEntryId: string) => ({
      ...priceCommand(priceEntryId, "2026-08-28T00:00:00.000Z"),
      modeId
    });

    const archiveFirstMode = await createMode("ARCHIVE-FIRST");
    const archiveFirstDraft = await createConfiguredDraft(
      base.item,
      "Legacy Mode archive-first price"
    );
    const archiveFirstPricing = await base.item.getSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "pricing"
    );
    const archiveGate = createGatedAudit("ai_estimator_knowledge_master_archived");
    const archiving = createRaceReferenceService(archiveGate.audit).archiveMaster(
      SUPER_ADMIN,
      "modes",
      archiveFirstMode.id,
      { expectedVersion: archiveFirstMode.version }
    );
    await archiveGate.entered;
    const losingAppend = createRaceItemService(persistentAudit()).updateSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "pricing",
      {
        expectedVersion: archiveFirstPricing.version,
        expectedAggregateVersion: archiveFirstDraft.aggregateVersion,
        payload: {
          priceEntries: [appendCommand(
            archiveFirstMode.id,
            "price-entry-mode-archive-first"
          )]
        }
      }
    );
    await nextEventLoopTurn();
    archiveGate.release();

    const [archiveResult, losingAppendResult] = await Promise.allSettled([
      archiving,
      losingAppend
    ]);
    expect(archiveResult).toMatchObject({
      status: "fulfilled",
      value: { id: archiveFirstMode.id, status: "archived" }
    });
    expect(losingAppendResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" }
    });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({
      revisionId: archiveFirstDraft.revisionId
    })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_price_version_created",
      "newValues.revisionId": archiveFirstDraft.revisionId
    })).toBe(0);

    const appendFirstMode = await createMode("APPEND-FIRST");
    const appendFirstDraft = await createConfiguredDraft(
      base.item,
      "Legacy Mode price-first price"
    );
    const appendFirstPricing = await base.item.getSection(
      SUPER_ADMIN,
      appendFirstDraft.mainLineId,
      appendFirstDraft.revisionId,
      "pricing"
    );
    const appendGate = createGatedAudit(
      "ai_estimator_knowledge_price_version_created"
    );
    const appending = createRaceItemService(appendGate.audit).updateSection(
      SUPER_ADMIN,
      appendFirstDraft.mainLineId,
      appendFirstDraft.revisionId,
      "pricing",
      {
        expectedVersion: appendFirstPricing.version,
        expectedAggregateVersion: appendFirstDraft.aggregateVersion,
        payload: {
          priceEntries: [appendCommand(
            appendFirstMode.id,
            "price-entry-mode-append-first"
          )]
        }
      }
    );
    await appendGate.entered;
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "modes",
      appendFirstMode.id,
      { expectedVersion: appendFirstMode.version }
    );
    await nextEventLoopTurn();
    appendGate.release();

    const [appendResult, losingArchiveResult] = await Promise.allSettled([
      appending,
      losingArchive
    ]);
    expect(appendResult.status).toBe("fulfilled");
    expect(losingArchiveResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
    });
    expect(await AiEstimatorKnowledgeModeModel.findById(appendFirstMode.id).lean())
      .toMatchObject({ status: "active", dependencyEpoch: 1, version: 1 });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments({
      revisionId: appendFirstDraft.revisionId,
      modeId: appendFirstMode.id
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_master_archived",
      entityId: appendFirstMode.id
    })).toBe(0);

    await AiEstimatorKnowledgeModeModel.updateOne(
      { _id: appendFirstMode.id },
      { $unset: { dependencyEpoch: 1 } },
      { timestamps: false }
    ).exec();
    const modeBeforeBudgetUpdate = await AiEstimatorKnowledgeModeModel.findById(
      appendFirstMode.id
    ).lean().exec();
    const retainedPricing = await base.item.getSection(
      SUPER_ADMIN,
      appendFirstDraft.mainLineId,
      appendFirstDraft.revisionId,
      "pricing"
    );
    const retainedReference = (retainedPricing.payload.priceEntries as Array<{
      operation: "reference";
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;
    const currentItem = await base.item.getItem(
      SUPER_ADMIN,
      appendFirstDraft.mainLineId
    );

    await base.item.updateSection(
      SUPER_ADMIN,
      appendFirstDraft.mainLineId,
      appendFirstDraft.revisionId,
      "pricing",
      {
        expectedVersion: retainedPricing.version,
        expectedAggregateVersion: currentItem.version,
        payload: {
          priceEntries: [{
            operation: "set_budget",
            sourcePriceVersionId: retainedReference.priceVersionId,
            vendorId: VENDOR_ID,
            uomId: UOM_ID,
            inputAmountPaise: 12_500,
            effectiveFrom: "2026-08-28T00:00:00.000Z",
            effectiveTo: null
          }]
        }
      }
    );

    const modeAfterBudgetUpdate = await AiEstimatorKnowledgeModeModel.findById(
      appendFirstMode.id
    ).lean().exec();
    expect(modeAfterBudgetUpdate).toMatchObject({
      status: "active",
      dependencyEpoch: 1,
      version: modeBeforeBudgetUpdate?.version,
      updatedAt: modeBeforeBudgetUpdate?.updatedAt
    });
    const retainedVersions = await AiEstimatorKnowledgePriceVersionModel.find({
      revisionId: appendFirstDraft.revisionId,
      priceEntryId: retainedReference.priceEntryId
    }).sort({ versionNumber: 1 }).lean().exec();
    expect(retainedVersions).toHaveLength(2);
    expect(retainedVersions.map((version) => version.modeId))
      .toEqual([appendFirstMode.id, appendFirstMode.id]);
    expect(retainedVersions[1]).toMatchObject({
      inputAmountPaise: 12_500,
      versionNumber: 2
    });
  });

  it("filters descriptive Specification guidance without changing effective-price resolution", async () => {
    const services = createServices();
    const draft = await createConfiguredDraft(
      services.item,
      "Specification Guidance Wardrobe",
      { withPrice: true }
    );
    await AiEstimatorKnowledgeSectionModel.updateOne(
      {
        mainLineId: draft.mainLineId,
        revisionId: draft.revisionId,
        sectionKey: "pricing"
      },
      {
        $set: {
          "payload.specifications": [{
            id: "spec-standard",
            name: "Stored typed board guidance",
            description: "Compatibility row whose typed fields must remain private.",
            type: "dropdown",
            options: ["Standard", "Premium"],
            value: "Premium"
          }]
        }
      }
    );
    const pricing = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    );
    const currentEntry = (pricing.payload.priceEntries as Array<{
      operation: "reference";
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;
    const currentReference = {
      operation: currentEntry.operation,
      priceEntryId: currentEntry.priceEntryId,
      priceVersionId: currentEntry.priceVersionId
    };
    const futureHistoricalPriceVersionId = "price-version-historical-specification-future";
    await AiEstimatorKnowledgePriceVersionModel.create({
      _id: futureHistoricalPriceVersionId,
      mainLineId: draft.mainLineId,
      revisionId: draft.revisionId,
      priceEntryId: "price-entry-historical-specification-future",
      versionNumber: 1,
      vendorId: VENDOR_ID,
      uomId: UOM_ID,
      specificationId: "spec-standard",
      modeId: null,
      taxRuleId: TAX_RULE_ID,
      taxVersionId: TAX_VERSION_ID,
      treatment: "inclusive",
      inputAmountPaise: 23_600,
      baseAmountPaise: 20_000,
      taxAmountPaise: 3_600,
      totalAmountPaise: 23_600,
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      effectiveTo: null,
      status: "active",
      reviewRequired: false,
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    const configured = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: draft.aggregateVersion,
        payload: {
          specifications: [
            {
              id: "spec-standard",
              name: "Plywood",
              description: "18 mm BWP-grade plywood for the cabinet carcass."
            },
            {
              id: "spec-hardware",
              name: "Hardware",
              description: "Soft-close hinges and full-extension drawer channels."
            }
          ],
          priceEntries: [
            currentReference,
            {
              operation: "reference",
              priceEntryId: "price-entry-historical-specification-future",
              priceVersionId: futureHistoricalPriceVersionId
            }
          ]
        }
      }
    );
    await services.item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
      expectedVersion: configured.aggregateVersion
    });

    const plywood = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "1.00",
      uomId: UOM_ID
    });
    const hardware = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-hardware",
      quantity: "1.00",
      uomId: UOM_ID
    });

    expect(plywood.lineage.priceVersionId).toBe(currentReference.priceVersionId);
    expect(hardware.lineage.priceVersionId).toBe(currentReference.priceVersionId);
    expect(plywood.preview?.effectiveUnitRatePaise).toBe(10_000);
    expect(hardware.preview?.effectiveUnitRatePaise).toBe(10_000);
    expect((plywood.sections.pricing as { specifications: unknown[] }).specifications).toEqual([{
      id: "spec-standard",
      name: "Plywood",
      description: "18 mm BWP-grade plywood for the cabinet carcass."
    }]);
    expect((hardware.sections.pricing as { specifications: unknown[] }).specifications).toEqual([{
      id: "spec-hardware",
      name: "Hardware",
      description: "Soft-close hinges and full-extension drawer channels."
    }]);
    expect(JSON.stringify(plywood.sections.pricing)).not.toContain("type");
    expect(JSON.stringify(plywood.sections.pricing)).not.toContain("options");
    expect(JSON.stringify(plywood.sections.pricing)).not.toContain("value");
  });

  it("resolves every canonical Main Line Priority without changing financial preview fields", async () => {
    const services = createServices();
    const draft = await createConfiguredDraft(
      services.item,
      "Priority context wardrobe",
      { withPrice: true }
    );
    await services.item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
      expectedVersion: draft.aggregateVersion
    });
    const request = {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "2.00",
      uomId: UOM_ID
    };
    const withoutPriority = await services.context.resolve(SUPER_ADMIN, request);
    expect(withoutPriority.sections.overview).not.toHaveProperty("priority");

    for (const priority of AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES) {
      await AiEstimatorKnowledgeSectionModel.updateOne(
        {
          mainLineId: draft.mainLineId,
          revisionId: draft.revisionId,
          sectionKey: "overview"
        },
        { $set: { "payload.priorityId": priority.id } }
      ).exec();
      const classified = await services.context.resolve(SUPER_ADMIN, request);
      expect(classified.sections.overview).toMatchObject({
        priorityId: priority.id,
        priority: {
          id: priority.id,
          tier: priority.semanticTier,
          code: priority.code,
          name: priority.name
        }
      });
      expect(classified.preview).toEqual(withoutPriority.preview);
      expect(classified.lineage.priceVersionId).toBe(withoutPriority.lineage.priceVersionId);
      expect(classified.lineage.taxVersionId).toBe(withoutPriority.lineage.taxVersionId);
    }

    await AiEstimatorKnowledgeSectionModel.updateOne(
      {
        mainLineId: draft.mainLineId,
        revisionId: draft.revisionId,
        sectionKey: "overview"
      },
      { $set: { "payload.priorityId": "knowledge-priority-missing" } }
    ).exec();
    await expect(services.context.resolve(SUPER_ADMIN, request)).rejects.toMatchObject({
      status: 422,
      code: "KNOWLEDGE_PRIORITY_NOT_RESOLVABLE"
    });

    await AiEstimatorKnowledgeSectionModel.updateOne(
      {
        mainLineId: draft.mainLineId,
        revisionId: draft.revisionId,
        sectionKey: "overview"
      },
      { $set: { "payload.priorityId": AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high } }
    ).exec();
    await AiEstimatorKnowledgePriorityModel.updateOne(
      { _id: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.high },
      { $set: { status: "inactive" } }
    ).exec();
    await expect(services.context.resolve(SUPER_ADMIN, request)).rejects.toMatchObject({
      status: 422,
      code: "KNOWLEDGE_PRIORITY_NOT_RESOLVABLE"
    });
  });

  it("retains a legacy Priority through activation but fails its estimator context closed", async () => {
    const services = createServices();
    const draft = await createConfiguredDraft(services.item, "Legacy priority activation");
    await AiEstimatorKnowledgePriorityModel.create({
      _id: "integration-priority-legacy",
      code: "LEGACY",
      codeNormalized: "legacy",
      name: "Legacy",
      nameNormalized: "legacy",
      description: null,
      displayOrder: 20,
      status: "inactive",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW
    });
    await AiEstimatorKnowledgeSectionModel.updateOne(
      {
        mainLineId: draft.mainLineId,
        revisionId: draft.revisionId,
        sectionKey: "overview"
      },
      { $set: { "payload.priorityId": "integration-priority-legacy" } }
    ).exec();

    await expect(services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: draft.aggregateVersion }
    )).resolves.toMatchObject({ status: "active" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      uomId: UOM_ID
    })).rejects.toMatchObject({
      status: 422,
      code: "KNOWLEDGE_PRIORITY_NOT_RESOLVABLE"
    });
  });

  it("resolves only price versions retained by the active pricing section", async () => {
    const services = createServices();
    const initialDraft = await createConfiguredDraft(
      services.item,
      "Replacement Price Wardrobe",
      { withPrice: true }
    );
    const firstActive = await services.item.activate(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      initialDraft.revisionId,
      { expectedVersion: initialDraft.aggregateVersion }
    );
    const nextDraft = await services.item.createRevision(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      { expectedVersion: firstActive.version }
    );
    const nextRevisionId = nextDraft.draftRevisionId!;
    const copiedPricing = await services.item.getSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      nextRevisionId,
      "pricing"
    );
    const copiedReference = (copiedPricing.payload.priceEntries as Array<{
      operation: "reference";
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;

    await services.item.updateSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      nextRevisionId,
      "pricing",
      {
        expectedVersion: copiedPricing.version,
        expectedAggregateVersion: nextDraft.version,
        payload: {
          specifications: [{ id: "spec-standard", name: "Standard" }],
          internalVendorNotes: "replacement-only note",
          priceEntries: [
            priceCommand("price-entry-replacement", "2026-08-28T00:00:00.000Z")
          ]
        }
      }
    );
    const updatedPricing = await services.item.getSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      nextRevisionId,
      "pricing"
    );
    const retainedReference = (updatedPricing.payload.priceEntries as Array<{
      operation: "reference";
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;
    const prices = await AiEstimatorKnowledgePriceVersionModel.find({
      revisionId: nextRevisionId
    }).sort({ createdAt: 1, _id: 1 }).lean().exec();

    expect(prices).toHaveLength(2);
    expect(prices.map((price) => price._id)).toContain(copiedReference.priceVersionId);
    expect(retainedReference).toMatchObject({
      operation: "reference",
      priceEntryId: "price-entry-replacement"
    });
    expect(retainedReference.priceVersionId).not.toBe(copiedReference.priceVersionId);

    const beforeActivation = await services.item.getItem(
      SUPER_ADMIN,
      initialDraft.mainLineId
    );
    await services.item.activate(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      nextRevisionId,
      { expectedVersion: beforeActivation.version }
    );
    const context = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: initialDraft.mainLineId,
      specificationId: "spec-standard",
      quantity: "1.00",
      uomId: UOM_ID
    });

    expect(context.lineage).toMatchObject({
      revisionId: nextRevisionId,
      priceVersionId: retainedReference.priceVersionId,
      taxVersionId: TAX_VERSION_ID
    });
    expect(context.preview).toMatchObject({
      effectivePriceVersionId: retainedReference.priceVersionId,
      effectiveUnitRatePaise: 10_000
    });
    expect(context.lineage.priceVersionId).not.toBe(copiedReference.priceVersionId);
  });

  it("atomically supersedes the prior active revision and returns a coherent snapshot during activation", async () => {
    const services = createServices();
    const initialDraft = await createConfiguredDraft(services.item, "Atomic TV Unit", { withPrice: true });
    const firstActive = await services.item.activate(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      initialDraft.revisionId,
      { expectedVersion: initialDraft.aggregateVersion }
    );
    const withDraft = await services.item.createRevision(SUPER_ADMIN, initialDraft.mainLineId, {
      expectedVersion: firstActive.version
    });
    const secondRevisionId = withDraft.draftRevisionId!;
    const secondOverview = await services.item.getSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      secondRevisionId,
      "overview"
    );
    await services.item.updateSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      secondRevisionId,
      "overview",
      {
        expectedVersion: secondOverview.version,
        expectedAggregateVersion: withDraft.version,
        payload: overviewPayload("Second coherent revision")
      }
    );
    const beforeActivation = await services.item.getItem(SUPER_ADMIN, initialDraft.mainLineId);

    const [context, secondActive] = await Promise.all([
      services.context.resolve(SUPER_ADMIN, {
        mainBasketId: BASKET_ID,
        mainLineId: initialDraft.mainLineId,
        specificationId: "spec-standard",
        quantity: "1.00",
        uomId: UOM_ID
      }),
      services.item.activate(SUPER_ADMIN, initialDraft.mainLineId, secondRevisionId, {
        expectedVersion: beforeActivation.version
      })
    ]);

    expect([initialDraft.revisionId, secondRevisionId]).toContain(context.lineage.revisionId);
    const contextRevision = await AiEstimatorKnowledgeRevisionModel.findById(context.lineage.revisionId)
      .lean().exec();
    const contextOverview = await AiEstimatorKnowledgeSectionModel.findOne({
      revisionId: context.lineage.revisionId,
      sectionKey: "overview"
    }).lean().exec();
    expect(context.lineage.contentDigest).toBe(contextRevision?.contentDigest);
    expect((context.sections.overview as { description?: string }).description)
      .toBe((contextOverview?.payload as { description?: string }).description);

    const revisions = await AiEstimatorKnowledgeRevisionModel.find({ mainLineId: initialDraft.mainLineId })
      .sort({ revisionNumber: 1 }).lean().exec();
    expect(revisions.map((revision) => revision.status)).toEqual(["superseded", "active"]);
    expect(revisions[0]).toMatchObject({
      _id: initialDraft.revisionId,
      contentDigest: firstActive.activeRevision?.contentDigest,
      supersededById: SUPER_ADMIN.id
    });
    expect(revisions[1]).toMatchObject({
      _id: secondRevisionId,
      status: "active",
      contentDigest: secondActive.activeRevision?.contentDigest
    });
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({
      mainLineId: initialDraft.mainLineId,
      status: "active"
    })).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.findById(initialDraft.mainLineId).lean().exec())
      .toMatchObject({ activeRevisionId: secondRevisionId, draftRevisionId: null });

    await expect(services.item.updateSection(
      SUPER_ADMIN,
      initialDraft.mainLineId,
      initialDraft.revisionId,
      "overview",
      {
        expectedVersion: 2,
        expectedAggregateVersion: secondActive.version,
        payload: overviewPayload("Forbidden rewrite")
      }
    )).rejects.toMatchObject({ status: 409, code: "KNOWLEDGE_REVISION_IMMUTABLE" });
    expect((await AiEstimatorKnowledgeSectionModel.findOne({
      revisionId: initialDraft.revisionId,
      sectionKey: "overview"
    }).lean().exec())?.payload).toMatchObject({ description: "Atomic TV Unit" });
  });

  it("atomically rejects activation of unresolved canonical Execution recovery until explicit assignment", async () => {
    const services = createServices();
    const draft = await createConfiguredDraft(services.item, "Execution recovery activation");
    const advanced = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced"
    );
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
    const [lineBefore, revisionBefore, advancedBefore, auditCountBefore] = await Promise.all([
      AiEstimatorKnowledgeMainLineModel.findById(draft.mainLineId).lean().exec(),
      AiEstimatorKnowledgeRevisionModel.findById(draft.revisionId).lean().exec(),
      AiEstimatorKnowledgeSectionModel.findById(advanced.id).lean().exec(),
      AuditEventModel.countDocuments()
    ]);

    await expect(services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: draft.aggregateVersion }
    )).rejects.toMatchObject({
      status: 422,
      code: "KNOWLEDGE_ACTIVATION_BLOCKED",
      fields: {
        activation: expect.stringContaining("UNSCOPED_EXECUTION_RECOVERY_REQUIRED")
      }
    });
    const [lineAfter, revisionAfter, advancedAfter, auditCountAfter] = await Promise.all([
      AiEstimatorKnowledgeMainLineModel.findById(draft.mainLineId).lean().exec(),
      AiEstimatorKnowledgeRevisionModel.findById(draft.revisionId).lean().exec(),
      AiEstimatorKnowledgeSectionModel.findById(advanced.id).lean().exec(),
      AuditEventModel.countDocuments()
    ]);
    expect(lineAfter).toEqual(lineBefore);
    expect(revisionAfter).toEqual(revisionBefore);
    expect(advancedAfter).toEqual(advancedBefore);
    expect(auditCountAfter).toBe(auditCountBefore);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({
      mainLineId: draft.mainLineId,
      status: "active"
    })).toBe(0);

    const assigned = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: draft.aggregateVersion,
        applicability: "configured",
        payload: {
          modeConfigurations: [{
            ...recoveryConfiguration,
            executionSource: "sub_vendor"
          }]
        }
      }
    );
    await expect(services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: assigned.aggregateVersion }
    )).resolves.toMatchObject({
      status: "active",
      activeRevision: { id: draft.revisionId, status: "active" },
      draftRevision: null
    });
  });

  it("duplicates stable content with remapped step and price identities and mandatory price review", async () => {
    const services = createServices();
    const draft = await createConfiguredDraft(services.item, "Duplicated Partition", {
      withPrice: true,
      executionSteps: [
        { id: "step-measure", dependencyStepIds: [] },
        { id: "step-install", dependencyStepIds: ["step-measure"] }
      ]
    });
    const sourcePrice = await AiEstimatorKnowledgePriceVersionModel.findOne({ revisionId: draft.revisionId })
      .lean().exec();

    const duplicate = await services.item.duplicate(SUPER_ADMIN, draft.mainLineId, {
      expectedVersion: draft.aggregateVersion,
      name: "Duplicated Partition Copy",
      reason: "Test stable remapping"
    });
    const duplicatePrice = await AiEstimatorKnowledgePriceVersionModel.findOne({
      mainLineId: duplicate.mainLineId,
      revisionId: duplicate.draftRevisionId
    }).lean().exec();
    const [sourceLine, duplicateLine] = await Promise.all([
      AiEstimatorKnowledgeMainLineModel.findById(draft.mainLineId).lean().exec(),
      AiEstimatorKnowledgeMainLineModel.findById(duplicate.mainLineId).lean().exec()
    ]);
    expect(duplicatePrice).toMatchObject({ status: "draft", reviewRequired: true });
    expect(duplicatePrice?._id).not.toBe(sourcePrice?._id);
    expect(duplicatePrice?.priceEntryId).not.toBe(sourcePrice?.priceEntryId);
    expect(sourceLine?.displayOrder).toBe(0);
    expect(duplicateLine?.displayOrder).toBe(1);

    const execution = await services.item.getSection(
      SUPER_ADMIN,
      duplicate.mainLineId,
      duplicate.draftRevisionId!,
      "execution"
    );
    const steps = execution.payload.steps as Array<{ id: string; dependencyStepIds: string[] }>;
    expect(steps[0]!.id).not.toBe("step-measure");
    expect(steps[1]!.id).not.toBe("step-install");
    expect(steps[1]!.dependencyStepIds).toEqual([steps[0]!.id]);
    const duplicateAudit = await AuditEventModel.findOne({
      action: "ai_estimator_knowledge_main_line_duplicated",
      entityId: duplicate.mainLineId
    }).lean().exec();
    expect(duplicateAudit?.newValues).toMatchObject({
      basketId: BASKET_ID,
      displayOrder: 1,
      sourceMainLineId: draft.mainLineId
    });
  });

  it("blocks inbound archives and rolls back step and item dependency cycles", async () => {
    const services = createServices();
    const target = await createAndActivateOverviewOnly(services.item, "Cycle Target");
    const source = await createAndActivateOverviewOnly(services.item, "Cycle Source", {
      targetMainLineId: target.mainLineId
    });

    const inactiveTarget = await services.item.deactivate(SUPER_ADMIN, target.mainLineId, {
      expectedVersion: target.aggregateVersion,
      reason: "Archive preparation"
    });
    await expect(services.item.archiveMainLine(SUPER_ADMIN, target.mainLineId, {
      expectedVersion: inactiveTarget.version,
      reason: "Should be protected by inbound reference"
    })).rejects.toMatchObject({ status: 409, code: "ACTIVE_REFERENCE" });
    expect((await AiEstimatorKnowledgeMainLineModel.findById(target.mainLineId).lean().exec())?.status)
      .toBe("inactive");

    const stepCandidate = await services.item.createMainLine(SUPER_ADMIN, BASKET_ID, {
      name: "Step Cycle Candidate"
    });
    const execution = await services.item.getSection(
      SUPER_ADMIN,
      stepCandidate.mainLineId,
      stepCandidate.draftRevisionId!,
      "execution"
    );
    const auditBeforeStepCycle = await AuditEventModel.countDocuments();
    await expect(services.item.updateSection(
      SUPER_ADMIN,
      stepCandidate.mainLineId,
      stepCandidate.draftRevisionId!,
      "execution",
      {
        expectedVersion: execution.version,
        expectedAggregateVersion: stepCandidate.version,
        payload: {
          steps: [
            executionStep("step-a", 1, ["step-b"]),
            executionStep("step-b", 2, ["step-a"])
          ]
        }
      }
    )).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect((await AiEstimatorKnowledgeMainLineModel.findById(stepCandidate.mainLineId).lean().exec())?.version)
      .toBe(stepCandidate.version);
    expect((await AiEstimatorKnowledgeSectionModel.findById(execution.id).lean().exec())?.version)
      .toBe(execution.version);
    expect(await AuditEventModel.countDocuments()).toBe(auditBeforeStepCycle);

    const targetDraft = await services.item.createRevision(SUPER_ADMIN, target.mainLineId, {
      expectedVersion: inactiveTarget.version
    });
    const advanced = await services.item.getSection(
      SUPER_ADMIN,
      target.mainLineId,
      targetDraft.draftRevisionId!,
      "advanced"
    );
    const auditBeforeItemCycle = await AuditEventModel.countDocuments();
    await expect(services.item.updateSection(
      SUPER_ADMIN,
      target.mainLineId,
      targetDraft.draftRevisionId!,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: targetDraft.version,
        payload: {
          dependencies: [{
            id: `dependency-${nextId()}`,
            targetBasketId: BASKET_ID,
            targetMainLineId: source.mainLineId,
            reason: null,
            active: true
          }]
        }
      }
    )).rejects.toMatchObject({ status: 409, code: "DEPENDENCY_CYCLE" });
    expect((await AiEstimatorKnowledgeMainLineModel.findById(target.mainLineId).lean().exec())?.version)
      .toBe(targetDraft.version);
    expect((await AiEstimatorKnowledgeSectionModel.findById(advanced.id).lean().exec())?.version)
      .toBe(advanced.version);
    expect(await AuditEventModel.countDocuments()).toBe(auditBeforeItemCycle);
  });

  it("keeps inactive nested rows as history while omitting them from context, graphs, and inbound archive protection", async () => {
    const services = createServices();
    const target = await createAndActivateOverviewOnly(services.item, "Inactive Relation Target");
    let source = await createConfiguredDraft(services.item, "Inactive Row Source");

    source = await updateDraftSection(services.item, source, "scope", {
      exclusions: [{
        id: "inactive-scope-exclusion",
        targetBasketId: BASKET_ID,
        targetMainLineId: target.mainLineId,
        reason: "Inactive scope note must remain private",
        active: false
      }]
    });
    source = await updateDraftSection(services.item, source, "recommendations", {
      recommendations: [{
        id: "inactive-recommendation",
        targetBasketId: BASKET_ID,
        targetMainLineId: target.mainLineId,
        type: "recommended",
        priorityId: "inactive-priority-reference",
        reason: "Inactive recommendation must remain private",
        quantityRelationship: "same_quantity",
        quantityValue: null,
        dependency: true,
        active: false
      }]
    });
    source = await updateDraftSection(services.item, source, "quality", {
      parameters: [{
        id: "inactive-quality-parameter",
        type: "text",
        label: "Inactive quality note",
        unit: null,
        allowedValues: [],
        minimum: null,
        maximum: null,
        defaultValue: null,
        required: false,
        category: null,
        active: false
      }]
    });
    source = await updateDraftSection(services.item, source, "execution", {
      steps: [
        { ...executionStep("inactive-step-a", 1, ["inactive-step-b"]), active: false },
        { ...executionStep("inactive-step-b", 2, ["inactive-step-a"]), active: false },
        executionStep("active-step", 3, ["inactive-step-a"])
      ],
      productivity: [{
        id: "inactive-productivity",
        value: "1.00",
        uomId: "inactive-uom-reference",
        crewSize: 1,
        skillType: null,
        minimumDuration: null,
        maximumDuration: null,
        durationUnit: "hours",
        active: false
      }]
    });
    source = await updateDraftSection(services.item, source, "advanced", {
      dependencies: [{
        id: "inactive-advanced-dependency",
        targetBasketId: BASKET_ID,
        targetMainLineId: target.mainLineId,
        reason: "Inactive dependency must remain private",
        active: false
      }],
      modeOverrides: [{
        id: "inactive-mode-override",
        modeId: "inactive-mode-reference",
        description: "Inactive override must remain private",
        active: false
      }]
    });

    const activatedSource = await services.item.activate(
      SUPER_ADMIN,
      source.mainLineId,
      source.revisionId,
      { expectedVersion: source.aggregateVersion }
    );
    const inactiveTarget = await services.item.deactivate(SUPER_ADMIN, target.mainLineId, {
      expectedVersion: target.aggregateVersion,
      reason: "Archive target referenced only by inactive rows"
    });
    await expect(services.item.archiveMainLine(SUPER_ADMIN, target.mainLineId, {
      expectedVersion: inactiveTarget.version,
      reason: "Inactive references do not block archive"
    })).resolves.toMatchObject({ status: "archived" });

    await AiEstimatorKnowledgeUomModel.updateOne(
      { _id: UOM_ID },
      { $set: { status: "inactive", version: 2, updatedAt: NOW } }
    ).exec();
    const context = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: source.mainLineId,
      quantity: "1.00",
      uomId: UOM_ID
    });

    expect(context.lineage).toMatchObject({
      mainLineId: source.mainLineId,
      revisionId: source.revisionId,
      contentDigest: activatedSource.activeRevision?.contentDigest
    });
    expect(context.sections.scope).toMatchObject({ exclusions: [] });
    expect(context.sections.recommendations).toMatchObject({ recommendations: [] });
    expect(context.sections.quality).toMatchObject({ parameters: [] });
    expect(context.sections.advanced).toMatchObject({ dependencies: [] });
    expect(context.sections.advanced).not.toHaveProperty("modeOverrides");
    expect(context.sections.execution).toMatchObject({
      steps: [expect.objectContaining({ id: "active-step", dependencyStepIds: [] })],
      productivity: []
    });
    const serialized = JSON.stringify(context);
    for (const privateValue of [
      "inactive-scope-exclusion",
      "inactive-recommendation",
      "inactive-quality-parameter",
      "inactive-step-a",
      "inactive-step-b",
      "inactive-productivity",
      "inactive-advanced-dependency",
      "inactive-mode-override",
      "Inactive scope note must remain private"
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("keeps PMC, Sub-Vendor, and In-house definitions isolated without changing price resolution", async () => {
    const services = createServices();
    let draft = await createConfiguredDraft(
      services.item,
      "Dynamic mode configuration",
      { withPrice: true }
    );
    const pricing = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing"
    );
    const sharedEntry = (pricing.payload.priceEntries as Array<{
      priceEntryId: string;
      priceVersionId: string;
    }>)[0]!;
    await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "pricing",
      {
        expectedVersion: pricing.version,
        expectedAggregateVersion: draft.aggregateVersion,
        payload: {
          specifications: [{ id: "spec-standard", name: "Standard" }],
          priceEntries: [
            {
              operation: "reference",
              priceEntryId: sharedEntry.priceEntryId,
              priceVersionId: sharedEntry.priceVersionId
            },
            {
              ...priceCommand("price-entry-legacy-pmc", "2026-08-28T00:00:00.000Z"),
              modeId: PMC_MODE_ID,
              inputAmountPaise: 20_000
            }
          ]
        }
      }
    );
    draft = {
      ...draft,
      aggregateVersion: (await services.item.getItem(SUPER_ADMIN, draft.mainLineId)).version
    };
    const advancedPayload = modeConfigurationPayload("A1", "E-27");
    const initialAdvanced = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced"
    );
    expect(initialAdvanced).toMatchObject({
      applicability: "not_configured",
      payload: {}
    });
    const savedAdvanced = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced",
      {
        expectedVersion: initialAdvanced.version,
        expectedAggregateVersion: draft.aggregateVersion,
        applicability: "configured",
        payload: advancedPayload
      }
    );
    draft = {
      ...draft,
      aggregateVersion: (await services.item.getItem(SUPER_ADMIN, draft.mainLineId)).version
    };
    expect(savedAdvanced.applicability).toBe("configured");
    expect(savedAdvanced.payload).toEqual(advancedPayload);
    const storedAdvancedPayload = {
      ...advancedPayload,
      modeConfigurations: advancedPayload.modeConfigurations.map((configuration) => ({
        ...configuration,
        fields: configuration.fields.map((field) => ({
          ...field,
          value: configuration.modeKind === "pmc"
            ? "private-pmc-answer"
            : configuration.executionSource === "sub_vendor"
              ? "private-sub-vendor-answer"
              : "private-in-house-answer"
        }))
      }))
    };
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: savedAdvanced.id },
      { $set: { payload: storedAdvancedPayload } }
    ).exec();

    const active = await services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: draft.aggregateVersion }
    );
    expect(active.activeRevision?.contentDigest).toMatch(/^[a-f0-9]{64}$/u);

    const pmcContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "pmc"
    });
    const executionContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "execution"
    });
    const subVendorContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "execution",
      executionSource: "sub_vendor"
    });
    const inHouseContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "execution",
      executionSource: "in_house"
    });
    const legacyContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeId: PMC_MODE_ID
    });
    const selectorFreeContext = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId
    });
    const prices = await AiEstimatorKnowledgePriceVersionModel.find({
      revisionId: draft.revisionId
    }).lean().exec();
    const sharedPrice = prices.find((price) => price.modeId === null);
    const legacyPmcPrice = prices.find((price) => price.modeId === PMC_MODE_ID);
    expect(pmcContext.lineage).toMatchObject({
      mainLineId: draft.mainLineId,
      revisionId: draft.revisionId,
      contentDigest: active.activeRevision?.contentDigest,
      priceVersionId: sharedPrice?._id
    });
    expect(pmcContext.sections.advanced).toMatchObject({
      dependencies: [],
      modeConfigurations: [{
        id: "configuration-pmc",
        modeKind: "pmc",
        fields: [{
          id: "field-pmc-mark",
          type: "text",
          label: "PMC mark A1",
          options: []
        }]
      }]
    });
    expect(JSON.stringify(pmcContext)).not.toContain("Sub-Vendor crew E-27");
    expect(JSON.stringify(pmcContext)).not.toContain("In-house supervisor");
    expect(JSON.stringify(pmcContext)).not.toContain("private-pmc-answer");
    expect(pmcContext.preview).toMatchObject({
      effectivePriceVersionId: sharedPrice?._id,
      effectiveUnitRatePaise: 10_000
    });
    expect(executionContext.sections.advanced).toMatchObject({
      dependencies: [],
      modeConfigurations: [
        expect.objectContaining({
          id: "configuration-execution-sub-vendor",
          modeKind: "execution",
          executionSource: "sub_vendor",
          fields: [expect.objectContaining({ id: "field-crew-code", label: "Sub-Vendor crew E-27" })]
        }),
        expect.objectContaining({
          id: "configuration-execution-in-house",
          modeKind: "execution",
          executionSource: "in_house",
          fields: [expect.objectContaining({ id: "field-in-house-supervisor", label: "In-house supervisor" })]
        })
      ]
    });
    expect(JSON.stringify(executionContext)).not.toContain("PMC mark A1");
    expect(JSON.stringify(executionContext)).not.toContain("private-sub-vendor-answer");
    expect(JSON.stringify(executionContext)).not.toContain("private-in-house-answer");
    expect(subVendorContext.sections.advanced).toMatchObject({
      modeConfigurations: [{
        executionSource: "sub_vendor",
        fields: [expect.objectContaining({ label: "Sub-Vendor crew E-27" })]
      }]
    });
    expect(JSON.stringify(subVendorContext)).not.toContain("In-house supervisor");
    expect(inHouseContext.sections.advanced).toMatchObject({
      modeConfigurations: [{
        executionSource: "in_house",
        fields: [expect.objectContaining({ label: "In-house supervisor" })]
      }]
    });
    expect(JSON.stringify(inHouseContext)).not.toContain("Sub-Vendor crew E-27");
    expect(subVendorContext.lineage.priceVersionId).toBe(sharedPrice?._id);
    expect(inHouseContext.lineage.priceVersionId).toBe(sharedPrice?._id);
    expect(subVendorContext.preview).toMatchObject({ effectiveUnitRatePaise: 10_000 });
    expect(inHouseContext.preview).toMatchObject({ effectiveUnitRatePaise: 10_000 });
    expect(executionContext.lineage.priceVersionId).toBe(sharedPrice?._id);
    expect(executionContext.preview).toMatchObject({
      effectivePriceVersionId: sharedPrice?._id,
      effectiveUnitRatePaise: 10_000
    });
    expect(legacyContext.sections.advanced).toMatchObject({
      dependencies: [],
      modeConfigurations: []
    });
    expect(JSON.stringify(legacyContext)).not.toContain("PMC mark A1");
    expect(JSON.stringify(legacyContext)).not.toContain("Sub-Vendor crew E-27");
    expect(JSON.stringify(legacyContext)).not.toContain("Execution override must stay isolated");
    expect(JSON.stringify(legacyContext)).not.toContain(PMC_MODE_ID);
    expect(legacyContext.lineage.priceVersionId).toBe(legacyPmcPrice?._id);
    expect(legacyContext.preview).toMatchObject({
      effectivePriceVersionId: legacyPmcPrice?._id,
      effectiveUnitRatePaise: 20_000
    });
    expect(selectorFreeContext.lineage.priceVersionId).toBeNull();
    expect(selectorFreeContext.preview).toBeNull();
    expect(selectorFreeContext.sections.advanced).toMatchObject({
      dependencies: [],
      modeConfigurations: expect.arrayContaining([
        expect.objectContaining({ modeKind: "pmc" }),
        expect.objectContaining({ executionSource: "sub_vendor" }),
        expect.objectContaining({ executionSource: "in_house" })
      ])
    });
    expect(JSON.stringify(selectorFreeContext.sections.advanced)).not.toContain("modeId");
    expect(JSON.stringify(selectorFreeContext.sections.advanced)).not.toContain("value");
    expect(JSON.stringify(selectorFreeContext.sections.advanced)).not.toContain("revisionLineage");
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "pmc",
      modeId: PMC_MODE_ID
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "pmc",
      executionSource: "sub_vendor"
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { executionSource: expect.stringContaining("requires") }
    });

    const withDraft = await services.item.createRevision(
      SUPER_ADMIN,
      draft.mainLineId,
      { expectedVersion: active.version }
    );
    const copiedRevisionId = withDraft.draftRevisionId!;
    const copiedAdvanced = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      copiedRevisionId,
      "advanced"
    );
    expect(copiedAdvanced.payload).toEqual(storedAdvancedPayload);

    const auditCountBeforeCas = await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_section_updated",
      entityId: copiedAdvanced.id
    });
    const casResults = await Promise.allSettled([
      services.item.updateSection(
        SUPER_ADMIN,
        draft.mainLineId,
        copiedRevisionId,
        "advanced",
        {
          expectedVersion: copiedAdvanced.version,
          expectedAggregateVersion: withDraft.version,
          payload: modeConfigurationPayload("B1", "E-27")
        }
      ),
      services.item.updateSection(
        SUPER_ADMIN,
        draft.mainLineId,
        copiedRevisionId,
        "advanced",
        {
          expectedVersion: copiedAdvanced.version,
          expectedAggregateVersion: withDraft.version,
          payload: modeConfigurationPayload("C1", "E-27")
        }
      )
    ]);
    expect(casResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(casResults.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "VERSION_CONFLICT" }
    });
    const currentDraftAdvanced = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      copiedRevisionId,
      "advanced"
    );
    const currentConfigurations = currentDraftAdvanced.payload.modeConfigurations as Array<{
      modeKind?: "pmc" | "execution";
      executionSource?: "sub_vendor" | "in_house";
      fields: Array<{ label: string }>;
    }>;
    expect(currentConfigurations.find(({ modeKind }) => modeKind === "pmc")?.fields[0]?.label)
      .toMatch(/^PMC mark [BC]1$/u);
    expect(currentConfigurations.find(({ executionSource }) => executionSource === "sub_vendor")?.fields[0]?.label)
      .toBe("Sub-Vendor crew E-27");
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_section_updated",
      entityId: copiedAdvanced.id
    })).toBe(auditCountBeforeCas + 1);

    const contextAfterDraftEdit = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "pmc"
    });
    expect(JSON.stringify(contextAfterDraftEdit.sections.advanced)).toContain("PMC mark A1");
    expect(JSON.stringify(contextAfterDraftEdit.sections.advanced)).not.toMatch(/PMC mark [BC]1/u);

    await expect(services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced",
      {
        expectedVersion: savedAdvanced.version,
        expectedAggregateVersion: (await services.item.getItem(SUPER_ADMIN, draft.mainLineId)).version,
        payload: modeConfigurationPayload("forbidden", "E-27")
      }
    )).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REVISION_IMMUTABLE"
    });

    await AiEstimatorKnowledgeModeModel.deleteOne({ _id: PMC_MODE_ID });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeKind: "execution"
    })).resolves.toMatchObject({
      lineage: { priceVersionId: sharedPrice?._id },
      preview: { effectivePriceVersionId: sharedPrice?._id }
    });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeId: PMC_MODE_ID
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects newly introduced legacy reusable-Mode configurations without mutation", async () => {
    const services = createServices();
    const legacyMode = await services.reference.createMaster(SUPER_ADMIN, "modes", {
      code: "LEGACY_COMPATIBILITY_ONLY",
      name: "Legacy compatibility only"
    });
    const draft = await createConfiguredDraft(
      services.item,
      "Reject new legacy Mode configuration"
    );
    const advanced = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced"
    );
    const auditCount = await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_section_updated",
      entityId: advanced.id
    });

    await expect(services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced",
      {
        expectedVersion: advanced.version,
        expectedAggregateVersion: draft.aggregateVersion,
        applicability: "configured",
        payload: singleModeConfigurationPayload(
          legacyMode.id,
          "new-legacy",
          "must-not-persist"
        )
      }
    )).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: {
        "payload.modeConfigurations.0.modeId": expect.stringContaining("compatibility-only")
      }
    });
    expect(await AiEstimatorKnowledgeSectionModel.findById(advanced.id).lean())
      .toMatchObject({
        applicability: "not_configured",
        version: advanced.version
      });
    await expect(services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "advanced"
    )).resolves.toMatchObject({ applicability: "not_configured", payload: {} });
    expect(await AiEstimatorKnowledgeMainLineModel.findById(draft.mainLineId).lean())
      .toMatchObject({ version: draft.aggregateVersion });
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_section_updated",
      entityId: advanced.id
    })).toBe(auditCount);
  });

  it("accepts only known active requested surfaces and modes for unrestricted and configured compatibility", async () => {
    const services = createServices();
    await seedCompatibilityMasters();
    const draft = await createConfiguredDraft(services.item, "Compatibility Wardrobe");
    const firstActive = await services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: draft.aggregateVersion }
    );

    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      surfaceId: "unknown-surface"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeId: "unknown-mode"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      surfaceId: "integration-surface-wall",
      modeId: "integration-mode-new"
    })).resolves.toMatchObject({ lineage: { revisionId: draft.revisionId } });

    const revisionState = await services.item.createRevision(SUPER_ADMIN, draft.mainLineId, {
      expectedVersion: firstActive.version
    });
    const configuredRevisionId = revisionState.draftRevisionId!;
    const configured = await updateDraftSection(services.item, {
      mainLineId: draft.mainLineId,
      revisionId: configuredRevisionId,
      aggregateVersion: revisionState.version
    }, "overview", {
      ...overviewPayload("Compatibility Wardrobe configured"),
      surfaceIds: ["integration-surface-wall"],
      modeIds: ["integration-mode-new"]
    });
    await services.item.activate(SUPER_ADMIN, draft.mainLineId, configuredRevisionId, {
      expectedVersion: configured.aggregateVersion
    });

    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      surfaceId: "unknown-surface"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      modeId: "unknown-mode"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      surfaceId: "integration-surface-wall",
      modeId: "integration-mode-new"
    })).resolves.toMatchObject({ lineage: { revisionId: configuredRevisionId } });
  });

  it("resolves duration only for one applicable productivity rule and reports ambiguity, no-match, and precision failures", async () => {
    const services = createServices();
    let draft = await createConfiguredDraft(services.item, "Duration Wardrobe", { withPrice: true });
    draft = await updateDraftSection(services.item, draft, "execution", {
      productivity: [productivityRule("productivity-single", UOM_ID, "2.00")]
    });
    await services.item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
      expectedVersion: draft.aggregateVersion
    });
    const executionFilter = {
      mainLineId: draft.mainLineId,
      revisionId: draft.revisionId,
      sectionKey: "execution"
    };

    const single = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "4.00",
      uomId: UOM_ID
    });
    expect(single.preview?.duration).toEqual({ raw: "2", clamped: "2", unit: "hours" });
    expect(single.availability).toContainEqual({
      sectionKey: "execution",
      state: "available",
      reasonCode: null
    });

    await AiEstimatorKnowledgeSectionModel.updateOne(executionFilter, {
      $set: {
        payload: {
          productivity: [
            productivityRule("productivity-alpha", UOM_ID, "2.00"),
            productivityRule("productivity-beta", UOM_ID, "4.00")
          ]
        }
      }
    }).exec();
    const ambiguous = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "4.00",
      uomId: UOM_ID
    });
    expect(ambiguous.preview?.duration).toBeNull();
    expect(ambiguous.availability).toContainEqual({
      sectionKey: "execution",
      state: "not_resolvable",
      reasonCode: "AMBIGUOUS_PRODUCTIVITY_RULES"
    });

    await seedSecondaryUom();
    await AiEstimatorKnowledgeSectionModel.updateOne(executionFilter, {
      $set: { payload: { productivity: [productivityRule("productivity-other", "integration-uom-nos", "2")] } }
    }).exec();
    const noMatch = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "4.00",
      uomId: UOM_ID
    });
    expect(noMatch.preview?.duration).toBeNull();
    expect(noMatch.availability).toContainEqual({
      sectionKey: "execution",
      state: "not_resolvable",
      reasonCode: "NO_APPLICABLE_PRODUCTIVITY_RULE"
    });

    await AiEstimatorKnowledgeSectionModel.updateOne(executionFilter, {
      $set: { payload: { productivity: [productivityRule("productivity-precision", UOM_ID, "1.001")] } }
    }).exec();
    const invalidPrecision = await services.context.resolve(SUPER_ADMIN, {
      mainBasketId: BASKET_ID,
      mainLineId: draft.mainLineId,
      specificationId: "spec-standard",
      quantity: "4.00",
      uomId: UOM_ID
    });
    expect(invalidPrecision.preview?.duration).toBeNull();
    expect(invalidPrecision.availability).toContainEqual({
      sectionKey: "execution",
      state: "not_resolvable",
      reasonCode: "INVALID_PRODUCTIVITY_PRECISION"
    });
  });

  it("serializes permanent deletion against Main Line creation in both commit orders", async () => {
    const base = createServices();
    const deleteFirstBasket = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Delete First Basket"
    });
    const deleteGate = createGatedAudit(
      "ai_estimator_knowledge_basket_permanently_deleted"
    );
    const deleteFirstReference = createRaceReferenceService(deleteGate.audit);
    const competingItem = createRaceItemService(persistentAudit());
    const deletion = deleteFirstReference.permanentlyDeleteBasket(
      SUPER_ADMIN,
      deleteFirstBasket.id,
      {
        expectedVersion: deleteFirstBasket.version,
        confirmationName: deleteFirstBasket.name,
        reason: "Exercise delete-first commit order"
      }
    );
    await deleteGate.entered;
    const losingCreation = competingItem.createMainLine(
      SUPER_ADMIN,
      deleteFirstBasket.id,
      { name: "Must not become orphaned" }
    );
    await nextEventLoopTurn();
    deleteGate.release();

    const [deleteFirstResult, losingCreationResult] = await Promise.allSettled([
      deletion,
      losingCreation
    ]);
    expect(deleteFirstResult).toMatchObject({
      status: "fulfilled",
      value: { basketId: deleteFirstBasket.id, deleted: true }
    });
    expect(losingCreationResult).toMatchObject({
      status: "rejected",
      reason: { status: 404, code: "NOT_FOUND" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: deleteFirstBasket.id }))
      .toBeNull();
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: deleteFirstBasket.id
    })).toBe(0);

    const createFirstBasket = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Create First Basket"
    });
    const createGate = createGatedAudit("ai_estimator_knowledge_main_line_created");
    const createFirstItem = createRaceItemService(createGate.audit);
    const competingReference = createRaceReferenceService(persistentAudit());
    const creation = createFirstItem.createMainLine(
      SUPER_ADMIN,
      createFirstBasket.id,
      { name: "Committed Estimation Item" }
    );
    await createGate.entered;
    const losingDeletion = competingReference.permanentlyDeleteBasket(
      SUPER_ADMIN,
      createFirstBasket.id,
      {
        expectedVersion: createFirstBasket.version,
        confirmationName: createFirstBasket.name,
        reason: "Exercise create-first commit order"
      }
    );
    await nextEventLoopTurn();
    createGate.release();

    const [createFirstResult, losingDeletionResult] = await Promise.allSettled([
      creation,
      losingDeletion
    ]);
    expect(createFirstResult.status).toBe("fulfilled");
    expect(losingDeletionResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "BASKET_DELETE_BLOCKED" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.findById(createFirstBasket.id).lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({
      basketId: createFirstBasket.id
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_basket_permanently_deleted",
      entityId: createFirstBasket.id
    })).toBe(0);
  });

  it("rejects an archived Surface when creating a Draft from an Active revision", async () => {
    const services = createServices();
    const surface = await services.reference.createMaster(
      SUPER_ADMIN,
      "surfaces",
      { name: "Archived revision-copy Surface" }
    );
    const draft = await createConfiguredDraft(
      services.item,
      "Archived Surface revision-copy source"
    );
    const overview = await services.item.getSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "overview"
    );
    const assigned = await services.item.updateSection(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      "overview",
      {
        expectedVersion: overview.version,
        expectedAggregateVersion: draft.aggregateVersion,
        payload: { ...overview.payload, surfaceIds: [surface.id] }
      }
    );
    const active = await services.item.activate(
      SUPER_ADMIN,
      draft.mainLineId,
      draft.revisionId,
      { expectedVersion: assigned.aggregateVersion }
    );
    await AiEstimatorKnowledgeSurfaceModel.updateOne(
      { _id: surface.id },
      {
        $set: {
          status: "archived",
          archivedAt: NOW,
          archivedById: SUPER_ADMIN.id
        }
      }
    ).exec();
    const auditCount = await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_revision_created",
      "newValues.mainLineId": draft.mainLineId
    });

    await expect(services.item.createRevision(
      SUPER_ADMIN,
      draft.mainLineId,
      { expectedVersion: active.version }
    )).rejects.toMatchObject({
      status: 409,
      code: "KNOWLEDGE_REFERENCE_INVALID"
    });
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({
      mainLineId: draft.mainLineId
    })).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.findById(draft.mainLineId).lean())
      .toMatchObject({
        activeRevisionId: draft.revisionId,
        draftRevisionId: null,
        version: active.version
      });
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_revision_created",
      "newValues.mainLineId": draft.mainLineId
    })).toBe(auditCount);
  });

  it("serializes first Main Line Surface assignment against archive in both commit orders", async () => {
    const base = createServices();

    const archiveFirstSurface = await base.reference.createMaster(
      SUPER_ADMIN,
      "surfaces",
      { name: "Archive-first Surface" }
    );
    const archiveFirstDraft = await createConfiguredDraft(
      base.item,
      "Archive-first Surface assignment"
    );
    const archiveFirstOverview = await base.item.getSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "overview"
    );
    const archiveGate = createGatedAudit("ai_estimator_knowledge_master_archived");
    const archiving = createRaceReferenceService(archiveGate.audit).archiveMaster(
      SUPER_ADMIN,
      "surfaces",
      archiveFirstSurface.id,
      { expectedVersion: archiveFirstSurface.version }
    );
    await archiveGate.entered;
    const losingAssignment = createRaceItemService(persistentAudit()).updateSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "overview",
      {
        expectedVersion: archiveFirstOverview.version,
        expectedAggregateVersion: archiveFirstDraft.aggregateVersion,
        payload: {
          ...archiveFirstOverview.payload,
          surfaceIds: [archiveFirstSurface.id]
        }
      }
    );
    await nextEventLoopTurn();
    archiveGate.release();

    const [archiveResult, losingAssignmentResult] = await Promise.allSettled([
      archiving,
      losingAssignment
    ]);
    expect(archiveResult).toMatchObject({
      status: "fulfilled",
      value: { id: archiveFirstSurface.id, status: "archived" }
    });
    expect(losingAssignmentResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" }
    });
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      revisionId: archiveFirstDraft.revisionId,
      "payload.surfaceIds": archiveFirstSurface.id
    })).toBeNull();

    const assignmentFirstSurface = await base.reference.createMaster(
      SUPER_ADMIN,
      "surfaces",
      { name: "Assignment-first Surface" }
    );
    const assignmentFirstDraft = await createConfiguredDraft(
      base.item,
      "Assignment-first Surface assignment"
    );
    const assignmentFirstOverview = await base.item.getSection(
      SUPER_ADMIN,
      assignmentFirstDraft.mainLineId,
      assignmentFirstDraft.revisionId,
      "overview"
    );
    const assignmentGate = createGatedAudit("ai_estimator_knowledge_section_updated");
    const assigning = createRaceItemService(assignmentGate.audit).updateSection(
      SUPER_ADMIN,
      assignmentFirstDraft.mainLineId,
      assignmentFirstDraft.revisionId,
      "overview",
      {
        expectedVersion: assignmentFirstOverview.version,
        expectedAggregateVersion: assignmentFirstDraft.aggregateVersion,
        payload: {
          ...assignmentFirstOverview.payload,
          surfaceIds: [assignmentFirstSurface.id]
        }
      }
    );
    await assignmentGate.entered;
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "surfaces",
      assignmentFirstSurface.id,
      { expectedVersion: assignmentFirstSurface.version }
    );
    await nextEventLoopTurn();
    assignmentGate.release();

    const [assignmentResult, losingArchiveResult] = await Promise.allSettled([
      assigning,
      losingArchive
    ]);
    expect(assignmentResult.status).toBe("fulfilled");
    expect(losingArchiveResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
    });
    expect(await AiEstimatorKnowledgeSurfaceModel.findById(
      assignmentFirstSurface.id
    ).lean()).toMatchObject({
      status: "active",
      dependencyEpoch: 1,
      version: 1
    });
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_master_archived",
      entityType: "ai_estimator_knowledge_surface"
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_master_archived",
      entityId: assignmentFirstSurface.id
    })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_section_updated",
      entityId: assignmentFirstOverview.id
    })).toBe(2);
  });

  it("serializes stale Main Line Surface duplication against archive in both commit orders", async () => {
    const base = createServices();

    const archiveFirstSurface = await base.reference.createMaster(
      SUPER_ADMIN,
      "surfaces",
      { name: "Archive-first duplicate Surface" }
    );
    const archiveFirstSource = await createSurfaceDuplicateRaceSource(
      base.item,
      archiveFirstSurface.id,
      "Archive-first Surface duplicate source"
    );
    const beforeArchiveFirstLines = await AiEstimatorKnowledgeMainLineModel.countDocuments();
    const duplicateReadGate = createGatedAudit(
      "ai_estimator_knowledge_price_version_created"
    );
    const losingDuplicate = createRaceItemService(duplicateReadGate.audit).duplicate(
      SUPER_ADMIN,
      archiveFirstSource.mainLineId,
      {
        expectedVersion: archiveFirstSource.aggregateVersion,
        name: "Must not copy archived Surface"
      }
    );
    await duplicateReadGate.entered;
    await removeSurfaceFromDuplicateRaceSource(base.item, archiveFirstSource);
    await expect(base.reference.archiveMaster(
      SUPER_ADMIN,
      "surfaces",
      archiveFirstSurface.id,
      { expectedVersion: archiveFirstSurface.version }
    )).resolves.toMatchObject({ id: archiveFirstSurface.id, status: "archived" });
    duplicateReadGate.release();

    const [losingDuplicateResult] = await Promise.allSettled([losingDuplicate]);
    expect(losingDuplicateResult.status).toBe("rejected");
    if (losingDuplicateResult.status === "rejected") {
      expect(losingDuplicateResult.reason).toMatchObject({ status: 409 });
      expect(["KNOWLEDGE_REFERENCE_INVALID", "VERSION_CONFLICT"])
        .toContain(losingDuplicateResult.reason.code);
    }
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments())
      .toBe(beforeArchiveFirstLines);
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      mainLineId: { $ne: archiveFirstSource.mainLineId },
      "payload.surfaceIds": archiveFirstSurface.id
    })).toBeNull();

    const duplicateFirstSurface = await base.reference.createMaster(
      SUPER_ADMIN,
      "surfaces",
      { name: "Duplicate-first Surface" }
    );
    const duplicateFirstSource = await createSurfaceDuplicateRaceSource(
      base.item,
      duplicateFirstSurface.id,
      "Duplicate-first Surface source"
    );
    const duplicateCommitGate = createGatedAudit(
      "ai_estimator_knowledge_main_line_duplicated"
    );
    const winningDuplicate = createRaceItemService(duplicateCommitGate.audit).duplicate(
      SUPER_ADMIN,
      duplicateFirstSource.mainLineId,
      {
        expectedVersion: duplicateFirstSource.aggregateVersion,
        name: "Committed Surface copy"
      }
    );
    await duplicateCommitGate.entered;
    await removeSurfaceFromDuplicateRaceSource(base.item, duplicateFirstSource);
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "surfaces",
      duplicateFirstSurface.id,
      { expectedVersion: duplicateFirstSurface.version }
    );
    await nextEventLoopTurn();
    duplicateCommitGate.release();

    const [winningDuplicateResult, losingArchiveResult] = await Promise.allSettled([
      winningDuplicate,
      losingArchive
    ]);
    if (winningDuplicateResult.status !== "fulfilled") {
      throw winningDuplicateResult.reason;
    }
    expect(losingArchiveResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
    });
    expect(winningDuplicateResult.value.surfaceIds).toEqual([duplicateFirstSurface.id]);
    expect(await AiEstimatorKnowledgeSurfaceModel.findById(
      duplicateFirstSurface.id
    ).lean()).toMatchObject({
      status: "active",
      dependencyEpoch: 2,
      version: 1
    });
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_main_line_duplicated"
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_master_archived",
      entityType: "ai_estimator_knowledge_surface"
    })).toBe(1);
  });

  it("serializes a first recommendation Priority reference against archive in both commit orders", async () => {
    const base = createServices();
    const target = await createAndActivateOverviewOnly(
      base.item,
      "Priority race recommendation target"
    );

    const archiveFirstPriority = await base.reference.createMaster(
      SUPER_ADMIN,
      "priorities",
      { code: "ARCHIVE_FIRST", name: "Archive first Priority" }
    );
    const archiveFirstSource = await createConfiguredDraft(
      base.item,
      "Archive-first Priority source"
    );
    const archiveFirstRecommendations = await base.item.getSection(
      SUPER_ADMIN,
      archiveFirstSource.mainLineId,
      archiveFirstSource.revisionId,
      "recommendations"
    );
    const archiveGate = createGatedAudit("ai_estimator_knowledge_master_archived");
    const archiving = createRaceReferenceService(archiveGate.audit).archiveMaster(
      SUPER_ADMIN,
      "priorities",
      archiveFirstPriority.id,
      { expectedVersion: archiveFirstPriority.version }
    );
    await archiveGate.entered;
    const losingReference = createRaceItemService(persistentAudit()).updateSection(
      SUPER_ADMIN,
      archiveFirstSource.mainLineId,
      archiveFirstSource.revisionId,
      "recommendations",
      {
        expectedVersion: archiveFirstRecommendations.version,
        expectedAggregateVersion: archiveFirstSource.aggregateVersion,
        payload: priorityRecommendation(
          "recommendation-archive-first",
          target.mainLineId,
          archiveFirstPriority.id
        )
      }
    );
    await nextEventLoopTurn();
    archiveGate.release();

    const [archiveResult, losingReferenceResult] = await Promise.allSettled([
      archiving,
      losingReference
    ]);
    expect(archiveResult).toMatchObject({
      status: "fulfilled",
      value: { id: archiveFirstPriority.id, status: "archived" }
    });
    expect(losingReferenceResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" }
    });

    const referenceFirstPriority = await base.reference.createMaster(
      SUPER_ADMIN,
      "priorities",
      { code: "REFERENCE_FIRST", name: "Reference first Priority" }
    );
    const referenceFirstSource = await createConfiguredDraft(
      base.item,
      "Reference-first Priority source"
    );
    const referenceFirstRecommendations = await base.item.getSection(
      SUPER_ADMIN,
      referenceFirstSource.mainLineId,
      referenceFirstSource.revisionId,
      "recommendations"
    );
    const referenceGate = createGatedAudit("ai_estimator_knowledge_section_updated");
    const referencing = createRaceItemService(referenceGate.audit).updateSection(
      SUPER_ADMIN,
      referenceFirstSource.mainLineId,
      referenceFirstSource.revisionId,
      "recommendations",
      {
        expectedVersion: referenceFirstRecommendations.version,
        expectedAggregateVersion: referenceFirstSource.aggregateVersion,
        payload: priorityRecommendation(
          "recommendation-reference-first",
          target.mainLineId,
          referenceFirstPriority.id
        )
      }
    );
    await referenceGate.entered;
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "priorities",
      referenceFirstPriority.id,
      { expectedVersion: referenceFirstPriority.version }
    );
    await nextEventLoopTurn();
    referenceGate.release();

    const [referenceResult, losingArchiveResult] = await Promise.allSettled([
      referencing,
      losingArchive
    ]);
    expect(referenceResult.status).toBe("fulfilled");
    expect(losingArchiveResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
    });
    expect(await AiEstimatorKnowledgePriorityModel.findById(
      referenceFirstPriority.id
    ).lean()).toMatchObject({
      status: "active",
      dependencyEpoch: 1,
      version: 1
    });
  });

  it("serializes a first priced-slab UOM reference against archive in both commit orders", async () => {
    const base = createServices();
    const archiveFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "SLAB-A",
      name: "Slab archive first",
      decimalScale: 2
    });
    const archiveFirstDraft = await createConfiguredDraft(
      base.item,
      "Archive-first priced slab",
      { withPrice: true }
    );
    const archiveFirstQuantity = await base.item.getSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "quantity-margin"
    );
    const archiveGate = createGatedAudit("ai_estimator_knowledge_master_archived");
    const archiving = createRaceReferenceService(archiveGate.audit).archiveMaster(
      SUPER_ADMIN,
      "uoms",
      archiveFirstUom.id,
      { expectedVersion: archiveFirstUom.version }
    );
    await archiveGate.entered;
    const losingReference = createRaceItemService(persistentAudit()).updateSection(
      SUPER_ADMIN,
      archiveFirstDraft.mainLineId,
      archiveFirstDraft.revisionId,
      "quantity-margin",
      {
        expectedVersion: archiveFirstQuantity.version,
        expectedAggregateVersion: archiveFirstDraft.aggregateVersion,
        payload: {
          slabRates: [slabRate("slab-rate-archive-first", archiveFirstUom.id)]
        }
      }
    );
    await nextEventLoopTurn();
    archiveGate.release();

    const [archiveResult, losingReferenceResult] = await Promise.allSettled([
      archiving,
      losingReference
    ]);
    expect(archiveResult).toMatchObject({
      status: "fulfilled",
      value: { id: archiveFirstUom.id, status: "archived" }
    });
    expect(losingReferenceResult).toMatchObject({
      status: "rejected",
      reason: { status: 400, code: "VALIDATION_ERROR" }
    });
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      revisionId: archiveFirstDraft.revisionId,
      "payload.slabRates.uomId": archiveFirstUom.id
    })).toBeNull();

    const referenceFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "SLAB-R",
      name: "Slab reference first",
      decimalScale: 2
    });
    const referenceFirstDraft = await createConfiguredDraft(
      base.item,
      "Reference-first priced slab",
      { withPrice: true }
    );
    const referenceFirstQuantity = await base.item.getSection(
      SUPER_ADMIN,
      referenceFirstDraft.mainLineId,
      referenceFirstDraft.revisionId,
      "quantity-margin"
    );
    const referenceGate = createGatedAudit("ai_estimator_knowledge_section_updated");
    const referencing = createRaceItemService(referenceGate.audit).updateSection(
      SUPER_ADMIN,
      referenceFirstDraft.mainLineId,
      referenceFirstDraft.revisionId,
      "quantity-margin",
      {
        expectedVersion: referenceFirstQuantity.version,
        expectedAggregateVersion: referenceFirstDraft.aggregateVersion,
        payload: {
          slabRates: [slabRate("slab-rate-reference-first", referenceFirstUom.id)]
        }
      }
    );
    await referenceGate.entered;
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "uoms",
      referenceFirstUom.id,
      { expectedVersion: referenceFirstUom.version }
    );
    await nextEventLoopTurn();
    referenceGate.release();

    const [referenceResult, losingArchiveResult] = await Promise.allSettled([
      referencing,
      losingArchive
    ]);
    expect(referenceResult.status).toBe("fulfilled");
    expect(losingArchiveResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_REFERENCE_CONFLICT" }
    });
    expect(await AiEstimatorKnowledgeUomModel.findById(referenceFirstUom.id).lean())
      .toMatchObject({ status: "active", dependencyEpoch: 1, version: 1 });
  });

  it("serializes permanent deletion against new historical Basket references in both commit orders", async () => {
    const base = createServices();
    const deleteFirstTarget = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Delete First Relationship Target"
    });
    const deleteFirstSource = await base.item.createMainLine(
      SUPER_ADMIN,
      BASKET_ID,
      { name: "Delete First Relationship Source" }
    );
    const deleteFirstScope = await base.item.getSection(
      SUPER_ADMIN,
      deleteFirstSource.mainLineId,
      deleteFirstSource.draftRevisionId!,
      "scope"
    );
    const deleteGate = createGatedAudit(
      "ai_estimator_knowledge_basket_permanently_deleted"
    );
    const deletion = createRaceReferenceService(deleteGate.audit)
      .permanentlyDeleteBasket(SUPER_ADMIN, deleteFirstTarget.id, {
        expectedVersion: deleteFirstTarget.version,
        confirmationName: deleteFirstTarget.name,
        reason: "Exercise delete-first reference order"
      });
    await deleteGate.entered;
    const losingReference = createRaceItemService(persistentAudit()).updateSection(
      SUPER_ADMIN,
      deleteFirstSource.mainLineId,
      deleteFirstSource.draftRevisionId!,
      "scope",
      {
        expectedVersion: deleteFirstScope.version,
        expectedAggregateVersion: deleteFirstSource.version,
        payload: historicalScopeReference(deleteFirstTarget.id, "delete-first")
      }
    );
    await nextEventLoopTurn();
    deleteGate.release();

    const [deleteFirstResult, losingReferenceResult] = await Promise.allSettled([
      deletion,
      losingReference
    ]);
    expect(deleteFirstResult.status).toBe("fulfilled");
    expect(losingReferenceResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "KNOWLEDGE_REFERENCE_INVALID" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: deleteFirstTarget.id }))
      .toBeNull();
    const rolledBackScope = await AiEstimatorKnowledgeSectionModel
      .findById(deleteFirstScope.id)
      .lean();
    expect(rolledBackScope).toMatchObject({ version: deleteFirstScope.version });
    expect(JSON.stringify(rolledBackScope?.payload ?? {}))
      .not.toContain(deleteFirstTarget.id);

    const referenceFirstTarget = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Reference First Relationship Target"
    });
    const referenceFirstSource = await base.item.createMainLine(
      SUPER_ADMIN,
      BASKET_ID,
      { name: "Reference First Relationship Source" }
    );
    const referenceFirstScope = await base.item.getSection(
      SUPER_ADMIN,
      referenceFirstSource.mainLineId,
      referenceFirstSource.draftRevisionId!,
      "scope"
    );
    const referenceGate = createGatedAudit("ai_estimator_knowledge_section_updated");
    const referenceWrite = createRaceItemService(referenceGate.audit).updateSection(
      SUPER_ADMIN,
      referenceFirstSource.mainLineId,
      referenceFirstSource.draftRevisionId!,
      "scope",
      {
        expectedVersion: referenceFirstScope.version,
        expectedAggregateVersion: referenceFirstSource.version,
        payload: historicalScopeReference(referenceFirstTarget.id, "reference-first")
      }
    );
    await referenceGate.entered;
    const losingDeletion = createRaceReferenceService(persistentAudit())
      .permanentlyDeleteBasket(SUPER_ADMIN, referenceFirstTarget.id, {
        expectedVersion: referenceFirstTarget.version,
        confirmationName: referenceFirstTarget.name,
        reason: "Exercise reference-first commit order"
      });
    await nextEventLoopTurn();
    referenceGate.release();

    const [referenceFirstResult, losingDeletionResult] = await Promise.allSettled([
      referenceWrite,
      losingDeletion
    ]);
    expect(referenceFirstResult.status).toBe("fulfilled");
    expect(losingDeletionResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "BASKET_DELETE_BLOCKED" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.findById(referenceFirstTarget.id).lean())
      .toMatchObject({ dependencyEpoch: 1, version: 1 });
    await expect(base.reference.getBasketDeletionImpact(
      SUPER_ADMIN,
      referenceFirstTarget.id
    )).resolves.toMatchObject({
      historicalReferenceCount: 1,
      canDelete: false,
      blockers: [expect.objectContaining({ code: "HAS_HISTORICAL_REFERENCES" })]
    });
  });

  it("serializes stale Draft duplication against last-reference removal and permanent deletion", async () => {
    const base = createServices();
    const deleteFirstTarget = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Delete First Duplicate Target"
    });
    const deleteFirstSource = await createDuplicateRaceSource(
      base.item,
      deleteFirstTarget.id,
      "Delete First Duplicate Source"
    );
    const beforeDeleteFirstMainLines = await AiEstimatorKnowledgeMainLineModel.countDocuments();
    const duplicateReadGate = createGatedAudit(
      "ai_estimator_knowledge_price_version_created"
    );
    const losingDuplicate = createRaceItemService(duplicateReadGate.audit).duplicate(
      SUPER_ADMIN,
      deleteFirstSource.mainLineId,
      {
        expectedVersion: deleteFirstSource.aggregateVersion,
        name: "Must Not Retain Deleted Target"
      }
    );
    await duplicateReadGate.entered;
    await base.item.updateSection(
      SUPER_ADMIN,
      deleteFirstSource.mainLineId,
      deleteFirstSource.revisionId,
      "scope",
      {
        expectedVersion: deleteFirstSource.scopeVersion,
        expectedAggregateVersion: deleteFirstSource.aggregateVersion,
        payload: { exclusions: [] }
      }
    );
    await expect(createRaceReferenceService(persistentAudit()).permanentlyDeleteBasket(
      SUPER_ADMIN,
      deleteFirstTarget.id,
      {
        expectedVersion: deleteFirstTarget.version,
        confirmationName: deleteFirstTarget.name,
        reason: "Exercise delete-first stale duplicate order"
      }
    )).resolves.toMatchObject({ basketId: deleteFirstTarget.id, deleted: true });
    duplicateReadGate.release();

    const losingDuplicateResult = await Promise.allSettled([losingDuplicate]);
    expect(losingDuplicateResult[0]).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "VERSION_CONFLICT" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: deleteFirstTarget.id }))
      .toBeNull();
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments())
      .toBe(beforeDeleteFirstMainLines);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments({
      "payload.exclusions.targetBasketId": deleteFirstTarget.id
    })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_main_line_duplicated",
      "newValues.sourceMainLineId": deleteFirstSource.mainLineId
    })).toBe(0);

    const duplicateFirstTarget = await base.reference.createBasket(SUPER_ADMIN, {
      name: "Duplicate First Target"
    });
    const duplicateFirstSource = await createDuplicateRaceSource(
      base.item,
      duplicateFirstTarget.id,
      "Duplicate First Source"
    );
    const duplicateCommitGate = createGatedAudit(
      "ai_estimator_knowledge_main_line_duplicated"
    );
    const winningDuplicate = createRaceItemService(duplicateCommitGate.audit).duplicate(
      SUPER_ADMIN,
      duplicateFirstSource.mainLineId,
      {
        expectedVersion: duplicateFirstSource.aggregateVersion,
        name: "Committed Relationship Copy"
      }
    );
    await duplicateCommitGate.entered;
    await base.item.updateSection(
      SUPER_ADMIN,
      duplicateFirstSource.mainLineId,
      duplicateFirstSource.revisionId,
      "scope",
      {
        expectedVersion: duplicateFirstSource.scopeVersion,
        expectedAggregateVersion: duplicateFirstSource.aggregateVersion,
        payload: { exclusions: [] }
      }
    );
    const losingDeletion = createRaceReferenceService(persistentAudit())
      .permanentlyDeleteBasket(SUPER_ADMIN, duplicateFirstTarget.id, {
        expectedVersion: duplicateFirstTarget.version,
        confirmationName: duplicateFirstTarget.name,
        reason: "Exercise duplicate-first stale source order"
      });
    await nextEventLoopTurn();
    duplicateCommitGate.release();

    const [winningDuplicateResult, losingDeletionResult] = await Promise.allSettled([
      winningDuplicate,
      losingDeletion
    ]);
    expect(winningDuplicateResult.status).toBe("fulfilled");
    expect(losingDeletionResult).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "BASKET_DELETE_BLOCKED" }
    });
    expect(await AiEstimatorKnowledgeBasketModel.findById(duplicateFirstTarget.id).lean())
      .toMatchObject({ dependencyEpoch: 2, version: 1 });
    await expect(base.reference.getBasketDeletionImpact(
      SUPER_ADMIN,
      duplicateFirstTarget.id
    )).resolves.toMatchObject({
      historicalReferenceCount: 1,
      canDelete: false,
      blockers: [expect.objectContaining({ code: "HAS_HISTORICAL_REFERENCES" })]
    });
  });

  it("serializes stale priced-slab duplication against UOM archive in both commit orders", async () => {
    const base = createServices();
    const archiveFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "DUP-SLAB-A",
      name: "Duplicate slab archive first",
      decimalScale: 2
    });
    const archiveFirstSource = await createSlabDuplicateRaceSource(
      base.item,
      archiveFirstUom.id,
      "Archive-first slab duplicate source",
      "12.25"
    );
    const archiveFirstMainLineCount = await AiEstimatorKnowledgeMainLineModel.countDocuments();
    const duplicateReadGate = createGatedAudit(
      "ai_estimator_knowledge_price_version_created"
    );
    const losingDuplicate = createRaceItemService(duplicateReadGate.audit).duplicate(
      SUPER_ADMIN,
      archiveFirstSource.mainLineId,
      {
        expectedVersion: archiveFirstSource.aggregateVersion,
        name: "Must not copy archived slab UOM"
      }
    );
    await duplicateReadGate.entered;
    await removeSlabRateFromDuplicateRaceSource(base.item, archiveFirstSource);
    await expect(base.reference.archiveMaster(
      SUPER_ADMIN,
      "uoms",
      archiveFirstUom.id,
      { expectedVersion: archiveFirstUom.version }
    )).resolves.toMatchObject({ id: archiveFirstUom.id, status: "archived" });
    duplicateReadGate.release();

    const [losingDuplicateResult] = await Promise.allSettled([losingDuplicate]);
    expect(losingDuplicateResult.status).toBe("rejected");
    if (losingDuplicateResult.status === "rejected") {
      expect(losingDuplicateResult.reason).toMatchObject({ status: expect.any(Number) });
      expect(["VERSION_CONFLICT", "VALIDATION_ERROR"])
        .toContain(losingDuplicateResult.reason.code);
    }
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments())
      .toBe(archiveFirstMainLineCount);
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      mainLineId: { $ne: archiveFirstSource.mainLineId },
      "payload.slabRates.uomId": archiveFirstUom.id
    })).toBeNull();

    const duplicateFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "DUP-SLAB-D",
      name: "Duplicate slab duplicate first",
      decimalScale: 2
    });
    const duplicateFirstSource = await createSlabDuplicateRaceSource(
      base.item,
      duplicateFirstUom.id,
      "Duplicate-first slab duplicate source",
      "12.25"
    );
    const duplicateCommitGate = createGatedAudit(
      "ai_estimator_knowledge_main_line_duplicated"
    );
    const winningDuplicate = createRaceItemService(duplicateCommitGate.audit).duplicate(
      SUPER_ADMIN,
      duplicateFirstSource.mainLineId,
      {
        expectedVersion: duplicateFirstSource.aggregateVersion,
        name: "Committed slab UOM copy"
      }
    );
    await duplicateCommitGate.entered;
    await removeSlabRateFromDuplicateRaceSource(base.item, duplicateFirstSource);
    const losingArchive = createRaceReferenceService(persistentAudit()).archiveMaster(
      SUPER_ADMIN,
      "uoms",
      duplicateFirstUom.id,
      { expectedVersion: duplicateFirstUom.version }
    );
    await nextEventLoopTurn();
    duplicateCommitGate.release();

    const [winningDuplicateResult, losingArchiveResult] = await Promise.allSettled([
      winningDuplicate,
      losingArchive
    ]);
    if (winningDuplicateResult.status !== "fulfilled") {
      throw winningDuplicateResult.reason;
    }
    expect(losingArchiveResult.status).toBe("rejected");
    if (losingArchiveResult.status === "rejected") {
      expect(losingArchiveResult.reason).toMatchObject({ status: 409 });
      expect(["ACTIVE_REFERENCE_CONFLICT", "VERSION_CONFLICT"])
        .toContain(losingArchiveResult.reason.code);
    }
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      mainLineId: winningDuplicateResult.value.mainLineId,
      "payload.slabRates.uomId": duplicateFirstUom.id
    })).not.toBeNull();
    expect(await AiEstimatorKnowledgeUomModel.findById(duplicateFirstUom.id).lean())
      .toMatchObject({ status: "active", decimalScale: 2, dependencyEpoch: 2, version: 1 });
  });

  it("serializes stale priced-slab duplication against UOM decimal-scale changes in both commit orders", async () => {
    const base = createServices();
    const scaleFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "DUP-SCALE-U",
      name: "Duplicate slab scale first",
      decimalScale: 2
    });
    const scaleFirstSource = await createSlabDuplicateRaceSource(
      base.item,
      scaleFirstUom.id,
      "Scale-first slab duplicate source",
      "12.25"
    );
    const scaleFirstMainLineCount = await AiEstimatorKnowledgeMainLineModel.countDocuments();
    const duplicateReadGate = createGatedAudit(
      "ai_estimator_knowledge_price_version_created"
    );
    const losingDuplicate = createRaceItemService(duplicateReadGate.audit).duplicate(
      SUPER_ADMIN,
      scaleFirstSource.mainLineId,
      {
        expectedVersion: scaleFirstSource.aggregateVersion,
        name: "Must not reinterpret copied slab quantity"
      }
    );
    await duplicateReadGate.entered;
    await removeSlabRateFromDuplicateRaceSource(base.item, scaleFirstSource);
    await expect(base.reference.updateMaster(
      SUPER_ADMIN,
      "uoms",
      scaleFirstUom.id,
      { expectedVersion: scaleFirstUom.version, decimalScale: 1 }
    )).resolves.toMatchObject({ id: scaleFirstUom.id, decimalScale: 1, version: 2 });
    duplicateReadGate.release();

    const [losingDuplicateResult] = await Promise.allSettled([losingDuplicate]);
    expect(losingDuplicateResult.status).toBe("rejected");
    if (losingDuplicateResult.status === "rejected") {
      expect(losingDuplicateResult.reason).toMatchObject({ status: expect.any(Number) });
      expect(["VERSION_CONFLICT", "VALIDATION_ERROR"])
        .toContain(losingDuplicateResult.reason.code);
    }
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments())
      .toBe(scaleFirstMainLineCount);
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      mainLineId: { $ne: scaleFirstSource.mainLineId },
      "payload.slabRates.uomId": scaleFirstUom.id
    })).toBeNull();

    const duplicateFirstUom = await base.reference.createMaster(SUPER_ADMIN, "uoms", {
      code: "DUP-SCALE-D",
      name: "Duplicate first scale guard",
      decimalScale: 2
    });
    const duplicateFirstSource = await createSlabDuplicateRaceSource(
      base.item,
      duplicateFirstUom.id,
      "Duplicate-first scale source",
      "12.25"
    );
    const duplicateCommitGate = createGatedAudit(
      "ai_estimator_knowledge_main_line_duplicated"
    );
    const winningDuplicate = createRaceItemService(duplicateCommitGate.audit).duplicate(
      SUPER_ADMIN,
      duplicateFirstSource.mainLineId,
      {
        expectedVersion: duplicateFirstSource.aggregateVersion,
        name: "Committed scale-protected slab copy"
      }
    );
    await duplicateCommitGate.entered;
    await removeSlabRateFromDuplicateRaceSource(base.item, duplicateFirstSource);
    const losingScaleChange = createRaceReferenceService(persistentAudit()).updateMaster(
      SUPER_ADMIN,
      "uoms",
      duplicateFirstUom.id,
      { expectedVersion: duplicateFirstUom.version, decimalScale: 1 }
    );
    await nextEventLoopTurn();
    duplicateCommitGate.release();

    const [winningDuplicateResult, losingScaleResult] = await Promise.allSettled([
      winningDuplicate,
      losingScaleChange
    ]);
    if (winningDuplicateResult.status !== "fulfilled") {
      throw winningDuplicateResult.reason;
    }
    expect(losingScaleResult.status).toBe("rejected");
    if (losingScaleResult.status === "rejected") {
      expect(losingScaleResult.reason).toMatchObject({ status: 409 });
      expect(["REFERENCED_UOM_SCALE_IMMUTABLE", "VERSION_CONFLICT"])
        .toContain(losingScaleResult.reason.code);
    }
    expect(await AiEstimatorKnowledgeSectionModel.exists({
      mainLineId: winningDuplicateResult.value.mainLineId,
      "payload.slabRates.uomId": duplicateFirstUom.id
    })).not.toBeNull();
    expect(await AiEstimatorKnowledgeUomModel.findById(duplicateFirstUom.id).lean())
      .toMatchObject({ status: "active", decimalScale: 2, dependencyEpoch: 2, version: 1 });
  });
});

function createServices() {
  const audit = createAuditService(createMemoryRepository());
  const reference = createAiEstimatorKnowledgeReferenceService({
    audit,
    now: () => NOW,
    createId: nextId
  });
  const item = createAiEstimatorKnowledgeItemService({
    audit,
    now: () => NOW,
    uuid: nextId
  });
  return {
    reference,
    item,
    context: createAiEstimatorKnowledgeContextService({ now: () => NOW })
  };
}

const raceActorGuard = {
  async requireReadActor() {
    return { id: SUPER_ADMIN.id, role: "super_admin" as const };
  },
  async requireMutationActor() {
    return { id: SUPER_ADMIN.id, role: "super_admin" as const };
  }
};

function persistentAudit() {
  return createAuditService(createMemoryRepository());
}

function createRaceReferenceService(audit: ReturnType<typeof persistentAudit>) {
  return createAiEstimatorKnowledgeReferenceService({
    audit,
    actorGuard: raceActorGuard,
    now: () => NOW,
    createId: nextId
  });
}

function createRaceItemService(audit: ReturnType<typeof persistentAudit>) {
  return createAiEstimatorKnowledgeItemService({
    audit,
    actorGuard: raceActorGuard,
    now: () => NOW,
    uuid: nextId
  });
}

function createGatedAudit(action: string) {
  const delegate = persistentAudit();
  let enteredResolve!: () => void;
  let releaseResolve!: () => void;
  let gated = false;
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  return {
    entered,
    release: releaseResolve,
    audit: {
      async appendInMongoTransaction(
        ...args: Parameters<typeof delegate.appendInMongoTransaction>
      ) {
        if (!gated && args[0].action === action) {
          gated = true;
          enteredResolve();
          await released;
        }
        return delegate.appendInMongoTransaction(...args);
      }
    }
  };
}

function historicalScopeReference(targetBasketId: string, suffix: string) {
  return {
    modeIds: [],
    surfaceIds: [],
    exclusions: [{
      id: `inactive-scope-${suffix}`,
      targetBasketId,
      targetMainLineId: null,
      reason: "Retained historical relationship",
      active: false
    }]
  };
}

async function createDuplicateRaceSource(
  item: AiEstimatorKnowledgeItemService,
  targetBasketId: string,
  name: string
): Promise<{
  mainLineId: string;
  revisionId: string;
  aggregateVersion: number;
  scopeVersion: number;
}> {
  let source = await item.createMainLine(SUPER_ADMIN, BASKET_ID, { name });
  const revisionId = source.draftRevisionId!;
  const scope = await item.getSection(SUPER_ADMIN, source.mainLineId, revisionId, "scope");
  const savedScope = await item.updateSection(
    SUPER_ADMIN,
    source.mainLineId,
    revisionId,
    "scope",
    {
      expectedVersion: scope.version,
      expectedAggregateVersion: source.version,
      payload: historicalScopeReference(targetBasketId, nextId())
    }
  );
  source = await item.getItem(SUPER_ADMIN, source.mainLineId);
  const pricing = await item.getSection(SUPER_ADMIN, source.mainLineId, revisionId, "pricing");
  await item.updateSection(SUPER_ADMIN, source.mainLineId, revisionId, "pricing", {
    expectedVersion: pricing.version,
    expectedAggregateVersion: source.version,
    payload: {
      specifications: [{ id: "spec-standard", name: "Duplicate race" }],
      priceEntries: [priceCommand(`price-entry-${nextId()}`, "2026-08-28T00:00:00.000Z")]
    }
  });
  source = await item.getItem(SUPER_ADMIN, source.mainLineId);
  return {
    mainLineId: source.mainLineId,
    revisionId,
    aggregateVersion: source.version,
    scopeVersion: savedScope.version
  };
}

async function createSlabDuplicateRaceSource(
  item: AiEstimatorKnowledgeItemService,
  uomId: string,
  name: string,
  quantity: string
): Promise<{
  mainLineId: string;
  revisionId: string;
  aggregateVersion: number;
}> {
  const source = await createConfiguredDraft(item, name, { withPrice: true });
  const quantityMargin = await item.getSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "quantity-margin"
  );
  const saved = await item.updateSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "quantity-margin",
    {
      expectedVersion: quantityMargin.version,
      expectedAggregateVersion: source.aggregateVersion,
      payload: {
        slabRates: [{
          ...slabRate(`slab-rate-${nextId()}`, uomId),
          quantity
        }]
      }
    }
  );
  return { ...source, aggregateVersion: saved.aggregateVersion };
}

async function createSurfaceDuplicateRaceSource(
  item: AiEstimatorKnowledgeItemService,
  surfaceId: string,
  name: string
): Promise<{
  mainLineId: string;
  revisionId: string;
  aggregateVersion: number;
  overviewVersion: number;
}> {
  const source = await createConfiguredDraft(item, name, { withPrice: true });
  const overview = await item.getSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "overview"
  );
  const saved = await item.updateSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "overview",
    {
      expectedVersion: overview.version,
      expectedAggregateVersion: source.aggregateVersion,
      payload: { ...overview.payload, surfaceIds: [surfaceId] }
    }
  );
  return {
    mainLineId: source.mainLineId,
    revisionId: source.revisionId,
    aggregateVersion: saved.aggregateVersion,
    overviewVersion: saved.version
  };
}

async function removeSurfaceFromDuplicateRaceSource(
  item: AiEstimatorKnowledgeItemService,
  source: {
    mainLineId: string;
    revisionId: string;
    aggregateVersion: number;
    overviewVersion: number;
  }
): Promise<void> {
  const overview = await item.getSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "overview"
  );
  await item.updateSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "overview",
    {
      expectedVersion: source.overviewVersion,
      expectedAggregateVersion: source.aggregateVersion,
      payload: { ...overview.payload, surfaceIds: [] }
    }
  );
}

async function removeSlabRateFromDuplicateRaceSource(
  item: AiEstimatorKnowledgeItemService,
  source: {
    mainLineId: string;
    revisionId: string;
    aggregateVersion: number;
  }
): Promise<void> {
  const quantityMargin = await item.getSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "quantity-margin"
  );
  await item.updateSection(
    SUPER_ADMIN,
    source.mainLineId,
    source.revisionId,
    "quantity-margin",
    {
      expectedVersion: quantityMargin.version,
      expectedAggregateVersion: source.aggregateVersion,
      payload: { slabRates: [] }
    }
  );
}

async function nextEventLoopTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function createConfiguredDraft(
  item: AiEstimatorKnowledgeItemService,
  name: string,
  options: {
    withPrice?: boolean;
    executionSteps?: Array<{ id: string; dependencyStepIds: string[] }>;
  } = {}
): Promise<{ mainLineId: string; revisionId: string; aggregateVersion: number }> {
  let detail = await item.createMainLine(SUPER_ADMIN, BASKET_ID, { name });
  const revisionId = detail.draftRevisionId!;
  const overview = await item.getSection(SUPER_ADMIN, detail.mainLineId, revisionId, "overview");
  await item.updateSection(SUPER_ADMIN, detail.mainLineId, revisionId, "overview", {
    expectedVersion: overview.version,
    expectedAggregateVersion: detail.version,
    payload: overviewPayload(name)
  });
  detail = await item.getItem(SUPER_ADMIN, detail.mainLineId);

  if (options.withPrice) {
    const pricing = await item.getSection(SUPER_ADMIN, detail.mainLineId, revisionId, "pricing");
    await item.updateSection(SUPER_ADMIN, detail.mainLineId, revisionId, "pricing", {
      expectedVersion: pricing.version,
      expectedAggregateVersion: detail.version,
      payload: {
        specifications: [{ id: "spec-standard", name: "Standard" }],
        internalVendorNotes: "commercially sensitive",
        priceEntries: [priceCommand(`price-entry-${nextId()}`, "2026-08-28T00:00:00.000Z")]
      }
    });
    detail = await item.getItem(SUPER_ADMIN, detail.mainLineId);
  }

  if (options.executionSteps) {
    const execution = await item.getSection(SUPER_ADMIN, detail.mainLineId, revisionId, "execution");
    await item.updateSection(SUPER_ADMIN, detail.mainLineId, revisionId, "execution", {
      expectedVersion: execution.version,
      expectedAggregateVersion: detail.version,
      payload: {
        steps: options.executionSteps.map((step, index) =>
          executionStep(step.id, index + 1, step.dependencyStepIds)
        )
      }
    });
    detail = await item.getItem(SUPER_ADMIN, detail.mainLineId);
  }
  return { mainLineId: detail.mainLineId, revisionId, aggregateVersion: detail.version };
}

interface DraftLocator {
  readonly mainLineId: string;
  readonly revisionId: string;
  readonly aggregateVersion: number;
}

async function updateDraftSection(
  item: AiEstimatorKnowledgeItemService,
  draft: DraftLocator,
  sectionKey: KnowledgeSectionKey,
  payload: Record<string, unknown>
): Promise<DraftLocator> {
  const section = await item.getSection(
    SUPER_ADMIN,
    draft.mainLineId,
    draft.revisionId,
    sectionKey
  );
  await item.updateSection(
    SUPER_ADMIN,
    draft.mainLineId,
    draft.revisionId,
    sectionKey,
    {
      expectedVersion: section.version,
      expectedAggregateVersion: draft.aggregateVersion,
      payload
    }
  );
  return {
    ...draft,
    aggregateVersion: (await item.getItem(SUPER_ADMIN, draft.mainLineId)).version
  };
}

async function createAndActivateOverviewOnly(
  item: AiEstimatorKnowledgeItemService,
  name: string,
  dependency?: { targetMainLineId: string }
): Promise<{ mainLineId: string; revisionId: string; aggregateVersion: number }> {
  let draft = await createConfiguredDraft(item, name);
  if (dependency) {
    const advanced = await item.getSection(SUPER_ADMIN, draft.mainLineId, draft.revisionId, "advanced");
    await item.updateSection(SUPER_ADMIN, draft.mainLineId, draft.revisionId, "advanced", {
      expectedVersion: advanced.version,
      expectedAggregateVersion: draft.aggregateVersion,
      payload: {
        dependencies: [{
          id: `dependency-${nextId()}`,
          targetBasketId: BASKET_ID,
          targetMainLineId: dependency.targetMainLineId,
          reason: null,
          active: true
        }]
      }
    });
    draft = {
      ...draft,
      aggregateVersion: (await item.getItem(SUPER_ADMIN, draft.mainLineId)).version
    };
  }
  const active = await item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
    expectedVersion: draft.aggregateVersion
  });
  return {
    mainLineId: draft.mainLineId,
    revisionId: draft.revisionId,
    aggregateVersion: active.version
  };
}

function modeConfigurationPayload(pmcMarker: string, crewMarker: string) {
  return {
    dependencies: [],
    modeOverrides: [
      {
        id: "override-pmc",
        modeId: PMC_MODE_ID,
        description: "Retained existing Advanced override",
        active: true
      },
      {
        id: "override-execution",
        modeId: EXECUTION_MODE_ID,
        description: "Execution override must stay isolated",
        active: true
      }
    ],
    revisionLineage: [],
    modeConfigurations: [
      {
        id: "configuration-pmc",
        modeKind: "pmc",
        fields: [{
          id: "field-pmc-mark",
          type: "text",
          label: `PMC mark ${pmcMarker}`,
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
          label: `Sub-Vendor crew ${crewMarker}`,
          options: []
        }]
      },
      {
        id: "configuration-execution-in-house",
        modeKind: "execution",
        executionSource: "in_house",
        fields: [{
          id: "field-in-house-supervisor",
          type: "dropdown",
          label: "In-house supervisor",
          options: ["Day", "Night"]
        }]
      }
    ]
  };
}

function singleModeConfigurationPayload(
  modeId: string,
  suffix: string,
  value: string
) {
  return {
    dependencies: [],
    modeOverrides: [],
    revisionLineage: [],
    modeConfigurations: [{
      id: `configuration-${suffix}`,
      modeId,
      fields: [{
        id: `field-${suffix}`,
        type: "text",
        label: `${suffix} marker`,
        options: [],
        value
      }]
    }]
  };
}

function overviewPayload(description: string) {
  return {
    description,
    uomId: UOM_ID,
    priorityId: null,
    surfaceIds: [],
    modeIds: []
  };
}

function executionStep(id: string, order: number, dependencyStepIds: string[]) {
  return {
    id,
    order,
    name: id,
    description: null,
    durationValue: null,
    durationUnit: null,
    crewSize: null,
    skillType: null,
    mandatory: true,
    parallelizable: false,
    active: true,
    dependencyStepIds
  };
}

function productivityRule(id: string, uomId: string, value: string) {
  return {
    id,
    value,
    uomId,
    crewSize: 1,
    skillType: null,
    minimumDuration: null,
    maximumDuration: null,
    durationUnit: "hours",
    active: true
  };
}

function slabRate(id: string, uomId: string) {
  return {
    id,
    specificationId: "spec-standard",
    uomId,
    quantity: "12.5",
    unitRatePaise: 8_000
  };
}

function priorityRecommendation(
  id: string,
  targetMainLineId: string,
  priorityId: string
) {
  return {
    recommendations: [{
      id,
      targetBasketId: BASKET_ID,
      targetMainLineId,
      type: "recommended",
      priorityId,
      reason: "Priority race",
      quantityRelationship: "same_quantity",
      quantityValue: null,
      dependency: false,
      active: true
    }]
  };
}

function priceCommand(priceEntryId: string, effectiveFrom: string) {
  return {
    operation: "append" as const,
    priceEntryId,
    vendorId: VENDOR_ID,
    uomId: UOM_ID,
    specificationId: null,
    modeId: null,
    taxRuleId: TAX_RULE_ID,
    taxVersionId: TAX_VERSION_ID,
    inputAmountPaise: 10_000,
    treatment: "exclusive" as const,
    effectiveFrom,
    effectiveTo: null,
    status: "active" as const
  };
}

async function budgetRaceMasterDocument(
  masterType: "vendors" | "uoms" | "taxes",
  id: string
) {
  if (masterType === "vendors") {
    return AiEstimatorKnowledgeVendorModel.findById(id).lean().exec();
  }
  if (masterType === "uoms") {
    return AiEstimatorKnowledgeUomModel.findById(id).lean().exec();
  }
  return AiEstimatorKnowledgeTaxRuleModel.findById(id).lean().exec();
}

async function clearBudgetRaceDependencyEpoch(
  masterType: "vendors" | "uoms" | "taxes",
  id: string
): Promise<void> {
  if (masterType === "vendors") {
    await AiEstimatorKnowledgeVendorModel.updateOne(
      { _id: id },
      { $unset: { dependencyEpoch: 1 } }
    ).exec();
    return;
  }
  if (masterType === "uoms") {
    await AiEstimatorKnowledgeUomModel.updateOne(
      { _id: id },
      { $unset: { dependencyEpoch: 1 } }
    ).exec();
    return;
  }
  await AiEstimatorKnowledgeTaxRuleModel.updateOne(
    { _id: id },
    { $unset: { dependencyEpoch: 1 } }
  ).exec();
}

function page() {
  return { limit: 20, offset: 0 };
}

function nextId(): string {
  sequence += 1;
  return `integration-${sequence}`;
}

function authFor(actor: PublicUser): AuthService {
  return {
    async login() {
      throw new Error("Not used by this test.");
    },
    async signupClient() {
      throw new Error("Not used by this test.");
    },
    async authenticate() {
      return actor;
    },
    authorization() {
      return authorizationSnapshotFor(actor.role);
    }
  };
}

async function seedActor(actor: PublicUser): Promise<void> {
  await UserModel.create({
    _id: actor.id,
    name: actor.name,
    email: actor.email,
    emailNormalized: actor.email.toLowerCase(),
    passwordHash: "$2b$10$integrationOnlyHashNotUsedByAuthentication",
    role: actor.role,
    active: true,
    accountKind: "standard",
    version: 1,
    sessionVersion: 1,
    managerId: null,
    authorizedClientIds: []
  });
}

async function seedKnowledgeReferences(): Promise<void> {
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
        createdById: SUPER_ADMIN.id,
        updatedById: SUPER_ADMIN.id,
        createdAt: NOW,
        updatedAt: NOW
      }))
    ),
    AiEstimatorKnowledgeBasketModel.create({
      _id: BASKET_ID,
      name: "Carpentry",
      nameNormalized: "carpentry",
      description: "Asymmetric integration basket",
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeUomModel.create({
      _id: UOM_ID,
      code: "SQFT",
      codeNormalized: "sqft",
      name: "Square foot",
      nameNormalized: "square foot",
      description: null,
      decimalScale: 2,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeVendorModel.create({
      _id: VENDOR_ID,
      code: "LOCAL",
      codeNormalized: "local",
      name: "Local Vendor",
      nameNormalized: "local vendor",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeTaxRuleModel.create({
      _id: TAX_RULE_ID,
      code: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.code,
      codeNormalized: "gst_18",
      name: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.name,
      nameNormalized: "gst 18%",
      description: null,
      displayOrder: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.displayOrder,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeTaxVersionModel.create({
      _id: TAX_VERSION_ID,
      taxRuleId: TAX_RULE_ID,
      versionNumber: 1,
      rateBps: 1_800,
      treatment: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.treatment,
      applicability: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.applicability,
      effectiveFrom: new Date(AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.effectiveFrom),
      effectiveTo: null,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW
    }),
    AiEstimatorKnowledgeModeModel.create({
      _id: PMC_MODE_ID,
      code: "PMC",
      codeNormalized: "pmc",
      name: "PMC",
      nameNormalized: "pmc",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeModeModel.create({
      _id: EXECUTION_MODE_ID,
      code: "EXECUTION",
      codeNormalized: "execution",
      name: "Execution",
      nameNormalized: "execution",
      description: null,
      displayOrder: 2,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    })
  ]);
}

async function seedCompatibilityMasters(): Promise<void> {
  await Promise.all([
    AiEstimatorKnowledgeSurfaceModel.create({
      _id: "integration-surface-wall",
      code: "WALL",
      codeNormalized: "wall",
      name: "Wall",
      nameNormalized: "wall",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    }),
    AiEstimatorKnowledgeModeModel.create({
      _id: "integration-mode-new",
      code: "NEW",
      codeNormalized: "new",
      name: "New work",
      nameNormalized: "new work",
      description: null,
      displayOrder: 1,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      archivedById: null
    })
  ]);
}

async function seedSecondaryUom(): Promise<void> {
  await AiEstimatorKnowledgeUomModel.create({
    _id: "integration-uom-nos",
    code: "NOS",
    codeNormalized: "nos",
    name: "Numbers",
    nameNormalized: "numbers",
    description: null,
    decimalScale: 0,
    displayOrder: 2,
    status: "active",
    version: 1,
    createdById: SUPER_ADMIN.id,
    updatedById: SUPER_ADMIN.id,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    archivedById: null
  });
}

async function persistentStateCounts(): Promise<Record<string, number>> {
  const [
    baskets,
    mainLines,
    revisions,
    sections,
    prices,
    taxVersions,
    audits,
    authorizationCoordination
  ] = await Promise.all([
    AiEstimatorKnowledgeBasketModel.countDocuments(),
    AiEstimatorKnowledgeMainLineModel.countDocuments(),
    AiEstimatorKnowledgeRevisionModel.countDocuments(),
    AiEstimatorKnowledgeSectionModel.countDocuments(),
    AiEstimatorKnowledgePriceVersionModel.countDocuments(),
    AiEstimatorKnowledgeTaxVersionModel.countDocuments(),
    AuditEventModel.countDocuments(),
    AuthorizationCoordinationModel.countDocuments()
  ]);
  return {
    baskets,
    mainLines,
    revisions,
    sections,
    prices,
    taxVersions,
    audits,
    authorizationCoordination
  };
}
