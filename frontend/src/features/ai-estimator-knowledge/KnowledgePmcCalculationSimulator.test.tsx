import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeModeCalculationEditor } from "./KnowledgeModeCalculationEditor";
import { KnowledgeModeCalculationSimulator } from "./KnowledgeModeCalculationSimulator";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { PMC_SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));
const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const pmcResult = { baseAmountPaise: 150_000, lowQuantityImpactAmountPaise: 15_000,
  revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 190_163,
  appliedImpactBps: 1_000, pmcMarginBps: 1_525, pmcMarginAmountPaise: 25_163, totalBeforeDiscountPaise: 190_163,
  finalVendorChargesPaise: 165_000 };
const discountedResult = { ...pmcResult, totalPaise: 185_884, finalVendorChargesPaise: 160_721,
  discount: { rateBps: 225, totalBeforeDiscountPaise: 190_163, amountPaise: 4_279 } };
function response(pmcCalculation: KnowledgePreview["pmcCalculation"] = pmcResult): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
    effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
    vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
    pmcMarkup: null, duration: null, pmcCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModeCalculationEditor>> = {}) {
  let props: ComponentProps<typeof KnowledgeModeCalculationEditor> = {
    scope: "pmc", contextLabel: "PMC", pmcMarginBps: 1_525,
    pmcMarginControl: <label>PMC Margin<input defaultValue="15.25" /></label>,
    value: settings, uom: { scopeKey: "pmc:first", id: "nos", label: "Nos", decimalScale: 0 },
    readOnly: false, validationAttempt: 0, issues: [], onChange: vi.fn(), onDirty: vi.fn(), onValidationChange: vi.fn(),
    ...overrides
  };
  const view = render(<KnowledgeModeCalculationEditor {...props} />);
  return { props, ...view, rerenderEditor(next: Partial<typeof props>) {
    props = { ...props, ...next }; view.rerender(<KnowledgeModeCalculationEditor {...props} />);
  } };
}
function field(name: string) {
  return within(screen.getByRole("dialog", { name: "Test calculations" })).getByRole("textbox", { name });
}
function change(name: string, value: string) { fireEvent.change(field(name), { target: { value } }); }
async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
  return screen.getByRole("dialog", { name: "Test calculations" });
}
async function calculate() { await userEvent.click(screen.getByRole("button", { name: "Calculate" })); }

describe("PMC calculation configuration and simulator", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("replaces only PMC's markup card and keeps editable configuration rates", async () => {
    const view = setup();
    const card = screen.getByRole("group", { name: "PMC Margin" });
    expect(within(card).getByRole("textbox", { name: "PMC Margin" })).toHaveValue("15.25");
    expect(screen.queryByText(/markup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/discount/i)).not.toBeInTheDocument();
    expect(screen.getByText(/configured Impact applies at or below the quantity limit/)).toBeVisible();
    const base = screen.getByRole("textbox", { name: "Base Rate (₹)" });
    expect(base).not.toHaveAttribute("readonly");
    fireEvent.change(base, { target: { value: "1800" } });
    expect(view.props.onChange).toHaveBeenLastCalledWith({ ...settings, baseRatePaise: 180_000 });
    view.rerenderEditor({ scope: "sub_vendor", contextLabel: "Sub-Vendor" });
    expect(screen.getByText("Gross margin markup")).toBeVisible();
    expect(screen.getByRole("status", { name: "Max Discount" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "PMC Margin" })).not.toBeInTheDocument();
  });

  it("locks configured inputs, leaves only Quantity and Discount editable, and uses the PMC request", async () => {
    const { props } = setup();
    const dialog = await open();
    expect(dialog.querySelector(".knowledge-mode-simulator--pmc")).not.toBeNull();
    for (const name of ["UOM", "Base Rate (₹)", "Low Quantity Limit", "Impact (%)", "PMC Margin (%)"]) {
      expect(field(name)).toHaveAttribute("readonly");
    }
    expect(within(dialog).getAllByRole("textbox").filter((element) => !(element as HTMLInputElement).readOnly)
      .map((element) => element.id)).toEqual([field("Quantity").id, field("Discount (%)").id]);
    expect(field("PMC Margin (%)")).toHaveValue("15.25");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/markup/i);
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0 });
    expect(within(dialog).getByLabelText("Base amount")).toHaveTextContent("₹1,500.00");
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent("+₹150.00");
    expect(within(dialog).queryByLabelText("Additional low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Total including low-quantity charges")).toHaveTextContent("₹1,650.00");
    expect(within(dialog).getByText("Low-quantity impact (10.00%)")).toBeVisible();
    expect(within(dialog).queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹251.63");
    expect(within(dialog).getByLabelText("Subtotal after PMC margin")).toHaveTextContent("₹1,901.63");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹0.00");
    expect(within(dialog).getByLabelText("Final vendor charges")).toHaveTextContent("₹1,650.00");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,901.63");
    expect(within(dialog).queryByLabelText("Effective PMC margin")).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows PMC margin separately and discounts the subtotal using the authoritative reconciled result", async () => {
    setup();
    const dialog = await open();
    expect(within(dialog).getByText(/Maximum allowed: 4.55%/)).toBeVisible();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 225 });
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹251.63");
    expect(within(dialog).getByText("PMC margin (15.25%)")).toBeVisible();
    expect(within(dialog).queryByLabelText("Effective PMC margin")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Discount applies to the subtotal after PMC margin/)).toBeVisible();
    expect(within(dialog).getByLabelText("Subtotal after PMC margin")).toHaveTextContent("₹1,901.63");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹42.79");
    expect(within(dialog).getByLabelText("Final vendor charges")).toHaveTextContent("₹1,607.21");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,858.84");
    change("Discount (%)", "4.56");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(PMC_SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    await waitFor(() => expect(field("Discount (%)")).toHaveFocus());
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([undefined, null, "15.25", 999, 2_001, 1_525.1])("requires a valid configured margin (%s), with no silent default", async (pmcMarginBps) => {
    setup({ pmcMarginBps });
    const dialog = await open();
    expect(field("PMC Margin (%)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText(/Close this simulator and set the PMC Margin/)).toBeVisible();
    await calculate();
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(dialog).not.toHaveTextContent(/markup/i);
  });

  it("does not parse or transmit obsolete hidden markup values in PMC", async () => {
    render(<KnowledgeModeCalculationSimulator scope="pmc" pmcMarginBps={1_525}
      initialDraft={{ baseRate: "1500", lowQuantityLimit: "15", impactRate: "10", minimumRate: "invalid", startingRate: "-3" }}
      uom={{ scopeKey: "pmc:legacy", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0 });
  });

  it.each([
    { quantity: "15.00", limit: "15", baseAmountPaise: 2_250_000, lowQuantityImpactAmountPaise: 225_000,
      revisedAmountPaise: 2_475_000, pmcMarginAmountPaise: 377_438, totalPaise: 2_852_438 },
    { quantity: "2.50", limit: "2.5", baseAmountPaise: 375_000, lowQuantityImpactAmountPaise: 37_500,
      revisedAmountPaise: 412_500, pmcMarginAmountPaise: 62_906, totalPaise: 475_406 }
  ])("applies the configured impact at the configured limit $limit", async (sample) => {
    setup({ value: { ...settings, lowQuantityLimit: sample.limit },
      uom: { scopeKey: "pmc:boundary", id: "sqft", label: "Sqft", decimalScale: 2 } });
    const dialog = await open();
    change("Quantity", sample.quantity);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult,
      baseAmountPaise: sample.baseAmountPaise, lowQuantityImpactAmountPaise: sample.lowQuantityImpactAmountPaise,
      revisedAmountPaise: sample.revisedAmountPaise, pmcMarginAmountPaise: sample.pmcMarginAmountPaise,
      totalBeforeDiscountPaise: sample.totalPaise, totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.revisedAmountPaise }));
    await calculate();
    expect(within(dialog).getByText("Low-quantity impact (10.00%)")).toBeVisible();
    expect(within(dialog).queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("10.00% low-quantity impact applied.")).toBeVisible();
    expect(within(dialog).getByLabelText("PMC margin amount")).toBeVisible();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    { quantity: "16", baseAmountPaise: 2_400_000, pmcMarginAmountPaise: 366_000, totalPaise: 2_766_000 }
  ])("hides the zero configured-impact row above the limit ($quantity)", async ({ quantity, baseAmountPaise, pmcMarginAmountPaise, totalPaise }) => {
    setup();
    const dialog = await open();
    change("Quantity", quantity);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult, baseAmountPaise,
      lowQuantityImpactAmountPaise: 0,
      appliedImpactBps: 0, revisedUnitRatePaise: 150_000, revisedAmountPaise: baseAmountPaise,
      pmcMarginAmountPaise, totalBeforeDiscountPaise: totalPaise, totalPaise, finalVendorChargesPaise: baseAmountPaise }));
    await calculate();
    expect(within(dialog).queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Low-quantity impact (0.00%)")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("No low-quantity impact applied.")).toBeVisible();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("applies no low-quantity charge when the configured Impact is explicitly zero", async () => {
    setup({ value: { ...settings, impactBps: 0 } });
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult, lowQuantityImpactAmountPaise: 0,
      appliedImpactBps: 0, revisedUnitRatePaise: 150_000, revisedAmountPaise: 150_000,
      pmcMarginAmountPaise: 22_875, totalBeforeDiscountPaise: 172_875, totalPaise: 172_875, finalVendorChargesPaise: 150_000 }));
    await calculate();
    expect(field("Impact (%)")).toHaveValue("0");
    expect(within(dialog).queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Additional low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹228.75");
  });

  it("renders a zero-quantity result with no phantom charges", async () => {
    setup();
    const dialog = await open();
    change("Quantity", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult, baseAmountPaise: 0,
      lowQuantityImpactAmountPaise: 0, revisedAmountPaise: 0,
      pmcMarginAmountPaise: 0, totalBeforeDiscountPaise: 0, totalPaise: 0, finalVendorChargesPaise: 0 }));
    await calculate();
    const result = within(dialog).getByRole("status", { name: "Calculation results" });
    for (const output of result.querySelectorAll("output")) expect(output).toHaveTextContent("₹0.00");
  });

  it.each([
    { baseRatePaise: 12_345, quantity: "2.5", impactBps: 1_250, baseAmountPaise: 30_863,
      lowQuantityImpactAmountPaise: 3_857,
      revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, pmcMarginAmountPaise: 5_295,
      totalBeforeDiscountPaise: 40_015, discountAmountPaise: 1_821, finalVendorChargesPaise: 32_899, totalPaise: 38_194,
      expectedImpact: "+₹38.57", expectedVendor: "₹328.99", expectedTotal: "₹381.94" },
    { baseRatePaise: 997, quantity: "0.25", impactBps: 1_000, baseAmountPaise: 249,
      lowQuantityImpactAmountPaise: 25,
      revisedUnitRatePaise: 1_097, revisedAmountPaise: 274, pmcMarginAmountPaise: 42,
      totalBeforeDiscountPaise: 316, discountAmountPaise: 14, finalVendorChargesPaise: 260, totalPaise: 302,
      expectedImpact: "+₹0.25", expectedVendor: "₹2.60", expectedTotal: "₹3.02" }
  ])("preserves backend rounded stages for fractional quantity $quantity", async (sample) => {
    setup({ value: { ...settings, baseRatePaise: sample.baseRatePaise, lowQuantityLimit: "3", impactBps: sample.impactBps },
      uom: { scopeKey: "pmc:fractional", id: "sqft", label: "Sqft", decimalScale: 2 } });
    const dialog = await open();
    change("Quantity", sample.quantity);
    change("Discount (%)", "4.55");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult,
      baseAmountPaise: sample.baseAmountPaise, lowQuantityImpactAmountPaise: sample.lowQuantityImpactAmountPaise,
      appliedImpactBps: sample.impactBps, revisedUnitRatePaise: sample.revisedUnitRatePaise,
      revisedAmountPaise: sample.revisedAmountPaise, pmcMarginAmountPaise: sample.pmcMarginAmountPaise,
      totalBeforeDiscountPaise: sample.totalBeforeDiscountPaise, finalVendorChargesPaise: sample.finalVendorChargesPaise,
      totalPaise: sample.totalPaise, discount: { rateBps: 455, totalBeforeDiscountPaise: sample.totalBeforeDiscountPaise, amountPaise: sample.discountAmountPaise } }));
    await calculate();
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent(sample.expectedImpact);
    expect(within(dialog).getByLabelText("Final vendor charges")).toHaveTextContent(sample.expectedVendor);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
  });

  it("rejects an unsafe configured Impact before making a request", async () => {
    render(<KnowledgeModeCalculationSimulator scope="pmc" pmcMarginBps={1_525}
      initialDraft={{ baseRate: "1500", lowQuantityLimit: "15", impactRate: "90071992547309.92", minimumRate: "25", startingRate: "35" }}
      uom={{ scopeKey: "pmc:overflow", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    await calculate();
    expect(field("Impact (%)")).toHaveAttribute("aria-invalid", "true");
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("rejects an old response that still adds the additional 5% charge", async () => {
    setup();
    const dialog = await open();
    const legacy = { ...pmcResult, additionalLowQuantityImpactBps: 500, additionalLowQuantityImpactAmountPaise: 7_500,
      revisedUnitRatePaise: 172_500, revisedAmountPaise: 172_500, appliedImpactBps: 1_500,
      pmcMarginAmountPaise: 26_306, totalBeforeDiscountPaise: 198_806, finalVendorChargesPaise: 172_500, totalPaise: 198_806 };
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(legacy));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { ...discountedResult, pmcMarginBps: 1_500 },
    { ...discountedResult, discount: undefined },
    { ...discountedResult, discount: { ...discountedResult.discount, rateBps: 200 } }
  ])("rejects an inconsistent PMC response %#", async (serverResult) => {
    setup();
    const dialog = await open();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("different PMC margin or discount");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { ...discountedResult, pmcMarginAmountPaise: undefined },
    { ...discountedResult, baseAmountPaise: undefined },
    { ...discountedResult, lowQuantityImpactAmountPaise: undefined },
    { ...discountedResult, finalVendorChargesPaise: undefined },
    { ...discountedResult, baseAmountPaise: 150_001 },
    { ...discountedResult, finalVendorChargesPaise: 168_028 },
    { ...discountedResult, appliedImpactBps: 1_500 },
    { ...discountedResult, appliedImpactBps: 0 },
    { ...discountedResult, totalBeforeDiscountPaise: undefined },
    { ...discountedResult, pmcMarginAmountPaise: -1 },
    { ...discountedResult, pmcMarginAmountPaise: 25_163.5 },
    { ...discountedResult, totalBeforeDiscountPaise: Number.MAX_SAFE_INTEGER + 1 },
    { ...discountedResult, pmcMarginAmountPaise: 25_000 },
    { ...discountedResult, totalPaise: 185_000 },
    { ...discountedResult, discount: { ...discountedResult.discount, totalBeforeDiscountPaise: 190_000 } },
    { ...discountedResult, discount: { ...discountedResult.discount, amountPaise: undefined }, totalPaise: 190_163 },
    { ...discountedResult, discount: { ...discountedResult.discount, amountPaise: -1 } }
  ])("rejects missing, unsafe, or unreconciled amounts from an old or invalid server response %#", async (serverResult) => {
    setup();
    const dialog = await open();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult as NonNullable<KnowledgePreview["pmcCalculation"]>));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects an old percentage-point response and allows retry after a rounded-limit rejection", async () => {
    setup();
    const dialog = await open();
    const legacy = { revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 186_450,
      appliedImpactBps: 1_000, pmcMarginBps: 1_525, effectiveMarginBps: 1_300,
      discount: { rateBps: 225, effectiveMarginBps: 1_300, totalBeforeDiscountPaise: 190_163, amountPaise: 3_713 } };
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(legacy as unknown as NonNullable<KnowledgePreview["pmcCalculation"]>));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    change("Discount (%)", "4.55");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Reduce the discount to keep the rounded total above the minimum."));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Reduce the discount");
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await calculate();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,858.84");
  });

  it("rejects an unexpected discount or missing PMC response", async () => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("different PMC margin or discount");
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), pmcCalculation: undefined });
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return a PMC calculation");
  });

  it("keeps the opening configuration snapshot, resets tests on reopen, and ignores stale responses", async () => {
    const view = setup();
    const dialog = await open();
    view.rerenderEditor({ pmcMarginBps: 1_800 });
    expect(field("PMC Margin (%)")).toHaveValue("15.25");
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await calculate();
    change("Quantity", "2");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await calculate();
    change("Discount (%)", "2.25");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await open();
    expect(field("PMC Margin (%)")).toHaveValue("18.00");
    expect(field("Quantity")).toHaveValue("1");
    expect(field("Discount (%)")).toHaveValue("0");
    expect(view.props.onChange).not.toHaveBeenCalled();
  });
});
