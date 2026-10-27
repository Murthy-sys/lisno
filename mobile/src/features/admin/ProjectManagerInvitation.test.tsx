import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { UserInvitationCreate } from "./UserInvitationCreate";
import { UserInvitationActions } from "./UserInvitationActions";
import type { UserInvitationSummary } from "./adminIdentityModel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => jest.fn() }));

beforeEach(() => {
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { post: jest.fn() } } } } as never);
});

it("renders one Project Manager invitation option despite a stale legacy option", async () => {
  const client = new QueryClient();
  await render(<QueryClientProvider client={client}><UserInvitationCreate roles={["program_manager", "site_manager"]} canCreate /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Invite user" }));
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "Project Manager" })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Program Manager" })).toBeNull();
});

it("disables invitation creation when no active role remains", async () => {
  const client = new QueryClient();
  await render(<QueryClientProvider client={client}><UserInvitationCreate roles={["program_manager"]} canCreate /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: "Invite user" })).toBeDisabled();
});

it("keeps legacy invitation revocation available while suppressing resend", async () => {
  const client = new QueryClient();
  const invitation: UserInvitationSummary = { id: "invitation-old", name: "Historical manager", role: "program_manager", version: 4, availableActions: ["resend", "revoke"], email: "historical@example.test", mobile: "9000000000", status: "pending", deliveryStatus: "sent", currentLinkAvailable: true, expiresAt: "2026-11-01T00:00:00Z" };
  await render(<QueryClientProvider client={client}><UserInvitationActions invitation={invitation} canResend canRevoke /></QueryClientProvider>);
  expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Revoke/ })).toBeTruthy();
});
