import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { estimateTierChoices } from "./estimate-tiers.service.js";
import { readEstimatorCatalogueRecommendations, resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import { visibleQuotationSources } from "./quotation-setup.service.js";

type Row = Record<string, any>;
export type QuotationSource = NonNullable<ReturnType<Awaited<ReturnType<typeof resolveEstimatorCatalogueLines>>["get"]>>;

export function quotationSourceIdentity(source: QuotationSource) {
  return { revisionId: source.line.revisionId, itemVersion: source.line.itemVersion,
    revisionVersion: source.line.revisionVersion, uomId: source.line.uom.id };
}

export function quotationSourceGrouping(source: QuotationSource) {
  return { mainBasketId: source.line.basketId, mainBasketName: source.mainBasketName,
    subBasketId: source.line.subBasketId, subBasketName: source.subBasketName };
}

export function quotationSavedMode(estimate: Row, mainLineId: string): "pmc" | "sub_vendor" | "in_house" {
  const existing = estimate.lineItems.find((line: Row) => line.mainLineId === mainLineId);
  return ["pmc", "sub_vendor", "in_house"].includes(existing?.pricingMode) ? existing.pricingMode : "sub_vendor";
}

export function quotationClassification(estimate: Row, mainLineId: string, basketId: string): "standard" | "special" {
  const value = estimate.lineItems.find((line: Row) => line.mainLineId === mainLineId)?.classification ??
    estimate.selectedMainBasketClassifications?.find((entry: Row) => entry.mainBasketId === basketId)?.classification;
  return value === "special" ? "special" : "standard";
}

export async function quotationPricingModeChoices(line: Row, source: QuotationSource | undefined, session?: ClientSession) {
  const modes = line.classification === "special" ? ["pmc", "sub_vendor", "in_house"] as const : ["sub_vendor"] as const;
  const options = [];
  for (const pricingMode of modes) options.push({ pricingMode,
    choices: await estimateTierChoices({ ...line, pricingMode,
      ...(pricingMode === line.pricingMode ? {} : { selectedInHouseComponentIds: undefined }) }, source, session) });
  return options;
}

export async function quotationCandidateFor(estimate: Row, source: QuotationSource) {
  const prior = estimate.lineItems.find((line: Row) => line.mainLineId === source.line.mainLineId);
  const modeTier = prior?.modeTier ?? source.line.applicableTiers[0] ?? "signature";
  const pricingMode = quotationSavedMode(estimate, source.line.mainLineId);
  const classification = quotationClassification(estimate, source.line.mainLineId, source.line.basketId);
  const choiceLine = { quantity: 1, uomId: source.line.uom.id, pricingMode, modeTier, classification };
  const pricingModeChoices = await quotationPricingModeChoices(choiceLine, source);
  const choices = pricingModeChoices.find(option => option.pricingMode === pricingMode)?.choices ?? await estimateTierChoices(choiceLine, source);
  return { mainLineId: source.line.mainLineId, name: source.line.name, source: quotationSourceIdentity(source),
    ...quotationSourceGrouping(source), pricingMode, modeTier, classification, pricingModeChoices, dimensionsMandatory: source.line.dimensionsMandatory,
    dimensionRule: source.line.dimensionRule, uomName: source.line.uom.name, choices };
}

const unavailable = (): never => {
  throw new ApiError(409, "QUOTATION_CONFIGURATION_CHANGED", "Review the current item configuration before continuing.");
};

/** Caller has established project authority. Hidden saved scope is never a candidate, even if now visible. */
export async function quotationVisibleRecommendationSources(estimate: Row, session?: ClientSession, mainLineIds?: readonly string[]) {
  const sources = await visibleQuotationSources(estimate, session, true, mainLineIds);
  for (const line of estimate.lineItems) if (line.clientVisible === false) sources.delete(line.mainLineId);
  return sources;
}

/** Resolve only current must-add edges between visible, eligible source/target identities. */
export async function quotationMandatoryTargets(
  sourceIds: readonly string[], sources: ReadonlyMap<string, QuotationSource>, session?: ClientSession,
  relationships?: Awaited<ReturnType<typeof readEstimatorCatalogueRecommendations>>
) {
  const response = relationships ?? await readEstimatorCatalogueRecommendations(sourceIds, true, session);
  const targets = new Map<string, Set<string>>();
  for (const relation of response.sources) {
    const source = sources.get(relation.mainLineId);
    if (!source || !relation.available || relation.revisionId !== source.line.revisionId ||
      relation.revisionVersion !== source.line.revisionVersion || relation.itemVersion !== source.line.itemVersion) unavailable();
    const ids = new Set<string>();
    for (const rule of relation.rules) {
      if (rule.requirement !== "must" || !rule.available) continue;
      const children = rule.targetKind === "main_line" ? [{ mainLineId: rule.targetMainLineId,
        revisionId: rule.targetRevisionId, revisionVersion: rule.targetRevisionVersion, itemVersion: rule.targetItemVersion }] : rule.children ?? [];
      for (const child of children) {
        if (!child.mainLineId || child.mainLineId === relation.mainLineId) continue;
        const target = sources.get(child.mainLineId);
        if (!target || target.line.basketId !== rule.targetBasketId || target.line.subBasketId !== rule.targetSubBasketId) continue;
        if (target.line.revisionId !== child.revisionId || target.line.revisionVersion !== child.revisionVersion ||
          target.line.itemVersion !== child.itemVersion) unavailable();
        ids.add(child.mainLineId);
      }
    }
    targets.set(relation.mainLineId, ids);
  }
  return targets;
}

export interface QuotationRecommendationInput {
  expectedVersion: number;
  roomId: string;
  sources: Array<{ mainLineId: string; source: ReturnType<typeof quotationSourceIdentity> }>;
  limit: number;
  offset: number;
}

/** Read-only projection: never return raw rules, hidden IDs, internal reasons or hidden counts. */
export async function readQuotationRecommendations(estimate: Row, input: QuotationRecommendationInput) {
  if (estimate.version !== input.expectedVersion) {
    throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The quotation changed. Refresh before continuing.");
  }
  if (!(estimate.rooms ?? []).some((room: Row) => room.id === input.roomId)) {
    throw new ApiError(404, "QUOTATION_NOT_FOUND", "Quotation unavailable.");
  }
  const sourceIds = input.sources.map(source => source.mainLineId);
  const relationships = await readEstimatorCatalogueRecommendations(sourceIds, true);
  const targetIds = relationships.sources.flatMap(source => source.rules.flatMap(rule => rule.requirement !== "must" || !rule.available ? [] :
    rule.targetKind === "main_line" ? rule.targetMainLineId ? [rule.targetMainLineId] : [] : (rule.children ?? []).map(child => child.mainLineId)));
  const sources = await quotationVisibleRecommendationSources(estimate, undefined, [...new Set([...sourceIds, ...targetIds])]);
  for (const selection of input.sources) {
    const source = sources.get(selection.mainLineId);
    if (!source || !(estimate.selectedMainBasketIds ?? []).includes(source.line.basketId)) {
      throw new ApiError(404, "QUOTATION_NOT_FOUND", "Quotation unavailable.");
    }
    if (Object.entries(quotationSourceIdentity(source)).some(([key, value]) =>
      selection.source[key as keyof typeof selection.source] !== value)) unavailable();
    const prior = estimate.lineItems.find((line: Row) => line.mainLineId === selection.mainLineId && line.roomId === input.roomId);
    if (prior && (prior.mainBasketId !== source.line.basketId || prior.subBasketId !== source.line.subBasketId ||
      prior.uomId !== source.line.uom.id)) unavailable();
  }
  const edges = await quotationMandatoryTargets(sourceIds, sources, undefined, relationships);
  const targetSources = new Map<string, Array<{ mainLineId: string; name: string }>>();
  for (const [sourceId, targets] of edges) {
    for (const targetId of targets) {
      const reasons = targetSources.get(targetId) ?? [];
      reasons.push({ mainLineId: sourceId, name: sources.get(sourceId)!.line.name });
      targetSources.set(targetId, reasons);
    }
  }
  const orderedTargetIds = [...targetSources.keys()].sort((left, right) =>
    sources.get(left)!.line.name.localeCompare(sources.get(right)!.line.name) || left.localeCompare(right));
  const items = [];
  for (const id of orderedTargetIds.slice(input.offset, input.offset + input.limit)) {
    const source = sources.get(id)!;
    items.push({ candidate: await quotationCandidateFor(estimate, source),
      sourceMainLines: targetSources.get(id)!.sort((left, right) => left.name.localeCompare(right.name) || left.mainLineId.localeCompare(right.mainLineId)),
      requiresSetup: !(estimate.selectedMainBasketIds ?? []).includes(source.line.basketId) });
  }
  return { projectId: String(estimate.projectId), estimateId: String(estimate._id), estimateVersion: Number(estimate.version),
    roomId: input.roomId, items, total: orderedTargetIds.length, limit: input.limit, offset: input.offset };
}
