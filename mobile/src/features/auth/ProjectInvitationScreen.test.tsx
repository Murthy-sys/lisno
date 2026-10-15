import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProjectInvitationScreen, invitationToken } from "./ProjectInvitationScreen";
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useLocalSearchParams: () => ({ token: "synthetic-invite" }) }));
jest.mock("expo-linking", () => ({ useURL: () => null }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/useScreenBack", () => ({ useScreenBack: () => ({ visible: false }) }));
jest.mock("./AuthFrame", () => ({ AuthFrame: ({ children }: { children: unknown }) => children }));
const inspection = { projectId: "project-a", projectName: "Test project", clientName: "Client", email: "client@example.invalid", expiresAt: "2026-10-31T00:00:00Z", requiresSignIn: false };
function setup(existing = false, wrongAccount = false) {
  const publicPost = jest.fn().mockResolvedValue({ ...inspection, requiresSignIn: existing });
  const privatePost = jest.fn().mockResolvedValue({ projectId: "project-a" });
  const login = jest.fn().mockResolvedValue({ role: "client" }); const acceptProjectInvitation = jest.fn().mockResolvedValue({ role: "client" });
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { public: { post: publicPost }, authenticated: { post: privatePost } }, session: { login, acceptProjectInvitation, logout: jest.fn() } }, environment: { generation: 1 }, session: wrongAccount ? { status: "authenticated", session: { user: { role: "client", email: "other@example.invalid" } } } : { status: "unauthenticated" } } as never);
  return { publicPost, privatePost, login, acceptProjectInvitation };
}
beforeEach(() => jest.clearAllMocks());
it("accepts a new Client invitation using the inspected project and secure session manager", async () => {
  const { acceptProjectInvitation } = setup(); await render(<ProjectInvitationScreen />);
  await screen.findByText("Accept project invitation");
  await fireEvent.changeText(screen.getByLabelText("New password"), "SyntheticPassword123!");
  await fireEvent.changeText(screen.getByLabelText("Confirm new password"), "SyntheticPassword123!");
  await fireEvent.press(screen.getByText("Accept project invitation"));
  await waitFor(() => expect(acceptProjectInvitation).toHaveBeenCalledWith({ token: "synthetic-invite", password: "SyntheticPassword123!", passwordConfirmation: "SyntheticPassword123!" }, "project-a"));
  expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ params: { featureId: "projects", recordId: "project-a" } }));
});
it("authenticates the invited existing account before linking the project", async () => {
  const { login, privatePost, acceptProjectInvitation } = setup(true); await render(<ProjectInvitationScreen />);
  await screen.findByText("Accept project invitation"); await fireEvent.changeText(screen.getByLabelText("Account password"), "ExistingPassword");
  await fireEvent.press(screen.getByText("Accept project invitation"));
  await waitFor(() => expect(privatePost).toHaveBeenCalledWith("/auth/project-invitations/accept-existing", { token: "synthetic-invite" }));
  expect(login).toHaveBeenCalledWith({ email: inspection.email, password: "ExistingPassword" });
  expect(acceptProjectInvitation).not.toHaveBeenCalled();
});
it("requires signout when another account is open", async () => {
  const { privatePost } = setup(true, true); await render(<ProjectInvitationScreen />); await screen.findByText("Sign out");
  expect(screen.queryByText("Accept project invitation")).toBeNull(); expect(privatePost).not.toHaveBeenCalled();
});
it("reads fragments only from the project invitation route", () => {
  expect(invitationToken(undefined, "lisno-dev://accept-project-invitation#token=synthetic")).toBe("synthetic");
  expect(invitationToken(undefined, "lisno-dev://unrelated#token=synthetic")).toBe("");
  expect(invitationToken(["multiple"], null)).toBe("");
});
