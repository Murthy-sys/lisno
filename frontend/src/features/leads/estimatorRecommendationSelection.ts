import {
  buildConfiguredLines, configuredLineCanInclude, configuredLineKey, createConfiguredLine,
  deselectConfiguredRecommendationSources, type ConfiguredEstimateRoom, type ConfiguredLineDraft
} from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateClassification } from "./leadsApi";
import { recommendationLines, type RoomRecommendationView } from "./roomRecommendations";

export interface EstimatorRequiredSelection {
  lines: readonly ConfiguredLineDraft[];
  addedBasketIds: ReadonlySet<string>;
  issues: readonly string[];
}

/** Apply only verified relationships. A later source read resolves newly added descendants. */
export function reconcileEstimatorRequiredSelection({ catalogue, rooms, lines, views, classifications }: {
  catalogue: EstimationCatalogue;
  rooms: readonly ConfiguredEstimateRoom[];
  lines: readonly ConfiguredLineDraft[];
  views: ReadonlyMap<string, RoomRecommendationView>;
  classifications: ReadonlyMap<string, EstimateClassification>;
}): EstimatorRequiredSelection {
  let next = lines;
  const issues: string[] = [];
  const addedBasketIds = new Set<string>();
  for (const room of rooms) {
    const view = views.get(room.id);
    if (!view) continue;
    if (view.stale || view.historicalSources.length) {
      issues.push(`${room.label}: required items need review. Refresh available items.`);
      continue;
    }
    for (const decision of view.decisions) {
      if (decision.requirement === "must" && (!decision.available || decision.unavailableChildCount > 0 || decision.kind === "sub_basket" && !decision.children.length)) {
        issues.push(`${room.label}: ${decision.name} is required and needs review. Refresh available items.`);
      }
    }
    for (const target of recommendationLines(view.decisions).filter(item => item.requirement === "must")) {
      const sourceIds = [...new Set(target.reasons.filter(reason => reason.requirement === "must" &&
        reason.sourceId !== target.target.mainLineId && next.some(line => line.included && line.roomId === room.id && line.mainLineId === reason.sourceId))
        .map(reason => reason.sourceId))].sort();
      if (!sourceIds.length) continue;
      const key = configuredLineKey(room.id, target.target.mainLineId);
      const existing = next.find(line => line.key === key);
      if (existing?.included) {
        // Independent selections stay independent, even when another line requires them.
        if (!existing.recommendationSourceMainLineIds?.length) continue;
        const origins = [...new Set([...existing.recommendationSourceMainLineIds, ...sourceIds])].sort();
        if (origins.join("\0") !== [...existing.recommendationSourceMainLineIds].sort().join("\0")) {
          next = next.map(line => line.key === key ? { ...line, recommendationSourceMainLineIds: origins } : line);
        }
        continue;
      }
      const fresh = createConfiguredLine(catalogue, room, target.target);
      if (!fresh || existing && (existing.mainBasketId !== fresh.mainBasketId || existing.subBasketId !== fresh.subBasketId || existing.itemType !== fresh.itemType)) {
        issues.push(`${room.label}: ${target.name} is required and its Configuration needs review.`);
        continue;
      }
      const refreshed = buildConfiguredLines(catalogue, [room], new Set([target.target.basketId]), [existing ?? fresh])[0];
      if (!refreshed || !configuredLineCanInclude(refreshed)) {
        issues.push(`${room.label}: ${target.name} is required. Configure its selected tier and pricing method.`);
        continue;
      }
      const selected = { ...refreshed, included: true, recommendationSourceMainLineIds: sourceIds,
        classification: refreshed.classification ?? classifications.get(target.target.basketId) ?? "standard" as const };
      next = existing ? next.map(line => line.key === key ? selected : line) : [...next, selected];
      addedBasketIds.add(target.target.basketId);
    }
  }
  return { lines: next, addedBasketIds, issues };
}

/** Removing the last independent root may remove a cycle; surviving roots still enforce their edges. */
export function estimatorRequiredRemovalSources(lines: readonly ConfiguredLineDraft[], views: ReadonlyMap<string, RoomRecommendationView>,
  removedKeys: ReadonlySet<string>): string[] {
  const remaining = deselectConfiguredRecommendationSources(lines, removedKeys);
  const survivingKeys = new Set(remaining.filter(line => line.included).map(line => line.key));
  const sources = new Set<string>();
  for (const [roomId, view] of views) {
    if (view.stale) continue;
    for (const target of recommendationLines(view.decisions)) {
      if (target.requirement !== "must" || !removedKeys.has(configuredLineKey(roomId, target.target.mainLineId))) continue;
      for (const reason of target.reasons) if (reason.requirement === "must" &&
        reason.sourceId !== target.target.mainLineId && survivingKeys.has(configuredLineKey(roomId, reason.sourceId))) sources.add(reason.sourceName);
    }
  }
  return [...sources];
}

export function estimatorRequiredBy(lines: readonly ConfiguredLineDraft[], views: ReadonlyMap<string, RoomRecommendationView>): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const line of lines) if (line.included) {
    const names = estimatorRequiredRemovalSources(lines, views, new Set([line.key]));
    if (names.length) result.set(line.key, names);
  }
  return result;
}
