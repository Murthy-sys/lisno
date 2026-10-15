import { useQuery } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProcurementDashboard } from "./ProcurementDashboard";
import { useProcurementAssignedProjects } from "./useProcurementAssignedProjects";

const mockPush = jest.fn();
const mockRefetch = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./ProcurementSubnavigation", () => ({ ProcurementSubnavigation: () => null }));
jest.mock("./useProcurementAssignedProjects", () => ({ useProcurementAssignedProjects: jest.fn() }));

const session: AuthenticatedSession = {
  user: { id: "procurement-user", name: "Procurement", email: "p@example.test", role: "procurement" },
  authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["procurement.workspace.read", "projects.list", "projects.read"] }
};

function project(projectId: string, projectName: string, estimate: number, spend: number) {
  return {
    projectId, projectName, taskStatus: projectId === "p-first" ? "open" : "in_progress", estimateId: `estimate-${projectId}`, estimateVersion: 4,
    sections: [{ id: `section-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
      items: [{ key: `line-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
        expenses: spend ? [{ id: `expense-${projectId}`, projectId, sourceSectionId: `section-${projectId}`,
          sourceLineItemKey: `line-${projectId}`, type: "direct_spend", expenseClass: "procurement",
          status: "posted", amountPaise: spend }] : [] }] }]
  };
}

const projects = [
  project("p-first", "First Project", 20_000_000, 5_000_000),
  project("p-second", "Second Project", 12_500_000, 1_500_000)
];

function query(overrides: Record<string, unknown> = {}) {
  return { data: projects, error: null, isPending: false, isError: false, isRefetching: false,
    isRefetchError: false, refetch: mockRefetch, ...overrides } as never;
}

describe("Procurement Dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useConfiguredRuntime).mockReturnValue({
      environment: { environment: { id: "qa" }, status: "ready" },
      runtime: { api: { authenticated: { get: jest.fn() } } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    jest.mocked(useQuery).mockReturnValue(query());
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery());
  });

  it("renders real INR totals for two unequal projects and opens the stable project route", async () => {
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByRole("header", { name: "Procurement" })).toBeTruthy();
    const first = within(view.getByTestId("procurement-project-p-first"));
    const second = within(view.getByTestId("procurement-project-p-second"));
    expect(first.getByText("First Project")).toBeTruthy();
    expect(first.getByText("₹2,00,000.00")).toBeTruthy();
    expect(first.getByText("₹50,000.00")).toBeTruthy();
    expect(first.getByText("₹1,50,000.00")).toBeTruthy();
    expect(second.getByText("Second Project")).toBeTruthy();
    expect(second.getByText("₹1,25,000.00")).toBeTruthy();
    expect(second.getByText("₹15,000.00")).toBeTruthy();
    expect(second.getByText("₹1,10,000.00")).toBeTruthy();
    await fireEvent.press(view.getByTestId("procurement-project-p-second"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "procurement", recordId: "p-second" } });
  });

  it("hides cached projects on permission loss or 403", async () => {
    const deniedSession = { ...session, authorization: { ...session.authorization, permissions: [] } };
    const view = await render(<ProcurementDashboard session={deniedSession} />);
    expect(view.getByText("Procurement unavailable")).toBeTruthy();
    expect(view.queryByText("First Project")).toBeNull();
    jest.mocked(useQuery).mockReturnValue(query({ isError: true, error: new ApiError(403, "FORBIDDEN", "Denied") }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.queryByText("First Project")).toBeNull();
  });

  it("shows loading, retry, and an integrity error without displaying false totals", async () => {
    jest.mocked(useQuery).mockReturnValue(query({ data: undefined, isPending: true }));
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByText("Loading procurement projects")).toBeTruthy();
    jest.mocked(useQuery).mockReturnValue(query({ data: undefined, isError: true, error: new Error("offline") }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.getByText("Procurement projects could not be loaded")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    jest.mocked(useQuery).mockReturnValue(query({ data: [projects[0], projects[0]] }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.getByText("Procurement amounts need review")).toBeTruthy();
    expect(view.queryByText("First Project")).toBeNull();
  });

  it("searches and filters projects without changing the portfolio selected value", async () => {
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByTestId("procurement-selected-total")).toHaveTextContent("₹3,25,000.00");
    expect(view.queryByText("Design approved")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Search projects"), " second ");
    expect(view.queryByTestId("procurement-project-p-first")).toBeNull();
    expect(view.getByTestId("procurement-project-p-second")).toBeTruthy();
    await fireEvent.press(view.getByRole("radio", { name: "Show open projects" }));
    expect(view.getByText("No matching projects")).toBeTruthy();
    expect(view.getByTestId("procurement-selected-total")).toHaveTextContent("₹3,25,000.00");
    await fireEvent.press(view.getByRole("button", { name: "Reset filters" }));
    expect(view.getByTestId("procurement-project-p-first")).toBeTruthy();
    expect(view.getByRole("radio", { name: "Show all status projects", checked: true })).toBeTruthy();
  });

  it("merges assigned projects once by ID, discloses partial scope, and opens authorized project detail", async () => {
    const nextPage = jest.fn();
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery({
      data: { pages: [{ items: [
        { id: "p-first", name: "Same ID", status: "active", subtitle: null, dateLabel: null },
        { id: "p-third", name: "Third Project", status: "active", subtitle: "Villa", dateLabel: null }
      ], pagination: { total: 4, offset: 0, limit: 30, hasMore: true } }] }, hasNextPage: true, fetchNextPage: nextPage
    }));
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByTestId("procurement-project-count")).toHaveTextContent("3");
    expect(view.getByText("Loaded projects")).toBeTruthy();
    expect(view.getByText(/Assigned project coverage is partial \(2 of 4 loaded\)/)).toBeTruthy();
    expect(view.queryByText("Same ID")).toBeNull();
    await fireEvent.press(view.getByRole("radio", { name: "Show awaiting preparation projects" }));
    expect(view.queryByTestId("procurement-project-p-first")).toBeNull();
    expect(view.getByText("Awaiting procurement preparation")).toBeTruthy();
    await fireEvent.press(view.getByTestId("procurement-project-p-third"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: "p-third" } });
    await fireEvent.press(view.getByRole("button", { name: "Load more assigned projects" }));
    expect(nextPage).toHaveBeenCalledTimes(1);
  });

  it("keeps independently authorized data available and never calls a failed preparation read awaiting approval", async () => {
    const assignedData = { pages: [{ items: [{ id: "assigned-only", name: "Assigned Only", status: "planning", subtitle: null, dateLabel: null }],
      pagination: { total: 1, offset: 0, limit: 30, hasMore: false } }] };
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery({ data: assignedData }));
    jest.mocked(useQuery).mockReturnValue(query({ data: undefined, isError: true, error: new Error("offline") }));
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByText("Assigned Only")).toBeTruthy();
    expect(view.getByText("Preparation status unavailable")).toBeTruthy();
    expect(view.getByTestId("procurement-selected-total")).toHaveTextContent("Unavailable");
    jest.mocked(useQuery).mockReturnValue(query());
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery({ data: assignedData, isError: true, error: new ApiError(403, "DENIED", "Denied") }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.queryByText("Assigned Only")).toBeNull();
    expect(view.getByText("First Project")).toBeTruthy();
    expect(view.getByText("Assigned projects unavailable")).toBeTruthy();
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery({ data: assignedData }, false));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.queryByText("Assigned Only")).toBeNull();
  });

  it("uses source labels, retains image fallback, and disables ungranted assigned detail navigation", async () => {
    jest.mocked(useQuery).mockReturnValue(query({ data: [{ ...projects[0], preparationSource: {
      workflowVersion: 2, kind: "approved_pre", phase: "pre", estimateId: "estimate-p-first", estimateVersion: 4,
      estimateReviewRoundId: "round-one", sourceSnapshotId: "snapshot-one", sourceDigest: "digest-one"
    } }] }));
    jest.mocked(useProcurementAssignedProjects).mockReturnValue(assignedQuery({ data: { pages: [{
      items: [{ id: "assigned-only", name: "Assigned Only", status: "planning", subtitle: null, dateLabel: null }],
      pagination: { total: 1, offset: 0, limit: 30, hasMore: false }
    }] } }));
    const viewer: AuthenticatedSession = { ...session, authorization: { ...session.authorization, permissions: ["procurement.workspace.read", "projects.list"] } };
    const view = await render(<ProcurementDashboard session={viewer} />);
    expect(view.getByText("Pre-estimate approved")).toBeTruthy();
    await fireEvent(view.getByTestId("procurement-cover-p-first"), "error");
    expect(view.getByTestId("procurement-cover-fallback-p-first")).toBeTruthy();
    expect(view.getAllByText("REPRESENTATIVE INTERIOR")).toHaveLength(2);
    await fireEvent.press(view.getByTestId("procurement-project-assigned-only"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByText("Project details unavailable")).toBeTruthy();
  });

});


function assignedQuery(overrides: Record<string, unknown> = {}, canRead = true) {
  return { canRead, query: { data: { pages: [{ items: [], pagination: { total: 0, offset: 0, limit: 30, hasMore: false } }] },
    error: null, isPending: false, isError: false, isRefetching: false, isFetchingNextPage: false, hasNextPage: false,
    fetchNextPage: jest.fn(), refetch: mockRefetch, ...overrides } } as unknown as ReturnType<typeof useProcurementAssignedProjects>;
}
