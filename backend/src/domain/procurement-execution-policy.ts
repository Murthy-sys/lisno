import type { PurchaseOrderModeKey } from "./project-purchase-order-mode.js";

export interface ProcurementExecutionPolicy {
  intent: "pmc" | "execution" | "unrecorded";
  allowedModes: PurchaseOrderModeKey[];
}

/** The estimator price identifies PMC intent, never a saved Procurement choice. */
export function resolveProcurementExecutionPolicy(source: {
  approvedPricingMode?: unknown;
  approvedModeIssues?: readonly { code: string }[];
}): ProcurementExecutionPolicy {
  if (source.approvedModeIssues?.some(issue => issue.code === "ESTIMATE_PRICING_MODE_INVALID")) {
    return { intent: "unrecorded", allowedModes: [] };
  }
  if (source.approvedPricingMode === "pmc") return { intent: "pmc", allowedModes: ["pmc"] };
  if (source.approvedPricingMode === "sub_vendor" || source.approvedPricingMode === "in_house") {
    return { intent: "execution", allowedModes: ["sub_vendor", "in_house"] };
  }
  return { intent: "unrecorded", allowedModes: [] };
}

export function procurementModeMatchesPolicy(policy: ProcurementExecutionPolicy | undefined,
  mode: PurchaseOrderModeKey | null | undefined): boolean {
  return Boolean(policy && mode && policy.allowedModes.includes(mode));
}
