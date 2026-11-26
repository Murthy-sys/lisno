import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProjectSummary } from "../../api/types";
import axe from "axe-core";
import type { DesignerAssignmentRequestSummary, DesignerSuggestionsPage } from "../../../../shared/projects/designerAssignment";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
const identity = vi.hoisted(() => ({ id: "admin-1", reviewSessionId: null as string | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: identity.id, role: "super_admin" }, reviewSession: identity.reviewSessionId ? { id: identity.reviewSessionId } : null }) }));

const project: AdminProjectSummary = {
  id: "project-1",
  name: "Aurora Villa",
  status: "planning",
  location: "Pune",
  client: {
    name: "Priya Shah",
    email: "priya@example.com",
    mobile: "+91 90000 00000"
  },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: null,
  lead: null,
  estimate: {
    id: "estimate-1",
    leadId: "lead-1",
    projectId: "project-1",
    resolvedProjectId: "project-1",
    projectLinkSource: "estimate_and_lead",
    version: 4,
    status: "client_approved",
    subtotal: 826271,
    gst: 148729,
    total: 975000,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 3,
      reviewRoundId: "round-1",
      subtotal: 826271,
      gst: 148729,
      total: 975000,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesigner: null
  },
  createdAt: "2026-08-23T10:00:00.000Z"
};


const page: DesignerSuggestionsPage = {
  projectId: project.id, serverNow: "2026-11-25T09:00:00.000Z", sourceRevision: "source-v1",
  projectPreferredLanguage: "english", projectLocation: "Pune", projectCity: "Pune",
  currentDesigner: null, pendingRequests: [], pendingRequest: null, canRequest: true, blockedReason: null,
  items: [{ id: "designer-1", name: "Ananya Rao", activeProjectCount: 2, languagesKnown: ["english", "hindi"], preferredLanguage: "english", location: "Pune", languageMatch: "preferred", locationMatch: "same_location", eligible: true, blockedReason: null }],
  pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
};
const request: DesignerAssignmentRequestSummary = { id: "request-1", projectId: project.id, projectName: project.name, designer: { id: "designer-1", name: "Ananya Rao" }, status: "pending", version: 1, createdAt: page.serverNow, decidedAt: null, note: null, closureReason: null };
const endpoint = "/api/v1/admin/projects/project-1/designer-assignment-requests";
function suggestions(get = () => page) { server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", () => HttpResponse.json({ data: get() }))); }
beforeEach(() => { identity.id = "admin-1"; identity.reviewSessionId = null; });
afterEach(() => vi.useRealTimers());

function expectNoAssignmentControls() {
  expect(screen.queryByRole("list", { name: "Designer suggestions" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Search Designers by name" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Send assignment request to|Cancel assignment request to|Previous Designers|Next Designers/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Pending Designer requests" })).not.toBeInTheDocument();
  expect(screen.queryByText(/active Designers$|pending assignment requests?$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/The first Designer to accept/)).not.toBeInTheDocument();
}

function renderMutablePanel(initialProject = project, canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const frame = (value: AdminProjectSummary, manage: boolean) => <QueryClientProvider client={client}><FeedbackProvider><DesignAssignmentPanel project={value} canManage={manage} /></FeedbackProvider></QueryClientProvider>;
  const view = render(frame(initialProject, canManage));
  return { ...view, client, rerenderPanel: (value: AdminProjectSummary, manage = true) => view.rerender(frame(value, manage)) };
}

describe("DesignAssignmentPanel", () => {
  it("sends requests to multiple Designers and cancels only the selected card", async () => {
    const second = { ...page.items[0]!, id: "designer-2", name: "Dev Kumar", activeProjectCount: 5 };
    let pending: DesignerAssignmentRequestSummary[] = [];
    const posted: string[] = [];
    suggestions(() => ({ ...page, items: [...page.items, second], pendingRequests: pending,
      pagination: { ...page.pagination, total: 2 } }));
    server.use(
      http.post(endpoint, async ({ request: req }) => {
        const body = await req.json() as { designerId: string };
        posted.push(body.designerId);
        const designer = [page.items[0]!, second].find(item => item.id === body.designerId)!;
        const created = { ...request, id: `request-${designer.id}`, designer: { id: designer.id, name: designer.name } };
        pending = [...pending, created];
        return HttpResponse.json({ data: created });
      }),
      http.post(`${endpoint}/:requestId/cancel`, async ({ params, request: req }) => {
        expect(await req.json()).toMatchObject({ expectedVersion: 1, idempotencyKey: expect.any(String) });
        const cancelled = pending.find(item => item.id === params.requestId)!;
        pending = pending.filter(item => item.id !== params.requestId);
        return HttpResponse.json({ data: { ...cancelled, status: "cancelled", closureReason: "cancelled_by_admin" } });
      })
    );
    const user = userEvent.setup();
    const { container } = renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    await user.click(await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" }));
    const sendSecond = await screen.findByRole("button", { name: "Send assignment request to Dev Kumar" });
    await waitFor(() => expect(sendSecond).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Send assignment request to Ananya Rao" })).not.toBeInTheDocument();
    await user.click(sendSecond);
    expect(await screen.findByText("2 pending assignment requests")).toBeVisible();
    expect(posted).toEqual(["designer-1", "designer-2"]);
    const firstCard = within(screen.getByRole("heading", { name: "Ananya Rao" }).closest("li")!);
    await user.click(firstCard.getByRole("button", { name: "Cancel assignment request to Ananya Rao" }));
    expect(await screen.findByText("1 pending assignment request")).toBeVisible();
    await waitFor(() => expect(firstCard.getByRole("button", { name: "Send assignment request to Ananya Rao" })).toBeEnabled());
    expect(pending.map(item => item.designer.id)).toEqual(["designer-2"]);
    expect(within(screen.getByRole("heading", { name: "Dev Kumar" }).closest("li")!).getByText("Request sent")).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("retains pending requests and exact cancel targets outside the current page and search", async () => {
    const otherRequest = { ...request, id: "request-2", version: 7, designer: { id: "designer-2", name: "Dev Kumar" } };
    let pending = [request, otherRequest];
    const reads: string[] = [];
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", ({ request: req }) => {
      const url = new URL(req.url);
      reads.push(url.search);
      const offset = Number(url.searchParams.get("offset"));
      return HttpResponse.json({ data: { ...page, pendingRequests: pending,
        items: url.searchParams.get("search") ? [] : [{ ...page.items[0], id: "designer-3", name: offset ? "Next Designer" : "Available Designer" }],
        pagination: { ...page.pagination, total: 21, offset, hasMore: offset === 0 } } });
    }), http.post(`${endpoint}/request-2/cancel`, async ({ request: req }) => {
      expect(await req.json()).toMatchObject({ expectedVersion: 7 });
      pending = [request];
      return HttpResponse.json({ data: { ...otherRequest, status: "cancelled", closureReason: "cancelled_by_admin" } });
    }));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    await screen.findByText("Available Designer");
    await user.click(screen.getByRole("button", { name: "Next Designers" }));
    await screen.findByText("Next Designer");
    await user.type(screen.getByRole("textbox", { name: "Search Designers by name" }), "No match");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No active Designers match this search.")).toBeVisible();
    await user.click(screen.getByText("2 pending assignment requests"));
    const summary = within(screen.getByRole("list", { name: "Pending Designer requests" }));
    await user.click(summary.getByRole("button", { name: "Cancel assignment request to Dev Kumar" }));
    expect(await screen.findByText("1 pending assignment request")).toBeVisible();
    expect(summary.queryByText("Dev Kumar")).not.toBeInTheDocument();
    expect(summary.getByText("Ananya Rao")).toBeVisible();
    expect(reads.some(value => value.includes("offset=20"))).toBe(true);
    expect(reads.some(value => value.includes("search=No+match") && value.includes("offset=0"))).toBe(true);
  });

  it("preserves a failed card's idempotency key when another request succeeds", async () => {
    const second = { ...page.items[0]!, id: "designer-2", name: "Dev Kumar" };
    const firstBodies: unknown[] = [];
    let secondPending = false;
    suggestions(() => ({ ...page, items: [...page.items, second], pendingRequests: secondPending ? [{ ...request, id: "request-2", designer: second }] : [] }));
    server.use(http.post(endpoint, async ({ request: req }) => {
      const body = await req.json() as { designerId: string };
      if (body.designerId === "designer-1") {
        firstBodies.push(body);
        return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Retry this request." } }, { status: 503 });
      }
      secondPending = true;
      return HttpResponse.json({ data: { ...request, id: "request-2", designer: second } });
    }));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    await user.click(await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Send assignment request to Dev Kumar" }));
    await screen.findByText("1 pending assignment request");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send assignment request to Ananya Rao" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Send assignment request to Ananya Rao" }));
    await waitFor(() => expect(firstBodies).toHaveLength(2));
    expect(firstBodies[0]).toEqual(firstBodies[1]);
  });

  it("fails closed when pending request details are missing instead of assuming no requests", async () => {
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", () => {
      const { pendingRequests: _missing, ...legacy } = page;
      return HttpResponse.json({ data: legacy });
    }));
    renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Active Designers could not be loaded.");
    expect(screen.queryByRole("button", { name: /Send assignment request to/ })).not.toBeInTheDocument();
  });

  it.each([false, true])("uses a fresh create key after cancellation, including lost cancellation response: %s", async lostCancelResponse => {
    const second = { ...page.items[0]!, id: "designer-2", name: "Dev Kumar" };
    let pending: DesignerAssignmentRequestSummary[] = [];
    const firstKeys: string[] = [];
    suggestions(() => ({ ...page, items: [...page.items, second], pendingRequests: pending }));
    server.use(http.post(endpoint, async ({ request: req }) => {
      const body = await req.json() as { designerId: string; idempotencyKey: string };
      const isFirst = body.designerId === "designer-1";
      const created = { ...request, id: isFirst ? "request-1" : "request-2", designer: isFirst ? request.designer : second };
      pending = [...pending, created];
      if (isFirst) {
        firstKeys.push(body.idempotencyKey);
        if (firstKeys.length === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "The response could not be confirmed." } }, { status: 503 });
      }
      return HttpResponse.json({ data: created });
    }), http.post(`${endpoint}/request-1/cancel`, () => {
      pending = pending.filter(item => item.id !== "request-1");
      if (lostCancelResponse) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Cancellation response lost." } }, { status: 503 });
      return HttpResponse.json({ data: { ...request, status: "cancelled", closureReason: "cancelled_by_admin" } });
    }));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    await user.click(await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Send assignment request to Dev Kumar" }));
    await screen.findByText("2 pending assignment requests");
    const firstCard = within(screen.getByRole("heading", { name: "Ananya Rao" }).closest("li")!);
    await user.click(firstCard.getByRole("button", { name: "Cancel assignment request to Ananya Rao" }));
    if (lostCancelResponse) {
      await screen.findByText("Cancellation response lost.");
      await user.type(screen.getByRole("textbox", { name: "Search Designers by name" }), "Ananya");
      await user.click(screen.getByRole("button", { name: "Search" }));
    }
    const resend = await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" });
    await waitFor(() => expect(resend).toBeEnabled());
    await user.click(resend);
    await waitFor(() => expect(firstKeys).toHaveLength(2));
    expect(firstKeys[1]).not.toBe(firstKeys[0]);
    expect(await screen.findByText("2 pending assignment requests")).toBeVisible();
  });

  it.each(["inside", "outside"])("replaces pending requests after acceptance and preserves appropriate focus: %s", async focus => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let accepted = false;
    suggestions(() => ({ ...page, pendingRequests: accepted ? [] : [request], currentDesigner: accepted ? request.designer : null }));
    renderWithQuery(<><button type="button">Other project action</button><DesignAssignmentPanel project={project} canManage /></>);
    expect(await screen.findByText("1 pending assignment request")).toBeVisible();
    const outside = screen.getByRole("button", { name: "Other project action" });
    (focus === "inside" ? screen.getByRole("textbox", { name: "Search Designers by name" }) : outside).focus();
    accepted = true; await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(await screen.findByText("This project is assigned to Ananya Rao.")).toBeVisible();
    expectNoAssignmentControls();
    if (focus === "outside") expect(outside).toHaveFocus();
    else await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole("region", { name: "Design plan assignment" })).toContainElement(document.activeElement as HTMLElement);
    });
  });
  it("shows backend workload/match reasons and sends a versioned request without immediate assignment", async () => {
    suggestions();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    let body: unknown;
    server.use(http.post(endpoint, async ({ request: req }) => { body = await req.json(); return HttpResponse.json({ data: request }); }));
    const user = userEvent.setup();
    renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    const send = await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" });
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText(/Preferred language matches project/)).toHaveTextContent("Same area/location");
    send.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(body).toEqual({ designerId: "designer-1", expectedSourceRevision: "source-v1", idempotencyKey: expect.any(String) }));
    expect(await screen.findByText("Assignment request sent. Waiting for the Designer to accept.")).toBeVisible();
    for (const key of [["designer-assignment"], ["admin-projects"], ["project-workflow"], ["design-team"], ["assigned-projects"], ["leads"]]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    invalidate.mockRestore();
  });

  it("shows only the assigned Designer even if other candidates and pending requests are returned", async () => {
    suggestions(() => ({ ...page, currentDesigner: { id: "old", name: "Current Designer" }, pendingRequests: [{ ...request, version: 3 }] }));
    const mutate = vi.fn(); server.use(http.post(`${endpoint}/request-1/cancel`, mutate));
    const { container } = renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    expect(await screen.findByText("This project is assigned to Current Designer.")).toBeVisible();
    expect(screen.getByText("Assigned Designer", { exact: true })).toBeVisible();
    expect(screen.queryByText("Ananya Rao", { exact: true })).not.toBeInTheDocument();
    expectNoAssignmentControls();
    expect(mutate).not.toHaveBeenCalled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps retry idempotency and prevents duplicate or stale requests", async () => {
    suggestions(); const bodies: unknown[] = [];
    server.use(http.post(endpoint, async ({ request: req }) => { bodies.push(await req.json()); await delay(30); return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 }); }));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    const send = await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" });
    await user.dblClick(send); await screen.findByRole("alert"); expect(bodies).toHaveLength(1);
    await user.click(send); await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[0]).toEqual(bodies[1]);
  });

  it("requires review after a stale-source rejection", async () => {
    suggestions(); server.use(http.post(endpoint, () => HttpResponse.json({ error: { code: "STALE", message: "Assignment changed." } }, { status: 409 })));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    const send = await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" }); await user.click(send);
    expect(await screen.findByRole("alert")).toHaveTextContent("Assignment changed."); expect(send).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Refresh assignment" })); await waitFor(() => expect(send).toBeEnabled());
  });

  it("does not load suggestions without management permission", () => {
    const load = vi.fn(); server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", load));
    renderWithQuery(<DesignAssignmentPanel project={project} />);
    expect(screen.getByText("You do not have permission to assign a Designer.")).toBeVisible(); expect(load).not.toHaveBeenCalled();
  });

  it.each(["progressed", "read-only", "unavailable"])("uses the authorized project assignment when suggestions are %s", async state => {
    const load = vi.fn(() => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 }));
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", load));
    const assignedProject: AdminProjectSummary = { ...project, estimate: { ...project.estimate!,
      ...(state === "progressed" ? { designPlanStatus: "approved", canAssignDesigner: false } : {}),
      designPlanDesigner: { id: "designer-saved", name: "Saved Designer", email: "saved@lisno.example" }
    } };
    renderWithQuery(<DesignAssignmentPanel project={assignedProject} canManage={state !== "read-only"} />);
    expect(screen.getByText("This project is assigned to Saved Designer.")).toBeVisible();
    expectNoAssignmentControls();
    if (state === "unavailable") {
      await screen.findByRole("alert");
      expect(screen.getByText("This project is assigned to Saved Designer.")).toBeVisible();
      expectNoAssignmentControls();
    } else expect(load).not.toHaveBeenCalled();
  });

  it("honors an explicitly unassigned response over an older project summary", async () => {
    let unavailable = false;
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", () => unavailable
      ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 })
      : HttpResponse.json({ data: page })));
    const oldProject: AdminProjectSummary = { ...project, estimate: { ...project.estimate!, designPlanDesigner: {
      id: "designer-old", name: "Former Designer", email: "former@lisno.example"
    } } };
    const view = renderMutablePanel(oldProject);
    expect(await screen.findByRole("button", { name: "Send assignment request to Ananya Rao" })).toBeEnabled();
    expect(screen.queryByText("This project is assigned to Former Designer.")).not.toBeInTheDocument();
    unavailable = true;
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["designer-assignment"] }); });
    await screen.findByRole("alert");
    expect(screen.queryByText("This project is assigned to Former Designer.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send assignment request to Ananya Rao" })).toBeDisabled();
  });

  it("shows the accepted Designer when that person is outside the current search and page", async () => {
    let accepted = false;
    const reads: string[] = [];
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", ({ request: req }) => {
      const url = new URL(req.url); reads.push(url.search);
      const offset = Number(url.searchParams.get("offset"));
      return HttpResponse.json({ data: { ...page, currentDesigner: accepted ? { id: "winner", name: "Accepted Designer" } : null,
        items: url.searchParams.get("search") ? [] : [{ ...page.items[0]!, name: offset ? "Second Page Designer" : "First Page Designer" }],
        pagination: { limit: 20, offset, total: 21, hasMore: offset === 0 }
      } });
    }));
    const user = userEvent.setup(); const view = renderMutablePanel();
    await screen.findByText("First Page Designer");
    await user.click(screen.getByRole("button", { name: "Next Designers" }));
    await screen.findByText("Second Page Designer");
    await user.type(screen.getByRole("textbox", { name: "Search Designers by name" }), "No match");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("No active Designers match this search.");
    accepted = true;
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["designer-assignment"] }); });
    expect(await screen.findByText("This project is assigned to Accepted Designer.")).toBeVisible();
    expectNoAssignmentControls();
    expect(reads.some(value => value.includes("offset=20"))).toBe(true);
    expect(reads.some(value => value.includes("search=No+match"))).toBe(true);
  });

  it("retains a confirmed assignment through a temporary error but hides denied cached identities", async () => {
    let status = 200;
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", () => status === 200
      ? HttpResponse.json({ data: { ...page, currentDesigner: { id: "confirmed", name: "Confirmed Designer" } } })
      : HttpResponse.json({ error: { code: status === 403 ? "FORBIDDEN" : "UNAVAILABLE", message: "Cannot read assignment." } }, { status })));
    const view = renderMutablePanel();
    await screen.findByText("This project is assigned to Confirmed Designer.");
    status = 503;
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["designer-assignment"] }); });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("This project is assigned to Confirmed Designer.")).toBeVisible();
    expectNoAssignmentControls();
    status = 403;
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["designer-assignment"] }); });
    await waitFor(() => expect(screen.queryByText("This project is assigned to Confirmed Designer.")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Send assignment request to/ })).not.toBeInTheDocument();
  });

  it("ignores cached suggestions after management permission is removed", async () => {
    const read = vi.fn(() => HttpResponse.json({ data: { ...page, currentDesigner: { id: "cached", name: "Cached Designer" } } }));
    server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", read));
    const view = renderMutablePanel();
    await screen.findByText("This project is assigned to Cached Designer.");
    const priorCalls = read.mock.calls.length;
    const readOnlyProject: AdminProjectSummary = { ...project, estimate: { ...project.estimate!, designPlanDesigner: {
      id: "authorized", name: "Project Detail Designer", email: "detail@lisno.example"
    } } };
    view.rerenderPanel(readOnlyProject, false);
    expect(screen.getByText("This project is assigned to Project Detail Designer.")).toBeVisible();
    expect(screen.queryByText("This project is assigned to Cached Designer.")).not.toBeInTheDocument();
    expectNoAssignmentControls();
    expect(read).toHaveBeenCalledTimes(priorCalls);
  });

  it.each(["project", "actor", "review-session"])("does not reuse a previous assigned identity when the %s changes", async change => {
    let next = false;
    server.use(http.get("/api/v1/admin/projects/:projectId/designer-suggestions", async ({ params }) => {
      if (next) await delay(30);
      return HttpResponse.json({ data: { ...page, projectId: params.projectId, currentDesigner: {
        id: next ? "new-designer" : "old-designer", name: next ? "New Scope Designer" : "Previous Scope Designer"
      } } });
    }));
    const view = renderMutablePanel();
    await screen.findByText("This project is assigned to Previous Scope Designer.");
    next = true;
    if (change === "actor") identity.id = "admin-two";
    if (change === "review-session") identity.reviewSessionId = "review-two";
    const nextProject = change === "project" ? { ...project, id: "project-2", estimate: { ...project.estimate!, projectId: "project-2", resolvedProjectId: "project-2" } } : project;
    view.rerenderPanel(nextProject);
    expect(screen.queryByText("This project is assigned to Previous Scope Designer.")).not.toBeInTheDocument();
    expect(await screen.findByText("This project is assigned to New Scope Designer.")).toBeVisible();
    expectNoAssignmentControls();
  });

  it("provides recoverable loading/error and empty states", async () => {
    let calls = 0; server.use(http.get("/api/v1/admin/projects/project-1/designer-suggestions", async () => {
      await delay(20); return ++calls === 1 ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 }) : HttpResponse.json({ data: { ...page, items: [] } });
    }));
    const user = userEvent.setup(); renderWithQuery(<DesignAssignmentPanel project={project} canManage />);
    expect(screen.getByText("Loading active Designers…")).toBeVisible(); await user.click(await screen.findByRole("button", { name: "Retry Designers" }));
    expect(await screen.findByText("No active Designers match this search.")).toBeVisible();
  });
});
