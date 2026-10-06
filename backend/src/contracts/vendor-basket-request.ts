export type VendorBasketRequestStatus = "pending" | "fulfilled" | "rejected";

export interface VendorBasketRequestDto {
  readonly id: string;
  readonly requesterId: string;
  readonly vendorId: string | null;
  readonly vendorName: string;
  readonly proposedName: string;
  readonly status: VendorBasketRequestStatus;
  readonly version: number;
  readonly basketId: string | null;
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

export interface DecideVendorBasketRequestInput {
  readonly decision: "fulfill" | "reject";
  readonly expectedVersion: number;
  readonly reason?: string | null;
  readonly idempotencyKey: string;
}
