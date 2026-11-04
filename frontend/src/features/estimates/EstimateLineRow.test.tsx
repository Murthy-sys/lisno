import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { EstimateLineActions, EstimateLineChoice, EstimateLineLayout, EstimateLineTierOptions } from "./EstimateLineRow";

describe("Shared estimate line presentation", () => {
  it("uses only supplied tier choices and disables unavailable or locked choices", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = { label: "Storage in Kitchen", groupName: "kitchen-storage", value: "signature" as const,
      options: [{ value: "signature" as const, label: "Signature" },
        { value: "premium" as const, label: "Premium", disabledReason: "Unavailable" }], onChange };
    const { rerender } = render(<EstimateLineTierOptions {...props} />);
    expect(screen.queryByRole("radio", { name: /Functional/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Signature tier for Storage in Kitchen" })).toBeChecked();
    const unavailable = screen.getByRole("radio", { name: "Premium tier for Storage in Kitchen" });
    expect(unavailable).toBeDisabled();
    await user.click(unavailable);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<EstimateLineTierOptions {...props} options={props.options.map(option => ({ ...option, disabledReason: null }))} />);
    await user.click(screen.getByRole("radio", { name: "Premium tier for Storage in Kitchen" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("premium");
    rerender(<EstimateLineTierOptions {...props} disabled />);
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
  });

  it("keeps menu actions disabled when edit permission changes while the menu is open", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onResetQuantity = vi.fn();
    const props = { name: "Storage in Kitchen", included: true, onToggle, onResetQuantity };
    const { rerender } = render(<EstimateLineActions {...props} disabled={false} />);
    const trigger = screen.getByRole("button", { name: "More options for Storage in Kitchen" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Remove from estimate" })).toHaveFocus();
    rerender(<EstimateLineActions {...props} disabled />);
    const menu = screen.getByRole("group", { name: "Options for Storage in Kitchen" });
    for (const action of within(menu).getAllByRole("button")) {
      expect(action).toBeDisabled();
      await user.click(action);
    }
    expect(onToggle).not.toHaveBeenCalled();
    expect(onResetQuantity).not.toHaveBeenCalled();
    await user.click(trigger);
    expect(screen.queryByRole("group", { name: "Options for Storage in Kitchen" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports a named row with caller-owned read-only amounts and explicit checkbox names", async () => {
    const onToggle = vi.fn();
    const { container } = render(<EstimateLineLayout label="Storage Kitchen" included
      choice={<EstimateLineChoice name="Storage" unit="Unit" included disabled onToggle={onToggle} accessibleLabel="Include Storage in Kitchen" />}
      fields={<div><span>Saved amount</span><output aria-label="Saved amount for Storage in Kitchen">₹1,000.00</output></div>} />);
    const row = screen.getByRole("group", { name: "Storage Kitchen" });
    expect(within(row).getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(within(row).getByLabelText("Saved amount for Storage in Kitchen")).toHaveTextContent("₹1,000.00");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
