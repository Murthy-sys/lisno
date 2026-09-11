import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/Button";
import { getDesignWorkflow, projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { currentProjectWorkflowStage } from "../workflow/projectWorkflowSelectors";
import "./clientWorkflow.css";

export function ClientWorkflowTaskSummary({ projectId, projectName }: { projectId: string; projectName: string }) {
  const workflow = useQuery({
    queryKey: projectWorkflowKeys.designWorkflow(projectId),
    queryFn: () => getDesignWorkflow(projectId),
    enabled: Boolean(projectId),
    staleTime: 60_000,
    refetchInterval: 60_000
  });
  const saved = workflow.data?.projectId === projectId ? workflow.data : undefined;
  const stage = saved ? currentProjectWorkflowStage(saved) : undefined;
  const actions = stage?.operational?.availableActions.filter((action) => action.actor === "client" && !action.disabledReason) ?? [];
  const action = actions.find((candidate) => candidate.id.endsWith("_complete")) ?? actions[0];
  const projectLink = `/client/projects/${encodeURIComponent(projectId)}`;

  return <section className="client-workflow-task" aria-label={`${projectName} current task`} data-actionable={Boolean(action && !workflow.isError) || undefined}>
    {workflow.isPending ? <p role="status">Loading your project task…</p> : workflow.isError ? <>
      <p role="alert">The current project task could not be refreshed.</p>
      <Button variant="secondary" size="compact" onClick={() => void workflow.refetch()}>Retry project task</Button>
    </> : stage ? <>
      <p className="client-workflow-task__label">{action ? "Your task" : "Current stage"}</p>
      <strong>{action?.label ?? stage.name}</strong>
      <p>{action ? stage.name : "No action is needed from you at this stage."}</p>
    </> : <p>{saved?.projectStages?.length ? "Project stages completed." : "Stage information is not available yet."}</p>}
    <Link className="client-workflow-task__link" to={projectLink}>{action && !workflow.isError ? "Open task" : "View project stage"}</Link>
  </section>;
}
