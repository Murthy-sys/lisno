import { calculateKpi } from "../domain/kpi.js";
import { calculateTaskRisk } from "../domain/risk.js";
import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  ManagerTreeDesigner,
  ManagerTreeNode,
  PageResult,
  PaginationInput,
  ProjectRecord,
  TaskRecord,
  UserRecord
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { enrichKpiTasks } from "./kpi-enrichment.service.js";
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

export type OrganizationTreeNode = Omit<
  ManagerTreeNode,
  "designerTotal" | "designers"
> & {
  designers: {
    items: Array<
      ManagerTreeDesigner & { summary: Omit<DesignerSummary, "user"> }
    >;
    pagination: PaginationInput & { total: number; hasMore: boolean };
  };
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
  managerDesigners(
    actor: PublicUser,
    managerId: string,
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
  const MAX_NESTED_DESIGNERS = 20;
  const MAX_SUMMARY_RECORDS = 1_000;
  const buildSummaries = async (
    designers: UserRecord[]
  ): Promise<DesignerSummary[]> => {
    if (designers.length === 0) return [];
    const designerIds = designers.map((designer) => designer.id);
    const relevantProjects = await repository.listProjectsForDesignerIds(
      designerIds,
      MAX_SUMMARY_RECORDS + 1
    );
    const [ownerTasks, projectTasks, evaluations] = await Promise.all([
      repository.listTasksForOwnerIds(designerIds, MAX_SUMMARY_RECORDS + 1),
      repository.listTasksForProjectIds(
        [...new Set(relevantProjects.map((project) => project.id))],
        MAX_SUMMARY_RECORDS + 1
      ),
      repository.listEvaluationsForSubjectIds(
        designerIds,
        MAX_SUMMARY_RECORDS + 1
      )
    ]);
    if (
      relevantProjects.length > MAX_SUMMARY_RECORDS ||
      ownerTasks.length > MAX_SUMMARY_RECORDS ||
      projectTasks.length > MAX_SUMMARY_RECORDS ||
      evaluations.length > MAX_SUMMARY_RECORDS
    ) {
      throw new ApiError(
        422,
        "SUMMARY_LIMIT_EXCEEDED",
        `Hierarchy summaries support at most ${MAX_SUMMARY_RECORDS} records per bounded page.`
      );
    }
    const now = clock();
    const period = kpiPeriod(ownerTasks, now);
    const enrichedTasks = await enrichKpiTasks(
      repository,
      ownerTasks,
      period.periodStartAt,
      period.periodEndAt
    );

    return designers.map((designer) => {
      const tasks = enrichedTasks.filter(
        (task) => task.ownerId === designer.id
      );
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
        kpi: calculateKpiSnapshot(tasks, now),
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
    });
  };

  return {
    async team(actor, pagination) {
      await requireActor(repository, actor);
      if (actor.role !== "design_manager") forbidden();
      const page = await repository.pageDesignersForManager(
        actor.id,
        pagination
      );
      const summaries = await buildSummaries(page.items);
      return {
        total: page.total,
        items: summaries
      };
    },

    async managerDesigners(actor, managerId, pagination) {
      await requireActor(repository, actor);
      if (actor.role !== "design_head") forbidden();
      const page = await repository.pageDesignersForManager(
        managerId,
        pagination
      );
      return {
        total: page.total,
        items: await buildSummaries(page.items)
      };
    },

    async tree(actor, pagination) {
      await requireActor(repository, actor);
      if (actor.role !== "design_head") forbidden();
      const page = await repository.pageOrganizationManagers(pagination);
      const firstPageDesigners = page.items.flatMap((manager) =>
        manager.designers.slice(0, MAX_NESTED_DESIGNERS)
      );
      const designerIds = new Set(
        firstPageDesigners.map((designer) => designer.id)
      );
      const users = await repository.listUsersByIds([...designerIds]);
      const summaries = await buildSummaries(users);
      const now = clock();
      const nodes = page.items.map((manager) => {
        const {
          designerTotal,
          designers: nestedDesigners,
          ...managerRead
        } = manager;
        const designerItems = nestedDesigners
          .slice(0, MAX_NESTED_DESIGNERS)
          .map((designer) => {
            const summary = summaries.find(
              (candidate) => candidate.user.id === designer.id
            )!;
            const { user: _user, ...withoutUser } = summary;
            return { ...designer, summary: withoutUser };
          });
        const teamTasks = designerItems.flatMap(
          (designer) => designer.summary.tasks
        );
        return {
          ...managerRead,
          designers: {
            items: designerItems,
            pagination: {
              limit: MAX_NESTED_DESIGNERS,
              offset: 0,
              total: designerTotal,
              hasMore: designerTotal > MAX_NESTED_DESIGNERS
            }
          },
          summary: {
            teamKpi: calculateKpiSnapshot(teamTasks, now),
            workload: designerItems.reduce(
              (total, designer) => total + designer.summary.workload,
              0
            ),
            redCount: designerItems.reduce(
              (total, designer) => total + designer.summary.overdueCount,
              0
            ),
            yellowCount: designerItems.reduce(
              (total, designer) => total + designer.summary.yellowRiskCount,
              0
            ),
            evaluationCoverage:
              designerItems.length === 0
                ? 0
                : Math.round(
                    (designerItems.filter(
                      (designer) => !designer.summary.pendingEvaluation
                    ).length /
                      designerItems.length) *
                      1000
                  ) / 10
          }
        };
      });
      return { items: nodes, total: page.total };
    },

    async designerSummary(actor, designerId) {
      await requireActor(repository, actor);
      const designer = await assertDesignerRelationship(
        repository,
        actor,
        designerId
      );
      return (await buildSummaries([designer]))[0]!;
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

function calculateKpiSnapshot(tasks: TaskRecord[], now: Date) {
  const period = kpiPeriod(tasks, now);
  return calculateKpi({
    tasks,
    ...period,
    now
  });
}

function kpiPeriod(tasks: TaskRecord[], now: Date) {
  const endAt =
    tasks.length === 0
      ? now.toISOString()
      : tasks.reduce(
          (latest, task) =>
            task.currentDeadlineAt > latest ? task.currentDeadlineAt : latest,
          tasks[0]!.currentDeadlineAt
        );
  const minimumStart = new Date(
    new Date(endAt).getTime() - 366 * 24 * 60 * 60 * 1_000
  ).toISOString();
  return {
    periodStartAt:
      tasks.length === 0
        ? now.toISOString()
        : [minimumStart, tasks.reduce(
            (earliest, task) =>
              task.plannedStartAt < earliest ? task.plannedStartAt : earliest,
            tasks[0]!.plannedStartAt
          )].sort().at(-1)!,
    periodEndAt: endAt
  };
}
