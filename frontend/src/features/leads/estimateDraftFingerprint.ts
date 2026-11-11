import { canonicalEstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import type { ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimateDraftInput } from "./leadsApi";

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
    : entry);
}

/** Retain input that cannot yet be represented by the saved quotation payload. */
export function configuredLineEditingFingerprint(line: ConfiguredLineDraft): string {
  return canonicalJson({
    included: line.included, quantity: line.quantity, rateInput: line.rateInput,
    classification: line.classification ?? "standard", modeTier: line.modeTier ?? "signature",
    pricingMode: line.pricingMode ?? null, rateSource: line.rateSource ?? "manual",
    selectedInHouseComponentIds: [...(line.selectedInHouseComponentIds ?? [])].sort(),
    configurationPricingChanged: Boolean(line.configurationPricingChanged),
    dimensions: line.dimensions ? canonicalEstimateDimensions(line.dimensions) ?? line.dimensions : null,
    dimensionsNeedReview: Boolean(line.dimensionsNeedReview)
  });
}

/** Catalogue hydration can reorder rooms and lines without changing editable content. */
export function estimateDraftFingerprint(draft: EstimateDraftInput): string {
  const baskets = draft.selectedMainBasketIds ?? draft.lineItems.flatMap(line => line.source === "configuration" ? [line.mainBasketId] : []);
  const classifications = new Map(draft.selectedMainBasketClassifications?.map(value => [value.mainBasketId, value.classification]));
  return JSON.stringify({
    propertyType: draft.propertyType,
    bedroomCount: draft.bedroomCount ?? null,
    rooms: draft.rooms.map(canonicalJson).sort(),
    scopes: [...draft.scopes].sort(),
    baskets: [...new Set(baskets)].sort().map(id => [id, classifications.get(id) ?? "standard"]),
    lines: draft.lineItems.map(line => line.source === "configuration" ? {
      source: "configuration", mainLineId: line.mainLineId, roomId: line.roomId,
      roomName: line.roomName, mainBasketId: line.mainBasketId, subBasketId: line.subBasketId,
      revisionId: line.revisionId, uomId: line.uomId, included: line.included,
      quantity: line.quantity, ratePaise: line.ratePaise ?? null, modeTier: line.modeTier ?? "signature",
      classification: line.classification ?? "standard", pricingMode: line.pricingMode ?? null,
      rateSource: line.rateSource ?? "manual", dimensions: line.dimensions ? canonicalEstimateDimensions(line.dimensions) ?? line.dimensions : null,
      selectedInHouseComponentIds: [...(line.selectedInHouseComponentIds ?? [])].sort(),
      recommendationSourceMainLineIds: [...(line.recommendationSourceMainLineIds ?? [])].sort()
    } : {
      source: "legacy", catalogueId: line.catalogueId, roomName: line.roomName,
      specification: line.specification, unit: line.unit, rate: line.rate,
      quantity: line.quantity, included: line.included
    }).map(canonicalJson).sort()
  });
}
