import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ChatAssistantMessage } from "../messages/ChatAssistantMessage";
import { presentMessage } from "../messages/chatModel";
import { AskLisnoWorkspace } from "./AskLisnoWorkspace";
import { summaryFixture } from "./askLisnoFixtures";

// Captured by the backend integration suite through the real Python HTTP service.
const fixtures = JSON.parse(readFileSync(resolve(__dirname, "../../../../assistant-service/evaluation/rules-client-responses.json"), "utf8")) as {
  private: Record<"greeting" | "progress" | "timeline" | "estimate" | "clarification" | "choices" | "projectList" | "toneGreeting" | "toneConcern", unknown>;
  shared: Record<"estimate" | "restricted" | "stale" | "toneStatus", unknown>;
};

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (callback: () => void) => { const { useEffect } = require("react"); useEffect(callback, [callback]); } }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ ...jest.requireActual("react-native-safe-area-context"), useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationBlocked: () => false, useScaffoldContentBack: () => ({ visible: true, disabled: false, onBack: jest.fn() }) }));

const session: AuthenticatedSession = {
  user: { id: "client-a", name: "Asha Example", email: "asha@example.invalid", role: "client" },
  authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["ask_lisno.request", "chat.read", "chat.assistant.read", "chat.assistant.request"] }
};
let post: jest.Mock;
let get: jest.Mock;

function setRuntimeSession(currentSession: AuthenticatedSession) {
  jest.mocked(useConfiguredRuntime).mockReturnValue({
    runtime: { api: { authenticated: { post, get } } },
    environment: { environment: { id: "rules-qa" }, generation: 1 },
    session: { status: "authenticated", session: currentSession, generation: 1 }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() });
  jest.spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions").mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  post = jest.fn();
  get = jest.fn(async (path: string) => path.endsWith("/chat") ? summaryFixture(path.split("/")[2]!) : { id: path.split("/")[2] });
  setRuntimeSession(session);
});
afterEach(() => jest.restoreAllMocks());

async function ask(view: Awaited<ReturnType<typeof render>>, message: string) {
  await waitFor(() => expect(view.getByRole("button", { name: "My projects" })).toBeEnabled());
  await fireEvent.changeText(view.getByLabelText("Your question"), message);
  await fireEvent.press(view.getByRole("button", { name: "Send question" }));
}

it.each([
  ["greeting", "Hi", "Hello, Client! I can help with your project's progress, timelines, and published estimates. What would you like to know?"],
  ["progress", "Show my project progress", "Vendor reported progress: 75% reported; this is not a Client acceptance."],
  ["timeline", "Show my project timeline", "Confirmed schedule: 2026-10-16 to 2026-10-20; confirmed work dates, not a project handover commitment."],
  ["clarification", "An unsupported question", "Which project would you like me to check? Please tell me its name."]
] as const)("renders the actual private %s response as an answered turn", async (key, message, expected) => {
  post.mockResolvedValue(fixtures.private[key]);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, message);
  await waitFor(() => expect(view.getAllByText(expected).length).toBeGreaterThan(0));
  expect(view.getByText("Answered")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(view.queryByText("Your project team needs to confirm this request.")).toBeNull();
  expect(view.getByLabelText("Your question")).toHaveProp("value", "");
  expect(post).toHaveBeenCalledWith("/client/ask-lisno", expect.objectContaining({ message }), expect.any(Object));
});

it("renders the server-authorized greeting name without substituting the local session name", async () => {
  post.mockResolvedValue(fixtures.private.toneGreeting);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Hi");
  await waitFor(() => expect(view.getByText("Hello, Murthy! I can help with your project's progress, timelines, and published estimates. What would you like to know?")).toBeTruthy());
  expect(view.getAllByText(/Murthy/)).toHaveLength(1);
  expect(view.queryByText(/^Hello, Asha/)).toBeNull();
  expect(view.getByText("Answered")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
});

it("keeps an explicit concern acknowledgment with the verified project facts", async () => {
  post.mockResolvedValue(fixtures.private.toneConcern);
  const view = await render(<AskLisnoWorkspace session={session} />);
  const message = "I'm worried, may I know my project status?";
  await ask(view, message);
  await waitFor(() => expect(view.getByText("I hear your concern, Murthy.")).toBeTruthy());
  expect(view.getAllByText(/Murthy/)).toHaveLength(1);
  expect(view.getAllByText("Project status: active").length).toBeGreaterThan(0);
  expect(view.queryByText("I hear your concern, Asha.")).toBeNull();
  expect(view.getByText("Answered")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(post).toHaveBeenCalledWith("/client/ask-lisno", expect.objectContaining({ message }), expect.any(Object));
});

it("renders the actual published customer estimate with exact paise through its accessible prompt", async () => {
  post.mockResolvedValue(fixtures.private.estimate);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await fireEvent.press(view.getByRole("button", { name: "Published estimate" }));
  await waitFor(() => expect(view.getByText("Total: ₹271.40")).toBeTruthy());
  expect(view.getByRole("header", { name: "Approved estimate" })).toBeTruthy();
  expect(view.getByText("Subtotal before GST: ₹230.00")).toBeTruthy();
  expect(view.getByText("GST: ₹41.40")).toBeTruthy();
  expect(view.getByText("Estimate version 2 · Review version 1")).toBeTruthy();
  expect(post.mock.calls[0]![1]).toMatchObject({ message: "Show my estimate" });
});

it("selects an actual directory result by ID while keeping its name out of the follow-up intent", async () => {
  post.mockResolvedValueOnce(fixtures.private.projectList).mockResolvedValueOnce(fixtures.private.progress);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await fireEvent.press(view.getByRole("button", { name: "My projects" }));
  await waitFor(() => expect(view.getByRole("button", { name: "View progress for Project a, Test" })).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "View progress for Project a, Test" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1]![1]).toMatchObject({ choiceProjectId: "a", message: "Show my project progress" });
  await waitFor(() => expect(view.getAllByText("Project status: active").length).toBeGreaterThan(0));
});

it("resolves actual duplicate-named choices without changing the original question or adding a duplicate turn", async () => {
  post.mockResolvedValueOnce(fixtures.private.choices).mockResolvedValueOnce(fixtures.private.progress);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Show my project progress");
  await waitFor(() => expect(view.getByRole("button", { name: "Choose City Loft, Test, Reference a" })).toBeTruthy());
  expect(view.getByRole("button", { name: "Choose City Loft, Test, Reference c" })).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Choose City Loft, Test, Reference a" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1]![1]).toMatchObject({ choiceProjectId: "a", message: "Show my project progress", history: [] });
  expect(view.getAllByLabelText("You: Show my project progress")).toHaveLength(1);
});

function sharedQuestion(body = "Show my estimate", author = session.user) {
  return presentMessage({
    id: "rules-question", projectId: "a", body, author,
    createdAt: "2026-09-16T10:00:00.000Z", sequence: 1, version: 1, clientMessageId: "rules-question-key", attachments: [], mentions: [], replyTo: null,
    priority: "normal", issueStatus: null, capabilities: { canRaise: false, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false },
    assistant: { runId: "rules-run", generation: 1, stateVersion: 1, status: "answered", eligibleAt: "2026-09-16T10:00:00.000Z", resultId: "rules-result", checkedAt: "2026-09-16T10:00:00.000Z", notified: null, routing: "not_required", canRequest: true, failureCode: null }
  })!;
}

it.each([
  ["estimate", "Total: ₹271.40", true],
  ["restricted", "Price details are restricted to authorised project users.", false],
  ["stale", "Project information has changed since this answer. Refresh the AI answer from the original message before relying on it.", false]
] as const)("renders the actual shared %s response with its publication disclosure rules", async (key, expected, showPrice) => {
  get.mockResolvedValue(fixtures.shared[key]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(<QueryClientProvider client={client}><ChatAssistantMessage message={sharedQuestion()} onDenied={jest.fn()} /></QueryClientProvider>);
  try {
    await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" }));
    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
    expect(get).toHaveBeenCalledWith("/projects/a/chat/assistant/results/rules-result", expect.objectContaining({ safeRetryCount: 0 }));
    if (showPrice) expect(view.getByText("Estimate version 2 · Review version 1")).toBeTruthy();
    else expect(view.queryByText(/₹/)).toBeNull();
    expect(view.queryByLabelText("Your question")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
    client.clear();
  }
});

it("shows the original requester's name to a different staff viewer of the shared answer", async () => {
  const staff: AuthenticatedSession = {
    user: { id: "staff-priya", name: "Priya Staff", email: "priya@example.invalid", role: "site_manager" },
    authorization: { role: "site_manager", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["chat.read", "chat.assistant.read"] }
  };
  setRuntimeSession(staff);
  get.mockResolvedValue(fixtures.shared.toneStatus);
  const message = sharedQuestion("I'm worried, may I know my project status?", { ...session.user, name: "Murthy Example" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(<QueryClientProvider client={client}><ChatAssistantMessage message={message} onDenied={jest.fn()} /></QueryClientProvider>);
  try {
    await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" }));
    await waitFor(() => expect(view.getByText("I hear your concern, Murthy.")).toBeTruthy());
    expect(view.getAllByText(/Murthy/)).toHaveLength(1);
    expect(view.queryByText(/Priya/)).toBeNull();
    expect(view.getAllByText("Project status: active").length).toBeGreaterThan(0);
    expect(view.queryByRole("button", { name: "Refresh AI answer" })).toBeNull();
    expect(get).toHaveBeenCalledWith("/projects/a/chat/assistant/results/rules-result", expect.objectContaining({ safeRetryCount: 0 }));
    expect(post).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
    client.clear();
  }
});
