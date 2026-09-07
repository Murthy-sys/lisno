import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeModeCalculationEditor } from "./KnowledgeModeCalculationEditor";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));

const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const result = { revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 222_750, appliedImpactBps: 1_000 };
function response(modeCalculation = result): KnowledgePreview {
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

  it("keeps configured values on the page and converts rupees and percentages without running a test", () => {
    const { props } = setup();
    expect(field("Base Rate (₹)")).toHaveValue("");
    expect(field("Low Quantity Limit")).toHaveValue("15");
    expect(field("Min. Gross Margin Markup (%)")).toHaveValue("25");
    expect(field("Starting Gross Margin Markup (%)")).toHaveValue("35");
    expect(screen.getByText("Nos")).toBeVisible();
    expect(screen.getByText("10.00%")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Quantity.*test/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Total with starting markup")).not.toBeInTheDocument();
    change("Base Rate (₹)", "1500");
    expect(props.onChange).toHaveBeenLastCalledWith(settings);
    change("Base Rate (₹)", "1500.51");
    change("Starting Gross Margin Markup (%)", "40.25");
    expect(props.onChange).toHaveBeenLastCalledWith({ ...settings, baseRatePaise: 150_051, startingMarkupBps: 4_025 });
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("locks UOM and impact and explicitly calculates either markup without changing configuration", async () => {
    const { props } = setup({ value: settings });
    await openSimulator();
    expect(field("UOM")).toHaveAttribute("readonly");
    expect(field("UOM")).toHaveValue("Nos");
    expect(field("Impact")).toHaveAttribute("readonly");
    expect(field("Impact")).toHaveValue("10.00%");
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
      modeCalculation: { baseRatePaise: 50_000, lowQuantityLimit: "10", minimumMarkupBps: 2_000, startingMarkupBps: 3_000 },
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

  it("allows temporary tests with read-only configuration and supports accessible modal keyboard states", async () => {
    setup({ value: settings, readOnly: true });
    expect(field("Base Rate (₹)")).toBeDisabled();
    const trigger = screen.getByRole("button", { name: "Test calculations" });
    const dialog = await openSimulator();
    expect(field("Base Rate (₹)")).toBeEnabled();
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
