import { fireEvent, render } from "@testing-library/react-native";
import * as Native from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { ProjectsWorkspace } from "./ProjectsWorkspace";
import { parseProjectPage } from "./projectsModel";
import { useProjects } from "./useProjects";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("./useProjects", () => ({ useProjects: jest.fn() }));
jest.mock("./ProjectCreateActions", () => ({ ProjectCreateAction: () => null }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ ScaffoldContentBack: () => null }));

const session: AuthenticatedSession = {
  user: { id: "projects-admin", name: "Admin", email: "admin@example.test", role: "super_admin" },
  authorization: { role: "super_admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["projects.list"] }
};
const queryMock = jest.mocked(useProjects);
const refetch = jest.fn();
const fetchNextPage = jest.fn();
const records = [
  { id: "p-villa", name: "Villa", propertyType: "Residential", status: "active", createdAt: "2026-09-22T10:00:00Z" },
  { id: "p-office", name: "Office", location: "Bengaluru", status: "planning", updatedAt: "2026-09-23T12:00:00Z" },
  { id: "p-hotel", name: "Hotel", status: "on_hold" },
  { id: "p-loft", name: "Loft", status: "completed" }
];
function page(items: readonly unknown[] = records, total = items.length, offset = 0, hasMore = false) {
  return parseProjectPage({ items, pagination: { limit: 30, offset, total, hasMore } });
}
function result(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [page()], pageParams: [0] }, isPending: false, isError: false, error: null,
    isRefetching: false, isRefetchError: false, isFetchingNextPage: false, isFetchNextPageError: false,
    hasNextPage: false, refetch, fetchNextPage, ...overrides
  } as unknown as ReturnType<typeof useProjects>;
}

describe("Projects reference workspace", () => {
  beforeEach(() => { jest.clearAllMocks(); queryMock.mockReturnValue(result()); });
  afterEach(() => jest.restoreAllMocks());

  it("renders account-scoped totals, genuine dates and stable detail navigation", async () => {
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(queryMock).toHaveBeenCalledWith(session);
    expect(view.getByRole("header", { name: "Projects" })).toBeTruthy();
    expect(view.getByLabelText("Total projects: 4")).toBeTruthy();
    expect(view.getByLabelText("Active: 1")).toBeTruthy();
    expect(view.getByLabelText("On hold: 1")).toBeTruthy();
    expect(view.getByLabelText("Completed: 1")).toBeTruthy();
    expect(view.getByText("Created 22 Sep 2026")).toBeTruthy();
    expect(view.getByText("Updated 23 Sep 2026")).toBeTruthy();
    expect(view.getAllByText("Phase not available")).toHaveLength(4);
    expect(view.getAllByText("No photo", { includeHiddenElements: true })).toHaveLength(4);
    expect(view.queryByText("Execution in progress")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: /^Open Villa\./ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: "p-villa" } });
  });

  it("filters each lifecycle locally without changing account totals", async () => {
    const view = await render(<ProjectsWorkspace session={session} />);
    await fireEvent.press(view.getByRole("button", { name: "Filter projects. All" }));
    await fireEvent.press(view.getByRole("radio", { name: "Show active projects" }));
    expect(view.getByRole("header", { name: "Active projects (1)" })).toBeTruthy();
    expect(view.getByText("Villa")).toBeTruthy();
    expect(view.queryByText("Office")).toBeNull();
    expect(view.getByLabelText("Total projects: 4")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Filter projects. Active" }));
    await fireEvent.press(view.getByRole("radio", { name: "Show planning projects" }));
    expect(view.getByText("Office")).toBeTruthy();
    expect(view.queryByText("Villa")).toBeNull();
  });

  it("qualifies partial status counts and keeps pagination reachable in an empty filter", async () => {
    queryMock.mockReturnValue(result({ data: { pages: [page([records[0]], 31, 0, true)] }, hasNextPage: true }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByLabelText("Total projects: 31")).toBeTruthy();
    expect(view.getByLabelText("Active in loaded projects: 1")).toBeTruthy();
    expect(view.getByText(/Status counts cover 1 loaded projects of 31/)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Filter projects. All" }));
    await fireEvent.press(view.getByRole("radio", { name: "Show completed projects" }));
    expect(view.getByText("No completed projects in loaded results")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Load more projects" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole("button", { name: "Show all projects" }));
    expect(view.getByText("Villa")).toBeTruthy();
  });

  it("includes a second loaded page and removes partial-count wording when complete", async () => {
    queryMock.mockReturnValue(result({ data: { pages: [page([records[0]], 2, 0, true), page([records[1]], 2, 30, false)] } }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Office")).toBeTruthy();
    expect(view.getByRole("header", { name: "Projects (2)" })).toBeTruthy();
    expect(view.queryByText(/Status counts cover/)).toBeNull();
    expect(view.queryByRole("button", { name: "Load more projects" })).toBeNull();
  });

  it("shows loading without false zero counters", async () => {
    queryMock.mockReturnValue(result({ data: undefined, isPending: true }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Loading projects")).toBeTruthy();
    expect(view.queryByLabelText("Total projects: 0")).toBeNull();
    expect(view.queryByText("No projects yet")).toBeNull();
  });

  it("uses the latest server total and discloses gaps after overlapping pages", async () => {
    queryMock.mockReturnValue(result({ data: { pages: [page(records.slice(0, 2), 3, 0, true), page(records.slice(1, 3), 4, 30, false)] } }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByLabelText("Total projects: 4")).toBeTruthy();
    expect(view.getByRole("header", { name: "Projects (3)" })).toBeTruthy();
    expect(view.getByText(/Status counts cover 3 loaded projects of 4/)).toBeTruthy();
    expect(view.getByText(/Pull to refresh the current project totals/)).toBeTruthy();
    expect(view.queryByRole("button", { name: "Load more projects" })).toBeNull();
  });

  it("shows genuine empty state after a successful zero result", async () => {
    queryMock.mockReturnValue(result({ data: { pages: [page([])] } }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByLabelText("Total projects: 0")).toBeTruthy();
    expect(view.getByText("No projects yet")).toBeTruthy();
  });

  it("offers retry after initial failure", async () => {
    queryMock.mockReturnValue(result({ data: undefined, isError: true, error: new Error("offline") }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Projects could not be loaded")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("hides cached project records after permission denial", async () => {
    queryMock.mockReturnValue(result({ isError: true, error: new ApiError(403, "FORBIDDEN", "Denied") }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Projects are unavailable")).toBeTruthy();
    expect(view.queryByText("Villa")).toBeNull();
    expect(view.queryByLabelText("Total projects: 4")).toBeNull();
  });

  it("retains known results with an explicit refetch failure", async () => {
    queryMock.mockReturnValue(result({ isError: true, isRefetchError: true, error: new Error("offline") }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Villa")).toBeTruthy();
    expect(view.getByText(/Showing the last loaded results/)).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry refresh" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded rows and retries only pagination after a load-more failure", async () => {
    queryMock.mockReturnValue(result({ data: { pages: [page([records[0]], 31, 0, true)] }, hasNextPage: true, isError: true, isFetchNextPageError: true, error: new Error("offline") }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText("Villa")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry loading projects" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("keeps long names and unknown statuses at narrow width with enlarged text", async () => {
    jest.spyOn(Native, "useWindowDimensions").mockReturnValue({ width: 320, height: 800, scale: 2, fontScale: 1.6 });
    const name = "Long residence project with multiple building wings";
    queryMock.mockReturnValue(result({ data: { pages: [page([{ id: "long", name, status: "unexpected" }])] } }));
    const view = await render(<ProjectsWorkspace session={session} />);
    expect(view.getByText(name)).toBeTruthy();
    expect(view.getByText("Status unavailable")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Filter projects. All" }));
    expect(view.getByRole("radio", { name: "Show status unavailable projects" })).toBeTruthy();
  });
});
