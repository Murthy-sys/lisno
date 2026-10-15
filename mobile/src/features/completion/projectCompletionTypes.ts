export type ProjectScopeExceptionKind = "not_applicable" | "externally_fulfilled";
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
  code: "ORDER_PENDING" | "NO_APPROVED_ORDER" | "SCOPE_UNCOVERED" | "VENDOR_WORK_PENDING" | "CLIENT_REVIEW_PENDING" | "SITE_COMPLETION_PENDING" | "EXECUTION_VERIFICATION_PENDING" | "PROJECT_NOT_ACTIVE";
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
