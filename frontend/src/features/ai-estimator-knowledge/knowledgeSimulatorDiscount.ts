import type { KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { maximumModeDiscountBps } from "./knowledgeModeCalculation";
import { parseRupeeInputToPaise } from "./knowledgePresentation";

export const SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the markup below the minimum standard.";
export const PMC_SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. The final total must retain at least 10% above the revised amount.";

export function maximumPmcSimulatorDiscountBps(marginBps: number | undefined): number | undefined {
  if (marginBps === undefined || !Number.isSafeInteger(marginBps) || marginBps < 1_000 || marginBps > 2_000) return undefined;
  return Math.floor((marginBps - 1_000) * 10_000 / (10_000 + marginBps));
}

export function maximumSimulatorDiscountBps(drafts: readonly KnowledgeModeCalculationDraft[], markupBasis: "starting" | "minimum"): number | undefined {
  const limits = drafts.map(maximumModeDiscountBps);
  if (!limits.length || limits.some((value) => value === undefined)) return undefined;
  return markupBasis === "minimum" ? 0 : Math.min(...limits as number[]);
}

export function parseSimulatorDiscount(text: string, maximumBps: number | undefined, basis: "markup" | "pmc" = "markup") {
  // Percentages and currency both use exact hundredths parsing; never use floating-point percentage arithmetic.
  const parsed = parseRupeeInputToPaise(text);
  if (parsed.status !== "valid" || parsed.paise > Number.MAX_SAFE_INTEGER - 10_000) {
    return { error: "Enter a non-negative discount with up to two decimal places.", overLimit: false };
  }
  if (maximumBps !== undefined && parsed.paise > maximumBps) {
    return { error: basis === "pmc" ? PMC_SIMULATOR_DISCOUNT_LIMIT_MESSAGE : SIMULATOR_DISCOUNT_LIMIT_MESSAGE, overLimit: true };
  }
  return { bps: parsed.paise, overLimit: false };
}
