import type { TaskStatus } from "../../api/types";
import type { DesignStageOperational, DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";

export const workflowStatusLabels: Record<TaskStatus, string> = {
  not_started: "Not started", in_progress: "In progress", in_review: "In review", blocked: "Blocked", completed: "Completed"
};

export function workflowStageStatus(stage: DesignWorkflowStage) {
  return stage.operational?.status ?? stage.status;
}

function activeFurniturePhase(stage: DesignWorkflowStage) {
  const status = workflowStageStatus(stage);
  if (stage.type !== "existing_furniture_dimensions" || status !== "in_progress" ||
    stage.operational?.blockingReasons.length || ["waiting", "paused"].includes(stage.operational?.timing.state ?? "")) return undefined;
  return stage.operational?.furniture?.phase;
}

export function workflowStageStatusLabel(stage: DesignWorkflowStage) {
  const phase = activeFurniturePhase(stage);
  if (phase === "awaiting_client_acceptance") return stage.operational?.furniture?.requirementsSubmissionEventId ? "Awaiting dimensions approval" : "Awaiting Client acceptance";
  if (phase === "awaiting_dimensions") return "Awaiting furniture dimensions";
  if (phase === "requirements_changes_requested") return stage.operational?.furniture?.requirementsSubmissionEventId ? "Dimensions sent back" : "Requirements sent back";
  if (phase === "awaiting_dimension_approval") return "Awaiting dimensions approval";
  if (phase === "dimension_changes_requested") return "Dimensions sent back";
  const status = workflowStageStatus(stage);
  return status ? workflowStatusLabels[status] : "No tasks configured";
}

export function workflowStageNextStep(stage: DesignWorkflowStage) {
  const phase = activeFurniturePhase(stage);
  if (phase === "awaiting_client_acceptance") return stage.operational?.furniture?.requirementsSubmissionEventId ? "Await Client approval of furniture dimensions" : "Await Client acceptance of furniture requirements";
  if (phase === "awaiting_dimensions") return "Submit furniture dimensions for Client approval";
  if (phase === "requirements_changes_requested") return stage.operational?.furniture?.requirementsSubmissionEventId ? "Correct and resubmit furniture dimensions" : "Revise and resubmit furniture requirements";
  if (phase === "awaiting_dimension_approval") return "Await Client approval of furniture dimensions";
  if (phase === "dimension_changes_requested") return "Correct and resubmit furniture dimensions";
  return undefined;
}

export function furnitureRoomStatusLabel(room: NonNullable<DesignStageOperational["rooms"]>[number]) {
  if (!room.required) return "Dimensions not required";
  if (room.dimensions?.status === "pending") return "Awaiting Client approval";
  if (room.dimensions?.status === "changes_requested") return "Changes requested";
  if (room.dimensions?.status === "approved") return "Dimensions approved";
  if (room.canProceed) return room.hasDimensions ? "Dimensions received" : "Previously permitted to proceed";
  return "Dimensions required";
}

export function currentProjectWorkflowStage(workflow: DesignWorkflowView) {
  return [...(workflow.projectStages ?? [])]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .find((stage) => workflowStageStatus(stage) !== "completed");
}
