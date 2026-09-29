import {describe, expect, it} from "vitest";
import {assertChatWritable, chatAvailability, indiaDigestDue} from "../src/domain/chat-hours.js";
import {createDailyCriticalTasksService} from "../src/services/daily-critical-tasks.service.js";
import {chatSend, createChatFixture} from "./helpers/project-chat.js";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import {createAuthService} from "../src/services/auth.service.js";
import {createDailyCriticalTasksRouter} from "../src/routes/daily-critical-tasks.js";
import {errorHandler} from "../src/middleware/errors.js";

const india = (date: string, time: string) => new Date(`${date}T${time}+05:30`);

describe("India-time internal chat schedule", () => {
  it("changes at the exact close and open boundaries while leaving Client chat writable", () => {
    for (const [time, writable] of [["19:59:59", true], ["20:00:00", false], ["07:29:59", false], ["07:30:00", true]] as const) {
      const at = india("2026-09-16", time);
      expect(chatAvailability("procurement", at).writable).toBe(writable);
      expect(chatAvailability("client", at).writable).toBe(true);
    }
    expect(chatAvailability("procurement", india("2026-09-16", "20:00:00")).nextOpenAt).toBe("2026-09-17T02:00:00.000Z");
    expect(() => assertChatWritable("procurement", india("2026-09-16", "20:00:00")))
      .toThrowError(expect.objectContaining({code: "CHAT_CLOSED", fields: {nextOpenAt: "2026-09-17T02:00:00.000Z"}}));
    expect(indiaDigestDue(india("2026-09-16", "16:59:59"))).toBe(false);
    expect(indiaDigestDue(india("2026-09-16", "17:00:00"))).toBe(true);
  });

  it("rejects internal writes overnight but permits reading, read receipts, and Client sends", async () => {
    const f = createChatFixture();
    f.advance(4 * 60 * 60_000 + 29 * 60_000);
    await f.service.send(f.actor("electric-a"), "a", chatSend("Before close"));
    f.advance(60_000);
    await expect(f.service.send(f.actor("electric-a"), "a", chatSend("After close"))).rejects.toMatchObject({code: "CHAT_CLOSED"});
    expect((await f.service.messages(f.actor("electric-a"), "a", {})).items).toHaveLength(1);
    const own = (await f.service.messages(f.actor("electric-a"), "a", {})).items[0]!;
    await expect(f.service.read(f.actor("electric-a"), "a", {messageId: own.id, sequence: own.sequence})).resolves.toMatchObject({lastReadSequence: own.sequence});
    await expect(f.service.send(f.actor("client-a"), "a", chatSend("Client overnight"))).resolves.toMatchObject({author: {id: "client-a"}});
    f.advance(11 * 60 * 60_000 + 29 * 60_000);
    await expect(f.service.send(f.actor("electric-a"), "a", chatSend("Still closed"))).rejects.toMatchObject({code: "CHAT_CLOSED"});
    f.advance(60_000);
    await expect(f.service.send(f.actor("electric-a"), "a", chatSend("Open again"))).resolves.toMatchObject({author: {id: "electric-a"}});
  });
});

describe("daily critical tasks", () => {
  it("backfills the first missed 17:00 delivery after a scheduler outage and restart", async () => {
    const f = createChatFixture();
    const firstProcess = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    await firstProcess.tick(); // bootstraps the persisted schedule before the first 17:00
    expect(await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-16"))).toEqual([]);
    f.advance(24 * 60 * 60_000); // next day, still before 17:00 India time
    const restarted = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    await restarted.tick(); // an offline recipient is caught up without opening the app
    expect((await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-17"))).map(row => row.localDate))
      .toEqual(["2026-09-16"]);
    expect(await restarted.get(f.actor("electric-a"))).toMatchObject({localDate: "2026-09-16", acknowledgedAt: null});
    f.advance(90 * 60_000);
    expect(await restarted.get(f.actor("electric-a"))).toMatchObject({localDate: "2026-09-16", acknowledgedAt: null});
    await restarted.acknowledge(f.actor("electric-a"), "2026-09-16");
    expect(await restarted.get(f.actor("electric-a"))).toMatchObject({localDate: "2026-09-17", acknowledgedAt: null});
  });

  it("delivers only assigned authorized open work at 17:00 and persists an idempotent acknowledgment", async () => {
    const f = createChatFixture();
    f.workflowTasks[0]!.title = "Complete electrical fit-out";
    f.workflowTasks[0]!.status = "open";
    f.workflowTasks[0]!.openedAt = "2026-09-01T00:00:00.000Z";
    f.workflowTasks[0]!.dueAt = "2026-09-15T00:00:00.000Z";
    f.workflowTasks.push({...f.workflowTasks[0]!, id: "foreign-task", projectId: "b", title: "Private B work"});
    await f.service.send(f.actor("client-a"), "a", chatSend("Fix ceiling wiring", {
      priority: "critical", responsibleUserId: "electric-a", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    await f.service.send(f.actor("client-b"), "b", chatSend("Other project critical", {
      priority: "critical", responsibleUserId: "client-b", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock, audit: f.audit});
    expect(await digest.get(f.actor("electric-a"))).toBeNull();
    f.advance(90 * 60_000);
    const result = await digest.get(f.actor("electric-a"));
    expect(result).toMatchObject({localDate: "2026-09-16", acknowledgedAt: null});
    expect(result!.items.map(item => item.kind)).toEqual(["workflow_task", "chat_action"]);
    expect(JSON.stringify(result)).not.toContain("Private B work");
    expect(await digest.signal(f.actor("electric-a"))).toBe("2026-09-16");
    const first = await digest.acknowledge(f.actor("electric-a"), "2026-09-16");
    const replay = await digest.acknowledge(f.actor("electric-a"), "2026-09-16");
    expect(replay).toEqual(first);
    expect((await digest.get(f.actor("electric-a")))?.acknowledgedAt).toBe(first.acknowledgedAt);
    expect(await digest.signal(f.actor("electric-a"))).toBeNull();
    const audits = (await f.repository.pageAuditEvents({entityId: "electric-a:2026-09-16"}, {limit: 10, offset: 0})).items;
    expect(audits.map(row => row.action).sort()).toEqual(["project_chat.daily_critical_acknowledged", "project_chat.daily_critical_delivered"]);
    await expect(digest.get(f.actor("client-a"))).rejects.toMatchObject({status: 403});
  });

  it("serves protected availability, a due list, and one acknowledgment over the REST contract", async () => {
    const f = createChatFixture();
    const service = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    const secret = "daily-critical-task-route-secret-long-enough";
    const auth = createAuthService(f.repository, {jwtSecret: secret, jwtExpiresInSeconds: 3600}, {clock: f.clock});
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createDailyCriticalTasksRouter(auth, service));
    app.use(errorHandler);
    const token = (id: string) => {
      const actor = f.actor(id), issuedAt = Math.floor(Date.now() / 1000);
      return jwt.sign({id, role: actor.role, sessionVersion: 1, iat: issuedAt,
        exp: Math.max(issuedAt, Math.floor(f.clock().getTime() / 1000)) + 3600}, secret);
    };
    expect((await request(app).get("/api/v1/chat/availability")).status).toBe(401);
    const worker = token("electric-a");
    expect((await request(app).get("/api/v1/chat/availability").auth(worker, {type: "bearer"})).body.data)
      .toMatchObject({timezone: "Asia/Kolkata", writable: true, nextOpenAt: null});
    expect((await request(app).get("/api/v1/daily-critical-tasks").auth(worker, {type: "bearer"})).body.data).toBeNull();
    f.advance(90 * 60_000);
    const due = await request(app).get("/api/v1/daily-critical-tasks").auth(worker, {type: "bearer"});
    expect(due.status).toBe(200);
    expect(due.body.data).toMatchObject({localDate: "2026-09-16", acknowledgedAt: null, items: []});
    const ack = await request(app).put("/api/v1/daily-critical-tasks/2026-09-16/acknowledgment").auth(worker, {type: "bearer"});
    expect(ack.status).toBe(200);
    expect(ack.body.data).toMatchObject({localDate: "2026-09-16"});
    expect((await request(app).get("/api/v1/daily-critical-tasks").auth(worker, {type: "bearer"})).body.data.acknowledgedAt)
      .toBe(ack.body.data.acknowledgedAt);
    expect((await request(app).get("/api/v1/daily-critical-tasks").auth(token("client-a"), {type: "bearer"})).status).toBe(403);
  });
});
