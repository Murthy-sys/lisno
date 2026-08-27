import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("defaults to an h2 and associates the header with its title", () => {
    render(<SectionHeader id="activity-title" title="Recent activity" description="Latest project changes." />);

    const heading = screen.getByRole("heading", { level: 2, name: "Recent activity" });
    expect(heading).toHaveAttribute("id", "activity-title");
    expect(heading.closest("header")).toHaveAttribute("aria-labelledby", "activity-title");
  });

  it("can render a nested h3", () => {
    render(<SectionHeader headingLevel={3} title="Assigned projects" />);

    expect(screen.getByRole("heading", { level: 3, name: "Assigned projects" })).toBeVisible();
  });
});
