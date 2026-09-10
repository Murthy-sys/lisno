import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeModeCalculationEditor } from "./KnowledgeModeCalculationEditor";
import { KnowledgeModeCalculationSimulator } from "./KnowledgeModeCalculationSimulator";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));

const settings = { baseRatePaise: 12_345, lowQuantityLimit: "2.5", impactBps: 1_250, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const subVendorResult = { baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
  revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
  subVendorMarginBps: 1_525, subVendorMarginAmountPaise: 5_295, totalBeforeDiscountPaise: 40_015,
  finalVendorChargesPaise: 32_899, totalPaise: 38_194,
  discount: { rateBps: 455, totalBeforeDiscountPaise: 40_015, amountPaise: 1_821 } };
function response(subVendorCalculation: KnowledgePreview["subVendorCalculation"] = subVendorResult): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
    effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "2.5", procurementQuantity: null,
    vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
    pmcMarkup: null, duration: null, subVendorCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModeCalculationEditor>> = {}) {
  let props: ComponentProps<typeof KnowledgeModeCalculationEditor> = {
    scope: "sub_vendor", contextLabel: "Sub-Vendor", subVendorMarginBps: 1_525, pmcMarginBps: 1_800,
    marginControl: <label>Sub-Vendor Margin<input defaultValue="15.25" /></label>,
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
async function calculate() { await userEvent.click(screen.getByRole("button", { name: "Calculate" })); }

describe("Sub-Vendor margin calculation", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("uses a separate margin card and only allows Quantity and Discount in the simulator", async () => {
    const { props } = setup();
    expect(within(screen.getByRole("group", { name: "Sub-Vendor Margin" })).getByRole("textbox", { name: "Sub-Vendor Margin" })).toHaveValue("15.25");
    expect(screen.queryByText(/markup|discount|PMC/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).not.toHaveAttribute("readonly");
    const dialog = await open();
    for (const name of ["UOM", "Base Rate (₹)", "Low Quantity Limit", "Impact (%)", "Sub-Vendor Margin (%)"]) {
      expect(field(name)).toHaveAttribute("readonly");
    }
    expect(within(dialog).getAllByRole("textbox").filter((element) => !(element as HTMLInputElement).readOnly)
      .map((element) => element.id)).toEqual([field("Quantity").id, field("Discount (%)").id]);
    expect(field("Sub-Vendor Margin (%)")).toHaveValue("15.25");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/PMC|markup|additional low-quantity/i);
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: {
      baseRatePaise: 12_345, lowQuantityLimit: "2.5", impactBps: 1_250, subVendorMarginBps: 1_525
    }, quantity: "2.5", quantityScale: 2, modeCalculationDiscountBps: 455 });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("matches PMC's rounded breakdown at the quantity limit and applies discount after its independent margin", async () => {
    const view = setup();
    const dialog = await open();
    await calculate();
    expect(within(dialog).getByLabelText("Base amount")).toHaveTextContent("₹308.63");
    expect(within(dialog).getByLabelText("Low-quantity impact amount")).toHaveTextContent("+₹38.57");
    expect(within(dialog).getByLabelText("Sub-Vendor margin amount")).toHaveTextContent("+₹52.95");
    expect(within(dialog).getByLabelText("Subtotal after Sub-Vendor margin")).toHaveTextContent("₹400.15");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹18.21");
    expect(within(dialog).getByLabelText("Final vendor charges")).toHaveTextContent("₹328.99");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹381.94");
    expect(within(dialog).getByText(/Discount applies to the subtotal after Sub-Vendor margin/)).toBeVisible();
    const subVendorOutputs = [...dialog.querySelectorAll("output")].map((output) => output.textContent);
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    const { subVendorMarginBps, subVendorMarginAmountPaise, ...common } = subVendorResult;
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), subVendorCalculation: undefined,
      pmcCalculation: { ...common, pmcMarginBps: subVendorMarginBps, pmcMarginAmountPaise: subVendorMarginAmountPaise } });
    view.rerenderEditor({ scope: "pmc", contextLabel: "PMC", pmcMarginBps: 1_525 });
    const pmcDialog = await open();
    await calculate();
    expect([...pmcDialog.querySelectorAll("output")].map((output) => output.textContent)).toEqual(subVendorOutputs);
  });

  it.each([undefined, null, "15.25", 999, 2_001, 1_525.1])("requires its own valid configured margin (%s) despite a valid PMC margin", async (subVendorMarginBps) => {
    setup({ subVendorMarginBps });
    const dialog = await open();
    expect(field("Sub-Vendor Margin (%)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText(/Close this simulator and set the Sub-Vendor Margin/)).toBeVisible();
    await calculate();
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("rejects discounts above 100%, preserves malformed input, and allows retry after a server failure", async () => {
    setup();
    const dialog = await open();
    change("Discount (%)", "100.01");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    await waitFor(() => expect(field("Discount (%)")).toHaveFocus());
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(field("Discount (%)")).toHaveValue("100.01");
    for (const invalid of ["", "-1", "4.551", "4.", "invalid"]) {
      change("Discount (%)", invalid);
      await calculate();
      expect(field("Discount (%)")).toHaveValue(invalid);
      expect(field("Discount (%)")).toHaveAttribute("aria-invalid", "true");
      expect(within(dialog).getByRole("alert")).toBeVisible();
    }
    expect(previewKnowledge).not.toHaveBeenCalled();
    change("Discount (%)", "4.55");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Calculation service is temporarily unavailable."));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Calculation service is temporarily unavailable.");
    await calculate();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹381.94");
  });

  it.each([
    { percentage: "20", rateBps: 2_000, discountAmountPaise: 22_000, totalPaise: 88_000, finalVendorChargesPaise: 78_000, expectedDiscount: "−₹220.00", expectedTotal: "₹880.00", expectedBalance: "₹780.00" },
    { percentage: "50", rateBps: 5_000, discountAmountPaise: 55_000, totalPaise: 55_000, finalVendorChargesPaise: 45_000, expectedDiscount: "−₹550.00", expectedTotal: "₹550.00", expectedBalance: "₹450.00" },
    { percentage: "95", rateBps: 9_500, discountAmountPaise: 104_500, totalPaise: 5_500, finalVendorChargesPaise: -4_500, expectedDiscount: "−₹1,045.00", expectedTotal: "₹55.00", expectedBalance: "−₹45.00" },
    { percentage: "100", rateBps: 10_000, discountAmountPaise: 110_000, totalPaise: 0, finalVendorChargesPaise: -10_000, expectedDiscount: "−₹1,100.00", expectedTotal: "₹0.00", expectedBalance: "−₹100.00" }
  ])("accepts a typed $percentage% custom discount even at the minimum Sub-Vendor margin", async (sample) => {
    const user = userEvent.setup();
    const { props } = setup({ subVendorMarginBps: 1_000, value: { ...settings, baseRatePaise: 100_000, impactBps: 0 } });
    const dialog = await open();
    change("Quantity", "1");
    const discount = field("Discount (%)");
    expect(discount).toBeEnabled();
    expect(discount).not.toHaveAttribute("readonly");
    expect(discount).toHaveAccessibleDescription("Discount applies to the subtotal after Sub-Vendor margin. Enter your custom percentage.");
    expect(within(dialog).queryByText(/Maximum allowed|discount allowance|retain at least 10%/)).not.toBeInTheDocument();
    await user.clear(discount);
    await user.type(discount, sample.percentage);
    expect(discount).toHaveValue(sample.percentage);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 100_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 100_000, revisedAmountPaise: 100_000, appliedImpactBps: 0,
      subVendorMarginBps: 1_000, subVendorMarginAmountPaise: 10_000, totalBeforeDiscountPaise: 110_000,
      totalPaise: sample.totalPaise, finalVendorChargesPaise: sample.finalVendorChargesPaise,
      discount: { rateBps: sample.rateBps, totalBeforeDiscountPaise: 110_000, amountPaise: sample.discountAmountPaise } }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: { baseRatePaise: 100_000,
      lowQuantityLimit: "2.5", impactBps: 0, subVendorMarginBps: 1_000 }, quantity: "1", quantityScale: 2,
      modeCalculationDiscountBps: sample.rateBps });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Sub-Vendor margin amount")).toHaveTextContent("+₹100.00");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent(sample.expectedDiscount);
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent(sample.expectedTotal);
    const balanceLabel = sample.finalVendorChargesPaise < 0 ? "Balance after margin" : "Final vendor charges";
    expect(within(dialog).getByLabelText(balanceLabel)).toHaveTextContent(sample.expectedBalance);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("accepts independently rounded amounts below the former ten-percent floor", async () => {
    setup({ subVendorMarginBps: 1_003, value: { ...settings, baseRatePaise: 2_275, lowQuantityLimit: "0" } });
    const dialog = await open();
    change("Quantity", "1");
    change("Discount (%)", "0.02");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 2_275, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 2_275, revisedAmountPaise: 2_275, appliedImpactBps: 0,
      subVendorMarginBps: 1_003, subVendorMarginAmountPaise: 228, totalBeforeDiscountPaise: 2_503,
      totalPaise: 2_502, finalVendorChargesPaise: 2_274,
      discount: { rateBps: 2, totalBeforeDiscountPaise: 2_503, amountPaise: 1 } }));
    await calculate();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("−₹0.01");
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹25.02");
  });

  it("ignores obsolete markup settings and hides a zero configured low-quantity charge", async () => {
    render(<KnowledgeModeCalculationSimulator scope="sub_vendor" subVendorMarginBps={1_525}
      initialDraft={{ baseRate: "100", lowQuantityLimit: "15", impactRate: "0", minimumRate: "invalid", startingRate: "-3" }}
      uom={{ scopeKey: "sub-vendor:legacy", id: "nos", label: "Nos", decimalScale: 0 }} onClose={vi.fn()} />);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 10_000, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 10_000, revisedAmountPaise: 10_000, totalPaise: 11_525, totalBeforeDiscountPaise: 11_525,
      appliedImpactBps: 0, subVendorMarginBps: 1_525, subVendorMarginAmountPaise: 1_525, finalVendorChargesPaise: 10_000 }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ subVendorCalculation: {
      baseRatePaise: 10_000, lowQuantityLimit: "15", impactBps: 0, subVendorMarginBps: 1_525
    }, quantity: "1", quantityScale: 0 });
    expect(screen.queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Final total")).toHaveTextContent("₹115.25");
  });

  it("accepts no low-quantity charge above the configured limit", async () => {
    setup();
    const dialog = await open();
    change("Quantity", "3");
    change("Discount (%)", "0");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ baseAmountPaise: 37_035, lowQuantityImpactAmountPaise: 0,
      revisedUnitRatePaise: 12_345, revisedAmountPaise: 37_035, totalPaise: 42_683, totalBeforeDiscountPaise: 42_683,
      appliedImpactBps: 0, subVendorMarginBps: 1_525, subVendorMarginAmountPaise: 5_648, finalVendorChargesPaise: 37_035 }));
    await calculate();
    expect(within(dialog).queryByLabelText("Low-quantity impact amount")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Final total")).toHaveTextContent("₹426.83");
    expect(within(dialog).getByText("No low-quantity impact applied.")).toBeVisible();
  });

  it.each([
    { ...subVendorResult, subVendorMarginBps: 1_800 },
    { ...subVendorResult, discount: undefined },
    { ...subVendorResult, discount: { ...subVendorResult.discount, rateBps: 400 } },
    { ...subVendorResult, discount: { ...subVendorResult.discount, rateBps: 10_001 } }
  ])("rejects a different margin or discount %#", async (serverResult) => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("different Sub-Vendor margin or discount");
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
    { ...subVendorResult, finalVendorChargesPaise: 32_899.5 },
    { ...subVendorResult, subVendorMarginAmountPaise: 5_295.5 },
    { ...subVendorResult, totalBeforeDiscountPaise: Number.MAX_SAFE_INTEGER + 1 },
    { ...subVendorResult, totalPaise: 38_195 },
    { ...subVendorResult, appliedImpactBps: 0 },
    { ...subVendorResult, appliedImpactBps: 1_750, additionalLowQuantityImpactBps: 500 },
    { ...subVendorResult, discount: { ...subVendorResult.discount, totalBeforeDiscountPaise: 34_720 } }
  ])("rejects missing, unsafe, stale, or unreconciled breakdowns %#", async (serverResult) => {
    setup();
    const dialog = await open();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(serverResult as NonNullable<KnowledgePreview["subVendorCalculation"]>));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent Sub-Vendor breakdown");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("rejects legacy generic and PMC responses instead of substituting either branch", async () => {
    setup();
    const dialog = await open();
    const { subVendorMarginBps, subVendorMarginAmountPaise, ...common } = subVendorResult;
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), subVendorCalculation: undefined,
      pmcCalculation: { ...common, pmcMarginBps: subVendorMarginBps, pmcMarginAmountPaise: subVendorMarginAmountPaise },
      modeCalculation: { revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, totalPaise: 46_872, appliedImpactBps: 1_250 } });
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return a Sub-Vendor calculation");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("keeps opening configuration snapshots and ignores pending responses after edits or closing", async () => {
    const view = setup();
    const dialog = await open();
    view.rerenderEditor({ subVendorMarginBps: 1_800 });
    expect(field("Sub-Vendor Margin (%)")).toHaveValue("15.25");
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await calculate();
    change("Quantity", "3");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await calculate();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await act(async () => finish(response()));
    await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    expect(field("Sub-Vendor Margin (%)")).toHaveValue("18.00");
    expect(field("Quantity")).toHaveValue("1");
    expect(field("Discount (%)")).toHaveValue("0");
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(view.props.onChange).not.toHaveBeenCalled();
    expect(view.props.onDirty).not.toHaveBeenCalled();
  });
});
