import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { askLisnoApi, type AskLisnoProjectList, type AskLisnoResponse } from "../ask-lisno/askLisnoApi";
import { AskLisnoLauncher } from "./AskLisnoLauncher";

const identity = vi.hoisted(() => ({ id: "client-a", role: "client" as "client" | "vendor", name: "Murthy Rao" as string | undefined }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: identity.id, role: identity.role, name: identity.name }, authorization: authorizationFor(identity.role) }) }));
function Location() { return <output aria-label="Current route">{useLocation().pathname}</output>; }
function response(projectId: string | null, value = "Execution in progress"): AskLisnoResponse { return { projectId, resolution: { state: projectId ? "resolved" : "account", project: projectId ? { id: projectId, name: projectId === "project-a" ? "Villa" : "Loft" } : null, question: null, choices: [] }, checkedAt: "2026-10-09T08:00:00Z", answer: { kind: "status", facts: [{ id: "stage", label: "Status", value, source: { id: "status", label: "Current information", href: null } }], candidates: [], missingInputs: [], commercial: null } }; }
function socialResponse(text: string): AskLisnoResponse { return { ...response(null), answer: { kind: "no_answer", narrative: [{ text, factIds: [] }], facts: [], candidates: [], missingInputs: [], commercial: null } }; }
const listVersion = "a".repeat(64);
function projectListResponse(items: AskLisnoProjectList["items"] = [{ id: "project-a", name: "Villa", detail: "Phase one" }], nextOffset: number | null = null, offset = 0, version = listVersion): AskLisnoResponse {
  return { ...socialResponse(items.length ? "Here are your projects. Choose one to see its progress." : "You do not have any accessible projects yet. Please contact your Lisno team."), projectList: { items, offset, nextOffset, version } };
}
function mount(path = "/client") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><button type="button">Page action</button><AskLisnoLauncher /><Location /></MemoryRouter></QueryClientProvider>);
}
async function open() { await userEvent.click(screen.getByRole("button", { name: "Ask Lisno" })); await waitFor(() => expect(screen.getByLabelText("Your question")).toHaveFocus()); }
async function ask(message = "What is the status?") { await userEvent.clear(screen.getByLabelText("Your question")); await userEvent.type(screen.getByLabelText("Your question"), message); await userEvent.click(screen.getByRole("button", { name: "Send" })); }
beforeEach(() => {
  vi.restoreAllMocks(); identity.id = "client-a"; identity.role = "client"; identity.name = "Murthy Rao"; tokenStorage.clear();
  vi.spyOn(askLisnoApi, "projects").mockResolvedValue([]);
  vi.spyOn(askLisnoApi, "verifyProject").mockResolvedValue(undefined);
  vi.spyOn(askLisnoApi, "ask").mockImplementation(async input => response(input.projectId));
});

describe("Ask Lisno conversational window", () => {
  it("personalizes the welcome without an AI request and keeps it out of request history", async () => {
    mount(); await open();
    expect(screen.getByRole("heading", {name: "Hi Murthy!"})).toBeVisible();
    expect(askLisnoApi.ask).not.toHaveBeenCalled();
    await ask("Hello"); await screen.findByText("Execution in progress");
    expect(screen.getByRole("heading", {name: "Hi Murthy!"})).toBeVisible();
    expect(askLisnoApi.ask).toHaveBeenCalledWith(expect.objectContaining({message: "Hello", history: []}), expect.any(AbortSignal));
    expect(screen.getByRole("button", {name: "Show my projects"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Timeline"})).toBeVisible();
  });
  it.each([undefined, "  "])("uses a neutral welcome when the user name is unavailable (%s)", async name => {
    identity.name = name; mount(); await open();
    expect(screen.getByRole("heading", {name: "Hi there!"})).toBeVisible();
  });
  it("expands the same conversation and restores size without a request or lost draft", async () => {
    mount(); await open();
    const dialog = screen.getByRole("dialog", {name: "Ask Lisno"});
    await userEvent.type(screen.getByLabelText("Your question"), "My unsent question");
    await userEvent.click(screen.getByRole("button", {name: "Expand Ask Lisno"}));
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveClass("ask-lisno-panel--expanded");
    expect(screen.getByLabelText("Your question")).toHaveValue("My unsent question");
    expect(screen.getByRole("button", {name: "Restore Ask Lisno size"})).toHaveFocus();
    expect(askLisnoApi.ask).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", {name: "Restore Ask Lisno size"}));
    expect(dialog).not.toHaveClass("ask-lisno-panel--expanded");
    expect(dialog).toHaveAttribute("aria-modal", "false");
  });
  it("minimizes with focus return and retains a draft and verified conversation on reopen", async () => {
    mount(); await open(); await ask("Villa status"); await screen.findByText("Execution in progress");
    await userEvent.type(screen.getByLabelText("Your question"), "Follow-up draft");
    await userEvent.click(screen.getByRole("button", {name: "Minimize Ask Lisno"}));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Ask Lisno"})).toHaveFocus();
    await open();
    expect(screen.getByText("Villa status")).toBeVisible();
    expect(screen.getByLabelText("Your question")).toHaveValue("Follow-up draft");
  });
  it("retains the original submission timestamp across a 503 retry and records response receipt separately", async () => {
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(503, "ASSISTANT_PROVIDER_ERROR", "Unavailable"));
    mount(); await open(); await ask("Retry this question");
    await screen.findByRole("alert");
    const submitted = screen.getByLabelText(/^Sent at/).getAttribute("datetime");
    expect(submitted).toBeTruthy();
    expect(screen.queryByLabelText(/^Received at/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Retry answer"}));
    await screen.findByText("Execution in progress");
    expect(screen.getByLabelText(/^Sent at/)).toHaveAttribute("datetime", submitted);
    expect(screen.getByLabelText(/^Received at/)).not.toHaveAttribute("datetime", "2026-10-09T08:00:00Z");
    expect(screen.getAllByText("Retry this question")).toHaveLength(1);
  });
  it("disables persistent quick prompts during a request and sends Timeline through the existing path", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    mount(); await open();
    await userEvent.click(screen.getByRole("button", {name: "Timeline"}));
    expect(screen.getByRole("button", {name: "Show my projects"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Send"})).toBeDisabled();
    expect(askLisnoApi.ask).toHaveBeenCalledWith(expect.objectContaining({message: "Expected timeline"}), expect.any(AbortSignal));
    await act(async () => finish(response("project-a")));
    expect(screen.getByRole("button", {name: "Show my projects"})).toBeEnabled();
  });
  it("renders a verified project card from matching status facts without adding sample metrics", async () => {
    const answer = response("project-b");
    answer.answer.facts = [{id: "project-stage", label: "Current stage", value: "Estimation", source: {id: "project-b", label: "Current stage", href: null}}, {id: "project-status", label: "Project status", value: "In progress", source: {id: "project-b", label: "Project status", href: null}}];
    answer.answer.narrative = [{text: "Your estimate is being prepared.", factIds: ["project-stage"]}];
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(answer);
    mount("/client/projects/project-a"); await open(); await ask("Show progress for Loft");
    const card = await screen.findByRole("region", {name: "Loft"});
    expect(within(card).getByText("Estimation")).toBeVisible();
    expect(within(card).getByText("In progress")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(card).queryByText(/60%|24 items|3 team members/)).not.toBeInTheDocument();
    expect(screen.getByText("Sources and details")).toBeVisible();
  });
  it("keeps the resolved second project visible on a non-status estimate follow-up", async () => {
    const price = response("project-b");
    price.answer.kind = "price";
    price.answer.narrative = [{text: "Please provide the room and quantity for this addition.", factIds: []}];
    price.answer.facts = [];
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(response("project-a")).mockResolvedValueOnce(price);
    mount(); await open(); await ask("Villa progress"); await screen.findByText("Execution in progress");
    await ask("What would this addition cost in Loft?");
    await screen.findByText("Please provide the room and quantity for this addition.");
    expect(screen.getByText("Loft", {selector: ".ask-lisno-panel__project-name"})).toBeVisible();
    expect(screen.queryByRole("region", {name: "Loft"})).not.toBeInTheDocument();
  });
  it("opens a non-modal popup without querying a project list and sends the page only as a hint", async () => {
    mount("/client/projects/project-a"); await open();
    expect(screen.getByRole("dialog", { name: "Ask Lisno" })).toHaveAttribute("aria-modal", "false");
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/client/projects/project-a");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(askLisnoApi.projects).not.toHaveBeenCalled(); expect(askLisnoApi.verifyProject).not.toHaveBeenCalled();
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Page action" })); expect(screen.getByRole("button", { name: "Page action" })).toHaveFocus();
    await ask(); expect(await screen.findByText("Execution in progress")).toBeVisible();
    expect(askLisnoApi.ask).toHaveBeenCalledWith({ projectId: "project-a", contextProjectId: null, message: "What is the status?", history: [] }, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "Message your team" })).toHaveAttribute("href", "/projects/project-a/messages");
  });
  it("uses server-resolved project scope and history lineage for follow-ups and named switches", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(response("project-a", "Villa progress")).mockResolvedValueOnce(response("project-b", "Loft progress")).mockResolvedValueOnce(response("project-b", "Loft timeline"));
    mount("/client/projects/page-hint"); await open(); await ask("Villa status"); await screen.findByText("Villa progress");
    await ask("What about Loft?"); await screen.findByText("Loft progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: "page-hint", contextProjectId: "project-a", message: "What about Loft?", history: [{ body: "Villa status", projectId: "project-a" }] }, expect.any(AbortSignal));
    await ask("And the timeline?"); await screen.findByText("Loft timeline");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ contextProjectId: "project-b", history: [{ body: "Villa status", projectId: "project-a" }, { body: "What about Loft?", projectId: "project-b" }] }), expect.any(AbortSignal));
  });
  it("renders a greeting without a project picker, empty source disclosure or team-confirmation boilerplate", async () => {
    const greeting = "Hello! How can I help you today?";
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(socialResponse(greeting));
    mount(); await open(); await ask("Hi");
    expect(await screen.findByText(greeting)).toBeVisible();
    expect(screen.getAllByText(greeting)).toHaveLength(1);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sources and details|Checked |team needs to confirm|Which project/)).not.toBeInTheDocument();
    expect(askLisnoApi.projects).not.toHaveBeenCalled();
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: null, contextProjectId: null, message: "Hi", history: [] }, expect.any(AbortSignal));
  });
  it("retains the last resolved project through thanks for the next authorized follow-up", async () => {
    const thanks = "You're welcome!";
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(response("project-a", "Villa progress")).mockResolvedValueOnce(socialResponse(thanks)).mockResolvedValueOnce(response("project-a", "Villa timeline"));
    mount(); await open(); await ask("Villa status"); await screen.findByText("Villa progress");
    await ask("Thanks"); expect(await screen.findByText(thanks)).toBeVisible();
    expect(screen.getAllByText(thanks)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Message your team" })).toHaveAttribute("href", "/projects/project-a/messages");
    await ask("And the timeline?"); await screen.findByText("Villa timeline");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: null, contextProjectId: "project-a", message: "And the timeline?", history: [{ body: "Villa status", projectId: "project-a" }, { body: "Thanks", projectId: null }] }, expect.any(AbortSignal));
  });
  it("preserves legacy context replacement when a response has no resolution metadata", async () => {
    const legacy = socialResponse("You're welcome!"); delete legacy.resolution;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(response("project-a", "Villa progress")).mockResolvedValueOnce(legacy).mockResolvedValueOnce(response(null, "Account details"));
    mount(); await open(); await ask("Villa status"); await screen.findByText("Villa progress");
    await ask("Thanks"); await screen.findByText("You're welcome!");
    expect(screen.getByRole("link", { name: "Message your team" })).toHaveAttribute("href", "/project-messages");
    await ask("My account details"); await screen.findByText("Account details");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ contextProjectId: null }), expect.any(AbortSignal));
  });
  it("resubmits the original question with the selected clarification ID", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...response(null), resolution: { state: "clarification", project: null, question: "Which Villa do you mean?", choices: [{ id: "project-a", name: "Villa", detail: "Phase one" }, { id: "project-b", name: "Villa", detail: "Phase two" }] } }).mockResolvedValueOnce(response("project-b"));
    mount(); await open(); await ask("When will Villa finish?");
    await screen.findByText("Which Villa do you mean?"); await userEvent.click(screen.getByRole("button", { name: "Villa Phase two" }));
    await screen.findByText("Execution in progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: null, contextProjectId: null, choiceProjectId: "project-b", message: "When will Villa finish?", history: [] }, expect.any(AbortSignal));
    expect(screen.getAllByText("When will Villa finish?")).toHaveLength(1);
  });
  it("carries the pending question as untrusted context when a project name is typed after clarification", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...response(null), resolution: { state: "clarification", project: null, question: "Which project do you mean?", choices: [] } }).mockResolvedValueOnce(response("project-a"));
    mount(); await open(); await ask("When will my project finish?"); await screen.findByText("Which project do you mean?");
    await ask("Villa"); await screen.findByText("Execution in progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Villa", history: [{ body: "When will my project finish?", projectId: null }] }), expect.any(AbortSignal));
  });
  it("offers short suggestions and supports account help without projects", async () => {
    mount(); await open(); await userEvent.click(screen.getByRole("button", { name: "Project progress" })); await screen.findByText("Execution in progress");
    expect(askLisnoApi.ask).toHaveBeenCalledWith(expect.objectContaining({ message: "Project progress", projectId: null }), expect.any(AbortSignal));
  });
  it("ignores and aborts an in-flight answer on close", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await open(); await ask(); expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[0][1].aborted).toBe(true);
    await act(async () => finish(response("project-a", "Outdated answer"))); await open();
    expect(screen.queryByText("Outdated answer")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Retry answer" })).toBeEnabled();
  });
  it("does not steal page focus when a background answer completes", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await open(); await ask();
    const pageAction = screen.getByRole("button", { name: "Page action" }); await userEvent.click(pageAction);
    await act(async () => finish(response("project-a")));
    expect(await screen.findByText("Execution in progress")).toBeVisible(); expect(pageAction).toHaveFocus();
  });
  it("clears history after an account switch", async () => {
    const { rerender } = mount(); await open(); await ask("My private question"); await screen.findByText("Execution in progress");
    identity.id = "client-b"; identity.name = "Ananya Kumar";
    rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AskLisnoLauncher /></MemoryRouter></QueryClientProvider>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); await open(); expect(screen.queryByText("My private question")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Hi Ananya!"})).toBeVisible();
    expect(screen.queryByText("Hi Murthy!")).not.toBeInTheDocument();
  });
  it("preserves the draft after an unavailable response and retries without duplicating a turn", async () => {
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(503, "AI_UNAVAILABLE", "Unavailable"));
    mount(); await open(); await ask("Account help"); expect(await screen.findByRole("alert")).toHaveTextContent("could not answer");
    expect(screen.getByLabelText("Your question")).toHaveValue("Account help");
    await userEvent.click(screen.getByRole("button", { name: "Retry answer" })); expect(await screen.findByText("Execution in progress")).toBeVisible();
    expect(screen.getAllByText("Account help")).toHaveLength(1); expect(screen.getByLabelText("Your question")).toHaveValue("");
  });
  it("clears private context when access is revoked and stops reusing the revoked page hint", async () => {
    mount("/client/projects/project-a"); await open(); await ask("First question"); await screen.findByText("Execution in progress");
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
    await ask("Second question"); await screen.findByText(/no longer available for your current access/);
    expect(screen.queryByText("First question")).not.toBeInTheDocument(); expect(screen.queryByText("Execution in progress")).not.toBeInTheDocument();
    await ask("Account help"); await screen.findByText("Execution in progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null, contextProjectId: null, history: [] }), expect.any(AbortSignal));
  });
  it("sends with Enter, permits Shift+Enter and does not submit during IME composition", async () => {
    mount(); await open(); const field = screen.getByLabelText("Your question"); await userEvent.type(field, "Villa");
    fireEvent.keyDown(field, { key: "Enter", isComposing: true }); expect(askLisnoApi.ask).not.toHaveBeenCalled();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}status"); expect(field).toHaveValue("Villa\nstatus"); expect(askLisnoApi.ask).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}"); await screen.findByText("Execution in progress"); expect(askLisnoApi.ask).toHaveBeenCalledTimes(1);
  });
  it("closes with Escape and restores focus, while Escape on the page leaves it open", async () => {
    mount(); await open(); const launcher = screen.getByRole("button", { name: "Ask Lisno" });
    await userEvent.click(screen.getByRole("button", { name: "Page action" })); await userEvent.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeVisible();
    screen.getByLabelText("Your question").focus(); await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(launcher).toHaveFocus();
  });
  it("preserves temporary history on close and reopen", async () => {
    mount(); await open(); await ask("Temporary question"); await screen.findByText("Execution in progress");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close Ask Lisno" })); await open(); expect(screen.getByText("Temporary question")).toBeVisible();
  });
  it.each([401, 403, 404])("hides cached project answers on reopen and clears them after access denial %s", async (status) => {
    mount("/client/projects/project-a"); await open(); await ask("Private Villa question"); await screen.findByText("Execution in progress");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    let reject!: (reason: unknown) => void;
    vi.mocked(askLisnoApi.verifyProject).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await open(); expect(screen.getByText("Checking access to your conversation…")).toBeVisible();
    expect(screen.queryByText("Execution in progress")).not.toBeInTheDocument(); expect(screen.queryByText("Private Villa question")).not.toBeInTheDocument();
    expect(askLisnoApi.verifyProject).toHaveBeenCalledWith("project-a", expect.any(AbortSignal));
    await act(async () => reject(new ApiError(status, "FORBIDDEN", "Denied")));
    expect(await screen.findByText(/no longer available for your current access/)).toBeVisible();
    await ask("Account help"); await screen.findByText("Execution in progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null, contextProjectId: null, history: [] }), expect.any(AbortSignal));
  });
  it("keeps cached answers hidden after a verification network error until retry succeeds", async () => {
    mount("/client/projects/project-a"); await open(); await ask("Private Villa question"); await screen.findByText("Execution in progress");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    vi.mocked(askLisnoApi.verifyProject).mockRejectedValueOnce(new Error("Offline"));
    await open(); expect(await screen.findByText("Your conversation access could not be checked.")).toBeVisible();
    expect(screen.queryByText("Execution in progress")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Retry conversation" }));
    expect(await screen.findByText("Execution in progress")).toBeVisible(); expect(screen.getByText("Private Villa question")).toBeVisible();
    expect(askLisnoApi.verifyProject).toHaveBeenCalledTimes(2); expect(askLisnoApi.projects).not.toHaveBeenCalled();
  });
  it("aborts old reopen verification and cannot resurrect answers after a later denial", async () => {
    mount("/client/projects/project-a"); await open(); await ask("Private Villa question"); await screen.findByText("Execution in progress");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    let finish!: () => void;
    vi.mocked(askLisnoApi.verifyProject).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
    await open(); await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    expect(vi.mocked(askLisnoApi.verifyProject).mock.calls[0][1].aborted).toBe(true);
    await open(); await screen.findByText(/no longer available for your current access/);
    await act(async () => finish()); expect(screen.queryByText("Execution in progress")).not.toBeInTheDocument(); expect(screen.queryByText("Private Villa question")).not.toBeInTheDocument();
  });
  it("revalidates only distinct projects referenced by cached answers or clarification choices", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...response(null), resolution: { state: "clarification", project: null, question: "Which Villa?", choices: [{ id: "project-a", name: "Villa one", detail: null }, { id: "project-b", name: "Villa two", detail: null }] } });
    mount(); await open(); await ask("Villa progress"); await screen.findByText("Which Villa?");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" })); await open(); await screen.findByText("Which Villa?");
    expect(vi.mocked(askLisnoApi.verifyProject).mock.calls.map(call => call[0])).toEqual(["project-a", "project-b"]); expect(askLisnoApi.projects).not.toHaveBeenCalled();
  });
  it("does not expose the launcher to vendor accounts", () => { identity.role = "vendor"; mount(); expect(screen.queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument(); });
});

describe("Ask Lisno project directory", () => {
  it("brands the launcher, header and AI reply with the Lisno mark while retaining text if the image fails", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(socialResponse("Hello!"));
    mount();
    expect(screen.getByRole("button", { name: "Ask Lisno" }).querySelector("img")).toHaveAttribute("src", "/lisno-chat-mark.svg");
    await open(); await ask("Hi"); await screen.findByText("Hello!");
    const headerMark = document.querySelector(".ask-lisno-panel__header .lisno-chat-mark")!;
    const speakerMark = document.querySelector(".ask-lisno-panel__speaker .lisno-chat-mark")!;
    expect(headerMark).toHaveAttribute("alt", ""); expect(speakerMark).toHaveAttribute("aria-hidden", "true");
    fireEvent.error(speakerMark); expect(screen.getByText("Lisno AI")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Ask Lisno" })).toBeVisible();
  });
  it("offers Show my projects and renders an honest empty response without a picker", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse([]));
    mount("/client/projects/page-hint"); await open();
    await userEvent.click(screen.getByRole("button", { name: "Show my projects" }));
    expect(await screen.findByText(/do not have any accessible projects/)).toBeVisible();
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: "page-hint", contextProjectId: null, message: "Show my projects", history: [] }, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("selects duplicate project names by stable ID as a new keyboard-accessible turn and scopes the follow-up", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse([{ id: "project-a", name: "Villa", detail: "Phase one" }, { id: "project-b", name: "Villa", detail: "Phase two" }])).mockResolvedValueOnce(response("project-b", "Phase two progress")).mockResolvedValueOnce(response("project-b", "Phase two timeline"));
    mount("/client/projects/page-hint"); await open(); await ask("show all projects");
    const select = await screen.findByRole("button", { name: "View progress for Villa, Phase two" });
    select.focus(); await userEvent.keyboard("{Enter}"); await screen.findByText("Phase two progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: "page-hint", contextProjectId: null, choiceProjectId: "project-b", message: "Show progress for Villa", history: [{ body: "show all projects", projectId: null }] }, expect.any(AbortSignal));
    expect(screen.getAllByText("show all projects")).toHaveLength(1);
    expect(screen.getByText("Show progress for Villa")).toBeVisible();
    await ask("When will it finish?"); await screen.findByText("Phase two timeline");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ contextProjectId: "project-b", history: [{ body: "show all projects", projectId: null }, { body: "Show progress for Villa", projectId: "project-b" }] }), expect.any(AbortSignal));
  });
  it("restores the composer after a selected progress button loses focus while disabled, then returns Escape to the launcher", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await open(); await ask("show all projects");
    const selected = await screen.findByRole("button", { name: "View progress for Villa, Phase one" });
    selected.focus(); await userEvent.keyboard("{Enter}"); expect(selected).toBeDisabled();
    // JSDOM cannot blur an already-disabled button; simulate the browser's
    // automatic blur without a deliberate outside focus or pointer event.
    selected.removeAttribute("disabled"); selected.blur(); selected.setAttribute("disabled", "");
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(response("project-a", "Selected progress")));
    await screen.findByText("Selected progress"); expect(screen.getByLabelText("Your question")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Ask Lisno" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Lisno" })).toHaveFocus();
  });
  it("does not reclaim body focus after deliberate outside interaction while a selected project loads", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await open(); await ask("show all projects");
    await userEvent.click(await screen.findByRole("button", { name: "View progress for Villa, Phase one" }));
    const pageAction = screen.getByRole("button", { name: "Page action" });
    await userEvent.click(pageAction); pageAction.blur(); expect(document.activeElement).toBe(document.body);
    await act(async () => finish(response("project-a", "Selected progress")));
    await screen.findByText("Selected progress"); expect(document.activeElement).toBe(document.body);
  });
  it("pages an older list inline using its original message, deduplicates IDs and preserves later conversation context", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ id: `project-${index}`, name: `Project ${index}`, detail: "North site" }));
    const longName = "A long project name with multiple phases and a shared family residence";
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(response("project-a", "Villa progress")).mockResolvedValueOnce(projectListResponse(firstPage, 20)).mockResolvedValueOnce(socialResponse("You're welcome!")).mockResolvedValueOnce(projectListResponse([firstPage[19], { id: "project-20", name: longName, detail: "West site" }], null, 20)).mockResolvedValueOnce(response("project-a", "Villa timeline"));
    mount(); await open(); await ask("Villa progress"); await screen.findByText("Villa progress", { selector: "dd" });
    await ask("Please list my projects"); await screen.findByRole("button", { name: "Show more" });
    await ask("Thanks"); await screen.findByText("You're welcome!");
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByRole("button", { name: `View progress for ${longName}, West site` });
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: null, contextProjectId: null, message: "Please list my projects", history: [], projectListPage: { offset: 20, version: listVersion } }, expect.any(AbortSignal));
    expect(within(screen.getByRole("region", { name: "Your projects" })).getAllByRole("listitem")).toHaveLength(21);
    expect(screen.getAllByText("Please list my projects")).toHaveLength(1);
    expect(screen.getByText("You're welcome!")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message your team" })).toHaveAttribute("href", "/projects/project-a/messages");
    await ask("When will it finish?"); await screen.findByText("Villa timeline");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ contextProjectId: "project-a", history: [{ body: "Villa progress", projectId: "project-a" }, { body: "Please list my projects", projectId: null }, { body: "Thanks", projectId: null }] }), expect.any(AbortSignal));
  });
  it.each([null, "Same location"])("distinguishes same-name rows with %s details after paging even when their short ID suffixes collide", async detail => {
    const first = { id: "project-A-12345678", name: "Villa", detail };
    const second = { id: "project-B-12345678", name: "Villa", detail };
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse([first], 20)).mockResolvedValueOnce(projectListResponse([second, { id: "unique-project", name: "Loft", detail }], null, 20)).mockResolvedValueOnce(response(second.id, "Second Villa progress"));
    mount(); await open(); await ask("show all projects");
    await screen.findByRole("button", { name: `View progress for Villa${detail ? `, ${detail}` : ""}` });
    expect(screen.queryByText(/^Reference /)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    const firstName = `View progress for Villa${detail ? `, ${detail}` : ""}, Reference A-12345678`;
    const secondName = `View progress for Villa${detail ? `, ${detail}` : ""}, Reference B-12345678`;
    expect(await screen.findByRole("button", { name: firstName })).toBeVisible();
    const selected = screen.getByRole("button", { name: secondName });
    expect(screen.getByText("Reference A-12345678")).toBeVisible(); expect(screen.getByText("Reference B-12345678")).toBeVisible();
    expect(screen.getAllByText(/^Reference /)).toHaveLength(2);
    expect(screen.getByRole("button", { name: `View progress for Loft${detail ? `, ${detail}` : ""}` })).toBeVisible();
    selected.focus(); await userEvent.keyboard("{Enter}"); await screen.findByText("Second Villa progress");
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ choiceProjectId: second.id, message: "Show progress for Villa" }), expect.any(AbortSignal));
  });
  it("retries failed pagination locally without duplicating rows or creating an empty answer", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(projectListResponse([{ id: "project-b", name: "Loft", detail: "Phase two" }], null, 20));
    mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Projects could not be loaded");
    expect(screen.getByRole("button", { name: "View progress for Villa, Phase one" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry loading projects" }));
    await screen.findByRole("button", { name: "View progress for Loft, Phase two" });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("show all projects")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(["error", "mismatched-version"])("clears stale selectable rows on %s and refreshes the original answer from page one", async kind => {
    const api = vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20));
    if (kind === "error") api.mockRejectedValueOnce(new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Changed"));
    else api.mockResolvedValueOnce(projectListResponse([{ id: "project-stale", name: "Stale project", detail: "Old site" }], null, 20, "b".repeat(64)));
    api.mockResolvedValueOnce(projectListResponse([{ id: "project-current", name: "Current project", detail: "New site" }], null, 0, "b".repeat(64)));
    mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    await screen.findByText(/Your project list has changed/);
    expect(screen.queryByRole("button", { name: /View progress/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Villa")).not.toBeInTheDocument(); expect(screen.queryByText("Stale project")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh projects" }));
    await screen.findByRole("button", { name: "View progress for Current project, New site" });
    expect(askLisnoApi.ask).toHaveBeenLastCalledWith({ projectId: null, contextProjectId: null, message: "show all projects", history: [] }, expect.any(AbortSignal));
    expect(screen.getAllByText("show all projects")).toHaveLength(1);
  });
  it("clears the conversation if access is revoked while paging", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
    mount("/client/projects/project-a"); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    await screen.findByText(/no longer available for your current access/);
    expect(screen.queryByText("Villa")).not.toBeInTheDocument(); expect(screen.queryByRole("region", { name: "Your projects" })).not.toBeInTheDocument();
    await ask("Hi"); expect(askLisnoApi.ask).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null, contextProjectId: null, history: [] }), expect.any(AbortSignal));
  });
  it("aborts a page on close and ignores a late result after reopening", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(screen.getByText("Loading projects…")).toBeVisible(); expect(screen.getByRole("button", { name: "Show more" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][1].aborted).toBe(true);
    await open(); await screen.findByRole("button", { name: "View progress for Villa, Phase one" });
    await act(async () => finish(projectListResponse([{ id: "project-old", name: "Late project", detail: "Old site" }], null, 20)));
    expect(screen.queryByText("Late project")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Show more" })).toBeEnabled();
  });
  it("supersedes a pending page with a new question without allowing it to overwrite the answer", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response("project-a", "Fresh answer"));
    mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    await ask("Villa progress"); await screen.findByText("Fresh answer");
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][1].aborted).toBe(true);
    await act(async () => finish(projectListResponse([{ id: "project-old", name: "Late project", detail: "Old site" }], null, 20)));
    expect(screen.getByText("Fresh answer")).toBeVisible(); expect(screen.queryByText("Late project")).not.toBeInTheDocument();
  });
  it("aborts pending directory work and drops names on an account switch", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    identity.id = "client-b"; rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AskLisnoLauncher /></MemoryRouter></QueryClientProvider>);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][1].aborted).toBe(true);
    await act(async () => finish(projectListResponse([{ id: "project-old", name: "Private project", detail: "Old site" }], null, 20)));
    await open(); expect(screen.queryByText("Villa")).not.toBeInTheDocument(); expect(screen.queryByText("Private project")).not.toBeInTheDocument();
  });
  it("checks every displayed page ID before showing reopened lists and clears all cached rows on denial", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(projectListResponse(undefined, 20)).mockResolvedValueOnce(projectListResponse([{ id: "project-b", name: "Loft", detail: "Phase two" }], null, 20));
    mount(); await open(); await ask("show all projects"); await userEvent.click(await screen.findByRole("button", { name: "Show more" })); await screen.findByText("Loft");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask Lisno" }));
    let reject!: (reason: unknown) => void;
    vi.mocked(askLisnoApi.verifyProject).mockImplementation(id => id === "project-b" ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve());
    await open(); expect(screen.queryByText("Villa")).not.toBeInTheDocument(); expect(screen.queryByText("Loft")).not.toBeInTheDocument();
    expect(vi.mocked(askLisnoApi.verifyProject).mock.calls.map(call => call[0])).toEqual(["project-a", "project-b"]);
    await act(async () => reject(new ApiError(403, "FORBIDDEN", "Denied")));
    await screen.findByText(/no longer available for your current access/);
    expect(screen.queryByRole("region", { name: "Your projects" })).not.toBeInTheDocument();
  });
});
