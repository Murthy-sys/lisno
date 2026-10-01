import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { Role } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Select, Textarea } from "../../components/ui/Field";
import { DownloadButton } from "../../components/ui/DownloadButton";
import {
  assignEstimateDesigner,
  decideEstimateAsDesigner,
  downloadClientEstimatePdf,
  estimateWorkflowKeys,
  type EstimateQueueItem,
  getClientEstimates,
  getEstimateDesigners,
  getEstimateReviewQueue
} from "./estimateWorkflowApi";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
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
import type { EstimatePlanPage } from "../../api/types";
import { ClientFullPlanNav } from "./ClientFullPlanNav";
import { ClientPlanPageReview } from "./ClientPlanPageReview";
import { EstimateSpacePlanningCompletion } from "../workflow/SpacePlanningCompletion";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { ClientPublishedEstimate, clientEstimateMoney } from "./ClientPublishedEstimate";
import "./clientPublishedEstimate.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export function EstimateReviewPanel({ selectedEstimateId, projectId }: { selectedEstimateId?: string; projectId?: string } = {}) {
  const role = useAuth().user!.role;
  const queryClient = useQueryClient();
  const [designerByEstimate, setDesignerByEstimate] = useState<Record<string, string>>({});
  const [noteByEstimate, setNoteByEstimate] = useState<Record<string, string>>({});
  const queue = useQuery({
    queryKey: role === "client" ? estimateWorkflowKeys.client : estimateWorkflowKeys.reviewQueue,
    queryFn: role === "client" ? getClientEstimates : getEstimateReviewQueue
  });
  const designers = useQuery({
    queryKey: estimateWorkflowKeys.designers,
    queryFn: getEstimateDesigners,
    enabled: role === "design_manager"
  });
  const action = useMutation({
    mutationFn: async (input: { id: string; action: "assign" | "approve" | "changes" }) => {
      if (input.action === "assign") {
        return assignEstimateDesigner(input.id, designerByEstimate[input.id] ?? "");
      }
      const decision = input.action === "approve" ? "approve" : "request_changes";
      const note = noteByEstimate[input.id] ?? "";
      return decideEstimateAsDesigner(input.id, decision, note);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.reviewQueue });
      await queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all });
    }
  });

  const panelClass = `estimate-review-panel${role === "client" ? " estimate-review-panel--client" : ""}${projectId ? " estimate-review-panel--project" : ""}`;
  const panelTitle = projectId ? "Project estimate" : role === "client" ? "Estimates ready for you" : "Estimate approvals";
  if (queue.isPending) return <section className={panelClass}><h2>{panelTitle}</h2><p role="status">Loading submitted estimates…</p></section>;
  if (queue.isError) return <section className={panelClass}><h2>{panelTitle}</h2><p role="alert">Submitted estimates could not be loaded. Refresh before reviewing or making a decision.</p><Button variant="secondary" disabled={queue.isFetching} onClick={() => void queue.refetch()}>Retry estimates</Button></section>;
  const estimates = projectId ? queue.data.filter((estimate) => estimate.projectId === projectId) : queue.data;
  if (projectId && estimates.length > 1) return <section className={panelClass}><h2>{panelTitle}</h2><p role="alert">The current estimate for this project could not be verified. Please contact your Sales team.</p></section>;
  if (!estimates.length) return <section className={panelClass}><p className="eyebrow">Estimate review</p><h2>{panelTitle}</h2><p className="inline-empty">{projectId ? "No submitted estimate is linked to this project yet. Your Sales team will share it here when it is ready." : "Nothing needs your action right now."}</p></section>;
  const actionableCount = estimates.filter((estimate) => role === "client" ? estimate.publishedReview?.canDecide : canActOnEstimate(role, estimate.status)).length;

  return <section className={panelClass} aria-labelledby="estimate-review-title">
    <header><div><p className="eyebrow">Estimate review</p><h2 id="estimate-review-title">{panelTitle}</h2><p>{projectId ? "Review the submitted scope and pricing, then share your decision." : "Review your submitted estimates and respond to Sales."}</p></div><strong>{actionableCount} awaiting action</strong></header>
    <div className="estimate-review-grid">{estimates.map((estimate) => <EstimateReviewCard
      actionable={canActOnEstimate(role, estimate.status)}
      actionError={action.isError && action.variables?.id === estimate.id
        ? action.error
        : null}
      actionPending={action.isPending && action.variables?.id === estimate.id}
      designers={designers.data ?? []}
      estimate={estimate}
      initiallyExpanded={Boolean(projectId) || estimate.id === selectedEstimateId}
      key={estimate.id}
      note={noteByEstimate[estimate.id] ?? ""}
      role={role}
      selectedDesignerId={designerByEstimate[estimate.id] ?? ""}
      onAction={(actionType) => action.mutate({ id: estimate.id, action: actionType })}
      onDesignerChange={(designerId) => setDesignerByEstimate((current) => ({ ...current, [estimate.id]: designerId }))}
      onNoteChange={(note) => setNoteByEstimate((current) => ({ ...current, [estimate.id]: note }))}
    />)}</div>
    {role !== "client" && action.isError ? <p role="alert">That action could not be completed. Refresh and try again.</p> : null}
  </section>;
}

function canActOnEstimate(role: string, status: EstimateQueueItem["status"]) {
  if (role === "client") return status === "sent_to_client";
  if (role === "design_manager") return status === "pending_manager_assignment";
  return status === "pending_designer_approval";
}

function canReviewDesign(role: Role, estimate: EstimateQueueItem) {
  if (role !== "client") return false;
  if (estimate.status === "client_approved") {
    return estimate.designPlanStatus === "ready_for_client";
  }
  return estimate.status === "sent_to_client" ||
    estimate.status === "client_changes_requested";
}

function EstimateReviewCard({
  estimate,
  initiallyExpanded = false,
  role,
  actionable,
  designers,
  selectedDesignerId,
  note,
  actionError,
  actionPending,
  onDesignerChange,
  onNoteChange,
  onAction
}: {
  estimate: EstimateQueueItem;
  initiallyExpanded?: boolean;
  role: Role;
  actionable: boolean;
  designers: Awaited<ReturnType<typeof getEstimateDesigners>>;
  selectedDesignerId: string;
  note: string;
  actionError: Error | null;
  actionPending: boolean;
  onDesignerChange: (designerId: string) => void;
  onNoteChange: (note: string) => void;
  onAction: (action: "assign" | "approve" | "changes") => void;
}) {
  const queryClient = useQueryClient();
  const [clientExpanded, setClientExpanded] = useState(initiallyExpanded);
  const [selectedPlanPage, setSelectedPlanPage] = useState<EstimatePlanPage>();
  const [pdfNeedsRefresh, setPdfNeedsRefresh] = useState(false);
  const isClient = role === "client";
  const detailsId = `client-estimate-${estimate.id}-details`;
  const headingId = `client-estimate-${estimate.id}-title`;
  const includedItemCount = estimate.lineItems.filter((item) => item.included).length;
  const publishedReview = estimate.reviewSourceIssue ? null : estimate.publishedReview;
  const unchangedDesignRequest = estimate.status === "client_changes_requested" &&
    publishedReview?.status === "pending" && estimate.version === publishedReview.estimateVersion;
  const showDesignTools = isClient && (estimate.status === "sent_to_client" || estimate.status === "client_approved" || unchangedDesignRequest);
  const clientTitle = publishedReview?.snapshot.projectName ?? estimate.lead?.projectName ?? "Project estimate";
  const drawingWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientWorkspace(estimate.id),
    queryFn: () => getClientEstimateDrawings(estimate.id),
    enabled: showDesignTools && clientExpanded
  });
  const planWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id),
    queryFn: () => getClientPlanWorkspace(estimate.id),
    enabled: showDesignTools && clientExpanded
  });
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
  const reviewControls = !isClient && actionable ? <>
    {role === "design_manager" ? <label>Assign approval to<Select disabled={actionPending} value={selectedDesignerId} onChange={(event) => onDesignerChange(event.target.value)}><option value="">Choose designer</option>{designers.map((designer) => <option value={designer.id} key={designer.id}>{designer.name}</option>)}</Select></label> : <label>Review note<Textarea disabled={actionPending} value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder={isClient ? "Optional note for the Lisno team" : "Add approval context or requested corrections"} /></label>}
    <div className="estimate-review-card__actions">
      {role === "design_manager"
        ? <Button type="button" disabled={!selectedDesignerId || actionPending} onClick={() => onAction("assign")}>Assign designer</Button>
        : <><Button variant="secondary" type="button" disabled={actionPending} onClick={() => onAction("changes")}>Request changes</Button><Button type="button" disabled={actionPending} onClick={() => onAction("approve")}>{isClient ? "Approve estimate" : "Approve for client"}</Button></>}
    </div>
    {actionError ? <p role="alert">{actionError instanceof ApiError ? actionError.message : "That action could not be completed. Refresh and try again."}</p> : null}
  </> : null;

  if (isClient) {
    return <article className="estimate-review-card estimate-review-card--client">
      <div className={`estimate-review-card__client-header${clientExpanded ? " estimate-review-card__client-header--expanded" : ""}`}>
        <h3 id={headingId}>{clientTitle}</h3>
        <strong className="estimate-review-card__total">{publishedReview ? clientEstimateMoney(publishedReview.snapshot.total) : "Estimate unavailable"}</strong>
        {clientExpanded && publishedReview ? <DownloadButton
          className="button button--secondary estimate-review-card__export"
          label="Export as PDF"
          loadingLabel="Preparing PDF..."
          errorMessage={`PDF export failed for ${estimate.lead?.projectName ?? "this estimate"}. Try again.`}
          fallbackFilename={`lisno-${estimate.id}.pdf`}
          getFile={async () => {
            try { return await downloadClientEstimatePdf(estimate.id, publishedReview.id); }
            catch (error) { setPdfNeedsRefresh(true); throw error; }
          }}
        /> : null}
        <button className="estimate-review-card__toggle" type="button" aria-labelledby={headingId} aria-expanded={clientExpanded} aria-controls={detailsId} onClick={() => setClientExpanded((current) => !current)}><span aria-hidden="true">{clientExpanded ? "Hide details" : "View estimate"}</span><span aria-hidden="true">{clientExpanded ? "−" : "+"}</span></button>
      </div>
      {clientExpanded ? <div className="estimate-review-card__client-content" id={detailsId}>
        {pdfNeedsRefresh ? <div className="client-commercial-state" role="status"><p>Refresh the submitted estimate before trying the PDF or making a decision.</p><Button variant="secondary" onClick={async () => { await queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }); setPdfNeedsRefresh(false); }}>Refresh estimate</Button></div> : null}
        <ClientPublishedEstimate estimate={estimate} decisionBlocked={pdfNeedsRefresh} />
        <div className={`client-estimate-workspace${showDesignTools && planWorkspace.data?.pages.length ? "" : " client-estimate-workspace--single"}`}>
          <div className="client-estimate-workspace__main">
            {showDesignTools && (drawingWorkspace.isPending || drawingWorkspace.isError || planWorkspace.isPending || planWorkspace.isError || drawingWorkspace.data?.drawings.length || planWorkspace.data?.pages.length) ? <section className="client-estimate-design-review" aria-label="Design review">
              <div className="client-estimate-design-review__heading"><p className="eyebrow">Design review</p><h4>Drawings and plans</h4><p>Review design drawings separately from your estimate decision.</p></div>
            {planWorkspace.isPending ? <p role="status">Loading full design pages…</p> : null}
            {planWorkspace.isError ? <p className="inline-empty">No full design pages are available for this estimate.</p> : null}
            <ClientEstimateDrawings
              estimateId={estimate.id}
              rooms={roomOptions}
              scopes={scopeOptions}
              workspace={drawingWorkspace.data}
              isPending={drawingWorkspace.isPending}
              isError={drawingWorkspace.isError}
              canReview={canReviewDesign(role, estimate)}
              planWorkspace={planWorkspace.data}
            />
            </section> : null}
            {estimate.status === "client_approved" && estimate.projectId ? <EstimateSpacePlanningCompletion projectId={estimate.projectId} estimateId={estimate.id} /> : null}
          </div>
          {showDesignTools && planWorkspace.data?.pages.length ? (
            <aside className="client-estimate-workspace__rail" aria-label="Design tools">
              <ClientFullPlanNav
                workspace={planWorkspace.data}
                selectedPageId={selectedPlanPage?.id}
                onSelectPage={setSelectedPlanPage}
              />
            </aside>
          ) : null}
        </div>
        {showDesignTools && selectedPlanPage ? (
          <ClientPlanPageReview
            key={`${selectedPlanPage.id}:${selectedPlanPage.reviewRoundId ?? "estimate"}`}
            page={selectedPlanPage}
            editableRequest={planWorkspace.data?.openRequests.filter((request) => request.sourcePageId === selectedPlanPage.id).at(-1)}
            sharedAnnotations={drawingWorkspace.data && planWorkspace.data
              ? projectDrawingAnnotationsToPage(
                  selectedPlanPage,
                  drawingWorkspace.data,
                  planWorkspace.data,
                  planWorkspace.data.openRequests.filter((request) => request.sourcePageId === selectedPlanPage.id).at(-1)?.id
                )
              : []}
            sharedComments={drawingWorkspace.data && planWorkspace.data
              ? projectDrawingCommentsToPage(selectedPlanPage, drawingWorkspace.data, planWorkspace.data)
              : []}
            pages={planWorkspace.data?.uploads.find((upload) => upload.id === selectedPlanPage.uploadId)?.pages ?? [selectedPlanPage]}
            onSelectPage={setSelectedPlanPage}
            canReview={canReviewDesign(role, estimate)}
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
      </div> : null}
    </article>;
  }

  return <article className="estimate-review-card">
    <div><p className="eyebrow">{estimate.lead?.location}</p><h3>{estimate.lead?.projectName}</h3><p>{estimate.lead?.clientName}</p></div>
    <strong className="estimate-review-card__total">{money(estimate.total)}</strong>
    <p>{includedItemCount} items · GST included</p>
    {reviewControls}
  </article>;
}
