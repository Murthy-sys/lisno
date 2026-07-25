import type { KpiTask, TaskRisk } from "../contracts/domain.js";

const TWO_CALENDAR_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function calculateTaskRisk(task: KpiTask, now: Date): TaskRisk {
  const plannedStartAt = new Date(task.plannedStartAt);
  const currentDeadlineAt = new Date(task.currentDeadlineAt);
  const scheduledDuration = currentDeadlineAt.getTime() - plannedStartAt.getTime();
  const nowMs = now.getTime();
  const elapsedRatio = clamp(
    scheduledDuration > 0 ? (nowMs - plannedStartAt.getTime()) / scheduledDuration : 0
  );
  const progressRatio = clamp(task.progress / 100);

  if (task.status === "completed") {
    const completedAt = task.completedAt ? new Date(task.completedAt) : now;
    return {
      level: completedAt.getTime() > currentDeadlineAt.getTime() ? "red" : "green",
      reason:
        completedAt.getTime() > currentDeadlineAt.getTime()
          ? "Task was completed after its deadline."
          : "Task was completed on or before its deadline.",
      elapsedRatio,
      progressRatio
    };
  }

  if (nowMs > currentDeadlineAt.getTime()) {
    return {
      level: "red",
      reason: "Task is overdue.",
      elapsedRatio,
      progressRatio
    };
  }

  const forecastCompletion = forecast(plannedStartAt, now, progressRatio, elapsedRatio);
  const response: TaskRisk = {
    level: "gray",
    reason: "Task has not started.",
    elapsedRatio,
    progressRatio,
    ...(forecastCompletion ? { forecastCompletion: forecastCompletion.toISOString() } : {})
  };

  if (task.status === "blocked") {
    return { ...response, level: "yellow", reason: "Task is blocked." };
  }

  if (forecastCompletion && forecastCompletion.getTime() > currentDeadlineAt.getTime()) {
    return {
      ...response,
      level: "yellow",
      reason: "Task is forecast to finish after its deadline."
    };
  }

  if (nowMs >= plannedStartAt.getTime() && currentDeadlineAt.getTime() - nowMs <= TWO_CALENDAR_DAYS_MS) {
    return { ...response, level: "yellow", reason: "Task is due within two calendar days." };
  }

  const scheduleBuffer = progressRatio - elapsedRatio;
  if (nowMs >= plannedStartAt.getTime() && scheduleBuffer < 0) {
    return { ...response, level: "yellow", reason: "Task is behind its expected schedule." };
  }

  if (nowMs >= plannedStartAt.getTime() && scheduleBuffer + Number.EPSILON < 0.2) {
    return {
      ...response,
      level: "yellow",
      reason: "Task has less than a 20 percentage-point schedule buffer."
    };
  }

  if (nowMs >= plannedStartAt.getTime() && scheduleBuffer + Number.EPSILON >= 0.2) {
    return {
      ...response,
      level: "green",
      reason: "Task is on track with sufficient schedule buffer."
    };
  }

  return response;
}

function forecast(
  plannedStartAt: Date,
  now: Date,
  progressRatio: number,
  elapsedRatio: number
): Date | undefined {
  if (elapsedRatio <= 0 || progressRatio <= 0) {
    return undefined;
  }

  const elapsedMilliseconds = now.getTime() - plannedStartAt.getTime();
  const velocity = progressRatio / elapsedMilliseconds;
  const remainingMilliseconds = (1 - progressRatio) / velocity;

  return new Date(now.getTime() + remainingMilliseconds);
}
