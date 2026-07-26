import type {
  AppRepository,
  AuditEventRecord,
  AuditFilters,
  JsonObject,
  PageResult,
  PaginationInput
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
  list(
    actor: PublicUser,
    filters: AuditFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AuditEventRecord>>;
  listForDesigner(
    actor: PublicUser,
    designerId: string,
    pagination: PaginationInput,
    sort?: "asc" | "desc"
  ): Promise<PageResult<AuditEventRecord>>;
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

    async list(actor, filters, pagination) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      if (actor.role === "design_head") {
        return repository.pageAuditEvents(filters, pagination);
      }

      if (actor.role === "designer") {
        if (filters.actorId && filters.actorId !== actor.id) {
          return { items: [], total: 0 };
        }
        return repository.pageAuditEvents(
          { ...filters, actorId: actor.id },
          pagination
        );
      }

      const users = await repository.listUsers();
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
      return repository.pageAuditEvents(
        {
          ...filters,
          visibleActorIds: [actor.id, ...directDesignerIds],
          visibleTaskIds: [...visibleTaskIds]
        },
        pagination
      );
    },

    async listForDesigner(actor, designerId, pagination, sort) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      const users = await repository.listUsers();
      const designer = users.find((user) => user.id === designerId && user.role === "designer");
      if (!designer) forbidden();
      if (actor.role === "design_manager" && designer.managerId !== actor.id) forbidden();
      if (actor.role === "designer" && actor.id !== designer.id) forbidden();
      const taskIds = (await repository.listTasks({ ownerId: designer.id })).map((task) => task.id);
      return repository.pageAuditEvents(
        { entityType: "task", entityIds: taskIds, visibleActorIds: actor.role === "design_head" ? undefined : [actor.id, designer.id], visibleTaskIds: taskIds, sort },
        pagination
      );
    }
  };
}
