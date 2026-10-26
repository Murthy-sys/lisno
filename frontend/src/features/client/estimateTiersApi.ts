import type { EstimateComponentPricing, ESTIMATE_COMPONENT_PRICING_BASIS } from "../../../../shared/estimation/estimateComponentPricing";
import type { EstimateDimensions, EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import { apiClient } from "../../api/client";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimatePricingMode } from "../leads/leadsApi";

export interface EstimateTierSource {
  revisionId: string;
  itemVersion: number;
  revisionVersion: number;
  uomId: string;
}

export interface EstimateTierChoice {
  pricingBasis?: typeof ESTIMATE_COMPONENT_PRICING_BASIS;
  componentPricing?: EstimateComponentPricing;
  modeTier: KnowledgeModeTier;
  available: boolean;
  unavailableReason: string | null;
  ratePaise: number | null;
  amountPaise: number | null;
  source: EstimateTierSource | null;
  inHouseComponents?: Array<{ id: string; label: string; ratePaise: number | null; amountPaise?: number | null; available: boolean }>;
}

export interface EstimateTierLine {
  pricingBasis?: typeof ESTIMATE_COMPONENT_PRICING_BASIS;
  componentPricing?: EstimateComponentPricing;
  id: string;
  mainLineId: string;
  mainLineName: string;
  roomName: string;
  dimensionsMandatory?: boolean;
  dimensionRule?: EstimateDimensionRule | null;
  dimensions?: EstimateDimensions;
  dimensionsNeedReview?: boolean;
  quantity: number;
  uomName: string;
  pricingMode: EstimatePricingMode | null;
  modeTier: KnowledgeModeTier;
  ratePaise: number | null;
  amountPaise: number | null;
  selectedInHouseComponentIds?: string[];
  choices: EstimateTierChoice[];
}

export interface EstimateTiersDetail {
  projectId: string;
  estimateId: string | null;
  estimateVersion: number | null;
  editingAllowed: boolean;
  editingBlockReason: "review_pending" | "closed" | "not_started" | null;
  totalPaise: number | null;
  isIncomplete: boolean;
  lines: EstimateTierLine[];
}

export interface UpdateEstimateTierInput extends EstimateTierSource {
  expectedVersion: number;
  modeTier: KnowledgeModeTier;
  selectedInHouseComponentIds?: string[];
}

export const estimateTiersKeys = {
  all: ["estimate-tiers"] as const,
  detail: (projectId: string) => ["estimate-tiers", projectId] as const
};
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/estimate-tiers`;
export const getEstimateTiers = (projectId: string) => apiClient.get<EstimateTiersDetail>(path(projectId));
export const updateEstimateTier = (projectId: string, lineItemId: string, input: UpdateEstimateTierInput) =>
  apiClient.patch<EstimateTiersDetail>(`${path(projectId)}/${encodeURIComponent(lineItemId)}`, {
    expectedVersion: input.expectedVersion, modeTier: input.modeTier,
    revisionId: input.revisionId, itemVersion: input.itemVersion, revisionVersion: input.revisionVersion, uomId: input.uomId,
    ...(input.selectedInHouseComponentIds === undefined ? {} : { selectedInHouseComponentIds: input.selectedInHouseComponentIds })
  });

export interface UpdateEstimateDimensionsInput extends EstimateTierSource {
  expectedVersion: number;
  expectedDimensionRule: EstimateDimensionRule;
  dimensions: EstimateDimensions;
}
export const updateEstimateDimensions = (projectId: string, lineItemId: string, input: UpdateEstimateDimensionsInput) =>
  apiClient.patch<EstimateTiersDetail>(`/projects/${encodeURIComponent(projectId)}/estimate-dimensions/${encodeURIComponent(lineItemId)}`, {
    expectedVersion: input.expectedVersion, revisionId: input.revisionId, itemVersion: input.itemVersion,
    revisionVersion: input.revisionVersion, uomId: input.uomId,
    expectedDimensionRule: { formula: input.expectedDimensionRule.formula, inputUnit: input.expectedDimensionRule.inputUnit, quantityUnit: input.expectedDimensionRule.quantityUnit, uomId: input.expectedDimensionRule.uomId, decimalScale: input.expectedDimensionRule.decimalScale },
    dimensions: { length: input.dimensions.length, width: input.dimensions.width, height: input.dimensions.height }
  });
