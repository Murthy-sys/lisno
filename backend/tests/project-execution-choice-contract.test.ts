import { describe, expect, it } from "vitest";
import { EXECUTION_CHOICE_OPTIONS, executionChoiceOption, isExecutionChoiceView, type ExecutionChoiceView } from "../src/contracts/project-execution-choice.js";

const available = (): ExecutionChoiceView => ({ status: "available", version: 7, canSelect: true,
  blockingReason: null, keyCollectionStageId: "project-a:design-stage:key_collection", options: EXECUTION_CHOICE_OPTIONS, selection: null });

describe("execution choice contract", () => {
  it("preserves the agreed unequal sequences and labels", () => {
    expect(EXECUTION_CHOICE_OPTIONS.map(option => option.phases.map(phase => phase.label).join(" → "))).toEqual([
      "2D layout → 3D layout → Selections → Renders → Production",
      "3D layout → Renders → Selections → Production"
    ]);
    expect(executionChoiceOption("option_1").phases.map(phase => phase.id)).toEqual(["layout_2d", "layout_3d", "selections", "renders", "production"]);
    expect(executionChoiceOption("option_2").phases.map(phase => phase.id)).toEqual(["layout_3d", "renders", "selections", "production"]);
    expect(EXECUTION_CHOICE_OPTIONS.every(option => option.definitionVersion === 1)).toBe(true);
  });

  it("accepts authoritative availability for the Client and read-only staff", () => {
    expect(isExecutionChoiceView(available())).toBe(true);
    expect(isExecutionChoiceView({ ...available(), canSelect: false })).toBe(true);
    expect(isExecutionChoiceView({ ...available(), status: "waiting_for_keys", canSelect: false })).toBe(true);
    expect(isExecutionChoiceView({ ...available(), status: "unavailable", canSelect: false, keyCollectionStageId: null })).toBe(true);
  });

  it("accepts locked choices without granting editing authority", () => {
    for (const option of EXECUTION_CHOICE_OPTIONS) {
      const view = { ...available(), status: "locked", canSelect: false, selection: {
        optionId: option.id, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T09:00:00.000Z"
      } };
      expect(isExecutionChoiceView(view)).toBe(true);
      expect(isExecutionChoiceView({ ...view, canSelect: true })).toBe(false);
      expect(isExecutionChoiceView({ ...view, selection: { ...view.selection, phases: [...option.phases].reverse() } })).toBe(false);
    }
  });

  it.each([
    undefined, null, {}, { ...available(), version: -1 }, { ...available(), version: 1.5 },
    { ...available(), keyCollectionStageId: null }, { ...available(), options: [] },
    { ...available(), status: "waiting_for_keys" }, { ...available(), status: "locked" },
    { ...available(), status: "unknown" }, { ...available(), options: [...EXECUTION_CHOICE_OPTIONS].reverse() },
    { ...available(), options: EXECUTION_CHOICE_OPTIONS.map(option => ({ ...option, definitionVersion: 2 })) }
  ])("rejects unsafe or unsupported projection %#", value => {
    expect(isExecutionChoiceView(value)).toBe(false);
  });
});
