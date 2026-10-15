import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import { ProjectClientInvitationPanel, parseProjectInvitation } from "./ProjectClientInvitationPanel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
const base = { projectId: "project-a", status: "pending", deliveryAvailable: true, expectedVersion: 4, expiresAt: null, sentAt: null, acceptedAt: null, availableActions: ["resend", "revoke"] };
const session = { user: { id: "staff-a", name: "Staff", email: "staff@example.invalid", role: "admin" }, authorization: { role: "admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["projects.client_invitation.read", "projects.client_invitation.manage"] } } as const;
async function mount(value: unknown = base) {
 const get = jest.fn().mockResolvedValue(value); const post = jest.fn().mockResolvedValue({ ...base, expectedVersion: 5 });
 jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { get, post } } }, environment: { environment: { id: "local-test" } } } as never);
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
 await render(<QueryClientProvider client={client}><ProjectClientInvitationPanel projectId="project-a" session={session} /></QueryClientProvider>);
 await screen.findByText("Client invitation");
 return { get, post, client };
}
it("uses the current invitation version and asks for explicit revocation", async () => {
 const { post } = await mount(); await fireEvent.press(await screen.findByText("Revoke invitation")); expect(post).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByText("Confirm revocation")); await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/client-invitation/revoke", { expectedVersion: 4 }));
});
it("blocks unavailable email delivery without issuing a send", async () => {
 const { post } = await mount({ ...base, status: "not_issued", deliveryAvailable: false, availableActions: ["send"] });
 const button = await screen.findByRole("button", { name: "Send invitation" }); expect(button.props.accessibilityState.disabled).toBe(true); await fireEvent.press(button); expect(post).not.toHaveBeenCalled();
});
it("requires a current status read after an uncertain invitation response", async () => {
 const { post, get } = await mount(); post.mockRejectedValueOnce(new Error("Connection lost"));
 await fireEvent.press(await screen.findByText("Resend invitation")); await screen.findByText("The result could not be confirmed. Refresh the invitation status before taking another action.");
 expect(screen.getByRole("button", { name: "Resend invitation" }).props.accessibilityState.disabled).toBe(true);
 get.mockResolvedValue({ ...base, expectedVersion: 8 }); await fireEvent.press(screen.getByText("Refresh invitation status"));
 await waitFor(() => expect(screen.getByRole("button", { name: "Resend invitation" }).props.accessibilityState.disabled).toBe(false));
 await fireEvent.press(screen.getByText("Resend invitation")); await waitFor(() => expect(post).toHaveBeenLastCalledWith("/projects/project-a/client-invitation/resend", { expectedVersion: 8 }));
});
it("rejects another project's invitation status", () => { expect(() => parseProjectInvitation({ ...base, projectId: "project-b" }, "project-a")).toThrow(); });
