import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { ApiError } from "../../core/http/apiClient";
import { KnowledgeDetailProvider } from "../knowledge/knowledgeDetailUi";
import { useNativeWorkspace, type NativeContext } from "./nativeWorkspace";
import { UserEditor, UsersWorkspace } from "./UsersWorkspace";
import { AssignmentEditor, IdentityEditor } from "./ProjectAdministrationPanel";
import { AccessRequestsWorkspace } from "../access/AccessRequestsWorkspace";
import { DesignerDetail, DeadlineEditor } from "../management/ManagementWorkspace";
import { EvaluationView, type Evaluation } from "../management/EvaluationWorkspace";
import type { UserDirectoryItem } from "./adminIdentityModel";
import type { ProjectWorkflowSectionAssignment } from "./projectAdministrationTypes";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("./nativeWorkspace", () => ({ ...jest.requireActual("./nativeWorkspace"), useNativeWorkspace: jest.fn() }));
jest.mock("./AdminInvitationPanel", () => ({ AdminInvitationPanel: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const page = (items: unknown[], total = items.length) => ({ items, pagination: { total, limit: 20, offset: 0, hasMore: total > items.length } });
const user = { id: "user-a", name: "Designer A", email: "designer-a@example.test", role: "designer", active: true, version: 7, createdAt: "2026-01-01", updatedAt: "2026-10-01" } as UserDirectoryItem;
function setup(role = "super_admin") {
  const get = jest.fn(); const post = jest.fn(); const patch = jest.fn();
  const c = { http: { get, post, patch }, session: { user: { id: "actor-a", role } }, scope: "test:actor-a", ready: true, can: jest.fn(() => true), key: (...parts: unknown[]) => ["test", "actor-a", "users", ...parts], refresh: jest.fn(async () => undefined), guards: { current: new Map() }, navigate: (action: () => void) => action() } as unknown as NativeContext;
  jest.mocked(useNativeWorkspace).mockReturnValue(c); const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const show = async (node: ReactNode) => render(<QueryClientProvider client={client}><KnowledgeDetailProvider>{node}</KnowledgeDetailProvider></QueryClientProvider>);
  return { c, get, post, patch, show };
}

it("paginates the user directory by server total and searches without changing identities", async () => {
  const t = setup(); t.get.mockResolvedValue({ ...page([user], 41), filterRoles: ["designer"], manageableRoles: ["designer"], summary: { total: 41, active: 35, inactive: 6, roleCount: 1 } });
  await t.show(<UsersWorkspace session={t.c.session} />); await screen.findByText("41 users · 35 active · 6 inactive"); await fireEvent.press(screen.getByRole("button", { name: "Next page" })); await waitFor(() => expect(t.get).toHaveBeenCalledWith(expect.stringContaining("offset=20"), expect.anything()));
  await fireEvent.changeText(screen.getByLabelText("Search users"), "Designer A"); await fireEvent.press(screen.getByRole("button", { name: "Search directory" })); await waitFor(() => expect(t.get).toHaveBeenCalledWith(expect.stringContaining("search=Designer+A"), expect.anything()));
});

it("updates only the selected user's captured version and shows retained responsibilities", async () => {
  const t = setup(); t.patch.mockResolvedValue({ user: { ...user, role: "design_manager", version: 8 }, revokedGrantCount: 2, responsibilities: { assignedActiveProjects: 3 } });
  await t.show(<UserEditor context={t.c} user={user} roles={["designer", "design_manager"]} current onClose={jest.fn()} />);
  await fireEvent.press(screen.getByRole("combobox", { name: "User role" })); await fireEvent.press(screen.getByRole("radio", { name: "Design Manager" })); await fireEvent.press(screen.getByRole("button", { name: "Save user role" }));
  await screen.findByText("2 project access grants revoked."); expect(t.patch).toHaveBeenCalledWith("/admin/users/user-a", { version: 7, role: "design_manager" }); expect(screen.getByText("assigned active projects: 3")).toBeTruthy();
});

it("prevents editing the immutable Super Admin and a stale directory row", async () => {
  const t = setup(); await t.show(<UserEditor context={t.c} user={{ ...user, role: "super_admin" }} roles={["designer"]} current onClose={jest.fn()} />); expect(screen.getByRole("button", { name: "Deactivate user" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Save user role" })).toBeDisabled(); expect(t.patch).not.toHaveBeenCalled();
});

it("removes a user's private edit data when the update is denied", async () => {
  const t = setup(); t.patch.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access changed")); await t.show(<UserEditor context={t.c} user={user} roles={["designer"]} current onClose={jest.fn()} />);
  await fireEvent.press(screen.getByRole("button", { name: "Deactivate user" })); await fireEvent.press(screen.getByRole("button", { name: "Confirm deactivation" })); await screen.findByText("Your access changed."); expect(screen.queryByText(user.email)).toBeNull();
});

it("saves Program Manager identity with its captured project version", async () => {
  const t = setup(); t.get.mockResolvedValue({ items: [{ id: "pm-a", name: "Program Manager A", email: "pm-a@example.test" }], total: 1 }); t.patch.mockResolvedValue({ projectId: "project-a", version: 5, city: { name: "Hyderabad", key: "hyderabad" }, programManagerId: "pm-a" });
  await t.show(<IdentityEditor context={t.c} identity={{ projectId: "project-a", version: 4, city: null, programManagerId: null }} />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Program Manager" })).not.toBeDisabled()); await fireEvent.changeText(screen.getByLabelText("Project city"), "Hyderabad"); await fireEvent.press(screen.getByRole("combobox", { name: "Program Manager" })); await fireEvent.press(screen.getByRole("radio", { name: "Program Manager A · pm-a@example.test" })); await fireEvent.press(screen.getByRole("button", { name: "Save procurement details" })); await waitFor(() => expect(t.patch).toHaveBeenCalledWith("/admin/projects/project-a/procurement-identity", { expectedVersion: 4, cityName: "Hyderabad", programManagerId: "pm-a" }));
});

it("reconciles mixed section assignment using approved source and section revision", async () => {
  const t = setup(); const section = { id: "section-assignment-a", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 6, sourceSectionId: "source-section-a", projectName: "Project A", updatedAt: "2026-10-14T00:00:00Z", sectionLabel: "Carpentry", assigneeRole: "worker_carpenter", assignmentState: "mixed", assignedWorker: null, status: "open", progress: 20, taskCount: 3, unfinishedTaskCount: 2, revision: "revision-a" } as ProjectWorkflowSectionAssignment;
  t.post.mockResolvedValue({ ...section, revision: "revision-b", assignmentState: "assigned" });
  await t.show(<AssignmentEditor context={t.c} section={section} workers={[{ id: "worker-a", name: "Carpenter A", email: "worker-a@example.test", role: "worker_carpenter" }, { id: "worker-b", name: "Electrician B", email: "worker-b@example.test", role: "worker_electrician" }]} />);
  expect(screen.getByRole("button", { name: "Save Carpentry assignment" })).toBeDisabled(); await fireEvent.press(screen.getByRole("combobox", { name: "Assign Carpentry" })); expect(screen.queryByRole("radio", { name: /Electrician B/ })).toBeNull(); await fireEvent.press(screen.getByRole("radio", { name: "Carpenter A · worker-a@example.test" })); await fireEvent.press(screen.getByRole("button", { name: "Save Carpentry assignment" })); await waitFor(() => expect(t.post).toHaveBeenCalledWith("/execution/section-worker-assignments/override", { projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 6, sourceSectionId: "source-section-a", expectedRevision: "revision-a", workerId: "worker-a" }));
});

it("revokes only the selected active grant with a required reason and version", async () => {
  const t = setup(); t.get.mockResolvedValue(page([{ id: "request-a", projectId: "project-a", module: "procurement", reason: "Assigned coordination", status: "approved", version: 4, createdAt: "2026-10-01", requester: { id: "requester-a", name: "Requester A", email: "requester-a@example.test", role: "procurement" }, project: { id: "project-a", name: "Project A", resolved: true }, activeGrant: { id: "grant-a", version: 9, grantedAt: "2026-10-01" } }])); t.post.mockResolvedValue({ id: "grant-a", active: false });
  await t.show(<AccessRequestsWorkspace session={t.c.session} />); await screen.findByRole("button", { name: "Revoke access for Requester A" }); await fireEvent.press(screen.getByRole("button", { name: "Revoke access for Requester A" })); await fireEvent.press(screen.getByRole("button", { name: "Confirm access action" })); expect(t.post).not.toHaveBeenCalled(); await fireEvent.changeText(screen.getByLabelText("Access decision reason"), "Assignment concluded"); await fireEvent.press(screen.getByRole("button", { name: "Confirm access action" })); await waitFor(() => expect(t.post).toHaveBeenCalledWith("/project-access-grants/grant-a/revoke", { version: 9, reason: "Assignment concluded" }));
});

it("does not display another designer's KPI under the selected identity", async () => {
  const t = setup("design_manager"); t.get.mockImplementation(async (path: string) => path.includes("/audit") ? page([]) : { user: { id: "designer-b", name: "Designer B" }, tasks: [], kpi: { score: 91, components: [] } });
  await t.show(<DesignerDetail context={t.c} designerId="designer-a" onOpenProject={jest.fn()} />); await screen.findByText("The designer summary could not be matched to the selected person."); expect(screen.queryByText("Designer B")).toBeNull();
});

it("revises a task deadline with reason and preserves the original deadline", async () => {
  const t = setup("design_manager"); const task = { id: "task-a", projectId: "project-a", ownerId: "designer-a", title: "Joinery drawing", status: "open", progress: 25, version: 5, currentDeadlineAt: "2026-10-20T12:00:00.000Z", originalDeadlineAt: "2026-10-15T12:00:00.000Z", risk: { level: "red", reason: "Overdue" } }; t.patch.mockResolvedValue({ ...task, version: 6 });
  await t.show(<DeadlineEditor context={t.c} task={task} current onClose={jest.fn()} />); await fireEvent.changeText(screen.getByLabelText("New deadline (ISO date and time)"), "2026-10-21T12:00:00.000Z"); await fireEvent.changeText(screen.getByLabelText("Deadline revision reason"), "Client review extended"); await fireEvent.press(screen.getByRole("button", { name: "Save revised deadline" })); await waitFor(() => expect(t.patch).toHaveBeenCalledWith("/tasks/task-a/deadline", { version: 5, currentDeadlineAt: "2026-10-21T12:00:00.000Z", reason: "Client review extended" })); expect(t.patch.mock.calls[0]?.[1]).not.toHaveProperty("originalDeadlineAt");
});

it("reconciles a lost evaluation response from scoped history without reposting", async () => {
  const t = setup("design_manager"); let rows: Evaluation[] = []; t.get.mockImplementation(async () => page(rows)); t.post.mockImplementation(async (_path, input) => { rows = [{ id: "evaluation-a", ...input, evaluatorUserId: "actor-a", evaluatorRole: "design_manager", revisionOf: null, createdAt: "2026-10-14T00:00:00Z" }]; throw new ApiError(503, "UNAVAILABLE", "Response lost"); });
  await t.show(<EvaluationView context={t.c} subjectUserId="designer-a" />); await screen.findByText("0 results"); await fireEvent.press(screen.getByRole("button", { name: "Create evaluation" })); await fireEvent.changeText(screen.getByLabelText("Evaluation score (0–100)"), "84"); await fireEvent.changeText(screen.getByLabelText("Assessment comments"), "Delivery review complete"); await fireEvent.press(screen.getByRole("button", { name: "Save evaluation" })); await screen.findByText("Evaluation saved separately from calculated KPI."); expect(t.post).toHaveBeenCalledTimes(1); expect(t.post.mock.calls[0]?.[1]).toMatchObject({ subjectUserId: "designer-a", score: 84, comments: "Delivery review complete" }); expect(t.post.mock.calls[0]?.[1]).not.toHaveProperty("kpi");
});
