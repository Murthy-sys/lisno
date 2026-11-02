import { createHash } from "node:crypto";
import { createEstimateProposal } from "../src/domain/estimate-proposal.js";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createLeadService } from "../src/services/lead.service.js";
import { createEstimateRevisionsService } from "../src/services/estimate-revisions.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import type { FileStorage } from "../src/storage/storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const secret = "isolated-revision-test-secret-at-least-32-characters";
const now = new Date("2026-11-02T09:00:00Z");
const actors = {
  salesA: { id: "revision-sales-a", role: "estimator_sales", name: "Sales A", email: "sales-a@example.test" },
  salesB: { id: "revision-sales-b", role: "estimator_sales", name: "Sales B", email: "sales-b@example.test" },
  designer: { id: "revision-designer", role: "designer", name: "Designer", email: "designer@example.test" },
  designerB: { id: "revision-designer-b", role: "designer", name: "Other Designer", email: "designer-b@example.test" },
  super: { id: "revision-super", role: "super_admin", name: "Super", email: "super@example.test" },
  admin: { id: "revision-admin", role: "admin", name: "Admin", email: "admin@example.test" },
  client: { id: "revision-client", role: "client", name: "Client", email: "client@example.test" }
} as const satisfies Record<string, PublicUser>;
type Actor = keyof typeof actors;
const storage = { read: vi.fn(async (reference: string) => bytes(reference)), save: vi.fn(), saveGenerated: vi.fn(), delete: vi.fn() } as unknown as FileStorage;
const bytes = (reference: string) => Buffer.from(`%PDF-1.7\n${reference}\n%%EOF`);
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let app: ReturnType<typeof createApp>;
const token = (actor: Actor) => `Bearer ${jwt.sign({ id: actors[actor].id, role: actors[actor].role, sessionVersion: 1 }, secret, { expiresIn: 900 })}`;
const get = (path = "", actor: Actor = "salesA", estimate = "estimate-a") => request(app).get(`/api/v1/estimates/${estimate}/revisions${path}`).set("Authorization", token(actor));

function snapshot(subtotal = 100) {
  return { clientName: "Synthetic client", projectName: "Frozen project", location: "Pune", propertyType: "Apartment",
    rooms: [{ id: "room-a", label: "Saved kitchen", typeId: "kitchen", length: 4, width: 3, sqft: 12, privateToken: "must-not-leak" }],
    lineItems: [{ id: "line-a", source: "legacy", catalogueId: "legacy", roomId: "room-a", roomName: "Saved kitchen", specification: "Frozen cabinet", unit: "each", quantity: 1, rate: subtotal, amount: subtotal, included: true, privateToken: "must-not-leak" }],
    subtotal, gst: subtotal * .18, total: subtotal * 1.18, subtotalPaise: Math.round(subtotal * 100), gstPaise: Math.round(subtotal * 18), totalPaise: Math.round(subtotal * 118), privateToken: "must-not-leak" };
}
async function round(id: string, generation: number, overrides: Record<string, unknown> = {}) {
  const reference = `stored-${id}`;
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: id as never, estimateId: "estimate-a", leadId: "lead-a", projectId: "project-a", estimateVersion: generation,
    sendGeneration: generation, phase: generation === 1 ? "pre" : "post", workflowVersion: 2, createdAt: new Date(now.getTime() + generation * 1000), updatedAt: now,
    status: generation === 1 ? "approved" : "changes_requested", decision: generation === 1 ? "approve" : "request_changes", decidedAt: now, version: 1,
    deliveryStatus: "sent", estimateSnapshot: snapshot(generation === 1 ? 100 : 275), dedupeKey: id,
    pdfStorageReference: reference, pdfFilename: `${id}.pdf`, pdfMimeType: "application/pdf", pdfByteSize: bytes(reference).length, pdfSha256: createHash("sha256").update(bytes(reference)).digest("hex"),
    recipientEmail: "private@example.test", recipientEmailNormalized: "private@example.test", token: "must-not-leak", assignedAdminId: actors.admin.id, ...overrides });
}
beforeAll(async () => {
  replica = await startMongoReplicaSet("estimate-revisions");
  await EstimateClientReviewRoundModel.syncIndexes();
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear(); vi.clearAllMocks();
  vi.mocked(storage.read).mockImplementation(async reference => bytes(reference));
  await UserModel.collection.insertMany(Object.values(actors).map(actor => ({ ...actor, _id: actor.id as never, active: true, deletedAt: null, accountKind: "standard", sessionVersion: 1, version: 1, createdAt: now, updatedAt: now })));
  for (const [suffix, owner, amount] of [["a", "salesA", 999], ["b", "salesB", 1200]] as const) {
    await ProjectModel.create({ _id: `project-${suffix}`, name: `Current project ${suffix}`, clientName: "Synthetic client", clientEmail: `${suffix}@example.test`, clientEmailNormalized: `${suffix}@example.test`, clientMobile: "0000000000", status: "planning", plannedStartAt: now, plannedEndAt: now,
      assignedEstimatorId: actors[owner].id, assignedDesignerIds: [actors.designer.id], estimationWorkflowVersion: 2 });
    await LeadModel.create({ _id: `lead-${suffix}`, projectId: `project-${suffix}`, ownerId: actors[owner].id, clientName: "Synthetic client", clientEmail: `${suffix}@example.test`, clientEmailNormalized: `${suffix}@example.test`, clientMobile: "0000000000", projectName: `Current project ${suffix}`, location: "Pune", propertyType: "Apartment", source: "test", stage: "new_lead", nextAction: "Estimation", nextActionAt: now });
    await EstimateModel.collection.insertOne({ _id: `estimate-${suffix}` as never, projectId: `project-${suffix}`, leadId: `lead-${suffix}`, ownerId: actors[owner].id, designPlanDesignerId: actors.designer.id, version: 19, status: "draft", propertyType: "Apartment", rooms: [], lineItems: [], subtotal: amount, gst: amount * .18, total: amount * 1.18,
      estimation: { workflowVersion: 2, phase: "post", status: "draft", preApproval: { reviewRoundId: `round-${suffix}-1`, estimateVersion: 1, approvedAt: now.toISOString() }, designScopeRevision: 1 } });
  }
  await round("round-a-1", 1);
  await round("round-a-2", 2, { deliveryStatus: "failed" });
  await round("round-b-1", 1, { estimateId: "estimate-b", leadId: "lead-b", projectId: "project-b", estimateSnapshot: snapshot(615) });
  app = createApp({ repository: createMongoRepository(), auth: { jwtSecret: secret, jwtExpiresInSeconds: 900 }, storage, estimateMailer: { deliveryKind: "disabled" }, invitationMailer: { deliveryKind: "disabled" } });
});

describe("staff immutable estimate revision reads", () => {
  it("preserves frozen proposal terms and original PDF bytes without accepting corrupt metadata", async () => {
    const proposal = createEstimateProposal({ issuedAt: now, estimateId: "estimate-a", projectNumber: "Lisno000076" });
    await round("round-proposal", 3, { estimateSnapshot: { ...snapshot(100.25), proposal } });
    expect((await get("/round-proposal").expect(200)).body.data.snapshot.proposal).toEqual(proposal);
    const pdf = await get("/round-proposal/pdf").expect(200);
    expect(Buffer.from(pdf.body)).toEqual(bytes("stored-round-proposal"));
    await round("round-invalid-proposal", 4, { estimateSnapshot: { ...snapshot(), proposal: { ...proposal, defaultsVersion: 999 } } });
    expect((await get("/round-invalid-proposal").expect(409)).body.error.code).toBe("ESTIMATE_REVISION_UNAVAILABLE");
  });
  it("lists only actual publications, newest first, with frozen unequal pre-GST amounts and no private fields", async () => {
    const response = await get().expect(200);
    expect(response.body.data.items).toMatchObject([{ id: "round-a-2", subtotalPaise: 27500, deliveryStatus: "failed" }, { id: "round-a-1", subtotalPaise: 10000 }]);
    expect(response.body.data.pagination).toEqual({ limit: 20, nextCursor: null });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/recipient|private@example|must-not-leak|pdfStorage|snapshot|61500/u);
    expect((await get("", "salesB", "estimate-b").expect(200)).body.data.items[0].subtotalPaise).toBe(61500);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("uses stable generation pagination when a newer publication arrives, validates cursor scope and input", async () => {
    const first = (await get("?limit=1").expect(200)).body.data;
    await round("round-a-3", 3);
    const second = (await get(`?limit=1&cursor=${first.pagination.nextCursor}`).expect(200)).body.data;
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["round-a-1"]);
    expect(second.pagination.nextCursor).toBeNull();
    await get(`?cursor=${first.pagination.nextCursor}`, "salesB", "estimate-b").expect(400);
    for (const query of ["?limit=0", "?limit=51", "?limit=1&limit=2", "?cursor=invalid!", "?extra=1"]) await get(query).expect(400);
  });

  it("preserves frozen content, strips unknown nested fields, and converts legacy stored rupees explicitly", async () => {
    const legacy = snapshot(100.25) as Record<string, unknown>;
    legacy.gst = 18.05; legacy.total = 118.30;
    delete legacy.subtotalPaise; delete legacy.gstPaise; delete legacy.totalPaise; delete legacy.rooms;
    await round("round-legacy", 3, { phase: undefined, workflowVersion: undefined, estimateSnapshot: legacy });
    const data = (await get("/round-legacy").expect(200)).body.data;
    expect(data).toMatchObject({ id: "round-legacy", subtotalPaise: 10025, snapshot: { projectName: "Frozen project", subtotal: 100.25, subtotalPaise: 10025, gstPaise: 1805, totalPaise: 11830 } });
    expect(data).not.toHaveProperty("phase");
    expect(data.snapshot).not.toHaveProperty("rooms");
    expect(JSON.stringify(data)).not.toMatch(/must-not-leak|privateToken/u);
    const current = (await get("/round-a-2").expect(200)).body.data.snapshot;
    expect(current.rooms).toEqual([{ id: "room-a", label: "Saved kitchen", typeId: "kitchen", length: 4, width: 3, sqft: 12 }]);
    expect(current.lineItems[0]).toMatchObject({ specification: "Frozen cabinet", amount: 275 });
    expect(current.subtotal).not.toBe(999);
  });

  it("does not turn invalid historical money into zero or fall back to the live estimate", async () => {
    await round("round-broken", 3, { estimateSnapshot: { ...snapshot(), subtotalPaise: null } });
    expect((await get("/round-broken").expect(409)).body.error.code).toBe("ESTIMATE_REVISION_UNAVAILABLE");
    expect((await get().expect(409)).body.error.code).toBe("ESTIMATE_REVISION_UNAVAILABLE");
  });

  it("preserves configured frozen dimensions, provenance and internal lines without current catalogue resolution", async () => {
    const saved = { ...snapshot(3300), selectedMainBasketIds: ["basket-old"], selectedMainBasketClassifications: [{ mainBasketId: "basket-old", classification: "special" }],
      lineItems: [{ id: "configured-line", source: "configuration", catalogueId: "line-old", roomId: "room-a", roomName: "Saved kitchen", specification: null,
        unit: "sq-ft", quantity: 12, included: true, rate: 275, amount: 3300, ratePaise: 27500, amountPaise: 330000,
        mainBasketId: "basket-old", subBasketId: "sub-old", mainLineId: "line-old", revisionId: "configuration-rev-old", mainBasketName: "Saved basket", subBasketName: "Saved sub-basket", mainLineName: "Saved line",
        uomId: "uom-old", uomName: "sq-ft", uomCode: "SQFT", uomDecimalScale: 2, classification: "special", modeTier: "premium", pricingMode: "pmc", rateSource: "manual",
        sourceItemStatus: "draft", sourceRevisionStatus: "superseded", sourceItemVersion: 2, sourceRevisionVersion: 3, clientVisible: false,
        dimensionsMandatory: true, dimensions: { length: "3", width: "4", height: "", privateToken: "must-not-leak" },
        dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "uom-old", decimalScale: 2, privateToken: "must-not-leak" } }] };
    await round("round-configured", 3, { estimateSnapshot: saved });
    const data = (await get("/round-configured").expect(200)).body.data;
    expect(data.snapshot.lineItems).toHaveLength(1);
    expect(data.snapshot.lineItems[0]).toMatchObject({ amountPaise: 330000, mainLineName: "Saved line", revisionId: "configuration-rev-old", sourceRevisionVersion: 3, sourceRevisionStatus: "superseded", clientVisible: false,
      dimensions: { length: "3", width: "4", height: "" }, modeTier: "premium", classification: "special" });
    expect(data.subtotalPaise).toBe(330000);
    expect(JSON.stringify(data)).not.toContain("must-not-leak");
  });

  it("returns an empty history for a working draft without manufacturing a submission", async () => {
    await EstimateClientReviewRoundModel.collection.deleteMany({ estimateId: "estimate-a" });
    expect((await get().expect(200)).body.data).toEqual({ items: [], pagination: { limit: 20, nextCursor: null } });
    await get("/missing").expect(404);
    await get("/missing/pdf").expect(404);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("allows a valid pre-project legacy round and excludes conflicting non-null lineage", async () => {
    await round("round-pre-project", 3, { projectId: null });
    await round("round-wrong-project", 4, { projectId: "project-b" });
    await round("round-wrong-lead", 5, { leadId: "lead-b" });
    const data = (await get().expect(200)).body.data;
    expect(data.items.map((item: { id: string }) => item.id)).toEqual(["round-pre-project", "round-a-2", "round-a-1"]);
    await get("/round-pre-project").expect(200);
    for (const id of ["round-wrong-project", "round-wrong-lead", "round-b-1"]) {
      await get(`/${id}`).expect(404); await get(`/${id}/pdf`).expect(404);
    }
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("returns exact stored PDF bytes for the selected round with private safe download headers", async () => {
    const response = await get("/round-a-1/pdf").expect(200);
    expect(response.body).toEqual(bytes("stored-round-a-1"));
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("round-a-1.pdf");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(storage.read).toHaveBeenCalledExactlyOnceWith("stored-round-a-1");
  });

  it("reports missing or corrupt stored PDF safely without regeneration", async () => {
    vi.mocked(storage.read).mockRejectedValueOnce(new Error("private-storage-path"));
    const missing = await get("/round-a-1/pdf").expect(503);
    expect(missing.body.error.code).toBe("ESTIMATE_REVISION_PDF_UNAVAILABLE");
    expect(JSON.stringify(missing.body)).not.toContain("private-storage-path");
    vi.mocked(storage.read).mockResolvedValueOnce(Buffer.from("wrong round"));
    await get("/round-a-1/pdf").expect(503);
  });

  it.each(["salesB", "designerB"] as const)("denies unrelated %s on list, detail and PDF without reading storage", async actor => {
    for (const suffix of ["", "/round-a-1", "/round-a-1/pdf"]) await get(suffix, actor).expect(404);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it.each(["admin", "client"] as const)("does not grant %s a new staff history permission", async actor => {
    for (const suffix of ["", "/round-a-1", "/round-a-1/pdf"]) await get(suffix, actor).expect(403);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("requires the Designer's complete current lead/project and estimate scope", async () => {
    await get("", "designer").expect(200);
    await get("/round-a-1/pdf", "designer").expect(200);
    vi.mocked(storage.read).mockClear();
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: [] } });
    for (const suffix of ["", "/round-a-1", "/round-a-1/pdf"]) await get(suffix, "designer").expect(404);
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: [actors.designer.id] } });
    await EstimateModel.collection.updateOne({ _id: "estimate-a" as never }, { $set: { "estimation.phase": "pre" } });
    await get("", "designer").expect(404);
    await EstimateModel.collection.updateOne({ _id: "estimate-a" as never }, { $set: { "estimation.phase": "post", "estimation.preApproval": null } });
    await get("", "designer").expect(404);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("rechecks active identity and current ownership on every request", async () => {
    await get().expect(200);
    await UserModel.updateOne({ _id: actors.salesA.id }, { $set: { active: false } });
    await get().expect(401);
    await UserModel.updateOne({ _id: actors.salesA.id }, { $set: { active: true, deletedAt: now } });
    await get("/round-a-1/pdf").expect(401);
    await UserModel.updateOne({ _id: actors.salesA.id }, { $set: { deletedAt: null, sessionVersion: 2 } });
    await get().expect(401);
    await UserModel.updateOne({ _id: actors.salesA.id }, { $set: { sessionVersion: 1 } });
    await LeadModel.updateOne({ _id: "lead-a" }, { $set: { ownerId: actors.salesB.id } });
    await get().expect(404);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("rejects current lead/estimate project mismatch even for operation-scoped Super Admin", async () => {
    await get("", "super", "estimate-b").expect(200);
    await get("/round-b-1/pdf", "super", "estimate-b").expect(200);
    vi.mocked(storage.read).mockClear();
    await LeadModel.updateOne({ _id: "lead-a" }, { $set: { projectId: "project-b" } });
    for (const suffix of ["", "/round-a-1", "/round-a-1/pdf"]) await get(suffix, "super").expect(404);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("supports a legacy unlinked estimate and round without manufactured history or read-time writes", async () => {
    await EstimateModel.updateOne({ _id: "estimate-a" }, { $set: { projectId: null } });
    await LeadModel.updateOne({ _id: "lead-a" }, { $set: { projectId: null } });
    await round("round-unlinked", 3, { projectId: null });
    const before = await EstimateClientReviewRoundModel.collection.find({}).toArray();
    expect((await get().expect(200)).body.data.items.map((item: { id: string }) => item.id)).toEqual(["round-unlinked"]);
    await get("/round-unlinked").expect(200);
    await get("/round-unlinked/pdf").expect(200);
    await EstimateModel.updateOne({ _id: "estimate-a" }, { $inc: { version: 1 }, $set: { subtotal: 1900 } });
    expect((await get().expect(200)).body.data.items).toHaveLength(1);
    expect(await EstimateClientReviewRoundModel.collection.find({}).toArray()).toEqual(before);
    expect(storage.save).not.toHaveBeenCalled(); expect(storage.saveGenerated).not.toHaveBeenCalled(); expect(storage.delete).not.toHaveBeenCalled();
  });

  it("accepts the null metadata defaults copied from legitimate legacy Estimate rows", async () => {
    const legacy = { ...snapshot(), rooms: [{ label: "Saved room without stable ID", id: null, length: null }], lineItems: [{
      ...snapshot().lineItems[0], roomId: null, mainBasketId: null, subBasketId: null, mainLineId: null, revisionId: null, uomId: null,
      uomCode: null, uomDecimalScale: null, mainBasketName: null, subBasketName: null, mainLineName: null, uomName: null
    }] };
    await round("round-null-metadata", 3, { estimateSnapshot: legacy });
    const saved = (await get("/round-null-metadata").expect(200)).body.data.snapshot;
    expect(saved.lineItems[0]).toMatchObject({ specification: "Frozen cabinet", amount: 100, roomName: "Saved kitchen" });
    expect(saved.lineItems[0]).not.toHaveProperty("roomId");
    expect(saved.rooms).toEqual([{ label: "Saved room without stable ID" }]);
  });

  it("checks deleted actors when the service is used directly as well as through auth middleware", async () => {
    const repository = createMongoRepository();
    const service = createEstimateRevisionsService({ leads: createLeadService(repository, createAuditService(repository), () => now), storage });
    await UserModel.updateOne({ _id: actors.salesA.id }, { $set: { deletedAt: now } });
    await expect(service.list(actors.salesA, "estimate-a")).rejects.toMatchObject({ status: 404 });
    expect(storage.read).not.toHaveBeenCalled();
  });
});
