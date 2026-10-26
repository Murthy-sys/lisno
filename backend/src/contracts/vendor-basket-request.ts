import type { ProposalRequestMode, ProposalTarget } from "./vendor-basket-proposal.js";
export type VendorBasketRequestStatus = "pending" | "fulfilled" | "rejected";

export interface VendorBasketRequestDto {
  readonly requestMode?: ProposalRequestMode;
  readonly target?: ProposalTarget;
  readonly targetParentName?: string | null;
  readonly id: string;
  readonly kind?: "configuration_proposal" | "configuration_sub_basket";
  readonly description?: string | null;
  readonly proposalId?: string;
  readonly proposalCounts?: { readonly subBaskets: number; readonly mainLines: number };
  readonly requesterId: string;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly proposedName: string;
  readonly status: VendorBasketRequestStatus;
  readonly version: number;
  readonly basketId: string | null;
  readonly subBasketId: string | null;
  readonly mainLineId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly decidedById: string | null;
}

export interface CreateVendorBasketRequestInput {
  readonly vendorId?: string | null;
  readonly vendorName: string;
  readonly proposedName: string;
  readonly idempotencyKey: string;
}

export interface CreateConfigurationSubBasketRequestInput {
  readonly basketId: string;
  readonly name: string;
  readonly description: string;
  readonly idempotencyKey: string;
}

export interface DecideVendorBasketRequestInput {
  readonly decision: "fulfill" | "reject";
  readonly expectedVersion: number;
  readonly reason?: string | null;
  readonly idempotencyKey: string;
  readonly configuration?: VendorBasketRequestConfiguration;
}

export interface VendorBasketRequestConfiguration {
  readonly subBasketId?: string;
  readonly subBasketName?: string;
  readonly mainLineName?: string;
}
