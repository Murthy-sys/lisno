import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createProjectChatRouter } from "../src/routes/project-chat.js";
import { createAuthService } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { chatActorFromAuthenticatedUser } from "../src/services/project-chat-authentication.js";
import { chatSend, createChatFixture } from "./helpers/project-chat.js";
const secret = "project-chat-route-test-secret-long-enough";
function fixture() {
    const f = createChatFixture();
    const app = express();
    const auth = createAuthService(f.repository, { jwtSecret: secret, jwtExpiresInSeconds: 3600 }, { clock: f.clock });
    app.use(express.json());
    app.use("/api/v1", createProjectChatRouter(auth, f.service));
    app.use(errorHandler);
    const token = (id: string, sessionVersion = 1) => {
        const actor = f.actor(id), issuedAt = Math.floor(Date.now() / 1000);
        // JWT verification uses wall time; chat authorization uses fixture time.
        const expiresAt = Math.max(issuedAt, Math.floor(f.clock().getTime() / 1000)) + 3600;
        return jwt.sign({ id, role: actor.role, sessionVersion, iat: issuedAt, exp: expiresAt }, secret);
    };
    return { ...f, app, token };
}
describe("project chat REST authorization and strict validation", () => {
    it("mounts tracked action, participant removal and canonical rename contracts with current-role enforcement", async () => {
        const f = fixture();
        const base = "/api/v1/projects/a/chat";
        const client = f.token("client-a"), superAdmin = f.token("super"), admin = f.token("admin-a");
        expect((await request(f.app).get(`${base}/action-types`).auth(client, { type: "bearer" })).body.data).toMatchObject({ canCreate: false, items: [{ id: "action" }, { id: "escalation" }] });
        expect((await request(f.app).post(`${base}/action-types`).auth(admin, { type: "bearer" }).send({ name: "Inspection", idempotencyKey: "new-custom-action" })).status).toBe(403);
        const created = await request(f.app).post(`${base}/action-types`).auth(superAdmin, { type: "bearer" }).send({ name: "Inspection", idempotencyKey: "new-custom-action" });
        expect(created.status).toBe(201);
        const message = await request(f.app).post(`${base}/messages`).auth(client, { type: "bearer" }).send({ body: "Please review", action: { typeId: created.body.data.id, dueDate: "2026-10-01" }, responsibleUserId: "designer-a", clientMessageId: "client-tracked-action" });
        expect(message.status).toBe(201);
        expect(message.body.data).toMatchObject({ priority: "important", action: { typeName: "Inspection", originalDueDate: "2026-10-01" } });
        expect((await request(f.app).patch(`${base}/messages/${message.body.data.id}/issue`).auth(client, { type: "bearer" }).send({ action: "reschedule", expectedVersion: 1, idempotencyKey: "reschedule-client", dueDate: "2026-10-05", note: "Review postponed" })).body.data.action.dueDate).toBe("2026-10-05");
        expect((await request(f.app).patch(`${base}/project-name`).auth(client, { type: "bearer" }).send({ name: "No", expectedVersion: 1, idempotencyKey: "client-project-name" })).status).toBe(403);
        const renamed = await request(f.app).patch(`${base}/project-name`).auth(admin, { type: "bearer" }).send({ name: "Renamed project", expectedVersion: 1, idempotencyKey: "admin-project-name" });
        expect(renamed.status).toBe(200);
        expect(renamed.body.data.project).toMatchObject({ name: "Renamed project", nameVersion: 2 });
        const input = { expectedVersion: 0, reason: "Handover", idempotencyKey: "remove-by-admin" };
        expect((await request(f.app).post(`${base}/participants/designer-a/remove`).auth(client, { type: "bearer" }).send(input)).status).toBe(403);
        const removed = await request(f.app).post(`${base}/participants/designer-a/remove`).auth(admin, { type: "bearer" }).send(input);
        expect(removed.status).toBe(200);
        expect(removed.body.data.removed).toContainEqual(expect.objectContaining({ id: "designer-a", removalVersion: 1 }));
        expect((await request(f.app).get(`${base}/messages`).auth(f.token("designer-a"), { type: "bearer" })).status).toBe(404);
        expect((await request(f.app).post(`${base}/participants/designer-a/restore`).auth(admin, { type: "bearer" }).send({ ...input, expectedVersion: 1, idempotencyKey: "restore-by-admin" })).status).toBe(200);
        expect((await request(f.app).patch(`${base}/project-name`).auth(admin, { type: "bearer" }).send({ name: " ", expectedVersion: 2, idempotencyKey: "empty-project-name" })).status).toBe(400);
    });
    it("authenticates before lookup, rejects outsider projects and publishes only safe chat header", async () => {
        const f = fixture();
        expect((await request(f.app).get("/api/v1/projects/a/chat")).status).toBe(401);
        expect((await request(f.app).get("/api/v1/projects/a/chat").auth(f.token("client-b"), { type: "bearer" })).status).toBe(404);
        const response = await request(f.app).get("/api/v1/projects/a/chat").auth(f.token("client-a"), { type: "bearer" });
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(Object.keys(response.body.data.project).sort()).toEqual(["id", "name", "nameVersion", "status"]);
    });
    it("rejects spoofed author fields, invalid limits and foreign quotes", async () => {
        const f = fixture();
        const auth = f.token("client-a");
        const spoof = await request(f.app).post("/api/v1/projects/a/chat/messages").auth(auth, { type: "bearer" }).send({ body: "Spoof", clientMessageId: "spoofed-author", authorId: "super" });
        expect(spoof.status).toBe(400);
        expect((await request(f.app).get("/api/v1/projects/a/chat/messages?limit=101").auth(auth, { type: "bearer" })).status).toBe(400);
        const send = await request(f.app).post("/api/v1/projects/a/chat/messages").auth(auth, { type: "bearer" }).send({ body: "Saved", clientMessageId: "valid-message" });
        expect(send.status).toBe(201);
        expect(send.body.data.author.id).toBe("client-a");
        const quote = await request(f.app).post("/api/v1/projects/b/chat/messages").auth(f.token("client-b"), { type: "bearer" }).send({ body: "Foreign", clientMessageId: "foreign-message", replyToId: send.body.data.id });
        expect(quote.status).toBe(404);
    });
    it("keeps directory selection limited to assigned Sales Manager or Super Admin", async () => {
        const f = fixture();
        const path = "/api/v1/projects/a/chat/participant-options?search=electric&limit=1";
        expect((await request(f.app).get(path).auth(f.token("client-a"), { type: "bearer" })).status).toBe(403);
        expect((await request(f.app).get(path).auth(f.token("admin-b"), { type: "bearer" })).status).toBe(404);
        const admin = await request(f.app).get(path).auth(f.token("admin-a"), { type: "bearer" });
        expect(admin.status).toBe(200);
        expect(admin.body.data.items).toHaveLength(1);
        expect(admin.body.data.hasMore).toBe(true);
        expect(JSON.stringify(admin.body)).not.toContain("chat.test");
    });
    it("validates the conversation list filter and search strictly", async () => {
        const f = fixture();
        const auth = f.token("super");
        await f.service.send(f.actor("client-b"), "b", chatSend("Unread for super"));
        const ok = await request(f.app).get("/api/v1/project-messages?limit=1&offset=0&filter=unread&search=%20PROJECT%20b%20").auth(auth, { type: "bearer" });
        expect(ok.status).toBe(200);
        expect(ok.body.data.items.map((row: { project: { id: string } }) => row.project.id)).toEqual(["b"]);
        expect(ok.body.data.pagination).toEqual({ limit: 1, offset: 0, total: 1, hasMore: false });
        expect(ok.body.data.totals).toEqual({ unread: 1, critical: 0, important: 0 });
        expect(Object.keys(ok.body.data.items[0].lastMessage).sort()).toEqual(["attachmentCount", "attachments", "author", "createdAt", "excerpt", "id"]);
        for (const filter of ["all", "unread", "critical", "important"])
            expect((await request(f.app).get(`/api/v1/project-messages?filter=${filter}`).auth(auth, { type: "bearer" })).status).toBe(200);
        for (const query of ["filter=mentions", "filter=resolved", "filter=", `search=${"x".repeat(101)}`, "sort=unread", "projectId=a", "limit=51"])
            expect((await request(f.app).get(`/api/v1/project-messages?${query}`).auth(auth, { type: "bearer" })).status).toBe(400);
    });
    it("preserves verified sessionVersion/expiry and rejects stale sessions", async () => {
        const f = fixture();
        const token = f.token("client-a");
        const user = f.seed.users.find((row) => row.id === "client-a")!;
        const actor = chatActorFromAuthenticatedUser(user, token);
        expect(actor).toMatchObject({ id: "client-a", sessionVersion: 1 });
        expect(actor.expiresAt).toBe((jwt.decode(token) as jwt.JwtPayload).exp);
        expect((await request(f.app).get("/api/v1/projects/a/chat").auth(f.token("client-a", 2), { type: "bearer" })).status).toBe(401);
        const expired = jwt.sign({ id: user.id, role: user.role, sessionVersion: 1, exp: Math.floor(Math.min(Date.now(), f.clock().getTime()) / 1000) - 1 }, secret);
        expect((await request(f.app).get("/api/v1/projects/a/chat").auth(expired, { type: "bearer" })).status).toBe(401);
        expect(() => chatActorFromAuthenticatedUser(user, f.token("client-b"))).toThrow();
    });
});
