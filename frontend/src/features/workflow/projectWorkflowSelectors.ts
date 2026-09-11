import type { DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";

export function workflowStageStatus(stage: DesignWorkflowStage) {
  return stage.operational?.status ?? stage.status;
}

export function currentProjectWorkflowStage(workflow: DesignWorkflowView) {
  return [...(workflow.projectStages ?? [])]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .find((stage) => workflowStageStatus(stage) !== "completed");
}
