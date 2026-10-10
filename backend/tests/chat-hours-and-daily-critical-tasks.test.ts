import {describe, expect, it, vi} from "vitest";
import {assertChatWritable, chatAvailability, indiaDigestDue} from "../src/domain/chat-hours.js";
import {createDailyCriticalTasksService} from "../src/services/daily-critical-tasks.service.js";
import {chatLead, chatSend, createChatFixture} from "./helpers/project-chat.js";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import {createAuthService} from "../src/services/auth.service.js";
import {createDailyCriticalTasksRouter} from "../src/routes/daily-critical-tasks.js";
import {errorHandler} from "../src/middleware/errors.js";
import type {ProjectChatRepository} from "../src/repositories/project-chat.js";
import {projectWorkflowBlueprints} from "../src/domain/project-workflow.js";

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

describe("current critical task review", () => {
  const overdueWork = (f: ReturnType<typeof createChatFixture>) => {
    Object.assign(f.workflowTasks[0]!, {title: "Complete electrical fit-out", status: "open",
      openedAt: "2026-09-01T00:00:00.000Z", dueAt: "2026-09-15T00:00:00.000Z"});
  };

  it("returns current work before 5 PM without starting or creating scheduled delivery history", async () => {
    const f = createChatFixture();
    overdueWork(f);
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock, audit: f.audit});
    expect(indiaDigestDue(f.clock())).toBe(false);
    const result = await digest.current(f.actor("electric-a"));
    expect(result).toEqual({timezone: "Asia/Kolkata", checkedAt: f.clock().toISOString(), receipt: null,
      items: [{kind: "workflow_task", id: "trade-electric", projectId: "a", projectName: "Project a",
        title: "Complete electrical fit-out", dueAt: "2026-09-15T00:00:00.000Z", status: "open"}]});
    f.advance(2 * 24 * 60 * 60_000);
    await digest.current(f.actor("electric-a"));
    expect(await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-18"))).toEqual([]);
    expect((await f.repository.pageAuditEvents({}, {limit: 10, offset: 0})).items).toEqual([]);
    // A read must not initialize the schedule and cause a later scheduler to backfill those days.
    await digest.tick();
    expect(await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-18"))).toEqual([]);
  });

  it("returns an empty successful review even when an unacknowledged empty receipt exists", async () => {
    const f = createChatFixture();
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    expect(await digest.current(f.actor("electric-a"))).toEqual({timezone: "Asia/Kolkata",
      checkedAt: f.clock().toISOString(), items: [], receipt: null});
    f.advance(90 * 60_000);
    await digest.get(f.actor("electric-a"));
    expect(await digest.current(f.actor("electric-a"))).toEqual({timezone: "Asia/Kolkata",
      checkedAt: f.clock().toISOString(), items: [], receipt: {localDate: "2026-09-16", acknowledgedAt: null}});
  });

  it("references the latest existing due receipt even when it is acknowledged and older receipts are pending", async () => {
    const f = createChatFixture();
    overdueWork(f);
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    await digest.tick();
    f.advance(2 * 24 * 60 * 60_000 + 90 * 60_000);
    await digest.tick();
    expect((await digest.current(f.actor("electric-a"))).receipt).toEqual({localDate: "2026-09-18", acknowledgedAt: null});
    const ack = await digest.acknowledge(f.actor("electric-a"), "2026-09-18");
    const before = await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-18"));
    expect(before.map(row => row.acknowledgedAt)).toEqual([null, null, ack.acknowledgedAt]);
    const review = await digest.current(f.actor("electric-a"));
    expect(review.receipt).toEqual(ack);
    expect(review.items).toHaveLength(1);
    expect(await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-09-18"))).toEqual(before);
    expect((await digest.get(f.actor("electric-a")))?.localDate).toBe("2026-09-16");
  });

  it("ignores a not-yet-due or future receipt and includes today's receipt at the exact scheduled boundary", async () => {
    const f = createChatFixture();
    await f.chatRepository.mutate(async tx => {
      for (const date of ["2026-09-15", "2026-09-16", "2026-09-17"])
        await tx.ensureDigestReceipt("electric-a", date, f.clock().toISOString());
    });
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    expect((await digest.current(f.actor("electric-a"))).receipt?.localDate).toBe("2026-09-15");
    f.advance(90 * 60_000 - 1);
    expect((await digest.current(f.actor("electric-a"))).receipt?.localDate).toBe("2026-09-15");
    f.advance(1);
    expect((await digest.current(f.actor("electric-a"))).receipt?.localDate).toBe("2026-09-16");
  });

  it("isolates two unequal projects and their responsible users, then removes work when project access is lost", async () => {
    const f = createChatFixture();
    overdueWork(f);
    await f.repository.createLead(chatLead("lead-b", "b"));
    const estimateB = {...structuredClone(f.estimates[0]!), id: "estimate-b", projectId: "b", leadId: "lead-b"};
    f.estimates.push(estimateB);
    const blueprintB = projectWorkflowBlueprints({estimateId: estimateB.id, estimateVersion: estimateB.version - 1,
      lineItems: estimateB.lineItems}).find(row => row.kind === "trade_execution")!;
    f.workflowTasks.push({...f.workflowTasks[0]!, id: "trade-b", projectId: "b", estimateId: "estimate-b",
      sourceSectionId: blueprintB.sourceSectionId, sourceLineItemKey: blueprintB.sourceLineItemKey,
      assigneeUserId: "electric-b", title: "Private B electrical work"});
    const ownA = await f.service.send(f.actor("client-a"), "a", chatSend("Fix A wiring", {
      priority: "critical", responsibleUserId: "electric-a", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    await f.service.send(f.actor("client-a"), "a", chatSend("Designer action in the same project", {
      priority: "critical", responsibleUserId: "designer-a", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    for (const title of ["Fix B wiring", "Check B fittings"]) await f.service.send(f.actor("client-b"), "b", chatSend(title, {
      priority: "critical", responsibleUserId: "electric-b", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    const a = await digest.current(f.actor("electric-a")), b = await digest.current(f.actor("electric-b"));
    expect(a.items.map(item => item.id)).toEqual(["trade-electric", ownA.id]);
    expect(b.items).toHaveLength(3);
    expect(a.items.every(item => item.projectId === "a")).toBe(true);
    expect(b.items.every(item => item.projectId === "b")).toBe(true);
    f.estimates[0]!.lineItems[0]!.included = false;
    expect((await digest.current(f.actor("electric-a"))).items).toEqual([]);
    expect((await digest.current(f.actor("electric-b"))).items).toHaveLength(3);
  });

  it("uses read operations only and leaves receipts, messages, notifications, events, tasks and audits unchanged", async () => {
    const f = createChatFixture();
    overdueWork(f);
    await f.service.send(f.actor("client-a"), "a", chatSend("Review electrical fittings", {
      priority: "critical", responsibleUserId: "electric-a", action: {typeId: "escalation", dueDate: "2026-09-17"}
    }));
    const readState = async () => ({
      chat: await f.chatRepository.snapshot(async tx => ({
        receipts: await tx.digestReceipts("electric-a", "2026-12-31"),
        state: await tx.state("a"), messages: await tx.messages({projectId: "a", userId: "electric-a", limit: 100, ascending: false}),
        events: await tx.events("a", 0, 100, 100), notifications: await tx.notificationPage("electric-a", ["a"], 100, 0)
      })),
      tasks: structuredClone(f.workflowTasks),
      audits: await f.repository.pageAuditEvents({}, {limit: 100, offset: 0})
    });
    const before = await readState();
    const snapshot = vi.fn<ProjectChatRepository["snapshot"]>(operation => f.chatRepository.snapshot(tx => operation(new Proxy(tx, {
      get(target, key) {
        if (!["app", "candidateProjectIds", "sources", "selections", "state", "messages", "digestReceipts"].includes(String(key)))
          throw new Error(`Current review attempted a non-read operation: ${String(key)}`);
        if (key === "app") return new Proxy(target.app, {get(app, appKey) {
          if (!["findUserById", "countActiveUsersByRole"].includes(String(appKey)))
            throw new Error(`Current review attempted an app write: ${String(appKey)}`);
          return Reflect.get(app, appKey);
        }});
        return Reflect.get(target, key);
      }
    }))));
    const mutate = vi.fn<ProjectChatRepository["mutate"]>(async () => {throw new Error("Current review must not mutate");});
    const audit = {append: vi.fn(), appendInMongoTransaction: vi.fn()};
    const digest = createDailyCriticalTasksService({chatRepository: {...f.chatRepository, snapshot, mutate}, clock: f.clock, audit});
    expect((await digest.current(f.actor("electric-a"))).items).toHaveLength(2);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
    expect(audit.appendInMongoTransaction).not.toHaveBeenCalled();
    expect(await readState()).toEqual(before);
  });

  it("excludes completed, unopened and not-yet-overdue tasks from current work", async () => {
    const f = createChatFixture();
    overdueWork(f);
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    f.workflowTasks[0]!.status = "completed";
    expect((await digest.current(f.actor("electric-a"))).items).toEqual([]);
    f.workflowTasks[0]!.status = "open";
    f.workflowTasks[0]!.openedAt = null;
    expect((await digest.current(f.actor("electric-a"))).items).toEqual([]);
    f.workflowTasks[0]!.openedAt = "2026-09-01T00:00:00.000Z";
    f.workflowTasks[0]!.dueAt = f.clock().toISOString();
    expect((await digest.current(f.actor("electric-a"))).items).toEqual([]);
    f.advance(1);
    expect((await digest.current(f.actor("electric-a"))).items).toHaveLength(1);
  });

  it("denies Clients, expired identities, role mismatches, stale sessions and inactive users", async () => {
    const f = createChatFixture();
    const digest = createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock});
    const actor = f.actor("electric-a");
    await expect(digest.current(f.actor("client-a"))).rejects.toMatchObject({status: 403});
    await expect(digest.current({...actor, expiresAt: Math.floor(f.clock().getTime() / 1000)})).rejects.toMatchObject({status: 401, code: "TOKEN_EXPIRED"});
    await expect(digest.current({...actor, role: "designer"})).rejects.toMatchObject({status: 401, code: "INVALID_TOKEN"});
    const user = (await f.repository.findUserById(actor.id))!;
    await f.repository.updateUserCredentials(user.id, user.version, user.sessionVersion, {passwordHash: "changed-test-hash", updatedAt: f.clock().toISOString()});
    await expect(digest.current(actor)).rejects.toMatchObject({status: 401, code: "INVALID_TOKEN"});
    const active = (await f.repository.findUserById(actor.id))!;
    await f.repository.updateUser(active.id, active.version, {active: false, updatedAt: f.clock().toISOString()});
    await expect(digest.current({...actor, sessionVersion: active.sessionVersion})).rejects.toMatchObject({status: 401, code: "INVALID_TOKEN"});
  });

  it("serves a private no-store authenticated current read and preserves role and expiry checks", async () => {
    const f = createChatFixture();
    overdueWork(f);
    const secret = "current-critical-task-route-secret-long-enough";
    const auth = createAuthService(f.repository, {jwtSecret: secret, jwtExpiresInSeconds: 3600}, {clock: f.clock});
    const app = express();
    app.use("/api/v1", createDailyCriticalTasksRouter(auth, createDailyCriticalTasksService({chatRepository: f.chatRepository, clock: f.clock})));
    app.use(errorHandler);
    const token = (id: string, expired = false) => {
      const actor = f.actor(id), issuedAt = Math.floor(Date.now() / 1000);
      return jwt.sign({id, role: actor.role, sessionVersion: 1, iat: issuedAt,
        exp: expired ? 1 : Math.max(issuedAt, Math.floor(f.clock().getTime() / 1000)) + 3600}, secret);
    };
    const path = "/api/v1/daily-critical-tasks/current";
    expect((await request(app).get(path)).status).toBe(401);
    const response = await request(app).get(path).auth(token("electric-a"), {type: "bearer"});
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toMatchObject({timezone: "Asia/Kolkata", checkedAt: f.clock().toISOString(), receipt: null, items: [{id: "trade-electric"}]});
    expect((await request(app).get(path).auth(token("client-a"), {type: "bearer"})).status).toBe(403);
    expect((await request(app).get(path).auth(token("electric-a", true), {type: "bearer"})).status).toBe(401);
    expect(await f.chatRepository.snapshot(tx => tx.digestReceipts("electric-a", "2026-12-31"))).toEqual([]);
  });
});
