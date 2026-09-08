import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeModeCalculationEditor } from "./KnowledgeModeCalculationEditor";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));

const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const result = { revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 222_750, appliedImpactBps: 1_000 };
function response(modeCalculation: NonNullable<KnowledgePreview["modeCalculation"]> = result): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
    effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
    vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
    pmcMarkup: null, duration: null, modeCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModeCalculationEditor>> = {}) {
  let props: ComponentProps<typeof KnowledgeModeCalculationEditor> = {
    value: undefined, uom: { scopeKey: "line-one:revision-one", id: "nos", label: "Nos", decimalScale: 0 },
    readOnly: false, validationAttempt: 0, issues: [], onChange: vi.fn(), onDirty: vi.fn(), onValidationChange: vi.fn(),
    ...overrides
  };
  const view = render(<KnowledgeModeCalculationEditor {...props} />);
  return { props, ...view, rerenderEditor(next: Partial<typeof props>) {
    props = { ...props, ...next }; view.rerender(<KnowledgeModeCalculationEditor {...props} />);
  } };
}
function field(name: string) {
  const dialog = screen.queryByRole("dialog", { name: "Test calculations" });
  return (dialog ? within(dialog) : screen).getByRole("textbox", { name });
}
function change(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}
async function openSimulator() {
  await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
  return screen.getByRole("dialog", { name: "Test calculations" });
}
async function calculate() { await userEvent.click(screen.getByRole("button", { name: "Calculate" })); }

describe("Mode calculation configuration and simulator", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("tests a temporary discount and displays the server's reconciled saving and effective markup", async () => {
    const { props } = setup({ value: settings });
    const dialog = await openSimulator();
    expect(field("Discount (%)")).toHaveValue("0");
    expect(within(dialog).getByText(/Maximum allowed: 10.00%/)).toBeVisible();
    change("Discount (%)", "5");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...result, totalPaise: 214_500,
      discount: { rateBps: 500, effectiveMarkupBps: 3_000, totalBeforeDiscountPaise: 222_750, amountPaise: 8_250 } }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: settings, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 });
    expect(within(dialog).getByLabelText("Total before discount")).toHaveTextContent("₹2,227.50");
    expect(within(dialog).getByLabelText("Discount amount")).toHaveTextContent("₹82.50");
    expect(within(dialog).getByLabelText("Effective markup")).toHaveTextContent("30.00%");
    expect(within(dialog).getByLabelText("Total after discount")).toHaveTextContent("₹2,145.00");
    expect(props.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await openSimulator();
    expect(field("Discount (%)")).toHaveValue("0");
  });

  it("alerts immediately above the limit, focuses the discount on submit, and rechecks markup changes", async () => {
    setup({ value: settings });
    const dialog = await openSimulator();
    change("Discount (%)", "10.01");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    await waitFor(() => expect(field("Discount (%)")).toHaveFocus());
    expect(previewKnowledge).not.toHaveBeenCalled();
    change("Starting Gross Margin Markup (%)", "40");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Maximum allowed: 15.00%/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin Markup" }));
    expect(within(dialog).getByText(/Maximum allowed: 0.00%/)).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    change("Discount (%)", "0");
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: { ...settings, startingMarkupBps: 4_000 }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "minimum" });
  });

  it("rejects malformed discounts and ignores pending results after discount edits", async () => {
    setup({ value: settings });
    const dialog = await openSimulator();
    for (const invalid of ["", "-1", "5.001", "5.", "abc"]) {
      change("Discount (%)", invalid);
      await calculate();
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a non-negative discount with up to two decimal places");
    }
    expect(previewKnowledge).not.toHaveBeenCalled();
    let finish!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    change("Discount (%)", "0");
    await calculate();
    change("Discount (%)", "11");
    await act(async () => finish(response()));
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
  });

  it("does not show an undiscounted server response when a discount was requested", async () => {
    setup({ value: settings });
    const dialog = await openSimulator();
    change("Discount (%)", "5.25");
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith(expect.objectContaining({ modeCalculationDiscountBps: 525 }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return the discounted calculation");
    expect(within(dialog).queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error(SIMULATOR_DISCOUNT_LIMIT_MESSAGE));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
  });

  it("keeps configured values on the page and converts rupees and percentages without running a test", () => {
    const { props } = setup();
    expect(field("Base Rate (₹)")).toHaveValue("");
    expect(field("Low Quantity Limit")).toHaveValue("15");
    expect(field("Min. Gross Margin Markup (%)")).toHaveValue("25");
    expect(field("Starting Gross Margin Markup (%)")).toHaveValue("35");
    expect(screen.getByText("Nos")).toBeVisible();
    expect(field("Impact (%)")).toHaveValue("10");
    expect(screen.getByRole("status", { name: "Max Discount" })).toHaveTextContent("10.00%");
    expect(screen.queryByRole("textbox", { name: /Quantity.*test/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Total with starting markup")).not.toBeInTheDocument();
    change("Base Rate (₹)", "1500");
    expect(props.onChange).toHaveBeenLastCalledWith(settings);
    change("Base Rate (₹)", "1500.51");
    change("Starting Gross Margin Markup (%)", "40.25");
    expect(props.onChange).toHaveBeenLastCalledWith({ ...settings, baseRatePaise: 150_051, startingMarkupBps: 4_025 });
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("derives the estimate discount limit from markup edits without storing a separate discount setting", () => {
    const { props } = setup({ value: settings });
    const maximumDiscount = screen.getByRole("status", { name: "Max Discount" });
    change("Min. Gross Margin Markup (%)", "25.31");
    change("Starting Gross Margin Markup (%)", "32.58");
    expect(maximumDiscount).toHaveTextContent("7.27%");
    expect(props.onChange).toHaveBeenLastCalledWith({ ...settings, minimumMarkupBps: 2_531, startingMarkupBps: 3_258 });
    change("Base Rate (₹)", "");
    change("Low Quantity Limit", "");
    expect(maximumDiscount).toHaveTextContent("7.27%");
    change("Starting Gross Margin Markup (%)", "25.31");
    expect(maximumDiscount).toHaveTextContent("0.00%");
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("does not show a stale or negative discount limit for incomplete or invalid markups", () => {
    setup({ value: settings });
    const maximumDiscount = screen.getByRole("status", { name: "Max Discount" });
    for (const invalid of ["", "35.", "35.001", "-1", "24.99", "90071992547409.92"]) {
      change("Starting Gross Margin Markup (%)", invalid);
      expect(maximumDiscount).toHaveTextContent("—");
    }
    change("Starting Gross Margin Markup (%)", "35");
    expect(maximumDiscount).toHaveTextContent("10.00%");
    for (const invalid of ["", "25.", "-1", "36"]) {
      change("Min. Gross Margin Markup (%)", invalid);
      expect(maximumDiscount).toHaveTextContent("—");
    }
    change("Min. Gross Margin Markup (%)", "0");
    expect(maximumDiscount).toHaveTextContent("35.00%");
  });

  it("locks UOM and explicitly calculates either markup without changing configuration", async () => {
    const { props } = setup({ value: settings });
    await openSimulator();
    expect(field("UOM")).toHaveAttribute("readonly");
    expect(field("UOM")).toHaveValue("Nos");
    expect(field("Impact (%)")).not.toHaveAttribute("readonly");
    expect(field("Impact (%)")).toHaveValue("10.00");
    expect(field("Quantity")).toHaveValue("1");
    expect(previewKnowledge).not.toHaveBeenCalled();
    await calculate();
    await screen.findByText("₹2,227.50");
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: settings, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...result, totalPaise: 206_250 }));
    await userEvent.click(screen.getByRole("radio", { name: "Min. Gross Margin Markup" }));
    expect(screen.queryByLabelText("Total with starting markup")).not.toBeInTheDocument();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    await calculate();
    await screen.findByText("₹2,062.50");
    expect(screen.getByLabelText("Total with minimum markup")).toBeVisible();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: settings, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "minimum" });
    change("Base Rate (₹)", "500");
    change("Low Quantity Limit", "10");
    change("Quantity", "20");
    change("Min. Gross Margin Markup (%)", "20");
    change("Starting Gross Margin Markup (%)", "30");
    expect(screen.queryByLabelText("Total with minimum markup")).not.toBeInTheDocument();
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({
      modeCalculation: { baseRatePaise: 50_000, lowQuantityLimit: "10", impactBps: 1_000, minimumMarkupBps: 2_000, startingMarkupBps: 3_000 },
      quantity: "20", quantityScale: 0, modeCalculationMarkupBasis: "minimum"
    });
    expect(props.onDirty).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(field("Base Rate (₹)")).toHaveValue("1500.00");
    await openSimulator();
    expect(field("Quantity")).toHaveValue("1");
    expect(field("Base Rate (₹)")).toHaveValue("1500.00");
    expect(screen.getByRole("radio", { name: "Starting Gross Margin Markup" })).toBeChecked();
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("loads the legacy 10% default, saves exact Impact percentages, and keeps simulator edits temporary", async () => {
    const { impactBps: _impact, ...legacySettings } = settings;
    const view = setup({ value: legacySettings });
    expect(field("Impact (%)")).toHaveValue("10.00");
    change("Impact (%)", "12.75");
    expect(view.props.onChange).toHaveBeenLastCalledWith({ ...settings, impactBps: 1_275 });
    view.rerenderEditor({ value: { ...settings, impactBps: 1_275 } });
    await openSimulator();
    expect(field("Impact (%)")).toHaveValue("12.75");
    change("Impact (%)", "5.25");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ revisedUnitRatePaise: 157_875, revisedAmountPaise: 157_875, totalPaise: 213_131, appliedImpactBps: 525 }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: { ...settings, impactBps: 525 }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" });
    expect(await screen.findByText("5.25% low-quantity impact applied.")).toBeVisible();
    change("Impact (%)", "0");
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: { ...settings, impactBps: 0 }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(field("Impact (%)")).toHaveValue("12.75");
    expect(view.props.onChange).toHaveBeenCalledTimes(1);
    expect(view.props.onDirty).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid Impact in configuration and simulator and ignores an outdated Impact response", async () => {
    const view = setup({ value: settings });
    for (const invalid of ["", "-1", "10.001", "12.", "90071992547409.91"]) {
      change("Impact (%)", invalid);
      expect(field("Impact (%)")).toHaveAttribute("aria-invalid", "true");
      expect(view.props.onValidationChange).toHaveBeenLastCalledWith(false);
    }
    expect(view.props.onChange).not.toHaveBeenCalled();
    change("Impact (%)", "10");
    await openSimulator();
    for (const invalid of ["", "-1", "10.001"]) {
      change("Impact (%)", invalid);
      await calculate();
      expect(field("Impact (%)")).toHaveAttribute("aria-invalid", "true");
    }
    expect(previewKnowledge).not.toHaveBeenCalled();
    change("Impact (%)", "10");
    let resolvePending!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    await calculate();
    change("Impact (%)", "15");
    await act(async () => resolvePending(response()));
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
  });

  it("validates configuration edits separately from invalid simulator inputs", async () => {
    const view = setup({ value: settings });
    change("Base Rate (₹)", "");
    expect(view.props.onValidationChange).toHaveBeenLastCalledWith(false);
    change("Base Rate (₹)", "1500");
    change("Starting Gross Margin Markup (%)", "20");
    view.rerenderEditor({ validationAttempt: 1 });
    expect(field("Starting Gross Margin Markup (%)")).toHaveFocus();
    change("Starting Gross Margin Markup (%)", "35");
    expect(view.props.onValidationChange).toHaveBeenLastCalledWith(true);
    await openSimulator();
    for (const input of ["", "-1", "1500.999"]) {
      change("Base Rate (₹)", input);
      await calculate();
      expect(field("Base Rate (₹)")).toHaveAttribute("aria-invalid", "true");
    }
    change("Base Rate (₹)", "1500");
    change("Starting Gross Margin Markup (%)", "20");
    await calculate();
    expect(screen.getByText("Starting markup must be at least the minimum markup.")).toBeVisible();
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(view.props.onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("requires saved UOM details, honors its quantity precision, and retries failures on Calculate", async () => {
    const view = setup({ value: settings, uom: { scopeKey: "first", label: "Not set", message: "Save a UOM in Overview to test these calculations." } });
    const dialog = await openSimulator();
    expect(within(dialog).getByText("Save a UOM in Overview to test these calculations.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Calculate" })).toBeDisabled();
    expect(previewKnowledge).not.toHaveBeenCalled();
    view.rerenderEditor({ uom: { scopeKey: "first", id: "nos", label: "Nos", decimalScale: 0 } });
    change("Quantity", "1.25");
    await calculate();
    expect(field("Quantity")).toHaveAttribute("aria-invalid", "true");
    change("Quantity", "");
    await calculate();
    expect(previewKnowledge).not.toHaveBeenCalled();
    change("Quantity", "2");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Calculation service unavailable"));
    await calculate();
    await screen.findByText("Calculation service unavailable");
    await calculate();
    await screen.findByText("₹2,227.50");
    view.rerenderEditor({ uom: { scopeKey: "first", id: "sqft", label: "Sq.ft", decimalScale: 2 } });
    expect(screen.queryByRole("status", { name: "Calculation results" })).not.toBeInTheDocument();
    change("Quantity", "1.25");
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: settings, quantity: "1.25", quantityScale: 2, modeCalculationMarkupBasis: "starting" });
  });

  it("ignores superseded and closed-dialog responses and keeps unequal lines separate", async () => {
    let resolveFirst!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const view = setup({ value: settings });
    await openSimulator();
    await calculate();
    change("Quantity", "15");
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ revisedUnitRatePaise: 150_000, revisedAmountPaise: 2_250_000, totalPaise: 3_037_500, appliedImpactBps: 0 }));
    await calculate();
    await screen.findByText("₹30,375.00");
    await act(async () => resolveFirst(response()));
    expect(screen.getByLabelText("Total with starting markup")).toHaveTextContent("₹30,375.00");
    expect(screen.getByText("No low-quantity impact applied.")).toBeVisible();
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    await calculate();
    await userEvent.keyboard("{Escape}");
    view.rerenderEditor({ value: { ...settings, baseRatePaise: 50_000 }, uom: { scopeKey: "second:revision-two", id: "nos", label: "Nos", decimalScale: 0 } });
    await openSimulator();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ revisedUnitRatePaise: 55_000, revisedAmountPaise: 55_000, totalPaise: 74_250, appliedImpactBps: 1_000 }));
    await calculate();
    await screen.findByText("₹742.50");
    await act(async () => resolveFirst(response()));
    expect(screen.getByLabelText("Total with starting markup")).toHaveTextContent("₹742.50");
    expect(previewKnowledge).toHaveBeenLastCalledWith({ modeCalculation: { ...settings, baseRatePaise: 50_000 }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" });
    view.rerenderEditor({ uom: { scopeKey: "third:revision-three", id: "nos", label: "Nos", decimalScale: 0 } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves inactive drafts and closes their simulator before another scope is shown", async () => {
    const view = setup({ value: settings, contextLabel: "Sub-Vendor" });
    let resolvePending!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    await openSimulator();
    expect(screen.getByText("Sub-Vendor calculation simulator")).toBeVisible();
    await calculate();
    view.rerenderEditor({ active: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => resolvePending(response()));
    view.rerenderEditor({ active: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    change("Impact (%)", "12.");
    view.rerenderEditor({ active: false });
    expect(screen.queryByRole("textbox", { name: "Impact (%)" })).not.toBeInTheDocument();
    view.rerenderEditor({ active: true });
    expect(field("Impact (%)")).toHaveValue("12.");
    expect(view.props.onValidationChange).toHaveBeenLastCalledWith(false);
  });

  it("provides distinct calculation landmarks when PMC and Execution are both selected", async () => {
    setup({ value: settings, contextLabel: "PMC" });
    setup({ value: { ...settings, baseRatePaise: 80_000 }, contextLabel: "Sub-Vendor" });
    expect(within(screen.getByRole("region", { name: "PMC calculations" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1500.00");
    expect(within(screen.getByRole("region", { name: "Sub-Vendor calculations" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("800.00");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("allows temporary tests with read-only configuration and supports accessible modal keyboard states", async () => {
    setup({ value: settings, readOnly: true });
    expect(field("Base Rate (₹)")).toBeDisabled();
    expect(field("Impact (%)")).toBeDisabled();
    expect(screen.getByRole("status", { name: "Max Discount" })).toHaveTextContent("10.00%");
    const trigger = screen.getByRole("button", { name: "Test calculations" });
    const dialog = await openSimulator();
    expect(field("Base Rate (₹)")).toBeEnabled();
    expect(field("Impact (%)")).toBeEnabled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    screen.getByRole("radio", { name: "Starting Gross Margin Markup" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Min. Gross Margin Markup" })).toBeChecked();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await calculate();
    await screen.findByRole("status", { name: "Calculation results" });
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
