import type { VendorKpiPublicInspection } from "./vendor-kpi.js";
import type { VendorKpiVendorType } from "../domain/vendor-kpi.js";

export type VendorLifecycleStatus = "active" | "inactive" | "archived";
export type VendorEffectiveStatus = "active" | "under_review" | "inactive" | "archived";
export interface VendorActivation {
  readonly lifecycleStatus: VendorLifecycleStatus;
  readonly effectiveStatus: VendorEffectiveStatus;
  readonly gates: { readonly inductionApproved: boolean; readonly vendorSelfKpiComplete: boolean;
    readonly procurementKpiComplete: boolean; readonly profileComplete: boolean; readonly physicalAddressVerified: boolean };
}
export type VendorInductionAnswerType = "short_text" | "paragraph" | "number" | "yes_no" | "single_choice" | "multi_choice";
export interface VendorInductionOption { readonly id: string; readonly label: string }
export interface VendorInductionCondition { readonly questionId: string; readonly optionIds: readonly string[] }
export interface VendorInductionQuestion { readonly id: string; readonly key: string; readonly section: string; readonly prompt: string;
  readonly helpText: string | null; readonly type: VendorInductionAnswerType; readonly required: boolean; readonly enabled: boolean;
  readonly options: readonly VendorInductionOption[]; readonly unit: string | null; readonly min: number | null;
  readonly max: number | null; readonly showIf: VendorInductionCondition | null }
export interface VendorInductionQuestionnaire { readonly id: string; readonly version: number; readonly vendorType: VendorKpiVendorType;
  readonly questions: readonly VendorInductionQuestion[]; readonly publishedAt: string }
export interface VendorInductionDraft { readonly version: number; readonly vendorType: VendorKpiVendorType;
  readonly questions: readonly VendorInductionQuestion[]; readonly updatedAt: string }
export interface VendorInductionAnswer { readonly questionId: string; readonly value: string | number | boolean | readonly string[] }
export interface VendorInductionSubmission { readonly id: string; readonly requestId: string; readonly questionnaireVersion: number;
  readonly questionnaire: VendorInductionQuestionnaire; readonly answers: readonly VendorInductionAnswer[]; readonly submittedAt: string }
export interface VendorInductionReview { readonly id: string; readonly submissionId: string;
  readonly decision: "approved" | "changes_requested" | "reopened"; readonly reason: string | null;
  readonly actorId: string; readonly reviewedAt: string; readonly version: number }
export type VendorInductionDeliveryStatus = "pending" | "sent" | "failed" | "expired" | "superseded" | "consumed";
export interface VendorInductionRequestView { readonly status: VendorInductionDeliveryStatus; readonly version: number;
  readonly requestedAt: string; readonly expiresAt: string; readonly sentAt: string | null; readonly canResendAt: string | null }
export type VendorInductionRequestEligibility = "ready" | "no_published_questionnaire" | "missing_profile" |
  "pending" | "cooldown" | "awaiting_review" | "approved" | "archived";
export interface VendorInductionStaffDetail { readonly vendor: { readonly id: string; readonly name: string;
    readonly vendorType: VendorKpiVendorType | null; readonly emailAvailable: boolean };
  readonly activation: VendorActivation; readonly draft: VendorInductionDraft | null;
  readonly published: VendorInductionQuestionnaire | null; readonly request: VendorInductionRequestView | null;
  readonly requestEligibility: VendorInductionRequestEligibility; readonly submission: VendorInductionSubmission | null;
  readonly review: VendorInductionReview | null; readonly history: { readonly submissions: readonly VendorInductionSubmission[];
    readonly reviews: readonly VendorInductionReview[] } }
export interface VendorInductionDraftSaveInput { readonly expectedVersion: number | null; readonly idempotencyKey: string;
  readonly vendorType: VendorKpiVendorType; readonly questions: readonly VendorInductionQuestion[] }
export interface VendorInductionPublishInput { readonly expectedDraftVersion: number; readonly idempotencyKey: string }
export interface VendorInductionRequestInput { readonly expectedRequestVersion: number | null; readonly idempotencyKey: string }
export interface VendorInductionReviewInput { readonly submissionId: string; readonly decision: "approved" | "changes_requested";
  readonly reason: string | null; readonly expectedReviewVersion: number | null; readonly idempotencyKey: string }
export interface VendorInductionReopenInput { readonly reason: string; readonly expectedReviewVersion: number;
  readonly idempotencyKey: string }
export interface VendorInductionPublicInspection { readonly vendor: VendorKpiPublicInspection["vendor"];
  readonly questionnaire: VendorInductionQuestionnaire; readonly changeNote: string | null; readonly expiresAt: string }
export interface VendorInductionPublicSubmitInput { readonly token: string; readonly idempotencyKey: string;
  readonly answers: readonly VendorInductionAnswer[] }
export interface VendorInductionSubmissionReceipt { readonly submittedAt: string }
