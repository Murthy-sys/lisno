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

const settings = { baseRatePaise: 12_345, lowQuantityLimit: "2.5", impactBps: 1_250, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const subVendorResult = { baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
  revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
  subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 6_127, totalBeforeDiscountPaise: 40_847,
  finalVendorChargesPaise: 32_861, totalPaise: 38_988,
  discount: { rateBps: 455, totalBeforeDiscountPaise: 40_847, amountPaise: 1_859 } };
function response(subVendorCalculation: KnowledgePreview["subVendorCalculation"] = subVendorResult): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
    effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "2.5", procurementQuantity: null,
    vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
    pmcMarkup: null, duration: null, subVendorCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModeCalculationEditor>> = {}) {
  let props: ComponentProps<typeof KnowledgeModeCalculationEditor> = {
    scope: "sub_vendor", contextLabel: "Sub-Vendor", subVendorMarginBps: 1_500, pmcMarginBps: 1_800,
    marginControl: <label>Lisno Margin<input defaultValue="15.00" /></label>,
    value: settings, uom: { scopeKey: "sub-vendor:first", id: "sqft", label: "Sqft", decimalScale: 2 },
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
  change("Quantity", "2.5");
  change("Discount (%)", "4.55");
  return screen.getByRole("dialog", { name: "Test calculations" });
}
async function settleCalculation() {
  await waitFor(() => expect(screen.queryByText("Updating calculation…")).not.toBeInTheDocument());
}
const automaticRequestOptions = { signal: expect.any(AbortSignal), showGlobalLoader: false };
afterEach(() => { vi.useRealTimers(); });

function expectNoVendorSummary(dialog: HTMLElement) {
  expect(within(dialog).queryByLabelText(/^(Final vendor charges|Balance after margin)$/)).not.toBeInTheDocument();
  expect(within(dialog).queryAllByText(/Final vendor charges|Balance after margin|The discount exceeds the amount excluding/)).toHaveLength(0);
}

describe("Lisno margin calculation", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("automatically previews Max., aborts on Min. selection, and pauses invalid input without moving focus", async () => {
    vi.useFakeTimers();
    let finishMaximum!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finishMaximum = resolve; }));
    const { props } = setup({ subVendorMinimumMarginBps: 1_000, subVendorMarginBps: 3_500,
      value: { ...settings, baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    const dialog = screen.getByRole("dialog", { name: "Test calculations" });
    const advance = async (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
    expect(within(dialog).queryByRole("button", { name: "Calculate" })).not.toBeInTheDocument();
    await advance(300);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "1", quantityScale: 2,
      subVendorCalculation: { baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0, subVendorMarginBps: 3_500 } }, automaticRequestOptions);
    const maximumSignal = vi.mocked(previewKnowledge).mock.calls[0]![1]!.signal!;
    const minimum = within(dialog).getByRole("radio", { name: "Min. Lisno Margin" });
    const minimumResult = response({ baseAmountPaise: 20_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 20_000, revisedAmountPaise: 20_000, appliedImpactBps: 0,
      subVendorMarginBps: 1_000, subVendorMarginAmountPaise: 2_222,
      totalBeforeDiscountPaise: 22_222, totalPaise: 22_222, finalVendorChargesPaise: 20_000 });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(minimumResult);
    act(() => minimum.focus());
    fireEvent.click(minimum);
    expect(maximumSignal.aborted).toBe(true);
    await advance(300);
    expect(minimum).toHaveFocus();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹222.22");
    expect(within(dialog).getByText("Calculated with Min. Lisno Margin.")).toBeVisible();
    await act(async () => { finishMaximum(response({ baseAmountPaise: 20_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 20_000, revisedAmountPaise: 20_000, appliedImpactBps: 0,
      subVendorMarginBps: 3_500, subVendorMarginAmountPaise: 10_769,
      totalBeforeDiscountPaise: 30_769, totalPaise: 30_769, finalVendorChargesPaise: 20_000 })); });
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹222.22");
    field("Quantity").focus();
    change("Quantity", "");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(field("Quantity")).not.toHaveAttribute("aria-invalid");
    await advance(299);
    expect(field("Quantity")).not.toHaveAttribute("aria-invalid");
    await advance(1);
    expect(field("Quantity")).toHaveAttribute("aria-invalid", "true");
    expect(field("Quantity")).toHaveFocus();
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(minimumResult);
    change("Quantity", "1");
    await advance(300);
    expect(previewKnowledge).toHaveBeenCalledTimes(3);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹222.22");
    expectNoVendorSummary(dialog);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("uses a separate margin card and only allows Quantity and Discount in the simulator", async () => {
    const { props } = setup();
    expect(within(screen.getByRole("group", { name: "Lisno Margin" })).getByRole("textbox", { name: "Lisno Margin" })).toHaveValue("15.00");
    expect(screen.queryByText(/markup|discount|PMC/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).not.toHaveAttribute("readonly");
    const dialog = await open();
    for (const name of ["UOM", "Base Rate (₹)", "Low Quantity Limit", "Impact (%)", "Min. Lisno Margin (%)", "Max. Lisno Margin (%)"]) {
      expect(field(name)).toHaveAttribute("readonly");
    }
    expect(within(dialog).getAllByRole("textbox").filter((element) => !(element as HTMLInputElement).readOnly)
      .map((element) => element.id)).toEqual([field("Quantity").id, field("Discount (%)").id]);
    expect(field("Max. Lisno Margin (%)")).toHaveValue("15.00");
    expect(within(dialog).getByRole("radio", { name: "Max. Lisno Margin" })).toBeChecked();
    expect(field("Min. Lisno Margin (%)")).toHaveValue("15.00");
    expect(dialog).not.toHaveTextContent(/PMC|markup|additional low-quantity/i);
    expect(within(dialog).getByText(/Selling price = cost price ÷ \(1 − Lisno margin %\)/)).toHaveTextContent(
      "Cost includes any low-quantity impact. Discount applies afterward.");
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: {
      baseRatePaise: 12_345, lowQuantityLimit: "2.5", impactBps: 1_250, subVendorMarginBps: 1_500
    }, quantity: "2.5", quantityScale: 2, modeCalculationDiscountBps: 455 }, automaticRequestOptions);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("uses selling-price margin at the quantity limit with independent Lisno and PMC percentages", async () => {
    const view = setup();
    const dialog = await open();
    await settleCalculation();
    expect(within(dialog).getByLabelText("Base amount")).toHaveTextContent("₹308.63");
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent("+₹38.57");
    expect(within(dialog).getByLabelText("Lisno margin amount")).toHaveTextContent("+₹61.27");
    expect(within(dialog).getByLabelText("Selling price before discount")).toHaveTextContent("₹408.47");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹18.59");
    expectNoVendorSummary(dialog);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹389.88");
    expect(within(dialog).getByText(/Discount applies to the selling price before discount/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), subVendorCalculation: undefined,
      pmcCalculation: { baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
        revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
        pmcMarginBps: 1_800, pmcMarginAmountPaise: 7_621,
        totalBeforeDiscountPaise: 42_341, totalPaise: 41_994, finalVendorChargesPaise: 34_720,
        discount: { rateBps: 455, totalBeforeDiscountPaise: 42_341, amountPaise: 347 } } });
    view.rerenderEditor({ scope: "pmc", contextLabel: "PMC", pmcMarginBps: 1_800 });
    const pmcDialog = await open();
    await settleCalculation();
    expect(within(pmcDialog).getByLabelText("Selling price before discount")).toHaveTextContent("₹423.41");
    expect(within(pmcDialog).getByLabelText("PMC charge")).toHaveTextContent("+₹76.21");
    expect(within(pmcDialog).getByLabelText("Final total")).toHaveTextContent("₹419.94");
    expectNoVendorSummary(pmcDialog);
    expect(field("Max. PMC Margin (%)")).toHaveValue("18.00");
  });

  it.each([undefined, null, "15.00", -500, 999, 1_499, 1_600, 1_750, 2_001, 9_900, 10_000, 1_500.1])("requires its own valid configured margin (%s) despite a valid PMC margin", async (subVendorMarginBps) => {
    setup({ subVendorMarginBps });
    const dialog = await open();
    expect(field("Max. Lisno Margin (%)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getAllByText(/Close this simulator and set the Lisno Margin/)).toHaveLength(2);
    await settleCalculation();
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("rejects discounts above 100%, preserves malformed input, and allows retry after a server failure", async () => {
    setup();
    const dialog = await open();
    field("Quantity").focus();
    change("Discount (%)", "100.01");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(field("Quantity")).toHaveFocus();
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(field("Discount (%)")).toHaveValue("100.01");
    for (const invalid of ["", "-1", "4.551", "4.", "invalid"]) {
      change("Discount (%)", invalid);
      await settleCalculation();
      expect(field("Discount (%)")).toHaveValue(invalid);
      expect(field("Discount (%)")).toHaveAttribute("aria-invalid", "true");
      expect(within(dialog).getByRole("alert")).toBeVisible();
    }
    expect(previewKnowledge).not.toHaveBeenCalled();
    change("Discount (%)", "4.55");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Calculation service is temporarily unavailable."));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Calculation service is temporarily unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Retry calculation" }));
    await settleCalculation();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹389.88");
  });

  it.each([
    { percentage: "20", rateBps: 2_000, discountAmountPaise: 23_529, totalPaise: 94_118, finalVendorChargesPaise: 76_471, expectedDiscount: "−₹235.29", expectedTotal: "₹941.18" },
    { percentage: "50", rateBps: 5_000, discountAmountPaise: 58_824, totalPaise: 58_823, finalVendorChargesPaise: 41_176, expectedDiscount: "−₹588.24", expectedTotal: "₹588.23" },
    { percentage: "95", rateBps: 9_500, discountAmountPaise: 111_765, totalPaise: 5_882, finalVendorChargesPaise: -11_765, expectedDiscount: "−₹1,117.65", expectedTotal: "₹58.82" },
    { percentage: "100", rateBps: 10_000, discountAmountPaise: 117_647, totalPaise: 0, finalVendorChargesPaise: -17_647, expectedDiscount: "−₹1,176.47", expectedTotal: "₹0.00" }
  ])("accepts a typed $percentage% custom discount even at the minimum Lisno margin", async (sample) => {
    const user = userEvent.setup();
    const { props } = setup({ subVendorMarginBps: 1_500, value: { ...settings, baseRatePaise: 100_000, impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    const discount = field("Discount (%)");
    expect(discount).toBeEnabled();
    expect(discount).not.toHaveAttribute("readonly");
    expect(discount).toHaveAccessibleDescription("Discount applies to the selling price before discount. Enter your custom percentage.");
    expect(within(dialog).queryByText(/Maximum allowed|discount allowance|retain at least 10%/)).not.toBeInTheDocument();
    await user.clear(discount);
    await user.type(discount, sample.percentage);
    expect(discount).toHaveValue(sample.percentage);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 100_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 100_000, revisedAmountPaise: 100_000, appliedImpactBps: 0,
      subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 17_647, totalBeforeDiscountPaise: 117_647,
      totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.finalVendorChargesPaise,
      discount: { rateBps: sample.rateBps, totalBeforeDiscountPaise: 117_647, amountPaise: sample.discountAmountPaise } }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: { baseRatePaise: 100_000,
      lowQuantityLimit: "2.5", impactBps: 0, subVendorMarginBps: 1_500 }, quantity: "1", quantityScale: 2,
      modeCalculationDiscountBps: sample.rateBps }, automaticRequestOptions);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Lisno margin amount")).toHaveTextContent("+₹176.47");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent(sample.expectedDiscount);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
    expectNoVendorSummary(dialog);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("accepts independently rounded amounts without imposing an effective margin floor", async () => {
    setup({ subVendorMarginBps: 1_500, value: { ...settings, baseRatePaise: 2_275, lowQuantityLimit: "0" } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "0.02");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 2_275, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 2_275, revisedAmountPaise: 2_275, appliedImpactBps: 0,
      subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 401, totalBeforeDiscountPaise: 2_676,
      totalPaise: 2_675, finalVendorChargesPaise: 2_274,
      discount: { rateBps: 2, totalBeforeDiscountPaise: 2_676, amountPaise: 1 } }));
    await settleCalculation();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹0.01");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹26.75");
  });

  it("ignores obsolete markup settings and hides a zero configured low-quantity charge", async () => {
    render(<KnowledgeModeCalculationSimulator scope="sub_vendor" subVendorMarginBps={1_500}
      initialDraft={{ baseRate: "100", lowQuantityLimit: "15", impactRate: "0", minimumRate: "invalid", startingRate: "-3" }}
      uom={{ scopeKey: "sub-vendor:legacy", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 10_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 10_000, revisedAmountPaise: 10_000, totalPaise: 11_765, totalBeforeDiscountPaise: 11_765,
      appliedImpactBps: 0, subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 1_765, finalVendorChargesPaise: 10_000 }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: {
      baseRatePaise: 10_000, lowQuantityLimit: "15", impactBps: 0, subVendorMarginBps: 1_500
    }, quantity: "1", quantityScale: 0 }, automaticRequestOptions);
    expect(screen.queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Final total")).toHaveTextContent("₹117.65");
  });

  it("accepts no low-quantity charge above the configured limit", async () => {
    setup();
    const dialog = await open();
    change("Quantity", "3");
    change("Discount (%)", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 37_035, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 12_345, revisedAmountPaise: 37_035, totalPaise: 43_571, totalBeforeDiscountPaise: 43_571,
      appliedImpactBps: 0, subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 6_536, finalVendorChargesPaise: 37_035 }));
    await settleCalculation();
    expect(within(dialog).queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹435.71");
    expect(within(dialog).getByText("No low-quantity impact applied.")).toBeVisible();
  });

  it.each([
    { cost: 1_500_000, rate: 3_500, selling: 2_307_692, margin: 807_692, expected: "₹23,076.92" },
    { cost: 10_000, rate: 3_500, selling: 15_385, margin: 5_385, expected: "₹153.85" },
    { cost: 20_000, rate: 1_000, selling: 22_222, margin: 2_222, expected: "₹222.22" },
    { cost: 20_000, rate: 3_500, selling: 30_769, margin: 10_769, expected: "₹307.69" },
    { cost: 20_000, rate: 9_500, selling: 400_000, margin: 380_000, expected: "₹4,000.00" },
    { cost: 20_000, rate: 0, selling: 20_000, margin: 0, expected: "₹200.00" },
    { cost: 20_000, rate: 1_500, selling: 23_529, margin: 3_529, expected: "₹235.29" },
    { cost: 20_000, rate: 2_000, selling: 25_000, margin: 5_000, expected: "₹250.00" },
    { cost: 2, rate: 2_000, selling: 3, margin: 1, expected: "₹0.03" },
    { cost: 0, rate: 1_500, selling: 0, margin: 0, expected: "₹0.00" }
  ])("renders the exact rounded selling price for cost $cost paise and margin $rate bps", async (sample) => {
    setup({ subVendorMarginBps: sample.rate, value: { ...settings, baseRatePaise: sample.cost, lowQuantityLimit: "0", impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: sample.cost, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: sample.cost, revisedAmountPaise: sample.cost, appliedImpactBps: 0,
      subVendorMarginBps: sample.rate, subVendorMarginAmountPaise: sample.margin,
      totalBeforeDiscountPaise: sample.selling, totalPaise: sample.selling, finalVendorChargesPaise: sample.cost }));
    await settleCalculation();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Selling price before discount")).toHaveTextContent(sample.expected);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expected);
    expectNoVendorSummary(dialog);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "1", quantityScale: 2,
      subVendorCalculation: { baseRatePaise: sample.cost, lowQuantityLimit: "0", impactBps: 0, subVendorMarginBps: sample.rate } }, automaticRequestOptions);
  });

  it.each([
    { name: "obsolete additive markup", cost: 20_000, rate: 2_000, selling: 24_000, margin: 4_000 },
    { name: "obsolete deduction", cost: 20_000, rate: 2_000, selling: 16_000, margin: -4_000 },
    { name: "rounded-down half-paise tie", cost: 2, rate: 2_000, selling: 2, margin: 0 },
    { name: "rounded-up non-tie", cost: 20_000, rate: 1_500, selling: 23_530, margin: 3_530 }
  ])("rejects $name even when the returned amounts reconcile", async (sample) => {
    setup({ subVendorMarginBps: sample.rate, value: { ...settings, baseRatePaise: sample.cost, lowQuantityLimit: "0", impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: sample.cost, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: sample.cost, revisedAmountPaise: sample.cost, appliedImpactBps: 0,
      subVendorMarginBps: sample.rate, subVendorMarginAmountPaise: sample.margin,
      totalBeforeDiscountPaise: sample.selling, totalPaise: sample.selling, finalVendorChargesPaise: sample.cost }));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent Lisno breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects an incorrectly rounded discount even when the selling price and all rows reconcile", async () => {
    setup({ subVendorMarginBps: 2_000, value: { ...settings, baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "10");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 20_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 20_000, revisedAmountPaise: 20_000, appliedImpactBps: 0,
      subVendorMarginBps: 2_000, subVendorMarginAmountPaise: 5_000, totalBeforeDiscountPaise: 25_000,
      totalPaise: 22_499, finalVendorChargesPaise: 17_499,
      discount: { rateBps: 1_000, totalBeforeDiscountPaise: 25_000, amountPaise: 2_501 } }));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent Lisno breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { ...subVendorResult, subVendorMarginBps: 2_000 },
    { ...subVendorResult, discount: undefined },
    { ...subVendorResult, discount: { ...subVendorResult.discount, rateBps: 400 } },
    { ...subVendorResult, discount: { ...subVendorResult.discount, rateBps: 10_001 } }
  ])("rejects a different margin or discount %#", async (serverResult) => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("different Lisno margin or discount");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it.each([
    { ...subVendorResult, subVendorMarginAmountPaise: undefined },
    { ...subVendorResult, finalVendorChargesPaise: undefined },
    { ...subVendorResult, subVendorMarginAmountPaise: -1 },
    { ...subVendorResult, totalPaise: -1 },
    { ...subVendorResult, revisedAmountPaise: -1 },
    { ...subVendorResult, discount: { ...subVendorResult.discount, amountPaise: -1 } },
    { ...subVendorResult, finalVendorChargesPaise: -1 },
    { ...subVendorResult, finalVendorChargesPaise: Number.MIN_SAFE_INTEGER - 1 },
    { ...subVendorResult, finalVendorChargesPaise: 32_861.5 },
    { ...subVendorResult, subVendorMarginAmountPaise: 6_127.5 },
    { ...subVendorResult, totalBeforeDiscountPaise: Number.MAX_SAFE_INTEGER + 1 },
    { ...subVendorResult, totalPaise: 38_195 },
    { ...subVendorResult, appliedImpactBps: 0 },
    { ...subVendorResult, appliedImpactBps: 1_750, additionalLowQuantityImpactBps: 500 },
    { ...subVendorResult, discount: { ...subVendorResult.discount, totalBeforeDiscountPaise: 34_720 } }
  ])("rejects missing, unsafe, stale, or unreconciled breakdowns %#", async (serverResult) => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult as NonNullable<KnowledgePreview["subVendorCalculation"]>));
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent Lisno breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects legacy generic and PMC responses instead of substituting either branch", async () => {
    setup();
    const dialog = await open();
    const { subVendorMarginBps, subVendorMarginAmountPaise, ...common } = subVendorResult;
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), subVendorCalculation: undefined,
      pmcCalculation: { ...common, pmcMarginBps: subVendorMarginBps, pmcMarginAmountPaise: subVendorMarginAmountPaise },
      modeCalculation: { revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, totalPaise: 46_872, appliedImpactBps: 1_250 } });
    await settleCalculation();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return a Sub-Vendor calculation");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("calculates the configured Min. and Max. Lisno margins through the Sub-Vendor branch", async () => {
    const { props } = setup({ subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000,
      value: { ...settings, baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000 } });
    const dialog = await open();
    change("Quantity", "10");
    change("Discount (%)", "0");
    expect(field("Min. Lisno Margin (%)")).toHaveValue("15.00");
    expect(field("Max. Lisno Margin (%)")).toHaveValue("20.00");
    const shared = { baseAmountPaise: 200_000, lowQuantityImpactAmountPaise: 20_000,
      revisedUnitRatePaise: 22_000, revisedAmountPaise: 220_000, appliedImpactBps: 1_000,
      finalVendorChargesPaise: 220_000 };
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...shared,
      subVendorMarginBps: 2_000, subVendorMarginAmountPaise: 55_000, totalBeforeDiscountPaise: 275_000, totalPaise: 275_000 }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "10", quantityScale: 2,
      subVendorCalculation: { baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000, subVendorMarginBps: 2_000 } }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹2,750.00");
    const minimum = within(dialog).getByRole("radio", { name: "Min. Lisno Margin" });
    act(() => minimum.focus());
    await userEvent.keyboard(" ");
    expect(minimum).toBeChecked();
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...shared,
      subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 38_824, totalBeforeDiscountPaise: 258_824, totalPaise: 258_824 }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "10", quantityScale: 2,
      subVendorCalculation: { baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000, subVendorMarginBps: 1_500 } }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("Lisno margin amount")).toHaveTextContent("+₹388.24");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹2,588.24");
    expect(within(dialog).getByText("Calculated with Min. Lisno Margin.")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Max. Lisno Margin" }));
    change("Discount (%)", "10");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...shared,
      subVendorMarginBps: 2_000, subVendorMarginAmountPaise: 55_000, totalBeforeDiscountPaise: 275_000,
      totalPaise: 247_500, finalVendorChargesPaise: 192_500,
      discount: { rateBps: 1_000, totalBeforeDiscountPaise: 275_000, amountPaise: 27_500 } }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "10", quantityScale: 2,
      subVendorCalculation: { baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000, subVendorMarginBps: 2_000 },
      modeCalculationDiscountBps: 1_000 }, automaticRequestOptions);
    expect(within(dialog).getByLabelText("Selling price before discount")).toHaveTextContent("₹2,750.00");
    expect(within(dialog).getByLabelText("Lisno margin amount")).toHaveTextContent("+₹550.00");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹275.00");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹2,475.00");
    expectNoVendorSummary(dialog);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it.each([null, -500, 999, 1_499, 1_600, 1_750, 2_000, 2_001, 9_900, 10_000, "10.001"])("blocks an invalid minimum (%s) even with Max. selected", async (subVendorMinimumMarginBps) => {
    setup({ subVendorMinimumMarginBps });
    await open();
    expect(field("Min. Lisno Margin (%)")).toHaveAttribute("aria-invalid", "true");
    await settleCalculation();
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it.each([
    { minimum: 1_000, maximum: 3_500, minimumSelling: 22_222, maximumSelling: 30_769, minText: "₹222.22", maxText: "₹307.69" },
    { minimum: 0, maximum: 9_500, minimumSelling: 20_000, maximumSelling: 400_000, minText: "₹200.00", maxText: "₹4,000.00" }
  ])("previews both configured $minimum/$maximum bps choices and resets to Max. on reopening", async (sample) => {
    const { props } = setup({ subVendorMinimumMarginBps: sample.minimum, subVendorMarginBps: sample.maximum,
      value: { ...settings, baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "0");
    expect(field("Min. Lisno Margin (%)")).toHaveValue(sample.minimum === 0 ? "0" : (sample.minimum / 100).toFixed(2));
    expect(field("Max. Lisno Margin (%)")).toHaveValue((sample.maximum / 100).toFixed(2));
    expect(field("Min. Lisno Margin (%)")).toHaveAttribute("readonly");
    expect(field("Max. Lisno Margin (%)")).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("radio", { name: "Max. Lisno Margin" })).toBeChecked();
    for (const choice of [
      { label: "Max.", rate: sample.maximum, selling: sample.maximumSelling, text: sample.maxText },
      { label: "Min.", rate: sample.minimum, selling: sample.minimumSelling, text: sample.minText }
    ]) {
      const radio = within(dialog).getByRole("radio", { name: `${choice.label} Lisno Margin` });
      act(() => radio.focus());
      await userEvent.keyboard(" ");
      expect(radio).toBeChecked();
      expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
      vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 20_000,
        lowQuantityImpactAmountPaise: 0, revisedUnitRatePaise: 20_000, revisedAmountPaise: 20_000,
        appliedImpactBps: 0, subVendorMarginBps: choice.rate,
        subVendorMarginAmountPaise: choice.selling - 20_000, totalBeforeDiscountPaise: choice.selling,
        totalPaise: choice.selling, finalVendorChargesPaise: 20_000 }));
      await settleCalculation();
      expect(previewKnowledge).toHaveBeenLastCalledWith({ quantity: "1", quantityScale: 2,
        subVendorCalculation: { baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0, subVendorMarginBps: choice.rate } }, automaticRequestOptions);
      expect(within(dialog).getByLabelText("Selling price before discount")).toHaveTextContent(choice.text);
      expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(choice.text);
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    expect(screen.getByRole("radio", { name: "Max. Lisno Margin" })).toBeChecked();
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("discards a pending Max. result after switching to Min., including a late failure", async () => {
    setup({ subVendorMinimumMarginBps: 1_000, subVendorMarginBps: 3_500 });
    const dialog = await open();
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await settleCalculation();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Min. Lisno Margin" }));
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    let fail!: (reason: Error) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await settleCalculation();
    expect(previewKnowledge).toHaveBeenLastCalledWith(expect.objectContaining({ subVendorCalculation: expect.objectContaining({ subVendorMarginBps: 1_000 }) }), automaticRequestOptions);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Max. Lisno Margin" }));
    await act(async () => fail(new Error("Stale minimum failure")));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps opening configuration snapshots and ignores pending responses after edits or closing", async () => {
    const view = setup();
    const dialog = await open();
    view.rerenderEditor({ subVendorMarginBps: 3_500, subVendorMinimumMarginBps: 1_000 });
    expect(field("Max. Lisno Margin (%)")).toHaveValue("15.00");
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await settleCalculation();
    change("Quantity", "3");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await settleCalculation();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await act(async () => finish(response()));
    await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    expect(field("Max. Lisno Margin (%)")).toHaveValue("35.00");
    expect(field("Min. Lisno Margin (%)")).toHaveValue("10.00");
    expect(screen.getByRole("radio", { name: "Max. Lisno Margin" })).toBeChecked();
    expect(field("Quantity")).toHaveValue("1");
    expect(field("Discount (%)")).toHaveValue("0");
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(view.props.onChange).not.toHaveBeenCalled();
    expect(view.props.onDirty).not.toHaveBeenCalled();
  });
});
