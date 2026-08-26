import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { ROLE_LABELS } from "../../api/authorization-contract";
import type {
  AdminProjectSummary,
  ProjectWorkflowTask,
  WorkerAssignmentOption
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  getAdminProjectWorkflowTasks,
  getWorkerAssignmentOptions,
  overrideWorkerAssignment,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

export function WorkerAssignmentPanel({ project }: { project: AdminProjectSummary }) {
  const approved = project.estimate?.designPlanStatus === "approved";
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.projectTasks(project.id),
    queryFn: () => getAdminProjectWorkflowTasks(project.id),
    enabled: approved
  });
  const workers = useQuery({
    queryKey: projectWorkflowKeys.workers,
    queryFn: getWorkerAssignmentOptions,
    enabled: approved
  });
  const executionTasks = tasks.data?.filter(
    (task) => task.kind !== "design_plan_upload"
  ) ?? [];
  const coordinationTasks = executionTasks.filter(
    (task) => task.kind !== "trade_execution"
  );
  const tradeTasks = tasks.data?.filter((task) => task.kind === "trade_execution") ?? [];

  return (
    <Surface
      as="section"
      className="admin-project-detail__surface worker-assignment"
      aria-labelledby="worker-assignment-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Approved design execution</p>
          <h2 id="worker-assignment-title">Execution and workers</h2>
        </div>
        {approved && tasks.data ? (
          <StatusBadge
            tone={executionTasks.every((task) => task.status === "completed") ? "success" : "warning"}
            label={`${executionTasks.filter((task) => task.status === "completed").length} of ${executionTasks.length} tasks complete`}
          />
        ) : null}
      </div>

      {!approved ? (
        <p>Worker assignment opens after the Client—or an Admin acting with proof—approves the design plan.</p>
      ) : tasks.isPending || workers.isPending ? (
        <PageState state="loading" message="Loading execution tasks and active workers…" />
      ) : tasks.isError || workers.isError ? (
        <PageState
          state="error"
          message="Execution assignments could not be loaded."
          action={{
            label: "Try again",
            onAction: () => void Promise.all([tasks.refetch(), workers.refetch()])
          }}
        />
      ) : (
        <>
          {coordinationTasks.length ? (
            <ExecutionProgress tasks={coordinationTasks} />
          ) : null}
          <section className="worker-assignment__trades" aria-labelledby="trade-worker-assignment-title">
            <div className="section-heading">
              <div>
                <h3 id="trade-worker-assignment-title">Trade worker assignments</h3>
                <p>Assign the exact worker required by each approved Estimate line.</p>
              </div>
              <span>{tradeTasks.filter((task) => task.assignedWorker).length} of {tradeTasks.length} assigned</span>
            </div>
            {tradeTasks.length === 0 ? (
              <p className="inline-empty">No trade work was selected in the approved estimate.</p>
            ) : (
              <div className="worker-assignment__list">
                {tradeTasks.map((task) => (
                  <WorkerAssignmentRow
                    key={task.id}
                    projectId={project.id}
                    task={task}
                    workers={workers.data ?? []}
                    onStale={() => void tasks.refetch()}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Surface>
  );
}

function ExecutionProgress({ tasks }: { tasks: ProjectWorkflowTask[] }) {
  return (
    <section className="worker-assignment__monitor" aria-labelledby="execution-progress-title">
      <div className="section-heading">
        <div>
          <h3 id="execution-progress-title">Project delivery queues</h3>
          <p>Live progress from Procurement, Finance, and Site Management.</p>
        </div>
      </div>
      <div className="worker-assignment__monitor-grid">
        {tasks.map((task) => (
          <article key={task.id} aria-label={`${task.title} progress`}>
            <div>
              <span>{ROLE_LABELS[task.assigneeRole]}</span>
              <StatusBadge
                tone={task.status === "completed" ? "success" : task.status === "in_progress" ? "warning" : "info"}
                label={task.status.replaceAll("_", " ")}
              />
            </div>
            <strong>{task.title}</strong>
            <ProgressBar
              value={task.progress}
              label={`${task.title}: ${task.progress}% complete`}
            />
            <small>{task.progress}% complete</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkerAssignmentRow({
  projectId,
  task,
  workers,
  onStale
}: {
  projectId: string;
  task: ProjectWorkflowTask;
  workers: WorkerAssignmentOption[];
  onStale: () => void;
}) {
  const client = useQueryClient();
  const [workerId, setWorkerId] = useState(task.assignedWorker?.id ?? "");
  useEffect(() => setWorkerId(task.assignedWorker?.id ?? ""), [task.assignedWorker?.id]);
  const candidates = workers.filter((worker) => worker.role === task.assigneeRole);
  const assignment = useMutation({
    mutationFn: () => overrideWorkerAssignment({
      projectId,
      taskId: task.id,
      expectedVersion: task.version,
      workerId: workerId || null
    }),
    onSuccess: (updated) => {
      client.setQueryData<ProjectWorkflowTask[]>(
        projectWorkflowKeys.projectTasks(projectId),
        (current) => current?.map((candidate) =>
          candidate.id === updated.id ? updated : candidate
        )
      );
      void client.invalidateQueries({ queryKey: projectWorkflowKeys.operational });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "WORKFLOW_TASK_STALE") onStale();
    }
  });
  const unchanged = workerId === (task.assignedWorker?.id ?? "");

  return (
    <article className="worker-assignment__row" aria-label={`${task.title} worker assignment`}>
      <div className="worker-assignment__task">
        <div>
          <strong>{task.title}</strong>
          <span>{ROLE_LABELS[task.assigneeRole]}{task.roomName ? ` · ${task.roomName}` : ""}</span>
        </div>
        <StatusBadge
          tone={task.status === "completed" ? "success" : task.status === "in_progress" ? "warning" : "info"}
          label={task.status.replaceAll("_", " ")}
        />
      </div>
      <div className="worker-assignment__progress">
        <ProgressBar
          value={task.progress}
          label={`${task.title}: ${task.progress}% complete`}
        />
        <span>{task.progress}% complete</span>
      </div>
      <label>
        Assigned worker
        <Select
          value={workerId}
          disabled={task.status === "completed" || assignment.isPending}
          onChange={(event) => {
            setWorkerId(event.target.value);
            assignment.reset();
          }}
        >
          <option value="">Unassigned</option>
          {candidates.map((worker) => (
            <option value={worker.id} key={worker.id}>
              {worker.name} · {worker.email}
            </option>
          ))}
        </Select>
      </label>
      {assignment.isError ? (
        <p role="alert">
          {assignment.error instanceof ApiError
            ? assignment.error.message
            : "The worker assignment could not be saved."}
        </p>
      ) : null}
      {assignment.isSuccess ? <p role="status">Worker assignment saved.</p> : null}
      <Button
        type="button"
        busy={assignment.isPending}
        busyLabel="Saving…"
        disabled={task.status === "completed" || unchanged}
        onClick={() => assignment.mutate()}
      >
        {!workerId ? "Unassign Worker" : task.assignedWorker ? "Reassign Worker" : "Assign Worker"}
      </Button>
    </article>
  );
}
