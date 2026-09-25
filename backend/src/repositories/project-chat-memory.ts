import type { NotificationRecord } from "./notifications.js";
import { chatConflict } from "../domain/project-chat.js";
import type { ChatActionTypeRecord, ChatExclusion, ChatAttachmentRecord, ChatEstimateSource, ChatHistoryRow, ChatMessageScan, ChatOperation, ChatReadState, ChatSelection, ChatSources, ChatState, ChatStoredEvent, ChatStoredMessage, ChatTransaction, ChatTypingRecord, ChatTypingRateRecord, ChatWorkflowSource, ProjectChatRepository } from "./project-chat.js";
import { createChatAttachmentOperations } from "./project-chat-attachment-operations.js";
import type { AppRepository, ProjectRecord, UserRecord } from "./types.js";
import type { ProjectModule } from "../domain/authorization.js";
/** Supplemental current sources that AppRepository intentionally does not store in memory. Arrays remain live so reassignment tests exercise fresh snapshots. */
export interface MemoryChatSources {
    estimates?: ChatEstimateSource[];
    workflowTasks?: ChatWorkflowSource[];
    projectIds?: string[];
}
interface MemoryChatState {
    exclusions: ChatExclusion[];
    actionTypes: ChatActionTypeRecord[];
    notifications: NotificationRecord[];
    selections: ChatSelection[];
    messages: ChatStoredMessage[];
    states: Record<string, ChatState>;
    reads: ChatReadState[];
    operations: ChatOperation[];
    events: ChatStoredEvent[];
    histories: ChatHistoryRow[];
    attachments: ChatAttachmentRecord[];
    typing: ChatTypingRecord[];
    typingRates: ChatTypingRateRecord[];
}
const modules: ProjectModule[] = ["projects", "design", "procurement", "finance", "execution"];
const copy = <T>(value: T): T => structuredClone(value);
export function createMemoryProjectChatRepository(repository: AppRepository, supplemental: MemoryChatSources = {}): ProjectChatRepository {
    let state: MemoryChatState = { exclusions: [], actionTypes: [], notifications: [], selections: [], messages: [], states: {}, reads: [], operations: [], events: [], histories: [], attachments: [], typing: [], typingRates: [] };
    let tail: Promise<void> = Promise.resolve();
    const run = async <T>(write: boolean, operation: (tx: ChatTransaction) => Promise<T>): Promise<T> => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
            const staged = copy(state);
            const result = await repository.runInTransaction(async (app) => {
                if (write)
                    await app.coordinateAuthorizationMutation();
                return operation(memoryTransaction(app, staged, supplemental));
            });
            if (write)
                state = staged;
            return copy(result);
        }
        finally {
            release();
        }
    };
    return { kind: "memory", snapshot: operation => run(false, operation), mutate: operation => run(true, operation) };
}
function memoryTransaction(app: AppRepository, state: MemoryChatState, supplemental: MemoryChatSources): ChatTransaction {
    const allProjects = async (users: UserRecord[]) => {
        const seen = new Map<string, ProjectRecord>();
        const superAdmin = users.find((user) => user.active && user.role === "super_admin");
        const candidates = superAdmin ? [superAdmin] : users.filter((user) => user.active);
        for (const user of candidates)
            for (const project of await app.listProjectsForUserInModule(user, "projects"))
                seen.set(project.id, project);
        const leads = await app.pageAllLeads({}, { limit: Number.MAX_SAFE_INTEGER, offset: 0 });
        const ids = new Set([...(supplemental.projectIds ?? []), ...leads.items.flatMap((lead) => lead.projectId ? [lead.projectId] : []), ...(supplemental.estimates ?? []).flatMap((estimate) => estimate.projectId ? [estimate.projectId] : []), ...state.selections.map((selection) => selection.projectId)]);
        for (const id of ids) {
            const project = await app.findProjectById(id);
            if (project)
                seen.set(id, project);
        }
        return [...seen.values()];
    };
    return {
        app,
        async insertNotification(row) {
            if (state.notifications.some(item => item.recipientId === row.recipientId && item.messageId === row.messageId)) chatConflict();
            state.notifications.push(copy(row));
        },
        async notification(id, recipientId) { return copy(state.notifications.find(row => row.id === id && row.recipientId === recipientId) ?? null); },
        async notificationProjectIds(recipientId) { return [...new Set(state.notifications.filter(row => row.recipientId === recipientId).map(row => row.projectId))]; },
        async notificationPage(recipientId, projectIds, limit, offset) {
            const rows = state.notifications.filter(row => row.recipientId === recipientId && projectIds.includes(row.projectId)).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
            return copy({items: rows.slice(offset, offset + limit), total: rows.length, unreadCount: rows.filter(row => row.readAt === null).length});
        },
        async readNotification(id, recipientId, now) { const row = state.notifications.find(row => row.id === id && row.recipientId === recipientId); if (row && !row.readAt) row.readAt = now; },
        async claimNotificationEmail(now, leaseExpiresAt, token) {
            const row = state.notifications.filter(row => (row.email.status === "pending" && row.email.nextAttemptAt! <= now) || (row.email.status === "leased" && row.email.leaseExpiresAt! <= now)).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
            if (!row) return null;
            row.email = {...row.email, status: "leased", attempts: row.email.attempts + 1, leaseToken: token, leaseExpiresAt};
            return copy(row);
        },
        async settleNotificationEmail(id, token, now, email) {
            const row = state.notifications.find(row => row.id === id && row.email.status === "leased" && row.email.leaseToken === token && row.email.leaseExpiresAt! > now);
            if (!row) return false;
            row.email = copy(email); return true;
        },
        async typingByComposer(projectId, userId, sessionScope, composerId) { return copy(state.typing.find(row => row.projectId === projectId && row.userId === userId && row.sessionScope === sessionScope && row.composerId === composerId) ?? null); },
        async typingByUser(projectId, userId, now, limit) { return copy(state.typing.filter(row => row.projectId === projectId && row.userId === userId && row.cleanupAt > now).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit)); },
        async activeTyping(projectId, now, limit) { return copy(state.typing.filter(row => row.projectId === projectId && row.expiresAt !== null && row.expiresAt > now).sort((a, b) => a.userId.localeCompare(b.userId) || a.id.localeCompare(b.id)).slice(0, limit)); },
        async saveTyping(row) { state.typing = state.typing.filter(item => item.cleanupAt > row.updatedAt); upsert(state.typing, row); },
        async typingRate(projectId, userId) { return copy(state.typingRates.find(row => row.projectId === projectId && row.userId === userId) ?? null); },
        async saveTypingRate(row) { state.typingRates = state.typingRates.filter(item => item.cleanupAt > row.windowStartedAt); upsert(state.typingRates, row); },
        ...createChatAttachmentOperations({
            async get(projectId, id) { return copy(state.attachments.find(row => row.projectId === projectId && row.id === id) ?? null); },
            async byKey(projectId, uploaderId, key) { return copy(state.attachments.find(row => row.projectId === projectId && row.uploaderId === uploaderId && row.clientUploadId === key) ?? null); },
            async many(projectId, ids) { return copy(state.attachments.filter(row => row.projectId === projectId && ids.includes(row.id))); },
            async active(projectId, uploaderId, now) { return copy(state.attachments.filter(row => row.projectId === projectId && row.uploaderId === uploaderId && (!["attached", "deleted"].includes(row.status) || (row.transfer && row.transfer.expiresAt > now)))); },
            async due(now, limit) { return copy(state.attachments.filter(row => !["attached", "deleted"].includes(row.status) && row.cleanupAfter && row.cleanupAfter <= now && (!row.cleanup || row.cleanup.expiresAt <= now)).sort((a,b) => a.cleanupAfter!.localeCompare(b.cleanupAfter!) || a.id.localeCompare(b.id)).slice(0, limit)); },
            async save(row, expectedVersion) {
                const previous = state.attachments.find(item => item.id === row.id);
                if ((expectedVersion === null && previous) || (expectedVersion !== null && (!previous || previous.version !== expectedVersion || previous.projectId !== row.projectId))) chatConflict();
                if (!previous && state.attachments.some(item => item.projectId === row.projectId && item.uploaderId === row.uploaderId && item.clientUploadId === row.clientUploadId)) chatConflict();
                upsert(state.attachments, row);
            }
        }),
        async sources(projectId) {
            const project = await app.findProjectById(projectId);
            if (!project)
                return null;
            const users = await app.listUsers();
            const grants: ChatSources["grants"] = [];
            for (const user of users)
                for (const module of modules)
                    grants.push(...(await app.listActiveProjectAccessGrants(user.id, module)).filter((grant) => grant.projectId === projectId));
            const leads = (await app.pageAllLeads({}, { limit: Number.MAX_SAFE_INTEGER, offset: 0 })).items;
            return copy({ project, users, grants, leads, exclusions: state.exclusions.filter(row => row.projectId === projectId), estimates: supplemental.estimates ?? [], workflowTasks: supplemental.workflowTasks ?? [], designTasks: await app.listTasks({ projectId }) });
        },
        async projectPage(input) {
            const rows = (await allProjects(await app.listUsers())).map((project) => ({
                id: project.id, name: project.name, lastMessageAt: state.states[project.id]?.lastMessageAt ?? null
            }));
            rows.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
            return {items: rows.slice(input.offset, input.offset + input.limit), total: rows.length};
        },
        async candidateProjectIds() { return (await allProjects(await app.listUsers())).map((project) => project.id); },
        async directory(input) { return (await app.listUsers()).filter((user) => user.active && input.roles.includes(user.role) && !input.excludeIds.includes(user.id) && `${user.name} ${user.role.replaceAll("_", " ")}`.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, input.limit); },
        async actionTypes() { return copy(state.actionTypes); },
        async saveActionType(row) {
            if (state.actionTypes.some(item => item.id === row.id || item.normalizedName === row.normalizedName)) chatConflict("An action type with this name already exists.");
            state.actionTypes.push(copy(row));
        },
        async saveExclusion(row) {
            const previous = state.exclusions.find(item => item.projectId === row.projectId && item.userId === row.userId);
            if (row.version !== (previous?.version ?? 0) + 1 || (previous && previous.id !== row.id)) chatConflict();
            upsert(state.exclusions, previous ? { ...previous, person: row.person, active: row.active, version: row.version, history: [...previous.history, row.history[row.history.length - 1]!] } : row);
        },
        async selections(projectId) { return copy(state.selections.filter((row) => row.projectId === projectId && row.active)); },
        async findSelection(projectId, id) { return copy(state.selections.find((row) => row.projectId === projectId && row.id === id) ?? null); },
        async saveSelection(selection) {
            const existing = state.selections.find((row) => row.id === selection.id);
            if (selection.version !== (existing?.version ?? 0) + 1) chatConflict();
            if (selection.active && state.selections.some((row) => row.id !== selection.id && row.projectId === selection.projectId && row.userId === selection.userId && row.active)) chatConflict();
            upsert(state.selections, existing ? {...existing,active:selection.active,version:selection.version,revokedBy:selection.revokedBy,revokedAt:selection.revokedAt,revocationReason:selection.revocationReason} : selection);
        },
        async state(projectId) { return copy(state.states[projectId] ?? { sequence: 0, latestMessageSequence: 0, lastMessageAt: null }); },
        async allocate(projectId, messageAt) {
            const current = state.states[projectId] ?? { sequence: 0, latestMessageSequence: 0, lastMessageAt: null };
            current.sequence++;
            if (!Number.isSafeInteger(current.sequence)) throw new Error("Chat sequence exhausted.");
            if (messageAt) {
                current.latestMessageSequence = current.sequence;
                current.lastMessageAt = messageAt;
            }
            state.states[projectId] = current;
            return current.sequence;
        },
        async message(projectId, id) { return copy(state.messages.find((row) => row.projectId === projectId && row.id === id) ?? null); },
        async messages(scan) { return copy(state.messages.filter((row) => matchesMessage(row, scan)).sort((a, b) => scan.ascending ? a.sequence - b.sequence : b.sequence - a.sequence).slice(0, scan.limit)); },
        async saveMessage(message) {
            const existing = state.messages.find((row) => row.id === message.id);
            if (message.version !== (existing?.version ?? 0) + 1) chatConflict();
            if (!existing && state.messages.some((row) => row.projectId === message.projectId && (row.sequence === message.sequence || (row.author.id === message.author.id && row.clientMessageId === message.clientMessageId)))) chatConflict();
            upsert(state.messages, existing ? {...existing,priority:message.priority,issueStatus:message.issueStatus,raisedBy:message.raisedBy,responsible:message.responsible,version:message.version,...(existing.action ? {action: {...existing.action, dueDate: message.action?.dueDate ?? existing.action.dueDate}} : {})} : message);
        },
        async history(projectId, messageId) { return copy(state.histories.filter((row) => row.projectId === projectId && row.messageId === messageId).sort((a, b) => b.version - a.version).slice(0, 50).reverse().map((row) => row.entry)); },
        async appendHistory(row) {
            if (state.histories.some((entry) => entry.id === row.id || (entry.projectId === row.projectId && entry.messageId === row.messageId && entry.version === row.version))) chatConflict();
            state.histories.push(copy(row));
        },
        async counts(projectId, userId, sequence) {
            const rows = state.messages.filter((row) => row.projectId === projectId);
            const unread = rows.filter((row) => row.sequence > sequence && row.author.id !== userId);
            return { openCritical: rows.filter((row) => row.priority === "critical" && row.issueStatus === "open").length, openImportant: rows.filter((row) => row.priority === "important" && row.issueStatus === "open").length, unread: unread.length, unreadMentions: unread.filter((row) => row.mentions.some((mention) => mention.userId === userId)).length };
        },
        async recentSendCount(projectId, userId, since) { return state.messages.filter((row) => row.projectId === projectId && row.author.id === userId && row.createdAt >= since).length; },
        async readState(projectId, userId) { return copy(state.reads.find((row) => row.projectId === projectId && row.userId === userId) ?? null); },
        async saveReadState(read) { const i = state.reads.findIndex((row) => row.projectId === read.projectId && row.userId === read.userId); if (i < 0)
            state.reads.push(copy(read));
        else
            state.reads[i] = copy(read); },
        async operation(projectId, actorId, kind, key) { return copy(state.operations.find((row) => row.projectId === projectId && row.actorId === actorId && row.kind === kind && row.key === key) ?? null); },
        async saveOperation(operation) {
            if (state.operations.some((row) => row.id === operation.id || (row.projectId === operation.projectId && row.actorId === operation.actorId && row.kind === operation.kind && row.key === operation.key))) chatConflict();
            state.operations.push(copy(operation));
        },
        async appendEvent(event) {
            if (state.events.some((row) => row.id === event.id || (row.projectId === event.projectId && row.sequence === event.sequence))) chatConflict();
            state.events.push(copy(event));
        },
        async events(projectId, after, atMost, limit) { return copy(state.events.filter((row) => row.projectId === projectId && row.sequence > after && row.sequence <= atMost).sort((a, b) => a.sequence - b.sequence).slice(0, limit)); }
    };
}
function upsert<T extends {
    id: string;
}>(rows: T[], value: T): void { const i = rows.findIndex((row) => row.id === value.id); if (i < 0)
    rows.push(copy(value));
else
    rows[i] = copy(value); }
function matchesMessage(row: ChatStoredMessage, scan: ChatMessageScan): boolean {
    if (row.projectId !== scan.projectId || (scan.before !== undefined && row.sequence >= scan.before) || (scan.after !== undefined && row.sequence <= scan.after) || (scan.atMost !== undefined && row.sequence > scan.atMost))
        return false;
    switch (scan.filter) {
        case "mentions": return row.mentions.some((mention) => mention.userId === scan.userId);
        case "important":
        case "critical": return row.priority === scan.filter && row.issueStatus === "open";
        case "resolved": return row.issueStatus === "resolved";
        default: return true;
    }
}
