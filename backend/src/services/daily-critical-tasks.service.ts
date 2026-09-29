import type { ChatAvailability, DailyCriticalTaskItem, DailyCriticalTasks } from "../contracts/daily-critical-tasks.js";
import type { ChatActor } from "../contracts/project-chat.js";
import { chatAvailability, indiaDigestDue, indiaDigestScheduledAt, indiaLocalDate } from "../domain/chat-hours.js";
import { workflowTaskDueAt } from "../domain/project-workflow.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatTransaction, DailyCriticalTaskReceipt, ProjectChatRepository } from "../repositories/project-chat.js";
import { authenticatedChatUser, projectChatContext } from "./project-chat-context.js";
import { systemClock, type Clock } from "./workflow.js";
import type { AuditService, AuditWrite } from "./audit.service.js";
import type { UserRecord } from "../repositories/types.js";

const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
const previousDate = (date: string) => new Date(Date.parse(`${date}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const internal = (role: string) => role !== "client";
const requireInternal = (role: string) => { if (!internal(role)) throw new ApiError(403, "FORBIDDEN", "The daily critical list is for internal teams."); };

export interface DailyCriticalTasksService {
  availability(actor: ChatActor): Promise<ChatAvailability>;
  get(actor: ChatActor): Promise<DailyCriticalTasks | null>;
  acknowledge(actor: ChatActor, localDate: string): Promise<{localDate: string; acknowledgedAt: string}>;
  signal(actor: ChatActor): Promise<string | null>;
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createDailyCriticalTasksService(options: {
  chatRepository: ProjectChatRepository;
  clock?: Clock;
  onDue?: (userId: string) => void;
  audit?: Pick<AuditService, "append" | "appendInMongoTransaction">;
}): DailyCriticalTasksService {
  const store = options.chatRepository;
  const clock = options.clock ?? systemClock;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastProcessedDueDate: string | null = null;
  const audit = async (tx: ChatTransaction, input: AuditWrite) => {
    if (!options.audit) return;
    if (tx.session) await options.audit.appendInMongoTransaction(input, tx.session);
    else await options.audit.append(input, tx.app);
  };

  async function ensureDue(tx: ChatTransaction, user: UserRecord, at: Date, createdUsers?: Set<string>): Promise<DailyCriticalTaskReceipt[]> {
    const today = indiaLocalDate(at);
    const scheduleStart = await tx.ensureDigestScheduleStart(today, at.toISOString());
    let receipts = await tx.digestReceipts(user.id, today);
    const createdAt = new Date(user.createdAt);
    const createdDate = indiaLocalDate(createdAt);
    const firstUserDate = indiaDigestDue(createdAt) ? nextDate(createdDate) : createdDate;
    const firstEligibleDate = firstUserDate > scheduleStart ? firstUserDate : scheduleStart;
    const lastDueDate = indiaDigestDue(at) ? today : previousDate(today);
    const latest = receipts.at(-1)?.localDate;
    let date = latest ? nextDate(latest) : firstEligibleDate;
    if (date < firstEligibleDate) date = firstEligibleDate;
    // One date per calendar day. The bound prevents an invalid legacy row from causing unbounded work.
    for (let days = 0; date <= lastDueDate && days < 366; days++, date = nextDate(date)) {
      if (await tx.ensureDigestReceipt(user.id, date, at.toISOString())) {
        await audit(tx, {actorId: "system:daily-critical-tasks", action: "project_chat.daily_critical_delivered",
          entityType: "daily_critical_task_receipt", entityId: `${user.id}:${date}`, occurredAt: at.toISOString(),
          newValues: {userId: user.id, localDate: date}});
        createdUsers?.add(user.id);
      }
    }
    receipts = await tx.digestReceipts(user.id, today);
    return receipts;
  }

  async function authorizedItems(tx: ChatTransaction, actor: ChatActor, at: Date): Promise<DailyCriticalTaskItem[]> {
    const user = await authenticatedChatUser(tx, actor, clock);
    if (actor.role === "super_admin" && await tx.app.countActiveUsersByRole("super_admin") !== 1)
      throw new ApiError(403, "FORBIDDEN", "The Super Admin identity is unavailable.");
    const result: DailyCriticalTaskItem[] = [];
    for (const projectId of await tx.candidateProjectIds(user)) {
      let context;
      try { context = await projectChatContext(tx, actor, projectId, clock); }
      catch (error) { if (error instanceof ApiError && error.status === 404) continue; throw error; }
      const projectName = context.sources.project.name;
      const state = await tx.state(projectId);
      for (let before: number | undefined; ;) {
        const page = await tx.messages({projectId, userId: actor.id, filter: "critical", atMost: state.latestMessageSequence, before, limit: 100, ascending: false});
        for (const message of page) {
          if (message.action && message.responsible?.id === actor.id && message.issueStatus === "open") {
            result.push({kind: "chat_action", id: message.id, messageId: message.id, projectId, projectName,
              title: message.body.trim().slice(0, 240) || message.action.typeName, dueDate: message.action.dueDate});
          }
        }
        if (page.length < 100) break;
        before = page.at(-1)!.sequence;
      }
      for (const task of context.sources.workflowTasks) {
        if (task.projectId !== projectId || task.assigneeUserId !== actor.id || task.status === "completed" || !task.openedAt) continue;
        const due = task.dueAt ? new Date(task.dueAt) : workflowTaskDueAt(task.kind, new Date(task.openedAt));
        if (!Number.isFinite(due.getTime()) || due.getTime() >= at.getTime()) continue;
        result.push({kind: "workflow_task", id: task.id, projectId, projectName, title: task.title ?? task.kind.replaceAll("_", " "),
          dueAt: due.toISOString(), status: task.status ?? "open"});
      }
    }
    return result.sort((a, b) => (a.kind === "chat_action" ? a.dueDate : a.dueAt).localeCompare(b.kind === "chat_action" ? b.dueDate : b.dueAt) || a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id));
  }

  const pickReceipt = (receipts: DailyCriticalTaskReceipt[]) => receipts.find(row => !row.acknowledgedAt) ?? receipts.at(-1) ?? null;
  return {
    availability: actor => store.snapshot(async tx => { await authenticatedChatUser(tx, actor, clock); return chatAvailability(actor.role, clock()); }),
    async get(actor) {
      requireInternal(actor.role);
      return store.mutate(async tx => {
        const user = await authenticatedChatUser(tx, actor, clock);
        const at = clock();
        const receipt = pickReceipt(await ensureDue(tx, user, at));
        if (!receipt) return null;
        const items = await authorizedItems(tx, actor, at);
        return {timezone: "Asia/Kolkata", localDate: receipt.localDate,
          scheduledAt: indiaDigestScheduledAt(receipt.localDate), acknowledgedAt: receipt.acknowledgedAt, items};
      });
    },
    async acknowledge(actor, localDate) {
      requireInternal(actor.role);
      if (!datePattern.test(localDate) || Number.isNaN(Date.parse(`${localDate}T00:00:00.000Z`))) throw new ApiError(400, "VALIDATION_ERROR", "Choose a valid India-local date.");
      return store.mutate(async tx => {
        const user = await authenticatedChatUser(tx, actor, clock);
        const at = clock();
        await ensureDue(tx, user, at);
        const prior = (await tx.digestReceipts(actor.id, localDate)).find(row => row.localDate === localDate);
        const receipt = await tx.acknowledgeDigestReceipt(actor.id, localDate, at.toISOString());
        if (!receipt || receipt.localDate > indiaLocalDate(at)) throw new ApiError(404, "NOT_FOUND", "The daily critical list is not available.");
        if (prior && !prior.acknowledgedAt) await audit(tx, {actorId: actor.id, action: "project_chat.daily_critical_acknowledged",
          entityType: "daily_critical_task_receipt", entityId: `${actor.id}:${localDate}`, occurredAt: receipt.acknowledgedAt!,
          newValues: {userId: actor.id, localDate}});
        return {localDate, acknowledgedAt: receipt.acknowledgedAt!};
      });
    },
    async signal(actor) {
      if (!internal(actor.role)) return null;
      return store.mutate(async tx => {
        const user = await authenticatedChatUser(tx, actor, clock);
        return (await ensureDue(tx, user, clock())).find(row => !row.acknowledgedAt)?.localDate ?? null;
      });
    },
    async tick() {
      const at = clock();
      const today = indiaLocalDate(at);
      const dueDate = indiaDigestDue(at) ? today : previousDate(today);
      if (lastProcessedDueDate === dueDate) return;
      const createdUsers = new Set<string>();
      await store.mutate(async tx => {
        await tx.ensureDigestScheduleStart(today, at.toISOString());
        for (const user of await tx.app.listUsers()) if (user.active && internal(user.role)) await ensureDue(tx, user, at, createdUsers);
      });
      lastProcessedDueDate = dueDate;
      for (const userId of createdUsers) options.onDue?.(userId);
    },
    start() {
      if (timer) return;
      void this.tick().catch(() => {});
      timer = setInterval(() => { void this.tick().catch(() => {}); }, 60_000);
      timer.unref();
    },
    stop() { if (timer) clearInterval(timer); timer = undefined; }
  };
}
