import { createHash, randomUUID } from "node:crypto";
import type { ChatPerson } from "../contracts/project-chat.js";
import type { AssistantGeneratedResult, AssistantReadScope, AssistantReadSources, AssistantSourceVersion, ChatAssistantMessageState } from "../contracts/project-chat-assistant.js";
import { ASSISTANT_DEFAULTS as defaults, AssistantFailure, assistantEligibleAt, assistantFailureCode, assistantTerminal, assistantQuantityFragment } from "../domain/project-chat-assistant.js";
import type { ChatStoredMessage, ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import type { AssistantRun, AssistantTransactions } from "../repositories/project-assistant.js";
import type { AssistantProvider } from "./project-assistant-provider.js";
import { isSocialMessage } from "./ask-lisno-project-resolution.js";

type AssistantTx = ChatTransaction & {assistant: AssistantTransactions};
const operations = (tx: ChatTransaction) => (tx as AssistantTx).assistant;
const hash = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const pending = (run: AssistantRun) => !assistantTerminal(run.status);
const human = (message: ChatStoredMessage) => "role" in message.author && message.author.role !== "client" && message.author.id !== "lisno-ai";
const neverStartedAutomatic = (run: AssistantRun) => !run.explicit && ["ready", "waiting_for_human"].includes(run.status) && !run.generationStartedAt && !run.workerAttempts && !run.providerAttempts;
// Social turns and ambiguous acknowledgments must not replace a still-unanswered question.
const standaloneResponse = (body: string) => isSocialMessage(body) || /^(?:great|fine|cool|yes|no)[\s.!?]*$/iu.test(body.normalize("NFKC").trim());
const sourceIds = (run: AssistantRun) => new Set([run.messageId, ...(run.coalescedSources ?? []).map(source => source.messageId)]);
import { acquireAssistantSlot, admitAssistant, reserveAssistantTokens, settleAssistantTokens } from "./assistant-usage.js";
export interface EnqueueAssistantInput extends AssistantReadScope {
  messageId: string; messageVersion: number; hasOwner: boolean;
  notified: ChatPerson | null; routing: AssistantRun["routing"];
  now?: string; explicit?: boolean; idempotencyKey?: string;
}
export interface AssistantRuntimeOptions {
  repository: ProjectChatRepository; enabled: boolean; provider: AssistantProvider;
  readSources(scope: AssistantReadScope): AssistantReadSources;
  authorize(tx: ChatTransaction, run: AssistantRun): Promise<boolean>;
  validateSources(tx: ChatTransaction, scope: AssistantReadScope, freshness: AssistantSourceVersion[]): Promise<boolean>;
  publish(tx: ChatTransaction, run: AssistantRun, result: AssistantGeneratedResult, checkedAt: string): Promise<{messageId: string; resultId: string; notified?: ChatPerson | null; routing?: AssistantRun["routing"]; recipientIds?: string[]}>;
  onPublished?(recipientIds: string[]): void;
  stateChanged?(tx: ChatTransaction, run: AssistantRun): Promise<void>;
  now?: () => Date;
  tokensPerDay?: number; clientPerHour?: number; projectPerHour?: number; deploymentPerDay?: number;
}
export function assistantMessageState(run: AssistantRun, canRequest = false): ChatAssistantMessageState {
  return {runId: run.id, generation: run.generation, stateVersion: run.stateVersion, status: run.status, eligibleAt: run.eligibleAt, resultId: run.resultId, checkedAt: run.checkedAt, notified: run.notified, routing: run.routing, canRequest, failureCode: run.failureCode};
}
export function createProjectAssistantRuntime(options: AssistantRuntimeOptions) {
  const clock = options.now ?? (() => new Date());
  const active = new Set<Promise<boolean>>(), controllers = new Set<AbortController>();
  let timer: ReturnType<typeof setInterval> | null = null, stopped = false, consecutiveFailures = 0, lastFailureCode: string | null = null;
  const save = async (tx: ChatTransaction, run: AssistantRun) => {
    const previous = await operations(tx).run(run.id);
    run.stateVersion = (previous?.stateVersion ?? 0) + 1;
    await operations(tx).saveRun(run); await options.stateChanged?.(tx, run);
  };
  const suppress = async (tx: ChatTransaction, run: AssistantRun, reason: string, now: string) => { await save(tx, {...run, status: "suppressed", failureCode: reason, leaseToken: null, leaseUntil: null, updatedAt: now}); };
  const current = async (tx: ChatTransaction, run: AssistantRun, now: string, token?: string): Promise<boolean> => {
    const found = await operations(tx).run(run.id);
    if (!found || !pending(found) || (token && (found.leaseToken !== token || found.leaseUntil! <= now))) return false;
    const message = await tx.message(run.projectId, run.messageId);
    const latest = await operations(tx).latestRun(run.projectId, run.messageId);
    if (!message || message.version !== run.messageVersion || message.issueStatus === "resolved" || latest?.id !== run.id || !(await options.authorize(tx, found))) { await suppress(tx, found, "ASSISTANT_AUTHORITY_CHANGED", now); return false; }
    for (const source of run.coalescedSources ?? []) {
      const sourceMessage = await tx.message(run.projectId, source.messageId);
      const sourceRun = await operations(tx).latestRun(run.projectId, source.messageId);
      if (!sourceMessage || sourceMessage.author.id !== run.clientId || sourceMessage.version !== source.messageVersion || sourceMessage.issueStatus === "resolved" || sourceRun?.id !== source.runId) { await suppress(tx, found, "ASSISTANT_SOURCE_CHANGED", now); return false; }
    }
    // Scan all intervening messages in bounded pages, not just the last screen of chat.
    let after = run.responseAfterSequence;
    for (;;) {
      const messages = await tx.messages({projectId: run.projectId, userId: run.clientId, filter: "all", after, limit: 100, ascending: true});
      if (messages.some(reply => human(reply) && (!reply.replyTo || sourceIds(run).has(reply.replyTo.id)))) { await suppress(tx, found, "ASSISTANT_HUMAN_REPLIED", now); return false; }
      if (messages.length < 100) break;
      const next = messages[messages.length - 1].sequence;
      if (next <= after) throw new AssistantFailure("ASSISTANT_CONTEXT_INVALID");
      after = next;
    }
    return true;
  };
  const sourceEligibility = async (tx: ChatTransaction, run: AssistantRun): Promise<string> => {
    const sources: Array<ChatStoredMessage | null> = [];
    for (const id of sourceIds(run)) sources.push(await tx.message(run.projectId, id));
    if (sources.some(source => !source)) throw new AssistantFailure("ASSISTANT_CONTEXT_INVALID");
    const latestAt = Math.max(...sources.map(source => Date.parse(source!.createdAt)));
    if (!Number.isFinite(latestAt)) throw new AssistantFailure("ASSISTANT_CONTEXT_INVALID");
    return assistantEligibleAt(new Date(latestAt), false, false);
  };
  const normalizeEligibility = async (tx: ChatTransaction, run: AssistantRun, now: string): Promise<AssistantRun> => {
    if (!neverStartedAutomatic(run)) return run;
    const eligibleAt = await sourceEligibility(tx, run);
    const status: AssistantRun["status"] = eligibleAt <= now ? "ready" : "waiting_for_human";
    if (eligibleAt === run.eligibleAt && status === run.status) return run;
    const normalized: AssistantRun = {...run, eligibleAt, status, updatedAt: now};
    await save(tx, normalized);
    return normalized;
  };
  const enqueueAssistant = async (tx: ChatTransaction, input: EnqueueAssistantInput): Promise<AssistantRun | null> => {
    if (!options.enabled) return null;
    const a = operations(tx), now = input.now ?? clock().toISOString();
    const message = await tx.message(input.projectId, input.messageId);
    if (!message || message.author.id !== input.clientId || !("role" in message.author) || message.author.role !== "client" || message.version !== input.messageVersion || message.issueStatus === "resolved") return null;
    if (input.explicit && !input.idempotencyKey) throw new AssistantFailure("ASSISTANT_REQUEST_KEY_REQUIRED");
    const key = hash(["generation", input.projectId, input.clientId, input.messageId, input.explicit ? input.idempotencyKey : `automatic:${input.messageVersion}`]);
    const receipt = await a.receipt(key);
    const fingerprint = hash([input.projectId, input.clientId, input.messageId, input.messageVersion]);
    if (receipt) { if (receipt.fingerprint !== fingerprint) throw new AssistantFailure("ASSISTANT_REQUEST_CONFLICT"); return a.run(receipt.runId); }
    const latest = await a.latestRun(input.projectId, input.messageId);
    if (latest && pending(latest) && latest.messageVersion === input.messageVersion && latest.sessionVersion === input.sessionVersion) {
      const eligibleAt = input.explicit ? now : neverStartedAutomatic(latest) ? await sourceEligibility(tx, latest) : latest.eligibleAt;
      const updated = {...latest, eligibleAt: input.explicit ? (eligibleAt < latest.eligibleAt ? eligibleAt : latest.eligibleAt) : eligibleAt, explicit: latest.explicit || Boolean(input.explicit), notified: input.notified, routing: input.routing, updatedAt: now};
      await a.saveReceipt({id: key, kind: "generation", projectId: input.projectId, runId: latest.id, createdAt: now, fingerprint, amount: 0, settled: true});
      await save(tx, updated); return updated;
    }
    if (latest && pending(latest)) await suppress(tx, latest, "ASSISTANT_SUPERSEDED", now);
    let predecessor: AssistantRun | null = null;
    // A tagged followup is always a separate request. Routing receipts belong to the source messages and are untouched.
    if (!latest && !input.explicit && message.priority === "normal" && !message.attachments.length && !standaloneResponse(message.body)) {
      const previousMessages = await tx.messages({projectId: input.projectId, userId: input.clientId, filter: "all", before: message.sequence, limit: 1, ascending: false});
      const candidates = (await a.projectRuns(input.projectId)).filter(row => row.clientId === input.clientId && row.sessionVersion === input.sessionVersion && row.messageId !== message.id && neverStartedAutomatic(row) && (row.coalescedSources?.length ?? 0) < defaults.maxContextMessages - 1)
        .sort((left, right) => right.messageSequence - left.messageSequence);
      for (const candidate of candidates) {
        const firstSource = await tx.message(input.projectId, candidate.coalescedSources?.[0]?.messageId ?? candidate.messageId);
        if (!firstSource) continue;
        const elapsed = Date.parse(now) - Date.parse(firstSource.createdAt);
        if (elapsed < 0 || elapsed > 30_000) continue;
        const explicitLink = message.replyTo && sourceIds(candidate).has(message.replyTo.id);
        const adjacentQuantity = !message.replyTo && previousMessages[0]?.id === candidate.messageId && assistantQuantityFragment(message.body);
        if ((explicitLink || adjacentQuantity) && await current(tx, candidate, now)) { predecessor = candidate; break; }
      }
    }
    const eligibleAt = assistantEligibleAt(new Date(input.explicit ? now : message.createdAt), input.hasOwner, Boolean(input.explicit));
    const run: AssistantRun = {id: randomUUID(), projectId: input.projectId, clientId: input.clientId, sessionVersion: input.sessionVersion, messageId: input.messageId, messageVersion: message.version, messageSequence: message.sequence, responseAfterSequence: (await tx.state(input.projectId)).latestMessageSequence, generation: (latest?.generation ?? 0) + 1, status: eligibleAt <= now ? "ready" : "waiting_for_human", stateVersion: 1, eligibleAt, createdAt: now, updatedAt: now, coalescingStartedAt: message.createdAt, explicit: Boolean(input.explicit), notified: input.notified, routing: input.routing, workerAttempts: 0, providerAttempts: 0, generationStartedAt: null, leaseToken: null, leaseUntil: null, resultId: null, answerMessageId: null, checkedAt: null, failureCode: null};
    if (latest?.coalescedSources?.length) {
      // Explicit retries or tag changes on the latest fragment retain the complete question lineage.
      run.coalescedSources = latest.coalescedSources;
      run.coalescingStartedAt = latest.coalescingStartedAt ?? latest.createdAt;
    }
    if (predecessor) {
      run.coalescedSources = [...(predecessor.coalescedSources ?? []), {runId: predecessor.id, messageId: predecessor.messageId, messageVersion: predecessor.messageVersion, messageSequence: predecessor.messageSequence}];
      run.coalescingStartedAt = predecessor.coalescingStartedAt ?? predecessor.createdAt;
      run.responseAfterSequence = predecessor.responseAfterSequence;
      run.providerAttempts = predecessor.providerAttempts; run.workerAttempts = predecessor.workerAttempts; run.generationStartedAt = predecessor.generationStartedAt;
      run.notified = input.notified ?? predecessor.notified;
      run.routing = input.routing === "not_required" ? predecessor.routing : input.routing;
      await suppress(tx, predecessor, "ASSISTANT_COALESCED", now);
    }
    if (!(await admitAssistant(a, {...input, now, clientPerHour: options.clientPerHour, projectPerHour: options.projectPerHour, deploymentPerDay: options.deploymentPerDay}))) { run.status = "failed"; run.failureCode = "ASSISTANT_ADMISSION_LIMIT"; }
    await a.saveReceipt({id: key, kind: "generation", projectId: input.projectId, runId: run.id, createdAt: now, fingerprint, amount: 0, settled: true});
    await save(tx, run); return run;
  };
  const cancelAfterHumanReply = async (tx: ChatTransaction, message: ChatStoredMessage): Promise<void> => {
    if (!human(message)) return;
    for (const run of await operations(tx).projectRuns(message.projectId)) if (message.sequence > run.responseAfterSequence && (!message.replyTo || sourceIds(run).has(message.replyTo.id))) await suppress(tx, run, "ASSISTANT_HUMAN_REPLIED", message.createdAt);
  };
  const claim = () => options.repository.mutate(async tx => {
    const now = clock().toISOString(), a = operations(tx);
    for (const waiting of await a.waitingRuns(500)) {
      if (!(await current(tx, waiting, now))) continue;
      await normalizeEligibility(tx, waiting, now);
    }
    for (const candidate of await a.dueRuns(now, 30)) {
      // Legacy no-owner/out-of-hours runs can already be ready. Repair their wait before leasing.
      if (!(await current(tx, candidate, now))) continue;
      const run = await normalizeEligibility(tx, candidate, now);
      if (run.status !== "leased" && run.eligibleAt > now) continue;
      if (run.generationStartedAt && Date.parse(now) - Date.parse(run.generationStartedAt) >= defaults.generationMs) { await save(tx, {...run, status: "failed", failureCode: "ASSISTANT_TIME_LIMIT", leaseToken: null, leaseUntil: null, updatedAt: now}); continue; }
      if (run.workerAttempts >= defaults.maxWorkerAttempts || run.providerAttempts >= defaults.maxProviderAttempts) { await save(tx, {...run, status: "failed", failureCode: "ASSISTANT_RETRY_LIMIT", leaseToken: null, leaseUntil: null, updatedAt: now}); continue; }
      const projectRuns = await a.projectRuns(run.projectId);
      if (projectRuns.some(other => other.id !== run.id && other.status === "leased" && other.leaseUntil! > now)) continue;
      if (!(await current(tx, run, now))) continue;
      const claimed: AssistantRun = {...run, status: "leased", generationStartedAt: run.generationStartedAt ?? now, leaseToken: randomUUID(), leaseUntil: new Date(Date.parse(now) + defaults.leaseMs).toISOString(), workerAttempts: run.workerAttempts + 1, updatedAt: now};
      await save(tx, claimed); return claimed;
    }
    return null;
  });
  const perform = async (): Promise<boolean> => {
    if (!options.enabled || stopped) return false;
    const releaseSlot = acquireAssistantSlot();
    if (!releaseSlot) return false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController(); controllers.add(controller);
    let run: AssistantRun | null = null;
    try {
      run = await claim(); if (!run) return false;
      const claimed = run, token = run.leaseToken!;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, defaults.generationMs - (clock().getTime() - Date.parse(run.generationStartedAt!))))]);
      heartbeat = setInterval(() => { void options.repository.mutate(async tx => {
        const now = clock().toISOString(), currentRun = await operations(tx).run(claimed.id);
        if (!currentRun || currentRun.status !== "leased" || currentRun.leaseToken !== token || currentRun.leaseUntil! <= now) { controller.abort(); return; }
        await operations(tx).saveRun({...currentRun, leaseUntil: new Date(Date.parse(now) + defaults.leaseMs).toISOString(), updatedAt: now});
      }).catch(() => controller.abort()); }, defaults.heartbeatMs); heartbeat.unref?.();
      const messages = await options.repository.snapshot(async tx => {
        const question = await tx.message(claimed.projectId, claimed.messageId);
        if (!question) throw new AssistantFailure("ASSISTANT_CONTEXT_INVALID");
        if (!question.body.trim() && !question.attachments.length) throw new AssistantFailure("ASSISTANT_TEXT_REQUIRED");
        // Only the initiating Client's text is sent. Staff/private amounts and AI results cannot leak through chat history.
        const required: ChatStoredMessage[] = [];
        for (const source of claimed.coalescedSources ?? []) {
          const row = await tx.message(claimed.projectId, source.messageId);
          if (!row || row.author.id !== claimed.clientId || row.version !== source.messageVersion) throw new AssistantFailure("ASSISTANT_CONTEXT_INVALID");
          required.push(row);
        }
        required.push(question);
        if (required.length > defaults.maxContextMessages) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
        const before = await tx.messages({projectId: claimed.projectId, userId: claimed.clientId, filter: "all", before: required[0].sequence, limit: defaults.maxContextMessages - 1, ascending: false});
        const optional = before.reverse().filter(row => row.author.id === claimed.clientId && row.author.kind !== "service");
        return [...optional.slice(Math.max(0, optional.length - (defaults.maxContextMessages - required.length))), ...required].map(row => ({id: row.id, body: row.body, ...(row.attachments.length ? {hasAttachments: true} : {})}));
      });
      const scope: AssistantReadScope = {projectId: claimed.projectId, clientId: claimed.clientId, sessionVersion: claimed.sessionVersion};
      const sources = options.readSources(scope);
      const generated = await options.provider.generate({messages, sources, signal,
        reserveAttempt: bytes => options.repository.mutate(async tx => {
          const now = clock().toISOString(), a = operations(tx);
          if (!(await current(tx, claimed, now, token))) throw new AssistantFailure("ASSISTANT_CANCELLED");
          const row = (await a.run(claimed.id))!;
          if (row.providerAttempts >= defaults.maxProviderAttempts || signal.aborted) throw new AssistantFailure("ASSISTANT_RETRY_LIMIT");
          const id = await reserveAssistantTokens(a, {requestId: row.id, attempt: row.providerAttempts + 1, projectId: row.projectId, bytes, now, tokensPerDay: options.tokensPerDay});
          await a.saveRun({...row, providerAttempts: row.providerAttempts + 1, updatedAt: now}); return id;
        }),
        settleAttempt: (id, usage) => options.repository.mutate(async tx => {
          await settleAssistantTokens(operations(tx), id, usage, clock().toISOString());
        })
      });
      if (signal.aborted) throw new AssistantFailure("ASSISTANT_TIMEOUT", true);
      if (!(await sources.revalidate(generated.freshness))) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
      let committedRecipients: string[] = [];
      await options.repository.mutate(async tx => {
        committedRecipients = [];
        const now = clock().toISOString(), a = operations(tx);
        if (!(await current(tx, claimed, now, token))) return;
        const row = (await a.run(claimed.id))!;
        if (!(await options.validateSources(tx, scope, generated.freshness))) { await suppress(tx, row, "ASSISTANT_SOURCE_CHANGED", now); return; }
        if (signal.aborted || Date.parse(now) - Date.parse(row.generationStartedAt!) >= defaults.generationMs) throw new AssistantFailure("ASSISTANT_TIME_LIMIT");
        const publicationId = hash(["publication", row.id]);
        if (await a.receipt(publicationId)) return;
        const published = await options.publish(tx, row, generated, now);
        committedRecipients = published.recipientIds ?? [];
        await a.saveResult({...generated, id: published.resultId, projectId: row.projectId, messageId: published.messageId, runId: row.id, checkedAt: now});
        await a.saveReceipt({id: publicationId, kind: "publication", projectId: row.projectId, runId: row.id, createdAt: now, fingerprint: published.messageId, amount: 0, settled: true});
        await save(tx, {...row, ...(published.notified !== undefined ? {notified: published.notified} : {}), ...(published.routing ? {routing: published.routing} : {}), status: generated.kind === "clarification" || generated.commercial?.state === "clarification_required" ? "needs_clarification" : generated.kind === "no_answer" ? "no_answer" : "answered", leaseToken: null, leaseUntil: null, resultId: published.resultId, answerMessageId: published.messageId, checkedAt: now, updatedAt: now, failureCode: null});
      });
      try { if (committedRecipients.length) options.onPublished?.(committedRecipients); } catch { /* Durable notifications recover after a missed wakeup. */ }
      consecutiveFailures = 0; lastFailureCode = null; return true;
    } catch (error) {
      consecutiveFailures++; lastFailureCode = assistantFailureCode(error);
      if (run) await options.repository.mutate(async tx => {
        const a = operations(tx), row = await a.run(run!.id), now = clock().toISOString();
        if (!row || row.status !== "leased" || row.leaseToken !== run!.leaseToken || row.leaseUntil! <= now) return;
        const retry = error instanceof AssistantFailure && error.transient && row.workerAttempts < defaults.maxWorkerAttempts && row.providerAttempts < defaults.maxProviderAttempts;
        await save(tx, {...row, status: retry ? "ready" : "failed", eligibleAt: retry ? new Date(Date.parse(now) + Math.max(1000 * 2 ** row.workerAttempts, (error as AssistantFailure).retryAfterMs)).toISOString() : row.eligibleAt, updatedAt: now, leaseToken: null, leaseUntil: null, failureCode: assistantFailureCode(error)});
      });
      return Boolean(run);
    } finally { if (heartbeat) clearInterval(heartbeat); controllers.delete(controller); releaseSlot(); }
  };
  const runOnce = () => { const promise = perform(); active.add(promise); void promise.finally(() => active.delete(promise)).catch(() => {}); return promise; };
  const wake = () => { if (!stopped && options.enabled) void runOnce().catch(() => { lastFailureCode = "ASSISTANT_STORAGE_UNAVAILABLE"; }); };
  return {
    enabled: options.enabled, enqueueAssistant, cancelAfterHumanReply,
    latestRun: (tx: ChatTransaction, projectId: string, messageId: string) => operations(tx).latestRun(projectId, messageId),
    runOnce, wake,
    start() { if (timer || !options.enabled) return; stopped = false; timer = setInterval(wake, defaults.scanMs); timer.unref?.(); wake(); },
    async stop() { stopped = true; if (timer) clearInterval(timer); timer = null; controllers.forEach(controller => controller.abort()); await Promise.allSettled([...active]); },
    async health() {
      const now = clock().toISOString();
      const due = await options.repository.snapshot(tx => operations(tx).dueRuns(now, 1));
      return {enabled: options.enabled, active: active.size, consecutiveFailures, lastFailureCode, stalled: Boolean(due[0] && Date.parse(now) - Date.parse(due[0].eligibleAt) > 60_000), providerUnhealthy: consecutiveFailures >= 3};
    }
  };
}
export type ProjectAssistantRuntime = ReturnType<typeof createProjectAssistantRuntime>;
