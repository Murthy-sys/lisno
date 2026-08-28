import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { KnowledgeSectionKey } from "../src/domain/ai-estimator-knowledge.js";
import { authorizationSnapshotFor, type AuthService, type PublicUser } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
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
const TAX_RULE_ID = "integration-tax-gst";
const TAX_VERSION_ID = "integration-tax-gst-v1";

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

describe("AI estimator knowledge integrated replica-set invariants", () => {
  it("reloads the stored actor for reads and mutations and requires exactly one active Super Admin", async () => {
    const services = createServices();

    await UserModel.updateOne({ _id: SUPER_ADMIN.id }, { $set: { active: false } }).exec();
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
  });

  it("rejects overlapping tax and price windows atomically and resolves exact, non-leaking lineage without writes", async () => {
    const services = createServices();
    await expect(services.reference.updateMaster(SUPER_ADMIN, "taxes", TAX_RULE_ID, {
      expectedVersion: 1,
      taxVersion: {
        rateBps: 1_800,
        treatment: "inclusive",
        applicability: "overlapping interior work",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveTo: null,
        status: "active"
      }
    })).rejects.toMatchObject({ status: 409, code: "EFFECTIVE_WINDOW_OVERLAP" });
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
            priceCommand("price-entry-overlap", "2026-06-01T00:00:00.000Z")
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

    const active = await services.item.activate(SUPER_ADMIN, draft.mainLineId, draft.revisionId, {
      expectedVersion: draft.aggregateVersion
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
      effectiveUnitRatePaise: 11_800,
      vendorPreTax: { amountPaise: 20_000 },
      vendorTax: { amountPaise: 3_600 },
      vendorTotal: { amountPaise: 23_600 }
    });
    expect(context.sections.pricing).not.toHaveProperty("internalVendorNotes");
    expect(context.sections.pricing).not.toHaveProperty("priceEntries");
    expect(JSON.stringify(context)).not.toContain("commercially sensitive");
    expect(JSON.stringify(context)).not.toContain(SUPER_ADMIN.id);
    expect(await persistentStateCounts()).toEqual(beforeContext);
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
            priceCommand("price-entry-replacement", "2026-01-01T00:00:00.000Z")
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
      effectiveUnitRatePaise: 11_800
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
    expect(duplicatePrice).toMatchObject({ status: "draft", reviewRequired: true });
    expect(duplicatePrice?._id).not.toBe(sourcePrice?._id);
    expect(duplicatePrice?.priceEntryId).not.toBe(sourcePrice?.priceEntryId);

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
    expect(await AuditEventModel.countDocuments({
      action: "ai_estimator_knowledge_main_line_duplicated",
      entityId: duplicate.mainLineId
    })).toBe(1);
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
    expect(context.sections.advanced).toMatchObject({ dependencies: [], modeOverrides: [] });
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
        priceEntries: [priceCommand(`price-entry-${nextId()}`, "2026-01-01T00:00:00.000Z")]
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

function priceCommand(priceEntryId: string, effectiveFrom: string) {
  return {
    operation: "append" as const,
    priceEntryId,
    vendorId: VENDOR_ID,
    uomId: UOM_ID,
    specificationId: "spec-standard",
    modeId: null,
    taxRuleId: TAX_RULE_ID,
    taxVersionId: TAX_VERSION_ID,
    inputAmountPaise: 11_800,
    treatment: "inclusive" as const,
    effectiveFrom,
    effectiveTo: null,
    status: "active" as const
  };
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
      code: "GST18",
      codeNormalized: "gst18",
      name: "GST 18%",
      nameNormalized: "gst 18%",
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
    AiEstimatorKnowledgeTaxVersionModel.create({
      _id: TAX_VERSION_ID,
      taxRuleId: TAX_RULE_ID,
      versionNumber: 1,
      rateBps: 1_800,
      treatment: "inclusive",
      applicability: "interior work",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      status: "active",
      version: 1,
      createdById: SUPER_ADMIN.id,
      updatedById: SUPER_ADMIN.id,
      createdAt: NOW,
      updatedAt: NOW
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
