import type { ClientSession } from "mongoose";
import { toEstimateAggregatePricing } from "../domain/estimate-aggregate-pricing.js";
import { readEstimateComponentPricing } from "../domain/estimate-component-pricing.js";
import { estimatorCatalogueTierPricing, resolveEstimatorCatalogueLines, type EstimatorCatalogueLine } from "./estimator-catalogue.service.js";

type Row = Record<string, unknown>;
type Source = { line: EstimatorCatalogueLine; mainBasketName: string; subBasketName: string | null };
const object = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

/** Response-only projection. Never pass this DTO back to a financial validator or persistence. */
export function projectEstimateInHouseResponse<T>(value: T, current: ReadonlyMap<string, Source>): T {
  function visit(value: unknown, inheritedId?: string, inheritedTier?: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => visit(item, inheritedId, inheritedTier));
    if (!object(value)) return value;
    const mainLineId = typeof value.mainLineId === "string" ? value.mainLineId : inheritedId;
    const tier = value.modeTier ?? inheritedTier ?? "signature";
    const source = mainLineId ? current.get(mainLineId) : undefined;
    const pricing = source ? estimatorCatalogueTierPricing(source.line, tier) : null;
    const policy = pricing?.inHousePolicy;
    // Only the exact current tier can prove permission to disclose component details.
    const governed = mainLineId !== undefined && (!pricing || policy !== undefined && policy.state !== "legacy");
    const evidence = readEstimateComponentPricing(value.componentPricing);
    const next: Row = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "inHousePolicy" || key === "inHousePresetComponentIds") continue;
      if (governed && ["componentPricing", "selectedInHouseComponentIds", "inHouseComponents"].includes(key)) continue;
      next[key] = visit(child, mainLineId, tier);
    }
    if (governed && (value.pricingMode === "in_house" || evidence || value.inHouseComponents !== undefined || value.inHouseUsage !== undefined)) {
      next.inHouseUsage = policy?.usage ?? null;
      next.inHousePricingState = pricing?.inHousePricingState ?? "invalid";
      if (evidence) next.aggregatePricing = toEstimateAggregatePricing(evidence);
      const changed = !!evidence && (!source || !policy || policy.state !== "ready" ||
        source.line.revisionId !== evidence.revisionId || source.line.itemVersion !== evidence.sourceItemVersion ||
        source.line.revisionVersion !== evidence.sourceRevisionVersion ||
        policy.componentIds.length !== evidence.selectedComponentIds.length ||
        policy.componentIds.some(id => !evidence.selectedComponentIds.includes(id)));
      if (changed) {
        next.configurationPricingChanged = true;
        next.configurationPricingIssue = "Configuration changed. Refresh price.";
      }
    }
    return next;
  }
  return visit(value) as T;
}

/** Resolve all nested current sources once, including historical/pre-approved snapshots. */
export async function presentEstimateInHouseResponse<T>(value: T, session?: ClientSession): Promise<T> {
  const ids = new Set<string>();
  function collect(value: unknown, inheritedId?: string): void {
    if (Array.isArray(value)) { value.forEach(child => collect(child, inheritedId)); return; }
    if (!object(value)) return;
    const mainLineId = typeof value.mainLineId === "string" ? value.mainLineId : inheritedId;
    if (mainLineId && (value.pricingMode === "in_house" || value.componentPricing !== undefined || value.inHouseComponents !== undefined || value.aggregatePricing !== undefined || value.inHouseUsage !== undefined)) ids.add(mainLineId);
    Object.values(value).forEach(child => collect(child, mainLineId));
  }
  collect(value);
  if (!ids.size) return value;
  return projectEstimateInHouseResponse(value, await resolveEstimatorCatalogueLines([...ids], session));
}
