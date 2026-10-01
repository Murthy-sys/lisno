import type { ProcurementReferenceStatus } from "./project-procurement.js";

export interface PurchaseOrderPreparationBlocker {
  code: string;
  message: string;
  itemId?: string;
}

export interface PurchaseOrderPreparationItem {
  id: string;
  version: number;
  sourceSectionId: string | null;
  sourceLineItemKey: string | null;
  roomName: string | null;
  itemName: string;
  brand: string;
  uom: { id: string; code: string; name: string; decimalScale: number | null; status: ProcurementReferenceStatus };
  vendor: { id: string; code: string; name: string; status: ProcurementReferenceStatus; vendorType: "execution" | "supplier" | null } | null;
  plannedOrderQuantityMilliUnits: number | null;
  pricePaise: number;
  allocatedWorkPaise: number | null;
  plannedLineNetPaise: number | null;
  blockers: PurchaseOrderPreparationBlocker[];
}

export interface PurchaseOrderPreparationSection {
  id: string;
  label: string;
  roomName: string;
  estimatedPaise: number;
  netPaise: number | null;
  items: PurchaseOrderPreparationItem[];
}

export interface ProjectPurchaseOrderPreparationDto {
  projectId: string;
  orderDefaults: { targetDate: string | null; deliveryLocation: string | null };
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  approvedEstimatePaise: number;
  committedPaise: number;
  committedGstPaise: number;
  committedTotalPaise: number;
  remainingPaise: number;
  sections: PurchaseOrderPreparationSection[];
  netPaise: number | null;
  itemCount: number;
  readyItemCount: number;
  blockers: PurchaseOrderPreparationBlocker[];
  digest: string;
}
