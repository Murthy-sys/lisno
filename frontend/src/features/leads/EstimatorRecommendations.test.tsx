import { type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EstimatorRecommendations } from "./EstimatorRecommendations";
import { type RoomRecommendationView } from "./roomRecommendations";

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
  roomName: "Living room", contextKey: "room-living", sourceCount: 1, state: "ready", view: groupView, editable: true,
  onRetry: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn(() => true), onRemove: vi.fn(() => true)
};

describe("inline staff recommendations", () => {
  it("shows only non-negotiable additions inline without moving focus or opening a dialog", async () => {
    const user = userEvent.setup();
    render(<><button>Existing control</button><EstimatorRecommendations {...defaults} view={{ ...groupView, decisions: [...groupView.decisions, ...directView.decisions] }} /></>);
    const existing = screen.getByRole("button", { name: "Existing control" });
    existing.focus();
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Accent finish")).not.toBeInTheDocument();
    expect(screen.queryByText("Check site surface")).not.toBeInTheDocument();
    expect(existing).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Non-negotiable recommendations/ }));
    expect(defaults.onSelect).not.toHaveBeenCalled();
    expect(defaults.onRemove).not.toHaveBeenCalled();
  });

  it("adds one Sub Basket child by stable identity and removes selected children", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => true), onRemove = vi.fn(() => true);
    const view = render(<EstimatorRecommendations {...defaults} onSelect={onSelect} onRemove={onRemove} />);
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(groupView.decisions[0]!.children[0]!.target);
    view.rerender(<EstimatorRecommendations {...defaults} onSelect={onSelect} onRemove={onRemove}
      view={{ ...groupView, decisions: groupView.decisions.map(decision => ({ ...decision,
        children: decision.children.map(child => ({ ...child, selected: child.target.mainLineId === "line-paint" })) })) }} />);
    await user.click(screen.getByRole("button", { name: "Remove False ceiling painting" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(groupView.decisions[0]!.children[0]!.target);
    expect(screen.getByRole("button", { name: "Add Cove finish" })).toBeEnabled();
  });

  it("pages a large non-negotiable Sub Basket without rendering every child", async () => {
    const user = userEvent.setup();
    const children = Array.from({ length: 45 }, (_, index) => ({ ...groupView.decisions[0]!.children[0]!,
      name: `Finish ${index}`, target: { ...groupView.decisions[0]!.children[0]!.target, mainLineId: `finish-${index}` } }));
    render(<EstimatorRecommendations {...defaults} view={{ ...groupView, decisions: [{ ...groupView.decisions[0]!, children }] }} />);
    const list = await screen.findByRole("list", { name: "Recommended items" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Add Finish 20" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Finish 0" })).not.toBeInTheDocument();
  });

  it.each(["loading", "error", "forbidden", "stale"] as const)("blocks additions during %s and preserves retry versus refresh", async state => {
    const user = userEvent.setup();
    const onSelect = vi.fn(), onRetry = vi.fn(), onRefresh = vi.fn();
    const view = render(<EstimatorRecommendations {...defaults} onSelect={onSelect} onRetry={onRetry} onRefresh={onRefresh} />);
    await screen.findByRole("button", { name: "Add False ceiling painting" });
    view.rerender(<EstimatorRecommendations {...defaults} state={state} onSelect={onSelect} onRetry={onRetry} onRefresh={onRefresh} />);
    expect(screen.getByRole("button", { name: "Add False ceiling painting" })).toBeDisabled();
    if (state !== "loading") {
      await user.click(screen.getByRole("button", { name: "Retry recommendations" }));
      expect(state === "stale" ? onRefresh : onRetry).toHaveBeenCalledTimes(1);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps saved selections read-only and omits an empty or probable-only recommendation area", async () => {
    const view = render(<EstimatorRecommendations {...defaults} editable={false} />);
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeDisabled();
    view.rerender(<EstimatorRecommendations {...defaults} view={directView} />);
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    view.rerender(<EstimatorRecommendations {...defaults} view={{ ...groupView, decisions: [], guidance: [] }} />);
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
  });

  it("does not add a target after the parent rejects a stale selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => false);
    render(<EstimatorRecommendations {...defaults} onSelect={onSelect} />);
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    expect(screen.queryByText("False ceiling painting added to Living room.")).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("refreshes Configuration for a popup historical-source warning instead of retrying an empty source query", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(), onRetry = vi.fn();
    render(<EstimatorRecommendations {...defaults} onRefresh={onRefresh} onRetry={onRetry}
      popup={{ open: true, onOpenChange: vi.fn(), toolbarRef: { current: null }, footerRef: { current: null }, fallbackFocusRef: { current: null } }}
      view={{ ...groupView, decisions: [], historicalSources: [{ mainLineId: "historical-pop", name: "Earlier ceiling" }] }} />);
    await user.click(screen.getByRole("button", { name: "Refresh recommendations" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
