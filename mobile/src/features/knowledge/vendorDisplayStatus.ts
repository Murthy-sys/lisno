import type { KnowledgeMaster } from "../../../../shared/knowledge/knowledgeTypes";

/** Availability is supplied by the backend. Missing projections are never treated as Active. */
export function vendorDisplayStatus(vendor: Pick<KnowledgeMaster, "status" | "vendorActivation">): "Archived" | "Inactive" | "Under Review" | "Active" {
  if (vendor.status === "archived") return "Archived";
  if (vendor.status === "inactive") return "Inactive";
  return vendor.vendorActivation?.effectiveStatus === "active" ? "Active" : "Under Review";
}
