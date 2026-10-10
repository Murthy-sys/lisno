import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { chatSend } from "./helpers/project-chat.js";
import { projectAssistantModels, ProjectChatAssistantRunModel, ProjectChatAssistantReceiptModel, ProjectChatAssistantResultModel } from "../src/models/ProjectChatAssistant.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { createProjectAssistantRuntime, type AssistantRuntimeOptions } from "../src/services/project-assistant-runtime.js";
import type { AssistantGeneratedResult, AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { createAskLisnoService } from "../src/services/ask-lisno.service.js";
const generated: AssistantGeneratedResult = {kind: "no_answer", facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []};
const sources: AssistantReadSources = {status: async () => ({facts: [], freshness: []}), execution: async () => ({facts: [], freshness: []}), searchCatalogue: async () => [], recommendations: async () => ({rules: [], freshness: []}), preview: async () => {throw new Error("unused");}, revalidate: async () => true};
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {replica = await startMongoReplicaSet("project-assistant-runtime"); for (const model of [...chatModels, ...projectAssistantModels]) await model.syncIndexes();}, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());
async function fixture() {
  const f = await insertChatMongoFixture();
  let time = f.clock().getTime(); const clock = () => new Date(time);
  const options: AssistantRuntimeOptions = {repository: f.chatRepository, enabled: true, now: clock, provider: {generate: vi.fn(async () => generated)}, readSources: () => sources, authorize: async () => true, validateSources: async () => true, publish: async () => ({messageId: randomUUID(), resultId: randomUUID()})};
  const runtime = createProjectAssistantRuntime(options);
  const message = await f.service.send(f.actor("client-a"), "a", chatSend("Current project timeline?"));
  const input = {projectId: "a", clientId: "client-a", sessionVersion: 1, messageId: message.id, messageVersion: message.version, hasOwner: false, routing: "not_required" as const, notified: null};
  return {...f, options, runtime, input, message, clock, advance: (ms: number) => {time += ms;}};
}
describe("assistant Mongo transaction and restart invariants", () => {
  it("settles private profile-only reservations once while keeping nonusage receipts project-scoped", async () => {
    const f = await fixture();
    const provider = {async generate(context: import("../src/services/project-assistant-openai.js").AssistantProviderContext) {
      const id = await context.reserveAttempt(1000);
      await context.settleAttempt(id, {inputTokens: 70, outputTokens: 10});
      await context.settleAttempt(id, {inputTokens: 70, outputTokens: 10});
      return generated;
    }};
    const privateChat = createAskLisnoService({chatRepository: f.chatRepository, enabled: true, clock: f.clock, provider});
    await privateChat.request(f.actor("client-a"), {projectId: null, message: "Help with my account", history: []});
    expect(await ProjectChatAssistantReceiptModel.findOne({kind: "usage"}).lean()).toMatchObject({projectId: null, amount: 80, settled: true});
    expect(await f.chatRepository.snapshot(tx => tx.assistant.counter(`tokens:${f.clock().toISOString().slice(0,10)}`))).toMatchObject({value: 80});
    const invalid = new ProjectChatAssistantReceiptModel({_id: "invalid-generation", kind: "generation", projectId: null, runId: "run", createdAt: f.clock().toISOString(), fingerprint: "test", amount: 0, settled: true});
    expect(invalid.validateSync()?.errors.projectId).toBeDefined();
  });
  it("stores profile-only usage without a fake project and shares the token budget with project jobs", async () => {
    const f = await fixture();
    const provider = {async generate(context: import("../src/services/project-assistant-openai.js").AssistantProviderContext) {await context.reserveAttempt(1000); return generated;}};
    const privateChat = createAskLisnoService({chatRepository: f.chatRepository, enabled: true, clock: f.clock, provider, tokensPerDay: 3500});
    await privateChat.request(f.actor("client-a"), {projectId: null, message: "Help with my account", history: []});
    expect(await ProjectChatAssistantReceiptModel.findOne({kind: "usage"}).lean()).toMatchObject({projectId: null, amount: 3048});
    expect(await ProjectChatAssistantRunModel.countDocuments()).toBe(0);
    const runtime = createProjectAssistantRuntime({...f.options, tokensPerDay: 3500, provider});
    const run = (await f.chatRepository.mutate(tx => runtime.enqueueAssistant(tx, f.input)))!;
    f.advance(120_000); await runtime.runOnce();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.run(run.id))).toMatchObject({failureCode: "ASSISTANT_TOKEN_LIMIT"});
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "usage"})).toBe(1);
  });
  it("deduplicates concurrent enqueues across adapters and publishes one durable result", async () => {
    const f = await fixture();
    const otherRepository = createMongoProjectChatRepository();
    const other = createProjectAssistantRuntime({...f.options, repository: otherRepository});
    const runs = await Promise.all(Array.from({length: 4}, (_, i) => (i % 2 ? otherRepository : f.chatRepository).mutate(tx => (i % 2 ? other : f.runtime).enqueueAssistant(tx, f.input))));
    expect(new Set(runs.map(run => run!.id)).size).toBe(1);
    expect(await ProjectChatAssistantRunModel.countDocuments()).toBe(1);
    f.advance(119_999); expect(await f.runtime.runOnce()).toBe(false); f.advance(1);
    await Promise.all([f.runtime.runOnce(), other.runOnce()]);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(1);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication"})).toBe(1);
    expect((await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", f.message.id)))?.status).toBe("no_answer");
    expect(await createProjectAssistantRuntime({...f.options, repository: otherRepository}).runOnce()).toBe(false);
  }, 30000);
  it("repairs legacy immediate-ready runs before concurrent workers may claim them", async () => {
    const f = await fixture(), run = (await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, f.input)))!;
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...run, status: "ready", eligibleAt: run.createdAt}));
    const second = createProjectAssistantRuntime({...f.options, repository: createMongoProjectChatRepository()});
    f.advance(119_999);
    expect(await Promise.all([f.runtime.runOnce(), second.runOnce()])).toEqual([false, false]);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    expect(await f.chatRepository.snapshot(tx => tx.assistant.run(run.id))).toMatchObject({status: "waiting_for_human", workerAttempts: 0, eligibleAt: new Date(Date.parse(f.message.createdAt) + 120_000).toISOString()});
    f.advance(1); await Promise.all([f.runtime.runOnce(), second.runOnce()]);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(1);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication"})).toBe(1);
  });
  it("rolls back enqueued jobs, admission and replay receipts with their triggering transaction", async () => {
    const f = await fixture();
    await expect(f.chatRepository.mutate(async tx => {await f.runtime.enqueueAssistant(tx, f.input); throw new Error("rollback");})).rejects.toThrow("rollback");
    for (const model of projectAssistantModels) expect(await model.countDocuments()).toBe(0);
    const run = await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, f.input)); expect(run?.generation).toBe(1);
  });
  it("holds a global token budget across independently created adapters", async () => {
    const f = await fixture();
    const secondMessage = await f.service.send(f.actor("client-b"), "b", chatSend("Project B status?"));
    const first = createProjectAssistantRuntime({...f.options, tokensPerDay: 3500, provider: {async generate(context) {await context.reserveAttempt(1000); return generated;}}});
    const secondRepository = createMongoProjectChatRepository();
    const second = createProjectAssistantRuntime({...f.options, repository: secondRepository, tokensPerDay: 3500, provider: {async generate(context) {await context.reserveAttempt(1000); return generated;}}});
    const one = (await f.chatRepository.mutate(tx => first.enqueueAssistant(tx, f.input)))!;
    const two = (await secondRepository.mutate(tx => second.enqueueAssistant(tx, {...f.input, projectId: "b", clientId: "client-b", messageId: secondMessage.id})))!;
    f.advance(120_000); await Promise.all([first.runOnce(), second.runOnce()]);
    const runs = await f.chatRepository.snapshot(async tx => [await tx.assistant.run(one.id), await tx.assistant.run(two.id)]);
    expect(runs.filter(run => run?.failureCode === "ASSISTANT_TOKEN_LIMIT")).toHaveLength(1);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(1);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "usage"})).toBe(1);
  });
  it("reclaims a dead worker's lease with a new token and durable attempt count", async () => {
    const f = await fixture(), run = (await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, f.input)))!;
    await f.chatRepository.mutate(tx => tx.assistant.saveRun({...run, status: "leased", workerAttempts: 1, providerAttempts: 1, leaseToken: "dead", leaseUntil: f.clock().toISOString()}));
    await createProjectAssistantRuntime({...f.options, repository: createMongoProjectChatRepository()}).runOnce();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.run(run.id))).toMatchObject({workerAttempts: 2, providerAttempts: 1, status: "no_answer", leaseToken: null});
  });
  it("cannot recover another project's result by ID and preserves unique result lineage", async () => {
    const f = await fixture(); await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, f.input)); f.advance(120_000); await f.runtime.runOnce();
    const result = await ProjectChatAssistantResultModel.findOne().lean();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.result("b", String(result!._id)))).toBeNull();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.result("a", String(result!._id)))).toMatchObject({projectId: "a", kind: "no_answer"});
  });
  it("rolls back publication and result if its surrounding transaction fails", async () => {
    const f = await fixture();
    f.options.publish = async (tx, run, _result, now) => {
      await tx.assistant.saveReceipt({id: "would-be-publish", kind: "publication", projectId: "a", runId: run.id, createdAt: now, fingerprint: "synthetic", amount: 0, settled: true});
      throw new Error("publication failure");
    };
    const run = (await f.chatRepository.mutate(tx => f.runtime.enqueueAssistant(tx, f.input)))!;
    f.advance(120_000); await f.runtime.runOnce();
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication"})).toBe(0);
    expect(await f.chatRepository.snapshot(tx => tx.assistant.run(run.id))).toMatchObject({status: "failed", failureCode: "ASSISTANT_UNAVAILABLE"});
  });
});
