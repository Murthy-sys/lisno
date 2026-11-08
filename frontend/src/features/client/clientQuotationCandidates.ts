import type { QuotationCandidate, QuotationLine } from "./quotationApi";

export function quotationCandidateHasAvailableChoice(candidate: QuotationCandidate, canChangePricingMode: boolean): boolean {
  return candidate.choices.some(choice => choice.available && Boolean(choice.source)) ||
    canChangePricingMode && candidate.classification === "special" && Boolean(candidate.pricingModeChoices?.some(mode =>
      mode.choices.some(choice => choice.available && Boolean(choice.source))));
}

/** Unselected catalogue rows have no saved financial value and never replace persisted choices. */
export function quotationCandidateRows(candidates: readonly QuotationCandidate[], room: { id: string; name: string } | undefined,
  existing: readonly QuotationLine[]): QuotationLine[] {
  if (!room) return [];
  const present = new Set(existing.filter(line => line.roomId === room.id).map(line => line.mainLineId));
  return candidates.flatMap(candidate => {
    if (present.has(candidate.mainLineId)) return [];
    present.add(candidate.mainLineId);
    return [{ id: `candidate:${JSON.stringify([room.id, candidate.mainLineId])}`, mainLineId: candidate.mainLineId,
      mainLineName: candidate.name, roomId: room.id, roomName: room.name, included: false,
      mainBasketId: candidate.mainBasketId, mainBasketName: candidate.mainBasketName,
      subBasketId: candidate.subBasketId, subBasketName: candidate.subBasketName,
      source: candidate.source, dimensionsMandatory: candidate.dimensionsMandatory, dimensionRule: candidate.dimensionRule,
      uomName: candidate.uomName, choices: candidate.choices, pricingMode: candidate.pricingMode, modeTier: candidate.modeTier,
      classification: candidate.classification, pricingModeChoices: candidate.pricingModeChoices,
      ratePaise: null, amountPaise: null, quantity: 1 }];
  });
}
