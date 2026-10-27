import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { ProjectChatProvider, useChatProjectRegistration, useProjectChat } from "./ProjectChatProvider";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { chatTestSummary } from "./projectChatFixtures";
import type { runProjectChatStream } from "./projectChatStream";
import type { ChatConversationPage, ChatEventType } from "./projectChatTypes";

type Stream = Parameters<typeof runProjectChatStream>[0];
const fixture = vi.hoisted(() => ({ streams: [] as Stream[] }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "client-a" }, authorization: {} }) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: () => true }));
vi.mock("./projectChatStream", () => ({ runProjectChatStream: async (stream: Stream) => {
  fixture.streams.push(stream);
  stream.onStatus("live");
  await new Promise<void>(resolve => stream.signal.addEventListener("abort", () => resolve(), { once: true }));
} }));

function Conversation() {
  useChatProjectRegistration("project-a");
  const chat = useProjectChat();
  useQuery({ queryKey: [...chatKeys.list(chat.scope), { search: "", filter: "all", offset: 0 }], queryFn: ({ signal }) => projectChatApi.conversations(0, signal, { search: "", filter: "all" }) });
  return <p>{chat.connection}</p>;
}
const settle = () => act(() => vi.advanceTimersByTimeAsync(10));
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><ProjectChatProvider><Conversation /></ProjectChatProvider></QueryClientProvider>);
  await settle();
  expect(fixture.streams).toHaveLength(1);
  return { ...view, client };
}
function seedListVariants(client: QueryClient) {
  const scope = client.getQueryCache().getAll().find(query => query.queryKey[2] === "conversations")!.queryKey[1] as string;
  const queries = [
    { search: "Courtyard", filter: "unread", offset: 0 },
    { search: "", filter: "critical", offset: 30 },
    { search: "Garden", filter: "important", offset: 0 }
  ];
  const keys = queries.map(query => [...chatKeys.list(scope), query]);
  const page: ChatConversationPage = { items: [{ ...chatTestSummary(), lastMessageAt: null, lastMessage: null }], pagination: { offset: 0, limit: 30, total: 1, hasMore: false }, totals: { unread: 1, critical: 3, important: 2 } };
  keys.forEach(key => client.setQueryData(key, page));
  const otherScopeKey = [...chatKeys.list("unrelated-session"), queries[0]];
  client.setQueryData(otherScopeKey, { ...page, items: [{ ...page.items[0], project: { id: "project-b", name: "Other session residence", status: "planning" } }] });
  return { scope, keys, page, otherScopeKey };
}
beforeEach(() => {
  vi.useFakeTimers();
  fixture.streams = [];
  tokenStorage.set("synthetic-refresh-session");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(projectChatApi, "summary").mockResolvedValue(chatTestSummary());
  vi.spyOn(projectChatApi, "conversations").mockResolvedValue({ items: [{ ...chatTestSummary(), lastMessageAt: null, lastMessage: null }], totals: { unread: 2, critical: 6, important: 4 }, pagination: { offset: 0, limit: 30, total: 1, hasMore: false } });
});
afterEach(() => vi.useRealTimers());

describe("project stream query scheduling", () => {
  it.each(["message.created", "assistant.changed", "issue.changed", "participants.changed", "read.changed", "resync"] as const)("invalidates every search/filter/page variant after %s without crossing session scope", async type => {
    const { client } = await mount();
    const { scope, keys, otherScopeKey } = seedListVariants(client);
    const initial = vi.mocked(projectChatApi.conversations).mock.calls.length;
    expect(client.getQueryCache().findAll({ queryKey: chatKeys.list(scope) })).toHaveLength(4);
    act(() => fixture.streams[0].onBatch({
      events: type === "resync" ? [] : [{ id: type, type, projectId: "project-a", recordId: "record-a", sequence: 8, version: 2, occurredAt: "2026-10-27T08:00:00Z" }],
      cursor: "changed", hasMore: false, resync: type === "resync"
    }));
    await settle();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(initial + 1);
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherScopeKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData<ChatConversationPage>(otherScopeKey)?.items[0].project.id).toBe("project-b");
  });

  it("purges every list variant on stream revocation and rejects late filtered results", async () => {
    const { client } = await mount();
    const { scope, keys, page, otherScopeKey } = seedListVariants(client);
    const allKeys = client.getQueryCache().findAll({ queryKey: chatKeys.list(scope) }).map(query => query.queryKey);
    let pendingSignal!: AbortSignal;
    let complete!: (value: ChatConversationPage) => void;
    const request = client.fetchQuery({
      queryKey: keys[1], staleTime: 0,
      queryFn: ({ signal }) => { pendingSignal = signal; return new Promise<ChatConversationPage>(resolve => { complete = resolve; }); }
    }).catch(() => undefined);
    // The mounted list may start a new read after purge. Keep it pending so a
    // stale transport fixture cannot conceal whether the old cache was cleared.
    vi.mocked(projectChatApi.conversations).mockImplementation(() => new Promise(() => {}));
    act(() => fixture.streams[0].onDenied());
    expect(pendingSignal.aborted).toBe(true);
    for (const key of allKeys) expect(client.getQueryData(key)).toBeUndefined();
    await act(async () => { complete(page); await request; });
    await settle();
    for (const key of allKeys) expect(client.getQueryData(key)).toBeUndefined();
    for (const key of keys) expect(client.getQueryState(key)).toBeUndefined();
    expect(client.getQueryData<ChatConversationPage>(otherScopeKey)?.items[0].project.id).toBe("project-b");
  });

  it.each(["participants.changed", "resync"])("clears retained assistant prices synchronously on %s", async change => {
    const { client } = await mount();
    const summaryKey = client.getQueryCache().getAll().find(query => query.queryKey.at(-1) === "summary" && query.queryKey[3] === "project-a")!.queryKey;
    const resultKey = [...summaryKey.slice(0, -1), "assistant-result", "result-a"];
    client.setQueryData(resultKey, { result: { commercial: { totalPaise: 123400 } } });
    act(() => fixture.streams[0].onBatch({ events: change === "resync" ? [] : [{ id: "membership-a", type: "participants.changed", projectId: "project-a", recordId: "person-a", sequence: 8, version: 2, occurredAt: "2026-10-09T08:00:00Z" }], cursor: "next", hasMore: false, resync: change === "resync" }));
    expect(client.getQueryData(resultKey)).toBeUndefined();
    await settle();
  });
  it("ignores duplicate live notifications and reconciles once after a real reconnect", async () => {
    await mount();
    const stream = fixture.streams[0];
    const initial = vi.mocked(projectChatApi.conversations).mock.calls.length;
    act(() => { stream.onStatus("live"); stream.onStatus("live"); });
    await settle();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(initial);
    act(() => stream.onStatus("reconnecting"));
    act(() => { stream.onStatus("live"); stream.onStatus("live"); });
    await settle();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(initial + 1);
  });

  it("polls only the open project's data during stream failure, and pauses while hidden", async () => {
    await mount();
    act(() => fixture.streams[0].onStatus("unavailable"));
    const listCalls = vi.mocked(projectChatApi.conversations).mock.calls.length;
    const summaryCalls = vi.mocked(projectChatApi.summary).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(projectChatApi.summary).toHaveBeenCalledTimes(summaryCalls + 3);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(listCalls);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(projectChatApi.summary).toHaveBeenCalledTimes(summaryCalls + 3);
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(listCalls);
  });

  it("ignores presence/cursor-only batches but refreshes real changes and empty resyncs", async () => {
    await mount();
    const stream = fixture.streams[0];
    const initial = vi.mocked(projectChatApi.conversations).mock.calls.length;
    act(() => {
      stream.onTyping!({ projectId: "project-a", serverTime: "2026-09-16T10:00:00Z", participants: [{ userId: "designer-a", name: "Priya", expiresAt: "2026-09-16T10:00:08Z" }] });
      stream.onBatch({ events: [], cursor: "cursor-only", hasMore: false, resync: false });
    });
    await settle();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(initial);
    let count = initial;
    for (const type of ["message.created", "assistant.changed", "issue.changed", "participants.changed", "read.changed"] satisfies ChatEventType[]) {
      act(() => stream.onBatch({ events: [{ id: type, type, projectId: "project-a", recordId: "record", sequence: ++count, version: 1, occurredAt: "2026-09-16T10:00:00Z" }], cursor: type, hasMore: false, resync: false }));
      await settle();
      expect(projectChatApi.conversations).toHaveBeenCalledTimes(count);
    }
    act(() => stream.onBatch({ events: [], cursor: "resync", hasMore: false, resync: true }));
    await settle();
    expect(projectChatApi.conversations).toHaveBeenCalledTimes(count + 1);
  });
});
