import { fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("uses its required label as the accessible name and renders a 44px target class", () => {
    render(<IconButton label="Add project" icon={<Plus />} />);

    const button = screen.getByRole("button", { name: "Add project" });
    expect(button).toHaveClass("ui-icon-button", "ui-icon-button--primary");
    expect(button).toHaveAttribute("aria-label", "Add project");
  });

  it("keeps its label while busy and makes itself unavailable", () => {
    render(<IconButton label="Add project" icon={<Plus />} busy />);

    const button = screen.getByRole("button", { name: "Add project" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-busy", "true");
  });

  it("uses the requested visual variant", () => {
    render(<IconButton label="Delete project" icon={<Plus />} variant="destructive" />);

    expect(screen.getByRole("button", { name: "Delete project" })).toHaveClass(
      "ui-icon-button--destructive"
    );
  });

  it("uses its optional tooltip text as a supplementary description", () => {
    render(<IconButton label="Add project" icon={<Plus />} tooltip="Create a new project" />);
    const button = screen.getByRole("button", { name: "Add project" });

    fireEvent.pointerEnter(button);

    expect(screen.getByRole("tooltip")).toHaveTextContent("Create a new project");
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });
});
