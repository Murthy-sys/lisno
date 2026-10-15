import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type { Lead, LeadStage } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp, renderWithQuery } from "../../test/render";
import type { DesignWorkflowView } from "../workflow/projectWorkflowApi";
import { LeadDetail } from "./LeadDetail";
import { leadKeys } from "./leadsApi";

const stageCases: Array<[LeadStage, string, string]> = [
  ["new_lead", "New lead", "Start estimate"], ["contacted", "Contacted", "Start estimate"],
  ["site_visit", "Site visit", "Start estimate"], ["design_meeting", "Design meeting", "Start estimate"],
  ["estimate_in_progress", "Estimate in progress", "Continue estimate"], ["estimate_sent", "Estimate sent", "Continue estimate"],
  ["negotiation", "Negotiation", "Continue estimate"], ["won", "Won", "Continue estimate"], ["lost", "Lost", "Continue estimate"]
];

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-cedar", projectId: "project-cedar", ownerId: "sales-1", clientName: "Cedar Homes", projectName: "Cedar Loft",
    clientEmail: "cedar@example.com", clientMobile: "9000000002", stage: "new_lead", propertyType: "2BHK", location: "Mysuru",
    budgetMin: 1800000, budgetMax: 2400000, nextAction: "Review estimate", nextActionAt: "2026-10-15T09:00:00.000Z",
    source: "Referral", builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null,
    createdAt: "2026-10-13T09:00:00.000Z", updatedAt: "2026-10-13T09:00:00.000Z", ...overrides
  };
}

const paymentIssue = "The project needs a confirmed approved estimate before Initial payment received can be recorded.";
const workflow: DesignWorkflowView = {
  projectId: "project-cedar", projectName: "Cedar Loft", serverNow: "2026-10-13T09:00:00.000Z", floors: [],
  estimateApprovalStatus: "awaiting_approval",
  initialPayment: { confirmedAt: null, canConfirm: false, version: 0, status: "awaiting_estimate_approval", issue: paymentIssue },
  notices: [{ id: "scope-review", stageId: "estimate", message: "Review the updated project scope before sending the estimate." }]
};

function mockLeadApi(leads: Lead[]) {
  tokenStorage.set("sales-token");
  const api: {
    requests: Array<{ url: string; method: string }>;
    updates: Array<{ url: string; payload: { stage: LeadStage } }>;
    read?: (lead: Lead) => Response | Promise<Response>;
    patch?: (lead: Lead, value: LeadStage) => Response | Promise<Response>;
  } = { requests: [], updates: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    api.requests.push({ url, method });
    if (url === "/api/v1/auth/me") return Response.json({ data: { id: "sales-1", name: "Sales", email: "sales@example.com", role: "estimator_sales" } });
    if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("estimator_sales", [
      ...authorizationFor("estimator_sales").permissions, "design.plan_response_tasks.read"
    ]) });
    const lead = leads.find((item) => url === `/api/v1/leads/${item.id}`);
    if (lead) {
      if (method === "PATCH") {
        const payload = JSON.parse(String(init?.body)) as { stage: LeadStage };
        api.updates.push({ url, payload });
        if (api.patch) return api.patch(lead, payload.stage);
        lead.stage = payload.stage;
      } else if (api.read) return api.read(lead);
      return Response.json({ data: lead });
    }
    if (url.startsWith("/api/v1/leads?")) return Response.json({ data: { items: leads, pagination: { limit: 20, offset: 0, total: leads.length, hasMore: false } } });
    if (url === "/api/v1/estimates") return Response.json({ data: [] });
    if (leads.some((item) => url === `/api/v1/leads/${item.id}/estimate`)) return Response.json({ data: null });
    if (url.startsWith("/api/v1/estimation/catalogue?")) return Response.json({ data: {
      items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false }, ineligibleLineCount: 0
    } });
    if (url === "/api/v1/projects/project-cedar/design-workflow") return Response.json({ data: workflow });
    if (url === "/api/v1/projects/project-cedar/status") return Response.json({ data: {
      projectId: workflow.projectId, projectName: workflow.projectName, serverNow: workflow.serverNow,
      state: "no_pending", currentStage: null, pendingActions: []
    } });
    if (url === "/api/v1/admin/design-plan-response-tasks?projectId=project-cedar") return Response.json({ data: [] });
    throw new Error(`Unhandled request: ${method} ${url}`);
  });
  return api;
}

function expectLatestLayout(lead: Lead, action: string) {
  const heading = screen.getByRole("heading", { level: 1, name: lead.projectName });
  expect(heading).toBeVisible();
  expect(screen.queryByRole("heading", { level: 1, name: lead.clientName })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Lead stage" })).toHaveValue(lead.stage);
  const stageLabel = stageCases.find(([value]) => value === lead.stage)![1];
  expect(within(heading.closest("header")!).getByText(stageLabel, { selector: "p" })).toBeVisible();
  const contact = screen.getByRole("list", { name: "Client contact details" });
  expect(contact).toHaveTextContent(lead.clientName);
  if (lead.clientMobile) expect(within(contact).getByRole("link", { name: lead.clientMobile })).toHaveAttribute("href", `tel:${lead.clientMobile}`);
  if (lead.clientEmail) expect(within(contact).getByRole("link", { name: lead.clientEmail })).toHaveAttribute("href", `mailto:${lead.clientEmail}`);
  if (lead.propertyType) expect(screen.getByText(lead.propertyType, { exact: true })).toBeVisible();
  if (lead.location) expect(screen.getByText(lead.location, { exact: true })).toBeVisible();
  const estimate = screen.getByRole("region", { name: "Estimate" });
  const steps = within(estimate).getByRole("list", { name: "Estimate steps" });
  expect(steps.tagName).toBe("OL");
  expect(within(steps).getAllByRole("listitem").map((step) => step.textContent)).toEqual([
    "1Rooms & Dimensions", "2Select Scope", "3Generate Estimate"
  ]);
  expect(within(steps).queryByRole("button")).not.toBeInTheDocument();
  expect(within(steps).queryByRole("link")).not.toBeInTheDocument();
  expect(steps.querySelector("[aria-current]")).toBeNull();
  expect(within(estimate).getAllByRole("button")).toHaveLength(1);
  expect(within(estimate).getByRole("button", { name: action })).toBeVisible();
  expect(estimate).toHaveTextContent(`Next action: ${lead.nextAction}`);
  expect(estimate).not.toHaveTextContent(lead.clientName);
  expect(screen.queryByText("Configure rooms, dimensions and scope. Follow-ups remain available independently.")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Follow-ups" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Follow-up note" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Activity type" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add follow-up" })).not.toBeInTheDocument();
  expect(screen.queryByText("No follow-ups recorded.")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Initial payment status" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Initial payment" })).not.toBeInTheDocument();
  expect(screen.queryByText(paymentIssue)).not.toBeInTheDocument();
}

describe("Lead details", () => {
  it.each(stageCases)("uses the latest layout and saved %s stage without writing on direct entry", async (value, _label, action) => {
    const lead = makeLead({ stage: value });
    const api = mockLeadApi([lead]);
    renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("heading", { level: 1, name: lead.projectName });
    expect(await screen.findByRole("region", { name: "Project notifications" })).toHaveTextContent(workflow.notices![0]!.message);
    expect(await screen.findByText("No design reviews are awaiting a response.")).toBeVisible();
    expectLatestLayout(lead, action);
    expect(screen.getByRole("region", { name: "Estimate" }).compareDocumentPosition(screen.getByRole("region", { name: "Project notifications" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.requests.every(({ method }) => method === "GET")).toBe(true);
    expect(api.requests.some(({ url }) => url.includes("/activities") || url.endsWith("/estimate"))).toBe(false);
  });

  it("keeps the same saved presentation on remount without creating an estimate", async () => {
    const lead = makeLead({ projectId: null });
    const api = mockLeadApi([lead]);
    const first = renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("heading", { level: 1, name: lead.projectName });
    expectLatestLayout(lead, "Start estimate");
    first.unmount();
    renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("heading", { level: 1, name: lead.projectName });
    expectLatestLayout(lead, "Start estimate");
    expect(api.requests.filter(({ url }) => url === `/api/v1/leads/${lead.id}`)).toHaveLength(2);
    expect(api.requests.every(({ method }) => method === "GET")).toBe(true);
    expect(api.requests.some(({ url }) => url.endsWith("/estimate"))).toBe(false);
  });

  it("supports standalone leads and absent optional metadata without project controls", async () => {
    const lead = makeLead({ projectId: null, stage: "contacted", clientEmail: "", clientMobile: "", propertyType: "", location: "" });
    mockLeadApi([lead]);
    renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("heading", { level: 1, name: lead.projectName });
    expectLatestLayout(lead, "Start estimate");
    expect(within(screen.getByRole("list", { name: "Client contact details" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Project sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Critical/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project notifications" })).not.toBeInTheDocument();
  });

  it("retains the guide and workflow notices when switching saved stages", async () => {
    const user = userEvent.setup();
    const lead = makeLead();
    const api = mockLeadApi([lead]);
    renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("region", { name: "Project notifications" });
    for (const value of ["estimate_sent", "contacted", "won", "new_lead"] as const) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Lead stage" }), value);
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Lead stage" })).toHaveValue(value));
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeEnabled());
      expectLatestLayout(lead, stageCases.find(([stage]) => stage === value)![2]);
      expect(screen.getByRole("region", { name: "Project notifications" })).toHaveTextContent(workflow.notices![0]!.message);
      expect(screen.getByRole("region", { name: "Design reviews" })).toBeVisible();
    }
    expect(api.updates.map(({ payload }) => payload.stage)).toEqual(["estimate_sent", "contacted", "won", "new_lead"]);
    expect(api.requests.some(({ url }) => url.includes("/activities"))).toBe(false);
  });

  it("keeps Start pending and retryable, refreshes lead queries, and opens only the current lead after success", async () => {
    const user = userEvent.setup();
    const lead = makeLead({ id: "lead-river", projectId: null, projectName: "River House" });
    const api = mockLeadApi([lead]);
    let completeUpdate!: (response: Response) => void;
    api.patch = () => new Promise<Response>((resolve) => { completeUpdate = resolve; });
    const { router, queryClient } = renderApp([`/estimator-sales/leads/${lead.id}`]);
    await screen.findByRole("button", { name: "Start estimate" });
    const listKey = leadKeys.page("", "all");
    queryClient.setQueryData(listKey, { items: [lead] });
    await user.click(screen.getByRole("button", { name: "Start estimate" }));
    const opening = await screen.findByRole("button", { name: "Opening…" });
    expect(opening).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeDisabled();
    await user.click(opening);
    expect(api.updates).toEqual([{ url: "/api/v1/leads/lead-river", payload: { stage: "estimate_in_progress" } }]);
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-river");

    await act(async () => completeUpdate(Response.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 })));
    expect(await screen.findByRole("alert")).toHaveTextContent("The lead could not be updated. Try again.");
    expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start estimate" })).toBeEnabled();
    expectLatestLayout(lead, "Start estimate");
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-river");

    await user.click(screen.getByRole("button", { name: "Start estimate" }));
    expect(await screen.findByRole("button", { name: "Opening…" })).toBeDisabled();
    expect(api.updates).toHaveLength(2);
    expect(api.updates[1]).toEqual(api.updates[0]);
    let completeRefresh!: (response: Response) => void;
    api.read = () => new Promise<Response>((resolve) => { completeRefresh = resolve; });
    lead.stage = "estimate_in_progress";
    await act(async () => completeUpdate(Response.json({ data: lead })));
    await waitFor(() => expect(completeRefresh).toBeTypeOf("function"));
    expect(screen.getByRole("button", { name: "Opening…" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeDisabled();
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-river");
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    api.read = undefined;
    await act(async () => completeRefresh(Response.json({ data: lead })));
    await waitFor(() => expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-river/estimate"));
    expect(await screen.findByRole("heading", { name: "Configure estimate", level: 1 })).toBeVisible();
    expect(screen.queryByText("The lead could not be updated. Try again.")).not.toBeInTheDocument();
  });

  it.each(stageCases.filter(([stage]) => ["estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"].includes(stage)))(
    "continues the current %s lead without resetting its saved stage", async (value) => {
      const user = userEvent.setup();
      const lead = makeLead({ id: `lead-${value}`, projectId: null, stage: value });
      const otherLead = makeLead({ id: "lead-other", projectId: null });
      const api = mockLeadApi([otherLead, lead]);
      const { router } = renderApp([`/estimator-sales/leads/${lead.id}`]);
      await user.click(await screen.findByRole("button", { name: "Continue estimate" }));
      await waitFor(() => expect(router.state.location.pathname).toBe(`/estimator-sales/leads/${lead.id}/estimate`));
      expect(await screen.findByRole("heading", { name: "Configure estimate", level: 1 })).toBeVisible();
      expect(api.updates).toEqual([]);
      expect(lead.stage).toBe(value);
      expect(api.requests.some(({ url }) => url === `/api/v1/leads/${lead.id}/estimate`)).toBe(true);
      expect(api.requests.some(({ url }) => url.includes("lead-other"))).toBe(false);
    }
  );

  it("blocks estimate entry during a stage update and allows a failed stage change to be retried", async () => {
    const user = userEvent.setup();
    const lead = makeLead({ projectId: null });
    const api = mockLeadApi([lead]);
    let completeUpdate!: (response: Response) => void;
    api.patch = () => new Promise<Response>((resolve) => { completeUpdate = resolve; });
    const { router } = renderApp([`/estimator-sales/leads/${lead.id}`]);
    const select = await screen.findByRole("combobox", { name: "Lead stage" });
    await user.selectOptions(select, "estimate_sent");
    await waitFor(() => expect(select).toBeDisabled());
    expect(screen.getByRole("button", { name: "Start estimate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start estimate" }));
    expect(api.updates).toHaveLength(1);
    await act(async () => completeUpdate(Response.json({ error: { code: "FAILED", message: "Try again" } }, { status: 500 })));
    expect(await screen.findByRole("alert")).toHaveTextContent("The lead could not be updated. Try again.");
    expect(select).toHaveValue("new_lead");
    expect(select).toBeEnabled();
    expectLatestLayout(lead, "Start estimate");
    api.patch = undefined;
    await user.selectOptions(select, "estimate_sent");
    await waitFor(() => expect(select).toHaveValue("estimate_sent"));
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectLatestLayout(lead, "Continue estimate");
    expect(api.updates.map(({ payload }) => payload.stage)).toEqual(["estimate_sent", "estimate_sent"]);
    expect(router.state.location.pathname).toBe(`/estimator-sales/leads/${lead.id}`);
  });

  it("retries a failed lead load without fetching obsolete activities", async () => {
    const user = userEvent.setup();
    const lead = makeLead({ projectId: null });
    const api = mockLeadApi([lead]);
    let completeLoad!: (response: Response) => void;
    api.read = () => new Promise<Response>((resolve) => { completeLoad = resolve; });
    renderApp([`/estimator-sales/leads/${lead.id}`]);
    expect(await screen.findByText("Loading lead details…")).toBeVisible();
    await act(async () => completeLoad(Response.json({ error: { code: "FAILED", message: "Try again" } }, { status: 500 })));
    expect(await screen.findByText("We couldn't load this lead.")).toBeVisible();
    api.read = undefined;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: lead.projectName });
    expectLatestLayout(lead, "Start estimate");
    expect(api.requests.some(({ url }) => url.includes("/activities"))).toBe(false);
    expect(api.updates).toEqual([]);
  });

  it("does not let a delayed Start redirect or block a different lead after the route identity changes", async () => {
    const user = userEvent.setup();
    const first = makeLead({ id: "lead-first", projectId: null });
    const second = makeLead({ id: "lead-second", projectId: null, projectName: "Willow House", clientName: "Willow Client", stage: "estimate_sent" });
    const api = mockLeadApi([first, second]);
    let completeUpdate!: (response: Response) => void;
    api.patch = () => new Promise<Response>((resolve) => { completeUpdate = resolve; });
    function CurrentPath() { return <p data-testid="current-path">{useLocation().pathname}</p>; }
    renderWithQuery(<MemoryRouter initialEntries={[`/estimator-sales/leads/${first.id}`]}>
      <Link to={`/estimator-sales/leads/${second.id}`}>Switch lead</Link>
      <Routes>
        <Route path="/estimator-sales/leads/:leadId" element={<LeadDetail />} />
        <Route path="/estimator-sales/leads/:leadId/estimate" element={<h1>Estimate builder</h1>} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Start estimate" }));
    expect(await screen.findByRole("button", { name: "Opening…" })).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Switch lead" }));
    await screen.findByRole("heading", { level: 1, name: second.projectName });
    expectLatestLayout(second, "Continue estimate");
    expect(screen.getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeEnabled();
    first.stage = "estimate_in_progress";
    await act(async () => completeUpdate(Response.json({ data: first })));
    await waitFor(() => expect(api.requests.filter(({ url }) => url === "/api/v1/leads/lead-second")).toHaveLength(2));
    expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/estimator-sales\/leads\/lead-second$/);
    expectLatestLayout(second, "Continue estimate");
    await user.click(screen.getByRole("button", { name: "Continue estimate" }));
    expect(await screen.findByRole("heading", { name: "Estimate builder" })).toBeVisible();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/estimator-sales/leads/lead-second/estimate");
    expect(api.updates).toEqual([{ url: "/api/v1/leads/lead-first", payload: { stage: "estimate_in_progress" } }]);
  });
});
