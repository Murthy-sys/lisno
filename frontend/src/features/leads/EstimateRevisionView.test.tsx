import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateRevisionView } from "./EstimateRevisionView";
import type { EstimateRevisionDetail } from "./estimateRevisionsApi";

const revision: EstimateRevisionDetail = {
  id: "round-frozen", estimateId: "estimate-a", estimateVersion: 3, sendGeneration: 1, phase: "pre", submittedAt: "2026-10-31T06:00:00Z",
  status: "superseded", deliveryStatus: "sent", subtotalPaise: 27500,
  snapshot: {
    clientName: "Saved client", projectName: "Saved project", location: "Pune", propertyType: "Villa",
    rooms: [{ id: "room-a", label: "Bedroom" }, { id: "room-b", label: "Bedroom" }],
    lineItems: [
      { id: "line-a", source: "configuration", catalogueId: "main-a", roomId: "room-a", roomName: "Bedroom", specification: "Saved ceiling specification",
        mainBasketId: "basket-a", mainBasketName: "Saved finishes", subBasketId: "sub-a", subBasketName: "Saved plaster", mainLineName: "Archived ceiling", uomName: "sq-ft",
        unit: "sq-ft", rate: 999, ratePaise: 7500, quantity: 99, amount: 9999, amountPaise: 20000, included: true,
        classification: "special", pricingMode: "sub_vendor", modeTier: "premium", dimensionsMandatory: true,
        dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "unit", decimalScale: 2 }, dimensions: { length: "4", width: "6", height: "9" } },
      { id: "line-b", source: "configuration", catalogueId: "main-b", roomId: "room-b", roomName: "Bedroom", specification: null,
        mainBasketId: "basket-b", mainBasketName: "Saved finishes", subBasketId: "sub-b", subBasketName: "Saved plaster", mainLineName: "Archived paint", unit: "sq-ft",
        rate: 75, ratePaise: 7500, quantity: 1, amount: 75, amountPaise: 7500, included: true },
      { id: "line-c", catalogueId: "legacy-c", roomName: "Older study", specification: "Legacy shelf", unit: "each", rate: 10.25, quantity: 2, amount: 20.5, included: false }
    ], subtotal: 275, gst: 49.5, total: 324.5, subtotalPaise: 27500, gstPaise: 4950, totalPaise: 32450
  }
};

const props = { revision, view: "builder" as const, activeRoomId: null, onSelectRoom: vi.fn(), navigation: <nav aria-label="Test revisions">Current estimate</nav> };

describe("EstimateRevisionView", () => {
  it.each([true, false])("shows the frozen combined price and exact total without component details (included=%s)", included => {
    const aggregate = structuredClone(revision);
    aggregate.snapshot.lineItems = [{ ...aggregate.snapshot.lineItems[0]!, mainLineId: "main-a", quantity: 3,
      included, rate: null, ratePaise: null, amount: included ? 783.34 : 0, amountPaise: included ? 78334 : 0, pricingMode: "in_house", pricingBasis: "in_house_components_v1",
      inHouseUsage: "estimator", inHousePricingState: "ready",
      aggregatePricing: { visibility: "aggregate", formulaVersion: "in_house_components_v1", mainLineId: "main-a", revisionId: "old-config",
        sourceItemVersion: 1, sourceRevisionVersion: 1, modeTier: "premium", quantity: "3",
        uom: { id: "unit", code: "SQFT", name: "sq-ft", decimalScale: 2 }, totalPaise: 78334, inputFingerprint: "a".repeat(64) } }];
    render(<EstimateRevisionView {...props} revision={aggregate} />);
    const line = screen.getByRole("article", { name: "Archived ceiling" });
    expect(line).toHaveTextContent("Price including margin (₹/sq-ft)₹261.11");
    expect(line).toHaveTextContent(included ? "Amount₹783.34" : "Amount₹0.00");
    expect(line).not.toHaveTextContent("Not recorded");
    expect(screen.queryByText(/Saved component amounts/)).not.toBeInTheDocument();
  });
  it.each(["summary", "proposal"] as const)("shows the recorded rounding adjustment in %s without changing GST", view => {
    const rounded = structuredClone(revision);
    Object.assign(rounded.snapshot, { total: 324, totalPaise: 32400, roundOffPaise: -50 });
    render(<EstimateRevisionView {...props} revision={rounded} view={view} />);
    const totals = screen.getByLabelText("Saved revision totals");
    expect(totals).toHaveTextContent("Subtotal before GST₹275.00");
    expect(totals).toHaveTextContent("GST₹49.50");
    expect(totals).toHaveTextContent("Round off−₹0.50");
    expect(totals).toHaveTextContent("Total including GST₹324.00");
  });
  it("renders only frozen values, including recorded amounts that differ from quantity times rate", () => {
    const { container } = render(<EstimateRevisionView {...props} />);
    const line = screen.getByRole("article", { name: "Archived ceiling" });
    expect(line).toHaveTextContent("₹75.00");
    expect(line).toHaveTextContent("₹200.00");
    expect(line).not.toHaveTextContent("₹7,425.00");
    expect(line).not.toHaveTextContent("₹999.00");
    expect(line).toHaveTextContent("99");
    expect(line).toHaveTextContent("Length 4 ft · Width 6 ft · Height 9 ft");
    expect(line).toHaveTextContent("Special");
    expect(line).toHaveTextContent("Premium");
    expect(screen.getByRole("article", { name: "Legacy shelf" })).toHaveTextContent("Not included");
    expect(screen.getByRole("article", { name: "Legacy shelf" })).toHaveTextContent("₹20.50");
    expect(screen.getByText("Read-only")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Showing Pre-estimate · R1, saved items. Read-only.");
    expect(container.querySelector("input, select, textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: /save|submit|refresh|increase|decrease/i })).not.toBeInTheDocument();
  });

  it("keeps identical room and basket labels separate by their stored IDs", async () => {
    const user = userEvent.setup();
    const onSelectRoom = vi.fn();
    const view = render(<EstimateRevisionView {...props} onSelectRoom={onSelectRoom} />);
    expect(screen.getAllByRole("region", { name: "Saved finishes" })).toHaveLength(2);
    const roomButtons = within(screen.getByRole("navigation", { name: "Saved revision rooms" })).getAllByRole("button", { name: "Bedroom 1 item" });
    await user.click(roomButtons[1]!);
    expect(onSelectRoom).toHaveBeenCalledWith("room-b");
    view.rerender(<EstimateRevisionView {...props} onSelectRoom={onSelectRoom} activeRoomId="room-b" />);
    expect(screen.getByRole("article", { name: "Archived paint" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Archived ceiling" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Legacy shelf" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All rooms 3 items" }));
    expect(onSelectRoom).toHaveBeenLastCalledWith(null);
  });

  it.each(["summary", "proposal"] as const)("shows selected snapshot totals and original context in %s", view => {
    render(<EstimateRevisionView {...props} view={view} />);
    const totals = screen.getByLabelText("Saved revision totals");
    expect(totals).toHaveTextContent("Subtotal before GST₹275.00");
    expect(totals).toHaveTextContent("GST₹49.50");
    expect(totals).toHaveTextContent("Total including GST₹324.50");
    if (view === "proposal") {
      expect(screen.getByText("Saved project")).toBeVisible();
      expect(screen.getByText("Saved client · Pune · Villa")).toBeVisible();
      expect(screen.getByRole("article", { name: "Archived ceiling" })).toBeVisible();
    } else {
      expect(screen.getByRole("heading", { name: "Saved estimate summary" })).toBeVisible();
      expect(screen.getAllByText("1 item included")).toHaveLength(2);
    }
  });

  it("retains legacy labels without manufacturing room or basket joins", () => {
    const legacy = structuredClone(revision);
    delete legacy.phase;
    delete legacy.snapshot.rooms;
    legacy.snapshot.lineItems = [
      { catalogueId: "old-1", roomName: "Kitchen", specification: "First legacy item", mainBasketName: "Historic joinery", subBasketName: "Historic cabinets", unit: "each", quantity: 1, rate: 0, amount: 0, included: true },
      { catalogueId: "old-2", roomName: "Kitchen", specification: "Second legacy item", unit: "each", quantity: 2, rate: null, amount: null, included: true }
    ];
    render(<EstimateRevisionView {...props} revision={legacy} />);
    expect(screen.getByRole("heading", { name: "Estimate · R1" })).toBeVisible();
    expect(screen.getByText("Room grouping was not recorded.")).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Saved revision rooms" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Ungrouped saved items" })).toBeVisible();
    expect(screen.getByRole("article", { name: "First legacy item" })).toHaveTextContent("Historic joinery / Historic cabinets");
    expect(screen.getByRole("article", { name: "First legacy item" })).toHaveTextContent("₹0.00");
    expect(screen.getByRole("article", { name: "Second legacy item" })).toHaveTextContent("Not recorded");
  });

  it("uses stable line room IDs when optional saved room metadata is absent", () => {
    const missingRooms = structuredClone(revision);
    delete missingRooms.snapshot.rooms;
    render(<EstimateRevisionView {...props} revision={missingRooms} activeRoomId="room-a" />);
    expect(within(screen.getByRole("navigation", { name: "Saved revision rooms" })).getAllByRole("button", { name: "Bedroom 1 item" })).toHaveLength(2);
    expect(screen.getByRole("article", { name: "Archived ceiling" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Archived paint" })).not.toBeInTheDocument();
  });

  it("displays only saved component pricing and preserves zero and absent amounts", async () => {
    const user = userEvent.setup();
    const components = structuredClone(revision);
    components.snapshot.lineItems = [{ ...components.snapshot.lineItems[0]!, rate: null, ratePaise: null, pricingMode: "in_house", pricingBasis: "in_house_components_v1",
      componentPricing: { formulaVersion: "in_house_components_v1", mainLineId: "main-a", revisionId: "old-config", sourceItemVersion: 1, sourceRevisionVersion: 1,
        modeTier: "premium", quantity: "5", uom: { id: "unit", code: "SQFT", name: "sq-ft", decimalScale: 2 }, selectedComponentIds: ["component-1"],
        components: [{ id: "component-1", basketId: "component-basket", subBasketId: "component-sub", basketName: "Saved component basket", subBasketName: "Saved component section", laborSellingPaise: 0, materialSellingPaise: 20000, totalPaise: 20000 }], totalPaise: 20000, inputFingerprint: "a".repeat(64) } }];
    render(<EstimateRevisionView {...props} revision={components} />);
    expect(screen.getByText("Component pricing")).toBeVisible();
    await user.click(screen.getByText("Saved component amounts for Archived ceiling"));
    expect(screen.getByText("Saved component basket / Saved component section")).toBeVisible();
    expect(screen.getByText("₹0.00")).toBeVisible();
    expect(screen.getByText("5 sq-ft · ₹200.00")).toBeVisible();
  });

  it("renders an empty frozen selection and keeps room navigation keyboard-operable", async () => {
    const user = userEvent.setup();
    const empty = structuredClone(revision);
    empty.snapshot.lineItems = [];
    const onSelectRoom = vi.fn();
    render(<EstimateRevisionView {...props} revision={empty} onSelectRoom={onSelectRoom} />);
    expect(screen.getByText("No saved items in this selection.")).toBeVisible();
    await user.tab();
    expect(screen.getByRole("button", { name: "All rooms 0 items" })).toHaveFocus();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelectRoom).toHaveBeenCalledWith("room-a");
    expect(screen.getByRole("region", { name: "Saved revision items" })).toHaveAttribute("tabindex", "0");
  });
});
