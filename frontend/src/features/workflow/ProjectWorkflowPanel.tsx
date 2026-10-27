import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { projectReadDenied } from "../projects/projectReadQueries";

import { Button } from "../../components/ui/Button";
import { Surface } from "../../components/ui/Surface";
import { ProjectInitialPaymentStatus } from "../finance/DesignPaymentConfirmations";
import { ProjectDesignRequirementsPanel } from "./ProjectDesignRequirementsPanel";
import { ProjectClientActions } from "./ProjectClientActions";
import { ProjectWorkflowProgress } from "./ProjectWorkflowProgress";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { getDesignWorkflow, projectWorkflowKeys } from "./projectWorkflowApi";
import { currentProjectWorkflowStage } from "./projectWorkflowSelectors";

export function ProjectWorkflowPanel({ projectId, onOpenTask, timelineContainer, presentation = "full", showInitialPayment = true }: {
  projectId: string;
  onOpenTask?: (taskId: string) => void;
  timelineContainer?: HTMLElement | null;
  presentation?: "full" | "client" | "designer";
  showInitialPayment?: boolean;
}) {
  const { user, authorization } = useAuth();
  const canRead = Boolean(user) && hasFrontendPermission(authorization, "projects.design_workflow.read");
  const workflow = useQuery({
    queryKey: [...projectWorkflowKeys.designWorkflow(projectId), user?.id ?? null, user?.role ?? null],
    queryFn: () => getDesignWorkflow(projectId),
    enabled: canRead && Boolean(projectId),
    refetchInterval: 60_000
  });
  const data = canRead && !projectReadDenied(workflow.error) && workflow.data?.projectId === projectId ? workflow.data : undefined;
  const currentStage = data ? currentProjectWorkflowStage(data) : undefined;
  const staffCanReadBeforeApproval = user?.role === "designer" || user?.role === "procurement" || user?.role === "site_manager";
  const observer = user?.role === "procurement" || user?.role === "site_manager";
  const showProjectProgress = Boolean(data && (data.estimateApprovalStatus === "approved" || staffCanReadBeforeApproval));
  const showStageActions = data?.estimateApprovalStatus === "approved" && !observer;
  const initialStageId = presentation !== "client" && timelineContainer !== undefined && currentStage?.type === "space_planning_tentative_look_feel"
    ? undefined : currentStage?.id;

  return (
    <div className="project-workflow-panel">
      {!canRead ? <Surface as="section" aria-label="Project workflow"><p>Project stages are unavailable for your current access.</p></Surface> : workflow.isPending ? (
        <Surface as="section" aria-label="Project workflow">
          <p role="status">Loading project stages and deadlines…</p>
        </Surface>
      ) : (workflow.isError && !data) || (workflow.isSuccess && !data) ? (
        <Surface as="section" aria-label="Project workflow">
          <p role="alert">Project stages could not be refreshed. Reload to see current deadlines and status.</p>
          <Button variant="secondary" onClick={() => void workflow.refetch()}>
            Reload workflow
          </Button>
        </Surface>
      ) : (
        <>
          {workflow.isError ? <p role="alert">The latest workflow refresh failed. Saved information is shown; your open form has been kept. <Button variant="secondary" size="compact" onClick={() => void workflow.refetch()}>Retry refresh</Button></p> : null}
          {showInitialPayment && presentation === "full" && data?.initialPayment ? <ProjectInitialPaymentStatus key={`payment-${projectId}`} workflow={data} /> : null}
          {presentation === "full" && data?.notices?.length ? <section className="workflow-live-notices" aria-label="Project notifications"><h3>Project updates</h3><ul>{data.notices.map((notice) => <li key={notice.id}>{notice.message}</li>)}</ul></section> : null}
          {presentation === "full" && data?.projectStages?.some((stage) => stage.operational?.reminders?.length) ? <section className="workflow-live-notices" aria-label="Stage SLA reminders"><h3>Stage SLA reminders</h3><ul>{data.projectStages.flatMap((stage) => stage.operational?.reminders?.map((reminder) => <li key={reminder.id}><strong>{stage.name}</strong><span>{reminder.label}</span><time dateTime={reminder.dueAt}>{new Date(reminder.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></li>) ?? [])}</ul><p>Due reminders refresh while this project is open.</p></section> : null}
          {showProjectProgress && data?.estimateApprovalStatus === "source_issue" ? <p role="status">The estimate source needs attention. Project progress is available; workflow actions are unavailable.</p> : null}
          {showProjectProgress && data?.estimateApprovalStatus === "awaiting_approval" ? <p role="status">Estimate approval is pending. Project progress is available for review.</p> : null}
          {showProjectProgress ? <ProjectWorkflowProgress key={`workflow-${user?.id}-${projectId}`} workflow={data!} onOpenTask={showStageActions ? onOpenTask : undefined} timelineContainer={timelineContainer}
            initialStageId={initialStageId} presentation={presentation}
            renderStageActions={showStageActions ? (stage) => <WorkflowStageActions key={`${data!.projectId}:${stage.id}`} workflow={data!} stage={stage} expandKickoff={stage.type === "internal_kickoff"} presentation={presentation} refreshError={workflow.isError} refreshing={workflow.isFetching} /> : undefined} /> : null}
        </>
      )}
      {canRead && data && !projectReadDenied(workflow.error) ? <ProjectDesignRequirementsPanel key={`requirements-${user?.id}-${projectId}`} projectId={projectId} identity={`${user?.id}:${user?.role}`} /> : null}
      {canRead && !projectReadDenied(workflow.error) ? <ProjectClientActions key={`${user?.id}-${projectId}`} projectId={projectId} hideWhenEmpty={presentation !== "full"} /> : null}
    </div>
  );
}
