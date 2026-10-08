import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { vendorWorkProgressKey } from "../workflow/VendorWorkProgressPanel";
import { purchaseOrderKeys } from "./purchaseOrderApi";
import {
  decideBasketApproval, getBasketApprovalDetail, getBasketApprovalQueue,
  procurementBasketApprovalKeys, procurementBasketKeys, type BasketApprovalQueueItem, type BasketAward
} from "./procurementBasketApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import "./procurementBasket.css";

function approvalName(slot: BasketApprovalQueueItem["slot"]): string {
  return slot === "program_manager" ? "Site Manager" : slot.replaceAll("_", " ");
}

function decisionMessage(award: BasketAward, value: "approve" | "reject"): string {
  if (value === "reject") return "Your rejection was recorded on this award revision.";
  if (award.status === "issued") return "Your approval was recorded. The work order is issued and its payment schedule is locked.";
  if (award.status === "ready_to_issue") return "Your approval was recorded. Procurement needs to complete work order issuance.";
  return "Your approval was recorded on this award revision.";
}

function ApprovalDetail({ item, onBack }: { item: BasketApprovalQueueItem; onBack: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: procurementBasketApprovalKeys.detail(item.awardId), queryFn: ({ signal }) => getBasketApprovalDetail(item.awardId, signal) });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const decisionRequest = useRef<{ signature: string; key: string } | null>(null);
  const refreshAwardConsumers = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.queue }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.comparison(item.projectId, item.mainBasketId, item.enquiryId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.award(item.projectId, item.mainBasketId, item.awardId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.enquiries(item.projectId, item.mainBasketId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.list(item.projectId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.detail(item.projectId, item.mainBasketId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.monitor(item.projectId, item.mainBasketId, item.awardId) }),
    queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(item.projectId) }),
    queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(item.projectId) }),
    queryClient.invalidateQueries({ queryKey: vendorWorkProgressKey(item.projectId) })
  ]);
  const decision = useMutation({ mutationFn: (value: "approve" | "reject") => {
    if (!detail.data?.proposalRevisionId) throw new Error("The award revision is unavailable. Refresh before deciding.");
    if (value === "reject" && !reason.trim()) throw new Error("Give a rejection reason.");
    if (value === "approve" && item.slot === "budget_override" && reason.trim().length < 10) throw new Error("Give a budget override reason of at least 10 characters.");
    const signature = JSON.stringify({ awardId: item.awardId, proposalRevisionId: detail.data.proposalRevisionId,
      slot: item.slot, decision: value, reason: reason.trim() || null });
    const idempotencyKey = decisionRequest.current?.signature === signature
      ? decisionRequest.current.key : procurementRequestKey();
    decisionRequest.current = { signature, key: idempotencyKey };
    return decideBasketApproval(item.awardId, { expectedVersion: detail.data.version, proposalRevisionId: detail.data.proposalRevisionId,
      slot: item.slot, decision: value, reason: reason.trim() || null, idempotencyKey });
  }, onSuccess: async (saved, value) => {
    setError(""); setSuccess(decisionMessage(saved, value));
    queryClient.setQueryData(procurementBasketApprovalKeys.detail(item.awardId), saved);
    await refreshAwardConsumers();
  }, onError: async (cause, value) => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.detail(item.awardId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.queue })
    ]);
    const refreshed = queryClient.getQueryData<BasketAward>(procurementBasketApprovalKeys.detail(item.awardId));
    if (refreshed && detail.data && refreshed.proposalRevisionId === detail.data.proposalRevisionId &&
      refreshed.approvals.some((approval) => approval.slot === item.slot && approval.decision === value)) {
      setError(""); setSuccess(decisionMessage(refreshed, value));
      await refreshAwardConsumers();
      return;
    }
    setSuccess(""); setError(procurementError(cause, "This award decision could not be recorded."));
  } });
  if (detail.isPending) return <PageState state="loading" message="Loading award revision…" />;
  if (detail.isError) return <PageState state="error" message={procurementError(detail.error, "The award could not be loaded.")} action={{ label: "Try again", onAction: () => void detail.refetch() }} />;
  const award = detail.data;
  const alreadyDecided = award.approvals.some((approval) => approval.slot === item.slot);
  const roleSlot = item.slot === "budget_override" ? null : item.slot;
  const roleRows = roleSlot ? award.proposal.milestones.filter((milestone) => milestone.reviewerSlots?.includes(roleSlot)) : [];
  const recordedChips = award.proposal.milestones.every((milestone) => milestone.reviewerSlots !== undefined);
  return <section className="procurement-basket__approval-detail" aria-labelledby="approval-detail-title"><button type="button" onClick={onBack}>← Back to approvals</button><div className="procurement-basket__monitor-head"><div><p className="eyebrow">{item.projectName} / {item.basketName}</p><h2 id="approval-detail-title">{item.vendorName}</h2><p>{approvalName(item.slot)} decision · Proposal revision {award.proposal.revision}</p></div><strong>{formatPaise(award.proposal.totals.totalPaise)}</strong></div>
    <p className="procurement-basket__approval-note">Review the frozen bid, approved estimate comparison and payment schedule before deciding. Your decision applies only to this proposal revision.</p>
    <dl className="procurement-basket__monitor-totals"><div><dt>Quote before GST</dt><dd>{formatPaise(award.proposal.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(award.proposal.totals.gstPaise)}</dd></div><div><dt>Gross award</dt><dd>{formatPaise(award.proposal.totals.totalPaise)}</dd></div><div><dt>Approved basket estimate</dt><dd>{formatPaise(award.proposal.approvedEstimatePaise)}</dd></div><div><dt>Already committed net</dt><dd>{formatPaise(award.proposal.committedNetPaise)}</dd></div></dl>
    <div className="procurement-basket__table-wrap"><table aria-label="Proposed work order lines and details"><thead><tr><th scope="col">Awarded line</th><th scope="col">Quantity</th><th scope="col">Rate</th><th scope="col">Net</th><th scope="col">Scope</th><th scope="col">Target date</th><th scope="col">Delivery location</th></tr></thead><tbody>{award.lines.map((line) => {
      const detail = award.proposal.lineTerms?.find((item) => item.boqLineId === line.boqLineId);
      return <tr key={line.boqLineId}><th scope="row">{line.description}</th><td>{line.quantityMilliUnits / 1000} {line.uomCode}</td><td>{formatPaise(line.unitPricePaise)}</td><td>{formatPaise(line.netPaise)}</td><td>{detail?.scopeType?.replaceAll("_", " ") ?? "Not specified"}</td><td>{detail?.targetDate ?? "Not specified"}</td><td>{detail?.deliveryLocation ?? "Not specified"}</td></tr>;
    })}</tbody></table></div>
    <div className="procurement-basket__approval-columns"><section><h3>Payment schedule</h3><ol className="procurement-basket__monitor-list">{award.proposal.milestones.map((milestone) => <li key={milestone.id}><strong>{milestone.name}</strong><span>{(milestone.basisPoints / 100).toFixed(2)}% · {formatPaise(milestone.amountPaise)}</span></li>)}</ol></section><section><h3>Required decisions</h3><ul className="procurement-basket__monitor-list">{award.proposal.requiredSlots.map((slot) => { const approval = award.approvals.find((value) => value.slot === slot); return <li key={slot}><strong>{approvalName(slot)}</strong><span>{approval ? approval.decision === "approve" ? "Approved" : "Rejected" : "Pending"}</span></li>; })}</ul></section></div>
    <section className="procurement-basket__approval-rows" aria-label="Payment rows for your approval"><h3>Payment rows for your approval</h3>{!roleSlot ? <p>The budget override covers the full award.</p> : !recordedChips ? <p>Approver chips not recorded on this earlier proposal.</p> : roleRows.length ? <ul className="procurement-basket__monitor-list">{roleRows.map((milestone) => <li key={milestone.id}><strong>{milestone.name}</strong><span>{(milestone.basisPoints / 100).toFixed(2)}% · {formatPaise(milestone.amountPaise)}</span></li>)}</ul> : <p>No payment rows are assigned to this role on the current revision.</p>}</section>
    <section className="procurement-basket__decision"><h3>Your decision</h3>{alreadyDecided ? <p>This role slot already has a decision on the current revision.</p> : award.status !== "pending_approvals" ? <p>This award is {award.status.replaceAll("_", " ")} and is not awaiting your decision.</p> : <><label>Reason {item.slot === "budget_override" ? "for budget override" : "(required to reject)"}<textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} /></label><div><button type="button" disabled={decision.isPending || detail.isFetching || item.slot === "budget_override" && reason.trim().length < 10} onClick={() => decision.mutate("approve")}>Approve revision</button><button type="button" disabled={decision.isPending || detail.isFetching || !reason.trim()} onClick={() => decision.mutate("reject")}>Reject revision</button></div></>}{error ? <p role="alert" className="procurement-basket__error">{error}</p> : null}{success ? <p role="status" className="procurement-basket__notice">{success}</p> : null}</section>
  </section>;
}

export function ProcurementBasketApprovalQueue() {
  const [selected, setSelected] = useState<BasketApprovalQueueItem | null>(null);
  const queue = useQuery({ queryKey: procurementBasketApprovalKeys.queue, queryFn: ({ signal }) => getBasketApprovalQueue(signal) });
  return <main className="procurement-basket procurement-basket__approvals-page"><PageHeader id="basket-approval-page-title" eyebrow="Procurement" title="Work order approvals" description="Review your assigned approval slot on each current award revision." breadcrumb={<Link to="/home">Back to home</Link>} />
    {selected ? <ApprovalDetail item={selected} onBack={() => setSelected(null)} /> : queue.isPending ? <PageState state="loading" message="Loading work order approvals…" /> : queue.isError ? <PageState state="error" message={procurementError(queue.error, "Work order approvals could not be loaded.")} action={{ label: "Try again", onAction: () => void queue.refetch() }} /> : !queue.data.length ? <PageState state="empty" message="No submitted work order approvals are assigned to your account." /> : <section className="procurement-basket__approval-queue" aria-label="Assigned work orders"><div className="procurement-basket__section-head"><h2>Assigned awards</h2><span>{queue.data.length} to review</span></div><ul>{queue.data.map((item) => <li key={`${item.awardId}:${item.slot}`}><button type="button" onClick={() => setSelected(item)}><span><strong>{item.projectName} / {item.basketName}</strong><small>{item.vendorName} · {approvalName(item.slot)} · {item.status.replaceAll("_", " ")}</small></span><strong>{formatPaise(item.grossPaise)}</strong></button></li>)}</ul></section>}
  </main>;
}
