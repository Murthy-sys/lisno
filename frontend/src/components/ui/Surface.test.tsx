import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Surface } from "./Surface";

describe("Surface", () => {
  it("renders a padded default div", () => {
    render(<Surface>Project summary</Surface>);

    const surface = screen.getByText("Project summary");
    expect(surface.tagName).toBe("DIV");
    expect(surface).toHaveClass("ui-surface", "ui-surface--default", "ui-surface--padding-default");
  });

  it.each(["section", "article"] as const)("renders %s when selected", (as) => {
    render(<Surface as={as}>Project summary</Surface>);

    expect(screen.getByText("Project summary").tagName).toBe(as.toUpperCase());
  });

  it("forwards native attributes and its ref to the chosen element", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Surface as="section" ref={ref} aria-label="Project summary" data-project="alpha">
        Project summary
      </Surface>
    );

    const surface = screen.getByRole("region", { name: "Project summary" });
    expect(surface).toHaveAttribute("data-project", "alpha");
    expect(ref.current).toBe(surface);
  });

  it("does not present non-interactive surfaces as liftable", () => {
    render(<Surface variant="raised">Project summary</Surface>);

    expect(screen.getByText("Project summary")).not.toHaveClass("ui-surface--interactive");
  });

  it("adds the interactive class only for interactive surfaces", () => {
    render(<Surface variant="interactive">Project summary</Surface>);

    expect(screen.getByText("Project summary")).toHaveClass("ui-surface--interactive");
  });
});
