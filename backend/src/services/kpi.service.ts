import { ApiError } from "../middleware/errors.js";
import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import type { AppRepository, TaskRecord } from "../repositories/types.js";
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
  tasks: Array<{
    id: string;
    projectId: string;
    title: string;
    status: TaskRecord["status"];
    progress: number;
    currentDeadlineAt: string;
    plannedEffort: number | null;
    risk: ReturnType<typeof calculateTaskRisk>;
  }>;
}

export interface KpiService {
  get(
    actor: PublicUser,
    userId: string,
    periodStartAt: string,
    periodEndAt: string
  ): Promise<KpiRead>;
}

export function createKpiService(
  repository: AppRepository,
  clock: Clock
): KpiService {
  return {
    async get(actor, userId, periodStartAt, periodEndAt) {
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
      const storedTasks = (
        await Promise.all(
          ownerIds.map((ownerId) => repository.listTasks({ ownerId }))
        )
      ).flat();
      const tasks = await Promise.all(
        storedTasks.map(async (task) => {
          const events = await repository.listTaskEvents(task.id);
          return {
            ...task,
            updateEvents: events
              .filter(
                (event) =>
                  event.actorId === task.ownerId &&
                  (event.type === "status_changed" ||
                    event.type === "progress_changed" ||
                    event.type === "note_added")
              )
              .map((event) => ({ occurredAt: event.occurredAt }))
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

      return {
        userId: subject.id,
        periodStartAt,
        periodEndAt,
        score: result.score,
        components: result.components,
        tasks: storedTasks
          .filter((task) => overlaps(task, periodStartAt, periodEndAt))
          .map((task) => ({
            id: task.id,
            projectId: task.projectId,
            title: task.title,
            status: task.status,
            progress: task.progress,
            currentDeadlineAt: task.currentDeadlineAt,
            plannedEffort: task.plannedEffort,
            risk: calculateTaskRisk(task, now)
          }))
      };
    }
  };
}

function overlaps(task: TaskRecord, from: string, to: string) {
  const periodStart = new Date(from).getTime();
  const periodEnd = new Date(to).getTime();
  const taskStart = new Date(task.plannedStartAt).getTime();
  const taskEnd = new Date(task.currentDeadlineAt).getTime();
  const completion = task.completedAt
    ? new Date(task.completedAt).getTime()
    : undefined;
  return (
    (taskStart <= periodEnd && taskEnd >= periodStart) ||
    (completion !== undefined &&
      completion >= periodStart &&
      completion <= periodEnd)
  );
}
