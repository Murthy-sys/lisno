import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import {
  ROLE_LABELS,
  WORKER_ROLES
} from "../../api/authorization-contract";
import type { ProjectWorkflowTask, Role } from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { adminProjectKeys } from "../admin/adminProjectsApi";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { projectFinanceKeys } from "../finance/projectFinanceApi";
import {
  getOperationalWorkflowTasks,
  projectWorkflowKeys,
  updateOperationalWorkflowTask
} from "./projectWorkflowApi";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

const progressRoleSet = new Set<Role>([
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
]);

export function OperationalTaskQueue({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const [editingTask, setEditingTask] = useState<ProjectWorkflowTask>();
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.operational,
    queryFn: getOperationalWorkflowTasks
  });
  const update = useMutation({
    mutationFn: ({ task, progress }: { task: ProjectWorkflowTask; progress: number }) =>
      updateOperationalWorkflowTask(task.id, task.version, progress),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectWorkflowTask[]>(
        projectWorkflowKeys.operational,
        (current) => current?.map((task) => task.id === updated.id ? updated : task)
      );
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: projectWorkflowKeys.projectTasks(updated.projectId)
        }),
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectFinanceKeys.projects }),
        queryClient.invalidateQueries({
          queryKey: projectFinanceKeys.bucket(updated.projectId)
        }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      setEditingTask(undefined);
    },
    onError: async (error, { task }) => {
      if (error instanceof ApiError && error.code === "WORKFLOW_TASK_STALE") {
        const refreshed = await tasks.refetch();
        setEditingTask(
          refreshed.data?.find((candidate) => candidate.id === task.id)
        );
      }
    }
  });

  const siteManagerView = role === "site_manager";
  const canUpdateOwnTasks = progressRoleSet.has(role);
  const allTasks = tasks.data ?? [];
  const coordinationTasks = siteManagerView
    ? allTasks.filter((task) => task.kind === "site_execution")
    : allTasks;
  const tradeTasks = siteManagerView
    ? allTasks.filter((task) => task.kind === "trade_execution")
    : [];
  const openCount = (siteManagerView ? tradeTasks : allTasks)
    .filter((task) => task.status !== "completed").length;

  return (
    <Surface
      as="section"
      className="workflow-task-queue"
      aria-labelledby="workflow-task-queue-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Approved design handoff</p>
          <h2 id="workflow-task-queue-title">
            {siteManagerView ? "Site execution overview" : "Your project tasks"}
          </h2>
        </div>
        {tasks.data ? (
          <span>
            {openCount}{" "}
            {siteManagerView
              ? `open worker task${openCount === 1 ? "" : "s"}`
              : "open"}
          </span>
        ) : null}
      </div>

      {tasks.isPending ? <p role="status">Loading approved project tasks…</p> : null}
      {tasks.isError ? (
        <p role="alert">
          We couldn't load project tasks.{" "}
          <button
            type="button"
            className="secondary-button"
            onClick={() => void tasks.refetch()}
          >
            Try again
          </button>
        </p>
      ) : null}
      {tasks.data?.length === 0 ? (
        <p className="inline-empty">
          Tasks will appear here after the Client approves a design plan.
        </p>
      ) : null}

      {coordinationTasks.length ? (
        <TaskSection
          title={siteManagerView ? "Your coordination tasks" : undefined}
          tasks={coordinationTasks}
          canUpdate={canUpdateOwnTasks}
          onUpdate={(task) => {
            update.reset();
            setEditingTask(task);
          }}
        />
      ) : null}

      {siteManagerView && tradeTasks.length ? (
        <WorkerProgressByProject tasks={tradeTasks} />
      ) : null}

      {editingTask ? (
        <ProgressUpdateDialog
          key={`${editingTask.id}:${editingTask.version}`}
          task={editingTask}
          busy={update.isPending}
          error={update.isError ? updateErrorMessage(update.error) : ""}
          onClose={() => {
            if (!update.isPending) setEditingTask(undefined);
          }}
          onSubmit={(progress) => update.mutate({ task: editingTask, progress })}
        />
      ) : null}
    </Surface>
  );
}

function TaskSection({
  title,
  tasks,
  canUpdate,
  onUpdate
}: {
  title?: string;
  tasks: ProjectWorkflowTask[];
  canUpdate: boolean;
  onUpdate: (task: ProjectWorkflowTask) => void;
}) {
  const content = (
    <div className="workflow-task-grid">
      {tasks.map((task) => (
        <WorkflowTaskCard
          task={task}
          canUpdate={canUpdate}
          key={task.id}
          onUpdate={() => onUpdate(task)}
        />
      ))}
    </div>
  );

  if (!title) return content;
  return (
    <section className="workflow-task-section" aria-labelledby="site-coordination-title">
      <div className="workflow-task-section__heading">
        <h3 id="site-coordination-title">{title}</h3>
        <span>{tasks.length}</span>
      </div>
      {content}
    </section>
  );
}

function WorkerProgressByProject({ tasks }: { tasks: ProjectWorkflowTask[] }) {
  const groups = groupByProject(tasks);
  return (
    <section className="workflow-worker-progress" aria-labelledby="worker-progress-title">
      <div className="workflow-task-section__heading">
        <div>
          <p className="eyebrow">Trade execution</p>
          <h3 id="worker-progress-title">Worker progress</h3>
        </div>
        <span>{tasks.length} tasks</span>
      </div>
      <div className="workflow-project-groups">
        {groups.map(({ projectId, projectName, tasks: projectTasks }) => (
          <section
            className="workflow-project-group"
            aria-labelledby={`workflow-project-${projectId}`}
            key={projectId}
          >
            <div className="workflow-project-group__heading">
              <h4 id={`workflow-project-${projectId}`}>{projectName}</h4>
              <span>{completedLabel(projectTasks)}</span>
            </div>
            <div className="workflow-task-grid">
              {projectTasks.map((task) => (
                <WorkflowTaskCard
                  task={task}
                  canUpdate={false}
                  key={task.id}
                  onUpdate={() => {}}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function WorkflowTaskCard({
  task,
  canUpdate,
  onUpdate
}: {
  task: ProjectWorkflowTask;
  canUpdate: boolean;
  onUpdate: () => void;
}) {
  return (
    <article
      className="project-card workflow-task-card"
      aria-label={`${task.title} task`}
    >
      <div className="project-card__heading workflow-task-card__heading">
        <div>
          <p className="eyebrow">{task.projectName}</p>
          <h3>{task.title}</h3>
        </div>
        <StatusBadge
          tone={task.status === "completed" ? "success" : task.status === "in_progress" ? "warning" : "info"}
          label={task.status.replaceAll("_", " ")}
        />
      </div>
      <p>{task.description}</p>
      <div className="workflow-task-card__progress">
        <div>
          <strong>{task.progress}% complete</strong>
          <span>Version {task.version}</span>
        </div>
        <ProgressBar
          value={task.progress}
          label={`${task.title}: ${task.progress}% complete`}
        />
      </div>
      <dl>
        <div><dt>Queue</dt><dd>{ROLE_LABELS[task.assigneeRole]}</dd></div>
        {task.kind === "trade_execution" ? (
          <div>
            <dt>Worker</dt>
            <dd>
              {task.assignedWorker
                ? `${task.assignedWorker.name}${task.assignedWorker.active ? "" : " (inactive)"}`
                : "Unassigned"}
            </dd>
          </div>
        ) : null}
        {task.roomName ? <div><dt>Room</dt><dd>{task.roomName}</dd></div> : null}
        <div><dt>Opened</dt><dd>{dateTime.format(new Date(task.openedAt))}</dd></div>
        <div><dt>Updated</dt><dd>{dateTime.format(new Date(task.updatedAt))}</dd></div>
      </dl>
      {canUpdate ? (
        <button
          type="button"
          className="button button--secondary workflow-task-card__update"
          aria-label={`Update progress for ${task.title}`}
          onClick={onUpdate}
        >
          Update progress
        </button>
      ) : null}
    </article>
  );
}

function ProgressUpdateDialog({
  task,
  busy,
  error,
  onClose,
  onSubmit
}: {
  task: ProjectWorkflowTask;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (progress: number) => void;
}) {
  const [progress, setProgress] = useState(String(task.progress));
  const [validation, setValidation] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(progress);
    if (
      progress.trim() === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100
    ) {
      setValidation("Progress must be a whole number from 0 to 100.");
      return;
    }
    setValidation("");
    onSubmit(value);
  };

  return (
    <Dialog
      title={`Update ${task.title} progress`}
      eyebrow={ROLE_LABELS[task.assigneeRole]}
      description={`Current progress ${task.progress}%. Completing the task requires 100%.`}
      onClose={onClose}
      busy={busy}
    >
      <form className="workflow-progress-form" noValidate onSubmit={submit}>
        <label htmlFor={`workflow-progress-${task.id}`}>
          Progress percentage
          <span className="workflow-progress-form__control">
            <input
              id={`workflow-progress-${task.id}`}
              aria-label="Progress percentage"
              type="number"
              min="0"
              max="100"
              step="1"
              value={progress}
              disabled={busy}
              onChange={(event) => {
                setProgress(event.target.value);
                setValidation("");
              }}
            />
            <span aria-hidden="true">%</span>
          </span>
        </label>
        {validation || error ? <p role="alert">{validation || error}</p> : null}
        <div className="workflow-progress-form__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? "Saving…" : "Save progress"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function groupByProject(tasks: ProjectWorkflowTask[]) {
  const groups = new Map<string, { projectName: string; tasks: ProjectWorkflowTask[] }>();
  for (const task of tasks) {
    const current = groups.get(task.projectId);
    if (current) current.tasks.push(task);
    else groups.set(task.projectId, { projectName: task.projectName, tasks: [task] });
  }
  return [...groups].map(([projectId, group]) => ({ projectId, ...group }));
}

function completedLabel(tasks: ProjectWorkflowTask[]) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  return `${completed} of ${tasks.length} complete`;
}

function updateErrorMessage(error: Error) {
  if (error instanceof ApiError) return error.message;
  return "Progress could not be saved. Try again.";
}
