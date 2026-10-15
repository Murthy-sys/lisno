/** Native DTOs mirrored from the canonical web API. Keep source identities and integer paise unchanged. */
export interface EstimationPreparationSource {
  workflowVersion: 2;
  phase: "pre" | "post";
  kind: "approved_pre" | "released_post" | "approved_final";
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  sourceSnapshotId: string;
  sourceDigest: string;
}

export interface WorkOrderIssueReadiness {
  required: boolean;
  canIssue: boolean;
  blockers: string[];
  finalSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string } | null;
}

export interface ProcurementUomOption {
  id: string;
  code: string;
  name: string;
  decimalScale?: number;
}

export interface ProcurementEstimateSource {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  sourceSectionId: string;
  sourceLineItemKey: string;
}

export interface ProjectProcurementItem {
  id: string;
  projectId: string;
  itemName: string;
  brand: string;
  uom: ProcurementUomOption & {
    status: "active" | "inactive" | "archived" | "unavailable";
  };
  vendor: ProcurementVendorReference | null;
  pricePaise: number;
  plannedOrderQuantityMilliUnits?: number | null;
  plannedLineNetPaise?: number | null;
  allocatedWorkPaise?: number | null;
  estimateSource: ProcurementEstimateSource | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProcurementItemsPage {
  items: ProjectProcurementItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProcurementVendorReference {
  id: string;
  code: string;
  name: string;
  status: "active" | "under_review" | "inactive" | "archived" | "unavailable";
}

export interface ProcurementVendorOption extends ProcurementVendorReference {
  status: "active" | "under_review" | "inactive";
  assignable?: boolean;
  readiness?: {
    inductionApproved: boolean;
    vendorSelfKpiComplete: boolean;
    procurementKpiComplete: boolean;
    profileComplete: boolean;
    physicalAddressVerified: boolean;
  };
}

export interface ProcurementVendorPage {
  items: ProcurementVendorOption[];
  total: number;
  limit: number;
  offset: number;
}
