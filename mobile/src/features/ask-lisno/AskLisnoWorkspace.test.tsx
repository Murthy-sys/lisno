import { publishedPriceFixture } from "../messages/assistantPricingFixtures";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiTimeoutError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { AskLisnoEntry, AskLisnoWorkspace } from "./AskLisnoWorkspace";
import { answerFixture, directoryFixture, summaryFixture } from "./askLisnoFixtures";

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockBlocked = false;
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) }, useFocusEffect: (callback: () => void) => { const { useEffect } = require("react"); useEffect(callback, [callback]); } }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationBlocked: () => mockBlocked, useScaffoldContentBack: () => ({ visible: true, disabled: mockBlocked, onBack: mockBack }) }));
const session: AuthenticatedSession = { user: { id: "client-a", name: "Asha Example", email: "asha@example.invalid", role: "client" }, authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["ask_lisno.request", "chat.read"] } };
let post: jest.Mock;
let get: jest.Mock;
let context: ReturnType<typeof useConfiguredRuntime>;
let appStateListener: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.clearAllMocks(); mockBlocked = false;
  jest.spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions").mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  post = jest.fn().mockResolvedValue(answerFixture());
  get = jest.fn(async (path: string) => path.endsWith("/chat") ? summaryFixture(path.split("/")[2]!) : { id: path.split("/")[2] });
  context = { runtime: { api: { authenticated: { post, get } } }, environment: { environment: { id: "qa" }, generation: 1 }, session: { status: "authenticated", session, generation: 1 } } as unknown as ReturnType<typeof useConfiguredRuntime>;
  jest.mocked(useConfiguredRuntime).mockImplementation(() => context);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { appStateListener = listener; return { remove: jest.fn() }; });
});
afterEach(() => { jest.restoreAllMocks(); });
async function ask(view: Awaited<ReturnType<typeof render>>, question = "When will design be ready?") {
  await waitFor(() => expect(view.getByRole("button", { name: "My projects" })).toBeEnabled());
  await fireEvent.changeText(view.getByLabelText("Your question"), question);
  await fireEvent.press(view.getByRole("button", { name: "Send question" }));
}

it("offers one accessible icon-only client entry with an adequate touch target", async () => {
  const view = await render(<AskLisnoEntry session={session} />);
  const launcher = view.getByRole("button", { name: "Ask Lisno" });
  expect(view.getAllByRole("button")).toHaveLength(1);
  expect(launcher).toHaveProp("accessibilityHint", "Open your private project assistant");
  expect(launcher).toBeEnabled();
  expect(launcher).toHaveStyle({ width: 56, height: 56, borderRadius: 28 });
  expect(view.queryByText("Ask Lisno")).toBeNull();
  expect(view.queryByText("Projects, estimates and timelines. Just ask.")).toBeNull();
  expect(view.queryByRole("image")).toBeNull();
  await fireEvent.press(launcher);
  expect(mockPush).toHaveBeenCalledWith("/feature/ask-lisno");
});

it("encodes project context and prevents blocked entry navigation", async () => {
  const view = await render(<AskLisnoEntry session={session} projectId="project/a" />);
  await fireEvent.press(view.getByRole("button", { name: "Ask Lisno" }));
  expect(mockPush).toHaveBeenCalledWith("/feature/ask-lisno?projectId=project%2Fa");
  mockPush.mockClear();
  mockBlocked = true;
  await view.rerender(<AskLisnoEntry session={session} />);
  expect(view.getByRole("button", { name: "Ask Lisno" })).toBeDisabled();
  await fireEvent.press(view.getByRole("button", { name: "Ask Lisno" }));
  expect(mockPush).not.toHaveBeenCalled();
});

it("hides the entry when the role or operation capability denies access", async () => {
  const view = await render(<AskLisnoEntry session={{ ...session, authorization: { ...session.authorization, permissions: [] } }} />);
  expect(view.queryByRole("button", { name: "Ask Lisno" })).toBeNull();
  await view.rerender(<AskLisnoEntry session={{ ...session, user: { ...session.user, role: "designer" } }} />);
  expect(view.queryByRole("button", { name: "Ask Lisno" })).toBeNull();
});

it("renders the dedicated header and unavailable attachments without uploading or navigating", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  expect(view.getByRole("header", { name: "Ask Lisno" })).toBeTruthy();
  expect(view.getByText("Your project assistant")).toBeTruthy();
  expect(view.getByText(/Hi Asha/)).toBeTruthy();
  expect(view.getByPlaceholderText("Ask about your project...")).toBeTruthy();
  expect(view.getByText("Ask about your projects, progress, timelines or published estimates. This conversation stays private and is not posted in Project messages.")).toBeTruthy();
  expect(view.getByText("Not available yet")).toBeTruthy();
  for (const name of ["Attach file, not available yet", "Add photo, not available yet"]) {
    const control = view.getByRole("button", { name });
    expect(control).toBeDisabled();
    await fireEvent.press(control);
  }
  expect(post).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  const back = view.getByRole("button", { name: "Back" });
  expect(back).toHaveStyle({ width: 44, minHeight: 44 });
  await fireEvent.press(back);
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("grows a multiline draft within a bound and resets after sending", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  const input = view.getByLabelText("Your question");
  expect(input).toHaveStyle({ height: 28 });
  await fireEvent.changeText(input, "A longer\nproject question");
  await fireEvent(input, "contentSizeChange", { nativeEvent: { contentSize: { height: 68 } } });
  expect(input).toHaveStyle({ height: 68 });
  await fireEvent(input, "contentSizeChange", { nativeEvent: { contentSize: { height: 180 } } });
  expect(input).toHaveStyle({ height: 100 });
  await fireEvent.press(view.getByRole("button", { name: "Send question" }));
  await waitFor(() => expect(view.getByLabelText("Your question")).toHaveStyle({ height: 28 }));
});

it("reserves a full text line for the empty composer at larger system font scale", async () => {
  jest.spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useWindowDimensions").mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1.5 });
  const view = await render(<AskLisnoWorkspace session={session} />);
  expect(view.getByLabelText("Your question")).toHaveStyle({ minHeight: 42, height: 42 });
  await fireEvent.changeText(view.getByLabelText("Your question"), "A project question");
  await fireEvent.changeText(view.getByLabelText("Your question"), "");
  expect(view.getByLabelText("Your question")).toHaveStyle({ height: 42 });
});

it("maps the three reference prompts to supported text questions", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  for (const [label, message] of [["My projects", "Show my projects"], ["Project progress", "Show my project progress"], ["Published estimate", "Show my estimate"]] as const) {
    const control = view.getByRole("button", { name: label });
    await waitFor(() => expect(control).toBeEnabled());
    await fireEvent.press(control);
    await waitFor(() => expect(view.getByRole("button", { name: label })).toBeEnabled());
    expect(post.mock.calls.at(-1)![1].message).toBe(message);
  }
});

it("honors the scaffold block for draft send, prompts, retry, team and header Back", async () => {
  post.mockRejectedValue(new ApiTimeoutError());
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByRole("button", { name: "Retry" })).toBeTruthy());
  post.mockClear();
  mockBlocked = true;
  await view.rerender(<AskLisnoWorkspace session={session} />);
  for (const name of ["Send question", "My projects", "Project progress", "Published estimate", "Retry", "Message your team", "Back"]) {
    const control = view.getByRole("button", { name });
    expect(control).toBeDisabled();
    await fireEvent.press(control);
  }
  expect(post).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(view.getByLabelText("Your question").props.value).toBe("When will design be ready?");
});

it("shows an answered status only after a verified response, never while pending or failed", async () => {
  let reject!: (error: unknown) => void;
  post.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; })).mockResolvedValueOnce(answerFixture());
  const view = await render(<AskLisnoWorkspace session={session} />);
  expect(view.getByRole("button", { name: "Send question" })).toBeDisabled();
  await ask(view, "Hi");
  expect(view.getByText("Lisno is checking your request…")).toBeTruthy();
  expect(view.getByRole("button", { name: "Send question" })).toBeDisabled();
  expect(view.queryByText("Answered")).toBeNull();
  await act(() => reject(new ApiError(429, "ASSISTANT_RATE_LIMIT", "Unsafe provider error")));
  await waitFor(() => expect(view.getByText("Lisno has reached its usage limit.")).toBeTruthy());
  expect(view.getByText("Please try again later.")).toBeTruthy();
  expect(view.queryByText("Unsafe provider error")).toBeNull();
  expect(view.queryByText("Answered")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(view.getByText("Answered")).toBeTruthy());
  expect(view.getAllByLabelText("You: Hi")).toHaveLength(1);
});

it("retains Back when account access disappears and hides the team chip without permission", async () => {
  const noChat: AuthenticatedSession = { ...session, authorization: { ...session.authorization, permissions: ["ask_lisno.request"] } };
  const view = await render(<AskLisnoWorkspace session={noChat} />);
  expect(view.queryByRole("button", { name: "Message your team" })).toBeNull();
  await view.rerender(<AskLisnoWorkspace session={{ ...session, authorization: { ...session.authorization, permissions: [] } }} />);
  expect(view.getByText(/unavailable for your current account/)).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("renders verified success and opens the existing project team thread", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Your design is in progress.")).toBeTruthy());
  expect(view.getByText("Stage: Design")).toBeTruthy();
  expect(view.getByText("Source: Project status")).toBeTruthy();
  expect(post).toHaveBeenCalledWith("/client/ask-lisno", { projectId: null, contextProjectId: null, message: "When will design be ready?", history: [] }, expect.objectContaining({ timeoutMs: 100000, safeRetryCount: 0 }));
  await fireEvent.press(view.getByRole("button", { name: "Message your team" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: "project-a" } });
});

it("keeps access-check retry functional before enabling conversation actions", async () => {
  get.mockRejectedValueOnce(new Error("Network unavailable"));
  const view = await render(<AskLisnoWorkspace session={session} initialProjectId="project-a" />);
  await waitFor(() => expect(view.getByText("Your conversation access could not be checked.")).toBeTruthy());
  expect(view.getByRole("button", { name: "My projects" })).toBeDisabled();
  expect(view.getByRole("button", { name: "Send question" })).toBeDisabled();
  expect(view.getByRole("button", { name: "Back" })).toBeEnabled();
  await fireEvent.press(view.getByRole("button", { name: "Retry conversation" }));
  await waitFor(() => expect(view.getByRole("button", { name: "My projects" })).toBeEnabled());
  expect(view.getByText(/Hi Asha/)).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

it("renders exact published estimate paise and leaves unavailable amounts explicit", async () => {
  const response = answerFixture();
  response.answer.projectPricing = publishedPriceFixture({ totalPaise: 11801, subtotalPaise: null, gstPaise: 0 });
  post.mockResolvedValue(response);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Total: ₹118.01")).toBeTruthy());
  expect(view.getByText("Subtotal before GST: Unavailable")).toBeTruthy();
  expect(view.getByText("GST: ₹0.00")).toBeTruthy();
  expect(view.getByText("Estimate version 3 · Review version 2")).toBeTruthy();
  expect(view.queryByText(/in_house|Approximate addition|Main Line/)).toBeNull();
});

it("shows a social answer without an unnecessary project-team handoff", async () => {
  const response = answerFixture(null);
  response.answer = { disclosurePolicy: "project-publication-v1", kind: "no_answer", narrative: [{ text: "Hello! How can I help?", factIds: [] }], facts: [], candidates: [], missingInputs: [], commercial: null };
  post.mockResolvedValue(response);
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Hello");
  await waitFor(() => expect(view.getByText("Hello! How can I help?")).toBeTruthy());
  expect(view.queryByText("Your project team needs to confirm this request.")).toBeNull();
});

it("sends only prior questions tagged with resolved project context", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Project progress");
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  await ask(view, "What happens next?");
  expect(post.mock.calls[1]![1]).toMatchObject({ contextProjectId: "project-a", history: [{ body: "Project progress", projectId: "project-a" }] });
  expect(JSON.stringify(post.mock.calls[1]![1].history)).not.toContain("Your design is in progress");
});

it("checks initial project access, then passes its stable ID as a context hint", async () => {
  const view = await render(<AskLisnoWorkspace session={session} initialProjectId="project-a" />);
  await ask(view);
  expect(get.mock.calls.map(call => call[0])).toEqual(["/projects/project-a", "/projects/project-a/chat"]);
  expect(post.mock.calls[0]![1].projectId).toBe("project-a");
});

it("chooses duplicate-named projects by stable ID and replaces clarification in the same turn", async () => {
  const clarification = answerFixture(null);
  clarification.resolution = { state: "clarification", project: null, question: "Which home?", choices: [{ id: "project-a", name: "Lake House", detail: null }, { id: "project-b", name: "Lake House", detail: null }] };
  post.mockResolvedValueOnce(clarification).mockResolvedValueOnce(answerFixture("project-b"));
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Project progress");
  await waitFor(() => expect(view.getByText("Which home?")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "Choose Lake House, Reference roject-b" }));
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  expect(post.mock.calls[1]![1]).toMatchObject({ choiceProjectId: "project-b", message: "Project progress", history: [] });
  expect(view.getAllByLabelText("You: Project progress")).toHaveLength(1);
});

it("pages the server directory, preserves its version, and selects an explicit project", async () => {
  post.mockResolvedValueOnce(directoryFixture()).mockResolvedValueOnce(directoryFixture(20)).mockResolvedValueOnce(answerFixture("project-b"));
  const view = await render(<AskLisnoWorkspace session={session} />);
  await fireEvent.press(view.getByRole("button", { name: "My projects" }));
  await waitFor(() => expect(view.getByRole("button", { name: "Show more projects" })).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "Show more projects" }));
  await waitFor(() => expect(view.getByRole("button", { name: "View progress for Courtyard" })).toBeTruthy());
  expect(post.mock.calls[1]![1].projectListPage).toEqual({ offset: 20, version: "a".repeat(64) });
  expect(view.getByRole("button", { name: "View progress for Lake House" })).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "View progress for Courtyard" }));
  expect(post.mock.calls[2]![1]).toMatchObject({ choiceProjectId: "project-b", message: "Show my project progress" });
});

it("clears changed directory rows and refreshes from the first page", async () => {
  post.mockResolvedValueOnce(directoryFixture()).mockRejectedValueOnce(new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Changed")).mockResolvedValueOnce(directoryFixture());
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view, "Show my projects");
  await waitFor(() => expect(view.getByRole("button", { name: "Show more projects" })).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "Show more projects" }));
  await waitFor(() => expect(view.getByRole("button", { name: "Refresh projects" })).toBeTruthy());
  expect(view.queryByRole("button", { name: "View progress for Lake House" })).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Refresh projects" }));
  expect(post.mock.calls[2]![1]).not.toHaveProperty("projectListPage");
});

it("retains a timed-out question for manual retry without adding a duplicate turn", async () => {
  post.mockRejectedValueOnce(new ApiTimeoutError()).mockResolvedValueOnce(answerFixture());
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByRole("button", { name: "Retry" })).toBeTruthy());
  expect(view.getByLabelText("Your question").props.value).toBe("When will design be ready?");
  expect(post).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  expect(view.getAllByLabelText("You: When will design be ready?")).toHaveLength(1);
  expect(post).toHaveBeenCalledTimes(2);
});

it("rejects malformed answers instead of showing unchecked text", async () => {
  post.mockResolvedValue({ ...answerFixture(), answer: { ...answerFixture().answer, narrative: [{ text: "Unchecked response", factIds: ["not-real"] }] } });
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText(/could not be verified/)).toBeTruthy());
  expect(view.queryByText("Unchecked response")).toBeNull();
});

it("clears prior private data after denied access and suppresses the old project hint", async () => {
  post.mockResolvedValueOnce(answerFixture()).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
  const view = await render(<AskLisnoWorkspace session={session} initialProjectId="project-a" />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  await ask(view, "What happens next?");
  await waitFor(() => expect(view.getByText(/no longer available/)).toBeTruthy());
  expect(view.queryByText("Stage: Design")).toBeNull();
  expect(view.getByLabelText("Your question").props.value).toBe("");
  post.mockResolvedValueOnce(answerFixture(null));
  await ask(view, "Hello");
  expect(post.mock.calls[2]![1]).toMatchObject({ projectId: null, contextProjectId: null, history: [] });
});

it("hides private history on background and verifies project and membership before redisplay", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  await act(() => appStateListener("background"));
  expect(view.queryByText("Stage: Design")).toBeNull();
  let release!: (value: unknown) => void;
  get.mockImplementation((path: string) => path.endsWith("/chat") ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ id: "project-a" }));
  await act(() => appStateListener("active"));
  expect(view.queryByText("Stage: Design")).toBeNull();
  await act(() => release(summaryFixture("project-a")));
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  expect(get).toHaveBeenCalledTimes(2);
});

it("discards late answers after background cancellation", async () => {
  let release!: (value: unknown) => void;
  post.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  const signal = post.mock.calls[0]![2].signal as AbortSignal;
  await act(() => appStateListener("background"));
  expect(signal.aborted).toBe(true);
  await act(() => release(answerFixture()));
  await act(() => appStateListener("active"));
  expect(view.queryByText("Stage: Design")).toBeNull();
  expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
});

it("drops old identity results synchronously when a session changes", async () => {
  let release!: (value: unknown) => void;
  post.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  const next = { ...session, user: { ...session.user, id: "client-b", name: "Bela Example" } };
  context = { ...context, session: { ...context.session, session: next, generation: 2 } };
  await view.rerender(<AskLisnoWorkspace session={next} />);
  await act(() => release(answerFixture()));
  expect(view.queryByText("Stage: Design")).toBeNull();
  expect(view.queryByLabelText("You: When will design be ready?")).toBeNull();
  expect(view.getByText(/Hi Bela/)).toBeTruthy();
});

it("hides all history when foreground membership revalidation fails", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  await act(() => appStateListener("background"));
  get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Membership ended"));
  await act(() => appStateListener("active"));
  await waitFor(() => expect(view.getByText(/no longer available/)).toBeTruthy());
  expect(view.queryByText("Stage: Design")).toBeNull();
  expect(view.queryByLabelText("You: When will design be ready?")).toBeNull();
});

it("unmount aborts requests and permission loss removes existing history", async () => {
  const view = await render(<AskLisnoWorkspace session={session} />);
  await ask(view);
  await waitFor(() => expect(view.getByText("Stage: Design")).toBeTruthy());
  await view.rerender(<AskLisnoWorkspace session={{ ...session, authorization: { ...session.authorization, permissions: [] } }} />);
  expect(view.queryByText("Stage: Design")).toBeNull();
  expect(view.getByText(/unavailable for your current account/)).toBeTruthy();
  post.mockImplementation(() => new Promise(() => {}));
  await view.rerender(<AskLisnoWorkspace session={session} />);
  await ask(view);
  const signal = post.mock.calls.at(-1)![2].signal as AbortSignal;
  await view.unmount();
  expect(signal.aborted).toBe(true);
});
