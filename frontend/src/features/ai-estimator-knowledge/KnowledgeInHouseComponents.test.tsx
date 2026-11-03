import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { KnowledgeInHouseComponents } from "./KnowledgeInHouseComponents";
import { liveKnowledgeEditorDataSource } from "./knowledgeEditorDataSource";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeSubBasketListResponse } from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin", role: "super_admin" }, authorization: authorizationFor("super_admin") }) }));
const settings = { baseRatePaise: 1000, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1500, startingMarkupBps: 2000 };
const component = (id: string, subBasketId = id) => ({ id, basketId: "b1", subBasketId, inclusions: [], exclusions: [], labor: settings, material: settings });
const baskets = [{ id: "b1", name: "Ceilings", status: "active" }, { id: "b2", name: "Painting", status: "active" }] as KnowledgeBasket[];
const item = { mainLineId: "main", mainLineName: "Ceiling", basketId: "b1", basketName: "Ceilings", subBasketId: "existing" } as KnowledgeItemDetail;
type EditorProps = ComponentProps<typeof KnowledgeInHouseComponents>;
const catalogFor = (basketId: string): KnowledgeSubBasketListResponse => ({ items: [{ id: `${basketId}-sub`, basketId, name: `${basketId} group`, displayOrder: 1, version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" }], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } });
function setup(payload: KnowledgeJsonObject = {}, overrides: Partial<EditorProps> = {}) {
  const save = vi.fn(async () => true);
  const change = vi.fn(); const pending = vi.fn(); const valid = vi.fn();
  const getSubBasketCatalog = vi.fn(async (basketId: string) => ({ items: ["s1", "s2"].map((id) => ({ id, basketId, name: `${basketId === "b1" ? "Ceiling" : "Paint"} ${id}`, displayOrder: 1, version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" })), pagination: { total: 2, limit: 100, offset: 0, hasMore: false } }));
  const dataSource = { ...liveKnowledgeEditorDataSource, getSubBasketCatalog } as typeof liveKnowledgeEditorDataSource;
  function Harness({ props }: { props: Partial<EditorProps> }) {
    const [value, setValue] = useState(payload);
    return <KnowledgeInHouseComponents item={item} payload={value} baskets={baskets} dataSource={dataSource}
      uom={{ id: "uom", label: "sq ft", decimalScale: 2, scopeKey: "main" }} readOnly={false} validationAttempt={0} pendingSaveVersion={0} issues={[]}
      onChange={(next) => { change(next); setValue(next); }} onSaveComponent={async (next) => { setValue(next); return save(); }}
      onValidationChange={valid} onPendingChange={pending} {...props} />;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (props: Partial<EditorProps>) => <QueryClientProvider client={client}><Harness props={props} /></QueryClientProvider>;
  const view = render(tree(overrides));
  return { save, change, pending, valid, getSubBasketCatalog, client, setProps: (props: Partial<EditorProps>) => view.rerender(tree({ ...overrides, ...props })) };
}

describe("In-house component editor", () => {
  it("lists inactive Configuration Main baskets alongside unrelated active baskets", async () => {
    const user = userEvent.setup();
    const onSaveComponent = vi.fn(async () => true);
    setup({}, { onSaveComponent, baskets: [...baskets, { ...baskets[0]!, id: "inactive", name: "Metal work", status: "inactive" }, { ...baskets[0]!, id: "archived", name: "Old work", status: "archived" }] });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    expect(screen.getByRole("option", { name: "Metal work (Inactive)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Painting" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Old work" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "inactive");
    await screen.findByRole("option", { name: "Paint s1" });
    expect(screen.getByRole("button", { name: "Request a missing Sub-basket" })).toBeDisabled();
    expect(screen.getByText(/Activate this Main basket in Configuration/)).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    expect(onSaveComponent).toHaveBeenCalledWith(expect.objectContaining({ inHouseComponents: expect.arrayContaining([expect.objectContaining({ basketId: "inactive", subBasketId: "s1" })]) }));
  });

  it.each([true, false])("keeps inactive eligibility limited to live Configuration adapters (live=%s)", async (live) => {
    const user = userEvent.setup();
    const getSubBasketCatalog = vi.fn(async (basketId: string) => catalogFor(basketId));
    setup({}, { baskets: [...baskets, { ...baskets[0]!, id: "inactive", name: "Metal work", status: "inactive" }],
      dataSource: { ...liveKnowledgeEditorDataSource, scopeKey: live ? "live-configuration:mode-tier:premium" : "proposal:private", supportsLiveConfigurationRequests: live,
        subBasketCatalogKey: id => [live ? "premium-catalog" : "proposal-catalog", id], getSubBasketCatalog } });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await screen.findByRole("option", { name: "b1 group" });
    if (live) expect(screen.getByRole("option", { name: "Metal work (Inactive)" })).toBeInTheDocument();
    else expect(screen.queryByRole("option", { name: "Metal work (Inactive)" })).not.toBeInTheDocument();
    expect(Boolean(screen.queryByRole("button", { name: "Request a missing Sub-basket" }))).toBe(live);
    expect(getSubBasketCatalog).toHaveBeenCalledWith("b1");
  });

  it("waits for the Main basket catalog and distinguishes empty and unavailable parents", async () => {
    const user = userEvent.setup();
    const view = setup({}, { baskets: [], basketCatalogState: { status: "loading" } });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    expect(screen.getByText("Loading Main baskets…")).toBeVisible();
    expect(screen.queryByText("Loading Sub-baskets…")).not.toBeInTheDocument();
    expect(view.getSubBasketCatalog).not.toHaveBeenCalled();
    view.setProps({ basketCatalogState: { status: "ready" } });
    expect(screen.getByText("No Main baskets available.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Main basket" })).toHaveValue("b1");
    expect(screen.getByRole("option", { name: "Unavailable Main basket" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    view.setProps({ baskets, basketCatalogState: { status: "ready" } });
    await screen.findByRole("option", { name: "Ceiling s1" });
    expect(view.getSubBasketCatalog).toHaveBeenCalledWith("b1");
  });

  it.each([
    { status: "loading" as const },
    { status: "error" as const, errorMessage: "Offline" },
    { status: "ready" as const, refreshing: true },
    { status: "ready" as const, refreshErrorMessage: "Refresh failed" }
  ])("blocks saves and preserves selections during unusable Main basket state %j", async (basketCatalogState) => {
    const user = userEvent.setup(); const onRetry = vi.fn(); const view = setup();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await screen.findByRole("option", { name: "Ceiling s1" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    expect(screen.getByRole("button", { name: "Save component" })).toBeEnabled();
    view.setProps({ basketCatalogState: { ...basketCatalogState, onRetry } });
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("s1");
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request a missing Sub-basket" })).toBeDisabled();
    if ("errorMessage" in basketCatalogState || "refreshErrorMessage" in basketCatalogState) {
      await user.click(screen.getByRole("button", { name: "Retry Main baskets" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
    view.setProps({ basketCatalogState: { status: "ready" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save component" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("s1");
    expect(view.save).not.toHaveBeenCalled(); expect(view.change).not.toHaveBeenCalled();
  });

  it("keeps children scoped while switching parents and ignores a late previous catalog", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: KnowledgeSubBasketListResponse) => void;
    const first = new Promise<KnowledgeSubBasketListResponse>(resolve => { resolveFirst = resolve; });
    const getSubBasketCatalog = vi.fn((basketId: string) => basketId === "b1" ? first : Promise.resolve({ ...catalogFor("b2"), items: [...catalogFor("b2").items, ...catalogFor("b1").items] }));
    setup({}, { dataSource: { ...liveKnowledgeEditorDataSource, getSubBasketCatalog } });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    expect(screen.getByText("Loading Sub-baskets…")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
    await screen.findByRole("option", { name: "b2 group" });
    expect(screen.queryByRole("option", { name: "b1 group" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "b2-sub");
    await act(async () => resolveFirst(catalogFor("b1")));
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("b2-sub");
    expect(screen.queryByRole("option", { name: "b1 group" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "");
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toBeDisabled();
    expect(screen.queryByText("Loading Sub-baskets…")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "b2 group" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
  });

  it("blocks stale parent and child selections after catalog removal without substituting IDs", async () => {
    const user = userEvent.setup(); const view = setup();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await screen.findByRole("option", { name: "Ceiling s1" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    view.setProps({ baskets: [baskets[1]!] });
    expect(screen.getByRole("combobox", { name: "Main basket" })).toHaveValue("b1");
    expect(screen.getByRole("option", { name: "Unavailable Main basket" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    view.setProps({ baskets });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save component" })).toBeEnabled());
    act(() => view.client.setQueryData(liveKnowledgeEditorDataSource.subBasketCatalogKey("b1"), { items: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } }));
    expect(await screen.findByRole("option", { name: "Unavailable Sub-basket" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    expect(view.save).not.toHaveBeenCalled();
  });

  it("recovers initial and failed-refresh Sub-basket errors while retaining the selected child", async () => {
    const user = userEvent.setup();
    const getSubBasketCatalog = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(catalogFor("b1"))
      .mockRejectedValueOnce(new Error("Refresh failed")).mockResolvedValue(catalogFor("b1"));
    const view = setup({}, { dataSource: { ...liveKnowledgeEditorDataSource, getSubBasketCatalog } });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.click(await screen.findByRole("button", { name: "Retry Sub-baskets" }));
    await screen.findByRole("option", { name: "b1 group" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "b1-sub");
    await act(async () => view.client.invalidateQueries({ queryKey: liveKnowledgeEditorDataSource.subBasketCatalogKey("b1") }));
    await screen.findByText("Sub-baskets could not be refreshed. Retry before saving.");
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("b1-sub");
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry Sub-baskets" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save component" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("b1-sub");
    expect(view.save).not.toHaveBeenCalled();
  });

  it.each([false, true])("selects a Main basket then a scoped Sub-basket without reconstructing explicit storage (explicit=%s)", async (explicit) => {
    const user = userEvent.setup(); const onSaveComponent = vi.fn<(value: KnowledgeJsonObject) => Promise<boolean>>(async () => true); const view = setup(explicit ? { inHouseComponents: [] } : {}, { onSaveComponent });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
    await screen.findByRole("option", { name: "Paint s1" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    await waitFor(() => expect(onSaveComponent).toHaveBeenCalledTimes(1));
    const newComponent = { id: expect.any(String), basketId: "b2", subBasketId: "s1", inclusions: [], exclusions: [], labor: null, material: null };
    const preserved = { id: "legacy-in-house", basketId: "b1", subBasketId: "existing", labor: null, material: null,
      inclusions: ["Supplier", "Execution", "Labour"].map((name) => ({ id: expect.any(String), name, selected: false })),
      exclusions: ["Supplier", "Execution", "Labour"].map((name) => ({ id: expect.any(String), name, selected: false })) };
    expect(onSaveComponent.mock.calls[0]).toEqual([{ inHouseComponents: explicit ? [newComponent] : [preserved, newComponent] }]);
    expect(view.getSubBasketCatalog).toHaveBeenCalledWith("b2");
  });

  it("retains legacy values exactly when adding, and retries with the same component id", async () => {
    const user = userEvent.setup(); const onSaveComponent = vi.fn<(value: KnowledgeJsonObject) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    setup({ otherField: "retained", modeCalculations: { in_house_labor: settings, in_house_material: { ...settings, baseRatePaise: 2000 } } }, { onSaveComponent });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await screen.findByRole("option", { name: "Ceiling s1" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    await screen.findByText(/component could not be saved/);
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    expect(onSaveComponent.mock.calls[1]).toEqual(onSaveComponent.mock.calls[0]);
    expect(onSaveComponent.mock.calls[0]![0]).toMatchObject({ otherField: "retained", inHouseComponents: [{ id: "legacy-in-house", labor: settings, material: { ...settings, baseRatePaise: 2000 } }, { labor: null, material: null }] });
  });

  it("keeps incomplete inputs through collapse and separates each component's pending calculation", async () => {
    const user = userEvent.setup(); const view = setup({ inHouseComponents: [component("s1"), component("s2")] });
    await user.click(await screen.findByRole("button", { name: "Ceilings / Ceiling s1" }));
    const first = screen.getByRole("region", { name: "Ceilings / Ceiling s1" });
    const base = within(first).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!;
    fireEvent.change(base, { target: { value: "unfinished" } });
    await waitFor(() => expect(view.valid).toHaveBeenLastCalledWith(false));
    await user.click(screen.getByRole("button", { name: "Ceilings / Ceiling s1" }));
    await user.click(screen.getByRole("button", { name: "Ceilings / Ceiling s2" }));
    const second = screen.getByRole("region", { name: "Ceilings / Ceiling s2" });
    expect(within(second).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("10.00");
    await user.click(screen.getByRole("button", { name: "Ceilings / Ceiling s1" }));
    expect(within(first).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("unfinished");
    expect(view.pending.mock.lastCall?.[0]["s1:labor"].draft.baseRate).toBe("unfinished");
  });

  it("keeps blank new costs empty and prevents catalog duplication", async () => {
    const user = userEvent.setup(); setup({ inHouseComponents: [{ ...component("s1"), labor: null, material: null }] });
    await user.click(await screen.findByRole("button", { name: "Ceilings / Ceiling s1" }));
    expect(screen.getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
    expect(screen.getByText("This Sub-basket is already a component.")).toBeVisible();
  });

  it.each([false, true])("requests a Draft from the visible readonly Add action without opening an editable picker (components=%s)", async (explicit) => {
    const user = userEvent.setup(); const onRequestDraft = vi.fn();
    const view = setup(explicit ? { inHouseComponents: [component("s1")] } : {}, { readOnly: true, onRequestDraft });
    expect(screen.getByText(/Create a Draft revision to add components/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    expect(onRequestDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Add In-house component" })).not.toBeInTheDocument();
    expect(view.save).not.toHaveBeenCalled(); expect(view.change).not.toHaveBeenCalled();
    if (explicit) {
      await user.click(await screen.findByRole("button", { name: "Ceilings / Ceiling s1" }));
      expect(screen.getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toBeDisabled();
    }
  });

  it("describes true readonly access without suggesting an unavailable Add action", () => {
    setup({}, { readOnly: true });
    expect(screen.getByText("In-house configuration is read-only.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Add components to configure/)).not.toBeInTheDocument();
  });

  it("allows readonly expansion with no mutation controls", async () => {
    const user = userEvent.setup(); setup({ inHouseComponents: [component("s1")] }, { readOnly: true });
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Ceilings / Ceiling s1" }));
    expect(screen.queryByRole("button", { name: /Remove component/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toBeDisabled();
  });
});

it("requests a missing Sub-basket without adding or selecting an unapproved component", async () => {
  const user = userEvent.setup(); const view = setup();
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { id: "request", status: "pending", kind: "configuration_sub_basket", target: { kind: "new_sub_basket", basketId: "b1" }, description: "Wood support", proposedName: "New support" } }));
  await user.click(screen.getByRole("button", { name: "Add component" }));
  await user.click(screen.getByRole("button", { name: "Request a missing Sub-basket" }));
  const request = screen.getByRole("dialog", { name: "Request Sub-Basket" });
  await user.type(within(request).getByRole("textbox", { name: "Sub-Basket name" }), "New support");
  await user.type(within(request).getByRole("textbox", { name: "Description" }), "Wood support");
  await user.click(within(request).getByRole("button", { name: "Submit for approval" }));
  await screen.findByText("Sub-basket request submitted for approval. It becomes selectable after approval.");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0]![0])).toMatch(/sub-basket-requests$/);
  expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("");
  expect(screen.queryByRole("option", { name: "New support" })).not.toBeInTheDocument();
  expect(view.save).not.toHaveBeenCalled(); expect(view.change).not.toHaveBeenCalled();
});

it("keeps proposal catalog reads scoped and hides live approval requests", async () => {
  const user = userEvent.setup(); const getSubBasketCatalog = vi.fn().mockResolvedValue({ items: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
  setup({}, { dataSource: { ...liveKnowledgeEditorDataSource, scopeKey: "proposal:private", subBasketCatalogKey: (id) => ["private-catalog", id], getSubBasketCatalog } });
  await user.click(screen.getByRole("button", { name: "Add component" }));
  await screen.findByText("No Sub-baskets available under this Main basket.");
  expect(getSubBasketCatalog).toHaveBeenCalledWith("b1");
  expect(screen.queryByRole("button", { name: "Request a missing Sub-basket" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save component" })).toBeDisabled();
});

it.each(["rejected", "fulfilled"] as const)("retains %s request feedback and only selects an approved catalog result", async (status) => {
  const user = userEvent.setup(); let approved = false;
  const getSubBasketCatalog = vi.fn(async (basketId: string) => ({ ...catalogFor(basketId), items: approved && basketId === "b2" ? [...catalogFor(basketId).items,
    { ...catalogFor(basketId).items[0]!, id: "approved-sub", name: "Requested finish" }] : catalogFor(basketId).items }));
  const view = setup({}, { dataSource: { ...liveKnowledgeEditorDataSource, getSubBasketCatalog } });
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    approved = status === "fulfilled";
    return Response.json({ data: { id: "request", status, kind: "configuration_sub_basket", target: { kind: "new_sub_basket", basketId: "b2" }, description: "Finishing supplies", proposedName: "Requested finish" } });
  });
  await user.click(screen.getByRole("button", { name: "Add component" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
  await screen.findByRole("option", { name: "b2 group" });
  await user.click(screen.getByRole("button", { name: "Request a missing Sub-basket" }));
  const request = screen.getByRole("dialog", { name: "Request Sub-Basket" });
  expect(request).toHaveTextContent("Main Basket: Painting");
  await user.type(within(request).getByRole("textbox", { name: "Sub-Basket name" }), "Requested finish");
  await user.type(within(request).getByRole("textbox", { name: "Description" }), "Finishing supplies");
  await user.click(within(request).getByRole("button", { name: "Submit for approval" }));
  const feedback = status === "fulfilled" ? "The Sub-basket request is approved. Refresh the list to select it." : "The Sub-basket request was rejected. Review its decision before submitting another request.";
  await screen.findByText(feedback);
  expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({ basketId: "b2", name: "Requested finish" });
  expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("");
  expect(view.save).not.toHaveBeenCalled(); expect(view.change).not.toHaveBeenCalled();
  if (status === "fulfilled") {
    await screen.findByRole("option", { name: "Requested finish" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "approved-sub");
    expect(screen.getByRole("button", { name: "Save component" })).toBeEnabled();
  } else expect(screen.queryByRole("option", { name: "Requested finish" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b1");
  expect(screen.queryByText(feedback)).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Sub-basket" })).toHaveValue("");
});
