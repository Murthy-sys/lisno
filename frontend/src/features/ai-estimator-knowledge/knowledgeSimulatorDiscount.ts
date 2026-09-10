import type { KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { maximumModeDiscountBps } from "./knowledgeModeCalculation";
import { parseRupeeInputToPaise } from "./knowledgePresentation";

export const SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the markup below the minimum standard.";
export const CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS = 10_000;
export const CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Enter a discount from 0% to 100%, with up to two decimal places.";

export function maximumSimulatorDiscountBps(drafts: readonly KnowledgeModeCalculationDraft[], markupBasis: "starting" | "minimum"): number | undefined {
  const limits = drafts.map(maximumModeDiscountBps);
  if (!limits.length || limits.some((value) => value === undefined)) return undefined;
  return markupBasis === "minimum" ? 0 : Math.min(...limits as number[]);
}

export function parseSimulatorDiscount(text: string, maximumBps: number | undefined, basis: "markup" | "pmc" | "sub_vendor" = "markup") {
  // Percentages and currency both use exact hundredths parsing; never use floating-point percentage arithmetic.
  const parsed = parseRupeeInputToPaise(text);
  if (parsed.status !== "valid" || parsed.paise > Number.MAX_SAFE_INTEGER - 10_000) {
    return { error: "Enter a non-negative discount with up to two decimal places.", overLimit: false };
  }
  const maximum = basis === "markup" ? maximumBps : CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS;
  if (maximum !== undefined && parsed.paise > maximum) {
    return { error: basis !== "markup" ? CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE : SIMULATOR_DISCOUNT_LIMIT_MESSAGE, overLimit: true };
  }
  return { bps: parsed.paise, overLimit: false };
}
