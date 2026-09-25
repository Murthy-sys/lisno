import { ProjectModel } from "../src/models/Project.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { insertChatMongoFixture, chatModels } from "./helpers/project-chat-mongo.js";
import { chatSend, chatProject } from "./helpers/project-chat.js";
import { ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel, ProjectChatParticipantAssignmentModel } from "../src/models/ProjectChat.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { chatCursor, parseChatCursor } from "../src/domain/project-chat.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("chat-repository"); for (const model of chatModels)
    await model.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());
describe("project chat Mongo transactions", () => {
    it("atomically deduplicates concurrent first sends across independent adapters and survives restart", async () => {
        const f = await insertChatMongoFixture();
        const second = createProjectChatService({ repository: f.repository, audit: f.audit, chatRepository: createMongoProjectChatRepository(), clock: f.clock });
        const actor = f.actor("client-a"), input = chatSend("Concurrent", { priority: "critical", clientMessageId: "simultaneous-first" });
        const sends = await Promise.all(Array.from({ length: 6 }, (_, index) => (index % 2 ? second : f.service).send(actor, "a", input)));
        expect(new Set(sends.map((row) => row.id)).size).toBe(1);
        expect(await ProjectChatMessageModel.countDocuments()).toBe(1);
        expect(await ProjectChatEventModel.countDocuments()).toBe(1);
        expect(await ProjectChatOperationModel.countDocuments()).toBe(1);
        expect(await ProjectChatIssueHistoryModel.countDocuments()).toBe(1);
        expect(await AuditEventModel.countDocuments()).toBe(1);
        expect((await second.summary(actor, "a")).counts.openCritical).toBe(1);
        const events = await second.events(actor, "a", chatCursor("a", 0));
        expect(events.events[0]).toMatchObject({ type: "message.created", recordId: sends[0]!.id, sequence: 1 });
    }, 30000);
    it("rolls back message, sequence, history, operation, event and audit if transactional audit fails", async () => {
        const f = await insertChatMongoFixture();
        const service = createProjectChatService({ repository: f.repository, chatRepository: f.chatRepository, clock: f.clock, audit: { ...f.audit, async appendInMongoTransaction(input, session) { await f.audit.appendInMongoTransaction(input, session); throw new Error("injected audit failure"); } } });
        const input = chatSend("Will rollback", { priority: "critical" });
        await expect(service.send(f.actor("client-a"), "a", input)).rejects.toThrow("injected audit failure");
        for (const model of [ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel, AuditEventModel])
            expect(await model.countDocuments()).toBe(0);
        expect((await f.service.send(f.actor("client-a"), "a", input)).sequence).toBe(1);
    });
    it("serializes competing issue CAS updates and maintains whole-project counts", async () => {
        const f = await insertChatMongoFixture();
        const actor = f.actor("client-a");
        const message = await f.service.send(actor, "a", chatSend("Urgent", { priority: "critical" }));
        const results = await Promise.allSettled([f.service.issue(actor, "a", message.id, { action: "resolve", expectedVersion: 1, idempotencyKey: "resolve-from-client", note: "Fixed" }), f.service.issue(f.actor("manager-a"), "a", message.id, { action: "lower", expectedVersion: 1, idempotencyKey: "lower-from-manager", note: "Less urgent" })]);
        expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
        expect((await f.service.summary(actor, "a")).counts.openCritical).toBe(0);
        expect(await ProjectChatIssueHistoryModel.countDocuments()).toBe(2);
    });
    it("paginates history/around and raw events without exposing another user's read receipts", async () => {
        const f = await insertChatMongoFixture();
        const actor = f.actor("client-a"), worker = f.actor("electric-a");
        const messages = [];
        for (let index = 0; index < 6; index++)
            messages.push(await f.service.send(actor, "a", chatSend(`Saved ${index}`)));
        const around = await f.service.messages(actor, "a", { around: messages[2]!.id, limit: 1 });
        expect(around.items.map((row) => row.id)).toEqual([messages[2]!.id]);
        const latest = await f.service.messages(actor, "a", { limit: 2 });
        expect(latest.items.map((row) => row.body)).toEqual(["Saved 4", "Saved 5"]);
        expect((await f.service.messages(actor, "a", { limit: 2, before: latest.olderCursor! })).items.map((row) => row.body)).toEqual(["Saved 2", "Saved 3"]);
        await f.service.read(worker, "a", { messageId: messages[5]!.id, sequence: messages[5]!.sequence });
        const privateBatch = await f.service.events(actor, "a", latest.snapshotCursor, 1);
        expect(privateBatch.events).toEqual([]);
        expect(parseChatCursor("a", privateBatch.cursor)).toBe(7);
        expect((await f.service.summary(worker, "a")).counts.unread).toBe(0);
        await ProjectChatEventModel.deleteOne({ projectId: "a", sequence: 3 });
        expect((await f.service.events(actor, "a", chatCursor("a", 2))).resync).toBe(true);
    });
    it("enforces database identity indexes and one active selected person", async () => {
        const f = await insertChatMongoFixture();
        const actor = f.actor("admin-a");
        const value = { userId: "electric-b", reason: "Support", idempotencyKey: "select-concurrent" };
        const replies = await Promise.all([f.service.addParticipant(actor, "a", value), f.service.addParticipant(actor, "a", value)]);
        expect(replies[0].items.find((row) => row.id === "electric-b")!.selection!.id).toBe(replies[1].items.find((row) => row.id === "electric-b")!.selection!.id);
        expect(await ProjectChatParticipantAssignmentModel.countDocuments()).toBe(1);
        const selection = (await ProjectChatParticipantAssignmentModel.findOne().lean())!;
        await expect(ProjectChatParticipantAssignmentModel.create({ ...selection, _id: "duplicate-selection" })).rejects.toMatchObject({ code: 11000 });
        const saved = await f.service.send(actor, "a", chatSend());
        const document = (await ProjectChatMessageModel.findById(saved.id).lean())!;
        await expect(ProjectChatMessageModel.create({ ...document, _id: "duplicate-message" })).rejects.toMatchObject({ code: 11000 });
    });
    it("pages the global portfolio metadata before loading assignments and whole-history counts", async () => {
        const f = await insertChatMongoFixture();
        const projects = Array.from({length:24}, (_, index) => {
            const {id, ...project} = chatProject(`global-${String(index).padStart(2,"0")}`, index % 2 ? "client-a" : "client-b");
            return {_id:id,...project};
        });
        await ProjectModel.insertMany(projects);
        await f.service.send(f.actor("super"), "global-20", chatSend("Priority", {priority:"critical"}));
        const sourceReads = vi.spyOn(EstimateModel,"find");
        const historyCounts = vi.spyOn(ProjectChatMessageModel,"countDocuments");
        try {
            const started = performance.now();
            const page = await f.service.list(f.actor("super"), {limit:4,offset:0});
            console.info(`[project-messages] Mongo Super Admin list over 26 conversations took ${(performance.now() - started).toFixed(1)} ms`);
            expect(page.pagination).toEqual({limit:4,offset:0,total:26,hasMore:true});
            expect(page.items.map((row)=>row.project.id)).toEqual(["global-20","a","b","global-00"]);
            expect(page.items[0]!.counts.openCritical).toBe(1);
            expect(page.items.slice(1).every((row)=>row.counts.openCritical===0)).toBe(true);
            expect(sourceReads).toHaveBeenCalledTimes(4);
            // Whole-history counts cover all 26 authorized conversations once (4 count queries each) for exact totals.
            expect(historyCounts).toHaveBeenCalledTimes(104);
            expect(page.totals).toEqual({unread:0,critical:1,important:0});
            const tail = await f.service.list(f.actor("super"), {limit:4,offset:25});
            expect(tail.pagination).toEqual({limit:4,offset:25,total:26,hasMore:false});
            expect(tail.items.map((row)=>row.project.id)).toEqual(["global-23"]);
        } finally {sourceReads.mockRestore();historyCounts.mockRestore();}
    });
    it("matches memory semantics for conversation filters, search, totals and last-message previews", async () => {
        const f = await insertChatMongoFixture();
        const {id, ...project} = chatProject("c", "client-a");
        await ProjectModel.create({_id:id, ...project});
        await f.service.send(f.actor("client-a"), "a", chatSend("Kick-off"));
        await f.service.send(f.actor("designer-a"), "a", chatSend("Leak found", {priority:"critical"}));
        await f.service.send(f.actor("manager-a"), "a", chatSend("Tile shade", {priority:"important"}));
        await f.service.send(f.actor("client-b"), "b", chatSend("Hello from B"));
        await f.service.send(f.actor("super"), "b", chatSend("Oversight note", {priority:"important"}));
        await f.chatRepository.mutate(async (tx) => {
            const sequence = await tx.allocate("a", "2026-09-16T10:05:00.000Z");
            const attachments = Array.from({length:4}, (_, index) => ({id:`file-${index}`, kind:"image" as const, filename:`wall-${index}.jpg`, mimeType:"image/jpeg", byteSize:10, preview:index === 1 ? null : {mimeType:"image/webp", byteSize:5, width:4, height:3}}));
            await tx.saveMessage({id:"seeded-latest", projectId:"a", author:{id:"client-a", name:"Client A", role:"client"}, body:`@Designer A  look\n${"x".repeat(200)}`, mentions:[{userId:"designer-a", start:0, end:11}], createdAt:"2026-09-16T10:05:00.000Z", sequence, clientMessageId:"seeded-latest-key", replyTo:null, priority:"normal", issueStatus:null, raisedBy:null, responsible:null, version:1, attachments});
        });
        const started = performance.now();
        const all = await f.service.list(f.actor("super"), {limit:1, offset:0});
        console.info(`[project-messages] Mongo list for 3 conversations took ${(performance.now() - started).toFixed(1)} ms`);
        expect(all.items.map((row)=>row.project.id)).toEqual(["a"]);
        expect(all.pagination).toEqual({limit:1, offset:0, total:3, hasMore:true});
        expect(all.totals).toEqual({unread:2, critical:1, important:2});
        const preview = all.items[0]!.lastMessage!;
        expect(preview).toMatchObject({id:"seeded-latest", author:{id:"client-a", name:"Client A", role:"client"}, createdAt:"2026-09-16T10:05:00.000Z", attachmentCount:4});
        expect(preview.excerpt).toHaveLength(120);
        expect(preview.excerpt.startsWith("@Designer A look xxx")).toBe(true);
        expect(preview.excerpt.endsWith("\u2026")).toBe(true);
        expect(preview.attachments).toEqual([0, 1, 2].map((index) => ({id:`file-${index}`, kind:"image", filename:`wall-${index}.jpg`, hasPreview:index !== 1})));
        const page = async (actorId: string, input: Record<string, unknown>) => f.service.list(f.actor(actorId), {limit:5, offset:0, ...input} as {limit: number; offset: number});
        const ids = (value: Awaited<ReturnType<typeof page>>) => value.items.map((row)=>row.project.id);
        expect(ids(await page("super", {}))).toEqual(["a","b","c"]);
        expect((await page("super", {})).items[2]!.lastMessage).toBeNull();
        expect(ids(await page("super", {filter:"unread"}))).toEqual(["a","b"]);
        expect(ids(await page("super", {filter:"critical"}))).toEqual(["a"]);
        expect(ids(await page("super", {filter:"important"}))).toEqual(["a","b"]);
        const unreadTail = await f.service.list(f.actor("super"), {limit:1, offset:1, filter:"unread"} as {limit: number; offset: number});
        expect(unreadTail.pagination).toEqual({limit:1, offset:1, total:2, hasMore:false});
        const searched = await page("super", {search:"PROJECT C", filter:"all"});
        expect(ids(searched)).toEqual(["c"]);
        expect(searched.totals).toEqual({unread:2, critical:1, important:2});
        const client = await page("client-a", {});
        expect(ids(client)).toEqual(["a","c"]);
        expect(client.totals).toEqual({unread:1, critical:1, important:1});
        expect(ids(await page("client-a", {search:"project b"}))).toEqual([]);
        expect(await page("electric-b", {})).toEqual({items:[], pagination:{limit:5, offset:0, total:0, hasMore:false}, totals:{unread:0, critical:0, important:0}});
        expect(JSON.stringify(all)).not.toMatch(/Reference|https?:|storage/i);
    });
});
