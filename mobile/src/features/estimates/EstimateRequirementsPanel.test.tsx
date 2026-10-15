import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import type { ReactElement } from "react";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { actor, estimateFixture, lineFixture } from "../estimate-authoring/__tests__/fixtures";
import { requirementFixture, requirementsFixture } from "../estimate-authoring/__tests__/requirementsFixtures";
import { EstimateRequirementsPanel } from "./EstimateRequirementsPanel";
import { estimateRequirementsKey, type EstimateRequirements } from "./estimateRequirementsApi";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("expo-router/react-navigation", () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
const runtimeMock = jest.mocked(useConfiguredRuntime);
function setup(initial: EstimateRequirements = { ...requirementsFixture, requirements: [] }) {
 let detail = initial;
 const get = jest.fn(async (_path: string) => detail);
 const post = jest.fn(async (_path: string, input: Record<string, unknown>) => { detail = { ...detail, requirementsVersion: detail.requirementsVersion + 1, estimateVersion: (detail.estimateVersion ?? 0) + 1, requirements: [{ ...requirementFixture, version: (detail.requirements[0]?.version ?? 0) + 1, text: input.text as string ?? requirementFixture.text, status: input.status as typeof requirementFixture.status ?? "open", lineItemIds: input.lineItemIds as string[] ?? [] }] }; return detail; });
 const patch = jest.fn(async (_path: string, input: Record<string, unknown>) => { detail = { ...detail, requirementsVersion: detail.requirementsVersion + 1, estimateVersion: (detail.estimateVersion ?? 0) + 1, requirements: [{ ...requirementFixture, version: requirementFixture.version + 1, text: input.text as string ?? requirementFixture.text }] }; return detail; });
 runtimeMock.mockReturnValue({ runtime: { api: { authenticated: { get, post, patch } } }, environment: { status: "ready", environment: { id: "test-env" } } } as never);
 return { get, post, patch, setDetail: (next: EstimateRequirements) => { detail = next; } };
}
async function mount(ui: ReactElement) { const current = runtimeMock(); runtimeMock.mockReturnValue({ ...current, session: { status: "authenticated", failure: null, generation: 1, session: (ui.props as { session: AuthenticatedSession }).session } }); const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); return client; }
async function startDraft() { await fireEvent.press(await screen.findByRole("button", { name: "Add requirement" })); await fireEvent.press(screen.getByRole("combobox", { name: "Main Basket" })); await fireEvent.press(await screen.findByRole("radio", { name: "Cabinetry" })); await fireEvent.changeText(screen.getByLabelText("What would you like?"), "More kitchen storage"); }
beforeEach(() => jest.clearAllMocks());
it("lets Clients choose only server-permitted items and written requirements while prices stay read-only", async () => {
 const api = setup(); await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("client")} />); await startDraft();
 await fireEvent.press(screen.getByRole("combobox", { name: "Main Line (optional)" })); await fireEvent.press(await screen.findByRole("radio", { name: "External Oak cabinet" }));
 expect(screen.getByText("Indicative total: ₹327.78. Prices are read-only.")).toBeTruthy(); expect(screen.queryByLabelText(/selling rate/)).toBeNull();
 await fireEvent.press(screen.getByRole("button", { name: "Send requirement" })); await screen.findByText("Requirement saved."); expect(api.post).toHaveBeenCalledWith("/projects/project-one/estimate-requirements", { mainBasketId: "basket-one", mainLineId: "main-one", roomId: null, text: "More kitchen storage", expectedRequirementsVersion: 3, idempotencyKey: expect.any(String) }); expect(api.get.mock.calls.every((call) => call[0] === "/projects/project-one/estimate-requirements")).toBe(true);
});
it("retries the exact uncertain create request with its original idempotency key and blocks form changes", async () => {
 const api = setup(); api.post.mockRejectedValueOnce(new Error("Lost response")); await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("client")} />); await startDraft(); await fireEvent.press(screen.getByRole("button", { name: "Send requirement" }));
 const retry = await screen.findByRole("button", { name: "Retry same requirement request" }); expect(screen.getByRole("button", { name: "Send requirement" })).toBeDisabled(); expect(screen.getByLabelText("What would you like?").props.editable).toBe(false);
 await fireEvent.press(retry); await screen.findByText("Requirement saved."); expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
});
it("preserves text on version conflicts and refreshes explicit collection/request versions before retry", async () => {
 const api = setup(requirementsFixture); api.patch.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Requirements changed")); await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("client")} />);
 await fireEvent.press(await screen.findByRole("button", { name: "Edit requirement 1" })); await fireEvent.changeText(screen.getByLabelText("What would you like?"), "Preserved edited request"); await fireEvent.press(screen.getByRole("button", { name: "Save requirement" })); await screen.findByText(/Requirements changed/); expect(screen.getByLabelText("What would you like?").props.value).toBe("Preserved edited request");
 api.setDetail({ ...requirementsFixture, requirementsVersion: 4, estimateVersion: 8, requirements: [{ ...requirementFixture, version: 3 }] }); await fireEvent.press(screen.getByRole("button", { name: "Refresh and review requirements" })); await waitFor(() => expect(screen.getByRole("button", { name: "Save requirement" })).not.toBeDisabled());
 await fireEvent.press(screen.getByRole("button", { name: "Save requirement" })); await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2)); expect(api.patch.mock.calls[1]?.[1]).toMatchObject({ expectedRequirementsVersion: 4, expectedVersion: 3, text: "Preserved edited request" });
});
it("links staff resolutions only to current saved matching Main Line, basket and room IDs", async () => {
 const api = setup(requirementsFixture); const onVersionAdvance = jest.fn(); const estimate = estimateFixture({ lineItems: [lineFixture, { ...lineFixture, id: "other-room", roomId: "room-other", mainLineName: "Wrong room item" }, { ...lineFixture, id: "other-basket", mainBasketId: "basket-other", mainLineName: "Wrong basket item" }, { ...lineFixture, id: "other-main", catalogueId: "main-other", mainLineId: "main-other", mainLineName: "Wrong Main Line" }] });
 await mount(<EstimateRequirementsPanel projectId="project-one" session={actor()} estimate={estimate} onVersionAdvance={onVersionAdvance} />);
 await fireEvent.press(await screen.findByRole("button", { name: "Resolve requirement 1" })); expect(screen.queryByRole("checkbox", { name: /Wrong/ })).toBeNull(); await fireEvent.press(screen.getByRole("checkbox", { name: "Old cabinet name · Kitchen" })); await fireEvent.press(screen.getByRole("button", { name: "Save resolution" })); await screen.findByText("Requirement saved.");
 expect(api.post).toHaveBeenCalledWith("/projects/project-one/estimate-requirements/request-one/resolve", { expectedRequirementsVersion: 3, expectedVersion: 2, status: "included", lineItemIds: ["saved-line-one"], reason: "" }); expect(onVersionAdvance).toHaveBeenCalledWith(7, 8);
});
it("does not allow resolving against stale saved estimate versions or adding Client requests as Super Admin", async () => {
 setup(requirementsFixture); await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("super_admin")} estimate={estimateFixture({ version: 6 })} />); await fireEvent.press(await screen.findByRole("button", { name: "Resolve requirement 1" })); expect(screen.queryByRole("checkbox", { name: "Old cabinet name · Kitchen" })).toBeNull(); expect(screen.queryByRole("button", { name: "Add requirement" })).toBeNull(); await fireEvent.press(screen.getByRole("button", { name: "Save resolution" })); await screen.findByText("Select at least one current saved item matching this request.");
});
it("purges denied data and hides private requirement text", async () => {
 const api = setup(requirementsFixture); api.patch.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied")); const client = await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("client")} />); await fireEvent.press(await screen.findByRole("button", { name: "Edit requirement 1" })); await fireEvent.press(screen.getByRole("button", { name: "Save requirement" })); await screen.findByText("This project's requirements are outside your current access."); expect(screen.queryByText("Full-height storage")).toBeNull(); expect(client.getQueryData(estimateRequirementsKey({ environmentId: "test-env", userId: "client-one" }, "project-one"))).toBeUndefined();
});
it("retains history with closed and review-pending editing disabled", async () => {
 setup({ ...requirementsFixture, editingAllowed: false, editingBlockReason: "review_pending" }); await mount(<EstimateRequirementsPanel projectId="project-one" session={actor("client")} />); expect(await screen.findByText("Full-height storage")).toBeTruthy(); expect(screen.getByRole("button", { name: "Add requirement" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Edit requirement 1" })).toBeDisabled();
});
