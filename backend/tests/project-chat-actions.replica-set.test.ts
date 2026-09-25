import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { chatSend } from "./helpers/project-chat.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { ProjectChatActionTypeModel, ProjectChatExclusionModel } from "../src/models/ProjectChatAction.js";
import { ProjectChatMessageModel, ProjectChatIssueHistoryModel, ProjectChatOperationModel, ProjectChatEventModel } from "../src/models/ProjectChat.js";
import { ProjectModel } from "../src/models/Project.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("chat-actions"); for (const model of chatModels) await model.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());
const removal = { expectedVersion: 0, reason: "Handover", idempotencyKey: "remove-designer-a" };

describe("message action and membership transactions", () => {
  it("deduplicates tracked sends across adapters and serializes deadline CAS while retaining immutable original metadata", async () => {
    const f = await insertChatMongoFixture();
    const second = createProjectChatService({ ...f, chatRepository: createMongoProjectChatRepository() });
    const input = chatSend("Review required", { action: { typeId: "action", dueDate: "2026-10-01" }, responsibleUserId: "designer-a", clientMessageId: "concurrent-tracked-message" });
    const [first, same] = await Promise.all([f.service.send(f.actor("client-a"), "a", input), second.send(f.actor("client-a"), "a", input)]);
    expect(first.id).toBe(same.id);
    expect(await ProjectChatMessageModel.countDocuments()).toBe(1);
    expect(await ProjectChatIssueHistoryModel.countDocuments()).toBe(1);
    const changes = await Promise.allSettled([f.service.issue(f.actor("client-a"), "a", first.id, { action: "reschedule", dueDate: "2026-10-05", expectedVersion: 1, idempotencyKey: "deadline-change-one", note: "Review pending" }), second.issue(f.actor("designer-a"), "a", first.id, { action: "reschedule", dueDate: "2026-10-08", expectedVersion: 1, idempotencyKey: "deadline-change-two", note: "Site unavailable" })]);
    expect(changes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(changes.filter(row => row.status === "rejected")).toHaveLength(1);
    const stored = (await second.messages(f.actor("client-a"), "a", {})).items[0]!;
    expect(stored.action?.originalDueDate).toBe("2026-10-01");
    expect(stored.action?.dueDate).not.toBe("2026-10-01");
    expect(stored.issueHistory.map(row => row.actionMetadata?.originalDueDate)).toEqual(["2026-10-01", "2026-10-01"]);
    expect(stored.issueHistory[1]!.actionMetadata?.dueDate).toBe(stored.action?.dueDate);
    await f.chatRepository.mutate(async tx => {
      const row = (await tx.message("a", first.id))!;
      await tx.saveMessage({ ...row, version: row.version + 1, action: { ...row.action!, typeId: "forged", typeName: "Forged", originalDueDate: "2000-01-01" } });
    });
    const immutable = (await ProjectChatMessageModel.findById(first.id).lean())!;
    expect(immutable.action).toMatchObject({ typeId: "action", typeName: "Action", originalDueDate: "2026-10-01" });
  }, 30000);

  it("persists exclusion across adapters, rejects competing removals and restores only through an explicit versioned write", async () => {
    const f = await insertChatMongoFixture();
    const second = createProjectChatService({ ...f, chatRepository: createMongoProjectChatRepository() });
    const first = await f.service.send(f.actor("designer-a"), "a", chatSend("Historical message"));
    const outcomes = await Promise.allSettled([f.service.removeParticipant(f.actor("admin-a"), "a", "designer-a", removal), second.removeParticipant(f.actor("super"), "a", "designer-a", { ...removal, idempotencyKey: "competing-removal" })]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1);
    expect(await ProjectChatExclusionModel.countDocuments()).toBe(1);
    await expect(second.summary(f.actor("designer-a"), "a")).rejects.toMatchObject({ status: 404 });
    await expect(second.send(f.actor("designer-a"), "a", chatSend())).rejects.toMatchObject({ status: 404 });
    await expect(second.authorizeDelivery(f.actor("designer-a"), "a", () => { throw new Error("must not deliver"); })).rejects.toMatchObject({ status: 404 });
    expect((await ProjectModel.findById("a").lean())!.assignedDesignerIds).toContain("designer-a");
    await second.restoreParticipant(f.actor("super"), "a", "designer-a", { ...removal, expectedVersion: 1, idempotencyKey: "restore-designer-a" });
    expect((await f.service.messages(f.actor("designer-a"), "a", {})).items[0]!.id).toBe(first.id);
    const row = (await ProjectChatExclusionModel.findOne().lean())!;
    expect(row).toMatchObject({ active: false, version: 2 });
    expect(row.history).toHaveLength(2);
  }, 30000);

  it("enforces global unique normalized catalogue names under concurrency and replays global retry keys", async () => {
    const f = await insertChatMongoFixture();
    const second = createProjectChatService({ ...f, chatRepository: createMongoProjectChatRepository() });
    const requests = await Promise.allSettled([f.service.createActionType(f.actor("super"), "a", { name: "Inspection", idempotencyKey: "catalogue-first" }), second.createActionType(f.actor("super"), "b", { name: " INSPECTION ", idempotencyKey: "catalogue-second" })]);
    expect(requests.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(await ProjectChatActionTypeModel.countDocuments()).toBe(1);
    const row = (await ProjectChatActionTypeModel.findOne().lean())!;
    await expect(ProjectChatActionTypeModel.create({ ...row, _id: "duplicate-name" })).rejects.toMatchObject({ code: 11000 });
    const input = { name: "Follow up", idempotencyKey: "global-type-retry" };
    expect(await f.service.createActionType(f.actor("super"), "a", input)).toEqual(await second.createActionType(f.actor("super"), "b", input));
    expect((await second.actionTypes(f.actor("client-b"), "b")).items).toHaveLength(4);
  }, 30000);

  it("serializes canonical rename CAS, supports missing legacy revision, and never overwrites another project", async () => {
    const f = await insertChatMongoFixture();
    await ProjectModel.updateOne({ _id: "a" }, { $unset: { nameVersion: "" } });
    const second = createProjectChatService({ ...f, chatRepository: createMongoProjectChatRepository() });
    const outcomes = await Promise.allSettled([f.service.renameProject(f.actor("admin-a"), "a", { name: "First name", expectedVersion: 1, idempotencyKey: "rename-from-admin" }), second.renameProject(f.actor("super"), "a", { name: "Second name", expectedVersion: 1, idempotencyKey: "rename-from-super" })]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1);
    const project = (await f.repository.findProjectById("a"))!;
    expect(project.nameVersion).toBe(2);
    expect((await second.summary(f.actor("client-a"), "a")).project.name).toBe(project.name);
    expect((await f.repository.findProjectById("b"))!.name).toBe("Project b");
    expect(await AuditEventModel.countDocuments({ action: "project_chat.project_renamed" })).toBe(1);
  }, 30000);

  it("rolls back every part of removal, catalogue, rename and tracked sends when audit fails", async () => {
    const f = await insertChatMongoFixture();
    const service = createProjectChatService({ ...f, audit: { ...f.audit, async appendInMongoTransaction(input, session) { await f.audit.appendInMongoTransaction(input, session); throw new Error("injected audit failure"); } } });
    const writes = [() => service.removeParticipant(f.actor("super"), "a", "designer-a", removal), () => service.createActionType(f.actor("super"), "a", { name: "Review", idempotencyKey: "rollback-catalogue" }), () => service.renameProject(f.actor("super"), "a", { name: "Rolled back", expectedVersion: 1, idempotencyKey: "rollback-project-name" }), () => service.send(f.actor("client-a"), "a", chatSend("Tracked rollback", { action: { typeId: "action", dueDate: "2026-12-01" }, responsibleUserId: "designer-a" }))];
    for (const write of writes) await expect(write()).rejects.toThrow("injected audit failure");
    for (const model of [ProjectChatExclusionModel, ProjectChatActionTypeModel, ProjectChatMessageModel, ProjectChatIssueHistoryModel, ProjectChatOperationModel, ProjectChatEventModel, AuditEventModel]) expect(await model.countDocuments()).toBe(0);
    expect((await ProjectModel.findById("a").lean())!.name).toBe("Project a");
  }, 30000);
});
