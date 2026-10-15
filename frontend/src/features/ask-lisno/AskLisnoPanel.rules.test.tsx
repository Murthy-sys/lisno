import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { AskLisnoPanel } from "./AskLisnoPanel";
import { askLisnoApi, type AskLisnoResponse } from "./askLisnoApi";

const greeting: AskLisnoResponse = {
  projectId: null, checkedAt: "2026-10-15T00:00:00Z",
  resolution: { state: "account", project: null, choices: [], question: null },
  answer: { disclosurePolicy: "project-publication-v1", kind: "no_answer", facts: [], candidates: [], missingInputs: [], commercial: null,
    narrative: [{ text: "Hello! I can help with your project's progress, timelines, and published estimates. What would you like to know?", factIds: [] }] }
};

function panel(scope = "client-a", routeProjectId?: string) {
  return <MemoryRouter><AskLisnoPanel open onClose={vi.fn()} scope={scope} routeProjectId={routeProjectId} displayName="Test Client" returnFocusRef={createRef<HTMLButtonElement>()} /></MemoryRouter>;
}
function send(message: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}
beforeEach(() => {
  vi.spyOn(askLisnoApi, "ask").mockResolvedValue(greeting);
  vi.spyOn(askLisnoApi, "verifyProject").mockResolvedValue(undefined);
});

describe("Ask Lisno supported project questions", () => {
  it("describes its supported scope and renders a greeting as a normal private reply", async () => {
    render(panel());
    expect(screen.getByRole("dialog", { name: "Ask Lisno" })).toHaveAttribute("aria-modal", "false");
    expect(screen.getByText("Your project assistant")).toBeVisible();
    expect(screen.getByText(/Ask about your projects, progress, timelines or published estimates/)).toHaveTextContent("This conversation stays private and is not posted in Project messages.");
    expect(screen.queryByText(/Ask me anything|vendors|materials/)).not.toBeInTheDocument();
    send("Hi");
    const conversation = screen.getByRole("log", { name: "Private conversation" });
    expect(await within(conversation).findByText(greeting.answer.narrative![0].text)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
    expect(screen.queryByText(/team needs to confirm/)).not.toBeInTheDocument();
  });

  it.each([
    ["Show my projects", "Show my projects"],
    ["Project progress", "Show my project progress"],
    ["Timeline", "Show my project timeline"],
    ["Published estimate", "Show my estimate"]
  ])("sends the supported %s prompt with current page scope", async (label, message) => {
    render(panel("client-a", "project-b"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your question" })).toHaveFocus());
    const button = screen.getByRole("button", { name: label });
    button.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText(greeting.answer.narrative![0].text);
    expect(askLisnoApi.ask).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message, projectId: "project-b", contextProjectId: null }), expect.any(AbortSignal));
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveFocus();
  });

  it("renders unsupported-question clarification without retry or unavailable state", async () => {
    const question = "Please ask about project progress, timelines or your published estimate.";
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...greeting, answer: { ...greeting.answer, kind: "clarification", narrative: [], missingInputs: [question] } });
    render(panel()); send("Tell me about the weather");
    expect(await screen.findByText(question)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Project progress" }));
    await waitFor(() => expect(askLisnoApi.ask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my project progress", history: [{ body: "Tell me about the weather", projectId: null }] });
  });

  it("keeps the original question when a project clarification is selected by keyboard", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...greeting,
      resolution: { state: "clarification", project: null, question: "Which project would you like to discuss?", choices: [{ id: "project-a", name: "North home", detail: "Design" }, { id: "project-b", name: "South home", detail: "Execution" }] }
    });
    render(panel()); send("Show my estimate");
    const choice = await screen.findByRole("button", { name: "South home Execution" });
    choice.focus(); await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(askLisnoApi.ask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my estimate", choiceProjectId: "project-b", history: [] });
    expect(screen.getAllByText("Show my estimate")).toHaveLength(1);
  });

  it("uses a project ID and canonical progress request for a directory follow-up", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce({ ...greeting, projectList: { items: [{ id: "project-b", name: "South home", detail: "Execution" }], offset: 0, nextOffset: null, version: "a".repeat(64) } });
    render(panel()); fireEvent.click(screen.getByRole("button", { name: "Show my projects" }));
    const choice = await screen.findByRole("button", { name: "View progress for South home, Execution" });
    await userEvent.click(choice);
    await waitFor(() => expect(askLisnoApi.ask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my project progress", choiceProjectId: "project-b" });
  });

  it("sends one retry while busy and retains one copy of the failed question", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(503, "ASSISTANT_UNAVAILABLE", "Unavailable"))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(panel()); send("Show my project timeline");
    const retry = await screen.findByRole("button", { name: "Retry answer" });
    fireEvent.click(retry); fireEvent.click(retry);
    expect(askLisnoApi.ask).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    for (const button of within(screen.getByRole("group", { name: "Suggested questions" })).getAllByRole("button")) expect(button).toBeDisabled();
    await act(async () => finish(greeting));
    expect(screen.getAllByText("Show my project timeline")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts the old session, ignores its late reply and accepts a new-session question", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(panel()); send("Old session question");
    const signal = vi.mocked(askLisnoApi.ask).mock.calls[0][1];
    view.rerender(panel("client-b", "project-b"));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(greeting));
    expect(screen.queryByText("Old session question")).not.toBeInTheDocument();
    expect(screen.queryByText(greeting.answer.narrative![0].text)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project progress" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Project progress" }));
    await screen.findByText(greeting.answer.narrative![0].text);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my project progress", projectId: "project-b", contextProjectId: null, history: [] });
  });

  it("clears a denied conversation and does not reuse its page project hint", async () => {
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Private detail"));
    render(panel("client-a", "project-a")); send("Show my estimate");
    expect(await screen.findByRole("alert")).toHaveTextContent("This conversation is no longer available for your current access.");
    expect(screen.queryByText("Show my estimate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show my projects" }));
    await screen.findByText(greeting.answer.narrative![0].text);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ projectId: null, contextProjectId: null, history: [] });
  });
});
