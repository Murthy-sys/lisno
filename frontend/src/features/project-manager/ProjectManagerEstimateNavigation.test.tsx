import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { tokenStorage } from "../../api/client";
import type { PermissionCode } from "../../api/authorization-contract";
import { AuthProvider } from "../../auth/AuthProvider";
import { PermissionRoute } from "../../auth/PermissionRoute";
import { ProtectedRoute } from "../../auth/ProtectedRoute";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectManagerEstimationsPage } from "./ProjectManagerEstimationsPage";
import { ProjectManagerProjectPage } from "./ProjectManagerWorkspace";
import type { PMEstimateView } from "./pmEstimateTypes";
import type { PMOverview, PMPanel } from "./projectManagerTypes";

const projectId = "project-navigation-a";
const projectPath = `/projects/${projectId}/execution`;
const estimatePath = `/projects/${projectId}/estimations`;
const user = { id: "manager-navigation-a", name: "Manager A", email: "manager-a@example.test", role: "site_manager" as const };
const baselinePermissions: PermissionCode[] = ["identity.self.read", "identity.authorization.read", "pm.workspace.read"];
const estimatePermissions: PermissionCode[] = [...baselinePermissions, "pm.estimates.read", "pm.vendor_suggestions.read"];
const overview: PMOverview = {
  project: { id: projectId, name: "Cedar navigation project", clientName: "Client A", location: "North district", status: "active", health: "setup", plannedEndAt: null, approvedNetPaise: 275050, issues: [], activeAlerts: 0,
    progress: { basis: "approved_execution_scope_v1", actual: null, planned: null, availability: "no_data", sourceRevision: null, issues: [], requiredLines: 0, coveredLines: 0, zeroValueLines: 0, reportedComplete: 0, siteVerified: 0, clientAccepted: 0 } },
  capabilities: [], calculatedAt: "2026-10-29T10:00:00.000Z"
};
const site: PMPanel = { tab: "site", availability: "no_data", calculatedAt: overview.calculatedAt, items: [], total: 0, issues: [], sources: [], people: [], actions: [] };
const estimate: PMEstimateView = {
  project: { id: projectId, name: overview.project.name }, availability: "available", reason: null,
  source: { estimateId: "approved-navigation-estimate", estimateVersion: 2, estimateReviewRoundId: "approved-navigation-round", phase: "post", designPlanVersion: 0, sourceSnapshotId: "approved-navigation-round", sourceDigest: "a".repeat(64) },
  approvedAt: "2026-10-28T10:00:00.000Z", lines: [], mainLines: [], totals: { subtotalPaise: 275050, gstPaise: 49509, totalPaise: 324559 },
  writeAvailability: { available: false, reason: "No Main Line scope is available." }
};

let meReads: number;
let authorizationReads: number;
let estimateReads: number;
let suggestionReads: number;
let initialPermissions: PermissionCode[];
let refreshedPermissions: PermissionCode[];
let refreshFails: boolean;
let waitForRefresh: Promise<void> | undefined;

beforeEach(() => {
  meReads = 0; authorizationReads = 0; estimateReads = 0; suggestionReads = 0;
  initialPermissions = baselinePermissions; refreshedPermissions = estimatePermissions;
  refreshFails = false; waitForRefresh = undefined;
  tokenStorage.set("synthetic-pm-navigation-session");
  server.use(
    http.get("/api/v1/auth/me", () => { meReads += 1; return HttpResponse.json({ data: user }); }),
    http.get("/api/v1/auth/authorization", async () => {
      authorizationReads += 1;
      const restoring = authorizationReads > 1;
      if (restoring) await waitForRefresh;
      if (restoring && refreshFails) return HttpResponse.json({ error: { code: "POLICY_UNAVAILABLE", message: "Permission service unavailable." } }, { status: 503 });
      return HttpResponse.json({ data: { ...authorizationFor("site_manager", restoring ? refreshedPermissions : initialPermissions), policyVersion: "server-policy-navigation-test" } });
    }),
    http.get(`/api/v1/projects/${projectId}/pm/overview`, () => HttpResponse.json({ data: overview })),
    http.get(`/api/v1/projects/${projectId}/pm/site`, () => HttpResponse.json({ data: site })),
    http.get(`/api/v1/projects/${projectId}/pm/estimate`, () => { estimateReads += 1; return HttpResponse.json({ data: estimate }); }),
    http.get(`/api/v1/projects/${projectId}/pm/vendor-suggestions`, () => {
      suggestionReads += 1;
      return HttpResponse.json({ data: { source: estimate.source, items: [], total: 0, limit: 20, offset: 0, writeAvailability: estimate.writeAvailability } });
    })
  );
});

function Location() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}</output>; }
async function openProject() {
  renderWithQuery(<MemoryRouter initialEntries={[`${projectPath}?tab=site&returnTo=%2Fexecution%3Fview%3Dgrid`]}><AuthProvider><Routes>
    <Route path="/projects/:projectId/execution" element={<ProtectedRoute><PermissionRoute permission="pm.workspace.read" presentationRoles={["site_manager"]}><ProjectManagerProjectPage /></PermissionRoute></ProtectedRoute>} />
    <Route path="/projects/:projectId/estimations" element={<ProtectedRoute><PermissionRoute permission="pm.estimates.read" presentationRoles={["site_manager"]}><ProjectManagerEstimationsPage /></PermissionRoute></ProtectedRoute>} />
    <Route path="/login" element={<h1>Login</h1>} />
  </Routes><Location /></AuthProvider></MemoryRouter>);
  const link = await screen.findByRole("link", { name: "View estimations" });
  expect(meReads).toBe(1); expect(authorizationReads).toBe(1);
  return link;
}

describe("Project Manager estimate navigation permissions", () => {
  it("refreshes an older permission snapshot once on keyboard navigation and opens the approved estimate", async () => {
    let finishRefresh!: () => void;
    waitForRefresh = new Promise<void>(resolve => { finishRefresh = resolve; });
    const link = await openProject();
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Restoring your session…")).toBeVisible();
    expect(screen.getByLabelText("Current route")).toHaveTextContent(estimatePath);
    expect(screen.queryByRole("heading", { name: overview.project.name })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Access denied" })).not.toBeInTheDocument();
    expect(estimateReads).toBe(0); expect(suggestionReads).toBe(0);
    await act(async () => { finishRefresh(); });
    expect(await screen.findByRole("region", { name: "Approved commercial summary" })).toHaveTextContent("₹3,245.59");
    expect(screen.getByText("Read only")).toBeVisible();
    expect(meReads).toBe(2); expect(authorizationReads).toBe(2); expect(estimateReads).toBe(1);
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", `${projectPath}?tab=site&returnTo=%2Fexecution%3Fview%3Dgrid`);
  });

  it("keeps a genuine server denial after one refresh without fetching protected estimate data", async () => {
    refreshedPermissions = baselinePermissions;
    await userEvent.click(await openProject());
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(screen.getByLabelText("Current route")).toHaveTextContent(estimatePath);
    await userEvent.tab();
    expect(meReads).toBe(2); expect(authorizationReads).toBe(2);
    expect(estimateReads).toBe(0); expect(suggestionReads).toBe(0);
    expect(screen.queryByText("Read only")).not.toBeInTheDocument();
  });

  it("hides project and estimate content when the permission refresh fails", async () => {
    refreshFails = true;
    await userEvent.click(await openProject());
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't restore your session.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: overview.project.name })).not.toBeInTheDocument();
    expect(screen.queryByText("Read only")).not.toBeInTheDocument();
    expect(meReads).toBe(2); expect(authorizationReads).toBe(2);
    expect(estimateReads).toBe(0); expect(suggestionReads).toBe(0);
  });

  it("navigates normally without refreshing an already authorized server snapshot", async () => {
    initialPermissions = estimatePermissions;
    await userEvent.click(await openProject());
    expect(await screen.findByRole("region", { name: "Approved commercial summary" })).toBeVisible();
    expect(meReads).toBe(1); expect(authorizationReads).toBe(1); expect(estimateReads).toBe(1);
    expect(screen.queryByRole("heading", { name: "Access denied" })).not.toBeInTheDocument();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("preserves modified link activation %j without refreshing the current session", async modifier => {
    const link = await openProject();
    // Cancel only the browser default after React handles the link; JSDOM cannot open another tab.
    document.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(link, modifier);
    await waitFor(() => expect(screen.getByLabelText("Current route")).toHaveTextContent(projectPath));
    expect(screen.getByRole("link", { name: "View estimations" })).toBeVisible();
    expect(meReads).toBe(1); expect(authorizationReads).toBe(1); expect(estimateReads).toBe(0);
  });
});
