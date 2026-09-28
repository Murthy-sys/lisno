import type { KnowledgeMaster } from "../../../../shared/knowledge/knowledgeTypes";

/** The directory shows the review state as one status, while retaining the stored lifecycle. */
export function vendorDisplayStatus(vendor: Pick<KnowledgeMaster, "status" | "procurementSummary">): "Archived" | "Inactive" | "Under Review" | "Active" {
  if (vendor.status === "archived") return "Archived";
  if (vendor.status === "inactive") return "Inactive";
  return vendor.procurementSummary?.currentAddressVerifiedPhysically === true ? "Active" : "Under Review";
}
