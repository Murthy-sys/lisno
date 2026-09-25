import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { KnowledgeModeSimulator, runNativeModeSimulation, type NativeModeSimulationInput } from "./KnowledgeModeSimulator";
import type { KnowledgePreview } from "../../../../shared/knowledge/knowledgeTypes";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

const draft = { baseRate: "100", lowQuantityLimit: "15", impactRate: "10", minimumRate: "20", startingRate: "30" };
const base: NativeModeSimulationInput = {
  scope: "pmc", payload: { pmcMinimumMarginBps: 1000, pmcMarginBps: 2000, subVendorMinimumMarginBps: 2500, subVendorMarginBps: 5000 },
  drafts: { pmc: draft, sub_vendor: draft, in_house_labor: draft, in_house_material: draft },
  uom: { id: "uom-1", label: "Square foot", scale: 2 }, quantity: "1", discount: "10", basis: "starting"
};
const pmc = { baseAmountPaise: 10000, lowQuantityImpactAmountPaise: 1000, revisedUnitRatePaise: 11000, revisedAmountPaise: 11000, totalPaise: 13475, appliedImpactBps: 1000, pmcMarginBps: 2000, pmcMarginAmountPaise: 2750, totalBeforeDiscountPaise: 13750, finalVendorChargesPaise: 11000, discount: { rateBps: 1000, totalBeforeDiscountPaise: 13750, amountPaise: 275 } };
const response = (value: Partial<KnowledgePreview>) => value as KnowledgePreview;
const previewMock = () => jest.fn<Promise<KnowledgePreview>, Parameters<KnowledgeMobileContext["api"]["previewKnowledge"]>>();
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));

describe("native Mode server calculations", () => {
  it("uses the PMC endpoint branch and applies discount to the PMC charge only", async () => {
    const preview = previewMock().mockResolvedValue(response({ pmcCalculation: pmc }));
    await expect(runNativeModeSimulation(base, preview, new AbortController().signal)).resolves.toMatchObject({ pmcCalculation: pmc });
    expect(preview.mock.calls[0]).toEqual([{ quantity: "1", quantityScale: 2, modeCalculationDiscountBps: 1000, pmcCalculation: { baseRatePaise: 10000, lowQuantityLimit: "15", impactBps: 1000, pmcMarginBps: 2000 } }, expect.objectContaining({ signal: expect.any(Object), showGlobalLoader: false })]);
  });
  it("uses the independent Sub-Vendor margin and selling-price discount", async () => {
    const subVendor = { ...pmc, subVendorMarginBps: 5000, subVendorMarginAmountPaise: 11000, totalBeforeDiscountPaise: 22000, totalPaise: 19800, finalVendorChargesPaise: 8800, discount: { rateBps: 1000, totalBeforeDiscountPaise: 22000, amountPaise: 2200 } };
    const preview = previewMock().mockResolvedValue(response({ subVendorCalculation: subVendor }));
    await expect(runNativeModeSimulation({ ...base, scope: "sub_vendor" }, preview, new AbortController().signal)).resolves.toMatchObject({ subVendorCalculation: { totalPaise: 19800 } });
    expect(preview.mock.calls[0]?.[0]).toMatchObject({ subVendorCalculation: { subVendorMarginBps: 5000 } });
  });
  it("probes independent In-house costs, applies a common discount and verifies the combined total", async () => {
    const labor = { revisedUnitRatePaise: 30000, revisedAmountPaise: 30000, floorPricePaise: 40000, maximumDiscountBps: 2000, discountBasis: "selling_price" as const, totalPaise: 50000, appliedImpactBps: 0 };
    const material = { revisedUnitRatePaise: 10000, revisedAmountPaise: 10000, floorPricePaise: 12500, maximumDiscountBps: 3750, discountBasis: "selling_price" as const, totalPaise: 20000, appliedImpactBps: 0 };
    const preview = jest.fn().mockResolvedValueOnce(response({ inHouseCalculation: { labor, material, totalPaise: 70000 } })).mockResolvedValueOnce(response({ inHouseCalculation: {
      labor: { ...labor, totalPaise: 45000, discount: { rateBps: 1000, totalBeforeDiscountPaise: 50000, amountPaise: 5000 } },
      material: { ...material, totalPaise: 18000, discount: { rateBps: 1000, totalBeforeDiscountPaise: 20000, amountPaise: 2000 } }, totalPaise: 63000
    } }));
    const input = { ...base, scope: "in_house_total" as const, drafts: { ...base.drafts, in_house_labor: { ...draft, baseRate: "300", impactRate: "0", minimumRate: "25", startingRate: "40" }, in_house_material: { ...draft, impactRate: "0", minimumRate: "20", startingRate: "50" } } };
    await expect(runNativeModeSimulation(input, preview, new AbortController().signal)).resolves.toMatchObject({ inHouseCalculation: { totalPaise: 63000 } });
    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview.mock.calls[0]?.[0]).not.toHaveProperty("modeCalculationDiscountBps");
    expect(preview.mock.calls[1]?.[0]).toHaveProperty("modeCalculationDiscountBps", 1000);
  });
  it("blocks absent UOM, invalid raw inputs and mismatched server branches", async () => {
    const preview = previewMock().mockResolvedValue(response({}));
    await expect(runNativeModeSimulation({ ...base, uom: { id: "", label: "Not set", scale: undefined } }, preview, new AbortController().signal)).rejects.toThrow("Save a UOM");
    expect(preview).not.toHaveBeenCalled();
    await expect(runNativeModeSimulation({ ...base, drafts: { ...base.drafts, pmc: { ...draft, baseRate: "10." } } }, preview, new AbortController().signal)).rejects.toThrow("rupee rate");
    expect(preview).not.toHaveBeenCalled();
    await expect(runNativeModeSimulation(base, preview, new AbortController().signal)).rejects.toThrow("inconsistent");
  });

  it("aborts stale automatic previews and never replaces newer results", async () => {
    let resolveOld!: (value: KnowledgePreview) => void;
    const oldRequest = new Promise<KnowledgePreview>(resolve => { resolveOld = resolve; });
    const second = { ...pmc, baseAmountPaise: 20000, lowQuantityImpactAmountPaise: 2000, revisedAmountPaise: 22000, pmcMarginAmountPaise: 5500, totalPaise: 27500, totalBeforeDiscountPaise: 27500, finalVendorChargesPaise: 22000, discount: { rateBps: 0, totalBeforeDiscountPaise: 27500, amountPaise: 0 } };
    const preview = previewMock().mockReturnValueOnce(oldRequest).mockResolvedValue(response({ pmcCalculation: second }));
    const context = { scopeKey: "test:user", api: { previewKnowledge: preview } } as unknown as KnowledgeMobileContext;
    await render(<KnowledgeModeSimulator scope="pmc" context={context} payload={base.payload} initialDrafts={base.drafts} uom={base.uom} onClose={jest.fn()} />);
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const oldSignal = preview.mock.calls[0]?.[1]?.signal;
    await fireEvent.changeText(screen.getByLabelText("Quantity"), "2");
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByText("Total: ₹275.00")).toBeTruthy());
    await act(() => { resolveOld(response({ pmcCalculation: { ...pmc, totalPaise: 13750, discount: { rateBps: 0, totalBeforeDiscountPaise: 13750, amountPaise: 0 } } })); });
    expect(screen.getByText("Total: ₹275.00")).toBeTruthy();
    expect(screen.queryByText("Total: ₹137.50")).toBeNull();
  });
});
