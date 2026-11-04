import { buildConfiguredLines, createConfiguredLine, type ConfiguredEstimateRoom, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

/** Explicitly create test rows; production catalogue browsing never creates these drafts. */
export function configuredLineFixtures(catalogue: EstimationCatalogue, rooms: readonly ConfiguredEstimateRoom[],
  baskets: ReadonlySet<string>, previous: readonly ConfiguredLineDraft[] = [], preservePersisted = false): ConfiguredLineDraft[] {
  const targets = catalogue.items.filter(basket => baskets.has(basket.id)).flatMap(basket => [
    ...(basket.directTemporaryItems ?? []).map(item => ({ mainLineId: item.mainLineId, basketId: basket.id, subBasketId: null })),
    ...basket.subBaskets.flatMap(subBasket => [...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])].map(item => ({ mainLineId: item.mainLineId, basketId: basket.id, subBasketId: subBasket.id })))
  ]);
  const prior = new Map(previous.map(line => [line.key, line]));
  const fresh = rooms.flatMap(room => targets.flatMap(target => {
    const line = createConfiguredLine(catalogue, room, target);
    return line ? [prior.get(line.key) ?? line] : [];
  }));
  return buildConfiguredLines(catalogue, rooms, baskets, fresh, preservePersisted);
}
