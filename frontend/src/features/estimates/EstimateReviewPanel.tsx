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
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { ClientPublishedEstimate, clientEstimateMoney } from "./ClientPublishedEstimate";
import { ClientEstimateDesignReview } from "./ClientEstimateDesignReview";
import { clientEstimateWorkflowVersion } from "./clientEstimateWorkflow";
import "./clientPublishedEstimate.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export function EstimateReviewPanel({ selectedEstimateId, projectId, decisionBlocked = false, workflowFilter, refetchOnMount }: { selectedEstimateId?: string; projectId?: string; decisionBlocked?: boolean; workflowFilter?: "legacy"; refetchOnMount?: boolean } = {}) {
  const role = useAuth().user!.role;
  const queryClient = useQueryClient();
  const [designerByEstimate, setDesignerByEstimate] = useState<Record<string, string>>({});
  const [noteByEstimate, setNoteByEstimate] = useState<Record<string, string>>({});
  const queue = useQuery({
    queryKey: role === "client" ? estimateWorkflowKeys.client : estimateWorkflowKeys.reviewQueue,
    queryFn: role === "client" ? getClientEstimates : getEstimateReviewQueue,
    refetchOnMount
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
  const visibleEstimates = workflowFilter === "legacy" ? queue.data.filter((estimate) => clientEstimateWorkflowVersion(estimate) !== 3) : queue.data;
  const estimates = projectId ? visibleEstimates.filter((estimate) => estimate.projectId === projectId) : visibleEstimates;
  if (projectId && estimates.length > 1) return <section className={panelClass}><h2>{panelTitle}</h2><p role="alert">The current estimate for this project could not be verified. Please contact your Sales team.</p></section>;
  if (!estimates.length) return <section className={panelClass}><p className="eyebrow">Estimate review</p><h2>{panelTitle}</h2><p className="inline-empty">{projectId ? "No submitted estimate is linked to this project yet. Your Sales team will share it here when it is ready." : "Nothing needs your action right now."}</p></section>;
  const actionableCount = estimates.filter((estimate) => role === "client" ? estimate.publishedReview?.canDecide : canActOnEstimate(role, estimate.status)).length;

  return <section className={panelClass} aria-labelledby="estimate-review-title">
    <header><div><p className="eyebrow">Estimate review</p><h2 id="estimate-review-title">{panelTitle}</h2><p>{projectId ? "Review the submitted scope and pricing, then share your decision." : "Review your submitted estimates and respond to Sales."}</p></div><strong>{actionableCount} awaiting action</strong></header>
    <div className="estimate-review-grid">{estimates.map((estimate) => <EstimateReviewCard
      actionable={canActOnEstimate(role, estimate.status)}
      decisionBlocked={decisionBlocked}
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


function EstimateReviewCard({
  estimate,
  initiallyExpanded = false,
  role,
  actionable,
  decisionBlocked = false,
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
  decisionBlocked?: boolean;
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
  const [pdfNeedsRefresh, setPdfNeedsRefresh] = useState(false);
  const isClient = role === "client";
  const detailsId = `client-estimate-${estimate.id}-details`;
  const headingId = `client-estimate-${estimate.id}-title`;
  const includedItemCount = estimate.lineItems.filter((item) => item.included).length;
  const publishedReview = estimate.reviewSourceIssue ? null : estimate.publishedReview;
  const clientTitle = publishedReview?.snapshot.projectName ?? estimate.lead?.projectName ?? "Project estimate";
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
        {decisionBlocked ? <p role="status">Save or discard your quotation changes before approving a submitted version.</p> : null}
        <ClientPublishedEstimate estimate={estimate} decisionBlocked={pdfNeedsRefresh || decisionBlocked} />
        <ClientEstimateDesignReview estimate={estimate} />
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
