import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  PageResult,
  PaginationInput,
  TaskEventRecord,
  TaskRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import {
  assertKpiPeriod,
  enrichKpiTasks,
  MAX_KPI_TASKS
} from "./kpi-enrichment.service.js";
import {
  assertDesignerRelationship,
  forbidden,
  requireUser,
  type Clock
} from "./workflow.js";

export interface KpiRead {
  userId: string;
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  components: ReturnType<typeof calculateKpi>["components"];
  aggregates: KpiAggregates;
  tasks: PageResult<
    KpiTaskDetail & {
    events: PageResult<TaskEventRecord>;
    }
  >;
}

export interface KpiTaskDetail {
  id: string;
  projectId: string;
  title: string;
  status: TaskRecord["status"];
  progress: number;
  currentDeadlineAt: string;
  plannedEffort: number | null;
  risk: ReturnType<typeof calculateTaskRisk>;
}

type RiskCounts = Record<ReturnType<typeof calculateTaskRisk>["level"], number>;

export interface KpiAggregates {
  taskCounts: { total: number; completed: number; active: number };
  riskCounts: RiskCounts;
  effort: {
    planned: number;
    completed: number;
    remaining: number;
    workloadPercentage: number;
  };
  projects: Array<{
    projectId: string;
    totalTasks: number;
    completedTasks: number;
    progress: number;
    riskCounts: RiskCounts;
  }>;
  recentActivity: Array<{
    taskId: string;
    projectId: string;
    taskTitle: string;
    event: TaskEventRecord;
  }>;
}

export interface KpiService {
  get(
    actor: PublicUser,
    userId: string,
    periodStartAt: string,
    periodEndAt: string,
    pagination: PaginationInput
  ): Promise<KpiRead>;
  listTasks(
    actor: PublicUser,
    userId: string,
    periodStartAt: string,
    periodEndAt: string,
    pagination: PaginationInput
  ): Promise<PageResult<KpiTaskDetail>>;
}

export function createKpiService(
  repository: AppRepository,
  clock: Clock
): KpiService {
  return {
    async get(actor, userId, periodStartAt, periodEndAt, pagination) {
      const { subject, ownerIds } = await resolveKpiSubject(
        repository,
        actor,
        userId,
        periodStartAt,
        periodEndAt
      );
      const storedTasks = await repository.listKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt,
        MAX_KPI_TASKS + 1
      );
      const tasks = await enrichKpiTasks(
        repository,
        storedTasks,
        periodStartAt,
        periodEndAt
      );
      const now = clock();
      const result = calculateKpi({
        tasks,
        periodStartAt,
        periodEndAt,
        now
      });
      const recentEvents = await repository.listRecentTaskEvents(
        storedTasks.map((task) => task.id),
        5
      );
      const storedTaskPage = await repository.pageKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt,
        pagination
      );
      const taskItems = await Promise.all(
        storedTaskPage.items.map(async (task) => ({
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          status: task.status,
          progress: task.progress,
          currentDeadlineAt: task.currentDeadlineAt,
          plannedEffort: task.plannedEffort,
          risk: calculateTaskRisk(task, now),
          events: await repository.pageTaskEvents(task.id, {
            limit: 20,
            offset: 0
          }, "desc")
        }))
      );

      return {
        userId: subject.id,
        periodStartAt,
        periodEndAt,
        score: result.score,
        components: result.components,
        aggregates: aggregateKpi(storedTasks, recentEvents, now),
        tasks: {
          items: taskItems,
          total: storedTaskPage.total
        }
      };
    },

    async listTasks(actor, userId, periodStartAt, periodEndAt, pagination) {
      const { ownerIds } = await resolveKpiSubject(
        repository,
        actor,
        userId,
        periodStartAt,
        periodEndAt
      );
      const page = await repository.pageKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt,
        pagination
      );
      const now = clock();
      return {
        items: page.items.map((task) => toTaskDetail(task, now)),
        total: page.total
      };
    }
  };
}

async function resolveKpiSubject(
  repository: AppRepository,
  actor: PublicUser,
  userId: string,
  periodStartAt: string,
  periodEndAt: string
) {
  if (actor.role === "client") forbidden();
  assertKpiPeriod(periodStartAt, periodEndAt);
  const subject = await requireUser(repository, userId);
  if (subject.role === "designer") {
    await assertDesignerRelationship(repository, actor, userId);
  } else if (!(actor.role === "design_head" && subject.role === "design_manager")) {
    forbidden();
  }
  const ownerIds =
    subject.role === "design_manager"
      ? await managerDesignerIds(repository, subject.id)
      : [subject.id];
  return { subject, ownerIds };
}

async function managerDesignerIds(
  repository: AppRepository,
  managerId: string
): Promise<string[]> {
  const page = await repository.pageDesignersForManager(managerId, {
    limit: MAX_KPI_TASKS + 1,
    offset: 0
  });
  if (page.total > MAX_KPI_TASKS) {
    throw new ApiError(
      422,
      "KPI_SUBJECT_LIMIT_EXCEEDED",
      `KPI reports support at most ${MAX_KPI_TASKS} designers per manager.`
    );
  }
  return page.items.map((designer) => designer.id);
}

function toTaskDetail(task: TaskRecord, now: Date): KpiTaskDetail {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    progress: task.progress,
    currentDeadlineAt: task.currentDeadlineAt,
    plannedEffort: task.plannedEffort,
    risk: calculateTaskRisk(task, now)
  };
}

function emptyRiskCounts(): RiskCounts {
  return { gray: 0, green: 0, yellow: 0, red: 0 };
}

function aggregateKpi(
  tasks: TaskRecord[],
  recentEvents: TaskEventRecord[],
  now: Date
): KpiAggregates {
  const riskCounts = emptyRiskCounts();
  const projects = new Map<
    string,
    {
      projectId: string;
      totalTasks: number;
      completedTasks: number;
      progress: number;
      riskCounts: RiskCounts;
    }
  >();
  let planned = 0;
  let completedEffort = 0;
  let completedTasks = 0;

  for (const task of tasks) {
    const risk = calculateTaskRisk(task, now);
    riskCounts[risk.level] += 1;
    planned += task.plannedEffort ?? 0;
    if (task.status === "completed") {
      completedTasks += 1;
      completedEffort += task.plannedEffort ?? 0;
    }
    const project = projects.get(task.projectId) ?? {
      projectId: task.projectId,
      totalTasks: 0,
      completedTasks: 0,
      progress: 0,
      riskCounts: emptyRiskCounts()
    };
    project.totalTasks += 1;
    if (task.status === "completed") project.completedTasks += 1;
    project.riskCounts[risk.level] += 1;
    projects.set(task.projectId, project);
  }

  const remaining = planned - completedEffort;
  return {
    taskCounts: {
      total: tasks.length,
      completed: completedTasks,
      active: tasks.length - completedTasks
    },
    riskCounts,
    effort: {
      planned,
      completed: completedEffort,
      remaining,
      workloadPercentage: planned ? Math.round((remaining / planned) * 100) : 0
    },
    projects: [...projects.values()].map((project) => ({
      ...project,
      progress: project.totalTasks
        ? Math.round((project.completedTasks / project.totalTasks) * 100)
        : 0
    })),
    recentActivity: recentEvents.flatMap((event) => {
      const task = tasks.find((candidate) => candidate.id === event.taskId);
      return task
        ? [{
            taskId: task.id,
            projectId: task.projectId,
            taskTitle: task.title,
            event
          }]
        : [];
    })
  };
}
