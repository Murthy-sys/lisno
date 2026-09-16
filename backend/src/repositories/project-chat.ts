import type { ChatAttachment, ChatAttachmentPolicy, ChatEvent, ChatFilter, ChatMessage, ChatPerson } from "../contracts/project-chat.js";
import type { Role } from "../domain/roles.js";
import type { EstimateWorkflowLine, ProjectWorkflowTaskKind } from "../domain/project-workflow.js";
import type { AppRepository, LeadRecord, ProjectAccessGrantRecord, ProjectRecord, UserRecord } from "./types.js";
import type { ClientSession } from "mongoose";
export interface ChatEstimateSource {
    id: string;
    projectId: string | null;
    leadId: string;
    ownerId: string;
    status: string;
    version: number;
    approvalRequired: boolean;
    assignedManagerId: string | null;
    assignedDesignerId: string | null;
    designPlanStatus: string | null;
    designPlanVersion: number;
    designPlanDesignerId: string | null;
    lineItems: EstimateWorkflowLine[];
}
export interface ChatWorkflowSource {
    id: string;
    projectId: string;
    estimateId: string;
    designPlanVersion: number;
    kind: ProjectWorkflowTaskKind;
    assigneeRole: Role;
    assigneeUserId: string | null;
    sourceSectionId: string | null;
    sourceLineItemKey: string | null;
}
export interface ChatSources {
    project: ProjectRecord;
    users: UserRecord[];
    leads: LeadRecord[];
    estimates: ChatEstimateSource[];
    workflowTasks: ChatWorkflowSource[];
    designTasks: {
        id: string;
        projectId: string;
        ownerId: string;
    }[];
    grants: ProjectAccessGrantRecord[];
}
export interface ChatSelection {
    id: string;
    projectId: string;
    userId: string;
    selectedRole: Role;
    active: boolean;
    version: number;
    selectedBy: ChatPerson;
    selectedAt: string;
    reason: string;
    tradeReference: {
        estimateId: string;
        designPlanVersion: number;
        role: Role;
    } | null;
    revokedBy: ChatPerson | null;
    revokedAt: string | null;
    revocationReason: string | null;
}
export type ChatStoredMessage = Omit<ChatMessage, "capabilities" | "issueHistory">;
export interface ChatStoredEvent extends ChatEvent {
    actorId: string;
    privateUserId: string | null;
}
export interface ChatOperation {
    id: string;
    projectId: string;
    actorId: string;
    key: string;
    fingerprint: string;
    recordId: string;
    kind: string;
}
export interface ChatState {
    sequence: number;
    latestMessageSequence: number;
    lastMessageAt: string | null;
}
export interface ChatReadState {
    projectId: string;
    userId: string;
    sequence: number;
    version: number;
    updatedAt: string;
}
export interface ChatHistoryRow {
    id: string;
    messageId: string;
    projectId: string;
    version: number;
    entry: ChatMessage["issueHistory"][number];
}
export interface ChatMessageScan {
    projectId: string;
    userId: string;
    filter: ChatFilter;
    before?: number;
    after?: number;
    atMost?: number;
    limit: number;
    ascending: boolean;
}
export interface ChatAttachmentRecord {
    id: string;
    projectId: string;
    uploaderId: string;
    clientUploadId: string;
    declaredBytes: number;
    reservedBytes: number;
    generation: number;
    version: number;
    status: "uploading" | "ready" | "attached" | "cleanup_pending" | "deleted";
    originalReference: string;
    previewReference: string;
    metadata: ChatAttachment | null;
    sha256: string | null;
    requestFilename: string | null;
    requestMimeType: string | null;
    transfer: {token: string; expiresAt: string; kind: "upload" | "replay"} | null;
    expiresAt: string | null;
    messageId: string | null;
    messagePosition: number | null;
    cleanupAfter: string | null;
    cleanup: {token: string; workerId: string; expiresAt: string; attempts: number; lastErrorCode: string | null} | null;
    createdAt: string;
    updatedAt: string;
}
export interface ChatAttachmentLease {
    projectId: string;
    id: string;
    generation: number;
    leaseToken: string;
}
export interface ChatAttachmentTransactions {
    attachments(projectId: string, ids: readonly string[]): Promise<ChatAttachmentRecord[]>;
    uploadByKey(projectId: string, uploaderId: string, clientUploadId: string): Promise<ChatAttachmentRecord | null>;
    reserveAttachment(record: ChatAttachmentRecord, limits: ChatAttachmentPolicy["limits"]): Promise<ChatAttachmentRecord>;
    finalizeAttachment(input: ChatAttachmentLease & {now: string; expiresAt: string; sha256: string; filename: string; claimedMimeType: string; metadata: ChatAttachment}): Promise<ChatAttachmentRecord>;
    finishAttachmentTransfer(input: ChatAttachmentLease & {now: string}): Promise<void>;
    associateAttachments(input: {projectId: string; uploaderId: string; ids: readonly string[]; messageId: string; now: string; maxCount: number; maxBytes: number}): Promise<ChatAttachment[]>;
    requestAttachmentCleanup(input: {projectId: string; uploaderId: string; id: string; now: string; lease?: {generation: number; token: string}}): Promise<ChatAttachmentRecord | null>;
    claimAttachmentCleanup(input: {now: string; leaseUntil: string; limit: number; workerId: string}): Promise<ChatAttachmentRecord[]>;
    settleAttachmentCleanup(input: ChatAttachmentLease & {expectedVersion: number; now: string; outcome: "deleted" | "retry"; nextAttemptAt?: string; errorCode?: string}): Promise<boolean>;
}
export interface ChatTypingRecord {
    id: string;
    projectId: string;
    userId: string;
    sessionScope: string;
    composerId: string;
    role: Role;
    sessionVersion: number;
    sessionExpiresAt: number;
    sequence: number;
    expiresAt: string | null;
    updatedAt: string;
    cleanupAt: string;
}
export interface ChatTypingRateRecord {
    id: string;
    projectId: string;
    userId: string;
    windowStartedAt: string;
    activeUpdates: number;
    cleanupAt: string;
}
export interface ChatTransaction extends ChatAttachmentTransactions {
    typingByComposer(projectId: string, userId: string, sessionScope: string, composerId: string): Promise<ChatTypingRecord | null>;
    typingByUser(projectId: string, userId: string, now: string, limit: number): Promise<ChatTypingRecord[]>;
    activeTyping(projectId: string, now: string, limit: number): Promise<ChatTypingRecord[]>;
    saveTyping(record: ChatTypingRecord): Promise<void>;
    typingRate(projectId: string, userId: string): Promise<ChatTypingRateRecord | null>;
    saveTypingRate(record: ChatTypingRateRecord): Promise<void>;
    app: AppRepository;
    session?: ClientSession;
    sources(projectId: string): Promise<ChatSources | null>;
    candidateProjectIds(user: UserRecord): Promise<string[]>;
    /** Lightweight global page, consumed only after verifying the sole active Super Admin. */
    projectPage(input: {limit: number; offset: number}): Promise<{
        items: Array<{id: string; name: string; lastMessageAt: string | null}>;
        total: number;
    }>;
    directory(input: {
        search: string;
        roles: Role[];
        excludeIds: string[];
        limit: number;
    }): Promise<UserRecord[]>;
    selections(projectId: string): Promise<ChatSelection[]>;
    saveSelection(selection: ChatSelection): Promise<void>;
    findSelection(projectId: string, id: string): Promise<ChatSelection | null>;
    state(projectId: string): Promise<ChatState>;
    allocate(projectId: string, messageAt?: string): Promise<number>;
    message(projectId: string, id: string): Promise<ChatStoredMessage | null>;
    messages(scan: ChatMessageScan): Promise<ChatStoredMessage[]>;
    saveMessage(message: ChatStoredMessage): Promise<void>;
    history(projectId: string, messageId: string): Promise<ChatMessage["issueHistory"]>;
    appendHistory(row: ChatHistoryRow): Promise<void>;
    counts(projectId: string, userId: string, readSequence: number): Promise<{
        openCritical: number;
        openImportant: number;
        unread: number;
        unreadMentions: number;
    }>;
    recentSendCount(projectId: string, userId: string, since: string): Promise<number>;
    readState(projectId: string, userId: string): Promise<ChatReadState | null>;
    saveReadState(state: ChatReadState): Promise<void>;
    operation(projectId: string, actorId: string, kind: string, key: string): Promise<ChatOperation | null>;
    saveOperation(operation: ChatOperation): Promise<void>;
    appendEvent(event: ChatStoredEvent): Promise<void>;
    events(projectId: string, after: number, atMost: number, limit: number): Promise<ChatStoredEvent[]>;
}
export interface ProjectChatRepository {
    kind: "memory" | "mongo";
    snapshot<T>(operation: (transaction: ChatTransaction) => Promise<T>): Promise<T>;
    mutate<T>(operation: (transaction: ChatTransaction) => Promise<T>): Promise<T>;
}
