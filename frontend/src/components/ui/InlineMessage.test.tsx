import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";
import { InlineMessage, type FeedbackTone } from "./InlineMessage";
import { NoticeBanner } from "./NoticeBanner";

describe("InlineMessage", () => {
  it.each<FeedbackTone>(["info", "success", "warning", "error"])(
    "keeps the %s message understandable through an icon and visible copy",
    (tone) => {
      const { container } = render(
        <InlineMessage tone={tone}>Saved state for {tone}</InlineMessage>
      );

      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByText(`Saved state for ${tone}`)).toBeVisible();
    }
  );

  it("announces errors immediately without making ordinary feedback live", () => {
    const { rerender } = render(
      <InlineMessage tone="info">A useful note.</InlineMessage>
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<InlineMessage tone="error">Saving failed.</InlineMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Saving failed.");

    rerender(
      <InlineMessage tone="success" role="status">
        Saved.
      </InlineMessage>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });
});

describe("NoticeBanner", () => {
  it("labels workflow-critical content and keeps its action after the copy", () => {
    render(
      <NoticeBanner
        tone="warning"
        label="Approval required"
        title="Review the estimate"
        action={<button type="button">Open estimate</button>}
      >
        Confirm the revised scope before work continues.
      </NoticeBanner>
    );

    const region = screen.getByRole("region", { name: "Approval required" });
    const copy = within(region).getByText(
      "Confirm the revised scope before work continues."
    );
    const action = within(region).getByRole("button", { name: "Open estimate" });

    expect(
      copy.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("explains the absence with one heading and an optional valid action without announcing it", () => {
    render(
      <EmptyState
        title="No projects yet"
        description="Create a project when the first client brief arrives."
        action={<button type="button">Create project</button>}
      />
    );

    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    expect(
      screen.getByText("Create a project when the first client brief arrives.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
