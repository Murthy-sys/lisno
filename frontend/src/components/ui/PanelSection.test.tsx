import { render, screen } from "@testing-library/react";
import { FileText, Users } from "lucide-react";
import { describe, expect, it } from "vitest";

import { PanelSection } from "./PanelSection";

describe("PanelSection", () => {
  it("names the region by its title and describes it with the description", () => {
    render(
      <PanelSection
        icon={<Users />}
        title="Vendor Classification"
        description="Select vendor type and category to define their role in projects."
      >
        <p>Vendor type options</p>
      </PanelSection>
    );

    const region = screen.getByRole("region", { name: "Vendor Classification" });
    const description = screen.getByText("Select vendor type and category to define their role in projects.");

    expect(region).toHaveAccessibleName("Vendor Classification");
    expect(region).toHaveAccessibleDescription("Select vendor type and category to define their role in projects.");
    expect(region).toHaveAttribute("aria-describedby", description.id);
    expect(description).toHaveClass("ui-panel-section__description");
  });

  it("has no accessible description when no description is given", () => {
    const { container } = render(
      <PanelSection icon={<Users />} title="Contact Information">
        <p>Contact fields</p>
      </PanelSection>
    );

    const region = screen.getByRole("region", { name: "Contact Information" });

    expect(region).not.toHaveAttribute("aria-describedby");
    expect(region).not.toHaveAccessibleDescription();
    expect(container.querySelector(".ui-panel-section__description")).toBeNull();
  });

  it("hides the icon tile from assistive technology so it never joins the accessible name", () => {
    render(
      <PanelSection icon={<svg role="img" aria-label="Users glyph" />} title="Vendor Information">
        <p>Vendor fields</p>
      </PanelSection>
    );

    expect(screen.getByRole("region", { name: "Vendor Information" })).toHaveAccessibleName("Vendor Information");
    expect(screen.getByRole("heading", { name: "Vendor Information" })).toHaveAccessibleName("Vendor Information");
    expect(screen.queryByRole("img", { name: "Users glyph" })).not.toBeInTheDocument();

    const tile = screen.getByRole("img", { name: "Users glyph", hidden: true }).closest(".ui-panel-section__icon");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile?.parentElement).toHaveClass("ui-panel-section__header");
  });

  it("defaults to an h3 that labels the region", () => {
    render(
      <PanelSection icon={<Users />} title="Identity & Verification">
        <p>Identity fields</p>
      </PanelSection>
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Identity & Verification" });

    expect(heading).toHaveClass("ui-panel-section__title");
    expect(screen.getByRole("region", { name: "Identity & Verification" })).toHaveAttribute(
      "aria-labelledby",
      heading.id
    );
  });

  it("can render a nested h4", () => {
    render(
      <PanelSection icon={<Users />} title="Historical allocation correction" headingLevel={4}>
        <p>Correction fields</p>
      </PanelSection>
    );

    expect(screen.getByRole("heading", { level: 4, name: "Historical allocation correction" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("appends className to the ui-panel-section root class", () => {
    const { rerender } = render(
      <PanelSection icon={<Users />} title="Procurement Classification">
        <p>Basket fields</p>
      </PanelSection>
    );

    expect(screen.getByRole("region", { name: "Procurement Classification" })).toHaveAttribute(
      "class",
      "ui-panel-section"
    );

    rerender(
      <PanelSection
        icon={<Users />}
        title="Procurement Classification"
        className="vendor-profile__section vendor-profile__section--baskets"
      >
        <p>Basket fields</p>
      </PanelSection>
    );

    expect(screen.getByRole("region", { name: "Procurement Classification" })).toHaveAttribute(
      "class",
      "ui-panel-section vendor-profile__section vendor-profile__section--baskets"
    );
  });

  it("renders children inside the body after the header", () => {
    render(
      <PanelSection icon={<FileText />} title="Vendor Documentation">
        <label htmlFor="vendor-photo">Geo Tagged Picture of the Vendor</label>
        <input id="vendor-photo" type="file" />
      </PanelSection>
    );

    const region = screen.getByRole("region", { name: "Vendor Documentation" });
    const body = screen.getByLabelText("Geo Tagged Picture of the Vendor").parentElement;

    expect(body).toHaveClass("ui-panel-section__body");
    expect(body).toContainElement(screen.getByText("Geo Tagged Picture of the Vendor"));
    expect(region.firstElementChild).toHaveClass("ui-panel-section__header");
    expect(region.lastElementChild).toBe(body);
  });

  it("gives each instance its own title and description references", () => {
    render(
      <>
        <PanelSection icon={<FileText />} title="Vendor Information" description="Basic details about the vendor.">
          <p>Vendor fields</p>
        </PanelSection>
        <PanelSection icon={<Users />} title="Contact Information" description="Communication and address details.">
          <p>Contact fields</p>
        </PanelSection>
      </>
    );

    expect(screen.getByRole("region", { name: "Vendor Information" })).toHaveAccessibleDescription(
      "Basic details about the vendor."
    );
    expect(screen.getByRole("region", { name: "Contact Information" })).toHaveAccessibleDescription(
      "Communication and address details."
    );
  });
});
