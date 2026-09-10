import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "../src/middleware/errors.js";
import { createEstimateDesignsRouter } from "../src/routes/estimate-designs.js";

describe("delete uploaded design route", () => {
  function setup(role: string) {
    const actor = { id: "actor", name: "Test actor", email: "actor@example.test", role };
    const deleteUpload = vi.fn(async (_actor, id: string) => ({ id, deleted: true }));
    const app = express();
    app.use(createEstimateDesignsRouter({ authenticate: vi.fn(async () => actor) } as never, { deleteUpload } as never, 1_000));
    app.use(errorHandler);
    return { app, deleteUpload, actor };
  }

  it("passes the authenticated Designer identity and opaque upload ID to the service", async () => {
    const { app, deleteUpload, actor } = setup("designer");
    const response = await request(app).delete("/estimate-design-uploads/upload-1").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { id: "upload-1", deleted: true } });
    expect(deleteUpload).toHaveBeenCalledWith(actor, "upload-1");
  });

  it.each(["admin", "super_admin", "estimator_sales", "client", "design_manager"])("denies %s before invoking deletion", async (role) => {
    const { app, deleteUpload } = setup(role);
    expect((await request(app).delete("/estimate-design-uploads/upload-1").set("Authorization", "Bearer test")).status).toBe(403);
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const { app, deleteUpload } = setup("designer");
    expect((await request(app).delete("/estimate-design-uploads/upload-1")).status).toBe(401);
    expect(deleteUpload).not.toHaveBeenCalled();
  });
});
