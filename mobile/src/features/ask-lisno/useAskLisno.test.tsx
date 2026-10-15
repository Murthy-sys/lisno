import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { ApiTimeoutError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { answerFixture, directoryFixture, summaryFixture } from "./askLisnoFixtures";
import { useAskLisno } from "./useAskLisno";
import { publishedPriceFixture } from "../messages/assistantPricingFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  }
}));

let state: ReturnType<typeof useAskLisno>;
let post: jest.Mock;
let runtime: MobileRuntime;
let appStateListener: (next: AppStateStatus) => void;
const originalAppState = AppState.currentState;
const firstTime = "2026-10-15T08:03:00.000Z";
const laterTime = "2026-10-15T08:08:00.000Z";

function Harness() {
  state = useAskLisno(runtime);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(firstTime));
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
  post = jest.fn().mockResolvedValue(answerFixture());
  const get = jest.fn(async (path: string) => path.endsWith("/chat") ? summaryFixture(path.split("/")[2]!) : { id: path.split("/")[2] });
  runtime = { api: { authenticated: { post, get } } } as unknown as MobileRuntime;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(AppState, "currentState", { configurable: true, value: originalAppState });
});

it("discards private estimate amounts when backgrounded even after membership checks succeed", async () => {
  const response = answerFixture(); response.answer.projectPricing = publishedPriceFixture();
  post.mockResolvedValue(response);
  await render(<Harness />);
  await act(async () => state.send({ suggestion: "Estimate total" }));
  expect(state.turns[0]?.response?.answer.projectPricing?.totalPaise).toBe(973500);
  await act(() => appStateListener("background"));
  expect(state.turns[0]?.response?.answer.projectPricing).toBeNull();
  await act(() => appStateListener("active"));
  expect(state.access).toBe("ready");
  expect(state.turns[0]?.pricingNeedsRefresh).toBe(true);
  expect(state.turns[0]?.response?.answer.projectPricing).toBeNull();
  expect(post).toHaveBeenCalledTimes(1);
});

it("retains the original question time and identity on retry without adding metadata to the private POST", async () => {
  post.mockRejectedValueOnce(new ApiTimeoutError());
  await render(<Harness />);
  await act(async () => state.send({ suggestion: "Project progress" }));
  const failed = state.turns[0]!;
  expect(failed).toMatchObject({ id: 1, createdAt: firstTime, errorKind: "timeout" });
  expect(state.draft).toBe("Project progress");
  jest.setSystemTime(new Date(laterTime));

  // Sending the retained draft follows the same retry path as the explicit button.
  await act(async () => state.send());
  expect(state.turns).toHaveLength(1);
  expect(state.turns[0]).toMatchObject({ id: failed.id, createdAt: firstTime, response: { checkedAt: answerFixture().checkedAt } });
  expect(state.turns[0]).not.toHaveProperty("errorKind");
  expect(post.mock.calls.map(call => call[1])).toEqual([
    { projectId: null, contextProjectId: null, message: "Project progress", history: [] },
    { projectId: null, contextProjectId: null, message: "Project progress", history: [] }
  ]);

  await act(async () => state.send({ suggestion: "What happens next?" }));
  expect(state.turns[1]).toMatchObject({ id: 2, createdAt: laterTime });
  expect(post.mock.calls[2]![1].history).toEqual([{ body: "Project progress", projectId: "project-a" }]);
});

it("keeps question metadata when a project clarification is resolved or a directory is paged", async () => {
  const clarification = answerFixture(null);
  clarification.resolution = { state: "clarification", project: null, question: "Which project?", choices: [{ id: "project-a", name: "Lake House", detail: null }] };
  post.mockResolvedValueOnce(clarification).mockResolvedValueOnce(answerFixture()).mockResolvedValueOnce(directoryFixture()).mockResolvedValueOnce(directoryFixture(20));
  await render(<Harness />);
  await act(async () => state.send({ suggestion: "Project progress" }));
  const question = state.turns[0]!;
  jest.setSystemTime(new Date(laterTime));
  await act(async () => state.send({ retry: question, choiceProjectId: "project-a" }));
  expect(state.turns).toHaveLength(1);
  expect(state.turns[0]).toMatchObject({ id: question.id, createdAt: firstTime, choiceProjectId: "project-a" });

  await act(async () => state.send({ suggestion: "Show my projects" }));
  const directory = state.turns[1]!;
  jest.setSystemTime(new Date("2026-10-15T08:12:00.000Z"));
  await act(async () => state.loadProjects(directory));
  expect(state.turns[1]).toMatchObject({ id: directory.id, createdAt: laterTime });
  expect(state.turns[1]!.response?.projectList?.items.map(item => item.id)).toEqual(["project-a", "project-b"]);
});

it("marks a cancelled pending answer as paused, rejects its late result and preserves its time for manual retry", async () => {
  let release!: (value: unknown) => void;
  post.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await render(<Harness />);
  await act(() => { void state.send({ suggestion: "Project progress" }); });
  expect(state.busy).toBe(true);
  const pending = state.turns[0]!;
  await act(async () => state.send({ suggestion: "Another question" }));
  expect(post).toHaveBeenCalledTimes(1);

  await act(() => appStateListener("background"));
  expect(post.mock.calls[0]![2].signal.aborted).toBe(true);
  expect(state.access).toBe("hidden");
  expect(state.turns[0]).toMatchObject({ id: pending.id, createdAt: firstTime, errorKind: "paused" });
  await act(() => release(answerFixture()));
  expect(state.turns[0]).not.toHaveProperty("response");

  jest.setSystemTime(new Date(laterTime));
  await act(() => appStateListener("active"));
  expect(state.access).toBe("ready");
  await act(async () => state.send({ retry: state.turns[0]! }));
  expect(state.turns).toHaveLength(1);
  expect(state.turns[0]).toMatchObject({ id: pending.id, createdAt: firstTime, response: answerFixture() });
  expect(state.turns[0]).not.toHaveProperty("errorKind");
});
