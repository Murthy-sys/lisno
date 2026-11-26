import { z } from "zod";
import {
  WORKFLOW_TIMELINES_ID, WORKFLOW_TIMELINE_BANDS, WORKFLOW_TIMELINE_MIN_DAYS, WORKFLOW_TIMELINE_MAX_DAYS,
  calculateWorkflowTimelines, defaultWorkflowTimelines,
  type UpdateWorkflowTimelines, type WorkflowTimelineConfiguration
} from "../contracts/workflow-timelines.js";
import { ApiError } from "../middleware/errors.js";
import { RepositoryConflictError, type AppRepository, type UserRecord } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { forbidden, type Clock } from "./workflow.js";

const days = z.number().int().min(WORKFLOW_TIMELINE_MIN_DAYS).max(WORKFLOW_TIMELINE_MAX_DAYS);
const bandIds = WORKFLOW_TIMELINE_BANDS.map(band => band.id) as [typeof WORKFLOW_TIMELINE_BANDS[number]["id"], ...Array<typeof WORKFLOW_TIMELINE_BANDS[number]["id"]>];
export const updateWorkflowTimelinesSchema = z.object({
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  bases: z.array(z.object({ bandId: z.enum(bandIds), designWorkdays: days, executionWorkdays: days }).strict())
    .length(WORKFLOW_TIMELINE_BANDS.length)
    .refine(rows => new Set(rows.map(row => row.bandId)).size === WORKFLOW_TIMELINE_BANDS.length, "Provide every project-value band exactly once.")
}).strict();

export interface WorkflowTimelinesService {
  read(actor: PublicUser): Promise<WorkflowTimelineConfiguration>;
  update(actor: PublicUser, input: UpdateWorkflowTimelines): Promise<WorkflowTimelineConfiguration>;
}

async function currentActor(repository: AppRepository, actor: PublicUser): Promise<UserRecord> {
  const stored = await repository.findUserById(actor.id);
  if (!stored || !stored.active || stored.deletedAt || stored.role !== actor.role) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (stored.role !== "super_admin" || await repository.countActiveUsersByRole("super_admin") !== 1) forbidden();
  return stored;
}

function versionConflict(): ApiError {
  return new ApiError(409, "WORKFLOW_TIMELINES_VERSION_CONFLICT", "Timeline configuration changed. Reload the latest values before saving again.");
}

async function readConfiguration(repository: AppRepository): Promise<WorkflowTimelineConfiguration> {
  const record = await repository.findWorkflowTimelineConfiguration();
  return record ? { ...record, matrices: calculateWorkflowTimelines(record.bases) } : defaultWorkflowTimelines();
}

export function createWorkflowTimelinesService(repository: AppRepository, audit: AuditService, clock: Clock): WorkflowTimelinesService {
  return {
    async read(actor) {
      await currentActor(repository, actor);
      return readConfiguration(repository);
    },
    async update(actor, input) {
      try {
        return await repository.runInTransaction(async transaction => {
          await transaction.coordinateAuthorizationMutation();
          const storedActor = await currentActor(transaction, actor);
          const parsed = updateWorkflowTimelinesSchema.safeParse(input);
          if (!parsed.success) {
            const fields: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
              if (issue.code === "unrecognized_keys") for (const key of issue.keys) fields[key] = `Unrecognized field: ${key}.`;
              else fields[issue.path.join(".") || "configuration"] = issue.message;
            }
            throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", fields);
          }
          const previous = await transaction.findWorkflowTimelineConfiguration();
          if ((previous?.version ?? 0) !== parsed.data.expectedVersion) throw versionConflict();
          const bases = WORKFLOW_TIMELINE_BANDS.map(band => parsed.data.bases.find(row => row.bandId === band.id)!);
          const version = parsed.data.expectedVersion + 1;
          const occurredAt = clock().toISOString();
          const record = await transaction.saveWorkflowTimelineConfiguration({
            version, bases, updatedById: storedActor.id, updatedAt: occurredAt, createdAt: previous?.createdAt ?? occurredAt
          }, parsed.data.expectedVersion);
          await audit.append({
            actorId: storedActor.id, action: "workflow_timelines_updated", entityType: "workflow_timelines",
            entityId: WORKFLOW_TIMELINES_ID, occurredAt,
            oldValues: { version: previous?.version ?? 0, bases: previous?.bases ?? defaultWorkflowTimelines().bases },
            newValues: { version, bases }
          }, transaction);
          return { ...record, matrices: calculateWorkflowTimelines(record.bases) };
        });
      } catch (error) {
        if (error instanceof RepositoryConflictError) throw versionConflict();
        throw error;
      }
    }
  };
}
