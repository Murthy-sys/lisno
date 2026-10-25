import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { ReactElement } from "react";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { StaffEstimateWorkspace } from "./StaffEstimateWorkspace";
import { StaffEstimateQueue } from "./StaffEstimateQueue";
import { StaffEstimateLifecycle } from "./StaffEstimateLifecycle";
import { staffEstimateKey } from "./staffEstimateApi";
import { actor, catalogueFixture, componentCatalogueFixture, componentLineFixture, estimateFixture, leadFixture, lifecycleFixture, lineFixture } from "./__tests__/fixtures";
import { requirementsFixture } from "./__tests__/requirementsFixtures";
import type { EstimateDraft, EstimateDraftInput } from "./types";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("expo-router/react-navigation", () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
jest.mock("../documents/ProtectedDocumentViewer", () => ({ ProtectedDocumentViewer: () => null }));
const runtimeMock = jest.mocked(useConfiguredRuntime);
function setup(initial: EstimateDraft | null = estimateFixture()) {
 let current = initial;
 const get = jest.fn(async (path: string): Promise<unknown> => {
  if (path === "/leads/lead-one") return leadFixture;
  if (path === "/leads/lead-one/estimate") return current;
  if (path.startsWith("/estimation/catalogue/recommendations")) return { sources: [] };
  if (path.startsWith("/estimation/catalogue?")) return { ...catalogueFixture, pagination: { offset: 0, hasMore: false } };
  if (path === "/estimates/review-queue") return current ? [{ ...current, leadId: "lead-one", lead: leadFixture }] : [];
  if (path === "/estimates/designers") return [{ id: "designer-one", name: "Designer One", email: "designer@example.invalid", title: null }];
  throw new Error(`Unexpected GET ${path}`);
 });
 const put = jest.fn(async (_path: string, input: EstimateDraftInput) => {
  const version = (current?.version ?? 0) + 1;
  current = estimateFixture({ ...input, lineItems: input.lineItems.map((line) => line.source === "configuration" ? { ...lineFixture, ...line, id: line.id ?? "new-line-one", mainLineName: "Oak cabinet" } : line), version }); return current;
 });
 const post = jest.fn(async (path: string) => { current = estimateFixture({ ...current, version: (current?.version ?? 0) + 1, status: path.endsWith("/assign") ? "pending_designer_approval" : "sent_to_client" }); return current; });
 runtimeMock.mockReturnValue({ runtime: { api: { authenticated: { get, put, post } } }, environment: { status: "ready", environment: { id: "test-env" } }, session: { status: "authenticated", session: actor() } } as never);
 return { get, put, post, setCurrent: (next: EstimateDraft) => { current = next; } };
}
async function mount(ui: ReactElement) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); return client; }
async function confirmAlert(label: string) { const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]; const action = buttons?.find((button) => button.text === label); expect(action).toBeTruthy(); await act(async () => action?.onPress?.()); }
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, "alert").mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

it("keeps saved component pricing read-only and transports the selected identities unchanged", async () => {
 const api = setup(estimateFixture({ lineItems: [componentLineFixture] }));
 const original = api.get.getMockImplementation()!;
 api.get.mockImplementation(async (path: string) => path.startsWith("/estimation/catalogue?") ? { ...componentCatalogueFixture(), pagination: { offset: 0, hasMore: false } } : original(path));
 await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />);
 await screen.findByRole("button", { name: "Save draft" });
 await fireEvent.press(screen.getByRole("radio", { name: "3 Estimate items" }));
 await screen.findByText(/In-house component pricing is read-only here/);
 expect(screen.getByText("Cabinetry / Storage")).toBeOnTheScreen();
 expect(screen.getByLabelText("Old cabinet name selling rate (₹)")).toHaveDisplayValue("111.11");
 expect(screen.getByLabelText("Old cabinet name selling rate (₹)")).toBeDisabled();
 expect(screen.getByLabelText("Old cabinet name quantity (Square feet)")).toBeDisabled();
 expect(screen.getByRole("combobox", { name: "Old cabinet name pricing mode" })).toBeDisabled();
 expect(screen.getByRole("button", { name: "Use Configuration rate for Old cabinet name" })).toBeDisabled();
 expect(screen.getByRole("button", { name: "Remove saved Old cabinet name" })).toBeDisabled();
 await fireEvent.press(screen.getByRole("button", { name: "Save draft" }));
 await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
 expect(api.put.mock.calls[0]![1].lineItems[0]).toMatchObject({ selectedInHouseComponentIds: ["component-one"], ratePaise: 11111, pricingMode: "in_house", revisionId: "revision-current", revisionVersion: 5 });
});

it("keeps other pricing modes editable while hiding unsupported native component selection", async () => {
 const api = setup();
 const original = api.get.getMockImplementation()!;
 api.get.mockImplementation(async (path: string) => path.startsWith("/estimation/catalogue?") ? { ...componentCatalogueFixture(), pagination: { offset: 0, hasMore: false } } : original(path));
 await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />);
 await screen.findByRole("button", { name: "Save draft" });
 await fireEvent.press(screen.getByRole("radio", { name: "3 Estimate items" }));
 await screen.findByText("Choose In-house components and pricing in the web estimate workspace.");
 const mode = screen.getByRole("combobox", { name: "Oak cabinet pricing mode" });
 expect(mode).toBeEnabled();
 await fireEvent.press(mode);
 expect(screen.getByRole("radio", { name: "PMC" })).toBeOnTheScreen();
 expect(screen.queryByRole("radio", { name: "In-house" })).toBeNull();
});

it("authors a new configured estimate through rooms, scope, items and generation using stable source IDs", async () => {
 const api = setup(null); await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />);
 const kitchen = await screen.findByRole("checkbox", { name: "Kitchen" }); await waitFor(() => expect(kitchen).not.toBeDisabled()); await fireEvent.press(kitchen);
 await fireEvent.changeText(screen.getByLabelText("Kitchen length (ft)"), "11"); await fireEvent.changeText(screen.getByLabelText("Kitchen width (ft)"), "9");
 await fireEvent.press(screen.getByRole("button", { name: "Continue to scope" })); await fireEvent.press(screen.getByRole("checkbox", { name: "Cabinetry" }));
 await fireEvent.press(screen.getByRole("button", { name: "Continue to estimate items" })); await fireEvent.press(screen.getByRole("checkbox", { name: "Include Oak cabinet" }));
 await fireEvent.changeText(screen.getByLabelText("Oak cabinet quantity (Square feet)"), "2.5"); await fireEvent.changeText(screen.getByLabelText("Oak cabinet selling rate (₹)"), "111.11");
 await fireEvent.press(screen.getByRole("button", { name: "Generate estimate" })); expect(screen.getByText("Total including GST: ₹327.78")).toBeTruthy();
 await fireEvent.press(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
 const input = api.put.mock.calls[0]![1]; expect(input.expectedVersion).toBeUndefined(); expect(input.rooms[0]).toMatchObject({ label: "Kitchen", length: 11, width: 9, sqft: 99 }); expect(input.lineItems[0]).toMatchObject({ source: "configuration", roomId: input.rooms[0]!.id, mainBasketId: "basket-one", mainLineId: "main-one", revisionId: "revision-current", revisionVersion: 5, rateSource: "manual", ratePaise: 11111, quantity: 2.5 });
 await screen.findByText("Estimate draft saved.");
});
it("saves then submits only the version returned by the save acknowledgement", async () => {
 const api = setup(); await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />); const submit = await screen.findByRole("button", { name: "Submit pre-estimate" }); await waitFor(() => expect(submit).not.toBeDisabled());
 await fireEvent.press(submit); await confirmAlert("Submit estimate"); await waitFor(() => expect(api.post).toHaveBeenCalledWith("/leads/lead-one/estimate/submit", { expectedVersion: 8 })); expect(api.put.mock.calls[0]![1].expectedVersion).toBe(7);
 await screen.findByText("Estimate submitted. Review the approval and email delivery status below."); expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
});
it("preserves an uncertain save and requires an explicit refreshed-version choice before another write", async () => {
 const api = setup(); api.put.mockRejectedValueOnce(new Error("Connection lost")); await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />);
 const save = await screen.findByRole("button", { name: "Save draft" }); await waitFor(() => expect(save).not.toBeDisabled()); await fireEvent.press(save);
 await screen.findByText(/result could not be confirmed/); expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Keep local edits on refreshed version" })).toBeDisabled();
 api.setCurrent(estimateFixture({ version: 8 })); await fireEvent.press(screen.getByRole("button", { name: "Refresh saved estimate" })); await waitFor(() => expect(screen.getByRole("button", { name: "Keep local edits on refreshed version" })).not.toBeDisabled());
 await fireEvent.press(screen.getByRole("button", { name: "Keep local edits on refreshed version" })); await fireEvent.press(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2)); expect(api.put.mock.calls[1]![1].expectedVersion).toBe(8);
});
it("purges denied saved state and hides editor content", async () => {
 const api = setup(); api.put.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access changed")); const client = await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />);
 const save = await screen.findByRole("button", { name: "Save draft" }); await waitFor(() => expect(save).not.toBeDisabled()); await fireEvent.press(save); await screen.findByText("This estimate is outside your current access.");
 expect(screen.queryByText("Lake House")).toBeNull(); expect(client.getQueryData(staffEstimateKey({ environmentId: "test-env", userId: "estimator_sales-one" }, "lead-one"))).toBeUndefined();
});
it("preserves approved historical content and never exposes editing controls after final closure", async () => {
 setup(estimateFixture({ status: "client_approved", estimation: { ...lifecycleFixture, status: "client_approved", editClosedAt: "2026-10-14T00:00:00Z" } }));
 await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor("estimator_sales", ["GET /leads/:leadId", "GET /leads/:leadId/estimate", "GET /estimation/catalogue", "PUT /leads/:leadId/estimate"])} />);
 await screen.findByText(/current estimate is read-only/); expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull(); await fireEvent.press(screen.getByRole("radio", { name: "3 Estimate items" })); expect(await screen.findByRole("header", { name: "Old cabinet name" })).toBeTruthy(); expect(screen.getByRole("checkbox", { name: "Include Old cabinet name" })).toBeDisabled();
});
it("lets a Design Manager assign from the authorized queue without requesting lead detail", async () => {
 const api = setup(estimateFixture({ status: "pending_manager_assignment" })); const manager = actor("design_manager", ["GET /estimates/review-queue", "GET /estimates/designers", "POST /estimates/:estimateId/assign"]);
 await mount(<StaffEstimateQueue session={manager} onOpenLead={jest.fn()} />); await fireEvent.press(await screen.findByRole("button", { name: "Assign Designer" })); await waitFor(() => expect(screen.getByRole("combobox", { name: "Approval Designer" })).not.toBeDisabled()); await fireEvent.press(screen.getByRole("combobox", { name: "Approval Designer" })); await fireEvent.press(await screen.findByRole("radio", { name: "Designer One" })); await fireEvent.press(screen.getByRole("button", { name: "Confirm assign approval designer" }));
 await waitFor(() => expect(api.post).toHaveBeenCalledWith("/estimates/estimate-one/assign", { designerId: "designer-one" })); expect(api.get.mock.calls.some(([path]) => path.startsWith("/leads/"))).toBe(false);
});
it("keeps personal Designer approval restricted to the actual assigned Designer", async () => {
 setup(); const execute = jest.fn(async () => true); await mount(<StaffEstimateLifecycle estimate={estimateFixture({ status: "pending_designer_approval", assignedDesignerId: "designer-one" })} session={actor("super_admin")} disabled={false} execute={execute} />);
 expect(screen.queryByRole("button", { name: "Approve for Client" })).toBeNull(); expect(screen.queryByRole("button", { name: "Request estimate changes" })).toBeNull();
});

it("blocks collaborative submission until Client requirements are resolved and the approved Design matches final scope", async () => {
 const current = estimateFixture({ estimation: { ...lifecycleFixture, phase: "post", preApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-10-10T00:00:00Z" }, designScopeRevision: 3, approvedDesignScopeRevision: 2 }, designPlanStatus: "approved" });
 const api = setup(current); const original = api.get.getMockImplementation()!; api.get.mockImplementation(async (path: string) => path.includes("/estimate-requirements") ? requirementsFixture : original(path));
 await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />); expect(await screen.findByRole("button", { name: "Submit final estimate" })).toBeDisabled();
 await screen.findByText("Full-height storage"); expect(screen.getByText(/Final submission is waiting/)).toBeTruthy(); expect(api.post).not.toHaveBeenCalled();
});
it("advances the estimate CAS version after resolving a requirement without treating its own acknowledgement as a conflict", async () => {
 const api = setup(estimateFixture({ estimation: lifecycleFixture })); let detail = requirementsFixture; const original = api.get.getMockImplementation()!; api.get.mockImplementation(async (path: string) => path.includes("/estimate-requirements") ? detail : original(path));
 api.post.mockImplementation(async () => { detail = { ...requirementsFixture, requirementsVersion: 4, estimateVersion: 8, requirements: [{ ...requirementsFixture.requirements[0]!, version: 3, status: "included" as "open", lineItemIds: ["saved-line-one"] }] }; api.setCurrent(estimateFixture({ version: 8, estimation: { ...lifecycleFixture, requirementsVersion: 4 } })); return detail as never; });
 await mount(<StaffEstimateWorkspace leadId="lead-one" session={actor()} />); await fireEvent.press(await screen.findByRole("button", { name: "Resolve requirement 1" })); await fireEvent.press(screen.getByRole("checkbox", { name: "Old cabinet name · Kitchen" })); await fireEvent.press(screen.getByRole("button", { name: "Save resolution" }));
 await screen.findByText("Requirement saved."); await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).not.toBeDisabled()); expect(screen.queryByText("Review the saved version")).toBeNull(); await fireEvent.press(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1)); expect(api.put.mock.calls[0]![1].expectedVersion).toBe(8);
});

it("closes a failed workflow dialog so saved-state recovery remains reachable", async () => {
 setup(); const execute = jest.fn(async () => false); await mount(<StaffEstimateLifecycle estimate={estimateFixture({ status: "ready_for_client" })} session={actor()} disabled={false} execute={execute} />);
 await fireEvent.press(screen.getByRole("button", { name: "Send to Client" })); await fireEvent.press(screen.getByRole("button", { name: "Confirm publish estimate to client" }));
 await waitFor(() => expect(screen.queryByRole("header", { name: "Publish estimate to Client" })).toBeNull()); expect(execute).toHaveBeenCalledTimes(1);
});
