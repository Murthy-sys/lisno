import { parseRupeeInputToPaise } from "./knowledgePresentation";

export const SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Discount not allowed. Recheck the discount % — it would take the selling price below the configured minimum Gross Margin.";
export const CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS = 10_000;
export const CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE = "Enter a discount from 0% to 100%, with up to two decimal places.";

export function parseSimulatorDiscount(text: string, maximumBps: number | undefined, basis: "in_house" | "markup" | "pmc" | "sub_vendor" = "in_house") {
  // Percentages and currency both use exact hundredths parsing; never use floating-point percentage arithmetic.
  const parsed = parseRupeeInputToPaise(text);
  if (parsed.status !== "valid" || parsed.paise > Number.MAX_SAFE_INTEGER - 10_000) {
    return { error: "Enter a non-negative discount with up to two decimal places.", overLimit: false };
  }
  const maximum = basis === "in_house" || basis === "markup" ? maximumBps : CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS;
  if (maximum !== undefined && parsed.paise > maximum) {
    return { error: basis === "in_house" || basis === "markup" ? SIMULATOR_DISCOUNT_LIMIT_MESSAGE : CUSTOM_SIMULATOR_DISCOUNT_LIMIT_MESSAGE, overLimit: true };
  }
  return { bps: parsed.paise, overLimit: false };
}
