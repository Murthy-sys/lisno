import { describe, expect, it } from "vitest";

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

const actor = {
  createdById: "user-super-admin",
  updatedById: "user-super-admin"
};

const completeness = {
  percentage: 0,
  sections: [],
  blockers: [],
  warnings: []
};

describe("AI estimator knowledge models", () => {
  it("keeps every collection feature-specific, strict, and version-key free", () => {
    const models = [
      AiEstimatorKnowledgeBasketModel,
      AiEstimatorKnowledgeMainLineModel,
      AiEstimatorKnowledgeRevisionModel,
      AiEstimatorKnowledgeSectionModel,
      AiEstimatorKnowledgePriceVersionModel,
      AiEstimatorKnowledgeUomModel,
      AiEstimatorKnowledgeVendorModel,
      AiEstimatorKnowledgeTaxRuleModel,
      AiEstimatorKnowledgeTaxVersionModel,
      AiEstimatorKnowledgePriorityModel,
      AiEstimatorKnowledgeSurfaceModel,
      AiEstimatorKnowledgeModeModel
    ];
    expect(new Set(models.map((entry) => entry.collection.collectionName)).size).toBe(12);
    models.forEach((entry) => {
      expect(entry.collection.collectionName).toMatch(/^aiEstimatorKnowledge/u);
      expect(entry.schema.get("strict")).toBe("throw");
      expect(entry.schema.get("versionKey")).toBe(false);
      expect(entry.schema.path("version")).toBeDefined();
    });
  });

  it("normalizes basket identities before validation and uses a partial unique race barrier", async () => {
    const first = new AiEstimatorKnowledgeBasketModel({
      _id: "basket-1",
      name: "  ＰＯＰ   / Gypsum ",
      description: null,
      displayOrder: 0,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });
    const second = new AiEstimatorKnowledgeBasketModel({
      _id: "basket-2",
      name: "pop / gypsum",
      description: null,
      displayOrder: 1,
      status: "inactive",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });
    await Promise.all([first.validate(), second.validate()]);
    expect(first.nameNormalized).toBe("pop / gypsum");
    expect(second.nameNormalized).toBe("pop / gypsum");
    expect(AiEstimatorKnowledgeBasketModel.schema.indexes()).toContainEqual([
      { nameNormalized: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { status: { $in: ["active", "inactive"] } }
      })
    ]);
  });

  it("keeps the Basket dependency epoch internal and backward-compatible", async () => {
    const basket = new AiEstimatorKnowledgeBasketModel({
      _id: "basket-guarded",
      name: "Guarded Basket",
      description: null,
      displayOrder: 0,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });

    await expect(basket.validate()).resolves.toBeUndefined();
    expect(basket.dependencyEpoch).toBe(0);
    const dependencyEpoch = AiEstimatorKnowledgeBasketModel.schema.path("dependencyEpoch");
    expect(dependencyEpoch).toBeDefined();
    expect(dependencyEpoch.isRequired).not.toBe(true);
  });

  it("keeps the Mode dependency epoch internal and backward-compatible", async () => {
    const mode = new AiEstimatorKnowledgeModeModel({
      _id: "mode-guarded",
      code: "PMC",
      name: "PMC",
      description: null,
      displayOrder: 0,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });

    await expect(mode.validate()).resolves.toBeUndefined();
    expect(mode.dependencyEpoch).toBe(0);
    const dependencyEpoch = AiEstimatorKnowledgeModeModel.schema.path("dependencyEpoch");
    expect(dependencyEpoch).toBeDefined();
    expect(dependencyEpoch.isRequired).not.toBe(true);
  });

  it("keeps the UOM dependency epoch optional for legacy documents", async () => {
    const uom = new AiEstimatorKnowledgeUomModel({
      _id: "uom-guarded",
      code: "SFT",
      name: "Square feet",
      description: null,
      decimalScale: 2,
      displayOrder: 0,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });

    await expect(uom.validate()).resolves.toBeUndefined();
    expect(uom.dependencyEpoch).toBe(0);
    const dependencyEpoch = AiEstimatorKnowledgeUomModel.schema.path("dependencyEpoch");
    expect(dependencyEpoch).toBeDefined();
    expect(dependencyEpoch.isRequired).not.toBe(true);
  });

  it("stores optional canonical Priority semantics with a private legacy-safe epoch", async () => {
    const canonical = new AiEstimatorKnowledgePriorityModel({
      _id: "knowledge-priority-bootstrap-high",
      code: "HIGH",
      name: "High",
      description: null,
      displayOrder: 1,
      status: "active",
      semanticTier: "high",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });
    await expect(canonical.validate()).resolves.toBeUndefined();
    expect(canonical.semanticTier).toBe("high");
    expect(canonical.dependencyEpoch).toBe(0);

    const legacy = AiEstimatorKnowledgePriorityModel.hydrate({
      _id: "knowledge-priority-legacy",
      code: "CUSTOM",
      codeNormalized: "custom",
      name: "Custom",
      nameNormalized: "custom",
      description: null,
      displayOrder: 10,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });
    await expect(legacy.validate()).resolves.toBeUndefined();
    expect(legacy.semanticTier).toBeUndefined();
    expect(legacy.dependencyEpoch).toBe(0);

    const semanticTier = AiEstimatorKnowledgePriorityModel.schema.path("semanticTier");
    expect(semanticTier).toBeDefined();
    expect(semanticTier.isRequired).not.toBe(true);
    expect((semanticTier as unknown as { enumValues: string[] }).enumValues).toEqual([
      "non_negotiable",
      "high",
      "medium",
      "low"
    ]);
    const dependencyEpoch = AiEstimatorKnowledgePriorityModel.schema.path("dependencyEpoch");
    expect(dependencyEpoch).toBeDefined();
    expect(dependencyEpoch.isRequired).not.toBe(true);

    expect(AiEstimatorKnowledgePriorityModel.schema.indexes()).toContainEqual([
      { semanticTier: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: {
          status: { $in: ["active", "inactive"] },
          semanticTier: { $type: "string" }
        }
      })
    ]);
  });

  it("rejects unknown Priority semantic tiers", async () => {
    const priority = new AiEstimatorKnowledgePriorityModel({
      _id: "knowledge-priority-urgent",
      code: "URGENT",
      name: "Urgent",
      description: null,
      displayOrder: 4,
      status: "active",
      semanticTier: "urgent",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });

    await expect(priority.validate()).rejects.toThrow(/semanticTier/u);
  });

  it("allows archived identity reuse by excluding archived records from unique indexes", () => {
    for (const model of [
      AiEstimatorKnowledgeBasketModel,
      AiEstimatorKnowledgeUomModel,
      AiEstimatorKnowledgeVendorModel,
      AiEstimatorKnowledgeTaxRuleModel,
      AiEstimatorKnowledgePriorityModel,
      AiEstimatorKnowledgeSurfaceModel,
      AiEstimatorKnowledgeModeModel
    ]) {
      const uniqueIndexes = model.schema.indexes().filter(([, options]) => options.unique);
      expect(uniqueIndexes.length).toBeGreaterThan(0);
      uniqueIndexes.forEach(([, options]) => {
        expect(options.partialFilterExpression).toMatchObject({
          status: { $in: ["active", "inactive"] }
        });
      });
    }
  });

  it("enforces one normalized non-archived Main Line identity per Basket", async () => {
    const line = new AiEstimatorKnowledgeMainLineModel({
      _id: "line-1",
      basketId: "basket-1",
      name: " Plain  False Ceiling ",
      description: null,
      displayOrder: 0,
      status: "draft",
      activeRevisionId: null,
      draftRevisionId: "revision-1",
      version: 1,
      ...actor,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    });
    await line.validate();
    expect(line.nameNormalized).toBe("plain false ceiling");
    expect(AiEstimatorKnowledgeMainLineModel.schema.indexes()).toContainEqual([
      { basketId: 1, nameNormalized: 1 },
      expect.objectContaining({ unique: true })
    ]);
  });

  it("uses revision-scoped identities for revisions, sections, and prices", () => {
    expect(AiEstimatorKnowledgeRevisionModel.schema.indexes()).toContainEqual([
      { mainLineId: 1, revisionNumber: 1 },
      expect.objectContaining({ unique: true })
    ]);
    expect(AiEstimatorKnowledgeSectionModel.schema.indexes()).toContainEqual([
      { revisionId: 1, sectionKey: 1 },
      expect.objectContaining({ unique: true })
    ]);
    expect(AiEstimatorKnowledgePriceVersionModel.schema.indexes()).toContainEqual([
      { revisionId: 1, priceEntryId: 1, versionNumber: 1 },
      expect.objectContaining({ unique: true })
    ]);
  });

  it("validates strict bounded section payloads", async () => {
    const valid = new AiEstimatorKnowledgeSectionModel({
      _id: "section-1",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "overview",
      applicability: "configured",
      payload: { uomId: "uom-1", modeIds: ["mode-1"] },
      version: 1,
      ...actor
    });
    await expect(valid.validate()).resolves.toBeUndefined();

    const invalid = new AiEstimatorKnowledgeSectionModel({
      _id: "section-2",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "overview",
      applicability: "configured",
      payload: { invented: true },
      version: 1,
      ...actor
    });
    await expect(invalid.validate()).rejects.toThrow(/not valid for overview/u);

    const dynamicMode = new AiEstimatorKnowledgeSectionModel({
      _id: "section-mode-configuration",
      mainLineId: "line-1",
      revisionId: "revision-1",
      sectionKey: "advanced",
      applicability: "configured",
      payload: {
        dependencies: [],
        modeConfigurations: [
          {
            id: "configuration-pmc",
            modeId: "mode-pmc",
            fields: [{
              id: "field-pmc-mark",
              type: "text",
              label: "PMC mark",
              options: [],
              value: "A1"
            }]
          },
          {
            id: "configuration-execution",
            modeId: "mode-execution",
            fields: [{
              id: "field-crew-code",
              type: "text",
              label: "Crew code",
              options: [],
              value: "E-27"
            }]
          }
        ]
      },
      version: 1,
      ...actor
    });
    await expect(dynamicMode.validate()).resolves.toBeUndefined();
  });

  it("requires lifecycle metadata for immutable active revisions", async () => {
    const invalid = new AiEstimatorKnowledgeRevisionModel({
      _id: "revision-1",
      mainLineId: "line-1",
      revisionNumber: 1,
      status: "active",
      sourceRevisionId: null,
      contentDigest: null,
      completeness,
      version: 1,
      ...actor,
      activatedAt: null,
      activatedById: null,
      supersededAt: null,
      supersededById: null
    });
    await expect(invalid.validate()).rejects.toThrow(/lifecycle metadata|content digest/u);
  });

  it("derives a deterministic price scope and validates immutable tax components", async () => {
    const price = new AiEstimatorKnowledgePriceVersionModel({
      _id: "price-version-1",
      mainLineId: "line-1",
      revisionId: "revision-1",
      priceEntryId: "price-1",
      scopeKey: "0".repeat(64),
      versionNumber: 1,
      vendorId: "vendor-1",
      uomId: "uom-1",
      specificationId: null,
      modeId: "mode-1",
      taxRuleId: "tax-1",
      taxVersionId: "tax-version-1",
      treatment: "exclusive",
      inputAmountPaise: 7_500,
      baseAmountPaise: 7_500,
      taxAmountPaise: 1_350,
      totalAmountPaise: 8_850,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
      status: "active",
      reviewRequired: false,
      version: 1,
      ...actor
    });
    await price.validate();
    expect(price.scopeKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(price.scopeKey).not.toBe("0".repeat(64));

    price.totalAmountPaise = 8_849;
    await expect(price.validate()).rejects.toThrow(/Base and tax must equal total/u);
  });

  it("validates UOM scale and tax effective windows", async () => {
    const uom = new AiEstimatorKnowledgeUomModel({
      _id: "uom-1",
      code: "SFT",
      name: "Square feet",
      description: null,
      decimalScale: 4,
      displayOrder: 0,
      status: "active",
      version: 1,
      ...actor,
      archivedAt: null,
      archivedById: null
    });
    await expect(uom.validate()).rejects.toThrow(/decimalScale/u);

    const taxVersion = new AiEstimatorKnowledgeTaxVersionModel({
      _id: "tax-version-1",
      taxRuleId: "tax-1",
      versionNumber: 1,
      rateBps: 1_800,
      treatment: "exclusive",
      applicability: "interior works",
      effectiveFrom: new Date("2026-02-01T00:00:00Z"),
      effectiveTo: new Date("2026-01-01T00:00:00Z"),
      status: "active",
      version: 1,
      ...actor
    });
    await expect(taxVersion.validate()).rejects.toThrow(/effective window/u);
  });

  it("keeps Tax financial history immutable while allowing only its rollover boundary to close", () => {
    for (const field of [
      "rateBps",
      "treatment",
      "applicability",
      "effectiveFrom"
    ]) {
      expect(AiEstimatorKnowledgeTaxVersionModel.schema.path(field).options.immutable).toBe(true);
    }
    expect(
      AiEstimatorKnowledgeTaxVersionModel.schema.path("effectiveTo").options.immutable
    ).not.toBe(true);
  });
});
