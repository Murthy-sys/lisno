import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { ProjectStatusButton } from "./ProjectStatusButton";
import * as api from "./projectStatusApi";

const mocks = vi.hoisted(() => ({ role: "client" as "client" | "designer" | "worker_electrician", id: "viewer-a" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: mocks.id, role: mocks.role }, status: "authenticated", authorization: authorizationFor(mocks.role) }) }));

const fixture = (projectId = "project-a"): ProjectStatusSummary => ({
  projectId, projectName: projectId === "project-a" ? "Courtyard residence" : "Garden residence", projectStatus: "active", serverNow: "2026-10-01T08:00:00Z", state: "active",
  currentStage: { key: "estimate_review", label: "Estimate approval" }, issue: null,
  pendingActions: [{ id: "review-a", stageKey: "estimate_review", stageLabel: "Estimate approval", action: "Review the submitted estimate", responsibleRole: "client", people: [{ id: "client-a", name: "Maya Client", role: "client" }], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }]
});
function mount(participant: boolean | "verify" = true, projectId = "project-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const control = (id: string, member: boolean | "verify") => <ProjectStatusButton projectId={id} {...(member === "verify" ? {} : { participant: member })} />;
  const view = render(<QueryClientProvider client={client}><main><h1>Project workspace</h1>{control(projectId, participant)}</main></QueryClientProvider>);
  return { ...view, client, change: (id: string, member: boolean | "verify" = true) => view.rerender(<QueryClientProvider client={client}><main><h1>Project workspace</h1>{control(id, member)}</main></QueryClientProvider>) };
}

beforeEach(() => {
  mocks.role = "client"; mocks.id = "viewer-a";
  vi.spyOn(api, "getProjectStatus").mockImplementation(async id => fixture(id));
});

describe("Project status", () => {
  it.each(["client", "designer", "worker_electrician"] as const)("shows the same read-only pending owner to a participating %s", async role => {
    mocks.role = role;
    mount();
    expect(api.getProjectStatus).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Maya Client")).toBeVisible();
    expect(screen.getByText("Review the submitted estimate")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("hides the entry point without confirmed project membership", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    expect(api.getProjectStatus).not.toHaveBeenCalled();
  });
  it("verifies project membership independently when the host cannot confirm it", async () => {
    let resolve!: (data: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    mount("verify");
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getProjectStatus).toHaveBeenCalledWith("project-a", expect.any(AbortSignal)));
    await act(async () => { resolve(fixture()); });
    await userEvent.click(await screen.findByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Maya Client")).toBeVisible();
  });
  it("does not expose an unconfirmed project's status after an access denial", async () => {
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Unavailable"));
    const view = mount("verify");
    await waitFor(() => expect(api.getProjectStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    expect(screen.queryByText("Maya Client")).not.toBeInTheDocument();
    expect(view.client.getQueriesData({ queryKey: api.projectStatusKeys.project("project-a") }).every(([, data]) => data === undefined)).toBe(true);
  });
  it("rechecks a cached status before showing it in an unconfirmed project context", async () => {
    let resolve!: (data: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(api.projectStatusKeys.detail("project-a", "viewer-a:client"), fixture());
    render(<QueryClientProvider client={client}><ProjectStatusButton projectId="project-a" /></QueryClientProvider>);
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getProjectStatus).toHaveBeenCalledWith("project-a", expect.any(AbortSignal)));
    await act(async () => { resolve(fixture()); });
    expect(await screen.findByRole("button", { name: "Project status" })).toBeVisible();
  });
  it("does not trust cached status after a failed fresh read, then recovers on success", async () => {
    const key = api.projectStatusKeys.detail("project-a", "viewer-a:client");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, fixture());
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    render(<QueryClientProvider client={client}><ProjectStatusButton projectId="project-a" /></QueryClientProvider>);
    await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"), { timeout: 3000 });
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    expect(screen.queryByText("Maya Client")).not.toBeInTheDocument();
    vi.mocked(api.getProjectStatus).mockResolvedValue(fixture());
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    const trigger = await screen.findByRole("button", { name: "Project status" });
    await userEvent.click(trigger);
    expect(await screen.findByText("Maya Client")).toBeVisible();
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("out of date");
    expect(trigger).toBeVisible();
    expect(screen.getByText("Maya Client")).toBeVisible();
  });
  it("does not show the previous project's delayed verification result", async () => {
    const pending = new Map<string, (data: ProjectStatusSummary) => void>();
    vi.mocked(api.getProjectStatus).mockImplementation(id => new Promise(done => { pending.set(id, done); }));
    const view = mount("verify");
    await waitFor(() => expect(pending.has("project-a")).toBe(true));
    view.change("project-b", "verify");
    await waitFor(() => expect(pending.has("project-b")).toBe(true));
    await act(async () => { pending.get("project-a")!(fixture("project-a")); });
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    await act(async () => { pending.get("project-b")!(fixture("project-b")); });
    await userEvent.click(await screen.findByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Garden residence")).toBeVisible();
    expect(screen.queryByText("Courtyard residence")).not.toBeInTheDocument();
  });
  it("supports keyboard dismissal and focus restoration with accessible dialog content", async () => {
    mount();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Project status" });
    await user.click(trigger);
    await screen.findByText("Maya Client");
    const dialog = screen.getByRole("dialog", { name: "Project status" });
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows concurrent work, unassigned roles, and recorded schedules", async () => {
    const data = fixture(); data.state = "scheduled";
    data.pendingActions.push({ ...data.pendingActions[0]!, id: "measure", stageLabel: "Site measurement", action: "Assign measurement team member", people: [], responsibleRole: "designer", state: "unassigned", scheduledAt: "2026-10-02T09:00:00Z", blocker: "Site access is unavailable" });
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Assignment needed")).toBeVisible();
    expect(screen.getByText("Also pending · Site measurement")).toBeVisible();
    expect(screen.getByText("Scheduled for")).toBeVisible();
    expect(screen.getByText("Site access is unavailable")).toBeVisible();
  });
  it("labels future scheduled work without presenting it as due now", async () => {
    const data = fixture();
    data.state = "scheduled";
    data.pendingActions[0]!.state = "scheduled";
    data.pendingActions[0]!.scheduledAt = "2026-10-02T09:00:00Z";
    data.pendingActions.push({ ...data.pendingActions[0]!, id: "follow-up", state: "pending", scheduledAt: null, action: "Confirm the next step" });
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Scheduled with")).toBeVisible();
    expect(screen.getByText("Pending with")).toBeVisible();
    expect(screen.getByText("Scheduled for")).toBeVisible();
  });
  it("refreshes the owner without replacing it with fabricated defaults", async () => {
    mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    await screen.findByText("Maya Client");
    const revised = fixture(); revised.pendingActions[0]!.people = [{ id: "sales-a", name: "Arun Sales", role: "estimator_sales" }];
    vi.mocked(api.getProjectStatus).mockResolvedValue(revised);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Arun Sales")).toBeVisible();
    expect(screen.queryByText("Maya Client")).not.toBeInTheDocument();
  });
  it("labels retained data after a transient error", async () => {
    const view = mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    await screen.findByText("Maya Client");
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: api.projectStatusKeys.all }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("out of date");
    expect(screen.getByText("Maya Client")).toBeVisible();
  });
  it("purges cached content on access removal", async () => {
    const view = mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    await screen.findByText("Maya Client");
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    await act(async () => { await view.client.refetchQueries({ queryKey: api.projectStatusKeys.all }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Maya Client")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument();
    expect(view.client.getQueriesData({ queryKey: api.projectStatusKeys.all }).every(([, data]) => data === undefined)).toBe(true);
  });
  it("closes on project change and never shows the old project", async () => {
    const view = mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    await screen.findByText("Courtyard residence");
    view.change("project-b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Garden residence")).toBeVisible();
    expect(screen.queryByText("Courtyard residence")).not.toBeInTheDocument();
  });
  it("resets the open panel when the signed-in identity changes", async () => {
    const view = mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    await screen.findByText("Maya Client");
    mocks.id = "viewer-b"; view.change("project-a");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Maya Client")).not.toBeInTheDocument();
  });
  it("handles a loading request and a source issue", async () => {
    let resolve!: (data: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    mount(); await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(screen.getByText("Loading project status…")).toBeVisible();
    await act(async () => { resolve({ ...fixture(), state: "unavailable", currentStage: null, pendingActions: [], issue: "The approved source needs review." }); });
    expect(await screen.findByText("The approved source needs review.")).toBeVisible();
    expect(screen.queryByText("Assignment needed")).not.toBeInTheDocument();
  });
  it("polls while visible, refreshes on focus, and stops after closing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount(); fireEvent.click(screen.getByRole("button", { name: "Project status" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      const before = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
      expect(vi.mocked(api.getProjectStatus).mock.calls.length).toBeGreaterThan(before);
      act(() => focusManager.setFocused(false));
      const hidden = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(hidden);
      await act(async () => { focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(100); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(hidden + 1);
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close project status" }));
      const closed = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(closed);
    } finally { focusManager.setFocused(undefined); vi.useRealTimers(); }
  });
});
