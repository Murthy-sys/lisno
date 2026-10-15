import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { AskLisnoPanel } from "./AskLisnoPanel";
import { askLisnoApi, type AskLisnoResponse } from "./askLisnoApi";
import { publishedPriceFixture } from "../messages/assistantPricingFixtures";

const answer: AskLisnoResponse = { projectId: "project-a", checkedAt: "2026-10-15T00:00:00Z", answer: { disclosurePolicy: "project-publication-v1", kind: "status", facts: [], candidates: [], missingInputs: [], commercial: null, narrative: [{ text: "Your project team is preparing the design.", factIds: [] }] } };
function mount() {
  return render(<MemoryRouter><AskLisnoPanel open onClose={vi.fn()} scope="client-a" returnFocusRef={createRef<HTMLButtonElement>()} /></MemoryRouter>);
}
function send(message: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}
beforeEach(() => {
  vi.spyOn(askLisnoApi, "ask").mockResolvedValue(answer);
  vi.spyOn(askLisnoApi, "verifyProject").mockResolvedValue(undefined);
});

describe("Ask Lisno recoverable failures", () => {
  it("discards prices on background and requires a deliberate refresh after membership is rechecked", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValue({ ...answer, answer: { ...answer.answer, projectPricing: publishedPriceFixture() } });
    mount(); send("What is my estimate?");
    await screen.findByText("₹9,735.00");
    fireEvent(window, new Event("blur"));
    expect(screen.queryByText("₹9,735.00")).not.toBeInTheDocument();
    fireEvent(window, new Event("focus"));
    const refresh = await screen.findByRole("button", { name: "Refresh estimate" });
    expect(askLisnoApi.verifyProject).toHaveBeenCalledWith("project-a", expect.any(AbortSignal));
    expect(screen.queryByText("₹9,735.00")).not.toBeInTheDocument();
    expect(askLisnoApi.ask).toHaveBeenCalledTimes(1);
    fireEvent.click(refresh);
    await screen.findByText("₹9,735.00");
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "What is my estimate?", choiceProjectId: "project-a" });
  });
  it.each([
    [429, "ASSISTANT_BUSY", /answering another request/],
    [429, "ASSISTANT_RATE_LIMIT", /request limit has been reached/],
    [429, "ASSISTANT_TOKEN_LIMIT", /request limit has been reached/],
    [408, "ASSISTANT_TIMEOUT", /took too long/],
    [503, "ASSISTANT_TIME_LIMIT", /took too long/],
    [400, "ASSISTANT_CONTEXT_LIMIT", /question or conversation is too long/],
    [503, "ASSISTANT_UNAVAILABLE", /could not answer right now/]
  ])("offers safe recovery for %s %s without exposing provider details", async (status, code, copy) => {
    vi.mocked(askLisnoApi.ask).mockRejectedValueOnce(new ApiError(status as number, code as string, "Provider key private-secret; stack trace"));
    mount(); send("When will the work start?");
    expect(await screen.findByRole("alert")).toHaveTextContent(copy as RegExp);
    expect(screen.queryByText(/private-secret|stack trace/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveValue("When will the work start?");
    expect(screen.getByRole("button", { name: "Retry answer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Message your team" })).toHaveAttribute("href", "/project-messages");
    expect(askLisnoApi.ask).toHaveBeenCalledTimes(1);
    if (code === "ASSISTANT_BUSY") expect(screen.queryByText(/limit has been reached/)).not.toBeInTheDocument();
  });

  it("retains verified history and the failed question for a manual retry", async () => {
    vi.mocked(askLisnoApi.ask).mockResolvedValueOnce(answer).mockRejectedValueOnce(new ApiError(503, "ASSISTANT_TIMEOUT", "Timeout")).mockResolvedValueOnce(answer);
    mount(); send("Show my project status"); await screen.findByText("Your project team is preparing the design.");
    send("When does design finish?"); await screen.findByRole("alert");
    expect(askLisnoApi.ask).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry answer" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(askLisnoApi.ask).toHaveBeenCalledTimes(3);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[2][0]).toEqual(vi.mocked(askLisnoApi.ask).mock.calls[1][0]);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[2][0]).toMatchObject({ message: "When does design finish?", contextProjectId: "project-a", history: [{ body: "Show my project status", projectId: "project-a" }] });
    expect(screen.getAllByText("When does design finish?")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveValue("");
  });

  it("aborts an in-flight question on unmount and ignores a late reply", async () => {
    let finish!: (value: AskLisnoResponse) => void;
    vi.mocked(askLisnoApi.ask).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = mount(); send("Show my estimate");
    const signal = vi.mocked(askLisnoApi.ask).mock.calls[0][1];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(answer));
    expect(screen.queryByText("Your project team is preparing the design.")).not.toBeInTheDocument();
  });
});
