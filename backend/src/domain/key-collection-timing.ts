import { createHash } from "node:crypto";
import type { KeyCollectionTiming } from "../contracts/designer-assignment.js";
import type { KeyCollectionAppointment } from "./design-workflow-state.js";

export const KEY_COLLECTION_WARNING_LEAD_MS = 30 * 60_000;

/** Timing has no pause/working-hours adjustment: this is the Client's calendar appointment. */
export function keyCollectionTiming(projectId: string, appointment: KeyCollectionAppointment, now: Date): KeyCollectionTiming | null {
  const start = Date.parse(appointment.confirmedAt);
  const end = Date.parse(appointment.deadlineAt);
  const at = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(at) || end <= start || at < start ||
    appointment.originalDeadlineAt !== appointment.deadlineAt) return null;
  const duration = end - start;
  if (appointment.mode === "within_48_hours" && duration !== 48 * 3_600_000) return null;
  const orange = start + Math.ceil(duration * 0.5);
  const red = start + Math.ceil(duration * 0.75);
  const appointmentId = createHash("sha256").update(JSON.stringify([
    projectId, appointment.mode, appointment.confirmedById, appointment.confirmedAt, appointment.originalDeadlineAt,
    appointment.assignmentRevision, appointment.designerId, appointment.assignmentRequestId,
    appointment.estimateId, appointment.estimateVersion, appointment.approvalReviewRoundId
  ])).digest("hex");
  return {
    appointmentId,
    zone: at >= red ? "red" : at >= orange ? "orange" : "green",
    orangeAt: new Date(orange).toISOString(), redAt: new Date(red).toISOString(),
    orangeWarningAt: new Date(Math.max(start, orange - KEY_COLLECTION_WARNING_LEAD_MS)).toISOString(),
    redWarningAt: new Date(Math.max(start, red - KEY_COLLECTION_WARNING_LEAD_MS)).toISOString()
  };
}

export interface KeyCollectionWarning {
  zone: "orange" | "red";
  dueAt: string;
  transitionAt: string;
}

/** Recovery selects only the latest eligible warning, never a backlog of obsolete warnings. */
export function latestKeyCollectionWarning(timing: KeyCollectionTiming, now: Date): KeyCollectionWarning | null {
  const at = now.getTime();
  if (at >= Date.parse(timing.redWarningAt)) return { zone: "red", dueAt: timing.redWarningAt, transitionAt: timing.redAt };
  if (at >= Date.parse(timing.orangeWarningAt)) return { zone: "orange", dueAt: timing.orangeWarningAt, transitionAt: timing.orangeAt };
  return null;
}
