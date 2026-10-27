import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectManagerDashboard, ProjectManagerProjectPage, projectManagerReturnPath } from "./ProjectManagerWorkspace";
import type { PMPanel, PMPortfolio, PMProgress, PMProject } from "./projectManagerTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-a", role: "site_manager", name: "Project Manager A" }, authorization: { role: "site_manager", permissions: ["pm.workspace.read", "pm.performance.read"] } }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
vi.mock("../execution/ExecutionWorkspace", () => ({ ProjectExecutionPage: ({ projectId }: { projectId: string }) => <p>Full execution detail for {projectId}</p> }));
vi.mock("./PMRequestsPanel", () => ({ PMRequestsPanel: ({ tab }: { tab: string }) => <h2>{tab} request panel</h2> }));
vi.mock("./PMOperationsPanel", () => ({ PMOperationsPanel: ({ tab }: { tab: string }) => <h2>{tab} operations panel</h2> }));

const progress: PMProgress = { basis: "approved_execution_scope_v1", actual: 37.5, planned: 60, availability: "available", sourceRevision: "approved-a", issues: [], requiredLines: 5, coveredLines: 4, zeroValueLines: 1, reportedComplete: 1, siteVerified: 0, clientAccepted: 0 };
const project: PMProject = { id: "project-a", name: "Cedar residence", clientName: "Client A", location: "North district", status: "active", health: "at_risk", progress, plannedEndAt: "2026-11-30T00:00:00.000Z", approvedNetPaise: 12500000, issues: [], activeAlerts: 1 };
const portfolio: PMPortfolio = { items: [project], total: 1, counts: { active: 7, atRisk: 2, critical: 1, setup: 2, onTrack: 2, incomplete: 1 }, alerts: [{ id: "alert-a", projectId: "project-a", projectName: "Cedar residence", tab: "selections", entityId: "selection-a", title: "Finish decision overdue", detail: "Living room finish requires review", severity: "warning", dueAt: "2026-10-20" }], alertTotal: 1, calculatedAt: "2026-10-27T09:00:00Z" };
const site: PMPanel = { tab: "site", availability: "available", calculatedAt: portfolio.calculatedAt, total: 1, issues: [], sources: [], people: [], actions: [], items: [{ id: "room-a", kind: "room", title: "Living room", status: "execution", severity: "neutral", version: 0, sourceToken: null, facts: [], actions: [], children: [{ id: "work-a", assignmentId: "work-a", kind: "execution", title: "Custom joinery", status: "in_progress", severity: "warning", version: 2, sourceToken: null, ownerName: "Workshop A", progress: 50, description: "Finish sample pending", facts: [{ label: "Vendor", value: "Workshop A" }, { label: "Site verified", value: "Pending" }, { label: "Client acceptance", value: "Pending" }], actions: [] }] }] };

beforeEach(() => {
  server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: portfolio })),
    http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ data: { project, capabilities: ["execution_detail"], calculatedAt: portfolio.calculatedAt } })),
    http.get("/api/v1/projects/project-a/pm/site", () => HttpResponse.json({ data: site })));
});
function Location() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}{location.search}</output>; }
function renderWorkspace(path = "/execution") { return renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/execution" element={<ProjectManagerDashboard />} /><Route path="/projects/:projectId/execution" element={<ProjectManagerProjectPage />} /></Routes><Location /></MemoryRouter>); }

describe("Project Manager workspace", () => {
  it("shows complete backend counts and one source-backed progress bar per project", async () => {
    renderWorkspace();
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
    const summary = screen.getByRole("region", { name: "Project summary" });
    expect(within(summary).getByRole("button", { name: /Active projects 7/ })).toBeVisible();
    expect(within(summary).getByRole("button", { name: /At risk 2 1 critical/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "1 with incomplete source data" })).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37.5");
    expect(screen.getByText("Approved net value: ₹1,25,000")).toBeVisible();
  });

  it("keeps search, status, health and pagination in the URL and preserves return navigation", async () => {
    const requests: URL[] = [];
    server.use(http.get("/api/v1/project-manager/projects", ({ request }) => { requests.push(new URL(request.url)); return HttpResponse.json({ data: { ...portfolio, total: 41 } }); }));
    const user = userEvent.setup(); renderWorkspace("/execution?q=Cedar&status=all&health=at_risk&offset=20");
    const link = await screen.findByRole("link", { name: "Open project Cedar residence" });
    await user.click(link);
    const back = await screen.findByRole("link", { name: "All projects" });
    expect(back).toHaveAttribute("href", "/execution?q=Cedar&status=all&health=at_risk&offset=20");
    expect(await screen.findByRole("heading", { name: "Living room" })).toBeVisible();
    await user.click(back);
    expect(await screen.findByRole("searchbox", { name: "Search projects" })).toHaveValue("Cedar");
    await user.selectOptions(screen.getByRole("combobox", { name: "Project health" }), "setup");
    await waitFor(() => expect(requests.at(-1)?.searchParams.get("health")).toBe("setup"));
    expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
    expect(requests.at(-1)?.searchParams.get("status")).toBe("all");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get("offset")).toBe("20"));
  });

  it("deep-links priorities to the correct tab and preserves an encoded entity identity", async () => {
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("link", { name: /Finish decision overdue/ }));
    expect(await screen.findByRole("heading", { name: "selections request panel" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Selections" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Current route")).toHaveTextContent("entity=selection-a");
    await user.click(screen.getByRole("link", { name: "Quality" }));
    expect(await screen.findByRole("heading", { name: "quality operations panel" })).toBeVisible();
    expect(screen.getByLabelText("Current route")).not.toHaveTextContent("entity=selection-a");
  });

  it("shows unknown progress and money without fabricating a zero or healthy status", async () => {
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, items: [{ ...project, health: "incomplete", approvedNetPaise: null, progress: { ...progress, actual: null, planned: null, availability: "source_unavailable" }, issues: ["Approved scope is unavailable."] }] } })));
    renderWorkspace();
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
    expect(screen.getByText("Incomplete", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.getByText("Approved net value: Unavailable")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Approved scope is unavailable.")).toBeVisible();
  });

  it("replaces previously visible records when assignment access is revoked", async () => {
    const user = userEvent.setup(); renderWorkspace();
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ error: { code: "PM_NOT_FOUND", message: "Assignment changed." } }, { status: 404 })));
    await user.click(screen.getByRole("button", { name: "Refresh projects" }));
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open project Cedar residence" })).not.toBeInTheDocument();
  });

  it("pages the expanded priority view through the server", async () => {
    const alertReads: URL[] = [];
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, alertTotal: 25 } })), http.get("/api/v1/project-manager/alerts", ({ request }) => { alertReads.push(new URL(request.url)); return HttpResponse.json({ data: { items: portfolio.alerts, total: 25 } }); }));
    const user = userEvent.setup(); renderWorkspace("/execution?q=Cedar&status=all");
    await user.click(await screen.findByRole("button", { name: "View all 25" }));
    await waitFor(() => expect(alertReads).toHaveLength(1));
    expect(alertReads[0]?.searchParams.get("q")).toBe("Cedar");
    expect(alertReads[0]?.searchParams.get("status")).toBe("all");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(alertReads.at(-1)?.searchParams.get("offset")).toBe("20"));
  });

  it("opens the existing detail view with the stable assignment ID", async () => {
    const user = userEvent.setup(); renderWorkspace("/projects/project-a/execution?tab=site&returnTo=%2Fexecution%3Fq%3DCedar");
    await user.click(await screen.findByRole("link", { name: "Open Custom joinery in Living room" }));
    expect(await screen.findByText("Full execution detail for project-a")).toBeVisible();
    expect(screen.getByLabelText("Current route")).toHaveTextContent("assignment=work-a");
    expect(screen.getByLabelText("Current route")).toHaveTextContent("detail=1");
    await user.click(screen.getByRole("link", { name: "Back to project tabs" }));
    expect(await screen.findByRole("heading", { name: "Site execution" })).toBeVisible();
  });

  it("opens old assignment-only links in full detail and returns to the eight project tabs", async () => {
    renderWorkspace("/projects/project-a/execution?assignment=work-a");
    expect(await screen.findByText("Full execution detail for project-a")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Project sections" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Back to project tabs" }));
    expect(await screen.findByRole("heading", { name: "Site execution" })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Project sections" })).getAllByRole("link")).toHaveLength(8);
    expect(screen.getByLabelText("Current route")).not.toHaveTextContent("assignment=");
  });

  it("displays unavailable KPI policy without a fabricated score", async () => {
    server.use(http.get("/api/v1/kpis/users/pm-a", () => HttpResponse.json({ data: { score: 82, components: [] } })));
    server.use(http.get("/api/v1/project-manager/performance", () => HttpResponse.json({ data: { availability: "not_configured", policy: null, message: "A Project Manager KPI policy has not been configured.", calculatedAt: portfolio.calculatedAt, metrics: [{ label: "Active projects", value: "7" }] } })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click(screen.getByRole("button", { name: "My KPI" }));
    const performance = await screen.findByRole("region", { name: "My performance" });
    expect(await within(performance).findByText("A Project Manager KPI policy has not been configured.")).toBeVisible();
    expect(within(performance).getByText("Policy not configured")).toBeVisible();
    expect(within(performance).queryByText("0")).not.toBeInTheDocument();
    expect(await within(performance).findByRole("heading", { name: "KPI overview" })).toBeVisible();
    expect(within(screen.getByLabelText("Personal KPI score")).getByText("82")).toBeVisible();
    expect(screen.getByRole("button", { name: "My KPI" })).toHaveAttribute("aria-expanded", "true");
  });
});

it.each(["https://example.com/execution", "//example.com/execution", "/execution/../admin", "/execution\\admin", "/projects/a/execution", "/execution%2fadmin"])("rejects an unsafe return path %s", path => expect(projectManagerReturnPath(path)).toBe("/execution"));
