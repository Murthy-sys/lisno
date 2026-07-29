import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  FolderKanban,
  Plus
} from "lucide-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import type {
  KpiProjectAggregate,
  Project,
  ProjectStatus,
  TaskEvent
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { KpiBreakdown } from "../../components/kpi/KpiBreakdown";
import { KpiScore } from "../../components/kpi/KpiScore";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { AsyncState } from "../../components/ui/AsyncState";
import { MetricCard } from "../../components/ui/MetricCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ProjectCreateDialog } from "./ProjectCreateDialog";
import {
  designerKeys,
  getAllProjects,
  getKpi,
  getKpiTaskPage,
  reviewPeriod
} from "./designerApi";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";

const statusLabels: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed"
};

const statusTones = {
  planning: "info",
  active: "success",
  on_hold: "warning",
  completed: "neutral"
} as const;

const projectDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

export function DesignerDashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const user = auth.user!;
  const period = reviewPeriod(periodOffset);
  const projectsQuery = useQuery({
    queryKey: designerKeys.projects(),
    queryFn: getAllProjects
  });
  const kpiQuery = useQuery({
    queryKey: [...designerKeys.kpi(user.id), period.from, period.to],
    queryFn: () => getKpi(user.id, period)
  });
  const taskFeedQuery = useInfiniteQuery({
    queryKey: [...designerKeys.kpiTasks(user.id), period.from, period.to],
    queryFn: ({ pageParam }) => getKpiTaskPage(user.id, pageParam, period),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.offset + lastPage.pagination.limit
        : undefined
  });

  if (projectsQuery.isPending || kpiQuery.isPending || taskFeedQuery.isPending) {
    return <AsyncState state="loading" message="Loading your design operations…" />;
  }
  if (projectsQuery.isError || kpiQuery.isError || taskFeedQuery.isError) {
    return (
      <AsyncState
        state="error"
        message="We couldn't load your designer workspace."
        actionLabel="Try again"
        onAction={() => {
          void projectsQuery.refetch();
          void kpiQuery.refetch();
          void taskFeedQuery.refetch();
        }}
      />
    );
  }

  const projects = projectsQuery.data;
  const kpi = kpiQuery.data;
  const kpiTasks = taskFeedQuery.data.pages.flatMap((page) => page.items);
  const aggregates = kpi.aggregates;
  const activeProjectCount = projects.filter(
    (project) => project.status === "active"
  ).length;
  const redTasks = kpiTasks.filter((task) => task.risk.level === "red");
  const yellowTasks = kpiTasks.filter(
    (task) => task.risk.level === "yellow"
  );
  const riskQueue = [...redTasks, ...yellowTasks];
  const atRiskCount = aggregates.riskCounts.red + aggregates.riskCounts.yellow;

  return (
    <section className="designer-page" aria-labelledby="designer-title">
      <header className="designer-hero">
        <div>
          <p className="eyebrow">My design operations</p>
          <h1 id="designer-title">Good morning, {user.name.split(" ")[0]}.</h1>
          <p>Here’s what needs your eye across active client work.</p>
          <label className="sr-only" htmlFor="reporting-period">Reporting period</label>
          <select id="reporting-period" value={periodOffset} onChange={(event) => setPeriodOffset(Number(event.target.value))}>
            <option value={0}>Current month</option>
            <option value={-1}>Previous month</option>
          </select>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setCreateOpen(true)}
        >
          <Plus aria-hidden="true" />
          New project
        </button>
      </header>

      <EstimateReviewPanel />

      <section className="kpi-panel" aria-labelledby="kpi-title">
        <div className="kpi-panel__intro">
          <p className="eyebrow">Personal performance</p>
          <h2 id="kpi-title">Your KPI, component by component</h2>
          <p>
            Scores and eligibility come directly from Lisno’s delivery record.
          </p>
          <KpiScore score={kpi.score} />
        </div>
        <KpiBreakdown components={kpi.components} />
      </section>

      <div className="metrics-grid">
        <MetricCard
          label="Active projects"
          value={activeProjectCount}
          detail={`${aggregates.taskCounts.active} active · ${aggregates.taskCounts.completed} completed tasks`}
          icon={<FolderKanban />}
        />
        <MetricCard
          label="At-risk queue"
          value={atRiskCount}
          detail={`${aggregates.riskCounts.red} red · ${aggregates.riskCounts.yellow} yellow`}
          icon={<AlertTriangle />}
        />
        <MetricCard
          label="Open workload"
          value={`${aggregates.effort.remaining}h`}
          detail={`${aggregates.effort.completed}h completed of ${aggregates.effort.planned}h · ${aggregates.effort.workloadPercentage}% remains`}
          icon={<BriefcaseBusiness />}
        />
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-section" aria-labelledby="risk-queue-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Priority queue</p>
              <h2 id="risk-queue-title">Red and yellow tasks</h2>
            </div>
            <span>{atRiskCount} open</span>
          </div>
          {riskQueue.length ? (
            <div className="risk-list">
              {riskQueue.map((task) => (
                <article key={task.id} className="risk-item">
                  <div>
                    <strong>{task.title}</strong>
                    <span>{projectName(projects, task.projectId)}</span>
                  </div>
                  <RiskBadge risk={task.risk} />
                  <p>{task.risk.reason}</p>
                  <Link to={`/designer/projects/${task.projectId}`}>
                    Review task <ArrowUpRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="inline-empty">No red or yellow tasks right now.</p>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="activity-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Latest signals</p>
              <h2 id="activity-title">Recent activity</h2>
            </div>
          </div>
          {aggregates.recentActivity.length ? (
            <ol className="activity-list">
              {aggregates.recentActivity.map(({ taskTitle, event }) => (
                <li key={event.id}>
                  <span className="activity-list__icon"><Clock3 aria-hidden="true" /></span>
                  <div>
                    <strong>{event.note ?? eventLabel(event)}</strong>
                    <span>
                      {taskTitle} · {projectDate.format(new Date(event.occurredAt))}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="inline-empty">No recent task activity yet.</p>
          )}
        </section>
      </div>

      {taskFeedQuery.hasNextPage ? (
        <div className="dashboard-load-more">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void taskFeedQuery.fetchNextPage()}
            disabled={taskFeedQuery.isFetchingNextPage}
          >
            {taskFeedQuery.isFetchingNextPage ? "Loading more tasks…" : "Load more tasks"}
          </button>
        </div>
      ) : null}

      <section className="projects-section" aria-labelledby="projects-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assigned work</p>
            <h2 id="projects-title">Your projects</h2>
          </div>
        </div>
        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                aggregate={aggregates.projects.find(
                  (candidate) => candidate.projectId === project.id
                )}
              />
            ))}
          </div>
        ) : (
          <div className="project-empty">
            <span aria-hidden="true">01</span>
            <div>
              <h3>No projects yet</h3>
              <p>Create your first project to start planning design work.</p>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setCreateOpen(true)}
              >
                Create project
              </button>
            </div>
          </div>
        )}
      </section>

      {createOpen ? (
        <ProjectCreateDialog
          user={user}
          onClose={() => setCreateOpen(false)}
          onCreated={(project) =>
            navigate(`/designer/projects/${project.id}`)
          }
        />
      ) : null}
    </section>
  );
}

function ProjectCard({
  project,
  aggregate
}: {
  project: Project;
  aggregate?: KpiProjectAggregate;
}) {
  const red = aggregate?.riskCounts.red ?? 0;
  const yellow = aggregate?.riskCounts.yellow ?? 0;
  const progress = aggregate?.progress ?? 0;

  return (
    <article className="project-card" aria-label={project.name}>
      <div className="project-card__top">
        <StatusBadge
          label={statusLabels[project.status]}
          tone={statusTones[project.status]}
        />
        <span>{project.location}</span>
      </div>
      <h3>{project.name}</h3>
      <p>Delivery target {projectDate.format(new Date(project.plannedEndAt))}</p>
      <div className="project-card__health">
        <span><b>{progress}%</b> task completion</span>
        <span>{red} red</span>
        <span>{yellow} yellow</span>
      </div>
      <Link to={`/designer/projects/${project.id}`} className="project-card__link">
        Open project <ArrowUpRight aria-hidden="true" />
      </Link>
    </article>
  );
}

function eventLabel(event: TaskEvent): string {
  return {
    status_changed: "Task status changed",
    progress_changed: "Task progress updated",
    note_added: "Task note added",
    deadline_revised: "Task deadline revised"
  }[event.type];
}

function projectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? "Project";
}
