import type { ProcurementReferenceStatus } from "./project-procurement.js";
import type { PurchaseOrderModeResolution, PurchaseOrderModeStandardSuggestion } from "./project-purchase-order-mode.js";
import type { ProcurementBasketProjectRate } from "./procurement-basket-base-rate.js";

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

/** The immutable approved-round order is retained; child purchase items are linked by source key. */
export interface PurchaseOrderPreparationEstimateLine {
  key: string;
  included: boolean;
  source: "configuration" | "legacy";
  itemType?: "main_line" | "temporary";
  mainBasketClassification?: "standard" | "special";
  /** True only when the immutable approved snapshot explicitly classified this Main Basket. */
  mainBasketClassificationExplicit?: boolean;
  roomId: string | null;
  roomName: string;
  mainBasketId: string | null;
  mainBasketName: string | null;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string | null;
  quantity: string;
  unit: string;
  amountPaise: number | null;
  itemIds: string[];
  mode: PurchaseOrderModeResolution | null;
  standardSuggestion?: PurchaseOrderModeStandardSuggestion | null;
  projectRate?: ProcurementBasketProjectRate;
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
  estimateLines: PurchaseOrderPreparationEstimateLine[];
  sections: PurchaseOrderPreparationSection[];
  netPaise: number | null;
  itemCount: number;
  readyItemCount: number;
  blockers: PurchaseOrderPreparationBlocker[];
  digest: string;
}
