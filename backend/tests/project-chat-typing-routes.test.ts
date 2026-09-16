import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createProjectChatRouter } from "../src/routes/project-chat.js";
import { createAuthService } from "../src/services/auth.service.js";
import { createProjectChatTypingService } from "../src/services/project-chat-typing.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createChatFixture } from "./helpers/project-chat.js";

function fixture() {
  const f = createChatFixture(); const secret = "project-chat-typing-route-fixture-secret";
  const auth = createAuthService(f.repository, { jwtSecret: secret, jwtExpiresInSeconds: 3600 }, { clock: f.clock });
  const app = express(); app.use(express.json());
  app.use("/api/v1", createProjectChatRouter(auth, f.service, createProjectChatTypingService(f)));
  app.use(errorHandler);
  const token = (id: string, sessionVersion = 1) => jwt.sign({ id, role: f.actor(id).role, sessionVersion, iat: Math.floor(Date.now() / 1000), exp: Math.max(f.actor(id).expiresAt, Math.floor(Date.now() / 1000) + 3600) }, secret);
  return { ...f, app, token };
}
const endpoint = "/api/v1/projects/a/chat/typing";
const input = { composerId: "route-composer-one", sequence: 1, typing: true };

describe("typing REST authorization and validation", () => {
  it("authenticates before lookup and rejects outsiders and invalid sessions", async () => {
    const f = fixture();
    expect((await request(f.app).put(endpoint).send(input)).status).toBe(401);
    expect((await request(f.app).put(endpoint).auth(f.token("client-b"), { type: "bearer" }).send(input)).status).toBe(404);
    expect((await request(f.app).put(endpoint).auth(f.token("client-a", 2), { type: "bearer" }).send(input)).status).toBe(401);
  });
  it("rejects identity, text, malformed IDs and unsafe sequence claims", async () => {
    const f = fixture();
    for (const body of [{ ...input, userId: "super" }, { ...input, name: "Fake" }, { ...input, body: "Draft secret" }, { ...input, composerId: "short" }, { ...input, sequence: -1 }, { ...input, sequence: 1.5 }, { ...input, sequence: Number.MAX_SAFE_INTEGER + 1 }, { ...input, typing: "yes" }]) {
      expect((await request(f.app).put(endpoint).auth(f.token("client-a"), { type: "bearer" }).send(body)).status).toBe(400);
    }
  });
  it("returns only effective transient status, throttles refresh and lets stop bypass it", async () => {
    const f = fixture(); const token = f.token("client-a");
    const send = (body: unknown) => request(f.app).put(endpoint).auth(token, { type: "bearer" }).send(body);
    const started = await send(input);
    expect(started.status).toBe(200); expect(started.headers["cache-control"]).toBe("no-store");
    expect(started.body).toEqual({ data: { sequence: 1, typing: true, expiresAt: "2026-09-16T10:00:08.000Z" } });
    expect((await send({ ...input, sequence: 2 })).status).toBe(429);
    expect((await send({ ...input, sequence: 3, typing: false })).body.data).toEqual({ sequence: 3, typing: false, expiresAt: null });
    expect((await send({ ...input, sequence: 2 })).body.data).toEqual({ sequence: 3, typing: false, expiresAt: null });
  });
});
