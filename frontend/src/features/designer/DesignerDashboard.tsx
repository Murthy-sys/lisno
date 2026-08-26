import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  FolderKanban
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import type {
  DesignPlanStatus,
  DesignPlanTask,
  KpiProjectAggregate
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { KpiPanel } from "../../components/kpi/KpiPanel";
import { AsyncState } from "../../components/ui/AsyncState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  designerKeys,
  getAllProjects,
  kpiQueryOptions,
  reviewPeriod
} from "./designerApi";
import {
  getDesignerPlanTasks,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

const designStatusLabels: Record<DesignPlanStatus, string> = {
  pending_assignment: "Awaiting assignment",
  assigned: "Ready to upload",
  in_progress: "Extraction in progress",
  ready_for_client: "Awaiting Client approval",
  changes_requested: "Changes requested",
  approved: "Approved"
};

const designStatusTones = {
  pending_assignment: "neutral",
  assigned: "info",
  in_progress: "warning",
  ready_for_client: "info",
  changes_requested: "danger",
  approved: "success"
} as const;

/*
 * Priority replaces the standalone red/yellow queue: a project carrying red
 * tasks sorts above one carrying yellow, and both sort above the rest, so the
 * work needing attention is at the top of the one list the Designer reads.
 */
type ProjectPriority = "red" | "yellow" | null;

function projectPriority(aggregate: KpiProjectAggregate | undefined): ProjectPriority {
  if (!aggregate) return null;
  if (aggregate.riskCounts.red > 0) return "red";
  if (aggregate.riskCounts.yellow > 0) return "yellow";
  return null;
}

const priorityRank: Record<"red" | "yellow" | "none", number> = {
  red: 0,
  yellow: 1,
  none: 2
};

export function DesignerDashboard() {
  const auth = useAuth();
  const user = auth.user!;
  const period = reviewPeriod();
  const projectsQuery = useQuery({
    queryKey: designerKeys.projects(),
    queryFn: getAllProjects
  });
  const designTasksQuery = useQuery({
    queryKey: projectWorkflowKeys.designerPlans,
    queryFn: getDesignerPlanTasks
  });
  const kpiQuery = useQuery(kpiQueryOptions(user.id, period));
  if (
    projectsQuery.isPending ||
    designTasksQuery.isPending ||
    kpiQuery.isPending
  ) {
    return <AsyncState state="loading" message="Loading your design operations…" />;
  }
  if (
    projectsQuery.isError ||
    designTasksQuery.isError ||
    kpiQuery.isError
  ) {
    return (
      <AsyncState
        state="error"
        message="We couldn't load your designer workspace."
        actionLabel="Try again"
        onAction={() => {
          void projectsQuery.refetch();
          void designTasksQuery.refetch();
          void kpiQuery.refetch();
        }}
      />
    );
  }

  const projects = projectsQuery.data;
  const designTasks = designTasksQuery.data;
  const kpi = kpiQuery.data;
  const aggregates = kpi.aggregates;
  const activeProjectCount = projects.filter(
    (project) => project.status === "active"
  ).length;
  const atRiskCount = aggregates.riskCounts.red + aggregates.riskCounts.yellow;
  const rankedTasks = designTasks
    .map((task) => {
      const aggregate = aggregates.projects.find(
        (candidate) => candidate.projectId === task.projectId
      );
      return { task, aggregate, priority: projectPriority(aggregate) };
    })
    .sort(
      (first, second) =>
        priorityRank[first.priority ?? "none"] -
        priorityRank[second.priority ?? "none"]
    );
  const priorityCount = rankedTasks.filter((entry) => entry.priority).length;

  return (
    <section className="designer-page designer-dashboard" aria-labelledby="designer-title">
      <PageHeader
        id="designer-title"
        eyebrow="My design operations"
        title="Design workspace"
        description={`Good morning, ${user.name.split(" ")[0]}. Here’s what needs your eye across active client work.`}
        metadata={(
          <StatusBadge tone="info" label={`${designTasks.length} assigned`} />
        )}
      />

      <KpiPanel userId={user.id} />

      <div className="designer-metrics">
        <MetricChip
          label="Active projects"
          value={activeProjectCount}
          detail={`${aggregates.taskCounts.active} active · ${aggregates.taskCounts.completed} completed tasks`}
          icon={<FolderKanban />}
        />
        <MetricChip
          label="At-risk queue"
          value={atRiskCount}
          detail={`${aggregates.riskCounts.red} red · ${aggregates.riskCounts.yellow} yellow`}
          icon={<AlertTriangle />}
        />
        <MetricChip
          label="Open workload"
          value={`${aggregates.effort.remaining}h`}
          detail={`${aggregates.effort.completed}h completed of ${aggregates.effort.planned}h · ${aggregates.effort.workloadPercentage}% remains`}
          icon={<BriefcaseBusiness />}
        />
      </div>

      <Surface as="section" className="designer-projects" aria-labelledby="projects-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assigned work</p>
            <h2 id="projects-title">Design projects</h2>
          </div>
          <span>
            {priorityCount
              ? `${priorityCount} priority · ${designTasks.length} assigned`
              : `${designTasks.length} assigned`}
          </span>
        </div>
        {designTasks.length ? (
          <div className="designer-project-list">
            <div className="designer-project-list__header" aria-hidden="true">
              <span>Client</span>
              <span>Project</span>
              <span>Design status</span>
              <span>Health</span>
              <span>Action</span>
            </div>
            {rankedTasks.map(({ task, aggregate, priority }) => (
              <DesignProjectRow
                key={task.id}
                task={task}
                aggregate={aggregate}
                priority={priority}
              />
            ))}
          </div>
        ) : (
          <div className="project-empty designer-projects__empty">
            <span aria-hidden="true">01</span>
            <div>
              <h3>No design projects assigned</h3>
              <p>
                Approved estimates will appear after an Admin or Super Admin assigns you.
              </p>
            </div>
          </div>
        )}
      </Surface>

    </section>
  );
}

function MetricChip({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="designer-metric-chip">
      <span className="designer-metric-chip__icon" aria-hidden="true">{icon}</span>
      <span className="designer-metric-chip__copy">
        <span className="designer-metric-chip__label">{label}</span>
        <span className="designer-metric-chip__detail">{detail}</span>
      </span>
      <strong className="designer-metric-chip__value">{value}</strong>
    </article>
  );
}

function DesignProjectRow({
  task,
  aggregate,
  priority
}: {
  task: DesignPlanTask;
  aggregate?: KpiProjectAggregate;
  priority: ProjectPriority;
}) {
  const headingId = `designer-project-${task.projectId}`;
  const action = designTaskAction(task.status);

  return (
    <article
      className={`designer-project-row${priority ? ` designer-project-row--priority designer-project-row--priority-${priority}` : ""}`}
      aria-labelledby={headingId}
    >
      <div className="designer-project-row__client" data-label="Client">
        <span className="sr-only">Client: </span>
        <strong>{task.clientName}</strong>
      </div>
      <div className="designer-project-row__project" data-label="Project">
        <h3 id={headingId}>{task.projectName}</h3>
        {priority ? (
          <StatusBadge
            tone={priority === "red" ? "danger" : "warning"}
            label={priority === "red" ? "High priority" : "Priority"}
          />
        ) : null}
        <small>
          {task.designPlanVersion > 0
            ? `Design plan v${task.designPlanVersion}`
            : "No design plan uploaded"}
        </small>
      </div>
      <div className="designer-project-row__status" data-label="Design status">
        <span className="sr-only">Design status: </span>
        <StatusBadge
          label={designStatusLabels[task.status]}
          tone={designStatusTones[task.status]}
        />
      </div>
      <div className="designer-project-row__health" data-label="Health">
        <span className="sr-only">Health: </span>
        {aggregate ? (
          <>
            <span><b>{aggregate.progress}%</b> task completion</span>
            <small>
              {aggregate.riskCounts.red} red · {aggregate.riskCounts.yellow} yellow
            </small>
          </>
        ) : (
          <span><b>Not available</b></span>
        )}
      </div>
      <div className="designer-project-row__actions" data-label="Actions">
        <Link
          to={`/designer/design-plans?estimate=${encodeURIComponent(task.estimateId)}`}
          className="button button--primary designer-project-row__action"
          aria-label={`${action} for ${task.projectName}`}
        >
          {action} <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function designTaskAction(status: DesignPlanStatus) {
  if (status === "assigned") return "Upload design";
  if (status === "changes_requested") return "Update design";
  if (status === "ready_for_client" || status === "approved") return "View images";
  return "Continue design";
}
