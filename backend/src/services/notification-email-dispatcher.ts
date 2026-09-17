import { MailDeliveryError } from "./smtp-transport.js";
import { randomUUID } from "node:crypto";
import { isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import { hasPermission } from "../domain/authorization.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import type { NotificationEmail } from "../repositories/notifications.js";
import type { ProjectChatRepository } from "../repositories/project-chat.js";
import type { ChatMentionEmailInput, ChatMentionMailer } from "./chat-mention-mailer.js";
import { systemClock, type Clock } from "./workflow.js";

/** Local deduplication cannot guarantee exactly-once remote acceptance across a crash. */
export function createNotificationEmailDispatcher(options: {
  repository: ProjectChatRepository;
  mailer: ChatMentionMailer;
  clock?: Clock;
  allowDemoAccountExternalEmail?: boolean;
  intervalMs?: number;
}) {
  const clock = options.clock ?? systemClock;
  // The production transports close/timeout within the configured maximum of ten minutes.
  // A fifteen-minute lease prevents another worker starting while that attempt is live.
  const maxAttempts = 4;
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  async function runBatch() {
    for (let count = 0; count < 25 && !stopped; count++) {
      const token = randomUUID();
      const row = await options.repository.mutate(tx => tx.claimNotificationEmail(clock().toISOString(), new Date(clock().getTime() + 900_000).toISOString(), token));
      if (!row) return;
      const finish = async (status: NotificationEmail["status"], failureCode: string | null = null) => {
        const now = clock();
        await options.repository.mutate(tx => tx.settleNotificationEmail(row.id, token, now.toISOString(), {
          ...row.email, status, leaseToken: null, leaseExpiresAt: null,
          deliveredAt: status === "sent" ? now.toISOString() : null,
          nextAttemptAt: status === "pending" ? new Date(now.getTime() + 30_000 * 2 ** (row.email.attempts - 1)).toISOString() : null,
          failureCode
        }));
      };
      if (row.email.attempts > maxAttempts) { await finish("failed", "DELIVERY_ATTEMPTS_EXHAUSTED"); continue; }
      if (options.mailer.deliveryKind === "disabled") { await finish("disabled", "EMAIL_DISABLED"); continue; }
      const mailer = options.mailer;
      // Re-read recipient address, account, membership and lease immediately before
      // dispatch. External sends must never occur in a retried Mongo transaction.
      let input: ChatMentionEmailInput | undefined;
      let suppression = "RECIPIENT_UNAVAILABLE";
      await options.repository.snapshot(async tx => {
        input = undefined;
        const current = await tx.notification(row.id, row.recipientId);
        if (!current || current.email.leaseToken !== token || current.email.leaseExpiresAt! <= clock().toISOString()) return;
        const user = await tx.app.findUserById(row.recipientId);
        if (!user?.active || !hasPermission(user.role, "chat.read")) return;
        const sources = await tx.sources(row.projectId);
        if (!sources || !resolveChatMembership(sources, await tx.selections(row.projectId)).participants.some(person => person.id === user.id)) return;
        const actor = await tx.app.findUserById(row.actor.id);
        if (mailer.deliveryKind === "external" && !options.allowDemoAccountExternalEmail && (isReservedDevelopmentDemoIdentity(user) || (actor && isReservedDevelopmentDemoIdentity(actor)))) {
          suppression = "DEMO_EXTERNAL_DELIVERY_BLOCKED"; return;
        }
        input = {notificationId: row.id, recipient: {name: user.name, email: user.email}, actorName: row.actor.name, projectName: row.projectName, projectId: row.projectId, messageId: row.messageId, excerpt: row.excerpt, kind: row.type};
      });
      if (!input) { await finish("suppressed", suppression); continue; }
      let failure: string | null = null;
      try { await mailer.sendMention(input); }
      catch (error) { failure = error instanceof MailDeliveryError ? error.failureCode : "MENTION_EMAIL_FAILED"; }
      // Persistence errors after provider acceptance retain the lease; they must not
      // be classified as transport failures and schedule an immediate duplicate.
      await finish(failure ? (row.email.attempts >= maxAttempts ? "failed" : "pending") : "sent", failure);
    }
  }
  const tick = () => {
    if (stopped || running) return running ?? Promise.resolve();
    running = runBatch().catch(() => { /* Lease expiry recovers infrastructure failures without unsafe logs. */ }).finally(() => { running = undefined; });
    return running;
  };
  return {
    runOnce: tick,
    wake() { void tick(); },
    start() {
      if (stopped || timer) return;
      timer = setInterval(() => { void tick(); }, options.intervalMs ?? 30_000); timer.unref();
      void tick();
    },
    async stop() { stopped = true; if (timer) clearInterval(timer); await running; }
  };
}
