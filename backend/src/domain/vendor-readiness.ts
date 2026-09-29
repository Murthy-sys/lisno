import type { VendorActivation, VendorLifecycleStatus } from "../contracts/vendor-induction.js";

export type VendorActivationGates = VendorActivation["gates"];

/** Lifecycle overrides readiness; all five gates are required for a live vendor. */
export function deriveVendorActivation(lifecycleStatus: VendorLifecycleStatus, gates: VendorActivationGates): VendorActivation {
  const effectiveStatus = lifecycleStatus === "archived" ? "archived"
    : lifecycleStatus === "inactive" ? "inactive"
      : Object.values(gates).every(Boolean) ? "active" : "under_review";
  return { lifecycleStatus, effectiveStatus, gates };
}
