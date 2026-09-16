import { describe, expect, it, vi } from "vitest";
import type { ChatActor, ChatTypingSnapshot } from "../src/contracts/project-chat.js";
import { CHAT_TYPING } from "../src/domain/project-chat-typing.js";
import { createProjectChatTypingService } from "../src/services/project-chat-typing.service.js";
import { createChatFixture } from "./helpers/project-chat.js";

const composerId = "composer-instance-one";
const update = (sequence: number, typing = true, id = composerId) => ({ composerId: id, sequence, typing });
function fixture() {
  const f = createChatFixture();
  const typing = createProjectChatTypingService(f);
  const snapshot = async (actor: ChatActor = f.actor("client-a"), projectId = "a") => {
    let value!: ChatTypingSnapshot;
    await typing.deliver(actor, projectId, result => { value = result; });
    return value;
  };
  return { ...f, typing, snapshot };
}

describe("bounded transient typing and current authorization", () => {
  it("uses current names and an 8-second lease without creating chat, read, audit or activity writes", async () => {
    const f = fixture();
    const before = await f.service.summary(f.actor("client-a"), "a");
    const projectBefore = await f.repository.findProjectById("a");
    expect(await f.typing.update(f.actor("designer-a"), "a", update(1))).toEqual({ sequence: 1, typing: true, expiresAt: "2026-09-16T10:00:08.000Z" });
    expect((await f.snapshot()).participants).toEqual([{ userId: "designer-a", name: "Designer A", expiresAt: "2026-09-16T10:00:08.000Z" }]);
    expect(await f.service.summary(f.actor("client-a"), "a")).toEqual(before);
    expect((await f.service.events(f.actor("client-a"), "a", before.cursor)).events).toEqual([]);
    expect(await f.repository.findProjectById("a")).toEqual(projectBefore);
    expect((await f.repository.pageAuditEvents({}, { limit: 100, offset: 0 })).total).toBe(0);
    const rows = await f.chatRepository.snapshot(tx => tx.typingByUser("a", "designer-a", f.clock().toISOString(), 21));
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("name");
    expect(rows[0]).not.toHaveProperty("token");
    f.advance(8_000);
    expect((await f.snapshot()).participants).toEqual([]);
    expect(await f.chatRepository.snapshot(tx => tx.typingByUser("a", "designer-a", f.clock().toISOString(), 21))).toHaveLength(1);
  });

  it("ignores old/equal sequences and retains stops, while a fresh edit immediately restarts", async () => {
    const f = fixture(); const actor = f.actor("designer-a");
    await f.typing.update(actor, "a", update(1));
    await expect(f.typing.update(actor, "a", update(2))).rejects.toMatchObject({ status: 429 });
    expect(await f.typing.update(actor, "a", update(3, false))).toEqual({ sequence: 3, typing: false, expiresAt: null });
    f.advance(1_500);
    expect(await f.typing.update(actor, "a", update(2))).toEqual({ sequence: 3, typing: false, expiresAt: null });
    expect(await f.typing.update(actor, "a", update(3))).toEqual({ sequence: 3, typing: false, expiresAt: null });
    expect((await f.typing.update(actor, "a", update(4))).typing).toBe(true);
    f.advance(3_000);
    expect((await f.typing.update(actor, "a", update(5))).expiresAt).toBe("2026-09-16T10:00:12.500Z");
  });

  it("aggregates tabs and scopes the same composer ID to authenticated sessions and projects", async () => {
    const f = fixture(); const actor = f.actor("designer-a");
    const secondSession = { ...actor, expiresAt: actor.expiresAt + 1 };
    await f.typing.update(actor, "a", update(1));
    await f.typing.update(secondSession, "a", update(1));
    await f.typing.update(actor, "a", update(1, true, "composer-instance-two"));
    expect((await f.snapshot()).participants).toHaveLength(1);
    await f.typing.update(actor, "a", update(2, false));
    expect((await f.snapshot()).participants).toHaveLength(1);
    await f.typing.update(secondSession, "a", update(2, false));
    await f.typing.update(actor, "a", update(2, false, "composer-instance-two"));
    expect((await f.snapshot()).participants).toEqual([]);
    await f.typing.update(f.actor("client-b"), "b", update(1));
    expect((await f.snapshot()).participants).toEqual([]);
    expect((await f.snapshot(f.actor("client-b"), "b")).participants[0]?.name).toBe("Client B");
  });

  it("retains successive stops arriving before a delayed restart without throttling their sequence guards", async () => {
    const f = fixture(); const actor = f.actor("designer-a");
    await f.typing.update(actor, "a", update(1));
    await f.typing.update(actor, "a", update(2, false));
    await f.typing.update(actor, "a", update(4, false));
    expect(await f.typing.update(actor, "a", update(3))).toEqual({ sequence: 4, typing: false, expiresAt: null });
    expect((await f.snapshot()).participants).toEqual([]);
  });

  it("enforces current membership for both typists and viewers with non-disclosing denial", async () => {
    const f = fixture();
    await expect(f.typing.update(f.actor("client-b"), "a", update(1))).rejects.toMatchObject({ status: 404 });
    await expect(f.snapshot(f.actor("client-b"))).rejects.toMatchObject({ status: 404 });
    await f.typing.update(f.actor("electric-a"), "a", update(1));
    expect((await f.snapshot()).participants[0]?.name).toBe("Electric A");
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    expect((await f.snapshot()).participants).toEqual([]);
    await expect(f.typing.update(f.actor("electric-a"), "a", update(2, false))).rejects.toMatchObject({ status: 404 });
  });

  it("removes reset, deactivated and expired typists before names are enqueued", async () => {
    const f = fixture();
    const expiring = { ...f.actor("designer-a"), expiresAt: Math.floor(f.clock().getTime() / 1000) + 1 };
    await f.typing.update(expiring, "a", update(1));
    f.advance(1_000);
    expect((await f.snapshot()).participants).toEqual([]);
    await f.typing.update(f.actor("electric-a"), "a", update(1));
    await f.typing.update(f.actor("sales-a"), "a", update(1));
    await f.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation();
      const user = await tx.findUserById("electric-a");
      await tx.updateUserCredentials(user!.id, user!.version, user!.sessionVersion, { passwordHash: "new-test-hash", updatedAt: f.clock().toISOString() });
      const sales = await tx.findUserById("sales-a");
      await tx.updateUser(sales!.id, sales!.version, { active: false, updatedAt: f.clock().toISOString() });
    });
    expect((await f.snapshot()).participants).toEqual([]);
  });

  it("batches fresh project reads across authorized viewers and rejects only the denied viewer", async () => {
    const f = fixture();
    const sourceRead = vi.fn(); const leaseRead = vi.fn();
    const service = createProjectChatTypingService({ clock: f.clock, chatRepository: {
      ...f.chatRepository,
      mutate: operation => f.chatRepository.mutate(tx => operation({ ...tx,
        async sources(projectId) { sourceRead(); return tx.sources(projectId); },
        async activeTyping(...args) { leaseRead(...args); return tx.activeTyping(...args); }
      }))
    } });
    const callbacks = [vi.fn(), vi.fn(), vi.fn()];
    const results = await Promise.allSettled([
      service.deliver(f.actor("client-a"), "a", callbacks[0]!),
      service.deliver(f.actor("designer-a"), "a", callbacks[1]!),
      service.deliver(f.actor("client-b"), "a", callbacks[2]!)
    ]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
    expect(sourceRead).toHaveBeenCalledOnce();
    expect(leaseRead).toHaveBeenCalledWith("a", f.clock().toISOString(), 101);
    expect(callbacks[0]).toHaveBeenCalledOnce(); expect(callbacks[1]).toHaveBeenCalledOnce();
    expect(callbacks[2]).not.toHaveBeenCalled();
  });

  it("caps active and retained composers without blocking existing stops", async () => {
    const f = fixture(); const actor = f.actor("client-a");
    for (let i = 0; i < 5; i++) await f.typing.update(actor, "a", update(1, true, `bounded-composer-${i}`));
    await expect(f.typing.update(actor, "a", update(1, true, "bounded-composer-5"))).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 5; i++) await f.typing.update(actor, "a", update(2, false, `bounded-composer-${i}`));
    for (let i = 5; i < 20; i++) await f.typing.update(actor, "a", update(1, false, `bounded-composer-${i}`));
    await expect(f.typing.update(actor, "a", update(1, false, "bounded-composer-20"))).rejects.toMatchObject({ status: 429 });
    expect((await f.typing.update(actor, "a", update(3, true, "bounded-composer-0"))).typing).toBe(true);
    expect((await f.typing.update(actor, "a", update(4, false, "bounded-composer-0"))).typing).toBe(false);
    f.advance(CHAT_TYPING.retentionMs);
    await expect(f.typing.update(actor, "a", update(1, true, "bounded-composer-20"))).resolves.toMatchObject({ typing: true });
  });

  it("bounds rapid stop/start abuse with a shared user/project window, preserving the final stop", async () => {
    const f = fixture(); const actor = f.actor("client-a");
    for (let i = 0; i < CHAT_TYPING.maxActiveUpdatesPerWindow; i++) {
      await f.typing.update(actor, "a", update(i * 2));
      await f.typing.update(actor, "a", update(i * 2 + 1, false));
    }
    await expect(f.typing.update(actor, "a", update(999))).rejects.toMatchObject({ status: 429 });
    expect((await f.snapshot()).participants).toEqual([]);
    f.advance(CHAT_TYPING.rateWindowMs);
    await expect(f.typing.update(actor, "a", update(999))).resolves.toMatchObject({ typing: true });
  });

  it("rejects malformed/spoofed input and expired queued requests without state writes", async () => {
    const f = fixture();
    await expect(f.typing.update(f.actor("client-a"), "a", { ...update(1), name: "Fake" } as never)).rejects.toMatchObject({ status: 400 });
    await expect(f.typing.update(f.actor("client-a"), "a", update(Number.MAX_SAFE_INTEGER + 1))).rejects.toMatchObject({ status: 400 });
    await expect(f.typing.update(f.actor("client-a"), "a", update(1), Date.now() - 10_001)).rejects.toMatchObject({ status: 408 });
    const queued = createProjectChatTypingService({ clock: f.clock, chatRepository: { ...f.chatRepository,
      mutate: operation => f.chatRepository.mutate(tx => operation({ ...tx, async sources(id) {
        // Represents a request already 10 seconds old when the authorization fence is obtained.
        const result = await tx.sources(id);
        vi.spyOn(Date, "now").mockReturnValue(originalNow + 10_001);
        return result;
      } }))
    } });
    const originalNow = Date.now();
    try { await expect(queued.update(f.actor("client-a"), "a", update(1), originalNow)).rejects.toMatchObject({ status: 408 }); }
    finally { vi.restoreAllMocks(); }
    expect(await f.chatRepository.snapshot(tx => tx.typingByUser("a", "client-a", f.clock().toISOString(), 21))).toEqual([]);
  });
});
