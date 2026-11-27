/** Versioned, dependency-free definitions shared by backend, web, and native. */
export const EXECUTION_CHOICE_DEFINITION_VERSION = 1 as const;
export const EXECUTION_CHOICE_OPTION_IDS = ["option_1", "option_2"] as const;
export type ExecutionChoiceOptionId = typeof EXECUTION_CHOICE_OPTION_IDS[number];
export const EXECUTION_CHOICE_PHASE_IDS = ["layout_2d", "layout_3d", "selections", "renders", "production"] as const;
export type ExecutionChoicePhaseId = typeof EXECUTION_CHOICE_PHASE_IDS[number];

export interface ExecutionChoicePhase {
  readonly id: ExecutionChoicePhaseId;
  readonly label: string;
}
export interface ExecutionChoiceOption {
  readonly id: ExecutionChoiceOptionId;
  readonly label: string;
  readonly definitionVersion: typeof EXECUTION_CHOICE_DEFINITION_VERSION;
  readonly phases: readonly ExecutionChoicePhase[];
}

const phases: Readonly<Record<ExecutionChoicePhaseId, ExecutionChoicePhase>> = Object.freeze({
  layout_2d: Object.freeze({ id: "layout_2d", label: "2D layout" }),
  layout_3d: Object.freeze({ id: "layout_3d", label: "3D layout" }),
  selections: Object.freeze({ id: "selections", label: "Selections" }),
  renders: Object.freeze({ id: "renders", label: "Renders" }),
  production: Object.freeze({ id: "production", label: "Production" })
});

export const EXECUTION_CHOICE_OPTIONS: readonly ExecutionChoiceOption[] = Object.freeze([
  Object.freeze({ id: "option_1", label: "Option 1", definitionVersion: EXECUTION_CHOICE_DEFINITION_VERSION,
    phases: Object.freeze([phases.layout_2d, phases.layout_3d, phases.selections, phases.renders, phases.production]) }),
  Object.freeze({ id: "option_2", label: "Option 2", definitionVersion: EXECUTION_CHOICE_DEFINITION_VERSION,
    phases: Object.freeze([phases.layout_3d, phases.renders, phases.selections, phases.production]) })
]);

export function executionChoiceOption(optionId: ExecutionChoiceOptionId): ExecutionChoiceOption {
  return EXECUTION_CHOICE_OPTIONS[optionId === "option_1" ? 0 : 1]!;
}

export interface ExecutionChoiceRecord {
  readonly optionId: ExecutionChoiceOptionId;
  readonly definitionVersion: typeof EXECUTION_CHOICE_DEFINITION_VERSION;
  readonly phaseIds: readonly ExecutionChoicePhaseId[];
  readonly selectedAt: string;
  readonly selectedById: string;
  readonly historyEventId: string;
  readonly keyCollectionStageId: string;
}

export interface ExecutionChoiceSelection {
  readonly optionId: ExecutionChoiceOptionId;
  readonly optionLabel: string;
  readonly definitionVersion: typeof EXECUTION_CHOICE_DEFINITION_VERSION;
  readonly phases: readonly ExecutionChoicePhase[];
  readonly selectedAt: string;
}

export interface ExecutionChoiceView {
  readonly status: "waiting_for_keys" | "available" | "locked" | "unavailable";
  readonly version: number;
  readonly canSelect: boolean;
  readonly blockingReason: string | null;
  readonly keyCollectionStageId: string | null;
  readonly options: readonly ExecutionChoiceOption[];
  readonly selection: ExecutionChoiceSelection | null;
}

export interface ExecutionChoiceData {
  readonly optionId: ExecutionChoiceOptionId;
  readonly definitionVersion: typeof EXECUTION_CHOICE_DEFINITION_VERSION;
  readonly acknowledgedIrreversible: true;
}

export interface ExecutionChoiceCommand {
  readonly action: "execution_path_select";
  readonly expectedVersion: number;
  readonly stageId: string;
  readonly idempotencyKey: string;
  readonly data: ExecutionChoiceData;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function matchesPhases(value: unknown, expected: readonly ExecutionChoicePhase[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((phase, index) =>
    object(phase) && phase.id === expected[index]!.id && phase.label === expected[index]!.label);
}

/** Unsupported or inconsistent responses must never enable a permanent decision. */
export function isExecutionChoiceView(value: unknown): value is ExecutionChoiceView {
  if (!object(value) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 ||
    typeof value.canSelect !== "boolean" || !(value.blockingReason === null || typeof value.blockingReason === "string") ||
    !(value.keyCollectionStageId === null || typeof value.keyCollectionStageId === "string" && value.keyCollectionStageId.trim().length > 0) ||
    !Array.isArray(value.options) || value.options.length !== EXECUTION_CHOICE_OPTIONS.length) return false;
  if (!value.options.every((option, index) => {
    const expected = EXECUTION_CHOICE_OPTIONS[index]!;
    return object(option) && option.id === expected.id && option.label === expected.label &&
      option.definitionVersion === expected.definitionVersion && matchesPhases(option.phases, expected.phases);
  })) return false;
  if (value.status === "locked") {
    const selection = value.selection;
    if (value.canSelect || !object(selection) ||
      !EXECUTION_CHOICE_OPTION_IDS.some(id => selection.optionId === id) ||
      selection.definitionVersion !== EXECUTION_CHOICE_DEFINITION_VERSION ||
      typeof selection.selectedAt !== "string" || !Number.isFinite(Date.parse(selection.selectedAt))) return false;
    const expected = executionChoiceOption(selection.optionId as ExecutionChoiceOptionId);
    return selection.optionLabel === expected.label && matchesPhases(selection.phases, expected.phases);
  }
  if (value.selection !== null) return false;
  if (value.status === "available") return typeof value.keyCollectionStageId === "string";
  return (value.status === "waiting_for_keys" || value.status === "unavailable") && value.canSelect === false;
}
