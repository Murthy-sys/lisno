/** Shared public API shapes. Backend validates and calculates scores authoritatively. */
export const VENDOR_KPI_RUBRIC_VERSION = 1 as const;

export const VENDOR_KPI_RUBRICS = {
  execution: [
    { key: "timeline", label: "Timeline" },
    { key: "quality", label: "Quality" },
    { key: "budget", label: "Budget" },
    { key: "site_discipline", label: "Site discipline (reports and people on time)" }
  ],
  supplier: [
    { key: "rates_offered", label: "Rates offered" },
    { key: "service_communication", label: "Service communication" },
    { key: "delivery_coordination", label: "Delivery coordination" },
    { key: "defect_liability_addressal", label: "Defect liability addressal" },
    { key: "commitment_to_timelines", label: "Commitment to timelines" }
  ]
} as const;

export type VendorKpiVendorType = keyof typeof VENDOR_KPI_RUBRICS;
export type VendorKpiCategoryKey =
  (typeof VENDOR_KPI_RUBRICS)[VendorKpiVendorType][number]["key"];
export type VendorKpiSource = "vendor_self" | "procurement";

export interface VendorKpiCategoryScore {
  readonly key: VendorKpiCategoryKey;
  /** Required integer from 0 through 100. */
  readonly score: number;
}

export interface VendorKpiAssessment {
  readonly id: string;
  readonly vendorId: string;
  readonly source: VendorKpiSource;
  readonly vendorType: VendorKpiVendorType;
  readonly rubricVersion: number;
  readonly scores: readonly VendorKpiCategoryScore[];
  /** Hundredths of a score point; 9050 means 90.50/100. */
  readonly averageScoreBps: number;
  readonly revision: number;
  readonly comment: string | null;
  readonly submittedAt: string;
}

export type VendorKpiRequestDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "expired"
  | "superseded"
  | "consumed";

export interface VendorKpiRequestView {
  readonly status: VendorKpiRequestDeliveryStatus;
  readonly version: number;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly sentAt: string | null;
  readonly canResendAt: string | null;
}

export type VendorKpiRequestEligibility =
  | "ready"
  | "self_submitted"
  | "pending"
  | "cooldown"
  | "missing_profile"
  | "archived";

export interface VendorKpiDirectorySummary {
  readonly status: "not_rated" | "rated";
  readonly officialScoreBps: number | null;
  readonly selfStatus: "not_submitted" | "submitted";
}

export interface VendorKpiStaffVendor {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: "active" | "inactive" | "archived";
  readonly vendorType: VendorKpiVendorType | null;
  readonly workProfile: string | null;
  readonly mainBasketNames: readonly string[];
  readonly subBasketNames: readonly string[];
  readonly emailAvailable: boolean;
}

export interface VendorKpiStaffDetail {
  readonly vendor: VendorKpiStaffVendor;
  readonly rubricVersion: number;
  readonly selfAssessment: VendorKpiAssessment | null;
  readonly procurementAssessment: VendorKpiAssessment | null;
  readonly officialScoreBps: number | null;
  readonly request: VendorKpiRequestView | null;
  readonly requestEligibility: VendorKpiRequestEligibility;
}

export interface VendorKpiSaveInput {
  readonly rubricVersion: number;
  readonly expectedRevision: number | null;
  readonly idempotencyKey: string;
  readonly scores: readonly VendorKpiCategoryScore[];
  readonly comment?: string | null;
}

export interface VendorKpiRequestInput {
  readonly idempotencyKey: string;
  readonly expectedRequestVersion: number | null;
}

export interface VendorKpiPublicVendor {
  readonly name: string;
  readonly code: string;
  readonly vendorType: VendorKpiVendorType;
  readonly workProfile: string;
  readonly mainBasketNames: readonly string[];
  readonly subBasketNames: readonly string[];
}

export interface VendorKpiPublicInspection {
  readonly vendor: VendorKpiPublicVendor;
  readonly rubricVersion: number;
  readonly expiresAt: string;
}

export interface VendorKpiPublicSubmitInput {
  readonly token: string;
  readonly rubricVersion: number;
  readonly idempotencyKey: string;
  readonly scores: readonly VendorKpiCategoryScore[];
  readonly comment?: string | null;
}

export interface VendorKpiSubmissionReceipt {
  readonly submittedAt: string;
  readonly averageScoreBps: number;
}
