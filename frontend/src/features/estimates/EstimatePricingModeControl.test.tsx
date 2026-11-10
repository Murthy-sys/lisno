import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import type { EstimatePricingMode } from "../leads/leadsApi";
import { EstimatePricingModeControl } from "./EstimatePricingModeControl";

const label = "Ceiling in Bedroom 1";

describe("EstimatePricingModeControl", () => {
  it("shows only the PMC switch and supports a keyboard round trip in PMC-only presentation", async () => {
    const user = userEvent.setup();
    function Editor() {
      const [mode, setMode] = useState<EstimatePricingMode>("sub_vendor");
      return <EstimatePricingModeControl mode={mode} label={label} groupName="pmc-only" editable variant="pmc-only"
        onTogglePmc={() => setMode(mode === "pmc" ? "sub_vendor" : "pmc")} onChange={setMode} />;
    }
    const { container } = render(<Editor />);
    const toggle = screen.getByRole("switch", { name: `PMC pricing mode for ${label}` });
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText("Pricing")).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor")).not.toBeInTheDocument();
    expect(screen.queryByText("In-house")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(" ");
    expect(toggle).toBeChecked();
    await user.keyboard("{Enter}");
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each([
    { mode: "pmc" as const, editable: false, disabled: false },
    { mode: "sub_vendor" as const, editable: false, disabled: false },
    { mode: "in_house" as const, editable: true, disabled: true }
  ])("preserves the PMC-only state without writes when mode=$mode, editable=$editable and disabled=$disabled", async props => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<EstimatePricingModeControl {...props} label={label} groupName="pmc-locked" variant="pmc-only"
      onTogglePmc={change} onChange={change} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeVisible();
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", String(props.mode === "pmc"));
    await user.click(toggle);
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("associates each unavailable PMC transition with its own explanation", () => {
    const change = vi.fn();
    render(<>
      <EstimatePricingModeControl mode="sub_vendor" label="Ceiling" groupName="ceiling" editable disabled variant="pmc-only"
        disabledReason="PMC price is unavailable for this tier." onTogglePmc={change} onChange={change} />
      <EstimatePricingModeControl mode="pmc" label="Painting" groupName="painting" editable disabled variant="pmc-only"
        disabledReason="Sub-Vendor price is unavailable for this tier." onTogglePmc={change} onChange={change} />
    </>);
    const ceiling = screen.getByRole("switch", { name: "PMC pricing mode for Ceiling" });
    const painting = screen.getByRole("switch", { name: "PMC pricing mode for Painting" });
    expect(ceiling).toHaveAccessibleDescription("PMC price is unavailable for this tier.");
    expect(ceiling).toHaveAttribute("title", "PMC price is unavailable for this tier.");
    expect(painting).toHaveAccessibleDescription("Sub-Vendor price is unavailable for this tier.");
    expect(ceiling.getAttribute("aria-describedby")).not.toBe(painting.getAttribute("aria-describedby"));
    expect(change).not.toHaveBeenCalled();
  });

  it("omits the static Vendor summary without invoking pricing changes", () => {
    const change = vi.fn();
    const { container } = render(<EstimatePricingModeControl mode="sub_vendor" label={label} groupName="mode-vendor" editable={false}
      onTogglePmc={change} onChange={change} />);
    expect(container).toBeEmptyDOMElement();
    expect(change).not.toHaveBeenCalled();
  });

  it("selects PMC with the keyboard, retains focus, and exposes non-PMC radios only when off", async () => {
    const user = userEvent.setup();
    function Editor() {
      const [mode, setMode] = useState<EstimatePricingMode>("sub_vendor");
      return <EstimatePricingModeControl mode={mode} label={label} groupName="mode-one" editable
        onTogglePmc={() => setMode(mode === "pmc" ? "sub_vendor" : "pmc")} onChange={setMode} />;
    }
    render(<Editor />);
    const toggle = screen.getByRole("switch", { name: `PMC pricing mode for ${label}` });
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(" ");
    expect(toggle).toBeChecked();
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole("radio", { name: `Sub-Vendor pricing mode for ${label}` })).toBeChecked();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: `In-house pricing mode for ${label}` })).toBeChecked();
  });

  it("renders a saved mode without controls or writes when read-only", () => {
    const change = vi.fn();
    render(<EstimatePricingModeControl mode="pmc" label={label} groupName="mode-read" editable={false}
      onTogglePmc={change} onChange={change} />);
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("prevents interaction while disabled without concealing the selected mode", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<EstimatePricingModeControl mode="in_house" label={label} groupName="mode-busy" editable disabled
      onTogglePmc={change} onChange={change} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
    expect(screen.getByRole("radio", { name: `In-house pricing mode for ${label}` })).toBeChecked();
    await user.click(toggle);
    expect(change).not.toHaveBeenCalled();
  });

  it("does not invent a saved mode when none is recorded", () => {
    const change = vi.fn();
    render(<EstimatePricingModeControl mode={null} label={label} groupName="mode-missing" editable={false}
      onTogglePmc={change} onChange={change} />);
    expect(screen.getByText("Not recorded")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });
});
