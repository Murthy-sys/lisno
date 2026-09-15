import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export const PMC_MARGIN_ERROR = "Enter a PMC margin from 10% to 20%, with up to two decimal places.";
export const SUB_VENDOR_MARGIN_ERROR = "Enter a Lisno margin from 0% to 95% in multiples of 5%.";

function marginIssues(value: KnowledgeJsonValue | undefined, path: string, message: string) {
  if (value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1_000 && value <= 2_000)) return [];
  return [{ path, message }];
}

export function pmcMarginIssues(value: KnowledgeJsonValue | undefined) {
  return marginIssues(value, "pmcMarginBps", PMC_MARGIN_ERROR);
}

export function subVendorMarginIssues(value: KnowledgeJsonValue | undefined) {
  return lisnoMarginIssues(value, "subVendorMarginBps", SUB_VENDOR_MARGIN_ERROR);
}

function lisnoMarginIssues(value: KnowledgeJsonValue | undefined, path: string, message: string) {
  if (value == null || (typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= 9_500 && value % 500 === 0)) return [];
  return [{ path, message }];
}

/** Read legacy single-rate data without changing its persisted representation. */
export function subVendorMarginRange(payload: KnowledgeJsonObject): {
  minimum: KnowledgeJsonValue | undefined;
  maximum: KnowledgeJsonValue | undefined;
} {
  return {
    minimum: Object.hasOwn(payload, "subVendorMinimumMarginBps")
      ? payload.subVendorMinimumMarginBps : payload.subVendorMarginBps,
    maximum: payload.subVendorMarginBps
  };
}

export function subVendorMarginRangeIssues(payload: KnowledgeJsonObject): { path: string; message: string }[] {
  const { minimum, maximum } = subVendorMarginRange(payload);
  const issues = [
    ...lisnoMarginIssues(minimum, "subVendorMinimumMarginBps", "Enter a minimum Lisno margin from 0% to 95% in multiples of 5%."),
    ...lisnoMarginIssues(maximum, "subVendorMarginBps", "Enter a maximum Lisno margin from 0% to 95% in multiples of 5%.")
  ];
  if (minimum == null && maximum != null) issues.push({
    path: "subVendorMinimumMarginBps", message: "Enter the minimum Lisno margin, or clear both margins."
  });
  if (maximum == null && minimum != null) issues.push({
    path: "subVendorMarginBps", message: "Enter the maximum Lisno margin, or clear both margins."
  });
  if (!issues.length && typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) {
    issues.push({ path: "subVendorMinimumMarginBps", message: "Minimum Lisno margin must not exceed maximum Lisno margin." });
  }
  return issues;
}

export function withSubVendorMargin(payload: KnowledgeJsonObject, field: "minimum" | "maximum", value: KnowledgeJsonValue): KnowledgeJsonObject {
  const original = subVendorMarginRange(payload);
  const configured = Object.hasOwn(payload, "subVendorMinimumMarginBps") ? payload : {
    ...payload,
    subVendorMinimumMarginBps: original.minimum ?? null,
    subVendorMarginBps: original.maximum ?? null
  };
  return { ...configured, [field === "minimum" ? "subVendorMinimumMarginBps" : "subVendorMarginBps"]: value };
}
