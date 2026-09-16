import type { Role } from "../domain/roles.js";

export type ChatPriority = "normal" | "important" | "critical";
export type ChatIssueStatus = "open" | "resolved" | null;
export type ChatFilter = "all" | "mentions" | "critical" | "important" | "resolved";

export type ChatAttachmentKind = "image" | "video" | "audio" | "document" | "archive";
export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  preview: { mimeType: string; byteSize: number; width: number; height: number } | null;
}
export interface ChatAttachmentSummary {
  count: number;
  kind: ChatAttachmentKind;
  filename: string;
}
export interface ChatStagedAttachment {
  clientUploadId: string;
  attachment: ChatAttachment;
  expiresAt: string;
}
export interface ChatAttachmentPolicy {
  enabled: boolean;
  capabilities: { canUpload: boolean; canRecord: boolean };
  limits: {
    maxAttachments: number;
    maxFileBytes: number;
    maxMessageBytes: number;
    maxConcurrentTransfers: number;
    maxStagedAttachments: number;
    maxStagedBytes: number;
    stagedTtlSeconds: number;
    maxRecordingSeconds: number;
  };
  formats: Array<{ kind: ChatAttachmentKind; label: string; extensions: string[]; mimeTypes: string[] }>;
  recordingMimeTypes: string[];
}

export interface ChatPerson {
  id: string;
  name: string;
  role: Role;
}
export interface ChatMembershipSource {
  kind: "client" | "super_admin" | "project_assignment" | "estimate_assignment" | "workflow_assignment" | "access_grant" | "selection";
  id: string;
}
export interface ChatParticipant extends ChatPerson {
  sources: ChatMembershipSource[];
  selection: { id: string; version: number } | null;
}
export interface ChatMention {
  userId: string;
  start: number;
  end: number;
}
export interface ChatIssueHistory {
  id: string;
  action: ChatIssueAction;
  actor: ChatPerson;
  occurredAt: string;
  note: string;
  priority: ChatPriority;
  status: ChatIssueStatus;
  responsibleUserId: string | null;
}
export interface ChatMessage {
  id: string;
  projectId: string;
  author: ChatPerson;
  body: string;
  attachments: ChatAttachment[];
  mentions: ChatMention[];
  createdAt: string;
  sequence: number;
  clientMessageId: string;
  replyTo: { id: string; author: ChatPerson; body: string; attachmentSummary?: ChatAttachmentSummary | null } | null;
  priority: ChatPriority;
  issueStatus: ChatIssueStatus;
  raisedBy: ChatPerson | null;
  responsible: (ChatPerson & { available: boolean }) | null;
  version: number;
  issueHistory: ChatIssueHistory[];
  capabilities: {
    canRaise: boolean;
    canResolve: boolean;
    canReopen: boolean;
    canAssign: boolean;
    canAssignSelf: boolean;
  };
}
export interface ChatCounts {
  openCritical: number;
  openImportant: number;
  unread: number;
  unreadMentions: number;
}
export interface ChatSummary {
  project: { id: string; name: string; status: string };
  counts: ChatCounts;
  participantCount: number;
  cursor: string;
  lastReadSequence: number;
  latestMessageSequence: number;
  capabilities: { canSend: boolean; canManageParticipants: boolean; canManageIssues: boolean };
  setupWarnings: string[];
}
export interface ChatConversation extends ChatSummary {
  lastMessageAt: string | null;
}
export interface ChatConversationPage {
  items: ChatConversation[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}
export interface ChatParticipantPage {
  items: ChatParticipant[];
  setupWarnings: string[];
}
export interface ChatParticipantOptions {
  items: ChatPerson[];
  hasMore: boolean;
}
export interface ChatMessagePage {
  items: ChatMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
  snapshotCursor: string;
  latestMessageSequence: number;
}
export interface ChatMessageQuery {
  limit?: number;
  before?: string;
  after?: string;
  around?: string;
  filter?: ChatFilter;
}
export interface ChatSendInput {
  body: string;
  attachmentIds?: string[];
  mentions: ChatMention[];
  replyToId?: string | null;
  priority: ChatPriority;
  responsibleUserId?: string | null;
  clientMessageId: string;
}
export type ChatIssueAction = "raise" | "escalate" | "resolve" | "reopen" | "lower" | "clear" | "assign";
export interface ChatIssueInput {
  action: ChatIssueAction;
  expectedVersion: number;
  idempotencyKey: string;
  priority?: "important" | "critical";
  responsibleUserId?: string | null;
  note?: string;
}
export interface ChatParticipantInput {
  userId: string;
  reason: string;
  idempotencyKey: string;
}
export interface ChatParticipantRevokeInput {
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}
export interface ChatReadInput {
  messageId: string;
  sequence: number;
}
export interface ChatReadResult {
  lastReadSequence: number;
  counts: ChatCounts;
}
export type ChatEventType = "message.created" | "issue.changed" | "participants.changed" | "read.changed";
export interface ChatEvent {
  id: string;
  projectId: string;
  sequence: number;
  type: ChatEventType;
  recordId: string;
  version: number;
  occurredAt: string;
}
export interface ChatEventBatch {
  membershipVersion?: string;
  events: ChatEvent[];
  cursor: string;
  hasMore: boolean;
  resync: boolean;
}
export interface ChatStreamState {
  status: "connecting" | "live" | "reconnecting" | "unavailable" | "denied";
}

/** Transient composer activity; never contains draft text or client-asserted identity. */
export interface ChatTypingInput {
  composerId: string;
  sequence: number;
  typing: boolean;
}
export interface ChatTypingResult {
  sequence: number;
  typing: boolean;
  expiresAt: string | null;
}
export interface ChatTypingSnapshot {
  projectId: string;
  serverTime: string;
  participants: Array<{ userId: string; name: string; expiresAt: string }>;
}

/** Construct only after JWT authentication; recheck these claims inside writes. */
export interface ChatActor {
  id: string;
  role: Role;
  sessionVersion: number;
  expiresAt: number;
}
export interface ProjectChatTypingService {
  update(actor: ChatActor, projectId: string, input: ChatTypingInput, receivedAt?: number): Promise<ChatTypingResult>;
  /** Resolve and enqueue the current, authorized names under the delivery fence. */
  deliver(actor: ChatActor, projectId: string, enqueue: (snapshot: ChatTypingSnapshot) => void): Promise<void>;
}
export interface ProjectChatService {
  list(actor: ChatActor, input: { limit: number; offset: number }): Promise<ChatConversationPage>;
  summary(actor: ChatActor, projectId: string): Promise<ChatSummary>;
  participants(actor: ChatActor, projectId: string): Promise<ChatParticipantPage>;
  participantOptions(actor: ChatActor, projectId: string, input: { search: string; limit: number }): Promise<ChatParticipantOptions>;
  addParticipant(actor: ChatActor, projectId: string, input: ChatParticipantInput): Promise<ChatParticipantPage>;
  revokeParticipant(actor: ChatActor, projectId: string, selectionId: string, input: ChatParticipantRevokeInput): Promise<ChatParticipantPage>;
  messages(actor: ChatActor, projectId: string, input: ChatMessageQuery): Promise<ChatMessagePage>;
  send(actor: ChatActor, projectId: string, input: ChatSendInput): Promise<ChatMessage>;
  issue(actor: ChatActor, projectId: string, messageId: string, input: ChatIssueInput): Promise<ChatMessage>;
  read(actor: ChatActor, projectId: string, input: ChatReadInput): Promise<ChatReadResult>;
  /** Synchronously enqueue a prepared event batch under the current authorization fence. */
  authorizeDelivery(actor: ChatActor, projectId: string, enqueue: () => void): Promise<void>;
  events(actor: ChatActor, projectId: string, cursor: string | undefined, limit?: number): Promise<ChatEventBatch>;
}
