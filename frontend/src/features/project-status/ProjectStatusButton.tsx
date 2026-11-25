import { ProjectId } from "../../components/projects/ProjectId";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { ROLE_LABELS } from "../../api/authorization-contract";
import type { ProjectPendingAction, ProjectStatusSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { getProjectStatus, projectStatusKeys } from "./projectStatusApi";
import { presentProjectStatus } from "./projectStatusPresentation";
import "./projectStatus.css";

const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

/** Header chips stay current; list buttons retain their on-demand behavior. */
export function ProjectStatusButton({ projectId, participant, projectName, presentation = "button" }: { projectId: string; participant?: boolean; projectName?: string; presentation?: "button" | "chip" }) {
  const { user, status, authorization, reviewSession } = useAuth();
  if (participant === false || !projectId || !user || status !== "authenticated" || !hasFrontendPermission(authorization, "projects.status.read")) return null;
  const identity = `${user.id}:${user.role}${reviewSession?.id ? `:${reviewSession.id}` : ""}`;
  return <StatusControl key={`${projectId}:${identity}`} projectId={projectId} identity={identity} participant={participant} projectName={projectName} presentation={presentation} />;
}

function StatusControl({ projectId, identity, participant, projectName, presentation }: { projectId: string; identity: string; participant?: boolean; projectName?: string; presentation: "button" | "chip" }) {
  const chip = presentation === "chip";
  const controlId = useId();
  const [open, setOpen] = useState(false);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: projectStatusKeys.detail(projectId, identity),
    queryFn: ({ signal }) => getProjectStatus(projectId, signal),
    enabled: (chip || open || participant === undefined) && !accessRemoved,
    staleTime: 0,
    refetchOnWindowFocus: chip || open || participant === undefined,
    refetchInterval: (chip || open) && !accessRemoved ? 30_000 : false,
    refetchIntervalInBackground: false,
    retry: (count, error) => !denied(error) && count < 1
  });
  const accessDenied = denied(status.error);
  useEffect(() => {
    if (!accessDenied) return;
    setAccessRemoved(true);
    setOpen(false);
    void queryClient.cancelQueries({ queryKey: projectStatusKeys.project(projectId) });
    queryClient.removeQueries({ queryKey: projectStatusKeys.project(projectId) });
  }, [accessDenied, projectId, queryClient]);
  const matchingSummary = status.data?.projectId === projectId && Array.isArray(status.data.pendingActions) && status.data.state in summaryLabels ? status.data : undefined;
  // A mounted chip must not disclose retained data before its fresh read succeeds.
  const summary = !chip || accessVerified ? matchingSummary : undefined;
  useEffect(() => {
    if (matchingSummary && status.isSuccess && status.isFetchedAfterMount) setAccessVerified(true);
  }, [matchingSummary, status.isSuccess, status.isFetchedAfterMount]);
  if (accessRemoved || accessDenied || (participant === undefined && !accessVerified)) return null;
  const chipSummary = summary ? presentProjectStatus(summary) : null;
  const loading = status.isPending || !accessVerified && status.isFetching;
  const chipLabel = chipSummary?.label ?? (loading ? "Loading project status…" : "Status unavailable");
  const stale = Boolean(summary && status.isError);
  return <>
    <Button ref={trigger} variant="secondary" className={`project-status-button${chip ? " project-status-chip" : ""}`} aria-label={projectName ? `Project status for ${projectName}` : "Project status"} aria-describedby={chip ? `${controlId}-summary` : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); if (chip || participant === undefined) void status.refetch(); }}>
      {chip ? <><span className="project-status-chip__stage">{chipLabel}</span>{chipSummary?.owner ? <span className="project-status-chip__owner">{chipSummary.owner}</span> : null}{chipSummary?.additional ? <span className="project-status-chip__more">{chipSummary.additional}</span> : null}{stale ? <span className="project-status-chip__notice">Out of date</span> : !loading && !summary ? <span className="project-status-chip__notice">Open to retry</span> : null}</> : "Project status"}
    </Button>
    {chip ? <span id={`${controlId}-summary`} className="sr-only">{chipSummary?.description ?? chipLabel}{stale ? ". Out of date. Open project status to refresh." : ". Open project status for details."}</span> : null}
    <Drawer id={`project-status-${projectId}-${controlId}`} open={open} title="Project status" eyebrow="Project overview" description={summary?.projectName} variant="contextual" width="medium" className="project-status-drawer" onClose={() => setOpen(false)} returnFocusRef={trigger}>
      <div className="project-status-content">
        {summary ? <ProjectId projectNumber={summary.projectNumber} /> : null}
        <div className="project-status-toolbar"><span className="project-status-caption">Current progress and responsibility</span><Button variant="secondary" busy={status.isFetching} onClick={() => void status.refetch()}>Refresh</Button></div>
        {status.isPending ? <p role="status">Loading project status…</p> : null}
        {status.isError ? <p className="project-status-notice" role="alert">{summary ? "Status may be out of date. Refresh to get the latest update." : "Project status could not be loaded. Please try Refresh."}</p> : null}
        {!status.isPending && !status.isError && !summary ? <p role="status">Project status is unavailable. Please refresh.</p> : null}
        {summary ? <StatusDetails summary={summary} /> : null}
      </div>
    </Drawer>
  </>;
}

const summaryLabels: Record<ProjectStatusSummary["state"], string> = {
  active: "In progress", scheduled: "Scheduled", paused: "Paused", completed: "Project completed", no_pending: "No pending tracked actions", unavailable: "Status needs review"
};

function StatusDetails({ summary }: { summary: ProjectStatusSummary }) {
  return <section aria-label="Current project status">
    <div className="project-status-stage"><span className="project-status-caption">Current stage</span><h3>{summary.currentStage?.label ?? summaryLabels[summary.state]}</h3><span className="project-status-state">{summaryLabels[summary.state]}</span></div>
    {summary.issue ? <p className="project-status-notice" role="status">{summary.issue}</p> : null}
    {!summary.pendingActions.length && summary.state !== "unavailable" ? <p>{summary.state === "completed" ? "The project is marked complete." : "There are no outstanding actions in the tracked workflow."}</p> : null}
    <ol className="project-status-actions" aria-label="Pending actions">{summary.pendingActions.map((action, index) => <li key={action.id}>
      {index > 0 ? <p className="project-status-caption">Also pending · {action.stageLabel}</p> : null}
      <PendingAction action={action} />
    </li>)}</ol>
    <p className="project-status-updated">Updated {dateLabel(summary.serverNow)}. Status refreshes while this panel is open.</p>
  </section>;
}

function PendingAction({ action }: { action: ProjectPendingAction }) {
  return <dl className="project-status-facts">
    <div><dt>{action.state === "scheduled" ? "Scheduled with" : "Pending with"}</dt><dd>{action.people.length ? <ul className="project-status-people">{action.people.map(person => <li key={person.id}><strong>{person.name}</strong><span>{ROLE_LABELS[person.role]}</span></li>)}</ul> : <><strong>Assignment needed</strong><span>{ROLE_LABELS[action.responsibleRole]}</span></>}</dd></div>
    <div><dt>Next action</dt><dd>{action.action}</dd></div>
    {action.scheduledAt ? <div><dt>Scheduled for</dt><dd>{dateLabel(action.scheduledAt)}</dd></div> : null}
    {action.deadlineAt ? <div><dt>Due by</dt><dd>{dateLabel(action.deadlineAt)}</dd></div> : null}
    {action.blocker ? <div><dt>Waiting on</dt><dd>{action.blocker}</dd></div> : null}
  </dl>;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable";
}
