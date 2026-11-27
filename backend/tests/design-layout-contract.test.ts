import { describe, expect, it } from "vitest";
import { isDesignLayoutRequirements, requiredDesignLayoutTypes, type DesignLayoutRequirements } from "../src/contracts/design-layout-requirements.js";
import { executionChoiceOption, type ExecutionChoiceOptionId } from "../src/contracts/project-execution-choice.js";

function requirements(optionId: ExecutionChoiceOptionId = "option_1"): DesignLayoutRequirements {
  const option = executionChoiceOption(optionId);
  const required = requiredDesignLayoutTypes(optionId);
  return {
    status: "selected", choice: { optionId, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T08:00:00.000Z" },
    designPlanVersion: 0, allowedTypes: required, requiredTypes: required,
    coverage: required.map(layoutType => ({ layoutType, uploadIds: [`${layoutType}-root`], qualifyingUploadIds: [`${layoutType}-root`], state: "ready" })),
    unclassifiedUploadIds: [], missingTypes: [], coverageComplete: true, blockingReasons: [], revisionKey: "current-layout-evidence"
  };
}

describe("shared design layout requirements", () => {
  it("derives the two different requirements from the permanent choices", () => {
    expect(requiredDesignLayoutTypes("option_1")).toEqual(["layout_2d", "layout_3d"]);
    expect(requiredDesignLayoutTypes("option_2")).toEqual(["layout_3d"]);
    expect(isDesignLayoutRequirements(requirements())).toBe(true);
    expect(isDesignLayoutRequirements(requirements("option_2"))).toBe(true);
  });

  it("accepts a missing required root without implying complete submission readiness", () => {
    const value = requirements();
    value.coverage[0] = { layoutType: "layout_2d", uploadIds: [], qualifyingUploadIds: [], state: "missing" };
    value.missingTypes = ["layout_2d"];
    value.coverageComplete = false;
    expect(isDesignLayoutRequirements(value)).toBe(true);
    expect(isDesignLayoutRequirements({ ...value, coverageComplete: true })).toBe(false);
    expect(isDesignLayoutRequirements({ ...value, missingTypes: [] })).toBe(false);
  });

  it("does not accept one original file as both 2D and 3D", () => {
    const value = requirements();
    value.coverage[1] = { ...value.coverage[1]!, uploadIds: value.coverage[0]!.uploadIds, qualifyingUploadIds: value.coverage[0]!.qualifyingUploadIds };
    expect(isDesignLayoutRequirements(value)).toBe(false);
  });

  it.each(["not_applicable", "waiting_for_choice", "unavailable"] as const)("validates %s without inventing an option", status => {
    const value: DesignLayoutRequirements = { ...requirements(), status, choice: null, allowedTypes: [], requiredTypes: [], coverage: [], missingTypes: [], coverageComplete: status === "not_applicable" };
    expect(isDesignLayoutRequirements(value)).toBe(true);
    expect(isDesignLayoutRequirements({ ...value, choice: requirements().choice })).toBe(false);
    if (status !== "not_applicable") expect(isDesignLayoutRequirements({ ...value, coverageComplete: true })).toBe(false);
  });

  it.each([
    undefined, null, {},
    { ...requirements(), designPlanVersion: -1 },
    { ...requirements(), designPlanVersion: 1.5 },
    { ...requirements(), choice: { ...requirements().choice!, optionId: "option_9" } },
    { ...requirements(), choice: { ...requirements().choice!, phases: [] } },
    { ...requirements("option_2"), allowedTypes: ["layout_2d", "layout_3d"] },
    { ...requirements(), unclassifiedUploadIds: ["legacy-root"] },
    { ...requirements(), blockingReasons: ["Not ready"] },
    { ...requirements(), revisionKey: "" },
    { ...requirements(), coverage: [{ layoutType: "layout_2d", uploadIds: [], qualifyingUploadIds: ["foreign-root"], state: "ready" }, requirements().coverage[1]] }
  ])("rejects unsupported or internally inconsistent requirements %#", value => {
    expect(isDesignLayoutRequirements(value)).toBe(false);
  });
});
