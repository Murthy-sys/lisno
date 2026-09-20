import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeInHouseTotal } from "./KnowledgeInHouseTotal";
import { previewKnowledge } from "./knowledgeApi";
import type { KnowledgePreview } from "./knowledgeTypes";
import { SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";

vi.mock("./knowledgeApi", () => ({ previewKnowledge: vi.fn() }));
const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
type CostSettings = typeof labor;
function halfUp(numerator: bigint, denominator: bigint) { return (numerator + denominator / 2n) / denominator; }
function scaled(value: string, scale: number) {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
}
function costResult(configuration: CostSettings, quantity: string, scale: number, basis: "starting" | "minimum", discountBps: number) {
  const factor = 10n ** BigInt(scale);
  const appliedImpactBps = scaled(quantity, scale) <= scaled(configuration.lowQuantityLimit, scale) ? configuration.impactBps : 0;
  const revisedUnitRatePaise = Number(halfUp(BigInt(configuration.baseRatePaise) * BigInt(10_000 + appliedImpactBps), 10_000n));
  const revisedAmountPaise = Number(halfUp(BigInt(revisedUnitRatePaise) * scaled(quantity, scale), factor));
  const price = (marginBps: number) => Number(halfUp(BigInt(revisedAmountPaise) * 10_000n, 10_000n - BigInt(marginBps)));
  const floorPricePaise = price(configuration.minimumMarkupBps);
  const totalBeforeDiscountPaise = price(basis === "starting" ? configuration.startingMarkupBps : configuration.minimumMarkupBps);
  const maximumDiscountBps = totalBeforeDiscountPaise === 0 ? 0
    : Math.floor(((totalBeforeDiscountPaise - floorPricePaise) * 10_000) / totalBeforeDiscountPaise);
  const amountPaise = Number(halfUp(BigInt(totalBeforeDiscountPaise) * BigInt(discountBps), 10_000n));
  return { revisedUnitRatePaise, revisedAmountPaise, floorPricePaise, maximumDiscountBps,
    discountBasis: "selling_price" as const, totalPaise: totalBeforeDiscountPaise - amountPaise, appliedImpactBps,
    ...(discountBps > 0 ? { discount: { rateBps: discountBps, totalBeforeDiscountPaise, amountPaise } } : {}) };
}
function inHouseResult({ laborSettings = labor, materialSettings = material, quantity = "1", scale = 0,
  basis = "starting", discountBps = 0 }: {
  readonly laborSettings?: CostSettings;
  readonly materialSettings?: CostSettings;
  readonly quantity?: string;
  readonly scale?: number;
  readonly basis?: "starting" | "minimum";
  readonly discountBps?: number;
} = {}) {
  const laborResult = costResult(laborSettings, quantity, scale, basis, discountBps);
  const materialResult = costResult(materialSettings, quantity, scale, basis, discountBps);
  return { labor: laborResult, material: materialResult, totalPaise: laborResult.totalPaise + materialResult.totalPaise };
}
const result = inHouseResult();
const transportOptions = { signal: expect.any(AbortSignal), showGlobalLoader: false };
function response(inHouseCalculation: NonNullable<KnowledgePreview["inHouseCalculation"]> = result): KnowledgePreview {
  return { formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null, effectiveUnitRatePaise: null,
    adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null, vendorPreTax: null, vendorTax: null, vendorTotal: null,
    startMargin: null, bottomMargin: null, pmcMarkup: null, duration: null, inHouseCalculation };
}
function deferred() {
  let resolve!: (value: KnowledgePreview) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<KnowledgePreview>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeInHouseTotal>> = {}, strict = false) {
  let props = { active: true, labor, material, valid: true, uom: { scopeKey: "line-one:revision-one", id: "nos", label: "Number", decimalScale: 0 }, ...overrides };
  const content = () => strict ? <StrictMode><KnowledgeInHouseTotal {...props} /></StrictMode> : <KnowledgeInHouseTotal {...props} />;
  const view = render(content());
  return { ...view, rerenderTotal(next: Partial<ComponentProps<typeof KnowledgeInHouseTotal>>) {
    props = { ...props, ...next }; view.rerender(content());
  } };
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Test In-house total" }));
  return screen.getByRole("dialog", { name: "Test In-house total" });
}
function close(dialog: HTMLElement) { fireEvent.click(within(dialog).getByRole("button", { name: "Close" })); }
async function advance(milliseconds = 300) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
function expectBothTotals(value: string) {
  const totals = screen.getAllByLabelText("Subtotal", { exact: true });
  expect(totals).toHaveLength(2);
  for (const total of totals) expect(total).toHaveTextContent(value);
}

describe("combined In-house total", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(previewKnowledge).mockReset().mockResolvedValue(response()); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("calculates once on opening after 300 ms without a Calculate button, submit request or rerender loop", async () => {
    const view = setup({}, true);
    const dialog = open();
    expect(within(dialog).queryByRole("button", { name: "Calculate total" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Calculations update automatically/)).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "UOM" })).toHaveAttribute("readonly");
    expect(within(dialog).getByText("Updating calculation…")).toBeVisible();
    await advance(299);
    expect(previewKnowledge).not.toHaveBeenCalled();
    expect(fireEvent.submit(dialog.querySelector("form")!)).toBe(false);
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledExactlyOnceWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
    expect(within(dialog).getByLabelText("Labour expense", { exact: true })).toHaveTextContent("₹450.00");
    expect(within(dialog).getByLabelText("Margin on labour", { exact: true })).toHaveTextContent("₹134.42");
    expect(within(dialog).getByLabelText("Material expense", { exact: true })).toHaveTextContent("₹732.88");
    expect(within(dialog).getByLabelText("Margin on material", { exact: true })).toHaveTextContent("₹412.25");
    expectBothTotals("₹1,729.55");
    view.rerenderTotal({ labor: { ...labor }, material: { ...material } });
    fireEvent.submit(dialog.querySelector("form")!);
    await advance(1_000);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    close(dialog);
    expect(screen.getByLabelText("Subtotal", { exact: true })).toHaveTextContent("₹1,729.55");
    expect(screen.getByText(/Quantity: 1 Number · Starting Gross Margin/)).toBeVisible();
  });

  it("debounces rapid quantity edits and immediately clears both accepted summaries", async () => {
    setup();
    const dialog = open();
    await advance();
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    fireEvent.change(quantity, { target: { value: "2" } });
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    await advance(200);
    fireEvent.change(quantity, { target: { value: "20" } });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(inHouseResult({ quantity: "20" })));
    await advance(299);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "20", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
    expectBothTotals("₹32,000.81");
  });

  it("bounds a common discount by both costs and retains the discounted total without changing settings", async () => {
    setup();
    const dialog = open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    await advance();
    expect(within(dialog).getByText(/Maximum selling-price discount: 16.30%/)).toBeVisible();
    const callsAtLimit = vi.mocked(previewKnowledge).mock.calls.length;
    fireEvent.change(discount, { target: { value: "16.31" } });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(previewKnowledge).toHaveBeenCalledTimes(callsAtLimit);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ totalPaise: 164_307,
      labor: { ...result.labor, totalPaise: 55_520, discount: { rateBps: 500, totalBeforeDiscountPaise: 58_442, amountPaise: 2_922 } },
      material: { ...result.material, totalPaise: 108_787, discount: { rateBps: 500, totalBeforeDiscountPaise: 114_513, amountPaise: 5_726 } }
    }));
    fireEvent.change(discount, { target: { value: "5" } });
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 }, transportOptions);
    expectBothTotals("₹1,643.07");
    expect(within(dialog).getByText(/Selling-price discount: 5.00%/)).toBeVisible();
    expect(within(dialog).queryByText(/Effective markup/)).not.toBeInTheDocument();
    close(dialog);
    expect(screen.getByLabelText("Subtotal")).toHaveTextContent("₹1,643.07");
    open();
    expect(screen.getByRole("textbox", { name: "Discount (%)" })).toHaveValue("0");
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
  });

  it("rechecks the smaller amount-aware cap after cost edits and makes the Minimum basis cap zero", async () => {
    setup();
    const dialog = open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    await advance();
    expect(within(dialog).getByText(/Maximum selling-price discount: 16.30%/)).toBeVisible();
    const materialGroup = within(dialog).getByRole("region", { name: "Material cost" });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...result,
      material: { ...result.material, floorPricePaise: 112_751, maximumDiscountBps: 153 }
    }));
    fireEvent.change(within(materialGroup).getByRole("textbox", { name: "Min. Gross Margin (%)" }), { target: { value: "35" } });
    expect(within(dialog).queryByRole("button", { name: "Retry calculation" })).not.toBeInTheDocument();
    await advance();
    expect(within(dialog).getByText(/Maximum selling-price discount: 1.53%/)).toBeVisible();
    const callsAtLimit = vi.mocked(previewKnowledge).mock.calls.length;
    fireEvent.change(discount, { target: { value: "1.54" } });
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(previewKnowledge).toHaveBeenCalledTimes(callsAtLimit);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({
      labor: { ...result.labor, totalPaise: 48_913, maximumDiscountBps: 0 },
      material: { ...result.material, floorPricePaise: 112_751, maximumDiscountBps: 0, totalPaise: 112_751 },
      totalPaise: 161_664
    }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin" }));
    await advance();
    expect(within(dialog).getByText(/Maximum selling-price discount: 0.00%/)).toBeVisible();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
  });

  it("waits for both configured costs and a saved UOM instead of treating missing data as zero", async () => {
    const view = setup({ material: null });
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    view.rerenderTotal({ material, uom: { scopeKey: "line-one:revision-one", label: "Unavailable", message: "Overview unavailable" } });
    expect(screen.getByText("Overview unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    await advance(1_000);
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("uses temporary independent cost edits and a shared Gross Margin choice, including zero totals", async () => {
    setup();
    const dialog = open();
    const laborGroup = within(dialog).getByRole("region", { name: "Labor cost" });
    fireEvent.change(within(laborGroup).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "0" } });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response(inHouseResult({
      laborSettings: { ...labor, baseRatePaise: 50_000 }, quantity: "0", basis: "minimum"
    })));
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor: { ...labor, baseRatePaise: 50_000 }, material }, quantity: "0", quantityScale: 0, modeCalculationMarkupBasis: "minimum" }, transportOptions);
    expectBothTotals("₹0.00");
    close(dialog);
    open();
    expect(within(screen.getByRole("region", { name: "Labor cost" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("450.00");
    expect(screen.getByRole("radio", { name: "Starting Gross Margin" })).toBeChecked();
    expect(screen.queryByRole("status", { name: "In-house calculation results" })).not.toBeInTheDocument();
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
  });

  it.each(["labor", "material", "valid", "scope", "uom", "precision"] as const)("invalidates results and pending requests when %s changes", async (field) => {
    const view = setup();
    const dialog = open();
    await advance();
    expectBothTotals("₹1,729.55");
    const pending = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(pending.promise);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "2" } });
    await advance();
    const signal = vi.mocked(previewKnowledge).mock.calls[1]![1]!.signal!;
    const next = field === "labor" ? { labor: { ...labor, baseRatePaise: 50_000 } }
      : field === "material" ? { material: { ...material, impactBps: 525 } }
        : field === "valid" ? { valid: false }
          : { uom: { scopeKey: field === "scope" ? "line-two:revision-two" : "line-one:revision-one", id: field === "uom" ? "sqft" : "nos", label: "Number", decimalScale: field === "precision" ? 2 : 0 } };
    view.rerenderTotal(next);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response()));
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
  });

  it.each(["success", "failure"] as const)("ignores stale %s while the latest request controls both totals and loading", async (outcome) => {
    const obsolete = deferred();
    const latest = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(latest.promise);
    setup();
    const dialog = open();
    await advance();
    const signal = vi.mocked(previewKnowledge).mock.calls[0]![1]!.signal!;
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    quantity.focus();
    fireEvent.change(quantity, { target: { value: "2" } });
    expect(signal.aborted).toBe(true);
    await advance();
    expect(within(dialog).getByText("Calculating both costs…")).toBeVisible();
    expect(quantity).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeEnabled();
    await act(async () => outcome === "success" ? obsolete.resolve(response({ ...result, totalPaise: 99_999 })) : obsolete.reject(new Error("Old material failure")));
    expect(within(dialog).getByText("Calculating both costs…")).toBeVisible();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    await act(async () => latest.resolve(response(inHouseResult({ quantity: "2" }))));
    expectBothTotals("₹3,459.08");
    expect(within(dialog).queryByText("Calculating both costs…")).not.toBeInTheDocument();
  });

  it("keeps a newer result when an older response resolves afterward", async () => {
    const old = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(old.promise);
    setup();
    const dialog = open();
    await advance();
    vi.mocked(previewKnowledge).mockResolvedValue(response(inHouseResult({ quantity: "2" })));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "2" } });
    await advance();
    expectBothTotals("₹3,459.08");
    await act(async () => old.resolve(response({ ...result, totalPaise: 99_999 })));
    expectBothTotals("₹3,459.08");
  });

  it.each(["", "1.25"])("pauses invalid quantity %j, rejects a pending response and resumes after correction without moving focus", async (invalidQuantity) => {
    const pending = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(pending.promise);
    setup();
    const dialog = open();
    await advance();
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    quantity.focus();
    fireEvent.change(quantity, { target: { value: invalidQuantity } });
    await act(async () => pending.resolve(response()));
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    await advance();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveFocus();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    fireEvent.change(quantity, { target: { value: "1" } });
    const impact = within(within(dialog).getByRole("region", { name: "Material cost" })).getByRole("textbox", { name: "Impact (%)" });
    fireEvent.change(impact, { target: { value: "-1" } });
    await advance();
    expect(impact).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveFocus();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    fireEvent.change(impact, { target: { value: "12.75" } });
    await advance();
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    expectBothTotals("₹1,729.55");
    expect(quantity).toHaveFocus();
  });

  it("offers an explicit retry for current failures and rejects incomplete totals without automatically retrying", async () => {
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Material calculation failed"));
    setup();
    const dialog = open();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Material calculation failed");
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    await advance(2_000);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    vi.mocked(previewKnowledge).mockResolvedValueOnce({ ...response(), inHouseCalculation: undefined });
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry calculation" }));
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The server did not return both costs");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry calculation" }));
    await advance();
    expect(previewKnowledge).toHaveBeenCalledTimes(3);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
    expectBothTotals("₹1,729.55");
  });

  it("rejects backend totals that do not reconcile expense plus margin", async () => {
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ ...result, totalPaise: result.totalPaise + 1 }));
    setup();
    const dialog = open();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("inconsistent In-house cost breakup");
    expect(within(dialog).getByRole("button", { name: "Retry calculation" })).toBeVisible();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
  });

  it("rejects a combined response whose self-consistent component expense does not match the requested inputs", async () => {
    const tamperedLabor = costResult({ ...labor, baseRatePaise: 46_000 }, "1", 0, "starting", 0);
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({
      labor: tamperedLabor,
      material: result.material,
      totalPaise: tamperedLabor.totalPaise + result.material.totalPaise
    }));
    setup();
    const dialog = open();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("incomplete or inconsistent In-house calculation");
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
  });

  it("cancels scheduled and in-flight work on close and prevents old responses from reaching a reopened summary", async () => {
    setup();
    close(open());
    await advance();
    expect(previewKnowledge).not.toHaveBeenCalled();
    const pending = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(pending.promise);
    const dialog = open();
    await advance();
    close(dialog);
    expect(vi.mocked(previewKnowledge).mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    open();
    await advance();
    expectBothTotals("₹1,729.55");
    await act(async () => pending.resolve(response({ ...result, totalPaise: 99_999 })));
    expectBothTotals("₹1,729.55");
  });

  it("closes hidden simulators and provides accessible keyboard and result states", async () => {
    vi.useRealTimers();
    const view = setup();
    const trigger = screen.getByRole("button", { name: "Test In-house total" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Test In-house total" });
    await within(dialog).findByLabelText("Subtotal");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    open();
    view.rerenderTotal({ active: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerenderTotal({ active: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
