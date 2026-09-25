import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createNotificationsRouter } from "../src/routes/notifications.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createNotificationStreamService } from "../src/services/notification-stream.service.js";
import { createNotificationEventsHub } from "../src/services/notification-events.service.js";
import { createAuthService } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";
const secret = "notification-route-secret-long-enough";
function fixture() {
  const f = createChatFixture();
  const app = express(), auth = createAuthService(f.repository, {jwtSecret: secret, jwtExpiresInSeconds: 3600}, {clock: f.clock});
  const notifications = createNotificationService({repository: f.chatRepository, clock: f.clock});
  const stream = createNotificationStreamService({auth, service: notifications, hub: createNotificationEventsHub({watchChanges: false})});
  app.use(express.json()); app.use("/api/v1", createNotificationsRouter(auth, notifications, stream)); app.use(errorHandler);
  const token = (id: string) => jwt.sign({id, role: f.actor(id).role, sessionVersion: 1, exp: Math.floor(Math.max(Date.now(), f.clock().getTime()) / 1000) + 3600}, secret);
  return {...f, app, notifications, stream, token};
}
describe("recipient-only notification endpoints", () => {
  it("authenticates, rejects spoofed filters and exposes the exact safe envelope", async () => {
    const f = fixture();
    await f.service.send(f.actor("client-a"), "a", chatSend("@Electric A", {mentions: [{userId: "electric-a", start: 0, end: 11}]}));
    expect((await request(f.app).get("/api/v1/notifications")).status).toBe(401);
    const response = await request(f.app).get("/api/v1/notifications?limit=1&offset=0").auth(f.token("electric-a"), {type: "bearer"});
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toMatchObject({items: [{type: "chat.mention", projectId: "a", readAt: null}], unreadCount: 1, pagination: {limit: 1, offset: 0, total: 1, hasMore: false}});
    expect(Object.keys(response.body.data.items[0]).sort()).toEqual(["id", "type", "projectId", "projectName", "messageId", "actor", "excerpt", "createdAt", "readAt"].sort());
    for (const query of ["recipientId=super", "limit=51", "offset=-1", "filter=unread", "search=Project"]) expect((await request(f.app).get(`/api/v1/notifications?${query}`).auth(f.token("electric-a"), {type: "bearer"})).status).toBe(400);
    await f.stream.close();
  });
  it("cannot read another recipient's notification even as Super Admin", async () => {
    const f = fixture();
    await f.service.send(f.actor("client-a"), "a", chatSend("@Electric A", {mentions: [{userId: "electric-a", start: 0, end: 11}]}));
    const id = (await request(f.app).get("/api/v1/notifications").auth(f.token("electric-a"), {type: "bearer"})).body.data.items[0].id;
    const path = `/api/v1/notifications/${id}/read`;
    expect((await request(f.app).put(path).auth(f.token("super"), {type: "bearer"})).status).toBe(404);
    const read = await request(f.app).put(path).auth(f.token("electric-a"), {type: "bearer"});
    expect(read.status).toBe(200); expect(read.body.data.readAt).toBeTruthy();
    expect((await request(f.app).get("/api/v1/notifications").auth(f.token("electric-a"), {type: "bearer"})).body.data.unreadCount).toBe(0);
    await f.stream.close();
  });
});
