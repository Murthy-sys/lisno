import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { MAX_FINANCE_AMOUNT_PAISE } from "../src/domain/project-finance.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createProjectProcurementRouter } from "../src/routes/project-procurement.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { ProjectProcurementService } from "../src/services/project-procurement.service.js";

const actor: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const fields = { estimateId: "estimate-a", estimateVersion: 1, sourceLineItemKey: "line-a", itemName: "Plywood", brand: "Timber", uomId: "sheet", vendorId: null, pricePaise: 12345 };
const item = { id: "item-1", projectId: "project-a", estimateSource: null, vendor: null, itemName: "Plywood", brand: "Timber", pricePaise: 12345,
  uom: { id: "sheet", name: "Sheet", code: "SHT", status: "active" as const },
  version: 1, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
const vendor = { id: "vendor-1", code: "V1", name: "Saved Vendor", status: "active" as const };
function setup() {
  const service = {
    list: vi.fn(async () => ({ items: [item], total: 1, limit: 20, offset: 0 })),
    get: vi.fn(async () => item), listUoms: vi.fn(async () => [{ id: "sheet", name: "Sheet", code: "SHT" }]),
    create: vi.fn(async () => item), update: vi.fn(async () => ({ ...item, version: 2 })),
    listVendors: vi.fn(async () => ({ items: [vendor], total: 1, limit: 20, offset: 0 })),
    createVendor: vi.fn(async () => ({ vendor, created: true }))
  } satisfies ProjectProcurementService;
  const auth = { authenticate: vi.fn(async (role: string) => ({ ...actor, role })) } as unknown as AuthService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectProcurementRouter(auth, service));
  app.use(errorHandler);
  return { app, service };
}
const base = "/api/v1/procurement/projects/project-a";
const referenceBase = "/api/v1/procurement";
describe("project procurement item and vendor routes", () => {
  it("passes bounded search, active UOM options and stable detail IDs to the service", async () => {
    const { app, service } = setup();
    await request(app).get(`${base}/items?q=%20PLYWOOD%20&limit=5&offset=10`).set("Authorization", "Bearer procurement").expect(200);
    expect(service.list).toHaveBeenCalledWith(actor, "project-a", { q: "PLYWOOD", limit: 5, offset: 10 });
    await request(app).get(`${base}/items/item-1`).set("Authorization", "Bearer procurement").expect(200, { data: item });
    expect(service.get).toHaveBeenCalledWith(actor, "project-a", "item-1");
    await request(app).get(`${referenceBase}/uoms`).set("Authorization", "Bearer procurement").expect(200, { data: [{ id: "sheet", name: "Sheet", code: "SHT" }] });
  });
  it("normalizes labels, preserves integer paise and requires a version to edit", async () => {
    const { app, service } = setup();
    await request(app).post(`${base}/items`).set("Authorization", "Bearer procurement")
      .send({ ...fields, itemName: "  Ｐlywood \n Sheet  ", brand: "  Timber \t Brand " }).expect(201, { data: item });
    expect(service.create).toHaveBeenCalledWith(actor, "project-a", { ...fields, itemName: "Plywood Sheet", brand: "Timber Brand" });
    await request(app).patch(`${base}/items/item-1`).set("Authorization", "Bearer procurement")
      .send({ ...fields, expectedVersion: 1 }).expect(200);
    expect(service.update).toHaveBeenCalledWith(actor, "project-a", "item-1", { ...fields, expectedVersion: 1 });
    await request(app).patch(`${base}/items/item-1`).set("Authorization", "Bearer procurement").send(fields).expect(400);
  });
  it("accepts exact parent paging and explicit unassigned reads without widening vendor queries", async () => {
    const { app, service } = setup();
    await request(app).get(`${base}/items?estimateId=estimate-a&estimateVersion=1&sourceLineItemKey=line-a&limit=5&offset=25`).set("Authorization", "Bearer procurement").expect(200);
    expect(service.list).toHaveBeenLastCalledWith(actor, "project-a", { q: "", limit: 5, offset: 25, estimateId: "estimate-a", estimateVersion: 1, sourceLineItemKey: "line-a" });
    await request(app).get(`${base}/items?unassigned=true`).set("Authorization", "Bearer procurement").expect(200);
    expect(service.list).toHaveBeenLastCalledWith(actor, "project-a", { q: "", limit: 20, offset: 0, unassigned: true });
    await request(app).get(`${referenceBase}/vendors?unassigned=true`).set("Authorization", "Bearer procurement").expect(400);
  });
  it.each(["estimateId=estimate-a", "estimateVersion=1", "sourceLineItemKey=line-a", "estimateId=a&estimateVersion=1&sourceLineItemKey=x&unassigned=true", "unassigned=false", "estimateId=a&estimateVersion=1.5&sourceLineItemKey=x", "estimateId=a&estimateVersion=1&sourceLineItemKey=", "estimateId=a&estimateId=b&estimateVersion=1&sourceLineItemKey=x"])("rejects malformed parent query %s", async (query) => {
    const { app, service } = setup();
    await request(app).get(`${base}/items?${query}`).set("Authorization", "Bearer procurement").expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });
  it("requires create linkage and allows either absent or complete update linkage", async () => {
    const { app, service } = setup();
    const { estimateId, estimateVersion, sourceLineItemKey, ...legacy } = fields;
    await request(app).post(`${base}/items`).set("Authorization", "Bearer procurement").send(legacy).expect(400);
    await request(app).patch(`${base}/items/item-1`).set("Authorization", "Bearer procurement").send({ ...legacy, expectedVersion: 1 }).expect(200);
    for (const extra of [{ estimateId }, { estimateVersion }, { sourceLineItemKey }, { estimateId, estimateVersion }, { estimateId: null, estimateVersion, sourceLineItemKey }]) {
      await request(app).patch(`${base}/items/item-1`).set("Authorization", "Bearer procurement").send({ ...legacy, expectedVersion: 1, ...extra }).expect(400);
    }
    expect(service.update).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, 1.2, MAX_FINANCE_AMOUNT_PAISE + 1, "12345", null])("rejects invalid pricePaise %s", async (pricePaise) => {
    const { app, service } = setup();
    await request(app).post(`${base}/items`).set("Authorization", "Bearer procurement").send({ ...fields, pricePaise }).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it.each([{ itemName: " " }, { brand: "x".repeat(201) }, { uomId: "" }, { version: 9 }, { projectId: "private-project" }])("rejects invalid or server-owned fields %o", async (extra) => {
    const { app, service } = setup();
    await request(app).post(`${base}/items`).set("Authorization", "Bearer procurement").send({ ...fields, ...extra }).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it.each(["limit=101", "limit=0", "offset=-1", "offset=0.5", "q=" + "x".repeat(101), "search=plywood", "q=a&q=b"])("rejects malformed list query %s", async (query) => {
    const { app, service } = setup();
    await request(app).get(`${base}/items?${query}`).set("Authorization", "Bearer procurement").expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });
  it.each(ROLE_CODES.filter((role) => role !== "procurement"))("denies %s every item/vendor endpoint, including Super Admin personal operations", async (role) => {
    const { app, service } = setup();
    for (const path of ["items", "items/item-1"]) await request(app).get(`${base}/${path}`).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).post(`${base}/items`).set("Authorization", `Bearer ${role}`).send(fields).expect(403);
    await request(app).patch(`${base}/items/item-1`).set("Authorization", `Bearer ${role}`).send({ ...fields, expectedVersion: 1 }).expect(403);
    await request(app).get(`${referenceBase}/uoms`).set("Authorization", `Bearer ${role}`).expect(403);
    if (!["admin", "super_admin"].includes(role)) await request(app).get(`${referenceBase}/vendors`).set("Authorization", `Bearer ${role}`).expect(403);
    await request(app).post(`${referenceBase}/vendors`).set("Authorization", `Bearer ${role}`).send({ name: "Vendor" }).expect(403);
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
  });
  it("requires authentication and preserves useful conflict codes", async () => {
    const { app, service } = setup();
    await request(app).get(`${base}/items`).expect(401);
    service.create.mockRejectedValueOnce(new ApiError(409, "PROCUREMENT_ITEM_DUPLICATE", "Duplicate item."));
    const response = await request(app).post(`${base}/items`).set("Authorization", "Bearer procurement").send(fields).expect(409);
    expect(response.body.error.code).toBe("PROCUREMENT_ITEM_DUPLICATE");
  });
  it("defaults an omitted optional vendor to null and keeps project identity in the path", async () => {
    const { app, service } = setup();
    const { vendorId: _vendorId, ...withoutVendor } = fields;
    await request(app).post("/api/v1/procurement/projects/project-b/items").set("Authorization", "Bearer procurement").send(withoutVendor).expect(201);
    expect(service.create).toHaveBeenCalledWith(actor, "project-b", fields);
    await request(app).get("/api/v1/procurement/catalogue/items").set("Authorization", "Bearer procurement").expect(404);
  });
  it("pages active Configuration vendors and returns 201 new or 200 reused", async () => {
    const { app, service } = setup();
    await request(app).get(`${referenceBase}/vendors?q=Saved&limit=5&offset=10`).set("Authorization", "Bearer procurement").expect(200);
    expect(service.listVendors).toHaveBeenCalledWith(actor, { q: "Saved", limit: 5, offset: 10 });
    await request(app).post(`${referenceBase}/vendors`).set("Authorization", "Bearer procurement").send({ name: " Saved\n Vendor " }).expect(201, { data: vendor });
    expect(service.createVendor).toHaveBeenCalledWith(actor, { name: "Saved Vendor" });
    service.createVendor.mockResolvedValueOnce({ vendor, created: false });
    await request(app).post(`${referenceBase}/vendors`).set("Authorization", "Bearer procurement").send({ name: "Saved Vendor" }).expect(200, { data: vendor });
  });
  it.each([{ name: " " }, { name: "x".repeat(201) }, { name: "İ".repeat(121) }, { name: "Vendor", code: "FORGED" }, { name: "Vendor", status: "active" }])("rejects invalid or server-owned vendor fields %o", async (value) => {
    const { app, service } = setup();
    await request(app).post(`${referenceBase}/vendors`).set("Authorization", "Bearer procurement").send(value).expect(400);
    expect(service.createVendor).not.toHaveBeenCalled();
  });
});
