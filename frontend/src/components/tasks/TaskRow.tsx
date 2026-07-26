import { CalendarDays, Clock3, FileUp, PencilLine } from "lucide-react";

import type { KpiTaskRead, TaskRecord, TaskStatus } from "../../api/types";
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
  insight,
  onUpdate,
  onUpload
}: {
  task: TaskRecord;
  insight?: KpiTaskRead;
  onUpdate: () => void;
  onUpload: () => void;
}) {
  const latestEvent = insight?.events.items
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];

  return (
    <article className="task-row" aria-label={task.title}>
      <div className="task-row__heading">
        <div>
          <p className="task-row__order">Task {String(task.order).padStart(2, "0")}</p>
          <h4>{task.title}</h4>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <div className="task-row__badges">
          <StatusBadge
            label={statusLabels[task.status]}
            tone={statusTones[task.status]}
          />
          {insight ? <RiskBadge risk={insight.risk} /> : null}
        </div>
      </div>

      {insight ? <p className="task-row__risk-reason">{insight.risk.reason}</p> : null}

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
    </article>
  );
}
