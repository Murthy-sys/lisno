import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChatTypingSnapshot } from "../src/contracts/project-chat.js";
import { ProjectChatTypingModel, ProjectChatTypingRateModel } from "../src/models/ProjectChatTyping.js";
import { ProjectChatEventModel, ProjectChatMessageModel, ProjectChatReadStateModel } from "../src/models/ProjectChat.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createProjectChatTypingService } from "../src/services/project-chat-typing.service.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const children = new Set<ChildProcess>(); const streams = new Set<AbortController>();
const secret = "chat-process-fixture-secret-at-least-32-characters";
const roles = { "client-a": "client", "client-b": "client", "designer-a": "designer", "admin-a": "admin", "site-a": "site_manager" } as const;
type Identity = keyof typeof roles;
const tokens = new Map<string, string>();
const input = (sequence: number, typing = true, composerId = "mongo-composer-one") => ({ composerId, sequence, typing });
function token(id: Identity, sessionVersion = 1) {
  const key = `${id}:${sessionVersion}`;
  if (!tokens.has(key)) tokens.set(key, jwt.sign({ id, role: roles[id], sessionVersion }, secret, { expiresIn: 3600 }));
  return tokens.get(key)!;
}
async function until<T>(read: () => T | undefined, timeout = 5_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = read(); if (result !== undefined) return result; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error("Timed out waiting for typing transport fixture");
}
async function start(mode: "watch" | "poll") {
  const child = fork(fileURLToPath(new URL("./helpers/project-chat-process.ts", import.meta.url)), [replica.uri, mode, "", "advancing"], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
  children.add(child); let port: number | undefined; let stderr = "";
  child.stderr?.on("data", data => { stderr += String(data); });
  child.on("message", (data: any) => { if (data.port) port = data.port; });
  await until(() => { if (child.exitCode !== null) throw new Error(`Typing fixture exited: ${stderr}`); return port; }, 15_000);
  return { child, url: `http://127.0.0.1:${port}/api/v1` };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) { children.delete(child); return; }
  const done = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGTERM"); await done; children.delete(child);
}
async function api(server: { url: string }, id: Identity, path: string, body?: unknown, method = "PUT") {
  const response = await fetch(server.url + path, { method: body === undefined ? "GET" : method, headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result.data;
}
async function open(server: { url: string }, id: Identity, projectId = "a") {
  const abort = new AbortController(); streams.add(abort);
  const response = await fetch(server.url + `/projects/${projectId}/chat/events`, { headers: { Authorization: `Bearer ${token(id)}` }, signal: abort.signal });
  expect(response.status).toBe(200);
  const snapshots: ChatTypingSnapshot[] = []; const frames: string[] = []; const states: string[] = [];
  const reader = response.body!.getReader();
  const read = (async () => {
    const decoder = new TextDecoder(); let pending = "";
    try { while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      pending += decoder.decode(chunk.value, { stream: true }); let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2); frames.push(frame);
        const data = frame.split("\n").find(line => line.startsWith("data: "))?.slice(6);
        if (!data) continue;
        if (frame.includes("event: typing")) snapshots.push(JSON.parse(data));
        if (frame.includes("event: state")) states.push(JSON.parse(data).status);
      }
    } } catch { /* An abort or permission-denied stream closure is expected. */ }
  })();
  await until(() => snapshots[0]);
  return { snapshots, frames, states, read, close() { abort.abort(); streams.delete(abort); } };
}
beforeAll(async () => { replica = await startMongoReplicaSet("project-chat-typing-test"); for (const model of chatModels) await model.createIndexes(); }, 120_000);
beforeEach(async () => { await replica.clear(); tokens.clear(); });
afterAll(async () => { for (const abort of streams) abort.abort(); await Promise.all([...children].map(stop)); await replica?.stop(); }, 20_000);

describe("Mongo typing leases and authorization fences", () => {
  it("serializes independent adapters, stale stop races and active-composer quota races", async () => {
    const f = await insertChatMongoFixture(); const now = Date.now(); const clock = () => new Date(now);
    const actor = { ...f.actor("designer-a"), expiresAt: Math.floor(now / 1000) + 3600 };
    const one = createProjectChatTypingService({ chatRepository: f.chatRepository, clock });
    const two = createProjectChatTypingService({ chatRepository: createMongoProjectChatRepository(), clock });
    const repeated = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? one : two).update(actor, "a", input(1))));
    expect(repeated.every(result => result.sequence === 1 && result.typing)).toBe(true);
    expect(await ProjectChatTypingModel.countDocuments()).toBe(1);
    expect((await ProjectChatTypingRateModel.findOne().lean())?.activeUpdates).toBe(1);
    await Promise.all([one.update(actor, "a", input(2, false)), two.update(actor, "a", input(1))]);
    expect((await ProjectChatTypingModel.findOne().lean())?.expiresAt).toBeNull();
    expect((await two.update(actor, "a", input(1))).sequence).toBe(2);
    const raced = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => (i % 2 ? one : two).update(actor, "a", input(1, true, `quota-composer-${i}-instance`))));
    expect(raced.filter(result => result.status === "fulfilled")).toHaveLength(5);
    expect(raced.filter(result => result.status === "rejected")).toHaveLength(2);
    expect(await ProjectChatTypingModel.countDocuments({ expiresAt: { $ne: null } })).toBe(5);
    for (const model of [ProjectChatEventModel, ProjectChatMessageModel, ProjectChatReadStateModel, AuditEventModel]) expect(await model.countDocuments()).toBe(0);
  }, 30_000);

  it("filters leases before TTL cleanup and enforces unique identity/TTL indexes", async () => {
    const f = await insertChatMongoFixture(); let now = Date.now(); const clock = () => new Date(now);
    const service = createProjectChatTypingService({ chatRepository: f.chatRepository, clock });
    const actor = { ...f.actor("designer-a"), expiresAt: Math.floor(now / 1000) + 3600 };
    const viewer = { ...f.actor("client-a"), expiresAt: actor.expiresAt };
    await service.update(actor, "a", input(1));
    const row = (await ProjectChatTypingModel.findOne().lean())!;
    expect(row.cleanupAt).toBeInstanceOf(Date);
    await expect(ProjectChatTypingModel.create({ ...row, _id: "duplicate-typing-identity" })).rejects.toMatchObject({ code: 11000 });
    now += 8_000;
    let snapshot!: ChatTypingSnapshot;
    await service.deliver(viewer, "a", value => { snapshot = value; });
    expect(snapshot.participants).toEqual([]);
    expect(await ProjectChatTypingModel.countDocuments()).toBe(1);
    const indexes = await ProjectChatTypingModel.collection.indexes();
    expect(indexes.some(index => index.expireAfterSeconds === 0 && index.key.cleanupAt === 1)).toBe(true);
    expect((await service.update(actor, "a", input(0))).typing).toBe(false);
  });

  it("checks current session and assignment at delivery under the shared coordinator", async () => {
    const f = await insertChatMongoFixture(); const clock = () => new Date();
    const service = createProjectChatTypingService({ chatRepository: f.chatRepository, clock });
    const actor = { ...f.actor("designer-a"), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    const viewer = { ...f.actor("client-a"), expiresAt: actor.expiresAt };
    await service.update(actor, "a", input(1));
    await f.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation(); const user = await tx.findUserById(actor.id);
      await tx.updateUserCredentials(user!.id, user!.version, user!.sessionVersion, { passwordHash: "reset-hash", updatedAt: clock().toISOString() });
    });
    let snapshot!: ChatTypingSnapshot;
    await service.deliver(viewer, "a", value => { snapshot = value; });
    expect(snapshot.participants).toEqual([]);
    await expect(service.update(actor, "a", input(2, false))).rejects.toMatchObject({ status: 401 });
    await f.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation(); const user = await tx.findUserById(viewer.id);
      await tx.updateUserCredentials(user!.id, user!.version, user!.sessionVersion, { passwordHash: "reset-viewer", updatedAt: clock().toISOString() });
    });
    let delivered = false;
    await expect(service.deliver(viewer, "a", () => { delivered = true; })).rejects.toMatchObject({ status: 401 });
    expect(delivered).toBe(false);
  });

  it("prevents revocation from committing between the typist check and synchronous enqueue", async () => {
    const f = await insertChatMongoFixture(); const clock = () => new Date();
    const actor = { ...f.actor("designer-a"), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    const viewer = { ...f.actor("client-a"), expiresAt: actor.expiresAt };
    const service = createProjectChatTypingService({ chatRepository: f.chatRepository, clock });
    await service.update(actor, "a", input(1));
    let entered!: () => void; let release!: () => void;
    const inspected = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const fenced = createProjectChatTypingService({ clock, chatRepository: { ...f.chatRepository,
      mutate: operation => f.chatRepository.mutate(tx => operation({ ...tx, async activeTyping(...args) {
        const rows = await tx.activeTyping(...args); entered(); await resume; return rows;
      } }))
    } });
    let revocationCommitted = false; let enqueuedBeforeRevocation = false;
    const delivery = fenced.deliver(viewer, "a", snapshot => {
      enqueuedBeforeRevocation = !revocationCommitted && snapshot.participants.some(person => person.userId === actor.id);
    });
    await inspected;
    const revoke = f.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation(); const user = await tx.findUserById(actor.id);
      await tx.updateUserCredentials(actor.id, user!.version, user!.sessionVersion, { passwordHash: "raced-reset", updatedAt: clock().toISOString() });
    }).then(() => { revocationCommitted = true; });
    release();
    await Promise.all([delivery, revoke]);
    expect(enqueuedBeforeRevocation).toBe(true);
    let after!: ChatTypingSnapshot;
    await service.deliver(viewer, "a", snapshot => { after = snapshot; });
    expect(after.participants).toEqual([]);
  });
});

describe("typing across actual API processes", () => {
  it.each(["watch", "poll"] as const)("delivers and clears named typing within 2 seconds with %s transport and no durable cursor changes", async mode => {
    await insertChatMongoFixture();
    const readerServer = await start(mode); const writer = await start("poll");
    const reader = await open(readerServer, "client-a");
    const unrelated = await open(readerServer, "client-b", "b");
    try {
      const initialChat = reader.frames.filter(frame => frame.includes("event: chat"));
      const began = Date.now();
      await api(writer, "designer-a", "/projects/a/chat/typing", input(1));
      await until(() => reader.snapshots.at(-1)?.participants.find(person => person.userId === "designer-a"));
      expect(Date.now() - began).toBeLessThan(2_000);
      expect(reader.snapshots.at(-1)?.participants[0]?.name).toBe("Designer A");
      expect(unrelated.snapshots.every(snapshot => snapshot.participants.length === 0)).toBe(true);
      expect(reader.frames.filter(frame => frame.includes("event: typing")).every(frame => !frame.includes("id:") && !frame.includes("cursor"))).toBe(true);
      expect(reader.frames.filter(frame => frame.includes("event: chat"))).toEqual(initialChat);
      const stopped = Date.now();
      await api(writer, "designer-a", "/projects/a/chat/typing", input(3, false));
      await until(() => reader.snapshots.at(-1)?.participants.length === 0 ? true : undefined);
      expect(Date.now() - stopped).toBeLessThan(2_000);
      expect((await api(writer, "designer-a", "/projects/a/chat/typing", input(2))).typing).toBe(false);
      expect(await ProjectChatEventModel.countDocuments()).toBe(0);
      expect(await ProjectChatMessageModel.countDocuments()).toBe(0);
      expect(await ProjectChatReadStateModel.countDocuments()).toBe(0);
      expect(await AuditEventModel.countDocuments()).toBe(0);
    } finally { reader.close(); unrelated.close(); await stop(writer.child); await stop(readerServer.child); }
  }, 30_000);

  it("expires lost stops and removes revoked typists and revoked viewers in watch-disabled operation", async () => {
    await insertChatMongoFixture();
    const readerServer = await start("poll"); const writer = await start("poll");
    const reader = await open(readerServer, "client-a");
    try {
      await api(writer, "designer-a", "/projects/a/chat/typing", input(1));
      await until(() => reader.snapshots.at(-1)?.participants.length ? true : undefined);
      await until(() => reader.snapshots.at(-1)?.participants.length === 0 ? true : undefined, 10_000);
      expect(await ProjectChatTypingModel.countDocuments()).toBe(1);
      const selected = await api(writer, "admin-a", "/projects/a/chat/participants", { userId: "site-a", reason: "Synthetic assignment", idempotencyKey: "typing-site-selection" }, "POST");
      const selection = selected.items.find((person: any) => person.id === "site-a").selection;
      await api(writer, "site-a", "/projects/a/chat/typing", input(1));
      await until(() => reader.snapshots.at(-1)?.participants.find(person => person.userId === "site-a"));
      await api(writer, "admin-a", `/projects/a/chat/participants/${selection.id}/revoke`, { expectedVersion: selection.version, reason: "Synthetic reassignment", idempotencyKey: "typing-site-revocation" }, "POST");
      await until(() => reader.snapshots.at(-1)?.participants.length === 0 ? true : undefined);
      await api(writer, "designer-a", "/projects/a/chat/typing", input(2));
      await until(() => reader.snapshots.at(-1)?.participants.find(person => person.userId === "designer-a"));
      await createMongoRepository().runInTransaction(async tx => {
        await tx.coordinateAuthorizationMutation();
        for (const id of ["designer-a", "client-a"]) {
          const user = await tx.findUserById(id);
          await tx.updateUserCredentials(id, user!.version, user!.sessionVersion, { passwordHash: "synthetic-session-reset", updatedAt: new Date().toISOString() });
        }
      });
      await until(() => reader.states.includes("denied") ? true : undefined); await reader.read;
    } finally { reader.close(); await stop(writer.child); await stop(readerServer.child); }
  }, 40_000);
});
