import { ProjectModel } from "../models/Project.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatActor, ChatPerson } from "../contracts/project-chat.js";
import { LISNO_AI, type AssistantReadScope, type AssistantReadSources, type ChatAssistantResult } from "../contracts/project-chat-assistant.js";
import { hasPermission } from "../domain/authorization.js";
import { assistantTerminal } from "../domain/project-chat-assistant.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { chatConflict, chatExcerpt, chatFingerprint, chatNotFound, chatPerson, parseChatInput } from "../domain/project-chat.js";
import type { Role } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import type { AssistantRun } from "../repositories/project-assistant.js";
import type { ChatSources, ChatStoredMessage, ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import type { AuditService, AuditWrite } from "./audit.service.js";
import { projectChatContext } from "./project-chat-context.js";
import { readAssistantContext } from "./project-assistant-context.js";
import type { AssistantProvider } from "./project-assistant-provider.js";
import { assistantMessageState, createProjectAssistantRuntime } from "./project-assistant-runtime.js";
import { createAssistantReadSources } from "./project-assistant-sources.js";
import type { Clock } from "./workflow.js";

export const assistantRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100), expectedVersion: z.number().int().positive()
}).strict();

type Topic = "estimate" | "design" | "execution" | "procurement" | "coordination";
const topics: Array<[Topic, RegExp]> = [
  ["estimate", /\b(estimate|estimation|price|pricing|cost|charges|budget|add(?:ing)?|quotation)\b/iu],
  ["design", /\b(design|drawing|layout|render|colour|color|material selection)\b/iu],
  ["execution", /\b(site|progress|work|completion|completed|finish|finished|vendor|installation)\b/iu],
  ["procurement", /\b(procurement|purchase|order|delivery|dispatch|supplier)\b/iu],
  ["coordination", /\b(project|timeline|schedule|deadline|handover)\b/iu]
];
const topicRoles: Record<Topic, Role[]> = { estimate: ["estimator_sales"], design: ["designer", "design_manager"], execution: ["site_manager"], procurement: ["procurement"], coordination: ["program_manager"] };

/** No new authority is inferred from a person's role or their presence in a chat. */
async function resolveOwner(tx: ChatTransaction, sources: ChatSources, message: ChatStoredMessage, overrideTopic?: Topic) {
  const membership = resolveChatMembership(sources, await tx.selections(sources.project.id));
  const humans = membership.participants.filter(person => person.role !== "client" && hasPermission(person.role, "chat.read"));
  const selected = (id?: string | null) => humans.find(person => person.id === id);
  const explicit = selected(message.responsible?.id);
  if (explicit) return { owner: chatPerson(explicit), fallback: false };
  const reply = message.replyTo ? await tx.message(message.projectId, message.replyTo.id) : null;
  const referenced = selected(reply?.responsible?.id);
  if (referenced) return { owner: chatPerson(referenced), fallback: false };
  const taskMatches = sources.workflowTasks.filter(task => task.title && task.title.length >= 6 && message.body.toLocaleLowerCase().includes(task.title.toLocaleLowerCase()));
  const taskOwners = humans.filter(person => taskMatches.some(task => task.assigneeUserId === person.id && person.sources.some(source => source.kind === "workflow_assignment" && source.id === task.id)));
  if (taskOwners.length === 1) return { owner: chatPerson(taskOwners[0]!), fallback: false };
  const matches = topics.filter(([, pattern]) => pattern.test(message.body));
  const topic = overrideTopic ?? (matches.length === 1 ? matches[0]![0] : null);
  if (topic) {
    const assigned = humans.filter(person => topicRoles[topic].includes(person.role) && (
      person.id === sources.project.programManagerId || person.sources.some(source => !["selection", "super_admin", "client"].includes(source.kind))));
    if (assigned.length === 1) return { owner: chatPerson(assigned[0]!), fallback: false };
  }
  const manager = selected(sources.project.programManagerId);
  if (manager?.role === "program_manager") return { owner: chatPerson(manager), fallback: true };
  const superAdmins = sources.users.filter(user => user.active && user.role === "super_admin");
  const administrator = superAdmins.length === 1 ? selected(superAdmins[0]!.id) : undefined;
  return { owner: administrator ? chatPerson(administrator) : null, fallback: true };
}

export interface ProjectChatAssistantOptions {
  chatRepository: ProjectChatRepository; audit: AuditService; clock?: Clock;
  enabled: boolean; provider: AssistantProvider;
  tokensPerDay?: number;
  readSources?: (scope: AssistantReadScope, transaction?: ChatTransaction) => AssistantReadSources;
  onNotificationsCommitted?: (ids: string[]) => void;
}

export function createProjectChatAssistantService(options: ProjectChatAssistantOptions) {
  const store = options.chatRepository, clock = options.clock ?? (() => new Date());
  const reads = options.readSources ?? ((scope: AssistantReadScope, transaction?: ChatTransaction) => createAssistantReadSources({chatRepository: store, scope, clock, transaction}));
  const appendAudit = async (tx: ChatTransaction, input: AuditWrite) => tx.session ? options.audit.appendInMongoTransaction(input, tx.session) : options.audit.append(input, tx.app);
  const route = async (tx: ChatTransaction, sources: ChatSources, message: ChatStoredMessage, now: string, overrideTopic?: Topic) => {
    const resolved = await resolveOwner(tx, sources, message, overrideTopic);
    const result = { hasOwner: Boolean(resolved.owner && !resolved.fallback), notified: null as ChatPerson | null, routing: "not_required" as AssistantRun["routing"], recipientIds: [] as string[] };
    if (message.priority === "normal" || message.issueStatus !== "open") return result;
    result.routing = resolved.owner ? "notified" : "unroutable";
    result.notified = resolved.owner;
    const id = chatFingerprint(["assistant-routing", message.projectId, message.id, message.version, resolved.owner?.id ?? "unroutable"]);
    if (await tx.assistant.receipt(id)) return result;
    await tx.assistant.saveReceipt({id, kind: "routing", projectId: message.projectId, runId: message.id, createdAt: now, fingerprint: chatFingerprint({priority: message.priority, recipientId: resolved.owner?.id ?? null}), amount: 0, settled: true});
    if (resolved.owner) {
      await tx.routeNotification({id: `notification-${randomUUID()}`, type: "chat.assistant.route", recipientId: resolved.owner.id,
        projectId: message.projectId, projectName: sources.project.name, messageId: message.id,
        actor: {id: message.author.id, name: message.author.name}, excerpt: chatExcerpt(message.body), createdAt: now, readAt: null,
        routing: {priority: message.priority, messageVersion: message.version, lastAlertAt: now},
        email: {status: "pending", attempts: 0, nextAttemptAt: now, leaseToken: null, leaseExpiresAt: null, deliveredAt: null, failureCode: null}
      }, message.version > 1);
      result.recipientIds.push(resolved.owner.id);
    }
    await appendAudit(tx, {actorId: message.author.id, action: "project_chat.assistant_routed", entityType: "project_chat_message", entityId: message.id, occurredAt: now,
      newValues: {projectId: message.projectId, messageVersion: message.version, recipientId: resolved.owner?.id ?? null, fallback: resolved.fallback, service: LISNO_AI.id}});
    return result;
  };
  const runtime = createProjectAssistantRuntime({
    repository: store, enabled: options.enabled, provider: options.provider, now: clock, tokensPerDay: options.tokensPerDay,
    readSources: scope => reads(scope),
    onPublished: options.onNotificationsCommitted,
    authorize: async (tx, run) => { try { await readAssistantContext(store, run, tx); return true; } catch { return false; } },
    validateSources: async (tx, scope, freshness) => {
      // Legacy vendor acceptance and aggregate Site Manager review serialize on this
      // existing concurrency token rather than the global authorization fence.
      // It is metadata only: no stage, deadline, progress or approved amount changes.
      if (tx.session) {
        const fenced = await ProjectModel.updateOne({_id: scope.projectId}, {$inc: {siteCompletionFenceEpoch: 1}}, {session: tx.session, timestamps: false});
        if (fenced.matchedCount !== 1) return false;
      }
      return reads(scope, tx).revalidate(freshness);
    },
    stateChanged: async (tx, run) => {
      const sequence = await tx.allocate(run.projectId);
      await tx.appendEvent({id: `chat-event-${randomUUID()}`, projectId: run.projectId, sequence, type: "assistant.changed", recordId: run.messageId, version: run.stateVersion, occurredAt: run.updatedAt, actorId: LISNO_AI.id, privateUserId: null});
    },
    publish: async (tx, run, generated, checkedAt) => {
      const question = await tx.message(run.projectId, run.messageId);
      if (!question) chatNotFound();
      const context = await readAssistantContext(store, run, tx);
      const topic = generated.kind === "price" || generated.kind === "catalogue" ? "estimate" : generated.facts.some(fact => fact.id.startsWith("execution")) ? "execution" : undefined;
      const routingQuestion = run.coalescedSources?.length ? await tx.message(run.projectId, run.coalescedSources[0]!.messageId) : question;
      const handoff = topic && routingQuestion ? await route(tx, context.sources, routingQuestion, checkedAt, topic) : null;
      const id = `chat-message-${randomUUID()}`, resultId = `assistant-result-${randomUUID()}`;
      // Prices and answers are returned only through the authenticated structured-result reader.
      const sourceFreeReply = Boolean(generated.narrative?.length) && !generated.facts.length && !generated.candidates.length && !generated.commercial && !generated.missingInputs.length && generated.kind !== "clarification";
      const body = sourceFreeReply ? "Lisno AI replied to your message."
        : generated.kind === "no_answer" ? "I could not verify an answer from the available project information. Please ask the project team."
        : generated.kind === "clarification" ? "I need a few details to check this request."
        : generated.commercial ? "I checked the available Configuration items for this request. Any price preview is approximate and requires staff confirmation."
        : generated.facts.length ? "I checked the available project information for this request."
        : "Lisno AI replied to your message.";
      const sequence = await tx.allocate(run.projectId, checkedAt);
      await tx.saveMessage({id, projectId: run.projectId, author: LISNO_AI, body, attachments: [], mentions: [], createdAt: checkedAt,
        sequence, clientMessageId: `assistant:${run.id}`, replyTo: {id: question.id, author: question.author, body: question.body},
        priority: "normal", issueStatus: null, raisedBy: null, responsible: null, version: 1, assistantRunId: run.id});
      await tx.appendEvent({id: `chat-event-${randomUUID()}`, projectId: run.projectId, sequence, type: "message.created", recordId: id, version: 1, occurredAt: checkedAt, actorId: LISNO_AI.id, privateUserId: null});
      await appendAudit(tx, {actorId: run.clientId, action: "project_chat.assistant_answered", entityType: "project_chat_message", entityId: id, occurredAt: checkedAt,
        newValues: {projectId: run.projectId, sourceMessageId: run.messageId, runId: run.id, resultId, kind: generated.kind, service: LISNO_AI.id}});
      return {messageId: id, resultId, ...(handoff ? {notified: handoff.notified, routing: handoff.routing, recipientIds: handoff.recipientIds} : {})};
    }
  });
  return {
    runtime,
    participant: { ...LISNO_AI, available: options.enabled },
    async onMessage(tx: ChatTransaction, sources: ChatSources, message: ChatStoredMessage, trigger = true) {
      if (message.author.kind === "service") return [];
      if (message.author.role !== "client") { await runtime.cancelAfterHumanReply(tx, message); return []; }
      const user = await tx.app.findUserById(message.author.id);
      if (!user?.active || user.role !== "client" || sources.project.clientId !== user.id) return [];
      const now = clock().toISOString();
      const routing = trigger ? await route(tx, sources, message, now) : { ...(await resolveOwner(tx, sources, message)), hasOwner: false, notified: null, routing: "not_required" as const, recipientIds: [] };
      if (trigger && (message.body.trim() || message.attachments.length)) {
        await runtime.enqueueAssistant(tx, {projectId: message.projectId, messageId: message.id, messageVersion: message.version,
          clientId: user.id, sessionVersion: user.sessionVersion ?? 1, hasOwner: routing.hasOwner, notified: routing.notified, routing: routing.routing, now});
      }
      return routing.recipientIds;
    },
    async present(tx: ChatTransaction, actor: ChatActor, message: ChatStoredMessage) {
      const run = message.assistantRunId ? await tx.assistant.run(message.assistantRunId) : await runtime.latestRun(tx, message.projectId, message.id);
      if (!run) return undefined;
      return assistantMessageState(run, options.enabled && message.author.kind !== "service" && actor.role === "client" && actor.id === run.clientId && run.status !== "leased" && message.issueStatus !== "resolved");
    },
    async request(actor: ChatActor, projectId: string, messageId: string, input: unknown) {
      const value = parseChatInput(assistantRequestSchema, input);
      const result = await store.mutate(async tx => {
        const context = await projectChatContext(tx, actor, projectId, clock, "chat.assistant.request");
        if (actor.role !== "client" || context.sources.project.clientId !== actor.id) chatNotFound();
        if (!options.enabled) throw new ApiError(503, "ASSISTANT_UNAVAILABLE", "Lisno AI is currently unavailable. Your project team can still reply.");
        const question = await tx.message(projectId, messageId);
        if (!question || question.author.kind === "service" || question.author.id !== actor.id || question.author.role !== "client") chatNotFound();
        if (question.version !== value.expectedVersion) chatConflict();
        if (question.issueStatus === "resolved") throw new ApiError(409, "ASSISTANT_ISSUE_RESOLVED", "This request is resolved. Send a new question for further help.");
        const previous = await runtime.latestRun(tx, projectId, messageId);
        const resolved = await resolveOwner(tx, context.sources, question);
        const run = await runtime.enqueueAssistant(tx, {projectId, messageId, messageVersion: question.version, clientId: actor.id, sessionVersion: actor.sessionVersion,
          hasOwner: Boolean(resolved.owner && !resolved.fallback), notified: previous?.notified ?? null, routing: previous?.routing ?? "not_required", explicit: true, idempotencyKey: value.idempotencyKey});
        if (!run) throw new ApiError(503, "ASSISTANT_UNAVAILABLE", "Lisno AI is currently unavailable.");
        return assistantMessageState(run, assistantTerminal(run.status));
      });
      runtime.wake(); return result;
    },
    async result(actor: ChatActor, projectId: string, resultId: string): Promise<ChatAssistantResult> {
      return store.snapshot(async tx => {
        const context = await projectChatContext(tx, actor, projectId, clock, "chat.assistant.read");
        const result = await tx.assistant.result(projectId, resultId);
        if (!result) chatNotFound();
        const run = await tx.assistant.run(result.runId);
        if (!run || run.projectId !== projectId || context.sources.project.clientId !== run.clientId) chatNotFound();
        const message = await tx.message(projectId, result.messageId);
        if (!message || message.assistantRunId !== run.id || message.author.kind !== "service") chatNotFound();
        const commercialAllowed = actor.role === "client" && actor.id === context.sources.project.clientId ||
          actor.role === "super_admin" && await tx.app.countActiveUsersByRole("super_admin") === 1 ||
          actor.role === "estimator_sales" && hasPermission(actor.role, "estimation.estimate.read") && (
            context.sources.project.assignedEstimatorId === actor.id || context.sources.estimates.some(estimate => estimate.ownerId === actor.id && estimate.projectId === projectId) ||
            context.sources.leads.some(lead => lead.ownerId === actor.id && lead.projectId === projectId));
        const stale = !(await reads(run, tx).revalidate(result.freshness));
        const {freshness: _freshness, runId: _runId, ...publicResult} = result;
        return {...publicResult, ...(stale ? {narrative: undefined} : {}), stale, commercial: commercialAllowed ? result.commercial : null,
          commercialAccess: result.commercial ? commercialAllowed ? "allowed" : "restricted" : "none"};
      });
    }
  };
}
export type ProjectChatAssistantService = ReturnType<typeof createProjectChatAssistantService>;
