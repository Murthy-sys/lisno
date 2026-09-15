import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeModeCalculationEditor } from "./KnowledgeModeCalculationEditor";
import { KnowledgeModeCalculationSimulator } from "./KnowledgeModeCalculationSimulator";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));
const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const pmcResult = { baseAmountPaise: 150_000, lowQuantityImpactAmountPaise: 15_000,
  revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 194_690,
  appliedImpactBps: 1_000, pmcMarginBps: 1_525, pmcMarginAmountPaise: 29_690, totalBeforeDiscountPaise: 194_690,
  finalVendorChargesPaise: 165_000 };
const discountedResult = { ...pmcResult, totalPaise: 190_309, finalVendorChargesPaise: 160_619,
  discount: { rateBps: 225, totalBeforeDiscountPaise: 194_690, amountPaise: 4_381 } };
function response(pmcCalculation: KnowledgePreview["pmcCalculation"] = pmcResult): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
    effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
    vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
    pmcMarkup: null, duration: null, pmcCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModeCalculationEditor>> = {}) {
  let props: ComponentProps<typeof KnowledgeModeCalculationEditor> = {
    scope: "pmc", contextLabel: "PMC", pmcMarginBps: 1_525,
    marginControl: <label>PMC Margin<input defaultValue="15.25" /></label>,
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
async function settleCalculation() {
  await waitFor(() => expect(screen.queryByText("Updating calculation…")).not.toBeInTheDocument());
}
const automaticRequestOptions = { signal: expect.any(AbortSignal), showGlobalLoader: false };
afterEach(() => { vi.useRealTimers(); });

function expectNoVendorSummary(dialog: HTMLElement) {
  expect(within(dialog).queryByLabelText(/^(Final vendor charges|Balance after margin)$/)).not.toBeInTheDocument();
  expect(dialog).not.toHaveTextContent(/Final vendor charges|Balance after margin|The discount exceeds the amount excluding|negative balance plus|Vendor charges \+/i);
}

describe("PMC calculation configuration and simulator", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("automatically opens at 300 ms, debounces rapid edits and preserves focus without duplicate Enter requests", async () => {
    vi.useFakeTimers();
    const { props, rerenderEditor } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    const dialog = screen.getByRole("dialog", { name: "Test calculations" });
    const advance = async (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
    expect(within(dialog).queryByRole("button", { name: "Calculate" })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Calculations update automatically.");
    expect(within(dialog).getByText("Updating calculation…")).toBeVisible();
    await advance(299);
    expect(previewKnowledge).not.toHaveBeenCalled();
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledOnce();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,946.90");
    field("Quantity").focus();
    change("Quantity", "2");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    await advance(150);
    change("Quantity", "3");
    await advance(299);
    expect(previewKnowledge).toHaveBeenCalledOnce();
    change("Quantity", "1");
    await advance(299);
    expect(previewKnowledge).toHaveBeenCalledOnce();
    expect(field("Quantity")).toHaveFocus();
    expect(fireEvent.submit(dialog.querySelector("form")!)).toBe(false);
    expect(previewKnowledge).toHaveBeenCalledOnce();
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "1", quantityScale: 0,
      pmcCalculation: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525 } }, automaticRequestOptions);
    expect(field("Quantity")).toHaveFocus();
    rerenderEditor({ issues: [] });
    await advance(1_000);
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    change("Quantity", "2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await advance(300);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("keeps loading local, aborts old work, and retries only a current failure with unchanged inputs", async () => {
    vi.useFakeTimers();
    let failOld!: (failure: Error) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((_resolve, reject) => { failOld = reject; }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    const dialog = screen.getByRole("dialog", { name: "Test calculations" });
    const advance = async (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
    await advance(300);
    expect(within(dialog).getByText("Calculating…")).toBeVisible();
    expect(field("Quantity")).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeEnabled();
    const oldSignal = vi.mocked(previewKnowledge).mock.calls[0]![1]!.signal!;
    expect(oldSignal.aborted).toBe(false);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    field("Discount (%)").focus();
    change("Discount (%)", "2.25");
    expect(oldSignal.aborted).toBe(true);
    await advance(300);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,903.09");
    await act(async () => { failOld(new Error("Obsolete failure")); });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,903.09");
    expect(field("Discount (%)")).toHaveFocus();
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Current preview failed"));
    change("Quantity", "1.00");
    await advance(300);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Current preview failed");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    await advance(2_000);
    expect(previewKnowledge).toHaveBeenCalledTimes(3);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry calculation" }));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await advance(299);
    expect(previewKnowledge).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledTimes(4);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 225,
      pmcCalculation: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525 } }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,903.09");
  });

  it("replaces PMC's markup card and keeps In-house markups and editable configuration rates", async () => {
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
    view.rerenderEditor({ scope: "in_house_labor", contextLabel: "Labor" });
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
    expect(within(dialog).getAllByRole("textbox", { name: /PMC Margin/ })).toHaveLength(1);
    expect(within(dialog).queryByRole("textbox", { name: /Min\.|Max\./ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/markup/i);
    expect(within(dialog).getByText(/Selling price = adjusted cost ÷ \(1 − PMC margin %\)/)).toHaveTextContent(
      "Adjusted cost includes any low-quantity impact. Discount applies afterward.");
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0 }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("Base amount")).toHaveTextContent("₹1,500.00");
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent("+₹150.00");
    expect(within(dialog).queryByLabelText("Additional low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Total including low-quantity charges")).toHaveTextContent("₹1,650.00");
    expect(within(dialog).getByText("Low-quantity impact (10.00%)")).toBeVisible();
    expect(within(dialog).queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹296.90");
    expect(within(dialog).getByLabelText("Subtotal after PMC margin")).toHaveTextContent("₹1,946.90");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹0.00");
    expectNoVendorSummary(dialog);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,946.90");
    expect(within(dialog).queryByLabelText("Effective PMC margin")).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows PMC margin separately and discounts the subtotal using the authoritative reconciled result", async () => {
    setup();
    const dialog = await open();
    expect(field("Discount (%)")).toHaveAccessibleDescription("Discount applies to the subtotal after PMC margin. Enter your custom percentage.");
    expect(within(dialog).queryByText(/Maximum allowed|discount allowance|retain at least 10%/)).not.toBeInTheDocument();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 225 }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹296.90");
    expect(within(dialog).getByText("PMC margin (15.25%)")).toBeVisible();
    expect(within(dialog).queryByLabelText("Effective PMC margin")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Discount applies to the subtotal after PMC margin/)).toBeVisible();
    expect(within(dialog).getByLabelText("Subtotal after PMC margin")).toHaveTextContent("₹1,946.90");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹43.81");
    expectNoVendorSummary(dialog);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,903.09");
    field("Quantity").focus();
    change("Discount (%)", "100.01");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(field("Quantity")).toHaveFocus();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { name: "₹220 at 20%", baseRatePaise: 20_000, impactBps: 1_000, impactAmountPaise: 2_000,
      revisedAmountPaise: 22_000, pmcMarginBps: 2_000, marginAmountPaise: 5_500, subtotalPaise: 27_500,
      discountBps: 0, discountAmountPaise: 0, totalPaise: 27_500, balancePaise: 22_000,
      expectedMargin: "+₹55.00", expectedSubtotal: "₹275.00", expectedDiscount: "−₹0.00", expectedTotal: "₹275.00" },
    { name: "₹220 at 15%", baseRatePaise: 20_000, impactBps: 1_000, impactAmountPaise: 2_000,
      revisedAmountPaise: 22_000, pmcMarginBps: 1_500, marginAmountPaise: 3_882, subtotalPaise: 25_882,
      discountBps: 0, discountAmountPaise: 0, totalPaise: 25_882, balancePaise: 22_000,
      expectedMargin: "+₹38.82", expectedSubtotal: "₹258.82", expectedDiscount: "−₹0.00", expectedTotal: "₹258.82" },
    { name: "₹220 at 20% with 10% discount", baseRatePaise: 20_000, impactBps: 1_000, impactAmountPaise: 2_000,
      revisedAmountPaise: 22_000, pmcMarginBps: 2_000, marginAmountPaise: 5_500, subtotalPaise: 27_500,
      discountBps: 1_000, discountAmountPaise: 2_750, totalPaise: 24_750, balancePaise: 19_250,
      expectedMargin: "+₹55.00", expectedSubtotal: "₹275.00", expectedDiscount: "−₹27.50", expectedTotal: "₹247.50" },
    { name: "₹200 at 10%", baseRatePaise: 20_000, impactBps: 0, impactAmountPaise: 0,
      revisedAmountPaise: 20_000, pmcMarginBps: 1_000, marginAmountPaise: 2_222, subtotalPaise: 22_222,
      discountBps: 0, discountAmountPaise: 0, totalPaise: 22_222, balancePaise: 20_000,
      expectedMargin: "+₹22.22", expectedSubtotal: "₹222.22", expectedDiscount: "−₹0.00", expectedTotal: "₹222.22" },
    { name: "₹220 at 20% with 100% discount", baseRatePaise: 20_000, impactBps: 1_000, impactAmountPaise: 2_000,
      revisedAmountPaise: 22_000, pmcMarginBps: 2_000, marginAmountPaise: 5_500, subtotalPaise: 27_500,
      discountBps: 10_000, discountAmountPaise: 27_500, totalPaise: 0, balancePaise: -5_500,
      expectedMargin: "+₹55.00", expectedSubtotal: "₹275.00", expectedDiscount: "−₹275.00", expectedTotal: "₹0.00" },
    { name: "half-paise tie at ₹0.02 and 20%", baseRatePaise: 2, impactBps: 0, impactAmountPaise: 0,
      revisedAmountPaise: 2, pmcMarginBps: 2_000, marginAmountPaise: 1, subtotalPaise: 3,
      discountBps: 0, discountAmountPaise: 0, totalPaise: 3, balancePaise: 2,
      expectedMargin: "+₹0.01", expectedSubtotal: "₹0.03", expectedDiscount: "−₹0.00", expectedTotal: "₹0.03" },
    { name: "zero cost", baseRatePaise: 0, impactBps: 0, impactAmountPaise: 0,
      revisedAmountPaise: 0, pmcMarginBps: 2_000, marginAmountPaise: 0, subtotalPaise: 0,
      discountBps: 0, discountAmountPaise: 0, totalPaise: 0, balancePaise: 0,
      expectedMargin: "+₹0.00", expectedSubtotal: "₹0.00", expectedDiscount: "−₹0.00", expectedTotal: "₹0.00" }
  ])("displays the approved selling-price result for $name and only Final total", async sample => {
    const { props } = setup({ pmcMarginBps: sample.pmcMarginBps,
      value: { ...settings, baseRatePaise: sample.baseRatePaise, impactBps: sample.impactBps } });
    const dialog = await open();
    if (sample.discountBps) change("Discount (%)", String(sample.discountBps / 100));
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({
      baseAmountPaise: sample.baseRatePaise, lowQuantityImpactAmountPaise: sample.impactAmountPaise,
      revisedUnitRatePaise: sample.revisedAmountPaise, revisedAmountPaise: sample.revisedAmountPaise,
      appliedImpactBps: sample.impactBps, pmcMarginBps: sample.pmcMarginBps, pmcMarginAmountPaise: sample.marginAmountPaise,
      totalBeforeDiscountPaise: sample.subtotalPaise, totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.balancePaise,
      ...(sample.discountBps ? { discount: { rateBps: sample.discountBps, totalBeforeDiscountPaise: sample.subtotalPaise, amountPaise: sample.discountAmountPaise } } : {})
    }));
    await settleCalculation();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent(sample.expectedMargin);
    expect(within(dialog).getByLabelText("Subtotal after PMC margin")).toHaveTextContent(sample.expectedSubtotal);
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent(sample.expectedDiscount);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
    expectNoVendorSummary(dialog);
    expect(within(dialog).queryByRole("button", { name: "Calculate" })).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it.each([
    { percentage: "20", rateBps: 2_000, discountAmountPaise: 22_222, totalPaise: 88_889, finalVendorChargesPaise: 77_778, expectedDiscount: "−₹222.22", expectedTotal: "₹888.89" },
    { percentage: "50", rateBps: 5_000, discountAmountPaise: 55_556, totalPaise: 55_555, finalVendorChargesPaise: 44_444, expectedDiscount: "−₹555.56", expectedTotal: "₹555.55" },
    { percentage: "95", rateBps: 9_500, discountAmountPaise: 105_555, totalPaise: 5_556, finalVendorChargesPaise: -5_555, expectedDiscount: "−₹1,055.55", expectedTotal: "₹55.56" },
    { percentage: "100", rateBps: 10_000, discountAmountPaise: 111_111, totalPaise: 0, finalVendorChargesPaise: -11_111, expectedDiscount: "−₹1,111.11", expectedTotal: "₹0.00" }
  ])("accepts a typed $percentage% custom discount even at the minimum PMC margin", async (sample) => {
    const user = userEvent.setup();
    const { props } = setup({ pmcMarginBps: 1_000, value: { ...settings, baseRatePaise: 100_000, impactBps: 0 } });
    const dialog = await open();
    const discount = field("Discount (%)");
    expect(discount).toBeEnabled();
    expect(discount).not.toHaveAttribute("readonly");
    await user.clear(discount);
    await user.type(discount, sample.percentage);
    expect(discount).toHaveValue(sample.percentage);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 100_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 100_000, revisedAmountPaise: 100_000, appliedImpactBps: 0,
      pmcMarginBps: 1_000, pmcMarginAmountPaise: 11_111, totalBeforeDiscountPaise: 111_111,
      totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.finalVendorChargesPaise,
      discount: { rateBps: sample.rateBps, totalBeforeDiscountPaise: 111_111, amountPaise: sample.discountAmountPaise } }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: { baseRatePaise: 100_000,
      lowQuantityLimit: "15", impactBps: 0, pmcMarginBps: 1_000 }, quantity: "1", quantityScale: 0,
      modeCalculationDiscountBps: sample.rateBps }, automaticRequestOptions);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹111.11");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent(sample.expectedDiscount);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
    expectNoVendorSummary(dialog);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("accepts independently rounded amounts below the former ten-percent floor", async () => {
    setup({ pmcMarginBps: 1_003, value: { ...settings, baseRatePaise: 2_275, lowQuantityLimit: "0" } });
    const dialog = await open();
    change("Discount (%)", "0.02");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 2_275, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 2_275, revisedAmountPaise: 2_275, appliedImpactBps: 0,
      pmcMarginBps: 1_003, pmcMarginAmountPaise: 254, totalBeforeDiscountPaise: 2_529,
      totalPaise: 2_528, finalVendorChargesPaise: 2_274,
      discount: { rateBps: 2, totalBeforeDiscountPaise: 2_529, amountPaise: 1 } }));
    await settleCalculation();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹0.01");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹25.28");
  });

  it.each(["", "-1", "20.001", "20.", "invalid", "100.01"])("preserves invalid custom discount %j and prevents a request", async (value) => {
    setup({ pmcMarginBps: 1_000 });
    const dialog = await open();
    change("Discount (%)", value);
    await settleCalculation();
    expect(field("Discount (%)")).toHaveValue(value);
    expect(field("Discount (%)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("alert")).toBeVisible();
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "15.25", 999, 2_001, 1_525.1])("requires a valid configured margin (%s), with no silent default", async (pmcMarginBps) => {
    setup({ pmcMarginBps });
    const dialog = await open();
    expect(field("PMC Margin (%)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText(/Close this simulator and set the PMC Margin/)).toBeVisible();
    await settleCalculation();
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(dialog).not.toHaveTextContent(/markup/i);
  });

  it("does not parse or transmit obsolete hidden markup values in PMC", async () => {
    render(<KnowledgeModeCalculationSimulator scope="pmc" pmcMarginBps={1_525}
      initialDraft={{ baseRate: "1500", lowQuantityLimit: "15", impactRate: "10", minimumRate: "invalid", startingRate: "-3" }}
      uom={{ scopeKey: "pmc:legacy", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ pmcCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_525
    }, quantity: "1", quantityScale: 0 }, automaticRequestOptions);
  });

  it.each([
    { quantity: "15.00", limit: "15", baseAmountPaise: 2_250_000, lowQuantityImpactAmountPaise: 225_000,
      revisedAmountPaise: 2_475_000, pmcMarginAmountPaise: 445_354, totalPaise: 2_920_354 },
    { quantity: "2.50", limit: "2.5", baseAmountPaise: 375_000, lowQuantityImpactAmountPaise: 37_500,
      revisedAmountPaise: 412_500, pmcMarginAmountPaise: 74_226, totalPaise: 486_726 }
  ])("applies the configured impact at the configured limit $limit", async (sample) => {
    setup({ value: { ...settings, lowQuantityLimit: sample.limit },
      uom: { scopeKey: "pmc:boundary", id: "sqft", label: "Sqft", decimalScale: 2 } });
    const dialog = await open();
    change("Quantity", sample.quantity);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult,
      baseAmountPaise: sample.baseAmountPaise, lowQuantityImpactAmountPaise: sample.lowQuantityImpactAmountPaise,
      revisedAmountPaise: sample.revisedAmountPaise, pmcMarginAmountPaise: sample.pmcMarginAmountPaise,
      totalBeforeDiscountPaise: sample.totalPaise, totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.revisedAmountPaise }));
    await settleCalculation();
    expect(within(dialog).getByText("Low-quantity impact (10.00%)")).toBeVisible();
    expect(within(dialog).queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("10.00% low-quantity impact applied.")).toBeVisible();
    expect(within(dialog).getByLabelText("PMC margin amount")).toBeVisible();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    { quantity: "16", baseAmountPaise: 2_400_000, pmcMarginAmountPaise: 431_858, totalPaise: 2_831_858 }
  ])("hides the zero configured-impact row above the limit ($quantity)", async ({ quantity, baseAmountPaise, pmcMarginAmountPaise, totalPaise }) => {
    setup();
    const dialog = await open();
    change("Quantity", quantity);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult, baseAmountPaise,
      lowQuantityImpactAmountPaise: 0,
      appliedImpactBps: 0, revisedUnitRatePaise: 150_000, revisedAmountPaise: baseAmountPaise,
      pmcMarginAmountPaise, totalBeforeDiscountPaise: totalPaise, totalPaise, finalVendorChargesPaise: baseAmountPaise }));
    await settleCalculation();
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
      pmcMarginAmountPaise: 26_991, totalBeforeDiscountPaise: 176_991, totalPaise: 176_991, finalVendorChargesPaise: 150_000 }));
    await settleCalculation();
    expect(field("Impact (%)")).toHaveValue("0");
    expect(within(dialog).queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Additional low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("PMC margin amount")).toHaveTextContent("+₹269.91");
  });

  it("renders a zero-quantity result with no phantom charges", async () => {
    setup();
    const dialog = await open();
    change("Quantity", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult, baseAmountPaise: 0,
      lowQuantityImpactAmountPaise: 0, revisedAmountPaise: 0,
      pmcMarginAmountPaise: 0, totalBeforeDiscountPaise: 0, totalPaise: 0, finalVendorChargesPaise: 0 }));
    await settleCalculation();
    const result = within(dialog).getByRole("status", { name: "Calculation results" });
    for (const output of result.querySelectorAll("output")) expect(output).toHaveTextContent("₹0.00");
  });

  it.each([
    { baseRatePaise: 12_345, quantity: "2.5", impactBps: 1_250, baseAmountPaise: 30_863,
      lowQuantityImpactAmountPaise: 3_857,
      revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, pmcMarginAmountPaise: 6_248,
      totalBeforeDiscountPaise: 40_968, discountAmountPaise: 1_864, finalVendorChargesPaise: 32_856, totalPaise: 39_104,
      expectedImpact: "+₹38.57", expectedTotal: "₹391.04" },
    { baseRatePaise: 997, quantity: "0.25", impactBps: 1_000, baseAmountPaise: 249,
      lowQuantityImpactAmountPaise: 25,
      revisedUnitRatePaise: 1_097, revisedAmountPaise: 274, pmcMarginAmountPaise: 49,
      totalBeforeDiscountPaise: 323, discountAmountPaise: 15, finalVendorChargesPaise: 259, totalPaise: 308,
      expectedImpact: "+₹0.25", expectedTotal: "₹3.08" }
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
    await settleCalculation();
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent(sample.expectedImpact);
    expectNoVendorSummary(dialog);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
  });

  it("rejects an unsafe configured Impact before making a request", async () => {
    render(<KnowledgeModeCalculationSimulator scope="pmc" pmcMarginBps={1_525}
      initialDraft={{ baseRate: "1500", lowQuantityLimit: "15", impactRate: "90071992547309.92", minimumRate: "25", startingRate: "35" }}
      uom={{ scopeKey: "pmc:overflow", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    await settleCalculation();
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
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects the previous additive PMC formula even when every amount reconciles", async () => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...pmcResult,
      pmcMarginAmountPaise: 25_163, totalBeforeDiscountPaise: 190_163, totalPaise: 190_163,
      finalVendorChargesPaise: 165_000
    }));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { totalPaise: 190_977, finalVendorChargesPaise: 161_287, discountAmountPaise: 3_713 },
    { totalPaise: 190_310, finalVendorChargesPaise: 160_620, discountAmountPaise: 4_380 }
  ])("rejects reconciled discount amounts using cost or incorrect rounding %#", async sample => {
    setup();
    const dialog = await open();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...discountedResult,
      totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.finalVendorChargesPaise,
      discount: { rateBps: 225, totalBeforeDiscountPaise: 194_690, amountPaise: sample.discountAmountPaise }
    }));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { ...discountedResult, pmcMarginBps: 1_500 },
    { ...discountedResult, discount: undefined },
    { ...discountedResult, discount: { ...discountedResult.discount, rateBps: 200 } },
    { ...discountedResult, discount: { ...discountedResult.discount, rateBps: 10_001 } }
  ])("rejects an inconsistent PMC response %#", async (serverResult) => {
    setup();
    const dialog = await open();
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult));
    await settleCalculation();
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
    { ...discountedResult, totalPaise: -1 },
    { ...discountedResult, revisedAmountPaise: -1 },
    { ...discountedResult, finalVendorChargesPaise: -1 },
    { ...discountedResult, finalVendorChargesPaise: Number.MIN_SAFE_INTEGER - 1 },
    { ...discountedResult, finalVendorChargesPaise: 160_721.5 },
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
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects an old percentage-point response and allows retry after a server failure", async () => {
    setup();
    const dialog = await open();
    const legacy = { revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 186_450,
      appliedImpactBps: 1_000, pmcMarginBps: 1_525, effectiveMarginBps: 1_300,
      discount: { rateBps: 225, effectiveMarginBps: 1_300, totalBeforeDiscountPaise: 190_163, amountPaise: 3_713 } };
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(legacy as unknown as NonNullable<KnowledgePreview["pmcCalculation"]>));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent PMC breakdown");
    change("Discount (%)", "4.55");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Calculation service is temporarily unavailable."));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Calculation service is temporarily unavailable.");
    change("Discount (%)", "2.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await settleCalculation();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹1,903.09");
  });

  it("rejects an unexpected discount or missing PMC response", async () => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(discountedResult));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("different PMC margin or discount");
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), pmcCalculation: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Retry calculation" }));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return a PMC calculation");
  });

  it("keeps the opening configuration snapshot, resets tests on reopen, and ignores stale responses", async () => {
    const view = setup();
    const dialog = await open();
    view.rerenderEditor({ pmcMarginBps: 1_800 });
    expect(field("PMC Margin (%)")).toHaveValue("15.25");
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await settleCalculation();
    change("Quantity", "2");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await settleCalculation();
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
