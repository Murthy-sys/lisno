import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  FolderKanban,
  Plus
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import type {
  KpiTaskRead,
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
  getCompleteKpi
} from "./designerApi";

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
  const user = auth.user!;
  const projectsQuery = useQuery({
    queryKey: designerKeys.projects(),
    queryFn: getAllProjects
  });
  const kpiQuery = useQuery({
    queryKey: designerKeys.kpi(user.id),
    queryFn: () => getCompleteKpi(user.id)
  });

  if (projectsQuery.isPending || kpiQuery.isPending) {
    return <AsyncState state="loading" message="Loading your design operations…" />;
  }
  if (projectsQuery.isError || kpiQuery.isError) {
    return (
      <AsyncState
        state="error"
        message="We couldn't load your designer workspace."
        actionLabel="Try again"
        onAction={() => {
          void projectsQuery.refetch();
          void kpiQuery.refetch();
        }}
      />
    );
  }

  const projects = projectsQuery.data;
  const kpi = kpiQuery.data;
  const activeProjects = projects.filter((project) => project.status === "active");
  const redTasks = kpi.tasks.items.filter((task) => task.risk.level === "red");
  const yellowTasks = kpi.tasks.items.filter(
    (task) => task.risk.level === "yellow"
  );
  const workload = kpi.tasks.items
    .filter((task) => task.status !== "completed")
    .reduce((total, task) => total + (task.plannedEffort ?? 0), 0);
  const riskQueue = [...redTasks, ...yellowTasks];
  const recentActivity = collectActivity(kpi.tasks.items).slice(0, 5);

  return (
    <section className="designer-page" aria-labelledby="designer-title">
      <header className="designer-hero">
        <div>
          <p className="eyebrow">My design operations</p>
          <h1 id="designer-title">Good morning, {user.name.split(" ")[0]}.</h1>
          <p>Here’s what needs your eye across active client work.</p>
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
          value={activeProjects.length}
          detail={`${projects.length} total assigned`}
          icon={<FolderKanban />}
        />
        <MetricCard
          label="At-risk queue"
          value={riskQueue.length}
          detail={`${redTasks.length} red · ${yellowTasks.length} yellow`}
          icon={<AlertTriangle />}
        />
        <MetricCard
          label="Open workload"
          value={`${workload}h`}
          detail="Planned effort on incomplete tasks"
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
            <span>{riskQueue.length} open</span>
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
          {recentActivity.length ? (
            <ol className="activity-list">
              {recentActivity.map(({ task, event }) => (
                <li key={event.id}>
                  <span className="activity-list__icon"><Clock3 aria-hidden="true" /></span>
                  <div>
                    <strong>{event.note ?? eventLabel(event)}</strong>
                    <span>
                      {task.title} · {projectDate.format(new Date(event.occurredAt))}
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
                tasks={kpi.tasks.items.filter(
                  (task) => task.projectId === project.id
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
  tasks
}: {
  project: Project;
  tasks: KpiTaskRead[];
}) {
  const red = tasks.filter((task) => task.risk.level === "red").length;
  const yellow = tasks.filter((task) => task.risk.level === "yellow").length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

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

function collectActivity(tasks: KpiTaskRead[]) {
  return tasks
    .flatMap((task) => task.events.items.map((event) => ({ task, event })))
    .sort((left, right) =>
      right.event.occurredAt.localeCompare(left.event.occurredAt)
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
