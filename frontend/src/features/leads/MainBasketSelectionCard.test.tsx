import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MainBasketSelectionCard } from "./MainBasketSelectionCard";
import type { EstimationCatalogueBasket, EstimationCatalogueMainLine } from "./estimationCatalogueApi";

it("excludes zero-only choices from counts while preserving positive-base and legacy choices", async () => {
  const line = (id: string, hasConfiguredBasePrice?: boolean): EstimationCatalogueMainLine => ({
    id, mainLineId: id, name: id, basketId: "basket", subBasketId: "sub", revisionId: `revision-${id}`,
    displayOrder: 0, hasConfiguredBasePrice, modeBaseRatesPaise: { pmc: 100, sub_vendor: 200, in_house: 300 }, uom: { id: "uom", code: "EA", name: "each", decimalScale: 0 }
  });
  const basket: EstimationCatalogueBasket = { id: "basket", name: "Painting", displayOrder: 0,
    directTemporaryItems: [{ ...line("direct-priced", true), itemType: "temporary", subBasketId: null },
      { ...line("direct-unpriced", false), itemType: "temporary", subBasketId: null }],
    subBaskets: [{ id: "sub", basketId: "basket", name: "Finishes", displayOrder: 0,
      mainLines: [line("positive-in-default-mode", true),
        { ...line("zero-only", false), modeBaseRatesPaise: { pmc: 0, sub_vendor: 0, in_house: 0 } }, line("legacy")],
      temporaryItems: [{ ...line("temporary-unpriced", false), itemType: "temporary" }] }] };
  const onToggle = vi.fn(), user = userEvent.setup();
  render(<MainBasketSelectionCard basket={basket} selected disabled={false} onToggle={onToggle} />);
  expect(screen.getByRole("button", { name: "Added Painting" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Show Painting details" }));
  expect(screen.getByText("2 Main Lines · 0 Temporary Items")).toBeVisible();
  expect(screen.getByText("1 Temporary Item")).toBeVisible();
  expect(basket.subBaskets[0]!.mainLines).toHaveLength(3);
  expect(onToggle).not.toHaveBeenCalled();
});
