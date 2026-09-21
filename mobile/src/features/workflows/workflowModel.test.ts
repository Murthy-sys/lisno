import { actionDateData, isNativeWorkflowAction, workflowActionNeedsNote } from "./workflowModel";

describe("native workflow actions", () => {
  it("only enables actions with complete native contracts", () => {
    expect(isNativeWorkflowAction("keys_received")).toBe(true);
    expect(isNativeWorkflowAction("measurement_complete")).toBe(false);
    expect(isNativeWorkflowAction("furniture_upload")).toBe(false);
  });

  it("builds the exact date fields and note requirements", () => {
    expect(actionDateData("client_kickoff_request", "2026-09-20T10:00:00+05:30")).toEqual({ preferredAt: "2026-09-20T04:30:00.000Z" });
    expect(actionDateData("internal_kickoff_complete", "invalid")).toBeNull();
    expect(workflowActionNeedsNote("measurement_access_block")).toBe(true);
  });
});
