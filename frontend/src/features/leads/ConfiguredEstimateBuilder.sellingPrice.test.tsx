import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import { buildConfiguredLines, configuredLineAmountPaise, createConfiguredLine, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const room = { id: "living", typeId: "living", label: "Living room", sqft: 100 };
const baskets = new Set(["finishes"]);
// Estimation receives final selling prices from the server, without margin fields.
const catalogue: EstimationCatalogue = { ineligibleLineCount: 0, items: [{
  id: "finishes", name: "Finishes", displayOrder: 1, subBaskets: [{
    id: "walls", basketId: "finishes", name: "Walls", displayOrder: 1, mainLines: [{
      id: "paint", mainLineId: "paint", basketId: "finishes", subBasketId: "walls", name: "Wall painting",
      displayOrder: 1, revisionId: "paint-current", applicableTiers: ["signature", "premium"],
      modeBaseRatesPaise: { pmc: 18_000, sub_vendor: 25_000, in_house: 27_500 },
      tierPricing: {
        signature: { modeBaseRatesPaise: { pmc: 18_000, sub_vendor: 25_000, in_house: 27_500 } },
        premium: { modeBaseRatesPaise: { pmc: 24_000, sub_vendor: 30_000, in_house: 35_000 } }
      },
      uom: { id: "sqft", code: "SQFT", name: "sq ft", decimalScale: 2 }
    }, {
      id: "primer", mainLineId: "primer", basketId: "finishes", subBasketId: "walls", name: "Wall primer",
      displayOrder: 2, revisionId: "primer-current", applicableTiers: ["signature", "premium"],
      tierPricing: { signature: { modeBaseRatesPaise: { pmc: null, sub_vendor: 15_000, in_house: null } }, premium: { modeBaseRatesPaise: { pmc: null, sub_vendor: 20_000, in_house: null } } }, modeBaseRatesPaise: { pmc: null, sub_vendor: 15_000, in_house: null },
      uom: { id: "sqft", code: "SQFT", name: "sq ft", decimalScale: 2 }
    }]
  }]
}] };

function SellingPriceBuilder({ paintClassification = "standard" }: { paintClassification?: "standard" | "special" }) {
  const [lines, setLines] = useState<ConfiguredLineDraft[]>(() => ["paint", "primer"].map((mainLineId, index) => ({
    ...createConfiguredLine(catalogue, room, { mainLineId, basketId: "finishes", subBasketId: "walls" })!,
    included: true, quantity: index + 2, classification: mainLineId === "paint" ? paintClassification : "standard" as const
  })));
  return <ConfiguredEstimateBuilder rooms={[room]} activeRoomId={room.id} onSelectRoom={vi.fn()} catalogue={catalogue}
    selectedMainBasketIds={baskets} lines={lines} editable roomIcons={{}}
    moneyPaise={amount => `₹${amount / 100}`}
    roomTotal={() => lines.reduce((total, line) => total + (configuredLineAmountPaise(line) ?? 0), 0)}
    onUpdateLine={(key, change) => setLines(current => current.map(line => line.key === key ? updateConfiguredLinePricing(line, change) : line))}
    onRefreshAvailableItems={() => setLines(current => buildConfiguredLines(catalogue, [room], baskets, current))}
    refreshingAvailableItems={false} />;
}

function paintRow() {
  return within(screen.getByText("Wall painting").closest(".configured-estimate-line") as HTMLElement);
}

describe("configured estimate selling prices", () => {
  it("keeps compact row controls in reading order and exposes unavailable-tier guidance", async () => {
    const user = userEvent.setup();
    render(<SellingPriceBuilder paintClassification="special" />);
    const paint = paintRow();
    expect(paint.queryByRole("group", { name: /Item type/ })).not.toBeInTheDocument();
    expect(paint.getByRole("radio", { name: /Signature tier for/ })).toBeChecked();
    expect(paint.getByRole("radio", { name: /Functional tier/ })).toBeDisabled();
    const inclusion = paint.getByRole("checkbox", { name: "Include Wall painting in Living room" });
    inclusion.focus();
    const controls = [
      paint.getByRole("switch", { name: /PMC pricing mode/ }),
      paint.getByRole("radio", { name: /Signature tier for/ }),
      paint.getByRole("button", { name: /Decrease quantity/ }),
      paint.getByRole("spinbutton", { name: /Quantity/ }),
      paint.getByRole("button", { name: /Increase quantity/ }),
      paint.getByRole("button", { name: "More options for Wall painting" })
    ];
    for (const control of controls) {
      await user.tab();
      expect(control).toHaveFocus();
    }
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Remove from estimate" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(controls.at(-1)).toHaveFocus();
    expect(paint.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("250");
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹500");
  });

  it("shows the final price and quantity total without margin calculations", () => {
    const { container } = render(<SellingPriceBuilder />);
    const paint = paintRow();
    expect(paint.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("250");
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹500");
    expect(paint.queryByText(/Configured price|Base price/)).not.toBeInTheDocument();
    const primer = within(screen.getByText("Wall primer").closest(".configured-estimate-line") as HTMLElement);
    expect(primer.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("150");
    expect(primer.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹450");
    expect(screen.getByRole("button", { name: /Collapse Finishes, subtotal ₹950/ })).toBeVisible();
    expect(container).not.toHaveTextContent(/margin|profit|25%|base price|configured price|200 \+/i);
  });

  it("blocks manual selling prices and adopts the final price on mode and tier changes", async () => {
    const user = userEvent.setup();
    render(<SellingPriceBuilder paintClassification="special" />);
    const paint = paintRow();
    const rate = paint.getByRole("textbox", { name: /Selling rate/ });
    expect(rate).toBeDisabled();
    fireEvent.change(rate, { target: { value: "225" } });
    await user.type(rate, "225");
    await user.click(paint.getByRole("button", { name: /Increase quantity/ }));
    expect(rate).toHaveValue("250");
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹750");
    await user.click(screen.getByRole("button", { name: /Refresh available items/ }));
    expect(rate).toHaveValue("250");
    const pmc = paint.getByRole("switch", { name: /PMC pricing mode/ });
    pmc.focus();
    await user.keyboard(" ");
    expect(pmc).toBeChecked();
    expect(paint.queryByRole("radio", { name: /Sub-Vendor pricing mode/ })).not.toBeInTheDocument();
    expect(rate).toHaveValue("180");
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹540");
    await user.click(paint.getByRole("radio", { name: /Premium tier/ }));
    expect(rate).toHaveValue("240");
    await user.click(pmc);
    expect(pmc).not.toBeChecked();
    expect(rate).toHaveValue("300");
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹900");
    await user.click(pmc);
    expect(rate).toHaveValue("240");
    expect(paint.queryByText(/Configured price|Base price/)).not.toBeInTheDocument();
    expect(paint.getByRole("status", { name: /Amount for/ })).toHaveTextContent("₹720");
    expect(paint.queryByText(/base price|margin|profit|%/i)).not.toBeInTheDocument();
  });
});
