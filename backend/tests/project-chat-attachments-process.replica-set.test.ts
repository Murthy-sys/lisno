import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEventBatch } from "../src/contracts/project-chat.js";
import { ProjectChatMessageModel } from "../src/models/ProjectChat.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";

const children = new Set<ChildProcess>();
const streams = new Set<AbortController>();
const roles = {"client-a": "client", "client-b": "client", "electric-a": "worker_electrician", super: "super_admin"} as const;
const secret = "chat-process-fixture-secret-at-least-32-characters";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let storageRoot: string;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function token(id: keyof typeof roles) {
  return jwt.sign({id, role: roles[id], sessionVersion: 1, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Math.max(Date.now(), Date.parse("2026-09-16T10:00:00.000Z")) / 1000) + 3600}, secret);
}
async function until<T>(read: () => T | undefined, timeout = 5000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {const value = read(); if (value !== undefined) return value; await new Promise(resolve => setTimeout(resolve, 10));}
  throw new Error("Timed out waiting for attachment process fixture");
}
async function start(mode: "watch" | "poll") {
  const child = fork(fileURLToPath(new URL("./helpers/project-chat-process.ts", import.meta.url)), [replica.uri, mode, storageRoot], {execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"]});
  children.add(child);
  let port: number | undefined, stderr = "";
  child.stderr?.on("data", data => {stderr += String(data);});
  child.on("message", (message: unknown) => {if (message && typeof message === "object" && "port" in message) port = Number(message.port);});
  await until(() => {if (child.exitCode !== null) throw new Error(`Attachment fixture exited: ${stderr}`); return port;}, 15000);
  return {url: `http://127.0.0.1:${port}/api/v1`, child};
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {children.delete(child); return;}
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGTERM"); await exited; children.delete(child);
}
async function request(server: {url: string}, id: keyof typeof roles, route: string, init: RequestInit = {}) {
  return fetch(server.url + route, {...init, headers: {...init.headers, Authorization: `Bearer ${token(id)}`}});
}
async function upload(server: {url: string}, key: string, bytes: Buffer, filename: string, mime: string) {
  const form = new FormData(); form.set("file", new Blob([new Uint8Array(bytes)], {type: mime}), filename);
  const result = await request(server, "client-a", `/projects/a/chat/attachments?uploadId=${key}&sizeBytes=${bytes.length}`, {method: "POST", body: form});
  expect(result.status).toBe(201); return (await result.json()).data;
}
async function openEvents(server: {url: string}) {
  const abort = new AbortController(); streams.add(abort);
  const result = await request(server, "electric-a", "/projects/a/chat/events", {signal: abort.signal});
  expect(result.status).toBe(200);
  const batches: ChatEventBatch[] = [], reader = result.body!.getReader();
  const read = (async () => {
    const decoder = new TextDecoder(); let pending = "";
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break; pending += decoder.decode(chunk.value, {stream: true});
        let end: number;
        while ((end = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          const data = frame.split("\n").find(line => line.startsWith("data: "))?.slice(6);
          if (data && frame.includes("event: chat")) batches.push(JSON.parse(data));
        }
      }
    } catch { /* Disconnection is expected during fixture teardown. */ }
  })();
  await until(() => batches[0]);
  return {batches, read, events: () => batches.flatMap(batch => batch.events), close() {abort.abort(); streams.delete(abort);}};
}
beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "lisno-chat-attachment-process-"));
  replica = await startMongoReplicaSet("chat-attachment-process-test");
  await Promise.all(chatModels.map(model => model.init())); await insertChatMongoFixture();
}, 120000);
afterAll(async () => {
  for (const stream of streams) stream.abort();
  await Promise.all([...children].map(stop)); await replica?.stop();
  if (storageRoot) await rm(storageRoot, {recursive: true, force: true});
}, 15000);

describe("chat attachments across real API processes and shared private storage", () => {
  it("stages on A, atomically sends on B, downloads verified bytes on both, and invalidates the open stream without refresh", async () => {
    const a = await start("watch"), b = await start("poll"), live = await openEvents(a);
    const text = Buffer.from("Synthetic project update 👷🏽‍♀️\nShared across API processes.");
    const image = await sharp({create: {width: 8, height: 6, channels: 3, background: "#2b7564"}}).png().toBuffer();
    const note = await upload(a, "real-process-text-upload", text, "site-note.txt", "text/plain");
    const photo = await upload(a, "real-process-image-upload", image, "site-photo.png", "image/png");
    expect(photo.attachment.preview).toMatchObject({mimeType: "image/webp", width: 8, height: 6});
    expect(live.events()).toEqual([]);
    const contentPath = `/projects/a/chat/attachments/${note.attachment.id}/content`;
    expect((await request(b, "client-a", contentPath)).status).toBe(200);
    for (const id of ["electric-a", "super", "client-b"] as const) expect((await request(b, id, contentPath)).status).toBe(404);
    expect((await request(b, "client-b", `/projects/b/chat/attachments/${note.attachment.id}/content`)).status).toBe(404);
    const input = {body: "", priority: "critical", clientMessageId: "real-process-attachment-send", attachmentIds: [note.attachment.id, photo.attachment.id]};
    const started = Date.now();
    const sent = await request(b, "client-a", "/projects/a/chat/messages", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
    expect(sent.status).toBe(201); const message = (await sent.json()).data;
    await until(() => live.events().find(event => event.recordId === message.id));
    expect(Date.now() - started).toBeLessThan(2000);
    for (const server of [a, b]) {
      for (const [attachment, bytes] of [[note.attachment, text], [photo.attachment, image]] as const) {
        const content = await request(server, "electric-a", `/projects/a/chat/attachments/${attachment.id}/content`);
        expect(content.status).toBe(200); expect(hash(new Uint8Array(await content.arrayBuffer()))).toBe(hash(bytes));
        expect(content.headers.get("cache-control")).toBe("private, no-store"); expect(content.headers.get("x-content-type-options")).toBe("nosniff");
      }
      const preview = await request(server, "electric-a", `/projects/a/chat/attachments/${photo.attachment.id}/preview`);
      expect(preview.status).toBe(200); expect(preview.headers.get("content-type")).toContain("image/webp");
      expect((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width).toBe(8);
      const history = await request(server, "electric-a", "/projects/a/chat/messages");
      expect((await history.json()).data.items[0]).toMatchObject({id: message.id, body: "", attachments: [note.attachment, photo.attachment]});
    }
    const replay = await request(a, "client-a", "/projects/a/chat/messages", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
    expect((await replay.json()).data.id).toBe(message.id);
    expect(await ProjectChatMessageModel.countDocuments({projectId: "a"})).toBe(1);
    expect(live.events().filter(event => event.type === "message.created")).toHaveLength(1);
    expect((await request(a, "client-b", `/projects/b/chat/attachments/${note.attachment.id}/content`)).status).toBe(404);
    live.close(); await live.read; await stop(a.child); await stop(b.child);
  }, 45000);
});
