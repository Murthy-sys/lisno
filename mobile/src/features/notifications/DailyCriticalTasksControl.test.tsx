import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import type { CurrentCriticalTaskReview } from "../../../../shared/chat/dailyCriticalTasks";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { DailyCriticalTasksControl } from "./DailyCriticalTasksControl";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
const session = { user: { id: "user-a", name: "Test user", email: "user@example.invalid", role: "procurement" }, authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["chat.read", "chat.read_state", "projects.list"] } } as AuthenticatedSession;
const data: CurrentCriticalTaskReview = { timezone: "Asia/Kolkata", checkedAt: "2026-10-14T09:00:00Z", receipt: { localDate: "2026-10-14", acknowledgedAt: null }, items: [
  { kind: "chat_action", id: "chat-a", messageId: "message-a", projectId: "project-a", projectName: "First Project", title: "Confirm site measurements", dueDate: "2026-10-14" },
  { kind: "design_requirement", id: "stock-a", projectId: "project-b", projectName: "Second Project", title: "Confirm material availability", category: "stock", status: "pending", dueAt: null },
  { kind: "design_requirement", id: "design-a", projectId: "project-b", projectName: "Second Project", title: "Verify installation method", category: "critical", status: "pending", dueAt: null }
] };
const clients: QueryClient[] = [];
async function setup(initial = data) {
  let current = initial;
  const get = jest.fn(async () => current); const put = jest.fn(async () => { current = { ...current, receipt: { localDate: "2026-10-14", acknowledgedAt: "2026-10-14T09:01:00Z" } }; return current.receipt; });
  const runtime = { api: { authenticated: { get, put } } };
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test-environment" }, generation: 1 }, session: { status: "authenticated", session, generation: 2 }, runtime } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } }); clients.push(client);
  const renderView = () => render(<QueryClientProvider client={client}><DailyCriticalTasksControl session={session} /></QueryClientProvider>);
  return { get, put, client, renderView, view: await renderView() };
}
afterEach(() => { clients.forEach((client) => client.clear()); clients.length = 0; jest.clearAllMocks(); });

it("reviews current assigned work once per session and acknowledges only the returned receipt", async () => {
  const { view, get, put, renderView } = await setup();
  await view.findByText("Confirm site measurements");
  expect(get).toHaveBeenCalledWith("/daily-critical-tasks/current", expect.objectContaining({ signal: expect.anything() }));
  expect(view.getByText("Critical supply check")).toBeTruthy(); expect(view.getByText("Design requirement")).toBeTruthy();
  expect(view.getByText("Deadline starts after initial payment confirmation")).toBeTruthy();
  expect(view.getByRole("button", { name: "Open conversation" })).toBeDisabled();
  await fireEvent.press(view.getByText("I have reviewed my tasks"));
  await waitFor(() => expect(put).toHaveBeenCalledWith("/daily-critical-tasks/2026-10-14/acknowledgment", {}));
  await view.unmount(); const second = await renderView();
  expect(second.queryByText("Confirm site measurements")).toBeNull(); expect(get).toHaveBeenCalledTimes(1);
  await fireEvent.press(second.getByRole("button", { name: "Open my critical tasks" })); await second.findByText("Confirm site measurements");
  await fireEvent.press(second.getByText("Open conversation"));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { featureId: "messages", recordId: "project-a", message: "message-a" } }));
});
it("does not fabricate a scheduled receipt for an ordinary login review", async () => {
  const { view, put } = await setup({ ...data, receipt: null }); await view.findByText("Confirm site measurements");
  await fireEvent.press(view.getByText("I have reviewed my tasks")); expect(put).not.toHaveBeenCalled();
});
it("hides prior details when an explicit current read fails", async () => {
  const { view, get } = await setup({ ...data, receipt: null }); await view.findByText("Confirm site measurements");
  await fireEvent.press(view.getByText("I have reviewed my tasks")); get.mockRejectedValueOnce(new Error("access changed"));
  await fireEvent.press(view.getByRole("button", { name: "Open my critical tasks" }));
  await view.findByRole("button", { name: "Retry critical tasks" }); expect(view.queryByText("Confirm site measurements")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Retry critical tasks" })); await view.findByText("Confirm site measurements");
});
it("keeps an empty automatic review closed while still allowing an explicit review", async () => {
  const { view, get } = await setup({ ...data, receipt: null, items: [] }); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(view.queryByText("Critical task list")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Open my critical tasks" })); await view.findByText("You have no open critical actions, design requirements or overdue assigned tasks.");
});

it("blocks manual opening and task shortcuts while another submission owns navigation", async () => {
  const { view, client } = await setup({ ...data, receipt: null });
  await view.findByText("Confirm site measurements");
  await view.rerender(<QueryClientProvider client={client}><DailyCriticalTasksControl session={session} navigationBlocked /></QueryClientProvider>);
  expect(view.getByRole("button", { name: "Open conversation" })).toBeDisabled();
  await fireEvent.press(view.getByText("Open conversation")); expect(mockPush).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("I have reviewed my tasks"));
  expect(view.getByRole("button", { name: "Open my critical tasks" })).toBeDisabled();
});
