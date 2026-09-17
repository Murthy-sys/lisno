import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createNotificationStreamService } from "../src/services/notification-stream.service.js";
import { createNotificationEventsHub } from "../src/services/notification-events.service.js";
import type { AuthService } from "../src/services/auth.service.js";
import { ApiError } from "../src/middleware/errors.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";
class StreamResponse extends EventEmitter {
  frames: string[] = []; headersSent = false; destroyed = false; writableNeedDrain = false; writableLength = 0; writableEnded = false;
  block = false;
  status() { return this; } set() { return this; } setHeader() { return this; }
  flushHeaders() { this.headersSent = true; }
  write(frame: string) { this.frames.push(frame); this.writableNeedDrain = this.block; return !this.writableNeedDrain; }
  end() { this.writableEnded = true; }
  destroy() { this.destroyed = true; this.emit("close"); }
  drain() { this.block = false; this.writableNeedDrain = false; this.emit("drain"); }
}
const tick = async () => new Promise(resolve => setTimeout(resolve, 10));
function harness() {
  const f = createChatFixture(), user = f.seed.users.find(row => row.id === "electric-a")!;
  const token = jwt.sign({id: user.id, role: user.role, sessionVersion: 1, exp: f.actor(user.id).expiresAt}, "unit-secret");
  const auth = {authenticate: vi.fn(async () => user)} as unknown as AuthService;
  const request = {authenticatedUser: user, header: () => `Bearer ${token}`, socket: {remoteAddress: "127.0.0.1"}} as unknown as Request;
  let callback = () => {}; const unsubscribe = vi.fn();
  const hub = {subscribe: vi.fn((_id: string, wake: () => void) => {callback = wake; return unsubscribe;}), wake: () => callback(), close: vi.fn(async () => {})};
  const service = createNotificationService({repository: f.chatRepository, clock: f.clock});
  const send = () => f.service.send(f.actor("client-a"), "a", chatSend("@Electric A", {mentions: [{userId: user.id, start: 0, end: 11}]}));
  return {...f, auth, request, hub, unsubscribe, notifications: service, send};
}
describe("notification live snapshots", () => {
  it("sends a fresh recipient-only snapshot on wake and rechecks revocation", async () => {
    const h = harness(), response = new StreamResponse();
    const stream = createNotificationStreamService({auth: h.auth, service: h.notifications, hub: h.hub});
    await stream.open(h.request, response as unknown as Response);
    expect(h.hub.subscribe.mock.calls[0]![0]).toBe("electric-a");
    expect(response.frames[0]).toContain('"unreadCount":0');
    const sent = await h.send(); h.hub.wake(); await tick();
    expect(response.frames.at(-1)).toContain(sent.id);
    expect(response.frames.at(-1)).not.toContain('"recipientId"');
    h.workflowTasks[0]!.assigneeUserId = "electric-b"; h.hub.wake(); await tick();
    expect(response.frames.at(-1)).toContain('"items":[],"unreadCount":0');
    vi.mocked(h.auth.authenticate).mockRejectedValue(new ApiError(401, "INVALID_TOKEN", "Invalid"));
    h.hub.wake(); await tick();
    expect(response.frames.at(-1)).toContain('"denied"'); expect(response.writableEnded).toBe(true);
    expect(h.unsubscribe).toHaveBeenCalledOnce(); await stream.close();
  });
  it("coalesces changes while backpressured without duplicating the already queued frame", async () => {
    const h = harness(), response = new StreamResponse(); response.block = true;
    const stream = createNotificationStreamService({auth: h.auth, service: h.notifications, hub: h.hub});
    const open = stream.open(h.request, response as unknown as Response); await tick();
    for (let i = 0; i < 5; i++) h.hub.wake();
    await h.send(); response.drain(); await open; await tick();
    expect(response.frames.filter(frame => frame.includes('"unreadCount":0'))).toHaveLength(1);
    expect(response.frames.filter(frame => frame.includes('"unreadCount":1'))).toHaveLength(1);
    await stream.close();
  });
  it("closes slow streams, removes subscriptions and enforces per-user connection limits", async () => {
    const h = harness(), response = new StreamResponse();
    const stream = createNotificationStreamService({auth: h.auth, service: h.notifications, hub: h.hub, maxStreamsPerUser: 1, drainTimeoutMs: 20});
    await stream.open(h.request, response as unknown as Response);
    await expect(stream.open(h.request, new StreamResponse() as unknown as Response)).rejects.toMatchObject({status: 429});
    response.block = true; h.hub.wake(); await new Promise(resolve => setTimeout(resolve, 50));
    expect(response.destroyed).toBe(true); expect(response.listenerCount("drain")).toBe(0);
    await stream.close();
  });
  it("uses bounded recovery instead of rapid polling and stops on last unsubscribe", async () => {
    vi.useFakeTimers();
    try {
      const hub = createNotificationEventsHub({watchChanges: false}); const a = vi.fn(), b = vi.fn();
      const stopA = hub.subscribe("a", a), stopB = hub.subscribe("b", b);
      hub.wake("a"); expect(a).toHaveBeenCalledOnce(); expect(b).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(19_999); expect(a).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1); expect(a).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledOnce();
      stopA(); stopB(); await vi.advanceTimersByTimeAsync(60_000); expect(b).toHaveBeenCalledOnce(); await hub.close();
    } finally { vi.useRealTimers(); }
  });
});
