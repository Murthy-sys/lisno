import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { PMBadge, pmDate, pmLabel } from "./PMShared";
import { pmDenied, pmError } from "./projectManagerApi";
import {
  pmEstimateConflict, pmEstimateKeys, pmSourceKey, usePMEstimate, usePMVendorCandidates,
  usePMVendorSuggestionCommand, usePMVendorSuggestions
} from "./pmEstimatesApi";
import type {
  PMApprovedSourceRef, PMEstimateView, PMMainLineScope, PMVendorSuggestion
} from "./pmEstimateTypes";
import "./project-manager.css";
import "./pm-estimations.css";

const PAGE_SIZE = 20;
type Editor = ({ kind: "create"; mainLine: PMMainLineScope } |
  { kind: "update"; suggestion: PMVendorSuggestion; action: "edit" | "withdraw" | "reinstate" }) & { returnFocusRef?: RefObject<HTMLElement | null> };
interface PMVendorSuggestionsProps { projectId: string; estimate?: PMEstimateView; initialMainLineId?: string; initialReturnFocusRef?: RefObject<HTMLElement | null>; }

export function PMVendorSuggestions(props: PMVendorSuggestionsProps) {
  const { user } = useAuth();
  return <VendorSuggestionsContent key={`${user?.id}:${props.projectId}`} {...props} />;
}

function AccessUnavailable() {
  return <div className="pm-empty" role="alert"><h3>Project access unavailable</h3><p>Your assignment may have changed. Refresh your assigned projects.</p><Link to="/execution">Dashboard</Link></div>;
}

function VendorSuggestionsContent({ projectId, estimate: suppliedEstimate, initialMainLineId, initialReturnFocusRef }: PMVendorSuggestionsProps) {
  const headingId = useId();
  const { user } = useAuth();
  const client = useQueryClient();
  const estimateQuery = usePMEstimate(projectId);
  const estimate = estimateQuery.data ?? suppliedEstimate;
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const openedInitial = useRef(false);
  const query = usePMVendorSuggestions(projectId, { source: "all", limit: PAGE_SIZE, offset }, estimate?.source);
  const initialLine = estimate?.mainLines.find(line => line.mainLineId === initialMainLineId);
  const denied = user?.role !== "site_manager" || pmDenied(estimateQuery.error) || pmDenied(query.error);
  const sameSource = Boolean(estimate?.source && pmSourceKey(estimate.source) === pmSourceKey(query.data?.source));
  const fresh = !estimateQuery.isError && !estimateQuery.isFetching && !query.isError && !query.isFetching && Boolean(estimateQuery.data) && sameSource;
  const canWrite = fresh && Boolean(estimate?.writeAvailability.available && query.data?.writeAvailability.available);

  useEffect(() => {
    if (!openedInitial.current && initialMainLineId && initialLine && canWrite && initialLine.canSuggest) {
      openedInitial.current = true;
      setEditor({ kind: "create", mainLine: initialLine, returnFocusRef: initialReturnFocusRef });
    }
  }, [initialMainLineId, initialReturnFocusRef, initialLine, canWrite]);
  useEffect(() => {
    if (fresh && query.data && offset > 0 && offset >= query.data.total) {
      void client.invalidateQueries({ queryKey: pmEstimateKeys.project(user?.id, projectId), predicate: cached => cached.queryKey.includes("suggestions"), refetchType: "none" });
      setOffset(Math.max(0, Math.floor((query.data.total - 1) / PAGE_SIZE) * PAGE_SIZE));
    }
  }, [client, user?.id, projectId, fresh, query.data, offset]);

  if (denied) return <AccessUnavailable />;
  if (!estimate || !estimateQuery.data) return <section className="pm-vendor-suggestions" aria-labelledby={headingId}>
    <h2 id={headingId}>Vendor suggestions</h2>{estimateQuery.isError ? <div role="alert"><p>{pmError(estimateQuery.error)}</p><Button size="compact" onClick={() => void estimateQuery.refetch()}>Retry estimate</Button></div> : <p role="status">Loading vendor suggestions…</p>}
  </section>;

  const firstLine = estimate.mainLines[0];
  const canCreate = canWrite && estimate.mainLines.some(line => line.canSuggest);
  const unavailableReason = estimate.writeAvailability.reason ?? query.data?.writeAvailability.reason ??
    (!firstLine ? "No approved Main Lines are available for vendor suggestions." : !estimate.mainLines.some(line => line.canSuggest) ? firstLine.unavailableReason : null);
  const currentSuggestion = editor?.kind === "update" ? query.data?.items.find(item => item.id === editor.suggestion.id) : undefined;
  return <section className="pm-vendor-suggestions" aria-labelledby={headingId}>
    <div className="pm-vendor-suggestions__heading"><h2 id={headingId}>Vendor suggestions</h2>
      <Button size="compact" disabled={!canCreate} onClick={() => firstLine && setEditor({ kind: "create", mainLine: firstLine })}>Suggest vendor</Button>
    </div>
    {unavailableReason ? <p className="pm-quiet-state">{unavailableReason}</p> : null}
    {message ? <p className="pm-vendor-suggestions__confirmation" role="status">{message}</p> : null}
    {(query.isError || estimateQuery.isError) ? <p className="pm-message" role="alert">Refresh failed. Saved details may be out of date; changes are paused. <button type="button" onClick={() => { void query.refetch(); void estimateQuery.refetch(); }}>Retry</button></p> : null}
    {query.data && estimate.source && !sameSource ? <p className="pm-message" role="alert">The approved estimate changed. <button type="button" onClick={() => { void query.refetch(); void estimateQuery.refetch(); }}>Refresh current details</button></p> : null}
    {query.isPending ? <p role="status" className="pm-vendor-suggestions__loading">Loading vendor suggestions…</p> : !query.data ? null : <>
      {query.data.items.length ? <div className="pm-vendor-suggestions__list">{query.data.items.map(suggestion => <SuggestionRow key={suggestion.id} suggestion={suggestion} disabled={!canWrite}
        onEdit={action => setEditor({ kind: "update", suggestion, action })} />)}</div> : fresh && query.data.total === 0 ? <p className="pm-vendor-suggestions__empty">No suggested vendors yet.</p> : null}
      {query.data.total > PAGE_SIZE ? <nav className="pm-pagination" aria-label="Vendor suggestion pages"><span>{`${query.data.offset + 1}–${Math.min(query.data.offset + query.data.items.length, query.data.total)} of ${query.data.total}`}</span><div className="pm-actions">
        <Button size="compact" variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous suggestions</Button>
        <Button size="compact" variant="secondary" disabled={offset + PAGE_SIZE >= query.data.total || query.isFetching} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next suggestions</Button>
      </div></nav> : null}
    </>}
    {editor ? <SuggestionEditor projectId={projectId} editor={editor} estimate={estimate} currentSuggestion={currentSuggestion} fresh={canWrite}
      onClose={() => setEditor(null)} onRefresh={async () => { await Promise.all([estimateQuery.refetch(), query.refetch()]); }}
      onSaved={text => { setOffset(0); setEditor(null); setMessage(text); }} /> : null}
  </section>;
}

function SuggestionRow({ suggestion, disabled, onEdit }: { suggestion: PMVendorSuggestion; disabled: boolean; onEdit: (action: "edit" | "withdraw" | "reinstate") => void }) {
  const sourceLabel = suggestion.sourceState === "current" ? "Current approved source" : suggestion.sourceState === "historical" ? "Previous approved source" : "Source verification unavailable";
  const reinstateBlocked = suggestion.status === "withdrawn" && suggestion.reinstatementAvailability?.available !== true;
  const reinstateReason = suggestion.reinstatementAvailability?.reason ?? "Refresh suggestion details before reinstating.";
  return <article className="pm-vendor-suggestion" aria-label={`${suggestion.vendor.name} for ${suggestion.mainLine?.mainLineName ?? "project-wide scope"}`}>
    <div className="pm-vendor-suggestion__top"><div><h3>{suggestion.vendor.name}</h3><p>{suggestion.mainLine?.mainLineName ?? "Project-wide suggestion"}</p>{suggestion.mainLine?.itemType === "temporary" ? <PMBadge value="Temporary item" /> : null}</div><PMBadge value={suggestion.status} /></div>
    {suggestion.sourceState !== "current" ? <p className="pm-vendor-suggestion__meta">{sourceLabel}</p> : null}
    <details className="pm-disclosure pm-vendor-suggestion__details"><summary>Suggestion details</summary>
    <p className="pm-vendor-suggestion__meta">{suggestion.suggestedBy.name} · {pmDate(suggestion.createdAt)} · Version {suggestion.storedSource.estimateVersion}</p>
    <p className="pm-vendor-suggestion__meta">{sourceLabel}</p>
    {suggestion.mainLine ? <details className="pm-disclosure"><summary>Approved scope ({suggestion.mainLine.occurrences.length})</summary><ul>{suggestion.mainLine.occurrences.map(occurrence => <li key={`${occurrence.sectionId}:${occurrence.sourceLineItemKey}`}>{occurrence.roomName}</li>)}</ul><p>{suggestion.mainLine.mainBasketName ?? "Basket context unavailable"}</p></details> : null}
    {suggestion.note ? <details className="pm-disclosure"><summary>Suggestion note</summary><p>{suggestion.note}</p></details> : null}
    {!suggestion.bidEligible && suggestion.readinessReasons.length ? <details className="pm-disclosure"><summary>Bid readiness needs review</summary>{suggestion.readinessReasons.map((reason, index) => <p key={index}>{reason}</p>)}</details> : null}
    <BidActivity suggestion={suggestion} />
    {!suggestion.canEdit && suggestion.editUnavailableReason ? <p>{suggestion.editUnavailableReason}</p> : null}
    {suggestion.canEdit && reinstateBlocked ? <p className="pm-vendor-suggestions__hint">{reinstateReason}</p> : null}
    </details>
    {suggestion.canEdit ? <div className="pm-actions"><Button size="compact" variant="secondary" disabled={disabled} onClick={() => onEdit("edit")}>Edit note</Button>
      <Button size="compact" variant="secondary" disabled={disabled || reinstateBlocked} onClick={() => onEdit(suggestion.status === "withdrawn" ? "reinstate" : "withdraw")}>{suggestion.status === "withdrawn" ? "Reinstate" : "Withdraw"}</Button></div>
      : null}
  </article>;
}

function BidActivity({ suggestion }: { suggestion: PMVendorSuggestion }) {
  const { activity } = suggestion;
  if (suggestion.scope === "project") return <p className="pm-vendor-suggestion__activity">Main Line activity is unavailable for project-wide suggestions.</p>;
  if (activity.availability === "unavailable") return <p className="pm-vendor-suggestion__activity">Bid activity unavailable</p>;
  if (!activity.items.length) return <p className="pm-vendor-suggestion__activity">{activity.truncated ? "Earlier bid activity requires review" : "No matching bid request"}</p>;
  return <details className="pm-disclosure pm-vendor-suggestion__activity"><summary>Bid activity for this {suggestion.mainLine?.itemType === "temporary" ? "temporary item" : "Main Line"} and vendor ({activity.items.length})</summary>
    <ol>{activity.items.map(item => <li key={item.invitationId}>
      <strong>{item.deliveryStatus === "consumed" ? "Request no longer open" : `Request ${pmLabel(item.deliveryStatus).toLowerCase()}`}</strong>
      <p>BOQ revision {item.revision} · Requested {pmDate(item.requestedAt)}</p>
      <p>{item.coverage === "partial" ? "Partial approved room scope requested" : "All recommended room scope requested"} ({item.coveredSourceLineItemKeys.length} occurrence{item.coveredSourceLineItemKeys.length === 1 ? "" : "s"})</p>
      <p>Requested rooms: {suggestion.mainLine?.occurrences.filter(scope => item.coveredSourceLineItemKeys.includes(scope.sourceLineItemKey)).map(scope => scope.roomName).join(", ")}</p>
      {item.deliveredAt ? <p>Email sent {pmDate(item.deliveredAt)}</p> : null}
      {Date.parse(item.requestedAt) < Date.parse(suggestion.createdAt) ? <p>This request predates the suggestion.</p> : null}
      {item.sourceRelation === "reconciled_history" ? <p>Earlier source activity, retained through Procurement reconciliation.</p> : null}
      {item.bidReceivedAt ? <p>Basket bid received {pmDate(item.bidReceivedAt)}. {item.lineResponded ? `${item.respondedSourceLineItemKeys.length} matching scope occurrence${item.respondedSourceLineItemKeys.length === 1 ? " has" : "s have"} a line response.` : "No response is recorded on this item."}</p> : null}
    </li>)}</ol>{activity.truncated ? <p>Only recent matching activity is shown. Earlier records remain in Procurement history.</p> : null}
  </details>;
}

function SuggestionEditor({ projectId, editor, estimate, currentSuggestion, fresh, onClose, onRefresh, onSaved }: {
  projectId: string; editor: Editor; estimate: PMEstimateView; currentSuggestion?: PMVendorSuggestion;
  fresh: boolean; onClose: () => void; onRefresh: () => Promise<void>; onSaved: (message: string) => void;
}) {
  const mutation = usePMVendorSuggestionCommand(projectId);
  const [source, setSource] = useState<PMApprovedSourceRef>(() => editor.kind === "update" ? editor.suggestion.source! : estimate.source!);
  const [scope, setScope] = useState(() => editor.kind === "create" ? editor.mainLine : editor.suggestion.mainLine!);
  const [{ version, status: reviewedStatus }, setReviewedSuggestion] = useState<Pick<PMVendorSuggestion, "version" | "status">>(() => ({
    version: editor.kind === "update" ? editor.suggestion.version : 0,
    status: editor.kind === "update" ? editor.suggestion.status : "suggested"
  }));
  const [note, setNote] = useState(editor.kind === "update" ? editor.suggestion.note : "");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [vendorId, setVendorId] = useState("");
  const [selectionChanged, setSelectionChanged] = useState(false);
  const attempt = useRef<{ digest: string; key: string } | null>(null);
  const sourceChanged = pmSourceKey(source) !== pmSourceKey(estimate.source);
  const changedVersion = editor.kind === "update" && currentSuggestion !== undefined && currentSuggestion.version !== version;
  const candidateQuery = usePMVendorCandidates(projectId, scope && source ? { expectedSource: source, mainLineId: scope.mainLineId, q: search || undefined, limit: PAGE_SIZE, offset } : null,
    editor.kind === "create" && !sourceChanged);
  const title = editor.kind === "create" ? "Suggest a vendor" : editor.action === "withdraw" ? "Withdraw suggestion" : editor.action === "reinstate" ? "Reinstate suggestion" : "Edit suggestion note";
  const targetCurrentLine = estimate.mainLines.find(line => line.mainLineId === scope?.mainLineId);
  const reinstateBlocked = editor.kind === "update" && editor.action === "reinstate" && currentSuggestion?.reinstatementAvailability?.available !== true;
  const blocked = !fresh || !estimate.writeAvailability.available || sourceChanged || changedVersion || !scope?.canSuggest || !targetCurrentLine?.canSuggest ||
    (editor.kind === "update" && !currentSuggestion?.canEdit) || reinstateBlocked;
  const lookupReady = candidateQuery.data && !candidateQuery.isError && !candidateQuery.isFetching &&
    pmSourceKey(candidateQuery.data.source) === pmSourceKey(source) && candidateQuery.data.mainLine.scopeDigest === scope?.scopeDigest;
  const vendor = candidateQuery.data?.items.find(candidate => candidate.id === vendorId);
  const selectedReady = editor.kind === "update" || Boolean(vendor?.canSuggest && lookupReady);
  const error = mutation.error ?? (editor.kind === "create" ? candidateQuery.error : null);
  const denied = pmDenied(error);
  const duplicate = error instanceof ApiError && error.code === "VENDOR_SUGGESTION_DUPLICATE";
  const duplicateAuthor = duplicate ? error.fields?.suggestedBy : undefined;
  const membershipIssue = error instanceof ApiError && ["PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE", "VENDOR_SUGGESTION_VENDOR_NOT_LINKED"].includes(error.code);
  const conflict = pmEstimateConflict(error) && !duplicate && !membershipIssue;

  useEffect(() => {
    if (editor.kind === "create" && vendorId && lookupReady && !vendor?.canSuggest) {
      setVendorId(""); setSelectionChanged(true);
    }
  }, [editor.kind, vendorId, lookupReady, vendor?.canSuggest]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || duplicate || membershipIssue || !selectedReady || !source || !scope || mutation.isPending) return;
    const status = editor.kind === "update" ? editor.action === "withdraw" ? "withdrawn" : editor.action === "reinstate" ? "suggested" : reviewedStatus : "suggested";
    const payload = editor.kind === "create" ? { expectedSource: source, mainLineId: scope.mainLineId, vendorId: vendor!.id, note } : { expectedSource: source, expectedVersion: version, note, status };
    const digest = JSON.stringify(payload);
    if (attempt.current?.digest !== digest) attempt.current = { digest, key: crypto.randomUUID() };
    try {
      if (editor.kind === "create") await mutation.mutateAsync({ kind: "create", body: { expectedSource: source, mainLineId: scope.mainLineId, vendorId: vendor!.id, note, idempotencyKey: attempt.current.key } });
      else await mutation.mutateAsync({ kind: "update", suggestionId: editor.suggestion.id, body: { expectedSource: source, expectedVersion: version, note, status, idempotencyKey: attempt.current.key } });
      onSaved(editor.kind === "create" ? "Suggestion saved for Procurement to review." : editor.action === "withdraw" ? "Suggestion withdrawn. Existing bid requests are unchanged." : editor.action === "reinstate" ? "Suggestion reinstated for Procurement to review." : "Suggestion note updated.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "VENDOR_SUGGESTION_VENDOR_NOT_LINKED") setVendorId("");
      // Preserve the note and command key for a safe retry of unchanged requests.
    }
  }

  function reviewCurrent() {
    if (mutation.isPending || !estimate.source || !targetCurrentLine?.canSuggest || (editor.kind === "update" && !currentSuggestion?.canEdit)) return;
    setSource(estimate.source);
    setScope(targetCurrentLine);
    if (currentSuggestion) setReviewedSuggestion({ version: currentSuggestion.version, status: currentSuggestion.status });
    setVendorId(""); setSelectionChanged(false);
    setOffset(0);
    attempt.current = null;
    mutation.reset();
  }

  async function refreshVendorLinks() {
    if (mutation.isPending) return;
    setVendorId(""); setSelectionChanged(false); mutation.reset();
    if (editor.kind === "create") await candidateQuery.refetch();
    else await onRefresh();
  }

  function selectMainLine(mainLineId: string) {
    const nextLine = estimate.mainLines.find(line => line.mainLineId === mainLineId);
    if (mutation.isPending || !estimate.source || !nextLine || nextLine.mainLineId === scope?.mainLineId) return;
    setSource(estimate.source); setScope(nextLine);
    setNote(""); setSearch(""); setOffset(0); setVendorId(""); setSelectionChanged(false);
    attempt.current = null;
    mutation.reset();
  }

  if (denied) return <Dialog title="Project access unavailable" eyebrow="Project Manager" onClose={onClose} returnFocusRef={editor.returnFocusRef} className="pm-dialog pm-estimate-dialog"><div className="pm-estimate-dialog__body"><p role="alert">Your assignment may have changed. Return to your project list to refresh access.</p><Button size="compact" onClick={onClose}>Close</Button></div></Dialog>;
  return <Dialog title={title} eyebrow="Procurement handoff" onClose={onClose} busy={mutation.isPending} returnFocusRef={editor.returnFocusRef} className="pm-dialog pm-estimate-dialog">
    <form className="pm-form pm-estimate-dialog__body" onSubmit={event => void submit(event)}>
      {editor.kind === "create" ? <label>Main Line<select value={scope?.mainLineId ?? ""} disabled={mutation.isPending || !estimate.source || !estimate.mainLines.length} onChange={event => selectMainLine(event.target.value)}>
        {!targetCurrentLine && scope ? <option value={scope.mainLineId} disabled>{scope.mainLineName} (unavailable)</option> : null}
        {estimate.mainLines.map(line => <option key={line.mainLineId} value={line.mainLineId}>{line.mainLineName}{line.itemType === "temporary" ? " · Temporary item" : ""}</option>)}
      </select></label> : null}
      <div className="pm-estimate-dialog__context"><h3>{scope?.mainLineName}</h3><p>{scope?.mainBasketName}</p><p>{source.phase === "pre" ? "Approved pre-estimate" : source.phase === "post" ? "Approved final estimate" : "Approved estimate"} · Version {source.estimateVersion}</p>
        {editor.kind === "create" ? <p>This suggestion uses the current approved source.</p> : null}
        {scope?.itemType === "temporary" ? <PMBadge value="Temporary item" /> : null}
        {editor.kind === "update" ? <p>Suggestion status: {pmLabel(reviewedStatus)}</p> : null}
        <details><summary>Included room scope ({scope?.occurrences.length ?? 0})</summary><ul>{scope?.occurrences.map(item => <li key={`${item.sectionId}:${item.sourceLineItemKey}`}>{item.roomName}</li>)}</ul></details>
      </div>
      {sourceChanged || changedVersion || conflict ? <div className="pm-message" role="alert"><p>{sourceChanged ? "The approved source changed. Your note is preserved." : changedVersion ? "This suggestion changed. Your note is preserved." : pmError(error)}</p>
        {changedVersion && currentSuggestion ? <p>Current status: {pmLabel(currentSuggestion.status)}</p> : null}
        <div className="pm-actions"><Button size="compact" variant="secondary" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) void onRefresh(); }}>Refresh current details</Button>
          <Button size="compact" variant="secondary" disabled={mutation.isPending || !targetCurrentLine?.canSuggest || (editor.kind === "update" && !currentSuggestion?.canEdit)} onClick={reviewCurrent}>Review current scope</Button></div></div> : null}
      {!targetCurrentLine?.canSuggest ? <p className="pm-message">{targetCurrentLine?.unavailableReason ?? "This item is no longer available in the current approved scope."}</p> : null}
      {duplicate ? <div className="pm-message" role="alert"><p>{pmError(error)}</p>{duplicateAuthor ? <p>Suggested by {duplicateAuthor}.</p> : null}<Button size="compact" variant="secondary" onClick={onClose}>Review saved suggestions</Button></div> : null}
      {membershipIssue ? <div className="pm-message" role="alert"><p>{pmError(error)}</p><Button size="compact" variant="secondary" disabled={mutation.isPending} onClick={() => void refreshVendorLinks()}>Refresh linked vendors</Button></div> : null}
      {reinstateBlocked ? <p className="pm-message">{currentSuggestion?.reinstatementAvailability?.reason ?? "Refresh suggestion details before reinstating."}</p> : null}
      {editor.kind === "create" ? <>
        <label>Search linked vendors<input value={search} disabled={mutation.isPending} maxLength={160} onChange={event => { if (mutation.isPending) return; setSearch(event.target.value); setOffset(0); setVendorId(""); setSelectionChanged(false); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
        {candidateQuery.isPending && !sourceChanged ? <p role="status">Loading linked vendors…</p> : null}
        {candidateQuery.isError && !conflict && !membershipIssue ? <div className="pm-message" role="alert"><p>{pmError(candidateQuery.error)}</p><Button size="compact" variant="secondary" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) void candidateQuery.refetch(); }}>Retry vendor lookup</Button></div> : null}
        {selectionChanged ? <p role="status">The selected vendor is no longer available for this item. Choose a linked vendor to continue.</p> : null}
        {candidateQuery.data && !sourceChanged && !candidateQuery.isError ? <><fieldset className="pm-vendor-candidates"><legend>Vendors linked in Configuration</legend>
          {candidateQuery.data.items.length ? candidateQuery.data.items.map(candidate => <div key={candidate.id} className="pm-vendor-candidate"><label><input type="radio" name="suggested-vendor" value={candidate.id} checked={vendorId === candidate.id} disabled={mutation.isPending || !candidate.canSuggest || candidateQuery.isError || candidateQuery.isFetching} onChange={() => { if (mutation.isPending) return; setVendorId(candidate.id); setSelectionChanged(false); mutation.reset(); }} />
            <span><strong>{candidate.name}</strong><small>{candidate.code}</small>{candidate.bidEligible ? <small>Ready for Procurement eligibility review</small> : <small>{candidate.reasons[0] ?? "Bid readiness needs review"}</small>}
            </span></label>{candidate.reasons.length > 1 ? <details><summary>Readiness details</summary>{candidate.reasons.map((reason, index) => <p key={index}>{reason}</p>)}</details> : null}</div>) : lookupReady ? <p>{candidateQuery.data.total > 0
              ? `No linked vendors are on this page. Use Previous vendors to review the remaining ${candidateQuery.data.total}.`
              : search.trim() ? "No linked vendors match this search." : "No vendors are linked to this Main Line in Configuration."}</p> : null}
        </fieldset><nav className="pm-pagination" aria-label="Linked vendor pages"><span>{lookupReady ? `${candidateQuery.data.total} linked vendors` : "Refreshing linked vendors…"}</span><div className="pm-actions"><Button size="compact" variant="secondary" disabled={mutation.isPending || offset === 0 || candidateQuery.isFetching} onClick={() => { if (mutation.isPending) return; setOffset(value => Math.max(0, value - PAGE_SIZE)); setVendorId(""); setSelectionChanged(false); }}>Previous vendors</Button><Button size="compact" variant="secondary" disabled={mutation.isPending || offset + PAGE_SIZE >= candidateQuery.data.total || candidateQuery.isFetching} onClick={() => { if (mutation.isPending) return; setOffset(value => value + PAGE_SIZE); setVendorId(""); setSelectionChanged(false); }}>Next vendors</Button></div></nav></> : null}
      </> : <p className="pm-estimate-dialog__vendor">{editor.suggestion.vendor.name} · {editor.suggestion.vendor.code}</p>}
      <label>Suggestion note (optional)<textarea value={note} disabled={mutation.isPending} maxLength={1000} rows={3} onChange={event => { if (!mutation.isPending) setNote(event.target.value); }} /></label>
      {error && !conflict && !membershipIssue && editor.kind !== "create" ? <p role="alert" className="pm-message">{pmError(error)}</p> : null}
      {mutation.error && !conflict && !duplicate && !membershipIssue && editor.kind === "create" ? <p role="alert" className="pm-message">{pmError(mutation.error)}</p> : null}
      {!fresh ? <p className="pm-vendor-suggestions__hint">Waiting for current project details before saving.</p> : null}
      <p className="pm-vendor-suggestions__hint">Procurement selects vendors and sends requests for the basket BOQ. Saving a suggestion does not send a bid request.</p>
      <div className="pm-actions"><Button size="compact" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button size="compact" type="submit" busy={mutation.isPending} disabled={blocked || duplicate || membershipIssue || !selectedReady}>
        {editor.kind === "create" ? "Suggest to Procurement" : editor.action === "withdraw" ? "Withdraw suggestion" : editor.action === "reinstate" ? "Reinstate suggestion" : "Save note"}
      </Button></div>
    </form>
  </Dialog>;
}
