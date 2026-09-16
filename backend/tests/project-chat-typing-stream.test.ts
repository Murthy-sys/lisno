import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/services/auth.service.js";
import { createProjectChatStreamService } from "../src/services/project-chat-stream.service.js";
import { createProjectChatTypingService } from "../src/services/project-chat-typing.service.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";

class StreamResponse extends EventEmitter {
  frames: string[] = []; headersSent = false; destroyed = false;
  writableEnded = false; writableFinished = false; writableNeedDrain = false; writableLength = 0;
  block: (frame: string) => boolean = () => false;
  setHeader() { return this; } status() { return this; } set() { return this; }
  flushHeaders() { this.headersSent = true; }
  write(frame: string) { this.frames.push(frame); this.writableNeedDrain = this.block(frame); return !this.writableNeedDrain; }
  end() { this.writableEnded = true; this.writableFinished = !this.writableNeedDrain; }
  destroy() { this.destroyed = true; this.emit("close"); }
  drain() { this.writableNeedDrain = false; this.emit("drain"); }
  typingFrames() { return this.frames.filter(frame => frame.includes("event: typing")); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 35));
function harness() {
  const f = createChatFixture(); const typing = createProjectChatTypingService(f);
  const user = f.seed.users.find(person => person.id === "client-a")!;
  const token = jwt.sign({ id: user.id, role: user.role, sessionVersion: 1, exp: f.actor(user.id).expiresAt }, "typing-fixture");
  const auth = { authenticate: vi.fn(async () => user) } as unknown as AuthService;
  const request = { authenticatedUser: user, header: () => `Bearer ${token}`, socket: { remoteAddress: "127.0.0.1" } } as unknown as Request;
  let wake = () => {};
  const hub = { subscribe: (_project: string, callback: () => void) => { wake = callback; return () => {}; }, close: async () => {} };
  const response = new StreamResponse();
  const stream = createProjectChatStreamService({ auth, chat: f.service, typing, hub });
  return { ...f, typing, response, stream, request, wake: () => wake() };
}
const input = (sequence: number, typing = true) => ({ composerId: "stream-composer-one", sequence, typing });

describe("ephemeral typing frames on the existing protected stream", () => {
  it("sends an initial snapshot, changes and empty clears without IDs or repeated unchanged frames", async () => {
    const h = harness();
    try {
      await h.stream.open(h.request, h.response as unknown as Response, "a");
      const initialChat = h.response.frames.find(frame => frame.includes("event: chat"));
      expect(h.response.typingFrames()).toHaveLength(1);
      expect(h.response.typingFrames()[0]).toContain('"participants":[]');
      await h.typing.update(h.actor("designer-a"), "a", input(1)); h.wake(); await tick();
      expect(h.response.typingFrames()).toHaveLength(2);
      expect(h.response.typingFrames()[1]).toContain('"name":"Designer A"');
      expect(h.response.typingFrames().every(frame => !frame.includes("id:") && !frame.includes("cursor"))).toBe(true);
      h.wake(); await tick(); expect(h.response.typingFrames()).toHaveLength(2);
      expect(h.response.frames.filter(frame => frame.includes("event: chat"))).toEqual([initialChat]);
      h.advance(8_000); h.wake(); await tick();
      expect(h.response.typingFrames()).toHaveLength(3);
      expect(h.response.typingFrames()[2]).toContain('"participants":[]');
    } finally { await h.stream.close(); }
  });
  it("keeps committed messages flowing through a transient typing-store failure", async () => {
    const h = harness();
    vi.spyOn(h.typing, "deliver").mockRejectedValue(new Error("transient presence failure"));
    try {
      await h.stream.open(h.request, h.response as unknown as Response, "a");
      const message = await h.service.send(h.actor("designer-a"), "a", chatSend("Still delivered"));
      h.wake(); await tick();
      expect(h.response.frames.some(frame => frame.includes(message.id))).toBe(true);
      expect(h.response.writableEnded).toBe(false);
      expect(h.response.frames.some(frame => frame.includes('"unavailable"'))).toBe(false);
    } finally { await h.stream.close(); }
  });
  it("rechecks typist session while waiting behind durable-frame backpressure", async () => {
    const h = harness();
    await h.typing.update(h.actor("designer-a"), "a", input(1));
    h.response.block = frame => frame.includes("event: chat");
    const open = h.stream.open(h.request, h.response as unknown as Response, "a");
    await tick();
    await h.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation();
      const user = await tx.findUserById("designer-a");
      await tx.updateUserCredentials(user!.id, user!.version, user!.sessionVersion, { passwordHash: "changed", updatedAt: h.clock().toISOString() });
    });
    h.response.drain(); await open;
    try {
      expect(h.response.typingFrames()).toHaveLength(1);
      expect(h.response.typingFrames()[0]).toContain('"participants":[]');
      expect(h.response.typingFrames()[0]).not.toContain("Designer A");
    } finally { await h.stream.close(); }
  });
  it("coalesces slow-consumer changes into the next fresh snapshot instead of accumulating frames", async () => {
    const h = harness();
    try {
      await h.stream.open(h.request, h.response as unknown as Response, "a");
      h.response.block = frame => frame.includes("event: typing");
      const actor = h.actor("designer-a");
      await h.typing.update(actor, "a", input(1)); h.wake(); await tick();
      await h.typing.update(actor, "a", input(2, false));
      for (let i = 0; i < 30; i++) h.wake();
      await tick(); expect(h.response.typingFrames()).toHaveLength(2);
      h.response.block = () => false; h.response.drain(); await tick();
      expect(h.response.typingFrames()).toHaveLength(3);
      expect(h.response.typingFrames()[2]).toContain('"participants":[]');
    } finally { await h.stream.close(); }
  });
});
