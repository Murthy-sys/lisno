// Mirrored from the current web API contract.
export interface SiteCompletionSection {
  assignmentId: string;
  sourceSectionId: string;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: string | null;
  imageIds: string[];
}

export interface SiteCompletionReview {
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

export interface SiteCompletion {
  projectId: string;
  projectStatus: string;
  version: number;
  progress: number;
  note: string;
  status: "draft" | "pending_client" | "changes_requested" | "client_approved";
  currentRound: number;
  canSubmit: boolean;
  needsReverification: boolean;
  blockers: string[];
  review: SiteCompletionReview | null;
}
