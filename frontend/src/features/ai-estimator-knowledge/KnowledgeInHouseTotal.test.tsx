import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeInHouseTotal } from "./KnowledgeInHouseTotal";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));
const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
const result = { labor: { revisedUnitRatePaise: 45_000, revisedAmountPaise: 45_000, totalPaise: 55_350, appliedImpactBps: 0 },
  material: { revisedUnitRatePaise: 73_288, revisedAmountPaise: 73_288, totalPaise: 99_672, appliedImpactBps: 1_275 }, totalPaise: 155_022 };
function response(inHouseCalculation: NonNullable<KnowledgePreview["inHouseCalculation"]> = result): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null, effectiveUnitRatePaise: null,
    adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null, vendorPreTax: null, vendorTax: null, vendorTotal: null,
    startMargin: null, bottomMargin: null, pmcMarkup: null, duration: null, inHouseCalculation };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeInHouseTotal>> = {}) {
  let props = { active: true, labor, material, valid: true, uom: { scopeKey: "line-one:revision-one", id: "nos", label: "Number", decimalScale: 0 }, ...overrides };
  const view = render(<KnowledgeInHouseTotal {...props} />);
  return { ...view, rerenderTotal(next: Partial<ComponentProps<typeof KnowledgeInHouseTotal>>) {
    props = { ...props, ...next }; view.rerender(<KnowledgeInHouseTotal {...props} />);
  } };
}
async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Test In-house total" }));
  return screen.getByRole("dialog", { name: "Test In-house total" });
}
async function calculate() { await userEvent.click(screen.getByRole("button", { name: "Calculate total" })); }

describe("combined In-house total", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewKnowledge).mockResolvedValue(response()); });

  it("bounds a common discount by both costs and retains the discounted total without changing settings", async () => {
    setup();
    const dialog = await open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    expect(within(dialog).getByText(/Maximum allowed: 15.00%/)).toBeVisible();
    fireEvent.change(discount, { target: { value: "15.01" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    expect(previewKnowledge).not.toHaveBeenCalled();
    fireEvent.change(discount, { target: { value: "5" } });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ totalPaise: 149_107,
      labor: { ...result.labor, totalPaise: 53_100, discount: { rateBps: 500, effectiveMarkupBps: 1_800, totalBeforeDiscountPaise: 55_350, amountPaise: 2_250 } },
      material: { ...result.material, totalPaise: 96_007, discount: { rateBps: 500, effectiveMarkupBps: 3_100, totalBeforeDiscountPaise: 99_672, amountPaise: 3_665 } }
    }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 });
    expect(within(dialog).getByLabelText("Labor + Material total")).toHaveTextContent("₹1,491.07");
    expect(within(dialog).getByText(/Discount: 5.00% · Effective markup: Labor 18.00%, Material 31.00%/)).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Labor + Material total")).toHaveTextContent("₹1,491.07");
    await open();
    expect(screen.getByRole("textbox", { name: "Discount (%)" })).toHaveValue("0");
  });

  it("rechecks the smaller allowance after cost edits and refuses discount metadata missing from either cost", async () => {
    setup();
    const dialog = await open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    fireEvent.change(discount, { target: { value: "5" } });
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return the discount for both costs");
    const materialGroup = within(dialog).getByRole("region", { name: "Material cost" });
    fireEvent.change(within(materialGroup).getByRole("textbox", { name: "Min. Gross Margin Markup (%)" }), { target: { value: "32" } });
    expect(within(dialog).getByText(/Maximum allowed: 4.00%/)).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    await calculate();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin Markup" }));
    expect(within(dialog).getByText(/Maximum allowed: 0.00%/)).toBeVisible();
    expect(within(dialog).queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
  });

  it("waits for both configured costs and a saved UOM instead of treating missing data as zero", () => {
    const view = setup({ material: null });
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    view.rerenderTotal({ material, uom: { scopeKey: "line-one:revision-one", label: "Unavailable", message: "Overview unavailable" } });
    expect(screen.getByText("Overview unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("requests both costs together and retains the backend final sum below the sections after closing", async () => {
    setup();
    const dialog = await open();
    expect(within(dialog).getByRole("textbox", { name: "UOM" })).toHaveAttribute("readonly");
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" });
    expect(within(dialog).getByLabelText("Labor total", { exact: true })).toHaveTextContent("₹553.50");
    expect(within(dialog).getByLabelText("Material total", { exact: true })).toHaveTextContent("₹996.72");
    expect(within(dialog).getByLabelText("Labor + Material total", { exact: true })).toHaveTextContent("₹1,550.22");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Labor + Material total", { exact: true })).toHaveTextContent("₹1,550.22");
    expect(screen.getByText(/Quantity: 1 Number · Starting markup/)).toBeVisible();
  });

  it("uses temporary independent cost edits and a shared quantity/markup choice, including zero totals", async () => {
    setup();
    const dialog = await open();
    const laborGroup = within(dialog).getByRole("region", { name: "Labor cost" });
    fireEvent.change(within(laborGroup).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "500" } });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin Markup" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "0" } });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ labor: { ...result.labor, revisedAmountPaise: 0, totalPaise: 0 }, material: { ...result.material, revisedAmountPaise: 0, totalPaise: 0 }, totalPaise: 0 }));
    await calculate();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor: { ...labor, baseRatePaise: 50_000 }, material }, quantity: "0", quantityScale: 0, modeCalculationMarkupBasis: "minimum" });
    expect(within(dialog).getByLabelText("Labor + Material total", { exact: true })).toHaveTextContent("₹0.00");
    await userEvent.keyboard("{Escape}");
    await open();
    expect(within(screen.getByRole("region", { name: "Labor cost" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("450.00");
    expect(screen.queryByRole("status", { name: "In-house calculation results" })).not.toBeInTheDocument();
  });

  it.each(["labor", "material", "valid", "uom"] as const)("invalidates results and pending requests when %s changes", async (field) => {
    const view = setup();
    await open();
    await calculate();
    await within(screen.getByRole("dialog")).findByText("₹1,550.22");
    let resolve!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await calculate();
    const next = field === "labor" ? { labor: { ...labor, baseRatePaise: 50_000 } }
      : field === "material" ? { material: { ...material, impactBps: 525 } }
        : field === "valid" ? { valid: false } : { uom: { scopeKey: "line-two:revision-two", id: "sqft", label: "Sq.ft", decimalScale: 2 } };
    view.rerenderTotal(next);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => resolve(response()));
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
  });

  it("clears changed inputs, ignores older responses, and shows an error without a partial total", async () => {
    setup();
    const dialog = await open();
    let resolveOld!: (value: KnowledgePreview) => void;
    vi.mocked(previewKnowledge).mockImplementationOnce(() => new Promise((done) => { resolveOld = done; }));
    await calculate();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "2" } });
    await calculate();
    expect(within(dialog).getByLabelText("Labor + Material total")).toHaveTextContent("₹1,550.22");
    await act(async () => resolveOld(response({ ...result, totalPaise: 99_999 })));
    expect(within(dialog).getByLabelText("Labor + Material total")).toHaveTextContent("₹1,550.22");
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Material calculation failed"));
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Material calculation failed");
    expect(within(dialog).queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), inHouseCalculation: undefined });
    await calculate();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The server did not return both costs");
  });

  it("focuses the invalid cost and quantity without making a preview request", async () => {
    setup();
    const dialog = await open();
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    fireEvent.change(quantity, { target: { value: "1.25" } });
    await calculate();
    await waitFor(() => expect(quantity).toHaveFocus());
    fireEvent.change(quantity, { target: { value: "1" } });
    const impact = within(within(dialog).getByRole("region", { name: "Material cost" })).getByRole("textbox", { name: "Impact (%)" });
    fireEvent.change(impact, { target: { value: "-1" } });
    await calculate();
    await waitFor(() => expect(impact).toHaveFocus());
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("closes hidden simulators and provides accessible keyboard and result states", async () => {
    const view = setup();
    const trigger = screen.getByRole("button", { name: "Test In-house total" });
    await open();
    await calculate();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await open();
    view.rerenderTotal({ active: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerenderTotal({ active: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
