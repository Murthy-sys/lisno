import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { PageState } from "../../components/ui/PageState";
import { getPurchaseOrderPreparation, purchaseOrderKeys } from "./purchaseOrderApi";
import { ProcurementBasketComparison } from "./ProcurementBasketComparison";
import { ProcurementBasketMonitor } from "./ProcurementBasketMonitor";
import {
  createBasketEnquiry, createBasketWhatsAppShareIntent, dispatchBasketEnquiry, getProcurementVendorCandidates, listBasketEnquiries,
  previewBasketInvitationBatch, procurementBasketKeys, resendBasketInvitation, submitBasketInvitationBatch, updateBasketEnquiry,
  type BasketBoqLineInput, type BasketEnquiry, type BasketInvitationAction, type BasketInvitationBatchInput,
  type BasketInvitationBatchResult,
  type BasketInvitationSelection, type ProcurementBasketDetail,
  type ProcurementVendorCandidate
} from "./procurementBasketApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import "./procurementBasketEnquiry.css";

function sameBoqLines(saved: BasketEnquiry, lines: BasketBoqLineInput[]) {
  return saved.lines.length === lines.length && saved.lines.every((line, index) =>
    lines[index]?.sourceLineItemKey === line.sourceLineItemKey);
}

function BasketBoqEditor({ projectId, basket, enquiry, frozen, reviseSent, preparationDigest,
  vendorFrozenReason, afterChange }: {
  projectId: string; basket: ProcurementBasketDetail; enquiry: BasketEnquiry | null;
  frozen: boolean; reviseSent: boolean; preparationDigest: string | null;
  vendorFrozenReason: string | null; afterChange: () => Promise<void>;
}) {
  const [savedDraft, setSavedDraft] = useState<BasketEnquiry | null>(null);
  const currentEnquiry = savedDraft && (!enquiry || enquiry.id === savedDraft.id && enquiry.version < savedDraft.version)
    ? savedDraft : enquiry;
  const [loadedBasis, setLoadedBasis] = useState(() => ({
    enquiryId: enquiry?.id ?? null, version: enquiry?.version ?? 0, preparationDigest
  }));
  const [message, setMessage] = useState("");
  const saveCommand = useRef<{ signature: string; key: string } | null>(null);
  const basisChanged = loadedBasis.enquiryId !== (currentEnquiry?.id ?? null) ||
    loadedBasis.version !== (currentEnquiry?.version ?? 0) ||
    loadedBasis.preparationDigest !== preparationDigest;
  const sentSameRevision = currentEnquiry?.status === "sent" && !reviseSent;
  const canEdit = !frozen && !basisChanged &&
    (!currentEnquiry || currentEnquiry.status === "draft" && (!currentEnquiry.boqRevisionId || reviseSent) ||
      currentEnquiry.status === "sent" && reviseSent);

  function payload(): BasketBoqLineInput[] | null {
    const included = basket.lines.filter((line) => line.included);
    if (!included.length) { setMessage("No included approved main lines are available for this BOQ."); return null; }
    setMessage("");
    return included.map((line) => ({ sourceLineItemKey: line.sourceLineItemKey }));
  }
  async function saveBoq(lines: BasketBoqLineInput[]) {
    if (basisChanged) throw new Error("The BOQ changed while you were editing. Load the current BOQ before sending.");
    if (!loadedBasis.preparationDigest) throw new Error("The approved estimate digest is unavailable. Refresh before sending.");
    const signature = JSON.stringify({ id: currentEnquiry?.id ?? null, version: loadedBasis.version,
      preparationDigest: loadedBasis.preparationDigest, lines });
    if (saveCommand.current?.signature !== signature) saveCommand.current = { signature, key: procurementRequestKey() };
    const input = { expectedPreparationDigest: loadedBasis.preparationDigest,
      idempotencyKey: saveCommand.current.key, lines };
    const saved = currentEnquiry
      ? await updateBasketEnquiry(projectId, basket.id, currentEnquiry.id, { ...input, expectedVersion: loadedBasis.version })
      : await createBasketEnquiry(projectId, basket.id, input);
    setSavedDraft(saved);
    setLoadedBasis({ enquiryId: saved.id, version: saved.version, preparationDigest: saved.preparationDigest });
    return saved;
  }
  async function prepareBoq() {
    const lines = payload();
    if (!lines) return null;
    if (currentEnquiry?.status === "draft" && !currentEnquiry.boqRevisionId &&
      currentEnquiry.preparationDigest === preparationDigest &&
      sameBoqLines(currentEnquiry, lines) && !currentEnquiry.lines.some((line) => line.scopeType || line.targetDate || line.deliveryLocation)) return currentEnquiry;
    return saveBoq(lines);
  }
  function loadCurrentBoq() {
    setSavedDraft(null);
    setLoadedBasis({ enquiryId: enquiry?.id ?? null, version: enquiry?.version ?? 0, preparationDigest });
    saveCommand.current = null;
    setMessage("");
  }
  return <>
    <BasketVendorPicker projectId={projectId} basketId={basket.id} enquiry={currentEnquiry}
      boqEditable={canEdit} allowSentRevision={reviseSent} frozenReason={basisChanged && !sentSameRevision ? "Load the current BOQ before sending invitations." : vendorFrozenReason}
      prepareBoq={prepareBoq} afterDispatch={async (sent) => {
        if (sent) {
          setSavedDraft(sent);
          setLoadedBasis({ enquiryId: sent.id, version: sent.version, preparationDigest: sent.preparationDigest });
        }
        await afterChange();
      }} boqMessage={message} />
    {basisChanged && !sentSameRevision ? <p role="alert" className="procurement-basket__error">The BOQ changed while you were editing. <button type="button" onClick={loadCurrentBoq}>Load current BOQ</button></p> : null}
  </>;
}

const blockerLabels: Record<string, string> = {
  vendor_archived: "Archived vendor", vendor_inactive: "Inactive vendor", vendor_under_review: "Vendor under review",
  kpi_unrated: "KPI not rated", contact_missing: "Missing contact email",
  contact_email_missing: "Missing contact email", vendor_contact_email_missing: "Missing contact email"
};

const invitationActionLabel: Record<BasketInvitationAction, string> = {
  first_invitation: "First invitation", retry: "Retry delivery",
  updated_bid_request: "Request updated bid", already_invited: "Already invited — no new message"
};

function vendorParticipation(enquiry: BasketEnquiry | null, vendorId: string) {
  const invitations = enquiry?.invitations.filter((item) => item.vendorId === vendorId) ?? [];
  if (!invitations.length) return "Not invited";
  const latest = [...invitations].sort((a, b) => b.generation - a.generation)[0]!;
  const hasBid = invitations.some((item) => item.status === "consumed");
  const state = latest.status === "sent" ? "Invited" : latest.status === "pending" ? "Delivery pending" :
    latest.status === "consumed" ? "Bid received" :
      ["failed", "expired", "stalled"].includes(latest.status) ? `Delivery ${latest.status}` :
        `Invitation ${latest.status.replaceAll("_", " ")}`;
  return hasBid && latest.status !== "consumed" ? `Bid received · ${state.toLowerCase()}` : state;
}

function BasketVendorPicker({ projectId, basketId, enquiry, boqEditable, allowSentRevision, frozenReason,
  prepareBoq, afterDispatch, boqMessage }: {
  projectId: string; basketId: string; enquiry: BasketEnquiry | null; boqEditable: boolean;
  allowSentRevision: boolean; frozenReason: string | null;
  prepareBoq: () => Promise<BasketEnquiry | null>; afterDispatch: (sent?: BasketEnquiry) => Promise<void>;
  boqMessage: string;
}) {
  const dispatchReasonId = useId();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ProcurementVendorCandidate[]>([]);
  const [allEligible, setAllEligible] = useState(false);
  const [excludedVendorIds, setExcludedVendorIds] = useState<string[]>([]);
  const [counterofferReason, setCounterofferReason] = useState("");
  const [lastResults, setLastResults] = useState<Array<{ vendorId: string; vendorName: string;
    action: BasketInvitationAction; status: string }> | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "notice" | "save-error" | "dispatch-error" } | null>(null);
  const [sending, setSending] = useState(false);
  const dispatchCommand = useRef<{ signature: string; key: string } | null>(null);
  const candidates = useQuery({ queryKey: procurementBasketKeys.candidates(projectId, basketId, search, "all", offset),
    queryFn: ({ signal }) => getProcurementVendorCandidates(projectId, basketId, search, "all", offset, signal) });
  const basketCandidates = useQuery({ queryKey: procurementBasketKeys.candidates(projectId, basketId, "", "all", 0),
    queryFn: ({ signal }) => getProcurementVendorCandidates(projectId, basketId, "", "all", 0, signal) });
  const selection: BasketInvitationSelection = allEligible
    ? { kind: "all_eligible", ...(excludedVendorIds.length ? { excludedVendorIds } : {}) }
    : { kind: "vendors", vendorIds: selected.map((item) => item.vendorId) };
  const selectedCount = allEligible ? Math.max(0, (basketCandidates.data?.total ?? 0) - excludedVendorIds.length) : selected.length;
  const sentRevision = enquiry?.status === "sent" && !allowSentRevision && Boolean(enquiry.boqRevisionId && enquiry.boqDigest);
  const previewInput: BasketInvitationBatchInput | null = sentRevision && enquiry?.boqRevisionId && enquiry.boqDigest && selectedCount > 0
    ? { expectedVersion: enquiry.version, boqRevisionId: enquiry.boqRevisionId, boqDigest: enquiry.boqDigest, selection } : null;
  const preview = useQuery({ queryKey: previewInput
    ? procurementBasketKeys.invitationPreview(projectId, basketId, enquiry!.id, previewInput)
    : ["procurement", "basket-invitation-preview", projectId, basketId, "inactive"],
    queryFn: ({ signal }) => previewBasketInvitationBatch(projectId, basketId, enquiry!.id, previewInput!, signal),
    enabled: Boolean(previewInput && !frozenReason), retry: false });
  useEffect(() => {
    if (!candidates.data || allEligible) return;
    const visible = new Set(candidates.data.items.filter((item) => item.eligible).map((item) => item.vendorId));
    const checked = new Set(candidates.data.items.map((item) => item.vendorId));
    const completeDirectory = !search && offset === 0 && candidates.data.total <= candidates.data.limit;
    const revoked = selected.filter((vendor) => completeDirectory ? !visible.has(vendor.vendorId) :
      checked.has(vendor.vendorId) && !visible.has(vendor.vendorId));
    if (!revoked.length) return;
    setSelected((current) => current.filter((vendor) => completeDirectory ? visible.has(vendor.vendorId) :
      !checked.has(vendor.vendorId) || visible.has(vendor.vendorId)));
    setMessage({ text: "A selected vendor is no longer eligible and was removed. Review the current list before sending.", kind: "notice" });
  }, [allEligible, candidates.data, offset, search, selected]);
  async function send() {
    if (sending || !selectedCount) return;
    setSending(true); setMessage(null); setLastResults(null);
    if (sentRevision && previewInput && preview.data) {
      const signature = JSON.stringify({ enquiryId: enquiry!.id, ...previewInput, counterofferReason: counterofferReason.trim() });
      if (dispatchCommand.current?.signature !== signature) dispatchCommand.current = { signature, key: procurementRequestKey() };
      let result: BasketInvitationBatchResult;
      try {
        result = await submitBasketInvitationBatch(projectId, basketId, enquiry!.id, {
          ...previewInput, idempotencyKey: dispatchCommand.current.key,
          ...(preview.data.requiresReason ? { counterofferReason: counterofferReason.trim() } : {})
        });
      } catch (cause) {
        setMessage({ text: procurementError(cause, "The invitation batch was not confirmed. Refresh the enquiry and retry with the same selection."), kind: "dispatch-error" });
        setSending(false);
        return;
      }
      dispatchCommand.current = null;
      const names = new Map(preview.data.actions.map((item) => [item.vendorId, item.vendorName]));
      setLastResults(result.results.map((item) => ({ ...item, vendorName: names.get(item.vendorId) ?? item.vendorId })));
      setMessage({ text: "Invitation request recorded. Review each vendor's current delivery result below.", kind: "notice" });
      setSelected([]); setAllEligible(false); setExcludedVendorIds([]); setCounterofferReason("");
      try { await afterDispatch(result.enquiry); }
      catch { setMessage({ text: "Invitation request recorded, but current delivery status could not be refreshed. Refresh invitation status before another action.", kind: "dispatch-error" }); }
      finally { setSending(false); }
      return;
    }
    let saved: BasketEnquiry | null;
    try { saved = await prepareBoq(); }
    catch (cause) {
      setMessage({ text: procurementError(cause, "The BOQ could not be prepared from the approved lines. Refresh the basket and retry."), kind: "save-error" });
      setSending(false); return;
    }
    if (!saved) { setSending(false); return; }
    const signature = JSON.stringify({ id: saved.id, version: saved.version, digest: saved.preparationDigest, selection });
    if (dispatchCommand.current?.signature !== signature) dispatchCommand.current = { signature, key: procurementRequestKey() };
    let result: BasketEnquiry;
    try {
      result = await dispatchBasketEnquiry(projectId, basketId, saved.id, {
        expectedVersion: saved.version, expectedPreparationDigest: saved.preparationDigest,
        idempotencyKey: dispatchCommand.current.key,
        ...(selection.kind === "vendors" ? { vendorIds: selection.vendorIds } : { selection })
      });
    } catch (cause) {
      setMessage({ text: `BOQ draft saved. Invitations were not confirmed. ${procurementError(cause, "Retry sending with the same request or refresh invitation status.")}`, kind: "dispatch-error" });
      setSending(false); return;
    }
    dispatchCommand.current = null;
    setSelected([]); setAllEligible(false); setExcludedVendorIds([]);
    setMessage({ text: result.status === "draft" && result.boqRevisionId
      ? "No bid invitations were delivered. Open Bids to retry the failed vendors."
      : result.invitations.length
        ? "Invitation request recorded. Review delivery status in the vendor rows."
        : "No invitation is shown as delivered. Refresh the enquiry before trying again.", kind: "notice" });
    try { await afterDispatch(result); }
    catch { setMessage({ text: "Invitation request recorded, but current delivery status could not be refreshed. Refresh invitation status before taking another action.", kind: "dispatch-error" }); }
    finally { setSending(false); }
  }
  const dispatchBlocker = frozenReason ??
    (enquiry?.boqRevisionId && enquiry.status === "draft" && !allowSentRevision
      ? "The saved BOQ has undelivered invitations. Retry delivery below or revise the BOQ." :
      enquiry && ["award_pending", "issued", "cancelled"].includes(enquiry.status)
      ? "Bid invitations are closed while this work order is in approval or issued." :
      enquiry?.status === "sent" && !allowSentRevision && enquiry.vendorScopeCurrent === false
      ? "Approved BOQ scope changed. Start a BOQ revision before inviting vendors again." :
      enquiry?.status === "sent" && !allowSentRevision && !sentRevision
      ? "The sent BOQ revision is unavailable. Refresh the enquiry before inviting vendors." :
      !sentRevision && !boqEditable ? "Load the current BOQ before sending invitations." :
      candidates.isPending || candidates.isFetching || basketCandidates.isPending || basketCandidates.isFetching ? "Checking current vendor eligibility…" :
      candidates.isError ? "The vendor directory is unavailable. Retry loading vendors before sending." :
      basketCandidates.isError ? "The basket vendor count is unavailable. Retry loading vendors before sending." :
      !selectedCount ? "Select at least one eligible vendor to send the bid invitation." :
      sentRevision && preview.isPending || sentRevision && preview.isFetching ? "Checking invitation actions for selected vendors…" :
      sentRevision && preview.isError ? procurementError(preview.error, "Invitation actions could not be checked. Retry the preview or refresh the enquiry.") :
      sentRevision && preview.data && preview.data.enquiryVersion !== enquiry?.version ? "The enquiry changed. Refresh before sending invitations." :
      sentRevision && preview.data?.requiresReason && counterofferReason.trim().length < 10 ? "Give a reason of at least 10 characters to request updated bids." :
      sentRevision && preview.data?.actions.every((item) => item.action === "already_invited") ? "Every selected vendor already has an active invitation. No new message will be sent." : null);
  const reasons = Object.entries(candidates.data?.blockedReasonCounts ?? {}).filter(([, count]) => count > 0);
  return <section className="procurement-basket__vendors" aria-labelledby="basket-vendors-title">
    <h3 id="basket-vendors-title" className="sr-only">Choose vendors</h3>
    <label className="procurement-basket__search">Search vendors<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="Name or code" /></label>
    <div className="procurement-basket__selection-tools"><button type="button" disabled={basketCandidates.isPending || basketCandidates.isFetching || basketCandidates.isError || !basketCandidates.data?.total || sending}
      onClick={() => { setAllEligible(true); setExcludedVendorIds([]); setSelected([]); setMessage(null); }}>
      Select all eligible{basketCandidates.data ? ` (${basketCandidates.data.total})` : ""}</button>
      {selectedCount > 0 ? <button type="button" disabled={sending} onClick={() => { setAllEligible(false); setExcludedVendorIds([]); setSelected([]); setMessage(null); }}>Clear selection</button> : null}</div>
    {candidates.isPending ? <PageState state="loading" message="Loading eligible vendors…" /> : candidates.isError ? <PageState state="error" message={procurementError(candidates.error, "Vendors could not be loaded.")} action={{ label: "Try again", onAction: () => void candidates.refetch() }} /> : <>
      {candidates.isFetching ? <p role="status" className="procurement-basket__directory-status">Updating vendor results…</p> : null}
      {!candidates.data.items.length ? <div className="procurement-basket__directory-status"><p>{candidates.data.matchingVendorCount === 0
        ? "No vendors are classified for this main basket."
        : candidates.data.total === 0 ? "No active vendors are ready for this main basket."
          : "No eligible vendors match this search."}</p>
        {reasons.length ? <ul>{reasons.map(([reason, count]) => <li key={reason}>{blockerLabels[reason] ?? reason.replaceAll("_", " ")}: {count}</li>)}</ul> : null}
        {candidates.data.total === 0 ? <p><Link to="/procurement/vendors">Manage vendors</Link> to review basket classification, activation, KPI and contact email.</p> : null}</div>
        : <><div className="procurement-basket__vendor-list">{candidates.data.items.map((vendor) => {
          const checked = allEligible ? !excludedVendorIds.includes(vendor.vendorId) : selected.some((item) => item.vendorId === vendor.vendorId);
          const planned = preview.data?.actions.find((item) => item.vendorId === vendor.vendorId);
          return <div className="procurement-basket__vendor" key={vendor.vendorId}><label><input type="checkbox" disabled={!vendor.eligible || sending} checked={checked} onChange={(event) => {
            setLastResults(null);
            if (allEligible) setExcludedVendorIds((current) => event.target.checked ? current.filter((id) => id !== vendor.vendorId) : [...current, vendor.vendorId]);
            else setSelected((current) => event.target.checked ? current.some((item) => item.vendorId === vendor.vendorId) ? current : [...current, vendor] : current.filter((item) => item.vendorId !== vendor.vendorId));
          }} /><span><strong>{vendor.name}</strong><small>{vendor.code} · {vendor.city?.name ?? "City unknown"}</small><small>{vendorParticipation(enquiry, vendor.vendorId)}</small>{checked && planned ? <small>Next: {invitationActionLabel[planned.action]}</small> : null}</span></label><span className="procurement-basket__vendor-kpi">KPI {vendor.kpiScoreBps === null ? "Unrated" : `${(vendor.kpiScoreBps / 100).toFixed(1)}`}</span></div>;
        })}</div><div className="procurement-basket__vendor-pages"><span>{offset + 1}–{offset + candidates.data.items.length} of {candidates.data.total} eligible vendors</span><div><button type="button" disabled={offset === 0 || candidates.isFetching} onClick={() => setOffset(Math.max(0, offset - candidates.data.limit))}>Previous</button><button type="button" disabled={offset + candidates.data.items.length >= candidates.data.total || candidates.isFetching} onClick={() => setOffset(offset + candidates.data.limit)}>Next</button></div></div></>}
    </>}
    {selectedCount > 0 ? <p className="procurement-basket__selected-vendors">{allEligible
      ? `All eligible vendors for this Main Basket${excludedVendorIds.length ? ` except ${excludedVendorIds.length}` : ""} selected.`
      : `Selected: ${selected.map((vendor) => vendor.name).join(", ")}`}</p> : null}
    {sentRevision && !frozenReason && preview.data && selectedCount > 0 ? <section className="procurement-basket__invitation-plan" aria-label="Planned invitation actions">
      <h4>Before sending · {preview.data.selectedCount} vendor{preview.data.selectedCount === 1 ? "" : "s"}</h4>
      <ul>{preview.data.actions.map((item) => <li key={item.vendorId}><span>{item.vendorName}</span><strong>{invitationActionLabel[item.action]}</strong></li>)}</ul>
      {preview.data.requiresReason ? <label>Reason for requesting updated bids<textarea value={counterofferReason} onChange={(event) => setCounterofferReason(event.target.value)} minLength={10} maxLength={2000} disabled={sending} /></label> : null}
    </section> : null}
    {boqMessage ? <p role="alert" className="procurement-basket__error">{boqMessage}</p> : null}
    <div className="procurement-basket__vendor-actions"><p aria-live="polite">{sentRevision && preview.data ? preview.data.selectedCount : selectedCount} vendor{selectedCount === 1 ? "" : "s"} selected</p><button type="button" aria-describedby={dispatchBlocker ? dispatchReasonId : undefined} disabled={sending || Boolean(dispatchBlocker)} onClick={() => void send()}>{sending ? "Sending…" : sentRevision ? "Send selected requests" : "Send bid invitations"}</button></div>
    {dispatchBlocker ? <p id={dispatchReasonId} className="procurement-basket__send-blocker">{dispatchBlocker}</p> : null}
    {sentRevision && !frozenReason && preview.isError ? <button type="button" className="procurement-basket__retry-preview" onClick={() => void preview.refetch()}>Retry invitation preview</button> : null}
    {basketCandidates.isError && !candidates.isError ? <button type="button" className="procurement-basket__retry-preview" onClick={() => void basketCandidates.refetch()}>Retry basket vendor count</button> : null}
    {lastResults ? <section className="procurement-basket__invitation-results" aria-label="Invitation results" role="status"><h4>Request results</h4><ul>{lastResults.map((item) => <li key={item.vendorId}><span>{item.vendorName}</span><span>{invitationActionLabel[item.action]} · {item.status === "sent" ? "Email sent" : item.status === "failed" ? "Delivery failed; retry is available" : item.status === "pending" ? "Delivery pending" : item.status === "already_invited" ? "No new message" : item.status === "consumed" ? "Bid received" : `Invitation ${item.status}`}</span></li>)}</ul></section> : null}
    {message ? <p role={message.kind === "notice" ? "status" : "alert"} className={message.kind === "notice" ? "procurement-basket__notice" : "procurement-basket__error"}>{message.text}{message.kind === "dispatch-error" ? <> <button type="button" onClick={() => void afterDispatch()}>Refresh invitation status</button></> : null}</p> : null}
  </section>;
}

function BasketInvitationDelivery({ projectId, basketId, enquiry, frozen, readinessReason, afterResend }: {
  projectId: string; basketId: string; enquiry: BasketEnquiry; frozen: boolean;
  readinessReason: string | null; afterResend: () => Promise<void>;
}) {
  const readinessReasonId = useId();
  const [message, setMessage] = useState("");
  const requestKeys = useRef(new Map<string, string>());
  const latestDeliveryGeneration = new Map<string, number>();
  for (const invitation of enquiry.invitations) {
    if (invitation.kind === "counteroffer") continue;
    latestDeliveryGeneration.set(invitation.vendorId, Math.max(latestDeliveryGeneration.get(invitation.vendorId) ?? 0, invitation.generation));
  }
  const resend = useMutation({ mutationFn: (vendorId: string) => {
    let idempotencyKey = requestKeys.current.get(vendorId);
    if (!idempotencyKey) { idempotencyKey = procurementRequestKey(); requestKeys.current.set(vendorId, idempotencyKey); }
    return resendBasketInvitation(projectId, basketId, enquiry.id, { expectedVersion: enquiry.version, vendorId, idempotencyKey });
  }, onSuccess: async (saved, vendorId) => {
    requestKeys.current.delete(vendorId);
    await afterResend();
    const latest = saved.invitations.filter((invitation) => invitation.vendorId === vendorId && invitation.kind !== "counteroffer")
      .sort((first, second) => second.generation - first.generation)[0];
    setMessage(latest?.status === "sent"
      ? "Invitation sent. Review the current status below."
      : "The invitation was not delivered. Check the mail service, then retry this vendor.");
  }, onError: (cause) => setMessage(procurementError(cause, "The invitation could not be resent. Refresh the enquiry and try again.")) });

  return <section className="procurement-basket__invitations" aria-label="Vendor invitation delivery"><h3>Invitation delivery</h3>
    {readinessReason ? <p id={readinessReasonId} className="procurement-basket__send-blocker">{readinessReason}</p> : null}
    <ul>{enquiry.invitations.map((invitation) => {
    const canResend = (enquiry.status === "sent" || enquiry.status === "draft" && Boolean(enquiry.boqRevisionId)) &&
      invitation.kind !== "counteroffer" &&
      latestDeliveryGeneration.get(invitation.vendorId) === invitation.generation &&
      ["failed", "expired", "stalled"].includes(invitation.status);
    return <li key={invitation.id}><span>{invitation.vendorName} · {invitation.vendorCode}{invitation.kind === "counteroffer" ? " · Counteroffer" : ""}</span>
      <div><strong>Email: {invitation.status.replaceAll("_", " ")}</strong>{invitation.kind !== "counteroffer" && invitation.status === "sent" && latestDeliveryGeneration.get(invitation.vendorId) === invitation.generation
        ? <BasketWhatsAppInvitation key={`${enquiry.id}:${invitation.id}:${invitation.generation}`} projectId={projectId} basketId={basketId} enquiryId={enquiry.id} vendorId={invitation.vendorId} vendorName={invitation.vendorName} frozen={frozen} /> : null}
        {canResend ? <button type="button" aria-describedby={readinessReason ? readinessReasonId : undefined}
          disabled={frozen || Boolean(readinessReason) || resend.isPending} onClick={() => { setMessage(""); resend.mutate(invitation.vendorId); }}>Resend invitation to {invitation.vendorName}</button> : null}</div>
    </li>;
  })}</ul>{message ? <p role={resend.isError ? "alert" : "status"} className={resend.isError ? "procurement-basket__error" : "procurement-basket__notice"}>{message}</p> : null}</section>;
}

function BasketWhatsAppInvitation({ projectId, basketId, enquiryId, vendorId, vendorName, frozen }: {
  projectId: string; basketId: string; enquiryId: string; vendorId: string; vendorName: string; frozen: boolean;
}) {
  const [share, setShare] = useState<{ state: "ready" | "expired" | "unavailable"; shareUrl: string | null;
    blocker: string | null; expiresAt: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (share?.state !== "ready" || !share.expiresAt) return;
    const expiresAt = Date.parse(share.expiresAt);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const expireIfDue = () => {
      if (timer) clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining > 0) timer = setTimeout(expireIfDue, Math.min(remaining, 2_147_483_647));
      else setShare((current) => current?.state === "ready" && current.expiresAt === share.expiresAt
        ? { ...current, state: "expired", shareUrl: null } : current);
    };
    const checkWhenVisible = () => { if (!document.hidden) expireIfDue(); };
    window.addEventListener("focus", expireIfDue);
    document.addEventListener("visibilitychange", checkWhenVisible);
    expireIfDue();
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("focus", expireIfDue);
      document.removeEventListener("visibilitychange", checkWhenVisible); };
  }, [share?.state, share?.expiresAt]);
  const intent = useMutation({ mutationFn: () => createBasketWhatsAppShareIntent(projectId, basketId, enquiryId, vendorId),
    onSuccess: (result) => {
      const safeUrl = result.shareUrl && /^https:\/\/wa\.me\//u.test(result.shareUrl) ? result.shareUrl : null;
      const expiresAt = result.expiresAt ? Date.parse(result.expiresAt) : NaN;
      setShare(!result.available ? { state: "unavailable", shareUrl: null, expiresAt: null, blocker: result.blocker } :
        !safeUrl || !Number.isFinite(expiresAt) ? { state: "unavailable", shareUrl: null, expiresAt: null,
          blocker: "The WhatsApp link is unavailable. Prepare a new link." } :
        expiresAt <= Date.now() ? { state: "expired", shareUrl: null, expiresAt: result.expiresAt, blocker: null } :
          { state: "ready", shareUrl: safeUrl, expiresAt: result.expiresAt, blocker: null });
      setError("");
    }, onError: (cause) => setError(procurementError(cause, "WhatsApp invitation could not be prepared. Retry.")) });
  const ready = share?.state === "ready" && Boolean(share.shareUrl) && Boolean(share.expiresAt) &&
    Date.parse(share.expiresAt!) > Date.now();
  const expired = share?.state === "expired" || share?.state === "ready" && !ready;
  return <span className="procurement-basket__whatsapp-invite">
    {ready && share?.shareUrl ? <><span role="status">WhatsApp: Ready to send</span><a href={share.shareUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open WhatsApp message for {vendorName}</a></> :
      expired ? <span role="status">WhatsApp: Link expired</span> :
        share ? <span role="status">WhatsApp: Unavailable{share.blocker ? ` · ${share.blocker}` : ""}</span> : null}
    <button type="button" disabled={frozen || intent.isPending} onClick={() => { setError(""); intent.mutate(); }}>{intent.isPending ? "Preparing WhatsApp…" : expired ? `Prepare new WhatsApp link for ${vendorName}` : ready ? "Refresh WhatsApp link" : `Prepare WhatsApp for ${vendorName}`}</button>
    {error ? <span role="alert" className="procurement-basket__error">{error}</span> : null}
  </span>;
}

function EarlierEnquiry({ projectId, basketId, enquiry }: { projectId: string; basketId: string; enquiry: BasketEnquiry }) {
  const [open, setOpen] = useState(false);
  return <li><details onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Enquiry {enquiry.id.slice(0, 8)} · {enquiry.status.replaceAll("_", " ")} · {enquiry.lines.length} lines</summary>
    {open ? <div className="procurement-basket__earlier-content">{enquiry.status === "issued"
      ? <ProcurementBasketMonitor projectId={projectId} basketId={basketId} enquiry={enquiry} readOnly />
      : <p>No issued work order is available for this earlier enquiry.</p>}</div> : null}
  </details></li>;
}

function unreadyBasketReason(basket: ProcurementBasketDetail): string {
  const lines = basket.lines.filter((line) => line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0);
  if (!lines.length) return "No priced approved lines are available for a vendor BOQ.";
  const name = (line: typeof lines[number]) => line.mainLineName?.trim() || line.sourceLineItemKey;
  const hasCurrentUnit = (line: typeof lines[number]) => {
    const uom = line.mode?.uom;
    return Boolean(uom?.id && uom.code && Number.isSafeInteger(uom.decimalScale) &&
      uom.decimalScale >= 0 && uom.decimalScale <= 3);
  };
  if (!basket.automaticSubVendor) {
    const unready = lines.find((line) => {
      const mode = line.mode;
      return !hasCurrentUnit(line) || mode?.state !== "ready" ||
        !mode.preview || !["active", "superseded"].includes(mode.revision?.status ?? "");
    });
    if (unready) {
      const issue = unready.mode?.issues.find((item) => item.message.trim())?.message;
      if (issue) return `${name(unready)}: ${issue}`;
      if (unready.mode?.revision?.status === "draft")
        return `${name(unready)}: The current saved Configuration revision needs Super Admin activation before bid invitations can be sent.`;
      if (!unready.mode || unready.mode.state === "selection_required")
        return `${name(unready)}: Confirm this line’s saved mode before sending bid invitations.`;
      if (!unready.mode.uom?.id || !unready.mode.uom.code)
        return `${name(unready)}: The current Configuration unit is incomplete.`;
      return `${name(unready)}: Resolve this line’s saved Configuration mode and pricing before sending bid invitations.`;
    }
    return `${name(lines[0]!)}: Review the current saved mode before sending bid invitations.`;
  }
  const hasCost = (line: typeof lines[number]) => {
    const mode = line.mode;
    const cost = line.standardCost;
    const rate = cost?.baseRates[0];
    return hasCurrentUnit(line) && line.source === "configuration" && Boolean(mode?.revision?.id) &&
      ["draft", "active", "superseded"].includes(mode?.revision?.status ?? "") &&
      typeof mode?.revision?.contentDigest === "string" && /^[a-f0-9]{64}$/u.test(mode.revision.contentDigest) &&
      (cost?.state === "suggested" || cost?.state === "observed_unverified") &&
      cost.mode === "sub_vendor" && cost.calculationQuantity === line.approvedQuantity &&
      cost.baseRates.length === 1 && rate?.scope === "sub_vendor" &&
      Number.isSafeInteger(rate.ratePaise) && rate.ratePaise >= 0 && line.baseUnitRatePaise === rate.ratePaise &&
      Number.isSafeInteger(cost.baseCostPaise) && cost.baseCostPaise! >= 0 &&
      Number.isSafeInteger(cost.adjustedCostPaise) && cost.adjustedCostPaise! >= cost.baseCostPaise! &&
      (cost.state !== "observed_unverified" || (mode.integrity?.status === "mismatch" &&
        mode.integrity.activatedDigest === mode.revision.contentDigest &&
        /^[a-f0-9]{64}$/u.test(mode.integrity.observedDigest)));
  };
  const lineIssue = (line: typeof lines[number]) => [...(line.standardCost?.issues ?? []), ...(line.mode?.issues ?? [])]
    .find((issue) => issue.code !== "PINNED_DIGEST_MISMATCH" && issue.message.trim())?.message;
  const unready = lines.find((line) => !hasCost(line) || !["active", "superseded"].includes(line.mode?.revision?.status ?? ""));
  if (unready) {
    const issue = lineIssue(unready);
    if (issue) return `${name(unready)}: ${issue}`;
    if (!hasCurrentUnit(unready)) return `${name(unready)}: The current Configuration unit is incomplete.`;
    if (!hasCost(unready)) return `${name(unready)}: The saved Sub-vendor Configuration cannot price this approved line.`;
    if (unready.mode?.revision?.status === "draft")
      return `${name(unready)}: The current saved Configuration revision needs Super Admin activation before bid invitations can be sent.`;
  }
  return `${name(lines[0]!)}: Review the current Configuration revision and unit before sending bid invitations.`;
}

export function ProcurementBasketEnquiry({ projectId, projectName, basket, frozen }: {
  projectId: string; projectName: string; basket: ProcurementBasketDetail; frozen: boolean;
}) {
  const queryClient = useQueryClient();
  const stageId = useId();
  const stageTargets = [`${stageId}-enquiry`, `${stageId}-bids`, `${stageId}-comparison`, `${stageId}-awarded`];
  const enquiries = useQuery({ queryKey: procurementBasketKeys.enquiries(projectId, basket.id), queryFn: ({ signal }) => listBasketEnquiries(projectId, basket.id, signal) });
  const preparation = useQuery({ queryKey: purchaseOrderKeys.preparation(projectId), queryFn: ({ signal }) => getPurchaseOrderPreparation(projectId, signal) });
  const enquiry = enquiries.data?.find((item) => item.status !== "cancelled") ?? null;
  const earlierEnquiries = enquiries.data?.filter((item) => item.id !== enquiry?.id) ?? [];
  const [revisionRequested, setRevisionRequested] = useState(false);
  const sourceChanged = Boolean(preparation.data && (preparation.data.estimateSource.estimateId !== basket.estimateSource.estimateId || preparation.data.estimateSource.estimateVersion !== basket.estimateSource.estimateVersion));
  const staleSentBoq = enquiry?.status === "sent" && enquiry.preparationDigest !== basket.preparationDigest;
  const paused = frozen || preparation.isFetching || preparation.isError || sourceChanged || enquiries.isFetching;
  const stage = staleSentBoq ? 0 : enquiry?.status === "issued" ? 3 : enquiry?.status === "award_pending" || enquiry?.status === "sent" && enquiry.bidCount > 0 ? 2 : enquiry?.status === "sent" ? 1 : 0;
  const hasDelivery = Boolean(enquiry?.invitations.length);
  const hasComparison = Boolean(enquiry && enquiry.status !== "draft" && enquiry.status !== "issued");
  const stageAvailable = [true, hasDelivery || hasComparison, hasComparison, enquiry?.status === "issued"];
  const readinessReason = basket.boqReady ? null : unreadyBasketReason(basket);
  const vendorFrozenReason = sourceChanged ? "The approved estimate changed. Refresh the basket before sending invitations." :
    preparation.isError ? "The approved estimate could not be checked. Retry loading the basket before sending." :
    preparation.isFetching ? "Checking the current approved estimate before sending…" :
    enquiries.isFetching ? "Refreshing the enquiry before sending…" :
    frozen ? "This basket is temporarily unavailable for editing." :
    readinessReason;
  function goToStage(index: number) {
    const targetId = index === 1 && !hasDelivery && hasComparison ? stageTargets[2] : stageTargets[index];
    const target = document.getElementById(targetId ?? "");
    target?.scrollIntoView?.({ block: "start" });
    target?.focus({ preventScroll: true });
  }
  async function refresh() { await Promise.all([
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.enquiries(projectId, basket.id) }),
    queryClient.invalidateQueries({ queryKey: enquiry ? procurementBasketKeys.comparison(projectId, basket.id, enquiry.id) : procurementBasketKeys.enquiries(projectId, basket.id), refetchType: "none" }),
    queryClient.invalidateQueries({ queryKey: ["procurement", "basket-award", projectId, basket.id] }),
    queryClient.invalidateQueries({ queryKey: ["procurement", "basket-vendors", projectId, basket.id] }),
    queryClient.invalidateQueries({ queryKey: ["procurement", "basket-invitation-preview", projectId, basket.id] }),
    queryClient.invalidateQueries({ queryKey: ["procurement", "basket-history", projectId, basket.id] }),
    queryClient.invalidateQueries({ queryKey: ["procurement", "basket-history-revision", projectId, basket.id] }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) }),
    queryClient.invalidateQueries({ queryKey: procurementBasketKeys.detail(projectId, basket.id) }),
    queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) })
  ]); }
  return <section className="procurement-basket__enquiry" aria-label={`Vendor enquiry for ${projectName}`}>
    <h2 className="sr-only">Vendor enquiry</h2>
    {enquiries.isPending ? <PageState state="loading" message="Loading basket enquiries…" /> : enquiries.isError ? <PageState state="error" message={procurementError(enquiries.error, "Enquiries could not be loaded.")} action={{ label: "Try again", onAction: () => void enquiries.refetch() }} /> : <>
      <nav className="procurement-basket__stages" aria-label="Vendor enquiry progress"><ol>{["Enquiry", "Bids", "Comparison", "Awarded"].map((label, index) => <li key={label} data-state={index === stage ? "current" : index < stage ? "complete" : "upcoming"}><button type="button" aria-current={index === stage ? "step" : undefined} disabled={!stageAvailable[index]} onClick={() => goToStage(index)}><span aria-hidden="true">{index + 1}</span><strong>{label}</strong></button></li>)}</ol></nav>
      {sourceChanged ? <p role="alert" className="procurement-basket__error">The approved estimate changed. Refresh the basket before editing this enquiry. <button type="button" onClick={() => void refresh()}>Refresh basket</button></p> : null}
      {preparation.isError ? <p role="alert" className="procurement-basket__error">{procurementError(preparation.error, "The approved estimate could not be checked.")} <button type="button" onClick={() => void preparation.refetch()}>Retry estimate check</button></p> : preparation.isPending ? <p role="status" className="procurement-basket__directory-status">Checking the current approved estimate…</p> : null}
      <div id={stageTargets[0]} className="procurement-basket__stage-content" tabIndex={-1}>
        {enquiry?.boqRevisionId && (enquiry.status === "sent" || enquiry.status === "draft") ? <details className="procurement-basket__revision"><summary>{enquiry.status === "draft" ? "Revise saved BOQ" : "Revise sent BOQ"}</summary><section className="procurement-basket__notice procurement-basket__section-head" aria-label="Sent BOQ revision"><p>{enquiry.status === "draft"
          ? "The saved BOQ has undelivered invitations. Retry them below, or revise and resend the BOQ."
          : staleSentBoq
          ? enquiry.vendorScopeCurrent
            ? "Internal basket pricing changed. Existing vendor links remain valid; revise and resend before awarding."
            : "Approved BOQ scope changed. Existing vendor links are unavailable; revise and resend."
          : revisionRequested ? "Sending this revised BOQ will supersede current vendor links and bids for the sent revision." : "Revising this BOQ supersedes current vendor links and bids for that revision."}</p><button type="button" disabled={paused} onClick={() => setRevisionRequested((current) => !current)}>{revisionRequested ? "Cancel revision" : "Start BOQ revision"}</button></section></details> : null}
        {preparation.isPending ? null : <BasketBoqEditor key={`${basket.id}:${enquiry?.id ?? "new"}:${revisionRequested ? "revise" : "view"}`} projectId={projectId} basket={basket} enquiry={enquiry} frozen={paused} reviseSent={revisionRequested} preparationDigest={basket.preparationDigest} vendorFrozenReason={vendorFrozenReason} afterChange={async () => { await refresh(); setRevisionRequested(false); }} />}
      </div>
      {enquiry && hasDelivery ? <div id={stageTargets[1]} className="procurement-basket__stage-content" tabIndex={-1}><details className="procurement-basket__delivery"><summary>Invitation status and WhatsApp</summary><BasketInvitationDelivery projectId={projectId} basketId={basket.id} enquiry={enquiry} frozen={paused || enquiry.vendorScopeCurrent === false} readinessReason={readinessReason} afterResend={refresh} /></details></div> : null}
      {enquiry && hasComparison ? <div id={stageTargets[2]} className="procurement-basket__stage-content" tabIndex={-1}>
        {staleSentBoq ? <p role="status" className="procurement-basket__notice">These responses belong to the previous frozen BOQ. Revise and resend before awarding.</p> : null}
        <ProcurementBasketComparison projectId={projectId} basketId={basket.id} enquiry={enquiry} frozen={paused || staleSentBoq} invitationBlocker={readinessReason} afterChange={refresh} />
      </div> : null}
      {enquiry?.status === "issued" ? <div id={stageTargets[3]} className="procurement-basket__stage-content" tabIndex={-1}><ProcurementBasketMonitor projectId={projectId} basketId={basket.id} enquiry={enquiry} /></div> : null}
      {earlierEnquiries.length ? <details className="procurement-basket__old-enquiries"><summary>Earlier enquiries ({earlierEnquiries.length})</summary><ul>{earlierEnquiries.map((item) => <EarlierEnquiry key={item.id} projectId={projectId} basketId={basket.id} enquiry={item} />)}</ul></details> : null}
    </>}
  </section>;
}
