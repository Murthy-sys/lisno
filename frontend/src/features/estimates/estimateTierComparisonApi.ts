import { apiClient } from "../../api/client";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimateDimensions, EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { EstimatePricingMode } from "../leads/leadsApi";

export type EstimateTierComparisonTarget = { kind: "lead" | "project"; id: string };
export interface EstimateTierComparisonLineInput {
  mainLineId: string;
  lineItemId?: string;
  revisionId: string;
  itemVersion: number;
  revisionVersion: number;
  uomId: string;
  quantity: number;
  pricingMode: EstimatePricingMode;
  modeTier: KnowledgeModeTier;
  selectedInHouseComponentIds?: string[];
  dimensions?: EstimateDimensions;
  expectedDimensionRule?: EstimateDimensionRule;
  rateSource?: "configuration" | "manual";
  manualRateChanged?: boolean;
}
export interface EstimateTierComparisonInput {
  expectedVersion?: number;
  mainBasketId: string;
  subBasketId: string | null;
  roomId: string;
  lines: EstimateTierComparisonLineInput[];
}
export interface EstimateTierComparison {
  mainBasketId: string;
  subBasketId: string | null;
  roomId: string;
  roomName: string;
  mainBasketName: string;
  subBasketName: string | null;
  estimateVersion: number | null;
  tiers: Array<{
    modeTier: "current" | KnowledgeModeTier;
    label: string;
    available: boolean;
    subtotalPaise: number | null;
    lines: Array<{ mainLineId: string; name: string; quantity: number; uomName: string;
      ratePaise: number | null; amountPaise: number | null; unavailableReason: string | null }>;
  }>;
}
export interface EstimateTierComparisonRequest {
  target: EstimateTierComparisonTarget;
  input: EstimateTierComparisonInput;
}
const pathFor = (target: EstimateTierComparisonTarget) => target.kind === "lead"
  ? `/leads/${encodeURIComponent(target.id)}/estimate/tier-comparison`
  : `/projects/${encodeURIComponent(target.id)}/estimate-tier-comparison`;
export const getEstimateTierComparison = ({ target, input }: EstimateTierComparisonRequest, signal?: AbortSignal) =>
  apiClient.post<EstimateTierComparison>(pathFor(target), input, { signal, showGlobalLoader: false });
export const downloadEstimateTierComparison = ({ target, input }: EstimateTierComparisonRequest, signal?: AbortSignal) =>
  apiClient.postBlob(`${pathFor(target)}/pdf`, input, { signal, showGlobalLoader: false, maxBytes: 20 * 1024 * 1024 });
