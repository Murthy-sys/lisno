import { z } from "zod";

const idempotencyKey = z.string().trim().min(8).max(128);
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);

export const siteCompletionProgressSchema = z.object({
  expectedVersion: version,
  idempotencyKey,
  progress: z.number().int().min(0).max(100),
  note: z.string().trim().max(2_000).default("")
}).strict();

export const siteCompletionSubmitSchema = z.object({
  expectedVersion: version,
  idempotencyKey,
  note: z.string().trim().max(2_000)
}).strict();

export const siteCompletionDecisionSchema = z.object({
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey,
  decision: z.enum(["approve", "request_changes"]),
  reason: z.string().trim().max(2_000).nullable().default(null)
}).strict().superRefine((input, context) => {
  if (input.decision === "request_changes" && !input.reason) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["reason"], message: "Describe the changes needed."
  });
});

export type SiteCompletionProgressInput = z.infer<typeof siteCompletionProgressSchema>;
export type SiteCompletionSubmitInput = z.infer<typeof siteCompletionSubmitSchema>;
export type SiteCompletionDecisionInput = z.infer<typeof siteCompletionDecisionSchema>;
export type SiteCompletionStatus = "draft" | "pending_client" | "changes_requested" | "client_approved";

export interface SiteCompletionSection {
  assignmentId: string;
  sourceSectionId: string;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: string;
  imageIds: string[];
}

export interface SiteCompletionReviewDto {
  id: string;
  projectId: string;
  round: number;
  version: number;
  status: "pending" | "approved" | "changes_requested";
  progress: number;
  note: string;
  submittedAt: string;
  sections: SiteCompletionSection[];
  decision: { decision: "approve" | "request_changes"; reason: string | null; decidedAt: string } | null;
}

export interface SiteCompletionDto {
  projectId: string;
  projectStatus: string;
  version: number;
  progress: number;
  note: string;
  status: SiteCompletionStatus;
  currentRound: number;
  canSubmit: boolean;
  needsReverification: boolean;
  blockers: string[];
  review: SiteCompletionReviewDto | null;
}
