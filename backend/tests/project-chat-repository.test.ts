import { describe, it, expect } from "vitest";
import { createChatFixture, chatSend, chatProject } from "./helpers/project-chat.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
describe("project chat memory atomicity", () => {
    it("rolls back message/event/idempotency/issue/audit together when audit persistence fails", async () => {
        const f = createChatFixture();
        const failure = createProjectChatService({ repository: f.repository, chatRepository: f.chatRepository, clock: f.clock, audit: { ...f.audit, async append(input, repository) { await f.audit.append(input, repository); throw new Error("audit failure"); } } });
        const input = chatSend("Rollback", { priority: "critical" });
        await expect(failure.send(f.actor("client-a"), "a", input)).rejects.toThrow("audit failure");
        const summary = await f.service.summary(f.actor("client-a"), "a");
        expect(summary.latestMessageSequence).toBe(0);
        expect(summary.counts.openCritical).toBe(0);
        expect((await f.repository.pageAuditEvents({}, { limit: 100, offset: 0 })).items).toHaveLength(0);
        const saved = await f.service.send(f.actor("client-a"), "a", input);
        expect(saved.sequence).toBe(1);
        expect(saved.issueHistory).toHaveLength(1);
    });
    it("performs one successful CAS issue transition during concurrent competing resolutions", async () => {
        const f = createChatFixture();
        const actor = f.actor("client-a");
        const message = await f.service.send(actor, "a", chatSend("Critical", { priority: "critical" }));
        const result = await Promise.allSettled([f.service.issue(actor, "a", message.id, { action: "resolve", expectedVersion: 1, idempotencyKey: "resolution-one", note: "Fixed one" }), f.service.issue(f.actor("manager-a"), "a", message.id, { action: "resolve", expectedVersion: 1, idempotencyKey: "resolution-two", note: "Fixed two" })]);
        expect(result.filter((row) => row.status === "fulfilled")).toHaveLength(1);
        expect(result.filter((row) => row.status === "rejected")).toHaveLength(1);
        expect((await f.service.summary(actor, "a")).counts.openCritical).toBe(0);
        const stored = (await f.service.messages(actor, "a", {})).items[0]!;
        expect(stored.version).toBe(2);
        expect(stored.issueHistory).toHaveLength(2);
    });
    it("reads current external memory sources after reassignment and tracks unavailable responsible people", async () => {
        const f = createChatFixture();
        const actor = f.actor("client-a");
        const message = await f.service.send(actor, "a", chatSend("Owner", { priority: "critical", responsibleUserId: "electric-a" }));
        const before = await f.service.events(actor, "a", undefined);
        f.workflowTasks[0]!.assigneeUserId = "electric-b";
        await expect(f.service.summary(f.actor("electric-a"), "a")).rejects.toMatchObject({ status: 404 });
        await expect(f.service.summary(f.actor("electric-b"), "a")).resolves.toBeDefined();
        expect((await f.service.messages(actor, "a", {})).items[0]!.responsible).toMatchObject({ id: "electric-a", available: false });
        expect((await f.service.events(actor, "a", before.cursor)).membershipVersion).not.toBe(before.membershipVersion);
    });
    it("bounds recent issue history while preserving complete immutable lifecycle rows", async () => {
        const f = createChatFixture();
        const actor = f.actor("client-a");
        let message = await f.service.send(actor, "a", chatSend("Long-lived", { priority: "critical" }));
        for (let index = 0; index < 54; index++)
            message = await f.service.issue(actor, "a", message.id, { action: index % 2 === 0 ? "resolve" : "reopen", expectedVersion: message.version, idempotencyKey: `history-change-${index}`, note: "Reviewed again" });
        expect(message.issueHistory).toHaveLength(50);
        expect(message.version).toBe(55);
        expect((await f.repository.pageAuditEvents({ entityId: message.id }, { limit: 100, offset: 0 })).total).toBe(55);
    });
    it("refreshes eligibility even when an approved unassigned trade changes no named member", async () => {
        const f = createChatFixture();
        const actor = f.actor("admin-a");
        const before = await f.service.events(actor, "a", undefined);
        f.estimates[0]!.lineItems[1]!.included = true;
        const after = await f.service.events(actor, "a", before.cursor);
        expect(after.events).toEqual([]);
        expect(after.membershipVersion).not.toBe(before.membershipVersion);
        expect((await f.service.participants(actor, "a")).setupWarnings).toContain("Participant not selected for one or more approved trades.");
        const selected = await f.service.addParticipant(actor, "a", {userId:"plumber",reason:"Approved trade support",idempotencyKey:"add-newly-eligible"});
        expect(selected.setupWarnings).not.toContain("Participant not selected for one or more approved trades.");
    });
    it("lists only the user's current conversations, including explicit selection and later removal", async () => {
        const f = createChatFixture();
        const worker = f.actor("electric-b");
        expect((await f.service.list(worker, {limit:20,offset:0})).items).toEqual([]);
        const page = await f.service.addParticipant(f.actor("admin-a"), "a", {userId:worker.id,reason:"Support",idempotencyKey:"conversation-selection"});
        expect((await f.service.list(worker, {limit:20,offset:0})).items.map((row)=>row.project.id)).toEqual(["a"]);
        expect((await f.service.list(f.actor("super"), {limit:1,offset:0})).pagination).toEqual({limit:1,offset:0,total:2,hasMore:true});
        const selection = page.items.find((row)=>row.id===worker.id)!.selection!;
        await f.service.revokeParticipant(f.actor("admin-a"), "a", selection.id, {expectedVersion:selection.version,reason:"Complete",idempotencyKey:"conversation-removal"});
        expect((await f.service.list(worker, {limit:20,offset:0})).items).toEqual([]);
    });
    it("limits committed message rates and allows a saved retry without consuming another slot", async () => {
        const f = createChatFixture();
        const actor = f.actor("client-a");
        const input = chatSend("Saved first");
        const first = await f.service.send(actor, "a", input);
        for (let index=0; index<29; index++) await f.service.send(actor, "a", chatSend(`Message ${index}`));
        expect((await f.service.send(actor, "a", input)).id).toBe(first.id);
        await expect(f.service.send(actor, "a", chatSend("Over limit"))).rejects.toMatchObject({status:429,headers:{"Retry-After":"60"}});
        f.advance(60_001);
        await expect(f.service.send(actor, "a", chatSend("After window"))).resolves.toBeDefined();
    });

    it("hydrates only the returned conversation page, with exact asymmetric membership totals", async () => {
        const f = createChatFixture();
        for (let index = 0; index < 20; index++) {
            await f.repository.createProject(chatProject(`portfolio-${String(index).padStart(2, "0")}`, index % 2 === 0 ? "client-a" : "client-b"));
        }
        await f.service.send(f.actor("super"), "portfolio-19", chatSend("Earlier", {priority:"important"}));
        f.advance(1000);
        await f.service.send(f.actor("super"), "portfolio-05", chatSend("Latest", {priority:"critical"}));
        const counted: string[] = [];
        const loaded: string[] = [];
        const service = createProjectChatService({repository:f.repository, audit:f.audit, clock:f.clock, chatRepository:{
            ...f.chatRepository,
            snapshot: (operation) => f.chatRepository.snapshot((tx) => operation({
                ...tx,
                async sources(projectId) {loaded.push(projectId); return tx.sources(projectId);},
                async counts(projectId, userId, sequence) {counted.push(projectId); return tx.counts(projectId, userId, sequence);}
            }))
        }});
        const global = await service.list(f.actor("super"), {limit:3, offset:0});
        expect(global.pagination).toEqual({limit:3,offset:0,total:22,hasMore:true});
        expect(global.items.map((row)=>row.project.id)).toEqual(["portfolio-05","portfolio-19","a"]);
        expect(loaded).toEqual(global.items.map((row)=>row.project.id));
        // Counts cover every authorized conversation exactly once so totals and filters are exact.
        expect(counted).toHaveLength(22);
        expect(new Set(counted).size).toBe(22);
        expect(global.totals).toEqual({unread:0,critical:1,important:1});
        expect(global.items[0]!.counts).toMatchObject({openCritical:1,openImportant:0});
        expect(global.items[1]!.counts).toMatchObject({openCritical:0,openImportant:1});
        counted.length = 0;
        loaded.length = 0;
        const personal = await service.list(f.actor("client-a"), {limit:3,offset:0});
        expect(personal.pagination.total).toBe(11);
        expect(personal.items.map((row)=>row.project.id)).toEqual(["a","portfolio-00","portfolio-02"]);
        expect(counted).toHaveLength(11);
        expect(new Set(counted).size).toBe(11);
        expect(personal.totals).toEqual({unread:0,critical:0,important:0});
        expect(loaded.length).toBeGreaterThan(3);
    });

});
