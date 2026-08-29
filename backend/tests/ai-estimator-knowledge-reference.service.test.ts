import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
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
    AiEstimatorKnowledgeRevisionModel.init(),
    AiEstimatorKnowledgeSectionModel.init(),
    AiEstimatorKnowledgePriceVersionModel.init(),
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

  it("maps normalized duplicate races to 409 and permits identity reuse after soft archive", async () => {
    const { service } = harness();
    const created = await service.createBasket(actor, { name: "  ＰＯＰ  / Gypsum " });
    await expect(service.createBasket(actor, { name: "pop / gypsum" })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "DUPLICATE_IDENTITY");
      return true;
    });
    await service.archiveBasket(actor, created.id, { expectedVersion: 1, reason: "Replaced taxonomy" });
    await expect(service.createBasket(actor, { name: "pop / gypsum" })).resolves.toMatchObject({ status: "active", version: 1 });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "pop / gypsum" })).toBe(2);
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

  it("blocks Basket archive while a non-archived Main Line exists", async () => {
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
    await expect(service.archiveBasket(actor, basket.id, { expectedVersion: 1 })).rejects.toSatisfy((error) => {
      expectApiError(error, 409, "ACTIVE_REFERENCE_CONFLICT");
      return true;
    });
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
