import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildConfiguredLines, configuredLineAmountPaise, type ConfiguredLineDraft } from "./configuredEstimate";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const catalogue: EstimationCatalogue = {
  ineligibleLineCount: 0,
  items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [{
    id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
    mainLines: [{ id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na",
      name: "POP false ceiling", displayOrder: 1, revisionId: "revision-pop", itemType: "main_line",
      inHouseBaseRatePaise: 105_000, uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }],
    temporaryItems: [{ id: "line-cove", mainLineId: "line-cove", basketId: "basket-pop", subBasketId: "sub-na",
      name: "Cove in Gypsum", displayOrder: 2, revisionId: "revision-cove", itemType: "temporary",
      inHouseBaseRatePaise: 12_500, uom: { id: "uom-rft", code: "RFT", name: "Rft", decimalScale: 1 } }]
  }, { id: "sub-unused", basketId: "basket-pop", name: "Unused Sub Basket", displayOrder: 2,
    mainLines: [], temporaryItems: [] }] }]
};

const rooms = [{ id: "room-living", typeId: "living", label: "Living & Dining", sqft: 300 }];
const moneyPaise = (value: number) => `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function LiveBuilder({ initialLines, editable = true, availableCatalogue = catalogue }: {
  initialLines: ConfiguredLineDraft[];
  editable?: boolean;
  availableCatalogue?: EstimationCatalogue;
}) {
  const [lines, setLines] = useState(initialLines);
  const onUpdateLine = (key: string, change: Partial<ConfiguredLineDraft>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  };
  return <ConfiguredEstimateBuilder
    rooms={rooms} activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={availableCatalogue}
    selectedMainBasketIds={new Set(["basket-pop"])} lines={lines}
    onUpdateLine={onUpdateLine} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
    roomTotal={(roomId) => lines.filter((line) => line.roomId === roomId)
      .reduce((total, line) => total + (configuredLineAmountPaise(line) ?? 0), 0)}
    roomIcons={{}} moneyPaise={moneyPaise} editable={editable}
  />;
}

describe("ConfiguredEstimateBuilder", () => {
  it("previews each UOM's quantity times price while unchecked and changes only selected subtotals", async () => {
    const user = userEvent.setup();
    const initialLines = buildConfiguredLines(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => ({ ...line, quantity: line.mainLineId === "line-pop" ? 100 : 1, rateInput: "", included: false }));
    render(<LiveBuilder initialLines={initialLines} />);

    const basket = screen.getByRole("region", { name: "POP / Gypsum" });
    const pop = within(basket).getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const cove = within(basket).getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const popAmount = within(pop).getByRole("status", { name: /Preview amount for.*POP false ceiling.*not included in totals/i });
    const coveAmount = within(cove).getByRole("status", { name: /Preview amount for.*Cove in Gypsum.*not included in totals/i });
    const popRate = within(pop).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for.*POP false ceiling/ });
    const popQuantity = within(pop).getByRole("spinbutton", { name: /Quantity \(sq ft\) for.*POP false ceiling/ });
    const coveRate = within(cove).getByRole("textbox", { name: /Selling rate \(₹\/Rft\) for.*Cove in Gypsum/ });

    expect(within(pop).getByText("Amount · Not included")).toBeVisible();
    expect(within(pop).getByText("Quantity (sq ft)")).toBeVisible();
    expect(within(cove).getByText("Quantity (Rft)")).toBeVisible();
    expect(popAmount).toHaveTextContent("Pending");
    expect(coveAmount).toHaveTextContent("Pending");

    await user.type(popRate, "60");
    expect(popAmount).toHaveTextContent("₹6,000");
    await user.type(coveRate, "75");
    expect(coveAmount).toHaveTextContent("₹75");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹0/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*₹0/ })).toBeVisible();

    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(popCheckbox);
    expect(within(pop).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("₹6,000");
    expect(within(pop).queryByText("Amount · Not included")).not.toBeInTheDocument();
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹6,000/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*₹6,000/ })).toBeVisible();

    popQuantity.focus();
    await user.keyboard("{Control>}a{/Control}125.5");
    expect(popQuantity).toHaveValue(125.5);
    expect(within(pop).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("₹7,530");
    const increase = within(pop).getByRole("button", { name: /Increase quantity for.*POP false ceiling/ });
    increase.focus();
    await user.keyboard(" ");
    expect(popQuantity).toHaveValue(126.5);
    expect(within(pop).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("₹7,590");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹7,590/ })).toBeVisible();

    await user.click(popCheckbox);
    expect(within(pop).getByRole("status", { name: /Preview amount for.*POP false ceiling.*not included in totals/i })).toHaveTextContent("₹7,590");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹0/ })).toBeVisible();
    expect(popRate).toHaveValue("60");
    expect(popQuantity).toHaveValue(126.5);
  });

  it("shows pending for cleared or invalid fields, and keeps a saved unchecked preview in read-only mode", async () => {
    const user = userEvent.setup();
    const initialLines = buildConfiguredLines(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => line.mainLineId === "line-pop"
        ? { ...line, persistedId: "saved-pop", sourceMissing: true, quantity: 100, rateInput: "60", included: false }
        : { ...line, quantity: 1, rateInput: "75", included: false });
    const view = render(<LiveBuilder initialLines={initialLines} />);
    const saved = screen.getByRole("region", { name: "Saved items unavailable in current Configuration" });
    const savedRow = within(saved).getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    expect(within(savedRow).getByRole("status", { name: /Preview amount for.*POP false ceiling.*not included in totals/i })).toHaveTextContent("₹6,000");
    expect(within(savedRow).getByRole("spinbutton", { name: /Quantity \(sq ft\) for/ })).toBeEnabled();
    expect(within(savedRow).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for/ })).toBeEnabled();

    const rate = within(savedRow).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for/ });
    await user.clear(rate);
    expect(within(savedRow).getByRole("status", { name: /Preview amount for/ })).toHaveTextContent("Pending");
    await user.type(rate, "60.999");
    expect(within(savedRow).getByRole("status", { name: /Preview amount for/ })).toHaveTextContent("Pending");
    expect(within(savedRow).getByText("Enter a non-negative rate with up to two decimal places.")).toBeVisible();
    await user.clear(rate);
    await user.type(rate, "0");
    expect(within(savedRow).getByRole("status", { name: /Preview amount for/ })).toHaveTextContent("₹0");
    const quantity = within(savedRow).getByRole("spinbutton", { name: /Quantity \(sq ft\) for/ });
    await user.clear(quantity);
    expect(within(savedRow).getByRole("status", { name: /Preview amount for/ })).toHaveTextContent("Pending");
    expect(within(savedRow).getByText("Quantity must match sq ft precision.")).toBeVisible();

    view.rerender(<LiveBuilder key="saved-read-only" initialLines={initialLines} editable={false} />);
    const readOnlySaved = screen.getByRole("region", { name: "Saved items unavailable in current Configuration" });
    const readOnlyRow = within(readOnlySaved).getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    expect(within(readOnlyRow).getByRole("status", { name: /Preview amount for.*not included in totals/i })).toHaveTextContent("₹6,000");
    expect(within(readOnlyRow).getByRole("spinbutton", { name: /Quantity \(sq ft\) for/ })).toBeDisabled();
    expect(within(readOnlyRow).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for/ })).toBeDisabled();
    expect(within(readOnlyRow).getByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
    expect(within(readOnlyRow).getByRole("button", { name: /Increase quantity for/ })).toBeDisabled();
  });

  it("identifies amount overflow while unchecked and checked, then recovers when the quantity is corrected", async () => {
    const user = userEvent.setup();
    const initialLines = buildConfiguredLines(catalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => line.mainLineId === "line-pop"
        ? { ...line, quantity: 100_000_000, rateInput: "1000000", included: false }
        : line);
    render(<LiveBuilder initialLines={initialLines} />);

    const basket = screen.getByRole("region", { name: "POP / Gypsum" });
    const row = within(basket).getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const overflowMessage = "Amount too large for this quantity and price.";
    expect(within(row).getByRole("status", { name: /Preview amount for.*POP false ceiling.*not included in totals/i })).toHaveTextContent("Too large");
    const message = within(row).getByText(overflowMessage);
    expect(message).toBeVisible();
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹0/ })).toBeVisible();
    expect(within(basket).getByRole("button", { name: /NA.*₹0/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: /POP \/ Gypsum.*₹0/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*₹0/ })).toBeVisible();

    await user.click(within(row).getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(within(row).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("Too large");
    expect(message).toBeVisible();
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal Incomplete/ })).toBeVisible();
    expect(within(basket).getByRole("button", { name: /NA.*Incomplete/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: /POP \/ Gypsum.*Incomplete/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*Incomplete/ })).toBeVisible();

    const quantity = within(row).getByRole("spinbutton", { name: /Quantity \(sq ft\) for.*POP false ceiling/ });
    const rate = within(row).getByRole("textbox", { name: /Selling rate \(₹\/sq ft\) for.*POP false ceiling/ });
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveAttribute("aria-describedby", message.id);
    expect(rate).toHaveAttribute("aria-describedby", message.id);
    await user.clear(quantity);
    await user.type(quantity, "100");
    expect(within(row).queryByText(overflowMessage)).not.toBeInTheDocument();
    expect(quantity).toHaveAttribute("aria-invalid", "false");
    expect(rate).toHaveAttribute("aria-invalid", "false");
    expect(quantity).not.toHaveAttribute("aria-describedby");
    expect(rate).not.toHaveAttribute("aria-describedby");
    expect(within(row).getByRole("status", { name: /Amount for.*POP false ceiling/ })).toHaveTextContent("₹10,00,00,000");
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹10,00,00,000/ })).toBeVisible();
    expect(within(basket).getByRole("button", { name: /NA.*₹10,00,00,000/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: /POP \/ Gypsum.*₹10,00,00,000/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*₹10,00,00,000/ })).toBeVisible();
  });

  it("marks selected blank and malformed rates incomplete without losing their input errors", async () => {
    const user = userEvent.setup();
    const initialLines = buildConfiguredLines(catalogue, rooms, new Set(["basket-pop"]), [])
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

  it("previews a direct temporary item and marks its selected aggregate incomplete on overflow", async () => {
    const user = userEvent.setup();
    const directCatalogue: EstimationCatalogue = { ...catalogue, items: [{
      ...catalogue.items[0]!, directTemporaryItems: [{
        id: "line-direct", mainLineId: "line-direct", basketId: "basket-pop", subBasketId: null,
        name: "Cornice trim", displayOrder: 1, revisionId: "revision-direct", itemType: "temporary",
        inHouseBaseRatePaise: 2_000, uom: { id: "uom-rft", code: "RFT", name: "Rft", decimalScale: 1 }
      }]
    }] };
    const lines = buildConfiguredLines(directCatalogue, rooms, new Set(["basket-pop"]), [])
      .map((line) => line.mainLineId === "line-direct" ? { ...line, quantity: 12.5, rateInput: "8", included: false } : line);
    render(<LiveBuilder initialLines={lines} availableCatalogue={directCatalogue} />);

    const direct = screen.getByRole("region", { name: "Direct items in POP / Gypsum" });
    const row = within(direct).getByText("Cornice trim").closest(".configured-estimate-line") as HTMLElement;
    expect(within(row).getByText("Quantity (Rft)")).toBeVisible();
    expect(within(row).getByRole("textbox", { name: /Selling rate \(₹\/Rft\) for.*Cornice trim/ })).toHaveValue("8");
    expect(within(row).getByRole("status", { name: /Preview amount for.*Cornice trim.*not included in totals/i })).toHaveTextContent("₹100");
    expect(within(direct).getByText("₹0")).toBeVisible();

    await user.click(within(row).getByRole("checkbox", { name: /Cornice trim/ }));
    const quantity = within(row).getByRole("spinbutton", { name: /Quantity \(Rft\) for.*Cornice trim/ });
    const rate = within(row).getByRole("textbox", { name: /Selling rate \(₹\/Rft\) for.*Cornice trim/ });
    await user.clear(rate);
    await user.type(rate, "1000000");
    await user.clear(quantity);
    await user.type(quantity, "100000000");
    expect(within(row).getByRole("status", { name: /Amount for.*Cornice trim/ })).toHaveTextContent("Too large");
    expect(within(direct).getByText("Incomplete")).toBeVisible();
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal Incomplete/ })).toBeVisible();

    await user.clear(quantity);
    await user.type(quantity, "12.5");
    expect(within(direct).queryByText("Incomplete")).not.toBeInTheDocument();
    const directHeading = within(direct).getByRole("heading", { name: "Direct items" }).parentElement as HTMLElement;
    expect(within(directHeading).getByText("₹1,25,00,000")).toBeVisible();
  });

  it("shows compact priced rows and opens a collapsed Main Basket from keyboard and jump navigation", async () => {
    const user = userEvent.setup();
    const onUpdateLine = vi.fn();
    const lines = buildConfiguredLines(catalogue, [{ id: "room-living", label: "Living & Dining" }],
      new Set(["basket-pop"]), []).map((line) => ({ ...line, included: true }));
    render(<ConfiguredEstimateBuilder
      rooms={[{ id: "room-living", typeId: "living", label: "Living & Dining", sqft: 300 }, { id: "room-master", typeId: "master", label: "Master Bedroom", sqft: 200 }]}
      activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={catalogue}
      selectedMainBasketIds={new Set(["basket-pop"])} lines={lines}
      onUpdateLine={onUpdateLine} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
      roomTotal={() => 117_500} roomIcons={{}} moneyPaise={(value) => `₹${(value / 100).toFixed(2)}`}
      editable
    />);

    const basket = screen.getByRole("region", { name: "POP / Gypsum" });
    const row = within(basket).getByText("POP false ceiling").closest(".configured-estimate-line");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(1);
    expect(within(row as HTMLElement).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("1050");
    expect(within(row as HTMLElement).getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹1050.00");
    expect(within(basket).queryByText("Main Line")).not.toBeInTheDocument();
    expect(within(basket).queryByText("Temporary item")).not.toBeInTheDocument();
    expect(within(basket).queryByRole("region", { name: "Unused Sub Basket" })).not.toBeInTheDocument();

    const collapse = within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal/ });
    collapse.focus();
    await user.keyboard(" ");
    expect(within(basket).getByRole("button", { name: /Expand POP \/ Gypsum, subtotal/ })).toHaveAttribute("aria-expanded", "false");
    expect(within(basket).queryByRole("checkbox", { name: /POP false ceiling/ })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole("navigation", { name: "Jump to Main Basket" }))
      .getByRole("button", { name: /POP \/ Gypsum/ }));
    expect(within(basket).getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(basket).getByRole("checkbox", { name: /Cove in Gypsum/ })).toBeVisible();

    await user.click(within(row as HTMLElement).getByRole("button", { name: /Increase quantity for.*POP false ceiling/ }));
    expect(onUpdateLine).toHaveBeenCalledWith(lines[0]?.key, { quantity: 2 });

    const subBasket = within(basket).getByRole("region", { name: "NA" });
    const subBasketToggle = within(subBasket).getByRole("button", { name: /NA.*2 items/ });
    subBasketToggle.focus();
    await user.keyboard(" ");
    expect(subBasketToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(subBasket).queryByRole("checkbox", { name: /Cove in Gypsum/ })).not.toBeInTheDocument();
    await user.click(subBasketToggle);

    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Cove");
    expect(within(basket).getByText("Cove in Gypsum")).toBeVisible();
    expect(within(basket).queryByText("POP false ceiling")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selected (2)" }));
    const roomNavigation = screen.getByRole("navigation", { name: "Rooms" });
    expect(within(roomNavigation).getByRole("button", { name: /Living & Dining/ })).toBeVisible();
    expect(within(roomNavigation).queryByRole("button", { name: /Master Bedroom/ })).not.toBeInTheDocument();
  });

  it("filters Main Baskets without changing selection and gives an empty Selected view", async () => {
    const user = userEvent.setup();
    const withPainting: EstimationCatalogue = { ...catalogue, items: [...catalogue.items, {
      id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [], subBaskets: [{
        id: "sub-paint", basketId: "basket-paint", name: "Walls", displayOrder: 1,
        mainLines: [{ id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint",
          name: "Wall paint", displayOrder: 1, revisionId: "revision-paint", itemType: "main_line",
          inHouseBaseRatePaise: 8_000, uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }],
        temporaryItems: []
      }]
    }] };
    const selectedMainBasketIds = new Set(["basket-pop", "basket-paint"]);
    const lines = buildConfiguredLines(withPainting, [{ id: "room-living", label: "Living & Dining" }], selectedMainBasketIds, []);
    render(<ConfiguredEstimateBuilder rooms={[{ id: "room-living", typeId: "living", label: "Living & Dining", sqft: 300 }]}
      activeRoomId="room-living" onSelectRoom={vi.fn()} catalogue={withPainting} selectedMainBasketIds={selectedMainBasketIds}
      lines={lines} onUpdateLine={vi.fn()} onRefreshAvailableItems={vi.fn()} refreshingAvailableItems={false}
      roomTotal={() => 0} roomIcons={{}} moneyPaise={(value) => `₹${value / 100}`} editable />);

    await user.click(screen.getByRole("button", { name: "Selected (0)" }));
    expect(screen.getAllByText("No selected items yet. Choose By Section to add items.")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "By Section" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter Main Baskets" }), "basket-paint");
    expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selected (0)" })).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "gypsum");
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation", { name: "Jump to Main Basket" }))
      .getByRole("button", { name: /Painting/ }));
    expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search estimate items" })).toHaveValue("");
  });
});
