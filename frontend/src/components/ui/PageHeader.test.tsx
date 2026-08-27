import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

describe("PageHeader", () => {
  it("keeps its semantic content in reading order and labels actions", () => {
    render(
      <PageHeader
        id="team-title"
        breadcrumb={<nav aria-label="Breadcrumb">People / Team</nav>}
        eyebrow="Design manager"
        title="Team delivery pulse"
        description="Priorities across your direct reports."
        metadata={<StatusBadge tone="success" label="On track" />}
        actions={<Button>Assign estimate</Button>}
      />
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Team delivery pulse" });
    const header = heading.closest("header");
    expect(heading).toHaveAttribute("id", "team-title");
    expect(screen.getByRole("group", { name: "Page actions" })).toBeVisible();
    expect(header).toHaveAttribute("aria-labelledby", "team-title");
    expect(header?.textContent).toMatch(/People \/ Team[\s\S]*Design manager[\s\S]*Team delivery pulse[\s\S]*Priorities across your direct reports\.[\s\S]*On track[\s\S]*Assign estimate/);
  });

  it("renders exactly one page-level heading", () => {
    render(<PageHeader id="projects-title" title="Projects" />);

    const heading = screen.getByRole("heading", { level: 1, name: "Projects" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(heading).not.toHaveAttribute("tabindex");
  });

  it("forwards opt-in heading focus support without changing heading semantics", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    render(
      <PageHeader
        id="client-responses-title"
        title="Client responses"
        headingRef={headingRef}
        headingTabIndex={-1}
      />
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Client responses"
    });
    expect(headingRef.current).toBe(heading);
    expect(heading).toHaveAttribute("tabindex", "-1");
    headingRef.current?.focus();
    expect(heading).toHaveFocus();
  });
});
