import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChatEventBatch } from "../src/contracts/project-chat.js";
import { ProjectChatMessageModel } from "../src/models/ProjectChat.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";

const children = new Set<ChildProcess>();
const streams = new Set<AbortController>();
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const secret = "chat-process-fixture-secret-at-least-32-characters";
const roles = { "client-a": "client", "designer-a": "designer", "admin-a": "admin", "site-a": "site_manager" } as const;
function token(id: keyof typeof roles, sessionVersion = 1) {
  return jwt.sign({ id, role: roles[id], sessionVersion, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Math.max(Date.now(), Date.parse("2026-09-16T10:00:00.000Z")) / 1000) + 3600 }, secret);
}
async function until<T>(read: () => T | undefined, timeout = 5000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for transport fixture");
}
async function start(mode = "watch") {
  const child = fork(fileURLToPath(new URL("./helpers/project-chat-process.ts", import.meta.url)), [replica.uri, mode], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  children.add(child);
  let port: number | undefined;
  const committed: string[] = [];
  let stderr = "";
  child.stderr?.on("data", (data) => { stderr += String(data); });
  child.on("message", (data: any) => { if (data.port) port = data.port; if (data.committed) committed.push(data.committed); });
  await until(() => {
    if (child.exitCode !== null) throw new Error(`Fixture process exited: ${stderr}`);
    return port;
  }, 15000);
  return { child, committed, url: `http://127.0.0.1:${port}/api/v1` };
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) { children.delete(child); return; }
  const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill(signal);
  await exit;
  children.delete(child);
}
async function api(server: { url: string }, id: keyof typeof roles, path: string, body?: unknown, method = "POST") {
  const response = await fetch(server.url + path, {
    method: body === undefined ? "GET" : method,
    headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result.data;
}
async function open(server: { url: string }, id: keyof typeof roles, cursor?: string) {
  const abort = new AbortController(); streams.add(abort);
  const response = await fetch(server.url + "/projects/a/chat/events" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), {
    headers: { Authorization: `Bearer ${token(id)}` }, signal: abort.signal
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const batches: ChatEventBatch[] = [];
  const states: string[] = [];
  const reader = response.body!.getReader();
  const read = (async () => {
    const decoder = new TextDecoder(); let pending = "";
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          if (frame.includes("event: chat")) batches.push(JSON.parse(data));
          if (frame.includes("event: state")) states.push(JSON.parse(data).status);
        }
      }
    } catch { /* Socket exit/abort are the intended recovery boundary. */ }
  })();
  await until(() => batches[0]);
  return { batches, states, read, close() { abort.abort(); streams.delete(abort); }, events: () => batches.flatMap((batch) => batch.events) };
}

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-chat-process-test");
  await Promise.all(chatModels.map((model) => model.init()));
}, 120000);
beforeEach(async () => { await replica.clear(); await insertChatMongoFixture(); });
afterAll(async () => {
  for (const abort of streams) abort.abort();
  await Promise.all([...children].map((child) => stop(child)));
  await replica?.stop();
}, 15000);

describe("durable live chat across real Node processes", () => {
  it("delivers within two seconds, recovers a committed crash, and replays after restart without duplicating sends", async () => {
    const readerServer = await start();
    const writer = await start("crash");
    const summary = await api(readerServer, "client-a", "/projects/a/chat");
    const reader = await open(readerServer, "client-a", summary.cursor);
    const startAt = Date.now();
    const message = await api(writer, "designer-a", "/projects/a/chat/messages", { body: "Live across processes", mentions: [], priority: "critical", clientMessageId: "across-processes-first" });
    await until(() => reader.events().find((event) => event.recordId === message.id));
    expect(Date.now() - startAt).toBeLessThan(2000);
    expect((await api(readerServer, "client-a", "/projects/a/chat")).counts.openCritical).toBe(1);

    // Kill the writer after its durable commit and before its HTTP response.
    const crashInput = { body: "Committed before process exit", mentions: [], priority: "normal", clientMessageId: "committed-crash-retry" };
    const lostResponse = api(writer, "designer-a", "/projects/a/chat/messages", crashInput).catch(() => undefined);
    const committedId = await until(() => writer.committed[0]);
    await stop(writer.child, "SIGKILL"); await lostResponse;
    await until(() => reader.events().find((event) => event.recordId === committedId));
    reader.close();

    const restarted = await start("poll");
    expect((await api(restarted, "designer-a", "/projects/a/chat/messages", crashInput)).id).toBe(committedId);
    // Same semantic retry with changed text proves the stored result wins only for identical payloads.
    const retryResponse = await fetch(restarted.url + "/projects/a/chat/messages", { method: "POST", headers: { Authorization: `Bearer ${token("designer-a")}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...crashInput, body: "Different payload" }) });
    expect(retryResponse.status).toBe(409);
    expect(await ProjectChatMessageModel.countDocuments({ projectId: "a" })).toBe(2);
    const replay = await open(restarted, "client-a", summary.cursor);
    await until(() => replay.events().find((event) => event.recordId === committedId));
    const messageIds = replay.events().filter((event) => event.type === "message.created").map((event) => event.recordId);
    expect(messageIds).toEqual([message.id, committedId]);
    replay.close();
    await stop(restarted.child); await stop(readerServer.child);
  }, 45000);

  it("polls without change streams, hides another user's read event, and ends revoked/reset sessions", async () => {
    const server = await start("poll");
    const client = await open(server, "client-a");
    const message = await api(server, "designer-a", "/projects/a/chat/messages", { body: "Polling fallback", mentions: [], priority: "normal", clientMessageId: "polling-fallback-message" });
    await until(() => client.events().find((event) => event.recordId === message.id));
    const priorCursor = client.batches.at(-1)!.cursor;
    await api(server, "designer-a", "/projects/a/chat/read", { messageId: message.id, sequence: message.sequence }, "PUT");
    await until(() => client.batches.find((batch) => batch.cursor !== priorCursor && batch.events.length === 0));
    expect(client.events().some((event) => event.type === "read.changed")).toBe(false);

    const participants = await api(server, "admin-a", "/projects/a/chat/participants", { userId: "site-a", reason: "Coordinate this site", idempotencyKey: "select-site-for-stream" });
    const selection = participants.items.find((person: any) => person.id === "site-a").selection;
    const site = await open(server, "site-a");
    await api(server, "admin-a", `/projects/a/chat/participants/${selection.id}/revoke`, { expectedVersion: selection.version, reason: "Site reassigned", idempotencyKey: "revoke-site-for-stream" });
    await until(() => site.states.includes("denied") ? true : undefined);
    await site.read;
    expect(site.events().filter((event) => event.type === "participants.changed")).toHaveLength(0);

    await createMongoRepository().runInTransaction(async (transaction) => {
      await transaction.coordinateAuthorizationMutation();
      // The real session source uses the same transaction fence as password reset.
      const user = await transaction.findUserById("client-a");
      await transaction.updateUserCredentials(user!.id, user!.version, user!.sessionVersion, { passwordHash: "replacement-test-hash", updatedAt: new Date().toISOString() });
    });
    await until(() => client.states.includes("denied") ? true : undefined);
    await client.read;
    client.close(); site.close();
    await stop(server.child);
  }, 30000);
});
