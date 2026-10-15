import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatNotificationModel } from "../src/models/ChatNotification.js";
import { ProjectChatMessageModel } from "../src/models/ProjectChat.js";
import { ProjectChatAssistantReceiptModel, ProjectChatAssistantResultModel, ProjectChatAssistantRunModel, projectAssistantModels } from "../src/models/ProjectChatAssistant.js";
import { ProjectModel } from "../src/models/Project.js";
import { createAskLisnoService } from "../src/services/ask-lisno.service.js";
import { assistantDirectFetch } from "../src/services/project-assistant-http.js";
import { createPythonAssistantProvider } from "../src/services/project-assistant-python.js";
import { createProjectChatAssistantService } from "../src/services/project-chat-assistant.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { chatSend } from "./helpers/project-chat.js";
import { chatModels } from "./helpers/project-chat-mongo.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { RULES_TEST_TOKEN, startRulesService } from "./helpers/assistant-rules/http-service.js";
import { insertRulesMongoProjects, RULES_PROJECT_AMOUNTS } from "./helpers/assistant-rules/mongo-projects.js";

const interpreter = process.env.LISNO_ASSISTANT_TEST_PYTHON;

describe.skipIf(!interpreter)("real Python rules and Mongo project sources in both chat paths", () => {
  let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
  let python: Awaited<ReturnType<typeof startRulesService>>;
  beforeAll(async () => {
    replica = await startMongoReplicaSet("assistant-rules-real-projects");
    for (const model of [...new Set([...chatModels, ...projectAssistantModels, ChatNotificationModel])]) await model.syncIndexes();
    python = await startRulesService(interpreter!);
  }, 120_000);
  beforeEach(async () => replica.clear());
  afterAll(async () => {await python?.stop(); await replica?.stop();});

  async function fixture() {
    const f = await insertRulesMongoProjects();
    const wire: string[] = [];
    const transport: typeof globalThis.fetch = async (url, init) => {wire.push(String(init?.body)); return assistantDirectFetch(url, init);};
    const provider = createPythonAssistantProvider({url: python.url, token: RULES_TEST_TOKEN, fetch: transport});
    // Deliberately omit readSources: both services use createAssistantReadSources with
    // their actual Mongo readers, including the fenced publication transaction.
    const privateChat = createAskLisnoService({chatRepository: f.chatRepository, clock: f.clock, enabled: true, provider});
    const assistant = createProjectChatAssistantService({chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, enabled: true, provider});
    vi.spyOn(assistant.runtime, "wake").mockImplementation(() => {});
    const messages = createProjectChatService({repository: f.repository, chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, assistant});
    const ask = (message: string, key: "a" | "b" = "a", projectId: string | null = key) => privateChat.request(f.actor(`client-${key}`), {projectId, message, history: []});
    return {...f, wire, assistant, messages, ask};
  }

  it("answers actual issued progress and status for two unequal owned projects without private chat publication", async () => {
    const f = await fixture();
    await expect(f.ask("Show my project progress", "a", "b")).rejects.toMatchObject({status: 404});
    expect(f.wire).toHaveLength(0);
    const a = await f.ask("Show my project progress", "a", null);
    const b = await f.ask("Show my project progress", "b", null);
    expect(a).toMatchObject({projectId: "a", answer: {kind: "status", facts: expect.arrayContaining([
      expect.objectContaining({value: "active"}), expect.objectContaining({value: "75% reported; this is not a Client acceptance."})
    ])}});
    expect(b).toMatchObject({projectId: "b", answer: {kind: "status", facts: expect.arrayContaining([
      expect.objectContaining({value: "paused"}), expect.objectContaining({value: "25% reported; this is not a Client acceptance."})
    ])}});
    const polite = await f.ask("I'm worried, may I know my project status?");
    expect(polite.answer.narrative?.[0]?.text).toBe("I hear your concern, Client.");
    expect(polite.answer.facts).toEqual(expect.arrayContaining([expect.objectContaining({value: "active"})]));
    expect(JSON.stringify(a)).not.toMatch(/25% reported|PRIVATE_VENDOR_ITEM_b|PRIVATE_ROOM_b/);
    expect(JSON.stringify(b)).not.toMatch(/75% reported|PRIVATE_VENDOR_ITEM_a|PRIVATE_ROOM_a/);
    expect(f.wire.length).toBeGreaterThan(0);
    expect(f.wire.join("\n")).not.toMatch(/Client A|Client B|PRIVATE_|client-a@|client-b@/);
    expect(await ProjectChatMessageModel.countDocuments()).toBe(0);
    expect(await ProjectChatAssistantRunModel.countDocuments()).toBe(0);
  }, 30_000);

  it("reads immutable published prices, never live working prices, through real Python selection", async () => {
    const f = await fixture();
    for (const key of ["a", "b"] as const) {
      const result = await f.ask("Show my estimate", key);
      expect(result.answer.projectPricing).toMatchObject({totalPaise: RULES_PROJECT_AMOUNTS[key].totalPaise, estimateId: `estimate-${key}`, reviewRoundId: `review-${key}`, estimateVersion: 3});
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|99000003|88000001|77000009/);
    }
    expect(f.wire.length).toBeGreaterThan(0);
    expect(f.wire.join("\n")).not.toMatch(/2360|26561|7503|22509|PRIVATE_|review-a|review-b|estimate-a|estimate-b/);
  }, 30_000);

  it("publishes actual progress once in Project Messages, fences freshness and isolates another client", async () => {
    const f = await fixture();
    const question = await f.messages.send(f.actor("client-a"), "a", chatSend("Show my project progress"));
    const request = {expectedVersion: 1, idempotencyKey: "real-source-progress-once"};
    await f.assistant.request(f.actor("client-a"), "a", question.id, request);
    expect(await f.assistant.runtime.runOnce()).toBe(true);
    const run = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", question.id));
    expect(run).toMatchObject({status: "answered", resultId: expect.any(String), answerMessageId: expect.any(String)});
    const result = await f.assistant.result(f.actor("client-a"), "a", run!.resultId!);
    expect(result).toMatchObject({stale: false, kind: "status", facts: expect.arrayContaining([expect.objectContaining({value: "75% reported; this is not a Client acceptance."})])});
    await expect(f.assistant.result(f.actor("client-b"), "b", run!.resultId!)).rejects.toMatchObject({status: 404});
    await f.assistant.request(f.actor("client-a"), "a", question.id, request);
    expect(await f.assistant.runtime.runOnce()).toBe(false);
    expect(await ProjectChatAssistantResultModel.countDocuments({runId: run!.id})).toBe(1);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication", runId: run!.id})).toBe(1);
    expect((await f.messages.messages(f.actor("client-a"), "a", {})).items).toHaveLength(2);
    await ProjectModel.updateOne({_id: "a"}, {$set: {status: "paused"}});
    expect(await f.assistant.result(f.actor("client-a"), "a", run!.resultId!)).toMatchObject({stale: true, facts: [], projectPricing: null});
  }, 30_000);

  it("keeps both shared estimate answers tied to their own publication and prices out of message lists", async () => {
    const f = await fixture();
    for (const key of ["a", "b"] as const) {
      const question = await f.messages.send(f.actor(`client-${key}`), key, chatSend("Show my estimate"));
      await f.assistant.request(f.actor(`client-${key}`), key, question.id, {expectedVersion: 1, idempotencyKey: `real-source-price-${key}`});
      expect(await f.assistant.runtime.runOnce()).toBe(true);
      const run = await f.chatRepository.snapshot(tx => tx.assistant.latestRun(key, question.id));
      expect(run).toMatchObject({status: "answered", resultId: expect.any(String)});
      const result = await f.assistant.result(f.actor(`client-${key}`), key, run!.resultId!);
      expect(result).toMatchObject({stale: false, commercialAccess: "allowed", projectPricing: {
        totalPaise: RULES_PROJECT_AMOUNTS[key].totalPaise, estimateId: `estimate-${key}`, reviewRoundId: `review-${key}`, estimateVersion: 3
      }});
      const other = key === "a" ? "b" : "a";
      await expect(f.assistant.result(f.actor(`client-${other}`), other, run!.resultId!)).rejects.toMatchObject({status: 404});
      const page = await f.messages.messages(f.actor(`client-${key}`), key, {});
      expect(page.items).toHaveLength(2);
      expect(JSON.stringify(page.items)).not.toMatch(/2360|26561|subtotalPaise|gstPaise|ratePaise|PRIVATE_WORKING/);
    }
    expect(f.wire.join("\n")).not.toMatch(/2360|26561|7503|22509|PRIVATE_|review-a|review-b|estimate-a|estimate-b/);
  }, 30_000);
});
