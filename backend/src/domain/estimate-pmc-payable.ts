import { calculateKnowledgePmcPrice, KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS } from "./ai-estimator-knowledge-mode-calculation.js";
import { KnowledgeCalculationError } from "./ai-estimator-knowledge-calculation.js";

export interface EstimatePmcPricing {
  baseRatePaise: number;
  lowQuantityLimit: string;
  impactBps: number;
  pmcMarginBps: number;
}

export function calculateEstimatePmcPayable(settings: EstimatePmcPricing | null | undefined, quantity: number, quantityScale: number) {
  if (!settings || !Number.isFinite(quantity) || quantity < 0) return null;
  try {
    return calculateKnowledgePmcPrice({ ...settings, quantity: String(quantity), quantityScale });
  } catch (error) {
    if (error instanceof KnowledgeCalculationError) return null;
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function readEstimatePmcPricing(payload: unknown, scale: number): EstimatePmcPricing | undefined {
  const section = record(payload);
  const scope = record(record(section?.modeCalculations)?.pmc);
  const impactBps = scope?.impactBps === undefined ? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS : scope.impactBps;
  if (typeof scope?.baseRatePaise !== "number" || typeof scope.lowQuantityLimit !== "string" ||
    typeof impactBps !== "number" || typeof section?.pmcMarginBps !== "number") return undefined;
  const settings = { baseRatePaise: scope.baseRatePaise, lowQuantityLimit: scope.lowQuantityLimit, impactBps, pmcMarginBps: section.pmcMarginBps };
  return calculateEstimatePmcPayable(settings, 0, scale) ? settings : undefined;
}
