import { configuredTierUnavailableReason, createConfiguredLine, type ConfiguredEstimateRoom, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue, EstimationCatalogueMainLine, EstimationCatalogueTemporaryItem } from "./estimationCatalogueApi";
import type { RecommendedLineTarget } from "./roomRecommendations";
import { estimationLinePricingMode, isEstimationLinePriceVisible } from "./estimationCatalogueVisibility";

export interface SalesEstimateCatalogueRow {
  line: ConfiguredLineDraft;
  target: RecommendedLineTarget;
  isPreview: boolean;
}

/** Display-only rows for one room; callers materialize a draft only after an explicit edit. */
export function buildSalesEstimateCatalogue({ catalogue, room, selectedMainBasketIds, browseMainBasketIds = selectedMainBasketIds, lines }: {
  catalogue: EstimationCatalogue;
  room: ConfiguredEstimateRoom;
  selectedMainBasketIds: ReadonlySet<string>;
  /** Selected baskets absent from this set display only their included room items. */
  browseMainBasketIds?: ReadonlySet<string>;
  lines: readonly ConfiguredLineDraft[];
}): SalesEstimateCatalogueRow[] {
  const basketCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const candidates: Array<{ target: RecommendedLineTarget; item: EstimationCatalogueMainLine | EstimationCatalogueTemporaryItem; itemType: ConfiguredLineDraft["itemType"]; valid: boolean }> = [];
  for (const basket of catalogue.items) {
    basketCounts.set(basket.id, (basketCounts.get(basket.id) ?? 0) + 1);
    const subBasketCounts = new Map<string, number>();
    for (const subBasket of basket.subBaskets) {
      subBasketCounts.set(subBasket.id, (subBasketCounts.get(subBasket.id) ?? 0) + 1);
    }
    const sources = [
      ...(basket.directTemporaryItems ?? []).map(item => ({ item, subBasket: null })),
      ...basket.subBaskets.flatMap(subBasket =>
        [...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])].map(item => ({ item, subBasket })))
    ];
    for (const { item, subBasket } of sources) {
      sourceCounts.set(item.mainLineId, (sourceCounts.get(item.mainLineId) ?? 0) + 1);
      if (!selectedMainBasketIds.has(basket.id)) continue;
      const subBasketId = subBasket?.id ?? null;
      candidates.push({
        target: { mainLineId: item.mainLineId, basketId: basket.id, subBasketId },
        item,
        itemType: item.itemType ?? "main_line",
        valid: item.basketId === basket.id && item.subBasketId === subBasketId &&
          (!subBasket || subBasket.basketId === basket.id && subBasketCounts.get(subBasket.id) === 1)
      });
    }
  }

  const roomDrafts = new Map<string, ConfiguredLineDraft[]>();
  for (const line of lines) {
    if (line.roomId !== room.id) continue;
    const matching = roomDrafts.get(line.mainLineId) ?? [];
    matching.push(line);
    roomDrafts.set(line.mainLineId, matching);
  }

  return candidates.flatMap(({ target, item, itemType, valid }): SalesEstimateCatalogueRow[] => {
    if (!valid || basketCounts.get(target.basketId) !== 1 || sourceCounts.get(target.mainLineId) !== 1) return [];
    const existing = roomDrafts.get(target.mainLineId);
    if (existing) {
      const line = existing[0]!;
      if (existing.length !== 1 || line.sourceMissing || line.mainBasketId !== target.basketId ||
        line.subBasketId !== target.subBasketId || line.itemType !== itemType) return [];
      const mode = estimationLinePricingMode(line);
      if (!isEstimationLinePriceVisible(item, mode) || configuredTierUnavailableReason(item, line.modeTier ?? "signature", mode)) return [];
      if (!line.included && !browseMainBasketIds.has(target.basketId)) return [];
      return [{ line, target, isPreview: false }];
    }
    if (!browseMainBasketIds.has(target.basketId) || !isEstimationLinePriceVisible(item)) return [];
    const line = createConfiguredLine(catalogue, room, target);
    return line ? [{ line, target, isPreview: true }] : [];
  });
}
