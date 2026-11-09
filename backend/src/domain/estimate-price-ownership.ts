import { ESTIMATE_COMPONENT_PRICING_BASIS } from "./estimate-component-pricing.js";

type Row = Readonly<Record<string, unknown>>;

function sameSelection(left: unknown, right: unknown): boolean {
  const ids = (value: unknown) => value === undefined ? [] : Array.isArray(value) && value.every(id => typeof id === "string")
    ? [...value].sort() : null;
  const first = ids(left);
  const second = ids(right);
  return first !== null && second !== null && first.length === second.length && first.every((id, index) => id === second[index]);
}

/** Compatibility is limited to a real saved row, never a caller-created historical identity. */
export function unchangedSavedEstimatePrice(input: Row, prior: Row | undefined, current?: {
  revisionId: string; itemVersion: number; revisionVersion: number;
}): boolean {
  if (!prior || typeof input.id !== "string" || input.id !== prior.id ||
    input.included === true && prior.included !== true) return false;
  if (input.source !== "configuration") {
    return prior.source !== "configuration" && ["catalogueId", "roomName", "specification", "unit", "rate"]
      .every(field => input[field] === prior[field]);
  }
  if (prior.source !== "configuration" || ["catalogueId", "roomId", "roomName", "mainLineId", "mainBasketId", "subBasketId", "uomId", "ratePaise"]
    .some(field => input[field] !== prior[field]) ||
    (input.itemType ?? "main_line") !== (prior.itemType ?? "main_line") ||
    (input.classification ?? prior.classification ?? "standard") !== (prior.classification ?? "standard") ||
    (input.pricingMode ?? prior.pricingMode) !== prior.pricingMode ||
    (input.modeTier ?? prior.modeTier ?? "signature") !== (prior.modeTier ?? "signature") ||
    (input.rateSource ?? prior.rateSource) !== prior.rateSource ||
    input.pricingBasis !== prior.pricingBasis ||
    !sameSelection(input.selectedInHouseComponentIds ?? prior.selectedInHouseComponentIds, prior.selectedInHouseComponentIds)) return false;
  const savedRevision = input.revisionId === prior.revisionId &&
    (input.itemVersion === undefined || input.itemVersion === prior.sourceItemVersion) &&
    (input.revisionVersion === undefined || input.revisionVersion === prior.sourceRevisionVersion);
  const currentRevision = current !== undefined && input.revisionId === current.revisionId &&
    input.itemVersion === current.itemVersion && input.revisionVersion === current.revisionVersion;
  if (!savedRevision && !currentRevision) return false;
  if (prior.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS) {
    const pricing = prior.componentPricing as Row | undefined;
    return input.quantity === prior.quantity && input.componentPricingFingerprint === pricing?.inputFingerprint;
  }
  return true;
}
