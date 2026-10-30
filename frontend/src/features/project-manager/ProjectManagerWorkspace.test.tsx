import { screen, waitFor, within } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { RouteFocusManager } from "../../components/layout/RouteFocusManager";
import { ProjectManagerDashboard, ProjectManagerProjectPage, projectManagerReturnPath } from "./ProjectManagerWorkspace";
import type { PMPanel, PMPortfolio, PMProgress, PMProject } from "./projectManagerTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-a", role: "site_manager", name: "Project Manager A" }, authorization: { role: "site_manager", permissions: ["pm.workspace.read", "pm.performance.read"] } }) }));
const connection = vi.hoisted(() => ({ state: "live" }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => connection.state }));
vi.mock("../execution/ExecutionWorkspace", () => ({ ProjectExecutionPage: ({ projectId }: { projectId: string }) => <p>Full execution detail for {projectId}</p> }));
vi.mock("./PMRequestsPanel", () => ({ PMRequestsPanel: ({ tab }: { tab: string }) => <h2>{tab} request panel</h2> }));
vi.mock("./PMOperationsPanel", () => ({ PMOperationsPanel: ({ tab }: { tab: string }) => <h2>{tab} operations panel</h2> }));

const progress: PMProgress = { basis: "approved_execution_scope_v1", actual: 37.5, planned: 60, availability: "available", sourceRevision: "approved-a", issues: [], requiredLines: 5, coveredLines: 4, zeroValueLines: 1, reportedComplete: 1, siteVerified: 0, clientAccepted: 0 };
const project: PMProject = { id: "project-a", name: "Cedar residence", clientName: "Client A", location: "North district", status: "active", health: "at_risk", progress, plannedEndAt: "2026-11-30T00:00:00.000Z", approvedNetPaise: 12500000, issues: [], activeAlerts: 1 };
const portfolio: PMPortfolio = { items: [project], total: 1, counts: { active: 7, atRisk: 2, critical: 1, setup: 2, onTrack: 2, incomplete: 1 }, alerts: [{ id: "alert-a", projectId: "project-a", projectName: "Cedar residence", tab: "selections", entityId: "selection-a", title: "Finish decision overdue", detail: "Living room finish requires review", severity: "warning", dueAt: "2026-10-20" }], alertTotal: 1, calculatedAt: "2026-10-27T09:00:00Z" };
const site: PMPanel = { tab: "site", availability: "available", calculatedAt: portfolio.calculatedAt, total: 1, issues: [], sources: [], people: [], actions: [], items: [{ id: "room-a", kind: "room", title: "Living room", status: "execution", severity: "neutral", version: 0, sourceToken: null, facts: [], actions: [], children: [{ id: "work-a", assignmentId: "work-a", kind: "execution", title: "Custom joinery", status: "in_progress", severity: "warning", version: 2, sourceToken: null, ownerName: "Workshop A", progress: 50, description: "Finish sample pending", facts: [{ label: "Vendor", value: "Workshop A" }, { label: "Site verified", value: "Pending" }, { label: "Client acceptance", value: "Pending" }], actions: [] }] }] };

beforeEach(() => {
  connection.state = "live";
  server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: portfolio })),
    http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ data: { project, capabilities: ["execution_detail"], calculatedAt: portfolio.calculatedAt } })),
    http.get("/api/v1/projects/project-a/pm/site", () => HttpResponse.json({ data: site })));
});
function Location() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}{location.search}</output>; }
function RefetchProject() {
  const client = useQueryClient();
  return <button type="button" onClick={() => void client.refetchQueries({ queryKey: ["project-manager"] })}>Refresh project data</button>;
}
function renderWorkspace(path = "/execution", refetchControl = false) { return renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/execution" element={<ProjectManagerDashboard />} /><Route path="/projects/:projectId/execution" element={<ProjectManagerProjectPage />} /></Routes>{refetchControl ? <RefetchProject /> : null}<Location /></MemoryRouter>); }
function installProject(next: PMProject = project, panel: PMPanel = site) {
  server.use(
    http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ data: { project: next, capabilities: ["execution_detail"], calculatedAt: portfolio.calculatedAt } })),
    http.get("/api/v1/projects/project-a/pm/site", () => HttpResponse.json({ data: panel }))
  );
}
function expectFact(label: string, value: string) {
  const term = screen.getByText(label, { selector: "dt" });
  expect(term.nextElementSibling).toHaveTextContent(value);
}

describe("Project Manager workspace", () => {
  it("opens the linked-vendor picker from the project's Procurement tab", async () => {
    const source = { estimateId: "estimate-a", estimateVersion: 3, estimateReviewRoundId: "round-a", phase: "post", designPlanVersion: 0, sourceSnapshotId: "round-a", sourceDigest: "a".repeat(64) };
    const mainLine = { mainLineId: "line-joinery", mainLineName: "Approved joinery", mainBasketId: "basket-a", mainBasketName: "Joinery", occurrences: [{ sourceLineItemKey: "joinery-living", sectionId: "living", roomId: "living", roomName: "Living room" }], scopeDigest: "b".repeat(64), canSuggest: true, unavailableReason: null };
    const requests: URL[] = [];
    server.use(
      http.get("/api/v1/projects/project-a/pm/estimate", () => HttpResponse.json({ data: { project: { id: "project-a", name: project.name }, availability: "available", reason: null, source, approvedAt: "2026-10-20T10:00:00.000Z", lines: [], mainLines: [mainLine], totals: { subtotalPaise: null, gstPaise: null, totalPaise: null }, writeAvailability: { available: true, reason: null } } })),
      http.get("/api/v1/projects/project-a/pm/vendor-suggestions", () => HttpResponse.json({ data: { source, items: [], total: 0, offset: 0, limit: 20, writeAvailability: { available: true, reason: null } } })),
      http.get("/api/v1/projects/project-a/pm/vendor-suggestion-candidates", ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: { source, mainLine, total: 1, offset: 0, limit: 20, items: [{ id: "linked-joinery", code: "JOIN-1", name: "Linked joinery vendor", classification: [], canSuggest: true, bidEligible: false, reasons: ["Procurement must confirm the bid contact."] }] } });
      })
    );
    renderWorkspace("/projects/project-a/execution?tab=procurement");
    const panel = await screen.findByRole("region", { name: "Vendor suggestions" });
    const trigger = await within(panel).findByRole("button", { name: "Suggest vendor" });
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(within(panel).getByText("No suggested vendors yet.")).toBeVisible();
    expect(within(panel).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Procurement handoff|0 suggestions/)).not.toBeInTheDocument();
    expect(within(panel).getAllByRole("button")).toHaveLength(1);
    expect(requests).toHaveLength(0);
    trigger.focus(); await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Suggest a vendor" });
    expect(within(dialog).getByRole("combobox", { name: "Main Line" })).toHaveValue("line-joinery");
    expect(within(dialog).queryByRole("combobox", { name: "Estimate source" })).not.toBeInTheDocument();
    const candidate = await within(dialog).findByRole("radio", { name: /Linked joinery vendor/ });
    expect(within(dialog).getByRole("group", { name: "Vendors linked in Configuration" })).toBeVisible();
    candidate.focus(); await userEvent.keyboard(" ");
    expect(candidate).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeEnabled();
    expect(requests.at(-1)!.searchParams.get("mainLineId")).toBe("line-joinery");
    expect(JSON.parse(requests.at(-1)!.searchParams.get("expectedSource")!)).toEqual(source);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

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
    expect(screen.getByRole("heading", { name: "Project Dashboard" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Priority alert items" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: "Project results" })).toHaveAttribute("tabindex", "0");
    expect(within(screen.getByRole("region", { name: "Project results" })).queryByRole("group", { name: "Project view" })).not.toBeInTheDocument();
    expect(screen.queryByText("Details need review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new project/i })).not.toBeInTheDocument();
  });

  it.each([
    ["", "List view"], ["?view=list", "List view"],
    ["?view=unrecognized", "List view"], ["?view=grid", "Grid view"]
  ])("selects the correct presentation for %s", async (query, selected) => {
    renderWorkspace(`/execution${query}`);
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    expect(screen.getByRole("button", { name: selected })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    if (selected === "Grid view") expect(screen.queryByRole("table")).not.toBeInTheDocument();
    else expect(screen.getByRole("table", { name: "Projects" })).toBeVisible();
  });

  it("switches views without a new data request and preserves filtered page state through a project visit", async () => {
    const requests: URL[] = [];
    server.use(http.get("/api/v1/project-manager/projects", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ data: { ...portfolio, total: 41 } });
    }));
    const user = userEvent.setup();
    renderWorkspace("/execution?q=Cedar&status=all&health=at_risk&offset=20");
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    const initialReads = requests.length;
    screen.getByRole("region", { name: "Project results" }).scrollTop = 120;
    screen.getByRole("button", { name: "Grid view" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Project results" }).scrollTop).toBe(0);
    expect(requests).toHaveLength(initialReads);
    expect(requests[0]?.searchParams.get("q")).toBe("Cedar");
    expect(requests[0]?.searchParams.get("offset")).toBe("20");
    expect(requests[0]?.searchParams.has("view")).toBe(false);
    const href = new URL(screen.getByRole("link", { name: "Open project Cedar residence" }).getAttribute("href")!, "https://lisno.invalid");
    const returnPath = href.searchParams.get("returnTo")!;
    const returnParams = new URL(returnPath, "https://lisno.invalid").searchParams;
    expect(Object.fromEntries(returnParams)).toEqual({ q: "Cedar", status: "all", health: "at_risk", offset: "20", view: "grid" });
    await user.click(screen.getByRole("link", { name: "Open project Cedar residence" }));
    const back = await screen.findByRole("link", { name: "All projects" });
    expect(back).toHaveAttribute("href", returnPath);
    await user.click(back);
    expect(await screen.findByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeVisible();
    expect(within(screen.getByRole("table")).getByRole("cell", { name: "21" })).toBeVisible();
    expect(requests.every(request => !request.searchParams.has("view"))).toBe(true);
  });

  it("retains keyboard focus on the view control inside the application's route focus behavior", async () => {
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/execution"]}><RouteFocusManager /><main id="main-content"><ProjectManagerDashboard /></main></MemoryRouter>);
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    const grid = screen.getByRole("button", { name: "Grid view" });
    grid.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(grid).toHaveAttribute("aria-pressed", "true"));
    expect(grid).toHaveFocus();
  });

  it.each(["list", "grid"])("retains unequal source values, exact health and unavailable data in %s view", async view => {
    const second: PMProject = { ...project, id: "project-b", name: "Courtyard annex", clientName: "Client B", location: "West district", health: "critical", approvedNetPaise: 9400000, progress: { ...progress, actual: 0 }, plannedEndAt: null };
    const third: PMProject = { ...project, id: "project-c", name: "Workshop conversion", health: "incomplete", approvedNetPaise: null, progress: { ...progress, actual: null, availability: "source_unavailable" }, issues: ["Approved scope is unavailable."] };
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, items: [project, second, third], total: 41 } })));
    renderWorkspace(`/execution?view=${view}&offset=20`);
    await screen.findByRole("link", { name: "Open project Courtyard annex" });
    expect(screen.getByText("Approved net value: ₹1,25,000")).toBeVisible();
    expect(screen.getByText("Approved net value: ₹94,000")).toBeVisible();
    expect(screen.getByText("Approved net value: Unavailable")).toBeVisible();
    expect(screen.getByText("Critical", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.getByText("Incomplete", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.getByText("Not scheduled")).toBeVisible();
    expect(screen.getByText("Details need review")).toBeVisible();
    expect(screen.queryByText("Approved scope is unavailable.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("progressbar").map(bar => bar.getAttribute("aria-valuenow"))).toEqual(["37.5", "0"]);
    const summary = screen.getByRole("region", { name: "Project summary" });
    expect(within(summary).getByRole("button", { name: /Active projects 7/ })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /^Open project / })).toHaveLength(3);
  });

  it.each(["list", "grid"])("keeps long diagnostics out of %s projects and exposes them on demand after opening", async view => {
    const issues = [
      "Execution scope is not established for item estimate-line-05eeddde-a748-4be8-a679-91533aafe79c.",
      "Current Main Line requirements are unavailable. Reconcile Configuration before continuing.",
      "Assign an active Project Manager and Designer before recording supply sign-offs."
    ];
    const needsReview = { ...project, issues };
    server.use(
      http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, items: [needsReview] } })),
      http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ data: { project: needsReview, capabilities: ["execution_detail"], calculatedAt: portfolio.calculatedAt } }))
    );
    const user = userEvent.setup();
    renderWorkspace(`/execution?view=${view}`);
    expect(await screen.findByText("Details need review")).toBeVisible();
    for (const issue of issues) expect(screen.queryByText(issue)).not.toBeInTheDocument();
    expect(screen.queryByText(/estimate-line-/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Open details for Cedar residence" }));
    const summary = await screen.findByText("Project details to review (3)");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    for (const issue of issues) expect(screen.getByText(issue)).not.toBeVisible();
    await user.click(summary);
    for (const issue of issues) expect(screen.getByText(issue)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open full detail" }));
    expect(screen.getByText("Full execution detail for project-a")).toBeVisible();
    for (const issue of issues) expect(screen.getByText(issue)).toBeVisible();
  });

  it("retains the current status scope when a summary metric changes the health filter", async () => {
    const requests: URL[] = [];
    server.use(http.get("/api/v1/project-manager/projects", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ data: portfolio });
    }));
    const user = userEvent.setup();
    renderWorkspace("/execution?q=Cedar&status=on_hold&health=critical&offset=20&view=grid");
    await user.click(await screen.findByRole("button", { name: /Active projects 7/ }));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get("health")).toBe("all"));
    expect(requests.at(-1)?.searchParams.get("status")).toBe("on_hold");
    expect(requests.at(-1)?.searchParams.get("q")).toBe("Cedar");
    expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["live", "Live updates"], ["connecting", "Connecting"],
    ["polling", "Periodic refresh"], ["offline", "Offline · details may be stale"],
    ["denied", "Live access unavailable"]
  ])("shows the actual %s connection state", async (state, label) => {
    connection.state = state;
    renderWorkspace();
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    expect(screen.getByText(label)).toHaveAttribute("role", "status");
    if (state !== "live") expect(screen.queryByText("Live updates")).not.toBeInTheDocument();
  });

  it.each(["list", "grid"])("removes cached records after assignment denial in %s view", async view => {
    server.use(
      http.get("/api/v1/kpis/users/pm-a", () => HttpResponse.json({ data: { score: 82, components: [] } })),
      http.get("/api/v1/project-manager/performance", () => HttpResponse.json({ data: { availability: "not_configured", policy: null, message: "Policy not configured.", calculatedAt: portfolio.calculatedAt, metrics: [] } }))
    );
    const user = userEvent.setup();
    renderWorkspace(`/execution?view=${view}`);
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    await user.click(screen.getByRole("button", { name: "My KPI" }));
    expect(await screen.findByRole("heading", { name: "KPI overview" })).toBeVisible();
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Assignment removed." } }, { status: 403 })));
    await user.click(screen.getByRole("button", { name: "Refresh projects" }));
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open project Cedar residence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Finish decision overdue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "My performance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My KPI" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps source-backed records with a stale warning after a failed refresh and supports retry", async () => {
    const user = userEvent.setup();
    renderWorkspace("/execution?view=grid");
    await screen.findByRole("link", { name: "Open project Cedar residence" });
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporarily unavailable." } }, { status: 503 })));
    await user.click(screen.getByRole("button", { name: "Refresh projects" }));
    expect(await screen.findByText(/Refresh failed\. These details may be out of date\./, {}, { timeout: 4000 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: portfolio })));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/Refresh failed/)).not.toBeInTheDocument());
  });

  it("reports an initial failure and loads records after retry", async () => {
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Project service unavailable." } }, { status: 503 })));
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Unable to load this view" }, { timeout: 4000 })).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: portfolio })));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
  });

  it("announces loading without displaying fabricated project values", async () => {
    server.use(http.get("/api/v1/project-manager/projects", async () => { await delay(150); return HttpResponse.json({ data: portfolio }); }));
    renderWorkspace();
    expect(screen.getByRole("status", { name: /loading/i })).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project summary" })).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
  });

  it.each([["", "No assigned projects"], ["?q=missing", "No matching projects"]])("distinguishes the empty state for %s", async (query, heading) => {
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, items: [], total: 0, alerts: [], alertTotal: 0, counts: { active: 0, atRisk: 0, critical: 0, setup: 0, onTrack: 0, incomplete: 0 } } })));
    renderWorkspace(`/execution${query}`);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByText("No current priority alerts in this view.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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

  it("preserves the stable alert target, target page and filtered grid return URL", async () => {
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, alerts: [{ ...portfolio.alerts[0]!, projectId: "project/encoded", entityId: "selection:room/finish", offset: 40 }] } })));
    renderWorkspace("/execution?q=Cedar&status=all&view=grid&offset=20");
    const link = await screen.findByRole("link", { name: /Finish decision overdue/ });
    const target = new URL(link.getAttribute("href")!, "https://lisno.invalid");
    expect(target.pathname).toBe("/projects/project%2Fencoded/execution");
    expect(target.searchParams.get("entity")).toBe("selection:room/finish");
    expect(target.searchParams.get("tab")).toBe("selections");
    expect(target.searchParams.get("tabOffset")).toBe("40");
    expect(target.searchParams.get("returnTo")).toBe("/execution?q=Cedar&status=all&view=grid&offset=20");
  });

  it("shows unknown progress and money without fabricating a zero or healthy status", async () => {
    server.use(http.get("/api/v1/project-manager/projects", () => HttpResponse.json({ data: { ...portfolio, items: [{ ...project, health: "incomplete", approvedNetPaise: null, progress: { ...progress, actual: null, planned: null, availability: "source_unavailable" }, issues: ["Approved scope is unavailable."] }] } })));
    renderWorkspace();
    expect(await screen.findByRole("link", { name: "Open project Cedar residence" })).toBeVisible();
    expect(screen.getByText("Incomplete", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.getByText("Approved net value: Unavailable")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Details need review")).toBeVisible();
    expect(screen.queryByText("Approved scope is unavailable.")).not.toBeInTheDocument();
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
    const scrollArea = screen.getByRole("region", { name: "Priority alert items" });
    expect(within(scrollArea).queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    scrollArea.scrollTop = 120;
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(alertReads.at(-1)?.searchParams.get("offset")).toBe("20"));
    expect(screen.getByRole("region", { name: "Priority alert items" }).scrollTop).toBe(0);
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
    await user.click(screen.getByRole("button", { name: "My KPI" }));
    expect(screen.getByRole("button", { name: "My KPI" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "My performance" })).not.toBeInTheDocument();
  });
});

describe("Project Manager opened project", () => {
  it("shows exact labelled metadata and unequal progress with distinct verification facts", async () => {
    const first = site.items[0]!;
    const work = first.children![0]!;
    installProject({ ...project, progress: { ...progress, siteVerified: 3, clientAccepted: 1 } }, { ...site, items: [{ ...first, progress: 25, children: [
      { ...work, progress: 0 },
      { ...work, id: "work-b", assignmentId: "assignment-b", title: "Stone flooring", ownerName: null, progress: null }
    ] }] });
    renderWorkspace("/projects/project-a/execution");
    expect(await screen.findByRole("heading", { name: "Cedar residence", level: 1 })).toBeVisible();
    await screen.findByRole("table", { name: "Living room trades" });
    expectFact("Approved net value", "₹1,25,000");
    expectFact("Target handover", "30 Nov 2026");
    expectFact("Planned progress", "60%");
    expectFact("Client accepted", "1");
    const siteRegion = screen.getByRole("region", { name: "Site execution" });
    expect(within(siteRegion).getAllByText("Site verified", { selector: "dt" })[0]?.nextElementSibling).toHaveTextContent("3");
    expect(screen.getByRole("progressbar", { name: "Overall reported progress" })).toHaveAttribute("aria-valuenow", "37.5");
    expect(screen.getByRole("progressbar", { name: "Living room reported progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("progressbar", { name: "Custom joinery reported" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByRole("progressbar", { name: "Stone flooring reported" })).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Living room trades" });
    const unknown = within(table).getByRole("row", { name: /Stone flooring/ });
    expect(within(unknown).getByText("Unavailable")).toBeVisible();
    expect(within(unknown).getByText("Unassigned")).toBeVisible();
    expect(within(table).getAllByRole("link")).toHaveLength(2);
    expect(within(table).getAllByRole("progressbar")).toHaveLength(1);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
    const basis = screen.getByText("How progress is measured");
    expect(basis.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(basis);
    expect(screen.getByText(/weighted by approved quantities and approved value before GST/)).toBeVisible();
    expect(screen.getByText(/Reporting 100% does not replace verification or client acceptance/)).toBeVisible();
  });

  it("keeps unknown project metadata and progress distinct from zero", async () => {
    installProject({ ...project, clientName: "", location: "", approvedNetPaise: null, plannedEndAt: null, health: "incomplete", progress: { ...progress, actual: null, planned: null } }, { ...site, items: [] });
    renderWorkspace("/projects/project-a/execution");
    await screen.findByRole("heading", { name: "Cedar residence" });
    expectFact("Approved net value", "Unavailable");
    expectFact("Target handover", "Not scheduled");
    expectFact("Planned progress", "Unavailable");
    expect(screen.getByText("Project details pending")).toBeVisible();
    expect(screen.getByText("Incomplete", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("keeps exact source notes collapsed until requested and preserves their open state through refresh", async () => {
    const overviewNote = "Project source requirements need review before the next scheduled execution stage.";
    const siteNote = "Current execution quantities need reconciliation with the approved estimate.";
    const roomNote = "Execution scope is not established for item estimate-line-05eeddde-a748-4be8-a679-91533aafe79c.";
    const tradeNote = "This execution record has a lengthy source explanation that must remain available in full without stretching the trade row before the manager chooses to review it.";
    const first = site.items[0]!, work = first.children![0]!;
    const sourceProject = { ...project, issues: [overviewNote] };
    const sourcePanel = { ...site, issues: [siteNote], items: [{ ...first, description: roomNote, children: [
      { ...work, description: tradeNote },
      { ...work, id: "work-b", assignmentId: "work-b", title: "Painting", description: "missing update · overdue" }
    ] }] };
    installProject(sourceProject, sourcePanel);
    renderWorkspace("/projects/project-a/execution", true);
    await screen.findByRole("link", { name: "Open Painting in Living room" });
    const summaries = ["Project details to review (1)", "Source note", "Room details to review", "Work details"];
    const messages = [overviewNote, siteNote, roomNote, tradeNote];
    for (let i = 0; i < summaries.length; i++) {
      const summary = screen.getByText(summaries[i]!);
      expect(summary.closest("details")).not.toHaveAttribute("open");
      expect(screen.getByText(messages[i]!)).not.toBeVisible();
      await userEvent.click(summary);
      expect(screen.getByText(messages[i]!)).toBeVisible();
    }
    expect(screen.getByText("missing update · overdue")).toBeVisible();
    installProject({ ...sourceProject, progress: { ...progress, actual: 42 } }, { ...sourcePanel, items: [{ ...sourcePanel.items[0]!, progress: 45 }] });
    await userEvent.click(screen.getByRole("button", { name: "Refresh project data" }));
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Overall reported progress" })).toHaveAttribute("aria-valuenow", "42"));
    expect(screen.getByRole("progressbar", { name: "Living room reported progress" })).toHaveAttribute("aria-valuenow", "45");
    for (const message of messages) expect(screen.getByText(message)).toBeVisible();
    for (const summary of summaries) expect(screen.getByText(summary).closest("details")).toHaveAttribute("open");
  });

  it("discloses an unbroken technical identifier even when its message is short", async () => {
    const description = "estimate-line-05eeddde-a748-4be8-a679-91533aafe79c";
    const first = site.items[0]!;
    installProject(project, { ...site, items: [{ ...first, children: [{ ...first.children![0]!, description }] }] });
    renderWorkspace("/projects/project-a/execution");
    await screen.findByRole("link", { name: "Open Custom joinery in Living room" });
    expect(screen.getByText(description)).not.toBeVisible();
    await userEvent.click(screen.getByText("Work details"));
    expect(screen.getByText(description)).toBeVisible();
  });

  it("preserves stable entity and assignment identities and all eight navigation links", async () => {
    const first = site.items[0]!, work = first.children![0]!;
    installProject(project, { ...site, items: [{ ...first, children: [{ ...work, id: "record:room/one", assignmentId: "assignment:trade/two" }] }] });
    const returnPath = "/execution?q=Cedar&status=all&health=critical&offset=20&view=grid";
    renderWorkspace(`/projects/project-a/execution?tab=site&entity=record%3Aroom%2Fone&locate=1&tabOffset=25&returnTo=${encodeURIComponent(returnPath)}`);
    const open = await screen.findByRole("link", { name: "Open Custom joinery in Living room" });
    expect(open.closest("tr")).toHaveAttribute("id", "pm-item-record:room/one");
    const workUrl = new URL(open.getAttribute("href")!, "https://lisno.invalid");
    expect(workUrl.searchParams.get("assignment")).toBe("assignment:trade/two");
    expect(workUrl.searchParams.get("detail")).toBe("1");
    expect(workUrl.searchParams.has("entity")).toBe(false);
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute("href", returnPath);
    const links = within(screen.getByRole("navigation", { name: "Project sections" })).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Site", "Procurement", "Selections", "Critical Supply", "Vendors", "Client", "Snagging", "Quality"]);
    for (const link of links) {
      const url = new URL(link.getAttribute("href")!, "https://lisno.invalid");
      expect(url.searchParams.get("returnTo")).toBe(returnPath);
      for (const transient of ["detail", "entity", "locate", "tabOffset", "assignment"]) expect(url.searchParams.has(transient)).toBe(false);
    }
    await userEvent.click(open);
    expect(await screen.findByText("Full execution detail for project-a")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Back to project tabs" }));
    for (const [label, heading] of [["Procurement", "procurement request panel"], ["Selections", "selections request panel"], ["Critical Supply", "supply request panel"], ["Vendors", "vendors operations panel"], ["Client", "client operations panel"], ["Snagging", "snagging operations panel"], ["Quality", "quality operations panel"], ["Site", "Site execution"]]) {
      await userEvent.click(screen.getByRole("link", { name: label }));
      expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  it("announces initial project loading before showing protected metadata or actions", async () => {
    server.use(http.get("/api/v1/projects/project-a/pm/overview", async () => { await delay(150); return HttpResponse.json({ data: { project, capabilities: [], calculatedAt: portfolio.calculatedAt } }); }));
    renderWorkspace("/projects/project-a/execution");
    expect(within(screen.getByRole("region", { name: "Project Manager project workspace" })).getByRole("status")).toHaveTextContent("Loading workspace");
    expect(screen.queryByRole("heading", { name: "Cedar residence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My KPI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cedar residence" })).toBeVisible();
  });

  it("shows an empty Site without inventing trade rows or removing the project summary", async () => {
    installProject(project, { ...site, items: [], total: 0 });
    renderWorkspace("/projects/project-a/execution");
    expect(await screen.findByRole("heading", { name: "No issued execution work" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cedar residence" })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Overall reported progress" })).toHaveAttribute("aria-valuenow", "37.5");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Open / })).not.toBeInTheDocument();
  });

  it("offers retry for an initial project failure without showing fabricated content", async () => {
    server.use(http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Project data temporarily unavailable." } }, { status: 503 })));
    renderWorkspace("/projects/project-a/execution");
    expect(await screen.findByRole("heading", { name: "Unable to load this view" }, { timeout: 4000 })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Cedar residence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    installProject();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Open Custom joinery in Living room" })).toBeVisible();
  });

  it("retains actual project and Site data with refresh warnings and recovers on retry", async () => {
    renderWorkspace("/projects/project-a/execution", true);
    await screen.findByRole("link", { name: "Open Custom joinery in Living room" });
    for (const endpoint of ["overview", "site"]) server.use(http.get(`/api/v1/projects/project-a/pm/${endpoint}`, () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporary outage." } }, { status: 503 })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh project data" }));
    await waitFor(() => expect(screen.getAllByText(/Refresh failed. These details may be out of date/)).toHaveLength(2), { timeout: 4000 });
    expect(screen.getByRole("heading", { name: "Cedar residence" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Custom joinery in Living room" })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Overall reported progress" })).toHaveAttribute("aria-valuenow", "37.5");
    installProject();
    for (const retry of screen.getAllByRole("button", { name: "Retry" })) await userEvent.click(retry);
    await waitFor(() => expect(screen.queryByText(/Refresh failed/)).not.toBeInTheDocument());
  });

  it.each([401, 403, 404])("removes cached project, KPI and full-detail content after a %s response", async status => {
    server.use(
      http.get("/api/v1/kpis/users/pm-a", () => HttpResponse.json({ data: { score: 82, components: [] } })),
      http.get("/api/v1/project-manager/performance", () => HttpResponse.json({ data: { availability: "not_configured", policy: null, message: "Policy not configured.", calculatedAt: portfolio.calculatedAt, metrics: [] } }))
    );
    renderWorkspace("/projects/project-a/execution", true);
    await screen.findByRole("heading", { name: "Cedar residence" });
    await userEvent.click(screen.getByRole("button", { name: "My KPI" }));
    expect(await screen.findByRole("heading", { name: "KPI overview" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Open full detail" }));
    expect(await screen.findByText("Full execution detail for project-a")).toBeVisible();
    server.use(http.get("/api/v1/projects/project-a/pm/overview", () => HttpResponse.json({ error: { code: "PM_NOT_FOUND", message: "Assignment changed." } }, { status })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh project data" }));
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Cedar residence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "My performance" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full execution detail for project-a")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My KPI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to project tabs" })).not.toBeInTheDocument();
  });

  it("removes denied Site records while retaining separately authorized overview information", async () => {
    renderWorkspace("/projects/project-a/execution", true);
    await screen.findByRole("link", { name: "Open Custom joinery in Living room" });
    server.use(http.get("/api/v1/projects/project-a/pm/site", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Site access changed." } }, { status: 403 })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh project data" }));
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open Custom joinery in Living room" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cedar residence" })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Overall reported progress" })).toHaveAttribute("aria-valuenow", "37.5");
  });
});

it.each(["https://example.com/execution", "//example.com/execution", "/execution/../admin", "/execution\\admin", "/projects/a/execution", "/execution%2fadmin"])("rejects an unsafe return path %s", path => expect(projectManagerReturnPath(path)).toBe("/execution"));
