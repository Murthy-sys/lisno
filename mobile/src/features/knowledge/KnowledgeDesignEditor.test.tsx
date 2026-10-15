import { createRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { DESIGN_RULE_KEYS, DESIGN_RULE_QUESTIONS, defaultDesignRules, type DesignRuleKey } from "../../../../shared/knowledge/designRules";
import type { KnowledgeItemDetail, KnowledgeMaster, KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { KnowledgeDesignEditor, type KnowledgeDesignSaveHandle } from "./KnowledgeDesignEditor";
import { KnowledgeDetailProvider } from "./knowledgeDetailUi";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

const metadata = { createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", createdById: "admin-test", updatedById: "admin-test" };
const item = { mainLineId: "line-test", version: 7, status: "draft", draftRevisionId: "revision-test", draftRevision: { id: "revision-test", status: "draft" }, allowedActions: ["update_section"] } as unknown as KnowledgeItemDetail;
const envelope = (payload: unknown = {}) => ({ id: "design-section-test", mainLineId: "line-test", revisionId: "revision-test", sectionKey: "design", applicability: "not_configured", version: 1, payload, ...metadata }) as KnowledgeSectionEnvelope;
const vendors = [{ id: "vendor-a", name: "Test Millworks", status: "active" }, { id: "vendor-archived", name: "Retired Millworks", status: "archived" }] as KnowledgeMaster[];
async function setup({ initial = envelope(), editable = true, vendorStatus = "ready" }: { initial?: KnowledgeSectionEnvelope; editable?: boolean; vendorStatus?: "loading" | "error" | "ready" } = {}) {
  let saved = initial;
  let currentItem = item;
  const get = jest.fn(async () => saved);
  const put = jest.fn(async (_mainLineId, _revisionId, _key, input) => {
    saved = { ...saved, version: input.expectedVersion + 1, payload: input.payload, applicability: "configured" };
    currentItem = { ...currentItem, version: input.expectedAggregateVersion + 1 };
    return { ...saved, aggregateVersion: currentItem.version };
  });
  const context = { api: { getKnowledgeSection: get, getKnowledgeItem: jest.fn(async () => currentItem), updateKnowledgeSection: put }, key: (...parts: unknown[]) => ["private", "test", "admin-test", "knowledge", ...parts], scopeKey: "test:admin-test:1", canRead: true, ready: true, refresh: jest.fn(async () => undefined) } as unknown as KnowledgeMobileContext;
  const ref = createRef<KnowledgeDesignSaveHandle>();
  const dirty = jest.fn(); const unknown = jest.fn(); const busy = jest.fn(); const retryVendors = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><KnowledgeDetailProvider><KnowledgeDesignEditor ref={ref} item={item} revisionId="revision-test" editable={editable} context={context} vendors={vendors} vendorStatus={vendorStatus} onRetryVendors={retryVendors} onDirtyChange={dirty} onUnknownChange={unknown} onBusyChange={busy} /></KnowledgeDetailProvider></QueryClientProvider>);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Loading Design rules…")).toBeNull());
  return { ref, context, client, dirty, unknown, busy, get, put, retryVendors, setSaved: (value: KnowledgeSectionEnvelope) => { saved = value; }, setItem: (value: KnowledgeItemDetail) => { currentItem = value; }, getSaved: () => saved };
}
const answer = (key: DesignRuleKey, value = true) => screen.getByRole("radio", { name: `${DESIGN_RULE_QUESTIONS[key]} ${value ? "Yes" : "No"}` });
const details = (key: DesignRuleKey) => screen.getByLabelText(`${DESIGN_RULE_QUESTIONS[key]} Details`);

it("renders all fourteen native Yes/No groups; Custom defaults involvement to Yes but retains an explicit No", async () => {
  const view = await setup();
  expect(screen.getAllByRole("radio")).toHaveLength(30);
  for (const key of DESIGN_RULE_KEYS) expect(answer(key, false)).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
  expect(screen.queryByText("Estimation visibility")).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "Custom" }));
  expect(answer("designerVendorSelection")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
  await fireEvent.press(answer("designerVendorSelection", false));
  await fireEvent.press(screen.getByRole("radio", { name: "Custom" }));
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  expect(view.put).toHaveBeenCalledWith("line-test", "revision-test", "design", expect.objectContaining({ expectedVersion: 1, expectedAggregateVersion: 7, applicability: "configured", payload: expect.objectContaining({ itemNature: "custom", answers: expect.objectContaining({ designerVendorSelection: false }) }) }));
});

it("requires a vendor and discussion notes, keeps archived choices unavailable, and uses stable approval-point ids", async () => {
  const view = await setup();
  await fireEvent.press(answer("vendorPreDiscussed"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(screen.getByText("Select the discussed vendor and enter discussion notes.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("combobox", { name: "Discussed vendor" }));
  expect(screen.queryByRole("radio", { name: "Retired Millworks" })).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "Test Millworks" }));
  await fireEvent.changeText(details("vendorPreDiscussed"), "Material discussed; no vendor appointment.");
  await fireEvent.press(answer("designerPoApproval"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.put).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Add approval point" }));
  await fireEvent.changeText(screen.getByLabelText("Approval point 1"), "Verify shop drawing");
  await fireEvent.press(screen.getByRole("button", { name: "Add approval point" }));
  await fireEvent.changeText(screen.getByLabelText("Approval point 2"), "Verify substrate");
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  const first = view.put.mock.calls[0]![3].payload;
  expect(first.discussedVendorId).toBe("vendor-a");
  const retainedId = first.poApprovalChecklist[1].id;
  expect(first.poApprovalChecklist[0].id).not.toBe(retainedId);
  await fireEvent.press(screen.getByRole("button", { name: "Remove approval point 1" }));
  await fireEvent.changeText(screen.getByLabelText("Approval point 1"), "Verify final substrate");
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  expect(view.put.mock.calls[1]![3]).toEqual(expect.objectContaining({ expectedVersion: 2, expectedAggregateVersion: 8, payload: expect.objectContaining({ poApprovalChecklist: [{ id: retainedId, text: "Verify final substrate" }] }) }));
});

it("labels customer-visible details and explains the payment-based stock deadline", async () => {
  await setup();
  for (const key of ["maintenanceAccess", "substrateFixing", "dimensionsClearances"] as const) {
    await fireEvent.press(answer(key));
    expect(within(screen.getByTestId(`design-rule-${key}`)).getByText("Customer-visible estimate note")).toBeTruthy();
  }
  await fireEvent.press(answer("clientFinishApproval"));
  expect(screen.getByText("Client-visible finish/design/specification details")).toBeTruthy();
  expect(screen.getByText(/four days after initial payment is confirmed/)).toBeTruthy();
});

it("retains choices on CAS conflict and only retries with versions explicitly reloaded", async () => {
  const view = await setup();
  await fireEvent.press(answer("stockCheck"));
  view.put.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.put).toHaveBeenCalledTimes(1);
  view.setSaved({ ...envelope(defaultDesignRules()), version: 4 }); view.setItem({ ...item, version: 13 });
  await fireEvent.press(screen.getByRole("button", { name: "Load current Design rules" }));
  await screen.findByText("Current saved rules loaded. Your changes are preserved; review them before saving.");
  expect(answer("stockCheck")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  expect(view.put).toHaveBeenLastCalledWith("line-test", "revision-test", "design", expect.objectContaining({ expectedVersion: 4, expectedAggregateVersion: 13 }));
});

it("reconciles a lost committed response without issuing a duplicate write", async () => {
  const view = await setup();
  const original = view.put.getMockImplementation()!;
  view.put.mockImplementationOnce(async (...args) => { await original(...args); throw new Error("Connection lost"); });
  await fireEvent.press(answer("stockCheck"));
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  expect(view.put).toHaveBeenCalledTimes(1);
  expect(view.unknown).toHaveBeenLastCalledWith(false);
  expect(view.dirty).toHaveBeenLastCalledWith(false);
  expect(screen.getByText("Design rules saved. The response was verified against the current version.")).toBeTruthy();
});

it("blocks discard while an uncertain write is unsettled, then requires confirmation against its original version", async () => {
  const view = await setup();
  view.put.mockRejectedValueOnce(new Error("Connection lost"));
  await fireEvent.press(answer("stockCheck"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.unknown).toHaveBeenLastCalledWith(true);
  await act(async () => expect(view.ref.current!.discard()).toBe(false));
  expect(screen.getByRole("button", { name: "Confirm Design rules" })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: "Confirm Design rules" }));
  await screen.findByText("Design rules saved.");
  expect(view.put.mock.calls[1]![3]).toEqual(view.put.mock.calls[0]![3]);
  expect(view.unknown).toHaveBeenLastCalledWith(false);
});

it("keeps a pending outcome blocked when reconciliation is offline, and reloads without losing edits", async () => {
  const view = await setup();
  view.put.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Unavailable"));
  view.get.mockRejectedValueOnce(new Error("Offline"));
  await fireEvent.press(answer("stockCheck"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(screen.getByText("The save response could not be verified. Load current rules before leaving.")).toBeTruthy();
  expect(answer("stockCheck")).toBeDisabled();
  await act(async () => expect(view.ref.current!.discard()).toBe(false));
  await fireEvent.press(screen.getByRole("button", { name: "Load current Design rules" }));
  await screen.findByRole("button", { name: "Confirm Design rules" });
  expect(answer("stockCheck")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
});

it("does not turn a successful save into an unknown write when summary refresh fails", async () => {
  const view = await setup();
  jest.mocked(view.context.refresh).mockRejectedValueOnce(new Error("Summary offline"));
  await fireEvent.press(answer("stockCheck"));
  await act(async () => expect(await view.ref.current!.save()).toBe(true));
  expect(view.unknown).toHaveBeenLastCalledWith(false);
  expect(screen.getByText("Design rules saved. Refresh to load the latest summary.")).toBeTruthy();
});

it("keeps active history read-only", async () => {
  const view = await setup({ editable: false });
  expect(answer("stockCheck")).toBeDisabled();
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.put).not.toHaveBeenCalled();
});

it("retains saved vendor identity during a catalogue error and requires a fresh catalogue to save", async () => {
  const rules = defaultDesignRules(); rules.answers.vendorPreDiscussed = true; rules.discussedVendorId = "vendor-missing"; rules.details.vendorPreDiscussed = "Prior discussion";
  const view = await setup({ initial: envelope(rules), vendorStatus: "error" });
  expect(screen.getByRole("combobox", { name: "Discussed vendor" })).toBeDisabled();
  expect(screen.getByText("Unavailable saved value")).toBeTruthy();
  await fireEvent.press(answer("stockCheck"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.put).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Retry vendors" }));
  expect(view.retryVendors).toHaveBeenCalledTimes(1);
});

it("hides cached confidential rules after an authorization denial", async () => {
  const rules = defaultDesignRules(); rules.answers.vendorPreDiscussed = true; rules.discussedVendorId = "vendor-a"; rules.details.vendorPreDiscussed = "Private discussion";
  const view = await setup({ initial: envelope(rules) });
  expect(details("vendorPreDiscussed")).toHaveProp("value", "Private discussion");
  view.get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
  await act(async () => { await view.client.invalidateQueries({ queryKey: view.context.key("section") }); });
  await screen.findByText("Design rules are unavailable with your current access.");
  expect(screen.queryByDisplayValue("Private discussion")).toBeNull();
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
});

it("hides retained choices when direct unknown-save reconciliation loses project access", async () => {
  const view = await setup();
  await fireEvent.press(answer("stockCheck"));
  view.put.mockRejectedValueOnce(new Error("Connection lost"));
  view.get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Denied"));
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  await screen.findByText("Design rules are unavailable with your current access.");
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(view.unknown).toHaveBeenLastCalledWith(true);
  await act(async () => expect(view.ref.current!.discard()).toBe(false));
});

it.each([
  { name: "another item", section: { ...envelope(), mainLineId: "line-other" } },
  { name: "another revision", section: { ...envelope(), revisionId: "revision-other" } },
  { name: "incomplete payload", section: envelope({ itemNature: "standard" }) },
  { name: "unsupported field", section: envelope({ ...defaultDesignRules(), vendorRate: 500 }) },
  { name: "malformed checklist", section: envelope({ ...defaultDesignRules(), poApprovalChecklist: [null] }) }
])("does not expose editable all-No defaults for $name", async ({ section }) => {
  const view = await setup({ initial: section });
  await screen.findByRole("button", { name: "Retry Design rules" });
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  await act(async () => expect(await view.ref.current!.save()).toBe(false));
  expect(view.put).not.toHaveBeenCalled();
});
