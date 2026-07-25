import type {
  KpiComponent,
  KpiComponentKey,
  KpiInput,
  KpiResult,
  KpiTask
} from "../contracts/domain.js";

const COMPONENTS: Array<{
  key: KpiComponentKey;
  label: string;
  configuredWeight: number;
  explanation: string;
}> = [
  {
    key: "onTime",
    label: "On-time completion",
    configuredWeight: 35,
    explanation: "Completed and overdue tasks, weighted by planned effort."
  },
  {
    key: "quality",
    label: "Design quality and approval efficiency",
    configuredWeight: 25,
    explanation: "Approved design versions and overdue unapproved work, weighted by planned effort."
  },
  {
    key: "revisionEfficiency",
    label: "Revision efficiency",
    configuredWeight: 15,
    explanation: "Review-stage revision counts, weighted by planned effort."
  },
  {
    key: "updateDiscipline",
    label: "Status-update discipline",
    configuredWeight: 15,
    explanation: "Timely updates across required two-business-day active windows."
  },
  {
    key: "workloadCompletion",
    label: "Workload completion",
    configuredWeight: 10,
    explanation: "Completed planned effort for tasks scheduled in the reporting period."
  }
];

export function weightedAverage(items: Array<{ score: number; weight: number }>): number {
  const weightedItems = items.filter((item) => item.weight > 0);
  const totalWeight = weightedItems.reduce((total, item) => total + item.weight, 0);

  if (totalWeight === 0) return 0;

  return weightedItems.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight;
}

export function calculateKpi(input: KpiInput): KpiResult {
  const tasks = input.tasks.filter((task) => overlapsPeriod(task, input));
  const rawComponents = {
    onTime: onTimeComponent(tasks, input),
    quality: qualityComponent(tasks, input),
    revisionEfficiency: revisionEfficiencyComponent(tasks),
    updateDiscipline: updateDisciplineComponent(tasks, input),
    workloadCompletion: workloadCompletionComponent(tasks)
  } satisfies Record<KpiComponentKey, { score: number | null; eligibleCount: number }>;

  const totalEligibleWeight = COMPONENTS.reduce(
    (total, component) =>
      total + (rawComponents[component.key].score === null ? 0 : component.configuredWeight),
    0
  );
  const rawScore = COMPONENTS.reduce((total, component) => {
    const score = rawComponents[component.key].score;
    if (score === null || totalEligibleWeight === 0) return total;
    return total + score * (component.configuredWeight / totalEligibleWeight);
  }, 0);

  return {
    score: roundDisplay(rawScore),
    components: COMPONENTS.map((definition) => {
      const component = rawComponents[definition.key];
      return {
        ...definition,
        score: component.score === null ? null : roundDisplay(component.score),
        effectiveWeight:
          component.score === null || totalEligibleWeight === 0
            ? 0
            : roundDisplay((definition.configuredWeight / totalEligibleWeight) * 100),
        eligibleCount: component.eligibleCount
      };
    })
  };
}

function onTimeComponent(tasks: KpiTask[], input: KpiInput) {
  const eligible = tasks.flatMap((task) => {
    const completedAt = completionDate(task);
    if (task.status === "completed" && completedAt) {
      return [{ score: timingScore(task, completedAt), weight: taskWeight(task) }];
    }
    if (input.now.getTime() > new Date(task.currentDeadlineAt).getTime()) {
      return [{ score: 0, weight: taskWeight(task) }];
    }
    return [];
  });

  return componentAverage(eligible);
}

function timingScore(task: KpiTask, completedAt: Date): number {
  const deadline = new Date(task.currentDeadlineAt);
  if (completedAt.getTime() <= deadline.getTime()) return task.wasYellow ? 90 : 100;

  const duration = deadline.getTime() - new Date(task.plannedStartAt).getTime();
  const latenessRatio = duration > 0 ? (completedAt.getTime() - deadline.getTime()) / duration : Infinity;
  if (latenessRatio <= 0.1) return 70;
  if (latenessRatio <= 0.25) return 40;
  return 0;
}

function qualityComponent(tasks: KpiTask[], input: KpiInput) {
  const eligible = tasks.flatMap((task) => {
    const approvalScore = approvalScoreFor(task, input.now);
    return approvalScore === null ? [] : [{ score: approvalScore, weight: taskWeight(task) }];
  });

  return componentAverage(eligible);
}

function approvalScoreFor(task: KpiTask, now: Date): number | null {
  if (task.approvalStatus === "approved" && task.approvalVersion !== null && task.approvalVersion !== undefined) {
    if (task.approvalVersion === 1) return 100;
    if (task.approvalVersion === 2) return 85;
    if (task.approvalVersion === 3) return 65;
    if (task.approvalVersion === 4) return 40;
    return 0;
  }

  const hasApprovalOutcome = task.approvalStatus === "rejected" || task.approvalStatus === "unapproved";
  return hasApprovalOutcome && now.getTime() > new Date(task.currentDeadlineAt).getTime() ? 0 : null;
}

function revisionEfficiencyComponent(tasks: KpiTask[]) {
  const eligible = tasks.flatMap((task) => {
    if (!task.hasReview && (task.revisionCount === null || task.revisionCount === undefined)) {
      return [];
    }
    const revisionCount = Math.max(0, task.revisionCount ?? 0);
    return [{ score: Math.max(0, 100 - Math.max(0, revisionCount - 1) * 20), weight: taskWeight(task) }];
  });

  return componentAverage(eligible);
}

function updateDisciplineComponent(tasks: KpiTask[], input: KpiInput) {
  let timelyWindows = 0;
  let requiredWindows = 0;
  let eligibleCount = 0;

  for (const task of tasks) {
    if (task.status === "completed") continue;
    const windowCount = updateWindowCount(task, input);
    if (windowCount === 0) continue;

    eligibleCount += 1;
    requiredWindows += windowCount;
    timelyWindows += timelyUpdateWindowCount(task, input, windowCount);
  }

  return {
    score: requiredWindows === 0 ? null : (timelyWindows / requiredWindows) * 100,
    eligibleCount
  };
}

function updateWindowCount(task: KpiTask, input: KpiInput): number {
  return Math.ceil(businessDaysInActiveRange(task, input).length / 2);
}

function timelyUpdateWindowCount(task: KpiTask, input: KpiInput, windowCount: number): number {
  const businessDays = businessDaysInActiveRange(task, input);
  const indexes = new Map(businessDays.map((day, index) => [day, index]));
  const timelyWindows = new Set<number>();

  for (const event of task.updateEvents ?? []) {
    const index = indexes.get(utcDay(new Date(event.occurredAt)));
    if (index !== undefined) timelyWindows.add(Math.floor(index / 2));
  }

  return [...timelyWindows].filter((index) => index < windowCount).length;
}

function businessDaysInActiveRange(task: KpiTask, input: KpiInput): string[] {
  const rangeStart = maxDate(new Date(task.plannedStartAt), new Date(input.periodStartAt));
  const rangeEnd = minDate(input.now, new Date(input.periodEndAt));
  const days: string[] = [];
  const cursor = utcMidnight(rangeStart);
  const end = utcMidnight(rangeEnd);

  while (cursor.getTime() < end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function workloadCompletionComponent(tasks: KpiTask[]) {
  if (tasks.length === 0) return { score: null, eligibleCount: 0 };

  const totalPlannedEffort = tasks.reduce((total, task) => total + taskWeight(task), 0);
  const completedPlannedEffort = tasks.reduce(
    (total, task) => total + (task.status === "completed" ? taskWeight(task) : 0),
    0
  );

  return {
    score: Math.min(100, (completedPlannedEffort / totalPlannedEffort) * 100),
    eligibleCount: tasks.length
  };
}

function componentAverage(items: Array<{ score: number; weight: number }>) {
  return {
    score: items.length === 0 ? null : weightedAverage(items),
    eligibleCount: items.length
  };
}

function overlapsPeriod(task: KpiTask, input: KpiInput): boolean {
  const periodStart = new Date(input.periodStartAt).getTime();
  const periodEnd = new Date(input.periodEndAt).getTime();
  const start = new Date(task.plannedStartAt).getTime();
  const deadline = new Date(task.currentDeadlineAt).getTime();
  const completedAt = completionDate(task)?.getTime();

  return (
    (start <= periodEnd && deadline >= periodStart) ||
    (completedAt !== undefined && completedAt >= periodStart && completedAt <= periodEnd)
  );
}

function completionDate(task: KpiTask): Date | undefined {
  return task.completedAt ? new Date(task.completedAt) : undefined;
}

function taskWeight(task: KpiTask): number {
  return task.plannedEffort && task.plannedEffort > 0 ? task.plannedEffort : 1;
}

function utcMidnight(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() > right.getTime() ? left : right;
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() < right.getTime() ? left : right;
}

function roundDisplay(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
