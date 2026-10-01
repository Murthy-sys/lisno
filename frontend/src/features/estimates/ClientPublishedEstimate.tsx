import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { EstimateClientReviewSnapshot } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Textarea } from "../../components/ui/Field";
import { clientKeys } from "../client/clientApi";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import { estimateDesignKeys } from "../leads/estimateDesignApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { decideEstimateAsClient, estimateWorkflowKeys, type EstimateQueueItem } from "./estimateWorkflowApi";

export const clientEstimateMoney = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function ClientPublishedEstimate({ estimate, decisionBlocked = false }: { estimate: EstimateQueueItem; decisionBlocked?: boolean }) {
  const reviewSectionRef = useRef<HTMLElement>(null);
  const review = estimate.publishedReview;
  if (!review || estimate.reviewSourceIssue) return <div className="client-commercial-state" role="status">
    <strong>Submitted estimate unavailable</strong>
    <p>The submitted version could not be verified. Please ask your Sales team to submit the estimate again.</p>
  </div>;

  return <section className="client-commercial-review" aria-label="Submitted estimate" ref={reviewSectionRef} tabIndex={-1}>
    <div className="client-commercial-review__metadata">
      <span>Version {review.estimateVersion} · Submission {review.sendGeneration}</span>
      <span>Submitted {formatDate(review.submittedAt)}</span>
      <span className="client-commercial-status">{review.status === "approved" ? "Approved" : review.status === "changes_requested" ? "Changes requested" : "Awaiting your review"}</span>
    </div>
    <p>{review.snapshot.clientName} · {review.snapshot.location}</p>
    <p className="client-commercial-review__hint">{review.snapshot.lineItems.filter((item) => item.included).length} items · GST included</p>
    <PublishedEstimateDetails snapshot={review.snapshot} />
    <ClientEstimateDecision key={`${review.id}:${review.version}`} estimate={estimate} review={review} decisionBlocked={decisionBlocked} fallbackRef={reviewSectionRef} />
  </section>;
}

function PublishedEstimateDetails({ snapshot }: { snapshot: EstimateClientReviewSnapshot }) {
  const included = snapshot.lineItems.filter((item) => item.included);
  const catalogue = new Map<string, { description: string; sectionId: string }>(estimateBuilderSections.flatMap((section) => section.rows.map((row) => [row.id, { description: row.description, sectionId: section.id }] as const)));
  const groups: Array<{ id: string; label: string; items: typeof included }> = estimateBuilderSections.map((section) => ({ id: section.id, label: section.label, items: included.filter((item) => catalogue.get(item.catalogueId)?.sectionId === section.id) }));
  groups.push({ id: "other", label: "Other items", items: included.filter((item) => !catalogue.has(item.catalogueId)) });
  return <details className="client-commercial-details" open>
    <summary>Review section-wise estimate</summary>
    <div className="client-commercial-details__sections">
      {groups.filter((group) => group.items.length).map((group) => <details className="client-commercial-section" key={group.id} open>
        <summary><span>{group.label}</span><strong>{clientEstimateMoney(group.items.reduce((total, item) => total + item.amount, 0))}</strong></summary>
        <div className="client-commercial-lines">
          {group.items.map((item, index) => <div className="client-commercial-line" key={`${item.catalogueId}:${item.roomName}:${index}`}>
            <div><strong>{catalogue.get(item.catalogueId)?.description ?? item.catalogueId}</strong><span>{item.roomName}</span><span>{item.specification}</span></div>
            <div className="client-commercial-line__quantity"><span>Quantity / rate</span><span>{item.quantity} {item.unit} × {clientEstimateMoney(item.rate)}</span></div>
            <strong className="client-commercial-line__amount">{clientEstimateMoney(item.amount)}</strong>
          </div>)}
        </div>
      </details>)}
      {!included.length ? <p>No item breakdown is available in this submitted estimate.</p> : null}
      <dl className="client-commercial-totals">
        <div><dt>Subtotal</dt><dd>{clientEstimateMoney(snapshot.subtotal)}</dd></div>
        <div><dt>GST</dt><dd>{clientEstimateMoney(snapshot.gst)}</dd></div>
        <div><dt>Total including GST</dt><dd>{clientEstimateMoney(snapshot.total)}</dd></div>
      </dl>
    </div>
  </details>;
}

function ClientEstimateDecision({ estimate, review, decisionBlocked, fallbackRef }: { estimate: EstimateQueueItem; review: NonNullable<EstimateQueueItem["publishedReview"]>; decisionBlocked: boolean; fallbackRef: RefObject<HTMLElement | null> }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"approve" | "request_changes" | null>(null);
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completed, setCompleted] = useState<"approve" | "request_changes" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client });
    setRefreshing(false);
    setNeedsRefresh(false);
    action.reset();
  };
  const action = useMutation({
    mutationFn: (decision: "approve" | "request_changes") => decideEstimateAsClient(estimate.id, decision, note.trim(), { id: review.id, version: review.version }),
    onSuccess: async (_, decision) => {
      setCompleted(decision);
      setDialog(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }),
        queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(estimate.id) }),
        queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) }),
        queryClient.invalidateQueries({ queryKey: ["leads"] })
      ]);
    },
    onError: async (error) => {
      setNeedsRefresh(true);
      setDialog(null);
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        queryClient.setQueryData(estimateWorkflowKeys.client, []);
        await queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client });
      }
    }
  });
  const available = review.canDecide && review.status === "pending" && estimate.status === "sent_to_client" && !completed && !decisionBlocked;
  const openDialog = (decision: "approve" | "request_changes", trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setValidation("");
    setNote("");
    setDialog(decision);
  };
  return <div className="client-commercial-decision">
    {review.status === "approved" || completed === "approve" ? <div className="client-commercial-state" role="status"><strong>Estimate approved</strong><p>Your approved estimate is recorded. Follow the project workflow below, or review the design plan when it is submitted.</p></div> : null}
    {review.status === "changes_requested" || completed === "request_changes" ? <div className="client-commercial-state" role="status"><strong>Sales is revising your estimate</strong><p>Your last submitted estimate remains available here. You can review the revised estimate when Sales submits it again.</p>{review.decisionNote ? <blockquote><span>Your requested changes</span><p>{review.decisionNote}</p></blockquote> : null}</div> : null}
    {review.status === "pending" && !available && !completed ? <p role="status">This estimate is not currently available for a decision. Sales will share the next version when it is ready.</p> : null}
    {action.isError ? <div className="client-commercial-state" role="alert"><strong>{action.error instanceof ApiError && action.error.status === 409 ? "This estimate has changed" : "Your decision could not be saved"}</strong><p>{action.error instanceof ApiError ? action.error.message : "Refresh the submitted estimate and try again."}</p></div> : null}
    {needsRefresh ? <Button variant="secondary" busy={refreshing} onClick={() => void refresh()}>Refresh estimate</Button> : available ? <div className="client-commercial-decision__actions"><div><strong>Ready to proceed?</strong><p>Approve this estimate or tell Sales what needs to change.</p></div><Button variant="secondary" disabled={action.isPending} onClick={(event) => openDialog("request_changes", event.currentTarget)}>Request changes</Button><Button disabled={action.isPending} onClick={(event) => openDialog("approve", event.currentTarget)}>Approve estimate</Button></div> : null}
    {dialog && available && !needsRefresh ? <Dialog title={dialog === "approve" ? "Approve this estimate?" : "Request estimate changes"} eyebrow="Estimate review" onClose={() => setDialog(null)} busy={action.isPending} showCloseButton={false} initialFocusRef={dialog === "request_changes" ? noteRef : cancelRef} returnFocusRef={triggerRef} fallbackFocusRef={fallbackRef}>
      <form className="client-estimate-decision-form" aria-label={dialog === "approve" ? "Confirm estimate approval" : "Request estimate changes"} onSubmit={(event) => {
        event.preventDefault();
        if (action.isPending) return;
        if (dialog === "request_changes" && (!note.trim() || note.trim().length > 1000)) { setValidation("Describe the changes you need in 1 to 1,000 characters."); noteRef.current?.focus(); return; }
        action.mutate(dialog);
      }}>
        <div className="client-estimate-decision-form__summary"><strong>{review.snapshot.projectName}</strong><span>Version {review.estimateVersion} · Submission {review.sendGeneration}</span><span>Total including GST</span><strong>{clientEstimateMoney(review.snapshot.total)}</strong></div>
        {dialog === "approve" ? <p>Confirm that you have reviewed the submitted scope and total. Your approval will be recorded for this version.</p> : <label htmlFor={`estimate-change-note-${estimate.id}`}><span>Changes needed <span aria-hidden="true">*</span></span><Textarea ref={noteRef} id={`estimate-change-note-${estimate.id}`} value={note} maxLength={1000} aria-required="true" aria-invalid={Boolean(validation)} aria-describedby={`estimate-note-hint-${estimate.id}`} disabled={action.isPending} onChange={(event) => { setNote(event.target.value); setValidation(""); }} /><span id={`estimate-note-hint-${estimate.id}`} className="client-commercial-review__hint">Tell Sales which items, quantities, or specifications to revise. {note.length}/1,000 characters.</span></label>}
        {validation ? <p role="alert">{validation}</p> : null}
        <div className="client-estimate-decision-form__actions"><Button ref={cancelRef} variant="secondary" disabled={action.isPending} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" busy={action.isPending} busyLabel="Saving decision…">{dialog === "approve" ? "Confirm approval" : "Send change request"}</Button></div>
      </form>
    </Dialog> : null}
  </div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable";
}
