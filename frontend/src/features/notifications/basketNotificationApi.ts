import { apiClient, type Pagination } from "../../api/client";
import type { VendorBasketRequestStatus } from "../procurement/vendorBasketRequestApi";
import type { ProposalTarget } from "../vendor-basket-proposals/proposalTypes";

export interface BasketRequestNotification {
  id: string;
  type: "basket_request.submitted";
  requestId: string;
  proposalId: string | null;
  target: ProposalTarget;
  targetParentName: string | null;
  proposedName: string;
  vendorName: string | null;
  requester: { id: string; name: string };
  status: VendorBasketRequestStatus;
  createdAt: string;
  readAt: string | null;
}
export interface BasketNotificationPage {
  items: BasketRequestNotification[];
  unreadCount: number;
  pagination: Pagination;
}
const base = "/admin/ai-estimator-knowledge/basket-request-notifications";
export const basketNotificationKeys = {
  root: (scope: string) => ["basket-request-notifications", scope] as const,
  page: (scope: string, offset = 0) => ["basket-request-notifications", scope, offset] as const
};
export const basketNotificationApi = {
  list: (offset = 0, signal?: AbortSignal): Promise<BasketNotificationPage> => apiClient.get(`${base}?limit=20&offset=${offset}`, { signal, showGlobalLoader: false }),
  read: (id: string, signal?: AbortSignal): Promise<BasketRequestNotification> => apiClient.put(`${base}/${encodeURIComponent(id)}/read`, {}, { signal, showGlobalLoader: false })
};
export const basketNotificationPath = (item: BasketRequestNotification) => `/admin/configuration/estimation?basketRequests=pending&basketRequestId=${encodeURIComponent(item.requestId)}`;
export const basketNotificationTitle = (item: BasketRequestNotification) => `${item.target.kind === "new_sub_basket" ? "Sub-Basket" : "Main Basket"} request: ${item.proposedName}`;
