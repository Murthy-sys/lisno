/** Safe source for the separate Client acknowledgement; it never finalizes Design approval. */
export interface WorkflowDesignPlanData {
  estimateId: string;
  projectId: string;
  designPlanStatus: string | null;
  designPlanVersion: number;
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
  estimateId: string;
  designPlanVersion: number;
  reviewRoundId: string | null;
  totalImages: number;
  approvedImages: number;
  readyForCompletion: boolean;
  blockingReasons: string[];
}

const validDate = (value: string | null): value is string => Boolean(value && Number.isFinite(Date.parse(value)));
export function workflowSpacePlanningSource(data: WorkflowDesignPlanData): WorkflowSpacePlanningSource | null {
  if (!data.designPlanStatus && data.designPlanVersion === 0 && !data.rounds.length && !data.drawings.length && !data.frozenAt && !data.approvedAt && !data.approvedById && !data.approvalSource && data.openFeedback === 0) return null;
  const reasons: string[] = [];
  const rounds = data.rounds.filter(round => round.designPlanVersion === data.designPlanVersion);
  const round = rounds.length === 1 ? rounds[0] : undefined;
  if (!Number.isSafeInteger(data.designPlanVersion) || data.designPlanVersion < 1 || !round || round.estimateId !== data.estimateId || round.projectId !== data.projectId || data.rounds.some(item => item.designPlanVersion > data.designPlanVersion)) reasons.push("The current Design review source is unavailable or inconsistent. Refresh after the Designer submits the current plan.");
  const revisions = data.drawings.map(drawing => {
    const sorted = [...drawing.revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
    const latest = sorted[0];
    return latest && Number.isSafeInteger(latest.revisionNumber) && latest.revisionNumber > 0 && sorted.filter(row => row.revisionNumber === latest.revisionNumber).length === 1 ? latest : undefined;
  });
  const approved = revisions.filter(revision => revision?.reviewStatus === "approved" && revision.reviewerId && validDate(revision.reviewedAt)).length;
  if (!data.drawings.length || new Set(data.drawings.map(row => row.id)).size !== data.drawings.length || revisions.some(row => !row) || approved !== data.drawings.length) reasons.push("Review and approve every current plan image before completing this stage.");
  const ids = revisions.flatMap(revision => revision ? [revision.id] : []);
  if (round && (!round.submittedRevisionIds.length || new Set(ids).size !== ids.length || new Set(round.submittedRevisionIds).size !== round.submittedRevisionIds.length || ids.length !== round.submittedRevisionIds.length || ids.some(id => !round.submittedRevisionIds.includes(id)))) reasons.push("The images no longer match the submitted Design review. Reconcile the current plan before completing this stage.");
  const evidenceValid = round && round.status === "approved" && round.decision === "approve" && validDate(round.decidedAt) && Boolean(round.decidedById) && (
    round.decisionSource === "client_portal" && round.decidedByRole === "client" ||
    round.decisionSource === "admin_proof" && ["admin", "super_admin"].includes(round.decidedByRole ?? "") && round.proof?.valid && round.proof.estimateId === data.estimateId && round.proof.reviewRoundId === round.id && round.proof.uploadedById === round.decidedById
  );
  if (data.designPlanStatus !== "approved" || !evidenceValid || !validDate(data.approvedAt) || !validDate(data.frozenAt) || data.approvedAt !== data.frozenAt || data.approvedAt !== round?.decidedAt || data.approvedById !== round?.decidedById || data.approvalSource !== round?.decisionSource) reasons.push("The current Design plan needs its recorded approval before this stage can be completed.");
  if (!Number.isSafeInteger(data.openFeedback) || data.openFeedback !== 0) reasons.push("Resolve the open plan feedback before completing this stage.");
  return { estimateId: data.estimateId, designPlanVersion: data.designPlanVersion, reviewRoundId: round?.id ?? null, totalImages: data.drawings.length, approvedImages: approved, readyForCompletion: reasons.length === 0, blockingReasons: reasons };
}
