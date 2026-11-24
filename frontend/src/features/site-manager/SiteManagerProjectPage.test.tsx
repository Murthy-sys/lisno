import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionKeys, type ExecutionWork } from "../execution/executionApi";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import { SiteManagerProjectPage } from "./SiteManagerProjectPage";
import { siteWorkStatus } from "./siteManagerPresentation";

const statusAccess = vi.hoisted(() => ({ enabled: false }));
beforeEach(() => { statusAccess.enabled = false; });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "site-one", role: "site_manager" }, authorization: { role: "site_manager", permissions: ["procurement.site_completion.manage", ...(statusAccess.enabled ? ["projects.status.read"] : [])] } }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
const proposal: ExecutionWork = { ...executionFixture, status: "awaiting_schedule", progress: 0, latestNote: "Staff internal note", schedule: null, latestVendorReport: null, latestReportAt: null,
  proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-13", reason: "Site ready" }, allowedActions: ["hold", "confirm_schedule"] };
function mount(path = "/projects/project-one/execution") { return renderWithQuery(<MemoryRouter initialEntries={[path]}><SiteManagerProjectPage projectId="project-one" /></MemoryRouter>); }
function setup(items: ExecutionWork[] = [proposal]) {
  server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { ...executionPageFixture(items), project: { ...executionPageFixture(items).project!, projectNumber: "Lisno000011" } } })), http.get("/api/v1/execution/work/:id", ({ params }) => HttpResponse.json({ data: items.find(item => item.id === params.id) ?? proposal })),
    http.get("/api/v1/execution/work/:id/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })));
}

describe("selected Project Manager project", () => {
  it.each([false, true])("owns a project-header chip only when embedded is %s", async embedded => {
    statusAccess.enabled = true; setup([]); let statusReads = 0;
    server.use(http.get("/api/v1/projects/project-one/status", () => { statusReads++; return HttpResponse.json({ data: {
      projectId: "project-one", projectName: "Oak residence", projectStatus: "active", serverNow: "2026-11-24T09:00:00Z",
      state: "active", currentStage: { key: "site", label: "Site measurement" }, issue: null,
      pendingActions: [{ id: "measure-a", stageKey: "site", stageLabel: "Site measurement", action: "Measure the site", responsibleRole: "designer", people: [{ id: "designer-a", name: "Maya Designer", role: "designer" }], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }]
    } }); }));
    renderWithQuery(<MemoryRouter><SiteManagerProjectPage projectId="project-one" embedded={embedded} /></MemoryRouter>);
    await screen.findByText("No issued vendor work for this project yet.");
    if (embedded) {
      expect(screen.queryByRole("button", { name: "Project status for Oak residence" })).not.toBeInTheDocument();
      expect(statusReads).toBe(0);
    } else {
      const chip = await screen.findByRole("button", { name: "Project status for Oak residence" });
      expect(chip).toHaveClass("project-status-chip");
      expect(chip.closest("header")).toContainElement(screen.getByRole("heading", { name: "Oak residence", level: 1 }));
      expect(screen.getAllByRole("button", { name: "Project status for Oak residence" })).toHaveLength(1);
      expect(chip.closest("details")).toBeNull();
    }
  });

  it("exposes proposed schedule confirmation in a compact detail without eagerly loading history", async () => {
    setup(); let historyReads = 0; const writes: unknown[] = [];
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(http.get("/api/v1/execution/work/work-one/history", () => { historyReads++; return HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } }); }),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ data: { ...proposal, version: 5, proposedSchedule: null, schedule: executionFixture.schedule } }); }));
    const user = userEvent.setup(); mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
    expect(screen.getByText("Schedule proposed")).toBeVisible();
    expect(screen.getByText("Project ID: Lisno000011")).toBeVisible();
    const trigger = screen.getByRole("button", { name: "Confirm schedule: Oak wall panelling, Oak Works" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Oak wall panelling" });
    expect(within(dialog).getByRole("form", { name: "Review work" })).toBeVisible();
    expect(within(dialog).queryByRole("combobox", { name: "Action" })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Start date/)).toHaveValue("2026-10-09");
    expect(screen.queryByText("Staff internal note")).not.toBeInTheDocument();
    expect(historyReads).toBe(0);
    await user.click(within(dialog).getByText("Activity history"));
    await waitFor(() => expect(historyReads).toBe(1));
    await user.click(within(dialog).getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "confirm_schedule", expectedVersion: 4, startDate: "2026-10-09", finishDate: "2026-10-13" });
    await screen.findByText("Update saved.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-manager"] });
    invalidate.mockRestore();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps project-wide statistics stable when the server filters the vendor work", async () => {
    setup(); const reads: URL[] = [];
    server.use(http.get("/api/v1/projects/project-one/execution", ({ request }) => { const url = new URL(request.url); reads.push(url); const filtered = Boolean(url.searchParams.get("flag")); const page = executionPageFixture(filtered ? [] : [proposal]); return HttpResponse.json({ data: { ...page, projectCounts: { ...page.counts, open: 14, blocked: 3, awaitingVerification: 4 }, counts: { ...page.counts, open: filtered ? 0 : 14 } } }); }));
    const user = userEvent.setup(); mount();
    const summary = await screen.findByRole("region", { name: "Project execution statistics" });
    expect(within(summary).getByText("14")).toBeVisible();
    expect(screen.getByLabelText("Needs attention")).not.toBeVisible();
    await user.click(screen.getByText("More filters"));
    await user.selectOptions(screen.getByLabelText("Needs attention"), "blocked");
    expect(await screen.findByText("No vendor work matches these filters.")).toBeVisible();
    expect(reads.at(-1)?.searchParams.get("flag")).toBe("blocked");
    expect(within(summary).getByText("14")).toBeVisible();
    expect(screen.getAllByRole("region", { name: "Project execution statistics" })).toHaveLength(1);
  });

  it("shows only the actual current-round vendor report and separates an old blocked report from current verification", async () => {
    const work = { ...executionFixture, status: "site_verified" as const, progress: 100, allowedActions: [], latestNote: "Staff hold note is not a vendor report", latestVendorReport: { eventId: "vendor-report", executionRound: 1, reportedAt: "2026-10-09T09:00:00Z", note: "Entrance locked", progress: 40, status: "blocked" as const, reason: "No site key", nextAction: "Manager to provide access" } };
    setup([work, { ...proposal, id: "work-two", itemName: "Second line" }]); mount("/projects/project-one/execution?view=updates");
    expect(await screen.findByText("Entrance locked")).toBeVisible();
    expect(screen.getByText("Verified by Project Manager", { selector: "span" })).toBeVisible();
    expect(screen.queryByText("Hold reason:")).not.toBeInTheDocument();
    expect(screen.queryByText("No site key")).not.toBeInTheDocument();
    expect(screen.queryByText("Manager to provide access")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Work view" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Vendor work" })).toBeVisible();
    expect(screen.queryByText("Staff hold note is not a vendor report")).not.toBeInTheDocument();
    expect(screen.getByText("No vendor update for the current round.")).toBeVisible();
  });

  it("shows a single photo-update list with compact statistics and optional project context", async () => {
    const work: ExecutionWork = { ...executionFixture, progress: 0, imageIds: ["photo-one", "photo-two"], allowedActions: [],
      latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "progress", progress: 0, note: "Today's site photos" } };
    setup([work, { ...work, id: "old-round", itemName: "Second line", executionRound: 2, latestVendorReport: { ...work.latestVendorReport!, note: "Old round update" } }]);
    mount();
    const list = await screen.findByRole("list", { name: "Vendor work" });
    expect(within(list).getByText("Today's site photos")).toBeVisible();
    expect(within(list).queryByText("Old round update")).not.toBeInTheDocument();
    expect(within(list).getAllByText("2 photos")).toHaveLength(2);
    expect(within(list).getByRole("button", { name: "View work: Oak wall panelling, Oak Works" })).toBeVisible();
    expect(within(list).getByText("In progress")).toBeVisible();
    expect(within(list).queryByText(/\d+%|Next:|Workflow owner/)).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Project execution statistics" });
    expect(within(summary).getAllByRole("term").filter(term => !term.closest("details")).map(term => term.textContent)).toEqual(["Open", "On hold", "Awaiting verification", "Missing updates"]);
    expect(within(summary).getByText("Overdue")).not.toBeVisible();
    expect(screen.getByText("Project team").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps a current hold reason distinct from completed work awaiting review", async () => {
    const held: ExecutionWork = { ...executionFixture, status: "blocked", progress: 0, allowedActions: [], latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "hold", progress: 0, status: "blocked", note: "Waiting for access", reason: "Waiting for access" } };
    const completed: ExecutionWork = { ...executionFixture, id: "completed", itemName: "Completed line", status: "awaiting_verification", progress: 100, allowedActions: ["verify"], imageIds: ["photo-one", "photo-two"], submission: { id: "submission-one", submittedAt: "2026-10-09T09:00:00Z", note: "Ready for inspection", imageIds: ["photo-one"], version: 1 } };
    setup([held, completed]); mount();
    const list = await screen.findByRole("list", { name: "Vendor work" });
    expect(within(list).getByText("On hold")).toBeVisible();
    expect(within(list).getByText("Hold reason:").parentElement).toHaveTextContent("Waiting for access");
    expect(within(list).getByText("Completed by vendor")).toBeVisible();
    expect(within(list).getByText("Awaiting your verification")).toBeVisible();
    expect(within(list).getByText("1 photo")).toBeVisible();
    expect(within(list).queryByText("2 photos")).not.toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Review completion: Completed line, Oak Works" })).toBeVisible();
  });

  it.each(["daily", "flag"] as const)("shows missing-update attention from %s and the saved overdue flag", async source => {
    setup([{ ...executionFixture, flags: ["overdue", ...(source === "flag" ? ["missing_update"] : [])], daily: { ...executionFixture.daily, state: source === "daily" ? "missing" : "due" } }]);
    mount();
    const list = await screen.findByRole("list", { name: "Vendor work" });
    expect(within(list).getByText("Vendor update missing")).toBeVisible();
    expect(within(list).getByText("· Overdue").closest("p")).toHaveTextContent("Finish 18 Oct 2026 · Overdue");
  });

  it("opens exact completion verification and preserves edited notes across a live version change", async () => {
    const work: ExecutionWork = { ...executionFixture, status: "awaiting_verification", progress: 100, allowedActions: ["request_changes", "verify"], submission: { id: "submission-one", submittedAt: "2026-10-09T09:00:00Z", note: "Ready for inspection", imageIds: ["photo-one"], version: 1 } };
    setup([work]); const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><MemoryRouter><FeedbackProvider><SiteManagerProjectPage projectId="project-one" /></FeedbackProvider></MemoryRouter></QueryClientProvider>);
    await user.click(await screen.findByRole("button", { name: "Review completion: Oak wall panelling, Oak Works" }));
    const note = await screen.findByRole("textbox", { name: "Verification note" });
    await user.type(note, "Check final joint");
    client.setQueryData(executionKeys.detail(work.id), { ...work, version: 5 });
    expect(await screen.findByText(/This assignment changed while you were editing/)).toBeVisible();
    expect(note).toHaveValue("Check final joint");
    expect(screen.getByRole("button", { name: "Verify completion" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(note).toHaveValue("Check final joint");
  });

  it("loads Client handoff only on demand and protects its unsaved draft", async () => {
    setup(); let completionReads = 0;
    server.use(http.get("/api/v1/projects/project-one/site-completion", () => { completionReads++; return HttpResponse.json({ data: { projectId: "project-one", projectStatus: "active", version: 3, progress: 40, note: "", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false, blockers: ["Vendor work still needs verification."], review: null } }); }));
    const user = userEvent.setup(); mount(); await screen.findByRole("heading", { level: 1, name: "Oak residence" });
    expect(completionReads).toBe(0);
    await user.click(screen.getByText("Project actions"));
    await user.click(screen.getByRole("button", { name: "Completion & Client handoff" }));
    await user.type(await screen.findByRole("textbox", { name: "Completion note" }), "Keep this inspection note");
    expect(screen.getByText("Vendor work still needs verification.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete and send to Client" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Completion note" })).toHaveValue("Keep this inspection note");
    expect(completionReads).toBe(1);
  });

  it("preserves an open handoff draft when a live execution refresh fails", async () => {
    setup(); const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    server.use(http.get("/api/v1/projects/project-one/site-completion", () => HttpResponse.json({ data: { projectId: "project-one", projectStatus: "active", version: 3, progress: 40, note: "", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false, blockers: [], review: null } })));
    render(<QueryClientProvider client={client}><MemoryRouter><FeedbackProvider><SiteManagerProjectPage projectId="project-one" /></FeedbackProvider></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup(); await screen.findByRole("heading", { level: 1, name: "Oak residence" });
    await user.click(screen.getByText("Project actions"));
    await user.click(screen.getByRole("button", { name: "Completion & Client handoff" }));
    const note = await screen.findByRole("textbox", { name: "Completion note" });
    await user.type(note, "Retain this inspection draft");
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporary failure" } }, { status: 500 })));
    await act(async () => { await client.invalidateQueries({ queryKey: ["execution", "project", "project-one"] }); });
    expect(await screen.findByText(/Refresh failed. Project information may be out of date/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Completion & Client handoff" })).toBeVisible();
    expect(note).toHaveValue("Retain this inspection draft");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(note).toHaveValue("Retain this inspection draft");
  });

  it("removes cached project identity, report and open detail when assignment access is revoked", async () => {
    setup(); const user = userEvent.setup(); mount();
    await screen.findByRole("heading", { level: 1, name: "Oak residence" });
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "Unavailable" } }, { status: 404 })));
    await user.click(screen.getByRole("button", { name: "Refresh project" }));
    expect(await screen.findByText("You no longer have access to this project.")).toBeVisible();
    expect(screen.queryByText("Oak residence")).not.toBeInTheDocument();
    expect(screen.queryByText("Project ID: Lisno000011")).not.toBeInTheDocument();
    expect(screen.queryByText("Project ID not assigned")).not.toBeInTheDocument();
    expect(screen.queryByText("Oak Works")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm schedule:/ })).not.toBeInTheDocument();
  });

  it.each([false, true])("guards browser Back and reload while a schedule draft is unsaved (same project: %s)", async sameProject => {
    setup([{ ...proposal, schedule: executionFixture.schedule }]); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([{ path: "/home", element: <h1>Assigned project home</h1> }, { path: "/projects/:projectId/execution", element: <SiteManagerProjectPage /> }], { initialEntries: [sameProject ? "/projects/project-one/execution" : "/home", "/projects/project-one/execution?assignment=work-one"], initialIndex: 1 });
    render(<QueryClientProvider client={client}><FeedbackProvider><RouterProvider router={router} /></FeedbackProvider></QueryClientProvider>);
    const user = userEvent.setup();
    await screen.findByRole("form", { name: "Review work" });
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Pending agreed dates");
    const reload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);
    await act(async () => { await router.navigate(-1); });
    expect(await screen.findByRole("alertdialog", { name: "Leave project with unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Pending agreed dates");
    await act(async () => { await router.navigate(-1); });
    await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
    if (sameProject) {
      expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } else expect(await screen.findByRole("heading", { name: "Assigned project home" })).toBeVisible();
  });
});


describe("Project Manager work status", () => {
  it.each(["started", "progress"] as const)("uses the current-round %s update without a percentage", updateType => {
    expect(siteWorkStatus({ ...executionFixture, progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType, progress: 0 } })).toBe(updateType === "started" ? "Started working" : "In progress");
  });
  it.each([
    ["awaiting_verification", "Completed by vendor"], ["site_verified", "Verified by Project Manager"],
    ["awaiting_client", "With Client"], ["client_approved", "Client accepted"]
  ] as const)("keeps %s distinct as %s", (status, expected) => {
    expect(siteWorkStatus({ ...executionFixture, status, progress: 100 })).toBe(expected);
  });
  it("does not reuse a prior-round update type", () => {
    expect(siteWorkStatus({ ...executionFixture, executionRound: 2, progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "progress", progress: 0 } })).toBe("Started working");
  });
});
