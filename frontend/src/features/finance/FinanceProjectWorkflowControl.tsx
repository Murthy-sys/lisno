import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ApiError } from "../../api/client";
import type { AdminProjectSummary, ProjectWorkflowTask } from "../../api/types";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { WorkerAssignmentPanel } from "../admin/WorkerAssignmentPanel";
import {
  formatWorkflowLabel,
  isDesignerAssignmentPending
} from "../admin/adminProjectPresentation";
import {
  adminProjectKeys,
  getAdminProject
} from "../admin/adminProjectsApi";
import {
  getAdminProjectWorkflowTasks,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC"
});

export function FinanceProjectWorkflowControl({ projectId }: { projectId: string }) {
  const projectQuery = useQuery({
    queryKey: adminProjectKeys.detail(projectId),
    queryFn: () => getAdminProject(projectId),
    enabled: Boolean(projectId)
  });
  const project = projectQuery.data;

  if (projectQuery.isPending) {
    return <PageState state="loading" message="Loading the complete project workflow…" />;
  }
  if (projectQuery.isError) {
    return (
      <PageState
        state="error"
        message={workflowError(projectQuery.error)}
        action={{ label: "Try again", onAction: () => void projectQuery.refetch() }}
      />
    );
  }
  if (!project) {
    return <PageState state="empty" message="Project workflow is unavailable." />;
  }

  return (
    <div className="access-administration admin-project-detail">
      <ProjectWorkflowSnapshot project={project} />
      <WorkerAssignmentPanel project={project} />
    </div>
  );
}

export function ProjectWorkflowSnapshot({ project }: { project: AdminProjectSummary }) {
  const executionOpen = project.estimate?.designPlanStatus === "approved";
  const tasksQuery = useQuery({
    queryKey: projectWorkflowKeys.projectTasks(project.id),
    queryFn: () => getAdminProjectWorkflowTasks(project.id),
    enabled: executionOpen
  });
  const tasks = tasksQuery.data ?? [];
  const tasksMismatch = tasks.some(
    (task) => task.projectId !== project.id ||
      (project.estimate !== null && task.estimateId !== project.estimate.id)
  );

  return (
    <WorkflowSnapshot
      project={project}
      tasks={tasksMismatch ? [] : tasks}
      tasksLoading={executionOpen && tasksQuery.isPending}
      tasksError={executionOpen && (tasksQuery.isError || tasksMismatch)}
      tasksErrorMessage={tasksMismatch
        ? "Execution tasks do not match this project's approved estimate."
        : "Execution status could not be loaded."}
      onRetryTasks={() => void tasksQuery.refetch()}
    />
  );
}

function WorkflowSnapshot({
  project,
  tasks,
  tasksLoading,
  tasksError,
  tasksErrorMessage,
  onRetryTasks
}: {
  project: AdminProjectSummary;
  tasks: ProjectWorkflowTask[];
  tasksLoading: boolean;
  tasksError: boolean;
  tasksErrorMessage: string;
  onRetryTasks: () => void;
}) {
  const estimateApproved = project.estimate?.status === "client_approved";
  const designStatus = project.estimate?.designPlanStatus ?? "pending_assignment";
  const designerAssigned = Boolean(project.estimate?.designPlanDesigner) ||
    !["pending_assignment"].includes(designStatus);
  const designSubmitted = ["ready_for_client", "changes_requested", "approved"].includes(designStatus);
  const designApproved = designStatus === "approved";
  const executionTasks = tasks.filter((task) => task.kind !== "design_plan_upload");
  const tradeTasks = executionTasks.filter((task) => task.kind === "trade_execution");
  const completedTasks = executionTasks.filter((task) => task.status === "completed").length;
  const assignedTrades = tradeTasks.filter((task) => task.assignedWorker).length;
  const progress = executionTasks.length
    ? Math.round(executionTasks.reduce((total, task) => total + task.progress, 0) / executionTasks.length)
    : 0;
  const executionComplete = executionTasks.length > 0 && completedTasks === executionTasks.length;

  return (
    <Surface
      as="section"
      className="admin-project-detail__surface"
      aria-labelledby="finance-workflow-control-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Super Admin delivery control</p>
          <h2 id="finance-workflow-control-title">Entire project workflow</h2>
          <p>Commercial approval, design handoff, delivery queues, and trade staffing in one view.</p>
        </div>
        <StatusBadge
          tone={project.status === "completed" ? "success" : "info"}
          label={formatWorkflowLabel(project.status)}
        />
      </div>

      <div className="admin-project-detail__grid" aria-label="Project workflow stages">
        <WorkflowStage
          title="1. Project initiated"
          tone="success"
          status="Complete"
          detail={`${project.name} · ${date.format(new Date(project.createdAt))}`}
        />
        <WorkflowStage
          title="2. Estimate approved"
          tone={estimateApproved ? "success" : project.estimate ? "warning" : "neutral"}
          status={estimateApproved
            ? "Approved"
            : project.estimate
              ? formatWorkflowLabel(project.estimate.status)
              : "Not started"}
          detail={project.estimate
            ? project.estimate.status === "client_approved"
              ? project.estimate.approvedBaseline
                ? `${money.format(project.estimate.approvedBaseline.total)} approved commercial value`
                : "Approved commercial baseline unavailable"
              : `${money.format(project.estimate.total)} current Estimate value`
            : "No estimate has been prepared."}
        />
        <WorkflowStage
          title="3. Designer assigned"
          tone={designerAssigned ? "success" : "warning"}
          status={designerAssigned ? "Assigned" : "Assignment pending"}
          detail={project.estimate?.designPlanDesigner
            ? `${project.estimate.designPlanDesigner.name} · ${project.estimate.designPlanDesigner.email}`
            : "No Designer is currently assigned."}
        />
        <WorkflowStage
          title="4. Design uploaded and submitted to Client"
          tone={designSubmitted ? designStatus === "changes_requested" ? "warning" : "success" : "info"}
          status={designSubmitted
            ? designStatus === "changes_requested"
              ? "Changes requested"
              : "Submitted"
            : isDesignerAssignmentPending(project)
              ? "Waiting for Designer"
              : "Upload pending"}
          detail={designSubmitted
            ? `The Client review includes design plan version ${project.estimate?.designPlanVersion ?? 0}.`
            : "The Designer must upload and submit the actual plan to the Client."}
        />
        <WorkflowStage
          title="5. Design approved"
          tone={designApproved ? "success" : designStatus === "changes_requested" ? "warning" : "neutral"}
          status={designApproved ? "Approved" : formatWorkflowLabel(designStatus)}
          detail={designApproved
            ? "Approved by the Client, or by an Admin with recorded proof."
            : "Execution remains locked until the design decision is approved."}
        />
        <WorkflowStage
          title="6. Execution queues"
          tone={executionComplete ? "success" : designApproved ? "warning" : "neutral"}
          status={executionComplete
            ? "Complete"
            : designApproved
              ? `${completedTasks} of ${executionTasks.length} tasks complete`
              : "Waiting for design approval"}
          detail={designApproved
            ? `Procurement, Finance, Site Management, and approved trades · ${assignedTrades} of ${tradeTasks.length} trade tasks assigned`
            : "Execution queues open after design approval."}
        >
          {designApproved && !tasksLoading && !tasksError ? (
            <ProgressBar value={progress} label={`Overall project execution: ${progress}% complete`} />
          ) : null}
        </WorkflowStage>
      </div>

      {tasksLoading ? (
        <PageState state="loading" message="Loading execution and worker status…" />
      ) : tasksError ? (
        <PageState
          state="error"
          message={tasksErrorMessage}
          action={{ label: "Try again", onAction: onRetryTasks }}
        />
      ) : null}
    </Surface>
  );
}

function WorkflowStage({
  title,
  tone,
  status,
  detail,
  children
}: {
  title: string;
  tone: StatusTone;
  status: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <StatusBadge tone={tone} label={status} />
      <p>{detail}</p>
      {children}
    </section>
  );
}

function workflowError(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "The complete project workflow could not be loaded.";
}
