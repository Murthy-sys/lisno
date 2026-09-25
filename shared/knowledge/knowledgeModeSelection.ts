import type { KnowledgeJsonObject, KnowledgeModeKind, KnowledgeExecutionSource } from "./knowledgeTypes";
import { parseKnowledgeModeConfigurations, partitionKnowledgeModeConfigurations } from "./knowledgeModeConfiguration";
import { modeCalculationIssues } from "./knowledgeModeCalculation";
import { pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues } from "./knowledgePmcMargin";
import { PMC_SCOPE_LISTS } from "./knowledgePmcScope";

export function modeSelectionForPayload(
  payload: KnowledgeJsonObject,
  configurations = parseKnowledgeModeConfigurations(payload.modeConfigurations).configurations
): {
  readonly modes: Record<KnowledgeModeKind, boolean>;
  readonly executionSources: Record<KnowledgeExecutionSource, boolean>;
} {
  const primary = partitionKnowledgeModeConfigurations(configurations).primary;
  const rawCalculations = payload.modeCalculations;
  const calculations = rawCalculations && typeof rawCalculations === "object" && !Array.isArray(rawCalculations)
    ? rawCalculations as KnowledgeJsonObject
    : undefined;
  const completeCalculation = (value: KnowledgeJsonObject[string] | undefined) =>
    value != null && modeCalculationIssues(value).length === 0;
  const pmcRange = pmcMarginRange(payload);
  const completePmcMargin = pmcRange.minimum != null && pmcRange.maximum != null &&
    pmcMarginRangeIssues(payload).length === 0;
  const subVendorRange = subVendorMarginRange(payload);
  const completeSubVendorMargin = subVendorRange.minimum != null && subVendorRange.maximum != null &&
    subVendorMarginRangeIssues(payload).length === 0;
  const hasSplitInHouse = calculations != null &&
    (Object.hasOwn(calculations, "in_house_labor") || Object.hasOwn(calculations, "in_house_material"));
  // The established Sub-Vendor scope is stored on the canonical PMC row.
  // An own list, including an explicitly saved empty list, is therefore
  // source-specific evidence that Sub-Vendor was configured or reviewed.
  const hasSubVendorScope = primary.pmc != null && PMC_SCOPE_LISTS.some((list) =>
    primary.pmc?.[list] !== undefined);
  const pmc = Boolean(primary.pmc || completeCalculation(calculations?.pmc) || completePmcMargin);
  const subVendor = Boolean(primary.execution.sub_vendor || hasSubVendorScope || completeCalculation(calculations?.sub_vendor) ||
    completeSubVendorMargin);
  const inHouse = Boolean(primary.execution.in_house ||
    (hasSplitInHouse
      ? completeCalculation(calculations?.in_house_labor) || completeCalculation(calculations?.in_house_material)
      : completeCalculation(calculations?.in_house)));
  const hasUnmatchedModeData = payload.modeCalculation != null ||
    (calculations != null && Object.values(calculations).some((value) => value != null)) ||
    (Array.isArray(payload.modeConfigurations) && payload.modeConfigurations.length > 0) ||
    [payload.pmcMinimumMarginBps, payload.pmcMarginBps,
      payload.subVendorMinimumMarginBps, payload.subVendorMarginBps]
      .some((value) => value != null);
  const empty = !pmc && !subVendor && !inHouse && !hasUnmatchedModeData;
  return {
    modes: { pmc: pmc || empty, execution: subVendor || inHouse },
    executionSources: { sub_vendor: subVendor || empty, in_house: inHouse }
  };
}
