import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { procurementBasketLineBoqReady, type ProcurementBasketDetailDto,
  type ProcurementBasketLineDto } from "./procurement-basket-projection.js";

export type ApprovedEstimatePricingMode = "pmc" | "sub_vendor" | "in_house";
export interface ApprovedEstimateSelection {
  approvedClassification?: "standard" | "special";
  approvedPricingMode?: ApprovedEstimatePricingMode;
  approvedModeIssues?: Array<{ code: string; message: string }>;
}
export interface ProcurementEstimateMode {
  approvedClassification: "standard" | "special" | null;
  approvedPricingMode: ApprovedEstimatePricingMode | null;
  mode: ApprovedEstimatePricingMode | null;
  provenance: "line" | "legacy_basket" | "unrecorded";
  issues: Array<{ code: string; message: string }>;
}
export type ProcurementBasketDisplayMode = ApprovedEstimatePricingMode | "unrecorded";
export interface ProcurementBasketModeMetrics {
  includedLineCount: number;
  boqReadyLineCount: number;
  readinessPercent: number | null;
  approvedEstimatePaise: number;
  currentCostPaise: number | null;
  currentCostComplete: boolean;
  unpricedLineCount: number;
  committedNetPaise: number;
  modeIssueCount: number;
}
export interface ProcurementBasketModeSubset extends ProcurementBasketModeMetrics {
  id: string;
  name: string;
  sourceLineItemKeys: string[];
}
export interface ProcurementBasketModeGroup extends ProcurementBasketModeMetrics {
  mode: ProcurementBasketDisplayMode;
  basketCount: number;
  baskets: ProcurementBasketModeSubset[];
}

/** Invalid display metadata never changes the established commercial source validation. */
export function readApprovedEstimateSelection(classification: unknown, pricingMode: unknown): ApprovedEstimateSelection {
  const result: ApprovedEstimateSelection = {};
  const issues: NonNullable<ApprovedEstimateSelection["approvedModeIssues"]> = [];
  if (classification === "standard" || classification === "special") result.approvedClassification = classification;
  else if (classification != null) issues.push({ code: "ESTIMATE_CLASSIFICATION_INVALID",
    message: "The approved item type is invalid. Review the approved estimate source." });
  if (pricingMode === "pmc" || pricingMode === "sub_vendor" || pricingMode === "in_house") result.approvedPricingMode = pricingMode;
  else if (pricingMode != null) issues.push({ code: "ESTIMATE_PRICING_MODE_INVALID",
    message: "The approved pricing mode is invalid. Review the approved estimate source." });
  if (issues.length) result.approvedModeIssues = issues;
  return result;
}

export function resolveProcurementEstimateMode(selection: ApprovedEstimateSelection,
  legacyStandard = false): ProcurementEstimateMode {
  const approvedClassification = selection.approvedClassification ?? null;
  const approvedPricingMode = selection.approvedPricingMode ?? null;
  const result: ProcurementEstimateMode = { approvedClassification, approvedPricingMode,
    mode: null, provenance: "unrecorded", issues: [...(selection.approvedModeIssues ?? [])] };
  if (result.issues.length) return result;
  if (approvedClassification === "standard") {
    if (approvedPricingMode !== null && approvedPricingMode !== "sub_vendor") {
      result.issues.push({ code: "ESTIMATE_MODE_CONFLICT",
        message: "The approved Standard item records a conflicting pricing mode. Review the approved estimate source." });
      return result;
    }
    return { ...result, mode: "sub_vendor", provenance: "line" };
  }
  if (approvedClassification === "special" && approvedPricingMode !== null)
    return { ...result, mode: approvedPricingMode, provenance: "line" };
  if (approvedClassification === null && approvedPricingMode === null && legacyStandard)
    return { ...result, mode: "sub_vendor", provenance: "legacy_basket" };
  result.issues.push({ code: "ESTIMATE_MODE_NOT_RECORDED", message: approvedClassification === "special"
    ? "This approved Special item has no recorded pricing mode."
    : "The approved item type and pricing mode were not recorded together." });
  return result;
}

/** Partition canonical source lines for display only. Never pass these subsets to commercial mutations. */
export function projectProcurementBasketModeGroups(baskets: readonly ProcurementBasketDetailDto[],
  committedBySourceLine: ReadonlyMap<string, number> = new Map()): ProcurementBasketModeGroup[] {
  const grouped = new Map<ProcurementBasketDisplayMode, ProcurementBasketModeSubset[]>(
    ["in_house", "sub_vendor", "pmc", "unrecorded"].map(mode => [mode as ProcurementBasketDisplayMode, []]));
  const seen = new Set<string>();
  for (const basket of baskets) {
    const partitions = new Map<ProcurementBasketDisplayMode, ProcurementBasketLineDto[]>();
    for (const line of basket.lines) {
      if (seen.has(line.sourceLineItemKey)) throw new Error("An approved source line belongs to more than one basket.");
      seen.add(line.sourceLineItemKey);
      const mode = line.estimateMode?.mode ?? "unrecorded";
      const lines = partitions.get(mode) ?? [];
      lines.push(line);
      partitions.set(mode, lines);
    }
    for (const [mode, lines] of partitions) {
      const actionable = lines.filter(line => line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0);
      const costs = actionable.map(line => basket.classification === "standard"
        ? line.standardCost?.adjustedCostPaise ?? null
        : line.mode?.state === "ready" ? line.mode.preview?.adjustedCostPaise ?? null : null);
      const unpricedLineCount = costs.filter(cost => cost === null).length;
      const committedNetPaise = sumPaise(lines.map(line => committedBySourceLine.get(line.sourceLineItemKey) ?? 0));
      if (actionable.length === 0 && committedNetPaise === 0) continue;
      const boqReadyLineCount = actionable.filter(line => procurementBasketLineBoqReady(basket, line)).length;
      // Validate every available value even when the aggregate is incomplete.
      const pricedTotal = sumPaise(costs.filter((cost): cost is number => cost !== null));
      grouped.get(mode)!.push({ id: basket.id, name: basket.name,
        sourceLineItemKeys: lines.map(line => line.sourceLineItemKey),
        includedLineCount: actionable.length, boqReadyLineCount,
        readinessPercent: actionable.length ? Math.round(boqReadyLineCount * 100 / actionable.length) : null,
        approvedEstimatePaise: sumPaise(actionable.map(line => line.approvedAmountPaise!)),
        currentCostPaise: unpricedLineCount ? null : pricedTotal,
        currentCostComplete: unpricedLineCount === 0, unpricedLineCount, committedNetPaise,
        modeIssueCount: lines.filter(line => !line.estimateMode || line.estimateMode.issues.length > 0).length });
    }
  }
  return [...grouped].filter(([mode, subsets]) => mode !== "unrecorded" || subsets.length > 0).map(([mode, subsets]) => {
    const includedLineCount = sumCounts(subsets.map(subset => subset.includedLineCount));
    const boqReadyLineCount = sumCounts(subsets.map(subset => subset.boqReadyLineCount));
    const unpricedLineCount = sumCounts(subsets.map(subset => subset.unpricedLineCount));
    const pricedTotal = sumPaise(subsets.flatMap(subset => subset.currentCostPaise === null ? [] : [subset.currentCostPaise]));
    return { mode, baskets: subsets, basketCount: subsets.length, includedLineCount, boqReadyLineCount,
      readinessPercent: includedLineCount ? Math.round(boqReadyLineCount * 100 / includedLineCount) : null,
      approvedEstimatePaise: sumPaise(subsets.map(subset => subset.approvedEstimatePaise)),
      currentCostPaise: unpricedLineCount ? null : pricedTotal, currentCostComplete: unpricedLineCount === 0,
      unpricedLineCount, committedNetPaise: sumPaise(subsets.map(subset => subset.committedNetPaise)),
      modeIssueCount: sumCounts(subsets.map(subset => subset.modeIssueCount)) };
  });
}

function sumPaise(values: readonly number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid basket mode amount.");
    return sum + BigInt(value);
  }, 0n);
  if (total > BigInt(MAX_FINANCE_AMOUNT_PAISE)) throw new RangeError("Basket mode amount exceeds the supported range.");
  return Number(total);
}
function sumCounts(values: readonly number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result)) throw new RangeError("Basket mode count exceeds the supported range.");
  return result;
}
