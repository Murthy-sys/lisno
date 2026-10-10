import { describe, expect, it, vi } from "vitest";
import type { AssistantGeneratedResult, AssistantReadSources } from "../src/contracts/project-chat-assistant.js";
import { createProjectChatAssistantService } from "../src/services/project-chat-assistant.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createNotificationEmailDispatcher } from "../src/services/notification-email-dispatcher.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createChatFixture, chatSend } from "./helpers/project-chat.js";

const generated: AssistantGeneratedResult = {kind: "price", narrative: [{text: "Your project is in execution. You can review the approximate addition below.", factIds: ["stage"]}], facts: [{id: "stage", label: "Project stage", value: "Execution", source: {id: "a", label: "Project status", href: null}}], candidates: [], missingInputs: [], freshness: [],
  commercial: {currency: "INR", policy: "configuration-selling-v1", state: "complete", lines: [], subtotalPaise: 23000, gstRateBps: 1800, gstPaise: 4140, totalPaise: 27140, optionalSubtotalPaise: null, approvedBaselinePaise: 1234567, hypotheticalTotalPaise: 1261707, assumptions: ["Extra scope only"], missingInputs: []}};
function fixture(enabled = true) {
  const f = createChatFixture();
  let fresh = true;
  const reads = (): AssistantReadSources => ({status: async () => ({facts: [], freshness: []}), execution: async () => ({facts: [], freshness: []}), searchCatalogue: async () => [], recommendations: async () => ({rules: [], freshness: []}), preview: async () => {throw new Error("unused");}, revalidate: async () => fresh});
  const generate = vi.fn(async () => generated);
  const assistant = createProjectChatAssistantService({chatRepository: f.chatRepository, audit: f.audit, clock: f.clock, enabled, provider: {generate}, readSources: reads});
  vi.spyOn(assistant.runtime, "wake").mockImplementation(() => {});
  const onNotificationsCommitted = vi.fn();
  const service = createProjectChatService({repository: f.repository, audit: f.audit, clock: f.clock, chatRepository: f.chatRepository, assistant, onNotificationsCommitted});
  const notifications = createNotificationService({repository: f.chatRepository, clock: f.clock});
  const inbox = (recipientId: string) => f.chatRepository.snapshot(tx => tx.notificationPage(recipientId, ["a", "b"], 50, 0));
  return {...f, assistant, service, generate, inbox, notifications, onNotificationsCommitted, stale: () => {fresh = false;}};
}

describe("project chat assistant integration", () => {
  it("adds a service participant without creating a human role, selectable user or human count", async () => {
    const f = fixture();
    const before = await createChatFixture().service.summary(f.actor("client-a"), "a");
    const summary = await f.service.summary(f.actor("client-a"), "a");
    const page = await f.service.participants(f.actor("client-a"), "a");
    expect(summary.assistant).toEqual({kind: "service", id: "lisno-ai", name: "Lisno AI", available: true});
    expect(summary.participantCount).toBe(before.participantCount);
    expect(page.items.some(person => person.id === "lisno-ai")).toBe(false);
    await expect(f.service.send(f.actor("client-a"), "a", chatSend("@Lisno AI", {mentions: [{userId: "lisno-ai", start: 0, end: 9}]}))).rejects.toMatchObject({status: 400});
  });
  it("alerts the explicit owner immediately even while generation is disabled", async () => {
    const f = fixture(false);
    const sent = await f.service.send(f.actor("client-a"), "a", chatSend("Please check", {priority: "critical", responsibleUserId: "electric-a"}));
    expect((await f.inbox("electric-a")).items[0]).toMatchObject({type: "chat.assistant.route", messageId: sent.id, routing: {priority: "critical", messageVersion: 1}});
    expect(f.onNotificationsCommitted).toHaveBeenCalledWith(["electric-a"]);
    expect(f.generate).not.toHaveBeenCalled();
    expect((await f.service.summary(f.actor("client-a"), "a")).assistant?.available).toBe(false);
    await expect(f.assistant.request(f.actor("client-a"), "a", sent.id, {expectedVersion: 1, idempotencyKey: "explicit-ask"})).rejects.toMatchObject({status: 503});
  });
  it("resolves the canonical Estimator and leaves the issue assignment unchanged", async () => {
    const f = fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Please check the estimate", {priority: "important"}));
    expect(question).toMatchObject({responsible: null, assistant: {status: "waiting_for_human", routing: "notified", notified: {id: "sales-a"}}});
    expect((await f.inbox("sales-a")).total).toBe(1);
    expect((await f.inbox("super")).total).toBe(0);
    expect(await f.assistant.runtime.runOnce()).toBe(false);
    f.advance(120000); await f.assistant.runtime.runOnce();
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it("alerts the fallback owner immediately while preserving a two-minute answer wait", async () => {
    const f = fixture();
    const question = await f.service.send(f.actor("client-b"), "b", chatSend("Can someone investigate this?", {priority: "critical"}));
    expect(question.assistant).toMatchObject({status: "waiting_for_human", notified: {id: "super"}});
    expect((await f.inbox("super")).total).toBe(1);
  });
  it("deduplicates mentions and send retries, then resurfaces one alert for a later escalation", async () => {
    const f = fixture();
    const input = chatSend("@Electric A please check", {priority: "important", responsibleUserId: "electric-a", mentions: [{userId: "electric-a", start: 0, end: 11}]});
    const sent = await f.service.send(f.actor("client-a"), "a", input);
    await f.service.send(f.actor("client-a"), "a", input);
    const original = (await f.inbox("electric-a")).items[0]!;
    expect((await f.inbox("electric-a")).total).toBe(1);
    expect((await f.inbox("super")).items[0]?.type).toBe("chat.mention.oversight");
    await f.notifications.read(f.actor("electric-a"), original.id, {routingMessageVersion: 1});
    const lease = await f.chatRepository.mutate(tx => tx.claimNotificationEmail(f.clock().toISOString(), new Date(f.clock().getTime() + 900000).toISOString(), "old-lease"));
    const change = {action: "escalate" as const, expectedVersion: 1, idempotencyKey: "genuine-escalation"};
    await f.service.issue(f.actor("client-a"), "a", sent.id, change);
    await f.service.issue(f.actor("client-a"), "a", sent.id, change);
    expect((await f.inbox("electric-a")).items).toHaveLength(1);
    await expect(f.notifications.read(f.actor("electric-a"), original.id, {routingMessageVersion: 1})).rejects.toMatchObject({status: 409});
    expect((await f.inbox("electric-a")).items[0]).toMatchObject({id: original.id, readAt: null, routing: {priority: "critical", messageVersion: 2}, email: {status: "pending", leaseToken: null}});
    if (lease?.recipientId === "electric-a") expect(await f.chatRepository.mutate(tx => tx.settleNotificationEmail(original.id, "old-lease", f.clock().toISOString(), {...lease.email, status: "sent"}))).toBe(false);
  });
  it("supports a later Important tag on a normal Client question", async () => {
    const f = fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Estimate status?"));
    expect((await f.inbox("sales-a")).total).toBe(0);
    const raised = await f.service.issue(f.actor("client-a"), "a", question.id, {action: "raise", priority: "important", expectedVersion: 1, idempotencyKey: "later-important"});
    expect(raised.assistant).toMatchObject({generation: 2, routing: "notified", notified: {id: "sales-a"}});
    expect((await f.inbox("sales-a")).total).toBe(1);
  });
  it("publishes one service reply and keeps all commercial values out of shared bodies and quotes", async () => {
    const f = fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("What is the estimate?"));
    const request = {expectedVersion: 1, idempotencyKey: "ask-ai-now"};
    const requested = await f.assistant.request(f.actor("client-a"), "a", question.id, request);
    expect(requested.runId).toBe(question.assistant?.runId);
    await f.assistant.runtime.runOnce();
    await f.assistant.request(f.actor("client-a"), "a", question.id, request);
    await f.assistant.runtime.runOnce();
    const messages = (await f.service.messages(f.actor("client-a"), "a", {})).items;
    const answer = messages.find(message => message.author.kind === "service")!;
    expect(messages).toHaveLength(2);
    expect(answer.assistant).toMatchObject({status: "answered", resultId: expect.any(String)});
    expect(Object.values(answer.capabilities).every(value => value === false)).toBe(true);
    expect(JSON.stringify(messages)).not.toMatch(/27140|1234567|subtotalPaise|commercial|assistantRunId/);
    const price = await f.assistant.result(f.actor("client-a"), "a", answer.assistant!.resultId!);
    expect(price).toMatchObject({commercialAccess: "allowed", stale: false, commercial: {totalPaise: 27140}});
    expect(price.narrative).toEqual(generated.narrative);
    expect(JSON.stringify(messages)).not.toContain(generated.narrative![0]!.text);
    expect((await f.assistant.result(f.actor("sales-a"), "a", price.id)).commercialAccess).toBe("allowed");
    const worker = await f.assistant.result(f.actor("electric-a"), "a", price.id);
    expect(worker).toMatchObject({commercialAccess: "restricted", commercial: null, facts: generated.facts});
    expect(JSON.stringify(worker)).not.toMatch(/27140|1234567|freshness/);
    await expect(f.assistant.result(f.actor("client-b"), "b", price.id)).rejects.toMatchObject({status: 404});
    await expect(f.service.issue(f.actor("super"), "a", answer.id, {action: "raise", priority: "critical", expectedVersion: 1, idempotencyKey: "raise-service"})).rejects.toMatchObject({status: 403});
    const quote = await f.service.send(f.actor("electric-a"), "a", chatSend("Thanks", {replyToId: answer.id}));
    expect(quote.replyTo?.author).toMatchObject({kind: "service", id: "lisno-ai"});
    expect(f.generate).toHaveBeenCalledOnce();
    f.stale();
    const staleAnswer = await f.assistant.result(f.actor("client-a"), "a", price.id);
    expect(staleAnswer.stale).toBe(true);
    expect(staleAnswer.narrative).toBeUndefined();
  });
  it("denies another person's explicit request and stops automatic answers after a human reply", async () => {
    const f = fixture();
    const question = await f.service.send(f.actor("client-a"), "a", chatSend("Estimate status?"));
    await expect(f.assistant.request(f.actor("electric-a"), "a", question.id, {expectedVersion: 1, idempotencyKey: "not-the-owner"})).rejects.toMatchObject({status: 403});
    await f.service.send(f.actor("sales-a"), "a", chatSend("I will check this", {replyToId: question.id}));
    f.advance(120000); await f.assistant.runtime.runOnce();
    expect(f.generate).not.toHaveBeenCalled();
    const updated = (await f.service.messages(f.actor("client-a"), "a", {})).items.find(row => row.id === question.id)!;
    expect(updated.assistant).toMatchObject({status: "suppressed", canRequest: true});
    await f.assistant.request(f.actor("client-a"), "a", question.id, {expectedVersion: 1, idempotencyKey: "ask-after-human"});
    await f.assistant.runtime.runOnce(); expect(f.generate).toHaveBeenCalledOnce();
  });
  it.each(["Hi", "Thank you!", "Okay", "Yes", "No", "What is the progress?"])("queues ordinary Client text without additional alerts: %s", async body => {
    const f = fixture();
    f.generate.mockResolvedValueOnce({kind: "no_answer", narrative: [{text: "Hello! How can I help with your project?", factIds: []}], facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []});
    const message = await f.service.send(f.actor("client-a"), "a", chatSend(body));
    expect(message.assistant?.status).toBe("waiting_for_human");
    f.advance(119_999); expect(await f.assistant.runtime.runOnce()).toBe(false);
    f.advance(1); expect(await f.assistant.runtime.runOnce()).toBe(true);
    expect(f.generate).toHaveBeenCalledOnce();
    const answer = (await f.service.messages(f.actor("client-a"), "a", {})).items.find(row => row.author.kind === "service")!;
    expect(answer.body).toBe("Lisno AI replied to your message.");
    expect(answer.body).not.toMatch(/could not verify|project team|Hello!/);
    expect((await f.assistant.result(f.actor("client-a"), "a", answer.assistant!.resultId!)).narrative).toEqual([{text: "Hello! How can I help with your project?", factIds: []}]);
    expect((await f.inbox("sales-a")).total).toBe(0);
    expect((await f.inbox("super")).total).toBe(0);
    await f.chatRepository.mutate(async tx => {
      await f.assistant.onMessage(tx, (await tx.sources("a"))!, (await tx.message("a", answer.id))!);
    });
    f.advance(120_000); expect(await f.assistant.runtime.runOnce()).toBe(false);
  });
  it("does not start work for staff messages and lets their answer suppress a queued greeting", async () => {
    const f = fixture();
    const greeting = await f.service.send(f.actor("client-a"), "a", chatSend("Hi"));
    const staff = await f.service.send(f.actor("sales-a"), "a", chatSend("Hello, how can I help?"));
    expect(staff.assistant).toBeUndefined();
    f.advance(120_000); await f.assistant.runtime.runOnce(); expect(f.generate).not.toHaveBeenCalled();
    expect(await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", greeting.id))).toMatchObject({status: "suppressed"});
  });
  it.each(["2026-09-16T14:29:30.000Z", "2026-09-16T23:00:00.000Z"])("preserves the full automatic wait at %s without a specific owner", async at => {
    const f = fixture(); f.advance(Date.parse(at) - f.clock().getTime());
    const question = await f.service.send(f.actor("client-b"), "b", chatSend("Hello"));
    expect(question.assistant?.eligibleAt).toBe(new Date(Date.parse(at) + 120_000).toISOString());
    f.advance(119_999); expect(await f.assistant.runtime.runOnce()).toBe(false);
    f.advance(1); expect(await f.assistant.runtime.runOnce()).toBe(true);
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it("does not accelerate an automatic wait when its assigned owner is removed", async () => {
    const f = fixture();
    await f.service.send(f.actor("client-a"), "a", chatSend("What is the estimate?"));
    const owner = (await f.repository.findUserById("sales-a"))!;
    await f.repository.updateUser("sales-a", owner.version, {active: false, updatedAt: f.clock().toISOString()});
    f.advance(119_999); expect(await f.assistant.runtime.runOnce()).toBe(false);
    f.advance(1); expect(await f.assistant.runtime.runOnce()).toBe(true);
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it.each(["", "What is the current project status?"])("answers attachment message text without exposing its contents or metadata: %s", async body => {
    const f = fixture();
    const humanOnly = createProjectChatService({repository: f.repository, audit: f.audit, clock: f.clock, chatRepository: f.chatRepository});
    const sent = await humanOnly.send(f.actor("client-a"), "a", chatSend("Hello"));
    const attachmentMessageId = "synthetic-attachment-message";
    const reply = body ? "Here is the latest verified information." : "Hello! Please describe what you would like help with in text; I cannot read this attachment.";
    f.generate.mockResolvedValueOnce({kind: body ? "status" : "clarification", narrative: [{text: reply, factIds: []}], facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []});
    await f.chatRepository.mutate(async tx => {
      const stored = (await tx.message("a", sent.id))!;
      const message = {...stored, id: attachmentMessageId, clientMessageId: attachmentMessageId, sequence: await tx.allocate("a", f.clock().toISOString()), body, attachments: [{id: "opaque-image", kind: "image" as const, filename: "private-client-photo.jpg", mimeType: "image/jpeg", byteSize: 100, preview: null}]};
      await tx.saveMessage(message);
      await f.assistant.onMessage(tx, (await tx.sources("a"))!, message);
    });
    expect(await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", attachmentMessageId))).toMatchObject({status: "waiting_for_human"});
    f.advance(120_000); await f.assistant.runtime.runOnce();
    expect(f.generate.mock.calls[0]![0].messages.at(-1)).toEqual({id: attachmentMessageId, body, hasAttachments: true});
    expect(JSON.stringify(f.generate.mock.calls[0]![0].messages)).not.toMatch(/private-client-photo|opaque-image|image\/jpeg|byteSize/);
    const run = await f.chatRepository.snapshot(tx => tx.assistant.latestRun("a", attachmentMessageId));
    const answer = await f.assistant.result(f.actor("client-a"), "a", run!.resultId!);
    expect(answer.narrative).toEqual([{text: reply, factIds: []}]);
    if (!body) expect((await f.chatRepository.snapshot(tx => tx.message("a", run!.answerMessageId!)))?.body).toBe("I need a few details to check this request.");
    expect((await f.inbox("super")).total).toBe(0);
  });
  it("suppresses routed mail if the issue was resolved before dispatch", async () => {
    const f = fixture();
    const sent = await f.service.send(f.actor("client-a"), "a", chatSend("Please check", {priority: "critical", responsibleUserId: "electric-a"}));
    await f.service.issue(f.actor("client-a"), "a", sent.id, {action: "resolve", expectedVersion: 1, idempotencyKey: "resolved-now", note: "Checked"});
    const sendMention = vi.fn();
    const delivery = createNotificationEmailDispatcher({repository: f.chatRepository, clock: f.clock, mailer: {deliveryKind: "local_test", sendMention}});
    await delivery.runOnce(); await delivery.stop();
    expect(sendMention).not.toHaveBeenCalled();
    expect((await f.inbox("electric-a")).items[0]?.email).toMatchObject({status: "suppressed", failureCode: "ROUTING_SOURCE_CHANGED"});
  });
});
