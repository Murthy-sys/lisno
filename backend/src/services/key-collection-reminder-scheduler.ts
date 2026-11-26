import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { KeyCollectionAppointment } from "../domain/design-workflow-state.js";
import { keyCollectionTiming, latestKeyCollectionWarning } from "../domain/key-collection-timing.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectManagerEventModel } from "../models/ProjectManagerEvent.js";
import { UserModel } from "../models/User.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { AuditService } from "./audit.service.js";
import { readPendingKeyCollectionAppointment } from "./designer-handoff.service.js";
import { resolveProjectManagerAssignment } from "./project-manager-assignment.service.js";

const actorId = "system:key-collection-reminders";
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface Candidate { projectId: string; appointment?: KeyCollectionAppointment; finished: boolean }
interface Recorded { recorded: number; deduplicated: number; skippedInvalid: number; missingRecipients: number }
/** The injected store is a deterministic testing seam; normal runtime always uses the transactional Mongo store. */
export interface KeyCollectionReminderStore {
  candidates(after: string | null, limit: number): Promise<Candidate[]>;
  record(projectId: string, at: Date): Promise<Recorded>;
}
export interface KeyCollectionReminderReport extends Recorded {
  scanned: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
  failureCode: "KEY_COLLECTION_SCAN_FAILED" | "KEY_COLLECTION_PROJECT_FAILED" | null;
}
export interface KeyCollectionReminderSchedulerOptions {
  audit: Pick<AuditService, "appendInMongoTransaction">;
  now?: () => Date;
  enabled?: boolean;
  intervalMs?: number;
  batchSize?: number;
  maxBatchesPerTick?: number;
  onReport?: (report: KeyCollectionReminderReport) => void;
  store?: KeyCollectionReminderStore;
}

function mongoStore(audit: KeyCollectionReminderSchedulerOptions["audit"], now: () => Date): KeyCollectionReminderStore {
  return {
    async candidates(after, limit) {
      // Keyset through the existing _id index, including non-appointment rows, so sparse
      // appointment data cannot turn a bounded page into an unbounded filtered scan.
      const rows = await DesignWorkflowStateModel.find(after ? { _id: { $gt: after } } : {})
        .sort({ _id: 1 }).limit(limit).select({ _id: 1, "stages.key_collection": 1 }).lean();
      return rows.map(row => ({ projectId: String(row._id), appointment: row.stages?.key_collection?.appointment,
        finished: Boolean(row.stages?.key_collection?.receivedAt || row.stages?.key_collection?.completedAt) }));
    },
    async record(projectId) {
      return mongoose.connection.transaction(async session => {
        const repository = createMongoRepository(session);
        // Workflow actions, Designer decisions and PM reassignment all acquire this
        // same fence before their reads. Receipt cannot commit invisibly mid-warning.
        await repository.coordinateAuthorizationMutation();
        const fenced = await ProjectModel.updateOne({ _id: projectId }, { $inc: { estimationFenceEpoch: 1 } }, { session, timestamps: false });
        // A contended or retried transaction may cross another warning boundary.
        // Choose the latest warning using the clock after acquiring both fences.
        const at = now();
        const result: Recorded = { recorded: 0, deduplicated: 0, skippedInvalid: 0, missingRecipients: 0 };
        const project = fenced.matchedCount ? await repository.findProjectById(projectId) : null;
        const pending = project ? await readPendingKeyCollectionAppointment(repository, project, at) : null;
        const warning = pending ? latestKeyCollectionWarning(pending.appointment.timing, at) : null;
        if (!project || !pending || !warning) return { ...result, skippedInvalid: 1 };

        const ownership = await resolveProjectManagerAssignment(projectId, session);
        const manager = ownership.state === "assigned" ? await UserModel.findOne({ _id: ownership.ownerId, active: true, deletedAt: null, role: "site_manager" }).session(session).lean() : null;
        const admins = await UserModel.find({ active: true, role: "super_admin" }).limit(2).session(session).lean();
        const admin = admins.length === 1 && !admins[0]!.deletedAt ? admins[0]! : null;
        result.missingRecipients = Number(!manager) + Number(!admin);
        const recipients = [manager, admin].filter((user): user is NonNullable<typeof user> => Boolean(user));
        const appointmentId = pending.appointment.timing.appointmentId;
        const crossed = at.getTime() >= Date.parse(warning.transitionAt);
        const title = `${project.name}: key collection ${crossed ? "is in" : "approaches"} the ${warning.zone} zone`;
        const description = `Key collection ${crossed ? "entered" : "enters"} the ${warning.zone} zone at ${dateFormat.format(new Date(warning.transitionAt))} (Asia/Kolkata). Collection deadline: ${dateFormat.format(new Date(pending.appointment.deadlineAt))} (Asia/Kolkata).`;
        for (const recipient of recipients) {
          const recipientId = String(recipient._id);
          const idempotencyKey = digest([appointmentId, warning.zone, recipientId]);
          const id = `key-collection-warning:${idempotencyKey}`;
          const previous = await ProjectManagerEventModel.exists({ projectId, actorId, $or: [
            { idempotencyKey },
            // A backwards clock correction must not replay an obsolete orange warning.
            ...(warning.zone === "orange" ? [{ idempotencyKey: digest([appointmentId, "red", recipientId]) }] : [])
          ] }).session(session);
          if (previous) { result.deduplicated++; continue; }
          const payload = { appointmentId, zone: warning.zone, warningAt: warning.dueAt, transitionAt: warning.transitionAt,
            deadlineAt: pending.appointment.deadlineAt, recipientId };
          await ProjectManagerEventModel.create([{ _id: id, projectId, entityId: appointmentId, family: "key_collection",
            actorId, actorName: "Key collection reminders", idempotencyKey, digest: digest(payload), action: `key_collection_${warning.zone}_warning`,
            reason: description, version: 1, occurredAt: at, result: { ...payload, title, description }, recipientIds: [recipientId], readBy: [] }], { session });
          await audit.appendInMongoTransaction({ actorId, action: "project_manager_action_recorded", entityType: "key_collection", entityId: id,
            occurredAt: at.toISOString(), newValues: { projectId, ...payload }, reason: "Appointment colour-zone warning recorded." }, session);
          result.recorded++;
        }
        return result;
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    }
  };
}

export function createKeyCollectionReminderScheduler(options: KeyCollectionReminderSchedulerOptions) {
  const now = options.now ?? (() => new Date());
  const enabled = options.enabled ?? true;
  const store = options.store ?? mongoStore(options.audit, now);
  const batchSize = Math.max(1, Math.min(100, options.batchSize ?? 50));
  const maxBatches = Math.max(1, Math.min(100, options.maxBatchesPerTick ?? 20));
  let cursor: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<KeyCollectionReminderReport> | undefined;
  let lastSuccessAt: string | null = null;
  let lastReport: KeyCollectionReminderReport | null = null;

  async function run(): Promise<KeyCollectionReminderReport> {
    const report: KeyCollectionReminderReport = { scanned: 0, recorded: 0, deduplicated: 0, skippedInvalid: 0, missingRecipients: 0,
      failed: 0, startedAt: now().toISOString(), finishedAt: now().toISOString(), failureCode: null };
    if (!enabled) return report;
    try {
      for (let batch = 0; batch < maxBatches; batch++) {
        const candidates = await store.candidates(cursor, batchSize);
        if (!candidates.length) { cursor = null; break; }
        for (const candidate of candidates) {
          report.scanned++;
          const at = now();
          const timing = candidate.appointment && !candidate.finished ? keyCollectionTiming(candidate.projectId, candidate.appointment, at) : null;
          if (!timing) { report.skippedInvalid++; continue; }
          if (!latestKeyCollectionWarning(timing, at)) continue;
          try {
            const recorded = await store.record(candidate.projectId, at);
            report.recorded += recorded.recorded; report.deduplicated += recorded.deduplicated;
            report.skippedInvalid += recorded.skippedInvalid; report.missingRecipients += recorded.missingRecipients;
          } catch {
            report.failed++;
            report.failureCode = "KEY_COLLECTION_PROJECT_FAILED";
          }
        }
        cursor = candidates.at(-1)!.projectId;
        if (candidates.length < batchSize) { cursor = null; break; }
      }
    } catch {
      report.failed++;
      report.failureCode = "KEY_COLLECTION_SCAN_FAILED";
    }
    report.finishedAt = now().toISOString();
    lastReport = report;
    if (!report.failed) lastSuccessAt = report.finishedAt;
    try { options.onReport?.(report); } catch { /* Diagnostic sinks cannot stop reminder processing. */ }
    return report;
  }
  function tick() {
    if (!running) running = run().finally(() => { running = undefined; });
    return running;
  }
  return {
    tick,
    start() {
      if (!enabled || timer) return;
      void tick();
      timer = setInterval(() => { void tick(); }, Math.max(1_000, options.intervalMs ?? 60_000));
      timer.unref();
    },
    async stop() { if (timer) clearInterval(timer); timer = undefined; await running; },
    health() { return { enabled, running: Boolean(running), lastSuccessAt, failureCode: lastReport?.failureCode ?? null, lastReport }; }
  };
}
