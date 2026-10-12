import type { ProposalTarget } from "./vendor-basket-proposal.js";
import type { VendorBasketRequestDto, VendorBasketRequestStatus } from "./vendor-basket-request.js";

export interface VendorBasketRequestNotificationDto {
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

export interface VendorBasketRequestNotificationPage {
  items: VendorBasketRequestNotificationDto[];
  unreadCount: number;
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

export interface SubmittedBasketNotificationInput {
  request: VendorBasketRequestDto;
  requester: { id: string; name: string };
}
