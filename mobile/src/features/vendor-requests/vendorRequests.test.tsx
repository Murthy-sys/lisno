import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../core/http/apiClient";
import { CreateBasketRequestForm } from "./CreateBasketRequestPanel";
import { RequestDetailWorkspace } from "./RequestDetailWorkspace";
import { intakeProposalFixture, proposalFixture } from "./proposal.fixtures";
import type { ProposalDetail, ProposalIntakeContent, ProposalScope } from "./proposalTypes";
import type { ProposalContext } from "./proposalRuntime";
import { useProposalContext } from "./proposalRuntime";
import { BasketRequestsReviewWorkspace } from "./MyRequestsWorkspace";
import type { AuthenticatedSession } from "../../contracts/session";
import { createProposalApi } from "./proposalApi";
import { executeProposalCommand, type ProposalCommand } from "./proposalCommands";

jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../../navigation/useScreenBack", () => ({ useBackInterceptor: jest.fn() }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./proposalRuntime", () => ({ ...jest.requireActual("./proposalRuntime"), useProposalContext: jest.fn() }));

const page = (items: unknown[]) => ({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });
function harness(initial = intakeProposalFixture(), scope: ProposalScope = "procurement") {
  let current = initial; let submitted: ProposalDetail | null = null; let ready = true;
  const get = jest.fn().mockImplementation(async (path: string) => {
    if (path.includes("/readiness")) return { version: current.version, head: current.head, requestVersion: current.requestVersion, ready, findings: ready ? [] : [{ resourceId: "line-proposal", code: "UOM_REQUIRED", message: "Select a unit of measure." }] };
    if (path.includes("/hierarchy") || path.includes("/masters/")) return page([]);
    return path.includes("snapshot=submitted") && submitted ? submitted : current;
  });
  const put = jest.fn().mockImplementation(async (_path, input) => { current = { ...current, intake: input.intake, version: current.version + 1, requestVersion: scope === "admin" && current.requestVersion !== null ? current.requestVersion + 1 : current.requestVersion, head: { ...current.head, version: current.head.version + 1, digest: `${current.head.digest}-saved` } }; return current; });
  const post = jest.fn().mockImplementation(async (path, input) => {
    if (path.endsWith("/submit")) { current = { ...current, status: "pending", version: current.version + 1, requestId: "request-a", requestVersion: 1, submittedHead: current.head, capabilities: { ...current.capabilities, edit: false, submit: false } }; submitted = current; return current; }
    if (path.endsWith("/revise")) { current = intakeProposalFixture({ ...current, id: "revised-proposal", status: "draft", version: 1, requestId: null, requestVersion: null, revisedFromId: current.id, capabilities: { edit: true, submit: true, revise: false, decide: false, review: false } }); return current; }
    if (path.endsWith("/decision")) { current = { ...current, status: input.decision === "approve" ? "fulfilled" : "rejected", reason: input.reason ?? null, version: current.version + 1, requestVersion: current.requestVersion! + 1, capabilities: { ...current.capabilities, decide: false, edit: false } }; return { proposalId: current.id, requestId: current.requestId, status: current.status, version: current.version, requestVersion: current.requestVersion, reason: current.reason, published: null }; }
    current = intakeProposalFixture({ intake: input.intake, name: input.name, ...(input.target ? { target: input.target } : {}) }); return current;
  });
  const api = createProposalApi({ get, put, post, patch: jest.fn(), delete: jest.fn() });
  const context = { api, key: (...parts: unknown[]) => ["private", "test", "requester", "knowledge", "vendor-basket-proposals", scope, ...parts], scope, actorId: "requester", scopeKey: `test:requester:1:${scope}`, ready: true, canRead: true, canCreate: scope === "procurement", canUpdate: true, canSubmit: true } as unknown as ProposalContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { api, context, client, get, post, put, current: () => current, set: (value: ProposalDetail) => { current = value; }, setReady: (value: boolean) => { ready = value; } };
}
async function detail(test: ReturnType<typeof harness>, onBack = jest.fn()) {
  const view = await render(<QueryClientProvider client={test.client}><RequestDetailWorkspace context={test.context} proposalId={test.current().id} onBack={onBack} /></QueryClientProvider>);
  await screen.findByText(`${test.current().name} · ${test.current().status === "draft" ? "Draft" : test.current().status === "rejected" ? "Sent back" : "Awaiting Super Admin"}`);
  return view;
}

it("keeps Super Admin request refresh scoped to the review queue", async () => {
  const test = harness(undefined, "admin");
  test.get.mockResolvedValue(page([]));
  jest.mocked(useProposalContext).mockReturnValue(test.context);
  await render(<QueryClientProvider client={test.client}><BasketRequestsReviewWorkspace session={{} as AuthenticatedSession} /></QueryClientProvider>);
  await screen.findByText("No requests in this view.");
  await fireEvent.press(screen.getByRole("button", { name: "Refresh requests" }));
  await waitFor(() => expect(test.get).toHaveBeenCalledTimes(2));
  expect(test.get.mock.calls.every(([path]) => path.startsWith("/admin/ai-estimator-knowledge/basket-requests?"))).toBe(true);
});

it("compares the original submission with current saved hierarchy fields only", async () => {
  const initial = intakeProposalFixture({ status: "pending", submittedHead: intakeProposalFixture().head });
  const test = harness(initial, "admin"); const get = test.get.getMockImplementation()!;
  test.get.mockImplementation(async path => path.includes("/changes?") ? page([{ resourceId: initial.basket.resourceId, kind: "basket", change: "changed", before: initial.basket, after: { ...initial.basket, payload: { ...initial.basket.payload, name: "Revised joinery" } }, fields: ["name", "description"] }]) : get(path));
  await detail(test);
  expect(test.get.mock.calls.some(([path]) => path.includes("/changes?"))).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Compare submitted and current" }));
  await screen.findByText("Revised joinery · Main Basket updated");
  expect(screen.getByText("Changed: name, description.")).toBeTruthy();
  expect(screen.getByText("Original submission compared with the current saved request. Unsaved edits are excluded.")).toBeTruthy();
});

it("creates a hierarchy intake with names/descriptions only and sends it with separate stable create/submit commands", async () => {
  const test = harness(); const onSaved = jest.fn();
  await render(<QueryClientProvider client={test.client}><CreateBasketRequestForm context={test.context} onSaved={onSaved} onClose={jest.fn()} /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Send to Super Admin" }));
  expect(test.post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Main Basket name"), "Metalwork");
  await fireEvent.changeText(screen.getByLabelText("Main Basket description"), "Custom metal fittings");
  await fireEvent.changeText(screen.getByLabelText("Sub Basket name"), "Railings");
  await fireEvent.changeText(screen.getByLabelText("Sub Basket description"), "Interior safety rails");
  await fireEvent.changeText(screen.getByLabelText("Main Line 1 name"), "Handrail");
  expect(screen.queryByLabelText(/rate|price|unit of measure/i)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Send to Super Admin" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" })));
  expect(test.post.mock.calls[0]).toEqual(["/procurement/vendor-basket-proposals", expect.objectContaining({ name: "Metalwork", requestMode: "hierarchy_intake", idempotencyKey: expect.any(String), intake: { basket: { name: "Metalwork", description: "Custom metal fittings" }, subBasket: { name: "Railings", description: "Interior safety rails" }, mainLines: [{ name: "Handrail" }] } })]);
  expect(test.post.mock.calls[1]?.[0]).toBe("/procurement/vendor-basket-proposals/proposal-one/submit");
  expect(test.post.mock.calls[1]?.[1].idempotencyKey).not.toBe(test.post.mock.calls[0]?.[1].idempotencyKey);
});

it("keeps the selected Main Basket read-only for Sub Basket requests and retries lost submission without recreating", async () => {
  const test = harness(); const onSaved = jest.fn(); const original = test.post.getMockImplementation()!;
  test.post.mockImplementation(async (path, input) => { if (path.endsWith("/submit") && test.post.mock.calls.filter(([url]) => url.endsWith("/submit")).length === 1) throw new ApiError(503, "UNAVAILABLE", "Lost response"); return original(path, input); });
  await render(<QueryClientProvider client={test.client}><CreateBasketRequestForm context={test.context} parent={{ id: "parent-a", name: "Woodwork" }} onSaved={onSaved} onClose={jest.fn()} /></QueryClientProvider>);
  expect(screen.getByText("Selected Main Basket: Woodwork")).toBeTruthy(); expect(screen.queryByLabelText("Main Basket name")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Sub Basket name"), "Shelving"); await fireEvent.changeText(screen.getByLabelText("Sub Basket description"), "Wall shelves"); await fireEvent.changeText(screen.getByLabelText("Main Line 1 name"), "Shelf fitting");
  await fireEvent.press(screen.getByRole("button", { name: "Send to Super Admin" })); await screen.findByText("Lost response");
  expect(screen.getByLabelText("Sub Basket name").props.editable).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Retry same action" })); await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(test.post.mock.calls.filter(([path]) => path === "/procurement/vendor-basket-proposals")).toHaveLength(1);
  expect(test.post.mock.calls[1]).toEqual(test.post.mock.calls[2]);
});

it("saves a draft, submits it, and makes the submitted intake read-only", async () => {
  const test = harness(); await detail(test);
  await fireEvent.changeText(screen.getByLabelText("Sub Basket description"), "Refined stone scope");
  await fireEvent.press(screen.getByRole("button", { name: "Save draft" })); await screen.findByText("Request changes saved.");
  expect(test.put).toHaveBeenCalledWith("/procurement/vendor-basket-proposals/proposal-one/intake", expect.objectContaining({ expectedVersion: 1, intake: expect.objectContaining({ subBasket: expect.objectContaining({ description: "Refined stone scope" }) }) }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to Super Admin" })); await screen.findByText("Request sent to Super Admin.");
  expect(screen.getByLabelText("Sub Basket name").props.editable).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "View original submission" })); await screen.findByText("Original submission. Read-only.");
  expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
});

it("requires a send-back reason, records dual CAS, and preserves the decision command on retry", async () => {
  const initial = intakeProposalFixture({ status: "pending", requestId: "request-a", requestVersion: 6, version: 9, capabilities: { edit: true, decide: true, review: true, submit: false, revise: false } });
  const test = harness(initial, "admin"); await detail(test);
  await fireEvent.press(screen.getByRole("button", { name: "Send back request" }));
  expect(test.post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Send-back reason"), "Specify the stone grade.");
  test.post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Unknown decision"));
  await fireEvent.press(screen.getByRole("button", { name: "Send back request" })); await screen.findByText("Unknown decision");
  await fireEvent.press(screen.getByRole("button", { name: "Retry same action" })); await screen.findByText("Request sent back. The requester can revise and resubmit.");
  expect(test.post.mock.calls[0]).toEqual(test.post.mock.calls[1]);
  expect(test.post.mock.calls[0]?.[1]).toEqual({ expectedVersion: 9, expectedRequestVersion: 6, decision: "reject", reason: "Specify the stone grade.", idempotencyKey: expect.any(String) });
});

it("revises a sent-back request into a linked draft and resubmits changes", async () => {
  const test = harness(intakeProposalFixture({ status: "rejected", version: 4, requestVersion: 2, requestId: "request-a", reason: "Clarify thickness", capabilities: { edit: false, submit: false, decide: false, review: false, revise: true } }));
  await detail(test); expect(screen.getByText("Send-back reason: Clarify thickness")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit and resubmit" })); await screen.findByText("New draft created. The original request and send-back reason remain in history.");
  await fireEvent.changeText(screen.getByLabelText("Main Line 1 name"), "20 mm stone installation");
  await fireEvent.press(screen.getByRole("button", { name: "Send to Super Admin" })); await screen.findByText("Request sent to Super Admin.");
  expect(test.put.mock.calls[0]?.[0]).toContain("revised-proposal/intake");
  expect(test.post.mock.calls[1]?.[0]).toContain("revised-proposal/submit");
});

it("retains local changes and blocks writes after a stale-version response", async () => {
  const test = harness(); await detail(test); test.put.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed"));
  await fireEvent.changeText(screen.getByLabelText("Sub Basket name"), "My changes"); await fireEvent.press(screen.getByRole("button", { name: "Save draft" })); await screen.findByText("Changed");
  expect(screen.getByLabelText("Sub Basket name").props.value).toBe("My changes"); expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(test.put).toHaveBeenCalledTimes(1);
});

it("hides private content when request access is revoked", async () => {
  const test = harness(); await detail(test); test.get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
  await act(async () => { await test.client.invalidateQueries({ queryKey: test.context.key("detail") }); });
  await screen.findByText("This request is no longer available to your account."); expect(screen.queryByLabelText("Main Basket name")).toBeNull();
});

it("blocks legacy full-configuration publication until the current head passes readiness", async () => {
  const test = harness(proposalFixture({ status: "pending", requestId: "request-a", requestVersion: 2, capabilities: { edit: true, decide: true, review: true, submit: false, revise: false } }), "admin"); test.setReady(false); await detail(test);
  await screen.findByText("Select a unit of measure."); expect(screen.getByRole("button", { name: "Publish configuration" })).toBeDisabled(); expect(test.post).not.toHaveBeenCalled();
});

it("reconciles exactly one committed intake save before submitting an unknown command", async () => {
  const test = harness(); const initial = test.current(); const intake: ProposalIntakeContent = { ...initial.intake!, subBasket: { ...initial.intake!.subBasket, description: "Updated scope" } };
  const command: ProposalCommand = { kind: "submit", basis: initial, save: { expectedVersion: initial.version, intake }, idempotencyKey: "submit-stable-123" };
  const original = test.put.getMockImplementation()!; test.put.mockImplementationOnce(async (path, input) => { await original(path, input); throw new Error("Response lost"); });
  await expect(executeProposalCommand(test.api, "procurement", command)).rejects.toThrow("Response lost");
  await expect(executeProposalCommand(test.api, "procurement", command)).resolves.toMatchObject({ kind: "submit", detail: { status: "pending" } });
  expect(test.put).toHaveBeenCalledTimes(1); expect(test.post).toHaveBeenCalledTimes(1);
});
