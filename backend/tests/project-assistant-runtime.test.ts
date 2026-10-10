import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AssistantGeneratedResult, AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { createGeminiAssistantProvider } from "../src/services/project-assistant-gemini.js";
import { AssistantFailure, assistantEligibleAt } from "../src/domain/project-chat-assistant.js";
import { createProjectAssistantRuntime, type AssistantRuntimeOptions } from "../src/services/project-assistant-runtime.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";
import type { ChatSendInput } from "../src/contracts/project-chat.js";
const result: AssistantGeneratedResult = {kind: "no_answer", facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []};
const readSources = (): AssistantReadSources => ({status: async () => ({facts: [], freshness: []}), execution: async () => ({facts: [], freshness: []}), searchCatalogue: async () => [], recommendations: async () => ({rules: [], freshness: []}), preview: async () => { throw new Error("unused"); }, revalidate: async () => true});
async function fixture(overrides: Partial<AssistantRuntimeOptions> = {}) {
  const f = createChatFixture(), published: string[] = [];
  const options: AssistantRuntimeOptions = {repository: f.chatRepository, enabled: true, now: f.clock, provider: {generate: vi.fn(async () => result)}, readSources, authorize: async () => true, validateSources: async () => true, publish: async (_tx, run) => { const messageId = randomUUID(); published.push(run.id); return {messageId, resultId: randomUUID()}; }, ...overrides};
  const runtime = createProjectAssistantRuntime(options);
  const enqueue = async (body = "Project status?", extra = {}, messageOverrides: Partial<ChatSendInput> = {}) => {
    const message = await f.service.send(f.actor("client-a"), "a", chatSend(body, messageOverrides));
    const input = {projectId: "a", messageId: message.id, messageVersion: message.version, clientId: "client-a", sessionVersion: 1, hasOwner: false, notified: null, routing: "not_required" as const, ...extra};
    const run = (await f.chatRepository.mutate(tx => runtime.enqueueAssistant(tx, input)))!;
    return {message, input, run};
  };
  const saved = (id: string) => f.chatRepository.snapshot(tx => tx.assistant.run(id));
  return {...f, runtime, enqueue, saved, options, published};
}
describe("assistant timing and durable lifecycle", () => {
  it.each([false, true])("uses Gemini only after two minutes and suppresses it after a human reply: %s", async humanReplied => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
      candidates: [{finishReason: "STOP", content: {role: "model", parts: [{text: JSON.stringify({kind: "no_answer", factIds: [], candidateIds: [], previewId: null, clarificationCodes: [], narrative: [{text: "Hello! How can I help?", factIds: []}]})}]}}],
      usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 8, thoughtsTokenCount: 2, totalTokenCount: 20}
    }));
    const provider = createGeminiAssistantProvider({apiKey: "synthetic-gemini-key", model: "gemini-3.8-flash", fetch: transport});
    const f = await fixture({provider}), {run, message} = await f.enqueue("Hello");
    f.advance(119_999);
    expect(await f.runtime.runOnce()).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    if (humanReplied) {
      const reply = await f.service.send(f.actor("manager-a"), "a", chatSend("Hello, how can I help?", {replyToId: message.id}));
      await f.chatRepository.mutate(tx => f.runtime.cancelAfterHumanReply(tx, reply));
    }
    f.advance(1);
    await f.runtime.runOnce();
    if (humanReplied) {
      expect(transport).not.toHaveBeenCalled();
      expect(f.published).toEqual([]);
      expect(await f.saved(run.id)).toMatchObject({status: "suppressed"});
    } else {
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
      expect(f.published).toEqual([run.id]);
      expect(await f.saved(run.id)).toMatchObject({status: "no_answer", providerAttempts: 1});
      expect(await f.chatRepository.snapshot(tx => tx.assistant.counter(`tokens:${f.clock().toISOString().slice(0,10)}`))).toMatchObject({value: 20});
    }
  });
  it("always grants automatic messages a full two minutes regardless of owners or staff hours", () => {
    for (const now of ["2026-10-09T13:00:00Z", "2026-10-09T14:29:30Z", "2026-10-09T14:30:00Z", "2026-10-09T23:00:00Z"]) {
      for (const hasOwner of [false, true]) {
        expect(Date.parse(assistantEligibleAt(new Date(now), hasOwner, false)) - Date.parse(now)).toBe(120_000);
        expect(assistantEligibleAt(new Date(now), hasOwner, true)).toBe(new Date(now).toISOString());
      }
    }
  });
  it("waits two minutes, publishes once, and survives a worker restart/replay", async () => {
    const f = await fixture(), {run, input} = await f.enqueue(undefined, {hasOwner: true});
    expect(await f.runtime.runOnce()).toBe(false); f.advance(119_999);
    expect(await f.runtime.runOnce()).toBe(false); f.advance(1);
    await f.runtime.runOnce(); expect((await f.saved(run.id))?.status).toBe("no_answer");
    const next = createProjectAssistantRuntime(f.options);
    expect((await f.chatRepository.mutate(tx => next.enqueueAssistant(tx, input)))?.id).toBe(run.id);
    expect(await next.runOnce()).toBe(false); expect(f.published).toEqual([run.id]);
  });
  it("expedites the existing generation on an explicit request and fences request replay", async () => {
    const f = await fixture(), {run, input} = await f.enqueue(undefined, {hasOwner: true});
    const requested = await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...input, explicit: true, idempotencyKey: "click"}));
    expect(requested?.id).toBe(run.id); expect(requested?.eligibleAt).toBe(f.clock().toISOString());
    await f.runtime.runOnce();
    expect((await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...input, explicit: true, idempotencyKey: "click"})))?.id).toBe(run.id);
  });
  it("repairs legacy early-ready and shortened waits from the source timestamp", async () => {
    for (const status of ["ready", "waiting_for_human"] as const) {
      const f = await fixture(), {run} = await f.enqueue();
      await f.chatRepository.mutate(tx => tx.assistant.saveRun({...run, status, eligibleAt: run.createdAt}));
      f.advance(119_999); expect(await f.runtime.runOnce()).toBe(false);
      expect((await f.saved(run.id))?.eligibleAt).toBe(new Date(Date.parse(run.createdAt) + 120_000).toISOString());
      f.advance(1); expect(await f.runtime.runOnce()).toBe(true);
      expect(f.published).toEqual([run.id]);
    }
  });
  it("normalizes legacy combined waits from the latest source without extending the join window", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    f.advance(20_000); const next = await f.enqueue("100 sq-ft in Hall");
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...next.run, eligibleAt: first.run.eligibleAt}));
    f.advance(119_999); expect(await f.runtime.runOnce()).toBe(false);
    expect((await f.saved(next.run.id))?.eligibleAt).toBe(new Date(Date.parse(next.message.createdAt) + 120_000).toISOString());
    expect((await f.saved(next.run.id))?.coalescingStartedAt).toBe(first.run.createdAt);
    f.advance(1); expect(await f.runtime.runOnce()).toBe(true);
  });
  it("shortens old five-minute waits but preserves retry backoff and explicit timing", async () => {
    const f = await fixture(), first = await f.enqueue();
    const legacyAt = new Date(f.clock().getTime() + 300_000).toISOString();
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...first.run, eligibleAt: legacyAt}));
    await f.runtime.runOnce(); expect((await f.saved(first.run.id))?.eligibleAt).toBe(first.run.eligibleAt);
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...first.run, workerAttempts: 1, generationStartedAt: first.run.createdAt, eligibleAt: legacyAt}));
    await f.runtime.runOnce(); expect((await f.saved(first.run.id))?.eligibleAt).toBe(legacyAt);
  });
  it("does not postpone the wait when a message is later tagged", async () => {
    const f = await fixture(), first = await f.enqueue(); f.advance(60_000);
    await f.chatRepository.mutate(tx => tx.saveMessage({...first.message, version: 2, priority: "important", issueStatus: "open"}));
    const tagged = await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...first.input, messageVersion: 2}));
    expect(tagged?.eligibleAt).toBe(first.run.eligibleAt);
    f.advance(60_000); expect(await f.runtime.runOnce()).toBe(true);
  });
  it("suppresses revoked waiting work without blocking other eligible jobs", async () => {
    const f = await fixture(), first = await f.enqueue();
    f.options.authorize = async (_tx, run) => run.id !== first.run.id;
    const second = await f.enqueue("Another valid question"); f.advance(120_000); await f.runtime.runOnce();
    expect(await f.saved(first.run.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_AUTHORITY_CHANGED"});
    expect(await f.saved(second.run.id)).toMatchObject({status: "no_answer"});
  });
  it("suppresses linked and unthreaded staff replies but preserves other threads", async () => {
    const f = await fixture(), first = await f.enqueue(), other = await f.enqueue("Another question");
    const reply = await f.service.send(f.actor("manager-a"), "a", chatSend("I'll check", {replyToId: first.message.id}));
    await f.chatRepository.mutate(tx => f.runtime.cancelAfterHumanReply(tx, reply));
    expect((await f.saved(first.run.id))?.status).toBe("suppressed"); expect((await f.saved(other.run.id))?.status).toBe("waiting_for_human");
    const unthreaded = await f.service.send(f.actor("manager-a"), "a", chatSend("Working on this"));
    await f.chatRepository.mutate(tx => f.runtime.cancelAfterHumanReply(tx, unthreaded));
    expect((await f.saved(other.run.id))?.status).toBe("suppressed");
  });
  it("rechecks human replies while the provider is running", async () => {
    let release!: () => void, entered!: () => void;
    const start = new Promise<void>(r => {entered = r;}), gate = new Promise<void>(r => {release = r;});
    const f = await fixture({provider: {async generate() {entered(); await gate; return result;}}});
    const {run} = await f.enqueue(); f.advance(120_000); const work = f.runtime.runOnce(); await start;
    await f.service.send(f.actor("manager-a"), "a", chatSend("Human answer")); release(); await work;
    expect(f.published).toEqual([]); expect((await f.saved(run.id))?.status).toBe("suppressed");
  });
  it.each(["authority", "version", "source"])("suppresses changed %s at publication", async mode => {
    const f = await fixture(), {run, message} = await f.enqueue();
    f.options.provider.generate = async () => {
      if (mode === "authority") f.options.authorize = async () => false;
      if (mode === "source") f.options.validateSources = async () => false;
      if (mode === "version") await f.chatRepository.mutate(tx => tx.saveMessage({...message, version: message.version + 1}));
      return result;
    };
    f.advance(120_000); await f.runtime.runOnce(); expect(f.published).toEqual([]); expect((await f.saved(run.id))?.status).toBe("suppressed");
  });
  it("coordinates one active generation per project across runtime instances", async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => {release = r;}), start = new Promise<void>(r => {entered = r;});
    const f = await fixture({provider: {async generate() {entered(); await gate; return result;}}});
    await f.enqueue(); await f.enqueue("Second"); f.advance(120_000); const work = f.runtime.runOnce(); await start;
    const second = createProjectAssistantRuntime(f.options); expect(await second.runOnce()).toBe(false);
    release(); await work; expect(f.published).toHaveLength(1);
  });
  it("recovers expired leases and never publishes under an expired token", async () => {
    const f = await fixture(), {run} = await f.enqueue();
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...run, status: "leased", workerAttempts: 1, leaseToken: "dead-worker", leaseUntil: f.clock().toISOString()}));
    await f.runtime.runOnce(); expect((await f.saved(run.id))?.workerAttempts).toBe(2); expect(f.published).toHaveLength(1);
  });
  it("preserves the total generation deadline across a retry/restart", async () => {
    const f = await fixture({provider: {async generate() {throw new AssistantFailure("ASSISTANT_NETWORK", true);}}}), {run} = await f.enqueue();
    f.advance(120_000); await f.runtime.runOnce(); f.advance(90_001);
    await createProjectAssistantRuntime(f.options).runOnce();
    expect(await f.saved(run.id)).toMatchObject({status: "failed", failureCode: "ASSISTANT_TIME_LIMIT", workerAttempts: 1});
  });
  it("retains ambiguous token reservations and durable provider attempts on retries", async () => {
    const f = await fixture({provider: {async generate(ctx) {await ctx.reserveAttempt(1000); throw new AssistantFailure("ASSISTANT_TIMEOUT", true);}}}), {run} = await f.enqueue();
    f.advance(120_000); await f.runtime.runOnce(); expect((await f.saved(run.id))?.status).toBe("ready"); f.advance(5000); await f.runtime.runOnce();
    expect(await f.saved(run.id)).toMatchObject({status: "failed", providerAttempts: 2, workerAttempts: 2});
    expect(await f.chatRepository.snapshot(tx => tx.assistant.counter(`tokens:${f.clock().toISOString().slice(0,10)}`))).toMatchObject({value: 6096});
  });
  it("limits admission without rejecting the original human message", async () => {
    const f = await fixture({clientPerHour: 1}); await f.enqueue(); const next = await f.enqueue("Second");
    expect(next.run).toMatchObject({status: "failed", failureCode: "ASSISTANT_ADMISSION_LIMIT"});
    expect(await f.chatRepository.snapshot(tx => tx.message("a", next.message.id))).not.toBeNull();
  });
  it("enforces deployment token admission before network work", async () => {
    const f = await fixture({tokensPerDay: 2000, provider: {async generate(ctx) {await ctx.reserveAttempt(1); throw new Error("must not get here");}}}), {run} = await f.enqueue();
    f.advance(120_000); await f.runtime.runOnce(); expect(await f.saved(run.id)).toMatchObject({status: "failed", failureCode: "ASSISTANT_TOKEN_LIMIT", providerAttempts: 0});
  });
  it("persists the four-request cap even when a provider loop asks for more", async () => {
    const f = await fixture({provider: {async generate(ctx) {for (let i = 0; i < 5; i++) await ctx.reserveAttempt(100); return result;}}}), {run} = await f.enqueue();
    f.advance(120_000); await f.runtime.runOnce();
    expect(await f.saved(run.id)).toMatchObject({status: "failed", failureCode: "ASSISTANT_RETRY_LIMIT", providerAttempts: 4});
  });
  it("does not renew an expired lease at heartbeat or publish under it", async () => {
    const f = await fixture({provider: {async generate() {f.advance(180001); return result;}}}), {run} = await f.enqueue();
    f.advance(120_000); await f.runtime.runOnce(); expect(f.published).toEqual([]);
    await f.runtime.runOnce(); expect(await f.saved(run.id)).toMatchObject({status: "failed", failureCode: "ASSISTANT_TIME_LIMIT"});
  });
  it("returns the committed result only from its project-scoped read", async () => {
    const f = await fixture(), {run} = await f.enqueue(); f.advance(120_000); await f.runtime.runOnce(); const saved = (await f.saved(run.id))!;
    expect(await f.chatRepository.snapshot(tx => tx.assistant.result("a", saved.resultId!))).toMatchObject({runId: run.id});
    expect(await f.chatRepository.snapshot(tx => tx.assistant.result("b", saved.resultId!))).toBeNull();
  });
  it("settles known token usage idempotently", async () => {
    const f = await fixture({provider: {async generate(ctx) {const id = await ctx.reserveAttempt(1000); await ctx.settleAttempt(id, {inputTokens: 90, outputTokens: 10}); await ctx.settleAttempt(id, {inputTokens: 90, outputTokens: 10}); return result;}}});
    await f.enqueue(); f.advance(120_000); await f.runtime.runOnce();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.counter(`tokens:${f.clock().toISOString().slice(0,10)}`))).toMatchObject({value: 100});
  });
  it("does not send staff text or assistant history to the provider", async () => {
    const f = await fixture(); await f.service.send(f.actor("manager-a"), "a", chatSend("Private margin 27%"));
    await f.enqueue(); f.advance(120_000); await f.runtime.runOnce();
    const context = vi.mocked(f.options.provider.generate).mock.calls[0][0];
    expect(JSON.stringify(context.messages)).not.toContain("Private margin");
  });
  it("disables generation without affecting human chat", async () => {
    const f = await fixture({enabled: false}), {run} = await f.enqueue();
    expect(run).toBeNull(); expect(await f.runtime.runOnce()).toBe(false);
  });
  it("coalesces a rapid quantity fragment with a full wait from the latest included message", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", {hasOwner: true});
    f.advance(20_000);
    const next = await f.enqueue("100 sq-ft in Hall", {hasOwner: true});
    expect(next.run.eligibleAt).toBe(new Date(Date.parse(next.message.createdAt) + 120_000).toISOString());
    expect(next.run.coalescedSources).toEqual([{runId: first.run.id, messageId: first.message.id, messageVersion: 1, messageSequence: first.message.sequence}]);
    expect(await f.saved(first.run.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_COALESCED"});
    expect(await f.runtime.runOnce()).toBe(false); f.advance(119_999); expect(await f.runtime.runOnce()).toBe(false); f.advance(1); await f.runtime.runOnce();
    const messages = vi.mocked(f.options.provider.generate).mock.calls[0][0].messages;
    expect(messages).toEqual([{id: first.message.id, body: "Can I add a false ceiling?"}, {id: next.message.id, body: "100 sq-ft in Hall"}]);
    expect(f.published).toEqual([next.run.id]);
  });
  it.each(["Thanks!", "Hi", "Hello", "Great", "Fine", "Cool", "Yes", "No", "Okay", "Got it"])("keeps a linked %s separate so the unanswered question is still answered", async body => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    f.advance(10_000);
    const acknowledgment = await f.enqueue(body, {}, {replyToId: first.message.id});
    expect(acknowledgment.run.coalescedSources).toBeUndefined();
    expect(await f.saved(first.run.id)).toMatchObject({status: "waiting_for_human", eligibleAt: first.run.eligibleAt});
    f.advance(110_000); expect(await f.runtime.runOnce()).toBe(true);
    expect(f.published).toEqual([first.run.id]);
    expect(vi.mocked(f.options.provider.generate).mock.calls[0]![0].messages).toEqual([{id: first.message.id, body: "Can I add a false ceiling?"}]);
    expect(await f.runtime.runOnce()).toBe(false);
    f.advance(10_000); expect(await f.runtime.runOnce()).toBe(true);
    expect(f.published).toEqual([first.run.id, acknowledgment.run.id]);
    expect(vi.mocked(f.options.provider.generate).mock.calls[1]![0].messages.at(-1)).toEqual({id: acknowledgment.message.id, body});
  });
  it("coalesces explicit root replies across an unrelated question while keeping that question separate", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", {hasOwner: true});
    const unrelated = await f.enqueue("When will the painting finish?", {hasOwner: true});
    const next = await f.enqueue("The living room please", {hasOwner: true}, {replyToId: first.message.id});
    expect(next.run.coalescedSources?.map(row => row.messageId)).toEqual([first.message.id]);
    expect(await f.saved(unrelated.run.id)).toMatchObject({status: "waiting_for_human"});
  });
  it.each(["100 sq-ft, also what is the delivery status?", "When will the painting finish?", "Another estimate please"])("does not coalesce a new topic: %s", async body => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", {hasOwner: true});
    const next = await f.enqueue(body, {hasOwner: true});
    expect(next.run.coalescedSources).toBeUndefined(); expect((await f.saved(first.run.id))?.status).toBe("waiting_for_human");
  });
  it("keeps tagged followups distinct and does not extend the coalescing window repeatedly", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", {hasOwner: true});
    const tagged = await f.enqueue("100 sq-ft in Hall", {hasOwner: true}, {priority: "critical"});
    expect(tagged.run.coalescedSources).toBeUndefined();
    f.advance(31_000);
    const late = await f.enqueue("200 sq-ft in Hall", {hasOwner: true}, {replyToId: first.message.id});
    expect(late.run.coalescedSources).toBeUndefined();
  });
  it("does not renew the original thirty-second join window after a successful fragment join", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    f.advance(20_000); const second = await f.enqueue("100 sq-ft in Hall");
    expect(second.run.coalescingStartedAt).toBe(first.run.createdAt);
    f.advance(15_000); const third = await f.enqueue("200 sq-ft in Hall", {}, {replyToId: second.message.id});
    expect(third.run.coalescedSources).toBeUndefined();
    expect((await f.saved(second.run.id))?.status).toBe("waiting_for_human");
  });
  it("does not reopen a source's combination window when its priority changes", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    f.advance(40_000);
    await f.chatRepository.mutate(tx => tx.saveMessage({...first.message, version: 2, priority: "important", issueStatus: "open"}));
    const tagged = await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...first.input, messageVersion: 2}));
    expect(tagged?.coalescingStartedAt).toBe(first.message.createdAt);
    const next = await f.enqueue("100 sq-ft in Hall", {}, {replyToId: first.message.id});
    expect(next.run.coalescedSources).toBeUndefined();
    expect((await f.saved(tagged!.id))?.eligibleAt).toBe(first.run.eligibleAt);
  });
  it.each(["resolved", "version"])("invalidates all coalesced work when the original source is %s", async cause => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    const next = await f.enqueue("100 sq-ft in Hall");
    await f.chatRepository.mutate(tx => tx.saveMessage({...first.message, version: 2, issueStatus: cause === "resolved" ? "resolved" : null}));
    await f.runtime.runOnce();
    expect(await f.saved(next.run.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SOURCE_CHANGED"});
    expect(f.published).toEqual([]);
  });
  it("suppresses a coalesced question on a human reply to the original root", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    const next = await f.enqueue("100 sq-ft in Hall");
    const reply = await f.service.send(f.actor("sales-a"), "a", chatSend("I will review", {replyToId: first.message.id}));
    await f.chatRepository.mutate(tx => f.runtime.cancelAfterHumanReply(tx, reply));
    expect(await f.saved(next.run.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_HUMAN_REPLIED"});
  });
  it("keeps a rapid fragment separate from explicit leased work without resetting its budget", async () => {
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => {started = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    const f = await fixture({provider: {generate: vi.fn(async context => {
      await context.reserveAttempt(100); if (context.messages.length === 1) {started(); await gate;} return result;
    })}});
    const first = await f.enqueue("Can I add a false ceiling?", {explicit: true, idempotencyKey: "manual-first"});
    const work = f.runtime.runOnce(); await entered;
    const next = await f.enqueue("100 sq-ft in Hall");
    expect(next.run).toMatchObject({workerAttempts: 0, providerAttempts: 0, generationStartedAt: null, status: "waiting_for_human"});
    expect(next.run.coalescedSources).toBeUndefined();
    release(); await work; expect(f.published).toEqual([first.run.id]);
    expect(await f.saved(first.run.id)).toMatchObject({workerAttempts: 1, providerAttempts: 1});
    f.advance(120_000); await f.runtime.runOnce(); expect(f.published).toEqual([first.run.id, next.run.id]);
  });
  it("does not merge a fragment into a never-claimed explicit request or a backed-off retry", async () => {
    for (const mode of ["explicit", "retry"]) {
      const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", mode === "explicit" ? {explicit: true, idempotencyKey: "manual-first"} : {});
      if (mode === "retry") await f.chatRepository.mutate(tx => tx.assistant.saveRun({...first.run, status: "ready", workerAttempts: 1, providerAttempts: 1, generationStartedAt: first.run.createdAt}));
      const next = await f.enqueue("100 sq-ft in Hall");
      expect(next.run.coalescedSources).toBeUndefined();
      expect((await f.saved(first.run.id))?.status).not.toBe("suppressed");
    }
  });
  it("preserves root dependencies when the Client explicitly retries a completed coalesced answer", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    const next = await f.enqueue("100 sq-ft in Hall"); f.advance(120_000); await f.runtime.runOnce();
    const retry = (await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...next.input, explicit: true, idempotencyKey: "try-combined-again"})))!;
    expect(retry.coalescedSources?.map(source => source.messageId)).toEqual([first.message.id]);
    await f.chatRepository.mutate(tx => tx.saveMessage({...first.message, version: 2, issueStatus: "resolved"}));
    await f.runtime.runOnce(); expect(await f.saved(retry.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SOURCE_CHANGED"});
    expect(f.published).toEqual([next.run.id]);
  });
  it("bounds retained coalesced context to sixteen complete messages", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?");
    let latest = first;
    for (let index = 0; index < 15; index++) latest = await f.enqueue(`${index + 1} sq-ft in Hall`);
    expect(latest.run.coalescedSources).toHaveLength(15);
    f.advance(120_000); await f.runtime.runOnce();
    const context = vi.mocked(f.options.provider.generate).mock.calls[0][0].messages;
    expect(context).toHaveLength(16); expect(context[0].id).toBe(first.message.id); expect(context[15].id).toBe(latest.message.id);
  });
  it("creates a fresh scoped generation when a reauthenticated Client asks again", async () => {
    const f = await fixture(), first = await f.enqueue("Can I add a false ceiling?", {hasOwner: true});
    const next = await f.enqueue("100 sq-ft in Hall", {hasOwner: true});
    const requested = await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, {...next.input, sessionVersion: 2, explicit: true, idempotencyKey: "new-session-request"}));
    expect(requested).toMatchObject({sessionVersion: 2, generation: 2});
    expect(requested?.coalescedSources?.map(source => source.messageId)).toEqual([first.message.id]);
    expect(await f.saved(next.run.id)).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SUPERSEDED"});
  });
});
