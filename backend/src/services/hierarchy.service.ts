import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import type {
  AppRepository,
  ManagerTreeDesigner,
  ManagerTreeNode,
  PageResult,
  PaginationInput,
  ProjectRecord,
  TaskEventRecord,
  TaskRecord,
  UserRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { deriveProjectRead } from "./project.service.js";
import {
  assertDesignerRelationship,
  forbidden,
  requireActor,
  type Clock
} from "./workflow.js";

export interface DesignerSummary {
  user: ManagerTreeDesigner;
  activeProjectCount: number;
  kpi: ReturnType<typeof calculateKpi>;
  workload: number;
  overdueCount: number;
  yellowRiskCount: number;
  pendingEvaluation: boolean;
  projects: Array<ProjectRecord & { progress: number }>;
  tasks: Array<TaskRecord & { risk: ReturnType<typeof calculateTaskRisk> }>;
}

export type OrganizationTreeNode = Omit<ManagerTreeNode, "designers"> & {
  designers: Array<ManagerTreeDesigner & { summary: Omit<DesignerSummary, "user"> }>;
  summary: {
    teamKpi: ReturnType<typeof calculateKpi>;
    workload: number;
    redCount: number;
    yellowCount: number;
    evaluationCoverage: number;
  };
};

export interface HierarchyService {
  tree(
    actor: PublicUser,
    pagination: PaginationInput
  ): Promise<PageResult<OrganizationTreeNode>>;
  team(
    actor: PublicUser,
    pagination: PaginationInput
  ): Promise<PageResult<DesignerSummary>>;
  designerSummary(
    actor: PublicUser,
    designerId: string
  ): Promise<DesignerSummary>;
}

export function createHierarchyService(
  repository: AppRepository,
  clock: Clock
): HierarchyService {
  const buildSummaries = async (
    actorRecord: UserRecord,
    designers: UserRecord[]
  ): Promise<{
    summaries: DesignerSummary[];
    events: TaskEventRecord[];
  }> => {
    if (designers.length === 0) return { summaries: [], events: [] };
    const designerIds = designers.map((designer) => designer.id);
    const visibleProjects = await repository.listProjectsForUser(actorRecord);
    const relevantProjects = visibleProjects.filter((project) =>
      project.assignedDesignerIds.some((designerId) =>
        designerIds.includes(designerId)
      ) || designerIds.includes(project.initiatingDesignerId)
    );
    const [ownerTasks, projectTasks, evaluations] = await Promise.all([
      repository.listTasksForOwnerIds(designerIds),
      repository.listTasksForProjectIds(
        [...new Set(relevantProjects.map((project) => project.id))]
      ),
      repository.listEvaluationsForSubjectIds(designerIds)
    ]);
    const now = clock();
    const events = await listKpiEvents(repository, ownerTasks, now);

    return {
      events,
      summaries: designers.map((designer) => {
        const tasks = ownerTasks.filter((task) => task.ownerId === designer.id);
        const projects = relevantProjects
          .filter(
            (project) =>
              project.initiatingDesignerId === designer.id ||
              project.assignedDesignerIds.includes(designer.id)
          )
          .map((project) =>
            deriveProjectRead(
              project,
              projectTasks.filter((task) => task.projectId === project.id)
            )
          );
        const withRisk = tasks.map((task) => ({
          ...task,
          risk: calculateTaskRisk(task, now)
        }));

        return {
          user: publicDesigner(designer),
          activeProjectCount: projects.filter(
            (project) => project.status === "active"
          ).length,
          kpi: calculateKpiSnapshot(
            tasks,
            events.filter((event) => event.actorId === designer.id),
            now
          ),
          workload: tasks
            .filter((task) => task.status !== "completed")
            .reduce((total, task) => total + (task.plannedEffort ?? 0), 0),
          overdueCount: withRisk.filter((task) => task.risk.level === "red")
            .length,
          yellowRiskCount: withRisk.filter(
            (task) => task.risk.level === "yellow"
          ).length,
          pendingEvaluation: !evaluations.some(
            (evaluation) => evaluation.subjectUserId === designer.id
          ),
          projects,
          tasks: withRisk
        };
      })
    };
  };

  return {
    async team(actor, pagination) {
      const actorRecord = await requireActor(repository, actor);
      if (actor.role !== "design_manager") forbidden();
      const page = await repository.pageDesignersForManager(
        actor.id,
        pagination
      );
      const { summaries } = await buildSummaries(actorRecord, page.items);
      return {
        total: page.total,
        items: summaries
      };
    },

    async tree(actor, pagination) {
      const actorRecord = await requireActor(repository, actor);
      if (actor.role !== "design_head") forbidden();
      const page = await repository.pageOrganizationManagers(pagination);
      const designerIds = new Set(
        page.items.flatMap((manager) =>
          manager.designers.map((designer) => designer.id)
        )
      );
      const users = (await repository.listUsers()).filter((user) =>
        designerIds.has(user.id)
      );
      const { summaries, events } = await buildSummaries(actorRecord, users);
      const now = clock();
      const nodes = page.items.map((manager) => {
        const designers = manager.designers.map((designer) => {
          const summary = summaries.find(
            (candidate) => candidate.user.id === designer.id
          )!;
          const { user: _user, ...withoutUser } = summary;
          return { ...designer, summary: withoutUser };
        });
        const teamTasks = designers.flatMap(
          (designer) => designer.summary.tasks
        );
        return {
          ...manager,
          designers,
          summary: {
            teamKpi: calculateKpiSnapshot(teamTasks, events, now),
            workload: designers.reduce(
              (total, designer) => total + designer.summary.workload,
              0
            ),
            redCount: designers.reduce(
              (total, designer) => total + designer.summary.overdueCount,
              0
            ),
            yellowCount: designers.reduce(
              (total, designer) => total + designer.summary.yellowRiskCount,
              0
            ),
            evaluationCoverage:
              designers.length === 0
                ? 0
                : Math.round(
                    (designers.filter(
                      (designer) => !designer.summary.pendingEvaluation
                    ).length /
                      designers.length) *
                      1000
                  ) / 10
          }
        };
      });
      return { items: nodes, total: page.total };
    },

    async designerSummary(actor, designerId) {
      const actorRecord = await requireActor(repository, actor);
      const designer = await assertDesignerRelationship(
        repository,
        actor,
        designerId
      );
      return (await buildSummaries(actorRecord, [designer])).summaries[0]!;
    }
  };
}

function publicDesigner(designer: UserRecord): ManagerTreeDesigner {
  return {
    id: designer.id,
    name: designer.name,
    email: designer.email,
    ...(designer.avatar ? { avatar: designer.avatar } : {}),
    ...(designer.title ? { title: designer.title } : {})
  };
}

async function listKpiEvents(
  repository: AppRepository,
  tasks: TaskRecord[],
  now: Date
) {
  if (tasks.length === 0) return [];
  const period = kpiPeriod(tasks, now);
  return repository.listKpiTaskEventsForTasks(
    tasks.map((task) => ({ id: task.id, ownerId: task.ownerId })),
    period.periodStartAt,
    period.periodEndAt
  );
}

function calculateKpiSnapshot(
  tasks: TaskRecord[],
  events: TaskEventRecord[],
  now: Date
) {
  const period = kpiPeriod(tasks, now);
  return calculateKpi({
    tasks: tasks.map((task) => ({
      ...task,
      updateEvents: events
        .filter(
          (event) =>
            event.taskId === task.id &&
            event.actorId === task.ownerId &&
            event.occurredAt >= period.periodStartAt &&
            event.occurredAt <= period.periodEndAt &&
            (event.type === "status_changed" ||
              event.type === "progress_changed" ||
              event.type === "note_added")
        )
        .map((event) => ({ occurredAt: event.occurredAt }))
    })),
    ...period,
    now
  });
}

function kpiPeriod(tasks: TaskRecord[], now: Date) {
  return {
    periodStartAt:
      tasks.length === 0
        ? now.toISOString()
        : tasks.reduce(
            (earliest, task) =>
              task.plannedStartAt < earliest ? task.plannedStartAt : earliest,
            tasks[0]!.plannedStartAt
          ),
    periodEndAt:
      tasks.length === 0
        ? now.toISOString()
        : tasks.reduce(
            (latest, task) =>
              task.currentDeadlineAt > latest ? task.currentDeadlineAt : latest,
            tasks[0]!.currentDeadlineAt
          )
  };
}
