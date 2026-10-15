import { publishedPriceFixture } from "./assistantPricingFixtures";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { ChatAssistantResult } from "./ChatAssistantResult";
import { chatKeys, projectChatApi } from "./projectChatApi";
import type { ChatAssistantResult as Result } from "./projectChatAssistantTypes";
import { retryAssistantResult, useChatAssistantRequest } from "./useChatAssistant";
import { chatTestMessage } from "./projectChatFixtures";

const access = { userId: "client-a", scope: "session-a", enabled: true, denied: new Set<string>(), verifyAccess: vi.fn(), invalidate: vi.fn().mockResolvedValue(undefined), isCurrent: () => () => true };
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => access }));
const result: Result = { id: "answer-a", projectId: "project-a", messageId: "message-a", kind: "price", checkedAt: "2026-10-15T00:00:00Z", stale: false, commercialAccess: "allowed", facts: [], candidates: [], missingInputs: [], disclosurePolicy: "project-publication-v1", projectPricing: publishedPriceFixture({ totalPaise: 825000, gstPaise: 0 }), commercial: null };
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return { ...render(<QueryClientProvider client={client}><MemoryRouter><ChatAssistantResult projectId="project-a" resultId="answer-a" /></MemoryRouter></QueryClientProvider>), client };
}
beforeEach(() => { access.enabled = true; access.scope = "session-a"; access.denied.clear(); access.verifyAccess.mockClear(); access.invalidate.mockClear(); vi.spyOn(projectChatApi, "assistantResult").mockResolvedValue(result); });
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

describe("AI result read recovery", () => {
  it.each([
    new ApiError(502, "REQUEST_FAILED", "Upstream error"),
    new ApiError(503, "ASSISTANT_UNAVAILABLE", "Unavailable"),
    new ApiError(504, "REQUEST_FAILED", "Timed out"),
    new TypeError("Failed to fetch"),
    new TypeError("Load failed"),
    new TypeError("NetworkError when attempting to fetch resource.")
  ])("allows only one retry for a transient %s", error => {
    expect(retryAssistantResult(0, error)).toBe(true);
    expect(retryAssistantResult(1, error)).toBe(false);
  });
  it.each([
    new ApiError(401, "UNAUTHORIZED", "Private detail"),
    new ApiError(403, "FORBIDDEN", "Private detail"),
    new ApiError(404, "NOT_FOUND", "Private detail"),
    new ApiError(429, "RATE_LIMIT", "Limit"),
    new ApiError(400, "BAD_RESPONSE", "Bad response"),
    new DOMException("Cancelled", "AbortError"),
    new ApiError(502, "ASSISTANT_INVALID_RESPONSE", "Invalid response"),
    new SyntaxError("Invalid JSON"),
    new TypeError("Cannot read properties of undefined")
  ])("does not retry a permission, protocol or cancellation error: %s", error => {
    expect(retryAssistantResult(0, error)).toBe(false);
  });

  it("recovers a transient read with one retry before showing a result", async () => {
    vi.mocked(projectChatApi.assistantResult).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Private provider text"));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Checking current access");
    await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Private provider/)).not.toBeInTheDocument();
  });

  it("stops after a second transient failure with a manual retry control and safe copy", async () => {
    vi.mocked(projectChatApi.assistantResult).mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI answer could not be loaded.");
    expect(screen.getByRole("button", { name: "Retry answer" })).toBeEnabled();
    expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(2);
  });

  it("keeps the old price hidden throughout retry and clears it when the result becomes denied", async () => {
    const { client } = mount(); await screen.findByRole("region", { name: "Lisno AI answer" });
    expect(screen.getAllByText("₹8,250.00").length).toBeGreaterThan(0);
    let reject!: (error: unknown) => void;
    vi.mocked(projectChatApi.assistantResult).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Temporary"))
      .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    let refresh!: Promise<void>;
    act(() => { refresh = client.invalidateQueries({ queryKey: chatKeys.assistantResult(access.scope, "project-a", "answer-a") }); });
    await waitFor(() => expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("status")).toHaveTextContent("Checking current access");
    expect(screen.queryByText("₹8,250.00")).not.toBeInTheDocument();
    await act(async () => { reject(new ApiError(403, "FORBIDDEN", "Secret finance data")); await refresh; });
    expect(await screen.findByRole("status")).toHaveTextContent("unavailable for your current access");
    expect(screen.queryByText("₹8,250.00")).not.toBeInTheDocument();
    expect(client.getQueryData(chatKeys.assistantResult(access.scope, "project-a", "answer-a"))).toEqual({ denied: true });
    expect(access.verifyAccess).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])("never retries a denied result (%s)", async status => {
    vi.mocked(projectChatApi.assistantResult).mockRejectedValueOnce(new ApiError(status, "FORBIDDEN", "Private result"));
    mount();
    expect(await screen.findByText("This AI answer is unavailable for your current access.")).toHaveAttribute("role", "status");
    expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Lisno AI answer" })).not.toBeInTheDocument();
    if (status === 401) expect(access.verifyAccess).toHaveBeenCalledWith("project-a");
  });

  it("cancels a scheduled retry when the result unmounts", async () => {
    vi.mocked(projectChatApi.assistantResult).mockRejectedValue(new TypeError("Failed to fetch"));
    const view = mount();
    await waitFor(() => expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(projectChatApi.assistantResult).mock.calls[0][2]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 550));
    expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(1);
  });

  it("clears the previous session's price and ignores its in-flight reply after switching accounts", async () => {
    let finishOld!: (value: Result) => void;
    let finishNew!: (value: Result) => void;
    vi.mocked(projectChatApi.assistantResult)
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    const { client, rerender } = mount();
    await waitFor(() => expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(projectChatApi.assistantResult).mock.calls[0][2]!;
    access.scope = "session-b";
    rerender(<QueryClientProvider client={client}><MemoryRouter><ChatAssistantResult projectId="project-a" resultId="answer-a" /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(projectChatApi.assistantResult).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => finishOld(result));
    expect(screen.queryByText("₹8,250.00")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking current access");
    await act(async () => finishNew({ ...result, commercialAccess: "restricted", projectPricing: null }));
    expect(await screen.findByText("Price details are restricted to authorised project users.")).toBeVisible();
    expect(screen.queryByText("₹8,250.00")).not.toBeInTheDocument();
  });
});

describe("AI manual request recovery", () => {
  const message = chatTestMessage({ assistant: { runId: "run-a", generation: 1, status: "failed", eligibleAt: "2026-10-15T00:00:00Z", resultId: null, checkedAt: null, routing: "not_required", notified: null, canRequest: true, failureCode: "ASSISTANT_UNAVAILABLE" } });
  it.each([
    [503, "ASSISTANT_PROVIDER_ERROR", /could not answer right now/],
    [429, "ASSISTANT_BUSY", /answering another request/],
    [429, "ASSISTANT_RATE_LIMIT", /request limit has been reached/]
  ])("normalizes %s %s before the shared action hook displays it", async (status, code, copy) => {
    vi.spyOn(projectChatApi, "requestAssistant").mockRejectedValue(new ApiError(status as number, code as string, "Provider credential private-secret"));
    const hook = renderHook(() => useChatAssistantRequest("project-a", message));
    act(() => hook.result.current.request());
    await waitFor(() => expect(hook.result.current.error).toMatch(copy as RegExp));
    expect(hook.result.current.error).not.toMatch(/private-secret/);
    expect(hook.result.current.busy).toBe(false);
    expect(projectChatApi.requestAssistant).toHaveBeenCalledTimes(1);
    expect(access.invalidate).toHaveBeenCalledWith("project-a");
  });
  it("retains access revalidation and safe denied copy", async () => {
    vi.spyOn(projectChatApi, "requestAssistant").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Private membership detail"));
    const hook = renderHook(() => useChatAssistantRequest("project-a", message));
    act(() => hook.result.current.request());
    await waitFor(() => expect(hook.result.current.error).toBe("This item is unavailable or your access has changed."));
    expect(access.verifyAccess).toHaveBeenCalledWith("project-a");
    expect(projectChatApi.requestAssistant).toHaveBeenCalledTimes(1);
  });
});
