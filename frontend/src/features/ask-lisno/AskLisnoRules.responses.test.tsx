import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { apiClient } from "../../api/client";
import { AssistantAnswerContent, ChatAssistantResult } from "../messages/ChatAssistantResult";
import { parseAssistantResult } from "../messages/assistantResultParser";
import { ProjectChatProvider } from "../messages/ProjectChatProvider";
import { AskLisnoPanel } from "./AskLisnoPanel";
import { askLisnoApi, parseAskLisnoResponse } from "./askLisnoApi";

// Captured by the backend integration test through the actual Python HTTP
// entrypoint and Node's authorized private/shared result reconstruction.
const responses = JSON.parse(readFileSync(resolve(process.cwd(), "../assistant-service/evaluation/rules-client-responses.json"), "utf8")) as {
  private: Record<string, unknown>;
  shared: Record<string, unknown>;
};

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  status: "authenticated",
  user: { id: "staff-priya", name: "Priya Staff", role: "site_manager" },
  authorization: { role: "site_manager", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["chat.read", "chat.assistant.read"] }
}) }));

function mountPrivate(displayName?: string) {
  return render(<MemoryRouter><AskLisnoPanel open onClose={vi.fn()} scope="rules-fixture-client" returnFocusRef={createRef<HTMLButtonElement>()} displayName={displayName} /></MemoryRouter>);
}
function respondWith(name: string) {
  vi.mocked(askLisnoApi.ask).mockImplementationOnce(async input => parseAskLisnoResponse(responses.private[name], input));
}
beforeEach(() => {
  vi.spyOn(askLisnoApi, "ask");
  vi.spyOn(askLisnoApi, "verifyProject").mockResolvedValue(undefined);
});

describe("actual rules-service response rendering", () => {
  it("accepts and displays the backend greeting without a failure state", async () => {
    respondWith("greeting"); mountPrivate();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello, Client! I can help with your project's progress, timelines, and published estimates. What would you like to know?")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
  });

  it("renders the server-authorized greeting name without replacing it with the local display name", async () => {
    respondWith("toneGreeting"); mountPrivate("Asha Example");
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const answer = await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(within(answer).getByText("Hello, Murthy! I can help with your project's progress, timelines, and published estimates. What would you like to know?")).toBeVisible();
    expect(within(answer).queryByText(/Asha/)).not.toBeInTheDocument();
    expect(within(answer).getAllByText(/Murthy/)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the explicit concern acknowledgment once alongside verified project status", async () => {
    respondWith("toneConcern"); mountPrivate("Asha Example");
    const message = "I'm worried, may I know my project status?";
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: message } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const answer = await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(within(answer).getByText("I hear your concern, Murthy.")).toBeVisible();
    expect(within(answer).getAllByText(/Murthy/)).toHaveLength(1);
    expect(within(answer).getByText("Project status: active")).toBeVisible();
    expect(within(answer).queryByText(/Asha/)).not.toBeInTheDocument();
    await userEvent.click(within(answer).getByText("Sources and details"));
    expect(within(answer).getByText("active")).toBeVisible();
    expect(within(answer).getAllByText("Project status")).toHaveLength(2);
    expect(vi.mocked(askLisnoApi.ask).mock.calls[0][0].message).toBe(message);
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
  });

  it.each([
    ["progress", "Project progress", "Show my project progress", "Vendor reported progress: 75% reported; this is not a Client acceptance."],
    ["timeline", "Timeline", "Show my project timeline", "Confirmed schedule: 2026-10-16 to 2026-10-20; confirmed work dates, not a project handover commitment."]
  ])("renders verified %s with source disclosure", async (name, label, message, text) => {
    respondWith(name); mountPrivate();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByText(text)).toBeVisible();
    await userEvent.click(screen.getByText("Sources and details"));
    expect(screen.getByText("Site verified; awaiting Client acceptance.")).toBeVisible();
    expect(vi.mocked(askLisnoApi.ask).mock.calls[0][0].message).toBe(message);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the approved immutable estimate with exact paise conversion and lineage", async () => {
    respondWith("estimate"); mountPrivate();
    fireEvent.click(screen.getByRole("button", { name: "Published estimate" }));
    const price = await screen.findByRole("region", { name: "Approved estimate" });
    expect(within(price).getByText("₹271.40")).toBeVisible();
    expect(within(price).getByText("₹41.40")).toBeVisible();
    expect(within(price).getByText("1 item · Rate: ₹230.00")).toBeVisible();
    expect(within(price).getByText("Estimate version 2 · Review version 1")).toBeVisible();
    expect(within(price).getByText("Approved customer estimate")).toBeVisible();
    expect(vi.mocked(askLisnoApi.ask).mock.calls[0][0].message).toBe("Show my estimate");
  });

  it("shows an actual clarification once and keeps the composer usable", async () => {
    respondWith("clarification"); mountPrivate();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "Which room is painted?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const question = "Which project would you like me to check? Please tell me its name.";
    expect(await screen.findByText(question)).toBeVisible();
    expect(screen.getAllByText(question)).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Your question" })).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry answer" })).not.toBeInTheDocument();
  });

  it("disambiguates identical project-choice labels and sends the chosen stable ID", async () => {
    respondWith("choices"); respondWith("progress"); mountPrivate();
    fireEvent.click(screen.getByRole("button", { name: "Project progress" }));
    const first = await screen.findByRole("button", { name: "City Loft Test Reference a" });
    expect(screen.getByRole("button", { name: "City Loft Test Reference c" })).toBeEnabled();
    first.focus(); await userEvent.keyboard("{Enter}");
    await screen.findByText("Project status: active");
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my project progress", choiceProjectId: "a", history: [] });
  });

  it("renders the backend project list and follows its stable ID", async () => {
    respondWith("projectList"); respondWith("progress"); mountPrivate();
    fireEvent.click(screen.getByRole("button", { name: "Show my projects" }));
    const button = await screen.findByRole("button", { name: "View progress for Project a, Test" });
    await userEvent.click(button);
    await waitFor(() => expect(askLisnoApi.ask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askLisnoApi.ask).mock.calls[1][0]).toMatchObject({ message: "Show my project progress", choiceProjectId: "a" });
    await screen.findByText("Project status: active");
  });

  it.each(["estimate", "restricted", "stale"])("parses and renders the shared %s result without restoring protected prices", name => {
    const result = parseAssistantResult(responses.shared[name], "a", "rules-result");
    render(<MemoryRouter><AssistantAnswerContent result={result} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Lisno AI answer" })).toBeVisible();
    if (name === "estimate") {
      expect(screen.getByRole("region", { name: "Approved estimate" })).toBeVisible();
      expect(screen.getByText("₹271.40")).toBeVisible();
    } else {
      expect(screen.queryByRole("region", { name: "Approved estimate" })).not.toBeInTheDocument();
      expect(screen.queryByText("₹271.40")).not.toBeInTheDocument();
      expect(screen.getByText(name === "restricted" ? /Price details are restricted/ : /Project information has changed/)).toBeVisible();
    }
  });

  it("keeps the published requester name when a different staff member reads the shared answer", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue(responses.shared.toneStatus);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = render(<QueryClientProvider client={client}><MemoryRouter><ProjectChatProvider>
      <ChatAssistantResult projectId="a" resultId="rules-result" />
    </ProjectChatProvider></MemoryRouter></QueryClientProvider>);
    try {
      const answer = await screen.findByRole("region", { name: "Lisno AI answer" });
      expect(within(answer).getByText("I hear your concern, Murthy.")).toBeVisible();
      expect(within(answer).getAllByText(/Murthy/)).toHaveLength(1);
      expect(within(answer).queryByText(/Priya/)).not.toBeInTheDocument();
      expect(within(answer).getByText("Project status: active")).toBeVisible();
      expect(get).toHaveBeenCalledWith("/projects/a/chat/assistant/results/rules-result", expect.objectContaining({ cache: "no-store" }));
      expect(askLisnoApi.ask).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      client.clear();
    }
  });
});
