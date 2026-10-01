import type { VendorActivation, VendorLifecycleStatus } from "../contracts/vendor-induction.js";

export type VendorActivationGates = VendorActivation["gates"];

/** Lifecycle overrides activation; the two current KPI assessments make a vendor assignable. */
export function deriveVendorActivation(lifecycleStatus: VendorLifecycleStatus, gates: VendorActivationGates): VendorActivation {
  const effectiveStatus = lifecycleStatus === "archived" ? "archived"
    : lifecycleStatus === "inactive" ? "inactive"
      : gates.vendorSelfKpiComplete && gates.procurementKpiComplete ? "active" : "under_review";
  return { lifecycleStatus, effectiveStatus, gates };
}
