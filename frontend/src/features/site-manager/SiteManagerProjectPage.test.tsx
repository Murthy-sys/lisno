import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionKeys, type ExecutionWork } from "../execution/executionApi";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import { SiteManagerProjectPage } from "./SiteManagerProjectPage";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "site-one", role: "site_manager" }, authorization: { role: "site_manager", permissions: ["procurement.site_completion.manage"] } }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
const proposal: ExecutionWork = { ...executionFixture, status: "awaiting_schedule", progress: 0, latestNote: "Staff internal note", schedule: null, latestVendorReport: null, latestReportAt: null,
  proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-13", reason: "Site ready" }, allowedActions: ["hold", "confirm_schedule"] };
function mount(path = "/projects/project-one/execution") { return renderWithQuery(<MemoryRouter initialEntries={[path]}><SiteManagerProjectPage projectId="project-one" /></MemoryRouter>); }
function setup(items: ExecutionWork[] = [proposal]) {
  server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture(items) })), http.get("/api/v1/execution/work/:id", ({ params }) => HttpResponse.json({ data: items.find(item => item.id === params.id) ?? proposal })),
    http.get("/api/v1/execution/work/:id/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })));
}

describe("selected Site Manager project", () => {
  it("exposes proposed schedule confirmation in a compact detail without eagerly loading history", async () => {
    setup(); let historyReads = 0; const writes: unknown[] = [];
    server.use(http.get("/api/v1/execution/work/work-one/history", () => { historyReads++; return HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } }); }),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ data: { ...proposal, version: 5, proposedSchedule: null, schedule: executionFixture.schedule } }); }));
    const user = userEvent.setup(); mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
    expect(screen.getByText("Schedule proposed")).toBeVisible();
    const trigger = screen.getByRole("button", { name: "Confirm schedule: Oak wall panelling, Oak Works" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Oak wall panelling" });
    expect(within(dialog).getByRole("combobox", { name: "Action" })).toHaveValue("confirm_schedule");
    expect(within(dialog).getByLabelText(/Start date/)).toHaveValue("2026-10-09");
    expect(screen.queryByText("Staff internal note")).not.toBeInTheDocument();
    expect(historyReads).toBe(0);
    await user.click(within(dialog).getByText("Activity history"));
    await waitFor(() => expect(historyReads).toBe(1));
    await user.click(within(dialog).getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "confirm_schedule", expectedVersion: 4, startDate: "2026-10-09", finishDate: "2026-10-13" });
    await screen.findByText("Update saved.");
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
    expect(screen.getByText("Current: Site verified")).toBeVisible();
    expect(screen.getByText("Reported reason:").parentElement).toHaveTextContent("No site key");
    expect(screen.getByText("Reported next action:").parentElement).toHaveTextContent("Manager to provide access");
    expect(screen.queryByText("Blocker:")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff hold note is not a vendor report")).not.toBeInTheDocument();
    expect(screen.getByText("No vendor update for the current round.")).toBeVisible();
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
    expect(screen.queryByText("Oak Works")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm schedule:/ })).not.toBeInTheDocument();
  });

  it.each([false, true])("guards browser Back and reload while a schedule draft is unsaved (same project: %s)", async sameProject => {
    setup(); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([{ path: "/home", element: <h1>Assigned project home</h1> }, { path: "/projects/:projectId/execution", element: <SiteManagerProjectPage /> }], { initialEntries: [sameProject ? "/projects/project-one/execution" : "/home", "/projects/project-one/execution?assignment=work-one"], initialIndex: 1 });
    render(<QueryClientProvider client={client}><FeedbackProvider><RouterProvider router={router} /></FeedbackProvider></QueryClientProvider>);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Action" }), "confirm_schedule");
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
