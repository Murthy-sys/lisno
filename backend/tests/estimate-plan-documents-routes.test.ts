import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createEstimatePlanDocumentRouter } from "../src/routes/estimate-plan-documents.js";

const hash = "a".repeat(64);
const file = { filename: "revised-plan.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 protected test bytes") };
function setup(role = "designer") {
  const actor = { id: "actor", name: "Actor", email: "actor@example.test", role };
  const workspace = { manifestHash: hash, readyForSubmission: true, documents: [], reviewRoundId: null };
  const documents = {
    listStaff: vi.fn(async () => workspace), prepare: vi.fn(async () => workspace), readStaff: vi.fn(async () => file),
    listClient: vi.fn(async () => ({ ...workspace, reviewRoundId: "round" })), readClient: vi.fn(async () => file)
  };
  const app = express();
  app.use(express.json());
  app.use(createEstimatePlanDocumentRouter({ authenticate: vi.fn(async () => actor) } as never, documents as never));
  app.use(errorHandler);
  return { app, actor, documents };
}

describe("protected plan document routes", () => {
  it("requires authentication and forwards the exact staff identity, estimate, and manifest hash", async () => {
    const { app, actor, documents } = setup();
    expect((await request(app).get("/estimates/estimate-a/design-plan-documents")).status).toBe(401);
    expect(documents.listStaff).not.toHaveBeenCalled();
    expect((await request(app).get("/estimates/estimate-a/design-plan-documents").set("Authorization", "Bearer test")).status).toBe(200);
    expect(documents.listStaff).toHaveBeenCalledWith(actor, "estimate-a");
    expect((await request(app).post("/estimates/estimate-a/design-plan-documents/prepare").set("Authorization", "Bearer test").send({ expectedManifestHash: hash })).status).toBe(200);
    expect(documents.prepare).toHaveBeenCalledWith(actor, "estimate-a", hash);
  });

  it.each([{}, { expectedManifestHash: "stale" }, { expectedManifestHash: "A".repeat(64) }, { expectedManifestHash: hash, extra: true }])("rejects invalid preparation body %j before service side effects", async (body) => {
    const { app, documents } = setup();
    expect((await request(app).post("/estimates/estimate-a/design-plan-documents/prepare").set("Authorization", "Bearer test").send(body)).status).toBe(400);
    expect(documents.prepare).not.toHaveBeenCalled();
  });

  it.each(["client", "admin", "super_admin", "worker"])("denies %s preparation at its canonical route operation", async (role) => {
    const { app, documents } = setup(role);
    expect((await request(app).post("/estimates/estimate-a/design-plan-documents/prepare").set("Authorization", "Bearer test").send({ expectedManifestHash: hash })).status).toBe(403);
    expect(documents.prepare).not.toHaveBeenCalled();
  });

  it("returns private PDF bytes with download headers for authorized staff", async () => {
    const { app, actor, documents } = setup();
    const response = await request(app).get("/estimates/estimate-a/design-plan-documents/doc-a/pdf").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-disposition"]).toContain('filename="revised-plan.pdf"');
    expect(response.body).toEqual(file.bytes);
    expect(documents.readStaff).toHaveBeenCalledWith(actor, "estimate-a", "doc-a");
  });

  it.each(["", "?roundId=", "?roundId=round-a&roundId=round-b", `?roundId=${"x".repeat(201)}`])("rejects ambiguous or missing published round query %s", async (query) => {
    const { app, documents } = setup("client");
    const response = await request(app).get(`/client/estimates/estimate-a/design-plan-documents/doc-a/pdf${query}`).set("Authorization", "Bearer test");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("DESIGN_PLAN_ROUND_REQUIRED");
    expect(documents.readClient).not.toHaveBeenCalled();
  });

  it("pins Client download and optional listing reads to the supplied round identity", async () => {
    const { app, actor, documents } = setup("client");
    const response = await request(app).get("/client/estimates/estimate-a/design-plan-documents/doc-a/pdf?roundId=round-a").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(file.bytes);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(documents.readClient).toHaveBeenCalledWith(actor, "estimate-a", "doc-a", "round-a");
    expect((await request(app).get("/client/estimates/estimate-a/design-plan-documents?roundId=round-a").set("Authorization", "Bearer test")).status).toBe(200);
    expect(documents.listClient).toHaveBeenCalledWith(actor, "estimate-a", "round-a");
    expect((await request(app).get("/client/estimates/estimate-a/design-plan-documents").set("Authorization", "Bearer test")).status).toBe(200);
    expect(documents.listClient).toHaveBeenLastCalledWith(actor, "estimate-a", undefined);
  });

  it("propagates scoped denials without returning PDF bytes or private metadata", async () => {
    const { app, documents } = setup("client");
    documents.readClient.mockRejectedValueOnce(new ApiError(404, "DESIGN_PLAN_DOCUMENT_NOT_FOUND", "The design plan document was not found."));
    const response = await request(app).get("/client/estimates/other-estimate/design-plan-documents/other-document/pdf?roundId=other-round").set("Authorization", "Bearer test");
    expect(response.status).toBe(404);
    expect(response.headers["content-disposition"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/storageReference|revised-plan.pdf|%PDF/);
  });
});
