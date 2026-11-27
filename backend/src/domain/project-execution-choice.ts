import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { EXECUTION_CHOICE_DEFINITION_VERSION, EXECUTION_CHOICE_OPTIONS, EXECUTION_CHOICE_OPTION_IDS, EXECUTION_CHOICE_PHASE_IDS, executionChoiceOption, type ExecutionChoiceView } from "../contracts/project-execution-choice.js";
import type { ProjectRecord } from "../repositories/types.js";
import type { DesignWorkflowState } from "./design-workflow-state.js";

export const executionChoiceDataSchema = z.object({
  optionId: z.enum(EXECUTION_CHOICE_OPTION_IDS),
  definitionVersion: z.literal(EXECUTION_CHOICE_DEFINITION_VERSION),
  acknowledgedIrreversible: z.literal(true)
}).strict();

const executionChoiceRecordSchema = z.object({
  optionId: z.enum(EXECUTION_CHOICE_OPTION_IDS), definitionVersion: z.literal(EXECUTION_CHOICE_DEFINITION_VERSION),
  phaseIds: z.array(z.enum(EXECUTION_CHOICE_PHASE_IDS)), selectedAt: z.string().datetime({ offset: true }),
  selectedById: z.string().min(1), historyEventId: z.string().min(1), keyCollectionStageId: z.string().min(1)
}).strict();

const CORRUPT_CHOICE = "The saved execution choice needs review. It cannot be replaced or revoked.";

/** A missing or inconsistent historical decision must never reopen selection. */
export function executionChoiceIntegrityIssue(state: DesignWorkflowState): string | null {
  if (!Array.isArray(state.history) || state.history.some(event => !event || typeof event !== "object")) return CORRUPT_CHOICE;
  const events = state.history.filter(event => event.action === "execution_path_select");
  if (state.executionChoice === undefined) return events.length ? CORRUPT_CHOICE : null;
  const parsed = executionChoiceRecordSchema.safeParse(state.executionChoice);
  if (!parsed.success) return CORRUPT_CHOICE;
  const record = parsed.data;
  const expected = executionChoiceOption(record.optionId);
  if (!isDeepStrictEqual(record.phaseIds, expected.phases.map(phase => phase.id)) || events.length !== 1 ||
    state.history.filter(event => event.id === record.historyEventId).length !== 1) return CORRUPT_CHOICE;
  const event = events[0]!;
  if (event.id !== record.historyEventId || event.stageId !== record.keyCollectionStageId || event.actorId !== record.selectedById ||
    event.actorRole !== "client" || event.onBehalfOfClient !== false || event.at !== record.selectedAt || event.proof !== null ||
    Boolean(event.mediaFiles?.length) || !isDeepStrictEqual(event.data, { ...record, acknowledgedIrreversible: true })) return CORRUPT_CHOICE;
  return null;
}

/** Used by both repositories, including writes unrelated to execution selection. */
export function executionChoicePreservationIssue(current: DesignWorkflowState | null, next: DesignWorkflowState): string | null {
  const invalid = executionChoiceIntegrityIssue(next);
  if (invalid) return invalid;
  if (!current) return null;
  const existingIssue = executionChoiceIntegrityIssue(current);
  if (existingIssue) return existingIssue;
  if (current.executionChoice !== undefined) {
    if (!isDeepStrictEqual(current.executionChoice, next.executionChoice)) return CORRUPT_CHOICE;
    const previousEvent = current.history.find(event => event.id === current.executionChoice!.historyEventId);
    const nextEvents = next.history.filter(event => event.id === current.executionChoice!.historyEventId);
    if (nextEvents.length !== 1 || !isDeepStrictEqual(previousEvent, nextEvents[0])) return CORRUPT_CHOICE;
  }
  return null;
}

type ChoiceProject = Pick<ProjectRecord, "id" | "clientId" | "designWorkflowStages">;
export function projectExecutionChoice(project: ChoiceProject, state: DesignWorkflowState | null, actor: { id: string; role: string }, now: Date): ExecutionChoiceView {
  const keyStages = project.designWorkflowStages?.filter(stage => stage.type === "key_collection") ?? [];
  const keyCollectionStageId = keyStages.length === 1 && project.designWorkflowStages!.filter(stage => stage.id === keyStages[0]!.id).length === 1 ? keyStages[0]!.id : null;
  const base = { version: Number.isSafeInteger(state?.version) && state!.version >= 0 ? state!.version : 0,
    keyCollectionStageId, canSelect: false, blockingReason: null, options: EXECUTION_CHOICE_OPTIONS, selection: null };
  const unavailable = (blockingReason: string): ExecutionChoiceView => ({ ...base, status: "unavailable", blockingReason });
  if (state && (state.projectId !== project.id || !Number.isSafeInteger(state.version) || state.version < 0)) return unavailable(CORRUPT_CHOICE);
  if (state) {
    const issue = executionChoiceIntegrityIssue(state);
    if (issue) return unavailable(issue);
    if (state.executionChoice) {
      const choice = state.executionChoice, option = executionChoiceOption(choice.optionId);
      return { ...base, status: "locked", keyCollectionStageId: choice.keyCollectionStageId,
        selection: { optionId: choice.optionId, optionLabel: option.label, definitionVersion: choice.definitionVersion,
          phases: option.phases, selectedAt: choice.selectedAt } };
    }
  }
  if (!keyCollectionStageId) return unavailable("This project does not have a configured key-collection stage.");
  const keys = state?.stages?.key_collection;
  const fields = [keys?.handedOverAt, keys?.receivedAt, keys?.completedAt];
  if (fields.some(value => value !== undefined && (!z.string().datetime({ offset: true }).safeParse(value).success || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now.getTime())) ||
    keys?.completedAt && (!keys.handedOverAt || !keys.receivedAt || Date.parse(keys.completedAt) < Math.max(Date.parse(keys.handedOverAt), Date.parse(keys.receivedAt)))) {
    return unavailable("The saved key-collection confirmations need review before choosing an execution path.");
  }
  if (!fields.every(Boolean)) return { ...base, status: "waiting_for_keys", blockingReason: "Available after you and your Designer confirm key collection." };
  const canSelect = actor.role === "client" && actor.id === project.clientId;
  return { ...base, status: "available", canSelect, blockingReason: canSelect ? null : "Awaiting Client selection." };
}
