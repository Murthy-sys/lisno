import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createProjectStatusRouter } from "../src/routes/project-status.js";
import { createAuthService } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { statusFixture } from "./helpers/project-status.js";

describe("project status authenticated REST read", () => {
  it("requires a verified current participant and never caches the safe response", async () => {
    const f = statusFixture();
    const secret = "project-status-route-secret-long-enough";
    const auth = createAuthService(f.repository, { jwtSecret: secret, jwtExpiresInSeconds: 3600 }, { clock: f.clock });
    const app = express();
    app.use("/api/v1", createProjectStatusRouter(f.service, auth));
    app.use(errorHandler);
    const token = (id: string, sessionVersion = 1) => jwt.sign({ id, role: f.actor(id).role, sessionVersion, exp: Math.max(Math.floor(Date.now() / 1000), Math.floor(f.clock().getTime() / 1000)) + 3600 }, secret);
    const path = "/api/v1/projects/a/status";
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).auth(token("client-a", 2), { type: "bearer" })).status).toBe(401);
    const denied = await request(app).get(path).auth(token("client-b"), { type: "bearer" });
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toMatch(/Project a|Client A|Sales/);
    const response = await request(app).get(path).auth(token("client-a"), { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toMatchObject({ projectId: "a", currentStage: { key: "estimate_approval" } });
  });
});
