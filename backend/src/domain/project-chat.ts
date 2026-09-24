import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChatActor, ChatIssueInput, ChatMessage, ChatPerson } from "../contracts/project-chat.js";
import { ApiError } from "../middleware/errors.js";
export const chatIdSchema = z.string().trim().min(1).max(200);
const keySchema = z.string().min(8).max(200);
export const chatCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return value.slice(0, 4) !== "0000" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid calendar date.");
const noteSchema = z.string().trim().min(1).max(1000);
export const chatSendSchema = z.object({
    body: z.string().max(4000)
        .refine((body) => Buffer.from(body, "utf8").toString("utf8") === body, "The message must contain valid Unicode text."),
    attachmentIds: z.array(chatIdSchema).max(100).optional(),
    mentions: z.array(z.object({ userId: chatIdSchema, start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict()).max(80).default([]),
    replyToId: chatIdSchema.nullable().optional(),
    priority: z.enum(["normal", "important", "critical"]).default("normal"),
    responsibleUserId: chatIdSchema.nullable().optional(),
    action: z.object({ typeId: chatIdSchema, dueDate: chatCalendarDateSchema }).strict().optional(),
    clientMessageId: keySchema
}).strict().refine(value => value.body.trim().length > 0 || Boolean(value.attachmentIds?.length), "Enter a message or choose an attachment.");
export const chatIssueSchema = z.object({
    action: z.enum(["raise", "escalate", "resolve", "reopen", "lower", "clear", "assign", "reschedule"]),
    expectedVersion: z.number().int().positive(), idempotencyKey: keySchema,
    priority: z.enum(["important", "critical"]).optional(),
    responsibleUserId: chatIdSchema.nullable().optional(), note: noteSchema.optional(), dueDate: chatCalendarDateSchema.optional()
}).strict();
export const chatParticipantSchema = z.object({ userId: chatIdSchema, reason: noteSchema, idempotencyKey: keySchema }).strict();
export const chatRevokeSchema = z.object({ expectedVersion: z.number().int().positive(), reason: noteSchema, idempotencyKey: keySchema }).strict();
export const chatRemovalSchema = z.object({ expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), reason: noteSchema, idempotencyKey: keySchema }).strict();
export const chatActionTypeSchema = z.object({ name: z.string().trim().min(1).max(60), idempotencyKey: keySchema }).strict();
export const chatProjectNameSchema = z.object({ name: z.string().trim().min(1).max(200), expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), idempotencyKey: keySchema }).strict();
export const chatReadSchema = z.object({ messageId: chatIdSchema, sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const chatMessageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().max(1000).optional(), after: z.string().max(1000).optional(), around: chatIdSchema.optional(),
    filter: z.enum(["all", "mentions", "critical", "important", "resolved"]).default("all")
}).strict().refine((value) => [value.before, value.after, value.around].filter(Boolean).length <= 1, "Choose one history cursor.");
export const chatListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export const projectMessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0),
    filter: z.enum(["all", "unread", "critical", "important"]).default("all"),
    search: z.string().trim().max(100).default("")
}).strict();
export const CHAT_EXCERPT_LIMIT = 120;
/** Plain-text preview of a saved body. Mentions are already stored in the body as validated `@Name` text. */
export function chatExcerpt(body: string, limit = CHAT_EXCERPT_LIMIT): string {
    const text = body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length <= limit)
        return text;
    let cut = text.slice(0, limit - 1);
    if (/[\ud800-\udbff]$/.test(cut))
        cut = cut.slice(0, -1);
    return `${cut.trimEnd()}\u2026`;
}
export const chatOptionsQuerySchema = z.object({ search: z.string().trim().max(100).default(""), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export function parseChatInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new ApiError(400, "CHAT_INVALID_INPUT", "Check the message or action details.");
    return result.data;
}
export function chatNotFound(): never { throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); }
export function chatConflict(message = "The conversation changed. Refresh its current state and retry."): never { throw new ApiError(409, "CHAT_CONFLICT", message); }
export function chatForbidden(): never { throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."); }
export function chatInvalid(message: string): never { throw new ApiError(400, "CHAT_INVALID_INPUT", message); }
export function chatPerson(user: ChatPerson): ChatPerson { return { id: user.id, name: user.name, role: user.role }; }
export function chatManager(actor: Pick<ChatActor, "role">): boolean { return ["super_admin", "admin", "design_manager", "site_manager"].includes(actor.role); }
export function chatFingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function chatCursor(projectId: string, sequence: number): string { return Buffer.from(JSON.stringify({ v: 1, p: projectId, s: sequence })).toString("base64url"); }
export function parseChatCursor(projectId: string, cursor: string): number {
    try {
        if (!/^[A-Za-z0-9_-]{1,1000}$/.test(cursor))
            throw new Error();
        const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (value.v !== 1 || value.p !== projectId || !Number.isSafeInteger(value.s) || value.s < 0 || chatCursor(projectId, value.s) !== cursor)
            throw new Error();
        return value.s;
    }
    catch {
        return chatInvalid("The conversation cursor is invalid.");
    }
}
export function issueCapabilities(actor: ChatActor, message: Pick<ChatMessage, "priority" | "issueStatus" | "raisedBy" | "responsible" | "action">): ChatMessage["capabilities"] {
    const manager = chatManager(actor);
    const owns = manager || message.raisedBy?.id === actor.id || message.responsible?.id === actor.id;
    return {
        canRaise: message.priority === "normal" || (message.priority === "important" && message.issueStatus === "open"),
        canResolve: message.issueStatus === "open" && owns,
        canReopen: message.issueStatus === "resolved",
        canAssign: message.priority !== "normal" && (manager || message.raisedBy?.id === actor.id),
        canAssignSelf: message.priority !== "normal",
        canReschedule: Boolean(message.action) && owns
    };
}
export function transitionChatIssue(actor: ChatActor, message: ChatMessage, input: ChatIssueInput, responsible: ChatPerson | null, raiser: ChatPerson): void {
    const capabilities = issueCapabilities(actor, message);
    const owns = chatManager(actor) || message.raisedBy?.id === actor.id || message.responsible?.id === actor.id;
    if (["resolve", "reopen", "lower", "clear", "reschedule"].includes(input.action) && !input.note?.trim())
        chatInvalid("A brief reason or resolution note is required.");
    if (input.action !== "assign" && input.responsibleUserId !== undefined)
        chatInvalid("Use the assignment action to change the responsible participant.");
    if (input.action !== "raise" && input.priority !== undefined)
        chatInvalid("Priority is only accepted when raising an issue.");
    if (input.action !== "reschedule" && input.dueDate !== undefined)
        chatInvalid("Use the reschedule action to change the due date.");
    switch (input.action) {
        case "raise":
            if (message.priority !== "normal")
                chatConflict();
            if (!input.priority)
                chatInvalid("Choose Important or Critical.");
            message.priority = input.priority;
            message.issueStatus = "open";
            message.raisedBy = chatPerson(raiser);
            break;
        case "escalate":
            if (message.priority !== "important" || message.issueStatus !== "open")
                chatConflict();
            message.priority = "critical";
            break;
        case "resolve":
            if (!owns)
                chatForbidden();
            if (!capabilities.canResolve)
                chatConflict();
            message.issueStatus = "resolved";
            break;
        case "reopen":
            if (!capabilities.canReopen)
                chatConflict();
            message.issueStatus = "open";
            break;
        case "lower":
            if (!owns)
                chatForbidden();
            if (message.priority !== "critical" || message.issueStatus !== "open")
                chatConflict();
            message.priority = "important";
            break;
        case "reschedule":
            if (!capabilities.canReschedule) chatForbidden();
            if (!message.action || !input.dueDate) chatInvalid("Choose a due date for this tracked action.");
            if (message.action.dueDate === input.dueDate) chatInvalid("Choose a different due date.");
            message.action = { ...message.action, dueDate: input.dueDate };
            break;
        case "clear":
            if (message.action) chatInvalid("Tracked actions must retain their tracking and history.");
            if (!owns)
                chatForbidden();
            if (message.priority === "normal")
                chatConflict();
            message.priority = "normal";
            message.issueStatus = null;
            message.raisedBy = null;
            message.responsible = null;
            break;
        case "assign":
            if (message.priority === "normal")
                chatConflict();
            if (input.responsibleUserId === undefined)
                chatInvalid("Choose a responsible participant, or clear the assignment.");
            if (!capabilities.canAssign && input.responsibleUserId !== actor.id)
                chatForbidden();
            if (message.action && !responsible) chatInvalid("Tracked actions require a responsible participant.");
            message.responsible = responsible ? { ...responsible, available: true } : null;
            break;
    }
}
