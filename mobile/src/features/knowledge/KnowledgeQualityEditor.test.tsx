import { createRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../core/http/apiClient";
import type { KnowledgeItemDetail, KnowledgeBasketQuality, KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import { KnowledgeQualityEditor } from "./KnowledgeQualityEditor";
import type { KnowledgeSaveHandle } from "./knowledgeEditorContracts";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { selectQualityWorkbook, shareQualityWorkbook } from "./KnowledgeQualityWorkbook";

jest.mock("./KnowledgeQualityWorkbook", () => ({ selectQualityWorkbook: jest.fn(), shareQualityWorkbook: jest.fn() }));
const parameter: KnowledgeJsonObject = { id: "check-a", label: "Check finish", type: "text", severity: "major", sampling: { method: "all", unit: "room" }, responsibleRole: "site", required: true, active: true };
const item = { mainLineId: "item-a", basketId: "basket-a", status: "active", allowedActions: [], activeRevisionId: "revision-active" } as unknown as KnowledgeItemDetail;
const initial: KnowledgeBasketQuality = { basketId: "basket-a", basketName: "Joinery", basketStatus: "active", version: 4, revisionId: "quality-2", revisionNumber: 2, contentDigest: null, parameters: [parameter], updatedAt: null };

function contextFor(api: object, update = true): KnowledgeMobileContext {
  return { api, scopeKey: "test:user:1", key: (...parts: readonly unknown[]) => ["private", "test", "user", "knowledge", ...parts], ready: true, canRead: true, canCreate: true, canUpdate: update, canLifecycle: true, canCreateQualityOptions: true, refresh: jest.fn(async () => undefined) } as unknown as KnowledgeMobileContext;
}
async function setup({ update = true, saved = initial, save }: { update?: boolean; saved?: KnowledgeBasketQuality; save?: jest.Mock } = {}) {
  let current = saved;
  const put = save ?? jest.fn(async (_basketId, input) => { current = { ...current, version: current.version + 1, parameters: input.parameters }; return current; });
  const get = jest.fn(async () => current);
  const context = contextFor({ getKnowledgeBasketQuality: get, updateKnowledgeBasketQuality: put, listKnowledgeQualityControlOptions: jest.fn(async () => ({ items: [] })), getKnowledgeSection: jest.fn(async () => ({ payload: { parameters: [{ ...parameter, label: "Legacy check" }] } })) }, update);
  const ref = createRef<KnowledgeSaveHandle>();
  const dirty = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><KnowledgeQualityEditor item={item} revisionId="revision-active" context={context} ref={ref} onDirtyChange={dirty} onBusyChange={jest.fn()} /></QueryClientProvider>);
  await screen.findByText("Check finish");
  return { context, ref, dirty, client, put, get, setSaved: (next: KnowledgeBasketQuality) => { current = next; } };
}
beforeEach(() => jest.clearAllMocks());

it("edits basket Quality on active history without update_section and saves basket CAS, preserving metadata", async () => {
  const view = await setup();
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 1" }));
  await fireEvent.changeText(screen.getByLabelText("Question / check"), "Check revised finish");
  await fireEvent.press(screen.getByRole("button", { name: "Done editing check" }));
  await waitFor(() => expect(view.dirty).toHaveBeenLastCalledWith(true));
  let result = false;
  await act(async () => { result = await view.ref.current!.save(); });
  expect(result).toBe(true);
  expect(view.put).toHaveBeenCalledWith("basket-a", { expectedVersion: 4, parameters: [{ ...parameter, label: "Check revised finish" }] });
  expect(view.context.refresh).toHaveBeenCalled();
});

it("retains draft on conflict, requires review, and rebases only after explicit action", async () => {
  const put = jest.fn();
  const view = await setup({ save: put });
  put.mockImplementationOnce(async () => { view.setSaved({ ...initial, version: 7, parameters: [{ ...parameter, label: "Someone else’s saved check" }] }); throw new ApiError(409, "VERSION_CONFLICT", "Changed"); });
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 1" }));
  await fireEvent.changeText(screen.getByLabelText("Question / check"), "My retained check");
  await fireEvent.press(screen.getByRole("button", { name: "Done editing check" }));
  await act(async () => { expect(await view.ref.current!.save()).toBe(false); });
  expect(screen.getByText("My retained check")).toBeTruthy();
  expect(put).toHaveBeenCalledTimes(1);
  await act(async () => { expect(await view.ref.current!.save()).toBe(false); });
  expect(put).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Review latest saved checklist" }));
  await fireEvent.press(screen.getByRole("button", { name: "Use latest version with my reviewed draft" }));
  put.mockResolvedValueOnce({ ...initial, version: 8, parameters: [{ ...parameter, label: "My retained check" }] });
  await act(async () => { expect(await view.ref.current!.save()).toBe(true); });
  expect(put).toHaveBeenLastCalledWith("basket-a", { expectedVersion: 7, parameters: [{ ...parameter, label: "My retained check" }] });
});

it.each([{ update: false, saved: initial }, { update: true, saved: { ...initial, basketStatus: "archived" as const } }])("keeps protected or archived basket Quality read only", async settings => {
  const view = await setup(settings);
  expect(screen.queryByRole("button", { name: "Add Parameter" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "View check 1" }));
  expect(screen.getByLabelText("Question / check").props.editable).toBe(false);
  expect(view.put).not.toHaveBeenCalled();
});

it("reviews import then appends unsaved while exports still use saved checks", async () => {
  const incoming = { ...parameter, id: "check-b", label: "Imported check" };
  jest.mocked(selectQualityWorkbook).mockResolvedValueOnce({ parameters: [incoming], issues: [] });
  const view = await setup();
  await fireEvent.press(screen.getByRole("button", { name: "Excel import & export" }));
  await fireEvent.press(screen.getByRole("button", { name: "Import Excel" }));
  await screen.findByText("Review Excel import");
  expect(view.put).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Append checks to draft" }));
  await screen.findByText("Imported check");
  expect(view.put).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Export saved Excel" }));
  await waitFor(() => expect(shareQualityWorkbook).toHaveBeenCalledWith("saved", "Joinery", [parameter], { frequency: [], performer: [] }));
  await act(async () => { view.ref.current!.discard(); });
  expect(screen.queryByText("Imported check")).toBeNull();
});

it("exposes previous item-specific checks as read only without mutating shared data", async () => {
  const view = await setup();
  await fireEvent.press(screen.getByRole("button", { name: "Show previous parameters" }));
  await screen.findByText("Legacy check");
  expect(view.put).not.toHaveBeenCalled();
  expect(view.context.api.getKnowledgeSection).toHaveBeenCalledWith("item-a", "revision-active", "quality");
});

it("acknowledges a committed checklist even if refreshing other screens fails", async () => {
  const view = await setup();
  jest.mocked(view.context.refresh).mockRejectedValueOnce(new Error("Refresh unavailable"));
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 1" }));
  await fireEvent.changeText(screen.getByLabelText("Question / check"), "Persisted check");
  await fireEvent.press(screen.getByRole("button", { name: "Done editing check" }));
  await act(async () => { expect(await view.ref.current!.save()).toBe(true); });
  expect(view.put).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.dirty).toHaveBeenLastCalledWith(false));
});

it("blocks incomplete number checks using shared validation without losing their draft", async () => {
  const view = await setup();
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 1" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Answer type" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Number" }));
  await fireEvent.changeText(screen.getByLabelText("Minimum"), "5");
  await fireEvent.changeText(screen.getByLabelText("Maximum"), "2");
  await fireEvent.changeText(screen.getByLabelText("Unit"), "mm");
  await fireEvent.press(screen.getByRole("button", { name: "Done editing check" }));
  await act(async () => { expect(await view.ref.current!.save()).toBe(false); });
  expect(view.put).not.toHaveBeenCalled();
  expect(screen.getByText(/Maximum cannot be less than minimum/u)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 1" }));
  expect(screen.getByLabelText("Minimum").props.value).toBe("5");
  expect(screen.getByLabelText("Maximum").props.value).toBe("2");
});

it("filters stages without discarding hidden checks and saves reordered stable IDs", async () => {
  const first = { ...parameter, stage: "Preparation" };
  const second = { ...parameter, id: "check-b", label: "Check joints", stage: "Finishing" };
  const view = await setup({ saved: { ...initial, parameters: [first, second] } });
  await fireEvent.press(screen.getByRole("combobox", { name: "Filter by stage" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Finishing" }));
  expect(screen.queryByText("Check finish")).toBeNull();
  expect(screen.getByText("Check joints")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Edit check 2" }));
  expect(screen.getByRole("button", { name: "Move check down" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Move check up" }));
  expect(screen.getByRole("button", { name: "Move check up" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Done editing check" }));
  await act(async () => { expect(await view.ref.current!.save()).toBe(true); });
  expect(view.put).toHaveBeenCalledWith("basket-a", { expectedVersion: 4, parameters: [second, first] });
});
