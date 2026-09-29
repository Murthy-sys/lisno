import type { VendorKpiPublicVendor, VendorKpiVendorType } from "./vendorKpi";

/** Staff lifecycle and onboarding readiness have different meanings. */
export type VendorLifecycleStatus = "active" | "inactive" | "archived";
export type VendorEffectiveStatus = "active" | "under_review" | "inactive" | "archived";

export interface VendorActivation {
  readonly lifecycleStatus: VendorLifecycleStatus;
  readonly effectiveStatus: VendorEffectiveStatus;
  readonly gates: {
    readonly inductionApproved: boolean;
    readonly vendorSelfKpiComplete: boolean;
    readonly procurementKpiComplete: boolean;
    readonly profileComplete: boolean;
    readonly physicalAddressVerified: boolean;
  };
}

export type VendorInductionAnswerType = "short_text" | "paragraph" | "number" | "yes_no" | "single_choice" | "multi_choice";
export interface VendorInductionOption { readonly id: string; readonly label: string }
export interface VendorInductionCondition {
  /** Must refer to an earlier yes/no or choice question in this questionnaire. */
  readonly questionId: string;
  /** yes/no questions use the stable option IDs `yes` and `no`. */
  readonly optionIds: readonly string[];
}
export interface VendorInductionQuestion {
  readonly id: string;
  readonly key: string;
  readonly section: string;
  readonly prompt: string;
  readonly helpText: string | null;
  readonly type: VendorInductionAnswerType;
  readonly required: boolean;
  readonly enabled: boolean;
  readonly options: readonly VendorInductionOption[];
  readonly unit: string | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly showIf: VendorInductionCondition | null;
}

export interface VendorInductionQuestionnaire {
  readonly id: string;
  readonly version: number;
  readonly vendorType: VendorKpiVendorType;
  readonly questions: readonly VendorInductionQuestion[];
  readonly publishedAt: string;
}
export interface VendorInductionDraft {
  readonly version: number;
  readonly vendorType: VendorKpiVendorType;
  readonly questions: readonly VendorInductionQuestion[];
  readonly updatedAt: string;
}
export interface VendorInductionAnswer {
  readonly questionId: string;
  readonly value: string | number | boolean | readonly string[];
}
export interface VendorInductionSubmission {
  readonly id: string;
  readonly requestId: string;
  readonly questionnaireVersion: number;
  readonly questionnaire: VendorInductionQuestionnaire;
  readonly answers: readonly VendorInductionAnswer[];
  readonly submittedAt: string;
}
export interface VendorInductionReview {
  readonly id: string;
  readonly submissionId: string;
  readonly decision: "approved" | "changes_requested" | "reopened";
  readonly reason: string | null;
  readonly actorId: string;
  readonly reviewedAt: string;
  readonly version: number;
}
export type VendorInductionDeliveryStatus = "pending" | "sent" | "failed" | "expired" | "superseded" | "consumed";
export interface VendorInductionRequestView {
  readonly status: VendorInductionDeliveryStatus;
  readonly version: number;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly sentAt: string | null;
  readonly canResendAt: string | null;
}
export type VendorInductionRequestEligibility = "ready" | "no_published_questionnaire" | "missing_profile" | "pending" | "cooldown" | "awaiting_review" | "approved" | "archived";

export interface VendorInductionStaffDetail {
  readonly vendor: {
    readonly id: string;
    readonly name: string;
    readonly vendorType: VendorKpiVendorType | null;
    readonly emailAvailable: boolean;
  };
  readonly activation: VendorActivation;
  readonly draft: VendorInductionDraft | null;
  readonly published: VendorInductionQuestionnaire | null;
  readonly request: VendorInductionRequestView | null;
  readonly requestEligibility: VendorInductionRequestEligibility;
  readonly submission: VendorInductionSubmission | null;
  readonly review: VendorInductionReview | null;
  readonly history: {
    readonly submissions: readonly VendorInductionSubmission[];
    readonly reviews: readonly VendorInductionReview[];
  };
}

export interface VendorInductionDraftSaveInput {
  readonly expectedVersion: number | null;
  readonly idempotencyKey: string;
  readonly vendorType: VendorKpiVendorType;
  readonly questions: readonly VendorInductionQuestion[];
}
export interface VendorInductionPublishInput {
  readonly expectedDraftVersion: number;
  readonly idempotencyKey: string;
}
export interface VendorInductionRequestInput {
  readonly expectedRequestVersion: number | null;
  readonly idempotencyKey: string;
}
export interface VendorInductionReviewInput {
  readonly submissionId: string;
  readonly decision: "approved" | "changes_requested";
  readonly reason: string | null;
  readonly expectedReviewVersion: number | null;
  readonly idempotencyKey: string;
}
export interface VendorInductionReopenInput {
  readonly reason: string;
  readonly expectedReviewVersion: number;
  readonly idempotencyKey: string;
}

export interface VendorInductionPublicInspection {
  readonly vendor: VendorKpiPublicVendor;
  readonly questionnaire: VendorInductionQuestionnaire;
  readonly changeNote: string | null;
  readonly expiresAt: string;
}
export interface VendorInductionPublicSubmitInput {
  readonly token: string;
  readonly idempotencyKey: string;
  readonly answers: readonly VendorInductionAnswer[];
}
export interface VendorInductionSubmissionReceipt {
  readonly submittedAt: string;
}

export function vendorInductionQuestionVisible(question: VendorInductionQuestion, answers: readonly VendorInductionAnswer[]): boolean {
  if (!question.showIf) return true;
  const answer = answers.find(entry => entry.questionId === question.showIf!.questionId)?.value;
  if (answer === undefined) return false;
  const selected = Array.isArray(answer) ? answer : typeof answer === "boolean" ? [answer ? "yes" : "no"] : [String(answer)];
  return selected.some(value => question.showIf!.optionIds.includes(value));
}

/** Editable starting questions; copying them into a vendor draft never publishes them. */
export function vendorInductionStarterQuestions(vendorType: VendorKpiVendorType): VendorInductionQuestion[] {
  const question = (id: string, section: string, prompt: string, type: VendorInductionAnswerType, options: readonly string[] = [],
    settings: Partial<Pick<VendorInductionQuestion, "unit" | "min" | "max" | "showIf" | "required">> = {}): VendorInductionQuestion => ({
    id, key: id, section, prompt, helpText: null, type, required: settings.required ?? true, enabled: true,
    options: options.map((label, index) => ({ id: `${id}-option-${index + 1}`, label })),
    unit: settings.unit ?? null, min: settings.min ?? null, max: settings.max ?? null, showIf: settings.showIf ?? null
  });
  const common = [
    question("experience_years", "Capability", "How many years have you delivered commercial interior projects?", "number", [], { unit: "years", min: 0, max: 100 }),
    question("comparable_projects", "Capability", "Describe up to three comparable completed projects, including your scope and completion year.", "paragraph"),
    question("concurrent_sites", "Capacity and delivery", "How many interior projects can your team support at the same time?", "number", [], { unit: "projects", min: 0, max: 100 }),
    question("mobilization_days", "Capacity and delivery", "How many days do you normally need to mobilize after an order is confirmed?", "number", [], { unit: "days", min: 0, max: 365 }),
    question("quality_process", "Quality and defects", "Describe your sample approval, quality inspection, and snag-closing process.", "paragraph"),
    question("defects_months", "Quality and defects", "What defects-liability period do you normally provide?", "number", [], { unit: "months", min: 0, max: 120 }),
    question("subcontracts", "Delivery controls", "Will you subcontract any part of the work?", "yes_no"),
    question("subcontracts_detail", "Delivery controls", "Describe the work you expect to subcontract and how you supervise it.", "paragraph", [],
      { showIf: { questionId: "subcontracts", optionIds: ["yes"] } })
  ];
  const specific = vendorType === "execution" ? [
    question("trained_crew", "Site capacity", "How many trained site workers can you mobilize for a typical project?", "number", [], { unit: "workers", min: 1, max: 10_000 }),
    question("site_supervisor", "Site capacity", "Will a named supervisor be present during your site work?", "yes_no"),
    question("site_safety", "Site safety", "Describe your PPE, worker induction, and incident-escalation process.", "paragraph"),
    question("worker_cover", "Site safety", "Do you hold worker cover or insurance relevant to the work you undertake?", "yes_no")
  ] : [
    question("standard_lead_days", "Supply reliability", "What is the standard delivery lead time after a confirmed order?", "number", [], { unit: "days", min: 0, max: 365 }),
    question("product_traceability", "Supply reliability", "How do you provide product specifications, certifications, and batch traceability?", "paragraph"),
    question("replacement_process", "Supply reliability", "Describe your damaged-item replacement and warranty process.", "paragraph"),
    question("replacement_days", "Supply reliability", "Within how many days can you usually replace a defective item?", "number", [], { unit: "days", min: 0, max: 365 })
  ];
  return [...common, ...specific];
}
