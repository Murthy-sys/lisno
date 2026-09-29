import type { ClientSession } from "mongoose";
import type { VendorActivation, VendorLifecycleStatus } from "../contracts/vendor-induction.js";
import { deriveVendorActivation } from "../domain/vendor-readiness.js";
import { vendorInductionApprovals } from "./vendor-induction-read.js";
import { vendorKpiDirectorySummaries } from "./vendor-kpi.service.js";
import { procurementVendorProfileComplete, storedProcurementVendorProfile } from "./procurement-vendor-profile.js";

type Row = Record<string, any>;

function lifecycleStatus(vendor: Row): VendorLifecycleStatus {
  if (vendor.status === "archived") return "archived";
  if (vendor.status === "inactive") return "inactive";
  return "active";
}

function physicalAddressVerified(profile: ReturnType<typeof storedProcurementVendorProfile>): boolean {
  return profile?.currentAddressVerifiedPhysically === true &&
    typeof profile.physicalAddressVerifiedAt === "string" && profile.physicalAddressVerifiedAt.length > 0 &&
    typeof profile.physicalAddressVerifiedById === "string" && profile.physicalAddressVerifiedById.length > 0;
}

/** Read current induction, KPI generation, and profile state from one transaction snapshot when supplied. */
export async function vendorActivations(vendors: readonly Row[], session?: ClientSession): Promise<Map<string, VendorActivation>> {
  const result = new Map<string, VendorActivation>();
  if (!vendors.length) return result;
  // MongoDB forbids parallel commands on one ClientSession.
  const approvals = await vendorInductionApprovals(vendors, session);
  const kpis = await vendorKpiDirectorySummaries(vendors, session);
  for (const vendor of vendors) {
    const id = String(vendor._id);
    const profile = storedProcurementVendorProfile(vendor.procurementProfile);
    const summary = kpis.get(id);
    result.set(id, deriveVendorActivation(lifecycleStatus(vendor), {
      inductionApproved: approvals.get(id) === true,
      vendorSelfKpiComplete: summary?.selfStatus === "submitted",
      procurementKpiComplete: summary?.status === "rated",
      profileComplete: procurementVendorProfileComplete(profile, vendor.msmeCertificate),
      physicalAddressVerified: physicalAddressVerified(profile)
    }));
  }
  return result;
}

export async function vendorActivation(vendor: Row, session?: ClientSession): Promise<VendorActivation> {
  return (await vendorActivations([vendor], session)).get(String(vendor._id))!;
}
