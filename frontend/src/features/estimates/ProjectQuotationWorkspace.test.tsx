import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { DesignPlanTask } from "../../api/types";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import type { QuotationDetail } from "../client/quotationApi";
import { withPublishedReview, withQuotationApproval } from "./clientEstimateReviewTestUtils";
import type { EstimateQueueItem } from "./estimateWorkflowApi";
import { ProjectQuotationWorkspace } from "./ProjectQuotationWorkspace";

const actor = { user: { id: "client-one", role: "client" as "client" | "designer" }, reviewSession: { id: "session-one" } };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => actor }));

beforeEach(() => {
  actor.user = { id: "client-one", role: "client" };
  actor.reviewSession = { id: "session-one" };
});

function quotation(projectId: string, name: string, quantity: number): QuotationDetail {
  const source = { revisionId: `revision-${projectId}`, itemVersion: 2, revisionVersion: 3, uomId: "unit" };
  return {
    projectId, projectNumber: projectId === "project-one" ? "Lisno000031" : "Lisno000084", estimateId: `estimate-${projectId}`, estimateVersion: 3, workflowVersion: 3, pricedRevision: 2,
    phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true,
    editingBlockReason: null, totalPaise: quantity * 40000, isIncomplete: false,
    rooms: [{ id: `room-${projectId}`, name }],
    baskets: [{ id: "furniture", name: "Furniture", subBaskets: [{ id: "storage", name: "Storage units" }] }],
    lines: [{ id: `line-${projectId}`, mainLineId: "storage", mainLineName: "Storage", roomId: `room-${projectId}`, roomName: name,
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "storage", subBasketName: "Storage units",
      included: true, source, quantity, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 40000,
      amountPaise: quantity * 40000, choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 40000, amountPaise: quantity * 40000, source }] }]
  };
}

function publishedEstimate(detail: QuotationDetail): EstimateQueueItem {
  const estimate = withPublishedReview({
    id: detail.estimateId!, projectId: detail.projectId, propertyType: "Villa", rooms: [], scopes: ["FC"],
    status: "sent_to_client" as const, approvalRequired: true, workflowVersion: 3 as const,
    lineItems: [{ catalogueId: "storage", roomName: detail.rooms[0]!.name, specification: "Storage", unit: "unit", quantity: detail.lines[0]!.quantity,
      rate: 400, amount: detail.totalPaise! / 100, included: true }], subtotal: detail.totalPaise! / 100, gst: 0, total: detail.totalPaise! / 100,
    lead: { _id: `lead-${detail.projectId}`, clientName: "Client", clientEmail: "client@example.test", projectName: `Home ${detail.projectId}`, location: "Bengaluru" }
  });
  estimate.publishedReview.workflowVersion = 3;
  estimate.publishedReview.phase = "pre";
  return withQuotationApproval(estimate, detail);
}

function setup(designerTasks: DesignPlanTask[] = [], customize?: (details: QuotationDetail[]) => void) {
  const details = [quotation("project-one", "Kitchen", 2), quotation("project-two", "Bedroom", 7)];
  customize?.(details);
  let queryClient!: QueryClient;
  const writes: string[] = [];
  server.use(
    http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: designerTasks })),
    http.get("/api/v1/projects/:projectId/quotation", ({ params }) => HttpResponse.json({ data: details.find(detail => detail.projectId === params.projectId) })),
    http.get("/api/v1/projects/:projectId/quotation/revision", ({ params }) => {
      const detail = details.find(value => value.projectId === params.projectId)!;
      return HttpResponse.json({ data: { estimateId: detail.estimateId, estimateVersion: detail.estimateVersion, pricedRevision: detail.pricedRevision, status: detail.status, phase: detail.phase } });
    }),
    http.get("/api/v1/client/estimates", () => HttpResponse.json({ data: details.map(publishedEstimate) })),
    http.patch("/api/v1/projects/:projectId/quotation", ({ request }) => { writes.push(request.url); return HttpResponse.json({ error: { message: "Unexpected save" } }, { status: 500 }); }),
    http.post("/api/v1/estimates/:estimateId/decision", ({ request }) => { writes.push(request.url); return HttpResponse.json({ error: { message: "Unexpected decision" } }, { status: 500 }); })
  );
  function Harness() {
    queryClient = useQueryClient();
    const [, refreshSession] = useState(0);
    return <MemoryRouter initialEntries={["/projects/project-one/quotation"]}>
      <Link to="/projects/project-two/quotation">Open second project</Link>
      <button onClick={() => { actor.reviewSession = { id: "session-two" }; refreshSession(value => value + 1); }}>Switch session</button>
      <Routes><Route path="/projects/:projectId/quotation" element={<ProjectQuotationWorkspace />} /></Routes>
    </MemoryRouter>;
  }
  return { ...renderWithQuery(<Harness />), writes, details, designerTasks, getClient: () => queryClient };
}

describe("ProjectQuotationWorkspace", () => {
  it("shows saved Client items and prevents approval until unsaved changes are discarded", async () => {
    const { container, writes } = setup();
    const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    expect(quantity).toHaveValue(2);
    expect(screen.getByText("Project ID: Lisno000031")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Review quotation" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", "/client/projects/project-one");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.clear(quantity); await user.type(quantity, "5");
    window.dispatchEvent(new Event("resize"));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toBe(quantity);
    expect(quantity).toHaveValue(5);
    expect(quantity).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Approve quotation" })).not.toBeInTheDocument();
    expect(screen.getByText(/Save or discard your quotation changes/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(quantity).toHaveValue(2);
    expect(screen.getByRole("button", { name: "Review quotation" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review quotation" }));
    expect(await screen.findByRole("heading", { name: "Pre-design quotation review" })).toBeVisible();
    expect(screen.getAllByText("Project ID: Lisno000031")).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it("does not carry a dirty draft or approval block into a different project", async () => {
    const { writes } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "5");
    expect(await screen.findByText(/Save or discard your quotation changes/)).toBeVisible();
    // MemoryRouter represents an externally changed project; navigation confirmation is covered separately.
    await user.click(screen.getByRole("link", { name: "Open second project" }));
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Bedroom Unit" })).toHaveValue(7);
    expect(screen.getByText("Project ID: Lisno000084")).toBeVisible();
    expect(screen.queryByText("Project ID: Lisno000031")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /Kitchen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review quotation" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", "/client/projects/project-two");
    expect(screen.queryByText("Home project-one")).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it("clears the previous session's local edits and pending approval state", async () => {
    setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "5");
    expect(await screen.findByText(/Save or discard your quotation changes/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Switch session" }));
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(2));
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review quotation" })).toBeEnabled();
  });

  it("keeps the Designer presentation read-only even when the quotation response permits editing", async () => {
    actor.user = { id: "secondary-designer", role: "designer" };
    const { writes } = setup([], details => {
      details[0]!.canChangePricingMode = true;
      details[0]!.lines[0] = { ...details[0]!.lines[0]!, classification: "special", pricingMode: "pmc",
        pricingModeChoices: [{ pricingMode: "pmc", choices: details[0]!.lines[0]!.choices }] };
    }); const user = userEvent.setup();
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toBeDisabled();
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.queryByRole("switch", { name: "PMC pricing mode for Storage in Kitchen" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Mode for Storage units in Kitchen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project estimate" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to design plans" })).toHaveAttribute("href", "/designer/design-plans");
    await user.click(screen.getByText("Estimate options"));
    await user.click(screen.getByRole("button", { name: "View baskets" }));
    expect(screen.getByRole("heading", { name: "Main Baskets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(2);
    expect(writes).toEqual([]);
  });
});

function designerTask(projectId = "project-one", overrides: Partial<DesignPlanTask> = {}): DesignPlanTask {
  return { id: `task-${projectId}`, projectId, estimateId: `estimate-${projectId}`, leadId: `lead-${projectId}`,
    estimationWorkflowVersion: 3, canEditQuotation: true, quotationApprovalState: "initial_current",
    projectName: `Home ${projectId}`, clientName: "Sample client", status: "assigned", designPlanVersion: 1,
    rooms: [], scopes: [], lineItems: [], ...overrides };
}

function setupDesigner(tasks = [designerTask()], customize?: (details: QuotationDetail[]) => void) {
  actor.user = { id: "primary-designer", role: "designer" };
  return setup(tasks, details => {
    for (const detail of details) Object.assign(detail, { phase: "post", status: "client_approved", reviewState: "approved", quotationApprovalState: "initial_current" });
    customize?.(details);
  });
}

describe("Designer estimate editing entry point", () => {
  it("links the authorized primary to the exact staff editor without enabling the Client projection", async () => {
    const { container, writes } = setupDesigner([designerTask("project-two"), designerTask("project-one", { leadId: "assigned/lead-one" })]);
    const link = await screen.findByRole("link", { name: "Add / edit estimate items" });
    expect(link).toHaveAttribute("href", "/estimator-sales/leads/assigned%2Flead-one/estimate");
    link.focus(); expect(link).toHaveFocus();
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toBeDisabled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it.each(["secondary", "wrong-project", "wrong-estimate", "ambiguous", "missing-lead", "missing-state", "different-state"])("does not expose an edit link for %s capability data", async scenario => {
    const task = designerTask();
    const tasks = [task];
    if (scenario === "secondary") task.canEditQuotation = false;
    if (scenario === "wrong-project") task.projectId = "project-two";
    if (scenario === "wrong-estimate") task.estimateId = "old-estimate";
    if (scenario === "ambiguous") tasks.push({ ...task, id: "duplicate", leadId: "another-lead" });
    if (scenario === "missing-lead") delete task.leadId;
    if (scenario === "missing-state") delete task.quotationApprovalState;
    if (scenario === "different-state") task.quotationApprovalState = "revision_draft";
    const { getClient } = setupDesigner(tasks);
    await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await waitFor(() => expect(getClient().isFetching()).toBe(0));
    expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View estimate" })).not.toBeInTheDocument();
  });

  it.each(["revision_pending_client", "revision_current"] as const)("preserves viewing and explicit reopening for %s", async state => {
    setupDesigner([designerTask("project-one", { quotationApprovalState: state })], details => Object.assign(details[0]!, { quotationApprovalState: state, editingAllowed: false }));
    expect(await screen.findByRole("link", { name: "View estimate" })).toHaveAttribute("href", "/estimator-sales/leads/lead-project-one/estimate");
    expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument();
  });

  it("resolves each project independently and rechecks capabilities when the session changes", async () => {
    const { designerTasks, getClient } = setupDesigner([designerTask(), designerTask("project-two")]);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: "Add / edit estimate items" })).toHaveAttribute("href", "/estimator-sales/leads/lead-project-one/estimate");
    await user.click(screen.getByRole("link", { name: "Open second project" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Add / edit estimate items" })).toHaveAttribute("href", "/estimator-sales/leads/lead-project-two/estimate"));
    designerTasks[1]!.canEditQuotation = false;
    await user.click(screen.getByRole("button", { name: "Switch session" }));
    expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument();
    await waitFor(() => expect(getClient().isFetching()).toBe(0));
    expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument();
  });

  it("hides cached editing access during refresh and offers retry after failure", async () => {
    const fixture = setupDesigner();
    await screen.findByRole("link", { name: "Add / edit estimate items" });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/designer/design-plan-tasks", async () => { await pending; return HttpResponse.json({ error: { message: "Unavailable" } }, { status: 503 }); }));
    let refresh!: Promise<void>;
    act(() => { refresh = fixture.getClient().invalidateQueries({ queryKey: projectWorkflowKeys.designerPlans }); });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument());
    await act(async () => { release(); await refresh; });
    expect(await screen.findByRole("button", { name: "Retry editing access" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add / edit estimate items" })).not.toBeInTheDocument();
    server.use(http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: fixture.designerTasks })));
    await userEvent.click(screen.getByRole("button", { name: "Retry editing access" }));
    expect(await screen.findByRole("link", { name: "Add / edit estimate items" })).toBeVisible();
  });
});
