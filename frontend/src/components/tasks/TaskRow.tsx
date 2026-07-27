import { CalendarDays, Clock3, FileUp, PencilLine } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { ProjectTask, TaskStatus } from "../../api/types";
import {
  designerKeys,
  getLatestTaskEvent
} from "../../features/designer/designerApi";
import { ProgressBar } from "../ui/ProgressBar";
import { StatusBadge } from "../ui/StatusBadge";
import { RiskBadge } from "./RiskBadge";

const statusLabels: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  completed: "Completed"
};

const statusTones = {
  not_started: "neutral",
  in_progress: "info",
  in_review: "warning",
  blocked: "danger",
  completed: "success"
} as const;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

export function formatTaskDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function TaskRow({
  task,
  userId,
  onUpdate,
  onUpload
}: {
  task: ProjectTask;
  userId: string;
  onUpdate: () => void;
  onUpload: () => void;
}) {
  const eventsQuery = useQuery({
    queryKey: designerKeys.taskEvents(task.id),
    queryFn: () => getLatestTaskEvent(task.id)
  });
  const latestEvent = eventsQuery.data?.items[0];
  const readOnlyReason =
    task.status === "completed"
      ? "This task is complete"
      : task.ownerId !== userId
        ? "Assigned to teammate"
        : null;

  return (
    <article className="task-row" aria-label={task.title}>
      <div className="task-row__heading">
        <div>
          <p className="task-row__order">Task {String(task.order).padStart(2, "0")}</p>
          <h3>{task.title}</h3>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <div className="task-row__badges">
          <StatusBadge
            label={statusLabels[task.status]}
            tone={statusTones[task.status]}
          />
          <RiskBadge risk={task.risk} />
        </div>
      </div>

      <p className="task-row__risk-reason">{task.risk.reason}</p>

      <div className="task-row__progress">
        <div>
          <strong>{task.progress}% complete</strong>
          <span>Version {task.version}</span>
        </div>
        <ProgressBar value={task.progress} />
      </div>

      <dl className="task-row__facts">
        <div>
          <dt><CalendarDays aria-hidden="true" /> Deadline</dt>
          <dd>
            <span>Original: {formatTaskDate(task.originalDeadlineAt)}</span>
            <strong>Current: {formatTaskDate(task.currentDeadlineAt)}</strong>
          </dd>
        </div>
        <div>
          <dt><Clock3 aria-hidden="true" /> Effort</dt>
          <dd>
            {task.plannedEffort === null
              ? "Not estimated"
              : `${task.plannedEffort} hours`}
          </dd>
        </div>
        <div>
          <dt>Latest update</dt>
          <dd>
            {task.latestUpdateAt
              ? `Updated ${formatTaskDate(task.latestUpdateAt)}`
              : "No updates yet"}
          </dd>
        </div>
      </dl>

      {latestEvent?.note ? (
        <blockquote className="task-row__latest-note">
          <span>Latest note</span>
          {latestEvent.note}
        </blockquote>
      ) : null}

      {readOnlyReason ? (
        <p className="task-row__read-only">{readOnlyReason}</p>
      ) : (
        <div className="task-row__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onUpdate}
            aria-label={`Update ${task.title}`}
          >
            <PencilLine aria-hidden="true" />
            Update task
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={onUpload}
            aria-label={`Upload design for ${task.title}`}
          >
            <FileUp aria-hidden="true" />
            Upload design
          </button>
        </div>
      )}
    </article>
  );
}
