import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import { estimateWorkflowKeys, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { ClientEstimateSummary } from "./ClientEstimateSummary";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "client-one", role: "client" } }) }));

const projects = [{ id: "project-one", name: "Cedar Home" }, { id: "project-two", name: "Lakeside Studio" }];

function estimate(id: string, projectId: string | null, phase: "pre" | "post" = "pre"): EstimateQueueItem {
  const value = withPublishedReview({
    id, projectId, version: 3, workflowVersion: 3 as const, propertyType: "Villa", rooms: [], scopes: [],
    status: "sent_to_client" as const, approvalRequired: true,
    lineItems: [{ catalogueId: "private-render-test", roomName: "Kitchen", specification: `Do not repeat item ${id}`, unit: "Unit", quantity: 4, rate: 370, amount: 1480, included: true }],
    subtotal: 1480, gst: 266.4, total: 1746.4,
    lead: { _id: `lead-${id}`, clientName: "Client", projectName: `Published ${id}`, location: "Bengaluru" }
  });
  value.publishedReview.phase = phase;
  value.publishedReview.workflowVersion = 3;
  return value;
}

function setup(rows: EstimateQueueItem[], options: { selectedEstimateId?: string; projectsFresh?: boolean } = {}) {
  const state = { rows, error: 0, calls: 0 };
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return null; }
  server.use(http.get("/api/v1/client/estimates", () => {
    state.calls += 1;
    return state.error ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: state.error }) : HttpResponse.json({ data: state.rows });
  }));
  const view = renderWithQuery(<MemoryRouter><Capture /><main><h1>Client home</h1><ClientEstimateSummary projects={projects} projectsFresh={options.projectsFresh ?? true} selectedEstimateId={options.selectedEstimateId} /></main></MemoryRouter>);
  return { ...view, state, client: () => client };
}

describe("ClientEstimateSummary", () => {
  it("links two unequal projects to their saved estimation workspaces without repeating rows or decisions", async () => {
    const second = estimate("estimate-two", "project-two", "post");
    second.total = 92341; second.publishedReview!.snapshot.total = 92341;
    const { container } = setup([estimate("estimate-one", "project-one"), second], { selectedEstimateId: "estimate-two" });
    const list = await screen.findByRole("list", { name: "Project estimates" });
    expect(within(list).getByRole("link", { name: "Review estimate: Cedar Home" })).toHaveAttribute("href", "/projects/project-one/quotation");
    const selectedRow = within(list).getByRole("heading", { name: "Lakeside Studio" }).closest("li")!;
    expect(within(selectedRow).getByRole("link", { name: "Review estimate: Lakeside Studio" })).toHaveAttribute("href", "/projects/project-two/quotation");
    expect(within(selectedRow).getByText("Estimate from your link")).toBeVisible();
    expect(within(selectedRow).getByText("Ready for your post-design approval")).toBeVisible();
    expect(screen.queryByText(/Do not repeat item/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve|Request changes|Export as PDF/ })).not.toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows saved changes waiting for Sales and still opens the same estimation workspace", async () => {
    const changed = estimate("estimate-one", "project-one");
    changed.status = "draft";
    changed.publishedReview!.status = "superseded";
    changed.publishedReview!.canDecide = false;
    setup([changed]);
    expect(await screen.findByText("Waiting for Sales confirmation")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open estimation: Cedar Home" })).toHaveAttribute("href", "/projects/project-one/quotation");
    expect(screen.queryByRole("link", { name: /Review estimate/ })).not.toBeInTheDocument();
  });

  it("does not label a mismatched published version ready for approval", async () => {
    const changed = estimate("estimate-one", "project-one");
    changed.version = 4;
    setup([changed]);
    expect(await screen.findByText("Open your estimation workspace to check the latest review status.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open estimation: Cedar Home" })).toBeVisible();
    expect(screen.queryByText("Ready for your pre-design approval")).not.toBeInTheDocument();
  });

  it("keeps legacy review expansion while a version supplied by the published contract uses compact navigation", async () => {
    const legacy = estimate("legacy-estimate", "project-two");
    legacy.workflowVersion = 2;
    legacy.status = "client_changes_requested";
    legacy.publishedReview!.workflowVersion = 2;
    legacy.publishedReview!.status = "changes_requested";
    legacy.publishedReview!.canDecide = false;
    const modern = estimate("estimate-one", "project-one");
    delete modern.workflowVersion;
    const { state } = setup([modern, legacy], { selectedEstimateId: legacy.id });
    expect(await screen.findByRole("link", { name: "Review estimate: Cedar Home" })).toBeVisible();
    expect(await screen.findByText("Do not repeat item legacy-estimate")).toBeVisible();
    expect(screen.queryByText("Do not repeat item estimate-one")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Published legacy-estimate" })).toHaveAttribute("aria-expanded", "true");
    expect(state.calls).toBe(1);
  });

  it.each([
    ["missing selected estimate", [estimate("estimate-one", "project-one")], "unknown-estimate"],
    ["unlinked estimate", [estimate("estimate-one", null)], "estimate-one"],
    ["unauthorized project", [estimate("estimate-one", "project-foreign")], "estimate-one"],
    ["ambiguous project", [estimate("estimate-one", "project-one"), estimate("estimate-other", "project-one")], "estimate-one"],
    ["duplicate estimate identity", [estimate("estimate-one", "project-one"), estimate("estimate-one", "project-two")], "estimate-one"]
  ] as const)("does not guess a target for a %s", async (_label, rows, selectedEstimateId) => {
    setup([...rows], { selectedEstimateId });
    expect(await screen.findByText(/The estimate in this link is unavailable/)).toBeVisible();
    expect(document.body).not.toHaveTextContent("unknown-estimate");
    expect(document.querySelector('[href*="project-foreign"]')).toBeNull();
    if (selectedEstimateId !== "unknown-estimate") expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([403, 404, 503])("retires cached estimate links on %s and restores them only after a successful retry", async status => {
    const { state, client } = setup([estimate("estimate-one", "project-one")]);
    expect(await screen.findByRole("link", { name: "Review estimate: Cedar Home" })).toBeVisible();
    state.error = status;
    await act(async () => { await client().refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your estimates could not be refreshed");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Cedar Home");
    state.error = 503;
    await userEvent.click(screen.getByRole("button", { name: "Retry estimates" }));
    await waitFor(() => expect(client().isFetching()).toBe(0));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    state.error = 0;
    await userEvent.click(screen.getByRole("button", { name: "Retry estimates" }));
    expect(await screen.findByRole("link", { name: "Review estimate: Cedar Home" })).toBeVisible();
  });

  it("does not open an estimate from stale project membership data", async () => {
    setup([estimate("estimate-one", "project-one")], { projectsFresh: false });
    expect(await screen.findByText("Refresh your project list before opening an estimation workspace.")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("distinguishes loading from no estimates", async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/client/estimates", async () => { await waiting; return HttpResponse.json({ data: [] }); }));
    renderWithQuery(<MemoryRouter><ClientEstimateSummary projects={projects} projectsFresh /></MemoryRouter>);
    expect(within(screen.getByRole("region", { name: "Estimation" })).getByRole("status")).toHaveTextContent("Loading your estimates");
    await act(async () => { release(); });
    expect(await screen.findByText("No estimates are available yet. Your team will share them here when ready.")).toBeVisible();
  });
});
