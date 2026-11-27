import { EXECUTION_CHOICE_OPTION_IDS, EXECUTION_CHOICE_PHASE_IDS } from "../contracts/project-execution-choice.js";

const phase = { type: "object", additionalProperties: false, required: ["id", "label"], properties: {
  id: { type: "string", enum: EXECUTION_CHOICE_PHASE_IDS }, label: { type: "string" }
} };

export const EXECUTION_CHOICE_SCHEMAS = {
  ExecutionChoiceData: { type: "object", additionalProperties: false, required: ["optionId", "definitionVersion", "acknowledgedIrreversible"], properties: {
    optionId: { type: "string", enum: EXECUTION_CHOICE_OPTION_IDS }, definitionVersion: { type: "integer", enum: [1] },
    acknowledgedIrreversible: { type: "boolean", enum: [true] }
  } },
  ExecutionChoiceView: { type: "object", additionalProperties: false,
    required: ["status", "version", "canSelect", "blockingReason", "keyCollectionStageId", "options", "selection"],
    description: "One permanent personal Client decision after completed key collection. Describes the chosen sequence without enforcing phase progression or changing existing stage/task/finance/deadline state. Staff read within existing project scope and cannot select or override. Missing or inconsistent records are unavailable, never a default choice.",
    properties: {
      status: { type: "string", enum: ["waiting_for_keys", "available", "locked", "unavailable"] },
      version: { type: "integer", minimum: 0 }, canSelect: { type: "boolean" },
      blockingReason: { type: "string", nullable: true }, keyCollectionStageId: { type: "string", nullable: true },
      options: { type: "array", minItems: 2, maxItems: 2, items: { type: "object", additionalProperties: false,
        required: ["id", "label", "definitionVersion", "phases"], properties: {
          id: { type: "string", enum: EXECUTION_CHOICE_OPTION_IDS }, label: { type: "string" }, definitionVersion: { type: "integer", enum: [1] }, phases: { type: "array", items: phase }
        } } },
      selection: { type: "object", nullable: true, additionalProperties: false, required: ["optionId", "optionLabel", "definitionVersion", "phases", "selectedAt"], properties: {
        optionId: { type: "string", enum: EXECUTION_CHOICE_OPTION_IDS }, optionLabel: { type: "string" }, definitionVersion: { type: "integer", enum: [1] },
        phases: { type: "array", items: phase }, selectedAt: { type: "string", format: "date-time" }
      } }
    }
  }
};
