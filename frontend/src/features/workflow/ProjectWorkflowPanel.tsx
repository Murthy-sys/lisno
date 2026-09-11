import { useQuery } from "@tanstack/react-query";

import { Button } from "../../components/ui/Button";
import { Surface } from "../../components/ui/Surface";
import { ProjectInitialPaymentStatus } from "../finance/DesignPaymentConfirmations";
import { ProjectClientActions } from "./ProjectClientActions";
import { ProjectWorkflowProgress } from "./ProjectWorkflowProgress";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { getDesignWorkflow, projectWorkflowKeys } from "./projectWorkflowApi";
import { currentProjectWorkflowStage } from "./projectWorkflowSelectors";

export function ProjectWorkflowPanel({ projectId, onOpenTask, timelineContainer, presentation = "full" }: {
  projectId: string;
  onOpenTask?: (taskId: string) => void;
  timelineContainer?: HTMLElement | null;
  presentation?: "full" | "client" | "designer";
}) {
  const workflow = useQuery({
    queryKey: projectWorkflowKeys.designWorkflow(projectId),
    queryFn: () => getDesignWorkflow(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 60_000
  });
  const currentStage = workflow.data ? currentProjectWorkflowStage(workflow.data) : undefined;
  const initialStageId = presentation !== "client" && timelineContainer !== undefined && currentStage?.type === "space_planning_tentative_look_feel"
    ? undefined : currentStage?.id;

  return (
    <div className="project-workflow-panel">
      {workflow.isPending ? (
        <Surface as="section" aria-label="Project workflow">
          <p role="status">Loading project stages and deadlines…</p>
        </Surface>
      ) : workflow.isError && !workflow.data ? (
        <Surface as="section" aria-label="Project workflow">
          <p role="alert">Project stages could not be refreshed. Reload to see current deadlines and status.</p>
          <Button variant="secondary" onClick={() => void workflow.refetch()}>
            Reload workflow
          </Button>
        </Surface>
      ) : (
        <>
          {workflow.isError ? <p role="alert">The latest workflow refresh failed. Saved information is shown; your open form has been kept. <Button variant="secondary" size="compact" onClick={() => void workflow.refetch()}>Retry refresh</Button></p> : null}
          {presentation === "full" && workflow.data?.initialPayment ? <ProjectInitialPaymentStatus key={`payment-${projectId}`} workflow={workflow.data} /> : null}
          {presentation === "full" && workflow.data?.notices?.length ? <section className="workflow-live-notices" aria-label="Project notifications"><h3>Project updates</h3><ul>{workflow.data.notices.map((notice) => <li key={notice.id}>{notice.message}</li>)}</ul></section> : null}
          {presentation === "full" && workflow.data?.projectStages?.some((stage) => stage.operational?.reminders?.length) ? <section className="workflow-live-notices" aria-label="Stage SLA reminders"><h3>Stage SLA reminders</h3><ul>{workflow.data.projectStages.flatMap((stage) => stage.operational?.reminders?.map((reminder) => <li key={reminder.id}><strong>{stage.name}</strong><span>{reminder.label}</span><time dateTime={reminder.dueAt}>{new Date(reminder.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></li>) ?? [])}</ul><p>Due reminders refresh while this project is open.</p></section> : null}
          <ProjectWorkflowProgress key={`workflow-${projectId}`} workflow={workflow.data!} onOpenTask={onOpenTask} timelineContainer={timelineContainer}
            initialStageId={initialStageId} presentation={presentation}
            renderStageActions={(stage) => <WorkflowStageActions key={`${workflow.data!.projectId}:${stage.id}`} workflow={workflow.data!} stage={stage} expandKickoff={stage.type === "internal_kickoff"} presentation={presentation} />} />
        </>
      )}
      <ProjectClientActions key={projectId} projectId={projectId} hideWhenEmpty={presentation !== "full"} />
    </div>
  );
}
