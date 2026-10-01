import { z } from "zod";

const positiveVersion = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const idempotencyKey = z.string().trim().min(8).max(128);
export const projectScopeExceptionSchema = z.object({
  sourceLineItemKey: z.string().trim().min(1).max(500),
  kind: z.enum(["not_applicable", "externally_fulfilled"]),
  reason: z.string().trim().min(10).max(2_000),
  expectedAuthorityVersion: positiveVersion,
  idempotencyKey
}).strict();
export const projectCompletionSchema = z.object({ expectedAuthorityVersion: positiveVersion, idempotencyKey }).strict();
export const projectCompletionQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();

export type ProjectScopeExceptionInput = z.infer<typeof projectScopeExceptionSchema>;
export type ProjectCompletionInput = z.infer<typeof projectCompletionSchema>;
export type ProjectScopeExceptionKind = ProjectScopeExceptionInput["kind"];

export interface ProjectScopeCoverage {
  sourceLineItemKey: string;
  sourceSectionId: string;
  roomName: string;
  specification: string;
  amountPaise: number;
  approvedOrderLineCount: number;
  exception: { id: string; kind: ProjectScopeExceptionKind; reason: string } | null;
  status: "approved_order" | "exception" | "not_required" | "uncovered";
}

export interface ProjectCompletionBlocker {
  code: "ORDER_PENDING" | "NO_APPROVED_ORDER" | "SCOPE_UNCOVERED" | "VENDOR_WORK_PENDING" | "CLIENT_REVIEW_PENDING" | "SITE_COMPLETION_PENDING" | "PROJECT_NOT_ACTIVE";
  message: string;
  sourceLineItemKey?: string;
}

export interface ProjectCompletionSummary {
  projectId: string;
  projectName: string;
  projectStatus: string;
  completionAuthority: "vendor_client";
  completionAuthorityVersion: number;
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  scope: ProjectScopeCoverage[];
  approvedOrders: Array<{ orderId: string; revisionId: string; revision: number; lineCount: number; netPaise: number; gstPaise: number; totalPaise: number }>;
  vendorWork: { totalAssignments: number; approvedAssignments: number; pendingAssignments: number; openReviews: number };
  siteCompletion?: { status: "draft" | "pending_client" | "changes_requested" | "client_approved"; progress: number; round: number; reviewId: string | null } | null;
  blockers: ProjectCompletionBlocker[];
  pendingOwner: "procurement" | "super_admin" | "site_manager" | "vendor" | "client" | "none";
  readyForCompletion: boolean;
  completedAt: string | null;
  completionDecisionId: string | null;
}
