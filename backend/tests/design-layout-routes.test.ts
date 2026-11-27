import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createEstimateDesignsRouter } from "../src/routes/estimate-designs.js";

const body = { layoutType: "layout_3d", expectedDesignPlanVersion: 0, idempotencyKey: "layout-route-command" };
function setup(role = "designer") {
  const actor = { id: "actor", role, name: "Actor", email: "actor@example.test" };
  const classifyLayoutType = vi.fn(async (_actor, id, command) => ({ id, layoutType: command.layoutType, canClassifyLayoutType: false }));
  const upload = vi.fn(async (_actor, estimateId, _file, layoutType) => ({ id: "new-upload", estimateId, layoutType }));
  const app = express(); app.use(express.json());
  app.use(createEstimateDesignsRouter({ authenticate: vi.fn(async () => actor) } as never, { classifyLayoutType, upload } as never, 10_000));
  app.use(errorHandler); return { app, actor, classifyLayoutType, upload };
}

describe("layout HTTP contracts", () => {
  it("passes explicit type, expected version and command identity with the authenticated actor", async () => {
    const { app, actor, classifyLayoutType } = setup();
    const response = await request(app).patch("/estimate-design-uploads/original/layout-type").set("Authorization", "Bearer test").send(body);
    expect(response.status).toBe(200); expect(classifyLayoutType).toHaveBeenCalledWith(actor, "original", body);
  });
  it.each([{ ...body, layoutType: "both" }, { ...body, expectedDesignPlanVersion: -1 }, { ...body, idempotencyKey: "short" }, { ...body, actorId: "spoof" }, { layoutType: "layout_3d" }])("rejects invalid or extra classification data %#", async payload => {
    const { app, classifyLayoutType } = setup();
    expect((await request(app).patch("/estimate-design-uploads/original/layout-type").set("Authorization", "Bearer test").send(payload)).status).toBe(400);
    expect(classifyLayoutType).not.toHaveBeenCalled();
  });
  it.each(["client", "admin", "super_admin", "design_manager"])("denies %s before invoking personal classification", async role => {
    const { app, classifyLayoutType } = setup(role);
    expect((await request(app).patch("/estimate-design-uploads/original/layout-type").set("Authorization", "Bearer test").send(body)).status).toBe(403);
    expect(classifyLayoutType).not.toHaveBeenCalled();
  });
  it("requires authentication and preserves service conflicts", async () => {
    const { app, classifyLayoutType } = setup();
    expect((await request(app).patch("/estimate-design-uploads/original/layout-type").send(body)).status).toBe(401);
    classifyLayoutType.mockRejectedValue(new ApiError(409, "DESIGN_LAYOUT_CONFLICT", "Already labeled."));
    expect((await request(app).patch("/estimate-design-uploads/original/layout-type").set("Authorization", "Bearer test").send(body)).body.error.code).toBe("DESIGN_LAYOUT_CONFLICT");
  });
  it("accepts one typed multipart field and rejects invalid type before the upload service", async () => {
    const { app, upload } = setup();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await request(app).post("/estimates/estimate/design-uploads").set("Authorization", "Bearer test").field("layoutType", "layout_3d").attach("file", png, "layout.png");
    expect(response.status).toBe(201); expect(upload.mock.calls[0]![3]).toBe("layout_3d");
    upload.mockClear();
    expect((await request(app).post("/estimates/estimate/design-uploads").set("Authorization", "Bearer test").field("layoutType", "both").attach("file", png, "layout.png")).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
});
