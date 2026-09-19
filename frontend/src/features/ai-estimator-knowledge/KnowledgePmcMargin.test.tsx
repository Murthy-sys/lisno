import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgePmcMarginRange, KnowledgeSubVendorMarginRange } from "./KnowledgePmcMarginInput";
import { pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues, withPmcMargin, withSubVendorMargin } from "./knowledgePmcMargin";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function Harness({ initial = {}, readOnly = false, onChange = vi.fn(), onValidationChange = vi.fn() }: {
  initial?: KnowledgeJsonObject; readOnly?: boolean;
  onChange?: (payload: KnowledgeJsonObject) => void; onValidationChange?: (valid: boolean) => void;
}) {
  const [payload, setPayload] = useState(initial);
  return <main><KnowledgeModeConfigurationBuilder mainLineName="TV Unit" payload={payload} modes={[]}
    readOnly={readOnly} validationAttempt={0} onDirty={vi.fn()} onValidationChange={onValidationChange}
    onChange={(next) => { setPayload(next); onChange(next); }} /></main>;
}

async function showExecution(user: ReturnType<typeof userEvent.setup> = userEvent.setup()) {
  const control = screen.getByRole("checkbox", { name: "Execution" });
  if (!(control as HTMLInputElement).checked) await user.click(control);
  const subVendor = screen.getByRole("checkbox", { name: "Sub-Vendor" });
  if (!(subVendor as HTMLInputElement).checked) await user.click(subVendor);
}

describe("PMC Margin range", () => {
  it("rejects an explicit minimum without an owned maximum, including an empty minimum", () => {
    expect(pmcMarginRangeIssues({ pmcMinimumMarginBps: null })).toContainEqual({
      path: "pmcMarginBps",
      message: "Enter the maximum PMC margin, or clear both margins."
    });
    expect(pmcMarginRangeIssues({ pmcMinimumMarginBps: 1_500 })).toContainEqual({
      path: "pmcMarginBps",
      message: "Enter the maximum PMC margin, or clear both margins."
    });
  });

  it("opens a legacy single value as an equal pair without writing", async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ pmcMarginBps: 1_525 }} onChange={onChange} />);
    for (const label of ["Min.", "Max."]) {
      const input = screen.getByRole("spinbutton", { name: `${label} PMC Margin (%)` });
      expect(input).toHaveValue(15.25);
      expect(input).toHaveAttribute("min", "10");
      expect(input).toHaveAttribute("max", "20");
      expect(input).toHaveAttribute("step", "0.01");
      expect(input).toHaveAccessibleDescription("Allowed: 10%–20% · Up to 2 decimal places · Min. ≤ Max.");
    }
    expect(onChange).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("materializes both effective values on the first legacy edit", () => {
    const onChange = vi.fn();
    render(<Harness initial={{ modeDescription: "Keep", pmcMarginBps: 1_525 }} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" }), { target: { value: "12.5" } });
    expect(onChange).toHaveBeenLastCalledWith({ modeDescription: "Keep", pmcMinimumMarginBps: 1_250, pmcMarginBps: 1_525 });
  });

  it("validates the 10–20% pair and preserves typed invalid values", () => {
    const onValidationChange = vi.fn();
    render(<Harness initial={{ pmcMinimumMarginBps: 1_500, pmcMarginBps: 2_000 }} onValidationChange={onValidationChange} />);
    const minimum = screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" });
    fireEvent.change(minimum, { target: { value: "20.01" } });
    expect(minimum).toHaveValue(20.01);
    expect(minimum).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a minimum PMC margin from 10% to 20%");
    fireEvent.change(minimum, { target: { value: "19.99" } });
    expect(minimum).not.toHaveAttribute("aria-invalid");
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("renders saved Min/Max values in read-only and conflict review", () => {
    const payload = { pmcMinimumMarginBps: 1_250, pmcMarginBps: 1_800 };
    const view = render(<Harness initial={payload} readOnly />);
    expect(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" })).toHaveValue(12.5);
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
    expect(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" })).toBeDisabled();
    view.unmount();
    render(<KnowledgeConflictReview sectionKey="advanced" payload={payload}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]} />);
    expect(screen.getByText("Min. PMC Margin")).toBeVisible();
    expect(screen.getByText("Max. PMC Margin")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
    expect(screen.getByText("18.00%")).toBeVisible();
  });
});

describe("Sub-Vendor Lisno Margin range", () => {
  it("opens legacy data as equal values without writing and uses one accessible range hint", async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ subVendorMarginBps: 1_500 }} onChange={onChange} />);
    await showExecution();
    for (const label of ["Min.", "Max."]) {
      const input = screen.getByRole("spinbutton", { name: `${label} Lisno Margin (%)` });
      expect(input).toHaveValue(15);
      expect(input).toHaveAttribute("min", "0");
      expect(input).toHaveAttribute("max", "95");
      expect(input).not.toHaveAttribute("placeholder");
      expect(input).toHaveAttribute("step", "5");
      expect(input).toHaveAccessibleDescription("Multiples of 5% · Min. ≤ Max.");
    }
    expect(screen.getAllByText("Multiples of 5% · Min. ≤ Max.")).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("accepts historical 10% without repair or an implicit write", async () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ subVendorMarginBps: 1_000 }} onChange={onChange} onValidationChange={onValidationChange} />);
    await showExecution();
    for (const label of ["Min.", "Max."]) {
      const input = screen.getByRole("spinbutton", { name: `${label} Lisno Margin (%)` });
      expect(input).toHaveValue(10);
      expect(input).not.toHaveAttribute("aria-invalid");
    }
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([[10, 35], [0, 95]])("retains the configured %i%% / %i%% pair without changing PMC", async (minimum, maximum) => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ pmcMarginBps: 1_225 }} onChange={onChange} onValidationChange={onValidationChange} />);
    await showExecution();
    const min = screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" });
    const max = screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" });
    fireEvent.change(min, { target: { value: String(minimum) } });
    fireEvent.change(max, { target: { value: String(maximum) } });
    expect(min).toHaveValue(minimum);
    expect(max).toHaveValue(maximum);
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_225,
      subVendorMinimumMarginBps: minimum * 100, subVendorMarginBps: maximum * 100 });
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(12.25);
  });

  it.each(["Min.", "Max."])("freezes the other legacy value when first editing %s", async (label) => {
    const onChange = vi.fn();
    render(<Harness initial={{ pmcMarginBps: 1_250, subVendorMarginBps: 1_750 }} onChange={onChange} />);
    await showExecution();
    fireEvent.change(screen.getByRole("spinbutton", { name: `${label} Lisno Margin (%)` }), { target: { value: label === "Min." ? "15" : "20" } });
    expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250,
      subVendorMinimumMarginBps: label === "Min." ? 1_500 : 1_750,
      subVendorMarginBps: label === "Max." ? 2_000 : 1_750 });
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(12.5);
  });

  it.each([1_750])("keeps historical %i basis points visible until both margins are corrected", async (legacyMargin) => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ subVendorMarginBps: legacyMargin }} onChange={onChange} onValidationChange={onValidationChange} />);
    await showExecution();
    const min = screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" });
    const max = screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" });
    expect(min).toHaveValue(legacyMargin / 100);
    expect(max).toHaveValue(legacyMargin / 100);
    expect(min).toHaveAttribute("aria-invalid", "true");
    expect(max).toHaveAttribute("aria-invalid", "true");
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(max, { target: { value: "20" } });
    expect(min).toHaveValue(legacyMargin / 100);
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(min, { target: { value: "15.00" } });
    expect(onChange).toHaveBeenLastCalledWith({ subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000 });
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
    expect(min).not.toHaveAttribute("aria-invalid");
    expect(max).not.toHaveAttribute("aria-invalid");
  });

  it.each(["Min.", "Max."])("rejects typed non-multiples in %s without replacing the input", async (label) => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000 }}
      onValidationChange={onValidationChange} />);
    await showExecution(user);
    const input = screen.getByRole("spinbutton", { name: `${label} Lisno Margin (%)` });
    for (const value of ["12.5", "17", "18", "17.5"]) {
      await user.clear(input);
      await user.type(input, value);
      expect(input).toHaveValue(Number(value));
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
    }
    await user.clear(input);
    await user.type(input, "15.00");
    expect(input).toHaveValue(15);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("retains empty, partial, reversed and invalid values so users can repair the pair", async () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ pmcMarginBps: 1_250 }} onChange={onChange} onValidationChange={onValidationChange} />);
    await showExecution();
    const min = screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" });
    const max = screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" });
    expect(min).toHaveValue(null);
    expect(max).toHaveValue(null);
    fireEvent.change(max, { target: { value: "20" } });
    expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250, subVendorMinimumMarginBps: null, subVendorMarginBps: 2_000 });
    expect(min).toHaveAttribute("aria-invalid", "true");
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    for (const [value, bps] of [["0", 0], ["5", 500], ["10", 1000], ["15", 1500], ["15.00", 1500], ["20", 2000]] as const) {
      fireEvent.change(min, { target: { value } });
      expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250, subVendorMinimumMarginBps: bps, subVendorMarginBps: 2_000 });
      expect(onValidationChange).toHaveBeenLastCalledWith(true);
    }
    fireEvent.change(max, { target: { value: "15" } });
    expect(min).toHaveAttribute("aria-invalid", "true");
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("alert")).toHaveTextContent("Minimum Lisno margin must not exceed maximum Lisno margin.");
    for (const value of ["-1", "14.99", "16", "17.5", "20.01", "99", "100", "105", "12.345", "90071992547409.92"]) {
      fireEvent.change(min, { target: { value } });
      expect(min).toHaveValue(Number(value));
      expect(min).toHaveAttribute("aria-invalid", "true");
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a minimum Lisno margin from 0% to 95% in multiples of 5%.");
    }
    fireEvent.change(min, { target: { value: "" } });
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(max, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250, subVendorMinimumMarginBps: null, subVendorMarginBps: null });
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("shows saved ranges in read-only and conflict views with Lisno labels", async () => {
    const onChange = vi.fn();
    const payload = { pmcMarginBps: 1_250, subVendorMinimumMarginBps: 1_000, subVendorMarginBps: 3_500 };
    const view = render(<Harness initial={payload} readOnly onChange={onChange} />);
    await showExecution();
    expect(screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" })).toHaveValue(35);
    expect(screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
    render(<KnowledgeConflictReview sectionKey="advanced" payload={payload}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]} />);
    expect(screen.getByText("Min. Lisno Margin")).toBeVisible();
    expect(screen.getByText("Max. Lisno Margin")).toBeVisible();
    expect(screen.getByText("10.00%")).toBeVisible();
    expect(screen.getByText("35.00%")).toBeVisible();
    expect(screen.getAllByText("12.50%")).toHaveLength(2);
  });

  it("restores both controls on discard and accepts updated controlled values", () => {
    const props = { minimum: 1_100, maximum: 1_700, readOnly: false, errors: {}, onChange: vi.fn(), onFieldRef: vi.fn() };
    const view = render(<KnowledgeSubVendorMarginRange {...props} key="draft" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" }), { target: { value: "12.345" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" }), { target: { value: "" } });
    expect(props.onChange).toHaveBeenNthCalledWith(1, "minimum", "12.345");
    expect(props.onChange).toHaveBeenNthCalledWith(2, "maximum", null);
    view.rerender(<KnowledgeSubVendorMarginRange {...props} key="discard" />);
    expect(screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" })).toHaveValue(11);
    expect(screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" })).toHaveValue(17);
    view.rerender(<KnowledgeSubVendorMarginRange {...props} minimum={1_500} maximum={2_000} key="discard" />);
    expect(screen.getByRole("spinbutton", { name: "Min. Lisno Margin (%)" })).toHaveValue(15);
    expect(screen.getByRole("spinbutton", { name: "Max. Lisno Margin (%)" })).toHaveValue(20);
  });
});

describe("PMC margin compatibility helpers", () => {
  it("preserves legacy absence and materializes an equal pair only on edit", () => {
    expect(pmcMarginRange({})).toEqual({ minimum: undefined, maximum: undefined });
    expect(pmcMarginRange({ pmcMarginBps: 1_800 })).toEqual({ minimum: 1_800, maximum: 1_800 });
    expect(withPmcMargin({ pmcMarginBps: 1_800 }, "maximum", 1_900)).toEqual({ pmcMinimumMarginBps: 1_800, pmcMarginBps: 1_900 });
    expect(withPmcMargin({}, "minimum", 1_000)).toEqual({ pmcMinimumMarginBps: 1_000, pmcMarginBps: null });
  });

  it("rejects partial, reversed and out-of-domain pairs", () => {
    expect(pmcMarginRangeIssues({ pmcMinimumMarginBps: null, pmcMarginBps: 1_500 })).not.toEqual([]);
    expect(pmcMarginRangeIssues({ pmcMinimumMarginBps: 1_900, pmcMarginBps: 1_800 })).toEqual([
      { path: "pmcMinimumMarginBps", message: "Minimum PMC margin must not exceed maximum PMC margin." }
    ]);
    expect(pmcMarginRangeIssues({ pmcMinimumMarginBps: 999, pmcMarginBps: 2_001 })).toHaveLength(2);
  });

  it("restores the controlled PMC pair after invalid local text", () => {
    const props = { minimum: 1_100, maximum: 1_700, readOnly: false, errors: {}, onChange: vi.fn(), onFieldRef: vi.fn() };
    const view = render(<KnowledgePmcMarginRange {...props} key="draft" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" }), { target: { value: "12.345" } });
    expect(props.onChange).toHaveBeenCalledWith("minimum", "12.345");
    view.rerender(<KnowledgePmcMarginRange {...props} key="discard" />);
    expect(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" })).toHaveValue(11);
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(17);
  });
});

describe("Lisno margin compatibility helpers", () => {
  it("preserves absence, explicit null and invalid data without coercion", () => {
    expect(subVendorMarginRange({})).toEqual({ minimum: undefined, maximum: undefined });
    expect(subVendorMarginRange({ subVendorMarginBps: 1_800 })).toEqual({ minimum: 1_800, maximum: 1_800 });
    expect(subVendorMarginRange({ subVendorMinimumMarginBps: null, subVendorMarginBps: 1_800 })).toEqual({ minimum: null, maximum: 1_800 });
    expect(subVendorMarginRange({ subVendorMinimumMarginBps: "12.345", subVendorMarginBps: 1_800 })).toEqual({ minimum: "12.345", maximum: 1_800 });
    const original = { modeDescription: "Preserve", subVendorMarginBps: 1_800 };
    expect(withSubVendorMargin(original, "maximum", 2_000)).toEqual({ ...original, subVendorMinimumMarginBps: 1_800, subVendorMarginBps: 2_000 });
    expect(original).toEqual({ modeDescription: "Preserve", subVendorMarginBps: 1_800 });
    expect(withSubVendorMargin({}, "minimum", 1_000)).toEqual({ subVendorMinimumMarginBps: 1_000, subVendorMarginBps: null });
  });

  it.each<KnowledgeJsonObject>([{}, { subVendorMarginBps: null }, { subVendorMarginBps: 1_500 },
    { subVendorMinimumMarginBps: null, subVendorMarginBps: null },
    { subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000 },
    { subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 1_500 },
    { subVendorMinimumMarginBps: 2_000, subVendorMarginBps: 2_000 }
  ])("accepts supported empty, legacy and complete pairs: %j", (payload) => {
    expect(subVendorMarginRangeIssues(payload)).toEqual([]);
  });

  it.each([null, -500, 999, 1_499, 1_600, 1_750, 2_001, 9_900, 10_000, 10_500, 1_234.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1500", false, [], {}])(
    "rejects an explicit invalid or incomplete minimum: %j", (value) => {
      expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: value, subVendorMarginBps: 2_000 })).toEqual([
        expect.objectContaining({ path: "subVendorMinimumMarginBps" })
      ]);
    }
  );
  it("accepts every five-point margin including zero as either configured boundary", () => {
    for (let value = 0; value <= 9_500; value += 500) {
      expect(subVendorMarginRangeIssues({ subVendorMarginBps: value })).toEqual([]);
      expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: 0, subVendorMarginBps: value })).toEqual([]);
      expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: value, subVendorMarginBps: 9_500 })).toEqual([]);
    }
    expect(subVendorMarginRange({ subVendorMarginBps: 0 })).toEqual({ minimum: 0, maximum: 0 });
    expect(withSubVendorMargin({ subVendorMarginBps: 0 }, "maximum", 9_500))
      .toEqual({ subVendorMinimumMarginBps: 0, subVendorMarginBps: 9_500 });
    expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: null, subVendorMarginBps: 0 }))
      .toEqual([expect.objectContaining({ path: "subVendorMinimumMarginBps" })]);
  });

  it("rejects missing maximum and reversed bounds with a useful field path", () => {
    expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: 1_500 })).toEqual([
      expect.objectContaining({ path: "subVendorMarginBps" })
    ]);
    expect(subVendorMarginRangeIssues({ subVendorMinimumMarginBps: 2_000, subVendorMarginBps: 1_500 })).toEqual([
      expect.objectContaining({ path: "subVendorMinimumMarginBps" })
    ]);
  });
});
