import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { getSiteCompletion, siteCompletionKeys, submitSiteCompletion, updateSiteCompletion } from "./siteCompletionApi";
import "./siteCompletion.css";

export function SiteCompletionPanel({ projectId, projectName, onDirty, onBusy }: { projectId: string; projectName: string; onDirty?: (dirty: boolean) => void; onBusy?: (busy: boolean) => void }) {
  const auth = useAuth();
  const client = useQueryClient();
  const canManage = auth.user?.role === "site_manager" && hasFrontendPermission(auth.authorization, "procurement.site_completion.manage");
  const query = useQuery({ queryKey: siteCompletionKeys.project(projectId), queryFn: () => getSiteCompletion(projectId),
    enabled: canManage, refetchInterval: current => current.state.data?.status === "pending_client" ? 15_000 : false });
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const current = query.data;
  useEffect(() => { setProgress(null); setNote(null); setDraftVersion(null); }, [projectId]);
  const refresh = async () => Promise.all([
    client.invalidateQueries({ queryKey: siteCompletionKeys.project(projectId) }),
    client.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
    client.invalidateQueries({ queryKey: ["admin", "project-completion-tasks"] }),
    client.invalidateQueries({ queryKey: ["vendor-work", "progress", projectId] }),
    client.invalidateQueries({ queryKey: ["execution"] }),
    client.invalidateQueries({ queryKey: ["project-workflow", "operational"] }),
    client.invalidateQueries({ queryKey: ["designer", "kpi"] })
  ]);
  const save = useMutation({ mutationFn: (value: { progress: number; note: string }) => updateSiteCompletion(projectId, {
    expectedVersion: draftVersion ?? current!.version, idempotencyKey: crypto.randomUUID(), ...value }),
  onSuccess: async () => { setProgress(null); setNote(null); setDraftVersion(null); setMessage("Site progress saved."); await refresh(); } });
  const submit = useMutation({ mutationFn: () => submitSiteCompletion(projectId, {
    expectedVersion: current!.version, idempotencyKey: crypto.randomUUID(), note: (note ?? current!.note).trim() }),
  onSuccess: async () => { setProgress(null); setNote(null); setDraftVersion(null); setMessage("Completion sent to the Client for review."); await refresh(); } });
  const edited = Boolean(current && ((progress ?? String(current.progress)) !== String(current.progress) || (note ?? current.note) !== current.note));
  useEffect(() => { onDirty?.(edited); }, [edited, onDirty]);
  useEffect(() => { onBusy?.(save.isPending || submit.isPending); }, [save.isPending, submit.isPending, onBusy]);
  useEffect(() => () => { onDirty?.(false); onBusy?.(false); }, [onDirty, onBusy]);
  if (!canManage) return null;
  if (query.isPending) return <section className="site-completion" aria-label={`Site completion for ${projectName}`}><p role="status">Loading site completion…</p></section>;
  if (query.isError || !current) return <section className="site-completion" aria-label={`Site completion for ${projectName}`}><p role="alert">Site completion could not be loaded.</p><Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button></section>;
  const editable = current.projectStatus === "active" && (current.status === "draft" || current.status === "changes_requested");
  const shownProgress = progress ?? String(current.progress);
  const shownNote = note ?? current.note;
  const draftChanged = shownProgress !== String(current.progress) || shownNote !== current.note;
  const pendingHundred = draftChanged && Number(shownProgress) === 100 && current.progress !== 100;
  const saveLabel = pendingHundred ? "Save 100% progress"
    : current.needsReverification && Number(shownProgress) === 100 ? "Reverify 100% progress" : "Save progress";
  const sendHint = pendingHundred ? "Save 100% progress first. Then send completion to the Client."
    : draftChanged ? "Save your changes before sending completion to the Client."
    : current.progress !== 100 ? "Set project execution progress to 100% and save it before sending."
    : !current.canSubmit ? current.blockers[0] ?? "Completion is not ready to send. Refresh to check the latest project state." : null;
  const actionError = save.error ?? submit.error;
  function saveProgress(event: FormEvent) {
    event.preventDefault();
    const value = Number(shownProgress);
    if (!Number.isInteger(value) || value < 0 || value > 100) { setMessage("Enter a whole percentage from 0 to 100."); return; }
    save.mutate({ progress: value, note: shownNote.trim() });
  }
  return <section className="site-completion" aria-labelledby={`site-completion-${projectId}`}>
    <div className="site-completion__heading"><div><p>Site Manager handoff</p><h2 id={`site-completion-${projectId}`}>{projectName} completion</h2></div><div className="site-completion__saved"><span>Saved progress</span><strong>{current.progress}%</strong></div></div>
    {message ? <p role="status">{message}</p> : null}
    {current.status === "changes_requested" && current.review?.decision?.reason ? <p className="site-completion__change">Client requested changes: {current.review.decision.reason}</p> : null}
    {current.status === "pending_client" ? <p role="status">Completion is with the Client for review.</p> : null}
    {current.status === "client_approved" && current.projectStatus !== "completed" ? <p role="status">Client accepted completion. Super Admin will make the final decision.</p> : null}
    {current.projectStatus === "completed" ? <p role="status">Project completed. No further actions are pending.</p> : null}
    {editable ? <form onSubmit={saveProgress} className="site-completion__form">
      <Field id={`site-progress-${projectId}`} label="Project execution progress (%)" required>{(props) => <Input {...props} type="number" min={0} max={100} step={1} value={shownProgress} onChange={event => { setDraftVersion(version => version ?? current.version); setProgress(event.target.value); setMessage(""); }} />}</Field>
      <Field id={`site-note-${projectId}`} label="Completion note" hint="Summarize the work completed and what the Client should inspect.">{(props) => <Textarea {...props} rows={3} maxLength={2000} value={shownNote} onChange={event => { setDraftVersion(version => version ?? current.version); setNote(event.target.value); setMessage(""); }} />}</Field>
      {sendHint ? <p className="site-completion__send-hint" role="status" id={`site-send-hint-${projectId}`}>{sendHint}</p> : null}
      <div className="site-completion__actions"><Button type="submit" variant="secondary" busy={save.isPending} disabled={!draftChanged && !current.needsReverification}>{saveLabel}</Button>
        <Button type="button" busy={submit.isPending} disabled={!current.canSubmit || draftChanged || save.isPending} aria-describedby={sendHint ? `site-send-hint-${projectId}` : undefined} onClick={() => submit.mutate()}>Complete and send to Client</Button></div>
    </form> : null}
    {editable && current.blockers.length ? <div className="site-completion__blockers"><h3>Before sending</h3><ul>{current.blockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}</ul></div> : null}
    {save.isError || submit.isError ? <p role="alert">{actionError instanceof ApiError ? actionError.message : "The completion state changed or could not be saved."} <button type="button" onClick={() => { setProgress(null); setNote(null); setDraftVersion(null); void query.refetch(); }}>Reload latest values</button>.</p> : null}
  </section>;
}
