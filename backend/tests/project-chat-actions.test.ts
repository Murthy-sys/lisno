import { describe, expect, it, vi } from "vitest";
import { chatSend, createChatFixture } from "./helpers/project-chat.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createNotificationEmailDispatcher } from "../src/services/notification-email-dispatcher.js";
import { createProjectChatTypingService } from "../src/services/project-chat-typing.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";

const removal = (expectedVersion = 0, idempotencyKey = "remove-participant") => ({ expectedVersion, idempotencyKey, reason: "Conversation handover" });
const action = (typeId = "action", dueDate = "2026-10-01") => chatSend("Please confirm the revised plan", { action: { typeId, dueDate }, responsibleUserId: "designer-a" });

describe("conversation exclusions", () => {
  it("removes assignment-derived membership everywhere while preserving assignments, history and explicit restoration", async () => {
    const f = createAttachmentFixture();
    const member = f.actor("electric-a"), manager = f.actor("admin-a"), client = f.actor("client-a");
    const attachment = await f.stage();
    const message = await f.service.send(client, "a", chatSend("@Electric A please review", { mentions: [{ userId: member.id, start: 0, end: 11 }], attachmentIds: [attachment.attachment.id] }));
    const notifications = createNotificationService({ repository: f.chatRepository, clock: f.clock });
    const notification = (await notifications.list(member, {})).items[0]!;
    const typing = createProjectChatTypingService(f);
    await typing.update(member, "a", { composerId: "removal-composer-one", sequence: 1, typing: true });
    const before = await f.repository.findProjectById("a");
    const page = await f.service.removeParticipant(manager, "a", member.id, removal());
    expect(page.items.some(row => row.id === member.id)).toBe(false);
    expect(page.removed).toEqual([{ id: member.id, name: "Electric A", role: "worker_electrician", removalVersion: 1, canRestore: true }]);
    expect(await f.repository.findProjectById("a")).toEqual(before);
    expect(f.workflowTasks[0]!.assigneeUserId).toBe(member.id);
    expect((await f.service.list(member, { limit: 20, offset: 0 })).items).toEqual([]);
    for (const read of [() => f.service.summary(member, "a"), () => f.service.messages(member, "a", {}), () => f.service.events(member, "a", undefined), () => f.service.send(member, "a", chatSend()), () => f.service.authorizeDelivery(member, "a", vi.fn()), () => notifications.read(member, notification.id), () => typing.update(member, "a", { composerId: "removal-composer-one", sequence: 2, typing: false }), () => f.attachments.policy(member, "a"), () => f.attachments.download(member, "a", attachment.attachment.id, "content"), () => f.attachments.download(member, "a", attachment.attachment.id, "preview"), () => f.attachments.beginUpload(member, "a", { uploadId: "removed-upload", sizeBytes: 10 })]) {
      await expect(read()).rejects.toMatchObject({ status: 404 });
    }
    expect((await notifications.list(member, {})).items).toEqual([]);
    const enqueue = vi.fn();
    await typing.deliver(client, "a", enqueue);
    expect(enqueue.mock.calls[0]![0].participants).toEqual([]);
    const sendMention = vi.fn(async (_input: unknown) => {});
    const dispatcher = createNotificationEmailDispatcher({ repository: f.chatRepository, clock: f.clock, mailer: { deliveryKind: "local_test", sendMention } });
    await dispatcher.runOnce();
    await dispatcher.stop();
    expect(sendMention).toHaveBeenCalledTimes(1);
    expect((await f.chatRepository.snapshot(tx => tx.notification(notification.id, member.id)))!.email.status).toBe("suppressed");
    await expect(f.service.addParticipant(manager, "a", { userId: member.id, reason: "Ordinary selection", idempotencyKey: "ordinary-selection" })).rejects.toMatchObject({ status: 409 });
    expect((await f.service.participants(client, "a"))).not.toHaveProperty("removed");
    expect((await f.service.summary(f.actor("client-b"), "b")).participantCount).toBe(2);
    const restored = await f.service.restoreParticipant(manager, "a", member.id, removal(1, "restore-participant"));
    expect(restored.items.find(row => row.id === member.id)).toMatchObject({ removalVersion: 2, canRemove: true });
    expect((await f.service.messages(member, "a", {})).items[0]!.id).toBe(message.id);
  });

  it("protects linked Client, Super Admin and self; rejects outsiders and stale states; keeps old revoke semantics", async () => {
    const f = createChatFixture(), manager = f.actor("admin-a");
    for (const id of ["client-a", "super", manager.id]) await expect(f.service.removeParticipant(manager, "a", id, removal())).rejects.toMatchObject({ status: 403 });
    await expect(f.service.removeParticipant(f.actor("client-a"), "a", "designer-a", removal())).rejects.toMatchObject({ status: 403 });
    await expect(f.service.removeParticipant(f.actor("admin-b"), "a", "designer-a", removal())).rejects.toMatchObject({ status: 404 });
    const selected = await f.service.addParticipant(manager, "a", { userId: "designer-a", reason: "Also selected", idempotencyKey: "select-designer-a" });
    const selection = selected.items.find(row => row.id === "designer-a")!.selection!;
    expect((await f.service.revokeParticipant(manager, "a", selection.id, removal(selection.version, "revoke-selection"))).items.some(row => row.id === "designer-a")).toBe(true);
    const results = await Promise.allSettled([f.service.removeParticipant(manager, "a", "designer-a", removal()), f.service.removeParticipant(manager, "a", "designer-a", removal(0, "competing-removal"))]);
    expect(results.map(row => row.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(f.service.removeParticipant(manager, "a", "designer-a", removal())).resolves.toBeDefined();
    await expect(f.service.restoreParticipant(manager, "a", "designer-a", removal(0, "stale-restore"))).rejects.toMatchObject({ status: 409 });
    expect((await f.chatRepository.snapshot(tx => tx.sources("a")))!.exclusions![0]!.history).toHaveLength(1);
  });

  it("requires current trade eligibility on restoration and preserves exclusions across relationship refreshes", async () => {
    const f = createChatFixture();
    await f.service.removeParticipant(f.actor("super"), "a", "electric-a", removal());
    f.estimates[0]!.designPlanStatus = "in_progress";
    await expect(f.service.restoreParticipant(f.actor("super"), "a", "electric-a", removal(1, "trade-restore"))).rejects.toMatchObject({ status: 400 });
    f.estimates[0]!.designPlanStatus = "approved";
    await expect(f.service.summary(f.actor("electric-a"), "a")).rejects.toMatchObject({ status: 404 });
  });
});

describe("tracked chat actions and catalogue", () => {
  it("allows Client creation and exact retry with server-derived type priority and immutable original deadline", async () => {
    const f = createChatFixture(), client = f.actor("client-a"), input = action("escalation", "2028-02-29");
    const rows = await Promise.all([f.service.send(client, "a", input), f.service.send(client, "a", input)]);
    const saved = rows[0]!;
    expect(rows[1]!.id).toBe(saved.id);
    expect(saved).toMatchObject({ priority: "critical", issueStatus: "open", responsible: { id: "designer-a" }, action: { typeId: "escalation", typeName: "Escalation", originalDueDate: "2028-02-29", dueDate: "2028-02-29" }, capabilities: { canReschedule: true } });
    const update = { action: "reschedule" as const, dueDate: "2028-03-02", note: "Client needs another review", expectedVersion: 1, idempotencyKey: "deadline-revision" };
    const changed = await f.service.issue(client, "a", saved.id, update);
    expect(changed.action).toEqual({ ...saved.action, dueDate: update.dueDate });
    expect(changed.issueHistory.map(row => row.actionMetadata?.dueDate)).toEqual(["2028-02-29", "2028-03-02"]);
    expect((await f.service.issue(client, "a", saved.id, update)).version).toBe(2);
    await expect(f.service.issue(client, "a", saved.id, { ...update, idempotencyKey: "stale-deadline" })).rejects.toMatchObject({ status: 409 });
    for (const operation of [{ action: "clear", note: "Clear it" }, { action: "assign", responsibleUserId: null }, { action: "reschedule", dueDate: "2028-03-04" }]) await expect(f.service.issue(client, "a", saved.id, { ...operation, expectedVersion: 2, idempotencyKey: "invalid-transition" } as any)).rejects.toMatchObject({ status: 400 });
    await expect(f.service.issue(f.actor("electric-a"), "a", saved.id, { ...update, expectedVersion: 2, idempotencyKey: "unowned-deadline" })).rejects.toMatchObject({ status: 403 });
    const resolved = await f.service.issue(f.actor("designer-a"), "a", saved.id, { action: "resolve", expectedVersion: 2, idempotencyKey: "resolve-action-item", note: "Confirmed" });
    expect(resolved.action?.originalDueDate).toBe("2028-02-29");
    expect(resolved.issueStatus).toBe("resolved");
  });

  it("rejects invalid dates, types, missing details/assignees and removed assignees without partial messages", async () => {
    const f = createChatFixture();
    for (const date of ["2026-02-29", "2028-02-30", "2026-13-01", "0000-01-01", "2026-01-01T00:00:00Z"]) await expect(f.service.send(f.actor("client-a"), "a", action("action", date))).rejects.toMatchObject({ status: 400 });
    for (const input of [action("missing"), { ...action(), responsibleUserId: null }, { ...action(), body: " " }, { ...action(), responsibleUserId: "client-b" }]) await expect(f.service.send(f.actor("client-a"), "a", input)).rejects.toMatchObject({ status: 400 });
    await f.service.removeParticipant(f.actor("admin-a"), "a", "designer-a", removal());
    await expect(f.service.send(f.actor("client-a"), "a", action())).rejects.toMatchObject({ status: 400 });
    expect((await f.service.messages(f.actor("client-a"), "a", {})).items).toEqual([]);
  });

  it("provides unseeded built-ins and global custom types with sole-SA authority and duplicate-safe retries", async () => {
    const f = createChatFixture();
    expect((await f.service.actionTypes(f.actor("client-a"), "a"))).toMatchObject({ canCreate: false, items: [{ id: "action" }, { id: "escalation" }] });
    for (const id of ["client-a", "admin-a", "electric-a"]) await expect(f.service.createActionType(f.actor(id), "a", { name: "Inspection", idempotencyKey: "new-action-type" })).rejects.toMatchObject({ status: 403 });
    const input = { name: "  Inspection  ", idempotencyKey: "new-action-type" };
    const [first, retry] = await Promise.all([f.service.createActionType(f.actor("super"), "a", input), f.service.createActionType(f.actor("super"), "b", input)]);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ name: "Inspection", builtIn: false, priority: "important" });
    expect((await f.service.actionTypes(f.actor("client-b"), "b")).items).toContainEqual(first);
    for (const name of ["inspection", "Action", " eSCALATION "]) await expect(f.service.createActionType(f.actor("super"), "a", { name, idempotencyKey: `duplicate-${name}` })).rejects.toMatchObject({ status: 409 });
    expect((await f.service.send(f.actor("client-a"), "a", action(first.id))).action?.typeName).toBe("Inspection");
    await expect(f.service.createActionType({ ...f.actor("super"), sessionVersion: 2 }, "a", { name: "Other", idempotencyKey: "invalid-session" })).rejects.toMatchObject({ status: 401 });
  });
});

describe("canonical project name editing", () => {
  it("renames only for current managers with CAS, idempotency, immutable notification snapshots and refresh events", async () => {
    const f = createChatFixture(), manager = f.actor("admin-a");
    const before = await f.service.summary(manager, "a");
    await f.service.send(f.actor("client-a"), "a", chatSend("@Electric A", { mentions: [{ userId: "electric-a", start: 0, end: 11 }] }));
    const value = { name: "  New project name  ", expectedVersion: 1, idempotencyKey: "rename-project-a" };
    for (const id of ["client-a", "electric-a"]) await expect(f.service.renameProject(f.actor(id), "a", value)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.renameProject(f.actor("admin-b"), "a", value)).rejects.toMatchObject({ status: 404 });
    const changed = await f.service.renameProject(manager, "a", value);
    expect(changed.project).toMatchObject({ id: "a", name: "New project name", nameVersion: 2 });
    expect((await f.repository.findProjectById("a"))!.name).toBe("New project name");
    expect((await f.repository.findProjectById("b"))!.name).toBe("Project b");
    expect((await f.service.renameProject(manager, "a", value)).project.nameVersion).toBe(2);
    await expect(f.service.renameProject(f.actor("super"), "a", { ...value, name: "Stale title", idempotencyKey: "rename-stale-title" })).rejects.toMatchObject({ status: 409 });
    expect((await f.service.list(f.actor("client-a"), { limit: 20, offset: 0 })).items[0]!.project.name).toBe("New project name");
    expect((await f.service.events(manager, "a", before.cursor)).events.some(row => row.type === "participants.changed" && row.recordId === "a")).toBe(true);
    expect((await f.chatRepository.snapshot(tx => tx.notificationPage("electric-a", ["a"], 10, 0))).items[0]!.projectName).toBe("Project a");
  });

  it("rolls back name, removal and catalogue writes if audit fails", async () => {
    const f = createChatFixture();
    const service = createProjectChatService({ ...f, audit: { ...f.audit, append: async () => { throw new Error("injected audit failure"); } } });
    for (const write of [() => service.renameProject(f.actor("super"), "a", { name: "Rolled back", expectedVersion: 1, idempotencyKey: "rollback-rename" }), () => service.removeParticipant(f.actor("super"), "a", "designer-a", removal()), () => service.createActionType(f.actor("super"), "a", { name: "Rolled back", idempotencyKey: "rollback-catalogue" })]) await expect(write()).rejects.toThrow("injected audit failure");
    expect((await f.repository.findProjectById("a"))!.name).toBe("Project a");
    expect((await f.service.participants(f.actor("super"), "a")).items.some(row => row.id === "designer-a")).toBe(true);
    expect((await f.service.actionTypes(f.actor("super"), "a")).items).toHaveLength(2);
  });
});
