import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import type { AssistantGeneratedResult, AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { ProjectChatMessageModel, ProjectChatEventModel } from "../src/models/ProjectChat.js";
import { ProjectChatAssistantResultModel, ProjectChatAssistantRunModel, ProjectChatAssistantReceiptModel, projectAssistantModels } from "../src/models/ProjectChatAssistant.js";
import { ChatNotificationModel } from "../src/models/ChatNotification.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import type { ChatTransaction } from "../src/repositories/project-chat.js";
import { assertCompletionReviewAllowsOrderChanges } from "../src/services/site-completion-fence.js";
import type { AuditService } from "../src/services/audit.service.js";
import { createProjectChatAssistantService } from "../src/services/project-chat-assistant.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { chatSend } from "./helpers/project-chat.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const generated: AssistantGeneratedResult = {
  narrative: [{text: "Your project is active. The approximate addition is available below for review.", factIds: ["project-status"]}],
  kind: "price", facts: [{id: "project-status", label: "Project status", value: "Active", source: {id: "a", label: "Project", href: null}}],
  candidates: [], missingInputs: [], freshness: [{kind: "synthetic-source", id: "source-a", version: "v1"}],
  commercial: {currency: "INR", policy: "configuration-selling-v1", state: "complete", lines: [], subtotalPaise: 23800, gstRateBps: 1800, gstPaise: 4284, totalPaise: 28084, optionalSubtotalPaise: null, approvedBaselinePaise: 1797531, hypotheticalTotalPaise: 1825615, assumptions: ["Extra quantity only"], missingInputs: []}
};
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("project-chat-assistant-bridge");
  for (const model of [...new Set([...chatModels, ...projectAssistantModels, ChatNotificationModel])]) await model.syncIndexes();
}, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function fixture(options: {audit?: (original: AuditService) => AuditService; revalidate?: (tx?: ChatTransaction) => Promise<boolean>} = {}) {
  const f = await insertChatMongoFixture();
  let time = f.clock().getTime(), freshAtPublish = true;
  const clock = () => new Date(time);
  const generate = vi.fn(async () => generated);
  const audit = options.audit?.(f.audit) ?? f.audit;
  const assistant = createProjectChatAssistantService({chatRepository: f.chatRepository, audit, clock, enabled: true, provider: {generate},
    readSources: (_scope, tx): AssistantReadSources => ({
      status: async () => ({facts: [], freshness: []}), execution: async () => ({facts: [], freshness: []}), searchCatalogue: async () => [],
      recommendations: async () => ({rules: [], freshness: []}), preview: async () => {throw new Error("unused");},
      revalidate: async () => options.revalidate ? options.revalidate(tx) : tx ? freshAtPublish : true
    })});
  vi.spyOn(assistant.runtime, "wake").mockImplementation(() => {});
  const service = createProjectChatService({repository: f.repository, audit, clock, chatRepository: f.chatRepository, assistant});
  const notifications = createNotificationService({repository: f.chatRepository, clock});
  const inbox = (id: string) => f.chatRepository.snapshot(tx => tx.notificationPage(id, ["a", "b"], 50, 0));
  const question = () => service.send(f.actor("client-a"), "a", chatSend("Please review my estimate"));
  const answer = async (id: string) => {
    await assistant.request(f.actor("client-a"), "a", id, {expectedVersion: 1, idempotencyKey: "ask-assistant-now"});
    await assistant.runtime.runOnce();
    return f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", id));
  };
  return {...f, assistant, service, generate, notifications, inbox, question, answer, clock,
    advance: (ms: number) => {time += ms;}, changeSource: () => {freshAtPublish = false;}};
}

describe("project assistant real Mongo chat integration", () => {
  it("persists the service author and result lineage without a User or human role", async () => {
    const f = await fixture(), question = await f.question();
    const run = await f.answer(question.id);
    expect(run).toMatchObject({status: "answered", resultId: expect.any(String), answerMessageId: expect.any(String)});
    const message = await ProjectChatMessageModel.findById(run!.answerMessageId).lean();
    expect(message).toMatchObject({author: {kind: "service", id: "lisno-ai", name: "Lisno AI"}, assistantRunId: run!.id, replyTo: {id: question.id, author: {id: "client-a", role: "client"}}});
    expect(message!.author.role).toBeUndefined();
    expect(await UserModel.countDocuments({_id: "lisno-ai"})).toBe(0);
    expect(await ProjectChatAssistantResultModel.findById(run!.resultId).lean()).toMatchObject({runId: run!.id, messageId: String(message!._id), projectId: "a", narrative: generated.narrative, commercial: {totalPaise: 28084}});
    expect((await f.assistant.result(f.actor("client-a"), "a", run!.resultId!)).narrative).toEqual(generated.narrative);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication", runId: run!.id})).toBe(1);
    const loaded = (await f.service.messages(f.actor("client-a"), "a", {})).items.find(row => row.id === run!.answerMessageId)!;
    expect(loaded.assistant).toMatchObject({resultId: run!.resultId, status: "answered"});
    expect(Object.values(loaded.capabilities).every(value => value === false)).toBe(true);
    const reply = await f.service.send(f.actor("electric-a"), "a", chatSend("Thanks", {replyToId: loaded.id}));
    expect(reply.replyTo!.author).toMatchObject({kind: "service", id: "lisno-ai"});
    expect((await ProjectChatMessageModel.findById(reply.id).lean())!.replyTo.author.role).toBeUndefined();
  });

  it("keeps commercial amounts out of shared lists, reply previews, events, notifications and unauthorized result reads", async () => {
    const f = await fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Please review my estimate", {priority: "important"}));
    const run = await f.answer(question.id);
    expect(run?.status).toBe("answered");
    const shared = (await f.service.messages(f.actor("electric-a"), "a", {})).items;
    const worker = await f.assistant.result(f.actor("electric-a"), "a", run!.resultId!);
    const client = await f.assistant.result(f.actor("client-a"), "a", run!.resultId!);
    expect(client).toMatchObject({commercialAccess: "allowed", commercial: {totalPaise: 28084}});
    expect(worker).toMatchObject({commercialAccess: "restricted", commercial: null, facts: generated.facts});
    const surfaces = {shared, worker, events: await ProjectChatEventModel.find().lean(), notifications: await ChatNotificationModel.find().lean()};
    expect(JSON.stringify(surfaces)).not.toMatch(/28084|1797531|1825615|subtotalPaise|gstPaise|freshness/);
    expect(JSON.stringify({shared, events: surfaces.events, notifications: surfaces.notifications})).not.toContain(generated.narrative![0]!.text);
    await expect(f.assistant.result(f.actor("client-b"), "a", run!.resultId!)).rejects.toMatchObject({status: 404});
    await expect(f.assistant.result(f.actor("client-b"), "b", run!.resultId!)).rejects.toMatchObject({status: 404});
    expect((await f.assistant.result(f.actor("sales-a"), "a", run!.resultId!)).commercialAccess).toBe("allowed");
  });

  it("reads older facts-only answers without a narrative migration", async () => {
    const f = await fixture();
    const {narrative: _narrative, ...legacy} = generated;
    f.generate.mockResolvedValueOnce(legacy);
    const question = await f.question(), run = await f.answer(question.id);
    const answer = await f.assistant.result(f.actor("client-a"), "a", run!.resultId!);
    expect(answer.narrative).toBeUndefined();
    expect(answer.facts).toEqual(legacy.facts);
    expect(answer.commercial).toEqual(legacy.commercial);
  });

  it("deduplicates a mention and route, then invalidates an old email lease when escalation resurfaces the same row", async () => {
    const f = await fixture();
    const input = chatSend("@Electric A please investigate", {priority: "important", responsibleUserId: "electric-a", mentions: [{userId: "electric-a", start: 0, end: 11}]});
    const question = await f.service.send(f.actor("client-a"), "a", input);
    await f.service.send(f.actor("client-a"), "a", input);
    const original = (await f.inbox("electric-a")).items[0]!;
    expect(original).toMatchObject({type: "chat.mention", routing: {priority: "important", messageVersion: 1}});
    expect((await f.inbox("electric-a")).total).toBe(1);
    expect((await f.inbox("super")).items[0]).toMatchObject({type: "chat.mention.oversight"});
    await f.notifications.read(f.actor("electric-a"), original.id, {routingMessageVersion: 1});
    const leases = [];
    for (let i = 0; i < 2; i++) leases.push(await f.chatRepository.mutate(tx => tx.claimNotificationEmail(f.clock().toISOString(), new Date(f.clock().getTime() + 60_000).toISOString(), `old-lease-${i}`)));
    const lease = leases.find(row => row?.recipientId === "electric-a")!;
    expect(lease).toBeDefined();
    const escalation = {action: "escalate" as const, expectedVersion: 1, idempotencyKey: "later-escalation"};
    const changed = await f.service.issue(f.actor("client-a"), "a", question.id, escalation);
    await f.service.issue(f.actor("client-a"), "a", question.id, escalation);
    expect(changed.assistant?.generation).toBe(2);
    expect((await f.inbox("electric-a")).items).toHaveLength(1);
    expect((await f.inbox("electric-a")).items[0]).toMatchObject({id: original.id, readAt: null, routing: {priority: "critical", messageVersion: 2}, email: {status: "pending", leaseToken: null}});
    await expect(f.notifications.read(f.actor("electric-a"), original.id, {routingMessageVersion: 1})).rejects.toMatchObject({status: 409});
    expect((await f.inbox("electric-a")).items[0]!.readAt).toBeNull();
    expect(await f.notifications.read(f.actor("electric-a"), original.id, {routingMessageVersion: 2})).toMatchObject({readAt: expect.any(String)});
    expect(await f.chatRepository.mutate(tx => tx.settleNotificationEmail(original.id, lease!.email.leaseToken!, f.clock().toISOString(), {...lease!.email, status: "sent"}))).toBe(false);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "routing", runId: question.id})).toBe(2);
  });

  it("returns an old escalated alert ahead of the latest twenty notifications", async () => {
    const f = await fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Please investigate", {priority: "important", responsibleUserId: "electric-a"}));
    const original = (await f.inbox("electric-a")).items[0]!;
    const {id: _id, routing: _routing, ...base} = original;
    await ChatNotificationModel.insertMany(Array.from({length: 21}, (_, index) => ({...base, _id: `newer-${index}`, messageId: `newer-message-${index}`, createdAt: new Date(f.clock().getTime() + index + 1).toISOString()})));
    const page = () => f.chatRepository.snapshot(tx => tx.notificationPage("electric-a", ["a"], 20, 0));
    expect((await page()).items.some(row => row.id === original.id)).toBe(false);
    f.advance(60_000);
    await f.service.issue(f.actor("client-a"), "a", question.id, {action: "escalate", expectedVersion: 1, idempotencyKey: "resurface-old-important"});
    expect((await page()).items[0]).toMatchObject({id: original.id, createdAt: original.createdAt, routing: {priority: "critical", messageVersion: 2, lastAlertAt: f.clock().toISOString()}});
    expect((await page()).total).toBe(22);
  });

  it("rolls back the actual service message, result, event and audit when publication audit fails", async () => {
    const f = await fixture({audit: original => ({...original, async appendInMongoTransaction(input, session) {
      await original.appendInMongoTransaction(input, session);
      if (input.action === "project_chat.assistant_answered") throw new Error("synthetic publication audit failure");
    }})});
    const question = await f.question(), run = await f.answer(question.id);
    expect(run).toMatchObject({status: "failed", failureCode: "ASSISTANT_UNAVAILABLE"});
    expect(await ProjectChatMessageModel.countDocuments()).toBe(1);
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "publication"})).toBe(0);
    expect(await AuditEventModel.countDocuments({action: "project_chat.assistant_answered"})).toBe(0);
    expect(await ProjectChatEventModel.countDocuments({type: "message.created"})).toBe(1);
    expect((await f.chatRepository.snapshot(tx => tx.state("a"))).latestMessageSequence).toBe(question.sequence);
  });

  it("rechecks the source inside the publication transaction", async () => {
    const f = await fixture(), question = await f.question();
    f.generate.mockImplementation(async () => {f.changeSource(); return generated;});
    const run = await f.answer(question.id);
    expect(run).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SOURCE_CHANGED"});
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
  });

  it("retries final validation against a concurrently committed legacy Client acceptance", async () => {
    const observed: number[] = [];
    const f = await fixture({revalidate: async tx => {
      if (!tx?.session) return true;
      const review = await VendorWorkReviewModel.findById("legacy-review").session(tx.session).lean();
      observed.push(review!.version);
      return review!.version === 1;
    }});
    await VendorWorkReviewModel.create({_id: "legacy-review", projectId: "a", vendorId: "vendor-a", assignmentId: "assignment-a", clientId: "client-a", round: 1,
      assignmentVersionAtSubmit: 1, note: "Synthetic completion", progress: 100, imageIds: [], submittedById: "vendor-user", submittedAt: f.clock(), status: "pending", version: 1});
    let locked!: () => void, release!: () => void, writer: Promise<unknown> | undefined;
    const lockAcquired = new Promise<void>(resolve => {locked = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    const update = ProjectModel.updateOne.bind(ProjectModel);
    const publicationFence = vi.spyOn(ProjectModel, "updateOne").mockImplementation((filter, change, options) => {
      if (filter?._id === "a" && !filter.status && change?.$inc?.siteCompletionFenceEpoch === 1) release();
      return update(filter, change, options);
    });
    f.generate.mockImplementation(async () => {
      writer = mongoose.connection.transaction(async session => {
        // This is the same guard and transaction order used by legacy clientDecision.
        await assertCompletionReviewAllowsOrderChanges("a", session);
        await VendorWorkReviewModel.updateOne({_id: "legacy-review", version: 1}, {$set: {status: "approved"}, $inc: {version: 1}}, {session});
        locked(); await gate;
      }, {readConcern: {level: "snapshot"}, readPreference: "primary"});
      await lockAcquired;
      return generated;
    });
    try {
      const question = await f.question(), run = await f.answer(question.id);
      await writer;
      expect(observed).toEqual([2]);
      expect(run).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SOURCE_CHANGED"});
      expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
      expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    } finally {release(); await writer; publicationFence.mockRestore();}
  });

  it.each(["ownership", "session"])("suppresses a generated answer after current Client %s is revoked", async cause => {
    const f = await fixture(), question = await f.question();
    f.generate.mockImplementation(async () => {
      await f.chatRepository.mutate(async tx => {
        if (cause === "ownership") await ProjectModel.updateOne({_id: "a"}, {$set: {clientId: "client-b"}}, {session: tx.session});
        else await UserModel.updateOne({_id: "client-a"}, {$inc: {sessionVersion: 1}}, {session: tx.session});
      });
      return generated;
    });
    const run = await f.answer(question.id);
    expect(run).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_AUTHORITY_CHANGED"});
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
  });

  it("fences a leased generation when the question is escalated while the model is running", async () => {
    const f = await fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Please review my estimate", {priority: "important"}));
    f.generate.mockImplementation(async () => {
      await f.service.issue(f.actor("client-a"), "a", question.id, {action: "escalate", expectedVersion: 1, idempotencyKey: "escalated-during-answer"});
      return generated;
    });
    await f.answer(question.id);
    const original = await ProjectChatAssistantRunModel.findById(question.assistant!.runId).lean();
    const current = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", question.id));
    expect(original).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SUPERSEDED", leaseToken: null});
    expect(current).toMatchObject({generation: 2, messageVersion: 2, status: "waiting_for_human"});
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
  });

  it("coalesces two rapid parts while preserving the root Critical alert and waiting from the latest source", async () => {
    const f = await fixture();
    const root = await f.service.send(f.actor("client-a"), "a", chatSend("Can I add false ceiling?", {priority: "critical", responsibleUserId: "sales-a"}));
    const original = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", root.id));
    f.advance(20_000);
    const followup = await f.service.send(f.actor("client-a"), "a", chatSend("100 sq-ft in Hall"));
    const pending = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", followup.id));
    expect(pending).toMatchObject({eligibleAt: new Date(Date.parse(followup.createdAt) + 120_000).toISOString(), routing: "notified", notified: {id: "sales-a"},
      coalescedSources: [{runId: original!.id, messageId: root.id, messageVersion: 1, messageSequence: root.sequence}]});
    expect((await f.inbox("sales-a")).items).toHaveLength(1);
    expect((await f.inbox("sales-a")).items[0]).toMatchObject({messageId: root.id, routing: {priority: "critical"}});
    expect(await f.answer(followup.id)).toMatchObject({status: "answered", routing: "notified", notified: {id: "sales-a"}});
    expect(f.generate).toHaveBeenCalledOnce();
    expect(f.generate.mock.calls[0][0].messages).toEqual([{id: root.id, body: "Can I add false ceiling?"}, {id: followup.id, body: "100 sq-ft in Hall"}]);
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(1);
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(1);
    expect(await ProjectChatAssistantReceiptModel.countDocuments({kind: "routing", runId: root.id})).toBe(1);
    expect((await f.inbox("sales-a")).total).toBe(1);
  });

  it("keeps a rapid fragment separate from a leased explicit root without restarting work", async () => {
    const f = await fixture(); let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => {entered = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    f.generate.mockImplementation(async () => {if (f.generate.mock.calls.length === 1) {entered(); await gate;} return generated;});
    const root = await f.question();
    await f.assistant.request(f.actor("client-a"), "a", root.id, {expectedVersion: 1, idempotencyKey: "coalesce-first-part"});
    const firstWork = f.assistant.runtime.runOnce(); await started;
    const followup = await f.service.send(f.actor("client-a"), "a", chatSend("100 sq-ft in Hall"));
    const separate = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", followup.id));
    expect(separate).toMatchObject({workerAttempts: 0, generationStartedAt: null, status: "waiting_for_human"});
    expect(separate?.coalescedSources).toBeUndefined();
    release(); await firstWork;
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(1);
    f.advance(119_999); expect(await f.assistant.runtime.runOnce()).toBe(false);
    f.advance(1); await f.assistant.runtime.runOnce();
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(2);
    expect(await f.chatRepository.snapshot(tx => tx.assistant.run(separate!.id))).toMatchObject({workerAttempts: 1, status: "answered"});
  });
  it("suppresses an automatic answer when a staff response arrives during generation", async () => {
    const f = await fixture(), question = await f.question();
    f.generate.mockImplementation(async () => {
      await f.service.send(f.actor("sales-a"), "a", chatSend("I can help with that", {replyToId: question.id}));
      return generated;
    });
    f.advance(120_000); await f.assistant.runtime.runOnce();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", question.id))).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_HUMAN_REPLIED"});
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
  });
  it("retains root issue dependencies so resolving the Critical request cancels a coalesced answer", async () => {
    const f = await fixture();
    const root = await f.service.send(f.actor("client-a"), "a", chatSend("Can I add false ceiling?", {priority: "critical", responsibleUserId: "sales-a"}));
    const followup = await f.service.send(f.actor("client-a"), "a", chatSend("100 sq-ft in Hall"));
    f.generate.mockImplementation(async () => {
      await f.service.issue(f.actor("client-a"), "a", root.id, {action: "resolve", expectedVersion: 1, idempotencyKey: "resolved-original-root", note: "No longer needed"});
      return generated;
    });
    const run = await f.answer(followup.id);
    expect(run).toMatchObject({status: "suppressed", failureCode: "ASSISTANT_SOURCE_CHANGED"});
    expect(await ProjectChatAssistantResultModel.countDocuments()).toBe(0);
    expect(await ProjectChatMessageModel.countDocuments({"author.kind": "service"})).toBe(0);
    expect((await f.inbox("sales-a")).total).toBe(1);
  });
});
