import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { PurchaseOrderEstimateTree, type PurchaseOrderModeDraft } from "./PurchaseOrderEstimateTree";
import type { PurchaseOrderModeDraftPreview, PurchaseOrderModePriceReference, PurchaseOrderModeResolution, PurchaseOrderPreparationEstimateLine, PurchaseOrderPreparationItem } from "./purchaseOrderApi";

const line = (key: string, roomName: string, overrides: Partial<PurchaseOrderPreparationEstimateLine> = {}): PurchaseOrderPreparationEstimateLine => ({
  key, included: true, source: "configuration", itemType: "main_line", roomId: `room-${key}`, roomName,
  mainBasketId: `basket-${key}`, mainBasketName: "POP / Gypsum", subBasketId: `sub-${key}`, subBasketName: "False Ceiling",
  mainLineId: `main-${key}`, mainLineName: "POP false ceiling", quantity: "10", unit: "sq-ft",
  amountPaise: 600000, itemIds: [], mode: null, ...overrides
});

const item = (id: string, key: string, blockers: PurchaseOrderPreparationItem["blockers"] = []): PurchaseOrderPreparationItem => ({
  id, version: 4, sourceSectionId: "POP", sourceLineItemKey: key, roomName: "Living & Dining", itemName: "Gypsum board",
  brand: "Sample", uom: { id: "uom-one", code: "sq-ft", name: "Square foot", decimalScale: 2, status: "active" },
  vendor: null, plannedOrderQuantityMilliUnits: 10000, pricePaise: 10000, allocatedWorkPaise: 100000,
  plannedLineNetPaise: 100000, blockers
});

function renderTree(lines: PurchaseOrderPreparationEstimateLine[], items: PurchaseOrderPreparationItem[],
  permissions: { canManageItems?: boolean; itemsBusy?: boolean; canManage?: boolean; frozen?: boolean } = {},
  state: { draftPreviewByLine?: Record<string, { status: "loading" | "ready" | "error"; result?: PurchaseOrderModeDraftPreview; error?: string }>;
    modeConflictByLine?: Record<string, string> } = {}) {
  const onAddItem = vi.fn();
  const onEditItem = vi.fn();
  const onRemoveItem = vi.fn();
  const onUseRate = vi.fn();
  const onSaveMode = vi.fn();
  function Harness() {
    const [modeDrafts, setModeDrafts] = useState<Record<string, PurchaseOrderModeDraft>>({});
    return <PurchaseOrderEstimateTree lines={lines} items={items}
    canManage={permissions.canManage ?? false} frozen={permissions.frozen ?? true}
    canManageItems={permissions.canManageItems ?? true} itemsBusy={permissions.itemsBusy ?? false}
    onAddItem={onAddItem} onEditItem={onEditItem} onRemoveItem={onRemoveItem}
    gstDrafts={{}} onGstChange={vi.fn()} commercialReasons={{}} reasonRequiredIds={new Set()}
    onCommercialReasonChange={vi.fn()} modeDrafts={modeDrafts}
    onModeDraftChange={(key, draft) => setModeDrafts((current) => ({ ...current, [key]: draft }))}
    onDiscardMode={(key) => setModeDrafts((current) => { const next = { ...current }; delete next[key]; return next; })}
    onSaveMode={onSaveMode} modeBusyKey={null} modeErrorKey={null} modeError={null}
    draftPreviewByLine={state.draftPreviewByLine} modeConflictByLine={state.modeConflictByLine}
    rateBusyItemId={null} rateErrorItemId={null} onUseRate={onUseRate} />;
  }
  const view = render(<Harness />);
  return { ...view, onAddItem, onEditItem, onRemoveItem, onUseRate, onSaveMode };
}

const configuredMode = (overrides: Partial<PurchaseOrderModeResolution> = {}): PurchaseOrderModeResolution => ({
  state: "selection_required",
  options: [{ key: "pmc", label: "PMC" }, { key: "sub_vendor", label: "Execution / Sub-vendor" }, { key: "in_house", label: "Execution / In-house" }],
  availability: [
    { key: "pmc", label: "PMC", available: true, issues: [] },
    { key: "sub_vendor", label: "Execution / Sub-vendor", available: true, issues: [] },
    { key: "in_house", label: "Execution / In-house", available: true, issues: [] }
  ],
  decision: null, preview: null, issues: [], revision: { id: "revision-one", version: 3, status: "published", contentDigest: "digest-one" },
  uom: { id: "uom-one", code: "sq-ft", decimalScale: 2 }, ...overrides
});

async function openLine(user: ReturnType<typeof userEvent.setup>, roomName: string) {
  const room = screen.getByText(roomName, { selector: ".purchase-orders__estimate-room > summary > span" }).closest("details") as HTMLDetailsElement;
  const target = room.querySelector(".purchase-orders__estimate-line") as HTMLDetailsElement;
  const scopes: HTMLDetailsElement[] = [];
  for (let current: HTMLDetailsElement | null = target; current; current = current.parentElement?.closest("details") as HTMLDetailsElement | null) {
    scopes.unshift(current);
  }
  for (const scope of scopes) if (!scope.open) await user.click(scope.querySelector(":scope > summary")!);
  return target;
}

describe("purchase order estimate tree item actions", () => {
  it("adds beneath the exact eligible source key even when main-line names repeat across rooms", async () => {
    const first = line("source-kitchen", "Kitchen");
    const second = line("source-living", "Living & Dining");
    const { onAddItem } = renderTree([first, second], []);
    const user = userEvent.setup();
    const kitchen = await openLine(user, "Kitchen");
    const kitchenButton = within(kitchen).getByRole("button", { name: "Add purchase item under Kitchen / POP / Gypsum / False Ceiling / POP false ceiling" });
    expect(within(kitchen).getByText("No vendor purchase item added yet. Add one separately when this line needs a supplier order.")).toBeVisible();
    await user.click(kitchenButton);
    const living = await openLine(user, "Living & Dining");
    const livingButton = within(living).getByRole("button", { name: "Add purchase item under Living & Dining / POP / Gypsum / False Ceiling / POP false ceiling" });
    await user.click(livingButton);
    expect(onAddItem).toHaveBeenNthCalledWith(1, first, kitchenButton);
    expect(onAddItem).toHaveBeenNthCalledWith(2, second, livingButton);
  });

  it("offers child edit and reasoned-remove entry points independently of purchase-order mode permissions", async () => {
    const source = line("source-one", "Living & Dining", { itemIds: ["child-one", "child-ordered"] });
    const child = item("child-one", source.key);
    const ordered = item("child-ordered", source.key, [{ code: "ALREADY_ORDERED", message: "In an approved order.", itemId: "child-ordered" }]);
    const { onEditItem, onRemoveItem } = renderTree([source], [child, ordered], { canManage: false, frozen: true });
    const user = userEvent.setup();
    const detail = await openLine(user, "Living & Dining");
    const edit = within(detail).getAllByRole("button", { name: /Edit Gypsum board under Living & Dining/ });
    const remove = within(detail).getByRole("button", { name: /Remove Gypsum board under Living & Dining/ });
    await user.click(edit[0]!);
    await user.click(remove);
    expect(onEditItem).toHaveBeenCalledWith(source, child, edit[0]);
    expect(onRemoveItem).toHaveBeenCalledWith(source, child, remove);
    expect(edit).toHaveLength(2);
    expect(within(detail).getAllByRole("button", { name: /Remove Gypsum board under Living & Dining/ })).toHaveLength(1);
  });

  it("keeps zero and excluded lines as references, with a cue for linked items omitted from preparation", async () => {
    const zero = line("source-zero", "Kitchen", { amountPaise: 0, itemIds: ["review-child"] });
    const excluded = line("source-excluded", "Bedroom", { included: false, amountPaise: 250000 });
    renderTree([zero, excluded], []);
    const user = userEvent.setup();
    const zeroDetail = await openLine(user, "Kitchen");
    expect(within(zeroDetail).getByText("Zero approved amount. This line is reference only.")).toBeVisible();
    expect(within(zeroDetail).getByText("1 linked purchase item needs assignment review below.")).toBeVisible();
    expect(within(zeroDetail).queryByRole("button", { name: /Add purchase item/ })).not.toBeInTheDocument();
    expect(within(zeroDetail).queryByText("Mode needed")).not.toBeInTheDocument();
    const excludedDetail = await openLine(user, "Bedroom");
    expect(within(excludedDetail).getByText(/Excluded from the approved estimate/)).toBeVisible();
    expect(within(excludedDetail).queryByRole("button", { name: /Add purchase item/ })).not.toBeInTheDocument();
  });

  it("hides item mutations without item permission and disables them while item work is busy", async () => {
    const source = line("source-one", "Kitchen", { itemIds: ["child-one"] });
    const child = item("child-one", source.key);
    const user = userEvent.setup();
    const noPermission = renderTree([source], [child], { canManageItems: false, canManage: true, frozen: false });
    const noPermissionDetail = await openLine(user, "Kitchen");
    expect(within(noPermissionDetail).queryByRole("button", { name: /purchase item|Edit Gypsum board|Remove Gypsum board/i })).not.toBeInTheDocument();
    noPermission.unmount();
    const busy = renderTree([source], [child], { itemsBusy: true, canManage: false, frozen: true });
    const busyDetail = await openLine(user, "Kitchen");
    expect(within(busyDetail).getByRole("button", { name: /Add purchase item/ })).toBeDisabled();
    expect(within(busyDetail).getByRole("button", { name: /Edit Gypsum board/ })).toBeDisabled();
    expect(within(busyDetail).getByRole("button", { name: /Remove Gypsum board/ })).toBeDisabled();
    expect((await axe.run(busy.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("requires item-management permission before applying a configured rate to a child", async () => {
    const reference: PurchaseOrderModePriceReference = {
      state: "ready", priceVersionId: "price-one", priceVersionNumber: 2, taxVersionId: "tax-one", taxVersionNumber: 1,
      unitPricePaise: 9000, gstBasisPoints: 1800, treatment: "exclusive", effectiveFrom: "2026-01-01", effectiveTo: null, issues: []
    };
    const source = line("source-one", "Kitchen", { itemIds: ["child-one"], mode: {
      state: "ready", options: [], decision: null, preview: null, issues: [], revision: null, uom: null,
      priceReferences: { "child-one": reference }
    } });
    const child = item("child-one", source.key);
    const user = userEvent.setup();

    const poOnly = renderTree([source], [child], { canManage: true, canManageItems: false, frozen: false });
    expect(within(await openLine(user, "Kitchen")).queryByRole("button", { name: "Use configured rate" })).not.toBeInTheDocument();
    poOnly.unmount();

    const itemOnly = renderTree([source], [child], { canManage: false, canManageItems: true, frozen: false });
    expect(within(await openLine(user, "Kitchen")).queryByRole("button", { name: "Use configured rate" })).not.toBeInTheDocument();
    itemOnly.unmount();

    const permitted = renderTree([source], [child], { canManage: true, canManageItems: true, frozen: false });
    const detail = await openLine(user, "Kitchen");
    await user.click(within(detail).getByRole("button", { name: "Use configured rate" }));
    await user.click(within(detail).getByRole("button", { name: "Confirm rate" }));
    expect(permitted.onUseRate).toHaveBeenCalledWith(source, child, reference);
  });
});

describe("purchase order estimate tree mode selection", () => {
  it("keeps a digest mismatch blocked until a buyer reviews, previews, explains and acknowledges current values", async () => {
    const activatedDigest = "a".repeat(64);
    const observedDigest = "b".repeat(64);
    const candidateAvailability = [
      { key: "pmc" as const, label: "PMC", available: true, issues: [] },
      { key: "sub_vendor" as const, label: "Execution / Sub-vendor", available: true, issues: [] },
      { key: "in_house" as const, label: "Execution / In-house", available: false,
        issues: [{ code: "RATE_MISSING", message: "In-house labor rate is missing." }] }
    ];
    const mismatch = configuredMode({ state: "unavailable", options: [], availability: [],
      issues: [{ code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." }],
      revision: { id: "revision-one", version: 3, status: "active", contentDigest: activatedDigest },
      integrity: { status: "mismatch", activatedDigest, observedDigest, candidateAvailability } });
    const preview: PurchaseOrderModeDraftPreview = {
      projectId: "project-one", estimateSource: { estimateId: "estimate-one", estimateVersion: 1, estimateReviewRoundId: "round-one" },
      sourceLineItemKey: "source-mismatch", decisionVersion: 0, revision: mismatch.revision, uom: mismatch.uom,
      integrity: mismatch.integrity, issues: [], scopes: [],
      preview: { formulaVersion: "v1", mode: "pmc", quantity: "10", quantityScale: 2,
        baseCostPaise: 75000, adjustedCostPaise: 82500, lowQuantityImpactPaise: 7500, sellingPaise: 103125,
        finalVendorChargesPaise: null, floorSellingPaise: null, marginBps: 2000, appliedImpactBps: 1000,
        discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
        settings: { scopes: [], configuredMarginBps: 2000, markupBasis: "starting" }, components: [] }
    };
    const { container, onSaveMode } = renderTree([line("source-mismatch", "Kitchen", { mode: mismatch })], [],
      { canManage: true, frozen: false }, { draftPreviewByLine: { "source-mismatch": { status: "ready", result: preview } } });
    const user = userEvent.setup();
    const detail = await openLine(user, "Kitchen");
    expect(within(detail).getByText("Current saved Configuration values could not be verified against activation.")).toBeVisible();
    expect(within(detail).getByText(/No vendor purchase item added yet/)).toBeVisible();
    expect(within(detail).queryByText("The saved Configuration content does not match its activated digest.")).not.toBeInTheDocument();
    expect(within(detail).getByRole("radio", { name: /^PMC/ })).toBeDisabled();
    expect(within(detail).getByRole("radio", { name: /^Execution/ })).toBeDisabled();
    expect(container).not.toHaveTextContent(observedDigest);
    expect(container).not.toHaveTextContent(activatedDigest);

    const review = within(detail).getByRole("button", { name: "Review current saved values" });
    review.focus();
    await user.keyboard("{Enter}");
    expect(within(detail).getByRole("radio", { name: /^PMC/ })).toBeEnabled();
    expect(within(detail).getByRole("radio", { name: /^PMC/ })).toHaveFocus();
    expect(within(detail).getByRole("radio", { name: /^Execution/ })).toBeEnabled();
    await user.click(within(detail).getByRole("radio", { name: /^PMC/ }));
    expect(within(detail).getByRole("textbox", { name: "Calculation quantity (sq-ft)" })).toHaveValue("10");
    expect(within(detail).getByText("Current unverified saved values preview")).toBeVisible();
    expect(within(detail).getByRole("textbox", { name: "Why use these current unverified saved values?" })).toBeVisible();
    await user.click(within(detail).getByRole("button", { name: "Save mode decision" }));
    expect(within(detail).getByRole("alert")).toHaveTextContent("at least 10 characters");
    await user.type(within(detail).getByRole("textbox", { name: "Why use these current unverified saved values?" }),
      "Reviewed saved rate with the site lead.");
    await user.click(within(detail).getByRole("button", { name: "Save mode decision" }));
    expect(within(detail).getByRole("alert")).toHaveTextContent("Confirm that you reviewed");
    await user.click(within(detail).getByRole("checkbox", { name: /I reviewed the current saved values/ }));
    await user.click(within(detail).getByRole("button", { name: "Save mode decision" }));
    expect(onSaveMode).toHaveBeenCalledWith(expect.objectContaining({ sourceLineItemKey: "source-mismatch", mode: "pmc", quantity: "10",
      recovery: { expectedObservedDigest: observedDigest, reason: "Reviewed saved rate with the site lead.", acknowledge: true } }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("selects PMC or Execution per main line and suggests a valid approved quantity", async () => {
    const kitchen = line("kitchen-mode", "Kitchen", { quantity: "10.5", mode: configuredMode() });
    const bedroom = line("bedroom-mode", "Bedroom", { quantity: "4", mode: configuredMode() });
    const { onSaveMode } = renderTree([kitchen, bedroom], [], { canManage: true, frozen: false });
    const user = userEvent.setup();
    const kitchenDetail = await openLine(user, "Kitchen");
    const pmc = within(kitchenDetail).getByRole("radio", { name: /^PMC/ });
    pmc.focus();
    await user.keyboard(" ");
    expect(pmc).toBeChecked();
    expect(within(kitchenDetail).getByRole("textbox", { name: "Calculation quantity (sq-ft)" })).toHaveValue("10.5");
    await user.click(within(kitchenDetail).getByRole("button", { name: "Save mode decision" }));
    expect(onSaveMode).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLineItemKey: "kitchen-mode", mode: "pmc", quantity: "10.5", expectedVersion: 0 }));

    const bedroomDetail = await openLine(user, "Bedroom");
    await user.click(within(bedroomDetail).getByRole("radio", { name: /^Execution/ }));
    expect(within(bedroomDetail).getByRole("radio", { name: /^Sub-vendor/ })).toBeVisible();
    expect(within(bedroomDetail).getByRole("radio", { name: /^In-house/ })).toBeVisible();
    expect(within(bedroomDetail).getByRole("button", { name: "Save mode decision" })).toBeDisabled();
    await user.click(within(bedroomDetail).getByRole("radio", { name: /^In-house/ }));
    expect(within(bedroomDetail).getByRole("textbox", { name: "Calculation quantity (sq-ft)" })).toHaveValue("4");
    await user.click(within(bedroomDetail).getByRole("button", { name: "Save mode decision" }));
    expect(onSaveMode).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLineItemKey: "bedroom-mode", mode: "in_house", quantity: "4" }));
    expect(pmc).toBeChecked();
  });

  it("explains unavailable choices and does not suggest an invalid precision quantity", async () => {
    const source = line("source-mode", "Kitchen", { quantity: "10.555", mode: configuredMode({
      options: [{ key: "in_house", label: "Execution / In-house" }],
      availability: [
        { key: "pmc", label: "PMC", available: false, issues: [{ code: "RATE_MISSING", message: "PMC base rate is missing." }] },
        { key: "sub_vendor", label: "Execution / Sub-vendor", available: false, issues: [{ code: "RATE_MISSING", message: "Sub-vendor base rate is missing." }] },
        { key: "in_house", label: "Execution / In-house", available: true, issues: [] }
      ]
    }) });
    renderTree([source], [], { canManage: true, frozen: false });
    const user = userEvent.setup();
    const detail = await openLine(user, "Kitchen");
    expect(within(detail).getByRole("radio", { name: /^PMC/ })).toBeDisabled();
    expect(within(detail).getByText(/PMC unavailable: PMC base rate is missing/)).toBeVisible();
    await user.click(within(detail).getByRole("radio", { name: /^Execution/ }));
    expect(within(detail).getByRole("radio", { name: /^Sub-vendor/ })).toBeDisabled();
    expect(within(detail).getByText(/Sub-vendor unavailable: Sub-vendor base rate is missing/)).toBeVisible();
    await user.click(within(detail).getByRole("radio", { name: /^In-house/ }));
    expect(within(detail).getByRole("textbox", { name: "Calculation quantity (sq-ft)" })).toHaveValue("");
  });

  it("shows the server's unsaved stage breakdown without relabeling sub-vendor cost as a floor or payable", async () => {
    const savedPreview = {
      formulaVersion: "v1", mode: "sub_vendor" as const, quantity: "10", quantityScale: 2,
      baseCostPaise: 100000, adjustedCostPaise: 105000, lowQuantityImpactPaise: 5000, sellingPaise: 113400,
      finalVendorChargesPaise: -5000, floorSellingPaise: 105000, marginBps: 2000, appliedImpactBps: 500,
      discountBps: 1000, discountAmountPaise: 12600, quantityRule: null, procurementQuantitySuggestion: null,
      settings: { scopes: [{ scope: "sub_vendor" as const, source: "scoped" as const, baseRatePaise: 10000,
        lowQuantityLimit: "10", impactBps: 500, minimumMarkupBps: 1000, startingMarkupBps: 2000 }],
      configuredMarginBps: 2000, markupBasis: "starting" as const }, components: []
    };
    const draftResult: PurchaseOrderModeDraftPreview = {
      projectId: "project-one", estimateSource: { estimateId: "estimate-one", estimateVersion: 1, estimateReviewRoundId: "round-one" },
      sourceLineItemKey: "source-mode", decisionVersion: 0, revision: { id: "revision-one", version: 3, status: "published", contentDigest: "digest-one" },
      uom: { id: "uom-one", code: "sq-ft", decimalScale: 2 }, preview: { ...savedPreview, mode: "pmc" }, issues: [],
      scopes: [{ scope: "pmc", baseRatePaise: 10000, baseSubtotalPaise: 100000, lowQuantityLimit: "10", configuredImpactBps: 500,
        thresholdMet: true, appliedImpactBps: 500, adjustedUnitRatePaise: 10500, adjustedCostPaise: 105000,
        lowQuantityImpactPaise: 5000, marginBps: 2000, marginAmountPaise: 21000, sellingBeforeDiscountPaise: 126000,
        discountBasisPaise: 126000, discountAmountPaise: 12600, floorSellingPaise: 105000, sellingPaise: 113400 }]
    };
    const source = line("source-mode", "Kitchen", { mode: configuredMode({ preview: savedPreview }) });
    const { container } = renderTree([source], [], { canManage: true, frozen: false },
      { draftPreviewByLine: { "source-mode": { status: "ready", result: draftResult } } });
    const user = userEvent.setup();
    const detail = await openLine(user, "Kitchen");
    expect(within(detail).getByText("Configured benchmark")).toBeVisible();
    expect(within(detail).queryByText("Minimum floor")).not.toBeInTheDocument();
    expect(within(detail).queryByText(/Sub-Vendor balance/)).not.toBeInTheDocument();
    await user.click(within(detail).getByRole("radio", { name: /^PMC/ }));
    expect(within(detail).getByText("Saved configured benchmark")).toBeVisible();
    expect(within(detail).getByText("This is the saved calculation. The changed mode or quantity has not been saved.")).toBeVisible();
    const calculation = within(detail).getByRole("region", { name: "Unsaved calculation preview for POP false ceiling" });
    expect(within(calculation).getByText("Base rate × quantity")).toBeVisible();
    expect(within(calculation).getByText("At or below 10 sq-ft · Met")).toBeVisible();
    expect(within(calculation).getByText("Calculated selling for this main line")).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("blocks a conflicted mode save but keeps the draft discard action", async () => {
    const source = line("source-mode", "Kitchen", { mode: configuredMode() });
    const { onSaveMode } = renderTree([source], [], { canManage: true, frozen: false },
      { modeConflictByLine: { "source-mode": "This decision changed in another session. Discard and review the latest preparation." } });
    const user = userEvent.setup();
    const detail = await openLine(user, "Kitchen");
    await user.click(within(detail).getByRole("radio", { name: /^PMC/ }));
    expect(within(detail).getByRole("alert")).toHaveTextContent("This decision changed in another session");
    expect(within(detail).getByRole("button", { name: "Save mode decision" })).toBeDisabled();
    await user.click(within(detail).getByRole("button", { name: "Discard changes" }));
    expect(within(detail).queryByRole("button", { name: "Discard changes" })).not.toBeInTheDocument();
    expect(onSaveMode).not.toHaveBeenCalled();
  });
});
