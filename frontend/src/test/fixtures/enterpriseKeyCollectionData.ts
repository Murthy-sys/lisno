import type { DesignerKeyCollectionReminderPage, KeyCollectionAppointmentView } from "../../../../shared/projects/designerAssignment";
import type { DesignWorkflowView } from "../../features/workflow/projectWorkflowApi";

/** Browser QA only. No backend connection or real appointment is involved. */
export function createEnterpriseKeyCollection(mode: string | null) {
  const hour = 3_600_000;
  const elapsed = mode === "orange" ? 26 * hour : mode === "red" ? 40 * hour : mode === "boundary" ? 24 * hour - 5000 : 2 * hour;
  const confirmed = Date.now() - elapsed;
  const active = ["green", "orange", "red", "boundary"].includes(mode ?? "");
  const appointment = (projectId: string, shift = 0): KeyCollectionAppointmentView => {
    const start = confirmed - shift;
    const orange = start + 24 * hour, red = start + 36 * hour, deadline = start + 48 * hour;
    return { mode: "within_48_hours", confirmedAt: new Date(start).toISOString(), originalDeadlineAt: new Date(deadline).toISOString(),
      deadlineAt: new Date(deadline).toISOString(), receivedAt: null, handedOverAt: null, completedAt: null,
      remainingMs: Math.max(0, deadline - Date.now()), overdue: Date.now() > deadline,
      timing: { appointmentId: `synthetic-appointment-${projectId}`, zone: Date.now() >= red ? "red" : Date.now() >= orange ? "orange" : "green",
        orangeAt: new Date(orange).toISOString(), redAt: new Date(red).toISOString(),
        orangeWarningAt: new Date(orange - 30 * 60_000).toISOString(), redWarningAt: new Date(red - 30 * 60_000).toISOString() } };
  };
  const blockers = ["Complete Internal Kick off before collecting keys.", "Complete Client Kick off before collecting keys."];
  return {
    inbox(params: URLSearchParams): DesignerKeyCollectionReminderPage {
      const all = active ? [
        { projectId: "project-aurora-villa", projectName: "Aurora Villa", stageId: "synthetic-key-collection", appointment: appointment("project-aurora-villa"), blockers },
        { projectId: "project-aurora-studio", projectName: "Aurora Studio", stageId: "synthetic-key-collection", appointment: appointment("project-aurora-studio", hour), blockers }
      ].sort((a, b) => a.appointment.deadlineAt.localeCompare(b.appointment.deadlineAt)) : [];
      const urgent = all.filter(item => item.appointment.timing?.zone === "red");
      const future = all.map(item => item.appointment.timing!.redAt).filter(time => Date.parse(time) > Date.now()).sort();
      const rows = params.get("status") === "pending" ? all : urgent;
      const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 20))), offset = Math.max(0, Number(params.get("offset") ?? 0));
      return { serverNow: new Date().toISOString(), urgentCount: urgent.length, nextRedAt: future[0] ?? null,
        items: rows.slice(offset, offset + limit), pagination: { limit, offset, total: rows.length, hasMore: offset + limit < rows.length } };
    },
    workflow(path: string, data: unknown): unknown {
      if (!active || !/^\/projects\/[^/]+\/design-workflow$/.test(path) || !data || typeof data !== "object") return data;
      const workflow = structuredClone(data) as DesignWorkflowView;
      const projectId = path.split("/")[2]!;
      workflow.projectId = projectId;
      workflow.serverNow = new Date().toISOString();
      workflow.estimateApprovalStatus = "approved";
      workflow.designerHandoff = { initialEstimateApproved: true, executionAvailable: false, state: "scheduled",
        designer: { id: "designer-1", name: "Sample Designer" }, assignmentRevision: "synthetic-assignment", appointment: appointment(projectId, projectId === "project-aurora-studio" ? hour : 0), canSchedule: false, blockers };
      const stages = workflow.projectStages ??= [];
      if (!stages.some(stage => stage.type === "key_collection")) stages.push({
        id: "synthetic-key-collection", type: "key_collection", name: "Key Collection", order: 3, dependencyStageIds: [], status: "not_started", progress: null,
        deadlineAt: null, deadlineTaskId: null, tasks: [], operational: { status: "not_started", version: 7,
          availableActions: [], blockingReasons: blockers, facts: [], history: [],
          timing: { state: "waiting", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 } }
      });
      return workflow;
    }
  };
}
