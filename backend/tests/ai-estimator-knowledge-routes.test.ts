import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "../src/middleware/errors.js";
import {
  createAiEstimatorKnowledgeAdminRouter,
  type AiEstimatorKnowledgeAdminRouterServices
} from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextRouter } from "../src/routes/ai-estimator-knowledge-context.js";
import type { AiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import type { AiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import type { AiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

const superAdmin: PublicUser = {
  id: "super-admin-1",
  name: "Super Admin",
  email: "super-admin@example.test",
  role: "super_admin"
};

const admin: PublicUser = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.test",
  role: "admin"
};

function authService(): AuthService {
  return {
    authenticate: vi.fn(async (token: string) =>
      token === "admin-token" ? admin : superAdmin)
  } as unknown as AuthService;
}

function services() {
  const reference = {
    listBaskets: vi.fn(async () => ({ items: [{ id: "basket-1" }], total: 1 })),
    createBasket: vi.fn(async () => ({ id: "basket-1" })),
    updateBasket: vi.fn(async () => ({ id: "basket-1" })),
    archiveBasket: vi.fn(async () => ({ id: "basket-1", status: "archived" })),
    listMasters: vi.fn(async () => ({ items: [], total: 0 })),
    createMaster: vi.fn(async () => ({ id: "master-1" })),
    updateMaster: vi.fn(async () => ({ id: "master-1" })),
    archiveMaster: vi.fn(async () => ({ id: "master-1", status: "archived" }))
  } as unknown as AiEstimatorKnowledgeReferenceService;
  const item = {
    listMainLines: vi.fn(async () => ({ items: [], total: 0 })),
    createMainLine: vi.fn(async () => ({ id: "line-1" })),
    updateMainLine: vi.fn(async () => ({ id: "line-1" })),
    archiveMainLine: vi.fn(async () => ({ id: "line-1", status: "archived" })),
    listItems: vi.fn(async () => ({ items: [], total: 0 })),
    getItem: vi.fn(async () => ({ id: "line-1" })),
    history: vi.fn(async () => ({ items: [], total: 0 })),
    createRevision: vi.fn(async () => ({ id: "line-1", draftRevisionId: "revision-2" })),
    getSection: vi.fn(async () => ({ id: "section-1" })),
    updateSection: vi.fn(async () => ({ id: "section-1", version: 2 })),
    activate: vi.fn(async () => ({ id: "line-1", status: "active" })),
    deactivate: vi.fn(async () => ({ id: "line-1", status: "inactive" })),
    duplicate: vi.fn(async () => ({ id: "line-2" }))
  } as unknown as AiEstimatorKnowledgeItemService;
  const context = {
    preview: vi.fn(async () => ({ formulaVersion: "knowledge-preview-v1" })),
    resolve: vi.fn(async () => ({
      lineage: { mainLineId: "line-1", revisionId: "revision-1" },
      availability: [],
      sections: {},
      preview: null
    }))
  } as unknown as AiEstimatorKnowledgeContextService;
  return { reference, item, context };
}

function appFor(testServices: AiEstimatorKnowledgeAdminRouterServices) {
  const app = express();
  app.use(express.json({ limit: "300kb" }));
  const auth = authService();
  app.use("/api/v1", createAiEstimatorKnowledgeAdminRouter(auth, testServices));
  app.use("/api/v1", createAiEstimatorKnowledgeContextRouter(auth, testServices.context));
  app.use(errorHandler);
  return app;
}

describe("AI Estimator Knowledge HTTP routes", () => {
  it("returns 403 before strict validation for a non-Super-Admin", async () => {
    const testServices = services();
    const response = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/baskets")
      .set("Authorization", "Bearer admin-token")
      .send({ unknown: true });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(testServices.reference.createBasket).not.toHaveBeenCalled();
  });

  it("rejects unknown Basket fields and does not call the service", async () => {
    const testServices = services();
    const response = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/baskets")
      .set("Authorization", "Bearer super-admin-token")
      .send({ name: "POP / Gypsum", unexpected: "not allowed" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(response.body.error.fields.unexpected).toContain("Unrecognized field");
    expect(testServices.reference.createBasket).not.toHaveBeenCalled();
  });

  it("creates a Basket with 201 and the authenticated actor", async () => {
    const testServices = services();
    const response = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/baskets")
      .set("Authorization", "Bearer super-admin-token")
      .send({ name: "POP / Gypsum", description: null, displayOrder: 3 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { id: "basket-1" } });
    expect(testServices.reference.createBasket).toHaveBeenCalledWith(
      superAdmin,
      { name: "POP / Gypsum", description: null, displayOrder: 3 }
    );
  });

  it("splits list filters from pagination and returns page metadata", async () => {
    const testServices = services();
    const response = await request(appFor(testServices))
      .get("/api/v1/admin/ai-estimator-knowledge/baskets?search=POP&includeArchived=false&limit=5&offset=0")
      .set("Authorization", "Bearer super-admin-token");

    expect(response.status).toBe(200);
    expect(testServices.reference.listBaskets).toHaveBeenCalledWith(
      superAdmin,
      { search: "POP", includeArchived: false },
      { limit: 5, offset: 0 }
    );
    expect(response.body.data.pagination).toEqual({
      limit: 5,
      offset: 0,
      total: 1,
      hasMore: false
    });
  });

  it("dispatches each reusable-value family with its closed plural type", async () => {
    const testServices = services();
    const response = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/uoms")
      .set("Authorization", "Bearer super-admin-token")
      .send({ code: "SQFT", name: "Square foot", decimalScale: 2 });

    expect(response.status).toBe(201);
    expect(testServices.reference.createMaster).toHaveBeenCalledWith(
      superAdmin,
      "uoms",
      { code: "SQFT", name: "Square foot", decimalScale: 2, displayOrder: 0 }
    );
  });

  it("accepts explicit Tax rollover intent only on the update contract", async () => {
    const testServices = services();
    const taxVersion = {
      rateBps: 2_000,
      treatment: "exclusive",
      applicability: "interior works",
      effectiveFrom: "2027-01-01T00:00:00.000Z",
      effectiveTo: null,
      status: "active",
      rolloverFromVersionId: "tax-version-1"
    };
    const updated = await request(appFor(testServices))
      .patch("/api/v1/admin/ai-estimator-knowledge/taxes/tax-1")
      .set("Authorization", "Bearer super-admin-token")
      .send({ expectedVersion: 1, taxVersion });
    expect(updated.status).toBe(200);
    expect(testServices.reference.updateMaster).toHaveBeenCalledWith(
      superAdmin,
      "taxes",
      "tax-1",
      { expectedVersion: 1, taxVersion }
    );

    const createRejected = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/taxes")
      .set("Authorization", "Bearer super-admin-token")
      .send({ code: "GST20", name: "GST 20%", taxVersion });
    expect(createRejected.status).toBe(400);
    expect(testServices.reference.createMaster).not.toHaveBeenCalledWith(
      superAdmin,
      "taxes",
      expect.objectContaining({ taxVersion })
    );
  });

  it("validates section identity and bounded section-specific fields", async () => {
    const testServices = services();
    const invalidSection = await request(appFor(testServices))
      .put("/api/v1/admin/ai-estimator-knowledge/main-lines/line-1/revisions/revision-1/sections/not-a-section")
      .set("Authorization", "Bearer super-admin-token")
      .send({ expectedVersion: 1, payload: {} });
    expect(invalidSection.status).toBe(400);
    expect(invalidSection.body.error.fields.sectionKey).toBeDefined();

    const invalidPayload = await request(appFor(testServices))
      .put("/api/v1/admin/ai-estimator-knowledge/main-lines/line-1/revisions/revision-1/sections/overview")
      .set("Authorization", "Bearer super-admin-token")
      .send({ expectedVersion: 1, payload: { internalVendorNotes: "hidden" } });
    expect(invalidPayload.status).toBe(400);
    expect(invalidPayload.body.error.fields["payload.internalVendorNotes"]).toBeDefined();
    expect(testServices.item.updateSection).not.toHaveBeenCalled();
  });

  it("accepts only the deterministic preview contract", async () => {
    const testServices = services();
    const input = {
      unitRatePaise: 7_500,
      quantityAdjustmentBps: 500,
      quantity: "2.5",
      quantityScale: 2,
      wastageBps: 250,
      taxRateBps: 1_800,
      taxTreatment: "exclusive",
      startMarginBps: 2_500,
      bottomMarginBps: 1_500,
      pmcMarkupBps: 1_500,
      duration: {
        productivity: "1.25",
        productivityScale: 2,
        unit: "hours",
        minimum: "1",
        maximum: "8"
      }
    };
    const response = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/preview")
      .set("Authorization", "Bearer super-admin-token")
      .send(input);

    expect(response.status).toBe(200);
    expect(testServices.context.preview).toHaveBeenCalledWith(superAdmin, input);
    expect(response.body.data).not.toHaveProperty("finalPrice");
  });

  it("resolves context through the read service without calling mutations", async () => {
    const testServices = services();
    const input = {
      mainBasketId: "basket-1",
      mainLineId: "line-1",
      specificationId: "spec-1",
      quantity: "1500.000",
      uomId: "uom-1",
      surfaceId: "surface-1",
      modeId: "mode-1"
    };
    const response = await request(appFor(testServices))
      .post("/api/v1/ai-estimator-knowledge/context")
      .set("Authorization", "Bearer super-admin-token")
      .send(input);

    expect(response.status).toBe(200);
    expect(testServices.context.resolve).toHaveBeenCalledWith(superAdmin, input);
    expect(testServices.reference.createBasket).not.toHaveBeenCalled();
    expect(testServices.item.updateSection).not.toHaveBeenCalled();
  });

  it("rejects generic objects for context and preview", async () => {
    const testServices = services();
    const contextResponse = await request(appFor(testServices))
      .post("/api/v1/ai-estimator-knowledge/context")
      .set("Authorization", "Bearer super-admin-token")
      .send({ mainBasketId: "basket-1", mainLineId: "line-1", name: "not an ID join" });
    const previewResponse = await request(appFor(testServices))
      .post("/api/v1/admin/ai-estimator-knowledge/preview")
      .set("Authorization", "Bearer super-admin-token")
      .send({ quantityScale: 2, finalPrice: 100 });

    expect(contextResponse.status).toBe(400);
    expect(previewResponse.status).toBe(400);
    expect(testServices.context.resolve).not.toHaveBeenCalled();
    expect(testServices.context.preview).not.toHaveBeenCalled();
  });
});
