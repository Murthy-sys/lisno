import { describe, expect, it } from "vitest";
import { chatExcerpt } from "../src/domain/project-chat.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { chatProject, chatSend, CHAT_NOW } from "./helpers/project-chat.js";

async function conversationFixture() {
    const f = createAttachmentFixture();
    await f.repository.createProject(chatProject("c", "client-a"));
    // Project a: unequal issue/unread mix. Project b: other client's thread. Project c: empty.
    await f.service.send(f.actor("client-a"), "a", chatSend("Kick-off"));
    f.advance(1000);
    await f.service.send(f.actor("designer-a"), "a", chatSend("Leak found", {priority: "critical"}));
    f.advance(1000);
    await f.service.send(f.actor("manager-a"), "a", chatSend("Tile shade", {priority: "important"}));
    f.advance(1000);
    await f.service.send(f.actor("client-b"), "b", chatSend("Hello from B"));
    f.advance(1000);
    await f.service.send(f.actor("super"), "b", chatSend("Oversight note", {priority: "important"}));
    f.advance(1000);
    const staged = [];
    for (let index = 0; index < 4; index++) staged.push(await f.stage("client-a", `Synthetic file ${index}`, {filename: `photo-${index}.txt`}));
    await f.service.send(f.actor("client-a"), "a", chatSend("", {attachmentIds: staged.map((row) => row.attachment.id)}));
    return f;
}
const ids = (page: {items: Array<{project: {id: string}}>}) => page.items.map((row) => row.project.id);

describe("project conversation list filters, totals and last-message preview", () => {
    it("computes totals over every authorized conversation, independent of filter, search and paging", async () => {
        const f = await conversationFixture();
        const superAdmin = f.actor("super");
        const expected = {unread: 2, critical: 1, important: 2};
        for (const input of [{limit: 1, offset: 0}, {limit: 1, offset: 2}, {limit: 1, offset: 0, filter: "critical"}, {limit: 1, offset: 0, search: "zzz"}]) {
            expect((await f.service.list(superAdmin, input)).totals).toEqual(expected);
        }
        const client = await f.service.list(f.actor("client-a"), {limit: 1, offset: 0});
        expect(client.totals).toEqual({unread: 1, critical: 1, important: 1});
        expect(client.pagination).toEqual({limit: 1, offset: 0, total: 2, hasMore: true});
        const all = await f.service.list(superAdmin, {limit: 1, offset: 0});
        expect(ids(all)).toEqual(["a"]);
        expect(all.pagination).toEqual({limit: 1, offset: 0, total: 3, hasMore: true});
        expect(ids(await f.service.list(superAdmin, {limit: 1, offset: 1}))).toEqual(["b"]);
        expect(ids(await f.service.list(superAdmin, {limit: 1, offset: 2}))).toEqual(["c"]);
    });

    it("filters server-side with exact total and hasMore across pages", async () => {
        const f = await conversationFixture();
        const superAdmin = f.actor("super");
        const unread0 = await f.service.list(superAdmin, {limit: 1, offset: 0, filter: "unread"});
        const unread1 = await f.service.list(superAdmin, {limit: 1, offset: 1, filter: "unread"});
        expect([...ids(unread0), ...ids(unread1)]).toEqual(["a", "b"]);
        expect(unread0.pagination).toEqual({limit: 1, offset: 0, total: 2, hasMore: true});
        expect(unread1.pagination).toEqual({limit: 1, offset: 1, total: 2, hasMore: false});
        const critical = await f.service.list(superAdmin, {limit: 1, offset: 0, filter: "critical"});
        expect(ids(critical)).toEqual(["a"]);
        expect(critical.pagination).toEqual({limit: 1, offset: 0, total: 1, hasMore: false});
        const important = await f.service.list(superAdmin, {limit: 5, offset: 0, filter: "important"});
        expect(ids(important)).toEqual(["a", "b"]);
        expect(important.items.every((row) => row.counts.openImportant > 0)).toBe(true);
        expect(ids(await f.service.list(superAdmin, {limit: 5, offset: 0, filter: "all"}))).toEqual(["a", "b", "c"]);
        const client = await f.service.list(f.actor("client-a"), {limit: 5, offset: 0, filter: "unread"});
        expect(ids(client)).toEqual(["a"]);
        expect(client.items[0]!.counts.unread).toBe(2);
        await expect(f.service.list(superAdmin, {limit: 5, offset: 0, filter: "mentions"})).rejects.toMatchObject({status: 400});
        await expect(f.service.list(superAdmin, {limit: 5, offset: 0, sort: "name"})).rejects.toMatchObject({status: 400});
    });

    it("searches project names case-insensitively, combined with filters", async () => {
        const f = await conversationFixture();
        const superAdmin = f.actor("super");
        const searched = await f.service.list(superAdmin, {limit: 5, offset: 0, search: "  PROJECT c "});
        expect(ids(searched)).toEqual(["c"]);
        expect(searched.pagination).toEqual({limit: 5, offset: 0, total: 1, hasMore: false});
        expect(ids(await f.service.list(superAdmin, {limit: 5, offset: 0, search: "project", filter: "unread"}))).toEqual(["a", "b"]);
        const none = await f.service.list(superAdmin, {limit: 5, offset: 0, search: "no such project"});
        expect(none.items).toEqual([]);
        expect(none.pagination).toEqual({limit: 5, offset: 0, total: 0, hasMore: false});
        expect(none.totals).toEqual({unread: 2, critical: 1, important: 2});
        // Search matches only names of conversations the actor can see.
        expect(ids(await f.service.list(f.actor("client-a"), {limit: 5, offset: 0, search: "project b"}))).toEqual([]);
    });

    it("previews the newest message with capped attachment metadata and no storage references", async () => {
        const f = await conversationFixture();
        const page = await f.service.list(f.actor("super"), {limit: 5, offset: 0});
        const [a, b, c] = page.items;
        expect(a!.lastMessage).toMatchObject({author: {id: "client-a", name: "Client A", role: "client"}, excerpt: "", attachmentCount: 4});
        expect(a!.lastMessage!.createdAt).toBe(a!.lastMessageAt);
        expect(a!.lastMessage!.attachments.map((row) => row.filename)).toEqual(["photo-0.txt", "photo-1.txt", "photo-2.txt"]);
        expect(a!.lastMessage!.attachments.every((row) => Object.keys(row).sort().join() === "filename,hasPreview,id,kind" && row.hasPreview === false && row.kind === "document")).toBe(true);
        expect(b!.lastMessage).toMatchObject({author: {id: "super"}, excerpt: "Oversight note", attachments: [], attachmentCount: 0});
        expect(c!.lastMessage).toBeNull();
        const serialized = JSON.stringify(page);
        expect(f.files.size).toBeGreaterThan(0);
        for (const reference of f.files.keys()) expect(serialized).not.toContain(reference);
        expect(serialized).not.toMatch(/artifact-|Reference|https?:|sha256|storage/i);
    });

    it("builds a plain, whitespace-collapsed, 120-character excerpt that keeps @Name mentions", async () => {
        const f = await conversationFixture();
        const body = `@Designer A please\n\n\tcheck ${"the  corner ".repeat(20)}end`;
        await f.service.send(f.actor("client-a"), "a", chatSend(body, {mentions: [{userId: "designer-a", start: 0, end: 11}]}));
        const preview = (await f.service.list(f.actor("client-a"), {limit: 1, offset: 0})).items[0]!.lastMessage!;
        expect(preview.excerpt.length).toBe(120);
        expect(preview.excerpt.startsWith("@Designer A please check the corner the corner")).toBe(true);
        expect(preview.excerpt.endsWith("…")).toBe(true);
        expect(preview.excerpt).not.toMatch(/\s{2}|[\n\t]/);
        expect(preview).toMatchObject({author: {id: "client-a"}, attachments: [], attachmentCount: 0});
        expect(chatExcerpt("  Short\n note ")).toBe("Short note");
        expect(chatExcerpt("x".repeat(120))).toBe("x".repeat(120));
        expect(chatExcerpt(`${"x".repeat(118)}\u{1F600}tail`)).toBe(`${"x".repeat(118)}…`);
    });

    it("reports image previews from stored attachment metadata", async () => {
        const f = await conversationFixture();
        await f.chatRepository.mutate(async (tx) => {
            const sequence = await tx.allocate("c", CHAT_NOW);
            await tx.saveMessage({id: "seeded-image", projectId: "c", author: {id: "client-a", name: "Client A", role: "client"}, body: "Site photos", mentions: [], createdAt: CHAT_NOW, sequence, clientMessageId: "seeded-image-key", replyTo: null, priority: "normal", issueStatus: null, raisedBy: null, responsible: null, version: 1,
                attachments: [{id: "img-1", kind: "image", filename: "wall.jpg", mimeType: "image/jpeg", byteSize: 10, preview: {mimeType: "image/webp", byteSize: 5, width: 4, height: 3}}, {id: "doc-1", kind: "document", filename: "bill.pdf", mimeType: "application/pdf", byteSize: 10, preview: null}]});
        });
        const row = (await f.service.list(f.actor("client-a"), {limit: 5, offset: 0, search: "project c"})).items[0]!;
        expect(row.lastMessage).toEqual({id: "seeded-image", author: {id: "client-a", name: "Client A", role: "client"}, excerpt: "Site photos", createdAt: CHAT_NOW, attachmentCount: 2,
            attachments: [{id: "img-1", kind: "image", filename: "wall.jpg", hasPreview: true}, {id: "doc-1", kind: "document", filename: "bill.pdf", hasPreview: false}]});
    });

    it("shows a non-member nothing, and read state lowers only that actor's unread totals", async () => {
        const f = await conversationFixture();
        const outsider = await f.service.list(f.actor("electric-b"), {limit: 1, offset: 0});
        expect(outsider).toEqual({items: [], pagination: {limit: 1, offset: 0, total: 0, hasMore: false}, totals: {unread: 0, critical: 0, important: 0}});
        const latest = (await f.service.messages(f.actor("super"), "b", {limit: 1})).items[0]!;
        await f.service.read(f.actor("super"), "b", {messageId: latest.id, sequence: latest.sequence});
        expect((await f.service.list(f.actor("super"), {limit: 1, offset: 0})).totals).toEqual({unread: 1, critical: 1, important: 2});
        expect(ids(await f.service.list(f.actor("super"), {limit: 5, offset: 0, filter: "unread"}))).toEqual(["a"]);
        expect((await f.service.list(f.actor("client-b"), {limit: 5, offset: 0})).totals).toEqual({unread: 1, critical: 0, important: 1});
    });

    it("returns nothing for Super Admin while more than one Super Admin is active", async () => {
        const f = await conversationFixture();
        // The repository refuses a second active Super Admin, so simulate a drifted count inside the snapshot.
        const service = createProjectChatService({repository: f.repository, audit: f.audit, clock: f.clock, chatRepository: {
            ...f.chatRepository,
            snapshot: (operation) => f.chatRepository.snapshot((tx) => operation({...tx, app: {...tx.app, countActiveUsersByRole: async () => 2}}))
        }});
        expect(await service.list(f.actor("super"), {limit: 5, offset: 0})).toEqual({items: [], pagination: {limit: 5, offset: 0, total: 0, hasMore: false}, totals: {unread: 0, critical: 0, important: 0}});
    });
});
