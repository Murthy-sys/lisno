import { describe, expect, it } from "vitest";
import { calculateWorkflowTimelines, calculateWorkflowWorkdays, defaultWorkflowTimelines } from "../src/contracts/workflow-timelines.js";

describe("Workflow timeline workday scenarios", () => {
  it("reproduces all 56 supplied default cells without persisting anything", () => {
    const result = defaultWorkflowTimelines();
    expect(result.matrices.design.map(row => row.workdays)).toEqual([
      [15, 17, 18, 20, 21, 23, 24], [20, 22, 24, 26, 28, 30, 32],
      [25, 28, 30, 33, 35, 38, 40], [30, 33, 36, 39, 42, 45, 48]
    ]);
    expect(result.matrices.execution.map(row => row.workdays)).toEqual([
      [40, 44, 48, 52, 56, 60, 64], [50, 55, 60, 65, 70, 75, 80],
      [70, 77, 84, 91, 98, 105, 112], [80, 88, 96, 104, 112, 120, 128]
    ]);
    expect(result).toMatchObject({ version: 0, updatedById: null, updatedAt: null, createdAt: null });
  });

  it("recalculates each row and phase independently from the base in stable band order", () => {
    const initial = defaultWorkflowTimelines();
    const bases = initial.bases.map(row => ({ ...row }));
    bases[0].designWorkdays = 17;
    bases[2].executionWorkdays = 73;
    const result = calculateWorkflowTimelines(bases.reverse());
    expect(result.design[0].workdays).toEqual([17, 19, 21, 23, 24, 26, 28]);
    expect(result.execution[2].workdays).toEqual([73, 81, 88, 95, 103, 110, 117]);
    expect(result.design.slice(1)).toEqual(initial.matrices.design.slice(1));
    expect(result.execution[0]).toEqual(initial.matrices.execution[0]);
    expect(defaultWorkflowTimelines()).toEqual(initial);
  });

  it("handles supported limits and rejects invalid bases or incomplete bands", () => {
    expect(calculateWorkflowWorkdays(1, 5)).toBe(2);
    expect(calculateWorkflowWorkdays(3650, 30)).toBe(5840);
    for (const value of [0, -1, 1.5, NaN, Infinity, 3651]) expect(() => calculateWorkflowWorkdays(value, 0)).toThrow(RangeError);
    const bases = defaultWorkflowTimelines().bases;
    expect(() => calculateWorkflowTimelines(bases.slice(1))).toThrow(RangeError);
    expect(() => calculateWorkflowTimelines([bases[0], bases[0], bases[2], bases[3]])).toThrow(RangeError);
  });
});
