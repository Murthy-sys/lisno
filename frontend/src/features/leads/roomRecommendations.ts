import type { ConfiguredLineDraft } from "./configuredEstimate";
import type {
  EstimationCatalogue,
  EstimationCatalogueMainLine,
  EstimationCatalogueRecommendations,
  EstimationCatalogueTemporaryItem,
  EstimationRecommendationRule
} from "./estimationCatalogueApi";

type CatalogueLine = EstimationCatalogueMainLine | EstimationCatalogueTemporaryItem;

export interface RecommendedLineTarget {
  mainLineId: string;
  basketId: string;
  subBasketId: string | null;
}

export interface RecommendationReason {
  ruleId: string;
  sourceId: string;
  sourceName: string;
  reason: string;
  requirement: "must" | "can";
}

export interface RecommendationChildView {
  target: RecommendedLineTarget;
  name: string;
  selected: boolean;
  completionRequired: boolean;
}

export interface RecommendationDecision {
  key: string;
  kind: "main_line" | "sub_basket";
  requirement: "must" | "can";
  name: string;
  basketName: string | null;
  subBasketName: string | null;
  available: boolean;
  selected: boolean;
  completionRequired: boolean;
  unavailableChildCount: number;
  target: RecommendedLineTarget | null;
  children: RecommendationChildView[];
  reasons: RecommendationReason[];
}

export interface RecommendationLine {
  key: string;
  target: RecommendedLineTarget;
  name: string;
  requirement: "must" | "can";
  selected: boolean;
  reasons: RecommendationReason[];
}

export function recommendationTargetIdentity(target: RecommendedLineTarget): string {
  return JSON.stringify([target.mainLineId, target.basketId, target.subBasketId]);
}

export function recommendationLines(decisions: readonly RecommendationDecision[]): RecommendationLine[] {
  const lines = new Map<string, RecommendationLine>();
  const add = (target: RecommendedLineTarget, name: string, selected: boolean, decision: RecommendationDecision) => {
    const key = recommendationTargetIdentity(target);
    const existing = lines.get(key);
    if (!existing) {
      lines.set(key, { key, target, name, selected, requirement: decision.requirement, reasons: [...decision.reasons] });
      return;
    }
    existing.selected ||= selected;
    if (decision.requirement === "must") existing.requirement = "must";
    for (const reason of decision.reasons) {
      if (!existing.reasons.some((item) => item.sourceId === reason.sourceId && item.ruleId === reason.ruleId)) {
        existing.reasons.push(reason);
      }
    }
  };
  for (const decision of decisions) {
    if (!decision.available) continue;
    if (decision.kind === "main_line" && decision.target) {
      add(decision.target, decision.name, decision.selected, decision);
    } else if (decision.kind === "sub_basket") {
      for (const child of decision.children) add(child.target, child.name, child.selected, decision);
    }
  }
  return [...lines.values()].sort((a, b) => Number(b.requirement === "must") - Number(a.requirement === "must"));
}

export interface RecommendationGuidanceView {
  id: string;
  sourceId: string;
  sourceName: string;
  name: string;
  reason: string;
}

export interface RoomRecommendationView {
  decisions: RecommendationDecision[];
  guidance: RecommendationGuidanceView[];
  historicalSources: Array<{ mainLineId: string; name: string }>;
  stale: boolean;
}

export function recommendationSourceIdentity(line: ConfiguredLineDraft): string {
  return JSON.stringify([
    line.mainLineId,
    line.revisionId,
    line.persistedId ? line.sourceRevisionVersion : line.revisionVersion,
    line.persistedId ? line.sourceItemVersion : line.itemVersion
  ]);
}

interface CatalogueLocation {
  item: CatalogueLine;
  basketId: string;
  basketName: string;
  subBasketId: string | null;
  subBasketName: string | null;
}

function catalogueLocations(catalogue: EstimationCatalogue): Map<string, CatalogueLocation[]> {
  const result = new Map<string, CatalogueLocation[]>();
  for (const basket of catalogue.items) {
    const add = (item: CatalogueLine, subBasketId: string | null, subBasketName: string | null) => {
      const locations = result.get(item.mainLineId) ?? [];
      locations.push({ item, basketId: basket.id, basketName: basket.name, subBasketId, subBasketName });
      result.set(item.mainLineId, locations);
    };
    for (const item of basket.directTemporaryItems ?? []) add(item, null, null);
    for (const subBasket of basket.subBaskets) {
      for (const item of subBasket.mainLines) add(item, subBasket.id, subBasket.name);
      for (const item of subBasket.temporaryItems ?? []) add(item, subBasket.id, subBasket.name);
    }
  }
  return result;
}

function lineMatchesCatalogue(line: ConfiguredLineDraft, location: CatalogueLocation): boolean {
  const item = location.item;
  const revisionVersion = line.persistedId ? line.sourceRevisionVersion : line.revisionVersion;
  const itemVersion = line.persistedId ? line.sourceItemVersion : line.itemVersion;
  if (line.persistedId && (typeof revisionVersion !== "number" || !Number.isSafeInteger(revisionVersion) ||
    typeof itemVersion !== "number" || !Number.isSafeInteger(itemVersion))) return false;
  return line.revisionId === item.revisionId &&
    (revisionVersion === undefined || revisionVersion === item.revisionVersion) &&
    (itemVersion === undefined || itemVersion === item.itemVersion);
}

function responseMatchesCatalogue(location: CatalogueLocation, source: EstimationCatalogueRecommendations["sources"][number]): boolean {
  const item = location.item;
  return source.available && source.revisionId === item.revisionId &&
    typeof item.revisionVersion === "number" && source.revisionVersion === item.revisionVersion &&
    typeof item.itemVersion === "number" && source.itemVersion === item.itemVersion;
}

function targetVersionMatches(item: CatalogueLine, rule: EstimationRecommendationRule): boolean {
  return rule.targetRevisionId === item.revisionId &&
    typeof item.revisionVersion === "number" && rule.targetRevisionVersion === item.revisionVersion &&
    typeof item.itemVersion === "number" && rule.targetItemVersion === item.itemVersion;
}

export function partitionRoomRecommendationSources({ catalogue, lines, roomId }: {
  catalogue: EstimationCatalogue;
  lines: readonly ConfiguredLineDraft[];
  roomId: string;
}): { current: ConfiguredLineDraft[]; historical: Array<{ mainLineId: string; name: string }>; outdatedDraft: boolean } {
  const locations = catalogueLocations(catalogue);
  const current: ConfiguredLineDraft[] = [];
  const historical: Array<{ mainLineId: string; name: string }> = [];
  let outdatedDraft = false;
  for (const line of lines) {
    if (line.roomId !== roomId || !line.included) continue;
    const location = (locations.get(line.mainLineId) ?? []).find((candidate) =>
      candidate.basketId === line.mainBasketId && candidate.subBasketId === line.subBasketId
    );
    if (!line.sourceMissing && location && lineMatchesCatalogue(line, location)) current.push(line);
    else if (line.persistedId) historical.push({ mainLineId: line.mainLineId, name: line.mainLineName });
    else outdatedDraft = true;
  }
  return { current, historical, outdatedDraft };
}

function matchingTarget(
  locations: Map<string, CatalogueLocation[]>,
  mainLineId: string | null,
  basketId: string,
  subBasketId: string | null
): CatalogueLocation | null {
  if (!mainLineId) return null;
  const matches = (locations.get(mainLineId) ?? []).filter((location) =>
    location.basketId === basketId && location.subBasketId === subBasketId
  );
  return matches.length === 1 ? matches[0]! : null;
}

function reasonFor(sourceId: string, sourceName: string, rule: EstimationRecommendationRule): RecommendationReason {
  return { ruleId: rule.id, sourceId, sourceName, reason: rule.reason, requirement: rule.requirement };
}

export function buildRoomRecommendations({ catalogue, lines, roomId, recommendations }: {
  catalogue: EstimationCatalogue;
  lines: readonly ConfiguredLineDraft[];
  roomId: string;
  recommendations: EstimationCatalogueRecommendations;
}): RoomRecommendationView {
  const locations = catalogueLocations(catalogue);
  const partition = partitionRoomRecommendationSources({ catalogue, lines, roomId });
  const selected = new Set(partition.current.map((line) => JSON.stringify([
    line.mainLineId, line.mainBasketId, line.subBasketId
  ])));
  const isSelected = (mainLineId: string, basketId: string, subBasketId: string | null) =>
    selected.has(JSON.stringify([mainLineId, basketId, subBasketId]));
  const activeSources = partition.current;
  const responseSources = new Map(recommendations.sources.map((source) => [source.mainLineId, source]));
  const decisions = new Map<string, RecommendationDecision>();
  const guidance: RecommendationGuidanceView[] = [];
  let stale = partition.outdatedDraft;

  for (const line of activeSources) {
    const source = responseSources.get(line.mainLineId);
    const location = (locations.get(line.mainLineId) ?? []).find((candidate) =>
      candidate.basketId === line.mainBasketId && candidate.subBasketId === line.subBasketId
    );
    if (!source || !location || !responseMatchesCatalogue(location, source)) {
      stale = true;
      continue;
    }
    const sourceName = location.item.name;
    for (const item of source.guidance) {
      guidance.push({ id: item.id, sourceId: source.mainLineId, sourceName, name: item.name, reason: item.reason });
    }
    for (const rule of source.rules) {
      const key = rule.targetKind === "main_line"
        ? `line:${rule.targetMainLineId ?? ""}`
        : `sub-basket:${rule.targetBasketId}:${rule.targetSubBasketId ?? ""}`;
      const existing = decisions.get(key);
      const target = rule.targetKind === "main_line" && rule.available
        ? matchingTarget(locations, rule.targetMainLineId, rule.targetBasketId, rule.targetSubBasketId)
        : null;
      const basket = catalogue.items.find((item) => item.id === rule.targetBasketId);
      const subBasket = rule.targetKind === "sub_basket" && rule.targetSubBasketId
        ? basket?.subBaskets.find((item) => item.id === rule.targetSubBasketId)
        : undefined;
      const children = rule.targetKind === "sub_basket" && rule.available && subBasket
        ? (rule.children ?? []).flatMap((child) => {
          const childLocation = matchingTarget(locations, child.mainLineId, rule.targetBasketId, rule.targetSubBasketId);
          if (!childLocation) return [];
          if (child.revisionId !== childLocation.item.revisionId ||
            child.revisionVersion !== childLocation.item.revisionVersion ||
            child.itemVersion !== childLocation.item.itemVersion) stale = true;
          return [{
            target: { mainLineId: child.mainLineId, basketId: rule.targetBasketId, subBasketId: rule.targetSubBasketId },
            name: childLocation.item.name,
            selected: isSelected(child.mainLineId, rule.targetBasketId, rule.targetSubBasketId),
            completionRequired: child.completionRequired
          }];
        }) : [];
      const available = rule.targetKind === "main_line" ? Boolean(target) : Boolean(rule.available && subBasket);
      if (rule.available && rule.targetKind === "main_line" && (!target || !targetVersionMatches(target.item, rule))) stale = true;
      if (rule.available && rule.targetKind === "sub_basket") {
        if (!subBasket || children.length !== (rule.children?.length ?? 0)) stale = true;
        else {
          const catalogueChildIds = new Set([...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])].map((child) => child.mainLineId));
          const responseChildIds = new Set((rule.children ?? []).map((child) => child.mainLineId));
          if (catalogueChildIds.size !== responseChildIds.size ||
            [...catalogueChildIds].some((id) => !responseChildIds.has(id))) stale = true;
        }
      }
      const expectedChildren = rule.children?.length ?? 0;
      const unavailableChildCount = rule.targetKind === "sub_basket"
        ? (rule.unavailableChildCount ?? 0) + (expectedChildren - children.length)
        : 0;
      const completionRequired = rule.completionRequired || (target?.item.itemType === "temporary") || children.some((child) => child.completionRequired);
      const next: RecommendationDecision = existing ?? {
        key,
        kind: rule.targetKind,
        requirement: rule.requirement,
        name: rule.targetKind === "main_line" ? target?.item.name ?? "Related item unavailable" : subBasket?.name ?? "Related Sub Basket unavailable",
        basketName: rule.targetKind === "main_line" ? target?.basketName ?? null : available ? basket?.name ?? null : null,
        subBasketName: rule.targetKind === "main_line" ? target?.subBasketName ?? null : null,
        available,
        selected: rule.targetKind === "main_line" ? Boolean(target && isSelected(target.item.mainLineId, target.basketId, target.subBasketId)) :
          available && children.length > 0 && unavailableChildCount === 0 && children.every((child) => child.selected),
        completionRequired,
        unavailableChildCount,
        target: target ? { mainLineId: target.item.mainLineId, basketId: target.basketId, subBasketId: target.subBasketId } : null,
        children,
        reasons: []
      };
      if (existing) {
        next.requirement = existing.requirement === "must" || rule.requirement === "must" ? "must" : "can";
        next.available = existing.available && available;
        next.completionRequired = existing.completionRequired || completionRequired;
        next.unavailableChildCount = Math.max(existing.unavailableChildCount, unavailableChildCount);
        if (rule.targetKind === "main_line" && existing.target && target &&
          (existing.target.basketId !== target.basketId || existing.target.subBasketId !== target.subBasketId)) {
          next.available = false;
          next.target = null;
        }
        if (rule.targetKind === "sub_basket" && children.length !== existing.children.length) next.available = false;
        next.selected = next.available && (rule.targetKind === "main_line"
          ? Boolean(next.target && isSelected(next.target.mainLineId, next.target.basketId, next.target.subBasketId))
          : next.unavailableChildCount === 0 && next.children.length > 0 && next.children.every((child) => child.selected));
        if (!next.available) {
          next.name = rule.targetKind === "main_line" ? "Related item unavailable" : "Related Sub Basket unavailable";
          next.basketName = null;
          next.subBasketName = null;
          next.target = null;
          next.children = [];
        }
      }
      next.reasons.push(reasonFor(source.mainLineId, sourceName, rule));
      decisions.set(key, next);
    }
  }

  return { decisions: [...decisions.values()], guidance, historicalSources: partition.historical, stale };
}
