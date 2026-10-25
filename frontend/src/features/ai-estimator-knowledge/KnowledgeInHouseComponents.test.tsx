import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { KnowledgeInHouseComponents } from "./KnowledgeInHouseComponents";
import { liveKnowledgeEditorDataSource } from "./knowledgeEditorDataSource";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeJsonObject } from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin", role: "super_admin" }, authorization: authorizationFor("super_admin") }) }));
const settings = { baseRatePaise: 1000, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1500, startingMarkupBps: 2000 };
const component = (id: string, subBasketId = id) => ({ id, basketId: "b1", subBasketId, inclusions: [], exclusions: [], labor: settings, material: settings });
const baskets = [{ id: "b1", name: "Ceilings", status: "active" }, { id: "b2", name: "Painting", status: "active" }] as KnowledgeBasket[];
const item = { mainLineId: "main", mainLineName: "Ceiling", basketId: "b1", basketName: "Ceilings", subBasketId: "existing" } as KnowledgeItemDetail;
function setup(payload: KnowledgeJsonObject = {}, overrides: Partial<ComponentProps<typeof KnowledgeInHouseComponents>> = {}) {
  const save = vi.fn(async () => true);
  const change = vi.fn(); const pending = vi.fn(); const valid = vi.fn();
  const getSubBasketCatalog = vi.fn(async (basketId: string) => ({ items: ["s1", "s2"].map((id) => ({ id, basketId, name: `${basketId === "b1" ? "Ceiling" : "Paint"} ${id}`, displayOrder: 1, version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" })), pagination: { total: 2, limit: 100, offset: 0, hasMore: false } }));
  const dataSource = { ...liveKnowledgeEditorDataSource, getSubBasketCatalog } as typeof liveKnowledgeEditorDataSource;
  function Harness() {
    const [value, setValue] = useState(payload);
    return <KnowledgeInHouseComponents item={item} payload={value} baskets={baskets} dataSource={dataSource}
      uom={{ id: "uom", label: "sq ft", decimalScale: 2, scopeKey: "main" }} readOnly={false} validationAttempt={0} pendingSaveVersion={0} issues={[]}
      onChange={(next) => { change(next); setValue(next); }} onSaveComponent={async (next) => { setValue(next); return save(); }}
      onValidationChange={valid} onPendingChange={pending} {...overrides} />;
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Harness /></QueryClientProvider>);
  return { save, change, pending, valid, getSubBasketCatalog };
}

describe("In-house component editor", () => {
  it("selects a Main basket then a scoped Sub-basket and saves blank independent fields", async () => {
    const user = userEvent.setup(); const onSaveComponent = vi.fn<(value: KnowledgeJsonObject) => Promise<boolean>>(async () => true); const view = setup({}, { onSaveComponent });
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
    await screen.findByRole("option", { name: "Paint s1" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "s1");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    await waitFor(() => expect(onSaveComponent).toHaveBeenCalledTimes(1));
    expect(onSaveComponent.mock.calls[0]).toEqual([{ inHouseComponents: [{ id: expect.any(String), basketId: "b2", subBasketId: "s1", inclusions: [], exclusions: [], labor: null, material: null }] }]);
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
