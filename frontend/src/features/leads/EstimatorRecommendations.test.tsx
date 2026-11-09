import { type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
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

  it("identifies each Sales child and confirms only the accepted item in its room", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => true);
    render(<EstimatorRecommendations {...defaults} onSelect={onSelect}
      selectionFeedback={{ contextKey: "workspace-one:room-living" }} />);
    const child = (await screen.findByRole("button", { name: "Add False ceiling painting" })).closest("li")!;
    expect(within(child).getByText("Painting / Ceiling finish")).toBeVisible();
    expect(within(child).getByText("For POP false ceiling")).toBeVisible();
    expect(screen.getByText("Add selects this item for this room.")).toBeVisible();
    await user.click(within(child).getByRole("button", { name: "Add False ceiling painting" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(groupView.decisions[0]!.children[0]!.target);
    const receipt = screen.getByText("Added 1 item: False ceiling painting to Living room.");
    expect(receipt).toBeVisible();
    expect(receipt).toHaveAttribute("role", "status");
    expect(receipt).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Add Cove finish" })).toBeEnabled();
  });

  it("uses authorized direct-target context while leaving default staff presentation unchanged", async () => {
    const current = { ...directView, decisions: directView.decisions.map(decision => ({ ...decision, requirement: "must" as const })) };
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={current} />);
    await screen.findByRole("button", { name: "Add Accent finish" });
    expect(screen.queryByText("Painting / Ceiling finish")).not.toBeInTheDocument();
    expect(screen.queryByText("Add selects this item for this room.")).not.toBeInTheDocument();
    rerender(<EstimatorRecommendations {...defaults} view={current} selectionFeedback={{ contextKey: "room-living" }} />);
    expect(screen.getByText("Painting / Ceiling finish")).toBeVisible();
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

  it("keeps the Sales page-two target through a source refresh and resets only for another room", async () => {
    const user = userEvent.setup();
    const children = Array.from({ length: 45 }, (_, index) => ({ ...groupView.decisions[0]!.children[0]!,
      name: `Finish ${index}`, target: { ...groupView.decisions[0]!.children[0]!.target, mainLineId: `finish-${index}` } }));
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, children }] };
    const selectionFeedback = { contextKey: "workspace:living" };
    const onSelect = vi.fn(() => true);
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={view} selectionFeedback={selectionFeedback} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add Finish 20" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(children[20]!.target);
    rerender(<EstimatorRecommendations {...defaults} state="loading" view={null} contextKey="room-living:finish-20"
      selectionFeedback={selectionFeedback} onSelect={onSelect} />);
    const refreshed = { ...view, decisions: [{ ...view.decisions[0]!, children: children.map(child => ({
      ...child, selected: child.target.mainLineId === "finish-20"
    })) }] };
    rerender(<EstimatorRecommendations {...defaults} view={refreshed} contextKey="room-living:finish-20"
      selectionFeedback={selectionFeedback} onSelect={onSelect} />);
    expect(screen.getByText("21–40 of 45")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Finish 20" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Add Finish 0" })).not.toBeInTheDocument();

    rerender(<EstimatorRecommendations {...defaults} view={view} contextKey="another-room:finish-20"
      selectionFeedback={{ contextKey: "workspace:another-room" }} onSelect={onSelect} />);
    expect(screen.getByText("1–20 of 45")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Finish 0" })).toBeVisible();
  });

  it("continues resetting default staff pagination when recommendation sources change", async () => {
    const user = userEvent.setup();
    const children = Array.from({ length: 25 }, (_, index) => ({ ...groupView.decisions[0]!.children[0]!,
      name: `Finish ${index}`, target: { ...groupView.decisions[0]!.children[0]!.target, mainLineId: `finish-${index}` } }));
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, children }] };
    const { rerender } = render(<EstimatorRecommendations {...defaults} view={view} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("21–25 of 25")).toBeVisible();
    rerender(<EstimatorRecommendations {...defaults} view={view} contextKey="room-living:new-source" />);
    expect(screen.getByText("1–20 of 25")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Finish 0" })).toBeVisible();
  });

  it.each([false, true])("follows an accepted Sales target across page boundaries until explicit pagination (initial selection: %s)", async initiallySelected => {
    const user = userEvent.setup();
    const children = Array.from({ length: 45 }, (_, index) => ({ ...groupView.decisions[0]!.children[0]!,
      name: `Finish ${index}`, selected: initiallySelected && index === 19,
      target: { ...groupView.decisions[0]!.children[0]!.target, mainLineId: `finish-${index}` } }));
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, children }] };
    const selectionFeedback = { contextKey: "workspace:living" };
    const popup = { open: true, onOpenChange: vi.fn(), toolbarRef: { current: null }, footerRef: { current: null }, fallbackFocusRef: { current: null } };
    const onSelect = vi.fn(() => true), onRemove = vi.fn(() => true);
    const props = { ...defaults, selectionFeedback, popup, onSelect, onRemove };
    const { rerender } = render(<EstimatorRecommendations {...props} view={view} />);
    await user.click(screen.getByRole("button", { name: `${initiallySelected ? "Remove" : "Add"} Finish 19` }));
    expect(initiallySelected ? onRemove : onSelect).toHaveBeenCalledExactlyOnceWith(children[19]!.target);
    rerender(<EstimatorRecommendations {...props} state="loading" view={null} contextKey="room-living:changed-selection" />);

    const inserted = [0, 1].map(index => ({ ...children[0]!, name: `New finish ${index}`,
      target: { ...children[0]!.target, mainLineId: `new-finish-${index}` } }));
    const refreshed = { ...view, decisions: [{ ...view.decisions[0]!, children: [...inserted, ...children.map(child => ({
      ...child, selected: child.target.mainLineId === "finish-19" && !initiallySelected
    }))] }] };
    rerender(<EstimatorRecommendations {...props} view={refreshed} contextKey="room-living:changed-selection" />);
    expect(screen.getByText("21–40 of 47")).toBeVisible();
    expect(screen.getByRole("button", { name: `${initiallySelected ? "Add" : "Remove"} Finish 19` })).toHaveFocus();
    expect(within(screen.getByRole("list", { name: "Recommended items" })).getAllByRole("listitem")).toHaveLength(20);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("41–47 of 47")).toBeVisible();
    rerender(<EstimatorRecommendations {...props} state="loading" view={null} contextKey="room-living:another-source" />);
    rerender(<EstimatorRecommendations {...props} view={refreshed} contextKey="room-living:another-source" />);
    expect(screen.getByText("41–47 of 47")).toBeVisible();
    expect(screen.queryByRole("button", { name: `${initiallySelected ? "Add" : "Remove"} Finish 19` })).not.toBeInTheDocument();
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

  it("counts outstanding Sales suggestions across all pages and closes only after the last target is added", async () => {
    const user = userEvent.setup(); const onOpenChange = vi.fn();
    const children = Array.from({ length: 45 }, (_, index) => ({ ...groupView.decisions[0]!.children[0]!,
      name: `Finish ${index}`, selected: index !== 0 && index !== 44,
      target: { ...groupView.decisions[0]!.children[0]!.target, mainLineId: `finish-${index}` } }));
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, unavailableChildCount: 0, children }] };
    const selectedIds = (items: typeof children) => new Set(items.filter(child => child.selected).map(child => recommendationTargetIdentity(child.target)));
    const props = { ...defaults, selectionFeedback: { contextKey: "workspace:living" },
      popup: { open: true, onOpenChange, toolbarRef: { current: null }, footerRef: { current: null }, fallbackFocusRef: { current: null } } };
    const { rerender } = render(<EstimatorRecommendations {...props} view={view}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: selectedIds(children) }} />);
    await user.click(screen.getByRole("button", { name: "Add Finish 0" }));
    const afterFirst = children.map(child => ({ ...child, selected: child.target.mainLineId !== "finish-44" }));
    rerender(<EstimatorRecommendations {...props} view={{ ...view, decisions: [{ ...view.decisions[0]!, children: afterFirst }] }}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: selectedIds(afterFirst) }} />);
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add Finish 44" }));
    const afterLast = children.map(child => ({ ...child, selected: true }));
    rerender(<EstimatorRecommendations {...props} view={{ ...view, decisions: [{ ...view.decisions[0]!, children: afterLast }] }}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: selectedIds(afterLast) }} />);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("keeps newly introduced Sales recommendations open after the selected target is acknowledged", async () => {
    const user = userEvent.setup(); const onOpenChange = vi.fn();
    const first = groupView.decisions[0]!.children[0]!;
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, unavailableChildCount: 0, children: [first] }] };
    const props = { ...defaults, selectionFeedback: { contextKey: "workspace:living" },
      popup: { open: true, onOpenChange, toolbarRef: { current: null }, footerRef: { current: null }, fallbackFocusRef: { current: null } } };
    const { rerender } = render(<EstimatorRecommendations {...props} view={view}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: new Set() }} />);
    await user.click(screen.getByRole("button", { name: "Add False ceiling painting" }));
    rerender(<EstimatorRecommendations {...props} state="loading" sourceCount={0} view={null}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: new Set([recommendationTargetIdentity(first.target)]) }} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Checking non-negotiable recommendations…")).toBeVisible();
    rerender(<EstimatorRecommendations {...props} view={{ ...view, decisions: [{ ...view.decisions[0]!,
      children: [{ ...first, selected: true }, groupView.decisions[0]!.children[1]!] }] }}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: new Set([recommendationTargetIdentity(first.target)]) }} />);
    expect(screen.getByRole("button", { name: "Add Cove finish" })).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "historical", "stale"] as const)("keeps Sales completion pending while current results need %s review", async issue => {
    const user = userEvent.setup(); const onOpenChange = vi.fn();
    const first = groupView.decisions[0]!.children[0]!;
    const view = { ...groupView, decisions: [{ ...groupView.decisions[0]!, unavailableChildCount: 0, children: [first] }] };
    const props = { ...defaults, selectionFeedback: { contextKey: "workspace:living" },
      popup: { open: true, onOpenChange, toolbarRef: { current: null }, footerRef: { current: null }, fallbackFocusRef: { current: null } } };
    const { rerender } = render(<EstimatorRecommendations {...props} view={view}
      completion={{ contextKey: "actor:estimate:living", selectedTargetIds: new Set() }} />);
    await user.click(screen.getByRole("button", { name: "Add False ceiling painting" }));
    const selected = { ...view, decisions: [{ ...view.decisions[0]!, children: [{ ...first, selected: true }] }] };
    const completion = { contextKey: "actor:estimate:living", selectedTargetIds: new Set([recommendationTargetIdentity(first.target)]) };
    const unresolved = { ...selected,
      stale: issue === "stale",
      historicalSources: issue === "historical" ? [{ mainLineId: "old-ceiling", name: "Earlier ceiling" }] : [],
      decisions: selected.decisions.map(decision => ({ ...decision, unavailableChildCount: issue === "unavailable" ? 1 : 0 })) };
    rerender(<EstimatorRecommendations {...props} view={unresolved} completion={completion} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
    rerender(<EstimatorRecommendations {...props} view={selected} completion={completion} />);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
