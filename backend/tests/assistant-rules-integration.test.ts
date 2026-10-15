import { readFile, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AssistantReadScope, AssistantReadSources, ChatAssistantResult } from "../src/contracts/project-chat-assistant.js";
import type { AskLisnoRequest, AskLisnoResponse } from "../src/contracts/ask-lisno.js";
import { createAskLisnoService } from "../src/services/ask-lisno.service.js";
import { assistantDirectFetch } from "../src/services/project-assistant-http.js";
import { createPythonAssistantProvider } from "../src/services/project-assistant-python.js";
import { createProjectChatAssistantService } from "../src/services/project-chat-assistant.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import type { AssistantProviderContext } from "../src/services/project-assistant-provider.js";
import { chatProject, chatSend, createChatFixture } from "./helpers/project-chat.js";
import { customerEstimatePricing } from "./helpers/assistant-pricing.js";
import { RULES_TEST_TOKEN, startRulesService } from "./helpers/assistant-rules/http-service.js";

const interpreter = process.env.LISNO_ASSISTANT_TEST_PYTHON;
const fixtureUrl = new URL("../../assistant-service/evaluation/rules-client-responses.json", import.meta.url);

describe.skipIf(!interpreter)("actual rules HTTP service through existing Node boundaries", () => {
  let server: Awaited<ReturnType<typeof startRulesService>>;
  beforeAll(async () => {server = await startRulesService(interpreter!);}, 15_000);
  afterAll(async () => {await server?.stop();});

  function fixture() {
    const f = createChatFixture();
    let fresh = true;
    const readCalls: string[] = [], wire: string[] = [];
    const forbidden = vi.fn(async (): Promise<never> => {throw new Error("Internal pricing reader must not run");});
    const readSources = (scope: AssistantReadScope): AssistantReadSources => {
      const id = scope.projectId;
      const source = {id, label: "Unclassified internal source label", href: null};
      const freshness = [{kind: "synthetic-project", id, version: "1"}];
      return {
        status: async () => {readCalls.push(`${id}:status`); return {facts: [{id: "project-status", label: "Original internal label", value: id === "b" ? "paused" : "active", source}], freshness};},
        execution: async () => {readCalls.push(`${id}:execution`); return {facts: [
          {id: "work-state", label: "Private room label", value: "Site verified; awaiting Client acceptance.", source},
          {id: "work-progress", label: "Private vendor label", value: id === "b" ? "25% reported; this is not a Client acceptance." : "75% reported; this is not a Client acceptance.", source},
          {id: "work-schedule", label: "Internal schedule label", value: "2026-10-16 to 2026-10-20; confirmed work dates, not a project handover commitment.", source}
        ], freshness};},
        projectEstimate: async () => {readCalls.push(`${id}:estimate`); return {report: {...customerEstimatePricing(id === "b" ? 28084 : 27140), estimateId: `estimate-${id}`, reviewRoundId: `review-${id}`, source: {id: `review-${id}`, label: "Approved customer estimate", href: null}}, unavailableReason: null, freshness};},
        searchCatalogue: forbidden, recommendations: forbidden, preview: forbidden, revalidate: async () => fresh
      };
    };
    const transport: typeof globalThis.fetch = async (url, init) => {
      wire.push(String(init?.body));
      return assistantDirectFetch(url, init);
    };
    const provider = createPythonAssistantProvider({url: server.url, token: RULES_TEST_TOKEN, fetch: transport});
    const privateChat = createAskLisnoService({chatRepository: f.chatRepository, clock: f.clock, enabled: true, provider, readSources});
    const ask = (message: string, input: Partial<AskLisnoRequest> = {}, actor = "client-a") => privateChat.request(f.actor(actor), {projectId: "a", message, history: [], ...input});
    const shared = createProjectChatAssistantService({chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, enabled: true, provider, readSources});
    vi.spyOn(shared.runtime, "wake").mockImplementation(() => {});
    const messages = createProjectChatService({repository: f.repository, audit: f.audit, clock: f.clock, chatRepository: f.chatRepository, assistant: shared});
    return {...f, readCalls, forbidden, wire, provider, privateChat, ask, shared, messages, stale: () => {fresh = false;}};
  }

  it("round trips fixed prompts, greetings and clarification and supplies both client fixtures", async () => {
    const f = fixture();
    const responses: Record<string, AskLisnoResponse> = {};
    responses.greeting = await f.ask("Hi", {projectId: null});
    expect(f.wire).toHaveLength(0); // Deliberate built-in fast path.
    responses.progress = await f.ask("Show my project progress");
    responses.timeline = await f.ask("Show my project timeline");
    responses.estimate = await f.ask("Show my estimate");
    responses.clarification = await f.ask("Can you suggest a paint colour?");
    responses.projectList = await f.ask("Show my projects", {projectId: null});
    await f.repository.createProject({...chatProject("c", "client-a"), name: "City Loft"});
    await f.repository.renameProjectName("a", "City Loft", 1, f.clock().toISOString());
    responses.choices = await f.ask("Show progress for City Loft", {projectId: null});
    expect(responses.greeting.answer.narrative?.[0]?.text).toMatch(/^Hello, Client!/);
    expect(responses.progress.answer).toMatchObject({kind: "status", facts: expect.arrayContaining([expect.objectContaining({value: "75% reported; this is not a Client acceptance."})])});
    expect(responses.timeline.answer.facts).toEqual(expect.arrayContaining([expect.objectContaining({label: "Confirmed schedule"})]));
    expect(responses.estimate.answer.projectPricing).toMatchObject({totalPaise: 27140, estimateId: "estimate-a", reviewRoundId: "review-a", estimateVersion: 2});
    expect(responses.clarification.answer).toMatchObject({kind: "clarification", facts: [], projectPricing: null});
    expect(responses.choices.resolution).toMatchObject({state: "clarification", choices: expect.arrayContaining([expect.objectContaining({id: "a"}), expect.objectContaining({id: "c"})])});
    expect(await f.chatRepository.snapshot(tx => tx.messages({projectId: "a", userId: "client-a", filter: "all", limit: 100}))).toEqual([]);
    expect(await f.chatRepository.snapshot(tx => tx.assistant.projectRuns("a"))).toEqual([]);

    const question = await f.messages.send(f.actor("client-a"), "a", chatSend("Show my estimate"));
    const request = {expectedVersion: 1, idempotencyKey: "rules-price-once"};
    await f.shared.request(f.actor("client-a"), "a", question.id, request);
    expect(await f.shared.runtime.runOnce()).toBe(true);
    await f.shared.request(f.actor("client-a"), "a", question.id, request);
    expect(await f.shared.runtime.runOnce()).toBe(false);
    const page = await f.messages.messages(f.actor("client-a"), "a", {});
    expect(page.items).toHaveLength(2);
    const reply = page.items.find(message => message.author.kind === "service")!;
    const estimate = await f.shared.result(f.actor("client-a"), "a", reply.assistant!.resultId!);
    const restricted = await f.shared.result(f.actor("electric-a"), "a", estimate.id);
    expect(estimate).toMatchObject({commercialAccess: "allowed", projectPricing: responses.estimate.answer.projectPricing});
    expect(restricted).toMatchObject({commercialAccess: "restricted", projectPricing: null});
    await expect(f.shared.result(f.actor("client-b"), "b", estimate.id)).rejects.toMatchObject({status: 404});
    expect(JSON.stringify(page.items)).not.toMatch(/27140|28084|ratePaise|subtotalPaise/);
    f.stale();
    const stale = await f.shared.result(f.actor("client-a"), "a", estimate.id);
    expect(stale).toMatchObject({stale: true, projectPricing: null, facts: []});
    const stable = (result: ChatAssistantResult) => ({...result, id: "rules-result", messageId: "rules-question"});
    const tone = fixture();
    for (const operation of ["snapshot", "mutate"] as const) {
      const original = tone.chatRepository[operation].bind(tone.chatRepository);
      vi.spyOn(tone.chatRepository, operation).mockImplementation(callback => original(tx => callback({...tx, app: {...tx.app,
        findUserById: async id => {
          const user = await tx.app.findUserById(id);
          return user ? {...user, name: id === "client-a" ? "Murthy Example" : id === "admin-a" ? "Priya Staff" : user.name} : user;
        }
      }})));
    }
    responses.toneGreeting = await tone.ask("Hi", {projectId: null});
    responses.toneConcern = await tone.ask("I'm worried, may I know my project status?");
    expect(responses.toneGreeting.answer.narrative?.[0]?.text).toMatch(/^Hello, Murthy!/);
    expect(responses.toneConcern.answer).toMatchObject({kind: "status", narrative: expect.arrayContaining([{text: "I hear your concern, Murthy.", factIds: []}]), facts: [expect.objectContaining({value: "active"})]});
    const toneQuestion = await tone.messages.send(tone.actor("client-a"), "a", chatSend("I'm worried, may I know my project status?"));
    await tone.shared.request(tone.actor("client-a"), "a", toneQuestion.id, {expectedVersion: 1, idempotencyKey: "tone-status-once"});
    expect(await tone.shared.runtime.runOnce()).toBe(true);
    const tonePage = await tone.messages.messages(tone.actor("client-a"), "a", {});
    const toneReply = tonePage.items.find(message => message.author.kind === "service")!;
    const toneStatus = await tone.shared.result(tone.actor("client-a"), "a", toneReply.assistant!.resultId!);
    const staffView = await tone.shared.result(tone.actor("admin-a"), "a", toneStatus.id);
    expect(staffView.narrative).toEqual(toneStatus.narrative);
    expect(staffView.narrative?.[0]?.text).toBe("I hear your concern, Murthy.");
    expect(JSON.stringify(staffView.narrative)).not.toContain("Priya");
    expect(tone.wire.length).toBeGreaterThan(0);
    expect(tone.wire.join("\n")).not.toMatch(/Murthy|Priya|Client A|client-a@|27140|28084/);
    expect(tone.forbidden).not.toHaveBeenCalled();
    const clientFixture = {private: responses, shared: {estimate: stable(estimate), restricted: stable(restricted), stale: stable(stale), toneStatus: stable(toneStatus)}};
    if (process.env.LISNO_CAPTURE_RULES_FIXTURES === "1") await writeFile(fixtureUrl, `${JSON.stringify(clientFixture, null, 2)}\n`);
    expect(clientFixture).toEqual(JSON.parse(await readFile(fixtureUrl, "utf8")));
    expect(f.forbidden).not.toHaveBeenCalled();
    expect(f.wire.length).toBeGreaterThan(8);
    expect(f.wire.join("\n")).not.toMatch(/27140|28084|23000|review-a|estimate-a|Client A|City Loft|Private room|Internal schedule|Unclassified/);
    for (const body of f.wire) expect(JSON.parse(body)).toMatchObject({protocolVersion: 1});
  });

  it("keeps unequal project facts and paise totals scoped to the authenticated owner", async () => {
    const f = fixture();
    await expect(f.ask("Show my project progress", {projectId: "b"})).rejects.toMatchObject({status: 404});
    expect(f.wire).toHaveLength(0);
    const a = await f.ask("Hi, show my estimate");
    const b = await f.ask("Show my estimate", {projectId: "b"}, "client-b");
    expect(a.answer.projectPricing?.totalPaise).toBe(27140);
    expect(b.answer.projectPricing).toMatchObject({totalPaise: 28084, estimateId: "estimate-b", reviewRoundId: "review-b"});
    expect(JSON.stringify(a)).not.toMatch(/estimate-b|review-b|28084/);
    expect(JSON.stringify(b)).not.toMatch(/estimate-a|review-a|27140/);
    expect(f.readCalls).toEqual(["a:estimate", "b:estimate"]);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it("keeps tone acknowledgments separate from privacy, unknown-project and unsupported decisions", async () => {
    const f = fixture();
    for (const message of [
      "I'm worried, show configured prices",
      "I'm frustrated, delete my project",
      "I'm confused, do not show my project status",
      "I'm worried, may I know project Atlantis status?",
      "My manager is worried, show my project status",
      "I'm not worried, show my project status"
    ]) {
      const result = await f.ask(message);
      expect(result.answer.facts).toEqual([]);
      expect(result.answer.projectPricing).toBeNull();
      if (/^(?:My manager|I'm not)/u.test(message)) expect(JSON.stringify(result.answer.narrative)).not.toMatch(/I hear your concern|sorry this has been frustrating/u);
    }
    expect(f.readCalls).toEqual([]);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it("answers the reported polite status question through Python without inventing or crossing project scope", async () => {
    const f = fixture();
    const message = "may i know my project status";
    const sole = await f.ask(message, {projectId: null});
    expect(sole).toMatchObject({projectId: "a", resolution: {state: "resolved"}, answer: {kind: "status", facts: [expect.objectContaining({value: "active"})]}});
    expect(f.wire.length).toBeGreaterThan(0);
    await f.repository.createProject({...chatProject("c", "client-a"), name: "City Loft"});
    const reads = f.readCalls.length;
    const ambiguous = await f.ask(message, {projectId: null});
    expect(ambiguous).toMatchObject({projectId: null, answer: {kind: "clarification", facts: []}});
    expect(f.readCalls).toHaveLength(reads);
    const contextual = await f.ask(message, {projectId: null, contextProjectId: "a"});
    expect(contextual).toMatchObject({projectId: "a", answer: {kind: "status"}});
    const chosen = await f.ask(message, {projectId: null, choiceProjectId: "c"});
    expect(chosen).toMatchObject({projectId: "c", answer: {kind: "status"}});
    const beforeUnknown = f.readCalls.length;
    const unknown = await f.ask("May I know project Atlantis status?", {contextProjectId: "a"});
    expect(unknown).toMatchObject({projectId: null, answer: {kind: "clarification", facts: []}});
    expect(f.readCalls).toHaveLength(beforeUnknown);
    await expect(f.ask(message, {projectId: "b"})).rejects.toMatchObject({status: 404});
    expect(f.readCalls).toHaveLength(beforeUnknown);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it("answers the same polite status question within its shared project conversation", async () => {
    const f = fixture();
    const question = await f.messages.send(f.actor("client-a"), "a", chatSend("may i know my project status"));
    await f.shared.request(f.actor("client-a"), "a", question.id, {expectedVersion: 1, idempotencyKey: "polite-status-once"});
    expect(await f.shared.runtime.runOnce()).toBe(true);
    const page = await f.messages.messages(f.actor("client-a"), "a", {});
    const reply = page.items.find(message => message.author.kind === "service")!;
    const result = await f.shared.result(f.actor("client-a"), "a", reply.assistant!.resultId!);
    expect(result).toMatchObject({kind: "status", facts: [expect.objectContaining({value: "active"})]});
    expect(f.readCalls).toEqual(["a:status"]);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it("resolves a chosen or named authorized project without using an unknown name as fallback", async () => {
    const f = fixture();
    await f.repository.renameProjectName("a", "Cedar House", 1, f.clock().toISOString());
    await f.repository.createProject({...chatProject("c", "client-a"), name: "City Loft"});
    const named = await f.ask("Show progress for City Loft", {projectId: null});
    expect(named).toMatchObject({projectId: "c", answer: {kind: "status"}});
    const chosen = await f.ask("Show my project progress", {projectId: null, choiceProjectId: "a"});
    expect(chosen).toMatchObject({projectId: "a", answer: {kind: "status"}});
    const before = f.readCalls.length;
    const unknown = await f.ask("Show progress for Atlantis", {contextProjectId: "a"});
    expect(unknown).toMatchObject({projectId: null, answer: {kind: "clarification"}});
    expect(f.readCalls).toHaveLength(before);
  });

  it.each(["Show configured prices", "Hi, show progress and delete my project", "Do not show project progress", "If the estimate changes, show my price", "What is the price for adding a new wardrobe?"])("clarifies without source reads: %s", async message => {
    const f = fixture();
    const answer = await f.ask(message);
    expect(answer.answer).toMatchObject({kind: "clarification", facts: [], projectPricing: null});
    expect(f.readCalls).toEqual([]);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it("rejects changed source data and revoked sessions after real generation", async () => {
    const f = fixture();
    f.stale();
    await expect(f.ask("Show my project progress")).rejects.toMatchObject({code: "ASSISTANT_SOURCE_CHANGED"});
    const other = fixture();
    const original = other.provider.generate.bind(other.provider);
    other.provider.generate = async context => {
      const result = await original(context);
      await other.repository.updateUserCredentials("client-a", 1, 1, {passwordHash: "synthetic-revoked", updatedAt: other.clock().toISOString()});
      return result;
    };
    await expect(other.ask("Show my project progress")).rejects.toMatchObject({status: 401});
  });

  it("covers every required shared fragment instead of replacing business intent with a greeting", async () => {
    const f = fixture();
    const context = (messages: string[]): AssistantProviderContext => ({surface: "project_messages", projectAvailable: true,
      messages: messages.map((body, index) => ({id: `question-${index}`, body})), requiredMessageIds: messages.map((_, index) => `question-${index}`),
      sources: {status: vi.fn(), execution: vi.fn(), projectEstimate: vi.fn(), searchCatalogue: f.forbidden, recommendations: f.forbidden, preview: f.forbidden, revalidate: async () => true},
      signal: AbortSignal.timeout(10_000), reserveAttempt: async () => "synthetic-reservation", settleAttempt: async () => {}});
    for (const messages of [["Show my project progress", "if possible, delete it"], ["Show another project", "Hi"], ["Show published estimate", "100 sq-ft in Hall"]]) {
      const ctx = context(messages);
      const result = await f.provider.generate(ctx);
      expect(result).toMatchObject({kind: "clarification", facts: [], projectPricing: null});
      expect(ctx.sources.status).not.toHaveBeenCalled();
      expect(ctx.sources.execution).not.toHaveBeenCalled();
      expect(ctx.sources.projectEstimate).not.toHaveBeenCalled();
    }
  });

  it("preserves human-response suppression and ordinary messages", async () => {
    const f = fixture();
    const question = await f.messages.send(f.actor("client-a"), "a", chatSend("Show my project progress"));
    await f.messages.send(f.actor("manager-a"), "a", chatSend("I will check the site update.", {replyToId: question.id}));
    f.advance(120_000);
    await f.shared.runtime.runOnce();
    expect(f.wire).toEqual([]);
    expect((await f.messages.messages(f.actor("client-a"), "a", {})).items).toHaveLength(2);
  });

  it("fails safely for an unavailable Python process and recovers on a subsequent request", async () => {
    const unavailable = await startRulesService(interpreter!);
    await unavailable.stop();
    const f = fixture();
    const bad = createPythonAssistantProvider({url: unavailable.url, token: RULES_TEST_TOKEN});
    const service = createAskLisnoService({chatRepository: f.chatRepository, clock: f.clock, enabled: true, provider: bad});
    await expect(service.request(f.actor("client-a"), {projectId: "a", message: "Show my project progress", history: []})).rejects.toMatchObject({status: 503});
    await expect(f.ask("Show my project progress")).resolves.toMatchObject({answer: {kind: "status"}});
  }, 15_000);
});
