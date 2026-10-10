import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { DailyCriticalTasksPrompt } from "./DailyCriticalTasksPrompt";
import { projectChatApi } from "./projectChatApi";
import { ChatScheduleProvider, useChatSchedule } from "./ChatScheduleProvider";
import type { CurrentCriticalTaskReview } from "../../../../shared/chat/dailyCriticalTasks";

const auth = vi.hoisted(() => ({ status: "authenticated", user: { id: "team-1", role: "procurement" }, authorization: { permissions: ["chat.read"] }, reviewSession: { id: "login-1", userId: "team-1" } }));
const guard = vi.hoisted(() => ({ active: "team-1:login-1", consumed: new Set<string>(), listeners: new Set<() => void>(), consume: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../auth/loginReviewSession", () => ({
  subscribeLoginReviewSession: (listener: () => void) => { guard.listeners.add(listener); return () => guard.listeners.delete(listener); },
  isLoginReviewSessionCurrent: (session: { id: string; userId: string }) => guard.active === `${session.userId}:${session.id}`,
  getLoginReviewState: (session: { id: string; userId: string }) => guard.active !== `${session.userId}:${session.id}` ? "stale" : guard.consumed.has(guard.active) ? "consumed" : "pending",
  consumeLoginReview: guard.consume
}));
vi.mock("./projectChatApi", () => ({
  projectChatApi: { currentCriticalTaskReview: vi.fn(), dailyCriticalTasks: vi.fn(), acknowledgeDailyCriticalTasks: vi.fn(), availability: vi.fn() },
  chatErrorMessage: (error: Error) => error.message
}));

const list: CurrentCriticalTaskReview = {
  timezone: "Asia/Kolkata", checkedAt: "2026-10-10T03:30:00.000Z",
  receipt: { localDate: "2026-10-07", acknowledgedAt: null },
  items: [
    { kind: "chat_action", id: "action-1", projectId: "project-a", projectName: "Project A", title: "Confirm the flooring quote", dueDate: "2026-09-29", messageId: "message-a" },
    { kind: "workflow_task", id: "task-2", projectId: "project-b", projectName: "Project B", title: "Review materials", dueAt: "2026-09-28T09:00:00.000Z", status: "pending" }
  ]
};
const acknowledgment = { localDate: "2026-10-07", acknowledgedAt: "2026-10-10T03:32:00.000Z" };
const reviewButton = () => screen.getByRole("button", { name: "I have reviewed this list" });
const manualButton = () => screen.getByRole("button", { name: "View daily critical tasks" });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function emitGuard() { for (const listener of guard.listeners) listener(); }
function newLogin(id: string, userId = "team-1") { auth.reviewSession = { id, userId }; auth.user.id = userId; guard.active = `${userId}:${id}`; emitGuard(); }
function renderPrompt({ client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }), strict = false } = {}) {
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><ChatScheduleProvider><DailyCriticalTasksPrompt /><ScheduleProbe /></ChatScheduleProvider></MemoryRouter></QueryClientProvider>;
  const view = render(strict ? <StrictMode>{tree()}</StrictMode> : tree());
  return { ...view, client, refresh: () => view.rerender(strict ? <StrictMode>{tree()}</StrictMode> : tree()) };
}
function ScheduleProbe() { const schedule = useChatSchedule(); return <button disabled={!schedule.canWrite} onClick={schedule.refresh}>Refresh chat schedule</button>; }

beforeEach(() => {
  vi.resetAllMocks(); auth.status = "authenticated"; auth.user = { id: "team-1", role: "procurement" };
  auth.authorization.permissions = ["chat.read"]; auth.reviewSession = { id: "login-1", userId: "team-1" };
  guard.active = "team-1:login-1"; guard.consumed.clear();
  guard.consume.mockImplementation(async (session: { id: string; userId: string }, isCurrent: () => boolean) => {
    const key = `${session.userId}:${session.id}`;
    if (!isCurrent() || guard.active !== key || guard.consumed.has(key)) return false;
    guard.consumed.add(key); emitGuard(); return true;
  });
  vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValue(list);
  vi.mocked(projectChatApi.acknowledgeDailyCriticalTasks).mockResolvedValue(acknowledgment);
  vi.mocked(projectChatApi.availability).mockResolvedValue({ timezone: "Asia/Kolkata", writable: true, nextOpenAt: null, nextChangeAt: "2099-01-01T00:00:00Z" });
});

describe("critical task review once per login", () => {
  it.each(["vendor", "program_manager"])("does not read staff endpoints for a %s without chat permission", role => {
    auth.user.role = role; auth.authorization.permissions = []; renderPrompt();
    expect(screen.getByRole("button", { name: "Refresh chat schedule" })).toBeDisabled();
    expect(projectChatApi.availability).not.toHaveBeenCalled();
    expect(projectChatApi.currentCriticalTaskReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "View daily critical tasks" })).not.toBeInTheDocument();
  });
  it.each(["restoring", "unauthenticated", "signing_out"])("does not read or expose tasks while %s", status => {
    auth.status = status; renderPrompt();
    expect(projectChatApi.currentCriticalTaskReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "View daily critical tasks" })).not.toBeInTheDocument();
  });
  it("does not offer the team review to Clients", () => {
    auth.user.role = "client"; renderPrompt(); expect(projectChatApi.currentCriticalTaskReview).not.toHaveBeenCalled();
  });
  it("reviews current work once despite a backlog and immediately applies acknowledgment metadata", async () => {
    const user = userEvent.setup(); const view = renderPrompt();
    const dialog = await screen.findByRole("alertdialog", { name: "Daily critical tasks" });
    expect(dialog).toHaveTextContent("Confirm the flooring quote"); expect(dialog).toHaveTextContent("Review materials");
    expect(dialog).toHaveTextContent("Current task review"); expect(dialog).not.toHaveTextContent("5 PM team review"); expect(dialog).not.toHaveTextContent("tasks for 2026-10-07");
    expect(screen.getByRole("link", { name: "Open conversation" })).toHaveAttribute("href", "/projects/project-a/messages?message=message-a");
    await user.click(reviewButton());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(projectChatApi.acknowledgeDailyCriticalTasks).toHaveBeenCalledWith("2026-10-07", expect.any(AbortSignal));
    expect(view.client.getQueryData<CurrentCriticalTaskReview>(["daily-critical-tasks", "current", "team-1", "login-1"])?.receipt).toEqual(acknowledgment);
    expect(projectChatApi.dailyCriticalTasks).not.toHaveBeenCalled(); expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1);
    expect(manualButton()).toHaveFocus();
  });
  it.each([null, acknowledgment])("opens current work before 5 PM or after a previous receipt was acknowledged (%j)", async receipt => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValue({ ...list, receipt }); renderPrompt();
    await screen.findByRole("alertdialog"); await user.click(reviewButton());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(projectChatApi.acknowledgeDailyCriticalTasks).not.toHaveBeenCalled();
  });
  it("a successful empty read consumes the login even with an unacknowledged receipt; new work stays manual", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValueOnce({ ...list, items: [] }).mockResolvedValue(list);
    const view = renderPrompt(); await waitFor(() => expect(guard.consumed.has(guard.active)).toBe(true));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["daily-critical-tasks"] }); focusManager.setFocused(false); focusManager.setFocused(true); });
    view.refresh(); expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1);
    await user.click(manualButton()); await screen.findByRole("alertdialog");
    expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(2); expect(projectChatApi.acknowledgeDailyCriticalTasks).not.toHaveBeenCalled();
  });
  it("does not reopen on stale cache writes, invalidation, focus or remount after acknowledgment", async () => {
    const user = userEvent.setup(); const view = renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await act(async () => {
      view.client.setQueryData(["daily-critical-tasks", "current", "team-1", "login-1"], { ...list, receipt: { localDate: "2026-10-06", acknowledgedAt: null } });
      await view.client.invalidateQueries({ queryKey: ["daily-critical-tasks"] }); focusManager.setFocused(false); focusManager.setFocused(true);
    });
    view.unmount(); renderPrompt({ client: view.client });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1);
  });
  it("a new same-day login reviews unresolved work even when its receipt is acknowledged", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValue({ ...list, receipt: acknowledgment });
    const view = renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton());
    act(() => { newLogin("login-2"); view.refresh(); }); await screen.findByRole("alertdialog");
    expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(2); expect(guard.consumed.size).toBe(2);
  });
  it("retains one review and retries the same receipt after acknowledgment fails", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.acknowledgeDailyCriticalTasks).mockRejectedValueOnce(new Error("Temporary failure")).mockResolvedValue(acknowledgment);
    renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary failure"); expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByText("Confirm the flooring quote")).toBeVisible(); await user.click(reviewButton());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(projectChatApi.acknowledgeDailyCriticalTasks).toHaveBeenCalledTimes(2); expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1);
  });
  it("manual review fetches fresh content and shows an empty state instead of the cached list", async () => {
    const user = userEvent.setup(); const next = deferred<CurrentCriticalTaskReview>();
    vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValueOnce(list).mockImplementationOnce(() => next.promise);
    renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()); await user.click(manualButton());
    expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument(); expect(manualButton()).toBeDisabled();
    await act(async () => next.resolve({ ...list, receipt: acknowledgment, items: [] }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("No open critical chat actions or overdue assigned workflow tasks right now.");
    await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(manualButton()).toHaveFocus();
  });
  it("a failed manual read reveals no cached details and remains retryable", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockResolvedValueOnce(list).mockRejectedValueOnce(new Error("Access changed")).mockResolvedValue({ ...list, receipt: acknowledgment });
    renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton()); await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await user.click(manualButton()); const retry = await screen.findByRole("button", { name: "Retry critical tasks" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument();
    await user.click(retry); expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm the flooring quote");
  });
  it("does not consume a failed automatic read or loop; explicit retry checks again", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(list);
    const view = renderPrompt(); const retry = await screen.findByRole("button", { name: "Retry critical tasks" }); expect(guard.consumed.size).toBe(0);
    view.refresh(); expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1); await user.click(retry); await screen.findByRole("alertdialog"); expect(guard.consumed.size).toBe(1);
  });
  it("only the atomic winner opens; another tab's claim does not show a second review", async () => {
    guard.consume.mockImplementation(async () => { guard.consumed.add(guard.active); emitGuard(); return false; }); renderPrompt();
    await waitFor(() => expect(guard.consume).toHaveBeenCalledTimes(1)); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(manualButton()).toBeEnabled();
  });
  it("ignores late previous-user reads and scopes cache by the new user's login", async () => {
    const old = deferred<CurrentCriticalTaskReview>();
    vi.mocked(projectChatApi.currentCriticalTaskReview).mockImplementationOnce(() => old.promise).mockResolvedValue({ ...list, items: [{ ...list.items[0], id: "other-task", title: "New user work" }] });
    const view = renderPrompt(); await waitFor(() => expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(1));
    act(() => { newLogin("login-2", "team-2"); view.refresh(); }); const dialog = await screen.findByRole("alertdialog"); expect(dialog).toHaveTextContent("New user work");
    await act(async () => old.resolve(list)); expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument(); expect(guard.consumed.has("team-1:login-1")).toBe(false);
    expect(view.client.getQueryData(["daily-critical-tasks", "current", "team-2", "login-2"])).toBeDefined();
  });
  it("a late acknowledgment cannot close a new login's review", async () => {
    const user = userEvent.setup(); const old = deferred<typeof acknowledgment>(); vi.mocked(projectChatApi.acknowledgeDailyCriticalTasks).mockImplementationOnce(() => old.promise);
    const view = renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton()); act(() => { newLogin("login-2"); view.refresh(); });
    await waitFor(() => expect(projectChatApi.currentCriticalTaskReview).toHaveBeenCalledTimes(2)); await screen.findByRole("alertdialog"); await act(async () => old.resolve(acknowledgment));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Confirm the flooring quote"); expect(reviewButton()).toBeEnabled();
  });
  it.each(["permission", "authentication", "session"])("hides current details immediately on known %s loss", async kind => {
    const view = renderPrompt(); await screen.findByRole("alertdialog");
    act(() => { if (kind === "permission") auth.authorization.permissions = []; if (kind === "authentication") auth.status = "restoring"; if (kind === "session") { guard.active = "different-session"; emitGuard(); } view.refresh(); });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument();
  });
  it("discards a fresh manual response after logout and aborts its request", async () => {
    const user = userEvent.setup(); guard.consumed.add(guard.active); const late = deferred<CurrentCriticalTaskReview>(); vi.mocked(projectChatApi.currentCriticalTaskReview).mockImplementation(() => late.promise);
    const view = renderPrompt(); await user.click(manualButton()); const signal = vi.mocked(projectChatApi.currentCriticalTaskReview).mock.calls[0][0];
    act(() => { auth.status = "unauthenticated"; view.refresh(); }); expect(signal?.aborted).toBe(true); await act(async () => late.resolve(list)); expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument();
  });
  it("clears details when acknowledgment reports authorization loss", async () => {
    const user = userEvent.setup(); vi.mocked(projectChatApi.acknowledgeDailyCriticalTasks).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access changed"));
    renderPrompt(); await screen.findByRole("alertdialog"); await user.click(reviewButton()); await screen.findByRole("button", { name: "Retry critical tasks" }); expect(screen.queryByText("Confirm the flooring quote")).not.toBeInTheDocument();
  });
  it("preserves keyboard acknowledgment and return focus", async () => {
    const user = userEvent.setup(); renderPrompt(); await screen.findByRole("alertdialog"); await user.keyboard("{Escape}"); expect(screen.getByRole("alertdialog")).toBeVisible();
    reviewButton().focus(); await user.keyboard("{Enter}"); await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()); expect(manualButton()).toHaveFocus();
  });
  it("survives StrictMode effect replay without losing the winning automatic display", async () => {
    renderPrompt({ strict: true }); await screen.findByRole("alertdialog"); expect(screen.getAllByRole("alertdialog")).toHaveLength(1); expect(guard.consumed.size).toBe(1);
  });
});
