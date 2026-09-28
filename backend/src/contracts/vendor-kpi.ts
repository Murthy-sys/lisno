import type { VendorKpiVendorType } from "../domain/vendor-kpi.js";

export interface VendorKpiCategoryScore { readonly key: string; readonly score: number }
export interface VendorKpiAssessment {
  readonly id: string; readonly vendorId: string; readonly source: "vendor_self" | "procurement";
  readonly vendorType: VendorKpiVendorType; readonly rubricVersion: number;
  readonly scores: readonly VendorKpiCategoryScore[]; readonly averageScoreBps: number;
  readonly revision: number; readonly comment: string | null; readonly submittedAt: string;
}
export type VendorKpiRequestDeliveryStatus = "pending" | "sent" | "failed" | "expired" | "superseded" | "consumed";
export interface VendorKpiRequestView {
  readonly status: VendorKpiRequestDeliveryStatus; readonly version: number;
  readonly requestedAt: string; readonly expiresAt: string;
  readonly sentAt: string | null; readonly canResendAt: string | null;
}
export type VendorKpiRequestEligibility = "ready" | "self_submitted" | "pending" | "cooldown" | "missing_profile" | "archived";
export interface VendorKpiDirectorySummary {
  readonly status: "not_rated" | "rated"; readonly officialScoreBps: number | null;
  readonly selfStatus: "not_submitted" | "submitted";
}
export interface VendorKpiStaffVendor {
  readonly id: string; readonly code: string; readonly name: string;
  readonly status: "active" | "inactive" | "archived";
  readonly vendorType: VendorKpiVendorType | null; readonly workProfile: string | null;
  readonly mainBasketNames: readonly string[]; readonly subBasketNames: readonly string[];
  readonly emailAvailable: boolean;
}
export interface VendorKpiStaffDetail {
  readonly vendor: VendorKpiStaffVendor; readonly rubricVersion: number;
  readonly selfAssessment: VendorKpiAssessment | null; readonly procurementAssessment: VendorKpiAssessment | null;
  readonly officialScoreBps: number | null; readonly request: VendorKpiRequestView | null;
  readonly requestEligibility: VendorKpiRequestEligibility;
}
export interface VendorKpiSaveInput {
  readonly rubricVersion: number; readonly expectedRevision: number | null; readonly idempotencyKey: string;
  readonly scores: readonly VendorKpiCategoryScore[]; readonly comment?: string | null;
}
export interface VendorKpiRequestInput { readonly idempotencyKey: string; readonly expectedRequestVersion: number | null }
export interface VendorKpiPublicInspection {
  readonly vendor: { readonly name: string; readonly code: string; readonly vendorType: VendorKpiVendorType;
    readonly workProfile: string; readonly mainBasketNames: readonly string[]; readonly subBasketNames: readonly string[] };
  readonly rubricVersion: number; readonly expiresAt: string;
}
export interface VendorKpiPublicSubmitInput {
  readonly token: string; readonly rubricVersion: number; readonly idempotencyKey: string;
  readonly scores: readonly VendorKpiCategoryScore[]; readonly comment?: string | null;
}
export interface VendorKpiSubmissionReceipt { readonly submittedAt: string; readonly averageScoreBps: number }
