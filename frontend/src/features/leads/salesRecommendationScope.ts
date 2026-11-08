import type { ConfiguredLineDraft } from "./configuredEstimate";

type ScopeLine = Pick<ConfiguredLineDraft, "mainBasketId" | "included" | "recommendationSourceMainLineIds">;

/** Automatic scope can be released only after its last included item in every room is removed. */
export function emptyAutomaticBasketIds(
  lines: readonly Pick<ConfiguredLineDraft, "mainBasketId" | "included">[],
  automaticBasketIds: ReadonlySet<string>
): Set<string> {
  const includedBasketIds = new Set(lines.filter(line => line.included).map(line => line.mainBasketId));
  return new Set([...automaticBasketIds].filter(id => !includedBasketIds.has(id)));
}

/** Hide saved empty group shells without treating inferred presentation as permission to deselect scope. */
export function inferEmptySavedBasketIds(
  lines: readonly Pick<ConfiguredLineDraft, "mainBasketId" | "included" | "persistedId">[],
  selectedMainBasketIds: ReadonlySet<string>
): Set<string> {
  const includedBasketIds = new Set<string>();
  const excludedSavedBasketIds = new Set<string>();
  for (const line of lines) {
    if (line.included) includedBasketIds.add(line.mainBasketId);
    else if (line.persistedId) excludedSavedBasketIds.add(line.mainBasketId);
  }
  return new Set([...selectedMainBasketIds].filter(id =>
    excludedSavedBasketIds.has(id) && !includedBasketIds.has(id)));
}

/** Infer initial presentation only; saved selections and provenance remain untouched. */
export function inferRecommendationOnlyBasketIds(
  lines: readonly ScopeLine[],
  selectedMainBasketIds: ReadonlySet<string>
): Set<string> {
  const recommendationOnly = new Map<string, boolean>();
  for (const line of lines) {
    if (!line.included || !selectedMainBasketIds.has(line.mainBasketId)) continue;
    recommendationOnly.set(line.mainBasketId,
      (recommendationOnly.get(line.mainBasketId) ?? true) && Boolean(line.recommendationSourceMainLineIds?.length));
  }
  return new Set([...recommendationOnly].filter(([, onlyRecommendations]) => onlyRecommendations).map(([id]) => id));
}

/** A room's browse choice never selects items or grants access to an unselected basket. */
export function salesCatalogueBrowseBasketIds(
  selectedMainBasketIds: ReadonlySet<string>,
  recommendationOnlyBasketIds: ReadonlySet<string>,
  browsedBasketIds: ReadonlySet<string>
): Set<string> {
  return new Set([...selectedMainBasketIds].filter(id =>
    !recommendationOnlyBasketIds.has(id) || browsedBasketIds.has(id)));
}
