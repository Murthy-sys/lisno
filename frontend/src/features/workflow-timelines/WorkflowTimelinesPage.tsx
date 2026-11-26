import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  WORKFLOW_TIMELINE_BANDS,
  WORKFLOW_TIMELINE_MAX_DAYS,
  WORKFLOW_TIMELINE_MIN_DAYS,
  WORKFLOW_TIMELINE_PERCENTAGES,
  calculateWorkflowWorkdays,
  isWorkflowTimelineBaseDays,
  type WorkflowTimelineBandId,
  type WorkflowTimelineConfiguration
} from "../../../../shared/projects/workflowTimelines";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { updateWorkflowTimelines, workflowTimelinesQuery } from "./workflowTimelinesApi";
import "./workflowTimelines.css";

type Phase = "designWorkdays" | "executionWorkdays";
type Draft = Record<WorkflowTimelineBandId, Record<Phase, string>>;
type Edit = { source: WorkflowTimelineConfiguration; draft: Draft };
const phases = [
  { key: "designWorkdays", matrix: "design", label: "Design workdays" },
  { key: "executionWorkdays", matrix: "execution", label: "Execution workdays" }
] as const;

function toDraft(config: WorkflowTimelineConfiguration): Draft {
  return Object.fromEntries(config.bases.map(row => [row.bandId, {
    designWorkdays: String(row.designWorkdays), executionWorkdays: String(row.executionWorkdays)
  }])) as Draft;
}

function validValue(value: string) {
  return value.trim() !== "" && isWorkflowTimelineBaseDays(Number(value));
}

export function WorkflowTimelinesPage() {
  const auth = useAuth();
  const canRead = auth.status === "authenticated" && auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "workflow_timelines.read");
  const sessionId = auth.reviewSession?.id ?? "";
  const canUpdate = hasFrontendPermission(auth.authorization, "workflow_timelines.update");

  return <section className="workflow-timelines" aria-labelledby="workflow-timelines-title">
    <PageHeader
      id="workflow-timelines-title"
      eyebrow="Configuration"
      title="Design & execution timelines"
      breadcrumb={<Link to="/admin/configuration/estimation">Back to Configuration</Link>}
      description="Set base workdays and compare timelines by Custom-item value share."
    />
    {!canRead ? <p role="status">{auth.status === "restoring" ? "Loading your access…" : "You do not have access to timeline configuration."}</p> :
      <TimelineConfiguration key={`${auth.user!.id}:${sessionId}:${auth.authorization!.policyVersion}:${canUpdate}`} userId={auth.user!.id} sessionId={sessionId} policyVersion={auth.authorization!.policyVersion} canUpdate={canUpdate} />}
  </section>;
}

function TimelineConfiguration({ userId, sessionId, policyVersion, canUpdate }: { userId: string; sessionId: string; policyVersion: string; canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const options = workflowTimelinesQuery(userId, sessionId, policyVersion);
  const query = useQuery(options);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const current = useRef(true);
  useEffect(() => {
    current.current = true;
    return () => { current.current = false; };
  }, []);

  const mutation = useMutation({
    mutationFn: updateWorkflowTimelines,
    onSuccess: (saved) => {
      if (!current.current) return;
      queryClient.setQueryData(options.queryKey, saved);
      setEdit(null);
      setFeedback("Timelines saved.");
      void queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true });
    },
    onError: (error) => {
      if (current.current && error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true });
      }
    }
  });

  if (!query.data) return query.isError ? <div className="workflow-timelines__feedback" role="alert">
    <p>Timelines could not be loaded. {query.error.message}</p>
    <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry timelines</Button>
  </div> : <p role="status">Loading timelines…</p>;

  const source = edit?.source ?? query.data;
  const draft = edit?.draft ?? toDraft(source);
  const dirty = edit !== null;
  const valid = WORKFLOW_TIMELINE_BANDS.every(band => phases.every(phase => validValue(draft[band.id][phase.key])));
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const stale = dirty && source.version !== query.data.version;
  const busy = mutation.isPending || reloading;

  function change(bandId: WorkflowTimelineBandId, phase: Phase, value: string) {
    setFeedback(null);
    if (!conflict) mutation.reset();
    const nextDraft = { ...draft, [bandId]: { ...draft[bandId], [phase]: value } };
    const unchanged = source.bases.every(row => phases.every(item => nextDraft[row.bandId][item.key] === String(row[item.key])));
    setEdit(unchanged ? null : { source, draft: nextDraft });
  }

  function discard() {
    setEdit(null);
    mutation.reset();
    setFeedback(null);
  }

  async function reloadLatest() {
    setReloading(true);
    const result = await query.refetch();
    if (!current.current) return;
    setReloading(false);
    if (result.isSuccess) discard();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || !dirty || !valid || busy || conflict || stale) return;
    setFeedback(null);
    mutation.mutate({ expectedVersion: source.version, bases: WORKFLOW_TIMELINE_BANDS.map(band => ({
      bandId: band.id,
      designWorkdays: Number(draft[band.id].designWorkdays),
      executionWorkdays: Number(draft[band.id].executionWorkdays)
    })) });
  }

  return <form onSubmit={save} noValidate>
    <div className="workflow-timelines__explanation" id="workflow-timelines-help">
      <p>Edit the 0% base workdays. Each additional 5% of Custom-item value adds 10% of the base duration, rounded up to a whole workday.</p>
      <p>Custom share is the value of Custom items divided by the total estimated value. These charts compare durations; saving them does not reschedule projects.</p>
    </div>
    <p className="workflow-timelines__state" role="status">
      {dirty ? "Unsaved changes. Calculated columns show your preview." : source.version === 0 ? "Default timelines. No changes have been saved yet." : "Saved timelines."}
      {feedback ? ` ${feedback}` : ""}
    </p>
    {query.isError ? <div className="workflow-timelines__feedback" role="alert"><p>Latest timelines could not be refreshed. Your entries are kept.</p><Button variant="secondary" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Retry timelines</Button></div> : null}
    {conflict || stale ? <div className="workflow-timelines__feedback" role="alert">
      <p>Timelines were updated by another session. Your changes are kept. Reload the latest values before editing and saving again.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void reloadLatest()}>Discard changes and reload</Button>
    </div> : mutation.isError ? <p className="workflow-timelines__feedback" role="alert">Timelines could not be saved. {mutation.error.message} Your changes are kept.</p> : null}

    {phases.map(phase => <section className="workflow-timelines__phase" key={phase.key} aria-labelledby={`timeline-${phase.key}-title`}>
      <h2 id={`timeline-${phase.key}-title`}>{phase.label}</h2>
      <div className="workflow-timelines__scroll" role="region" aria-label={`${phase.label} table, scroll horizontally for all percentages`} tabIndex={0}>
        <table className="workflow-timelines__table" aria-labelledby={`timeline-${phase.key}-title`} aria-describedby="workflow-timelines-help">
          <thead><tr><th scope="col">Project value</th>{WORKFLOW_TIMELINE_PERCENTAGES.map(percent => <th scope="col" key={percent}>{percent === 0 ? "0% base" : `${percent}%`}</th>)}</tr></thead>
          <tbody>{WORKFLOW_TIMELINE_BANDS.map(band => {
            const value = draft[band.id][phase.key];
            const invalid = !validValue(value);
            const inputId = `timeline-${phase.key}-${band.id}`;
            const savedRow = source.matrices[phase.matrix].find(row => row.bandId === band.id)!;
            return <tr key={band.id}>
              <th scope="row">{band.label}</th>
              <td className="workflow-timelines__base">
                <label className="workflow-timelines__visually-hidden" htmlFor={inputId}>{phase.label}, {band.label}, 0% base</label>
                <Input id={inputId} type="number" inputMode="numeric" min={WORKFLOW_TIMELINE_MIN_DAYS} max={WORKFLOW_TIMELINE_MAX_DAYS} step={1}
                  value={value} disabled={!canUpdate || busy} onChange={event => change(band.id, phase.key, event.target.value)}
                  aria-invalid={invalid || undefined} aria-describedby={invalid ? `${inputId}-error` : undefined} />
                {invalid ? <span className="workflow-timelines__error" id={`${inputId}-error`}>Enter a whole number from 1 to 3650.</span> : null}
              </td>
              {WORKFLOW_TIMELINE_PERCENTAGES.slice(1).map((percent, index) => <td key={percent}>{invalid ? "Unavailable" : dirty ? calculateWorkflowWorkdays(Number(value), percent) : savedRow.workdays[index + 1]}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>)}
    {canUpdate ? <div className="workflow-timelines__actions">
      <Button type="submit" disabled={!dirty || !valid || conflict || stale || reloading} busy={mutation.isPending} busyLabel="Saving timelines…">Save timelines</Button>
      <Button variant="secondary" disabled={!dirty || busy} onClick={discard}>Discard changes</Button>
    </div> : <p>These timelines are read-only for your current access.</p>}
  </form>;
}
