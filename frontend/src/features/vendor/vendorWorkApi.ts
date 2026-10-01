import { apiClient } from "../../api/client";

export type VendorWorkStatus = "awaiting_vendor_access" | "ready" | "in_progress" | "submitted_for_client" | "changes_requested" | "client_approved" | "superseded";

export interface VendorWorkTask {
  id: string;
  projectId: string;
  vendorId: string;
  orderId: string;
  orderRevision: number;
  lineId: string;
  sourceSectionId: string;
  sourceLineItemKey: string;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: "supply" | "execution" | "supply_and_execution";
  description: string;
  targetDate: string;
  deliveryLocation: string;
  status: VendorWorkStatus;
  version: number;
  progress: number;
  displayProgress: number;
  progressSource: "vendor" | "site_manager";
  currentRound: number;
  note: string;
  requestedChangeReason: string | null;
  imageCount: number;
  submittedAt: string | null;
  acceptedAt: string | null;
}

export interface VendorWorkReview {
  id: string;
  projectId: string;
  assignmentId: string;
  round: number;
  status: "pending" | "approved" | "changes_requested";
  version: number;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: VendorWorkTask["scopeType"];
  description: string;
  sourceSectionId: string;
  note: string;
  progress: number;
  submittedAt: string;
  imageIds: string[];
  decision: { decision: "approve" | "request_changes"; reason: string | null; decidedAt: string } | null;
}

export const vendorWorkKeys = {
  all: ["vendor", "work"] as const,
  detail: (assignmentId: string) => ["vendor", "work", assignmentId] as const
};

const path = (assignmentId: string) => `/vendor/work/${encodeURIComponent(assignmentId)}`;

export interface VendorWorkPageData { items: VendorWorkTask[]; total: number; limit: number; offset: number }
export const getVendorWork = (offset = 0) => apiClient.get<VendorWorkPageData>(`/vendor/work?limit=50&offset=${offset}`);
export const getVendorWorkDetail = (assignmentId: string) => apiClient.get<VendorWorkTask>(path(assignmentId));
export const updateVendorWorkProgress = (task: VendorWorkTask, progress: number, note: string, idempotencyKey: string) =>
  apiClient.patch<VendorWorkTask>(`${path(task.id)}/progress`, { expectedVersion: task.version, idempotencyKey, progress, note });
export function uploadVendorWorkImage(task: VendorWorkTask, file: File, idempotencyKey: string) {
  const form = new FormData();
  form.append("image", file);
  form.append("expectedVersion", String(task.version));
  form.append("idempotencyKey", idempotencyKey);
  return apiClient.postMultipart<VendorWorkTask>(`${path(task.id)}/images`, form);
}
export const submitVendorWork = (task: VendorWorkTask, note: string, idempotencyKey: string) =>
  apiClient.post<VendorWorkReview>(`${path(task.id)}/submit`, { expectedVersion: task.version, idempotencyKey, note });
