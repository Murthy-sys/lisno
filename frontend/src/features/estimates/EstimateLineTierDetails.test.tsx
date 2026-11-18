import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { EstimateLineTierDetails } from "./EstimateLineTierDetails";

const props = { rowKey: "living:ceiling", label: "Ceiling in Living Room", tier: "signature" as const };
const details = { description: "Hidden Mode paragraph", specifications: [
  { id: "board", name: "Gypsum board", description: "Hidden brief description", brands: [{ id: "brand-a", name: "Saint-Gobain" }, { id: "brand-b", name: "Knauf" }] },
  { id: "frame", name: "Metal frame", brands: [] },
  { id: "finish", name: "Finish", brands: [{ id: "brand-missing", name: null }] }
] };

describe("Selected tier description", () => {
  it("shows the description immediately and withholds internal metadata by default", () => {
    const description = "Signature ceiling finish.\nIncludes installation and finishing.";
    const { container, rerender } = render(<EstimateLineTierDetails {...props} description={description} details={details} />);
    expect(screen.getByText(/Signature ceiling finish/)).toBeVisible();
    expect(screen.getByText(/Signature ceiling finish/).textContent).toBe(description);
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toBe(description);
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    expect(screen.queryByText("Signature", { exact: true })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Gypsum|Knauf|Saint-Gobain|Hidden Mode|Hidden brief/);
    rerender(<EstimateLineTierDetails {...props} tier="premium" description="Premium acoustic finish." details={details} />);
    expect(screen.getByText("Premium acoustic finish.")).toBeVisible();
    expect(screen.queryByText(/Signature ceiling finish/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Premium description for Ceiling in Living Room" })).toBeVisible();
  });

  it.each([undefined, null, "", "   "])("omits empty description %s without falling back to specifications", description => {
    const { container } = render(<EstimateLineTierDetails {...props} description={description} details={details} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("preserves long plain text and line breaks and exposes an accessible description region", async () => {
    const description = "<script>description</script>\n" + "Long-description-".repeat(150);
    const { container } = render(<EstimateLineTierDetails {...props} description={description} />);
    expect(screen.getByText(/<script>description/).textContent).toBe(description);
    expect(container.querySelector("script")).toBeNull();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps authorized internal specifications in a separate keyboard accessible disclosure", async () => {
    const user = userEvent.setup();
    const { container } = render(<EstimateLineTierDetails {...props} description="Visible finish." details={details} showInternalDetails />);
    const trigger = screen.getByLabelText("Show internal specifications: Signature for Ceiling in Living Room");
    expect(trigger.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Visible finish.")).toBeVisible();
    expect(screen.getByText("Visible finish.").closest("details")).toBeNull();
    expect(screen.getByText("Gypsum board (Saint-Gobain, Knauf)")).not.toBeVisible();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("region", { name: "Signature internal specifications for Ceiling in Living Room" })).toBeVisible();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Gypsum board (Saint-Gobain, Knauf)", "Metal frame", "Finish (Brand unavailable)"
    ]);
    expect(container).not.toHaveTextContent(/Hidden Mode|Hidden brief|brand-missing|brand-a/);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("updates open internal details for the selected tier and removes them when access is withdrawn", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EstimateLineTierDetails {...props} details={details} showInternalDetails />);
    await user.click(screen.getByText("Internal specifications"));
    rerender(<EstimateLineTierDetails {...props} tier="premium" details={{ specifications: [
      { id: "board", name: "Acoustic board", brands: [{ id: "brand-a", name: "Armstrong" }] }
    ] }} showInternalDetails />);
    expect(screen.getByText("Acoustic board (Armstrong)")).toBeVisible();
    expect(screen.queryByText(/Gypsum board|Saint-Gobain/)).not.toBeInTheDocument();
    rerender(<EstimateLineTierDetails {...props} tier="functional" description="Functional finish." details={details} showInternalDetails={false} />);
    expect(screen.getByText("Functional finish.")).toBeVisible();
    expect(screen.queryByText(/Acoustic board|Armstrong|Gypsum|Internal specifications/)).not.toBeInTheDocument();
  });

  it("distinguishes empty internal specifications from unavailable metadata", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EstimateLineTierDetails {...props} showInternalDetails />);
    await user.click(screen.getByText("Internal specifications"));
    expect(screen.getByText("Specifications unavailable for this tier.")).toBeVisible();
    rerender(<EstimateLineTierDetails {...props} details={{ specifications: [] }} showInternalDetails />);
    expect(screen.getByText("No specifications configured for this tier.")).toBeVisible();
  });

  it("keeps row disclosures independent and resets on source identity changes", async () => {
    const user = userEvent.setup();
    const view = (secondKey: string) => <>
      <EstimateLineTierDetails {...props} description="Living Room finish." details={details} showInternalDetails />
      <EstimateLineTierDetails {...props} rowKey={secondKey} label="Ceiling in Bedroom" description="Bedroom finish." details={details} showInternalDetails />
    </>;
    const { rerender } = render(view("bedroom:ceiling"));
    const living = screen.getByLabelText("Show internal specifications: Signature for Ceiling in Living Room");
    const bedroom = screen.getByLabelText("Show internal specifications: Signature for Ceiling in Bedroom");
    await user.click(living);
    expect(screen.getByText("Living Room finish.")).toBeVisible();
    expect(screen.getByText("Bedroom finish.")).toBeVisible();
    expect(bedroom.closest("details")).not.toHaveAttribute("open");
    await user.click(bedroom);
    rerender(view("bedroom:other-main-line"));
    expect(living.closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Show internal specifications: Signature for Ceiling in Bedroom").closest("details"))
      .not.toHaveAttribute("open");
  });

  it("renders markup-looking internal names as plain text", async () => {
    const user = userEvent.setup();
    render(<EstimateLineTierDetails {...props} details={{ specifications: [
      { id: "literal", name: "<img src=x>", brands: [{ id: "brand", name: "<script>brand</script>" }] }
    ] }} showInternalDetails />);
    await user.click(screen.getByText("Internal specifications"));
    const region = screen.getByRole("region", { name: "Signature internal specifications for Ceiling in Living Room" });
    expect(within(region).getByText("<img src=x> (<script>brand</script>)")).toBeVisible();
    expect(region.querySelector("img, script")).toBeNull();
  });
});
