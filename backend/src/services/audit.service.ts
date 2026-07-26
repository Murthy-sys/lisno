import type {
  AppRepository,
  AuditEventRecord,
  AuditFilters,
  JsonObject
} from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { forbidden, requireActor } from "./workflow.js";

export interface AuditWrite {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  oldValues?: JsonObject;
  newValues?: JsonObject;
  reason?: string | null;
}

export interface AuditService {
  append(
    input: AuditWrite,
    transactionRepository?: AppRepository
  ): Promise<AuditEventRecord>;
  list(actor: PublicUser, filters: AuditFilters): Promise<AuditEventRecord[]>;
}

export function createAuditService(repository: AppRepository): AuditService {
  return {
    append(input, transactionRepository = repository) {
      return transactionRepository.appendAuditEvent({
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: input.occurredAt,
        oldValues: input.oldValues ?? {},
        newValues: input.newValues ?? {},
        reason: input.reason ?? null
      });
    },

    async list(actor, filters) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      const events = await repository.listAuditEvents(filters);
      if (actor.role === "design_head") return events;

      const users = await repository.listUsers();
      if (actor.role === "designer") {
        return events.filter((event) => event.actorId === actor.id);
      }

      const directDesignerIds = new Set(
        users
          .filter(
            (user) => user.role === "designer" && user.managerId === actor.id
          )
          .map((user) => user.id)
      );
      const visibleTaskIds = new Set(
        (
          await Promise.all(
            [...directDesignerIds].map((ownerId) =>
              repository.listTasks({ ownerId })
            )
          )
        )
          .flat()
          .map((task) => task.id)
      );
      return events.filter(
        (event) =>
          event.actorId === actor.id ||
          directDesignerIds.has(event.actorId) ||
          (event.entityType === "task" && visibleTaskIds.has(event.entityId))
      );
    }
  };
}
