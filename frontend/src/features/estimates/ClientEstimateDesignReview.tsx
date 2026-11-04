import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { EstimatePlanPage } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { estimateWorkflowKeys, type EstimateQueueItem } from "./estimateWorkflowApi";
import { clientEstimateWorkflowVersion } from "./clientEstimateWorkflow";
import {
  estimateDesignKeys,
  getClientEstimateDrawings,
  getClientPlanWorkspace,
  previewClientPlanTargets,
  saveClientPlanDraft,
  submitClientPlanChangeRequest,
  updateClientPlanChangeRequest
} from "../leads/estimateDesignApi";
import {
  ClientEstimateDrawings,
  projectDrawingAnnotationsToPage,
  projectDrawingCommentsToPage
} from "./ClientEstimateDrawings";
import { clientKeys } from "../client/clientApi";
import { ClientFullPlanNav } from "./ClientFullPlanNav";
import { ClientPlanPageReview } from "./ClientPlanPageReview";
import { EstimateSpacePlanningCompletion } from "../workflow/SpacePlanningCompletion";
import "./clientPublishedEstimate.css";

function canReviewDesign(estimate: EstimateQueueItem) {
  if (clientEstimateWorkflowVersion(estimate) === 3 && !((estimate.designPlanVersion ?? 0) > 0 && estimate.publishedReview?.phase === "post" && estimate.publishedReview.status === "approved")) return false;
  if (estimate.status === "client_approved") {
    return estimate.designPlanStatus === "ready_for_client";
  }
  return estimate.status === "sent_to_client" ||
    estimate.status === "client_changes_requested";
}

/** Design review is independent of the working quotation and its commercial decision. */
export function ClientEstimateDesignReview({ estimate }: { estimate: EstimateQueueItem }) {
  const { user, reviewSession } = useAuth();
  if (user?.role !== "client") return null;
  return <ClientDesignReviewForEstimate key={`${reviewSession?.id ?? user.id}:${estimate.id}`} estimate={estimate} />;
}

function ClientDesignReviewForEstimate({ estimate }: { estimate: EstimateQueueItem }) {
  const queryClient = useQueryClient();
  const [selectedPlanPage, setSelectedPlanPage] = useState<EstimatePlanPage>();
  const publishedReview = estimate.reviewSourceIssue ? null : estimate.publishedReview;
  const unchangedDesignRequest = estimate.status === "client_changes_requested" &&
    publishedReview?.status === "pending" && estimate.version === publishedReview.estimateVersion;
  const quotationDesignReady = !estimate.reviewSourceIssue && (clientEstimateWorkflowVersion(estimate) !== 3 || (estimate.designPlanVersion ?? 0) > 0 && publishedReview?.phase === "post" && publishedReview.status === "approved");
  const showDesignTools = quotationDesignReady && (estimate.status === "sent_to_client" || estimate.status === "client_approved" || unchangedDesignRequest);
  const drawingWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientWorkspace(estimate.id),
    queryFn: () => getClientEstimateDrawings(estimate.id),
    enabled: showDesignTools
  });
  const planWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id),
    queryFn: () => getClientPlanWorkspace(estimate.id),
    enabled: showDesignTools
  });
  const drawings = drawingWorkspace.isError ? undefined : drawingWorkspace.data;
  const plans = planWorkspace.isError ? undefined : planWorkspace.data;
  const canReviewDrawings = canReviewDesign(estimate) && !drawingWorkspace.isFetching && !drawingWorkspace.isError;
  const canReviewPlans = canReviewDrawings && !planWorkspace.isFetching && !planWorkspace.isError;
  const roomOptions = estimate.rooms.flatMap((room) => {
    const id = typeof room.id === "string" ? room.id : "";
    const label = typeof room.label === "string" ? room.label : "";
    return id && label ? [{ id, label }] : [];
  });
  const scopeOptions = estimate.scopes.map((id) => ({
    id,
    label: estimateBuilderSections.find((section) => section.id === id)?.label ?? id
  }));
  for (const line of estimate.lineItems) {
    if (line.source !== "configuration" || !line.included || !line.mainBasketId) continue;
    if (!scopeOptions.some((option) => option.id === line.mainBasketId)) {
      scopeOptions.push({ id: line.mainBasketId, label: line.mainBasketName });
    }
  }
  if (!showDesignTools) return null;
  return <>
    <div className={`client-estimate-workspace${showDesignTools && plans?.pages.length ? "" : " client-estimate-workspace--single"}`}>
      <div className="client-estimate-workspace__main">
        {showDesignTools && (drawingWorkspace.isPending || drawingWorkspace.isError || planWorkspace.isPending || planWorkspace.isError || drawings?.drawings.length || plans?.pages.length) ? <section className="client-estimate-design-review" aria-label="Design review">
          <div className="client-estimate-design-review__heading"><p className="eyebrow">Design review</p><h3>Drawings and plans</h3><p>Review design drawings separately from your estimate decision.</p></div>
        {planWorkspace.isPending ? <p role="status">Loading full design pages…</p> : null}
        {planWorkspace.isError ? <div role="status"><p>Full design pages could not be loaded.</p><Button variant="secondary" disabled={planWorkspace.isFetching} onClick={() => void planWorkspace.refetch()}>Retry design pages</Button></div> : null}
        {drawingWorkspace.isError ? <Button variant="secondary" disabled={drawingWorkspace.isFetching} onClick={() => void drawingWorkspace.refetch()}>Retry drawings</Button> : null}
        <ClientEstimateDrawings
          estimateId={estimate.id}
          rooms={roomOptions}
          scopes={scopeOptions}
          workspace={drawings}
          isPending={drawingWorkspace.isPending}
          isError={drawingWorkspace.isError}
          canReview={canReviewDrawings}
          planWorkspace={plans}
        />
        </section> : null}
        {quotationDesignReady && estimate.status === "client_approved" && estimate.projectId ? <EstimateSpacePlanningCompletion projectId={estimate.projectId} estimateId={estimate.id} /> : null}
      </div>
      {showDesignTools && plans?.pages.length ? (
        <aside className="client-estimate-workspace__rail" aria-label="Design tools">
          <ClientFullPlanNav
            workspace={plans}
            selectedPageId={selectedPlanPage?.id}
            onSelectPage={setSelectedPlanPage}
          />
        </aside>
      ) : null}
    </div>
    {showDesignTools && selectedPlanPage && plans && !drawingWorkspace.isError ? (
      <ClientPlanPageReview
        key={`${selectedPlanPage.id}:${selectedPlanPage.reviewRoundId ?? "estimate"}`}
        page={selectedPlanPage}
        editableRequest={plans?.openRequests.filter((request) => request.sourcePageId === selectedPlanPage.id).at(-1)}
        sharedAnnotations={drawings && plans
          ? projectDrawingAnnotationsToPage(
              selectedPlanPage,
              drawings,
              plans,
              plans.openRequests.filter((request) => request.sourcePageId === selectedPlanPage.id).at(-1)?.id
            )
          : []}
        sharedComments={drawings && plans
          ? projectDrawingCommentsToPage(selectedPlanPage, drawings, plans)
          : []}
        pages={plans?.uploads.find((upload) => upload.id === selectedPlanPage.uploadId)?.pages ?? [selectedPlanPage]}
        onSelectPage={setSelectedPlanPage}
        canReview={canReviewPlans}
        onClose={() => setSelectedPlanPage(undefined)}
        saveDraft={async (annotations) => {
          await saveClientPlanDraft(selectedPlanPage.id, selectedPlanPage.annotationDraft?.version ?? 0, annotations, selectedPlanPage.reviewRoundId);
          await queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) });
        }}
        previewTargets={(annotations) => previewClientPlanTargets(selectedPlanPage.id, annotations, selectedPlanPage.reviewRoundId)}
        submitRequest={async (input) => {
          await submitClientPlanChangeRequest(selectedPlanPage.id, { ...input, reviewRoundId: selectedPlanPage.reviewRoundId ?? undefined });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) }),
            queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(estimate.id) }),
            queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }),
            queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
            queryClient.invalidateQueries({ queryKey: clientKeys.projects })
          ]);
        }}
        updateRequest={async ({ requestId, version, summary, annotations }) => {
          await updateClientPlanChangeRequest(requestId, { version, summary, annotations });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) }),
            queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(estimate.id) }),
            queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }),
            queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
            queryClient.invalidateQueries({ queryKey: clientKeys.projects })
          ]);
        }}
      />
    ) : null}
  </>;
}
