import { ROLE_CODES } from "../domain/roles.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 200 };
const integer = { type: "integer", minimum: 0 };
const version = { type: "integer", minimum: 1 };
const calendarDate = { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const timestamp = { type: "string", format: "date-time" };
const nullableId = { ...id, nullable: true };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const array = (name: string) => ({ type: "array", items: ref(name) });
const nullable = (name: string) => ({ allOf: [ref(name)], nullable: true });
const priority = { type: "string", enum: ["normal", "important", "critical"] };
const issueStatus = { type: "string", nullable: true, enum: ["open", "resolved", null] };
const attachmentKind = { type: "string", enum: ["image", "video", "audio", "document", "archive"] };
const issueAction = { type: "string", enum: ["raise", "escalate", "resolve", "reopen", "lower", "clear", "assign", "reschedule"] };
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const query = (name: string, schema: unknown) => ({ name, in: "query", required: false, schema });

const summaryProperties = { project: object({ id, name: { type: "string" }, status: { type: "string" }, nameVersion: version }, ["id", "name", "status"]), counts: ref("ChatCounts"), participantCount: integer, cursor: { type: "string" }, lastReadSequence: integer, latestMessageSequence: integer, capabilities: ref("ChatCapabilities"), setupWarnings: { type: "array", items: { type: "string" } } };

export const CHAT_COMPONENT_SCHEMAS: Record<string, Record<string, unknown>> = {
  ChatNotification: object({id, type: {type: "string", enum: ["chat.mention", "chat.mention.oversight"]}, projectId: id, projectName: {type: "string"}, messageId: id, actor: object({id, name: {type: "string"}}), excerpt: {type: "string", maxLength: 240}, createdAt: timestamp, readAt: {...timestamp, nullable: true}}),
  NotificationPage: object({items: array("ChatNotification"), unreadCount: integer, pagination: ref("Pagination")}),
  ChatAttachment: object({ id, kind: attachmentKind, filename: { type: "string" }, mimeType: { type: "string" }, byteSize: version,
    preview: { ...object({ mimeType: { type: "string" }, byteSize: version, width: version, height: version }), nullable: true } }),
  ChatAttachmentSummary: object({ count: version, kind: attachmentKind, filename: { type: "string" } }),
  ChatStagedAttachment: object({ clientUploadId: id, attachment: ref("ChatAttachment"), expiresAt: timestamp }),
  ChatAttachmentDiscardResult: object({ id, discarded: { type: "boolean", enum: [true] } }),
  ChatAttachmentPolicy: object({ enabled: { type: "boolean" }, capabilities: object({ canUpload: { type: "boolean" }, canRecord: { type: "boolean" } }),
    limits: object(Object.fromEntries(["maxAttachments", "maxFileBytes", "maxMessageBytes", "maxConcurrentTransfers", "maxStagedAttachments", "maxStagedBytes", "stagedTtlSeconds", "maxRecordingSeconds"].map(key => [key, version]))),
    formats: { type: "array", items: object({ kind: attachmentKind, label: { type: "string" }, extensions: { type: "array", items: { type: "string" } }, mimeTypes: { type: "array", items: { type: "string" } } }) },
    recordingMimeTypes: { type: "array", items: { type: "string" } }
  }),
  ChatPerson: object({ id, name: { type: "string" }, role: { type: "string", enum: ROLE_CODES } }),
  ChatMembershipSource: object({ kind: { type: "string", enum: ["client", "super_admin", "project_assignment", "estimate_assignment", "workflow_assignment", "access_grant", "selection"] }, id }),
  ChatParticipant: object({ id, name: { type: "string" }, role: { type: "string", enum: ROLE_CODES }, sources: array("ChatMembershipSource"), selection: { ...object({ id, version }), nullable: true }, removalVersion: integer, canRemove: { type: "boolean" }, removalBlockedReason: { type: "string", nullable: true } }, ["id", "name", "role", "sources", "selection"]),
  ChatParticipantPage: object({ items: array("ChatParticipant"), setupWarnings: { type: "array", items: { type: "string" } }, removed: { type: "array", items: object({ id, name: { type: "string" }, role: { type: "string", enum: ROLE_CODES }, removalVersion: version, canRestore: { type: "boolean" } }) } }, ["items", "setupWarnings"]),
  ChatParticipantOptions: object({ items: array("ChatPerson"), hasMore: { type: "boolean" } }),
  ChatMention: object({ userId: id, start: integer, end: { type: "integer", minimum: 1 } }),
  ChatCounts: object({ openCritical: integer, openImportant: integer, unread: integer, unreadMentions: integer }),
  ChatCapabilities: object({ canSend: { type: "boolean" }, canManageParticipants: { type: "boolean" }, canManageIssues: { type: "boolean" }, canRenameProject: { type: "boolean" } }, ["canSend", "canManageParticipants", "canManageIssues"]),
  ChatSummary: object(summaryProperties),
  ChatLastMessageAttachment: object({ id, kind: attachmentKind, filename: { type: "string" }, hasPreview: { type: "boolean" } }),
  ChatLastMessage: object({ id, author: ref("ChatPerson"), excerpt: { type: "string", maxLength: 120, description: "Plain-text preview; empty when the message has only attachments." }, createdAt: timestamp, attachments: { ...array("ChatLastMessageAttachment"), maxItems: 3 }, attachmentCount: integer }),
  ChatConversation: object({ ...summaryProperties, lastMessageAt: { ...timestamp, nullable: true }, lastMessage: nullable("ChatLastMessage") }),
  ChatConversationTotals: object({ unread: { ...integer, description: "Conversations with unread messages." }, critical: { ...integer, description: "Open critical issues." }, important: { ...integer, description: "Open important issues." } }),
  ChatConversationPage: object({ items: array("ChatConversation"), pagination: ref("Pagination"), totals: { allOf: [ref("ChatConversationTotals")], description: "Across every authorized conversation; ignores filter and search." } }),
  ChatActionType: object({ id, name: { type: "string", minLength: 1, maxLength: 60 }, priority: { type: "string", enum: ["important", "critical"] }, builtIn: { type: "boolean" } }),
  ChatActionTypePage: object({ items: array("ChatActionType"), canCreate: { type: "boolean" } }),
  ChatActionMetadata: object({ typeId: id, typeName: { type: "string" }, originalDueDate: calendarDate, dueDate: calendarDate }),
  ChatActionTypeRequest: object({ name: { type: "string", minLength: 1, maxLength: 60 }, idempotencyKey: { ...id, minLength: 8 } }),
  ChatProjectNameRequest: object({ name: { type: "string", minLength: 1, maxLength: 200 }, expectedVersion: version, idempotencyKey: { ...id, minLength: 8 } }),
  ChatParticipantRemovalRequest: object({ expectedVersion: integer, reason: { type: "string", minLength: 1, maxLength: 1000 }, idempotencyKey: { ...id, minLength: 8 } }),
  ChatIssueHistory: object({ id, action: issueAction, actor: ref("ChatPerson"), occurredAt: timestamp, note: { type: "string" }, priority, status: issueStatus, responsibleUserId: nullableId, actionMetadata: nullable("ChatActionMetadata") }, ["id", "action", "actor", "occurredAt", "note", "priority", "status", "responsibleUserId"]),
  ChatResponsible: object({ id, name: { type: "string" }, role: { type: "string", enum: ROLE_CODES }, available: { type: "boolean" } }),
  ChatMessage: object({
    id, projectId: id, author: ref("ChatPerson"), body: { type: "string", maxLength: 4000 }, attachments: array("ChatAttachment"), mentions: array("ChatMention"),
    createdAt: timestamp, sequence: version, clientMessageId: id,
    replyTo: { ...object({ id, author: ref("ChatPerson"), body: { type: "string" }, attachmentSummary: nullable("ChatAttachmentSummary") }, ["id", "author", "body"]), nullable: true },
    action: nullable("ChatActionMetadata"), priority, issueStatus, raisedBy: nullable("ChatPerson"), responsible: nullable("ChatResponsible"), version,
    issueHistory: array("ChatIssueHistory"),
    capabilities: object(Object.fromEntries(["canRaise", "canResolve", "canReopen", "canAssign", "canAssignSelf", "canReschedule"].map((key) => [key, { type: "boolean" }])))
  }, ["id", "projectId", "author", "body", "attachments", "mentions", "createdAt", "sequence", "clientMessageId", "replyTo", "priority", "issueStatus", "raisedBy", "responsible", "version", "issueHistory", "capabilities"]),
  ChatMessagePage: object({ items: array("ChatMessage"), olderCursor: { type: "string", nullable: true }, newerCursor: { type: "string", nullable: true }, snapshotCursor: { type: "string" }, latestMessageSequence: integer }),
  ChatSendRequest: object({ body: { type: "string", maxLength: 4000, description: "Caption may be empty only when attachmentIds contains at least one ready upload." }, attachmentIds: { type: "array", items: id, uniqueItems: true, maxItems: 10, default: [] }, mentions: { ...array("ChatMention"), maxItems: 80, description: "UTF-16 text spans; at most 20 distinct current participant IDs." }, replyToId: nullableId, action: object({ typeId: id, dueDate: calendarDate }), priority, responsibleUserId: nullableId, clientMessageId: { ...id, minLength: 8 } }, ["body", "clientMessageId"]),
  ChatIssueRequest: object({ action: issueAction, expectedVersion: version, idempotencyKey: { ...id, minLength: 8 }, priority: { type: "string", enum: ["important", "critical"] }, responsibleUserId: nullableId, note: { type: "string", maxLength: 1000 }, dueDate: calendarDate }, ["action", "expectedVersion", "idempotencyKey"]),
  ChatParticipantRequest: object({ userId: id, reason: { type: "string", minLength: 1, maxLength: 1000 }, idempotencyKey: { ...id, minLength: 8 } }),
  ChatParticipantRevokeRequest: object({ expectedVersion: version, reason: { type: "string", minLength: 1, maxLength: 1000 }, idempotencyKey: { ...id, minLength: 8 } }),
  ChatReadRequest: object({ messageId: id, sequence: version }),
  ChatReadResult: object({ lastReadSequence: integer, counts: ref("ChatCounts") }),
  ChatTypingRequest: { ...object({ composerId: { type: "string", minLength: 16, maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" }, sequence: { ...integer, maximum: Number.MAX_SAFE_INTEGER }, typing: { type: "boolean" } }), additionalProperties: false },
  ChatTypingResult: object({ sequence: integer, typing: { type: "boolean" }, expiresAt: { ...timestamp, nullable: true } }),
  ChatTypingSnapshot: object({ projectId: id, serverTime: timestamp, participants: { type: "array", maxItems: 100, items: object({ userId: id, name: { type: "string", minLength: 1, maxLength: 300 }, expiresAt: timestamp }) } }),
  ChatEvent: object({ id, projectId: id, sequence: version, type: { type: "string", enum: ["message.created", "issue.changed", "participants.changed", "read.changed"] }, recordId: id, version, occurredAt: timestamp }),
  ChatEventBatch: object({ events: array("ChatEvent"), cursor: { type: "string" }, hasMore: { type: "boolean" }, resync: { type: "boolean" }, membershipVersion: { type: "string" } }, ["events", "cursor", "hasMore", "resync"])
};

export const CHAT_REQUEST_BODIES = {
  "POST /projects/:projectId/chat/action-types": json("ChatActionTypeRequest"),
  "PATCH /projects/:projectId/chat/project-name": json("ChatProjectNameRequest"),
  "POST /projects/:projectId/chat/participants/:userId/remove": json("ChatParticipantRemovalRequest"),
  "POST /projects/:projectId/chat/participants/:userId/restore": json("ChatParticipantRemovalRequest"),
  "POST /projects/:projectId/chat/attachments": { required: true, content: { "multipart/form-data": { schema: object({ file: { type: "string", format: "binary" } }) } } },
  "POST /projects/:projectId/chat/messages": json("ChatSendRequest"),
  "PATCH /projects/:projectId/chat/messages/:messageId/issue": json("ChatIssueRequest"),
  "POST /projects/:projectId/chat/participants": json("ChatParticipantRequest"),
  "POST /projects/:projectId/chat/participants/:selectionId/revoke": json("ChatParticipantRevokeRequest"),
  "PUT /projects/:projectId/chat/read": json("ChatReadRequest"),
  "PUT /projects/:projectId/chat/typing": json("ChatTypingRequest")
};
export const CHAT_RESPONSE_SCHEMAS = {
  "GET /projects/:projectId/chat/action-types": "ChatActionTypePage",
  "POST /projects/:projectId/chat/action-types": "ChatActionType",
  "PATCH /projects/:projectId/chat/project-name": "ChatSummary",
  "POST /projects/:projectId/chat/participants/:userId/remove": "ChatParticipantPage",
  "POST /projects/:projectId/chat/participants/:userId/restore": "ChatParticipantPage",
  "GET /notifications": "NotificationPage",
  "PUT /notifications/:notificationId/read": "ChatNotification",
  "GET /projects/:projectId/chat/attachment-policy": "ChatAttachmentPolicy",
  "POST /projects/:projectId/chat/attachments": "ChatStagedAttachment",
  "DELETE /projects/:projectId/chat/attachments/:attachmentId": "ChatAttachmentDiscardResult",
  "GET /project-messages": "ChatConversationPage",
  "GET /projects/:projectId/chat": "ChatSummary",
  "GET /projects/:projectId/chat/participants": "ChatParticipantPage",
  "GET /projects/:projectId/chat/participant-options": "ChatParticipantOptions",
  "POST /projects/:projectId/chat/participants": "ChatParticipantPage",
  "POST /projects/:projectId/chat/participants/:selectionId/revoke": "ChatParticipantPage",
  "GET /projects/:projectId/chat/messages": "ChatMessagePage",
  "POST /projects/:projectId/chat/messages": "ChatMessage",
  "PATCH /projects/:projectId/chat/messages/:messageId/issue": "ChatMessage",
  "PUT /projects/:projectId/chat/read": "ChatReadResult",
  "PUT /projects/:projectId/chat/typing": "ChatTypingResult"
};
export const CHAT_QUERY_PARAMETERS = {
  "GET /notifications": [query("limit", {type: "integer", minimum: 1, maximum: 50, default: 20}), query("offset", {...integer, maximum: 100000, default: 0})],
  "POST /projects/:projectId/chat/attachments": [
    { ...query("uploadId", { type: "string", minLength: 8, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$", description: "Stable per-file retry identity; changed bytes conflict." }), required: true },
    { ...query("sizeBytes", { type: "integer", minimum: 1, maximum: 52428800, description: "Reservation size; must equal measured file bytes. Policy may impose a smaller limit." }), required: true }
  ],
  "GET /project-messages": [query("limit", { type: "integer", minimum: 1, maximum: 50, default: 20 }), query("offset", { ...integer, maximum: 100000 }), query("filter", { type: "string", enum: ["all", "unread", "critical", "important"], default: "all" }), query("search", { type: "string", maxLength: 100, description: "Case-insensitive project-name match." })],
  "GET /projects/:projectId/chat/participant-options": [query("search", { type: "string", maxLength: 100 }), query("limit", { type: "integer", minimum: 1, maximum: 50, default: 20 })],
  "GET /projects/:projectId/chat/messages": [query("limit", { type: "integer", minimum: 1, maximum: 100, default: 50 }), ...["before", "after"].map((key) => query(key, { type: "string", maxLength: 1000 })), query("around", id), query("filter", { type: "string", enum: ["all", "mentions", "critical", "important", "resolved"] })],
  "GET /projects/:projectId/chat/events": [query("cursor", { type: "string", maxLength: 512, description: "Opaque project replay cursor. Never include credentials." })]
};
