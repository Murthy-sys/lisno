import { describe, expect, it } from "vitest";
import { mentionsAfterEdit, mergeChatMessages, readableChatMessage } from "./projectChatState";
import { chatTestMessage } from "./projectChatFixtures";

describe("structured mentions", () => {
  const mention = { userId: "worker-a", start: 3, end: 13 };
  it("shifts stable IDs after text is inserted before a mention", () => {
    expect(mentionsAfterEdit("Hi @Alex Team yes", "Hello, Hi @Alex Team yes", [mention])).toEqual([{ ...mention, start: 10, end: 20 }]);
  });
  it("removes a target when its selected text is edited", () => {
    expect(mentionsAfterEdit("Hi @Alex Team yes", "Hi @Alex New yes", [mention])).toEqual([]);
  });
  it("does not manufacture targets from plain typed names", () => {
    expect(mentionsAfterEdit("Hello", "Hello @Alex Team", [])).toEqual([]);
  });
  it("drops a structured target when typing extends the selected name", () => {
    expect(mentionsAfterEdit("Hi @Alex Team yes", "Hi @Alex Teamster yes", [mention])).toEqual([]);
  });
});
describe("versioned timeline merging", () => {
  it("uses assistant state versions even when the source message version is unchanged", () => {
    const assistant = { runId: "run-a", generation: 1, stateVersion: 1, status: "waiting_for_human" as const, eligibleAt: "2026-10-09T08:05:00Z", resultId: null, checkedAt: null, routing: "not_required" as const, notified: null, canRequest: true, failureCode: null };
    const waiting = chatTestMessage({ assistant });
    const answered = chatTestMessage({ assistant: { ...assistant, stateVersion: 4, status: "answered", resultId: "result-a" } });
    const next = chatTestMessage({ assistant: { ...assistant, generation: 2, stateVersion: 1 } });
    expect(mergeChatMessages([{ items: [waiting] }, { items: [answered, waiting] }])).toEqual([answered]);
    expect(mergeChatMessages([{ items: [next] }, { items: [answered] }])).toEqual([next]);
  });
  it("deduplicates replayed IDs, retains newer versions, and orders noncontiguous message sequences", () => {
    const old = chatTestMessage();
    const changed = { ...old, version: 3, priority: "critical" as const };
    const other = chatTestMessage({ id: "message-b", sequence: 9 });
    expect(mergeChatMessages([{ items: [other, old] }, { items: [changed, old] }])).toEqual([changed, other]);
  });
});
describe("read acknowledgement", () => {
  const messages = [chatTestMessage({ id: "a", sequence: 3 }), chatTestMessage({ id: "b", sequence: 8 }), chatTestMessage({ id: "c", sequence: 10 })];
  const options = { messages, visibleIds: new Set(["a", "b", "c"]), lastRead: 0, hasOlder: false, filtered: false, documentVisible: true };
  it("allows noncontiguous event positions after all intervening messages were displayed", () => expect(readableChatMessage(options)?.id).toBe("c"));
  it("stops at an unseen message even if a later one is on screen", () => expect(readableChatMessage({ ...options, visibleIds: new Set(["a", "c"]) })?.id).toBe("a"));
  it("never assumes an unloaded earlier window was read", () => expect(readableChatMessage({ ...options, hasOlder: true, lastRead: 2 })).toBeNull());
  it("permits a loaded window that overlaps the server read watermark", () => expect(readableChatMessage({ ...options, hasOlder: true, lastRead: 3, visibleIds: new Set(["b"]) })?.id).toBe("b"));
  it.each([{ filtered: true }, { documentVisible: false }])("does not mark filtered, quoted, or hidden views read: %o", override => expect(readableChatMessage({ ...options, ...override })).toBeNull());
});
