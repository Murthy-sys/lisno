import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PMIssues } from "./PMShared";

describe("PM source-note disclosure defaults", () => {
  it.each([1, 2, 3])("preserves existing expansion for %s shared source notes", count => {
    const issues = Array.from({ length: count }, (_, index) => `Source note ${index + 1} needs review.`);
    render(<PMIssues issues={issues} />);
    const note = screen.getByText(issues[0]!);
    if (count < 3) expect(note).toBeVisible();
    else expect(note).not.toBeVisible();
  });

  it("starts collapsed when requested and retains a user's expansion across source refreshes", async () => {
    const { rerender } = render(<PMIssues issues={["One source note needs review."]} collapsedByDefault />);
    expect(screen.getByText("One source note needs review.")).not.toBeVisible();
    await userEvent.click(screen.getByText("Source note"));
    expect(screen.getByText("One source note needs review.")).toBeVisible();
    rerender(<PMIssues issues={["One source note needs review.", "A second note arrived."]} collapsedByDefault />);
    expect(screen.getByText("2 source notes").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("A second note arrived.")).toBeVisible();
  });

  it("does not render a disclosure when there are no source notes", () => {
    const { container } = render(<PMIssues issues={[]} collapsedByDefault />);
    expect(container).toBeEmptyDOMElement();
  });
});
