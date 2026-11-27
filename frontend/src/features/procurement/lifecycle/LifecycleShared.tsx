import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { Button } from "../../../components/ui/Button";
import { refreshProcurementLifecycle } from "../procurementLifecycleQueries";
import { lifecycleApi, lifecycleKeys, type LifecycleAudience, type LifecycleBlocker, type LifecycleEvidence, type LifecycleHistory, type LifecycleTab } from "./lifecycleApi";

export interface LifecyclePanelProps { projectId: string; actorId: string; audience?: LifecycleAudience; disabled?: boolean; }
export const lifecycleLabel = (value: string) => value.replaceAll("_", " ").replace(/^./u, text => text.toUpperCase());
export const lifecycleDate = (value: string | null, timezone?: string) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value)) : "Not recorded";
export const lifecycleError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed. Please try again.";
export const lifecycleDenied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
export const newRecordId = (kind: string) => `proc-${kind}-${crypto.randomUUID()}`;
export const localInputDate = (iso: string) => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export function isoInputDate(input: string) { const value = new Date(input); if (!Number.isFinite(value.getTime())) throw new Error("Enter a valid date and time."); return value.toISOString(); }

export function useLifecycleQuery<T>(props: LifecyclePanelProps, view: string, load: () => Promise<T>, query: unknown = {}) {
  return useQuery({ queryKey: lifecycleKeys.view(props.actorId, props.projectId, props.audience ?? "procurement", view, query), queryFn: load,
    enabled: Boolean(props.actorId && props.projectId), refetchOnWindowFocus: true, retry: (count, error) => !lifecycleDenied(error) && count < 1 });
}
export function useLifecycleWrite<T>(work: (value: Record<string, unknown>) => Promise<T>, onSaved?: (value: T) => void) {
  const client = useQueryClient(); const keys = useRef(new Map<string, string>());
  const mutation = useMutation({ mutationFn: (value: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(value); let key = keys.current.get(fingerprint);
    if (!key) { key = crypto.randomUUID(); keys.current.set(fingerprint, key); }
    return work({ ...value, idempotencyKey: key });
  }, onSuccess: async data => { await refreshProcurementLifecycle(client); onSaved?.(data); },
  onError: async error => { if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) await refreshProcurementLifecycle(client); } });
  return mutation;
}
export function ReadState<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T, stale: boolean) => ReactNode }) {
  if (lifecycleDenied(query.error)) return <p role="alert" className="lc-message">This project information is no longer available to your account.</p>;
  if (!query.data) return <div className="lc-message" role={query.isError ? "alert" : "status"}>{query.isError ? <>{lifecycleError(query.error)} <Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button></> : "Loading project records…"}</div>;
  return <>{query.isError ? <p role="alert" className="lc-message">{lifecycleError(query.error)} Your draft is retained. <Button variant="secondary" onClick={() => void query.refetch()}>Refresh records</Button></p> : null}{children(query.data, query.isFetching || query.isError)}</>;
}
export function MutationNotice({ error, pending, success }: { error: unknown; pending?: boolean; success?: boolean }) {
  return error ? <p role="alert" className="lc-error">{lifecycleError(error)}</p> : pending ? <p role="status">Saving…</p> : success ? <p role="status">Saved.</p> : null;
}
export function Blockers({ blockers, title = "Action needed" }: { blockers: LifecycleBlocker[]; title?: string }) {
  const [params] = useSearchParams();
  if (!blockers.length) return null;
  return <details className="lc-blockers" open><summary>{title} ({blockers.length})</summary><ul>{blockers.map((blocker, index) => {
    const next = new URLSearchParams(params); next.set("tab", blocker.tab); if (blocker.entityId) next.set("entity", blocker.entityId); else next.delete("entity");
    return <li key={`${blocker.code}-${blocker.entityId ?? index}`}><Link to={`?${next}`} state={{ preserveFocus: true }}>{blocker.message}</Link></li>;
  })}</ul></details>;
}
export function LifecycleHistoryList({ items }: { items: LifecycleHistory[] }) {
  return items.length ? <ol className="lc-history">{items.map(item => <li key={item.id}><strong>{lifecycleLabel(item.action.replaceAll(".", " "))}</strong><span>{item.actorName} · {lifecycleDate(item.at)}</span>{item.reason ? <p>{item.reason}</p> : null}</li>)}</ol> : <p>No activity recorded yet.</p>;
}
export function Pager({ offset, limit, total, onChange, label }: { offset: number; limit: number; total: number; onChange: (offset: number) => void; label: string }) {
  if (total <= limit) return null;
  return <nav className="lc-actions" aria-label={label}><Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button><span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span><Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button></nav>;
}
export function TargetRecord({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const [params] = useSearchParams(); const location = useLocation(); const ref = useRef<HTMLElement>(null); const targeted = params.get("entity") === id;
  useEffect(() => {
    const record = ref.current;
    if (!targeted || !record || record.closest("[hidden]")) return;
    // Reveal native disclosures synchronously before focusing a linked record.
    for (let parent = record.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    record.scrollIntoView?.({ block: "center" }); record.focus({ preventScroll: true });
  }, [targeted, id, location.key]);
  return <article id={`lc-${id}`} ref={ref} tabIndex={targeted ? -1 : undefined} data-targeted={targeted || undefined} className={`lc-record ${className}`}>{children}</article>;
}
export function ReasonAction({ label, disabled, onSubmit, pending, error, children }: { label: string; disabled?: boolean; onSubmit: (reason: string) => void; pending: boolean; error: unknown; children?: ReactNode }) {
  const [reason, setReason] = useState("");
  return <form className="lc-form" onSubmit={event => { event.preventDefault(); onSubmit(reason); }}><fieldset disabled={disabled || pending}><legend>{label}</legend>{children}<label>Reason or declaration<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><Button type="submit" busy={pending}>{label}</Button></fieldset><MutationNotice error={error} /></form>;
}
export function EvidenceField({ projectId, audience = "procurement", entityId, purpose, value, onChange, disabled, existingNames }: LifecyclePanelProps & { entityId: string; purpose: LifecycleEvidence["purpose"]; value: string[]; onChange: (ids: string[]) => void; existingNames?: Record<string, string> }) {
  const [files, setFiles] = useState<LifecycleEvidence[]>([]); const [progress, setProgress] = useState(0); const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({ mutationFn: (selection: File[]) => lifecycleApi(projectId, audience).upload(entityId, purpose, selection, setProgress), onSuccess: records => {
    setFiles(current => [...current, ...records]); onChange([...new Set([...value, ...records.map(record => record.id)])]); if (input.current) input.current.value = "";
  } });
  const download = useMutation({ mutationFn: async (id: string) => {
    const result = await lifecycleApi(projectId, audience).evidence(id); const url = URL.createObjectURL(result.blob); const link = document.createElement("a"); link.href = url; link.download = result.filename ?? "Procurement evidence"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <div className="lc-evidence"><label>Evidence files<input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" disabled={disabled || upload.isPending} onChange={event => { const selection = Array.from(event.target.files ?? []); if (selection.length) upload.mutate(selection); }} /></label><p className="lc-muted">Photos, videos and one PDF per upload. Files stay private to this project.</p>
    {upload.isPending ? <p role="status">Uploading evidence: {progress}%</p> : null}<MutationNotice error={upload.error ?? download.error} />
    {value.length ? <ul className="lc-files">{value.map((id, index) => <li key={id}><button type="button" className="lc-text-button" onClick={() => download.mutate(id)}>{files.find(file => file.id === id)?.name ?? existingNames?.[id] ?? `Evidence ${index + 1}`}</button>{!disabled ? <button type="button" className="lc-text-button" aria-label={`Remove evidence ${index + 1}`} onClick={() => onChange(value.filter(valueId => valueId !== id))}>Remove</button> : null}</li>)}</ul> : null}
  </div>;
}
export function ReadEvidence(props: LifecyclePanelProps & { ids: string[]; entityId: string; purpose: LifecycleEvidence["purpose"] }) {
  return props.ids.length ? <EvidenceField {...props} value={props.ids} onChange={() => {}} disabled /> : null;
}
export const lifecycleTabLabels: Record<LifecycleTab, string> = { vendors: "Bids & Vendor Appointment", payments: "Payments", progress: "Progress & Inspections", handover: "Quality, Delivery & Handover", signoff: "Project Signoff" };
