import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstimateClientReviewSnapshot } from "../../api/types";
import { componentPricingFixture } from "../leads/estimateComponentPricing.testFixtures";
import { SubmittedEstimateBuilder } from "./SubmittedEstimateBuilder";

type Line = EstimateClientReviewSnapshot["lineItems"][number];
const line = (overrides: Partial<Line> = {}): Line => ({
  id: "cabinet", source: "configuration", catalogueId: "cabinet", mainLineId: "cabinet", mainLineName: "Submitted oak cabinet",
  roomId: "kitchen", roomName: "Kitchen", mainBasketId: "joinery", mainBasketName: "Submitted joinery",
  subBasketId: "units", subBasketName: "Submitted units", quantity: 2, rate: 999, ratePaise: 10125,
  amount: 1998, amountPaise: 20250, included: true, specification: null, unit: "each", uomName: "Unit", modeTier: "premium",
  ...overrides
});
const snapshot = (lines: Line[]): EstimateClientReviewSnapshot => ({
  clientName: "Synthetic Client", projectName: "Synthetic home", propertyType: "Villa", location: "Sample city",
  lineItems: lines, subtotal: 450, gst: 81, total: 531, subtotalPaise: 45000, gstPaise: 8100, totalPaise: 53100
});
const setup = (lines: Line[], props: { workspace?: boolean; refreshing?: boolean } = {}) => {
  const onRefresh = vi.fn();
  return { ...render(<SubmittedEstimateBuilder snapshot={snapshot(lines)} refreshing={false} onRefresh={onRefresh} {...props} />), onRefresh };
};

describe("SubmittedEstimateBuilder", () => {
  it("renders only frozen Client-visible included rows and saved paise without edit controls or current repricing", async () => {
    setup([line({ estimateNotes: ["Preserve the submitted finish"], dimensions: { length: "2", width: "1", height: "0" } }),
      line({ id: "bedroom", roomId: "bedroom", roomName: "Bedroom", mainLineName: "Submitted wardrobe", quantity: 7, amountPaise: 70875 }),
      line({ id: "hidden", mainLineName: "Private cost item", clientVisible: false }),
      line({ id: "excluded", mainLineName: "Excluded option", included: false })]);
    const item = screen.getByRole("article", { name: "Submitted oak cabinet in Kitchen" });
    expect(within(item).getByText("₹202.50")).toBeVisible();
    expect(within(item).getByText("₹101.25")).toBeVisible();
    expect(within(item).getByText("Premium")).toBeVisible();
    expect(within(item).getByText("2 Unit")).toBeVisible();
    expect(within(item).getByText(/Dimensions: 2 × 1 × 0/)).toBeVisible();
    expect(within(item).getByText("Preserve the submitted finish")).toBeVisible();
    expect(screen.queryByText("₹1,998.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Private cost item")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluded option")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove|Approve|Save changes|Add item/ })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ }));
    expect(screen.getByRole("article", { name: "Submitted wardrobe in Bedroom" })).toHaveTextContent("₹708.75");
    expect(screen.queryByRole("article", { name: "Submitted oak cabinet in Kitchen" })).not.toBeInTheDocument();
  });

  it("keeps rooms with equal names separate by ID and places lines without IDs in Other saved items", async () => {
    setup([line({ roomId: "first", roomName: "Bedroom" }),
      line({ id: "second", roomId: "second", roomName: "Bedroom", mainLineName: "Second wardrobe", amountPaise: 90000 }),
      line({ id: undefined, roomId: undefined, roomName: "Historic room", source: "legacy", catalogueId: "FC01", mainLineName: undefined,
        mainBasketId: undefined, mainBasketName: undefined, subBasketId: undefined, subBasketName: undefined })]);
    const rooms = within(screen.getByRole("navigation", { name: "Rooms" }));
    expect(rooms.getAllByRole("button", { name: /Bedroom/ })).toHaveLength(2);
    await userEvent.click(rooms.getAllByRole("button", { name: /Bedroom/ })[1]!);
    expect(screen.getByRole("article", { name: "Second wardrobe in Bedroom" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Submitted oak cabinet in Bedroom" })).not.toBeInTheDocument();
    await userEvent.click(rooms.getByRole("button", { name: /Other saved items/ }));
    expect(screen.getByRole("article", { name: "False ceiling — main area in Historic room" })).toBeVisible();
    expect(screen.getByText("Historic room")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Historic room/ })).not.toBeInTheDocument();
  });

  it("keeps a temporary direct item in its saved Main Basket without inventing a Sub Basket", () => {
    setup([line({ itemType: "temporary", subBasketId: null, subBasketName: null, mainLineName: "Site protection" })]);
    const direct = screen.getByRole("region", { name: "Direct items in Submitted joinery" });
    expect(within(direct).getByRole("article", { name: "Site protection in Kitchen" })).toBeVisible();
    expect(within(direct).getByText("Kitchen · Temporary item")).toBeVisible();
    expect(screen.queryByText("Saved Sub Basket")).not.toBeInTheDocument();
  });

  it("does not substitute legacy amounts or fabricate a zero subtotal for missing paise", () => {
    setup([line({ amountPaise: null, amount: 999, ratePaise: null, rate: 999 })]);
    const item = screen.getByRole("article", { name: "Submitted oak cabinet in Kitchen" });
    expect(within(item).getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText("Submitted visible subtotal unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText(/₹0\.00|₹999/)).not.toBeInTheDocument();
  });

  it("converts legacy rupees once and uses the frozen amount instead of multiplying quantity and rate", () => {
    setup([line({ amountPaise: undefined, amount: 12.34, ratePaise: undefined, rate: 8.75, quantity: 3 })]);
    const item = screen.getByRole("article", { name: "Submitted oak cabinet in Kitchen" });
    expect(within(item).getByText("₹12.34")).toBeVisible();
    expect(within(item).getByText("₹8.75")).toBeVisible();
    expect(screen.queryByText("₹26.25")).not.toBeInTheDocument();
  });

  it("shows valid frozen component evidence without inventing a per-unit rate", async () => {
    setup([line({ pricingMode: "in_house", rateSource: "configuration", pricingBasis: "in_house_components_v1",
      componentPricing: componentPricingFixture(), ratePaise: null, rate: null, amountPaise: 78333, amount: 783.33 })]);
    const item = screen.getByRole("article", { name: "Submitted oak cabinet in Kitchen" });
    expect(within(item).getByText("Calculated from saved components")).toBeVisible();
    const disclosure = within(item).getByText("Component selling amounts for Submitted oak cabinet · ₹783.33");
    await userEvent.click(disclosure);
    expect(within(item).getByText("Finishes / Ceiling")).toBeVisible();
    expect(within(item).getByText("₹250.00")).toBeVisible();
    expect(within(item).queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("does not present mismatched component evidence as a valid calculation", () => {
    setup([line({ pricingMode: "in_house", rateSource: "configuration", pricingBasis: "in_house_components_v1",
      componentPricing: componentPricingFixture(), ratePaise: null, rate: null, amountPaise: 50000 })]);
    expect(screen.getByText("Saved component details are unavailable.")).toBeVisible();
    expect(screen.queryByText(/Component selling amounts/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("₹500.00")).toBeVisible();
  });

  it("supports searching and keyboard refresh without mutating snapshot values", async () => {
    const { onRefresh } = setup([line(), line({ id: "pantry", mainLineName: "Pantry drawer", estimateNotes: ["Brass handle"] })]);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "brass");
    expect(screen.getByRole("article", { name: "Pantry drawer in Kitchen" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Submitted oak cabinet in Kitchen" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.getByRole("article", { name: "Submitted oak cabinet in Kitchen" })).toBeVisible();
    const refresh = screen.getByRole("button", { name: "Refresh available items" });
    refresh.focus(); await user.keyboard("{Enter}");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveFocus();
  });

  it("shows an honest empty state and disables refresh while refreshing", () => {
    setup([], { refreshing: true });
    expect(screen.getByText("No visible item details are available in this submitted estimate.")).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh submitted items" })).toBeDisabled();
    expect(screen.queryByText(/Choose By Section to add items/)).not.toBeInTheDocument();
  });
});
