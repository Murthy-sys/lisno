import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
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

describe("PMC Margin", () => {
  it("shows a compact number input beside the main line with strict limits", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const margin = within(screen.getByRole("region", { name: "PMC" })).getByText("PMC Margin");
    expect(margin).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveAttribute("type", "number");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveAttribute("min", "10");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveAttribute("max", "20");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveAccessibleDescription("Allowed: 10%–20%");
    expect(screen.queryByRole("textbox", { name: "PMC Margin (%)" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(margin).not.toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(margin).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("disables the saved number in read-only revisions and retains values in conflict review", () => {
    const onChange = vi.fn();
    const view = render(<Harness initial={{ pmcMarginBps: 2_000 }} readOnly onChange={onChange} />);
    expect(screen.getByText("PMC Margin")).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(20);
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "PMC Margin (%)" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
    render(<KnowledgeConflictReview sectionKey="advanced" payload={{ pmcMarginBps: 1_250 }}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]} />);
    expect(screen.getByText("PMC Margin")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
  });

  it("accepts both bounds and decimal margins within them while retaining other fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    const other = { modeDescription: "Custom scope", modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: null, in_house_material: null } };
    render(<Harness initial={other} onChange={onChange} onValidationChange={onValidationChange} />);
    const input = screen.getByRole("spinbutton", { name: "PMC Margin" });
    for (const [text, bps] of [["10", 1000], ["15.25", 1525], ["19.99", 1999], ["20", 2000]] as const) {
      await user.clear(input);
      await user.type(input, text);
      expect(input).toHaveValue(Number(text));
      expect(onChange).toHaveBeenLastCalledWith({ ...other, pmcMarginBps: bps });
      expect(onValidationChange).toHaveBeenLastCalledWith(true);
    }
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith({ ...other, pmcMarginBps: null });
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("rejects margins outside 10–20 percent, over-precise and unsafe values without silently clamping", () => {
    const onValidationChange = vi.fn();
    render(<Harness onValidationChange={onValidationChange} />);
    const input = screen.getByRole("spinbutton", { name: "PMC Margin" });
    for (const value of ["-1", "0", "9.99", "20.01", "23", "12.345", "90071992547409.92"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a PMC margin from 10% to 20%");
    }
    fireEvent.change(input, { target: { value: "15.75" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });
});

describe("Sub-Vendor Margin", () => {
  it("keeps the two margins independent, accepts exact bounds and rejects invalid values", async () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(<Harness initial={{ pmcMarginBps: 1_250 }} onChange={onChange} onValidationChange={onValidationChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    const input = screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" });
    expect(input).toHaveValue(null);
    for (const [value, bps] of [["10", 1000], ["18.75", 1875], ["20", 2000]] as const) {
      fireEvent.change(input, { target: { value } });
      expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250, subVendorMarginBps: bps });
      expect(onValidationChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(12.5);
    }
    for (const value of ["-1", "0", "9.99", "20.01", "12.345", "90071992547409.92"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a Sub-Vendor margin from 10% to 20%");
    }
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ pmcMarginBps: 1_250, subVendorMarginBps: null });
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it("shows saved Sub-Vendor margins in readonly and conflict views with their own label", async () => {
    const view = render(<Harness initial={{ pmcMarginBps: 1_250, subVendorMarginBps: 1_875 }} readOnly />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(18.75);
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toBeDisabled();
    view.unmount();
    render(<KnowledgeConflictReview sectionKey="advanced" payload={{ pmcMarginBps: 1_250, subVendorMarginBps: 1_875 }}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]} />);
    expect(screen.getByText("Sub-Vendor Margin")).toBeVisible();
    expect(screen.getByText("18.75%")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
  });
});
