import { z } from "zod";
import type { DesignerKeyCollectionReminderItem, DesignerKeyCollectionReminderPage } from "../contracts/designer-assignment.js";
import { ApiError } from "../middleware/errors.js";
import type { AppRepository } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { readPendingKeyCollectionAppointment } from "./designer-handoff.service.js";
import { requireActor, systemClock, type Clock } from "./workflow.js";

export const keyCollectionRemindersQuerySchema = z.object({
  status: z.enum(["urgent", "pending"]).default("urgent"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
}).strict();

export interface KeyCollectionRemindersService {
  list(actor: PublicUser, query: unknown): Promise<DesignerKeyCollectionReminderPage>;
}

export function createKeyCollectionRemindersService(repository: AppRepository, clock: Clock = systemClock): KeyCollectionRemindersService {
  return {
    async list(actor, input) {
      const query = keyCollectionRemindersQuerySchema.safeParse(input);
      if (!query.success) throw new ApiError(400, "VALIDATION_ERROR", "Choose valid reminder pagination and status.");
      if (actor.role !== "designer") throw new ApiError(403, "FORBIDDEN", "Key collection reminders are personal to the assigned Designer.");
      return repository.runInTransaction(async tx => {
        const user = await requireActor(tx, actor);
        if (user.deletedAt) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
        const now = clock();
        const pending: DesignerKeyCollectionReminderItem[] = [];
        const candidatePageSize = 100;
        for (let offset = 0; ; offset += candidatePageSize) {
          const page = await tx.pageProjectsForUserRead(user, { offset, limit: candidatePageSize });
          for (const project of page.items) {
            if (project.status === "completed" || (project.primaryDesignerId
              ? project.primaryDesignerId !== user.id : !project.assignedDesignerIds.includes(user.id))) continue;
            const obligation = await readPendingKeyCollectionAppointment(tx, project, now);
            if (!obligation || obligation.designer.id !== user.id) continue;
            pending.push({ projectId: project.id, projectName: project.name, stageId: obligation.stageId,
              appointment: obligation.appointment, blockers: obligation.blockers });
          }
          if (!page.items.length || offset + page.items.length >= page.total) break;
        }
        pending.sort((a, b) => Date.parse(a.appointment.deadlineAt) - Date.parse(b.appointment.deadlineAt) || a.projectId.localeCompare(b.projectId));
        const urgent = pending.filter(item => item.appointment.timing?.zone === "red");
        const futureRed = pending.flatMap(item => {
          const redAt = item.appointment.timing!.redAt;
          return Date.parse(redAt) > now.getTime() ? [redAt] : [];
        }).sort((a, b) => Date.parse(a) - Date.parse(b));
        const allItems = query.data.status === "urgent" ? urgent : pending;
        const { offset, limit } = query.data;
        return { serverNow: now.toISOString(), urgentCount: urgent.length, nextRedAt: futureRed[0] ?? null,
          items: allItems.slice(offset, offset + limit),
          pagination: { limit, offset, total: allItems.length, hasMore: offset + limit < allItems.length } };
      });
    }
  };
}
