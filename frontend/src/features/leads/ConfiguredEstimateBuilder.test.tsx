import { configuredLineFixtures } from "./configuredEstimate.test-fixture";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildConfiguredLines, createConfiguredLine, configuredLineAmountPaise, configuredQuantityUnits, parseSellingRate, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

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

function LiveBuilder({ initialLines = [], editable = true, availableCatalogue = catalogue, roomList = rooms, onLinesChange, itemPresentation = "selected", validateExcluded = false }: {
  initialLines?: ConfiguredLineDraft[]; editable?: boolean; availableCatalogue?: EstimationCatalogue;
  roomList?: typeof rooms; onLinesChange?: (lines: ConfiguredLineDraft[]) => void; itemPresentation?: "selected" | "catalogue";
  validateExcluded?: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [roomId, setRoomId] = useState(roomList[0]!.id);
  const update = (next: ConfiguredLineDraft[]) => { setLines(next); onLinesChange?.(next); };
  return <ConfiguredEstimateBuilder rooms={roomList} activeRoomId={roomId} onSelectRoom={setRoomId} catalogue={availableCatalogue}
    selectedMainBasketIds={new Set(availableCatalogue.items.map(basket => basket.id))} lines={lines} itemPresentation={itemPresentation}
    excludedReviewKeys={validateExcluded ? new Set(lines.filter(line => line.persistedId && !line.included &&
      (configuredQuantityUnits(line.quantity, line.uomDecimalScale, false) === null || parseSellingRate(line.rateInput).kind === "invalid")).map(line => line.key)) : undefined}
    onUpdateAvailableLine={(targetRoomId, target, change) => {
      const room = roomList.find(room => room.id === targetRoomId)!;
      const fresh = createConfiguredLine(availableCatalogue, room, target);
      if (fresh) update([...lines, updateConfiguredLinePricing(fresh, change)]);
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
    expect(screen.getByRole("checkbox", { name: /^Ceiling choice 20\b/ })).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Ceiling choice 999");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /^Ceiling choice 999\b/ })).toBeVisible();
    expect(onLinesChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /^Ceiling choice 999\b/ }));
    expect(onLinesChange.mock.lastCall?.[0]).toEqual([expect.objectContaining({ mainLineId: "line-999", included: true })]);
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.getByRole("checkbox", { name: /^Ceiling choice 0\b/ })).toBeVisible();
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
    expect(screen.getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked();
  });
  it("preserves mode choices and a manual override through quantity edits", async () => {
    const user = userEvent.setup();
    render(<LiveBuilder initialLines={[chosen()[0]!]} />);
    await user.click(screen.getByRole("radio", { name: /Special item type/ }));
    await user.click(screen.getByRole("radio", { name: /PMC pricing mode/ }));
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
    expect(screen.getByRole("radio", { name: /Signature tier for.*POP false ceiling/ })).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Reset quantity" }));
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(1);
    expect(trigger).toHaveFocus();
    expect(pane.scrollTop).toBe(300);
  });

  it("fills each mode base through keyboard radios, preserves overrides on the same choice, and restores Standard", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, classification: "standard" as const }));
    render(<LiveBuilder initialLines={initialLines} />);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const cove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const rate = within(pop).getByRole("textbox", { name: /Selling rate/ });
    expect(within(pop).getByText("Base price: ₹1,050 / sq ft")).toBeVisible();
    expect(within(pop).queryByRole("group", { name: /Pricing mode/ })).not.toBeInTheDocument();
    await user.click(within(pop).getByRole("radio", { name: /Special item type/ }));
    const group = within(pop).getByRole("group", { name: /Pricing mode for POP \/ Gypsum, NA, POP false ceiling in Living & Dining/ });
    expect(within(group).getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(["pmc", "sub_vendor", "in_house"]);
    const subVendor = within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ });
    expect(subVendor).toBeChecked();
    subVendor.focus();
    await user.keyboard("{ArrowLeft}");
    expect(within(group).getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked();
    expect(rate).toHaveValue("950");
    expect(within(pop).getByText("Base price: ₹950 / sq ft")).toBeVisible();
    await user.clear(rate);
    await user.type(rate, "999.25");
    await user.click(within(group).getByRole("radio", { name: /PMC pricing mode/ }));
    expect(rate).toHaveValue("999.25");
    await user.click(within(group).getByRole("radio", { name: /In-house pricing mode/ }));
    expect(rate).toHaveValue("1150");
    expect(within(pop).getByText("Base price: ₹1,150 / sq ft")).toBeVisible();
    expect(within(cove).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("105");
    await user.click(within(pop).getByRole("radio", { name: /Standard item type/ }));
    expect(rate).toHaveValue("1050");
    expect(within(pop).queryByRole("group", { name: /Pricing mode/ })).not.toBeInTheDocument();
  });

  it("shows all modes when bases are missing, distinguishes zero and keeps manual entry available", async () => {
    const user = userEvent.setup();
    const initialLines = configuredLineFixtures(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, included: true, classification: "special" as const }));
    render(<LiveBuilder initialLines={initialLines} />);
    const cove = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const rate = within(cove).getByRole("textbox", { name: /Selling rate/ });
    await user.click(within(cove).getByRole("radio", { name: /In-house pricing mode/ }));
    expect(rate).toHaveValue("");
    expect(within(cove).getByText("Base price not configured")).toBeVisible();
    expect(within(cove).getByText("Rate required")).toBeVisible();
    await user.type(rate, "71.25");
    expect(within(cove).getByText("Base price not configured")).toBeVisible();
    expect(within(cove).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹71.25");
    await user.click(within(cove).getByRole("radio", { name: /PMC pricing mode/ }));
    expect(rate).toHaveValue("0");
    expect(within(cove).getByText("Base price: ₹0 / Rft")).toBeVisible();
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
    expect(within(pop).getByText("Choose pricing mode")).toBeVisible();
    const group = within(pop).getByRole("group", { name: /Pricing mode/ });
    expect(within(group).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(within(pop).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("77.25");
    await user.click(within(group).getByRole("radio", { name: /Sub-Vendor pricing mode/ }));
    expect(within(pop).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("1050");
    view.rerender(<LiveBuilder key="readonly-mode" initialLines={initialLines.map((line, index) => index ? line : { ...line, pricingMode: "pmc", classification: "special" })} editable={false} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.getByText("Not recorded")).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: /Selling rate/ })[0]).toHaveValue("77.25");
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
    expect(within(readOnlyPop).getByText("Item type:")).toHaveTextContent("Item type: Standard");
    expect(within(readOnlyCove).getByText("Item type:")).toHaveTextContent("Item type: Special");
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

it("switches only one line's tier, adopts its price and shows unavailable choices without fallback", async () => {
  const user = userEvent.setup(); const current = structuredClone(catalogue);
  const source = current.items[0]!.subBaskets[0]!.mainLines[0]!;
  source.applicableTiers = ["signature", "premium", "functional"];
  source.tierPricing = { signature: { modeBaseRatesPaise: source.modeBaseRatesPaise! }, premium: { modeBaseRatesPaise: { pmc: 100, sub_vendor: 12500, in_house: null } } };
  const initial = configuredLineFixtures(current, rooms, new Set(["basket-pop"]), []).map(line => ({ ...line, included: true }));
  const changed = vi.fn();
  render(<LiveBuilder initialLines={initial} availableCatalogue={current} onLinesChange={changed} />);
  const premium = screen.getByRole("radio", { name: /Premium tier for.*POP false ceiling/ });
  expect(screen.getByRole("radio", { name: /Functional tier for.*POP false ceiling/ })).toBeDisabled();
  await user.click(premium);
  expect(premium).toBeChecked();
  expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("125");
  expect(changed.mock.lastCall?.[0].find((line: ConfiguredLineDraft) => line.mainLineId === "line-cove")).toMatchObject({ modeTier: "signature", rateInput: "105" });
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
