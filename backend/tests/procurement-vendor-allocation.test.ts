import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { assertVendorAllocationAllowed, procurementVendorBaselineSchema } from "../src/domain/procurement-vendor-allocation.js";
import { projectProcurementItemSchema, projectProcurementUpdateSchema } from "../src/domain/project-procurement.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createProcurementVendorBaselineRouter } from "../src/routes/procurement-vendor-baseline.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { ProcurementVendorBaselineService } from "../src/services/procurement-vendor-baseline.service.js";

const policy = { totalAllocatedWorkPaise: 3_000_000n, unknownItemCount: 0, physicallyVerified: false, previousItemPaise: 0, nextItemPaise: 2_000_000 };
const item = { estimateId: "estimate", estimateVersion: 1, sourceLineItemKey: "line", itemName: "Material", brand: "Brand", uomId: "uom", vendorId: "vendor", pricePaise: 1500 };
const baseline = { expectedVersion: 1, allocatedWorkPaise: 6_000_000, reason: "Record the existing commitment", idempotencyKey: "request-1" };

describe("vendor allocation policy and input boundaries", () => {
  it("accepts exactly 50,000 INR and rejects the next paise", () => {
    expect(() => assertVendorAllocationAllowed(policy)).not.toThrow();
    expect(() => assertVendorAllocationAllowed({ ...policy, nextItemPaise: 2_000_001 })).toThrow(expect.objectContaining({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" }));
  });
  it("subtracts the current commitment when checking a replacement", () => {
    expect(() => assertVendorAllocationAllowed({ ...policy, totalAllocatedWorkPaise: 5_000_000n, previousItemPaise: 2_000_000, nextItemPaise: 2_000_000 })).not.toThrow();
    expect(() => assertVendorAllocationAllowed({ ...policy, totalAllocatedWorkPaise: 4_000_000n, previousItemPaise: 1_000_000 })).not.toThrow();
  });
  it("permits corrections on over-cap or unknown baselines and verified increases", () => {
    const unknown = { ...policy, totalAllocatedWorkPaise: 8_000_000n, unknownItemCount: 1, previousItemPaise: 4_000_000 };
    expect(() => assertVendorAllocationAllowed(unknown)).not.toThrow();
    expect(() => assertVendorAllocationAllowed({ ...unknown, nextItemPaise: 4_000_001 })).toThrow(expect.objectContaining({ code: "PROCUREMENT_VENDOR_ALLOCATION_BASELINE_INCOMPLETE" }));
    expect(() => assertVendorAllocationAllowed({ ...unknown, nextItemPaise: 8_000_000, physicallyVerified: true })).not.toThrow();
  });
  it("checks totals exactly beyond the JavaScript safe-integer range", () => {
    expect(() => assertVendorAllocationAllowed({ ...policy, totalAllocatedWorkPaise: 9_007_199_254_740_993n, nextItemPaise: 1 })).toThrow(expect.objectContaining({ code: "PROCUREMENT_VENDOR_ALLOCATION_CAP_EXCEEDED" }));
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1000", null, undefined])("rejects invalid new vendor allocation %s", (allocatedWorkPaise) => {
    expect(projectProcurementItemSchema.safeParse({ ...item, allocatedWorkPaise }).success).toBe(false);
  });
  it("preserves omission for updates but rejects client provenance and clearing vendor amounts", () => {
    const input = { ...item, expectedVersion: 1 };
    expect(projectProcurementUpdateSchema.parse(input)).not.toHaveProperty("allocatedWorkPaise");
    for (const extra of [{ allocatedWorkPaise: null }, { allocationTrackingVersion: null }, { allocationBaselineReceipt: baseline }, { vendorId: null, allocatedWorkPaise: 1 }]) {
      expect(projectProcurementUpdateSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(projectProcurementUpdateSchema.safeParse({ ...input, vendorId: null, allocatedWorkPaise: null }).success).toBe(true);
  });
  it("requires bounded reason, version and stable baseline retry identity", () => {
    expect(procurementVendorBaselineSchema.parse(baseline)).toEqual(baseline);
    for (const extra of [{ reason: " " }, { reason: "a".repeat(2001) }, { idempotencyKey: "" }, { idempotencyKey: "a".repeat(201) }, { expectedVersion: Number.MAX_SAFE_INTEGER }, { historical: true }]) {
      expect(procurementVendorBaselineSchema.safeParse({ ...baseline, ...extra }).success).toBe(false);
    }
  });
});

function setup() {
  const actor: PublicUser = { id: "super", role: "super_admin", name: "Synthetic Admin", email: "super@example.test" };
  const result = { itemId: "item", projectId: "project", vendorId: "vendor", allocatedWorkPaise: baseline.allocatedWorkPaise, version: 2, recordedAt: "2026-09-24T00:00:00.000Z" };
  const service = {
    list: vi.fn(async () => ({ items: [], total: 0, limit: 20, offset: 0 })),
    complete: vi.fn(async () => result)
  } satisfies ProcurementVendorBaselineService;
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProcurementVendorBaselineRouter(auth, service));
  app.use(errorHandler);
  return { app, service, actor, result };
}
const path = "/api/v1/admin/ai-estimator-knowledge/vendors/vendor/allocation-baseline";
describe("restricted allocation baseline routes", () => {
  it("passes only bounded paging and explicit historical correction input", async () => {
    const { app, service, actor, result } = setup();
    await request(app).get(`${path}?limit=10&offset=20`).set("Authorization", "Bearer super_admin").expect(200);
    expect(service.list).toHaveBeenCalledWith(actor, "vendor", { limit: 10, offset: 20 });
    await request(app).post(`${path}/item`).set("Authorization", "Bearer super_admin").send(baseline).expect(200, { data: result });
    expect(service.complete).toHaveBeenCalledWith(actor, "vendor", "item", baseline);
    await request(app).get(`${path}?limit=101`).set("Authorization", "Bearer super_admin").expect(400);
    await request(app).post(`${path}/item`).set("Authorization", "Bearer super_admin").send({ ...baseline, reason: "" }).expect(400);
  });
  it.each(ROLE_CODES.filter((role) => role !== "super_admin"))("denies %s both historical operations", async (role) => {
    const { app, service } = setup();
    await request(app).get(path).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).post(`${path}/item`).set("Authorization", `Bearer ${role}`).send(baseline).expect(403);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.complete).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    const { app } = setup();
    await request(app).get(path).expect(401);
    await request(app).post(`${path}/item`).send(baseline).expect(401);
  });
});
