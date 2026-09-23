import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import {
  getDesignWorkflow, performDesignWorkflowAction, projectWorkflowKeys,
  type DesignStageOperational, type DesignWorkflowStage, type DesignWorkflowView
} from "./projectWorkflowApi";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
import "./spacePlanningCompletion.css";

type PlanningSource = NonNullable<DesignStageOperational["spacePlanning"]>;
const completionKey = (projectId: string) => ["space-planning-completion", projectId] as const;
const sourceIdentity = (projectId: string, stageId: string, source: PlanningSource) =>
  JSON.stringify([projectId, stageId, source.estimateId, source.designPlanVersion, source.reviewRoundId]);

function hasReviewSource(source: PlanningSource) {
  return Boolean(source.estimateId && source.reviewRoundId && Number.isSafeInteger(source.designPlanVersion) && source.designPlanVersion > 0);
}

function isReady(source: PlanningSource) {
  return source.readyForCompletion && hasReviewSource(source) && Number.isSafeInteger(source.totalImages) &&
    source.totalImages > 0 && source.approvedImages === source.totalImages && !source.completedAt;
}

interface CompletionProps {
  workflow: DesignWorkflowView;
  stage: DesignWorkflowStage;
  reviewHref?: string;
  refreshError?: boolean;
  refreshing?: boolean;
}

/** Both entry points use the backend's action and the same confirmation/mutation. */
export function SpacePlanningCompletion({ workflow, stage, reviewHref, refreshError = false, refreshing = false }: CompletionProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const [confirmation, setConfirmation] = useState<{ identity: string; version: number; source: PlanningSource }>();
  const [savedIdentity, setSavedIdentity] = useState<string>();
  const pending = useIsMutating({ mutationKey: completionKey(workflow.projectId) }) > 0;
  const source = stage.operational?.spacePlanning;
  if (!source || stage.type !== "space_planning_tentative_look_feel") return null;
  const identity = sourceIdentity(workflow.projectId, stage.id, source);
  const action = stage.operational?.availableActions.find((item) => item.id === "space_planning_complete" && item.actor === "client");
  const completed = Boolean(source.completedAt) || savedIdentity === identity;
  const eligible = !completed && isReady(source) && Boolean(action);
  const blocked = refreshError ? "The workflow could not be refreshed. Retry the workflow before completing this stage."
    : refreshing ? "Checking the latest workflow…" : action?.disabledReason;

  return <div role="group" className="space-planning-completion" aria-label="Space planning completion">
    <div className="space-planning-completion__summary">
      <p ref={status} tabIndex={-1} role="status">
        <strong>{completed ? "Space planning completed" : "Design image review"}</strong>
        <span>{source.approvedImages} of {source.totalImages} images approved</span>
      </p>
      {reviewHref ? <a className="space-planning-completion__review" href={reviewHref}>Review design images</a> : null}
    </div>
    {!completed && !source.readyForCompletion && source.totalImages > 0 ? <p className="space-planning-completion__hint">Review every image and resolve any requested changes before completing this stage.</p> : null}
    {eligible ? <div className="space-planning-completion__actions">
      <Button ref={trigger} size="compact" disabled={Boolean(blocked) || pending} aria-describedby={blocked ? `${id}-blocked` : `${id}-ready`}
        onClick={() => setConfirmation({ identity, version: stage.operational!.version, source: { ...source } })}>{action!.label}</Button>
      <p id={`${id}-ready`} className="space-planning-completion__hint">All images are approved. Confirm to complete this project stage.</p>
    </div> : null}
    {blocked && !completed ? <p id={`${id}-blocked`} role={refreshError ? "alert" : "status"} className="space-planning-completion__hint">{blocked}</p> : null}
    {confirmation ? <CompletionConfirmation
      key={confirmation.identity}
      workflow={workflow} stage={stage} source={confirmation.source} expectedVersion={confirmation.version}
      stale={confirmation.identity !== identity || confirmation.version !== stage.operational?.version || !eligible || Boolean(action?.disabledReason) || refreshError}
      refreshing={refreshing} returnFocusRef={trigger} fallbackFocusRef={status}
      onClose={() => setConfirmation(undefined)}
      onSaved={() => { setSavedIdentity(confirmation.identity); setConfirmation(undefined); }}
    /> : null}
  </div>;
}

function CompletionConfirmation({ workflow, stage, source, expectedVersion, stale, refreshing, onClose, onSaved, returnFocusRef, fallbackFocusRef }: {
  workflow: DesignWorkflowView; stage: DesignWorkflowStage; source: PlanningSource; expectedVersion: number;
  stale: boolean; refreshing: boolean; onClose: () => void; onSaved: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>; fallbackFocusRef: RefObject<HTMLParagraphElement | null>;
}) {
  const refresh = useRefreshDesignWorkflow({ includeClientPlans: true });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  const descriptionId = useId();
  const mutation = useMutation({
    mutationKey: completionKey(workflow.projectId),
    mutationFn: () => performDesignWorkflowAction({
      projectId: workflow.projectId, stageId: stage.id, action: "space_planning_complete", expectedVersion, idempotencyKey,
      data: { estimateId: source.estimateId, designPlanVersion: source.designPlanVersion, reviewRoundId: source.reviewRoundId }
    }),
    onSuccess: async () => { onSaved(); await refresh(); },
    onError: async (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 403)) {
        setConflict(true);
        await refresh();
      }
    },
    onSettled: () => { inFlight.current = false; }
  });
  const blocked = stale || conflict;
  return <Dialog title="Complete space planning?" eyebrow="Client approval"
    description={`You are completing “${stage.name}” for approved design plan version ${source.designPlanVersion}. All ${source.totalImages} images have been approved.`}
    busy={mutation.isPending} onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}>
    {blocked ? <p id={descriptionId} role="alert">The plan or workflow changed. Close this confirmation and review the latest state before approving again.</p>
      : refreshing ? <p id={descriptionId} role="status">Checking the latest workflow…</p> : null}
    {mutation.isError && !conflict ? <p role="alert">{mutation.error instanceof ApiError ? mutation.error.message : "Stage approval could not be saved. Please try again."}</p> : null}
    <div className="modal__actions">
      <Button variant="destructive-outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
      <Button disabled={blocked || refreshing || mutation.isPending} busy={mutation.isPending} aria-describedby={blocked || refreshing ? descriptionId : undefined}
        onClick={() => { if (!blocked && !refreshing && !mutation.isPending && !inFlight.current) { inFlight.current = true; mutation.mutate(); } }}>
        {mutation.isPending ? "Completing…" : "Approve and complete stage"}
      </Button>
    </div>
  </Dialog>;
}

/** Mounted only for an expanded, approved Client estimate. No extra polling. */
export function EstimateSpacePlanningCompletion({ projectId, estimateId }: { projectId: string; estimateId: string }) {
  const workflow = useQuery({
    queryKey: projectWorkflowKeys.designWorkflow(projectId),
    queryFn: () => getDesignWorkflow(projectId),
    enabled: Boolean(projectId && estimateId)
  });
  if (!projectId || !estimateId) return null;
  if (workflow.isPending) return <p role="status">Loading space planning status…</p>;
  if (workflow.isError) return <div className="space-planning-completion"><p role="alert">Space planning status could not be loaded.</p><Button variant="secondary" size="compact" disabled={workflow.isFetching} onClick={() => void workflow.refetch()}>Retry stage status</Button></div>;
  if (workflow.data.projectId !== projectId) return <p role="alert">Space planning status is unavailable for this project.</p>;
  const stage = workflow.data.projectStages?.find((candidate) => candidate.type === "space_planning_tentative_look_feel" && candidate.operational?.spacePlanning?.estimateId === estimateId);
  return stage ? <SpacePlanningCompletion key={`${projectId}:${estimateId}:${stage.id}`} workflow={workflow.data} stage={stage} refreshing={workflow.isFetching} /> : null;
}
