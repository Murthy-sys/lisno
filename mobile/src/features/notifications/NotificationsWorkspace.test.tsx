import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { NotificationsWorkspace } from "./NotificationsWorkspace";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null, useScaffoldNavigationBlocked: () => false }));
jest.mock("./NotificationRealtimeBridge", () => ({ NotificationRealtimeBridge: () => null }));
jest.mock("../vendor-requests/MyRequestsWorkspace", () => ({ BasketRequestDetailWorkspace: ({ requestId }: {requestId: string}) => { const { Text } = require("react-native"); return <Text>{`Request detail ${requestId}`}</Text>; } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const page = (items: unknown[], offset = 0, hasMore = false) => ({ items, unreadCount: items.length, pagination: { offset, limit: 20, total: hasMore ? 24 : items.length, hasMore } });
function setup(permissions: string[]) {
  const session = { user: { id: "synthetic-admin", role: "super_admin" }, authorization: { role: "super_admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } } as unknown as AuthenticatedSession;
  const get = jest.fn(); const put = jest.fn(async () => ({}));
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { status: "ready", environment: { id: "synthetic" }, generation: 1 }, session: { status: "authenticated", session, generation: 1 }, runtime: { api: { authenticated: { get, put } } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { get, put, show: () => render(<QueryClientProvider client={client}><NotificationsWorkspace session={session} /></QueryClientProvider>) };
}
beforeEach(() => jest.clearAllMocks());
it("requests only permitted sources and pages older chat notifications", async () => {
  const t = setup(["chat.read"]); t.get.mockImplementation(async (path: string) => page([], path.includes("offset=20") ? 20 : 0, !path.includes("offset=20")));
  await t.show(); await screen.findByRole("button", { name: "Older notifications" });
  expect(screen.queryByRole("button", { name: "Basket requests" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Execution" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Older notifications" }));
  await screen.findByText("Page 2"); expect(t.get).toHaveBeenCalledWith("/notifications?limit=20&offset=20", expect.anything());
});
it("opens the exact basket request after its read acknowledgment", async () => {
  const t = setup(["ai_estimator_knowledge.configuration.read"]);
  t.get.mockResolvedValue(page([{ id: "notice-a", requestId: "request-b", proposedName: "Joinery", target: { kind: "new_main_basket" }, requester: { id: "requester", name: "Requester" }, vendorName: null, createdAt: "2026-10-14T00:00:00Z", readAt: null, status: "pending" }]));
  await t.show(); await fireEvent.press(await screen.findByRole("button", { name: "Review Joinery" }));
  await screen.findByText("Request detail request-b");
  expect(t.put).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/basket-request-notifications/notice-a/read", {});
});
it("keeps a failed request acknowledgment in the inbox", async () => {
  const t = setup(["ai_estimator_knowledge.configuration.read"]);
  t.put.mockRejectedValue(new Error("Offline"));
  t.get.mockResolvedValue(page([{ id: "notice-a", requestId: "request-b", proposedName: "Joinery", target: { kind: "new_sub_basket" }, requester: { id: "requester", name: "Requester" }, createdAt: "2026-10-14T00:00:00Z", readAt: null, status: "pending" }]));
  await t.show(); await fireEvent.press(await screen.findByRole("button", { name: "Review Joinery" }));
  await waitFor(() => expect(t.put).toHaveBeenCalledTimes(1));
  await screen.findByText("The request notification could not be opened. Refresh and try again.");
  expect(screen.queryByText("Request detail request-b")).toBeNull();
});
