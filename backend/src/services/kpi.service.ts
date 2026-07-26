import { ApiError } from "../middleware/errors.js";
import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import type {
  AppRepository,
  PageResult,
  PaginationInput,
  TaskEventRecord,
  TaskRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
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
  tasks: PageResult<{
    id: string;
    projectId: string;
    title: string;
    status: TaskRecord["status"];
    progress: number;
    currentDeadlineAt: string;
    plannedEffort: number | null;
    risk: ReturnType<typeof calculateTaskRisk>;
    events: PageResult<TaskEventRecord>;
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
}

export function createKpiService(
  repository: AppRepository,
  clock: Clock
): KpiService {
  return {
    async get(actor, userId, periodStartAt, periodEndAt, pagination) {
      if (actor.role === "client") forbidden();
      const subject = await requireUser(repository, userId);
      if (subject.role === "designer") {
        await assertDesignerRelationship(repository, actor, userId);
      } else if (!(actor.role === "design_head" && subject.role === "design_manager")) {
        forbidden();
      }
      if (new Date(periodStartAt) > new Date(periodEndAt)) {
        throw new ApiError(
          400,
          "INVALID_DATE_RANGE",
          "The KPI period start must not follow its end.",
          { to: "The KPI period end must not precede its start." }
        );
      }

      const ownerIds =
        subject.role === "design_manager"
          ? (await repository.listUsers())
              .filter(
                (user) =>
                  user.active &&
                  user.role === "designer" &&
                  user.managerId === subject.id
              )
              .map((user) => user.id)
          : [subject.id];
      const storedTasks = await repository.listKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt
      );
      const tasks = await Promise.all(
        storedTasks.map(async (task) => {
          const events = await repository.listKpiTaskEventsForPeriod(
            task.id,
            task.ownerId,
            periodStartAt,
            periodEndAt
          );
          return {
            ...task,
            updateEvents: events.map((event) => ({
              occurredAt: event.occurredAt
            }))
          };
        })
      );
      const now = clock();
      const result = calculateKpi({
        tasks,
        periodStartAt,
        periodEndAt,
        now
      });
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
        tasks: {
          items: taskItems,
          total: storedTaskPage.total
        }
      };
    }
  };
}
