import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { ROLE_CODES } from "../src/domain/roles.js";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createAiEstimatorKnowledgeAdminRouter, type AiEstimatorKnowledgeAdminRouterServices } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createVendorBasketProposalRouter } from "../src/routes/vendor-basket-proposals.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { createVendorBasketProposalService } from "../src/services/vendor-basket-proposal.service.js";

const procurement: PublicUser = { id: "procurement-owner", name: "Procurement", email: "procurement@example.test", role: "procurement" };
const superAdmin: PublicUser = { id: "super-admin-reviewer", name: "Super Admin", email: "reviewer@example.test", role: "super_admin" };
const scopes = [
  { scope: "procurement", base: "/api/v1/procurement/vendor-basket-proposals", actor: procurement },
  { scope: "admin", base: "/api/v1/admin/ai-estimator-knowledge/basket-proposals", actor: superAdmin }
] as const;
const proposalId = "proposal-fixture";
const resourceId = "proposed-master-fixture";
const header = { Authorization: "Bearer fixture-token" };
const versions = { expectedVersion: 7, expectedRequestVersion: 3 };
const masterInput = { ...versions, name: "Fixture UOM", decimalScale: 2 };
const mutation = { detail: { id: proposalId, version: 8 }, resource: { resourceId, kind: "uom" } };
const page = { items: [{ resourceId, kind: "uom", payload: { name: "Fixture UOM", code: "FIXTURE-UOM", decimalScale: 2 } }], pagination: { limit: 20, offset: 0, total: 1, hasMore: false } };

function fixture(actor: PublicUser = procurement) {
  const service = {
    masters: vi.fn(async () => page),
    addMaster: vi.fn(async () => mutation),
    saveMaster: vi.fn(async () => mutation),
    removeMaster: vi.fn(async () => ({ ...mutation, resource: null }))
  };
  const shared = { createMaster: vi.fn(async () => ({ id: "shared-master" })) };
  const auth = { authenticate: vi.fn(async () => actor) } as unknown as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createVendorBasketProposalRouter(auth, service as unknown as ReturnType<typeof createVendorBasketProposalService>));
  app.use("/api/v1", createAiEstimatorKnowledgeAdminRouter(auth, {
    reference: shared, item: {}, context: {}, qualityControlOptions: {}, specificationItemNames: {}
  } as unknown as AiEstimatorKnowledgeAdminRouterServices));
  app.use(errorHandler);
  return { app, service, shared };
}

describe.each(scopes)("$scope proposal master HTTP routes", ({ scope, base, actor }) => {
  const collection = `${base}/${proposalId}/masters`;

  it("reads only the requested kind and snapshot, forwarding bounded pagination with private caching", async () => {
    const { app, service } = fixture(actor);
    for (const masterKind of ["uoms", "surfaces"]) {
      const defaults = await request(app).get(`${collection}/${masterKind}`).set(header).expect(200);
      expect(defaults.body).toEqual({ data: page });
      expect(defaults.headers["cache-control"]).toBe("private, no-store");
      expect(service.masters).toHaveBeenLastCalledWith(actor, scope, proposalId, masterKind, { snapshot: "current", limit: 20, offset: 0 });
      for (const snapshot of ["current", "submitted", "approved"]) {
        await request(app).get(`${collection}/${masterKind}`).query({ snapshot, limit: 100, offset: 20 }).set(header).expect(200);
        expect(service.masters).toHaveBeenLastCalledWith(actor, scope, proposalId, masterKind, { snapshot, limit: 100, offset: 20 });
      }
    }
    expect(service.addMaster).not.toHaveBeenCalled();
  });

  it("forwards normalized create and edit commands with both concurrency versions, returning mutation envelopes", async () => {
    const { app, service, shared } = fixture(actor);
    for (const [kind, input] of [
      ["uoms", { ...versions, name: "  Square\u00a0\u00a0ｍetre  ", description: null, decimalScale: 0 }],
      ["surfaces", { ...versions, name: "  Drywall  finish  ", description: "Proposed surface" }]
    ] as const) {
      const normalized = { ...input, name: kind === "uoms" ? "Square metre" : "Drywall finish" };
      const created = await request(app).post(`${collection}/${kind}`).set(header).send(input).expect(201);
      expect(created.body).toEqual({ data: mutation });
      expect(created.headers["cache-control"]).toBe("private, no-store");
      expect(service.addMaster).toHaveBeenLastCalledWith(actor, scope, proposalId, kind, normalized);
      const saved = await request(app).patch(`${collection}/${kind}/${resourceId}`).set(header).send(input).expect(200);
      expect(saved.body).toEqual({ data: mutation });
      expect(saved.headers["cache-control"]).toBe("private, no-store");
      expect(service.saveMaster).toHaveBeenLastCalledWith(actor, scope, proposalId, kind, resourceId, normalized);
    }
    expect(shared.createMaster).not.toHaveBeenCalled();
  });

  it("allows all supported UOM precision values and leaves absent request versions absent", async () => {
    const { app, service } = fixture(actor);
    for (const decimalScale of [0, 1, 2, 3]) {
      const input = { expectedVersion: 1, name: "Fixture unit", decimalScale };
      await request(app).post(`${collection}/uoms`).set(header).send(input).expect(201);
      expect(service.addMaster).toHaveBeenLastCalledWith(actor, scope, proposalId, "uoms", input);
    }
  });

  it("removes only the named resource with version guards and preserves the null-resource envelope", async () => {
    const { app, service } = fixture(actor);
    for (const kind of ["uoms", "surfaces"]) {
      const response = await request(app).delete(`${collection}/${kind}/${resourceId}`).set(header).send(versions).expect(200);
      expect(response.body).toEqual({ data: { ...mutation, resource: null } });
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(service.removeMaster).toHaveBeenLastCalledWith(actor, scope, proposalId, kind, resourceId, versions);
    }
  });

  it("requires authentication and rejects every other role before invoking private services", async () => {
    const methods = ["get", "post", "patch", "delete"] as const;
    const path = (method: typeof methods[number]) => `${collection}/uoms${method === "patch" || method === "delete" ? `/${resourceId}` : ""}`;
    const unauthenticated = fixture(actor);
    for (const method of methods) {
      await request(unauthenticated.app)[method](path(method)).send(method === "delete" ? versions : masterInput).expect(401);
    }
    for (const role of ROLE_CODES.filter((role) => role !== actor.role)) {
      const denied = fixture({ ...actor, id: `denied-${role}`, role });
      for (const method of methods) {
        const response = await request(denied.app)[method](path(method)).set(header).send(method === "delete" ? versions : masterInput);
        expect(response.status, `${role} ${method}`).toBe(403);
        expect(response.body).not.toHaveProperty("data");
      }
      for (const call of Object.values(denied.service)) expect(call).not.toHaveBeenCalled();
    }
    for (const call of Object.values(unauthenticated.service)) expect(call).not.toHaveBeenCalled();
  });

  it("rejects unsupported kinds and invalid identifiers before invoking the service", async () => {
    const { app, service } = fixture(actor);
    for (const kind of ["vendors", "taxes", "modes", "uom", "surface", "UOMS"]) {
      await request(app).get(`${collection}/${kind}`).set(header).expect(400);
      await request(app).post(`${collection}/${kind}`).set(header).send(masterInput).expect(400);
      await request(app).patch(`${collection}/${kind}/${resourceId}`).set(header).send(masterInput).expect(400);
      await request(app).delete(`${collection}/${kind}/${resourceId}`).set(header).send(versions).expect(400);
    }
    await request(app).get(`${base}/bad%20id/masters/uoms`).set(header).expect(400);
    await request(app).patch(`${collection}/uoms/bad%20id`).set(header).send(masterInput).expect(400);
    for (const call of Object.values(service)) expect(call).not.toHaveBeenCalled();
  });

  it("rejects invalid snapshot and pagination queries without accessing saved resources", async () => {
    const { app, service } = fixture(actor);
    for (const query of [
      { snapshot: "draft" }, { snapshot: ["current", "approved"] }, { limit: 0 }, { limit: 101 },
      { limit: 1.5 }, { offset: -1 }, { offset: 1.5 }, { requesterId: "another-owner" }, { status: "active" }
    ]) {
      await request(app).get(`${collection}/uoms`).query(query).set(header).expect(400);
    }
    expect(service.masters).not.toHaveBeenCalled();
  });

  it("requires valid names, precision and integer versions without accepting server-owned fields", async () => {
    const { app, service } = fixture(actor);
    const badUoms: Record<string, unknown>[] = [
      { expectedVersion: 1, name: "No precision" },
      ...[-1, 4, 1.5, "2", null].map((decimalScale) => ({ ...masterInput, decimalScale })),
      ...["", "  ", "x".repeat(241)].map((name) => ({ ...masterInput, name })),
      ...[0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1].map((expectedVersion) => ({ ...masterInput, expectedVersion })),
      { ...masterInput, expectedRequestVersion: 0 }, { ...masterInput, expectedRequestVersion: "3" },
      { name: "Missing version", decimalScale: 1 }, { ...masterInput, description: "x".repeat(4001) }
    ];
    for (const method of ["post", "patch"] as const) {
      const suffix = method === "patch" ? `/${resourceId}` : "";
      for (const input of badUoms) await request(app)[method](`${collection}/uoms${suffix}`).set(header).send(input).expect(400);
      await request(app)[method](`${collection}/surfaces${suffix}`).set(header).send(masterInput).expect(400);
      for (const kind of ["uoms", "surfaces"]) {
        const baseInput = { ...versions, name: "Fixture", ...(kind === "uoms" ? { decimalScale: 1 } : {}) };
        for (const forbidden of ["status", "code", "displayOrder", "requesterId", "proposalId", "resourceId", "savedById", "snapshot"]) {
          await request(app)[method](`${collection}/${kind}${suffix}`).set(header).send({ ...baseInput, [forbidden]: "tampered" }).expect(400);
        }
      }
    }
    for (const input of [{}, { expectedVersion: 0 }, { ...versions, name: "Tampered" }, { ...versions, requesterId: "other" }]) {
      await request(app).delete(`${collection}/uoms/${resourceId}`).set(header).send(input).expect(400);
    }
    expect(service.addMaster).not.toHaveBeenCalled();
    expect(service.saveMaster).not.toHaveBeenCalled();
    expect(service.removeMaster).not.toHaveBeenCalled();
  });

  it("preserves service authorization, read-only and reference-conflict errors without exposing a success body", async () => {
    const { app, service } = fixture(actor);
    service.masters.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "The proposal was not found."));
    const missing = await request(app).get(`${collection}/uoms`).set(header).expect(404);
    expect(missing.body).toEqual({ error: { code: "NOT_FOUND", message: "The proposal was not found." } });
    expect(missing.headers["cache-control"]).toBe("private, no-store");
    service.addMaster.mockRejectedValueOnce(new ApiError(409, "PROPOSAL_READ_ONLY", "This proposal is read only."));
    const frozen = await request(app).post(`${collection}/uoms`).set(header).send(masterInput).expect(409);
    expect(frozen.body.error.code).toBe("PROPOSAL_READ_ONLY");
    expect(frozen.body).not.toHaveProperty("data");
    service.removeMaster.mockRejectedValueOnce(new ApiError(409, "PROPOSAL_MASTER_REFERENCED", "A saved line uses this value.", { resourceId: "line-fixture" }));
    const used = await request(app).delete(`${collection}/uoms/${resourceId}`).set(header).send(versions).expect(409);
    expect(used.body.error).toMatchObject({ code: "PROPOSAL_MASTER_REFERENCED", fields: { resourceId: "line-fixture" } });
    expect(used.headers["cache-control"]).toBe("private, no-store");
    expect(service.addMaster).toHaveBeenCalledTimes(1);
    expect(service.removeMaster).toHaveBeenCalledTimes(1);
  });
});

describe("proposal masters and shared Configuration authority", () => {
  it("denies Procurement shared UOM/Surface creation while retaining normal Super Admin creation", async () => {
    const denied = fixture(procurement);
    const allowed = fixture(superAdmin);
    for (const kind of ["uoms", "surfaces"]) {
      const input = { name: "Shared fixture", ...(kind === "uoms" ? { decimalScale: 2 } : {}) };
      const path = `/api/v1/admin/ai-estimator-knowledge/${kind}`;
      await request(denied.app).post(path).set(header).send(input).expect(403);
      await request(allowed.app).post(path).set(header).send(input).expect(201);
      expect(allowed.shared.createMaster).toHaveBeenLastCalledWith(superAdmin, kind, input);
    }
    expect(denied.shared.createMaster).not.toHaveBeenCalled();
    for (const call of Object.values(denied.service)) expect(call).not.toHaveBeenCalled();
  });
});
