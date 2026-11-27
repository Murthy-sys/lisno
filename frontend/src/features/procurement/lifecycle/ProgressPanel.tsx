import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { lifecycleApi, type LifecycleSummary, type LifecycleItem, type ProcurementProgressObservation, type ProcurementReviewRound, type ProcurementReviewMember, type ProcurementReviewDetail } from "./lifecycleApi";
import { Blockers, isoInputDate, lifecycleDate, lifecycleLabel, LifecycleHistoryList, MutationNotice, Pager, ReadState, ReasonAction, TargetRecord, lifecycleDenied, useLifecycleQuery, useLifecycleWrite, type LifecyclePanelProps } from "./LifecycleShared";
import { InspectionsPanel } from "./InspectionsPanel";
import { FindingForm } from "./FindingForm";
import { DelayFields, type DelayDraft } from "./DelayFields";
import { ProgressPriorityPanels } from "./ProgressPriorityPanels";

type SetupCallbacks = { onSetupStart?: () => void; onSetupSaved?: (summary: LifecycleSummary) => void; onSetupFailed?: () => void };
export function LifecyclePolicyForm({ summary, onReload, onSetupStart, onSetupSaved, onSetupFailed, ...props }: LifecyclePanelProps & SetupCallbacks & { summary: LifecycleSummary; onReload?: () => void }) {
  const setup = summary.allowedActions.includes("setup"); const [days, setDays] = useState(summary.state?.policy.reviewIntervalDays ?? 7);
  const [count, setCount] = useState<2 | 3>(summary.state?.policy.inspectionCount ?? 2); const [timezone, setTimezone] = useState(summary.state?.policy.timezone ?? "Asia/Kolkata");
  const [reason, setReason] = useState(""); const [version] = useState(summary.version); const [source] = useState(summary.sourceDigest);
  const api = lifecycleApi(props.projectId, props.audience); const command = useLifecycleWrite(value => setup ? api.setup(value) : api.policy(value), value => { if (setup) onSetupSaved?.(value); });
  const stale = props.disabled || version !== summary.version || source !== summary.sourceDigest;
  return <form className="lc-form" onSubmit={event => { event.preventDefault(); if (stale || command.isPending) return; if (setup) onSetupStart?.(); command.mutate({ expectedVersion: version, sourceDigest: source, policy: { reviewIntervalDays: days, inspectionCount: count, timezone }, reason }, { onError: () => { if (setup) onSetupFailed?.(); } }); }}><fieldset disabled={stale || command.isPending}><legend>{setup ? "Set up project checks" : "Review policy"}</legend><p>Review rounds cover all appointed items. This policy requires two or three physical visits across the whole project.</p><div className="lc-fields"><label>Review interval (days)<input type="number" min={1} max={7} required value={days} onChange={event => setDays(Number(event.target.value))} /></label><label>Project inspections<select value={count} disabled={!setup} onChange={event => setCount(Number(event.target.value) as 2 | 3)}><option value={2}>2 project inspections</option><option value={3}>3 project inspections</option></select></label><label>Project timezone<input required value={timezone} disabled={!setup} onChange={event => setTimezone(event.target.value)} /></label></div><label>Reason<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><Button type="submit" busy={command.isPending}>{setup ? "Set up procurement lifecycle" : "Save review policy"}</Button></fieldset>{stale ? <div role="status"><p>The policy source changed. Your draft is retained. Load the current policy to replace these values before saving.</p>{onReload ? <Button variant="secondary" disabled={props.disabled} onClick={onReload}>Load current policy</Button> : null}</div> : null}<MutationNotice error={command.error} success={command.isSuccess} /></form>;
}
function ProgressCheckForm({ round, member, onClose, onSaved, ...props }: LifecyclePanelProps & { round: ProcurementReviewRound; member: ProcurementReviewMember; onClose: () => void; onSaved: () => void }) {
  const old = member.check; const [version] = useState(round.version); const [source] = useState(round.currentSourceDigest);
  const [originalCheckedAt] = useState(old?.checkedAt ?? new Date().toISOString());
  const [checkedAt, setCheckedAt] = useState(() => { const date = new Date(originalCheckedAt); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19); });
  const [timeEdited, setTimeEdited] = useState(false); const [status, setStatus] = useState<ProcurementProgressObservation["status"]>(old?.status ?? "in_progress");
  const [notes, setNotes] = useState(old?.notes ?? ""); const [nextAction, setNextAction] = useState(old?.nextAction ?? ""); const [nextCheckDate, setNextCheckDate] = useState(old?.nextCheckDate ?? "");
  const [forecastDate, setForecastDate] = useState(old?.forecastDate ?? ""); const [forecastReason, setForecastReason] = useState(old?.forecastReason ?? ""); const [reason, setReason] = useState("");
  const [delay, setDelay] = useState<DelayDraft>({ delayed: old?.delayed ?? false, delayReason: old?.delayReason ?? "", responsibleParty: old?.responsibleParty ?? "", recoveryAction: old?.recoveryAction ?? "", recoveryDate: old?.recoveryDate ?? "" });
  const command = useLifecycleWrite(value => lifecycleApi(props.projectId, props.audience).reviewCommand(value), onSaved);
  const stale = props.disabled || version !== round.version || source !== round.currentSourceDigest;
  const blocked = member.item.priority === null || member.blockingItemIds.length > 0 || (!old && !member.canCheck) || !round.allowedActions.includes(old ? "correct" : "check");
  return <form className="lc-form" onSubmit={event => { event.preventDefault(); if (stale || blocked || command.isPending) return; const delayed = delay.delayed || status === "blocked"; command.mutate({ action: old ? "correct" : "check", roundId: round.id, itemId: member.item.id, expectedVersion: version, sourceDigest: source,
    ...(old ? { checkId: old.id, reason } : {}), observation: { checkedAt: timeEdited ? isoInputDate(checkedAt) : originalCheckedAt, status, progress: null, notes, nextAction, nextCheckDate, delayed,
      delayReason: delayed ? delay.delayReason : null, responsibleParty: delayed ? delay.responsibleParty : null, recoveryAction: delayed ? delay.recoveryAction : null, recoveryDate: delayed ? delay.recoveryDate : null, forecastDate: forecastDate || null, forecastReason: forecastDate ? forecastReason : null } }); }}>
    <fieldset disabled={stale || blocked || command.isPending}><legend>{old ? "Amend work update" : "Update work"}: {member.item.itemName}</legend><div className="lc-fields"><label>Checked at<input type="datetime-local" step="1" required value={checkedAt} onChange={event => { setCheckedAt(event.target.value); setTimeEdited(true); }} /></label><label>Work status<select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label></div>
    <label>Work update notes<textarea required maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label><div className="lc-fields"><label>Next action<textarea required maxLength={2000} value={nextAction} onChange={event => setNextAction(event.target.value)} /></label><label>Next check date<input type="date" required value={nextCheckDate} onChange={event => setNextCheckDate(event.target.value)} /></label></div><p className="lc-muted">The next check must be within {round.intervalDays} day(s) of the observation.</p><DelayFields value={delay} onChange={setDelay} force={status === "blocked"} />
    <details><summary>Revise the expected finish forecast</summary><div className="lc-fields"><label>Forecast finish date<input type="date" value={forecastDate} onChange={event => setForecastDate(event.target.value)} /></label><label>Forecast change reason<textarea required={Boolean(forecastDate)} minLength={3} value={forecastReason} onChange={event => setForecastReason(event.target.value)} /></label></div><p>The original target stays in the project history.</p></details>
    {old ? <label>Correction reason<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label> : null}<Button type="submit" busy={command.isPending}>{old ? "Save amended work update" : "Save work update"}</Button></fieldset>
    {stale ? <p role="alert">Project records changed while you were editing. Your draft is retained; reopen the work update after reviewing the latest records.</p> : null}<MutationNotice error={command.error} /><Button variant="quiet" onClick={onClose}>Close work update</Button>
  </form>;
}
function ItemFacts({ item }: { item: LifecycleItem }) {
  return <><dl className="lc-facts"><div><dt>Original target</dt><dd>{item.targetDate ?? "Not set"}</dd></div><div><dt>Vendor status</dt><dd>{item.vendorStatus ? lifecycleLabel(item.vendorStatus) : "Not reported"}</dd></div></dl>
    {item.vendorNote ? <p className="lc-muted">Vendor note: {item.vendorNote}</p> : null}</>;
}
type StartReviewAction = { allowed: boolean; disabled: boolean; pending: boolean; onStart: (itemId: string) => void };
function ReviewRound({ round, currentItems, statusMessage, startReview, ...props }: LifecyclePanelProps & { round: ProcurementReviewRound; currentItems: LifecycleItem[]; statusMessage?: string; startReview: StartReviewAction }) {
  const [editing, setEditing] = useState<string | null>(null); const [action, setAction] = useState<string | null>(null);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);
  const membersById = new Map(round.members.map(member => [member.item.id, member]));
  const command = useLifecycleWrite(value => lifecycleApi(props.projectId, props.audience).reviewCommand(value), () => setAction(null));
  const perform = (reason: string) => command.mutate({ action, roundId: round.id, expectedVersion: round.version, sourceDigest: round.currentSourceDigest, ...(action === "finalize" ? { notes: reason } : { reason }) });
  return <TargetRecord id={round.id}><header className="lc-section-head"><div><h3>Review round {round.sequence}</h3><p>{round.checkedCount} of {round.requiredCount} item checks recorded · {lifecycleLabel(round.status)}{round.late ? " · Recorded late" : ""}</p></div><div><span className="lc-kicker">Due</span><strong>{lifecycleDate(round.effectiveDueAt, round.timezone)}</strong></div></header>
    {round.effectiveDueAt !== round.originalDueAt ? <p>Original due time: {lifecycleDate(round.originalDueAt, round.timezone)}</p> : null}<Blockers blockers={round.blockers} />
    {round.sourceChanged ? <details className="lc-source-changes" open><summary>Review current work and priority changes</summary><div className="lc-fields"><div><h4>Round snapshot</h4><ul>{round.members.map(member => <li key={member.item.id}>{member.item.itemName} · {member.item.roomName} · {member.item.vendorName} · {member.item.priority ?? "Priority not set"}</li>)}</ul></div><div><h4>Current appointed work</h4><ul>{currentItems.map(item => <li key={item.id}>{item.itemName} · {item.roomName} · {item.vendorName} · {item.priority ?? "Priority not set"}</li>)}</ul></div></div></details> : null}
    <p className="lc-muted">Record each P1 work update before P2, then P3. Work can still be in progress or blocked; a complete observation unlocks the next priority.</p>
    <ProgressPriorityPanels items={round.members.map(member => member.item)} round={round} statusMessage={statusMessage} renderItem={item => {
      const member = membersById.get(item.id)!;
      const permitted = round.allowedActions.includes(member.check ? "correct" : "check");
      const blocker = item.priority === null ? "Set this item's priority in Configuration before updating work."
        : member.blockingItemIds.length ? `First record: ${member.blockingItemIds.map(id => round.members.find(candidate => candidate.item.id === id)?.item.itemName ?? "Earlier priority item").join(", ")}.`
        : round.version === 0 ? "Start the current review before recording a work update."
        : statusMessage ?? (!permitted ? `This review is ${lifecycleLabel(round.status).toLowerCase()}; work updates are read-only.` : null);
      return <TargetRecord key={item.id} id={item.id}><div data-work-item={item.id}>
        <div className="lc-row-head"><div><h4>{item.itemName}</h4><p>{item.roomName} · {item.vendorName}</p></div></div><ItemFacts item={item} />
        <section className="lc-work-update" aria-label={`Work update for ${item.itemName}`}><h5>Work update</h5>{member.check ? <><strong>{lifecycleLabel(member.check.status)}</strong><p>{member.check.notes}</p><p className="lc-muted">Observed {lifecycleDate(member.check.checkedAt, round.timezone)} · Recorded {lifecycleDate(member.check.submittedAt, round.timezone)} by {member.check.submittedByName}{member.check.late ? " · Late" : ""}</p><p>Next: {member.check.nextAction} · {member.check.nextCheckDate}</p>{member.check.delayed ? <p className="lc-error">Delay: {member.check.delayReason} · {member.check.responsibleParty}. Recovery: {member.check.recoveryAction} by {member.check.recoveryDate}.</p> : null}</> : <p className="lc-muted">No work update recorded for this review.</p>}</section>
        {blocker ? <p className="lc-gate" data-work-blocker tabIndex={-1}>{blocker}</p> : null}
        {savedItemId === item.id ? <p role="status">Work update saved.{props.disabled ? " Refresh project records to see the latest update." : ""}</p> : null}
        {round.version === 0 && startReview.allowed ? <Button variant="secondary" disabled={startReview.disabled} busy={startReview.pending} onClick={() => startReview.onStart(item.id)}>Start review to update work</Button>
          : editing === item.id ? <ProgressCheckForm {...props} round={round} member={member} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSavedItemId(item.id); }} />
          : permitted ? <Button data-work-action variant="secondary" disabled={props.disabled || (!member.check && !member.canCheck) || member.blockingItemIds.length > 0 || item.priority === null} onClick={() => { setEditing(item.id); setSavedItemId(null); }}>{member.check ? "Amend work update" : "Update work"}</Button> : null}
      </div></TargetRecord>;
    }} />
    <div className="lc-actions">{(["reconcile", "pause", "resume", "finalize"] as const).filter(value => round.allowedActions.includes(value)).map(value => <Button key={value} variant={value === "finalize" ? "primary" : "secondary"} disabled={props.disabled || command.isPending} onClick={() => setAction(value)}>{({ reconcile: "Review source changes", pause: "Pause reviews", resume: "Resume reviews", finalize: "Submit review round" })[value]}</Button>)}</div>
    {action ? <ReasonAction label={action === "finalize" ? "Submit review round" : action === "reconcile" ? "Reconcile review source" : `${lifecycleLabel(action)} reviews`} disabled={props.disabled} pending={command.isPending} error={command.error} onSubmit={perform}>{action === "reconcile" ? <p>Refresh this round's membership from current appointments and Configuration priorities. Previous observations remain in history.</p> : null}</ReasonAction> : null}
  </TargetRecord>;
}
function ReviewHistory({ ...props }: LifecyclePanelProps) {
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<string | null>(null); const api = lifecycleApi(props.projectId, props.audience);
  const query = useLifecycleQuery(props, "review-history", () => api.reviews({ limit: 10, offset }), { offset });
  return <details className="lc-disclosure"><summary>Review history</summary><ReadState query={query}>{data => <><ol className="lc-history">{data.items.map(round => <li key={round.id}><button type="button" className="lc-text-button" onClick={() => setSelected(selected === round.id ? null : round.id)}>Round {round.sequence} · {lifecycleLabel(round.status)} · {round.checkedCount}/{round.requiredCount} checks</button><span>Original due {lifecycleDate(round.originalDueAt, round.timezone)}</span>{selected === round.id ? <ReviewHistoryDetail {...props} roundId={round.id} /> : null}</li>)}</ol><Pager offset={offset} limit={10} total={data.total} onChange={setOffset} label="Review history pages" /></>}</ReadState></details>;
}
function ReviewHistoryDetail({ roundId, ...props }: LifecyclePanelProps & { roundId: string }) {
  const query = useLifecycleQuery(props, `review/${roundId}`, () => lifecycleApi(props.projectId, props.audience).review(roundId));
  return <ReadState query={query}>{data => <><ol className="lc-history">{data.checks.map(check => <li key={check.id}><strong>{data.members.find(member => member.item.id === check.itemId)?.item.itemName ?? "Historical appointed item"} · Revision {check.revision}</strong><span>{lifecycleLabel(check.status)} · {check.submittedByName} · {lifecycleDate(check.submittedAt, data.timezone)}</span><p>{check.notes}</p>{check.correctionReason ? <p>Correction: {check.correctionReason}</p> : null}</li>)}</ol><LifecycleHistoryList items={data.history} /></>}</ReadState>;
}
function PolicyDisclosure({ summary, revealRequest, onSetupStart, onSetupSaved, onSetupFailed, ...props }: LifecyclePanelProps & SetupCallbacks & { summary: LifecycleSummary; revealRequest: number }) {
  const [mounted, setMounted] = useState(false); const [revision, setRevision] = useState(0);
  const ref = useRef<HTMLDetailsElement>(null); const setup = summary.allowedActions.includes("setup");
  useEffect(() => {
    const disclosure = ref.current;
    if (!revealRequest || !disclosure || disclosure.closest("[hidden]")) return;
    disclosure.open = true;
    if (!mounted) { setMounted(true); return; }
    disclosure.scrollIntoView?.({ block: "center" });
    disclosure.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
  }, [revealRequest, mounted]);
  return <details ref={ref} className="lc-policy" onToggle={event => { if (event.currentTarget.open) setMounted(true); }}>
    <summary>{setup ? "Set up project checks" : "Review policy"}</summary>
    {mounted ? <LifecyclePolicyForm key={revision} {...props} summary={summary} onReload={() => setRevision(value => value + 1)} onSetupStart={onSetupStart} onSetupSaved={onSetupSaved} onSetupFailed={onSetupFailed} /> : null}
  </details>;
}
function AppointedItemPreview({ summary, onSetup, setupAllowed, disabled, startReview }: { summary: LifecycleSummary; onSetup: (itemId: string) => void; setupAllowed: boolean; disabled: boolean; startReview: StartReviewAction }) {
  const message = summary.state ? "Start review to update work" : "Set up project checks";
  return <section aria-label="Appointed item preview"><h3>Appointed items</h3><p className="lc-muted">{summary.state ? "Start the current review before recording work updates." : "Set up project checks before recording work updates. Appointed work is shown below for review."}</p>
    <ProgressPriorityPanels items={summary.source.available ? summary.source.items : []} statusMessage={message}
      unavailable={summary.source.available ? undefined : "Items unavailable"} renderItem={item => <TargetRecord key={item.id} id={item.id}><div data-work-item={item.id}>
        <div className="lc-row-head"><div><h4>{item.itemName}</h4><p>{item.roomName} · {item.vendorName}</p></div><span className="lc-status">Review not opened</span></div><ItemFacts item={item} />
        <section className="lc-work-update" aria-label={`Work update for ${item.itemName}`}><h5>Work update</h5><p className="lc-muted">No work update recorded for this review.</p></section>
        {item.priority === null ? <p className="lc-gate">Set this item's priority in Configuration before updating work.</p> : null}
        {setupAllowed ? <Button variant="secondary" disabled={disabled} onClick={() => onSetup(item.id)}>Set up to update work</Button>
          : startReview.allowed ? <Button variant="secondary" disabled={startReview.disabled} busy={startReview.pending} onClick={() => startReview.onStart(item.id)}>Start review to update work</Button>
          : <p className="lc-muted">{summary.projectStatus !== "active" ? "Work updates are available during active project execution." : "Project setup or review access is required before updating work."}</p>}
      </div></TargetRecord>} />
  </section>;
}
type WorkContinuation = {
  itemId: string; kind: "setup" | "open"; sourceDigest: string; stage: "selected" | "working" | "ready";
  roundId?: string; opensAt?: string;
};
export function ProgressPanel(props: LifecyclePanelProps & { summary: LifecycleSummary }) {
  return <ProgressPanelContent key={`${props.projectId}:${props.actorId}:${props.audience ?? "procurement"}`} {...props} />;
}
function ProgressPanelContent({ summary, ...props }: LifecyclePanelProps & { summary: LifecycleSummary }) {
  const api = lifecycleApi(props.projectId, props.audience); const query = useLifecycleQuery(props, "reviews", () => api.reviews()); const [urgent, setUrgent] = useState(false);
  const [continuation, setContinuation] = useState<WorkContinuation | null>(null); const [policyRequest, setPolicyRequest] = useState(0);
  const [notice, setNotice] = useState(""); const panelRef = useRef<HTMLDivElement>(null); const noticeRef = useRef<HTMLParagraphElement>(null); const location = useLocation();
  const open = useLifecycleWrite(value => api.reviewCommand(value), (value: ProcurementReviewDetail) => setContinuation(current => current?.kind === "open" && current.stage === "working" ? { ...current, stage: "ready", roundId: value.id } : current));
  const sourceUnavailable = !summary.source.available;
  const active = summary.projectStatus === "active" && props.audience !== "admin";
  const stale = props.disabled || query.isFetching || query.isError;
  const working = continuation?.stage === "working" || open.isPending;
  const setupAllowed = active && summary.allowedActions.includes("setup");
  const openAllowed = active && Boolean(query.data?.allowedActions.includes("open"));
  const setupCallbacks: SetupCallbacks = {
    onSetupStart: () => { setNotice(""); setContinuation(current => current?.kind === "setup" ? { ...current, stage: "working", sourceDigest: summary.sourceDigest } : current); },
    onSetupSaved: value => setContinuation(current => current?.kind === "setup" && current.stage === "working" ? { ...current, stage: "ready", opensAt: value.state?.activatedAt } : current),
    onSetupFailed: () => setContinuation(current => current?.kind === "setup" ? { ...current, stage: "selected" } : current)
  };
  function selectSetup(itemId: string) {
    if (!setupAllowed || stale || sourceUnavailable || working) return;
    setNotice(""); setContinuation({ kind: "setup", itemId, sourceDigest: summary.sourceDigest, stage: "selected" }); setPolicyRequest(value => value + 1);
  }
  function startReview(itemId?: string) {
    if (!openAllowed || stale || sourceUnavailable || working || !query.data) return;
    setNotice(""); setContinuation(itemId ? { kind: "open", itemId, sourceDigest: query.data.sourceDigest, stage: "working" } : null);
    open.mutate({ action: "open", expectedVersion: 0, sourceDigest: query.data.sourceDigest }, { onError: () => setContinuation(current => current?.kind === "open" ? { ...current, stage: "selected" } : current) });
  }
  useEffect(() => {
    if (!continuation || continuation.stage !== "ready" || stale || !summary.state || sourceUnavailable || !panelRef.current || panelRef.current.closest("[hidden]")) return;
    const round = query.data?.current;
    let message = "";
    if (!active) message = "Work updates are available only during active project execution with Procurement access.";
    else if (!round || round.version === 0) message = "No saved review is available for the selected item. Review the project prerequisites before updating work.";
    else if (continuation.roundId && continuation.roundId !== round.id || continuation.opensAt && continuation.opensAt !== round.opensAt) message = "The review changed while preparing this item. Choose the item again in the current review.";
    else if (continuation.sourceDigest !== summary.sourceDigest || continuation.sourceDigest !== round.currentSourceDigest || round.sourceChanged) message = "Appointed work changed. Review the current items and source changes before updating work.";
    else if (!round.members.some(member => member.item.id === continuation.itemId)) message = "The selected item is no longer in this review. Choose an item from the current appointed work.";
    if (message) { setNotice(message); setContinuation(null); return; }
    const item = Array.from(panelRef.current.querySelectorAll<HTMLElement>("[data-work-item]")).find(element => element.dataset.workItem === continuation.itemId);
    if (!item) return;
    for (let ancestor = item.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    const target = item.querySelector<HTMLElement>("[data-work-action]:not(:disabled)") ?? item.querySelector<HTMLElement>("[data-work-blocker]") ?? item;
    if (!target.hasAttribute("tabindex") && target.tagName !== "BUTTON") target.tabIndex = -1;
    target.scrollIntoView?.({ block: "center" }); target.focus({ preventScroll: true }); setContinuation(null);
  }, [continuation, stale, summary.state, summary.sourceDigest, sourceUnavailable, active, query.data, location.key]);
  useEffect(() => { if (notice && noticeRef.current && !noticeRef.current.closest("[hidden]")) noticeRef.current.focus(); }, [notice]);
  if (lifecycleDenied(query.error)) return <ReadState query={query}>{() => null}</ReadState>;
  const startReviewAction: StartReviewAction = { allowed: openAllowed, disabled: Boolean(stale || sourceUnavailable || working), pending: open.isPending, onStart: startReview };
  return <div className="lc-panel" ref={panelRef}><header className="lc-section-head"><div><h2>Progress & inspections</h2><p>Review P1 first, then P2 and P3. Record work updates and project visits with dated evidence and follow-up.</p></div></header>
    {!summary.state ? <p className="lc-setup-notice">Project checks need setup before work updates can be recorded.</p> : <p className="lc-muted">Review every {summary.state.policy.reviewIntervalDays} day(s) · {summary.state.policy.inspectionCount} project inspections · {summary.state.policy.timezone}</p>}
    {summary.allowedActions.some(action => action === "setup" || action === "policy") ? <PolicyDisclosure key={summary.state ? "policy" : "setup"} {...props} disabled={Boolean(stale || sourceUnavailable || !active)} summary={summary} revealRequest={summary.state ? 0 : policyRequest} {...setupCallbacks} /> : null}
    {notice ? <p ref={noticeRef} role="status" tabIndex={-1}>{notice}</p> : null}
    <ReadState query={query}>{(data, refreshing) => <><Blockers blockers={data.blockers} />{openAllowed ? <Button disabled={Boolean(stale || sourceUnavailable || working)} busy={open.isPending} onClick={() => startReview()}>Open current review round</Button> : null}<MutationNotice error={open.error} />
      {data.current ? <ReviewRound key={data.current.id} {...props} disabled={Boolean(props.disabled || refreshing || sourceUnavailable || !active || data.current.version === 0)} round={data.current} currentItems={summary.source.items} startReview={startReviewAction} statusMessage={sourceUnavailable ? "Appointed work unavailable" : !active ? "Work updates are read-only" : refreshing || props.disabled ? "Refresh before recording checks" : undefined} /> : <AppointedItemPreview summary={summary} onSetup={selectSetup} setupAllowed={setupAllowed} disabled={Boolean(stale || sourceUnavailable || working)} startReview={startReviewAction} />}
    </>}</ReadState>
    {!query.data ? <ProgressPriorityPanels items={[]} loading={!query.isError} unavailable={query.isError ? "Review unavailable" : "Loading review"} renderItem={() => null} /> : null}
    {props.audience !== "admin" && summary.projectStatus === "active" && summary.source.available ? <><Button variant="secondary" onClick={() => setUrgent(!urgent)}>{urgent ? "Close urgent finding" : "Report urgent delay or defect"}</Button>{urgent ? <FindingForm {...props} summary={summary} onSaved={() => setUrgent(false)} /> : null}</> : null}
    <ReviewHistory {...props} /><InspectionsPanel {...props} summary={summary} />
  </div>;
}
