import { describe, expect, it, vi } from "vitest";
import { createChatFixture, chatSend, chatFixtureData, chatUser } from "./helpers/project-chat.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createNotificationEmailDispatcher } from "../src/services/notification-email-dispatcher.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMemoryProjectChatRepository } from "../src/repositories/project-chat-memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { ProjectChatRepository } from "../src/repositories/project-chat.js";
const mention = () => chatSend("@Electric A please check", {mentions: [{userId: "electric-a", start: 0, end: 11}]});
function fixture() { const f = createChatFixture(); return {...f, notifications: createNotificationService({repository: f.chatRepository, clock: f.clock})}; }
const raw = (f: ReturnType<typeof fixture>, id: string) => f.chatRepository.snapshot(tx => tx.notificationPage(id, ["a", "b"], 50, 0));
describe("transactional recipient notification inbox", () => {
  it("fans out once per distinct mentioned recipient plus Super Admin on concurrent retries", async () => {
    const f = fixture();
    const input = chatSend("@Electric A @Electric A @super", {mentions: [{userId: "electric-a", start: 0, end: 11}, {userId: "electric-a", start: 12, end: 23}, {userId: "super", start: 24, end: 30}]});
    const results = await Promise.all(Array.from({length: 5}, () => f.service.send(f.actor("client-a"), "a", input)));
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect((await raw(f, "electric-a")).total).toBe(1);
    expect((await raw(f, "super")).items[0]).toMatchObject({type: "chat.mention", email: {status: "pending", attempts: 0}});
    expect((await raw(f, "client-a")).total).toBe(0);
  });
  it("keeps oversight for self-authored Super Admin mentions and explicit self mentions", async () => {
    const f = fixture();
    await f.service.send(f.actor("super"), "a", mention());
    await f.service.send(f.actor("electric-a"), "a", mention());
    expect((await raw(f, "super")).items.every(row => row.type === "chat.mention.oversight")).toBe(true);
    expect((await raw(f, "electric-a")).total).toBe(2);
  });
  it("does not create alerts for untagged or invalid mentions and rolls back fanout with audit", async () => {
    const f = fixture();
    await f.service.send(f.actor("client-a"), "a", chatSend("@Electric A plain text"));
    await expect(f.service.send(f.actor("client-b"), "a", mention())).rejects.toMatchObject({status: 404});
    const service = createProjectChatService({repository: f.repository, chatRepository: f.chatRepository, clock: f.clock, audit: {...f.audit, append: async () => { throw new Error("rollback"); }}});
    await expect(service.send(f.actor("client-a"), "a", mention())).rejects.toThrow("rollback");
    expect((await raw(f, "electric-a")).total).toBe(0);
    expect((await f.service.messages(f.actor("client-a"), "a", {})).items).toHaveLength(1);
  });
  it("isolates inboxes and idempotent reads; revocation removes unread counts and refuses read", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    const page = await f.notifications.list(f.actor("electric-a"), {});
    const id = page.items[0]!.id;
    expect(page).toMatchObject({unreadCount: 1, pagination: {total: 1}});
    expect(JSON.stringify(page)).not.toMatch(/recipientId|leaseToken|chat.test|email/);
    await expect(f.notifications.read(f.actor("super"), id)).rejects.toMatchObject({status: 404});
    expect((await f.notifications.list(f.actor("client-b"), {})).items).toEqual([]);
    const first = await f.notifications.read(f.actor("electric-a"), id);
    f.advance(2000);
    expect(await f.notifications.read(f.actor("electric-a"), id)).toEqual(first);
    expect((await f.notifications.list(f.actor("electric-a"), {})).unreadCount).toBe(0);
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    expect((await f.notifications.list(f.actor("electric-a"), {})).pagination.total).toBe(0);
    await expect(f.notifications.read(f.actor("electric-a"), id)).rejects.toMatchObject({status: 404});
  });
  it("fails closed for ambiguous Super Admin identity and validates paging/session", async () => {
    const f = fixture();
    const wrap = (tx: Parameters<Parameters<ProjectChatRepository["snapshot"]>[0]>[0]) => ({...tx, sources: async (id: string) => {
      const sources = await tx.sources(id);
      return sources ? {...sources, users: [...sources.users, chatUser("extra-super", "super_admin")]} : null;
    }});
    const chatRepository: ProjectChatRepository = {...f.chatRepository, snapshot: operation => f.chatRepository.snapshot(tx => operation(wrap(tx))), mutate: operation => f.chatRepository.mutate(tx => operation(wrap(tx)))};
    const service = createProjectChatService({repository: f.repository, chatRepository, audit: f.audit, clock: f.clock});
    await service.send(f.actor("client-a"), "a", mention());
    const notifications = createNotificationService({repository: chatRepository, clock: f.clock});
    expect((await notifications.list(f.actor("super"), {})).items).toEqual([]);
    expect((await notifications.list(f.actor("electric-a"), {})).items).toHaveLength(1);
    await expect(notifications.list(f.actor("electric-a"), {limit: 51})).rejects.toMatchObject({status: 400});
    await expect(notifications.list({...f.actor("electric-a"), sessionVersion: 2}, {})).rejects.toMatchObject({status: 401});
  });
  it("enqueues only after successful snapshot transaction despite callback retry", async () => {
    const f = fixture(); const enqueue = vi.fn();
    const repository: ProjectChatRepository = {...f.chatRepository, mutate: async operation => { await f.chatRepository.mutate(operation); expect(enqueue).not.toHaveBeenCalled(); return f.chatRepository.mutate(operation); }};
    await createNotificationService({repository, clock: f.clock}).deliver(f.actor("electric-a"), enqueue);
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
describe("leased mention email delivery", () => {
  it("sends only after commit, deduplicates competing workers and persists sent state", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    const sendMention = vi.fn(async (_input: unknown) => {});
    const workers = [1,2].map(() => createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}}));
    await Promise.all(workers.map(worker => worker.runOnce()));
    expect(sendMention).toHaveBeenCalledTimes(2);
    expect(new Set(sendMention.mock.calls.map(call => (call as unknown as [{notificationId: string}])[0].notificationId)).size).toBe(2);
    expect((await raw(f, "electric-a")).items[0]!.email).toMatchObject({status: "sent", attempts: 1, leaseToken: null});
    await Promise.all(workers.map(worker => worker.stop()));
  });
  it("preserves disabled and bounded failed states without undoing chat", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    const disabled = createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "disabled"}});
    await disabled.runOnce(); await disabled.stop();
    expect((await raw(f, "electric-a")).items[0]!.email.status).toBe("disabled");
    await f.service.send(f.actor("client-a"), "a", mention());
    const sendMention = vi.fn(async () => { throw new Error("secret provider body"); });
    const failing = createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}});
    for (let i = 0; i < 5; i++) { await failing.runOnce(); f.advance(300_000); }
    expect(sendMention).toHaveBeenCalledTimes(8);
    const rows = await raw(f, "electric-a");
    expect(rows.items.map(row => row.email.status).sort()).toEqual(["disabled", "failed"]);
    expect(JSON.stringify(rows)).not.toContain("secret provider");
    await failing.stop();
  });
  it("suppresses mail to revoked members while keeping authorized oversight", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    const sendMention = vi.fn(async (_input: unknown) => {});
    const worker = createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}});
    await worker.runOnce();
    expect(sendMention).toHaveBeenCalledTimes(1);
    expect((await raw(f, "electric-a")).items[0]!.email).toMatchObject({status: "suppressed", failureCode: "RECIPIENT_UNAVAILABLE"});
    await worker.stop();
  });
  it("revalidates current address and active account before sending", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    await f.repository.runInTransaction(async tx => { await tx.updateUser("electric-a", 1, {active: false, updatedAt: f.clock().toISOString()}); });
    const repository: ProjectChatRepository = {...f.chatRepository, snapshot: operation => f.chatRepository.snapshot(tx => operation({...tx, app: {...tx.app, findUserById: async id => {
      const user = await tx.app.findUserById(id); return user && id === "super" ? {...user, email: "current-super@chat.test"} : user;
    }}}))};
    const sendMention = vi.fn(async (_input: unknown) => {});
    const worker = createNotificationEmailDispatcher({repository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}});
    await worker.runOnce(); expect(sendMention).toHaveBeenCalledOnce();
    expect(sendMention).toHaveBeenCalledWith(expect.objectContaining({recipient: expect.objectContaining({email: "current-super@chat.test"})}));
    expect((await raw(f, "electric-a")).items[0]!.email.status).toBe("suppressed"); await worker.stop();
  });
  it("blocks external delivery initiated by demo identities", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    const repository: ProjectChatRepository = {...f.chatRepository, snapshot: operation => f.chatRepository.snapshot(tx => operation({...tx, app: {...tx.app, findUserById: async id => {
      const user = await tx.app.findUserById(id); return user && id === "client-a" ? {...user, accountKind: "development_demo"} : user;
    }}}))};
    const sendMention = vi.fn(async (_input: unknown) => {});
    const worker = createNotificationEmailDispatcher({repository, clock: f.clock, mailer: {deliveryKind: "external", sendMention}});
    await worker.runOnce(); expect(sendMention).not.toHaveBeenCalled();
    expect((await raw(f, "electric-a")).items[0]!.email).toMatchObject({status: "suppressed", failureCode: "DEMO_EXTERNAL_DELIVERY_BLOCKED"}); await worker.stop();
  });
  it("waits for the active provider during shutdown and claims no further jobs", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    let release!: () => void; const provider = new Promise<void>(resolve => { release = resolve; });
    const sendMention = vi.fn(() => provider);
    const worker = createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}});
    const run = worker.runOnce(); await vi.waitFor(() => expect(sendMention).toHaveBeenCalledOnce());
    let stopped = false; const stop = worker.stop().then(() => {stopped = true;});
    await Promise.resolve(); expect(stopped).toBe(false); release(); await Promise.all([run, stop]);
    expect(sendMention).toHaveBeenCalledOnce(); expect(stopped).toBe(true);
  });
  it("does not dispatch from retryable repository callbacks", async () => {
    const f = fixture(); await f.service.send(f.actor("client-a"), "a", mention());
    const sendMention = vi.fn(async (_input: unknown) => {});
    let callbackDepth = 0;
    const repository: ProjectChatRepository = {...f.chatRepository, snapshot: async operation => {
      const check = async (tx: Parameters<Parameters<ProjectChatRepository["snapshot"]>[0]>[0]) => { callbackDepth++; try { return await operation(tx); } finally { callbackDepth--; } };
      await f.chatRepository.snapshot(check); return f.chatRepository.snapshot(check);
    }};
    const worker = createNotificationEmailDispatcher({repository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention: async input => { expect(callbackDepth).toBe(0); await sendMention(input as never); }}});
    await worker.runOnce(); expect(sendMention).toHaveBeenCalledTimes(2); await worker.stop();
  });
});
