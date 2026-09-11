import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { DesignReviewCard } from "../admin/DesignPlanResponseInboxPage";
import { getDesignPlanReviewTasks, projectWorkflowKeys } from "./projectWorkflowApi";
import "./projectClientActions.css";

export function ProjectClientActions({ projectId, hideWhenEmpty = false }: { projectId: string; hideWhenEmpty?: boolean }) {
  const { authorization } = useAuth();
  if (!projectId || !hasFrontendPermission(authorization, "design.plan_response_tasks.read")) return null;
  return <ProjectClientActionsContent key={projectId} projectId={projectId} hideWhenEmpty={hideWhenEmpty} />;
}

function ProjectClientActionsContent({ projectId, hideWhenEmpty }: { projectId: string; hideWhenEmpty: boolean }) {
  const { user } = useAuth();
  const reviews = useQuery({
    queryKey: projectWorkflowKeys.projectReviews(projectId),
    queryFn: () => getDesignPlanReviewTasks("all", projectId),
    refetchInterval: 60_000
  });
  const tasks = (reviews.data ?? []).filter((task) => task.projectId === projectId);
  const pending = tasks.filter((task) => task.status === "pending");
  const history = tasks.filter((task) => task.status !== "pending");
  if (hideWhenEmpty && (reviews.isPending || (reviews.isSuccess && tasks.length === 0))) return null;

  return <section className="project-client-actions" aria-label="Design reviews">
    <div className="project-client-actions__heading">
      <div><p className="eyebrow">Client response</p><h2>Design reviews</h2></div>
      {reviews.isSuccess && (!hideWhenEmpty || pending.length > 0) ? <StatusBadge label={`${pending.length} pending`} tone={pending.length ? "warning" : "neutral"} /> : null}
    </div>
    {reviews.isPending ? <p role="status">Loading design reviews…</p>
      : reviews.isError ? <div role="alert" className="project-client-actions__error">
        <p>Design reviews could not be loaded.</p>
        <Button variant="secondary" size="compact" onClick={() => void reviews.refetch()}>Try again</Button>
      </div>
      : <>
        {!pending.length ? !hideWhenEmpty ? <p className="project-client-actions__empty">No design reviews are awaiting a response.</p> : null : <ul className="project-client-actions__list">
          {pending.map((task) => <li key={task.id}>
            <details className="project-client-actions__task">
              <summary><span><strong>Design plan v{task.designPlanVersion}</strong><span>{task.attachmentNames.length} plan attachment{task.attachmentNames.length === 1 ? "" : "s"} · Awaiting Client response</span></span><span className="project-client-actions__open">Open Client Task</span></summary>
              <div className="project-client-actions__detail">
                {user?.role === "client" ? <Link className="ui-button ui-button--primary" to={`/client?estimate=${encodeURIComponent(task.estimateId)}`}>Review design in Client portal</Link> : null}
                <DesignReviewCard task={task} />
              </div>
            </details>
          </li>)}
        </ul>}
        {!hideWhenEmpty || history.length > 0 ? <details className="project-client-actions__history">
          <summary>History <span>{history.length}</span></summary>
          {!history.length ? <p className="project-client-actions__empty">No design review history yet.</p> : <ul className="project-client-actions__list">
            {history.map((task) => <li key={task.id}>
              <details className="project-client-actions__task">
                <summary><strong>Design plan v{task.designPlanVersion}</strong><span>{task.status === "approved" ? "Approved" : task.status === "changes_requested" ? "Changes requested" : "Withdrawn"}</span></summary>
                <div className="project-client-actions__detail"><DesignReviewCard task={task} /></div>
              </details>
            </li>)}
          </ul>}
        </details> : null}
      </>}
  </section>;
}
