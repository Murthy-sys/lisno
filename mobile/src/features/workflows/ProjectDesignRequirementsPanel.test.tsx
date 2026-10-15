import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProjectDesignRequirementsPanel } from "./ProjectDesignRequirementsPanel";
import { parseDesignRequirements, type DesignRequirements } from "./projectDesignRequirements";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
const session: AuthenticatedSession = { user: { id: "designer-a", name: "Designer", email: "designer@example.invalid", role: "designer" }, authorization: { role: "designer", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["projects.design_workflow.read", "projects.design_requirements.act"] } };
const snapshot: DesignRequirements = { version: 4, sourceToken: "source-a", canReadInternal: true, blockers: [], entries: [{ id: "requirement-a", lineItemId: "line-a", mainLineId: "main-a", lineName: "Kitchen cabinet", ruleKey: "designerPoApproval", label: "Designer sign-off", category: "po_approval", status: "pending", note: null, details: null, checklist: [{ id: "point-a", text: "Verify dimensions" }, { id: "point-b", text: "Verify finish" }], checkedPointIds: [], completedAt: null, completedById: null, deferredReason: null, dueAt: null, availableActions: ["approve"] }] };
async function setup(data = snapshot) {
  const get = jest.fn().mockResolvedValue(data); const post = jest.fn().mockResolvedValue({ ...data, version: 5 });
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { get, post } } }, environment: { environment: { id: "test" } }, session: { status: "authenticated", session } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const view = await render(<QueryClientProvider client={client}><ProjectDesignRequirementsPanel projectId="project-a" session={session} /></QueryClientProvider>);
  return { get, post, client, view };
}
async function open() { await screen.findByText("Kitchen cabinet"); await fireEvent.press(screen.getByRole("button", { name: /Kitchen cabinet, Designer sign-off/ })); }
afterEach(() => jest.clearAllMocks());

it("requires an evidence note and every PO point, then sends captured source/version", async () => {
  const { post } = await setup(); await open();
  await fireEvent.press(screen.getByText("Approve")); expect(await screen.findByText("Add an evidence or decision note.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Evidence or decision note"), "Checked the issued drawing");
  await fireEvent.press(screen.getByText("Approve")); expect(await screen.findByText("Confirm every Designer PO approval point.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Verify dimensions" })); await fireEvent.press(screen.getByRole("checkbox", { name: "Verify finish" }));
  await fireEvent.press(screen.getByText("Approve"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/design-requirements/actions", expect.objectContaining({ expectedVersion: 4, sourceToken: "source-a", entryId: "requirement-a", action: "approve", checkedPointIds: ["point-a", "point-b"], note: "Checked the issued drawing", idempotencyKey: expect.any(String) })));
});
it("retries an uncertain action with the identical idempotent command", async () => {
  const { post } = await setup({ ...snapshot, entries: [{ ...snapshot.entries[0]!, category: "critical", availableActions: ["complete"], checklist: [] }] });
  post.mockRejectedValueOnce(new Error("offline")); await open();
  await fireEvent.changeText(screen.getByLabelText("Evidence or decision note"), "Site verified"); await fireEvent.press(screen.getByText("Mark complete"));
  await fireEvent.press(await screen.findByText("Retry saved action")); await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
});
it("does not expose internal checklists to a client projection or invent actions", async () => {
  await setup({ ...snapshot, canReadInternal: false, entries: [{ ...snapshot.entries[0]!, availableActions: [] }] }); await open();
  expect(screen.getByText("Selections requiring your approval")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByText("Approve")).toBeNull();
});
it("hides cached requirements on a denied refresh", async () => {
  const { get, client } = await setup(); await open(); get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
  await client.refetchQueries(); await waitFor(() => expect(screen.queryByText("Kitchen cabinet")).toBeNull());
  expect(screen.getByText("Design requirements are unavailable for this account.")).toBeTruthy();
});
it("rejects malformed source state", () => { expect(() => parseDesignRequirements({ ...snapshot, sourceToken: null })).toThrow(); });
