import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import type {
  AppRepository,
  ManagerTreeDesigner,
  ManagerTreeNode,
  ProjectRecord,
  TaskRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
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
  projects: ProjectRecord[];
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
  tree(actor: PublicUser): Promise<OrganizationTreeNode[]>;
  team(actor: PublicUser): Promise<DesignerSummary[]>;
  designerSummary(
    actor: PublicUser,
    designerId: string
  ): Promise<DesignerSummary>;
}

export function createHierarchyService(
  repository: AppRepository,
  clock: Clock
): HierarchyService {
  const buildSummary = async (
    actor: PublicUser,
    designerId: string
  ): Promise<DesignerSummary> => {
    const designer = await assertDesignerRelationship(repository, actor, designerId);
    const projects = await repository.listProjectsForUser(designer);
    const tasks = await repository.listTasks({ ownerId: designer.id });
    const evaluations = await repository.listEvaluationsForSubject(designer.id);
    const now = clock();
    const withRisk = tasks.map((task) => ({ ...task, risk: calculateTaskRisk(task, now) }));

    return {
      user: {
        id: designer.id,
        name: designer.name,
        email: designer.email,
        ...(designer.avatar ? { avatar: designer.avatar } : {}),
        ...(designer.title ? { title: designer.title } : {})
      },
      activeProjectCount: projects.filter((project) => project.status === "active")
        .length,
      kpi: await calculateKpiSnapshot(repository, tasks, now),
      workload: tasks
        .filter((task) => task.status !== "completed")
        .reduce((total, task) => total + (task.plannedEffort ?? 0), 0),
      overdueCount: withRisk.filter((task) => task.risk.level === "red").length,
      yellowRiskCount: withRisk.filter((task) => task.risk.level === "yellow")
        .length,
      pendingEvaluation: evaluations.length === 0,
      projects,
      tasks: withRisk
    };
  };

  return {
    async team(actor) {
      await requireActor(repository, actor);
      if (actor.role !== "design_manager") forbidden();
      const designers = (await repository.listUsers()).filter(
        (user) =>
          user.active && user.role === "designer" && user.managerId === actor.id
      );
      return Promise.all(designers.map((designer) => buildSummary(actor, designer.id)));
    },

    async tree(actor) {
      await requireActor(repository, actor);
      if (actor.role !== "design_head") forbidden();
      const tree = await repository.getOrganizationTree();
      return Promise.all(
        tree.map(async (manager) => {
          const designers = await Promise.all(
            manager.designers.map(async (designer) => {
              const { user: _user, ...summary } = await buildSummary(
                actor,
                designer.id
              );
              return { ...designer, summary };
            })
          );
          const teamTasks = (
            await Promise.all(
              manager.designers.map((designer) =>
                repository.listTasks({ ownerId: designer.id })
              )
            )
          ).flat();
          return {
            ...manager,
            designers,
            summary: {
              teamKpi: await calculateKpiSnapshot(
                repository,
                teamTasks,
                clock()
              ),
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
        })
      );
    },

    designerSummary: buildSummary
  };
}

async function calculateKpiSnapshot(
  repository: AppRepository,
  tasks: TaskRecord[],
  now: Date
) {
  const tasksWithEvents = await Promise.all(
    tasks.map(async (task) => ({
      ...task,
      updateEvents: (await repository.listTaskEvents(task.id))
        .filter(
          (event) =>
            event.actorId === task.ownerId &&
            (event.type === "status_changed" ||
              event.type === "progress_changed" ||
              event.type === "note_added")
        )
        .map((event) => ({ occurredAt: event.occurredAt }))
    }))
  );
  const periodStartAt =
    tasks.length === 0
      ? now.toISOString()
      : tasks.reduce((earliest, task) =>
          task.plannedStartAt < earliest ? task.plannedStartAt : earliest
        , tasks[0]!.plannedStartAt);
  const periodEndAt =
    tasks.length === 0
      ? now.toISOString()
      : tasks.reduce((latest, task) =>
          task.currentDeadlineAt > latest ? task.currentDeadlineAt : latest
        , tasks[0]!.currentDeadlineAt);
  return calculateKpi({
    tasks: tasksWithEvents,
    periodStartAt,
    periodEndAt,
    now
  });
}
