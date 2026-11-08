import { configuredLineFixtures } from "./configuredEstimate.test-fixture";
import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { applyConfiguredGroupTier, configuredTierGroupKey, type ConfiguredTierGroupChoice, buildConfiguredLines, createConfiguredLine, configuredLineAmountPaise, configuredQuantityUnits, parseSellingRate, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { RoomRecommendationView } from "./roomRecommendations";
import { createConfiguredEstimateViewState } from "./useConfiguredEstimateViewState";

const catalogue: EstimationCatalogue = {
  ineligibleLineCount: 0,
  items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [{
    id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
    mainLines: [{ id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na",
      name: "POP false ceiling", displayOrder: 1, revisionId: "revision-pop", itemType: "main_line",
      inHouseBaseRatePaise: 115_000, modeBaseRatesPaise: { pmc: 95_000, sub_vendor: 105_000, in_house: 115_000 }, uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }],
    temporaryItems: [{ id: "line-cove", mainLineId: "line-cove", basketId: "basket-pop", subBasketId: "sub-na",
      name: "Cove in Gypsum", displayOrder: 2, revisionId: "revision-cove", itemType: "temporary",
      inHouseBaseRatePaise: 12_500, modeBaseRatesPaise: { pmc: 0, sub_vendor: 10_500, in_house: null }, uom: { id: "uom-rft", code: "RFT", name: "Rft", decimalScale: 1 } }]
  }, { id: "sub-unused", basketId: "basket-pop", name: "Unused Sub Basket", displayOrder: 2,
    mainLines: [], temporaryItems: [] }] }]
};

const rooms = [{ id: "room-living", typeId: "living", label: "Living & Dining", sqft: 300 }];
const moneyPaise = (value: number) => `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function LiveBuilder({ initialLines = [], editable = true, pricingModeEditable = editable, availableCatalogue = catalogue, roomList = rooms, onLinesChange, itemPresentation = "selected", validateExcluded = false, reviewContextKey = "current" }: {
  initialLines?: ConfiguredLineDraft[]; editable?: boolean; pricingModeEditable?: boolean; availableCatalogue?: EstimationCatalogue;
  roomList?: typeof rooms; onLinesChange?: (lines: ConfiguredLineDraft[]) => void; itemPresentation?: "selected" | "catalogue";
  validateExcluded?: boolean; reviewContextKey?: string;
}) {
  const [lines, setLines] = useState(initialLines);
  const baselines = useRef(new Map<string, ConfiguredLineDraft>());
  const [groupChoices, setGroupChoices] = useState<Record<string, ConfiguredTierGroupChoice>>({});
  const [roomId, setRoomId] = useState(roomList[0]!.id);
  const update = (next: ConfiguredLineDraft[]) => { setLines(next); onLinesChange?.(next); };
  return <ConfiguredEstimateBuilder rooms={roomList} activeRoomId={roomId} onSelectRoom={setRoomId} catalogue={availableCatalogue}
    pricingModeEditable={pricingModeEditable} selectedMainBasketIds={new Set(availableCatalogue.items.map(basket => basket.id))} lines={lines} itemPresentation={itemPresentation} reviewContextKey={reviewContextKey}
    excludedReviewKeys={validateExcluded ? new Set(lines.filter(line => line.persistedId && !line.included &&
      (configuredQuantityUnits(line.quantity, line.uomDecimalScale, false) === null || parseSellingRate(line.rateInput).kind === "invalid")).map(line => line.key)) : undefined}
    onUpdateAvailableLine={(targetRoomId, target, change) => {
      const room = roomList.find(room => room.id === targetRoomId)!;
      const fresh = createConfiguredLine(availableCatalogue, room, target);
      if (fresh) update([...lines, updateConfiguredLinePricing(fresh, change)]);
    }}
    groupTierChoices={groupChoices}
    onUpdateGroupTier={(scope, choice) => {
      const next = applyConfiguredGroupTier(lines, scope, choice, baselines.current);
      if (!next) return;
      baselines.current = next.baselines;
      setGroupChoices(current => ({ ...current, [configuredTierGroupKey(scope)]: choice }));
      update(next.lines);
    }}
    onUpdateLine={(key, change) => update(lines.map(line => line.key === key ? updateConfiguredLinePricing(line, change) : line))}
    onAddLine={target => {
      const room = roomList.find(room => room.id === roomId)!;
      const fresh = createConfiguredLine(availableCatalogue, room, target);
      if (!fresh) return false;
      const existing = lines.find(line => line.key === fresh.key);
      update(existing ? lines.map(line => line.key === fresh.key ? { ...line, included: true } : line) : [...lines, { ...fresh, included: true }]);
      return true;
    }}
    onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
    roomTotal={room => lines.filter(line => line.roomId === room).reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0)}
    roomIcons={{}} moneyPaise={moneyPaise} editable={editable} />;
}
const chosen = () => configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), []).map(line => ({ ...line, included: true }));

describe("Sales direct catalogue browsing", () => {
  it("removes an empty compact basket from groups, chips and filter choices while retaining excluded saved-row review", async () => {
    const user = userEvent.setup();
    const selected = { ...chosen()[0]!, persistedId: "saved-recommended-ceiling" };
    const props = { rooms, activeRoomId: "room-living", onSelectRoom: vi.fn(), catalogue,
      selectedMainBasketIds: new Set(["basket-pop"]), browseMainBasketIds: new Set<string>(),
      lines: [selected], itemPresentation: "catalogue" as const,
      excludedReviewKeys: new Set([selected.key]), onUpdateLine: vi.fn(),
      onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false,
      roomTotal: () => 105000, roomIcons: {}, moneyPaise, editable: true };
    const view = render(<ConfiguredEstimateBuilder {...props} />);
    expect(screen.getByRole("region", { name: "POP / Gypsum" })).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter Main Baskets" }), "basket-pop");
    view.rerender(<ConfiguredEstimateBuilder {...props} lines={[{ ...selected, included: false, rateInput: "invalid" }]} />);

    expect(screen.queryByRole("region", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "NA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse other items in POP / Gypsum" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).queryByRole("button", { name: /POP \/ Gypsum/ })).not.toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Filter Main Baskets" });
    expect(within(filter).queryByRole("option", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    await waitFor(() => expect(filter).toHaveValue("all"));
    const review = screen.getByRole("region", { name: "Excluded items needing review" });
    expect(within(review).getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(within(review).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("invalid");
    expect(props.onUpdateLine).not.toHaveBeenCalled();
  });

  it("keeps explicitly browsable setup baskets visible without selected items", () => {
    render(<ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
      selectedMainBasketIds={new Set(["basket-pop"])} browseMainBasketIds={new Set(["basket-pop"])} lines={[]}
      itemPresentation="catalogue" onUpdateLine={vi.fn()} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
      roomTotal={() => 0} roomIcons={{}} moneyPaise={moneyPaise} editable />);
    expect(screen.getByRole("region", { name: "POP / Gypsum" })).toBeVisible();
    expect(screen.getByRole("region", { name: "NA" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(within(screen.getByRole("combobox", { name: "Filter Main Baskets" })).getByRole("option", { name: "POP / Gypsum" })).toBeInTheDocument();
  });

  it.each(["catalogue", "selected"] as const)("hides an empty room's compact basket and preserves another room's items in %s mode", itemPresentation => {
    const allRooms = [...rooms, { id: "room-kitchen", typeId: "kitchen", label: "Kitchen", sqft: 90 }];
    const otherRoomLine = { ...chosen()[0]!, key: "room-kitchen:line-pop", roomId: "room-kitchen", roomName: "Kitchen", quantity: 3, rateInput: "875" };
    const props = { rooms: allRooms, activeRoomId: "room-living", onSelectRoom: vi.fn(), catalogue,
      selectedMainBasketIds: new Set(["basket-pop"]), browseMainBasketIds: new Set<string>(), lines: [otherRoomLine],
      itemPresentation, onUpdateLine: vi.fn(), onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false,
      roomTotal: (id: string) => id === "room-kitchen" ? 262500 : 0, roomIcons: {}, moneyPaise, editable: true };
    const view = render(<ConfiguredEstimateBuilder {...props} />);
    expect(screen.queryByRole("region", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Filter Main Baskets" })).queryByRole("option", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    view.rerender(<ConfiguredEstimateBuilder {...props} activeRoomId="room-kitchen" />);
    expect(screen.getByRole("region", { name: "POP / Gypsum" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(3);
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("875");
    expect(screen.getByRole("button", { name: /Kitchen 90/ })).toHaveTextContent("₹2,625");
    expect(props.onUpdateLine).not.toHaveBeenCalled();
  });

  it("shows Sub Baskets and unchecked items immediately without materializing draft lines", () => {
    const onLinesChange = vi.fn();
    render(<LiveBuilder itemPresentation="catalogue" onLinesChange={onLinesChange} />);
    expect(screen.getByRole("region", { name: "NA" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Unused Sub Basket" })).toHaveTextContent("No available items");
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeChecked();
    expect(screen.getByText("0 selected items")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
    expect(onLinesChange).not.toHaveBeenCalled();
  });

  it("moves keyboard focus to the surviving basket toggle after compact Browse reveals unchecked choices", async () => {
    const user = userEvent.setup(), updateLine = vi.fn();
    function CompactBuilder() {
      const [browsed, setBrowsed] = useState(new Set<string>());
      return <ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
        selectedMainBasketIds={new Set(["basket-pop"])} browseMainBasketIds={browsed} lines={[chosen()[0]!]}
        itemPresentation="catalogue" onBrowseRecommendationBasket={basketId => { setBrowsed(new Set([basketId])); return true; }}
        onUpdateLine={updateLine} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
        roomTotal={() => 105000} roomIcons={{}} moneyPaise={moneyPaise} editable />;
    }
    render(<CompactBuilder />);
    const browse = screen.getByRole("button", { name: "Browse other items in POP / Gypsum" });
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    browse.focus(); await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Browse other items in POP / Gypsum" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal/ })).toHaveFocus();
    expect(screen.getByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(screen.getByText("1 selected item")).toBeVisible();
    expect(updateLine).not.toHaveBeenCalled();
  });

  it.each(["focus moved", "room changed", "rejected"] as const)("does not restore compact Browse focus when %s before projection changes", async reason => {
    const user = userEvent.setup(), browseRequest = vi.fn(() => reason !== "rejected");
    const allRooms = [...rooms, { id: "room-kitchen", typeId: "kitchen", label: "Kitchen", sqft: 90 }];
    const props = { rooms: allRooms, activeRoomId: "room-living", onSelectRoom: vi.fn(), catalogue,
      selectedMainBasketIds: new Set(["basket-pop"]), browseMainBasketIds: new Set<string>(), lines: [chosen()[0]!],
      itemPresentation: "catalogue" as const, onBrowseRecommendationBasket: browseRequest,
      onUpdateLine: vi.fn(), onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false,
      roomTotal: () => 0, roomIcons: {}, moneyPaise, editable: true };
    const view = render(<ConfiguredEstimateBuilder {...props} />);
    const browse = screen.getByRole("button", { name: "Browse other items in POP / Gypsum" });
    browse.focus(); await user.keyboard("{Enter}");
    expect(browseRequest).toHaveBeenCalledExactlyOnceWith("basket-pop");
    expect(browse).toHaveFocus();
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search estimate items" });
    if (reason === "focus moved") await user.click(search);
    view.rerender(<ConfiguredEstimateBuilder {...props} activeRoomId={reason === "room changed" ? "room-kitchen" : "room-living"}
      browseMainBasketIds={new Set(["basket-pop"])} />);
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal/ })).not.toHaveFocus();
    if (reason === "focus moved") expect(search).toHaveFocus();
    expect(props.onUpdateLine).not.toHaveBeenCalled();
  });

  it("reveals a recommended item beyond the first catalogue page while preserving unrelated collapsed groups", async () => {
    const user = userEvent.setup(), selectedTarget = vi.fn();
    const large = structuredClone(catalogue);
    large.items[0]!.subBaskets[0]!.mainLines = Array.from({ length: 45 }, (_, index) => ({
      ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, id: `choice-${index}`, mainLineId: `choice-${index}`,
      name: `Ceiling choice ${index}`, displayOrder: index
    }));
    large.items[0]!.subBaskets[0]!.temporaryItems = [];
    large.items.push({ id: "basket-other", name: "Other basket", displayOrder: 2,
      subBaskets: [{ id: "sub-other", basketId: "basket-other", name: "Other group", displayOrder: 1,
        mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, id: "other", mainLineId: "other",
          name: "Other item", basketId: "basket-other", subBasketId: "sub-other" }] }] });
    const target = { mainLineId: "choice-25", basketId: "basket-pop", subBasketId: "sub-na" };
    const source = { ...createConfiguredLine(large, rooms[0]!, { ...target, mainLineId: "choice-0" })!, included: true };
    function RecommendationBuilder() {
      const [lines, setLines] = useState([source]);
      const [viewState, setViewState] = useState(() => ({ ...createConfiguredEstimateViewState(),
        search: "Other item", basketFilter: "basket-other",
        collapsedBasketIds: new Set(["basket-pop", "basket-other"]),
        collapsedSubBasketIds: new Set(["basket-pop:sub-na", "basket-pop:sub-unused", "basket-other:sub-other"]) }));
      const recommendation: RoomRecommendationView = { stale: false, historicalSources: [], guidance: [], decisions: [{
        key: "recommended-choice", kind: "main_line", requirement: "must", name: "Ceiling choice 25",
        basketName: "POP / Gypsum", subBasketName: "NA", available: true,
        selected: lines.some(line => line.mainLineId === target.mainLineId && line.included), completionRequired: false,
        unavailableChildCount: 0, target, children: [],
        reasons: [{ ruleId: "rule-choice", sourceId: "choice-0", sourceName: "Ceiling choice 0", reason: "Complete the selected work.", requirement: "must" }]
      }] };
      return <ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={large}
        selectedMainBasketIds={new Set(["basket-pop", "basket-other"])} lines={lines} itemPresentation="catalogue"
        viewState={viewState} onViewStateChange={setViewState} recommendationSourceCount={1} recommendationView={recommendation}
        onSelectRecommendedLine={chosenTarget => {
          selectedTarget(chosenTarget);
          setLines(current => [...current, { ...createConfiguredLine(large, rooms[0]!, chosenTarget)!, included: true }]);
          return true;
        }} onUpdateLine={vi.fn()} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
        roomTotal={() => 0} roomIcons={{}} moneyPaise={moneyPaise} editable />;
    }
    render(<RecommendationBuilder />);
    expect(screen.getByRole("searchbox", { name: "Search estimate items" })).toHaveValue("Other item");
    expect(screen.getByRole("combobox", { name: "Filter Main Baskets" })).toHaveValue("basket-other");
    const add = screen.getByRole("button", { name: "Add Ceiling choice 25" });
    add.focus(); await user.keyboard("{Enter}");
    expect(selectedTarget).toHaveBeenCalledExactlyOnceWith(target);
    expect(screen.getByRole("checkbox", { name: /Ceiling choice 25/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ceiling choice 25/ })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /Ceiling choice 0 / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Ceiling choice 25" })).toHaveFocus();
    expect(screen.getByRole("searchbox", { name: "Search estimate items" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Filter Main Baskets" })).toHaveValue("all");
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Expand Other basket, subtotal/ })).toHaveAttribute("aria-expanded", "false");
    expect(within(screen.getByRole("region", { name: "Unused Sub Basket" })).getByRole("button", { name: /Unused Sub Basket/ }))
      .toHaveAttribute("aria-expanded", "false");
    expect(within(screen.getByRole("region", { name: "NA" })).getByRole("button", { name: /NA.*selected/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2 selected items")).toBeVisible();
  });

  it("keeps deliberate excluded edits and selection independent across rooms", async () => {
    const user = userEvent.setup(), onLinesChange = vi.fn();
    render(<LiveBuilder itemPresentation="catalogue" roomList={[...rooms, { id: "room-kitchen", typeId: "kitchen", label: "Kitchen", sqft: 90 }]} onLinesChange={onLinesChange} />);
    const rate = screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    fireEvent.change(rate, { target: { value: "777" } });
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ roomId: "room-living", included: false, rateInput: "777" })]);
    await user.click(screen.getByRole("button", { name: /Kitchen 90/ }));
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("1050");
    await user.click(screen.getByRole("checkbox", { name: /Cove in Gypsum/ }));
    await user.click(screen.getByRole("button", { name: /Living & Dining 300/ }));
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("777");
    expect(screen.getByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeChecked();
    const selected = screen.getByRole("checkbox", { name: /POP false ceiling/ });
    selected.focus(); await user.keyboard(" ");
    expect(selected).toBeChecked();
    await user.keyboard(" ");
    expect(selected).not.toBeChecked();
    expect(selected).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("777");
    expect(onLinesChange.mock.lastCall?.[0]).toHaveLength(2);
    expect(onLinesChange.mock.lastCall?.[0].find((line: ConfiguredLineDraft) => line.roomId === "room-kitchen")).toMatchObject({ mainLineId: "line-cove", included: true });
  });

  it("uses main search, filter and basket jumps for never-selected rows", async () => {
    const user = userEvent.setup(), onLinesChange = vi.fn();
    const both = structuredClone(catalogue);
    both.items.push({ id: "basket-paint", name: "Painting", displayOrder: 2, subBaskets: [{ id: "sub-walls", basketId: "basket-paint", name: "Walls", displayOrder: 1,
      mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-walls", name: "Wall painting" }] }] });
    render(<LiveBuilder itemPresentation="catalogue" availableCatalogue={both} onLinesChange={onLinesChange} />);
    expect(screen.getByRole("checkbox", { name: /Wall painting/ })).not.toBeChecked();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Cove");
    expect(screen.getByRole("checkbox", { name: /Cove in Gypsum/ })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /POP false ceiling/ })).not.toBeInTheDocument();
    const jump = within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: /Painting/ });
    await user.click(jump);
    expect(screen.getByRole("searchbox", { name: "Search estimate items" })).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter Main Baskets" }), "basket-paint");
    expect(screen.getByRole("checkbox", { name: /Wall painting/ })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Collapse Painting/ }));
    expect(screen.queryByRole("checkbox", { name: /Wall painting/ })).not.toBeInTheDocument();
    await user.click(jump);
    expect(screen.getByRole("checkbox", { name: /Wall painting/ })).toBeVisible();
    expect(onLinesChange).not.toHaveBeenCalled();
  });

  it("bounds a thousand available rows per group and searches before paging", async () => {
    const user = userEvent.setup(), onLinesChange = vi.fn();
    const large = structuredClone(catalogue);
    large.items[0]!.subBaskets[0]!.mainLines = Array.from({ length: 1000 }, (_, index) => ({ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, id: `line-${index}`, mainLineId: `line-${index}`, name: `Ceiling choice ${index}` }));
    large.items[0]!.subBaskets[0]!.temporaryItems = [];
    render(<LiveBuilder itemPresentation="catalogue" availableCatalogue={large} onLinesChange={onLinesChange} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(20);
    expect(screen.getByRole("region", { name: "Unused Sub Basket" })).toBeVisible();
    expect(screen.getAllByText("0 selected · 1000 available")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("checkbox", { name: "Include Ceiling choice 20 in Living & Dining" })).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Ceiling choice 999");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Include Ceiling choice 999 in Living & Dining" })).toBeVisible();
    expect(onLinesChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Include Ceiling choice 999 in Living & Dining" }));
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ mainLineId: "line-999", included: true })]);
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.getByRole("checkbox", { name: "Include Ceiling choice 0 in Living & Dining" })).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(20);
  });

  it.each(["loading", "error", "stale"] as const)("keeps rows visible but blocks new edits while catalogue is %s", (availableItemsState) => {
    const onUpdateAvailableLine = vi.fn();
    render(<ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
      selectedMainBasketIds={new Set(["basket-pop"])} lines={[]} itemPresentation="catalogue" onUpdateAvailableLine={onUpdateAvailableLine}
      onUpdateLine={vi.fn()} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false} availableItemsState={availableItemsState}
      roomTotal={() => 0} roomIcons={{}} moneyPaise={moneyPaise} editable />);
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toBeDisabled();
    expect(screen.getByText(availableItemsState === "loading" ? "Loading available items…" : availableItemsState === "error" ? "Available items could not be refreshed. Your selections are preserved." : "Available items are out of date. Refresh before selecting more items.")).toBeVisible();
    expect(onUpdateAvailableLine).not.toHaveBeenCalled();
  });

  it("retains unchecked rows during a transient editing lock", () => {
    const view = render(<LiveBuilder itemPresentation="catalogue" />);
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeEnabled();
    view.rerender(<LiveBuilder itemPresentation="catalogue" editable={false} />);
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
    expect(screen.getByRole("region", { name: "NA" })).toBeVisible();
  });

  it.each(["selected", "catalogue"] as const)("keeps saved exclusions needing correction in one editor until review finishes in %s mode", async (itemPresentation) => {
    function ReviewingBuilder() {
      const [lines, setLines] = useState([{ ...chosen()[0]!, persistedId: "saved-pop", included: false, quantity: -1 }]);
      return <ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
        selectedMainBasketIds={new Set(["basket-pop"])} lines={lines} itemPresentation={itemPresentation}
        excludedReviewKeys={new Set(lines.filter(line => line.quantity < 0).map(line => line.key))}
        onUpdateLine={(key, change) => setLines(current => current.map(line => line.key === key ? { ...line, ...change } : line))}
        onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false} roomTotal={() => 0} roomIcons={{}} moneyPaise={moneyPaise} editable />;
    }
    render(<ReviewingBuilder />);
    const review = screen.getByRole("region", { name: "Excluded items needing review" });
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
    expect(within(review).getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    fireEvent.change(within(review).getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "4" } });
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
    expect(within(review).getByRole("spinbutton", { name: /Quantity/ })).toHaveValue(4);
    await userEvent.click(within(review).getByRole("button", { name: "Finish reviewing excluded items" }));
    expect(screen.queryByRole("region", { name: "Excluded items needing review" })).not.toBeInTheDocument();
    if (itemPresentation === "catalogue") {
      expect(within(screen.getByRole("region", { name: "NA" })).getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
      expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(4);
    } else {
      expect(screen.queryByRole("checkbox", { name: /POP false ceiling/ })).not.toBeInTheDocument();
    }
  });

  it("keeps a changed saved source in its correction section without a new catalogue copy", () => {
    const saved = { ...chosen()[0]!, persistedId: "saved-pop", sourceMissing: true, subBasketId: "old-sub", subBasketName: "Previous grouping", rateInput: "777" };
    render(<LiveBuilder itemPresentation="catalogue" initialLines={[saved]} />);
    const unavailable = screen.getByRole("region", { name: "Saved items unavailable in current Configuration" });
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
    expect(within(unavailable).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("777");
    expect(within(screen.getByRole("region", { name: "NA" })).queryByRole("checkbox", { name: /POP false ceiling/ })).not.toBeInTheDocument();
  });

  it("keeps a saved excluded quantity editor mounted while clearing and typing its replacement", async () => {
    const user = userEvent.setup(), onLinesChange = vi.fn();
    render(<LiveBuilder itemPresentation="catalogue" validateExcluded initialLines={[{ ...chosen()[0]!, persistedId: "saved-pop", included: false, quantity: 2 }]} onLinesChange={onLinesChange} />);
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ });
    await user.clear(quantity);
    expect(quantity).toHaveFocus();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toBe(quantity);
    expect(screen.queryByRole("region", { name: "Excluded items needing review" })).not.toBeInTheDocument();
    await user.type(quantity, "4");
    expect(quantity).toHaveFocus();
    expect(quantity).toHaveValue(4);
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ persistedId: "saved-pop", included: false, quantity: 4 })]);
  });

  it("keeps malformed excluded rate edits inline until focus leaves the row", async () => {
    const user = userEvent.setup();
    render(<LiveBuilder itemPresentation="catalogue" validateExcluded initialLines={[{ ...chosen()[0]!, persistedId: "saved-pop", included: false }]} />);
    const rate = screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    await user.clear(rate); await user.type(rate, "bad");
    expect(rate).toHaveFocus();
    expect(rate).toHaveValue("bad");
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("region", { name: "Excluded items needing review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("searchbox", { name: "Search estimate items" }));
    const review = screen.getByRole("region", { name: "Excluded items needing review" });
    expect(within(review).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("bad");
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
    expect(within(review).getByText("1 to review")).toBeVisible();
  });

  it("keeps checkbox focus when deselecting a saved row with an invalid value", async () => {
    const user = userEvent.setup();
    render(<LiveBuilder itemPresentation="catalogue" validateExcluded initialLines={[{ ...chosen()[0]!, persistedId: "saved-pop", quantity: Number.NaN }]} />);
    const inclusion = screen.getByRole("checkbox", { name: /POP false ceiling/ });
    inclusion.focus(); await user.keyboard(" ");
    expect(inclusion).toHaveFocus();
    expect(inclusion).not.toBeChecked();
    expect(screen.getAllByRole("checkbox", { name: /POP false ceiling/ })).toHaveLength(1);
  });
});

describe("selected project items and inline picker", () => {
  it("browses unselected baskets and their own sub baskets without changing selection", async () => {
    const user = userEvent.setup(), onAddLine = vi.fn(() => true);
    const available = structuredClone(catalogue);
    available.items.push({ id: "basket-wood", name: "Woodwork", displayOrder: 2,
      subBaskets: [{ id: "sub-doors", basketId: "basket-wood", name: "Doors", displayOrder: 1,
        mainLines: [{ ...available.items[0]!.subBaskets[0]!.mainLines[0]!, id: "wood-door", mainLineId: "wood-door",
          basketId: "basket-wood", subBasketId: "sub-doors", name: "Wooden door" }] }] });
    const props = { rooms, activeRoomId: rooms[0]!.id, onSelectRoom: vi.fn(), catalogue: available,
      selectedMainBasketIds: new Set(["basket-pop"]), lines: chosen().slice(0, 1), onUpdateLine: vi.fn(), onAddLine,
      onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false, roomTotal: () => 0,
      roomIcons: {}, moneyPaise, editable: true };
    const view = render(<ConfiguredEstimateBuilder {...props} />);
    await user.click(screen.getByRole("button", { name: "Add items" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-wood");
    const sub = screen.getByRole("combobox", { name: "Sub Basket" });
    expect(within(sub).getByRole("option", { name: "Doors" })).toBeVisible();
    expect(within(sub).queryByRole("option", { name: "NA" })).not.toBeInTheDocument();
    await user.selectOptions(sub, "sub-doors");
    expect(screen.getByRole("button", { name: "Add Wooden door" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Added POP false ceiling" })).not.toBeInTheDocument();
    expect(onAddLine).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add Wooden door" }));
    expect(onAddLine).toHaveBeenCalledExactlyOnceWith({ mainLineId: "wood-door", basketId: "basket-wood", subBasketId: "sub-doors" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-pop");
    expect(sub).toHaveValue("all");
    expect(within(sub).queryByRole("option", { name: "Doors" })).not.toBeInTheDocument();
    view.rerender(<ConfiguredEstimateBuilder {...props} availableItemsState="error" />);
    expect(screen.getByRole("button", { name: "Added POP false ceiling" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Cove in Gypsum" })).toBeDisabled();
    view.rerender(<ConfiguredEstimateBuilder {...props} editable={false} />);
    expect(screen.queryByRole("button", { name: "Close item picker" })).not.toBeInTheDocument();
  });

  it("keeps empty rooms navigable and adds only the chosen item in the active room", async () => {
    const user = userEvent.setup();
    const onLinesChange = vi.fn();
    render(<LiveBuilder roomList={[...rooms, { id: "room-bed", typeId: "bedroom", label: "Bedroom", sqft: 150 }]} onLinesChange={onLinesChange} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unused Sub Basket" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add items" }));
    await user.click(screen.getByRole("button", { name: "Add POP false ceiling" }));
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ roomId: "room-living", included: true })]);
    await user.click(screen.getByRole("button", { name: /Bedroom/ }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("paginates a thousand items and searches beyond the current page without materializing drafts", async () => {
    const user = userEvent.setup();
    const large = structuredClone(catalogue);
    large.items[0]!.subBaskets[0]!.mainLines = Array.from({ length: 1000 }, (_, index) => ({ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!,
      id: `line-${index}`, mainLineId: `line-${index}`, name: `Ceiling choice ${index}` }));
    large.items[0]!.subBaskets[0]!.temporaryItems = [];
    expect(buildConfiguredLines(large, rooms, new Set(["basket-pop"]), [])).toEqual([]);
    render(<LiveBuilder availableCatalogue={large} />);
    await user.click(screen.getByRole("button", { name: "Add items" }));
    expect(screen.getAllByRole("button", { name: /^Add Ceiling choice/ })).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Add Ceiling choice 20" })).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search available items" }), "Ceiling choice 999");
    expect(screen.getAllByRole("button", { name: /^Add Ceiling choice/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add Ceiling choice 999" }));
    expect(screen.getByRole("checkbox", { name: /Ceiling choice 999/ })).toBeChecked();
  });
  it("restores an excluded saved row with its manual quantity and mode choices", async () => {
    const user = userEvent.setup();
    const saved = { ...chosen()[0]!, persistedId: "saved-pop", included: false, quantity: 4, classification: "special" as const,
      pricingMode: "pmc" as const, rateInput: "777", rateSource: "manual" as const };
    const onLinesChange = vi.fn();
    render(<LiveBuilder initialLines={[saved]} onLinesChange={onLinesChange} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add items" }));
    await user.click(screen.getByRole("button", { name: "Add POP false ceiling" }));
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ persistedId: "saved-pop", included: true, quantity: 4, pricingMode: "pmc", rateInput: "777" })]);
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).toBeChecked();
  });
  it("preserves mode choices and a manual override through quantity edits", async () => {
    const user = userEvent.setup();
    render(<LiveBuilder initialLines={[chosen()[0]!]} />);
    await user.click(screen.getByRole("radio", { name: /Special item type/ }));
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    const rate = screen.getByRole("textbox", { name: /Selling rate/ });
    expect(rate).toHaveValue("950");
    await user.clear(rate); await user.type(rate, "999");
    await user.click(screen.getByRole("button", { name: /Increase quantity/ }));
    expect(rate).toHaveValue("999");
    expect(screen.getByRole("spinbutton", { name: /Quantity/ })).toHaveValue(2);
  });
  it("removes the canonical Sub Basket despite filtered and collapsed siblings", async () => {
    const user = userEvent.setup(), onRemoveSubBasket = vi.fn();
    render(<ConfiguredEstimateBuilder rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
      selectedMainBasketIds={new Set(["basket-pop"])} lines={chosen()} onUpdateLine={vi.fn()} onRemoveSubBasket={onRemoveSubBasket}
      onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false} roomTotal={() => 0} roomIcons={{}} moneyPaise={moneyPaise} editable />);
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "POP false");
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    const group = screen.getByRole("region", { name: "NA" });
    await user.click(within(group).getByRole("button", { name: /NA.*2 items/ }));
    await user.click(screen.getByRole("button", { name: "Remove NA Sub Basket from Living & Dining" }));
    expect(onRemoveSubBasket).toHaveBeenCalledExactlyOnceWith({ roomId: "room-living", mainBasketId: "basket-pop", subBasketId: "sub-na" });
  });
  it("retains unavailable included saved scope and keeps excluded scope out of the estimate", () => {
    const saved = { ...chosen()[0]!, persistedId: "saved-pop", sourceMissing: true };
    render(<LiveBuilder initialLines={[saved, { ...chosen()[1]!, persistedId: "saved-cove", included: false }]} editable={false} />);
    const region = screen.getByRole("region", { name: "Saved items unavailable in current Configuration" });
    expect(within(region).getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(within(region).getByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
  });
  it("shows invalid and blank included rates explicitly and accepts a configured zero", async () => {
    const user = userEvent.setup();
    render(<LiveBuilder initialLines={[chosen()[0]!]} />);
    const rate = screen.getByRole("textbox", { name: /Selling rate/ });
    await user.clear(rate);
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Amount for POP/)).toHaveTextContent("Pending");
    await user.type(rate, "1000000000000000");
    expect(rate).toHaveAttribute("aria-invalid", "true");
    await user.clear(rate); await user.type(rate, "0");
    expect(rate).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/Amount for POP/)).toHaveTextContent("₹0");
  });
});


describe("selected item editing regressions", () => {
  it("resets the item pane when changing rooms while retaining item inclusion", () => {
    const allRooms = [...rooms, { id: "room-bed", typeId: "master", label: "Bedroom", sqft: 200 }];
    const lines = configuredLineFixtures(catalogue, allRooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true }));
    const props = { rooms: allRooms, onSelectRoom: vi.fn(), catalogue, selectedMainBasketIds: new Set(["basket-pop"]), lines,
      onUpdateLine: vi.fn(), onRefreshAvailableItems: vi.fn(), refreshingAvailableItems: false, roomTotal: () => 0,
      roomIcons: {}, moneyPaise, editable: true };
    const view = render(<ConfiguredEstimateBuilder {...props} activeRoomId="room-living" />);
    screen.getByRole("region", { name: "Estimate items for Living & Dining" }).scrollTop = 220;
    view.rerender(<ConfiguredEstimateBuilder {...props} activeRoomId="room-bed" />);
    const pane = screen.getByRole("region", { name: "Estimate items for Bedroom" });
    expect(pane.scrollTop).toBe(0);
    expect(within(pane).getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(props.onUpdateLine).not.toHaveBeenCalled();
  });

  it("opens a row action outside the scrolling boundary and restores its trigger without changing scroll", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, quantity: 3 }));
    render(<LiveBuilder initialLines={initialLines} />);
    const pane = screen.getByRole("region", { name: "Estimate items for Living & Dining" });
    pane.scrollTop = 300;
    const trigger = screen.getByRole("button", { name: "More options for POP false ceiling" });
    await user.click(trigger);
    const menu = screen.getByRole("group", { name: "Options for POP false ceiling" });
    expect(pane).not.toContainElement(menu);
    expect(within(menu).getByRole("button", { name: "Remove from estimate" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Options for POP false ceiling" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(pane.scrollTop).toBe(300);
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Options for POP false ceiling" })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "Reset quantity" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("group", { name: "Options for POP false ceiling" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Include Cove in Gypsum in Living & Dining" })).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Reset quantity" }));
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(1);
    expect(trigger).toHaveFocus();
    expect(pane.scrollTop).toBe(300);
  });

  it("keeps mode read-only without blocking quantity edits and prevents an indirect Standard reset", async () => {
    const user = userEvent.setup();
    const line = { ...configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])[0]!,
      included: true, classification: "special" as const, pricingMode: "pmc" as const, rateInput: "42", rateSource: "manual" as const };
    const changed = vi.fn();
    render(<LiveBuilder initialLines={[line]} pricingModeEditable={false} onLinesChange={changed} />);
    expect(screen.queryByRole("switch", { name: /PMC pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByText("PMC")).toBeVisible();
    const standard = screen.getByRole("radio", { name: /Standard item type/ });
    expect(standard).toBeDisabled();
    await user.click(standard);
    expect(changed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Increase quantity/ }));
    expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ pricingMode: "pmc", classification: "special", rateInput: "42", rateSource: "manual" })]);
  });

  it("shows the saved mode without mode controls when its current source is missing", () => {
    const line = { ...configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])[0]!,
      persistedId: "saved-pop", included: true, sourceMissing: true,
      classification: "special" as const, pricingMode: "pmc" as const };
    render(<LiveBuilder initialLines={[line]} />);
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("allows a classification change that preserves Sub-Vendor when mode editing is unavailable", async () => {
    const user = userEvent.setup();
    const line = { ...configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])[0]!,
      included: true, classification: "special" as const, pricingMode: "sub_vendor" as const };
    render(<LiveBuilder initialLines={[line]} pricingModeEditable={false} />);
    const standard = screen.getByRole("radio", { name: /Standard item type/ });
    expect(standard).toBeEnabled();
    await user.click(standard);
    expect(standard).toBeChecked();
    expect(screen.queryByText("Vendor")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("switches PMC with the keyboard, restores non-PMC modes and keeps Standard pricing", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, classification: "standard" as const }));
    render(<LiveBuilder initialLines={initialLines} />);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const cove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const rate = within(pop).getByRole("textbox", { name: /Selling rate/ });
    expect(rate).toHaveValue("1050");
    expect(within(pop).queryByText(/Configured price|Base price/)).not.toBeInTheDocument();
    expect(within(pop).queryByRole("group", { name: /Pricing mode/ })).not.toBeInTheDocument();
    await user.click(within(pop).getByRole("radio", { name: /Special item type/ }));
    const group = within(pop).getByRole("group", { name: /Pricing mode for POP \/ Gypsum, NA, POP false ceiling in Living & Dining/ });
    expect(within(group).getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(["sub_vendor", "in_house"]);
    expect(within(group).queryByRole("radio", { name: /PMC/ })).not.toBeInTheDocument();
    const subVendor = within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ });
    expect(subVendor).toBeChecked();
    const pmc = within(group).getByRole("switch", { name: /PMC pricing mode/ });
    pmc.focus();
    await user.keyboard(" ");
    expect(pmc).toBeChecked();
    expect(pmc).toHaveFocus();
    expect(within(group).queryByRole("radio")).not.toBeInTheDocument();
    expect(rate).toHaveValue("950");
    expect(within(pop).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹950");
    await user.clear(rate);
    await user.type(rate, "999.25");
    await user.click(pmc);
    expect(rate).toHaveValue("1050");
    expect(within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: /In-house pricing mode/ })).toBeChecked();
    expect(rate).toHaveValue("1150");
    await user.clear(rate); await user.type(rate, "999.25");
    await user.click(within(group).getByRole("radio", { name: /In-house pricing mode/ }));
    expect(rate).toHaveValue("999.25");
    await user.click(pmc); await user.click(pmc);
    expect(rate).toHaveValue("1150");
    expect(within(group).getByRole("radio", { name: /In-house pricing mode/ })).toBeChecked();
    expect(within(pop).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹1,150");
    expect(within(cove).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("105");
    await user.click(within(pop).getByRole("radio", { name: /Standard item type/ }));
    expect(rate).toHaveValue("1050");
    expect(within(pop).queryByRole("group", { name: /Pricing mode/ })).not.toBeInTheDocument();
  });

  it("keeps missing-price validation and manual entry when changing modes and distinguishes zero", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, classification: "special" as const }));
    render(<LiveBuilder initialLines={initialLines} />);
    const cove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const rate = within(cove).getByRole("textbox", { name: /Selling rate/ });
    await user.click(within(cove).getByRole("radio", { name: /In-house pricing mode/ }));
    expect(rate).toHaveValue("");
    expect(within(cove).queryByText(/Configured price|Base price/)).not.toBeInTheDocument();
    expect(within(cove).getByText("Rate required")).toBeVisible();
    await user.type(rate, "71.25");
    expect(rate).toHaveValue("71.25");
    expect(within(cove).queryByText("Rate required")).not.toBeInTheDocument();
    expect(within(cove).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹71.25");
    await user.click(within(cove).getByRole("switch", { name: /PMC pricing mode/ }));
    expect(rate).toHaveValue("0");
    expect(within(cove).queryByText(/Configured price|Base price/)).not.toBeInTheDocument();
    expect(within(cove).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹0");
  });

  it("prompts mode-less historical Special items without repricing them and displays saved modes read-only", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, persistedId: `saved-${line.mainLineId}`, classification: "standard" as const,
        pricingMode: undefined, rateSource: "manual" as const, rateInput: "77.25" }));
    const view = render(<LiveBuilder initialLines={initialLines} />);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("radio", { name: /Special item type/ }));
    const group = within(pop).getByRole("group", { name: /Pricing mode/ });
    expect(group).toBeVisible();
    expect(within(group).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(within(pop).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("77.25");
    await user.click(within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ }));
    expect(within(pop).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("1050");
    view.rerender(<LiveBuilder key="readonly-mode" initialLines={initialLines.map((line, index) => index ? line : { ...line, pricingMode: "pmc", classification: "special" })} editable={false} />);
    expect(screen.getAllByRole("radio").every(radio => radio.closest("fieldset")?.disabled)).toBe(true);
    expect(screen.queryByRole("radio", { name: /pricing mode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.getByText("Not recorded")).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: /Selling rate/ })[0]).toHaveValue("77.25");
  });

  it("loads a saved PMC manual price without writing and defaults toggle-off to Sub-Vendor", async () => {
    const user = userEvent.setup(); const onLinesChange = vi.fn();
    const saved = { ...chosen()[0]!, persistedId: "saved-pmc", classification: "special" as const,
      pricingMode: "pmc" as const, rateSource: "manual" as const, rateInput: "777" };
    render(<LiveBuilder initialLines={[saved]} onLinesChange={onLinesChange} />);
    const pmc = screen.getByRole("switch", { name: /PMC pricing mode/ });
    expect(pmc).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Sub-Vendor pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("777");
    expect(onLinesChange).not.toHaveBeenCalled();
    pmc.focus(); await user.keyboard("{Enter}");
    expect(pmc).not.toBeChecked(); expect(pmc).toHaveFocus();
    expect(screen.getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("1050");
    expect(onLinesChange).toHaveBeenCalledTimes(1);
  });

  it("keeps prior modes separate across rooms and survives filtering and collapsed rows", async () => {
    const user = userEvent.setup();
    const roomList = [...rooms, { ...rooms[0]!, id: "bedroom", label: "Bedroom" }];
    const initialLines = configuredLineFixtures(catalogue, roomList, new Set(["basket-pop"]), [])
      .filter(line => line.mainLineId === "line-pop")
      .map(line => ({ ...updateConfiguredLinePricing(line, { pricingMode: line.roomId === rooms[0]!.id ? "in_house" : "sub_vendor" }),
        included: true, classification: "special" as const }));
    render(<LiveBuilder initialLines={initialLines} roomList={roomList} />);
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ }));
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining/ }));
    const search = screen.getByRole("searchbox", { name: /Search/ });
    await user.type(search, "not present");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: /Collapse POP \/ Gypsum/ }));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Expand POP \/ Gypsum/ }));
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).toBeChecked();
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("radio", { name: /In-house pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("1150");
  });

  it("clears remembered modes on context changes without changing saved values", async () => {
    const user = userEvent.setup(); const onLinesChange = vi.fn();
    const line = { ...updateConfiguredLinePricing(chosen()[0]!, { pricingMode: "in_house" }), classification: "special" as const };
    const view = render(<LiveBuilder initialLines={[line]} reviewContextKey="estimate-a" onLinesChange={onLinesChange} />);
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    view.rerender(<LiveBuilder initialLines={[line]} reviewContextKey="estimate-b" onLinesChange={onLinesChange} />);
    view.rerender(<LiveBuilder initialLines={[line]} reviewContextKey="estimate-a" onLinesChange={onLinesChange} />);
    expect(screen.getByRole("switch", { name: /PMC pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("950");
    expect(onLinesChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("radio", { name: /Sub-Vendor pricing mode/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("1050");
  });

  it("preserves selected In-house components through a PMC round trip", async () => {
    const user = userEvent.setup(); const onLinesChange = vi.fn();
    const line = { ...chosen()[0]!, classification: "special" as const, pricingMode: "in_house" as const,
      rateSource: "manual" as const, rateInput: "20", selectedInHouseComponentIds: ["labor"],
      inHouseComponents: [{ id: "labor", basketId: "labor", basketName: "Labor", subBasketId: "finish", subBasketName: "Finish", baseRatePaise: 1200 }] };
    render(<LiveBuilder initialLines={[line]} onLinesChange={onLinesChange} />);
    expect(screen.getByRole("checkbox", { name: /Labor \/ Finish/ })).toBeChecked();
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.queryByRole("group", { name: /In-house components/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /PMC pricing mode/ }));
    expect(screen.getByRole("checkbox", { name: /Labor \/ Finish/ })).toBeChecked();
    expect(onLinesChange.mock.lastCall?.[0][0]).toMatchObject({ pricingMode: "in_house", rateSource: "configuration", rateInput: "12", selectedInHouseComponentIds: ["labor"] });
  });

  it("provides separate keyboard radio groups for included Main Lines and temporary items, then displays read-only types", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, classification: line.itemType === "temporary" ? "special" as const : undefined }));
    const view = render(<LiveBuilder initialLines={initialLines} />);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const cove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const popStandard = within(pop).getByRole("radio", { name: /Standard item type for POP \/ Gypsum, NA, POP false ceiling in Living & Dining/ });
    const coveSpecial = within(cove).getByRole("radio", { name: /Special item type for POP \/ Gypsum, NA, Cove in Gypsum in Living & Dining/ });
    expect(popStandard).toBeChecked();
    expect(coveSpecial).toBeChecked();
    popStandard.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(pop).getByRole("radio", { name: /Special item type for POP \/ Gypsum, NA, POP false ceiling in Living & Dining/ })).toBeChecked();
    expect(coveSpecial).toBeChecked();

    view.rerender(<LiveBuilder key="classification-read-only" initialLines={initialLines} editable={false} />);
    const readOnlyPop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const readOnlyCove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    expect(within(readOnlyPop).getByText("Type").parentElement).toHaveTextContent("TypeStandard");
    expect(within(readOnlyCove).getByText("Type").parentElement).toHaveTextContent("TypeSpecial");
    expect(within(readOnlyPop).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("marks selected blank and malformed rates incomplete without losing their input errors", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => line.mainLineId === "line-pop"
        ? { ...line, quantity: 100, rateInput: "", included: true }
        : line);
    render(<LiveBuilder initialLines={initialLines} />);

    const basket = screen.getByRole("region", { name: "POP / Gypsum" });
    const row = within(basket).getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const rate = within(row).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for.*POP false ceiling/ });
    expect(within(row).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("Pending");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal Incomplete/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*Incomplete/ })).toBeVisible();
    const required = within(row).getByText("Rate required");
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(rate).toHaveAttribute("aria-describedby", required.id);

    await user.type(rate, "bad");
    expect(within(row).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("Pending");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal Incomplete/ })).toBeVisible();
    const invalid = within(row).getByText("Enter a non-negative rate with up to two decimal places.");
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(rate).toHaveAttribute("aria-describedby", invalid.id);

    await user.clear(rate);
    await user.type(rate, "60");
    expect(within(row).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("₹6,000");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹6,000/ })).toBeVisible();
    expect(rate).toHaveAttribute("aria-invalid", "false");
    expect(rate).not.toHaveAttribute("aria-describedby");
  });

});

it("changes every included Sub Basket line once, including lines outside search and pagination, without touching another room", async () => {
  const user = userEvent.setup(); const current = structuredClone(catalogue);
  const sub = current.items[0]!.subBaskets[0]!;
  const source = sub.mainLines[0]!;
  sub.temporaryItems = [];
  sub.mainLines = Array.from({ length: 23 }, (_, index) => ({ ...source, id: `line-${index}`, mainLineId: `line-${index}`, name: `Ceiling choice ${index}`,
    applicableTiers: ["signature", "premium", "functional"], tierPricing: { signature: { modeBaseRatesPaise: source.modeBaseRatesPaise! },
      premium: { modeBaseRatesPaise: { pmc: 100, sub_vendor: 12500 + index, in_house: null } } } }));
  const roomList = [...rooms, { ...rooms[0]!, id: "second-room", label: "Other room" }];
  const initial = configuredLineFixtures(current, roomList, new Set(["basket-pop"]), []).map(line => ({ ...line, included: true }));
  const changed = vi.fn();
  render(<LiveBuilder initialLines={initial} availableCatalogue={current} roomList={roomList} itemPresentation="catalogue" onLinesChange={changed} />);
  await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Ceiling choice 0");
  const premium = screen.getByRole("radio", { name: /Premium tier for/ });
  expect(screen.getByRole("radio", { name: /Functional tier for/ })).toBeDisabled();
  expect(screen.getAllByRole("radio", { name: /Premium tier for/ })).toHaveLength(1);
  expect(within(screen.getByText("Ceiling choice 0").closest(".configured-estimate-line") as HTMLElement).queryByRole("radio", { name: /tier for/ })).not.toBeInTheDocument();
  await user.click(premium);
  expect(changed).toHaveBeenCalledTimes(1);
  const after = changed.mock.lastCall![0] as ConfiguredLineDraft[];
  expect(after.filter(line => line.roomId === rooms[0]!.id)).toHaveLength(23);
  expect(after.filter(line => line.roomId === rooms[0]!.id).every(line => line.modeTier === "premium" && line.rateSource === "configuration")).toBe(true);
  expect(after.filter(line => line.roomId === "second-room")).toEqual(initial.filter(line => line.roomId === "second-room"));
  expect(screen.getByRole("textbox", { name: /Selling rate.*Ceiling choice 0/ })).toHaveValue("125");
});

it("blocks a group tier if one included hidden-by-search line has no configured price", async () => {
  const user = userEvent.setup(); const current = structuredClone(catalogue);
  const source = current.items[0]!.subBaskets[0]!.mainLines[0]!;
  source.applicableTiers = ["signature", "premium"];
  source.tierPricing = { signature: { modeBaseRatesPaise: source.modeBaseRatesPaise! }, premium: { modeBaseRatesPaise: { pmc: 100, sub_vendor: 12500, in_house: null } } };
  const initial = configuredLineFixtures(current, rooms, new Set(["basket-pop"]), []).map(line => ({ ...line, included: true }));
  const changed = vi.fn();
  render(<LiveBuilder initialLines={initial} availableCatalogue={current} onLinesChange={changed} />);
  await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "POP false");
  expect(screen.getByRole("radio", { name: /Premium tier for/ })).toBeDisabled();
  expect(changed).not.toHaveBeenCalled();
});


describe("mandatory row dimensions", () => {
  function measuredLine() {
    return { ...configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])[0]!, included: true,
      dimensionsMandatory: true, dimensionRule: { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "uom-sq", decimalScale: 2 },
      dimensions: { length: "2", width: "3", height: "4" }, quantity: 6 };
  }
  it("replaces direct quantity controls, records height and calculates length × width", async () => {
    const onLinesChange = vi.fn(); render(<LiveBuilder initialLines={[measuredLine()]} onLinesChange={onLinesChange} />);
    const dimensions = screen.getByRole("group", { name: /^Dimensions for / });
    expect(within(dimensions).getByText("Dimensions")).toBeVisible();
    expect(dimensions).not.toHaveTextContent("Enter positive length");
    expect(dimensions).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("spinbutton", { name: /Quantity/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Increase quantity/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Length \(ft\)/ }), { target: { value: "5.5" } });
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("16.5");
    fireEvent.change(screen.getByRole("textbox", { name: /Height \(ft\)/ }), { target: { value: "99" } });
    expect(onLinesChange.mock.lastCall![0][0]).toMatchObject({ quantity: 16.5, dimensions: { height: "99" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Length \(ft\)/ }), { target: { value: "" } });
    expect(dimensions).toHaveAccessibleDescription("Enter valid dimensions.");
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("Pending");
    await userEvent.click(screen.getByRole("button", { name: /More options/ }));
    expect(screen.queryByRole("button", { name: "Reset quantity" })).not.toBeInTheDocument();
  });
  it("requires rule confirmation and respects read-only controls", async () => {
    const view = render(<LiveBuilder initialLines={[{ ...measuredLine(), dimensionsNeedReview: true }]} />);
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("Pending");
    expect(screen.getByRole("group", { name: /^Dimensions for / })).toHaveAccessibleDescription("Measurement rule changed. Review dimensions (ft).");
    expect(screen.getByRole("button", { name: /Confirm dimensions for/ })).toHaveTextContent(/^Confirm dimensions$/);
    await userEvent.click(screen.getByRole("button", { name: /Confirm dimensions for/ }));
    expect(screen.getByLabelText(/Calculated quantity for/)).toHaveTextContent("6");
    view.unmount(); render(<LiveBuilder initialLines={[measuredLine()]} editable={false} />);
    expect(screen.getByRole("textbox", { name: /Length \(ft\)/ })).toBeDisabled();
  });
});
