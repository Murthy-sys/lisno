import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { ProjectChatProvider, useChatProjectRegistration, useProjectChat } from "./ProjectChatProvider";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { chatTestSummary } from "./projectChatFixtures";
import type { runProjectChatStream } from "./projectChatStream";
import type { ChatEventType } from "./projectChatTypes";

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
  useQuery({ queryKey: [...chatKeys.list(chat.scope), 0], queryFn: ({ signal }) => projectChatApi.conversations(0, signal) });
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
beforeEach(() => {
  vi.useFakeTimers();
  fixture.streams = [];
  tokenStorage.set("synthetic-refresh-session");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(projectChatApi, "summary").mockResolvedValue(chatTestSummary());
  vi.spyOn(projectChatApi, "conversations").mockResolvedValue({ items: [{ ...chatTestSummary(), lastMessageAt: null }], pagination: { offset: 0, limit: 30, total: 1, hasMore: false } });
});
afterEach(() => vi.useRealTimers());

describe("project stream query scheduling", () => {
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
