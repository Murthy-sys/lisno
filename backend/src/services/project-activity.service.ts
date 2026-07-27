import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  AuditEventRecord,
  PageResult,
  PaginationInput
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { forbidden, requireAccessibleProject } from "./workflow.js";

const MAX_PROJECT_TASKS = 1_000;
const MAX_PROJECT_VERSIONS = 5_000;

export interface ProjectActivityService {
  list(
    actor: PublicUser,
    projectId: string,
    pagination: PaginationInput
  ): Promise<PageResult<AuditEventRecord>>;
}

export function createProjectActivityService(
  repository: AppRepository
): ProjectActivityService {
  return {
    async list(actor, projectId, pagination) {
      if (
        actor.role !== "design_manager" &&
        actor.role !== "design_head"
      ) {
        forbidden();
      }
      const project = await requireAccessibleProject(
        repository,
        actor,
        projectId
      );
      const [tasks, versions] = await Promise.all([
        repository.listTasksForProjectIds(
          [project.id],
          MAX_PROJECT_TASKS + 1
        ),
        repository.listDesignVersions(
          project.id,
          MAX_PROJECT_VERSIONS + 1
        )
      ]);
      if (
        tasks.length > MAX_PROJECT_TASKS ||
        versions.length > MAX_PROJECT_VERSIONS
      ) {
        throw new ApiError(
          422,
          "PROJECT_ACTIVITY_LIMIT_EXCEEDED",
          "Project activity is too large to inspect safely."
        );
      }
      return repository.pageAuditEvents(
        {
          entityIds: [
            project.id,
            ...tasks.map((task) => task.id),
            ...versions.map((version) => version.id)
          ],
          sort: "desc"
        },
        pagination
      );
    }
  };
}
