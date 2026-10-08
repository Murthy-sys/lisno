import { useState, type ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EstimatorRecommendations } from "./EstimatorRecommendations";
import { recommendationTargetIdentity, type RoomRecommendationView } from "./roomRecommendations";

const groupView: RoomRecommendationView = {
  stale: false,
  historicalSources: [],
  decisions: [{
    key: "sub-basket:basket-paint:sub-finish", kind: "sub_basket", requirement: "must",
    name: "Ceiling finish", basketName: "Painting", subBasketName: null, available: true,
    selected: false, completionRequired: true, unavailableChildCount: 1, target: null,
    reasons: [{ ruleId: "rule-group", sourceId: "line-pop", sourceName: "POP false ceiling",
      reason: "Finish the ceiling after gypsum work.", requirement: "must" }],
    children: [
      { target: { mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-finish" }, name: "False ceiling painting", selected: false, completionRequired: false },
      { target: { mainLineId: "line-cove", basketId: "basket-paint", subBasketId: "sub-finish" }, name: "Cove finish", selected: false, completionRequired: true }
    ]
  }],
  guidance: [{ id: "guide-1", sourceId: "line-pop", sourceName: "POP false ceiling", name: "Check site surface", reason: "Confirm it is dry." }]
};

const directView: RoomRecommendationView = { ...groupView, guidance: [], decisions: [{
  key: "line:line-accent", kind: "main_line", requirement: "can", name: "Accent finish",
  basketName: "Painting", subBasketName: "Ceiling finish", available: true, selected: false,
  completionRequired: true, unavailableChildCount: 0,
  target: { mainLineId: "line-accent", basketId: "basket-paint", subBasketId: "sub-finish" },
  children: [], reasons: [{ ruleId: "rule-accent", sourceId: "line-pop", sourceName: "POP false ceiling",
    reason: "Finish the accent after gypsum work.", requirement: "can" }]
}] };

const defaults: ComponentProps<typeof EstimatorRecommendations> = {
  roomName: "Living room", sourceCount: 1, state: "ready", view: groupView, editable: true,
  open: true, onOpen: vi.fn(), onClose: vi.fn(), onRetry: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn(() => true)
};

function ControlledRecommendations() {
  const [open, setOpen] = useState(false);
  return <EstimatorRecommendations {...defaults} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />;
}

function dialog() {
  return screen.getByRole("dialog", { name: "Recommendations for Living room" });
}

describe("EstimatorRecommendations", () => {
  it("keeps the room alert compact and shows a single reference-style addition card", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const props = { ...defaults, open: false, onOpen };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    const alert = screen.getByRole("region", { name: "Recommendations for this room" });
    expect(within(alert).getByRole("heading", { name: "False ceiling painting is needed for POP false ceiling." })).toBeVisible();
    expect(within(alert).getByText("+1 more recommendation", { exact: true })).toBeVisible();
    expect(alert).toHaveTextContent("1 unavailable");
    expect(screen.queryByText("Finish the ceiling after gypsum work.")).not.toBeInTheDocument();
    const review = within(alert).getByRole("button", { name: "Review recommendations" });
    expect(review).not.toHaveAttribute("aria-controls");
    await user.click(review);
    expect(onOpen).toHaveBeenCalledOnce();
    rerender(<EstimatorRecommendations {...props} open />);
    const panel = dialog();
    expect(panel).toHaveClass("ui-dialog", "modal");
    expect(panel.closest(".modal-layer")).toBeInTheDocument();
    expect(panel).not.toHaveClass("ui-drawer");
    expect(within(panel).getByRole("heading", { name: "Related item recommended" })).toBeVisible();
    expect(within(panel).getByText("Non-Negotiable Addition")).toBeVisible();
    expect(within(panel).getByText("Selected item")).toBeVisible();
    expect(within(panel).getByText("Recommended addition")).toBeVisible();
    expect(within(panel).getByText("POP false ceiling", { exact: true })).toBeVisible();
    expect(within(panel).getByText("False ceiling painting", { exact: true })).toBeVisible();
    expect(within(panel).getByText("Finish the ceiling after gypsum work.")).toBeVisible();
    expect(within(panel).getByText("1 of 2 recommended items")).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Not now" })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: /Not necessary/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Add False ceiling painting for Living room" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Close recommendations" })).toBeVisible();
    expect(within(panel).queryByText("Cove finish")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Ceiling finish")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Why?")).not.toBeInTheDocument();
    expect(within(panel).getByText(/1 related recommendation has unavailable items/)).toBeVisible();
    await user.click(within(panel).getByText("Other guidance"));
    expect(within(panel).getByText("Confirm it is dry.", { exact: false })).toBeVisible();
    expect(panel.querySelector(".ui-dialog__close")).not.toBeInTheDocument();
    expect(panel.querySelectorAll(".estimator-recommendations__card-header")).toHaveLength(1);
    expect(panel.querySelector(".estimator-recommendations__card-header")?.tagName).toBe("DIV");
    expect(within(panel).queryByRole("banner")).not.toBeInTheDocument();
    expect(panel.outerHTML).not.toMatch(/Alternative|AI Suggestion|Save 8%|₹|Must be completed|Configuration completion/i);
    await waitFor(() => expect(within(panel).getByRole("region", { name: "Recommendation details" })).toHaveFocus());
  });

  it("navigates individual Sub Basket children and moves focus to the next Add action", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => true);
    render(<EstimatorRecommendations {...defaults} onSelect={onSelect} />);
    const panel = dialog();
    await user.click(within(panel).getByRole("button", { name: "Next recommendation" }));
    expect(within(panel).getByText("Cove finish", { exact: true })).toBeVisible();
    expect(within(panel).getByText("2 of 2 recommended items")).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Previous recommendation" }));
    const addPainting = within(panel).getByRole("button", { name: "Add False ceiling painting for Living room" });
    addPainting.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-finish" });
    expect(within(panel).queryByRole("button", { name: "Add False ceiling painting for Living room" })).not.toBeInTheDocument();
    expect(within(panel).getByText("Cove finish", { exact: true })).toBeVisible();
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Cove finish is needed for POP false ceiling.");
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Add Cove finish for Living room" })).toHaveFocus());
  });

  it("keeps optional wording and only accepts a guarded selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => false);
    const props = { ...defaults, view: directView, onSelect };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    const panel = dialog();
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Consider Accent finish for POP false ceiling.");
    expect(within(panel).getByText("Consider Accent finish for POP false ceiling.")).toBeVisible();
    expect(within(panel).getByText("Probable Addition")).toBeVisible();
    const add = within(panel).getByRole("button", { name: "Add Accent finish for Living room" });
    await user.click(add);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(add).toBeInTheDocument();
    expect(within(panel).queryByText("All related items selected.")).not.toBeInTheDocument();

    rerender(<EstimatorRecommendations {...props} onSelect={vi.fn(() => true)} />);
    await user.click(within(panel).getByRole("button", { name: "Add Accent finish for Living room" }));
    expect(within(panel).getByText("All related items selected.")).toBeVisible();
    expect(within(panel).getByText("Accent finish selected for Living room.", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Done" })).toHaveFocus());
  });

  it("reviews probable children independently, announces a skip, and focuses the next action", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => true);
    const onClose = vi.fn();
    const onSkip = vi.fn(() => true);
    const probableGroup: RoomRecommendationView = { ...groupView, guidance: [], decisions: groupView.decisions.map((decision) => ({
      ...decision, requirement: "can", unavailableChildCount: 0,
      reasons: decision.reasons.map((reason) => ({ ...reason, requirement: "can" }))
    })) };
    function Review() {
      const [skippedKeys, setSkippedKeys] = useState<ReadonlySet<string>>(new Set());
      return <EstimatorRecommendations {...defaults} view={probableGroup} onSelect={onSelect} onClose={onClose}
        skippedKeys={skippedKeys} onSkip={(target) => {
          onSkip();
          setSkippedKeys((current) => new Set(current).add(recommendationTargetIdentity(target)));
          return true;
        }} />;
    }
    render(<Review />);
    const panel = dialog();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "Recommendation details" })).toHaveFocus());
    const skip = within(panel).getByRole("button", { name: "Not necessary: False ceiling painting for Living room" });
    skip.focus();
    await user.keyboard("{Enter}");
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(panel).getByText("False ceiling painting marked not necessary for Living room.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /False ceiling painting for Living room/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Not necessary: Cove finish for Living room" })).toBeVisible();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Add Cove finish for Living room" })).toHaveFocus());
    await user.click(within(panel).getByRole("button", { name: "Not necessary: Cove finish for Living room" }));
    expect(onSkip).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
    expect(within(panel).getByText("All recommendations reviewed.")).toBeVisible();
    expect(panel).not.toHaveTextContent("All related items selected.");
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("All recommendations reviewed.");
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Done" })).toHaveFocus());
  });

  it("requires an accepted skip and parent review state before showing completion", async () => {
    const user = userEvent.setup();
    const rejectedSkip = vi.fn(() => false);
    const props = { ...defaults, view: directView, onSkip: rejectedSkip };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    const panel = dialog();
    await user.click(within(panel).getByRole("button", { name: /Not necessary: Accent finish/ }));
    expect(rejectedSkip).toHaveBeenCalledExactlyOnceWith(directView.decisions[0]!.target);
    expect(panel).not.toHaveTextContent("marked not necessary");
    expect(within(panel).getByRole("button", { name: "Add Accent finish for Living room" })).toBeVisible();

    const acceptedSkip = vi.fn(() => true);
    rerender(<EstimatorRecommendations {...props} onSkip={acceptedSkip} />);
    await user.click(within(panel).getByRole("button", { name: /Not necessary: Accent finish/ }));
    expect(acceptedSkip).toHaveBeenCalledOnce();
    expect(within(panel).queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    const skippedKeys = new Set([recommendationTargetIdentity(directView.decisions[0]!.target!)]);
    rerender(<EstimatorRecommendations {...props} onSkip={acceptedSkip} skippedKeys={skippedKeys} />);
    expect(within(panel).getByText("All recommendations reviewed.")).toBeVisible();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Done" })).toHaveFocus());

    rerender(<EstimatorRecommendations {...props} onSkip={acceptedSkip} skippedKeys={new Set()} />);
    expect(within(panel).getByRole("button", { name: "Add Accent finish for Living room" })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  it("keeps required targets pending despite a matching skipped key and preserves mixed review completion", async () => {
    const user = userEvent.setup();
    const skippedKeys = new Set([recommendationTargetIdentity(directView.decisions[0]!.target!)]);
    const requiredView: RoomRecommendationView = { ...directView, decisions: directView.decisions.map((decision) => ({
      ...decision, requirement: "must", reasons: decision.reasons.map((reason) => ({ ...reason, requirement: "must" }))
    })) };
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={requiredView} skippedKeys={skippedKeys} onSkip={vi.fn(() => true)} />);
    const panel = dialog();
    expect(within(panel).getByText("Non-Negotiable Addition")).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Add Accent finish for Living room" })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: /Not necessary/ })).not.toBeInTheDocument();
    expect(within(panel).queryByText("All recommendations reviewed.")).not.toBeInTheDocument();

    const mixedView: RoomRecommendationView = { ...groupView, decisions: [...groupView.decisions, ...directView.decisions] };
    rerender(<EstimatorRecommendations {...defaults} view={mixedView} skippedKeys={skippedKeys} onSkip={vi.fn(() => true)} />);
    await user.click(within(panel).getByRole("button", { name: "Add False ceiling painting for Living room" }));
    await user.click(within(panel).getByRole("button", { name: "Add Cove finish for Living room" }));
    expect(within(panel).getByText("All available recommendations reviewed.")).toBeVisible();
    expect(within(panel).getByText(/1 related recommendation has unavailable items/)).toBeVisible();
  });

  it("disables optional skipping during loading or read-only review and hides it for unsafe reads", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn(() => true);
    const props = { ...defaults, view: directView, onSkip };
    const { rerender } = render(<EstimatorRecommendations {...props} editable={false} />);
    const panel = dialog();
    const readOnlySkip = within(panel).getByRole("button", { name: /Not necessary: Accent finish/ });
    expect(readOnlySkip).toBeDisabled();
    await user.click(readOnlySkip);
    expect(onSkip).not.toHaveBeenCalled();
    rerender(<EstimatorRecommendations {...props} state="loading" view={null} />);
    const loadingSkip = within(panel).getByRole("button", { name: /Not necessary: Accent finish/ });
    expect(loadingSkip).toBeDisabled();
    await user.click(loadingSkip);
    expect(onSkip).not.toHaveBeenCalled();
    for (const state of ["error", "forbidden", "stale"] as const) {
      rerender(<EstimatorRecommendations {...props} state={state} />);
      expect(within(panel).queryByRole("button", { name: /Not necessary/ })).not.toBeInTheDocument();
    }
    const unavailableView: RoomRecommendationView = { ...directView, decisions: directView.decisions.map((decision) => ({
      ...decision, available: false, target: null
    })) };
    rerender(<EstimatorRecommendations {...props} view={unavailableView} />);
    expect(within(panel).queryByRole("button", { name: /Not necessary/ })).not.toBeInTheDocument();
  });

  it("keeps accepted feedback during refetch without an enabled stale Add action", async () => {
    const user = userEvent.setup();
    const props = { ...defaults, onSelect: vi.fn(() => true) };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    const panel = dialog();
    await user.click(within(panel).getByRole("button", { name: "Add False ceiling painting for Living room" }));
    rerender(<EstimatorRecommendations {...props} state="loading" view={null} />);
    expect(within(panel).getByRole("status")).toHaveTextContent("Checking configured recommendations");
    expect(within(panel).getByRole("button", { name: "Add Cove finish for Living room" })).toBeDisabled();
    expect(within(panel).queryByRole("button", { name: "Add False ceiling painting for Living room" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "Recommendation details" })).toHaveFocus());

    const selectedView: RoomRecommendationView = { ...groupView, decisions: groupView.decisions.map((decision) => ({
      ...decision, children: decision.children.map((child) => child.name === "False ceiling painting" ? { ...child, selected: true } : child)
    })) };
    rerender(<EstimatorRecommendations {...props} state="ready" view={selectedView} />);
    expect(within(panel).getByRole("button", { name: "Add Cove finish for Living room" })).toBeEnabled();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Add Cove finish for Living room" })).toHaveFocus());
  });

  it("shows concise completion after individually selecting every eligible child", async () => {
    const user = userEvent.setup();
    const availableGroup: RoomRecommendationView = { ...groupView, guidance: [], decisions: groupView.decisions.map((decision) => ({
      ...decision, unavailableChildCount: 0
    })) };
    render(<EstimatorRecommendations {...defaults} view={availableGroup} onSelect={vi.fn(() => true)} />);
    const panel = dialog();
    await user.click(within(panel).getByRole("button", { name: "Add False ceiling painting for Living room" }));
    await user.click(within(panel).getByRole("button", { name: "Add Cove finish for Living room" }));
    expect(within(panel).getByText("All related items selected.")).toBeVisible();
    expect(within(panel).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("All related items selected.");
    expect(panel.outerHTML).not.toMatch(/eligible items selected|Must be completed|Configuration completion/i);
  });

  it("deduplicates by stable location and prioritizes the required source", async () => {
    const user = userEvent.setup();
    const duplicated: RoomRecommendationView = { ...groupView, guidance: [], decisions: [
      { ...directView.decisions[0]!, key: "line:line-paint", name: "False ceiling painting", requirement: "can",
        target: { mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-finish" },
        reasons: [
          { ruleId: "rule-direct", sourceId: "line-lights", sourceName: "Functional lights",
            reason: "Finish around the fittings.", requirement: "can" },
          { ruleId: "rule-direct-2", sourceId: "line-lights", sourceName: "Functional lights",
            reason: "Confirm the installation.", requirement: "can" }
        ] },
      ...groupView.decisions
    ] };
    render(<EstimatorRecommendations {...defaults} view={duplicated}
      skippedKeys={new Set([recommendationTargetIdentity(duplicated.decisions[0]!.target!)])} onSkip={vi.fn(() => true)} />);
    const panel = dialog();
    expect(within(panel).getByText("False ceiling painting is needed for POP false ceiling.")).toBeVisible();
    expect(within(panel).getByText("Also configured for Functional lights.")).toBeVisible();
    expect(within(panel).getByText("1 of 2 recommended items")).toBeVisible();
    expect(within(panel).getAllByRole("button", { name: "Add False ceiling painting for Living room" })).toHaveLength(1);
    expect(within(panel).queryByRole("button", { name: /Not necessary/ })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Next recommendation" }));
    expect(within(panel).getByText("Cove finish", { exact: true })).toBeVisible();
  });

  it("uses safe copy when an eligible target lacks a configured source reason", () => {
    const missingReason: RoomRecommendationView = { ...directView, decisions: directView.decisions.map((decision) => ({
      ...decision, reasons: []
    })) };
    render(<EstimatorRecommendations {...defaults} view={missingReason} />);
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Related items to review.");
    expect(within(dialog()).getByText("A related item is recommended for this room.")).toBeVisible();
    expect(within(dialog()).getByText("Source name unavailable")).toBeVisible();
    expect(dialog().outerHTML).not.toContain("undefined");
  });

  it("does not turn an optional source into required copy when aggregated priority differs", () => {
    const unmatchedPriority: RoomRecommendationView = { ...directView, decisions: directView.decisions.map((decision) => ({
      ...decision, requirement: "must" as const
    })) };
    render(<EstimatorRecommendations {...defaults} view={unmatchedPriority} />);
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Consider Accent finish for POP false ceiling.");
    expect(within(dialog()).getByText("Consider Accent finish for POP false ceiling.")).toBeVisible();
    expect(dialog()).not.toHaveTextContent("is needed");
  });

  it("uses the same close path for Not now, X, Escape, and backdrop", async () => {
    const user = userEvent.setup();
    render(<ControlledRecommendations />);
    const review = screen.getByRole("button", { name: "Review recommendations" });
    for (const route of ["not-now", "x", "escape", "backdrop"] as const) {
      await user.click(review);
      await waitFor(() => expect(screen.getByRole("region", { name: "Recommendation details" })).toHaveFocus());
      if (route === "not-now") await user.click(within(dialog()).getByRole("button", { name: "Not now" }));
      if (route === "x") await user.click(within(dialog()).getByRole("button", { name: "Close recommendations" }));
      if (route === "escape") await user.keyboard("{Escape}");
      if (route === "backdrop") await user.click(screen.getByRole("button", { name: "Close Recommendations for Living room" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(review).toHaveFocus());
    }
  });

  it("explains the automatic rollback only for automatic dismissal", () => {
    const { rerender } = render(<EstimatorRecommendations {...defaults} automaticDismissal />);
    expect(dialog()).toHaveTextContent("Closing without adding a related item will uncheck any newly selected item that still needs one.");
    rerender(<EstimatorRecommendations {...defaults} automaticDismissal={false} />);
    expect(dialog()).not.toHaveTextContent("will uncheck");
    rerender(<EstimatorRecommendations {...defaults} view={directView} automaticDismissal onSkip={vi.fn(() => true)} />);
    expect(dialog()).toHaveTextContent("Use Not necessary to skip a Probable Addition.");
    expect(dialog()).toHaveTextContent("Closing with unanswered recommendations and no related item added");
  });

  it("keeps selected, historical, unavailable, and read-only states accurate", () => {
    const selectedView: RoomRecommendationView = { ...groupView,
      historicalSources: [{ mainLineId: "old-line", name: "Archived ceiling" }],
      decisions: groupView.decisions.map((decision) => ({ ...decision, selected: true, unavailableChildCount: 0,
        children: decision.children.map((child) => ({ ...child, selected: true })) }))
    };
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={selectedView} editable={false} />);
    expect(within(dialog()).getByText("All related items selected.")).toBeVisible();
    expect(within(dialog()).getByText("Archived ceiling")).toBeVisible();
    expect(within(dialog()).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
    const unavailableSelected: RoomRecommendationView = { ...selectedView, decisions: selectedView.decisions.map((decision) => ({
      ...decision, unavailableChildCount: 1
    })) };
    rerender(<EstimatorRecommendations {...defaults} view={unavailableSelected} editable={false} />);
    expect(within(dialog()).getByText("All available related items selected.")).toBeVisible();
    expect(within(dialog()).getByText(/1 related recommendation has unavailable items/)).toBeVisible();
    rerender(<EstimatorRecommendations {...defaults} view={directView} editable={false} />);
    expect(within(dialog()).getByText("This estimate is read-only. Related items are shown for review.")).toBeVisible();
    expect(within(dialog()).getByRole("button", { name: "Add Accent finish for Living room" })).toBeDisabled();
  });

  it("keeps retry and refresh in the modal and blocks unsafe selection states", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onRefresh = vi.fn();
    const props = { ...defaults, state: "error" as const, onRetry, onRefresh };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Recommendations could not be loaded");
    expect(within(dialog()).queryByText("Configuration suggestion")).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
    await user.click(within(dialog()).getByRole("button", { name: "Retry recommendations" }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<EstimatorRecommendations {...props} state="stale" />);
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Configuration changed");
    await user.click(within(dialog()).getByRole("button", { name: "Refresh available items" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    rerender(<EstimatorRecommendations {...props} state="forbidden" />);
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("do not have permission");
    expect(within(dialog()).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
  });

  it("removes retained recommendation advice from error, stale, and forbidden states", () => {
    const props = { ...defaults, view: directView };
    const { rerender } = render(<EstimatorRecommendations {...props} />);
    expect(within(dialog()).getByText("Consider Accent finish for POP false ceiling.")).toBeVisible();

    for (const state of ["error", "stale", "forbidden"] as const) {
      rerender(<EstimatorRecommendations {...props} state={state} />);
      const panel = dialog();
      expect(within(panel).getByRole("heading", { level: 3, name: "Recommendations for Living room" })).toBeVisible();
      expect(panel).not.toHaveTextContent("Consider Accent finish for POP false ceiling.");
      expect(panel).not.toHaveTextContent("Accent finish");
      expect(panel).not.toHaveTextContent("Configuration suggestion");
      expect(within(panel).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
    }

    rerender(<EstimatorRecommendations {...props} />);
    expect(within(dialog()).getByText("Consider Accent finish for POP false ceiling.")).toBeVisible();
  });

  it("offers guidance alone and omits an empty ready alert during ordinary editing", () => {
    const guidanceOnly: RoomRecommendationView = { ...groupView, decisions: [] };
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={guidanceOnly} open={false} />);
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Guidance to review.");
    rerender(<EstimatorRecommendations {...defaults} view={guidanceOnly} />);
    expect(within(dialog()).getByText("Confirm it is dry.", { exact: false })).toBeVisible();
    expect(within(dialog()).queryByRole("button", { name: /Add .* for Living room/ })).not.toBeInTheDocument();
    const emptyView: RoomRecommendationView = { ...guidanceOnly, guidance: [] };
    rerender(<EstimatorRecommendations {...defaults} view={emptyView} open={false} />);
    expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument();
    rerender(<EstimatorRecommendations {...defaults} view={emptyView} state="loading" open={false} />);
    expect(screen.getByRole("region", { name: "Recommendations for this room" })).toHaveTextContent("Checking connected items");
  });

  it("keeps historical-source advice separate from a fabricated target relationship", () => {
    const historicalOnly: RoomRecommendationView = { ...groupView, decisions: [], guidance: [],
      historicalSources: [{ mainLineId: "old-line", name: "Archived ceiling" }] };
    render(<EstimatorRecommendations {...defaults} view={historicalOnly} open={false} />);
    const alert = screen.getByRole("region", { name: "Recommendations for this room" });
    expect(alert).toHaveTextContent("Saved recommendation sources need review.");
    expect(alert).not.toHaveTextContent("needed for");
  });
});
