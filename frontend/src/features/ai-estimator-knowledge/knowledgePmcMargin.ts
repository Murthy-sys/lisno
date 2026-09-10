import type { KnowledgeJsonValue } from "./knowledgeTypes";

export const PMC_MARGIN_ERROR = "Enter a PMC margin from 10% to 20%, with up to two decimal places.";
export const SUB_VENDOR_MARGIN_ERROR = "Enter a Sub-Vendor margin from 10% to 20%, with up to two decimal places.";

function marginIssues(value: KnowledgeJsonValue | undefined, path: string, message: string) {
  if (value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1_000 && value <= 2_000)) return [];
  return [{ path, message }];
}

export function pmcMarginIssues(value: KnowledgeJsonValue | undefined) {
  return marginIssues(value, "pmcMarginBps", PMC_MARGIN_ERROR);
}

export function subVendorMarginIssues(value: KnowledgeJsonValue | undefined) {
  return marginIssues(value, "subVendorMarginBps", SUB_VENDOR_MARGIN_ERROR);
}
