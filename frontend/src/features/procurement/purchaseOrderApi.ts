import { apiClient } from "../../api/client";

export type PurchaseOrderStatus = "draft" | "pending_approval" | "changes_requested" | "rejected" | "approved" | "cancelled";
export type PurchaseOrderScope = "supply" | "execution" | "supply_and_execution";

export interface PurchaseOrderLineInput {
  procurementItemId: string;
  quantityMilliUnits: number;
  unitPricePaise: number;
  gstBasisPoints: number;
  scopeType: PurchaseOrderScope;
  description: string;
  targetDate: string;
  deliveryLocation: string;
}

export interface PurchaseOrderLine extends PurchaseOrderLineInput {
  id: string;
  procurementItemVersion: number;
  netPaise: number;
  gstPaise: number;
  totalPaise: number;
  itemName?: string;
  brand?: string;
  roomName?: string;
  uomCode?: string;
  uomName?: string;
}

export interface PurchaseOrderTotals { netPaise: number; gstPaise: number; totalPaise: number }

export interface PurchaseOrderRevision {
  id: string;
  revision: number;
  submittedAt: string;
  submittedById: string;
  terms: string;
  lines: PurchaseOrderLine[];
  totals: PurchaseOrderTotals;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  projectId: string;
  projectRequestId?: string | null;
  vendor: { id: string; code: string; name: string };
  status: PurchaseOrderStatus;
  version: number;
  revision: number;
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  terms: string;
  draftLines: PurchaseOrderLine[];
  draftTotals: PurchaseOrderTotals;
  submittedRevisionId: string | null;
  approvedRevisionId: string | null;
  approvedNetPaise: number | null;
  approvedGstPaise: number | null;
  approvedTotalPaise: number | null;
  decisions: Array<{ id: string; revisionId: string; revision: number; decision: string; actorId: string; reason: string | null; budgetOverrideReason: string | null; decidedAt: string }>;
  revisions: PurchaseOrderRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface VendorPurchaseOrder {
  id: string;
  orderNumber: string;
  projectId: string;
  vendor: { id: string; code: string; name: string };
  revision: number;
  approvedAt: string;
  terms: string;
  lines: PurchaseOrderLine[];
  totals: PurchaseOrderTotals;
}

export interface PurchaseOrderCommitments {
  approvedEstimatePaise: number;
  committedPaise: number;
  committedGstPaise: number;
  committedTotalPaise: number;
  remainingPaise: number;
}

export interface PurchaseOrderPage { items: PurchaseOrder[]; total: number; limit: number; offset: number }

export interface PurchaseOrderPreparationBlocker { code: string; message: string; itemId?: string }
export interface PurchaseOrderPreparationItem {
  id: string;
  version: number;
  sourceSectionId: string | null;
  sourceLineItemKey: string | null;
  roomName: string | null;
  itemName: string;
  brand: string;
  uom: { id: string; code: string; name: string; decimalScale: number | null; status: string };
  vendor: { id: string; code: string; name: string; status: string; vendorType?: "execution" | "supplier" | null } | null;
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
export interface PurchaseOrderPreparation {
  projectId: string;
  orderDefaults?: { targetDate: string | null; deliveryLocation: string | null };
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

export interface PurchaseOrderRequestLineInput {
  procurementItemId: string;
  expectedVersion: number;
  gstBasisPoints: number;
  scopeType: PurchaseOrderScope;
  description: string;
  targetDate: string;
  deliveryLocation: string;
}
export interface PurchaseOrderRequestLine extends PurchaseOrderLine {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  allocatedWorkPaise: number;
  sectionLabel: string;
  sourceSectionId: string;
  sourceLineItemKey: string;
  roomName: string;
  itemName: string;
  brand: string;
  uomCode: string;
}
export interface ProjectPurchaseOrderRequest extends PurchaseOrderCommitments {
  id: string;
  projectId: string;
  projectName: string;
  requestNumber: string;
  status: "pending_approval" | "changes_requested" | "rejected" | "approved";
  version: number;
  revision: number;
  submittedRevisionId: string;
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  preparationDigest: string;
  totals: PurchaseOrderTotals;
  sectionTotals: Array<{ sectionId: string; label: string; totals: PurchaseOrderTotals }>;
  vendorTotals: Array<{ vendorId: string; code: string; name: string; terms: string; totals: PurchaseOrderTotals }>;
  approvedOrderIds: string[];
  decisions: Array<{ id: string; revisionId: string; revision: number; decision: "approve" | "request_changes" | "reject"; actorId: string; reason: string | null; budgetOverrideReason: string | null; decidedAt: string }>;
  revisions: Array<PurchaseOrderCommitments & { id: string; revision: number; submittedAt: string; submittedById: string; preparationDigest: string;
    lines: PurchaseOrderRequestLine[]; sectionTotals: ProjectPurchaseOrderRequest["sectionTotals"];
    vendorTotals: ProjectPurchaseOrderRequest["vendorTotals"]; totals: PurchaseOrderTotals }>;
  createdAt: string;
  updatedAt: string;
}
export interface PurchaseOrderRequestQuote extends PurchaseOrderCommitments {
  projectId: string;
  preparationDigest: string;
  estimateSource: ProjectPurchaseOrderRequest["estimateSource"];
  lines: PurchaseOrderRequestLine[];
  sectionTotals: ProjectPurchaseOrderRequest["sectionTotals"];
  vendorTotals: ProjectPurchaseOrderRequest["vendorTotals"];
  totals: PurchaseOrderTotals;
}
export interface ProjectPurchaseOrderRequestPage { items: ProjectPurchaseOrderRequest[]; total: number; limit: number; offset: number }

const path = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/purchase-orders`;
const orderPath = (projectId: string, orderId: string) => `${path(projectId)}/${encodeURIComponent(orderId)}`;

export const purchaseOrderKeys = {
  preparation: (projectId: string) => ["procurement", "purchase-order-preparation", projectId] as const,
  requests: (projectId: string) => ["procurement", "purchase-order-requests", projectId] as const,
  pendingRequests: ["admin", "purchase-order-requests", "pending"] as const,
  project: (projectId: string) => ["procurement", "purchase-orders", projectId] as const,
  commitments: (projectId: string) => ["procurement", "purchase-order-commitments", projectId] as const,
  pending: ["admin", "purchase-orders", "pending"] as const,
  vendorOrder: (orderId: string) => ["vendor", "purchase-order", orderId] as const
};

const requestPath = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/purchase-order-requests`;
export async function getPurchaseOrderPreparation(projectId: string, signal?: AbortSignal) {
  const result = await apiClient.get<PurchaseOrderPreparation>(`/procurement/projects/${encodeURIComponent(projectId)}/purchase-order-preparation`, { signal });
  if (result.projectId !== projectId) throw new Error("The purchase order preparation does not match this project. Refresh before continuing.");
  return result;
}
export async function listProjectPurchaseOrderRequests(projectId: string, offset = 0) {
  const page = await apiClient.get<ProjectPurchaseOrderRequestPage>(`${requestPath(projectId)}?limit=50&offset=${offset}`);
  if (page.items.some((request) => request.projectId !== projectId)) throw new Error("The purchase order request list does not match this project.");
  return page;
}
export function getProjectPurchaseOrderRequest(projectId: string, requestId: string) {
  return apiClient.get<ProjectPurchaseOrderRequest>(`${requestPath(projectId)}/${encodeURIComponent(requestId)}`);
}
export function submitProjectPurchaseOrderRequest(projectId: string, input: {
  expectedPreparationDigest: string;
  expectedRequestVersion?: number;
  lines: PurchaseOrderRequestLineInput[];
  vendorTerms: Array<{ vendorId: string; terms: string }>;
  idempotencyKey: string;
}) {
  return apiClient.post<ProjectPurchaseOrderRequest>(requestPath(projectId), input);
}
export function quoteProjectPurchaseOrderRequest(projectId: string, input: {
  expectedPreparationDigest: string;
  lines: PurchaseOrderRequestLineInput[];
  vendorTerms: Array<{ vendorId: string; terms: string }>;
}) {
  return apiClient.post<PurchaseOrderRequestQuote>(`${requestPath(projectId)}/quote`, input);
}
export function getPendingProjectPurchaseOrderRequests(offset = 0) {
  return apiClient.get<ProjectPurchaseOrderRequestPage>(`/admin/purchase-order-requests/pending?limit=50&offset=${offset}`);
}
export function decideProjectPurchaseOrderRequest(request: ProjectPurchaseOrderRequest, input: {
  decision: "approve" | "request_changes" | "reject";
  reason: string | null;
  budgetOverrideReason: string | null;
  idempotencyKey: string;
}) {
  return apiClient.post<ProjectPurchaseOrderRequest>(`/admin/purchase-order-requests/${encodeURIComponent(request.id)}/decision`, {
    expectedVersion: request.version, submittedRevisionId: request.submittedRevisionId, ...input
  });
}

export async function listPurchaseOrders(projectId: string, offset = 0): Promise<PurchaseOrderPage> {
  const page = await apiClient.get<PurchaseOrderPage>(`${path(projectId)}?limit=50&offset=${offset}`);
  if (page.items.some((order) => order.projectId !== projectId)) throw new Error("The purchase order list does not match this project. Refresh before continuing.");
  return page;
}

export const getPurchaseOrderCommitments = (projectId: string) => apiClient.get<PurchaseOrderCommitments>(`/procurement/projects/${encodeURIComponent(projectId)}/purchase-order-commitments`);
export const getPendingPurchaseOrders = (offset = 0) => apiClient.get<PurchaseOrderPage>(`/admin/purchase-orders/pending?limit=50&offset=${offset}`);
export const getVendorPurchaseOrder = (orderId: string) => apiClient.get<VendorPurchaseOrder>(`/vendor/purchase-orders/${encodeURIComponent(orderId)}`);

export function createPurchaseOrder(projectId: string, input: { vendorId: string; lines: PurchaseOrderLineInput[]; terms: string; idempotencyKey: string }) {
  return apiClient.post<PurchaseOrder>(path(projectId), input);
}
export function updatePurchaseOrder(projectId: string, orderId: string, input: { lines: PurchaseOrderLineInput[]; terms: string; expectedVersion: number; idempotencyKey: string }) {
  return apiClient.patch<PurchaseOrder>(orderPath(projectId, orderId), input);
}
export function submitPurchaseOrder(projectId: string, orderId: string, expectedVersion: number, idempotencyKey: string) {
  return apiClient.post<PurchaseOrder>(`${orderPath(projectId, orderId)}/submit`, { expectedVersion, idempotencyKey });
}
export function decidePurchaseOrder(order: PurchaseOrder, input: { decision: "approve" | "request_changes" | "reject"; reason: string | null; budgetOverrideReason: string | null; idempotencyKey: string }) {
  if (!order.submittedRevisionId) throw new Error("The submitted revision is unavailable. Refresh this order.");
  return apiClient.post<PurchaseOrder>(`${orderPath(order.projectId, order.id)}/decision`, {
    expectedVersion: order.version, submittedRevisionId: order.submittedRevisionId, ...input
  });
}
export function amendPurchaseOrder(order: PurchaseOrder, reason: string, idempotencyKey: string) {
  return apiClient.post<PurchaseOrder>(`${orderPath(order.projectId, order.id)}/amend`, { expectedVersion: order.version, reason, idempotencyKey });
}
export function cancelPurchaseOrder(order: PurchaseOrder, reason: string, idempotencyKey: string) {
  return apiClient.post<PurchaseOrder>(`${orderPath(order.projectId, order.id)}/cancel`, { expectedVersion: order.version, reason, idempotencyKey });
}
