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
  it("renders only specification names and known Brands for the internal audience", async () => {
    const { container } = render(<EstimateLineTierDetails {...props} description="Client-only finish." details={details} showInternalDetails />);
    expect(container.textContent).toBe("Gypsum board (Saint-Gobain, Knauf)Metal frameFinish");
    expect(container.querySelector("details, summary, h1, h2, h3, h4, p")).toBeNull();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Gypsum board (Saint-Gobain, Knauf)", "Metal frame", "Finish"
    ]);
    expect(screen.getByRole("region", { name: "Signature internal specifications for Ceiling in Living Room" })).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

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

  it("omits empty item names and unresolved Brand names without placeholder text or empty parentheses", () => {
    const { container } = render(<EstimateLineTierDetails {...props} description="Do not use description." details={{ specifications: [
      { id: "empty", name: "  ", brands: [{ id: "private", name: "Hidden empty-item Brand" }] },
      { id: "board", name: "Board", brands: [{ id: "missing", name: null }, { id: "blank", name: "" }, { id: "whitespace", name: "  " }, { id: "known", name: "Knauf" }] },
      { id: "frame", name: "Frame", brands: [{ id: "missing-frame", name: null }] }
    ] }} showInternalDetails />);
    expect(container.textContent).toBe("Board (Knauf)Frame");
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual(["Board (Knauf)", "Frame"]);
  });

  it("replaces tier content and removes internal data immediately when access is withdrawn", () => {
    const { container, rerender } = render(<EstimateLineTierDetails {...props} description="Signature description." details={details} showInternalDetails />);
    rerender(<EstimateLineTierDetails {...props} tier="premium" description="Premium description." details={{ specifications: [
      { id: "board", name: "Acoustic board", brands: [{ id: "brand-a", name: "Armstrong" }] }
    ] }} showInternalDetails />);
    expect(container.textContent).toBe("Acoustic board (Armstrong)");
    expect(screen.getByRole("region", { name: "Premium internal specifications for Ceiling in Living Room" })).toBeVisible();
    rerender(<EstimateLineTierDetails {...props} tier="functional" description="Functional finish." details={details} showInternalDetails={false} />);
    expect(container.textContent).toBe("Functional finish.");
    expect(container.querySelector("ul")).toBeNull();
    rerender(<EstimateLineTierDetails {...props} tier="functional" description="Functional finish." details={null} showInternalDetails />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EstimateLineTierDetails {...props} details={details} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([undefined, null, { specifications: [] }, { specifications: [{ id: "blank", name: " \n", brands: [] }] }])(
    "renders nothing for absent or empty internal details %j, including when a description exists", emptyDetails => {
      const { container } = render(<EstimateLineTierDetails {...props} description="Client description must stay hidden." details={emptyDetails} showInternalDetails />);
      expect(container).toBeEmptyDOMElement();
    }
  );

  it("has no disclosure focus stop between the surrounding row controls", async () => {
    const user = userEvent.setup();
    render(<>
      <button>First row action</button>
      <EstimateLineTierDetails {...props} description="Client-only text." details={details} showInternalDetails />
      <button>Next row action</button>
    </>);
    await user.tab();
    expect(screen.getByRole("button", { name: "First row action" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Next row action" })).toHaveFocus();
  });

  it("keeps unequal rows isolated and clears a replaced source without stale content", () => {
    const bedroomDetails = { specifications: [{ id: "bed-board", name: "Bedroom board", brands: [{ id: "bed-brand", name: "Bedroom Brand" }] }] };
    const view = (replaced: boolean) => <>
      <EstimateLineTierDetails {...props} description="Living Room finish." details={details} showInternalDetails />
      <EstimateLineTierDetails {...props} rowKey={replaced ? "bedroom:other-main-line" : "bedroom:ceiling"} label="Ceiling in Bedroom"
        description="Bedroom finish." details={replaced ? null : bedroomDetails} showInternalDetails />
    </>;
    const { container, rerender } = render(view(false));
    expect(screen.getByRole("region", { name: "Signature internal specifications for Ceiling in Bedroom" }).textContent).toBe("Bedroom board (Bedroom Brand)");
    rerender(view(true));
    expect(screen.queryByRole("region", { name: "Signature internal specifications for Ceiling in Bedroom" })).not.toBeInTheDocument();
    expect(container.textContent).toBe("Gypsum board (Saint-Gobain, Knauf)Metal frameFinish");
  });

  it("renders markup-looking internal names as plain text", () => {
    render(<EstimateLineTierDetails {...props} details={{ specifications: [
      { id: "literal", name: "<img src=x>", brands: [{ id: "brand", name: "<script>brand</script>" }] }
    ] }} showInternalDetails />);
    const region = screen.getByRole("region", { name: "Signature internal specifications for Ceiling in Living Room" });
    expect(within(region).getByText("<img src=x> (<script>brand</script>)")).toBeVisible();
    expect(region.querySelector("img, script")).toBeNull();
  });
});
