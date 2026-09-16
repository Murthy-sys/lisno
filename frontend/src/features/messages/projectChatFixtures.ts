// Synthetic conversation fixtures used by the feature's isolated tests.
import type { ChatAttachmentPolicy, ChatMessage, ChatMessagePage, ChatParticipant, ChatSummary } from "./projectChatTypes";

export const chatTestPeople: ChatParticipant[] = [
  { id: "client-a", name: "Maya Client", role: "client", sources: [{ kind: "client", id: "project-a" }], selection: null },
  { id: "worker-a", name: "Alex Team", role: "worker_plumber", sources: [{ kind: "workflow_assignment", id: "task-a" }], selection: null },
  { id: "worker-b", name: "Alex Team", role: "worker_electrician", sources: [{ kind: "selection", id: "selection-b" }], selection: { id: "selection-b", version: 2 } }
];
export function chatTestMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "message-a", projectId: "project-a", author: chatTestPeople[0], attachments: [], body: "Please confirm the kitchen outlet position.", mentions: [], createdAt: "2026-09-16T08:00:00Z", sequence: 3, clientMessageId: "attempt-a", replyTo: null, priority: "normal", issueStatus: null, raisedBy: null, responsible: null, version: 1, issueHistory: [], capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }, ...overrides };
}
export function chatTestSummary(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return { project: { id: "project-a", name: "Courtyard residence", status: "active" }, counts: { openCritical: 3, openImportant: 2, unread: 2, unreadMentions: 1 }, participantCount: 3, cursor: "snapshot-a", lastReadSequence: 0, latestMessageSequence: 3, capabilities: { canSend: true, canManageParticipants: true, canManageIssues: true }, setupWarnings: [], ...overrides };
}
export function chatTestPage(items = [chatTestMessage()]): ChatMessagePage { return { items, olderCursor: null, newerCursor: null, snapshotCursor: "snapshot-a", latestMessageSequence: items.at(-1)?.sequence ?? 0 }; }

export function chatTestPolicy(): ChatAttachmentPolicy {
  return { enabled: true, capabilities: { canUpload: true, canRecord: true }, limits: { maxAttachments: 10, maxFileBytes: 50 * 1024 * 1024, maxMessageBytes: 100 * 1024 * 1024, maxConcurrentTransfers: 2, maxStagedAttachments: 20, maxStagedBytes: 200 * 1024 * 1024, stagedTtlSeconds: 86400, maxRecordingSeconds: 300 }, formats: [
    { kind: "image", label: "Images", extensions: [".jpg", ".png", ".webp", ".gif", ".heic", ".tiff"], mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
    { kind: "video", label: "Videos", extensions: [".mp4", ".mov", ".webm"], mimeTypes: ["video/mp4", "video/quicktime", "video/webm"] },
    { kind: "audio", label: "Audio", extensions: [".mp3", ".m4a", ".wav", ".ogg", ".webm"], mimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"] },
    { kind: "document", label: "Documents", extensions: [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".csv"], mimeTypes: ["application/pdf", "text/plain", "text/csv"] },
    { kind: "archive", label: "ZIP", extensions: [".zip"], mimeTypes: ["application/zip"] }
  ], recordingMimeTypes: ["audio/webm;codecs=opus", "audio/mp4"] };
}
