import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { ProjectStatusButton } from "./ProjectStatusButton";
import * as api from "./projectStatusApi";

const mocks = vi.hoisted(() => ({ role: "client" as "client" | "designer" | "worker_electrician", id: "viewer-a" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: mocks.id, role: mocks.role }, status: "authenticated", authorization: authorizationFor(mocks.role) }) }));

const fixture = (projectId = "project-a"): ProjectStatusSummary => ({
  projectId, projectNumber: projectId === "project-a" ? "Lisno000011" : "Lisno000027", projectName: projectId === "project-a" ? "Courtyard residence" : "Garden residence", projectStatus: "active", serverNow: "2026-10-01T08:00:00Z", state: "active",
  currentStage: { key: "estimate_review", label: "Estimate approval" }, issue: null,
  pendingActions: [{ id: "review-a", stageKey: "estimate_review", stageLabel: "Estimate approval", action: "Review the submitted estimate", responsibleRole: "client", people: [{ id: "client-a", name: "Maya Client", role: "client" }], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }]
});
function mount(participant: boolean | "verify" = true, projectId = "project-a", presentation: "button" | "chip" = "button") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const control = (id: string, member: boolean | "verify") => <ProjectStatusButton projectId={id} presentation={presentation} {...(member === "verify" ? {} : { participant: member })} />;
  const view = render(<QueryClientProvider client={client}><main><h1>Project workspace</h1>{control(projectId, participant)}</main></QueryClientProvider>);
  return { ...view, client, change: (id: string, member: boolean | "verify" = true) => view.rerender(<QueryClientProvider client={client}><main><h1>Project workspace</h1>{control(id, member)}</main></QueryClientProvider>) };
}

beforeEach(() => {
  mocks.role = "client"; mocks.id = "viewer-a";
  vi.spyOn(api, "getProjectStatus").mockImplementation(async id => fixture(id));
});

describe("Project status", () => {
  it("shows all secondary measurement owners from the server and refreshes to the primary's team-assignment responsibility", async () => {
    mocks.role = "designer";
    const data = fixture();
    data.currentStage = { key: "site_measurement", label: "On Site Actual Measurement" };
    data.pendingActions = [{ id: "measurement", stageKey: "site_measurement", stageLabel: "On Site Actual Measurement",
      action: "Complete the site measurement and upload the site photos or videos.", responsibleRole: "designer", state: "pending",
      people: [{ id: "secondary-a", name: "Secondary A", role: "designer" }, { id: "secondary-b", name: "Secondary B", role: "designer" }],
      scheduledAt: null, deadlineAt: null, blocker: null }];
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    const view = mount();
    await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(await screen.findByText("Secondary A")).toBeVisible();
    expect(screen.getByText("Secondary B")).toBeVisible();
    expect(screen.queryByText("Primary Designer")).not.toBeInTheDocument();
    const emptyTeam = { ...data, pendingActions: [{ ...data.pendingActions[0]!,
      action: "Assign a Secondary Designer in Design team to carry out onsite measurement.",
      people: [{ id: "primary", name: "Primary Designer", role: "designer" as const }] }] };
    vi.mocked(api.getProjectStatus).mockResolvedValue(emptyTeam);
    await act(async () => { await view.client.invalidateQueries({ queryKey: api.projectStatusKeys.project("project-a") }); });
    expect(await screen.findByText("Primary Designer")).toBeVisible();
    expect(screen.getByText("Assign a Secondary Designer in Design team to carry out onsite measurement.")).toBeVisible();
    expect(screen.queryByText("Secondary A")).not.toBeInTheDocument();
    expect(screen.queryByText("Secondary B")).not.toBeInTheDocument();
  });

  it("shows missing identity only after an authorized status has loaded", async () => {
    let resolve!: (data: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Project status" }));
    expect(screen.queryByText("Project ID not assigned")).not.toBeInTheDocument();
    await act(async () => { resolve({ ...fixture(), projectNumber: null }); });
    expect(await screen.findByText("Project ID not assigned")).toBeVisible();
  });

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
    expect(screen.getByText("Project ID: Lisno000027")).toBeVisible();
    expect(screen.queryByText("Project ID: Lisno000011")).not.toBeInTheDocument();
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
    expect(screen.getByText("Project ID: Lisno000027")).toBeVisible();
    expect(screen.queryByText("Project ID: Lisno000011")).not.toBeInTheDocument();
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


describe("Project status header chip", () => {
  it("shows current ownership before opening and retains all people and tasks in details", async () => {
    const data = fixture();
    data.pendingActions[0]!.people.push({ id: "client-b", name: "Noah Client", role: "client" });
    data.pendingActions.push({ ...data.pendingActions[0]!, id: "measure", stageKey: "measurement", stageLabel: "Site measurement", action: "Take measurements", people: [{ id: "designer-b", name: "Arun Designer", role: "designer" }] });
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount(true, "project-a", "chip");
    const chip = screen.getByRole("button", { name: "Project status" });
    expect(chip).toHaveTextContent("Loading project status");
    await waitFor(() => expect(chip).toHaveTextContent("Owner: Maya Client +1"));
    expect(chip).toHaveTextContent("Estimate approval");
    expect(chip).toHaveTextContent("+1 task");
    expect(chip).toHaveAccessibleDescription(expect.stringContaining("Noah Client (Client)"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    chip.focus(); await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Project status" });
    expect(within(dialog).getByText("Noah Client")).toBeVisible();
    expect(within(dialog).getByText("Arun Designer")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it.each([
    ["paused", "pending", "On hold · Estimate approval", true],
    ["scheduled", "scheduled", "Scheduled · Estimate approval", true],
    ["active", "blocked", "Blocked · Estimate approval", true],
    ["completed", "pending", "Completed", false],
    ["no_pending", "pending", "No pending tasks", false],
    ["unavailable", "pending", "Status needs review", false]
  ] as const)("presents %s / %s without inventing an owner", async (state, actionState, label, owner) => {
    const data = fixture(); data.state = state; data.pendingActions[0]!.state = actionState;
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount(true, "project-a", "chip");
    const chip = screen.getByRole("button", { name: "Project status" });
    await waitFor(() => expect(chip).toHaveTextContent(label));
    expect(chip.textContent?.includes("Owner: Maya Client")).toBe(owner);
  });

  it("labels unassigned work with its responsible role and never the viewer", async () => {
    const data = fixture(); data.pendingActions[0]!.people = []; data.pendingActions[0]!.responsibleRole = "designer";
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount(true, "project-a", "chip");
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Unassigned · Designer"));
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });

  it("does not assign an unrelated action's owner to the current stage", async () => {
    const data = fixture(); data.currentStage = { key: "other", label: "Other stage" };
    vi.mocked(api.getProjectStatus).mockResolvedValue(data);
    mount(true, "project-a", "chip");
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Status needs review"));
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });

  it("waits for a fresh read before revealing cached header ownership", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(api.projectStatusKeys.detail("project-a", "viewer-a:client"), fixture());
    let resolve!: (value: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<QueryClientProvider client={client}><ProjectStatusButton projectId="project-a" participant presentation="chip" /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Loading project status");
    expect(screen.queryByText(/Maya Client/)).not.toBeInTheDocument();
    const fresh = fixture(); fresh.pendingActions[0]!.people = [{ id: "new-owner", name: "New Owner", role: "designer" }];
    await act(async () => { resolve(fresh); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Owner: New Owner"));
  });

  it("shows retry on an initial failure and marks previously verified owners as out of date", async () => {
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    const view = mount(true, "project-a", "chip");
    const key = api.projectStatusKeys.detail("project-a", "viewer-a:client");
    await waitFor(() => expect(view.client.getQueryState(key)?.status).toBe("error"), { timeout: 3000 });
    const chip = screen.getByRole("button", { name: "Project status" });
    expect(chip).toHaveTextContent("Status unavailable");
    expect(chip).toHaveTextContent("Open to retry");
    vi.mocked(api.getProjectStatus).mockResolvedValue(fixture());
    await userEvent.click(chip);
    await waitFor(() => expect(chip).toHaveTextContent("Owner: Maya Client"));
    await userEvent.keyboard("{Escape}");
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: key }); });
    expect(chip).toHaveTextContent("Owner: Maya Client");
    await waitFor(() => expect(chip).toHaveTextContent("Out of date"));
  });

  it("clears the chip and cached people after access is revoked", async () => {
    const view = mount(true, "project-a", "chip");
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Owner: Maya Client"));
    vi.mocked(api.getProjectStatus).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Unavailable"));
    await act(async () => { await view.client.refetchQueries({ queryKey: api.projectStatusKeys.project("project-a") }); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Project status" })).not.toBeInTheDocument());
    expect(screen.queryByText(/Maya Client/)).not.toBeInTheDocument();
    expect(view.client.getQueriesData({ queryKey: api.projectStatusKeys.project("project-a") }).every(([, data]) => data === undefined)).toBe(true);
  });

  it("never flashes old ownership on project or viewer changes or a mismatched response", async () => {
    const view = mount(true, "project-a", "chip");
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Maya Client"));
    let resolve!: (value: ProjectStatusSummary) => void;
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    view.change("project-b");
    expect(screen.queryByText(/Maya Client/)).not.toBeInTheDocument();
    await act(async () => { resolve(fixture("project-a")); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Status unavailable"));
    const other = fixture("project-b"); other.pendingActions[0]!.people = [{ id: "owner-b", name: "Owner B", role: "designer" }];
    vi.mocked(api.getProjectStatus).mockResolvedValue(other);
    await act(async () => { await view.client.invalidateQueries({ queryKey: api.projectStatusKeys.project("project-b") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Project status" })).toHaveTextContent("Owner B"));
    vi.mocked(api.getProjectStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
    mocks.id = "viewer-b"; view.change("project-b");
    expect(screen.queryByText(/Owner B/)).not.toBeInTheDocument();
  });

  it("polls a visible chip with its drawer closed and stops for hidden or unmounted views", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const view = mount(true, "project-a", "chip");
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      const before = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(before + 1);
      act(() => focusManager.setFocused(false));
      const hidden = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(hidden);
      await act(async () => { focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(100); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(hidden + 1);
      view.unmount(); const unmounted = vi.mocked(api.getProjectStatus).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(api.getProjectStatus).toHaveBeenCalledTimes(unmounted);
    } finally { focusManager.setFocused(undefined); vi.useRealTimers(); }
  });

  it("deduplicates same-project reads and returns focus to the contextual chip after nested status dismissal", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><main><h1>Work list</h1><ProjectStatusButton projectId="project-a" presentation="chip" participant />
      <ContextPanel title="Selected work" onClose={vi.fn()} headerActions={<ProjectStatusButton projectId="project-a" presentation="chip" participant />}><p>Selected project work</p></ContextPanel>
    </main></QueryClientProvider>);
    const detail = screen.getByRole("dialog", { name: "Selected work" });
    const chip = within(detail).getByRole("button", { name: "Project status" });
    await waitFor(() => expect(chip).toHaveTextContent("Maya Client"));
    expect(api.getProjectStatus).toHaveBeenCalledTimes(1);
    chip.focus(); await userEvent.keyboard("{Enter}");
    const status = await screen.findByRole("dialog", { name: "Project status" });
    expect((await axe.run(status, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(chip).toHaveFocus());
    expect(detail).toBeVisible();
  });
});
