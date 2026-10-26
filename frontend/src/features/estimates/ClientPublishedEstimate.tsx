import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing } from "../../../../shared/estimation/estimateComponentPricing";
import { EstimateComponentBreakdown } from "../leads/EstimateComponentBreakdown";
import { KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { EstimateClientReviewSnapshot } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { Textarea } from "../../components/ui/Field";
import { clientKeys } from "../client/clientApi";
import { estimateRequirementsKeys } from "../client/estimateRequirementsApi";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import { estimateDesignKeys } from "../leads/estimateDesignApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { decideEstimateAsClient, downloadClientEstimatePdf, estimateWorkflowKeys, type EstimateQueueItem } from "./estimateWorkflowApi";

export const clientEstimateMoney = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function ClientPublishedEstimate({ estimate, decisionBlocked = false }: { estimate: EstimateQueueItem; decisionBlocked?: boolean }) {
  const reviewSectionRef = useRef<HTMLElement>(null);
  const review = estimate.publishedReview;
  const displayedItemCount = review?.snapshot.lineItems.filter((item) => item.included).length ?? 0;
  if (!review || estimate.reviewSourceIssue) return <div className="client-commercial-state" role="status">
    <strong>Submitted estimate unavailable</strong>
    <p>The submitted version could not be verified. Please ask your Sales team to submit the estimate again.</p>
  </div>;

  return <section className="client-commercial-review" aria-label="Submitted estimate" ref={reviewSectionRef} tabIndex={-1}>
    <div className="client-commercial-review__metadata">
      {review.phase ? <strong>{review.phase === "post" ? "Final post-estimate" : "Pre-estimate"}</strong> : null}
      <span>Version {review.estimateVersion} · Submission {review.sendGeneration}</span>
      <span>Submitted {formatDate(review.submittedAt)}</span>
      <span className="client-commercial-status">{review.status === "approved" ? "Approved" : review.status === "changes_requested" ? "Changes requested" : review.status === "superseded" ? "Review withdrawn" : "Awaiting your review"}</span>
    </div>
    <p>{review.snapshot.clientName} · {review.snapshot.location}</p>
    <p className="client-commercial-review__hint">{displayedItemCount ? `${displayedItemCount} ${displayedItemCount === 1 ? "item" : "items"} shown · ` : ""}GST included</p>
    {review.phase === "post" ? <PreEstimateComparison estimate={estimate} /> : null}
    <PublishedEstimateDetails snapshot={review.snapshot} />
    <ClientEstimateDecision key={`${review.id}:${review.version}`} estimate={estimate} review={review} decisionBlocked={decisionBlocked || (review.phase === "post" && (!estimate.preApprovedReview || !estimate.changesFromPre))} fallbackRef={reviewSectionRef} />
  </section>;
}

function PreEstimateComparison({ estimate }: { estimate: EstimateQueueItem }) {
  const before = estimate.preApprovedReview;
  const after = estimate.publishedReview;
  const changes = estimate.changesFromPre;
  if (!before || !after || !changes) return <p role="status">The comparison with your approved pre-estimate is unavailable. Ask your team to verify it before approving.</p>;
  const describe = (line: EstimateClientReviewSnapshot["lineItems"][number] | undefined) => line
    ? `${line.mainLineName ?? line.specification ?? "Estimate item"} · ${line.roomName} · ${line.quantity} ${line.uomName ?? line.unit}${line.dimensions ? ` · Dimensions ${line.dimensions.length} × ${line.dimensions.width} × ${line.dimensions.height}${line.dimensionRule ? ` ${line.dimensionRule.inputUnit}` : ""} (L × W × H)` : ""}`
    : "Item details unavailable";
  const row = (snapshot: EstimateClientReviewSnapshot, id: string) => snapshot.lineItems.find((line) => line.id === id);
  return <div className="client-commercial-state" aria-label="Changes from pre-estimate">
    <strong>{changes.noChanges ? "No changes from pre-estimate" : "Changes from your approved pre-estimate"}</strong>
    <p>Pre-estimate {clientEstimateMoney(before.snapshot.totalPaise === undefined ? before.snapshot.total : before.snapshot.totalPaise / 100)} · Final submitted estimate {clientEstimateMoney(after.snapshot.totalPaise === undefined ? after.snapshot.total : after.snapshot.totalPaise / 100)}</p>
    {changes.scopeChanged ? <p>Room or scope details have changed. Review the submitted scope before approving.</p> : null}
    {!changes.noChanges ? <ul>
      {changes.addedLineIds.map((id) => <li key={`added-${id}`}>Added: {describe(row(after.snapshot, id))}</li>)}
      {changes.removedLineIds.map((id) => <li key={`removed-${id}`}>Removed: {describe(row(before.snapshot, id))}</li>)}
      {changes.changedLineIds.map((id) => <li key={`changed-${id}`}>Updated: {describe(row(after.snapshot, id))}. Previously: {describe(row(before.snapshot, id))}.</li>)}
    </ul> : null}
    <details><summary>View approved pre-estimate · Version {before.estimateVersion}</summary>
      <PublishedEstimateDetails snapshot={before.snapshot} />
      <DownloadButton label="Download approved pre-estimate" loadingLabel="Preparing pre-estimate…" errorMessage="The approved pre-estimate could not be downloaded. Please try again."
        fallbackFilename="approved-pre-estimate.pdf" getFile={() => downloadClientEstimatePdf(estimate.id, before.reviewRoundId)} />
    </details>
  </div>;
}

function PublishedEstimateDetails({ snapshot }: { snapshot: EstimateClientReviewSnapshot }) {
  const included = snapshot.lineItems.filter((item) => item.included);
  const configuredDetails = (item: typeof included[number]) => item.itemType === "temporary"
    ? `${item.subBasketId === null ? item.mainBasketName ?? "Configured items" : item.subBasketName ?? "Sub Basket"} · Temporary item · ${item.roomName}`
    : `${item.subBasketName ?? "Sub Basket"} · ${item.roomName}`;
  const catalogue = new Map<string, { description: string; sectionId: string }>(estimateBuilderSections.flatMap((section) => section.rows.map((row) => [row.id, { description: row.description, sectionId: section.id }] as const)));
  const groups: Array<{ id: string; label: string; items: typeof included }> = [];
  for (const item of included) {
    const legacySection = item.source === "configuration" ? undefined : catalogue.get(item.catalogueId)?.sectionId;
    const id = item.source === "configuration" ? `configured:${item.mainBasketId}` : legacySection ?? "other";
    let group = groups.find((entry) => entry.id === id);
    if (!group) {
      group = {
        id,
        label: item.source === "configuration"
          ? item.mainBasketName ?? "Configured items"
          : estimateBuilderSections.find((section) => section.id === legacySection)?.label ?? "Other items",
        items: []
      };
      groups.push(group);
    }
    group.items.push(item);
  }
  const pricing = (item: typeof included[number]) => item.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS && item.pricingMode === "in_house" && item.rateSource === "configuration" && readEstimateComponentPricing(item.componentPricing)?.totalPaise === item.amountPaise ? readEstimateComponentPricing(item.componentPricing) : null;
  const amount = (value: typeof included[number]) => value.amountPaise === undefined
    ? value.amount : value.amountPaise === null ? null : value.amountPaise / 100;
  return <details className="client-commercial-details" open>
    <summary>Review section-wise estimate</summary>
    <div className="client-commercial-details__sections">
      {groups.map((group) => <details className="client-commercial-section" key={group.id} open>
        <summary><span>{group.label}</span><strong>{clientEstimateMoney(group.items.reduce((total, item) => total + (amount(item) ?? 0), 0))}</strong></summary>
        <div className="client-commercial-lines">
          {group.items.map((item, index) => <div className="client-commercial-line" key={`${item.catalogueId}:${item.roomName}:${index}`}>
            <div><strong>{item.source === "configuration" ? item.mainLineName ?? (item.itemType === "temporary" ? "Temporary item" : "Main Line") : catalogue.get(item.catalogueId)?.description ?? item.catalogueId}</strong><span>{item.source === "configuration" ? configuredDetails(item) : item.roomName}</span>{item.source === "configuration" ? <span>Configuration tier: {KNOWLEDGE_MODE_TIER_LABELS[item.modeTier ?? "signature"]}</span> : null}{item.dimensions ? <span>Dimensions: {item.dimensions.length} × {item.dimensions.width} × {item.dimensions.height}{item.dimensionRule ? ` ${item.dimensionRule.inputUnit}` : ""} (L × W × H){item.dimensionsMandatory ? " · Quantity = L × W" : " · Recorded measurements"}</span> : null}{item.specification ? <span>{item.specification}</span> : null}{item.estimateNotes?.map((note, noteIndex) => <span key={noteIndex}>{note}</span>)}</div>
            <div className="client-commercial-line__quantity"><span>Quantity / rate</span><span>{item.quantity} {item.source === "configuration" ? item.uomName ?? item.unit : item.unit} × {pricing(item) ? "Calculated from components" : item.rate === null ? "Rate unavailable" : clientEstimateMoney(item.ratePaise === undefined || item.ratePaise === null ? item.rate : item.ratePaise / 100)}</span></div>
            <strong className="client-commercial-line__amount">{amount(item) === null ? "Amount unavailable" : clientEstimateMoney(amount(item)!)}</strong>
            {pricing(item) ? <EstimateComponentBreakdown pricing={pricing(item)!} label={item.mainLineName ?? "Main Line"} /> : null}
          </div>)}
        </div>
      </details>)}
      {!included.length ? <p>View the PDF/quotation for the item breakdown.</p> : null}
      <dl className="client-commercial-totals">
        <div><dt>Subtotal</dt><dd>{clientEstimateMoney(snapshot.subtotalPaise === undefined ? snapshot.subtotal : snapshot.subtotalPaise / 100)}</dd></div>
        <div><dt>GST</dt><dd>{clientEstimateMoney(snapshot.gstPaise === undefined ? snapshot.gst : snapshot.gstPaise / 100)}</dd></div>
        <div><dt>Total including GST</dt><dd>{clientEstimateMoney(snapshot.totalPaise === undefined ? snapshot.total : snapshot.totalPaise / 100)}</dd></div>
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
  const phaseName = review.phase === "post" ? "final post-estimate" : review.phase === "pre" ? "pre-estimate" : "estimate";
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
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: estimateRequirementsKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["estimate-collaboration"] })
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
    {review.status === "approved" || completed === "approve" ? <div className="client-commercial-state" role="status"><strong>{review.phase === "post" ? "Final post-estimate approved" : review.phase === "pre" ? "Pre-estimate approved" : "Estimate approved"}</strong><p>{review.phase === "post" ? "Your final approval is recorded and estimate changes are closed. Your team will confirm the initial payment before issuing work orders." : review.phase === "pre" ? "Your pre-estimate approval is recorded. Design and procurement preparation can continue while your team prepares the final estimate." : "Your approved estimate is recorded. Follow the project workflow below, or review the design plan when it is submitted."}</p></div> : null}
    {review.status === "changes_requested" || completed === "request_changes" ? <div className="client-commercial-state" role="status"><strong>Sales is revising your estimate</strong><p>Your last submitted estimate remains available here. You can review the revised estimate when Sales submits it again.</p>{review.decisionNote ? <blockquote><span>Your requested changes</span><p>{review.decisionNote}</p></blockquote> : null}</div> : null}
    {review.status === "superseded" ? <div className="client-commercial-state" role="status"><strong>This submitted review was withdrawn</strong><p>Your team is revising the estimate. This submission remains available as history; review the next submission when it is ready.</p></div> : null}
    {review.status === "pending" && !available && !completed ? <p role="status">This estimate is not currently available for a decision. Sales will share the next version when it is ready.</p> : null}
    {action.isError ? <div className="client-commercial-state" role="alert"><strong>{action.error instanceof ApiError && action.error.status === 409 ? "This estimate has changed" : "Your decision could not be saved"}</strong><p>{action.error instanceof ApiError ? action.error.message : "Refresh the submitted estimate and try again."}</p></div> : null}
    {needsRefresh ? <Button variant="secondary" busy={refreshing} onClick={() => void refresh()}>Refresh estimate</Button> : available ? <div className="client-commercial-decision__actions"><div><strong>Ready to proceed?</strong><p>Approve this {phaseName} or tell your team what needs to change.</p></div><Button variant="secondary" disabled={action.isPending} onClick={(event) => openDialog("request_changes", event.currentTarget)}>Request changes</Button><Button disabled={action.isPending} onClick={(event) => openDialog("approve", event.currentTarget)}>Approve {phaseName}</Button></div> : null}
    {dialog && available && !needsRefresh ? <Dialog title={dialog === "approve" ? `Approve this ${phaseName}?` : "Request estimate changes"} eyebrow="Estimate review" onClose={() => setDialog(null)} busy={action.isPending} showCloseButton={false} initialFocusRef={dialog === "request_changes" ? noteRef : cancelRef} returnFocusRef={triggerRef} fallbackFocusRef={fallbackRef}>
      <form className="client-estimate-decision-form ui-dialog__form" aria-label={dialog === "approve" ? "Confirm estimate approval" : "Request estimate changes"} onSubmit={(event) => {
        event.preventDefault();
        if (action.isPending) return;
        if (dialog === "request_changes" && (!note.trim() || note.trim().length > 1000)) { setValidation("Describe the changes you need in 1 to 1,000 characters."); noteRef.current?.focus(); return; }
        action.mutate(dialog);
      }}>
        <div className="ui-dialog__body">
          <div className="client-estimate-decision-form__summary"><strong>{review.snapshot.projectName}</strong><span>Version {review.estimateVersion} · Submission {review.sendGeneration}</span><span>Total including GST</span><strong>{clientEstimateMoney(review.snapshot.totalPaise === undefined ? review.snapshot.total : review.snapshot.totalPaise / 100)}</strong></div>
          {dialog === "approve" && review.phase === "post" ? <p>Final approval closes estimate changes. Work orders remain subject to initial payment confirmation and the required procurement checks.</p> : null}
          {dialog === "approve" ? <p>Confirm that you have reviewed the submitted scope and total. Your approval will be recorded for this version.</p> : <label htmlFor={`estimate-change-note-${estimate.id}`}><span>Changes needed <span aria-hidden="true">*</span></span><Textarea ref={noteRef} id={`estimate-change-note-${estimate.id}`} value={note} maxLength={1000} aria-required="true" aria-invalid={Boolean(validation)} aria-describedby={`estimate-note-hint-${estimate.id}`} disabled={action.isPending} onChange={(event) => { setNote(event.target.value); setValidation(""); }} /><span id={`estimate-note-hint-${estimate.id}`} className="client-commercial-review__hint">Tell Sales which items, quantities, or specifications to revise. {note.length}/1,000 characters.</span></label>}
          {validation ? <p role="alert">{validation}</p> : null}
        </div>
        <div className="client-estimate-decision-form__actions ui-dialog__actions"><Button ref={cancelRef} variant="secondary" disabled={action.isPending} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" busy={action.isPending} busyLabel="Saving decision…">{dialog === "approve" ? "Confirm approval" : "Send change request"}</Button></div>
      </form>
    </Dialog> : null}
  </div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable";
}
