import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useNativeWorkspace } from "../admin/nativeWorkspace";
import { ProjectActivityPanel, activityValues } from "./ProjectActivityPanel";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../admin/nativeWorkspace", () => ({ ...jest.requireActual("../admin/nativeWorkspace"), useNativeWorkspace: jest.fn() }));
const event = { id: "event-a", actorId: "manager-a", action: "deadline_updated", entityId: "task-a", entityType: "task", occurredAt: "2026-10-14T00:00:00Z", reason: "Client rescheduled", oldValues: { progress: 10 }, newValues: { progress: 30 } };
it("pages scoped project activity and hides cached details after a denied refresh", async () => {
  const get = jest.fn(async () => ({ items: [event], pagination: { total: 22, offset: 0, limit: 20 } }));
  const session = { user: { id: "manager-a" } };
  jest.mocked(useNativeWorkspace).mockReturnValue({ can: () => true, ready: true, key: (...parts: unknown[]) => ["activity", ...parts], http: { get } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><ProjectActivityPanel projectId="project-a" session={session as never} /></QueryClientProvider>);
  await screen.findByText("Before: progress: 10"); await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText("After: progress: 30");
  expect(get).toHaveBeenCalledWith("/projects/project-a/activity?limit=20&offset=20", expect.anything());
  get.mockRejectedValueOnce(new Error("Access removed")); await fireEvent.press(screen.getByRole("button", { name: "Refresh project activity" }));
  await screen.findByText("Access removed"); expect(screen.queryByText("Before: progress: 10")).toBeNull();
});
it("does not render stored credentials, artifact references or raw object payloads", () => {
  expect(activityValues({ token: "synthetic-secret", storageRef: "private", status: "blocked", nested: { token: "secret" }, description: "See https://example.test/private" })).toBe("status: blocked · description: See [private reference]");
});
