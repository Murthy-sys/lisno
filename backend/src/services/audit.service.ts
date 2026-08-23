import type {
  AppRepository,
  AuditEventRecord,
  AuditFilters,
  JsonObject,
  PageResult,
  PaginationInput
} from "../repositories/types.js";
import type { ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import type { AuditAction } from "../domain/audit-actions.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import type { PublicUser } from "./auth.service.js";
import { forbidden, requireActor, requireUser } from "./workflow.js";

export interface AuditWrite {
  actorId: string;
  action: AuditAction;
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
  appendInMongoTransaction(
    input: AuditWrite,
    session: ClientSession
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
        oldValues: sanitizeAuditObject(input.oldValues ?? {}),
        newValues: sanitizeAuditObject(input.newValues ?? {}),
        reason: input.reason ?? null
      });
    },

    async appendInMongoTransaction(input, session) {
      const [document] = await AuditEventModel.create(
        [{
          _id: `audit-${randomUUID()}`,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          occurredAt: input.occurredAt,
          oldValues: sanitizeAuditObject(input.oldValues ?? {}),
          newValues: sanitizeAuditObject(input.newValues ?? {}),
          reason: input.reason ?? null
        }],
        { session }
      );
      if (!document) throw new Error("Audit event transaction did not complete.");
      const value = document.toObject() as Record<string, unknown>;
      return {
        ...value,
        id: String(value._id)
      } as unknown as AuditEventRecord;
    },

    async list(actor, filters, pagination) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      if (actor.role === "super_admin" || actor.role === "design_head") {
        return sanitizeAuditPage(
          await repository.pageAuditEvents(filters, pagination)
        );
      }

      if (actor.role === "designer") {
        if (filters.actorId && filters.actorId !== actor.id) {
          return { items: [], total: 0 };
        }
        return sanitizeAuditPage(await repository.pageAuditEvents(
          { ...filters, actorId: actor.id },
          pagination
        ));
      }

      if (actor.role !== "design_manager") forbidden();

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
      return sanitizeAuditPage(await repository.pageAuditEvents(
        {
          ...filters,
          visibleActorIds: [actor.id, ...directDesignerIds],
          visibleTaskIds: [...visibleTaskIds]
        },
        pagination
      ));
    },

    async listForDesigner(actor, designerId, pagination, sort) {
      await requireActor(repository, actor);
      if (actor.role === "client") forbidden();
      const designer = await requireUser(repository, designerId);
      if (!designer) forbidden();
      if (designer.role !== "designer") forbidden();
      if (
        actor.role !== "super_admin" &&
        actor.role !== "design_head" &&
        actor.role !== "design_manager" &&
        actor.role !== "designer"
      ) forbidden();
      if (actor.role === "design_manager" && designer.managerId !== actor.id) forbidden();
      if (actor.role === "designer" && actor.id !== designer.id) forbidden();
      const taskIds = (await repository.listTasks({ ownerId: designer.id })).map((task) => task.id);
      return sanitizeAuditPage(await repository.pageAuditEvents(
        {
          entityType: "task",
          entityIds: taskIds,
          visibleActorIds:
            actor.role === "super_admin" || actor.role === "design_head"
              ? undefined
              : [actor.id, designer.id],
          visibleTaskIds: taskIds,
          sort
        },
        pagination
      ));
    }
  };
}

export function sanitizeAuditPage(
  page: PageResult<AuditEventRecord>
): PageResult<AuditEventRecord> {
  return {
    ...page,
    items: page.items.map((event) => ({
      ...event,
      oldValues: sanitizeAuditObject(event.oldValues),
      newValues: sanitizeAuditObject(event.newValues)
    }))
  };
}

function sanitizeAuditObject(value: JsonObject): JsonObject {
  return sanitizeAuditValue(value) as JsonObject;
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, nested]) => !isSensitiveAuditKey(key, nested))
      .map(([key, nested]) => [key, sanitizeAuditValue(nested)])
  );
}

function isSensitiveAuditKey(key: string, value: unknown): boolean {
  const normalized = key
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (
    normalized === "tokengeneration" &&
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  ) {
    return false;
  }
  return ["password", "hash", "token", "secret"].some((part) =>
    normalized.includes(part)
  );
}
