import type { KeyCollectionAppointmentView, DesignerKeyCollectionReminderPage } from "../../../shared/projects/designerAssignment";
import type { DesignWorkflowView } from "../features/workflow/projectWorkflowApi";

export const collectionStart = "2026-11-25T09:00:00.000Z";
export function collectionAppointment(): KeyCollectionAppointmentView {
  return {
    mode: "within_48_hours", confirmedAt: collectionStart,
    originalDeadlineAt: "2026-11-27T09:00:00.000Z", deadlineAt: "2026-11-27T09:00:00.000Z",
    receivedAt: null, handedOverAt: null, completedAt: null, remainingMs: 48 * 3600_000, overdue: false,
    timing: { appointmentId: "appointment-a", zone: "green", orangeAt: "2026-11-26T09:00:00.000Z", redAt: "2026-11-26T21:00:00.000Z",
      orangeWarningAt: "2026-11-26T08:30:00.000Z", redWarningAt: "2026-11-26T20:30:00.000Z" }
  };
}
export function collectionWorkflow(): DesignWorkflowView & { receivedAt: number } {
  return {
    projectId: "project-a", projectName: "Courtyard Home", serverNow: collectionStart, receivedAt: Date.now(), floors: [], estimateApprovalStatus: "approved",
    designerHandoff: { initialEstimateApproved: true, executionAvailable: false, state: "scheduled", designer: { id: "designer-a", name: "Designer A" },
      assignmentRevision: "assignment-a", appointment: collectionAppointment(), canSchedule: false, blockers: ["Complete Internal Kickoff.", "Complete Client Kickoff."] },
    projectStages: [{ id: "keys-a", type: "key_collection", name: "Key Collection", order: 3, dependencyStageIds: [], status: "not_started", progress: null,
      deadlineAt: null, deadlineTaskId: null, tasks: [], operational: { status: "not_started", version: 1, availableActions: [], blockingReasons: ["Complete Internal Kickoff."], facts: [], history: [],
        timing: { state: "waiting", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 } } }]
  };
}
export function collectionFeed(): DesignerKeyCollectionReminderPage {
  const appointment = collectionAppointment();
  return {
    serverNow: "2026-11-26T22:00:00.000Z", urgentCount: 2, nextRedAt: null,
    items: [{ projectId: "project-a", projectName: "Courtyard Home", stageId: "keys-a", appointment, blockers: ["Complete Client Kickoff."] },
      { projectId: "project-b", projectName: "Lakeside Home", stageId: "keys-b", appointment: { ...appointment, deadlineAt: "2026-11-27T12:00:00.000Z", originalDeadlineAt: "2026-11-27T12:00:00.000Z",
        timing: { ...appointment.timing!, appointmentId: "appointment-b" } }, blockers: [] }],
    pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
  };
}
