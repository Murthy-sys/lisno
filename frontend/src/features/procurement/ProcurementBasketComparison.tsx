import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { Dialog } from "../../components/ui/Dialog";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { vendorWorkProgressKey } from "../workflow/VendorWorkProgressPanel";
import { purchaseOrderKeys } from "./purchaseOrderApi";
import {
  createBasketAward, decideBasketApproval, getBasketAward, getBasketComparison, issueBasketAward, previewBasketAward,
  procurementBasketApprovalKeys, procurementBasketKeys, requestBasketCounteroffer, submitBasketAward, updateBasketAward,
  withdrawBasketAward, type BasketAward, type BasketAwardApproval, type BasketBidComparisonRow, type BasketEnquiry,
  type BasketMilestoneReviewers, type BasketMilestoneReviewerSlot
} from "./procurementBasketApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";

function score(value: number | null) { return value === null ? "Not rated" : `${(value / 100).toFixed(1)}`; }
function basisPoints(percent: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/u.test(percent.trim())) return null;
  const [whole, fraction = ""] = percent.trim().split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return value <= 10_000 ? value : null;
}
const MILESTONE_IDS: BasketMilestoneReviewers["id"][] = ["advance", "mobilisation", "progress_50", "progress_85", "final"];
const REVIEWERS: Array<{ slot: BasketMilestoneReviewerSlot; label: string }> = [
  { slot: "program_manager", label: "PM" }, { slot: "designer", label: "Design" },
  { slot: "procurement", label: "Proc" }, { slot: "finance_head", label: "Fin" }
];
const REVIEWER_LABELS: Record<BasketMilestoneReviewerSlot, string> = {
  program_manager: "Site Manager", designer: "Designer", procurement: "Procurement", finance_head: "Finance"
};
function defaultReviewers(grossPaise: number | undefined): BasketMilestoneReviewers[] {
  return MILESTONE_IDS.map((id) => ({ id, reviewerSlots: grossPaise !== undefined && grossPaise <= 5_000_000 ? ["procurement"] : [] }));
}
function savedReviewers(award: BasketAward): BasketMilestoneReviewers[] | null {
  return award.proposal.milestones.every((milestone) => milestone.reviewerSlots !== undefined)
    ? MILESTONE_IDS.map((id) => ({ id, reviewerSlots: [...(award.proposal.milestones.find((milestone) => milestone.id === id)?.reviewerSlots ?? [])] }))
    : null;
}
function approvalName(slot: BasketAwardApproval["slot"]): string {
  return slot === "budget_override" ? "Super Admin budget override" : REVIEWER_LABELS[slot];
}
function procurementCanIssue(proposal: Pick<BasketAward["proposal"], "totals" | "requiredSlots" | "budgetOverrideRequired">): boolean {
  return proposal.totals.totalPaise < 5_000_000 && !proposal.budgetOverrideRequired &&
    proposal.requiredSlots.length === 1 && proposal.requiredSlots[0] === "procurement";
}

function AwardWithdrawal({ projectId, basketId, enquiryId, award, frozen, afterChange }: {
  projectId: string; basketId: string; enquiryId: string; award: BasketAward; frozen: boolean; afterChange: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const withdraw = useMutation({ mutationFn: () => withdrawBasketAward(projectId, basketId, enquiryId, award.id,
    { expectedVersion: award.version, idempotencyKey: procurementRequestKey(), reason: reason.trim() }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(procurementBasketKeys.award(projectId, basketId, saved.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: procurementBasketKeys.award(projectId, basketId, saved.id) }),
        queryClient.invalidateQueries({ queryKey: procurementBasketKeys.comparison(projectId, basketId, enquiryId), refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.queue }),
        afterChange()
      ]);
      setEditing(false);
    }, onError: (cause) => setMessage(procurementError(cause, "The award could not be withdrawn. Refresh its current version before retrying.")) });
  if (award.requiresRevision || !["pending_approvals", "ready_to_issue"].includes(award.status)) return null;
  return <section className="procurement-basket__counter" aria-label="Withdraw award to revise BOQ">
    <p>Changing the BOQ now requires withdrawing this approval proposal. Previous decisions remain in history; a revised BOQ and a current vendor bid are required before resubmission.</p>
    {!editing ? <div><button type="button" disabled={frozen} onClick={() => { setMessage(""); setEditing(true); }}>Withdraw award to revise BOQ</button></div> : <>
      <label>Withdrawal reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} disabled={withdraw.isPending} /></label>
      <div><button type="button" onClick={() => setEditing(false)} disabled={withdraw.isPending}>Cancel</button><button type="button" disabled={frozen || withdraw.isPending || reason.trim().length < 10 || reason.trim().length > 2000} onClick={() => withdraw.mutate()}>Confirm withdrawal</button></div>
    </>}
    {message ? <p role="alert" className="procurement-basket__error">{message} <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: procurementBasketKeys.award(projectId, basketId, award.id) })}>Refresh award</button></p> : null}
  </section>;
}

function AwardModal({ projectId, basketId, enquiry, bid, awardId, frozen, onClose, returnFocusRef, afterChange }: {
  projectId: string; basketId: string; enquiry: BasketEnquiry; bid: BasketBidComparisonRow | null;
  awardId: string | null; frozen: boolean;
  onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement | null>; afterChange: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [createdAwardId, setCreatedAwardId] = useState<string | null>(null);
  const activeAwardId = awardId ?? createdAwardId;
  const award = useQuery({ queryKey: procurementBasketKeys.award(projectId, basketId, activeAwardId ?? ""),
    queryFn: ({ signal }) => getBasketAward(projectId, basketId, enquiry.id, activeAwardId!, signal), enabled: Boolean(activeAwardId) });
  const current = award.data ?? null;
  const [advance, setAdvance] = useState(current ? String(current.proposal.advanceBasisPoints / 100) : "20");
  const [milestoneReviewers, setMilestoneReviewers] = useState<BasketMilestoneReviewers[]>(() => defaultReviewers(bid?.quoteGrossPaise ?? current?.proposal.totals.totalPaise));
  const [reviewersTouched, setReviewersTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
  }, []);
  const savedDraftRef = useRef<BasketAward | null>(null);
  const saveRequestRef = useRef<{ signature: string; key: string } | null>(null);
  const submitRequestRef = useRef<{ signature: string; key: string } | null>(null);
  const decisionRequestRef = useRef<{ signature: string; key: string } | null>(null);
  const issueRequestRef = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    if (!current) return;
    setAdvance(String(current.proposal.advanceBasisPoints / 100));
    setMilestoneReviewers(current.bidId === bid?.bidId || !bid ? savedReviewers(current) ?? defaultReviewers(current.proposal.totals.totalPaise) : defaultReviewers(bid.quoteGrossPaise));
    setReviewersTouched(false);
  }, [current?.id, current?.version, bid?.bidId]);
  const bps = basisPoints(advance);
  const previewKey = ["procurement", "award-preview", projectId, basketId, enquiry.id] as const;
  const preview = useQuery({ queryKey: [...previewKey, bid?.bidId, bps, milestoneReviewers],
    queryFn: () => previewBasketAward(projectId, basketId, enquiry.id, { bidId: bid!.bidId, advanceBasisPoints: bps!, milestoneReviewers }),
    enabled: Boolean(bid?.eligible) && bps !== null && !frozen, placeholderData: (previous) => previous });
  const currentPreview = preview.data?.bidId === bid?.bidId && !preview.isPlaceholderData ? preview.data : undefined;
  const previewReady = Boolean(currentPreview && !preview.isFetching && !preview.isError);
  const persistedReviewers = current ? savedReviewers(current) : null;
  const showLegacyReviewers = Boolean(current && !persistedReviewers && !reviewersTouched && (!bid || current.bidId === bid.bidId));
  function reviewersMatch(savedAward: BasketAward): boolean {
    const persisted = savedReviewers(savedAward);
    return !persisted ? !reviewersTouched : MILESTONE_IDS.every((id) => {
      const entered = milestoneReviewers.find((row) => row.id === id)?.reviewerSlots ?? [];
      const saved = persisted.find((row) => row.id === id)?.reviewerSlots ?? [];
      return entered.length === saved.length && entered.every((slot) => saved.includes(slot));
    });
  }
  function matchesCurrentInputs(saved: BasketAward): boolean {
    return Boolean(bid && !saved.requiresRevision && previewReady &&
    saved.bidId === bid.bidId && saved.proposal.advanceBasisPoints === bps &&
    reviewersMatch(saved) &&
    (!currentPreview?.requiredSlots.includes("designer") || saved.proposal.designerId === currentPreview.assignedDesigner?.id) &&
    saved.proposal.totals.netPaise === preview.data?.totals.netPaise &&
    saved.proposal.totals.gstPaise === preview.data?.totals.gstPaise &&
    saved.proposal.totals.totalPaise === preview.data?.totals.totalPaise &&
    saved.proposal.budgetOverrideRequired === preview.data?.budgetOverrideRequired &&
    (!currentPreview?.requiredSlots.includes("program_manager") || saved.proposal.programManagerId === currentPreview.assignedSiteManager?.id) &&
    saved.proposal.recommendedBidId === preview.data?.recommendedBidId &&
    saved.proposal.requiredSlots.join(",") === preview.data?.requiredSlots.join(","));
  }
  const upToDate = Boolean(current && matchesCurrentInputs(current));
  const proposalEditable = Boolean(bid?.eligible) && (!current || ["draft", "rejected", "pending_approvals", "ready_to_issue"].includes(current.status));

  async function refresh(savedAwardId = activeAwardId) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.comparison(projectId, basketId, enquiry.id) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.award(projectId, basketId, savedAwardId ?? "") }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.enquiries(projectId, basketId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.detail(projectId, basketId) }),
      queryClient.invalidateQueries({ queryKey: previewKey }),
      queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.queue }),
      queryClient.invalidateQueries({ queryKey: procurementBasketApprovalKeys.detail(savedAwardId ?? "") }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.monitor(projectId, basketId, savedAwardId ?? "") }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(projectId) }),
      queryClient.invalidateQueries({ queryKey: vendorWorkProgressKey(projectId) })
    ]);
    await afterChange();
  }
  function rememberSaved(saved: BasketAward) {
    savedDraftRef.current = saved;
    queryClient.setQueryData(procurementBasketKeys.award(projectId, basketId, saved.id), saved);
    setCreatedAwardId(saved.id);
  }
  async function issueSaved(saved: BasketAward) {
    const signature = `${saved.id}:${saved.version}`;
    const idempotencyKey = issueRequestRef.current?.signature === signature ? issueRequestRef.current.key : procurementRequestKey();
    issueRequestRef.current = { signature, key: idempotencyKey };
    return issueBasketAward(projectId, basketId, enquiry.id, saved.id, { expectedVersion: saved.version, idempotencyKey });
  }
  const sendForApprovals = useMutation({ mutationFn: async () => {
    if (!bid || !bid.eligible || bps === null)
      throw new Error("Enter a valid advance percentage.");
    let saved = current && (!savedDraftRef.current || current.version >= savedDraftRef.current.version) ? current : savedDraftRef.current;
    if (!saved || saved.status === "rejected" || !matchesCurrentInputs(saved)) {
      const input = saved ? { expectedVersion: saved.version, bidId: bid.bidId, advanceBasisPoints: bps,
        ...(saved.proposal.terms ? { terms: saved.proposal.terms } : {}),
        ...(saved.proposal.lineTerms?.length ? { lineTerms: saved.proposal.lineTerms } : {}),
        milestoneReviewers }
        : { bidId: bid.bidId, advanceBasisPoints: bps, milestoneReviewers, expectedVersion: enquiry.version };
      const signature = JSON.stringify({ awardId: saved?.id ?? null, input });
      const idempotencyKey = saveRequestRef.current?.signature === signature ? saveRequestRef.current.key : procurementRequestKey();
      saveRequestRef.current = { signature, key: idempotencyKey };
      saved = saved ? await updateBasketAward(projectId, basketId, enquiry.id, saved.id, { ...input, idempotencyKey })
        : await createBasketAward(projectId, basketId, enquiry.id, { ...input, idempotencyKey });
      rememberSaved(saved);
    }
    if (!saved.proposalRevisionId) throw new Error("The saved award has no proposal revision. Refresh and try again.");
    rememberSaved(saved);
    if (saved.status === "draft") {
      const signature = `${saved.id}:${saved.version}:${saved.proposalRevisionId}`;
      const idempotencyKey = submitRequestRef.current?.signature === signature ? submitRequestRef.current.key : procurementRequestKey();
      submitRequestRef.current = { signature, key: idempotencyKey };
      saved = await submitBasketAward(projectId, basketId, enquiry.id, saved.id,
        { expectedVersion: saved.version, idempotencyKey, autoIssueOnApproval: true });
      rememberSaved(saved);
    }
    if (procurementCanIssue(saved.proposal) && saved.status === "pending_approvals" &&
      !saved.approvals.some((entry) => entry.slot === "procurement" && entry.decision === "approve")) {
      if (!saved.proposalRevisionId) throw new Error("The saved award has no proposal revision. Refresh and try again.");
      const signature = `${saved.id}:${saved.version}:${saved.proposalRevisionId}:procurement:approve`;
      const idempotencyKey = decisionRequestRef.current?.signature === signature ? decisionRequestRef.current.key : procurementRequestKey();
      decisionRequestRef.current = { signature, key: idempotencyKey };
      saved = await decideBasketApproval(saved.id, { expectedVersion: saved.version, proposalRevisionId: saved.proposalRevisionId,
        slot: "procurement", decision: "approve", idempotencyKey });
      rememberSaved(saved);
      // Older submitted proposals use manual issue; the same Procurement action completes them.
      if (saved.status === "ready_to_issue" && !saved.autoIssueOnApproval && procurementCanIssue(saved.proposal)) {
        await issueSaved(saved);
        saved = await getBasketAward(projectId, basketId, enquiry.id, saved.id);
        rememberSaved(saved);
      }
    }
    savedDraftRef.current = null;
    return saved;
  }, onSuccess: async (submitted) => {
    queryClient.setQueryData(procurementBasketKeys.award(projectId, basketId, submitted.id), submitted);
    setCreatedAwardId(submitted.id);
    setMessage("");
    await refresh(submitted.id);
  }, onError: async (cause) => {
    const saved = savedDraftRef.current;
    if (saved) {
      let refreshed: BasketAward | null = null;
      try {
        refreshed = await getBasketAward(projectId, basketId, enquiry.id, saved.id);
        rememberSaved(refreshed);
        await refresh(saved.id);
      } catch { /* Keep the saved revision and request key for a safe retry. */ }
      if (refreshed && (refreshed.status === "issued" || refreshed.status === "ready_to_issue" ||
        refreshed.status === "pending_approvals" && !procurementCanIssue(refreshed.proposal))) {
        savedDraftRef.current = null;
        setMessage("");
        return;
      }
    }
    setMessage(procurementError(cause, "The award could not be completed. Please retry."));
  } });
  const issue = useMutation({ mutationFn: () => issueSaved(current!), onSuccess: async (issued) => { setMessage(""); await refresh(issued.awardId); }, onError: async (cause) => {
    let refreshed: BasketAward | null = null;
    if (current) try {
      refreshed = await getBasketAward(projectId, basketId, enquiry.id, current.id);
      queryClient.setQueryData(procurementBasketKeys.award(projectId, basketId, current.id), refreshed);
    } catch { /* Preserve the issue error when the status check is also unavailable. */ }
    if (refreshed?.status === "issued") {
      setMessage("");
      try { await refresh(refreshed.id); } catch { /* The issued award is already in the local cache. */ }
      return;
    }
    setMessage(procurementError(cause, "The work order could not be issued."));
  } });
  const result = !bid ? current?.proposal : upToDate && current ? current.proposal : bps === null ? undefined : preview.data;
  const missingReviewers = proposalEditable && result?.totals.totalPaise && result.totals.totalPaise > 5_000_000
    ? REVIEWERS.filter(({ slot }) => !milestoneReviewers.some((row) => row.reviewerSlots.includes(slot))).map(({ slot }) => REVIEWER_LABELS[slot]) : [];
  const approvals = current?.approvals ?? [];
  const awaiting = (current?.proposal.requiredSlots ?? []).filter((slot) => !approvals.some((entry) => entry.slot === slot && entry.decision === "approve"));
  const directIssue = Boolean(result && procurementCanIssue(result));
  const approvalStatus = !current ? directIssue ? "Procurement can issue this work order and lock the payment schedule directly." : "Select the required approvers, then send this award for approvals."
    : current.status === "issued" ? "Work order issued and payment schedule locked."
    : current.status === "rejected" ? directIssue ? "This revision was rejected. Issue a new revision with Procurement approval." : "This revision was rejected. Send a new revision for approvals."
    : current.status === "draft" ? directIssue ? "Procurement can issue this work order and lock the payment schedule directly." : "Not sent. Send this award to create approval tasks."
    : current.status === "ready_to_issue" ? current.issueBlocker ? "Approved. Work order issue is blocked." : "Approved. Work order issue is ready to retry."
    : current.status === "pending_approvals" && directIssue ? "Procurement approval is pending. Issue this work order to approve and lock the payment schedule."
    : current.status === "pending_approvals" ? `Awaiting ${awaiting.map(approvalName).join(", ") || "approval updates"}.`
    : `Award status: ${current.status.replaceAll("_", " ")}.`;
  const needsDesigner = Boolean(currentPreview?.requiredSlots.includes("designer"));
  const needsSiteManager = Boolean(currentPreview?.requiredSlots.includes("program_manager"));
  const approverBlockers = currentPreview?.approverBlockers?.filter(({ slot }) => currentPreview.requiredSlots.includes(slot)) ?? [];
  const missingAssignment = needsDesigner && !currentPreview?.assignedDesigner || needsSiteManager && !currentPreview?.assignedSiteManager;
  const dismissBusy = closing || sendForApprovals.isPending || issue.isPending;
  const busy = frozen || dismissBusy;
  function closeModal() {
    if (dismissBusy) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = setTimeout(onClose, 180);
  }
  const canSend = proposalEditable && (!current || current.status === "draft" || current.status === "rejected" || !upToDate ||
    current.status === "pending_approvals" && directIssue && awaiting.includes("procurement"));
  const canRetryIssue = current?.status === "ready_to_issue" && Boolean(current.proposalRevisionId) && !current.requiresRevision &&
    (!bid || upToDate && approverBlockers.length === 0 && !missingAssignment);
  const displayVendor = bid?.vendorName ?? current?.proposal.vendorName;
  const displayTotals = bid ? { netPaise: bid.quoteNetPaise, gstPaise: bid.quoteGstPaise, totalPaise: bid.quoteGrossPaise } : current?.proposal.totals;
  return <Dialog title="Award vendor" eyebrow="Vendor award" description="Review the vendor, payment schedule and required approvals."
    className={`procurement-basket__award-modal${closing ? " is-closing" : ""}`}
    layerClassName={`procurement-basket__award-layer${closing ? " is-closing" : ""}`}
    showCloseButton={false} onClose={closeModal} initialFocusRef={closeButtonRef} returnFocusRef={returnFocusRef} busy={dismissBusy}>
    <button ref={closeButtonRef} type="button" className="procurement-basket__award-modal-close" aria-label="Close award vendor" onClick={closeModal} disabled={dismissBusy}><span aria-hidden="true">×</span></button>
    <div className="procurement-basket__award-modal-body" role="region" aria-label="Award details" tabIndex={0}><div className="procurement-basket__award">{award.isPending && activeAwardId ? <PageState state="loading" message="Loading saved award…" /> : award.isError ? <p role="alert" className="procurement-basket__error">{procurementError(award.error, "The saved award could not be loaded.")}</p> : null}
      {!bid && current ? <p role="alert" className="procurement-basket__notice">This saved bid is no longer current. Review its frozen proposal below, then choose an eligible current bid and send a new revision for approvals.</p> : null}
      {current?.requiresRevision ? <p role="alert" className="procurement-basket__notice">This award was withdrawn for a BOQ revision. Resend the revised BOQ and choose a current bid before sending it again.</p> : null}
      {bid && current && current.bidId !== bid.bidId ? <p className="procurement-basket__notice">Sending this bid will create a new proposal revision. Existing approvals remain in history and the new revision needs its own approvals.</p> : null}
      {bid && current && current.bidId === bid.bidId && preview.data && !upToDate ? <p className="procurement-basket__notice">The saved proposal differs from the current inputs or server calculation. Sending it will create a new approval revision.</p> : null}
      <div className="procurement-basket__award-vendor"><div><span>{bid ? "Selected vendor" : "Saved award"}</span><h3>{displayVendor ?? "Vendor unavailable"}</h3><p>{bid ? `KPI ${score(bid.officialKpiScoreBps)} · Comparison ${score(bid.comparisonScoreBps)}` : `Proposal revision ${current?.proposal.revision ?? "unavailable"}`}</p></div><strong>{displayTotals ? formatPaise(displayTotals.totalPaise) : "Amount unavailable"}</strong></div>
      {displayTotals ? <div className="procurement-basket__award-total"><span>Quote before GST <strong>{formatPaise(displayTotals.netPaise)}</strong></span><span>GST <strong>{formatPaise(displayTotals.gstPaise)}</strong></span><span>Contract gross <strong>{formatPaise(displayTotals.totalPaise)}</strong></span></div> : null}
      <div className="procurement-basket__award-schedule"><div className="procurement-basket__section-head"><div><h3>Payment schedule</h3></div></div><label>Advance payment percentage <input type="text" inputMode="decimal" value={advance} onChange={(event) => setAdvance(event.target.value)} disabled={!proposalEditable || busy} aria-describedby="award-advance-hint" /> %</label><p id="award-advance-hint">The server calculates each rupee amount. The milestone shares must total 100%.</p>
        {needsSiteManager && currentPreview?.assignedSiteManager ? <p>Assigned project Site Manager: <strong>{currentPreview.assignedSiteManager.name}</strong></p> : null}
        {needsDesigner && currentPreview?.assignedDesigner ? <p>Assigned project Designer: <strong>{currentPreview.assignedDesigner.name}</strong></p> : null}
        {bid && preview.isFetching && preview.data ? <p role="status">Updating payment schedule…</p> : null}
        {bid && preview.isPending ? <p role="status">Calculating payment schedule…</p> : bid && preview.isError ? <p role="alert" className="procurement-basket__error">{procurementError(preview.error, "The payment schedule could not be calculated.")}</p> : result ? <ol>{result.milestones.map((milestone) => <li key={milestone.id}><span>{milestone.name}</span><span>{(milestone.basisPoints / 100).toFixed(2)}%</span><strong>{formatPaise(milestone.amountPaise)}</strong><div className="procurement-basket__reviewer-chips" role="group" aria-label={`${milestone.name} approvers`}>{showLegacyReviewers ? <span>Approver chips not recorded</span> : REVIEWERS.map(({ slot, label }) => <button key={slot} type="button" aria-label={`${milestone.name} ${REVIEWER_LABELS[slot]} approver`} aria-pressed={milestoneReviewers.find((row) => row.id === milestone.id)?.reviewerSlots.includes(slot) ?? false} disabled={!proposalEditable || busy || result.totals.totalPaise <= 5_000_000} onClick={() => { setReviewersTouched(true); setMilestoneReviewers((rows) => rows.map((row) => row.id !== milestone.id ? row : { ...row, reviewerSlots: row.reviewerSlots.includes(slot) ? row.reviewerSlots.filter((selected) => selected !== slot) : [...row.reviewerSlots, slot] })); }}>{label}</button>)}</div></li>)}</ol> : null}
        {result && result.totals.totalPaise <= 5_000_000 ? <p>Procurement reviews every payment row. Other approvers are unavailable for this amount.</p> : null}
        {missingReviewers.length ? <p role="status" className="procurement-basket__reviewer-warning">Select {missingReviewers.join(", ")} on at least one payment row before submitting.</p> : null}
      </div>
      {result ? <p className="procurement-basket__approval-status" role="status">{approvalStatus}</p> : null}
      {result?.requiredSlots.includes("budget_override") ? <p className="procurement-basket__notice">A Super Admin budget override approval is required before this work order can be issued.</p> : null}
      {current?.status === "ready_to_issue" && current.issueBlocker ? <p role="alert" className="procurement-basket__error">{current.issueBlocker.message}</p> : null}
      {showLegacyReviewers && proposalEditable && !frozen && bid ? <button className="procurement-basket__choose-reviewers" type="button" onClick={() => setReviewersTouched(true)}>Select approvers for a new revision</button> : null}
      {approverBlockers.map((blocker) => <p key={`${blocker.slot}:${blocker.code}`} role="alert" className="procurement-basket__error">{blocker.message}</p>)}
      {message ? <p role={sendForApprovals.isError || issue.isError ? "alert" : "status"} className={sendForApprovals.isError || issue.isError ? "procurement-basket__error" : "procurement-basket__notice"}>{message}</p> : null}
    </div></div>
    <div className="procurement-basket__award-modal-footer"><div className="procurement-basket__drawer-actions"><button type="button" onClick={closeModal} disabled={dismissBusy}>Close</button>{canSend ? <button type="button" disabled={busy || missingReviewers.length > 0 || bps === null || !previewReady || approverBlockers.length > 0 || missingAssignment} onClick={() => sendForApprovals.mutate()}>{directIssue ? "Issue work order & lock payment" : "Send for approvals"}</button> : null}{canRetryIssue ? <button type="button" disabled={busy} onClick={() => issue.mutate()}>Retry issue and lock</button> : null}</div></div>
  </Dialog>;
}

export function ProcurementBasketComparison({ projectId, basketId, enquiry, frozen, invitationBlocker = null, afterChange }: {
  projectId: string; basketId: string; enquiry: BasketEnquiry; frozen: boolean;
  invitationBlocker?: string | null; afterChange: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const counterBlockerId = useId();
  const comparison = useQuery({ queryKey: procurementBasketKeys.comparison(projectId, basketId, enquiry.id),
    queryFn: ({ signal }) => getBasketComparison(projectId, basketId, enquiry.id, signal) });
  const existingAwardId = enquiry.awardId ?? comparison.data?.awardId ?? null;
  const existingAward = useQuery({ queryKey: procurementBasketKeys.award(projectId, basketId, existingAwardId ?? ""),
    queryFn: ({ signal }) => getBasketAward(projectId, basketId, enquiry.id, existingAwardId!, signal), enabled: Boolean(existingAwardId) });
  const [counterVendorId, setCounterVendorId] = useState<string | null>(null);
  const [counterReason, setCounterReason] = useState("");
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [message, setMessage] = useState("");
  const awardTrigger = useRef<HTMLButtonElement>(null);
  const counter = useMutation({ mutationFn: (vendorId: string) => requestBasketCounteroffer(projectId, basketId, enquiry.id,
    { vendorId, expectedVersion: enquiry.version, reason: counterReason.trim(), idempotencyKey: procurementRequestKey() }),
    onSuccess: async () => { setCounterVendorId(null); setCounterReason(""); setMessage("Counteroffer request recorded for this vendor.");
      await Promise.all([queryClient.invalidateQueries({ queryKey: procurementBasketKeys.comparison(projectId, basketId, enquiry.id) }), afterChange()]); },
    onError: (cause) => setMessage(procurementError(cause, "The counteroffer request could not be sent.")) });
  if (comparison.isPending || (existingAwardId && existingAward.isPending))
    return <PageState state="loading" message="Loading vendor bids…" />;
  if (existingAward.isError)
    return <PageState state="error" message={procurementError(existingAward.error, "The saved award could not be loaded.")}
      action={{ label: "Try again", onAction: () => void existingAward.refetch() }} />;
  if (comparison.isError) return <section className="procurement-basket__comparison" aria-label="Award recovery">
    <PageState state="error" message={procurementError(comparison.error, "Bid comparison is unavailable. Refresh after revising the BOQ.")}
      action={{ label: "Retry comparison", onAction: () => void comparison.refetch() }} />
    {existingAward.data?.requiresRevision ? <p role="status" className="procurement-basket__notice">
      This award was withdrawn. Revise and resend the BOQ above, then select a current bid for a new approval proposal.</p> : null}
    {existingAward.data ? <div className="procurement-basket__section-head">
      <button type="button" onClick={(event) => { awardTrigger.current = event.currentTarget; setReviewSaved(true); }}>Review saved award</button>
      <AwardWithdrawal projectId={projectId} basketId={basketId} enquiryId={enquiry.id} award={existingAward.data}
        frozen={frozen} afterChange={afterChange} /></div> : null}
    {reviewSaved && existingAward.data ? <AwardModal key="saved-recovery" projectId={projectId} basketId={basketId}
      enquiry={enquiry} bid={null}
      awardId={existingAwardId} frozen={frozen} onClose={() => setReviewSaved(false)}
      returnFocusRef={awardTrigger} afterChange={afterChange} /> : null}
  </section>;
  const rows = [...comparison.data.rows].sort((first, second) =>
    (first.priorityRank ?? Number.MAX_SAFE_INTEGER) - (second.priorityRank ?? Number.MAX_SAFE_INTEGER));
  const selected = rows.find((row) => row.bidId === selectedBidId) ?? null;
  const savedBid = rows.find((row) => row.bidId === existingAward.data?.bidId) ?? null;
  const activeBid = reviewSaved ? savedBid : selected;
  const canReviseAward = !existingAward.data || ["draft", "rejected", "pending_approvals", "ready_to_issue"].includes(existingAward.data.status) &&
    (!existingAward.data.requiresRevision || Boolean(enquiry.boqRevisionId &&
      enquiry.boqRevisionId !== existingAward.data.proposal.boqRevisionId));
  return <section className="procurement-basket__comparison" aria-labelledby="basket-comparison-title">
    <div className="procurement-basket__section-head"><div><p className="eyebrow">Vendor responses</p>
      <h3 id="basket-comparison-title">Compare bids</h3>
      <p>The score gives equal weight to official Procurement KPI and price normalized to the lowest valid quote.</p></div>
      <button type="button" disabled={comparison.isFetching} onClick={() => void comparison.refetch()}>Refresh bids</button></div>
    {existingAward.data ? <div className="procurement-basket__notice procurement-basket__section-head">
      <p>Saved award: <strong>{existingAward.data.proposal.vendorName}</strong> · Proposal revision {existingAward.data.proposal.revision} · {existingAward.data.status.replaceAll("_", " ")}.
        {!savedBid ? " A newer bid replaced the saved bid; review the frozen proposal and choose a current eligible bid to revise it." : ""}</p>
      <button type="button" disabled={comparison.isFetching || existingAward.isFetching}
        onClick={(event) => { awardTrigger.current = event.currentTarget; setSelectedBidId(null); setReviewSaved(true); }}>Review saved award</button>
    </div> : null}
    {existingAward.data?.requiresRevision ? <p role="status" className="procurement-basket__notice">
      This award was withdrawn. Revise and resend the BOQ, then choose a current bid to save a new approval proposal.</p> : null}
    {existingAward.data ? <AwardWithdrawal projectId={projectId} basketId={basketId} enquiryId={enquiry.id}
      award={existingAward.data} frozen={frozen} afterChange={afterChange} /> : null}
    {comparison.data.averageBidNetPaise === null ? null : <p className="procurement-basket__average-bid">
      Average bid price (before GST) <strong>{formatPaise(comparison.data.averageBidNetPaise)}</strong></p>}
    {invitationBlocker ? <p id={counterBlockerId} className="procurement-basket__send-blocker">Updated bid requests are paused: {invitationBlocker}</p> : null}
    {!rows.length ? <p className="procurement-basket__empty">No complete bids have been received for this BOQ revision yet.</p>
      : <div className="procurement-basket__table-wrap"><table aria-label="Vendor bid comparison">
        <thead><tr><th scope="col">Priority</th><th scope="col">Vendor</th><th scope="col">Vendor unit rates</th>
          <th scope="col">Bid before GST</th><th scope="col">KPI</th><th scope="col">Action</th></tr></thead>
        <tbody>{rows.map((row) => {
          const top = row.eligible && row.priorityRank === 1 && row.bidId === comparison.data.recommendedBidId;
          return <tr key={row.bidId} className={top ? "procurement-basket__recommended" : ""}>
            <td>{row.priorityRank === null ? "Unranked" : `#${row.priorityRank}`}
              {top ? <strong className="procurement-basket__top-priority"><span aria-hidden="true">★</span> Top priority</strong> : null}</td>
            <th scope="row"><strong>{row.vendorName}</strong>
              {!row.eligible && row.blockers.length ? <small>{row.blockers.join(" · ")}</small> : null}</th>
            <td><ul className="procurement-basket__rate-list">{row.lines.map((line) => <li key={line.boqLineId}>
              {line.description}: <strong>{formatPaise(line.unitPricePaise)}</strong> / {line.uomCode}</li>)}</ul></td>
            <td>{formatPaise(row.quoteNetPaise)}</td><td>{score(row.officialKpiScoreBps)}</td>
            <td><div className="procurement-basket__row-actions">
              <button type="button" aria-describedby={invitationBlocker ? counterBlockerId : undefined}
                disabled={frozen || Boolean(invitationBlocker) || comparison.isFetching || !row.eligible || counter.isPending || Boolean(existingAwardId)}
                onClick={() => { setCounterVendorId(row.vendorId); setCounterReason(""); }}>Counteroffer</button>
              <button type="button" disabled={frozen || comparison.isFetching || existingAward.isFetching || !row.eligible || !canReviseAward}
                onClick={(event) => { awardTrigger.current = event.currentTarget; setReviewSaved(false); setSelectedBidId(row.bidId); }}>
                {existingAwardId ? existingAward.data?.bidId === row.bidId ? "Review current bid" : "Revise award to this bid" : "Award"}</button>
            </div></td>
          </tr>;
        })}</tbody></table></div>}
    {counterVendorId ? <div className="procurement-basket__counter"><label>Counteroffer request reason
      <textarea value={counterReason} onChange={(event) => setCounterReason(event.target.value)} /></label>
      <div><button type="button" onClick={() => setCounterVendorId(null)}>Cancel</button>
        <button type="button" aria-describedby={invitationBlocker ? counterBlockerId : undefined}
          disabled={frozen || Boolean(invitationBlocker) || counter.isPending || counterReason.trim().length < 10}
          onClick={() => counter.mutate(counterVendorId)}>Request counteroffer</button></div></div> : null}
    {message ? <p role={counter.isError ? "alert" : "status"}
      className={counter.isError ? "procurement-basket__error" : "procurement-basket__notice"}>{message}</p> : null}
    {selected || reviewSaved && existingAward.data ? <AwardModal
      key={reviewSaved ? "saved" : selected?.bidId}
      projectId={projectId} basketId={basketId} enquiry={enquiry} bid={activeBid}
      awardId={comparison.data.awardId}
      frozen={frozen} onClose={() => { setSelectedBidId(null); setReviewSaved(false); }}
      returnFocusRef={awardTrigger} afterChange={afterChange} /> : null}
  </section>;
}
