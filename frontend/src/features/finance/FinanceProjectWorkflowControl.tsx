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
  currentQuotationApprovalState,
  currentQuotationIsApproved
} from "../estimates/quotationApproval";
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
  const executionOpen = project.estimationWorkflowVersion === 3
    ? currentQuotationIsApproved(project.estimate) && project.estimate?.designApproved === true
    : project.estimationWorkflowVersion === 2
      ? project.estimate?.estimationPhase === "post"
      : project.estimate?.designPlanStatus === "approved";
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
  const quotationWorkflow = project.estimationWorkflowVersion === 3;
  const collaborative = quotationWorkflow || project.estimationWorkflowVersion === 2;
  const quotationApprovalState = currentQuotationApprovalState(project.estimate);
  const quotationPhase = project.estimate?.estimationPhase;
  const quotationPostPhase = quotationWorkflow && quotationPhase === "post";
  const awaitingPreDesignApproval = quotationWorkflow && quotationPhase === "pre";
  const currentQuotationApproved = quotationPostPhase && currentQuotationIsApproved(project.estimate);
  const quotationApprovalBlocked = quotationPostPhase && !currentQuotationApproved;
  const hasQuotationRevision = quotationPostPhase && ["revision_draft", "revision_pending_client", "revision_changes_requested", "revision_current"].includes(quotationApprovalState);
  const estimateApproved = quotationWorkflow
    ? quotationPostPhase && quotationApprovalState !== "source_issue"
    : collaborative
      ? project.estimate?.estimationPhase === "post"
      : project.estimate?.status === "client_approved";
  const designStatus = project.estimate?.designPlanStatus ?? "pending_assignment";
  const designerAssigned = Boolean(project.estimate?.designPlanDesigner) ||
    !["pending_assignment"].includes(designStatus);
  const designSubmitted = ["ready_for_client", "changes_requested", "approved"].includes(designStatus);
  const designApproved = quotationWorkflow ? project.estimate?.designApproved === true : designStatus === "approved";
  const preparationTasks = tasks.filter((task) => task.kind !== "design_plan_upload" && task.preparationOnly === true);
  const executionTasks = tasks.filter((task) => task.kind !== "design_plan_upload" && task.preparationOnly !== true);
  const executionEnabled = quotationWorkflow
    ? currentQuotationApproved && designApproved && project.status !== "planning" && executionTasks.length > 0
    : collaborative
      ? Boolean(project.estimate?.finalEstimateApproved) && project.status !== "planning" && executionTasks.length > 0
      : designApproved;
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
          title={quotationWorkflow ? "2. Pre-design approval" : collaborative ? "2. Pre-estimate approved" : "2. Estimate approved"}
          tone={estimateApproved ? "success" : project.estimate ? "warning" : "neutral"}
          status={quotationPostPhase && quotationApprovalState === "source_issue"
            ? "Approval status unavailable"
            : estimateApproved
            ? "Approved"
            : project.estimate
              ? formatWorkflowLabel(project.estimate.status)
              : "Not started"}
          detail={quotationWorkflow ? awaitingPreDesignApproval
            ? "Client pre-design approval is required before design work can begin."
            : quotationApprovalState === "source_issue"
              ? "The current quotation approval could not be verified. Design workflow remains paused."
              : quotationApprovalState === "initial_current"
                ? "The initial quotation is approved and current. Design work can proceed unless the quotation is revised."
                : "The initial quotation was approved. Any material quotation revision is tracked separately below."
            : collaborative
            ? estimateApproved ? "The Client approved the pre-estimate. Design and procurement preparation can proceed." : "Client pre-estimate approval is required before design and procurement preparation."
            : project.estimate
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
        {hasQuotationRevision ? <QuotationRevisionStage state={quotationApprovalState} /> : null}
        <WorkflowStage
          title={quotationWorkflow ? `${hasQuotationRevision ? "5" : "4"}. Design uploaded and submitted to Client` : "4. Design uploaded and submitted to Client"}
          tone={quotationApprovalBlocked || awaitingPreDesignApproval ? "warning" : designSubmitted ? designStatus === "changes_requested" ? "warning" : "success" : "info"}
          status={awaitingPreDesignApproval
            ? "Waiting for pre-design approval"
            : quotationApprovalBlocked
            ? "Waiting for quotation approval"
            : designSubmitted
            ? designStatus === "changes_requested"
              ? "Changes requested"
              : "Submitted"
            : isDesignerAssignmentPending(project)
              ? "Waiting for Designer"
              : "Upload pending"}
          detail={awaitingPreDesignApproval
            ? "Design work begins after the Client approves the pre-design quotation."
            : quotationApprovalBlocked
            ? "Design workflow is paused until the current quotation approval is verified."
            : designSubmitted
            ? `The Client review includes design plan version ${project.estimate?.designPlanVersion ?? 0}.`
            : "The Designer must upload and submit the actual plan to the Client."}
        />
        <WorkflowStage
          title={quotationWorkflow ? `${hasQuotationRevision ? "6" : "5"}. Design approved` : "5. Design approved"}
          tone={quotationApprovalBlocked || awaitingPreDesignApproval ? "warning" : designApproved ? "success" : designStatus === "changes_requested" ? "warning" : "neutral"}
          status={awaitingPreDesignApproval
            ? "Waiting for pre-design approval"
            : quotationApprovalBlocked
            ? "Waiting for quotation approval"
            : designApproved
              ? "Approved"
              : quotationWorkflow && designStatus === "approved"
                ? "Awaiting current design approval"
                : formatWorkflowLabel(designStatus)}
          detail={awaitingPreDesignApproval
            ? "The design decision becomes available after pre-design quotation approval."
            : quotationApprovalBlocked
            ? "The design decision cannot advance until the current quotation is approved."
            : designApproved
              ? "Approved by the Client, or by a Sales Manager with recorded proof."
              : "Execution remains locked until the design decision is approved."}
        />
        {collaborative && !quotationWorkflow ? <WorkflowStage title="6. Final estimate approval" tone={project.estimate?.finalEstimateApproved ? "success" : "warning"}
          status={project.estimate?.finalEstimateApproved ? "Approved" : "Awaiting final approval"}
          detail={project.estimate?.finalEstimateApproved
            ? project.estimate.approvedBaseline
              ? `${money.format(project.estimate.approvedBaseline.total)} final approved commercial value. Super Admin confirms the initial payment before work-order issuance.`
              : "Final approved commercial baseline unavailable. Super Admin confirms the initial payment before work-order issuance."
            : "After design completion, the Client approves the final estimate. Super Admin then confirms the initial payment."} /> : null}
        <WorkflowStage
          title={quotationWorkflow ? `${hasQuotationRevision ? "7" : "6"}. Execution queues` : collaborative ? "7. Execution queues" : "6. Execution queues"}
          tone={executionComplete && executionEnabled ? "success" : executionEnabled ? "warning" : "neutral"}
          status={executionComplete && executionEnabled
            ? "Complete"
            : executionEnabled
              ? `${completedTasks} of ${executionTasks.length} tasks complete`
              : quotationWorkflow
                ? awaitingPreDesignApproval
                  ? "Waiting for pre-design approval"
                  : !currentQuotationApproved
                  ? "Waiting for quotation approval"
                  : designApproved
                    ? "Awaiting execution release"
                    : "Waiting for design approval"
                : collaborative ? "Preparation in progress" : "Waiting for design approval"}
          detail={executionEnabled
            ? `Procurement, Finance, Site Management, and approved trades · ${assignedTrades} of ${tradeTasks.length} trade tasks assigned`
            : quotationWorkflow
              ? awaitingPreDesignApproval
                ? "Execution remains locked until the Client approves the pre-design quotation."
                : !currentQuotationApproved
                ? "Execution remains locked until the current quotation approval is verified."
                : "Procurement follows approval of the uploaded design. Work-order issuance also requires Super Admin payment confirmation and procurement checks."
              : collaborative ? "Procurement and assigned staff can prepare now. Work-order issuance requires final approval and Super Admin payment confirmation." : "Execution queues open after design approval."}
        >
          {preparationTasks.length > 0 && !tasksLoading && !tasksError ? <p>{preparationTasks.filter((task) => task.assignedWorker).length} of {preparationTasks.length} preparation tasks assigned. Assignments can be planned now; execution deadlines and effort tracking start only after Super Admin confirms the initial payment.</p> : null}
          {executionEnabled && !tasksLoading && !tasksError ? (
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

function QuotationRevisionStage({
  state
}: {
  state: ReturnType<typeof currentQuotationApprovalState>;
}) {
  const presentation = state === "revision_current"
    ? {
        tone: "success" as const,
        status: "Revised quotation approved",
        detail: "The Client approved the current Designer-revised quotation. Design workflow can continue."
      }
    : state === "revision_pending_client"
      ? {
          tone: "warning" as const,
          status: "Awaiting Client review",
          detail: "The revised quotation is awaiting the Client's decision. Design workflow remains paused."
        }
      : state === "revision_changes_requested"
        ? {
            tone: "warning" as const,
            status: "Changes requested",
            detail: "The Client requested changes to the revised quotation. Design workflow remains paused."
          }
        : state === "revision_draft"
          ? {
              tone: "warning" as const,
              status: "Revision draft",
              detail: "Client approval is required after the revised quotation is submitted. Design workflow remains paused."
            }
          : {
              tone: "warning" as const,
              status: "Approval status unavailable",
              detail: "The current quotation approval could not be verified. Design workflow remains paused."
            };

  return (
    <WorkflowStage
      title="4. Quotation revision"
      tone={presentation.tone}
      status={presentation.status}
      detail={presentation.detail}
    />
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
