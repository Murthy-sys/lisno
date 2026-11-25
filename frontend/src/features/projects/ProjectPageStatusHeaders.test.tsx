import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";

import { ApiError } from "../../api/client";
import type { AdminProjectSummary, ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { AdminProjectQuickView } from "../admin/AdminProjectQuickView";
import { FinanceProjectPage } from "../finance/FinanceProjectPage";
import { ProcurementProjectPage } from "../procurement/ProcurementProjectPage";
import * as statusApi from "../project-status/projectStatusApi";

const context = vi.hoisted(() => ({ role: "finance_head" as "finance_head" | "procurement" | "admin", denied: false }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "header-viewer", role: context.role }, status: "authenticated", authorization: authorizationFor(context.role) }) }));
vi.mock("../messages", async () => {
  const { ProjectStatusButton } = await import("../project-status/ProjectStatusButton");
  return { ProjectChatNavigation: ({ projectId, showStatus = true }: { projectId: string; showStatus?: boolean }) => <nav aria-label="Project sections">{showStatus ? <ProjectStatusButton projectId={projectId} /> : null}</nav> };
});
vi.mock("../project-manager/PMCounterpartPanel", () => ({ PMCounterpartPanel: () => null }));
vi.mock("../finance/ProjectFinancePanel", () => ({ ProjectFinancePanel: () => <p>Saved financial content</p> }));
vi.mock("../finance/FinanceProjectWorkflowControl", () => ({ FinanceProjectWorkflowControl: () => null }));
vi.mock("../finance/FinanceWorkOrderAssessments", () => ({ FinanceWorkOrderAssessments: () => null }));
vi.mock("../workflow/ProjectWorkflowPanel", () => ({ ProjectWorkflowPanel: () => null }));
vi.mock("./AssignedProjectOverview", () => ({ AssignedProjectOverview: () => null }));
vi.mock("../procurement/ProcurementBasketWorkspace", () => ({ ProcurementBasketWorkspace: () => null }));
vi.mock("../procurement/ProcurementEstimateSource", () => ({ ProcurementEstimateSource: () => null }));
vi.mock("../execution/VendorAccessPanel", () => ({ VendorAccessPanel: () => null }));
vi.mock("../procurement/procurementPresentation", () => ({
  procurementError: (_error: unknown, fallback: string) => fallback,
  useProcurementProjects: () => ({ projects: [], integrityError: null, query: { isSuccess: true, isPending: false, isError: false, isFetching: false, error: null } })
}));
vi.mock("./projectReadQueries", async () => {
  const { useParams } = await import("react-router-dom");
  return {
    projectReadDenied: () => context.denied,
    useAssignedProject: () => {
      const { projectId } = useParams();
      return { canRead: true, project: context.denied ? undefined : { id: projectId, name: projectId === "project-a" ? "Courtyard" : "Garden", projectNumber: projectId === "project-a" ? "QA-101" : "QA-202" }, query: { isError: context.denied, isPending: false, refetch: vi.fn() } };
    }
  };
});

function summary(projectId: string): ProjectStatusSummary {
  return { projectId, projectName: projectId === "project-a" ? "Courtyard" : "Garden", projectStatus: "active", state: "active", serverNow: "2026-11-24T10:00:00Z", issue: null,
    currentStage: { key: "approval", label: "Estimate approval" },
    pendingActions: [{ id: `approval-${projectId}`, stageKey: "approval", stageLabel: "Estimate approval", action: "Review quotation", state: "pending", responsibleRole: "client", people: [{ id: `owner-${projectId}`, name: projectId === "project-a" ? "Maya" : "Nila", role: "client" }], deadlineAt: null, scheduledAt: null, blocker: null }]
  };
}

function renderPage(element: ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path.replace(":projectId", "project-a")]}><FeedbackProvider>
    <Link to={path.replace(":projectId", "project-b")}>Open other project</Link>
    <Routes><Route path={path} element={element} /></Routes>
  </FeedbackProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  context.role = "finance_head"; context.denied = false;
  vi.spyOn(statusApi, "getProjectStatus").mockImplementation(async id => summary(id));
});

describe("Project page status headers", () => {
  it("keeps one Finance header chip and changes to the navigated project's owner", async () => {
    renderPage(<FinanceProjectPage />, "/finance/projects/:projectId");
    const first = await screen.findByRole("button", { name: "Project status" });
    expect(first.closest(".ui-page-header__actions")).not.toBeNull();
    expect(first).toHaveTextContent("Maya");
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
    expect(screen.getByText("Saved financial content")).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Open other project" }));
    const second = await screen.findByRole("button", { name: "Project status" });
    expect(second).toHaveTextContent("Nila");
    expect(screen.queryByText(/Maya/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
  });

  it("places the Procurement chip beside its project identity without duplicating navigation status", async () => {
    context.role = "procurement";
    renderPage(<ProcurementProjectPage />, "/procurement/projects/:projectId");
    const chip = await screen.findByRole("button", { name: "Project status for Courtyard" });
    expect(chip.closest(".ui-page-header__actions")).not.toBeNull();
    expect(chip).toHaveTextContent("Maya");
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
    expect(within(screen.getByRole("navigation", { name: "Project sections" })).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/procurement");
  });

  it("does not request a Procurement chip after project access is removed", () => {
    context.role = "procurement"; context.denied = true;
    renderPage(<ProcurementProjectPage />, "/procurement/projects/:projectId");
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
    expect(statusApi.getProjectStatus).not.toHaveBeenCalled();
  });

  it("places the selected Admin quick-view chip in the drawer header and omits it without a project", async () => {
    context.role = "admin";
    const project: AdminProjectSummary = { id: "project-a", name: "Courtyard", status: "active", location: "Bengaluru", propertyType: "Villa", budgetMin: 0, budgetMax: 0,
      client: { name: "Maya", email: "maya@example.test", mobile: "" }, estimator: null, lead: null, estimate: null, createdAt: "2026-11-01T00:00:00Z" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (value: AdminProjectSummary | undefined) => <QueryClientProvider client={client}><MemoryRouter><FeedbackProvider><AdminProjectQuickView project={value} canOpenWorkspace onClose={() => {}} /></FeedbackProvider></MemoryRouter></QueryClientProvider>;
    const mounted = render(view(project));
    const chip = await screen.findByRole("button", { name: "Project status for Courtyard" });
    expect(chip.closest(".ui-drawer__header")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open project workspace" })).toHaveAttribute("href", "/admin/projects/project-a");
    mounted.rerender(view(undefined));
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
  });

  it("does not expose Finance ownership when its independent status read is denied", async () => {
    vi.mocked(statusApi.getProjectStatus).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Not permitted"));
    renderPage(<FinanceProjectPage />, "/finance/projects/:projectId");
    await waitFor(() => expect(statusApi.getProjectStatus).toHaveBeenCalledWith("project-a", expect.any(AbortSignal)));
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Maya")).not.toBeInTheDocument();
  });
});
