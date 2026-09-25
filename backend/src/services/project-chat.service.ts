import { randomUUID } from "node:crypto";
import type { ChatActionType, ChatActor, ChatAttachmentPolicy, ChatConversation, ChatConversationTotals, ChatCounts, ChatEvent, ChatLastMessage, ChatMessage, ChatParticipantPage, ChatPerson, ChatSummary, ProjectChatService } from "../contracts/project-chat.js";
import { hasPermission, type PermissionCode } from "../domain/authorization.js";
import { canSelectChatPerson, resolveChatMembership, type ChatMembership } from "../domain/project-chat-membership.js";
import { chatActionTypeSchema, chatProjectNameSchema, chatRemovalSchema, chatConflict, chatCursor, chatExcerpt, chatFingerprint, chatForbidden, chatInvalid, chatIssueSchema, chatManager, chatMessageQuerySchema, chatNotFound, chatOptionsQuerySchema, chatParticipantSchema, chatPerson, chatReadSchema, chatRevokeSchema, chatSendSchema, issueCapabilities, parseChatCursor, parseChatInput, projectMessagesQuerySchema, transitionChatIssue } from "../domain/project-chat.js";
import { ROLE_CODES } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import { createMemoryProjectChatRepository } from "../repositories/project-chat-memory.js";
import type { ChatExclusion, ChatSelection, ChatSources, ChatStoredMessage, ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import type { AppRepository, UserRecord } from "../repositories/types.js";
import type { AuditService, AuditWrite } from "./audit.service.js";
import { systemClock, type Clock } from "./workflow.js";
import { authenticatedChatUser, projectChatContext } from "./project-chat-context.js";
import { createProjectChatAttachmentPolicy } from "../domain/project-chat-attachment-policy.js";
const BUILT_IN_ACTION_TYPES: readonly ChatActionType[] = [
    { id: "action", name: "Action", priority: "important", builtIn: true },
    { id: "escalation", name: "Escalation", priority: "critical", builtIn: true }
];
const normalizedActionName = (name: string) => name.normalize("NFKC").trim().toLowerCase();
interface Context {
    sources: ChatSources;
    membership: ChatMembership;
    user: UserRecord;
}
export interface ProjectChatServiceOptions {
    repository: AppRepository;
    audit: AuditService;
    clock?: Clock;
    chatRepository?: ProjectChatRepository;
    attachmentPolicy?: ChatAttachmentPolicy;
    onNotificationsCommitted?: (recipientIds: string[]) => void;
}
export function createProjectChatService(options: ProjectChatServiceOptions): ProjectChatService {
    const store = options.chatRepository ?? createMemoryProjectChatRepository(options.repository);
    const clock = options.clock ?? systemClock;
    const attachmentPolicy = options.attachmentPolicy ?? createProjectChatAttachmentPolicy();
    async function authenticated(tx: ChatTransaction, actor: ChatActor, permission: PermissionCode = "chat.read"): Promise<UserRecord> {
        return authenticatedChatUser(tx, actor, clock, permission);
    }
    async function context(tx: ChatTransaction, actor: ChatActor, projectId: string, permission: PermissionCode = "chat.read"): Promise<Context> {
        return projectChatContext(tx, actor, projectId, clock, permission);
    }
    const canManage = (actor: ChatActor, ctx: Context) => ctx.membership.selectionManagers.has(actor.id) && hasPermission(actor.role, "chat.participants.manage");
    function participantPage(actor: ChatActor, ctx: Context): ChatParticipantPage {
        const admin = canManage(actor, ctx);
        const exclusions = ctx.sources.exclusions ?? [];
        return {
            items: ctx.membership.participants.map(person => {
                const removalBlockedReason = person.id === actor.id ? "You cannot remove yourself." : person.id === ctx.sources.project.clientId ? "The linked Client must remain in the conversation." : person.role === "super_admin" ? "The Super Admin must remain in the conversation." : null;
                return { ...person, sources: admin ? person.sources : [], selection: admin ? person.selection : null, ...(admin ? { removalVersion: exclusions.find(row => row.userId === person.id)?.version ?? 0, canRemove: removalBlockedReason === null, removalBlockedReason } : {}) };
            }),
            ...(admin ? { removed: exclusions.filter(row => row.active).map(row => {
                const user = ctx.sources.users.find(user => user.id === row.userId && user.active);
                return { ...chatPerson(user ?? row.person), removalVersion: row.version, canRestore: Boolean(user && canSelectChatPerson(user, ctx.membership)) };
            }) } : {}),
            setupWarnings: admin ? ctx.membership.warnings : []
        };
    }
    async function summary(tx: ChatTransaction, actor: ChatActor, ctx: Context, counts?: ChatCounts): Promise<ChatSummary> {
        const project = ctx.sources.project;
        const state = await tx.state(project.id);
        const read = await tx.readState(project.id, actor.id);
        return { project: { id: project.id, name: project.name, status: project.status, nameVersion: project.nameVersion ?? 1 }, counts: counts ?? await tx.counts(project.id, actor.id, read?.sequence ?? 0), participantCount: ctx.membership.participants.length, cursor: chatCursor(project.id, state.sequence), lastReadSequence: read?.sequence ?? 0, latestMessageSequence: state.latestMessageSequence, capabilities: { canSend: hasPermission(actor.role, "chat.send"), canManageParticipants: canManage(actor, ctx), canManageIssues: chatManager(actor), canRenameProject: canManage(actor, ctx) && hasPermission(actor.role, "chat.project_name.manage") }, setupWarnings: canManage(actor, ctx) ? ctx.membership.warnings : [] };
    }
    async function present(tx: ChatTransaction, actor: ChatActor, ctx: Context, row: ChatStoredMessage): Promise<ChatMessage> {
        const responsible = row.responsible ? ctx.membership.participants.find((person) => person.id === row.responsible!.id) : null;
        const message: ChatMessage = { ...row, attachments: row.attachments ?? [], responsible: row.responsible ? { ...row.responsible, ...(responsible ? chatPerson(responsible) : {}), available: Boolean(responsible) } : null, issueHistory: await tx.history(row.projectId, row.id), capabilities: issueCapabilities(actor, row) };
        return message;
    }
    async function conversationCounts(tx: ChatTransaction, actor: ChatActor, projectId: string): Promise<ChatCounts> {
        return tx.counts(projectId, actor.id, (await tx.readState(projectId, actor.id))?.sequence ?? 0);
    }
    /** Newest saved message, read through the same scan and bound the thread history uses; metadata only, never storage references. */
    async function lastMessage(tx: ChatTransaction, actor: ChatActor, projectId: string): Promise<ChatLastMessage | null> {
        const state = await tx.state(projectId);
        const [row] = await tx.messages({ projectId, userId: actor.id, filter: "all", atMost: state.latestMessageSequence, limit: 1, ascending: false });
        if (!row)
            return null;
        const attachments = row.attachments ?? [];
        return { id: row.id, author: chatPerson(row.author), excerpt: chatExcerpt(row.body), createdAt: row.createdAt, attachments: attachments.slice(0, 3).map((attachment) => ({ id: attachment.id, kind: attachment.kind, filename: attachment.filename, hasPreview: attachment.preview !== null })), attachmentCount: attachments.length };
    }
    const findMessage = async (tx: ChatTransaction, projectId: string, id: string) => { const row = await tx.message(projectId, id); if (!row)
        chatNotFound(); return row; };
    async function audit(tx: ChatTransaction, input: AuditWrite) { if (tx.session)
        await options.audit.appendInMongoTransaction(input, tx.session);
    else
        await options.audit.append(input, tx.app); }
    async function event(tx: ChatTransaction, actor: ChatActor, projectId: string, type: ChatEvent["type"], recordId: string, version: number, occurredAt: string, sequence?: number, privateUserId: string | null = null) {
        const allocated = sequence ?? await tx.allocate(projectId);
        await tx.appendEvent({ id: `chat-event-${randomUUID()}`, projectId, sequence: allocated, type, recordId, version, occurredAt, actorId: actor.id, privateUserId });
    }
    async function replay(tx: ChatTransaction, actor: ChatActor, projectId: string, kind: string, key: string, payload: unknown): Promise<string | null> {
        const previous = await tx.operation(projectId, actor.id, kind, key);
        if (!previous)
            return null;
        if (previous.fingerprint !== chatFingerprint(payload))
            throw new ApiError(409, "CHAT_IDEMPOTENCY_CONFLICT", "This retry key was already used for different content.");
        return previous.recordId;
    }
    async function remember(tx: ChatTransaction, actor: ChatActor, projectId: string, kind: string, key: string, payload: unknown, recordId: string) { await tx.saveOperation({ id: `chat-operation-${randomUUID()}`, projectId, actorId: actor.id, kind, key, fingerprint: chatFingerprint(payload), recordId }); }
    function currentPerson(ctx: Context, id: string): ChatPerson { const person = ctx.membership.participants.find((candidate) => candidate.id === id); if (!person)
        chatInvalid("A selected person is no longer a participant. Update the message and retry."); return chatPerson(person); }
    async function recordIssue(tx: ChatTransaction, actor: ChatActor, ctx: Context, message: ChatStoredMessage, action: ChatMessage["issueHistory"][number]["action"], note: string, at: string) {
        const entry = { id: `chat-issue-${randomUUID()}`, action, actor: chatPerson(ctx.user), occurredAt: at, note, priority: message.priority, status: message.issueStatus, responsibleUserId: message.responsible?.id ?? null, ...(message.action ? { actionMetadata: { ...message.action } } : {}) };
        await tx.appendHistory({ id: entry.id, messageId: message.id, projectId: message.projectId, version: message.version, entry });
    }
    async function actionTypes(tx: ChatTransaction): Promise<ChatActionType[]> {
        return [...BUILT_IN_ACTION_TYPES, ...(await tx.actionTypes()).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map(({id, name, priority, builtIn}) => ({id, name, priority, builtIn}))];
    }
    async function changeParticipant(actor: ChatActor, projectId: string, userId: string, input: unknown, removing: boolean): Promise<ChatParticipantPage> {
        const value = parseChatInput(chatRemovalSchema, input);
        return store.mutate(async tx => {
            let ctx = await context(tx, actor, projectId, "chat.participants.manage");
            if (!canManage(actor, ctx)) chatForbidden();
            const kind = removing ? "participant.remove" : "participant.restore";
            const payload = { userId, ...value };
            if (await replay(tx, actor, projectId, kind, value.idempotencyKey, payload)) return participantPage(actor, ctx);
            const user = await tx.app.findUserById(userId);
            if (!user) chatNotFound();
            if (userId === actor.id || userId === ctx.sources.project.clientId || user.role === "super_admin") chatForbidden();
            const prior = (ctx.sources.exclusions ?? []).find(row => row.userId === userId);
            if ((prior?.version ?? 0) !== value.expectedVersion || Boolean(prior?.active) === removing) chatConflict();
            if (removing && !ctx.membership.participants.some(person => person.id === userId)) chatNotFound();
            if (!removing && (!user.active || !canSelectChatPerson(user, ctx.membership))) chatInvalid("This person is no longer eligible for this conversation.");
            const at = clock().toISOString();
            const version = value.expectedVersion + 1;
            const exclusion: ChatExclusion = { id: prior?.id ?? `chat-exclusion-${randomUUID()}`, projectId, userId, person: chatPerson(user), active: removing, version, history: [...(prior?.history ?? []), { active: removing, version, actor: chatPerson(ctx.user), reason: value.reason, occurredAt: at }] };
            await tx.saveExclusion(exclusion);
            if (!removing) {
                // Restoring is explicit membership selection, revalidated against today's trade source.
                const restored = resolveChatMembership({ ...ctx.sources, exclusions: (ctx.sources.exclusions ?? []).filter(row => row.userId !== userId) }, await tx.selections(projectId));
                if (!restored.participants.some(person => person.id === userId)) {
                    const priorSelection = (await tx.selections(projectId)).find(row => row.userId === userId);
                    if (priorSelection) await tx.saveSelection({ ...priorSelection, active: false, version: priorSelection.version + 1, revokedBy: chatPerson(ctx.user), revokedAt: at, revocationReason: value.reason });
                    await tx.saveSelection({ id: `chat-selection-${randomUUID()}`, projectId, userId, selectedRole: user.role, active: true, version: 1, selectedBy: chatPerson(ctx.user), selectedAt: at, reason: value.reason, tradeReference: ctx.membership.eligibleTrades.get(user.role) ?? null, revokedBy: null, revokedAt: null, revocationReason: null });
                }
            }
            await remember(tx, actor, projectId, kind, value.idempotencyKey, payload, exclusion.id);
            await audit(tx, { actorId: actor.id, action: removing ? "project_chat.participant_removed" : "project_chat.participant_restored", entityType: "project_chat_participant", entityId: exclusion.id, occurredAt: at, oldValues: { active: prior?.active ?? false, version: prior?.version ?? 0 }, newValues: { projectId, userId, active: removing, version }, reason: value.reason });
            await event(tx, actor, projectId, "participants.changed", exclusion.id, version, at);
            ctx = await context(tx, actor, projectId);
            return participantPage(actor, ctx);
        });
    }
    return {
        actionTypes: (actor, projectId) => store.snapshot(async tx => {
            const ctx = await context(tx, actor, projectId);
            return { items: await actionTypes(tx), canCreate: actor.role === "super_admin" && ctx.membership.selectionManagers.has(actor.id) && hasPermission(actor.role, "chat.action_types.manage") };
        }),
        async createActionType(actor, projectId, input) {
            const value = parseChatInput(chatActionTypeSchema, input);
            return store.mutate(async tx => {
                const ctx = await context(tx, actor, projectId, "chat.action_types.manage");
                if (actor.role !== "super_admin" || !ctx.membership.selectionManagers.has(actor.id) || await tx.app.countActiveUsersByRole("super_admin") !== 1) chatForbidden();
                const catalogueId = "__chat_action_types__";
                const existing = await replay(tx, actor, catalogueId, "action_type.create", value.idempotencyKey, value);
                const types = await actionTypes(tx);
                if (existing) { const type = types.find(row => row.id === existing); if (!type) chatNotFound(); return type; }
                const normalizedName = normalizedActionName(value.name);
                if (types.some(row => normalizedActionName(row.name) === normalizedName)) chatConflict("An action type with this name already exists.");
                const type: ChatActionType = { id: `chat-action-type-${randomUUID()}`, name: value.name, priority: "important", builtIn: false };
                const at = clock().toISOString();
                await tx.saveActionType({ ...type, normalizedName, createdBy: actor.id, createdAt: at });
                await remember(tx, actor, catalogueId, "action_type.create", value.idempotencyKey, value, type.id);
                await audit(tx, { actorId: actor.id, action: "project_chat.action_type_created", entityType: "project_chat_action_type", entityId: type.id, occurredAt: at, newValues: { name: type.name } });
                return type;
            });
        },
        removeParticipant: (actor, projectId, userId, input) => changeParticipant(actor, projectId, userId, input, true),
        restoreParticipant: (actor, projectId, userId, input) => changeParticipant(actor, projectId, userId, input, false),
        async renameProject(actor, projectId, input) {
            const value = parseChatInput(chatProjectNameSchema, input);
            return store.mutate(async tx => {
                const ctx = await context(tx, actor, projectId, "chat.project_name.manage");
                if (!canManage(actor, ctx)) chatForbidden();
                if (await replay(tx, actor, projectId, "project.rename", value.idempotencyKey, value)) return summary(tx, actor, ctx);
                const at = clock().toISOString();
                const project = await tx.app.renameProjectName(projectId, value.name, value.expectedVersion, at);
                if (!project) chatConflict("The project name changed. Refresh before saving again.");
                await remember(tx, actor, projectId, "project.rename", value.idempotencyKey, value, projectId);
                await audit(tx, { actorId: actor.id, action: "project_chat.project_renamed", entityType: "project", entityId: projectId, occurredAt: at, oldValues: { name: ctx.sources.project.name, nameVersion: ctx.sources.project.nameVersion ?? 1 }, newValues: { name: project.name, nameVersion: project.nameVersion } });
                // Existing clients already refetch the conversation summary for this event.
                await event(tx, actor, projectId, "participants.changed", projectId, project.nameVersion!, at);
                return summary(tx, actor, { ...ctx, sources: { ...ctx.sources, project } });
            });
        },
        async list(actor, input) {
            const query = parseChatInput(projectMessagesQuerySchema, input);
            const pagination = (total: number) => ({ limit: query.limit, offset: query.offset, total, hasMore: query.offset + query.limit < total });
            return store.snapshot(async (tx) => {
                const user = await authenticated(tx, actor);
                // Every authorized conversation is counted so totals and filtered paging are exact; sources,
                // summaries and the last-message preview are hydrated only for the returned page.
                const authorized: Array<{ id: string; name: string; lastMessageAt: string | null; counts: ChatCounts; ctx?: Context }> = [];
                if (actor.role === "super_admin") {
                    if (await tx.app.countActiveUsersByRole("super_admin") !== 1) {
                        return { items: [], pagination: pagination(0), totals: { unread: 0, critical: 0, important: 0 } };
                    }
                    // projectPage is already in list order; walk it to cover the whole portfolio in this snapshot.
                    for (let offset = 0, total = 1; offset < total;) {
                        const page = await tx.projectPage({ limit: 500, offset });
                        total = page.total;
                        if (!page.items.length) break;
                        offset += page.items.length;
                        for (const row of page.items)
                            authorized.push({ ...row, counts: await conversationCounts(tx, actor, row.id) });
                    }
                }
                else {
                    for (const projectId of await tx.candidateProjectIds(user)) {
                        const sources = await tx.sources(projectId);
                        if (!sources) continue;
                        const membership = resolveChatMembership(sources, await tx.selections(projectId));
                        if (!membership.participants.some((person) => person.id === actor.id)) continue;
                        authorized.push({ id: projectId, name: sources.project.name, lastMessageAt: (await tx.state(projectId)).lastMessageAt, counts: await conversationCounts(tx, actor, projectId), ctx: {sources, membership, user} });
                    }
                    authorized.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
                }
                const totals: ChatConversationTotals = {
                    unread: authorized.filter((row) => row.counts.unread > 0).length,
                    critical: authorized.reduce((sum, row) => sum + row.counts.openCritical, 0),
                    important: authorized.reduce((sum, row) => sum + row.counts.openImportant, 0)
                };
                const search = query.search.toLocaleLowerCase();
                const matches = authorized.filter((row) => (!search || row.name.toLocaleLowerCase().includes(search)) && (query.filter === "all"
                    || (query.filter === "unread" && row.counts.unread > 0)
                    || (query.filter === "critical" && row.counts.openCritical > 0)
                    || (query.filter === "important" && row.counts.openImportant > 0)));
                const items: ChatConversation[] = [];
                for (const row of matches.slice(query.offset, query.offset + query.limit)) {
                    const ctx = row.ctx ?? await context(tx, actor, row.id);
                    items.push({ ...await summary(tx, actor, ctx, row.counts), lastMessageAt: row.lastMessageAt, lastMessage: await lastMessage(tx, actor, row.id) });
                }
                return { items, pagination: pagination(matches.length), totals };
            });
        },
        summary: (actor, projectId) => store.snapshot(async (tx) => summary(tx, actor, await context(tx, actor, projectId))),
        participants: (actor, projectId) => store.snapshot(async (tx) => participantPage(actor, await context(tx, actor, projectId))),
        async participantOptions(actor, projectId, input) {
            const query = parseChatInput(chatOptionsQuerySchema, input);
            return store.snapshot(async (tx) => {
                const ctx = await context(tx, actor, projectId, "chat.participants.manage");
                if (!canManage(actor, ctx))
                    chatForbidden();
                const selected = new Set(ctx.membership.participants.filter((person) => person.selection).map((person) => person.id));
                const roles = ROLE_CODES.filter((role) => canSelectChatPerson({ id: "", name: "", role }, ctx.membership));
                const rows = await tx.directory({ search: query.search, roles, excludeIds: [...selected, ...(ctx.sources.exclusions ?? []).filter(row => row.active).map(row => row.userId)], limit: query.limit + 1 });
                return { items: rows.slice(0, query.limit).map(chatPerson), hasMore: rows.length > query.limit };
            });
        },
        async addParticipant(actor, projectId, input) {
            const value = parseChatInput(chatParticipantSchema, input);
            return store.mutate(async (tx) => {
                let ctx = await context(tx, actor, projectId, "chat.participants.manage");
                if (!canManage(actor, ctx))
                    chatForbidden();
                if (await replay(tx, actor, projectId, "participant.add", value.idempotencyKey, value))
                    return participantPage(actor, ctx);
                const user = await tx.app.findUserById(value.userId);
                if (!user || !user.active || !canSelectChatPerson(user, ctx.membership))
                    chatInvalid("Choose an eligible active project participant.");
                if (ctx.sources.exclusions?.some(row => row.userId === user.id && row.active)) chatConflict("Restore this removed participant explicitly before selecting them again.");
                const prior = (await tx.selections(projectId)).find((row) => row.userId === user.id);
                const at = clock().toISOString();
                if (prior) {
                    if (ctx.membership.participants.some((person) => person.selection?.id === prior.id))
                        chatConflict("This person is already selected.");
                    const revoked = { ...prior, active: false, version: prior.version + 1, revokedBy: chatPerson(ctx.user), revokedAt: at, revocationReason: value.reason };
                    await tx.saveSelection(revoked);
                    await audit(tx, { actorId: actor.id, action: "project_chat.participant_revoked", entityType: "project_chat_participant", entityId: prior.id, occurredAt: at, newValues: { projectId, userId: user.id, version: revoked.version }, reason: value.reason });
                }
                const selection: ChatSelection = { id: `chat-selection-${randomUUID()}`, projectId, userId: user.id, selectedRole: user.role, active: true, version: 1, selectedBy: chatPerson(ctx.user), selectedAt: at, reason: value.reason, tradeReference: ctx.membership.eligibleTrades.get(user.role) ?? null, revokedBy: null, revokedAt: null, revocationReason: null };
                await tx.saveSelection(selection);
                await remember(tx, actor, projectId, "participant.add", value.idempotencyKey, value, selection.id);
                await audit(tx, { actorId: actor.id, action: "project_chat.participant_added", entityType: "project_chat_participant", entityId: selection.id, occurredAt: at, newValues: { projectId, userId: user.id, role: user.role, version: 1 }, reason: value.reason });
                await event(tx, actor, projectId, "participants.changed", selection.id, 1, at);
                ctx = await context(tx, actor, projectId);
                return participantPage(actor, ctx);
            });
        },
        async revokeParticipant(actor, projectId, selectionId, input) {
            const value = parseChatInput(chatRevokeSchema, input);
            return store.mutate(async (tx) => {
                let ctx = await context(tx, actor, projectId, "chat.participants.manage");
                if (!canManage(actor, ctx))
                    chatForbidden();
                const payload = { selectionId, ...value };
                if (await replay(tx, actor, projectId, "participant.revoke", value.idempotencyKey, payload))
                    return participantPage(actor, ctx);
                const selection = await tx.findSelection(projectId, selectionId);
                if (!selection)
                    chatNotFound();
                if (!selection.active || selection.version !== value.expectedVersion)
                    chatConflict();
                const at = clock().toISOString();
                selection.active = false;
                selection.version++;
                selection.revokedBy = chatPerson(ctx.user);
                selection.revokedAt = at;
                selection.revocationReason = value.reason;
                await tx.saveSelection(selection);
                await remember(tx, actor, projectId, "participant.revoke", value.idempotencyKey, payload, selection.id);
                await audit(tx, { actorId: actor.id, action: "project_chat.participant_revoked", entityType: "project_chat_participant", entityId: selection.id, occurredAt: at, newValues: { projectId, userId: selection.userId, version: selection.version }, reason: value.reason });
                await event(tx, actor, projectId, "participants.changed", selection.id, selection.version, at);
                ctx = await context(tx, actor, projectId);
                return participantPage(actor, ctx);
            });
        },
        async messages(actor, projectId, input) {
            const query = parseChatInput(chatMessageQuerySchema, input);
            return store.snapshot(async (tx) => {
                const ctx = await context(tx, actor, projectId);
                const state = await tx.state(projectId);
                const base = { projectId, userId: actor.id, filter: query.filter, atMost: state.latestMessageSequence };
                let rows: ChatStoredMessage[];
                if (query.around) {
                    const target = await findMessage(tx, projectId, query.around);
                    const older = await tx.messages({ ...base, filter: "all", before: target.sequence, limit: Math.floor((query.limit - 1) / 2), ascending: false });
                    const newer = await tx.messages({ ...base, filter: "all", after: target.sequence, limit: query.limit - older.length - 1, ascending: true });
                    rows = [...older.reverse(), target, ...newer];
                }
                else {
                    const before = query.before ? parseChatCursor(projectId, query.before) : undefined;
                    const after = query.after ? parseChatCursor(projectId, query.after) : undefined;
                    if ((before ?? 0) > state.sequence || (after ?? 0) > state.sequence)
                        chatInvalid("The history cursor is ahead of this conversation.");
                    rows = await tx.messages({ ...base, before, after, limit: query.limit, ascending: after !== undefined });
                    if (after === undefined)
                        rows.reverse();
                }
                const first = rows[0];
                const last = rows.at(-1);
                const filter = query.around ? "all" : query.filter;
                const hasOlder = first ? (await tx.messages({ ...base, filter, before: first.sequence, limit: 1, ascending: false })).length > 0 : false;
                const hasNewer = last ? (await tx.messages({ ...base, filter, after: last.sequence, limit: 1, ascending: true })).length > 0 : false;
                const items: ChatMessage[] = [];
                for (const row of rows)
                    items.push(await present(tx, actor, ctx, row));
                return { items, olderCursor: hasOlder ? chatCursor(projectId, first!.sequence) : null, newerCursor: hasNewer ? chatCursor(projectId, last!.sequence) : null, snapshotCursor: chatCursor(projectId, state.sequence), latestMessageSequence: state.latestMessageSequence };
            });
        },
        async send(actor, projectId, input) {
            const {attachmentIds = [], ...parsed} = parseChatInput(chatSendSchema, input);
            // Preserve the exact legacy fingerprint when attachments are omitted or empty.
            const value = { ...parsed, mentions: [...parsed.mentions].sort((a, b) => a.start - b.start || a.end - b.end), replyToId: parsed.replyToId ?? null, responsibleUserId: parsed.responsibleUserId ?? null, ...(attachmentIds.length ? {attachmentIds} : {}) };
            let notificationRecipients: string[] = [];
            const result = await store.mutate(async (tx) => {
                notificationRecipients = [];
                const ctx = await context(tx, actor, projectId, "chat.send");
                const existing = await replay(tx, actor, projectId, "message.send", value.clientMessageId, value);
                if (existing)
                    return present(tx, actor, ctx, await findMessage(tx, projectId, existing));
                if (new Set(value.mentions.map((mention) => mention.userId)).size > 20)
                    chatInvalid("Mention up to 20 participants in one message.");
                let previousEnd = 0;
                for (const mention of value.mentions) {
                    const person = currentPerson(ctx, mention.userId);
                    if (mention.start < previousEnd || mention.end <= mention.start || mention.end > value.body.length || value.body.slice(mention.start, mention.end) !== `@${person.name}`)
                        chatInvalid("A mention is no longer valid. Select the participant again.");
                    previousEnd = mention.end;
                }
                const responsible = value.responsibleUserId ? currentPerson(ctx, value.responsibleUserId) : null;
                const type = value.action ? (await actionTypes(tx)).find(row => row.id === value.action!.typeId) : null;
                if (value.action && (!type || !responsible || !value.body.trim())) chatInvalid("Choose an action type, responsible participant, due date and message details.");
                const priority = type?.priority ?? value.priority;
                const action = type && value.action ? { typeId: type.id, typeName: type.name, dueDate: value.action.dueDate, originalDueDate: value.action.dueDate } : null;
                if (responsible && priority === "normal")
                    chatInvalid("Raise Important or Critical before assigning a discussion issue.");
                const reply = value.replyToId ? await findMessage(tx, projectId, value.replyToId) : null;
                const at = clock().toISOString();
                if (await tx.recentSendCount(projectId, actor.id, new Date(clock().getTime() - 60000).toISOString()) >= 30)
                    throw new ApiError(429, "CHAT_RATE_LIMIT", "Please wait before sending more messages.", undefined, { "Retry-After": "60" });
                const messageId = `chat-message-${randomUUID()}`;
                const attachments = await tx.associateAttachments({projectId, uploaderId: actor.id, ids: attachmentIds, messageId, now: at, maxCount: attachmentPolicy.limits.maxAttachments, maxBytes: attachmentPolicy.limits.maxMessageBytes});
                const sequence = await tx.allocate(projectId, at);
                const firstReplyAttachment = reply?.attachments?.[0];
                const replyTo = reply ? {id: reply.id, author: reply.author, body: reply.body, ...(firstReplyAttachment ? {attachmentSummary: {count: reply.attachments.length, kind: firstReplyAttachment.kind, filename: firstReplyAttachment.filename}} : {})} : null;
                const message: ChatStoredMessage = { id: messageId, projectId, author: chatPerson(ctx.user), body: value.body, attachments, mentions: value.mentions, createdAt: at, sequence, clientMessageId: value.clientMessageId, replyTo, ...(action ? { action } : {}), priority, issueStatus: priority === "normal" ? null : "open", raisedBy: priority === "normal" ? null : chatPerson(ctx.user), responsible: responsible ? { ...responsible, available: true } : null, version: 1 };
                await tx.saveMessage(message);
                if (value.mentions.length) {
                    const recipients = new Map(value.mentions.map(mention => [mention.userId, "chat.mention" as "chat.mention" | "chat.mention.oversight"]));
                    const superAdmins = ctx.sources.users.filter(user => user.active && user.role === "super_admin");
                    if (superAdmins.length === 1 && !recipients.has(superAdmins[0]!.id)) recipients.set(superAdmins[0]!.id, "chat.mention.oversight");
                    const excerpt = value.body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
                    for (const [recipientId, type] of recipients) {
                        await tx.insertNotification({
                            id: `notification-${randomUUID()}`, recipientId, type, projectId, projectName: ctx.sources.project.name,
                            messageId, actor: {id: ctx.user.id, name: ctx.user.name}, excerpt, createdAt: at, readAt: null,
                            email: {status: "pending", attempts: 0, nextAttemptAt: at, leaseToken: null, leaseExpiresAt: null, deliveredAt: null, failureCode: null}
                        });
                    }
                    notificationRecipients = [...recipients.keys()];
                }
                await remember(tx, actor, projectId, "message.send", value.clientMessageId, value, message.id);
                if (message.priority !== "normal")
                    await recordIssue(tx, actor, ctx, message, "raise", "", at);
                await audit(tx, { actorId: actor.id, action: "project_chat.message_created", entityType: "project_chat_message", entityId: message.id, occurredAt: at, newValues: { projectId, sequence, priority: message.priority, mentionUserIds: value.mentions.map((mention) => mention.userId), replyToId: value.replyToId } });
                await event(tx, actor, projectId, "message.created", message.id, 1, at, sequence);
                return present(tx, actor, ctx, message);
            });
            // Durable records are committed before best-effort process-local wakeups.
            if (notificationRecipients.length) {
                try { options.onNotificationsCommitted?.(notificationRecipients); } catch { /* Recovery reads committed rows. */ }
            }
            return result;
        },
        async issue(actor, projectId, messageId, input) {
            const value = parseChatInput(chatIssueSchema, input);
            return store.mutate(async (tx) => {
                const ctx = await context(tx, actor, projectId, "chat.issue");
                const payload = { messageId, ...value };
                const existing = await replay(tx, actor, projectId, "message.issue", value.idempotencyKey, payload);
                if (existing)
                    return present(tx, actor, ctx, await findMessage(tx, projectId, existing));
                const stored = await findMessage(tx, projectId, messageId);
                if (stored.version !== value.expectedVersion)
                    chatConflict();
                const message = await present(tx, actor, ctx, stored);
                const responsible = value.responsibleUserId ? currentPerson(ctx, value.responsibleUserId) : null;
                transitionChatIssue(actor, message, value, responsible, chatPerson(ctx.user));
                message.version++;
                const { capabilities, issueHistory, ...saved } = message;
                const at = clock().toISOString();
                await tx.saveMessage(saved);
                await recordIssue(tx, actor, ctx, saved, value.action, value.note ?? "", at);
                await remember(tx, actor, projectId, "message.issue", value.idempotencyKey, payload, message.id);
                await audit(tx, { actorId: actor.id, action: "project_chat.issue_changed", entityType: "project_chat_message", entityId: message.id, occurredAt: at, oldValues: { priority: stored.priority, status: stored.issueStatus, version: stored.version, responsibleUserId: stored.responsible?.id ?? null, actionMetadata: stored.action ?? null }, newValues: { projectId, action: value.action, priority: saved.priority, status: saved.issueStatus, version: saved.version, responsibleUserId: saved.responsible?.id ?? null, actionMetadata: saved.action ?? null }, reason: value.note ?? null });
                await event(tx, actor, projectId, "issue.changed", message.id, message.version, at);
                return present(tx, actor, ctx, saved);
            });
        },
        async read(actor, projectId, input) {
            const value = parseChatInput(chatReadSchema, input);
            return store.mutate(async (tx) => {
                await context(tx, actor, projectId, "chat.read_state");
                const message = await findMessage(tx, projectId, value.messageId);
                if (message.sequence !== value.sequence)
                    chatInvalid("The read position must identify a saved message in this conversation.");
                const previous = await tx.readState(projectId, actor.id);
                const lastReadSequence = Math.max(previous?.sequence ?? 0, message.sequence);
                if (lastReadSequence > (previous?.sequence ?? 0)) {
                    const at = clock().toISOString();
                    const version = (previous?.version ?? 0) + 1;
                    await tx.saveReadState({ projectId, userId: actor.id, sequence: lastReadSequence, version, updatedAt: at });
                    await audit(tx, { actorId: actor.id, action: "project_chat.read_changed", entityType: "project_chat_read", entityId: projectId, occurredAt: at, newValues: { projectId, sequence: lastReadSequence, version } });
                    await event(tx, actor, projectId, "read.changed", projectId, version, at, undefined, actor.id);
                }
                return { lastReadSequence, counts: await tx.counts(projectId, actor.id, lastReadSequence) };
            });
        },
        async events(actor, projectId, cursor, limit = 100) {
            return store.snapshot(async (tx) => {
                const ctx = await context(tx, actor, projectId);
                const state = await tx.state(projectId);
                const membershipVersion = chatFingerprint({ participants: ctx.membership.participants.map((person) => ({ id: person.id, role: person.role, name: person.name, sources: [...person.sources].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)), selection: person.selection })), eligibleTrades: [...ctx.membership.eligibleTrades].sort(([a], [b]) => a.localeCompare(b)), selectionManagers: [...ctx.membership.selectionManagers].sort(), warnings: [...ctx.membership.warnings].sort() });
                let after = state.sequence;
                try {
                    if (cursor !== undefined)
                        after = parseChatCursor(projectId, cursor);
                }
                catch {
                    return { events: [], cursor: chatCursor(projectId, state.sequence), hasMore: false, resync: true, membershipVersion };
                }
                if (after > state.sequence)
                    return { events: [], cursor: chatCursor(projectId, state.sequence), hasMore: false, resync: true, membershipVersion };
                const size = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 100, 200));
                const raw = await tx.events(projectId, after, state.sequence, size + 1);
                if (after < state.sequence && (raw.length === 0 || raw[0]!.sequence !== after + 1 || raw.some((row, index) => index > 0 && row.sequence !== raw[index - 1]!.sequence + 1)))
                    return { events: [], cursor: chatCursor(projectId, state.sequence), hasMore: false, resync: true, membershipVersion };
                const consumed = raw.slice(0, size);
                const events = consumed.filter((row) => row.privateUserId === null || row.privateUserId === actor.id).map(({ actorId, privateUserId, ...row }) => row);
                return { events, cursor: chatCursor(projectId, consumed.at(-1)?.sequence ?? after), hasMore: raw.length > size, resync: false, membershipVersion };
            });
        },
        async authorizeDelivery(actor, projectId, enqueue) {
            await store.mutate(async (tx) => {
                await context(tx, actor, projectId);
                // No network await: source revocation cannot commit between this check and enqueue.
                enqueue();
            });
        }
    };
}
