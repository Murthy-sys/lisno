import type { KnowledgeJsonValue } from "./knowledgeTypes";

export const PMC_MARGIN_ERROR = "Enter a PMC margin from 10% to 20%, with up to two decimal places.";

export function pmcMarginIssues(value: KnowledgeJsonValue | undefined) {
  if (value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1_000 && value <= 2_000)) return [];
  return [{ path: "pmcMarginBps", message: PMC_MARGIN_ERROR }];
}
