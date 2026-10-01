/** Safe source for the separate Client acknowledgement; it never finalizes Design approval. */
export interface WorkflowDesignPlanData {
  estimateId: string;
  projectId: string;
  designPlanStatus: string | null;
  designPlanVersion: number;
  commercialApprovedAt?: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  approvalSource: string | null;
  frozenAt: string | null;
  rounds: Array<{
    id: string; estimateId: string; projectId: string; designPlanVersion: number;
    status: string; decision: string | null; decisionSource: string | null;
    decidedById: string | null; decidedByRole: string | null; decidedAt: string | null;
    submittedRevisionIds: string[];
    proof?: { estimateId: string; reviewRoundId: string; uploadedById: string; valid: boolean };
  }>;
  drawings: Array<{ id: string; revisions: Array<{ id: string; revisionNumber: number; reviewStatus: string; reviewerId: string | null; reviewedAt: string | null }> }>;
  openFeedback: number;
}

export interface WorkflowSpacePlanningSource {
  sourceIssue?: "source_conflict";
  estimateId: string;
  designPlanVersion: number;
  reviewRoundId: string | null;
  totalImages: number;
  approvedImages: number;
  readyForCompletion: boolean;
  entryBlockingReasons: string[];
  blockingReasons: string[];
}

const validDate = (value: string | null): value is string => Boolean(value && Number.isFinite(Date.parse(value)));
const sourceConflict = "The current Design review source is unavailable or inconsistent. Reconcile the approved Design plan before continuing.";
const reviewRequired = "Submit the current Design plan for Client review before completing this stage.";
export function workflowSpacePlanningSource(data: WorkflowDesignPlanData): WorkflowSpacePlanningSource | null {
  if (!data.designPlanStatus && data.designPlanVersion === 0 && !data.rounds.length && !data.drawings.length && !data.frozenAt && !data.approvedAt && !data.approvedById && !data.approvalSource && data.openFeedback === 0) return null;
  if (data.designPlanVersion === 0) {
    const ids = data.drawings.map(drawing => drawing.id);
    // Commercial estimate approval keeps its drawing revisions, including prior Client reviews.
    // A Design plan review round or Design approval is the conflicting version-zero evidence.
    const revisions = data.drawings.flatMap(drawing => drawing.revisions);
    const validDrawings = new Set(ids).size === ids.length && ids.every(Boolean) &&
      new Set(revisions.map(revision => revision.id)).size === revisions.length &&
      data.drawings.every(drawing => drawing.revisions.length > 0 &&
        new Set(drawing.revisions.map(revision => revision.revisionNumber)).size === drawing.revisions.length) &&
      revisions.every(revision => Number.isSafeInteger(revision.revisionNumber) && revision.revisionNumber > 0 && Boolean(revision.id) &&
        (["draft", "submitted"].includes(revision.reviewStatus) && !revision.reviewerId && !revision.reviewedAt ||
          ["approved", "changes_requested"].includes(revision.reviewStatus) && Boolean(revision.reviewerId) && validDate(revision.reviewedAt) &&
            validDate(data.commercialApprovedAt ?? null) && Date.parse(revision.reviewedAt) <= Date.parse(data.commercialApprovedAt!)));
    const validFeedback = Number.isSafeInteger(data.openFeedback) && data.openFeedback >= 0;
    const preReview = ["assigned", "in_progress"].includes(data.designPlanStatus ?? "") &&
      !data.rounds.length && !data.frozenAt && !data.approvedAt && !data.approvedById && !data.approvalSource && validFeedback && validDrawings;
    const assignmentPending = data.designPlanStatus === "pending_assignment" && !data.rounds.length &&
      !data.frozenAt && !data.approvedAt && !data.approvedById && !data.approvalSource && validFeedback && validDrawings;
    const entryBlockingReasons = preReview ? [] : assignmentPending ? ["Assign a Designer to the Design plan before uploading."] : [sourceConflict];
    return { ...(entryBlockingReasons.includes(sourceConflict) ? { sourceIssue: "source_conflict" as const } : {}), estimateId: data.estimateId, designPlanVersion: 0, reviewRoundId: null, totalImages: data.drawings.length, approvedImages: 0,
      readyForCompletion: false, entryBlockingReasons, blockingReasons: preReview || assignmentPending ? [reviewRequired, ...(data.openFeedback ? ["Resolve the open plan feedback before completing this stage."] : [])] : [sourceConflict] };
  }
  const reasons: string[] = [];
  const entryBlockingReasons: string[] = [];
  const rounds = data.rounds.filter(round => round.designPlanVersion === data.designPlanVersion);
  const round = rounds.length === 1 ? rounds[0] : undefined;
  if (!Number.isSafeInteger(data.designPlanVersion) || data.designPlanVersion < 1 || !round || round.estimateId !== data.estimateId || round.projectId !== data.projectId || data.rounds.some(item => item.designPlanVersion > data.designPlanVersion) || !["in_progress", "changes_requested", "ready_for_client", "approved"].includes(data.designPlanStatus ?? "")) entryBlockingReasons.push(sourceConflict);
  if (entryBlockingReasons.length) reasons.push(sourceConflict);
  const revisions = data.drawings.map(drawing => {
    const sorted = [...drawing.revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
    const latest = sorted[0];
    return latest && Number.isSafeInteger(latest.revisionNumber) && latest.revisionNumber > 0 && sorted.filter(row => row.revisionNumber === latest.revisionNumber).length === 1 ? latest : undefined;
  });
  const approved = revisions.filter(revision => revision?.reviewStatus === "approved" && revision.reviewerId && validDate(revision.reviewedAt)).length;
  const invalidDrawings = !data.drawings.length || new Set(data.drawings.map(row => row.id)).size !== data.drawings.length || revisions.some(row => !row);
  if (invalidDrawings || approved !== data.drawings.length) reasons.push("Review and approve every current plan image before completing this stage.");
  if (invalidDrawings) entryBlockingReasons.push(sourceConflict);
  const ids = revisions.flatMap(revision => revision ? [revision.id] : []);
  const invalidRevisionSet = Boolean(round && (!round.submittedRevisionIds.length || new Set(ids).size !== ids.length || new Set(round.submittedRevisionIds).size !== round.submittedRevisionIds.length));
  const revisionSetChanged = Boolean(round && (invalidRevisionSet || ids.length !== round.submittedRevisionIds.length || ids.some(id => !round.submittedRevisionIds.includes(id))));
  if (revisionSetChanged) reasons.push("The images no longer match the submitted Design review. Reconcile the current plan before completing this stage.");
  if (invalidRevisionSet || revisionSetChanged && ["ready_for_client", "approved"].includes(data.designPlanStatus ?? "")) entryBlockingReasons.push(sourceConflict);
  const evidenceValid = round && round.status === "approved" && round.decision === "approve" && validDate(round.decidedAt) && Boolean(round.decidedById) && (
    round.decisionSource === "client_portal" && round.decidedByRole === "client" ||
    round.decisionSource === "admin_proof" && ["admin", "super_admin"].includes(round.decidedByRole ?? "") && round.proof?.valid && round.proof.estimateId === data.estimateId && round.proof.reviewRoundId === round.id && round.proof.uploadedById === round.decidedById
  );
  if (data.designPlanStatus !== "approved" || !evidenceValid || !validDate(data.approvedAt) || !validDate(data.frozenAt) || data.approvedAt !== data.frozenAt || data.approvedAt !== round?.decidedAt || data.approvedById !== round?.decidedById || data.approvalSource !== round?.decisionSource) reasons.push("The current Design plan needs its recorded approval before this stage can be completed.");
  if (data.designPlanStatus === "approved" && (!evidenceValid || !validDate(data.approvedAt) || !validDate(data.frozenAt) || data.approvedAt !== data.frozenAt || data.approvedAt !== round?.decidedAt || data.approvedById !== round?.decidedById || data.approvalSource !== round?.decisionSource)) entryBlockingReasons.push(sourceConflict);
  if (!Number.isSafeInteger(data.openFeedback) || data.openFeedback !== 0) reasons.push("Resolve the open plan feedback before completing this stage.");
  return { ...(entryBlockingReasons.includes(sourceConflict) ? { sourceIssue: "source_conflict" as const } : {}), estimateId: data.estimateId, designPlanVersion: data.designPlanVersion, reviewRoundId: round?.id ?? null, totalImages: data.drawings.length, approvedImages: approved, readyForCompletion: reasons.length === 0 && entryBlockingReasons.length === 0, entryBlockingReasons: [...new Set(entryBlockingReasons)], blockingReasons: [...new Set(reasons)] };
}
