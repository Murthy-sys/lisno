import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateRevisionNavigation } from "./EstimateRevisionNavigation";
import type { EstimateRevisionSummary } from "./estimateRevisionsApi";

const items: EstimateRevisionSummary[] = [
  { id: "round-final", estimateId: "estimate-a", estimateVersion: 9, sendGeneration: 3, phase: "post", submittedAt: "2026-11-02T06:00:00.000Z", status: "approved", deliveryStatus: "sent", subtotalPaise: 27500 },
  { id: "round-pre", estimateId: "estimate-a", estimateVersion: 2, sendGeneration: 1, phase: "pre", submittedAt: "2026-10-31T06:00:00.000Z", status: "superseded", deliveryStatus: "failed", subtotalPaise: 10000 }
];

describe("EstimateRevisionNavigation", () => {
  it.each([
    {}, { loading: true }, { error: "History unavailable" }, { selectedRevisionId: "missing-round", error: "Access denied" }
  ])("renders no navigation without real revisions, including unavailable states: %j", state => {
    const { container } = render(<EstimateRevisionNavigation items={[]} selectedRevisionId={null} onSelectCurrent={vi.fn()} onSelectRevision={vi.fn()} onRetry={vi.fn()} {...state} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation", { name: "Estimate revisions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Current estimate")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts compact and reveals real revisions on demand without changing selection", async () => {
    const user = userEvent.setup();
    const onSelectRevision = vi.fn();
    const onSelectCurrent = vi.fn();
    const { container } = render(<EstimateRevisionNavigation items={items} selectedRevisionId={null} onSelectRevision={onSelectRevision} onSelectCurrent={onSelectCurrent} />);
    const summary = screen.getByText("Revisions (2)").closest("summary")!;
    const disclosure = container.querySelector("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(within(summary).getByText("Current estimate")).toBeVisible();
    expect(screen.getByText("Estimate · R3")).not.toBeVisible();
    await user.click(summary);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: /Estimate · R3/ })).toBeVisible();
    expect(onSelectRevision).not.toHaveBeenCalled();
    expect(onSelectCurrent).not.toHaveBeenCalled();
    await user.click(summary);
    expect(disclosure).not.toHaveAttribute("open");
  });

  it("selects immutable round IDs and shows the selected revision even while collapsed", async () => {
    const user = userEvent.setup();
    const onSelectRevision = vi.fn();
    const onSelectCurrent = vi.fn();
    const props = { items, selectedRevisionId: "round-pre", onSelectRevision, onSelectCurrent };
    const view = render(<EstimateRevisionNavigation {...props} />);
    const summary = screen.getByText("Revisions (2)").closest("summary")!;
    expect(within(summary).getByText("Pre-estimate · R1")).toBeVisible();
    await user.click(summary);
    const navigation = screen.getByRole("navigation", { name: "Estimate revisions" });
    const buttons = within(navigation).getAllByRole("button");
    expect(buttons[1]).toHaveTextContent("Estimate · R3");
    expect(buttons[2]).toHaveTextContent("Pre-estimate · R1");
    expect(buttons[2]).toHaveAttribute("aria-current", "true");
    await user.click(buttons[1]!);
    expect(onSelectRevision).toHaveBeenCalledWith("round-final");
    await user.click(screen.getByRole("button", { name: "Current estimate" }));
    expect(onSelectCurrent).toHaveBeenCalledOnce();
    view.rerender(<EstimateRevisionNavigation {...props} selectedRevisionId={null} />);
    expect(screen.getByRole("button", { name: "Current estimate" })).toHaveAttribute("aria-current", "true");
    expect(within(summary).getByText("Current estimate")).toBeVisible();
  });

  it("shows legacy phases honestly without confusing delivery failure with approval state", async () => {
    const user = userEvent.setup();
    render(<EstimateRevisionNavigation items={[{ ...items[1]!, phase: undefined, status: "pending" }]} selectedRevisionId={null} onSelectCurrent={vi.fn()} onSelectRevision={vi.fn()} />);
    await user.click(screen.getByText("Revisions (1)"));
    expect(screen.getByRole("button", { name: /Estimate · R1.*Awaiting approval/ })).toBeVisible();
    expect(screen.queryByText("Pre-estimate · R1")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });

  it("keeps refresh errors and retry inside the real-revision disclosure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const props = { items, selectedRevisionId: null, onSelectCurrent: vi.fn(), onSelectRevision: vi.fn(), onRetry };
    const view = render(<EstimateRevisionNavigation {...props} error="Revision history could not be refreshed." />);
    expect(screen.getByText("Revision history could not be refreshed.")).not.toBeVisible();
    await user.click(screen.getByText("Revisions (2)"));
    expect(screen.getByRole("alert")).toHaveTextContent("Revision history could not be refreshed.");
    await user.click(screen.getByRole("button", { name: "Retry revisions" }));
    expect(onRetry).toHaveBeenCalledOnce();
    view.rerender(<EstimateRevisionNavigation {...props} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing revisions");
    expect(screen.getByRole("button", { name: "Current estimate" })).toBeEnabled();
  });

  it("supports keyboard disclosure, selection and bounded loading", async () => {
    const user = userEvent.setup();
    const onSelectRevision = vi.fn();
    const onLoadMore = vi.fn();
    const props = { items, selectedRevisionId: null, onSelectCurrent: vi.fn(), onSelectRevision, hasMore: true, onLoadMore };
    const view = render(<EstimateRevisionNavigation {...props} />);
    const summary = screen.getByText("Revisions (2+)").closest("summary")!;
    await user.tab();
    expect(summary).toHaveFocus();
    // JSDOM/user-event omits native summary keyboard activation; browser QA covers Enter/Space.
    await user.click(summary);
    expect(summary.parentElement).toHaveAttribute("open");
    await user.tab();
    expect(screen.getByRole("button", { name: "Current estimate" })).toHaveFocus();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelectRevision).toHaveBeenCalledWith("round-final");
    await user.click(screen.getByRole("button", { name: "Load more revisions" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    view.rerender(<EstimateRevisionNavigation {...props} loadingMore />);
    expect(screen.getByRole("button", { name: "Loading more revisions…" })).toBeDisabled();
    view.rerender(<EstimateRevisionNavigation {...props} disabled />);
    expect(screen.getAllByRole("button").every(button => button.hasAttribute("disabled"))).toBe(true);
  });
});
