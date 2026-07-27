import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  DesignVersionRecord,
  TaskEventRecord,
  TaskRecord
} from "../repositories/types.js";

export const MAX_KPI_TASKS = 1_000;
export const MAX_KPI_EVIDENCE_RECORDS = 5_000;
export const MAX_KPI_SPAN_MS = 366 * 24 * 60 * 60 * 1_000;

export function assertKpiPeriod(periodStartAt: string, periodEndAt: string) {
  const start = new Date(periodStartAt);
  const end = new Date(periodEndAt);
  if (start > end) {
    throw new ApiError(
      400,
      "INVALID_DATE_RANGE",
      "The KPI period start must not follow its end.",
      { to: "The KPI period end must not precede its start." }
    );
  }
  if (end.getTime() - start.getTime() > MAX_KPI_SPAN_MS) {
    throw new ApiError(
      400,
      "INVALID_KPI_RANGE",
      "KPI reports are limited to 366 days.",
      { to: "Choose a reporting period of 366 days or fewer." }
    );
  }
}

export async function enrichKpiTasks(
  repository: AppRepository,
  tasks: TaskRecord[],
  periodStartAt: string,
  periodEndAt: string
): Promise<TaskRecord[]> {
  if (tasks.length > MAX_KPI_TASKS) {
    throw new ApiError(
      422,
      "KPI_TASK_LIMIT_EXCEEDED",
      `KPI reports support at most ${MAX_KPI_TASKS} tasks.`
    );
  }
  if (tasks.length === 0) return [];
  const [events, versions] = await Promise.all([
    repository.listKpiTaskEventsForTasks(
      tasks,
      periodStartAt,
      periodEndAt,
      MAX_KPI_EVIDENCE_RECORDS + 1
    ),
    repository.listDesignVersionsForTaskIds(
      tasks.map((task) => task.id),
      MAX_KPI_EVIDENCE_RECORDS + 1
    )
  ]);
  if (
    events.length > MAX_KPI_EVIDENCE_RECORDS ||
    versions.length > MAX_KPI_EVIDENCE_RECORDS
  ) {
    throw new ApiError(
      422,
      "KPI_EVIDENCE_LIMIT_EXCEEDED",
      `KPI reports support at most ${MAX_KPI_EVIDENCE_RECORDS} event or version records.`
    );
  }
  const eventsByTaskId = groupByTaskId(events);
  const versionsByTaskId = groupByTaskId(versions);
  return tasks.map((task) =>
    enrichTask(
      task,
      eventsByTaskId.get(task.id) ?? [],
      versionsByTaskId.get(task.id) ?? []
    )
  );
}

function enrichTask(
  task: TaskRecord,
  events: TaskEventRecord[],
  versions: DesignVersionRecord[]
): TaskRecord {
  const orderedVersions = versions.slice().sort(
    (left, right) =>
      left.versionNumber - right.versionNumber || left.id.localeCompare(right.id)
  );
  const reviewedVersions = orderedVersions.filter((version) =>
    ["in_review", "approved", "rejected"].includes(version.approvalStatus)
  );
  const latestReview = reviewedVersions.at(-1);
  const latestApproval = orderedVersions
    .filter((version) => version.approvalStatus === "approved")
    .at(-1);
  return {
    ...task,
    updateEvents: events.map((event) => ({ occurredAt: event.occurredAt })),
    approvalStatus: latestApproval
      ? "approved"
      : latestReview?.approvalStatus === "rejected"
        ? "rejected"
        : orderedVersions.length > 0
          ? "unapproved"
          : undefined,
    approvalVersion: latestApproval?.versionNumber,
    revisionCount: Math.max(orderedVersions.length - 1, 0),
    hasReview: reviewedVersions.length > 0
  };
}

function groupByTaskId<T extends { taskId: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!item.taskId) continue;
    const group = groups.get(item.taskId) ?? [];
    group.push(item);
    groups.set(item.taskId, group);
  }
  return groups;
}
