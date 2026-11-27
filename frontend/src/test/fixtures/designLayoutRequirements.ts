import { executionChoiceOption, type ExecutionChoiceOptionId } from "../../../../shared/projects/executionChoice";
import { requiredDesignLayoutTypes, type DesignLayoutRequirements } from "../../../../shared/projects/designLayoutRequirements";

export function layoutRequirementsFixture(optionId: ExecutionChoiceOptionId = "option_2", overrides: Partial<DesignLayoutRequirements> = {}): DesignLayoutRequirements {
  const option = executionChoiceOption(optionId);
  const types = requiredDesignLayoutTypes(optionId);
  return {
    status: "selected",
    choice: { optionId, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T00:00:00.000Z" },
    designPlanVersion: 0,
    allowedTypes: types,
    requiredTypes: types,
    coverage: types.map(layoutType => ({ layoutType, uploadIds: [`upload-${layoutType}`], qualifyingUploadIds: [`upload-${layoutType}`], state: "ready" })),
    unclassifiedUploadIds: [], missingTypes: [], coverageComplete: true, blockingReasons: [], revisionKey: "synthetic-layout-revision",
    ...overrides
  };
}
