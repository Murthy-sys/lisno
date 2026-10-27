import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ExecutionPortfolioPage, ProjectExecutionPage, ProjectExecutionTracker } from "./ExecutionWorkspace";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";
import { executionFixture, executionPageFixture } from "./executionTestFixtures";
const authState = vi.hoisted(() => ({ user: { id: "manager-one", role: "site_manager" }, authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider",() => ({ useAuth: () => authState }));
beforeEach(() => { authState.authorization = authorizationFor("site_manager", []); });
vi.mock("./ExecutionLiveProvider",() => ({useExecutionConnection:() => "live"}));

describe("execution project workflow", () => {
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
    const work = { ...executionFixture, allowedActions: ["confirm_schedule" as const,"hold" as const] };
    server.use(http.get("/api/v1/projects/project-one/execution",() => HttpResponse.json({data:executionPageFixture([work])})),http.get("/api/v1/execution/work/work-one",() => HttpResponse.json({data:work})),http.get("/api/v1/execution/work/work-one/history",() => HttpResponse.json({data:{items:[],total:0,limit:20,offset:0}})));
    renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?assignment=work-one"]}><ProjectExecutionTracker projectId="project-one" /></MemoryRouter>);
    expect(await screen.findByRole("dialog",{name:"Oak wall panelling"})).toBeVisible();
    expect(screen.getByRole("option",{name:"Confirm schedule"})).toBeVisible();
    expect(screen.queryByRole("option",{name:"Verify completion"})).not.toBeInTheDocument();
    expect(screen.queryByRole("option",{name:"Daily update"})).not.toBeInTheDocument();
  });
  it("links project rows with backend aggregates and real project identity", async () => {
    server.use(http.get("/api/v1/execution/projects",() => HttpResponse.json({data:{items:[{id:"project-one",name:"Oak residence",status:"active",counts:{...executionPageFixture().counts,open:17}}],total:1,limit:25,offset:0}})));
    renderWithQuery(<MemoryRouter><ExecutionPortfolioPage /></MemoryRouter>);
    const link = await screen.findByRole("link",{name:"Open Oak residence execution"});
    expect(link).toHaveAttribute("href","/projects/project-one/execution");
    expect(screen.getByText("17")).toBeVisible();
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
