import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectId, projectIdLabel } from "./ProjectId";

describe("ProjectId", () => {
  it("keeps distinct generated references separate from the project name", () => {
    const { rerender } = render(<ProjectId projectNumber="Lisno000014" />);
    expect(screen.getByText("Project ID: Lisno000014")).toBeVisible();
    rerender(<ProjectId projectNumber="Lisno1000000" />);
    expect(screen.queryByText("Project ID: Lisno000014")).not.toBeInTheDocument();
    expect(screen.getByText("Project ID: Lisno1000000")).toBeVisible();
  });

  it("provides the same explicit missing state for null and older omitted fields", () => {
    const { rerender } = render(<ProjectId projectNumber={null} />);
    expect(screen.getByText("Project ID not assigned")).toBeVisible();
    rerender(<ProjectId />);
    expect(screen.getByText("Project ID not assigned")).toBeVisible();
    expect(projectIdLabel(undefined)).toBe("Project ID not assigned");
    expect(projectIdLabel("Lisno000028")).toBe("Project ID: Lisno000028");
  });
});
