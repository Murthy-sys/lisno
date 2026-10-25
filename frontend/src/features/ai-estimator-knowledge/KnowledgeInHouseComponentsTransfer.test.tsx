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

type EditorProps = ComponentProps<typeof KnowledgeInHouseComponents>;
const settings = { baseRatePaise: 1000, lowQuantityLimit: "10", impactBps: 0, minimumMarkupBps: 1500, startingMarkupBps: 2000 };
const source = { id: "legacy-in-house", basketId: "b1", subBasketId: "existing",
  inclusions: [{ id: "included", name: "Saved delivery", selected: true }],
  exclusions: [{ id: "excluded", name: "Saved painting", selected: false }],
  labor: settings, material: { ...settings, baseRatePaise: 2300 } };
const target = { id: "target", basketId: "b2", subBasketId: "target-sub",
  inclusions: [{ id: "replace-me", name: "Old destination scope", selected: true }], exclusions: [],
  labor: { ...settings, baseRatePaise: 8000 }, material: { ...settings, baseRatePaise: 9000 } };
const sibling = { ...target, id: "sibling", subBasketId: "sibling-sub", labor: { ...settings, baseRatePaise: 4300 } };
const item = { mainLineId: "main", mainLineName: "Ceiling", basketId: "b1", basketName: "Ceilings", subBasketId: "existing", version: 4,
  draftRevision: { id: "draft-main", status: "draft" }, activeRevision: null } as KnowledgeItemDetail;
const baskets = [{ id: "b1", name: "Ceilings", status: "active" }, { id: "b2", name: "Painting", status: "active" }] as KnowledgeBasket[];
const targetLabel = "Painting / Target";
const siblingLabel = "Painting / Sibling";
const sourceLabel = "Existing In-house configuration";
const mime = "application/x-lisno-in-house-configuration";

function fixture(): KnowledgeJsonObject {
  return { modeDescription: "Keep this description", pmcMarginBps: 1500,
    modeCalculations: { pmc: { ...settings, baseRatePaise: 1111 }, sub_vendor: { ...settings, baseRatePaise: 2222 },
      in_house_labor: { ...settings, baseRatePaise: 99999 }, in_house_material: { ...settings, baseRatePaise: 99999 } },
    inHouseComponents: [source, target, sibling] };
}

function setup(initial = fixture(), initialOverrides: Partial<EditorProps> = {}) {
  const change = vi.fn(); const save = vi.fn(async () => true); const pending = vi.fn(); const valid = vi.fn();
  const getSubBasketCatalog = vi.fn(async (basketId: string) => ({
    items: [{ id: "existing", name: "Original" }, { id: "target-sub", name: "Target" }, { id: "sibling-sub", name: "Sibling" }, { id: "new-sub", name: "New component" }]
      .map((row) => ({ ...row, basketId, displayOrder: 1, version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" })),
    pagination: { total: 4, limit: 100, offset: 0, hasMore: false }
  }));
  const dataSource = { ...liveKnowledgeEditorDataSource, getSubBasketCatalog };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let currentPayload = initial;
  function Harness({ overrides }: { overrides: Partial<EditorProps> }) {
    const [payload, setPayload] = useState(initial);
    currentPayload = payload;
    return <KnowledgeInHouseComponents item={item} payload={payload} baskets={baskets} dataSource={dataSource}
      uom={{ id: "uom", label: "sq ft", decimalScale: 2, scopeKey: "main:draft-main" }} readOnly={false}
      validationAttempt={0} pendingSaveVersion={0} issues={[]}
      onChange={(next) => { change(next); setPayload(next); }}
      onSaveComponent={async (next) => { setPayload(next); return save(); }}
      onPendingChange={pending} onValidationChange={valid} {...overrides} />;
  }
  const view = (overrides: Partial<EditorProps>) => <QueryClientProvider client={client}><Harness overrides={overrides} /></QueryClientProvider>;
  const rendered = render(view(initialOverrides));
  return { ...rendered, change, save, pending, valid, payload: () => currentPayload,
    rerenderProps: (overrides: Partial<EditorProps>) => rendered.rerender(view({ ...initialOverrides, ...overrides })) };
}

function transfer() {
  const values = new Map<string, string>();
  return { effectAllowed: "none", dropEffect: "none", get types() { return [...values.keys()]; },
    setData: (type: string, value: string) => { values.set(type, value); },
    getData: (type: string) => values.get(type) ?? "", clearData: () => values.clear(), setDragImage: vi.fn() };
}

async function targetRegion(label = targetLabel) {
  return screen.findByRole("region", { name: label });
}

function componentBody(region: HTMLElement, label: string) {
  const bodyId = within(region).getByRole("button", { name: label }).getAttribute("aria-controls")!;
  return document.getElementById(bodyId)!;
}

function expectBlankCalculationDefaults(region: HTMLElement) {
  for (const [name, value] of [["Base Rate (₹)", ""], ["Low Quantity Limit", "15"], ["Impact (%)", "10"],
    ["Min. Gross Margin (%)", "25"], ["Starting Gross Margin (%)", "35"]] as const) {
    const fields = within(region).getAllByRole("textbox", { name });
    expect(fields).toHaveLength(2);
    fields.forEach((field) => { expect(field).toBeVisible(); expect(field).toHaveValue(value); });
  }
}

describe("preserved In-house component transfer", () => {
  it("exposes the original unequal scope and costs after adding the first component", async () => {
    const user = userEvent.setup();
    const legacy: KnowledgeJsonObject = {
      modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: source.labor, in_house_material: source.material },
      modeConfigurations: [{ id: "original-scope", modeKind: "execution", executionSource: "in_house", fields: [],
        inclusions: source.inclusions, exclusions: source.exclusions }]
    };
    const view = setup(legacy);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
    await screen.findByRole("option", { name: "New component" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "new-sub");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    const preserved = await screen.findByRole("region", { name: sourceLabel });
    expect(within(preserved).getByRole("button", { name: sourceLabel })).toHaveAttribute("aria-expanded", "true");
    expect(within(preserved).getByText("Saved delivery")).toBeVisible();
    expect(within(preserved).getByText("Saved painting")).toBeVisible();
    expect(within(preserved).getAllByRole("textbox", { name: "Base Rate (₹)" }).map((input) => (input as HTMLInputElement).value)).toEqual(["10.00", "23.00"]);
    expect(view.payload().inHouseComponents).toEqual([source, expect.objectContaining({ basketId: "b2", subBasketId: "new-sub", labor: null, material: null })]);
    expect(view.payload().modeCalculations).toEqual(legacy.modeCalculations);
    expect(view.payload().modeConfigurations).toEqual(legacy.modeConfigurations);
    expect(view.save).toHaveBeenCalledOnce();
  });

  it("keeps the blank-rate original fully visible after first Add and reload without saving display defaults as costs", async () => {
    const user = userEvent.setup(); const view = setup({});
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "b2");
    await screen.findByRole("option", { name: "New component" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub-basket" }), "new-sub");
    await user.click(screen.getByRole("button", { name: "Save component" }));
    const preserved = await screen.findByRole("region", { name: sourceLabel });
    expectBlankCalculationDefaults(preserved);
    const checkboxes = within(preserved).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(6);
    checkboxes.forEach((checkbox) => { expect(checkbox).toBeVisible(); expect(checkbox).not.toBeChecked(); });
    expect(within(preserved).getByRole("button", { name: "Remove existing configuration" })).toBeEnabled();
    const saved = structuredClone(view.payload());
    expect(saved.inHouseComponents).toEqual([
      expect.objectContaining({ id: "legacy-in-house", labor: null, material: null }),
      expect.objectContaining({ basketId: "b2", subBasketId: "new-sub", labor: null, material: null })
    ]);
    expect(saved).not.toHaveProperty("modeCalculations");
    expectBlankCalculationDefaults(await targetRegion("Painting / New component"));
    view.unmount();
    const reloaded = setup(saved);
    expectBlankCalculationDefaults(screen.getByRole("region", { name: sourceLabel }));
    expect(reloaded.payload()).toEqual(saved);
    expect(reloaded.change).not.toHaveBeenCalled();
    expect(reloaded.save).not.toHaveBeenCalled();
    const reloadedSource = screen.getByRole("region", { name: sourceLabel });
    const destination = await targetRegion("Painting / New component");
    const dataTransfer = transfer(); const body = componentBody(reloadedSource, sourceLabel);
    fireEvent.pointerDown(body);
    fireEvent.dragStart(body, { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    fireEvent.drop(destination, { dataTransfer });
    const [originalSource, added] = saved.inHouseComponents as KnowledgeJsonObject[];
    expect(reloaded.payload()).toEqual({ ...saved, inHouseComponents: [
      { ...added, inclusions: originalSource!.inclusions, exclusions: originalSource!.exclusions, labor: null, material: null }] });
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(reloaded.change).toHaveBeenCalledTimes(1);
    expectBlankCalculationDefaults(destination);
    expect(within(destination).getAllByRole("checkbox")).toHaveLength(6);
    expect(reloaded.save).not.toHaveBeenCalled();
  });

  it.each(["drag", "keyboard"] as const)("moves an entirely empty preserved source using %s and clears only the target", async (method) => {
    const user = userEvent.setup();
    const emptySource = { ...source, inclusions: [], exclusions: [], labor: null, material: null };
    const original = { ...fixture(), inHouseComponents: [emptySource, target, sibling] };
    const view = setup(original); const preserved = screen.getByRole("region", { name: sourceLabel });
    const destination = await targetRegion();
    expect(within(preserved).queryAllByRole("checkbox")).toHaveLength(0);
    expect(preserved).toHaveAttribute("draggable", "true");
    if (method === "drag") {
      const dataTransfer = transfer(); const body = componentBody(preserved, sourceLabel);
      fireEvent.pointerDown(body);
      fireEvent.dragStart(body, { dataTransfer });
      expect(dataTransfer.getData(mime)).not.toBe("");
      fireEvent.drop(destination, { dataTransfer });
    } else {
      within(destination).getByRole("button", { name: "Use existing configuration" }).focus();
      await user.keyboard("{Enter}");
    }
    expect(view.payload()).toEqual({ ...original, inHouseComponents: [
      { ...target, inclusions: [], exclusions: [], labor: null, material: null }, sibling] });
    expectBlankCalculationDefaults(destination);
    expect(within(destination).queryAllByRole("checkbox")).toHaveLength(0);
    expect(destination).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(view.change).toHaveBeenCalledTimes(1);
    expect(view.save).not.toHaveBeenCalled();
  });

  it("atomically moves the preserved source into the target through the keyboard action", async () => {
    const user = userEvent.setup();
    const original = fixture(); const view = setup(original);
    const preserved = screen.getByRole("region", { name: sourceLabel });
    expect(within(preserved).getByRole("button", { name: sourceLabel })).toBeVisible();
    expect(within(preserved).getByRole("button", { name: "Remove existing configuration" })).toBeEnabled();
    const destination = await targetRegion();
    const action = within(destination).getByRole("button", { name: "Use existing configuration" });
    action.focus(); await user.keyboard("{Enter}");
    expect(view.payload()).toEqual({ ...original, inHouseComponents: [
      { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId }, sibling] });
    expect(within(destination).getByRole("button", { name: targetLabel })).toHaveAttribute("aria-expanded", "true");
    expect(within(destination).queryByText("Old destination scope")).not.toBeInTheDocument();
    expect(within(destination).getByText("Saved delivery")).toBeVisible();
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(view.change).toHaveBeenCalledTimes(1);
    expect(view.save).not.toHaveBeenCalled();
    expect(screen.getByText(`Existing In-house configuration moved to ${targetLabel}. Save Mode to keep this change.`)).toBeInTheDocument();
    view.rerenderProps({ pendingSaveVersion: 1 });
    expect(screen.queryByText(/Save Mode to keep this change\./)).not.toBeInTheDocument();
  });

  it("uses the same atomic move for internal drag and ignores external drag data", async () => {
    const view = setup(); const destination = await targetRegion();
    const external = transfer(); external.setData(mime, "forged-session");
    fireEvent.drop(destination, { dataTransfer: external });
    expect(view.change).not.toHaveBeenCalled();
    const internal = transfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag existing configuration" }), { dataTransfer: internal });
    expect(internal.getData(mime)).not.toBe("");
    fireEvent.dragOver(destination, { dataTransfer: internal });
    fireEvent.drop(destination, { dataTransfer: internal });
    expect(view.payload().inHouseComponents).toEqual([
      { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId }, sibling]);
    expect(view.change).toHaveBeenCalledTimes(1);
    expect(view.save).not.toHaveBeenCalled();
  });

  it("moves only the original during a drag and does not reconstruct it on reload", async () => {
    const original = fixture(); const view = setup(original);
    const destination = await targetRegion();
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag existing configuration" }), { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    const copied = { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId };
    const removed = { ...original, inHouseComponents: [copied, sibling] };
    expect(view.payload()).toEqual(removed);
    expect(view.change).toHaveBeenCalledExactlyOnceWith(removed);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(screen.getByText(`Existing In-house configuration moved to ${targetLabel}. Save Mode to keep this change.`)).toBeVisible();
    expect(view.save).not.toHaveBeenCalled();
    expect(within(destination).getAllByRole("textbox", { name: "Base Rate (₹)" }).map((input) => (input as HTMLInputElement).value)).toEqual(["10.00", "23.00"]);
    view.unmount();
    const reloaded = setup(removed); await targetRegion();
    expect(reloaded.payload()).toEqual(removed);
    expect(reloaded.payload().modeCalculations).toEqual(original.modeCalculations);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use existing configuration" })).not.toBeInTheDocument();
    expect(reloaded.change).not.toHaveBeenCalled();
  });

  it("allows explicit removal before copying and retains empty storage instead of reviving legacy fields", async () => {
    const user = userEvent.setup();
    const original = { ...fixture(), inHouseComponents: [source] };
    const view = setup(original);
    await user.click(screen.getByRole("button", { name: "Remove existing configuration" }));
    const removed = { ...original, inHouseComponents: [] };
    expect(view.payload()).toEqual(removed);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(view.save).not.toHaveBeenCalled();
    view.unmount();
    const reloaded = setup(removed);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(reloaded.payload()).toEqual(removed);
    expect(reloaded.change).not.toHaveBeenCalled();
  });

  it("clears only target raw edits even when copied settings equal its saved values", async () => {
    const user = userEvent.setup();
    const matching = { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId };
    const view = setup({ ...fixture(), inHouseComponents: [source, matching, sibling] });
    const destination = await targetRegion(); const other = await targetRegion(siblingLabel);
    await user.click(within(destination).getByRole("button", { name: targetLabel }));
    await user.click(within(other).getByRole("button", { name: siblingLabel }));
    fireEvent.change(within(destination).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!, { target: { value: "unfinished target" } });
    fireEvent.change(within(other).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!, { target: { value: "unfinished sibling" } });
    await user.click(within(destination).getByRole("button", { name: "Add Inclusion" }));
    await user.type(within(destination).getByRole("textbox", { name: "Inclusion name" }), "Discard target draft scope");
    await waitFor(() => expect(view.pending.mock.lastCall?.[0]["sibling:labor"]?.draft.baseRate).toBe("unfinished sibling"));
    await user.click(within(destination).getByRole("button", { name: "Use existing configuration" }));
    await waitFor(() => expect(within(destination).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("10.00"));
    expect(within(other).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("unfinished sibling");
    expect(within(destination).queryByRole("textbox", { name: "Inclusion name" })).not.toBeInTheDocument();
    await waitFor(() => expect(view.pending.mock.lastCall?.[0]["target:labor"] ?? null).toBeNull());
    expect(view.pending.mock.lastCall?.[0]["sibling:labor"]?.draft.baseRate).toBe("unfinished sibling");
    expect(view.payload().inHouseComponents).toEqual([matching, sibling]);
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(view.save).not.toHaveBeenCalled();
  });

  it("offers a Move picker for the original and removes it in the selected target update", async () => {
    const user = userEvent.setup(); const view = setup(); await targetRegion();
    await user.click(screen.getByRole("button", { name: "Drag existing configuration" }));
    const picker = screen.getByRole("dialog", { name: "Move In-house configuration" });
    expect(within(picker).queryByRole("button", { name: `Replace ${sourceLabel}` })).not.toBeInTheDocument();
    await user.click(within(picker).getByRole("button", { name: `Replace ${targetLabel}` }));
    expect(view.change).toHaveBeenCalledExactlyOnceWith({ ...fixture(), inHouseComponents: [
      { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId }, sibling] });
    expect(screen.queryByRole("dialog", { name: "Move In-house configuration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
  });

  it("moves valid pending source inputs and clears the removed source's pending calculation", async () => {
    const user = userEvent.setup(); const view = setup(); const destination = await targetRegion();
    const preserved = screen.getByRole("region", { name: sourceLabel });
    fireEvent.change(within(preserved).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!, { target: { value: "12" } });
    await waitFor(() => expect(view.pending.mock.lastCall?.[0]["legacy-in-house:labor"]?.draft.baseRate).toBe("12"));
    const changesBeforeMove = view.change.mock.calls.length;
    await user.click(within(destination).getByRole("button", { name: "Use existing configuration" }));
    expect(view.payload().inHouseComponents).toEqual([
      { ...source, id: target.id, basketId: target.basketId, subBasketId: target.subBasketId, labor: { ...source.labor, baseRatePaise: 1200 } }, sibling]);
    expect(view.change).toHaveBeenCalledTimes(changesBeforeMove + 1);
    await waitFor(() => expect(view.pending.mock.lastCall?.[0]["legacy-in-house:labor"] ?? null).toBeNull());
    expect(view.pending.mock.lastCall?.[0]["legacy-in-house:material"] ?? null).toBeNull();
    expect(view.valid).toHaveBeenLastCalledWith(true);
  });

  it("blocks copying an unfinished source calculation without losing its text", async () => {
    const view = setup();
    const destination = await targetRegion();
    const preserved = screen.getByRole("region", { name: sourceLabel });
    fireEvent.change(within(preserved).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!, { target: { value: "." } });
    await waitFor(() => expect(within(destination).getByRole("button", { name: "Use existing configuration" })).toBeDisabled());
    expect(screen.getByText("Finish the existing configuration inputs before copying.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Drag existing configuration" })).toHaveAttribute("draggable", "false");
    expect(within(preserved).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue(".");
    expect(view.payload().inHouseComponents).toEqual([source, target, sibling]);
  });

  it("blocks source checklist text until it is saved or cancelled", async () => {
    const user = userEvent.setup(); setup(); const destination = await targetRegion();
    const preserved = screen.getByRole("region", { name: sourceLabel });
    await user.click(within(preserved).getByRole("button", { name: "Add Inclusion" }));
    await user.type(within(preserved).getByRole("textbox", { name: "Inclusion name" }), "Uncommitted scope");
    expect(within(destination).getByRole("button", { name: "Use existing configuration" })).toBeDisabled();
    await user.click(within(preserved).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(within(destination).getByRole("button", { name: "Use existing configuration" })).toBeEnabled());
  });

  it("disables transfer for read-only configuration", async () => {
    const view = setup(fixture(), { readOnly: true }); const destination = await targetRegion();
    const action = within(destination).queryByRole("button", { name: "Use existing configuration" });
    if (action) expect(action).toBeDisabled();
    const handle = screen.queryByRole("button", { name: "Drag existing configuration" });
    if (handle) expect(handle).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: "Remove existing configuration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove component/ })).not.toBeInTheDocument();
    const external = transfer(); external.setData(mime, "forged-session");
    fireEvent.drop(destination, { dataTransfer: external });
    expect(view.change).not.toHaveBeenCalled(); expect(view.save).not.toHaveBeenCalled();
  });

  it("rejects an internal drag after the revision identity changes", async () => {
    const view = setup(); await targetRegion();
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag existing configuration" }), { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    view.rerenderProps({ item: { ...item, version: 5, draftRevision: { ...item.draftRevision!, id: "another-draft" } } });
    fireEvent.drop(await targetRegion(), { dataTransfer });
    expect(view.change).not.toHaveBeenCalled();
    expect(view.payload()).toEqual(fixture());
  });

  it("rejects a drag whose saved source changed after the gesture began", async () => {
    const view = setup(); await targetRegion();
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag existing configuration" }), { dataTransfer });
    const preserved = screen.getByRole("region", { name: sourceLabel });
    fireEvent.change(within(preserved).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!, { target: { value: "11.00" } });
    const afterEdit = structuredClone(view.payload());
    const beforeDropCalls = view.change.mock.calls.length;
    fireEvent.drop(await targetRegion(), { dataTransfer });
    expect(view.change).toHaveBeenCalledTimes(beforeDropCalls);
    expect(view.payload()).toEqual(afterEdit);
    expect((view.payload().inHouseComponents as KnowledgeJsonObject[])[1]).toEqual(target);
  });

  it("does not reconstruct a missing preserved source from obsolete legacy fields", async () => {
    setup({ ...fixture(), inHouseComponents: [target] }); await targetRegion();
    expect(screen.queryByRole("region", { name: sourceLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag existing configuration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use existing configuration" })).not.toBeInTheDocument();
  });

  it("drags an ordinary component body onto a blank component and retains both source configurations", async () => {
    const user = userEvent.setup();
    const empty = { ...sibling, inclusions: [], exclusions: [], labor: null, material: null };
    const original = { ...fixture(), inHouseComponents: [source, target, empty] };
    const view = setup(original);
    const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    await user.click(within(origin).getByRole("button", { name: targetLabel }));
    expect(origin).toHaveAttribute("draggable", "true");
    const dataTransfer = transfer();
    const body = componentBody(origin, targetLabel);
    fireEvent.pointerDown(body, { button: 0 });
    fireEvent.dragStart(body, { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    fireEvent.dragOver(destination, { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    expect(view.payload()).toEqual({ ...original, inHouseComponents: [source, target,
      { ...target, id: empty.id, basketId: empty.basketId, subBasketId: empty.subBasketId }] });
    expect(within(destination).getByRole("button", { name: siblingLabel })).toHaveAttribute("aria-expanded", "true");
    expect(within(destination).getAllByRole("textbox", { name: "Base Rate (₹)" })).toEqual([
      expect.objectContaining({ value: "80.00" }), expect.objectContaining({ value: "90.00" })
    ]);
    expect(within(origin).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("80.00");
    expect(view.save).not.toHaveBeenCalled();
  });

  it("copies a whole ordinary section and replaces destination scope and costs including nulls", async () => {
    const originValue = { ...target, inclusions: [], exclusions: source.exclusions, labor: null };
    const original = { ...fixture(), inHouseComponents: [source, originValue, sibling] };
    const view = setup(original);
    const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    const dataTransfer = transfer();
    fireEvent.dragStart(origin, { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    fireEvent.drop(destination, { dataTransfer });
    expect(view.payload()).toEqual({ ...original, inHouseComponents: [source, originValue,
      { ...originValue, id: sibling.id, basketId: sibling.basketId, subBasketId: sibling.subBasketId }] });
    expect(within(destination).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]).toHaveValue("");
    expect(within(destination).queryByText("Old destination scope")).not.toBeInTheDocument();
  });

  it.each(["calculation input", "remove action"])("does not initiate a whole-section drag from a %s", async (control) => {
    const user = userEvent.setup(); const view = setup();
    const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    await user.click(within(origin).getByRole("button", { name: targetLabel }));
    const input = control === "calculation input"
      ? within(origin).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!
      : within(origin).getByRole("button", { name: `Remove component ${targetLabel}` });
    const dataTransfer = transfer();
    fireEvent.pointerDown(input, { button: 0 });
    fireEvent.dragStart(input, { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    fireEvent.pointerUp(input, { button: 0 });
    expect(dataTransfer.getData(mime)).toBe("");
    expect(view.change).not.toHaveBeenCalled();
    expect(view.payload()).toEqual(fixture());
  });

  it("accepts a drag beginning on the component title text without requiring its separate copy handle", async () => {
    const view = setup(); const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    const disclosure = within(origin).getByRole("button", { name: targetLabel });
    expect(disclosure).toHaveAttribute("draggable", "true");
    const title = within(disclosure).getByText(targetLabel);
    const dataTransfer = transfer();
    fireEvent.pointerDown(title, { button: 0 });
    fireEvent.dragStart(title, { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    fireEvent.drop(destination, { dataTransfer });
    expect(view.payload().inHouseComponents).toEqual([source, target,
      { ...target, id: sibling.id, basketId: sibling.basketId, subBasketId: sibling.subBasketId }]);
    expect(view.save).not.toHaveBeenCalled();
  });

  it("uses the destination picker for keyboard copying of an ordinary component", async () => {
    const user = userEvent.setup(); const view = setup(); const origin = await targetRegion();
    const handle = within(origin).getByRole("button", { name: "Copy configuration" });
    handle.focus(); await user.keyboard("{Enter}");
    const picker = screen.getByRole("dialog", { name: "Copy In-house configuration" });
    expect(within(picker).queryByRole("button", { name: `Replace ${targetLabel}` })).not.toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: `Replace ${sourceLabel}` })).not.toBeInTheDocument();
    const destination = within(picker).getByRole("button", { name: `Replace ${siblingLabel}` });
    destination.focus(); await user.keyboard("{Enter}");
    expect(view.payload().inHouseComponents).toEqual([source, target,
      { ...target, id: sibling.id, basketId: sibling.basketId, subBasketId: sibling.subBasketId }]);
    expect(screen.queryByRole("dialog", { name: "Copy In-house configuration" })).not.toBeInTheDocument();
    expect(view.save).not.toHaveBeenCalled();
  });

  it("blocks only the ordinary source with unfinished checklist text", async () => {
    const user = userEvent.setup(); const view = setup();
    const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    await user.click(within(origin).getByRole("button", { name: targetLabel }));
    await user.click(within(origin).getByRole("button", { name: "Add Inclusion" }));
    await user.type(within(origin).getByRole("textbox", { name: "Inclusion name" }), "Uncommitted ordinary scope");
    expect(within(origin).getByRole("button", { name: "Copy configuration" })).toBeDisabled();
    expect(origin).toHaveAttribute("draggable", "false");
    const dataTransfer = transfer();
    const body = componentBody(origin, targetLabel);
    fireEvent.pointerDown(body, { button: 0 });
    fireEvent.dragStart(body, { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    expect(view.change).not.toHaveBeenCalled();
    expect(within(destination).getByRole("button", { name: "Use existing configuration" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Drag existing configuration" })).toBeEnabled();
    await user.click(within(origin).getByRole("button", { name: "Cancel" }));
    expect(within(origin).getByRole("button", { name: "Copy configuration" })).toBeEnabled();
  });

  it("blocks an ordinary source with invalid calculator text without disabling the preserved source", async () => {
    const user = userEvent.setup(); const view = setup();
    const origin = await targetRegion(); const destination = await targetRegion(siblingLabel);
    await user.click(within(origin).getByRole("button", { name: targetLabel }));
    const input = within(origin).getAllByRole("textbox", { name: "Base Rate (₹)" })[0]!;
    fireEvent.change(input, { target: { value: "unfinished ordinary cost" } });
    await waitFor(() => expect(within(origin).getByRole("button", { name: "Copy configuration" })).toBeDisabled());
    const beforeDropCalls = view.change.mock.calls.length;
    const dataTransfer = transfer();
    const body = componentBody(origin, targetLabel);
    fireEvent.pointerDown(body, { button: 0 });
    fireEvent.dragStart(body, { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    expect(view.change).toHaveBeenCalledTimes(beforeDropCalls);
    expect(input).toHaveValue("unfinished ordinary cost");
    expect(within(destination).getByRole("button", { name: "Use existing configuration" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Drag existing configuration" })).toBeEnabled();
  });

  it("never uses the preserved original as a drag destination", async () => {
    const view = setup(); const origin = await targetRegion();
    const dataTransfer = transfer();
    fireEvent.dragStart(origin, { dataTransfer });
    expect(dataTransfer.getData(mime)).not.toBe("");
    fireEvent.drop(screen.getByRole("region", { name: sourceLabel }), { dataTransfer });
    expect(view.change).not.toHaveBeenCalled();
    expect(view.payload()).toEqual(fixture());
  });
});
