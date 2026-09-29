import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { DailyCriticalTasksControl } from "./DailyCriticalTasksControl";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const runtime = jest.mocked(useConfiguredRuntime);
const session = {
  user: { id: "user-a", name: "Aditi", email: "aditi@example.test", role: "procurement" },
  authorization: { role: "procurement", policyVersion: "test", permissions: [] }
} as AuthenticatedSession;

it("requires a staff member to review the 5 PM list and lets them reopen it after acknowledgment", async () => {
  let acknowledged = false;
  const get = jest.fn(async () => ({
    timezone: "Asia/Kolkata" as const,
    localDate: "2026-09-29",
    scheduledAt: "2026-09-29T11:30:00.000Z",
    acknowledgedAt: acknowledged ? "2026-09-29T11:35:00.000Z" : null,
    items: [{ kind: "chat_action" as const, id: "message-a", messageId: "message-a", projectId: "project-a", projectName: "First Project", title: "Confirm site measurements", dueDate: "2026-09-29" }]
  }));
  const put = jest.fn(async () => { acknowledged = true; return { localDate: "2026-09-29", acknowledgedAt: "2026-09-29T11:35:00.000Z" }; });
  const stop = jest.fn();
  runtime.mockReturnValue({
    environment: { environment: { id: "test-environment" } },
    runtime: { api: { authenticated: { get, put } }, realtime: { createStream: () => ({ start: jest.fn(), stop }) } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = await render(<QueryClientProvider client={client}><DailyCriticalTasksControl session={session} /></QueryClientProvider>);
  try {
    await view.findByText("Confirm site measurements");
    expect(view.getByText("First Project")).toBeTruthy();
    get.mockRejectedValueOnce(new Error("offline"));
    await client.invalidateQueries({ queryKey: ["daily-critical-tasks", "test-environment", "user-a"] });
    await view.findByText("This list may be out of date. Retry to review the latest tasks.");
    expect(view.queryByText("Confirm site measurements")).toBeNull();
    expect(view.getByRole("button", { name: "I have reviewed my tasks" })).toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Retry critical task list" }));
    await waitFor(() => expect(view.queryByText("This list may be out of date. Retry to review the latest tasks.")).toBeNull());
    await fireEvent.press(view.getByRole("button", { name: "I have reviewed my tasks" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/daily-critical-tasks/2026-09-29/acknowledgment"));
    await waitFor(() => expect(view.queryByText("Confirm site measurements")).toBeNull());
    get.mockRejectedValueOnce(new Error("access changed"));
    await fireEvent.press(view.getByRole("button", { name: "Open my critical tasks" }));
    await view.findByRole("button", { name: "Retry critical tasks" });
    expect(view.queryByText("Confirm site measurements")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Retry critical tasks" }));
    await view.findByRole("button", { name: "Open my critical tasks" });
    const readsBeforeOpen = get.mock.calls.length;
    await fireEvent.press(view.getByRole("button", { name: "Open my critical tasks" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(readsBeforeOpen));
    await view.findByText("Confirm site measurements");
  } finally {
    await view.unmount();
    client.clear();
    expect(stop).toHaveBeenCalled();
  }
});
