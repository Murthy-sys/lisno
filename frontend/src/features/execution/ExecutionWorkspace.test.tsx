import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ExecutionPortfolioPage, ProjectExecutionPage, ProjectExecutionTracker, VendorExecutionWorkspace } from "./ExecutionWorkspace";
import { ExecutionDetailPanel } from "./ExecutionDetailPanel";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";
import { executionFixture, executionPageFixture } from "./executionTestFixtures";
import type { ExecutionWork } from "./executionApi";
const authState = vi.hoisted(() => ({ user: { id: "manager-one", role: "site_manager" }, authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider",() => ({ useAuth: () => authState }));
beforeEach(() => { authState.authorization = authorizationFor("site_manager", []); });
vi.mock("./ExecutionLiveProvider",() => ({useExecutionConnection:() => "live"}));

describe("execution project workflow", () => {
  it("shows the authorized execution identity without general project read permission", async () => {
    const page = executionPageFixture([]);
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { ...page, project: { ...page.project!, projectNumber: "Lisno000011" } } })));
    renderWithQuery(<MemoryRouter><ProjectExecutionPage projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByText("Project ID: Lisno000011")).toBeVisible();
    expect(screen.queryByText("Project ID not assigned")).not.toBeInTheDocument();
  });

  it("distinguishes same-name vendor project assignments using authorized work metadata", async () => {
    const items = [
      { ...executionFixture, projectNumber: "Lisno000011" },
      { ...executionFixture, id: "work-two", projectId: "project-two", projectNumber: "Lisno000027" }
    ];
    server.use(http.get("/api/v1/vendor/work/execution", () => HttpResponse.json({ data: executionPageFixture(items) })));
    renderWithQuery(<MemoryRouter><VendorExecutionWorkspace /></MemoryRouter>);
    const rows = await screen.findByRole("region", { name: "Main Line assignments" });
    expect(within(rows).getByText("Project ID: Lisno000011")).toBeVisible();
    expect(within(rows).getByText("Project ID: Lisno000027")).toBeVisible();
    expect(within(rows).getAllByText("Oak residence · Living room")).toHaveLength(2);
  });

  it("preserves vendor server pagination and counts while filters reset the loaded page", async () => {
    const requests: URLSearchParams[] = [];
    server.use(http.get("/api/v1/vendor/work/execution", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const offset = Number(params.get("offset") ?? 0);
      const items = Array.from({ length: offset === 0 ? 25 : 1 }, (_, index) => ({ ...executionFixture, id: `work-${offset + index + 1}` }));
      return HttpResponse.json({ data: { ...executionPageFixture(items), offset, total: 26, counts: { ...executionPageFixture().counts, open: 26 } } });
    }));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><VendorExecutionWorkspace /></MemoryRouter>);
    expect(await screen.findByText("1–25 of 26")).toBeVisible();
    expect(screen.getByLabelText("Execution counts")).toHaveTextContent("Open26");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("26–26 of 26")).toBeVisible();
    expect(requests.at(-1)?.get("offset")).toBe("25");
    await user.selectOptions(screen.getByRole("combobox", { name: "Execution status" }), "blocked");
    await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("blocked"));
    expect(requests.at(-1)?.get("offset")).toBe("0");
    await user.type(screen.getByRole("searchbox", { name: "Search Main Lines" }), "oak");
    await waitFor(() => expect(requests.at(-1)?.get("q")).toBe("oak"));
    expect(requests.at(-1)?.get("status")).toBe("blocked");
    expect(requests.at(-1)?.get("limit")).toBe("25");
    expect(screen.getByLabelText("Execution counts")).toHaveTextContent("Open26");
  });

  it("retains vendor rows after a failed refresh and clears them when read access is denied", async () => {
    let status = 200;
    server.use(http.get("/api/v1/vendor/work/execution", () => status === 200
      ? HttpResponse.json({ data: executionPageFixture() })
      : HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Assignments unavailable" } }, { status })));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><VendorExecutionWorkspace /></MemoryRouter>);
    await screen.findByRole("region", { name: "Main Line assignments" });
    status = 503;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Refresh failed. The assignments shown may be out of date. Retry before making a decision.")).toBeVisible();
    expect(screen.getByRole("region", { name: "Main Line assignments" })).toHaveTextContent("Oak wall panelling");
    status = 403;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("You no longer have access to this execution tracker.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Main Line assignments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Oak/ })).not.toBeInTheDocument();
  });

  it("shows assigned project details and pending progress before any work is issued", async () => {
    authState.authorization = authorizationFor("site_manager", ["projects.read", "projects.design_workflow.read"]);
    server.use(http.get("/api/v1/projects/project-one", () => HttpResponse.json({ data: { id: "project-one", name: "Oak residence", clientName: "Oak client", location: "Pune", status: "planning", plannedStartAt: "", plannedEndAt: "", floors: [] } })),
      http.get("/api/v1/projects/project-one/design-workflow", () => HttpResponse.json({ data: { projectId: "project-one", projectName: "Oak residence", serverNow: "2026-10-13T09:00:00Z", estimateApprovalStatus: "awaiting_approval", floors: [], projectStages: [] } })),
      http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture([]) })));
    renderWithQuery(<MemoryRouter><ProjectExecutionPage projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: "Oak residence" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Oak client");
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Pune");
    expect(await screen.findByText("Estimate approval is pending. Project progress is available for review.")).toBeVisible();
    expect(await screen.findByText("No issued vendor work for this project yet.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approve|Confirm payment|Send invitation/ })).not.toBeInTheDocument();
  });

  it("keeps execution data independent when general project details are denied", async () => {
    authState.authorization = authorizationFor("site_manager", ["projects.read", "projects.design_workflow.read"]);
    server.use(http.get("/api/v1/projects/project-one", () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "Project details unavailable." } }, { status: 404 })),
      http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture([]) })));
    renderWithQuery(<MemoryRouter><ProjectExecutionPage projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByText("Project details unavailable.")).toBeVisible();
    expect(await screen.findByText("No issued vendor work for this project yet.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Project details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
  });

  it("shows a vendor blocker next action and committed dates in the staff activity history", async () => {
    const events = [{ id: "event-blocker", action: "report", actorId: "vendor-one", occurredAt: "2026-10-09T09:00:00Z", localDate: "2026-10-09", executionRound: 1, progress: 25, note: "Awaiting site access", reason: "Site locked", nextAction: "Project Manager arranges access", startDate: null, finishDate: null, reviewDate: null },
      { id: "event-schedule", action: "confirm_schedule", actorId: "manager-one", occurredAt: "2026-10-08T09:00:00Z", localDate: "2026-10-08", executionRound: 1, progress: null, note: null, reason: null, nextAction: null, startDate: "2026-10-09", finishDate: "2026-10-15", reviewDate: null }];
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture() })), http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: executionFixture })), http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: events, total: 2, limit: 20, offset: 0 } })));
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByText("Next action: Project Manager arranges access")).toBeVisible();
    expect(screen.getByText(/Schedule:.*9 Oct 2026.*15 Oct 2026/)).toBeVisible();
  });
  it("opens notification-selected assignments and only presents backend permitted actions", async () => {
    const work = { ...executionFixture, proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-20", reason: "Materials delayed" }, allowedActions: ["confirm_schedule" as const,"hold" as const] };
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({data:executionPageFixture([work])})),http.get("/api/v1/execution/work/work-one",() => HttpResponse.json({data:work})),http.get("/api/v1/execution/work/work-one/history",() => HttpResponse.json({data:{items:[],total:0,limit:20,offset:0}})));
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByRole("dialog",{name:"Oak wall panelling"})).toBeVisible();
    expect(screen.getByRole("option",{name:"Confirm schedule"})).toBeVisible();
    expect(screen.queryByRole("option",{name:"Verify completion"})).not.toBeInTheDocument();
    expect(screen.queryByRole("option",{name:"Daily update"})).not.toBeInTheDocument();
  });
  it.each([false, true])("filters an obsolete exemption action from cached staff controls (other actions: %s)", async otherActions => {
    const work: ExecutionWork = { ...executionFixture, allowedActions: otherActions ? ["exempt_evidence", "hold"] : ["exempt_evidence"], evidenceExemption: { reason: "Legacy inspection without photos", grantedById: "manager-one" } };
    const writes: unknown[] = [];
    server.use(http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
      http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ data: work }); }));
    renderWithQuery(<MemoryRouter><ExecutionDetailPanel assignmentId="work-one" vendor={false} initialAction="exempt_evidence" onClose={vi.fn()} /></MemoryRouter>);
    await screen.findByRole("dialog", { name: "Oak wall panelling" });
    expect(screen.queryByRole("option", { name: /exemption/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exemption/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Photo exemption|Legacy inspection without photos/)).not.toBeInTheDocument();
    if (otherActions) expect(screen.getByRole("combobox", { name: "Action" })).toHaveValue("hold");
    else expect(screen.queryByRole("form", { name: "Update Main Line workflow" })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("blocks generic staff verification of a no-photo submission despite an old exemption", async () => {
    const work: ExecutionWork = { ...executionFixture, status: "awaiting_verification", allowedActions: ["verify", "request_changes"], evidenceExemption: { reason: "Old inspection exemption", grantedById: "manager-one" }, submission: { id: "submission-one", submittedAt: "2026-10-09T09:00:00Z", note: "Old completion", imageIds: [], version: 4 } };
    const writes: unknown[] = [];
    server.use(http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
      http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [{ id: "historic-exemption", action: "exempt_evidence", actorId: "manager-one", occurredAt: "2026-10-08T09:00:00Z", localDate: "2026-10-08", executionRound: 1, progress: null, note: null, reason: "Historic exemption reason", nextAction: null, startDate: null, finishDate: null, reviewDate: null }], total: 1, limit: 20, offset: 0 } })),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ data: work }); }));
    renderWithQuery(<MemoryRouter><ExecutionDetailPanel assignmentId="work-one" vendor={false} onClose={vi.fn()} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Verify completion" }));
    expect(await screen.findByText("Completion requires at least one current-round photo. Request changes so the vendor can add one.")).toBeVisible();
    expect(writes).toHaveLength(0);
    expect(await screen.findByText("Exempt Evidence")).toBeVisible();
    expect(screen.getByText("Reason: Historic exemption reason")).toBeVisible();
    expect(screen.queryByText("Photo exemption: Old inspection exemption. This exemption is not completion verification.")).not.toBeInTheDocument();
  });

  it("explains that a confirmed schedule needs a new vendor proposal before another confirmation", async () => {
    const work: ExecutionWork = { ...executionFixture, proposedSchedule: null, allowedActions: ["hold", "exempt_evidence"] };
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture([work]) })),
      http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
      http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })));
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByText("Schedule confirmed. Any date change must first be proposed by the vendor.")).toBeVisible();
    expect(screen.queryByRole("option", { name: "Confirm schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).not.toBeInTheDocument();
  });

  it("confirms the vendor's first proposal with read-only dates and removes the completed action", async () => {
    let work: ExecutionWork = { ...executionFixture, status: "awaiting_schedule", schedule: null,
      proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-20", reason: null }, allowedActions: ["confirm_schedule", "hold"] };
    const writes: unknown[] = [];
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture([work]) })),
      http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
      http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
        writes.push(await request.json());
        work = { ...work, version: 5, status: "not_started", proposedSchedule: null, allowedActions: ["hold"],
          schedule: { startDate: "2026-10-09", finishDate: "2026-10-20", revision: 1, confirmedAt: "2026-10-08T09:00:00Z", confirmedById: "manager-one" } };
        return HttpResponse.json({ data: work });
      }));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    const start = await screen.findByLabelText(/^Start date/);
    expect(start).toHaveValue("2026-10-09");
    expect(start).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/^Committed finish date/)).toHaveValue("2026-10-20");
    expect(screen.getByLabelText(/^Committed finish date/)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/^Reason/)).not.toBeRequired();
    await user.click(screen.getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "confirm_schedule", expectedVersion: 4, startDate: "2026-10-09", finishDate: "2026-10-20", idempotencyKey: expect.any(String) });
    expect(await screen.findByText("Update saved.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm schedule" })).not.toBeInTheDocument();
  });

  it("refreshes changed proposal dates after staff review without losing the schedule-change reason", async () => {
    let work: ExecutionWork = { ...executionFixture,
      proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-20", reason: "Materials delayed" }, allowedActions: ["confirm_schedule", "hold"] };
    const writes: unknown[] = [];
    server.use(http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: executionPageFixture([work]) })),
      http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
      http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
      http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
        writes.push(await request.json());
        work = { ...work, version: 6, proposedSchedule: null, allowedActions: ["hold"],
          schedule: { ...work.schedule!, startDate: "2026-10-10", finishDate: "2026-10-22", revision: 2 } };
        return HttpResponse.json({ data: work });
      }));
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    const reason = await screen.findByLabelText(/^Reason/);
    expect(reason).toBeRequired();
    expect(screen.getByLabelText(/^Start date/)).toHaveValue("2026-10-09");
    await user.type(reason, "Delivery delay reviewed");
    work = { ...work, version: 5, proposedSchedule: { startDate: "2026-10-10", finishDate: "2026-10-22", reason: "Supplier revised delivery" } };
    await user.click(screen.getByRole("button", { name: "Refresh assignment" }));
    const review = await screen.findByRole("button", { name: "Use reviewed version 5" });
    expect(screen.getByRole("button", { name: "Confirm schedule" })).toBeDisabled();
    expect(screen.getByLabelText(/^Start date/)).toHaveValue("2026-10-09");
    await user.click(review);
    expect(screen.getByLabelText(/^Start date/)).toHaveValue("2026-10-10");
    expect(screen.getByLabelText(/^Committed finish date/)).toHaveValue("2026-10-22");
    expect(reason).toHaveValue("Delivery delay reviewed");
    await user.click(screen.getByRole("button", { name: "Confirm schedule" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "confirm_schedule", expectedVersion: 5, startDate: "2026-10-10", finishDate: "2026-10-22", reason: "Delivery delay reviewed" });
  });
  it("links project rows with backend aggregates and real project identity", async () => {
    server.use(http.get("/api/v1/execution/projects",() => HttpResponse.json({data:{items:[{id:"project-one",name:"Oak residence",projectNumber:"Lisno000011",status:"active",counts:{...executionPageFixture().counts,open:17}}],total:1,limit:25,offset:0}})));
    renderWithQuery(<MemoryRouter><ExecutionPortfolioPage /></MemoryRouter>);
    const link = await screen.findByRole("link",{name:"Open Oak residence execution"});
    expect(link).toHaveAttribute("href","/projects/project-one/execution");
    expect(screen.getByText("17")).toBeVisible();
    expect(screen.getByText("Project ID: Lisno000011")).toBeVisible();
    expect(screen.getByText("Live updates")).toBeVisible();
  });
  it("records schedule policy changes with reason and expected version", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const policy = executionPageFixture().policy!;
    const writes: unknown[]=[];
    server.use(http.get("/api/v1/projects/project-one/execution-policy",() => HttpResponse.json({data:policy})),http.put("/api/v1/projects/project-one/execution-policy",async ({request}) => {const input=await request.json();writes.push(input);return HttpResponse.json({data:{...policy,reminderTime:"10:00",version:3}});}));
    const user=userEvent.setup();renderWithQuery(<ExecutionPolicyPanel projectId="project-one" onClose={() => {}} />);
    const time=await screen.findByLabelText(/Daily reminder/);
    await user.clear(time);await user.type(time,"10:00");
    await user.type(screen.getByRole("textbox",{name:"Reason for change"}),"Site access starts at ten");
    await user.click(screen.getByRole("button",{name:"Save reporting schedule"}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({expectedVersion:2,reminderTime:"10:00",reason:"Site access starts at ten",timezone:"Asia/Kolkata",deadlineTime:"18:00",escalationTime:"19:00"});
    expect(await screen.findByText("Reporting schedule saved. Existing daily cutoffs remain unchanged.")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-manager"] });
    invalidate.mockRestore();
  });
  it("shows failures without manufacturing empty successful results", async () => {
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({error:{code:"FAILED",message:"Tracker unavailable"}},{status:500})));
    renderWithQuery(<ProjectExecutionTracker projectId="project-one" />);
    expect(await screen.findByText("Tracker unavailable")).toBeVisible();
    expect(screen.getByRole("button",{name:"Try again"})).toBeVisible();
    expect(screen.queryByText("No issued Main Line work is available here yet.")).not.toBeInTheDocument();
  });
});

it("shows authoritative delivery readiness without suggesting paused reminders are running", async () => {
  server.use(http.get("/api/v1/execution/projects", () => HttpResponse.json({ data: { items: [], total: 0, limit: 25, offset: 0,
    deliveryHealth: { schedulerEnabled: false, accessDeliveryEnabled: false, lastSchedulerSuccessAt: null, lastSchedulerFailureCode: null, pendingEmails: 0, failedEmails: 2 } } })));
  renderWithQuery(<MemoryRouter><ExecutionPortfolioPage /></MemoryRouter>);
  expect(await screen.findByLabelText("Execution delivery status")).toHaveTextContent("Daily reminders: Paused");
  expect(screen.getByLabelText("Execution delivery status")).toHaveTextContent("Automatic invitations: Paused");
  expect(screen.getByLabelText("Execution delivery status")).toHaveTextContent("2 email deliveries need attention");
});
