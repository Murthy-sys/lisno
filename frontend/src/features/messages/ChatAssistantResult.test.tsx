import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { ChatAssistantMessage, ChatAssistantResult } from "./ChatAssistantResult";
import { ChatParticipants } from "./ChatParticipants";
import { chatKeys, projectChatApi } from "./projectChatApi";
import type { ChatAssistantMessageState, ChatAssistantResult as Result } from "./projectChatAssistantTypes";
import { chatTestMessage, chatTestPeople } from "./projectChatFixtures";

const identity = vi.hoisted(() => ({ role: "client" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: identity.role } }) }));
const access = { userId: "client-a", scope: "session-a", enabled: true, denied: new Set<string>(), isCurrent: () => () => true, verifyAccess: vi.fn(), invalidate: vi.fn().mockResolvedValue(undefined) };
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => access }));
const state = (override: Partial<ChatAssistantMessageState> = {}): ChatAssistantMessageState => ({ runId: "run-a", generation: 1, stateVersion: 1, status: "waiting_for_human", eligibleAt: "2026-10-09T08:05:00Z", resultId: null, checkedAt: null, routing: "notified", notified: chatTestPeople[1], canRequest: true, failureCode: null, ...override });
const result = (override: Partial<Result> = {}): Result => ({ id: "result-a", messageId: "answer-a", projectId: "project-a", kind: "price", checkedAt: "2026-10-09T08:05:00Z", stale: false, commercialAccess: "allowed", candidates: [], missingInputs: [], facts: [{ id: "stage", label: "Project stage", value: "Execution in progress", source: { id: "project-a", label: "Project status", href: "/projects/project-a" } }], commercial: {
  currency: "INR", policy: "configuration-selling-v1", state: "complete", lines: [{ mainLineId: "line-a", roomId: "room-a", name: "POP false ceiling", quantity: "100", uom: "sq-ft", pricingMode: "sub_vendor", optional: false, amountPaise: 825000, revisionId: "revision-a", missingInputs: [] }], subtotalPaise: 825000, gstRateBps: 1800, gstPaise: 148500, totalPaise: 973500, optionalSubtotalPaise: null, approvedBaselinePaise: 5000000, hypotheticalTotalPaise: 5973500, assumptions: ["100 sq-ft added to Living room."], missingInputs: []
}, ...override });
function mount(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { vi.clearAllMocks(); identity.role = "client"; access.scope = "session-a"; access.userId = "client-a"; access.denied.clear(); vi.spyOn(projectChatApi, "assistantResult").mockResolvedValue(result()); });

describe("authenticated Lisno AI answers", () => {
  it("renders server-priced additions, explicit GST, assumptions and source links", async () => {
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    const answer = await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(within(answer).getByRole("link", { name: "Project status" })).toHaveAttribute("href", "/projects/project-a");
    expect(within(answer).getByText("₹9,735.00")).toBeInTheDocument();
    expect(within(answer).getByText("GST (18%)")).toBeInTheDocument();
    expect(within(answer).getByText("₹59,735.00")).toBeInTheDocument();
    expect(within(answer).getByText(/approved estimate is unchanged/)).toBeInTheDocument();
    expect(within(answer).getByText("100 sq-ft · Sub-Vendor")).toBeInTheDocument();
  });
  it("removes old prices during revalidation and treats commercial denial separately from chat access", async () => {
    const { client } = mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    await screen.findByText("₹9,735.00");
    let reject!: (error: Error) => void;
    vi.mocked(projectChatApi.assistantResult).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    let refreshed!: Promise<void>;
    act(() => { refreshed = client.invalidateQueries({ queryKey: chatKeys.assistantResult(access.scope, "project-a", "result-a") }); });
    await screen.findByText(/Checking current access/);
    expect(screen.queryByText("₹9,735.00")).not.toBeInTheDocument();
    await act(async () => { reject(new ApiError(403, "COMMERCIAL_DENIED", "Denied")); await refreshed; });
    expect(await screen.findByText(/unavailable for your current access/)).toBeInTheDocument();
    expect(access.verifyAccess).not.toHaveBeenCalled();
    expect(client.getQueryData(chatKeys.assistantResult(access.scope, "project-a", "result-a"))).toEqual({ denied: true });
  });
  it("never renders a commercial payload when its access marker is restricted", async () => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ commercialAccess: "restricted" }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText(/Price details are restricted/)).toBeInTheDocument();
    expect(screen.queryByText("₹9,735.00")).not.toBeInTheDocument();
    expect(screen.getByText("Execution in progress")).toBeInTheDocument();
  });
  it("shows partial results and stale context without inventing missing prices or following unsafe source URLs", async () => {
    const input = result();
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ stale: true, missingInputs: ["Confirm the room and quantity."], facts: [{ ...input.facts[0], source: { id: "bad", label: "Untrusted source", href: "javascript:alert(1)" } }], commercial: { ...input.commercial!, state: "clarification_required", lines: [{ ...input.commercial!.lines[0], quantity: null, amountPaise: null }], subtotalPaise: null, totalPaise: null, gstPaise: null, approvedBaselinePaise: null, hypotheticalTotalPaise: null } }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText(/Configuration data has changed/)).toBeInTheDocument();
    expect(screen.getByText("Not priced")).toBeInTheDocument();
    expect(screen.getByText("Confirm the room and quantity.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Untrusted source" })).not.toBeInTheDocument();
    expect(screen.queryByText("Approximate additions total")).not.toBeInTheDocument();
  });
  it("makes a request only on click and retains its idempotency key after an uncertain delivery", async () => {
    vi.spyOn(projectChatApi, "requestAssistant").mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(state({ status: "ready" }));
    mount(<ChatAssistantMessage projectId="project-a" message={chatTestMessage({ assistant: state({ status: "failed" }) })} />);
    expect(projectChatApi.requestAssistant).not.toHaveBeenCalled();
    expect(screen.queryByText(/after 2 minutes without a human reply/)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Retry AI reply" });
    button.focus(); await userEvent.keyboard("{Enter}");
    await screen.findByRole("alert");
    await userEvent.click(button);
    await waitFor(() => expect(projectChatApi.requestAssistant).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(projectChatApi.requestAssistant).mock.calls;
    expect(calls[0][2].idempotencyKey).toBe(calls[1][2].idempotencyKey);
    expect(calls[0][2].expectedVersion).toBe(1);
    expect(access.invalidate).toHaveBeenCalledWith("project-a");
  });
  it("does not let another participant request generation for the client question", () => {
    access.userId = "worker-a"; identity.role = "site_manager";
    mount(<ChatAssistantMessage projectId="project-a" message={chatTestMessage({ assistant: state() })} />);
    expect(screen.queryByRole("button", { name: "Request AI answer" })).not.toBeInTheDocument();
    expect(screen.getByText("Alert sent to Alex Team.")).toBeInTheDocument();
  });
  it("keeps routing and wait/refresh controls invisible to Clients", () => {
    mount(<ChatAssistantMessage projectId="project-a" message={chatTestMessage({ assistant: state({ resultId: "result-a" }) })} />);
    expect(screen.queryByText(/Alert sent|waiting for|2 minutes|recalculate|refresh AI/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("does not describe a completed social reply as requiring staff confirmation", () => {
    access.userId = "worker-a"; identity.role = "site_manager";
    mount(<ChatAssistantMessage projectId="project-a" message={chatTestMessage({ body: "Hi!", assistant: state({ status: "no_answer", resultId: "result-a", routing: "not_required", notified: null }) })} />);
    expect(screen.getByText("Lisno AI has replied. See its message for details.")).toBeVisible();
    expect(screen.queryByText(/team needs to confirm/)).not.toBeInTheDocument();
  });
  it("renders natural narrative once with facts behind a details disclosure", async () => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ narrative: [{ text: "Your project is currently in execution. I can help you check the next steps.", factIds: ["stage"] }], commercial: null, commercialAccess: "none" }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText("Your project is currently in execution. I can help you check the next steps.")).toBeVisible();
    expect(screen.getByText("Execution in progress")).not.toBeVisible();
    await userEvent.click(screen.getByText("Sources and details"));
    expect(screen.getByText("Execution in progress")).toBeVisible();
  });
  it.each([
    { kind: "status" as const, text: "Hello! How can I help you today?" },
    { kind: "no_answer" as const, text: "You're welcome!" }
  ])("renders a source-free $kind reply once without source or team-confirmation boilerplate", async ({ kind, text }) => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ kind, narrative: [{ text, factIds: [] }], facts: [], commercial: null, commercialAccess: "none" }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    const answer = await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(within(answer).getAllByText(text)).toHaveLength(1);
    expect(within(answer).getByText(text)).toBeVisible();
    expect(within(answer).queryByText(/Sources and details|Checked |team needs to confirm/)).not.toBeInTheDocument();
  });
  it("retains price details and checked metadata for a narrative without factual sources", async () => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ narrative: [{ text: "Here is the approximate addition cost for your review.", factIds: [] }], facts: [] }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText("₹9,735.00")).toBeVisible();
    await userEvent.click(screen.getByText("Sources and details"));
    expect(screen.getByText(/Checked /)).toBeVisible();
    expect(screen.getByText(/approved estimate is unchanged/)).toBeVisible();
  });
  it("retains stale guidance and checked metadata even when a narrative has no facts", async () => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ stale: true, narrative: [{ text: "Please check the current project details.", factIds: [] }], facts: [], commercial: null, commercialAccess: "none" }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText(/Configuration data has changed/)).toBeVisible();
    await userEvent.click(screen.getByText("Sources and details"));
    expect(screen.getByText(/Checked /)).toBeVisible();
  });
  it("retains the original fallback for older answers without narrative", async () => {
    vi.mocked(projectChatApi.assistantResult).mockResolvedValue(result({ kind: "no_answer", facts: [], commercial: null, commercialAccess: "none" }));
    mount(<ChatAssistantResult projectId="project-a" resultId="result-a" />);
    expect(await screen.findByText("The project team needs to confirm this request.")).toBeVisible();
    expect(screen.getByText(/Checked /)).toBeVisible();
  });
  it.each([true, false])("shows only the service name, regardless of availability (%s)", (available) => {
    mount(<ChatParticipants projectId="project-a" participants={chatTestPeople} warnings={[]} canManage assistant={{ kind: "service", id: "lisno-ai", name: "Lisno AI", available }} />);
    const service = screen.getByRole("region", { name: "Project AI assistant" });
    expect(within(service).getByText("Lisno AI")).toBeInTheDocument();
    expect(within(service).queryByRole("button")).not.toBeInTheDocument();
    expect(within(service).queryByText(/currently unavailable|Read-only project information|Can help with project status/)).not.toBeInTheDocument();
  });
});
