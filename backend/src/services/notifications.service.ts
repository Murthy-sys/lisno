import type { ChatActor } from "../contracts/project-chat.js";
import type { NotificationService } from "../contracts/notifications.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { chatListQuerySchema, chatNotFound, parseChatInput } from "../domain/project-chat.js";
import { notificationPage, publicNotification } from "../repositories/notifications.js";
import type { ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import { authenticatedChatUser, projectChatContext } from "./project-chat-context.js";
import { systemClock, type Clock } from "./workflow.js";
export function createNotificationService(options: {repository: ProjectChatRepository; clock?: Clock; onChange?: (recipientId: string) => void}): NotificationService {
  const clock = options.clock ?? systemClock;
  async function page(tx: ChatTransaction, actor: ChatActor, query: {limit: number; offset: number}) {
    await authenticatedChatUser(tx, actor, clock);
    const allowed: string[] = [];
    for (const projectId of await tx.notificationProjectIds(actor.id)) {
      const sources = await tx.sources(projectId);
      if (sources && resolveChatMembership(sources, await tx.selections(projectId)).participants.some(person => person.id === actor.id)) allowed.push(projectId);
    }
    return notificationPage(await tx.notificationPage(actor.id, allowed, query.limit, query.offset), query.limit, query.offset);
  }
  return {
    async list(actor, input) {
      const query = parseChatInput(chatListQuerySchema, input);
      return options.repository.snapshot(tx => page(tx, actor, query));
    },
    async read(actor, id) {
      const result = await options.repository.mutate(async tx => {
        await authenticatedChatUser(tx, actor, clock, "chat.read_state");
        const row = await tx.notification(id, actor.id);
        if (!row) chatNotFound();
        await projectChatContext(tx, actor, row.projectId, clock);
        await tx.readNotification(id, actor.id, clock().toISOString());
        return publicNotification((await tx.notification(id, actor.id))!);
      });
      options.onChange?.(actor.id);
      return result;
    },
    async deliver(actor, enqueue) {
      const snapshot = await options.repository.mutate(tx => page(tx, actor, {limit: 20, offset: 0}));
      enqueue(snapshot);
    }
  };
}
