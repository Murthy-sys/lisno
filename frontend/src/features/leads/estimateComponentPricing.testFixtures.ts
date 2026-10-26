import { ESTIMATE_COMPONENT_PRICING_BASIS, type EstimateComponentPricing } from "../../../../shared/estimation/estimateComponentPricing";
import type { ConfiguredLineDraft } from "./configuredEstimate";

export const componentPricingFixture = (mainLineId = "line-a", quantity = 2, totalPaise = 78333): EstimateComponentPricing => ({
  formulaVersion: ESTIMATE_COMPONENT_PRICING_BASIS, mainLineId, revisionId: `revision-${mainLineId}`, sourceItemVersion: 2, sourceRevisionVersion: 3,
  modeTier: "signature", quantity: String(quantity), uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 },
  selectedComponentIds: ["component-a"], components: [{ id: "component-a", basketId: "basket-target", subBasketId: "sub-target",
    basketName: "Finishes", subBasketName: "Ceiling", laborSellingPaise: 25000, materialSellingPaise: totalPaise - 25000, totalPaise }],
  totalPaise, inputFingerprint: "a".repeat(64)
});
export const componentDraftFixture = (mainLineId = "line-a", quantity = 2, totalPaise = 78333): ConfiguredLineDraft => ({
  key: JSON.stringify(["room-a", mainLineId]), roomId: "room-a", roomName: "Bedroom", catalogueId: mainLineId,
  mainBasketId: "basket-source", mainBasketName: "Joinery", subBasketId: "sub-source", subBasketName: "Wardrobe", mainLineId,
  mainLineName: mainLineId === "line-a" ? "Main Line A" : "Main Line B", itemType: "main_line", classification: "special",
  pricingMode: "in_house", rateSource: "configuration", pricingBasis: ESTIMATE_COMPONENT_PRICING_BASIS,
  componentPricing: componentPricingFixture(mainLineId, quantity, totalPaise), selectedInHouseComponentIds: ["component-a"], modeTier: "signature",
  inHouseComponents: [{ id: "component-a", basketId: "basket-target", subBasketId: "sub-target", basketName: "Finishes", subBasketName: "Ceiling", baseRatePaise: 30000 }],
  revisionId: `revision-${mainLineId}`, itemVersion: 2, revisionVersion: 3, uomId: "uom-a", uomName: "sq ft", uomDecimalScale: 2,
  quantity, rateInput: "", included: true, sourceMissing: false, modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null }
});
