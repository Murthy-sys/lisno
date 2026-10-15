import { ApiProtocolError } from "../../core/http/apiClient";
import { mentionsAfterEdit, trimMentionedMessage, isChatDueDate } from "./chatDraftMetadata";
import { parseTypingSnapshot, renameChatProject } from "./chatEnhancementsApi";
import { createChatTypingActivity } from "./chatTypingActivity";
import { mergeMessagePages, presentMessage, presentChatParticipantPage } from "./chatModel";
import { parseAssistantResult } from "./chatAssistantModel";
import type { MobileRuntime } from "../../runtime/createRuntime";
const assistant = { runId: "run-a", generation: 2, stateVersion: 3, status: "answered", eligibleAt: "2026-10-14T00:00:00Z", resultId: "result-a", checkedAt: "2026-10-14T00:00:00Z", notified: null, routing: "not_required", canRequest: false, failureCode: null };
const message = { id: "message-a", projectId: "project-a", body: "Reply", author: { kind: "service", id: "lisno-ai", name: "Lisno AI" }, createdAt: "2026-10-14T00:00:00Z", sequence: 5, version: 2, clientMessageId: "service-message", attachments: [], mentions: [], replyTo: null, priority: "normal", issueStatus: null, capabilities: { canRaise: false, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }, assistant };
it("keeps structured mention offsets intact across insertions, trimming and edits inside a mention", () => {
 const spans = [{ userId: "person-one", start: 2, end: 7 }]; expect(trimMentionedMessage("  @Mira please  ", spans)).toEqual({ body: "@Mira please", mentions: [{ userId: "person-one", start: 0, end: 5 }] });
 expect(mentionsAfterEdit("Hi @Mira", "Hello Hi @Mira", [{ userId: "person-one", start: 3, end: 8 }])).toEqual([{ userId: "person-one", start: 9, end: 14 }]); expect(mentionsAfterEdit("@Mira", "@Mina", [{ userId: "person-one", start: 0, end: 5 }])).toEqual([]);
 expect(isChatDueDate("2026-02-29")).toBe(false); expect(isChatDueDate("2028-02-29")).toBe(true);
});
it("validates and expires server-relative typing leases while excluding the viewer", () => {
 expect(parseTypingSnapshot({ projectId: "project-a", serverTime: "2026-10-14T00:00:00Z", participants: [{ userId: "me", name: "Me", expiresAt: "2026-10-14T00:00:08Z" }, { userId: "other", name: "Other", expiresAt: "2026-10-14T00:00:05Z" }] }, "project-a", "me", 1000)).toEqual([{ userId: "other", name: "Other", expiresAt: 6000 }]);
 expect(parseTypingSnapshot({ projectId: "other", serverTime: "invalid", participants: [] }, "project-a", "me")).toEqual([]);
});
it("publishes typing only on edits, throttles refreshes and ends presence after idle/disposal", async () => {
 jest.useFakeTimers(); let sequence = 0; const publish = jest.fn(async input => ({ ...input, expiresAt: null })); const activity = createChatTypingActivity({ composerId: "composer-a", nextSequence: () => ++sequence, publish });
 expect(publish).not.toHaveBeenCalled(); activity.edit("Hello"); activity.edit("Hello again"); expect(publish).toHaveBeenCalledTimes(1); expect(publish.mock.calls[0]?.[0]).toMatchObject({ sequence: 1, typing: true });
 jest.advanceTimersByTime(3001); await Promise.resolve(); expect(publish.mock.calls[1]?.[0]).toMatchObject({ sequence: 2, typing: false }); activity.dispose(); jest.useRealTimers();
});
it("accepts only the explicit AI service identity and merges newer assistant state on an unchanged message version", () => {
 const valid = presentMessage(message)!; expect(valid.authorRole).toBe("service"); expect(presentMessage({ ...message, author: { kind: "service", id: "fake-service", name: "Other" } })).toBeNull();
 const old = presentMessage({ ...message, assistant: { ...assistant, generation: 1, stateVersion: 99 } })!;
 expect(mergeMessagePages([{ items: [valid] }, { items: [old] }])[0]?.assistant?.generation).toBe(2);
 expect(presentChatParticipantPage({ items: [{ kind: "service", id: "lisno-ai", name: "Lisno AI", sources: [], selection: null }], setupWarnings: [] })).toBeNull();
});
it("strips restricted assistant commercial details and rejects cross-project answer identities", () => {
 const input = { id: "result-a", projectId: "project-a", messageId: "question-a", kind: "price", checkedAt: "2026-10-14T00:00:00Z", stale: true, commercialAccess: "restricted", facts: [], candidates: [], missingInputs: [], commercial: { internalCost: 800000, totalPaise: 990000 } };
 expect(parseAssistantResult(input, "project-a", "result-a").commercial).toBeNull(); expect(() => parseAssistantResult(input, "project-b", "result-a")).toThrow(ApiProtocolError);
});
it("requires an advancing, identity-bound project-name acknowledgement", async () => {
 const summary = { project: { id: "project-a", name: "New name", status: "active", nameVersion: 4 }, counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 }, participantCount: 1, cursor: "", lastReadSequence: 0, latestMessageSequence: 0, capabilities: { canSend: true, canManageParticipants: true, canManageIssues: true, canRenameProject: true }, setupWarnings: [] };
 const patch = jest.fn().mockResolvedValue(summary); const runtime = { api: { authenticated: { patch } } } as unknown as MobileRuntime;
 await renameChatProject(runtime, "project-a", { name: "New name", expectedVersion: 3, idempotencyKey: "rename-key" });
 patch.mockResolvedValue({ ...summary, project: { ...summary.project, nameVersion: 3 } }); await expect(renameChatProject(runtime, "project-a", { name: "New name", expectedVersion: 3, idempotencyKey: "rename-key" })).rejects.toThrow(ApiProtocolError);
});
