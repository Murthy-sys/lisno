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

describe("Selected tier specification disclosure", () => {
  it("shows the selected description before specifications, preserves line breaks, and replaces it while expanded", async () => {
    const user = userEvent.setup();
    const description = "Signature ceiling finish.\nIncludes installation and finishing.";
    const { rerender } = render(<EstimateLineTierDetails {...props} description={description} details={details} />);
    const trigger = screen.getByText("Show details of tier");
    expect(screen.getByText(/Signature ceiling finish/)).not.toBeVisible();
    await user.click(trigger);
    const paragraph = screen.getByText(/Signature ceiling finish/);
    expect(paragraph).toBeVisible();
    expect(paragraph.textContent).toBe(description);
    expect(paragraph.nextElementSibling?.tagName).toBe("UL");
    rerender(<EstimateLineTierDetails {...props} tier="premium" description="Premium acoustic finish." details={null} />);
    expect(trigger.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Premium acoustic finish.")).toBeVisible();
    expect(screen.queryByText(/Signature ceiling finish/)).not.toBeInTheDocument();
    expect(screen.getByText("Specifications unavailable for this tier.")).toBeVisible();
    expect(screen.queryByText("Details unavailable for this tier.")).not.toBeInTheDocument();
    rerender(<EstimateLineTierDetails {...props} tier="functional" description={null} details={details} />);
    expect(screen.queryByText("Premium acoustic finish.")).not.toBeInTheDocument();
    expect(screen.getByText("Gypsum board (Saint-Gobain, Knauf)")).toBeVisible();
  });

  it("shows description-only content with empty specifications and treats markup-looking paragraphs as text", async () => {
    const user = userEvent.setup();
    const description = "<script>description</script>\n" + "Long-description-".repeat(150);
    const { container, rerender } = render(<EstimateLineTierDetails {...props} description={description} details={{ specifications: [] }} />);
    await user.click(screen.getByText("Show details of tier"));
    expect(screen.getByText(/<script>description/).textContent).toBe(description);
    expect(screen.getByText("No specifications configured for this tier.")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    rerender(<EstimateLineTierDetails {...props} description={undefined} details={undefined} />);
    expect(screen.queryByText(/<script>description/)).not.toBeInTheDocument();
    expect(screen.getByText("Details unavailable for this tier.")).toBeVisible();
  });

  it("starts collapsed, supports keyboard focus, and displays only supplied names and bracketed brands", async () => {
    const user = userEvent.setup();
    const { container } = render(<EstimateLineTierDetails {...props} details={details} />);
    const trigger = screen.getByLabelText("Show details of tier: Signature for Ceiling in Living Room");
    expect(trigger).toHaveTextContent(/^Show details of tier$/);
    expect(trigger.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Gypsum board (Saint-Gobain, Knauf)")).not.toBeVisible();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(trigger.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "Signature details for Ceiling in Living Room" })).toBeVisible();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Gypsum board (Saint-Gobain, Knauf)", "Metal frame", "Finish (Brand unavailable)"
    ]);
    expect(container).not.toHaveTextContent(/Hidden Mode|Hidden brief|brand-missing|brand-a/);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("updates the open list for a selected tier and never retains another tier's values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EstimateLineTierDetails {...props} details={details} />);
    await user.click(screen.getByText("Show details of tier"));
    rerender(<EstimateLineTierDetails {...props} tier="premium" details={{ specifications: [
      { id: "board", name: "Acoustic board", brands: [{ id: "brand-a", name: "Armstrong" }] }
    ] }} />);
    expect(screen.getByText("Acoustic board (Armstrong)")).toBeVisible();
    expect(screen.queryByText(/Gypsum board|Saint-Gobain/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Premium details for Ceiling in Living Room" })).toBeVisible();
    rerender(<EstimateLineTierDetails {...props} tier="functional" details={null} />);
    expect(screen.getByText("Details unavailable for this tier.")).toBeVisible();
    expect(screen.queryByText(/Acoustic board|Armstrong/)).not.toBeInTheDocument();
  });

  it("distinguishes a configured empty list from absent legacy metadata", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EstimateLineTierDetails {...props} details={undefined} />);
    await user.click(screen.getByText("Show details of tier"));
    expect(screen.getByText("Details unavailable for this tier.")).toBeVisible();
    rerender(<EstimateLineTierDetails {...props} details={{ specifications: [] }} />);
    expect(screen.getByText("No specifications configured for this tier.")).toBeVisible();
    expect(screen.queryByText("Details unavailable for this tier.")).not.toBeInTheDocument();
  });

  it("keeps row disclosures independent and resets when a row identity changes", async () => {
    const user = userEvent.setup();
    const view = (secondKey: string) => <>
      <EstimateLineTierDetails {...props} description="Living Room finish." details={details} />
      <EstimateLineTierDetails {...props} rowKey={secondKey} label="Ceiling in Bedroom" description="Bedroom finish." details={details} />
    </>;
    const { rerender } = render(view("bedroom:ceiling"));
    const living = screen.getByLabelText("Show details of tier: Signature for Ceiling in Living Room");
    const bedroom = screen.getByLabelText("Show details of tier: Signature for Ceiling in Bedroom");
    await user.click(living);
    expect(screen.getByText("Living Room finish.")).toBeVisible();
    expect(screen.getByText("Bedroom finish.")).not.toBeVisible();
    expect(living.closest("details")).toHaveAttribute("open");
    expect(bedroom.closest("details")).not.toHaveAttribute("open");
    await user.click(bedroom);
    rerender(view("bedroom:other-main-line"));
    expect(living.closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Show details of tier: Signature for Ceiling in Bedroom").closest("details"))
      .not.toHaveAttribute("open");
  });

  it("renders markup-looking names as text", async () => {
    const user = userEvent.setup();
    render(<EstimateLineTierDetails {...props} details={{ specifications: [
      { id: "literal", name: "<img src=x>", brands: [{ id: "brand", name: "<script>brand</script>" }] }
    ] }} />);
    await user.click(screen.getByText("Show details of tier"));
    const region = screen.getByRole("region", { name: "Signature details for Ceiling in Living Room" });
    expect(within(region).getByText("<img src=x> (<script>brand</script>)")).toBeVisible();
    expect(region.querySelector("img, script")).toBeNull();
  });
});
