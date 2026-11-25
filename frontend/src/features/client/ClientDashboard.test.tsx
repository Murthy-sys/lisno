import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type { ClientProjectSummary, ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import { renderApp } from "../../test/render";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };
const summaries: ClientProjectSummary[] = [
  {
    id: "project-villa", name: "Aurora Villa", projectNumber: "Lisno000021",
    status: "active", location: "Bengaluru", progress: 64, floorCount: 3,
    plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z",
    actualStartAt: null, actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "project-loft", name: "Cedar Loft", projectNumber: "Lisno000083",
    status: "on_hold", location: "Mysuru", progress: 17, floorCount: 1,
    plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-10-30T00:00:00.000Z",
    actualStartAt: null, actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
  }
];

const visibility = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  visibility.clear();
  vi.stubGlobal("IntersectionObserver", class {
    readonly root = null; readonly rootMargin = "0px"; readonly thresholds = [0];
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { visibility.set(target, this.callback); }
    unobserve(target: Element) { visibility.delete(target); }
    disconnect() { for (const [target, callback] of visibility) if (callback === this.callback) visibility.delete(target); }
    takeRecords() { return []; }
  });
});
afterEach(() => vi.unstubAllGlobals());

async function showRows(rows: Element[]) {
  await act(async () => {
    rows.forEach(target => visibility.get(target)?.([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  });
}

function workflowStatus(projectId: string): ProjectStatusSummary {
  const label = projectId.includes("loft") ? "Design approval" : "Estimate preparation";
  return {
    projectId, projectName: "Shared home", projectStatus: "planning", state: "active", serverNow: "2026-11-24T00:00:00Z", issue: null,
    currentStage: { key: "estimate_approval", label },
    pendingActions: [{ id: "action", stageKey: "estimate_approval", stageLabel: label, action: "Complete the current stage", state: "pending", responsibleRole: "client", people: [], scheduledAt: null, deadlineAt: null, blocker: null }]
  };
}

function projectPage(items: readonly unknown[], offset = 0, total = items.length) {
  return Response.json({ data: { items, pagination: { limit: 100, offset, total, hasMore: offset + 100 < total } } });
}

function installApi(projectResponse: (url: string) => Response | Promise<Response> = () => projectPage(summaries), noEstimates = false) {
  tokenStorage.set("client-token");
  return vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ data: client });
    if (url.endsWith("/auth/authorization")) return Response.json({ data: authorizationFor(client.role) });
    if (url.includes("/client/project-summaries?")) return projectResponse(url);
    const status = url.match(/\/projects\/([^/]+)\/status$/);
    if (status) return Response.json({ data: workflowStatus(decodeURIComponent(status[1]!)) });
    if (url.endsWith("/client/estimates")) return Response.json({ data: noEstimates ? [] : ["project-villa", "project-loft", "project/villa ?#1", "project loft%2", "project-new"].map(projectId => withPublishedReview({
      id: `estimate-${projectId}`, projectId, version: projectId.includes("loft") ? 4 : 3,
      status: projectId.includes("loft") ? "client_approved" : "sent_to_client", propertyType: "Villa", rooms: [], scopes: [], lineItems: [],
      subtotal: 0, gst: 0, total: 0, approvalRequired: true,
      lead: { _id: `lead-${projectId}`, projectId, clientName: "Client", projectName: "Shared home", location: "Test" }
    })) });
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("ClientDashboard project table", () => {
  it("shows workflow stages for visible rows while preserving the other project values and direct links", async () => {
    const api = installApi();
    renderApp(["/client"]);

    const table = await screen.findByRole("table", { name: "Projects" });
    expect(screen.getByRole("heading", { name: "My projects", level: 1 })).toBeVisible();
    expect(screen.getByText("2 projects")).toBeVisible();
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual([
      "Project", "Location", "Status", "Expected completion", "Action"
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(api.mock.calls.map(([input]) => String(input)).filter(url => !url.includes("/auth/"))).toEqual([
      "/api/v1/client/project-summaries?limit=100&offset=0",
      "/api/v1/client/estimates"
    ]);
    await showRows(rows);
    await within(rows[0]!).findByText("Estimate");
    await within(rows[1]!).findByText("Post approval");
    const expected = [
      ["Bengaluru", "Estimate", "30 Sept 2026"],
      ["Mysuru", "Post approval", "30 Oct 2026"]
    ];
    rows.forEach((row, index) => {
      const project = summaries[index]!;
      const cells = within(row).getAllByRole("cell");
      expect(cells).toHaveLength(4);
      expect(within(within(row).getByRole("rowheader")).getByText(`Project ID: ${project.projectNumber}`)).toBeVisible();
      expected[index]!.forEach((value, column) => expect(cells[column]).toHaveTextContent(value));
      const name = within(row).getByRole("link", { name: project.name });
      const open = within(row).getByRole("link", { name: `Open project: ${project.name}` });
      expect(name).toHaveAttribute("href", `/client/projects/${project.id}`);
      expect(open).toHaveAttribute("href", name.getAttribute("href"));
      expect(open).toHaveTextContent("Open project");
    });
    expect(screen.queryByRole("region", { name: "Client overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Estimate review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Project details:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.mock.calls.map(([input]) => String(input)).filter(url => !url.includes("/auth/"))).toEqual([
      "/api/v1/client/project-summaries?limit=100&offset=0",
      "/api/v1/client/estimates",
      "/api/v1/projects/project-villa/status",
      "/api/v1/projects/project-loft/status"
    ]);
  });

  it("keeps different workflow stages, public numbers and destinations attached to same-named planning projects", async () => {
    const rows = [
      { ...summaries[0]!, id: "project/villa ?#1", name: "Shared home", status: "planning" },
      { ...summaries[1]!, id: "project loft%2", name: "Shared home", status: "planning" },
      { ...summaries[0]!, id: "project-new", name: "New home", projectNumber: null }
    ];
    installApi(() => projectPage(rows));
    renderApp(["/client"]);

    const table = await screen.findByRole("table", { name: "Projects" });
    const displayed = within(table).getAllByRole("row").slice(1);
    await showRows(displayed);
    expect(await within(displayed[0]!).findByText("Estimate")).toBeVisible();
    expect(await within(displayed[1]!).findByText("Post approval")).toBeVisible();
    expect(within(displayed[0]!).queryByText("Post approval")).not.toBeInTheDocument();
    expect(within(displayed[1]!).queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
    rows.forEach((project, index) => {
      const row = within(displayed[index]!);
      expect(row.getByRole("link", { name: project.name })).toHaveAttribute("href", `/client/projects/${encodeURIComponent(project.id)}`);
      expect(row.getByRole("link", { name: `Open project: ${project.name}` })).toHaveAttribute("href", `/client/projects/${encodeURIComponent(project.id)}`);
      expect(row.getByText(project.projectNumber ? `Project ID: ${project.projectNumber}` : "Project ID not assigned")).toBeVisible();
    });
    expect(within(displayed[0]!).queryByText("Project ID: Lisno000083")).not.toBeInTheDocument();
    expect(within(displayed[1]!).queryByText("Project ID: Lisno000021")).not.toBeInTheDocument();
  });

  it("loads every summary page and preserves the returned project ordering", async () => {
    const projects = Array.from({ length: 201 }, (_, index) => ({
      ...summaries[index % 2]!, id: `project-${201 - index}`, name: `Home ${201 - index}`,
      projectNumber: `Lisno${String(index + 1).padStart(6, "0")}`
    }));
    const api = installApi(url => {
      const offset = Number(url.match(/offset=(\d+)/)?.[1]);
      return projectPage(projects.slice(offset, offset + 100), offset, projects.length);
    });
    renderApp(["/client"]);

    const table = await screen.findByRole("table", { name: "Projects" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(201);
    expect(screen.getByText("201 projects")).toBeVisible();
    expect(rows.map(row => within(row).getAllByRole("link")[0]!.textContent)).toEqual(projects.map(project => project.name));
    expect(api.mock.calls.some(([input]) => String(input).endsWith("/status"))).toBe(false);
    expect(api.mock.calls.map(([input]) => String(input)).filter(url => url.includes("project-summaries"))).toEqual([
      "/api/v1/client/project-summaries?limit=100&offset=0",
      "/api/v1/client/project-summaries?limit=100&offset=100",
      "/api/v1/client/project-summaries?limit=100&offset=200"
    ]);
  });

  it.each([undefined, null, "", "not-a-date"])("shows unavailable completion for an absent or invalid date (%s)", async plannedEndAt => {
    installApi(() => projectPage([{ ...summaries[0]!, plannedEndAt }]));
    renderApp(["/client"]);
    const table = await screen.findByRole("table", { name: "Projects" });
    expect(within(within(table).getAllByRole("row")[1]!).getAllByRole("cell")[2]).toHaveTextContent("Not available");
    expect(screen.queryByText(/Invalid Date|1970/)).not.toBeInTheDocument();
  });

  it("keeps loading distinct from the empty state until projects arrive", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    installApi(() => pending);
    renderApp(["/client"]);
    try {
      expect(await screen.findByText("Loading your projects…")).toBeVisible();
      expect(screen.queryByText("No projects shared yet.")).not.toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "Projects" })).not.toBeInTheDocument();
    } finally {
      await act(async () => release(projectPage(summaries)));
    }
    expect(await screen.findByRole("table", { name: "Projects" })).toBeVisible();
    expect(screen.queryByText("Loading your projects…")).not.toBeInTheDocument();
  });

  it("shows a clear empty account without fabricated project data", async () => {
    installApi(() => projectPage([]));
    renderApp(["/client"]);
    expect(await screen.findByText("No projects shared yet.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "My projects" })).toBeVisible();
    expect(screen.getByText("0 projects")).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Open project:/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
  });

  it("retries an initial failed project read and shows the recovered table", async () => {
    let attempts = 0;
    installApi(() => ++attempts === 1
      ? Response.json({ error: { code: "UNAVAILABLE", message: "Projects unavailable" } }, { status: 503 })
      : projectPage(summaries));
    renderApp(["/client"]);
    expect(await screen.findByText("We couldn't load your projects.")).toBeVisible();
    expect(screen.queryByText("No projects shared yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Projects" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Projects" })).toBeVisible();
    expect(attempts).toBe(2);
  });

  it.each(["missing-estimate", ""])("retains estimate review only for an explicit estimate query parameter (%s)", async estimateId => {
    const api = installApi(undefined, true);
    renderApp([`/client?estimate=${estimateId}`]);
    const review = await screen.findByRole("region", { name: "Estimate review" });
    expect(await within(review).findByText("No estimates are available yet. Your team will share them here when ready.")).toBeVisible();
    expect(screen.getByRole("table", { name: "Projects" })).toBeVisible();
    if (estimateId) expect(within(review).getByText(/The estimate in this link is unavailable/)).toBeVisible();
    expect(api.mock.calls.map(([input]) => String(input)).filter(url => url.endsWith("/client/estimates"))).toHaveLength(1);
  });
});
