import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/services/auth.service.js";
import { ApiError } from "../src/middleware/errors.js";
import { createProjectChatStreamService } from "../src/services/project-chat-stream.service.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";

class StreamResponse extends EventEmitter {
  frames: string[] = [];
  headersSent = false;
  destroyed = false;
  writableEnded = false;
  writableFinished = false;
  writableNeedDrain = false;
  writableLength = 0;
  block: (frame: string) => boolean = () => false;
  setHeader() { return this; }
  status() { return this; }
  set() { return this; }
  flushHeaders() { this.headersSent = true; }
  write(frame: string) {
    this.frames.push(frame);
    this.writableNeedDrain = this.block(frame);
    return !this.writableNeedDrain;
  }
  end() { this.writableEnded = true; this.writableFinished = !this.writableNeedDrain; }
  destroy() { this.destroyed = true; this.emit("close"); }
  drain() { this.writableNeedDrain = false; this.emit("drain"); }
}
async function tick() { await new Promise((resolve) => setTimeout(resolve, 10)); }
function harness() {
  const fixture = createChatFixture();
  const user = fixture.seed.users.find((row) => row.id === "client-a")!;
  const token = jwt.sign({ id: user.id, role: user.role, sessionVersion: 1, exp: fixture.actor(user.id).expiresAt }, "unit-secret");
  const auth = { authenticate: vi.fn(async () => user) } as unknown as AuthService;
  const request = { authenticatedUser: user, header: () => `Bearer ${token}`, socket: { remoteAddress: "127.0.0.1" } } as unknown as Request;
  let wake = () => {};
  const unsubscribe = vi.fn();
  const hub = { subscribe: (_id: string, callback: () => void) => { wake = callback; return unsubscribe; }, close: vi.fn(async () => {}) };
  return { ...fixture, request, auth, hub, unsubscribe, wake: () => wake() };
}

describe("bounded, authorization-safe project chat streaming", () => {
  it("rechecks authorization after initial state-frame backpressure", async () => {
    const h = harness();
    const { cursor } = await h.service.summary(h.actor("client-a"), "a");
    await h.service.send(h.actor("designer-a"), "a", chatSend("Prepared before revocation"));
    const response = new StreamResponse();
    response.block = (frame) => frame.includes("event: state");
    const guarded = vi.spyOn(h.service, "authorizeDelivery");
    const stream = createProjectChatStreamService({ auth: h.auth, chat: h.service, hub: h.hub });
    const open = stream.open(h.request, response as unknown as Response, "a", cursor);
    await tick();
    guarded.mockRejectedValue(new ApiError(404, "CHAT_UNAVAILABLE", "Not available"));
    response.drain();
    await open;
    expect(response.frames.some((frame) => frame.includes("event: chat"))).toBe(false);
    expect(response.frames.some((frame) => frame.includes('"denied"'))).toBe(true);
    await stream.close();
  });

  it("does not miss a drain that occurs while the authorization transaction commits", async () => {
    const h = harness();
    const response = new StreamResponse();
    response.block = (frame) => frame.includes("event: chat");
    vi.spyOn(h.service, "authorizeDelivery").mockImplementation(async (_actor, _project, enqueue) => {
      enqueue(); response.drain(); await tick();
    });
    const stream = createProjectChatStreamService({ auth: h.auth, chat: h.service, hub: h.hub, drainTimeoutMs: 30 });
    await stream.open(h.request, response as unknown as Response, "a");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(response.destroyed).toBe(false);
    expect(response.frames.filter((frame) => frame.includes("event: chat"))).toHaveLength(1);
    await stream.close();
  });

  it("destroys slow streams and cancels pending drain during shutdown", async () => {
    const h = harness();
    const response = new StreamResponse(); response.block = () => true;
    const stream = createProjectChatStreamService({ auth: h.auth, chat: h.service, hub: h.hub });
    const open = stream.open(h.request, response as unknown as Response, "a");
    await tick();
    await stream.close(); await open;
    expect(response.destroyed).toBe(true);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.hub.close).toHaveBeenCalledOnce();
    expect(response.listenerCount("drain")).toBe(0);
  });

  it("limits streams per user and removes closed connections", async () => {
    const h = harness();
    const stream = createProjectChatStreamService({ auth: h.auth, chat: h.service, hub: h.hub, maxStreamsPerUser: 1 });
    const first = new StreamResponse();
    await stream.open(h.request, first as unknown as Response, "a");
    await expect(stream.open(h.request, new StreamResponse() as unknown as Response, "a")).rejects.toMatchObject({ status: 429 });
    first.destroy();
    await stream.open(h.request, new StreamResponse() as unknown as Response, "a");
    await stream.close();
  });
});
