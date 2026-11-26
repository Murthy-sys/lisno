import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { projectReadDenied } from "../projects/projectReadQueries";
import { KeyCollectionTimer } from "./KeyCollectionTimer";
import { keyCollectionDate } from "./keyCollectionClock";
import { useDesignWorkflowQuery } from "./useDesignWorkflowQuery";

export function KeyCollectionHeader({ projectId, projectName, workflowTo, onOpenWorkflow }: {
  projectId: string; projectName?: string; workflowTo?: string; onOpenWorkflow?: () => void;
}) {
  const { user, authorization, reviewSession } = useAuth();
  if (!user || !projectId || !hasFrontendPermission(authorization, "projects.design_workflow.read")) return null;
  return <HeaderControl key={`${projectId}:${user.id}:${user.role}:${reviewSession?.id ?? ""}`} projectId={projectId} projectName={projectName} workflowTo={workflowTo} onOpenWorkflow={onOpenWorkflow} />;
}

function HeaderControl({ projectId, projectName, workflowTo, onOpenWorkflow }: { projectId: string; projectName?: string; workflowTo?: string; onOpenWorkflow?: () => void }) {
  const { query, data } = useDesignWorkflowQuery(projectId);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const denied = projectReadDenied(query.error);
  useEffect(() => { if (denied) setOpen(false); }, [denied]);
  const handoff = data?.designerHandoff;
  const appointment = handoff?.appointment;
  const active = handoff?.state === "scheduled" && appointment && !appointment.receivedAt && !appointment.completedAt;
  const unavailable = query.isError || handoff?.state === "source_issue" || handoff?.state === "scheduled" && !appointment;
  if (denied || !active && !unavailable && !query.isPending && !open) return null;
  const openWorkflow = () => {
    setOpen(false);
    onOpenWorkflow?.();
    navigate(workflowTo ?? { pathname: location.pathname, search: location.search, hash: "#key-collection" }, {
      state: { ...(location.state ?? {}), keyCollectionOpen: Date.now() }
    });
  };
  return <>
    <button type="button" ref={trigger} className="key-collection-header" aria-label={`Key collection${projectName ? ` for ${projectName}` : ""}`}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); void query.refetch(); }}>
      {active && data ? <KeyCollectionTimer compact appointment={appointment} serverNow={data.serverNow} receivedAt={data.receivedAt} />
        : <span className="key-collection-clock key-collection-clock--chip" data-zone="unavailable">Key collection · {query.isPending ? "Loading…" : "Unavailable"}</span>}
      {query.isError && active ? <span className="key-collection-stale">May be out of date</span> : null}
    </button>
    {open ? <Dialog title="Key collection" eyebrow="Project appointment" description={projectName ?? data?.projectName} onClose={() => setOpen(false)} returnFocusRef={trigger} className="key-collection-dialog">
      <div className="key-collection-details">
        {query.isPending ? <p role="status">Loading the collection appointment…</p> : null}
        {query.isError ? <p role="alert">{data ? "The appointment may be out of date. " : "The appointment could not be loaded. "}Refresh before continuing.</p> : null}
        {handoff?.state === "source_issue" ? <p role="status">The appointment source needs review. Refresh the project before continuing.</p> : null}
        {handoff?.designer ? <p>Designer: <strong>{handoff.designer.name}</strong></p> : null}
        {active && data ? <>
          <KeyCollectionTimer appointment={appointment} serverNow={data.serverNow} receivedAt={data.receivedAt} />
          <p>Key collection by <time dateTime={appointment.deadlineAt}>{keyCollectionDate(appointment.deadlineAt)}</time> (Asia/Kolkata)</p>
          <p>The appointment deadline continues while kickoff tasks are pending.</p>
        </> : handoff?.state === "received" ? <p>The Designer has received the keys. Any remaining handover confirmation is available in the workflow.</p>
          : handoff?.state === "completed" ? <p>Key collection completed.</p>
            : data && !unavailable ? <p>No active key-collection appointment.</p> : null}
        {handoff?.blockers.length ? <div><p>Before key collection:</p><ul>{handoff.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div> : null}
        <div className="key-collection-actions"><Button variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh appointment</Button>
          {data && handoff?.state !== "source_issue" ? <Button onClick={openWorkflow}>Open key collection</Button> : null}</div>
      </div>
    </Dialog> : null}
  </>;
}
