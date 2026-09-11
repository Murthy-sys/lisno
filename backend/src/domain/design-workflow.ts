/** Persisted codes include older workflows so existing projects remain readable. */
export const DESIGN_STAGE_TYPES = [
  "internal_kickoff",
  "client_kickoff",
  "key_collection",
  "site_measurement",
  "existing_furniture_dimensions",
  "space_planning_tentative_look_feel",
  "concept_mood_board",
  "floor_plan",
  "client_revisions",
  "final_approval",
  "design_handoff"
] as const;

export type DesignStageType = (typeof DESIGN_STAGE_TYPES)[number];

export interface ProjectDesignWorkflowStage {
  id: string;
  type: DesignStageType;
  name: string;
  order: number;
}

const INITIAL_DESIGN_STAGES = [
  ["internal_kickoff", "Internal Kick off"],
  ["client_kickoff", "Client Kick off"],
  ["key_collection", "Key Collection"],
  ["site_measurement", "On Site Actual Measurement"],
  ["existing_furniture_dimensions", "Collection of existing furniture dimensions"],
  ["space_planning_tentative_look_feel", "Designer Uploading Space planning with Tentative look and Feel"]
] as const satisfies ReadonlyArray<readonly [DesignStageType, string]>;

/** Called only when a project is created; reads never manufacture a workflow. */
export function createProjectDesignWorkflow(projectId: string): ProjectDesignWorkflowStage[] {
  return INITIAL_DESIGN_STAGES.map(([type, name], order) => ({
    id: `${projectId}:design-stage:${type}`,
    type,
    name,
    order
  }));
}
