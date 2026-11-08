import { describe, expect, it } from "vitest";
import { emptyDesignWorkflowState, workflowClientKickoffCompleted, workflowStageStartAt, workflowStageTimingStartAt,
  workflowStageHistoricalPrerequisiteBlockers, workflowSubmissionBlockers, type DesignWorkflowState } from "../src/domain/design-workflow-state.js";

const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`;
function skipped(projectId: string): DesignWorkflowState {
  return { ...emptyDesignWorkflowState(projectId), initialPaymentAt: at(1), stages: {
    internal_kickoff: { completedAt: at(2) }, client_kickoff: { completedAt: at(3), notRequired: true, timingBasis: "sequential" },
    key_collection: { completedAt: at(4), handedOverAt: at(4), receivedAt: at(4) },
    site_measurement: { completedAt: at(5), timingBasis: "sequential" }
  } };
}
function recovered(): DesignWorkflowState {
  const state = skipped("recovered-project");
  state.stages.client_kickoff = { completedAt: at(10), timingBasis: "sequential" };
  state.history.push({ id: "recovery", idempotencyKey: "recovery-key", requestHash: "hash", action: "client_kickoff_complete",
    stageId: "kickoff-stage", actorId: "client", actorName: "Client", actorRole: "client", onBehalfOfClient: false,
    at: at(10), note: "Completed", proof: null,
    data: { completedAt: at(10), supersededClientKickoff: { completedAt: at(3), timingBasis: "sequential" } } });
  return state;
}

describe("mandatory kickoff eligibility and historical timing", () => {
  it("keeps two unequal projects independent and never authorizes from a skip clock", () => {
    const skippedProject = skipped("skipped-project");
    const completedProject = skipped("completed-project");
    completedProject.stages.client_kickoff = { completedAt: at(6) };
    const before = structuredClone(skippedProject);
    expect(workflowClientKickoffCompleted(skippedProject)).toBe(false);
    expect(workflowClientKickoffCompleted(completedProject)).toBe(true);
    expect(workflowStageStartAt(skippedProject, "site_measurement", Date.parse(at(12)))).toBeNull();
    expect(workflowStageTimingStartAt(skippedProject, "site_measurement", Date.parse(at(12)))).toBe(at(4));
    expect(workflowStageStartAt(completedProject, "site_measurement", Date.parse(at(12)))).toBe(at(6));
    expect(workflowSubmissionBlockers(skippedProject, undefined, "upload")).toContain("Complete Client Kick off.");
    expect(workflowSubmissionBlockers(completedProject, undefined, "upload")).not.toContain("Complete Client Kick off.");
    expect(workflowStageHistoricalPrerequisiteBlockers(skippedProject, "site_measurement", at(5))).toEqual([]);
    expect(workflowStageHistoricalPrerequisiteBlockers(skippedProject, "site_measurement", at(2))).toContain("Complete Client Kick off before starting this stage.");
    expect(skippedProject).toEqual(before);
  });

  it("preserves established starts after recovery, but starts later prerequisites at their real confirmation", () => {
    const state = recovered();
    expect(workflowStageStartAt(state, "site_measurement", Date.parse(at(12)))).toBe(at(10));
    expect(workflowStageTimingStartAt(state, "site_measurement", Date.parse(at(12)))).toBe(at(4));
    expect(workflowStageHistoricalPrerequisiteBlockers(state, "site_measurement", at(5))).toEqual([]);
    state.stages.key_collection = { completedAt: at(11), handedOverAt: at(4), receivedAt: at(11) };
    expect(workflowStageTimingStartAt(state, "site_measurement", Date.parse(at(12)))).toBe(at(11));
  });

  it("ignores ambiguous or unbound recovery history when deriving timing", () => {
    const state = recovered();
    state.history.push({ ...state.history[0]!, id: "duplicate" });
    expect(workflowStageTimingStartAt(state, "site_measurement", Date.parse(at(12)))).toBe(at(10));
    state.history.pop();
    state.history[0]!.data!.completedAt = at(9);
    expect(workflowStageTimingStartAt(state, "site_measurement", Date.parse(at(12)))).toBe(at(10));
  });
});
