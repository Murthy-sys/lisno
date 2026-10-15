import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../core/http/apiClient";
import { useNativeWorkspace, type NativeContext } from "../admin/nativeWorkspace";
import { KnowledgeDetailProvider } from "../knowledge/knowledgeDetailUi";
import { NativeTaskEditor } from "./NativeTaskEditor";
import { taskUpdateInput, taskSchema } from "./taskModel";
import { OperationalProgressEditor, operationalReadOnly, operationalTaskSchema, TasksWorkspace } from "../operations/TasksWorkspace";
import { ProjectStatusControl } from "./ProjectStatusControl";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../admin/nativeWorkspace", () => ({ ...jest.requireActual("../admin/nativeWorkspace"), useNativeWorkspace: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const task = { id: "task-a", projectId: "project-a", ownerId: "actor-a", title: "Joinery drawing", version: 4, status: "in_progress" as const, progress: 30, originalDeadlineAt: "2026-10-01T12:00:00Z", currentDeadlineAt: "2026-10-20T12:00:00Z", plannedEffort: 7, risk: { level: "red", reason: "Drawing is overdue" } };
const operational = operationalTaskSchema.parse({ id: "work-a", projectId: "project-a", projectName: "Residence A", estimateId: "estimate-a", kind: "procurement", title: "Procure finishes", description: "Order approved finishes", assigneeRole: "procurement", assignedWorker: { id: "actor-a", name: "Buyer A", email: "buyer-a@example.test", role: "procurement", active: true }, sourceSectionId: "section-a", roomName: "Bedroom 2", status: "in_progress", progress: 20, version: 3, openedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" });
function setup(role = "designer") {
  const get = jest.fn(async (_path: string): Promise<unknown> => ({ items: [{ id: "event-a", note: "Client approved the dimensions" }] })); const patch = jest.fn();
  const c = { http: { get, patch }, session: { user: { id: "actor-a", role } }, scope: "test:actor-a", ready: true, can: jest.fn(() => true), key: (...parts: unknown[]) => ["test", "actor-a", "tasks", ...parts], refresh: jest.fn(async () => undefined), guards: { current: new Map() }, navigate: (action: () => void) => action() } as unknown as NativeContext;
  jest.mocked(useNativeWorkspace).mockReturnValue(c); const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}><KnowledgeDetailProvider>{node}</KnowledgeDetailProvider></QueryClientProvider>;
  return { c, get, patch, wrap, show: (node: React.ReactNode) => render(wrap(node)) };
}
it("validates legal transitions, blocked note, completed100 and nonblank progress", () => {
  expect(() => taskUpdateInput(task, "blocked", "30", "")).toThrow("blocking");
  expect(() => taskUpdateInput(task, "completed", "99", "")).toThrow("100");
  expect(() => taskUpdateInput(task, "not_started", "0", "")).toThrow("available");
  expect(() => taskUpdateInput(task, "in_progress", "", "")).toThrow("progress");
  expect(taskUpdateInput(task, "blocked", "30", " Waiting on site ")).toEqual({ version: 4, status: "blocked", progress: 30, note: "Waiting on site" });
  expect(taskSchema.safeParse({ ...task, progress: undefined }).success).toBe(false);
});
it("shows current risk/history and only legal update choices, requiring a blocking reason", async () => {
  const t = setup(); t.patch.mockResolvedValue({ ...task, version: 5, status: "blocked" }); await t.show(<NativeTaskEditor task={task} session={t.c.session} />);
  await screen.findByText("Latest note: Client approved the dimensions"); expect(screen.getByText("Drawing is overdue")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Update task" })); await fireEvent.press(screen.getByRole("combobox", { name: "Task status" })); expect(screen.queryByRole("radio", { name: "not started" })).toBeNull(); await fireEvent.press(screen.getByRole("radio", { name: "blocked" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save task" })); expect(t.patch).not.toHaveBeenCalled(); await fireEvent.changeText(screen.getByLabelText("Blocking reason"), "Waiting on site"); await fireEvent.press(screen.getByRole("button", { name: "Save task" }));
  await waitFor(() => expect(t.patch).toHaveBeenCalledWith("/tasks/task-a", { version: 4, status: "blocked", progress: 30, note: "Waiting on site" }));
});
it("keeps completed and other-owner task updates read-only", async () => {
  const t = setup(); const view = await t.show(<NativeTaskEditor task={{ ...task, ownerId: "designer-b" }} session={t.c.session} />); expect(screen.queryByRole("button", { name: "Update task" })).toBeNull(); expect(screen.getByText("Assigned to teammate.")).toBeTruthy();
  await view.rerender(t.wrap(<NativeTaskEditor task={{ ...task, status: "completed", progress: 100 }} session={t.c.session} />)); expect(screen.queryByRole("button", { name: "Update task" })).toBeNull(); expect(t.patch).not.toHaveBeenCalled();
});
it("pins unknown task saves to the same identity/version and locks editing", async () => {
  const t = setup(); t.patch.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Lost response")).mockResolvedValueOnce({ ...task, version: 5, progress: 45 });
  await t.show(<NativeTaskEditor task={task} session={t.c.session} />); await fireEvent.press(screen.getByRole("button", { name: "Update task" })); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), "45"); await fireEvent.press(screen.getByRole("button", { name: "Save task" })); await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Progress percentage").props.editable).toBe(false); expect(screen.getByRole("button", { name: "Discard task changes" })).toBeDisabled(); await fireEvent.press(screen.getByRole("button", { name: "Retry same request" })); await waitFor(() => expect(t.patch).toHaveBeenCalledTimes(2)); expect(t.patch.mock.calls[0]).toEqual(t.patch.mock.calls[1]);
});
it("locks a locally edited task after a fresh prop version arrives", async () => {
  const t = setup(); const view = await t.show(<NativeTaskEditor task={task} session={t.c.session} />); await fireEvent.press(screen.getByRole("button", { name: "Update task" })); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), "45"); await view.rerender(t.wrap(<NativeTaskEditor task={{ ...task, version: 5, progress: 60 }} session={t.c.session} />)); expect(screen.getByRole("button", { name: "Save task" })).toBeDisabled(); expect(t.patch).not.toHaveBeenCalled();
});
it("hides retained task detail following authorization denial", async () => {
  const t = setup(); t.patch.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed")); await t.show(<NativeTaskEditor task={task} session={t.c.session} />); await fireEvent.press(screen.getByRole("button", { name: "Update task" })); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), "45"); await fireEvent.press(screen.getByRole("button", { name: "Save task" })); await screen.findByText("This task is no longer available for your account."); expect(screen.queryByText("Drawing is overdue")).toBeNull();
});
it("renders all server-returned work with honest local pages, room and assignment", async () => {
  const t = setup("procurement"); t.get.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ ...operational, id: `work-${index}`, title: `Work ${index}` })) as never);
  await t.show(<TasksWorkspace session={t.c.session} />); await screen.findByText("1–20 of 21"); expect(screen.getAllByText("Room: Bedroom 2")).toHaveLength(20); await fireEvent.press(screen.getByRole("button", { name: "Next page" })); await screen.findByText("21–21 of 21"); expect(screen.getByText("Work 20")).toBeTruthy(); expect(t.get).toHaveBeenCalledWith("/workflow-tasks", expect.anything());
});
it("blocks preparation, other-owner and vendor-controlled progress, preserving Finance role-wide tasks", () => {
  const t = setup("procurement"); expect(operationalReadOnly({ ...operational, preparationOnly: true }, t.c.session)).toContain("final approval"); expect(operationalReadOnly({ ...operational, assignedWorker: { ...operational.assignedWorker!, id: "actor-b" } }, t.c.session)).toContain("another"); expect(operationalReadOnly({ ...operational, kind: "site_execution", completionAuthority: "vendor_client" }, t.c.session)).toContain("Vendor progress"); const f = setup("finance_head"); expect(operationalReadOnly({ ...operational, kind: "finance", assigneeRole: "finance_head", assignedWorker: null }, f.c.session)).toBeNull();
});
it("saves operational progress with the selected task CAS and rejects blank inputs", async () => {
  const t = setup("procurement"); t.patch.mockResolvedValue({ ...operational, version: 4, progress: 65 }); await t.show(<OperationalProgressEditor task={operational} context={t.c} refresh={async () => undefined} />); await fireEvent.press(screen.getByRole("button", { name: "Update progress for Procure finishes" })); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), ""); await fireEvent.press(screen.getByRole("button", { name: "Save progress" })); expect(t.patch).not.toHaveBeenCalled(); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), "65"); await fireEvent.press(screen.getByRole("button", { name: "Save progress" })); await waitFor(() => expect(t.patch).toHaveBeenCalledWith("/workflow-tasks/work-a", { version: 3, progress: 65 }));
});
it("rejects project status belonging to another project", async () => {
  const t = setup(); t.get.mockResolvedValue({ projectId: "project-b", projectName: "Private B", projectStatus: "active", serverNow: "2026-10-14T00:00:00Z", state: "active", currentStage: null, pendingActions: [], issue: null } as never); await t.show(<ProjectStatusControl projectId="project-a" session={t.c.session} />); await fireEvent.press(screen.getByRole("button", { name: "Show project status" })); await screen.findByText("The project status identity could not be verified."); expect(screen.queryByText("Private B")).toBeNull();
});
it("requires an explicit current-project read after a task CAS conflict", async () => {
  const t = setup(); t.patch.mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Task changed")); t.get.mockImplementation(async (path: string) => path.startsWith("/projects/") ? { id: "project-a", floors: [{ stages: [{ tasks: [{ ...task, version: 5, progress: 70 }] }] }] } as never : { items: [] }); await t.show(<NativeTaskEditor task={task} session={t.c.session} />); await fireEvent.press(screen.getByRole("button", { name: "Update task" })); await fireEvent.changeText(screen.getByLabelText("Progress percentage"), "45"); await fireEvent.press(screen.getByRole("button", { name: "Save task" })); await screen.findByRole("button", { name: "Reload current data" }); expect(screen.getByRole("button", { name: "Save task" })).toBeDisabled(); await fireEvent.press(screen.getByRole("button", { name: "Reload current data" })); await screen.findByRole("button", { name: "Update task" }); await fireEvent.press(screen.getByRole("button", { name: "Update task" })); expect(screen.getByLabelText("Progress percentage").props.value).toBe("70"); expect(t.get).toHaveBeenCalledWith("/projects/project-a"); expect(t.patch).toHaveBeenCalledTimes(1);
});
