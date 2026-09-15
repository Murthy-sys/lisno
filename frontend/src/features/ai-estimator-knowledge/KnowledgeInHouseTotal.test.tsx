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
const result = { labor: { revisedUnitRatePaise: 45_000, revisedAmountPaise: 45_000, totalPaise: 55_350, appliedImpactBps: 0 },
  material: { revisedUnitRatePaise: 73_288, revisedAmountPaise: 73_288, totalPaise: 99_672, appliedImpactBps: 1_275 }, totalPaise: 155_022 };
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
  const totals = screen.getAllByLabelText("Labor + Material total", { exact: true });
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
    expect(within(dialog).getByLabelText("Labor total", { exact: true })).toHaveTextContent("₹553.50");
    expect(within(dialog).getByLabelText("Material total", { exact: true })).toHaveTextContent("₹996.72");
    expectBothTotals("₹1,550.22");
    view.rerenderTotal({ labor: { ...labor }, material: { ...material } });
    fireEvent.submit(dialog.querySelector("form")!);
    await advance(1_000);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    close(dialog);
    expect(screen.getByLabelText("Labor + Material total", { exact: true })).toHaveTextContent("₹1,550.22");
    expect(screen.getByText(/Quantity: 1 Number · Starting markup/)).toBeVisible();
  });

  it("debounces rapid quantity edits and immediately clears both accepted summaries", async () => {
    setup();
    const dialog = open();
    await advance();
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    fireEvent.change(quantity, { target: { value: "2" } });
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    await advance(200);
    fireEvent.change(quantity, { target: { value: "20" } });
    await advance(299);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(previewKnowledge).toHaveBeenCalledTimes(2);
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "20", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
    expectBothTotals("₹1,550.22");
  });

  it("bounds a common discount by both costs and retains the discounted total without changing settings", async () => {
    setup();
    const dialog = open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    expect(within(dialog).getByText(/Maximum allowed: 15.00%/)).toBeVisible();
    fireEvent.change(discount, { target: { value: "15.01" } });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(previewKnowledge).not.toHaveBeenCalled();
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ totalPaise: 149_107,
      labor: { ...result.labor, totalPaise: 53_100, discount: { rateBps: 500, effectiveMarkupBps: 1_800, totalBeforeDiscountPaise: 55_350, amountPaise: 2_250 } },
      material: { ...result.material, totalPaise: 96_007, discount: { rateBps: 500, effectiveMarkupBps: 3_100, totalBeforeDiscountPaise: 99_672, amountPaise: 3_665 } }
    }));
    fireEvent.change(discount, { target: { value: "5" } });
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 }, transportOptions);
    expectBothTotals("₹1,491.07");
    expect(within(dialog).getByText(/Discount: 5.00% · Effective markup: Labor 18.00%, Material 31.00%/)).toBeVisible();
    close(dialog);
    expect(screen.getByLabelText("Labor + Material total")).toHaveTextContent("₹1,491.07");
    open();
    expect(screen.getByRole("textbox", { name: "Discount (%)" })).toHaveValue("0");
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
  });

  it("rechecks the smaller allowance after cost edits and refuses discount metadata missing from either cost", async () => {
    setup();
    const dialog = open();
    const discount = within(dialog).getByRole("textbox", { name: "Discount (%)" });
    fireEvent.change(discount, { target: { value: "5" } });
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("did not return the discount for both costs");
    const materialGroup = within(dialog).getByRole("region", { name: "Material cost" });
    fireEvent.change(within(materialGroup).getByRole("textbox", { name: "Min. Gross Margin Markup (%)" }), { target: { value: "32" } });
    expect(within(dialog).queryByRole("button", { name: "Retry calculation" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Maximum allowed: 4.00%/)).toBeVisible();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin Markup" }));
    await advance();
    expect(within(dialog).getByText(/Maximum allowed: 0.00%/)).toBeVisible();
    expect(previewKnowledge).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
  });

  it("waits for both configured costs and a saved UOM instead of treating missing data as zero", async () => {
    const view = setup({ material: null });
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    view.rerenderTotal({ material, uom: { scopeKey: "line-one:revision-one", label: "Unavailable", message: "Overview unavailable" } });
    expect(screen.getByText("Overview unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    await advance(1_000);
    expect(previewKnowledge).not.toHaveBeenCalled();
  });

  it("uses temporary independent cost edits and a shared quantity/markup choice, including zero totals", async () => {
    setup();
    const dialog = open();
    const laborGroup = within(dialog).getByRole("region", { name: "Labor cost" });
    fireEvent.change(within(laborGroup).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Min. Gross Margin Markup" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "0" } });
    vi.mocked(previewKnowledge).mockResolvedValueOnce(response({ labor: { ...result.labor, revisedAmountPaise: 0, totalPaise: 0 }, material: { ...result.material, revisedAmountPaise: 0, totalPaise: 0 }, totalPaise: 0 }));
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor: { ...labor, baseRatePaise: 50_000 }, material }, quantity: "0", quantityScale: 0, modeCalculationMarkupBasis: "minimum" }, transportOptions);
    expectBothTotals("₹0.00");
    close(dialog);
    open();
    expect(within(screen.getByRole("region", { name: "Labor cost" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("450.00");
    expect(screen.getByRole("radio", { name: "Starting Gross Margin Markup" })).toBeChecked();
    expect(screen.queryByRole("status", { name: "In-house calculation results" })).not.toBeInTheDocument();
    await advance();
    expect(previewKnowledge).toHaveBeenLastCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0, modeCalculationMarkupBasis: "starting" }, transportOptions);
  });

  it.each(["labor", "material", "valid", "scope", "uom", "precision"] as const)("invalidates results and pending requests when %s changes", async (field) => {
    const view = setup();
    const dialog = open();
    await advance();
    expectBothTotals("₹1,550.22");
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
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    await act(async () => latest.resolve(response()));
    expectBothTotals("₹1,550.22");
    expect(within(dialog).queryByText("Calculating both costs…")).not.toBeInTheDocument();
  });

  it("keeps a newer result when an older response resolves afterward", async () => {
    const old = deferred();
    vi.mocked(previewKnowledge).mockReturnValueOnce(old.promise);
    setup();
    const dialog = open();
    await advance();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Quantity" }), { target: { value: "2" } });
    await advance();
    expectBothTotals("₹1,550.22");
    await act(async () => old.resolve(response({ ...result, totalPaise: 99_999 })));
    expectBothTotals("₹1,550.22");
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
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
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
    expectBothTotals("₹1,550.22");
    expect(quantity).toHaveFocus();
  });

  it("offers an explicit retry for current failures and rejects incomplete totals without automatically retrying", async () => {
    vi.mocked(previewKnowledge).mockRejectedValueOnce(new Error("Material calculation failed"));
    setup();
    const dialog = open();
    await advance();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Material calculation failed");
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
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
    expectBothTotals("₹1,550.22");
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
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    open();
    await advance();
    expectBothTotals("₹1,550.22");
    await act(async () => pending.resolve(response({ ...result, totalPaise: 99_999 })));
    expectBothTotals("₹1,550.22");
  });

  it("closes hidden simulators and provides accessible keyboard and result states", async () => {
    vi.useRealTimers();
    const view = setup();
    const trigger = screen.getByRole("button", { name: "Test In-house total" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Test In-house total" });
    await within(dialog).findByLabelText("Labor + Material total");
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
