import { describe, expect, it } from "vitest";
import { classifyProjectManagerAssignment as classify, type ProjectManagerAssignmentFacts } from "../src/domain/project-manager-assignment.js";

function facts(): ProjectManagerAssignmentFacts {
  return { project: { id: "project-a", programManagerId: "site-a", procurementIdentityVersion: 3 },
    users: [{ id: "site-a", role: "site_manager", active: true }, { id: "site-b", role: "site_manager", active: true }],
    tasks: [{ id: "site-task-a", projectId: "project-a", estimateId: "estimate-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: "site-a", version: 2, designPlanVersion: 4, preparationOnly: false, status: "open" }],
    sources: [{ id: "estimate-a", projectId: "project-a", status: "client_approved", designPlanStatus: "approved", designPlanVersion: 4 }] };
}
describe("canonical Project Manager assignment classification", () => {
  it("keeps exact current ownership, including a completed same-owner task", () => {
    const input = facts();
    expect(classify(input)).toMatchObject({ state: "assigned", ownerId: "site-a", task: { id: "site-task-a" } });
    input.tasks[0]!.status = "completed";
    expect(classify(input).state).toBe("assigned");
  });
  it("permits scalar-only setup without creating or requiring a Site task", () => {
    expect(classify({ ...facts(), tasks: [], sources: [] })).toMatchObject({ state: "assigned", task: null, ownerId: "site-a" });
  });
  it("does not grant runtime authority from either one-sided task assignment", () => {
    const input = facts(); input.project!.programManagerId = null;
    expect(classify(input)).toMatchObject({ state: "conflict", reason: "ASSIGNMENT_SYNC_REQUIRED" });
    expect(classify(input, { mode: "migration" })).toMatchObject({ state: "assigned", ownerId: "site-a", needsSynchronization: true });
    input.project!.programManagerId = "site-a"; input.tasks[0]!.assigneeUserId = null;
    expect(classify(input).reason).toBe("ASSIGNMENT_SYNC_REQUIRED");
    expect(classify(input, { mode: "migration" })).toMatchObject({ ownerId: "site-a", needsSynchronization: true });
    input.tasks[0]!.status = "completed";
    expect(classify(input, { mode: "migration" }).reason).toBe("ASSIGNMENT_MISMATCH");
  });
  it("never picks a winner for conflicting owners or duplicate current tasks", () => {
    const input = facts(); input.tasks[0]!.assigneeUserId = "site-b";
    expect(classify(input, { mode: "migration" }).reason).toBe("ASSIGNMENT_MISMATCH");
    input.tasks = [...facts().tasks, { ...facts().tasks[0]!, id: "another" }];
    expect(classify(input).reason).toBe("SITE_TASK_AMBIGUOUS");
    input.tasks[1]!.supersededAt = "2026-10-01";
    expect(classify(input).state).toBe("assigned");
  });
  it.each(["missing", "inactive", "wrong-role", "legacy-runtime"])("denies %s owner", kind => {
    const input = facts();
    if (kind === "missing") input.users = [];
    else if (kind === "inactive") input.users[0]!.active = false;
    else input.users[0]!.role = kind === "wrong-role" ? "designer" : "program_manager";
    expect(classify(input).state).toBe("conflict");
    if (kind === "legacy-runtime") expect(classify(input, { mode: "migration" })).toMatchObject({ state: "assigned", needsSynchronization: true });
  });
  it.each(["wrong-estimate", "wrong-design", "missing-source", "duplicate-source", "wrong-project"])("rejects %s without timestamp fallbacks", kind => {
    const input = facts();
    if (kind === "wrong-estimate") input.tasks[0]!.estimateId = "other";
    if (kind === "wrong-design") input.tasks[0]!.designPlanVersion = 2;
    if (kind === "missing-source") input.sources = [];
    if (kind === "duplicate-source") input.sources = [...input.sources, { ...input.sources[0]!, id: "other" }];
    if (kind === "wrong-project") input.sources[0]!.projectId = "project-b";
    expect(classify(input).reason).toBe("SITE_SOURCE_INVALID");
  });
  it("accepts pre-approved preparation before final approval but checks active final lineage", () => {
    const input = facts(); input.tasks[0]!.preparationOnly = true; input.tasks[0]!.designPlanVersion = 0;
    input.sources = [{ id: "estimate-a", projectId: "project-a", status: "draft", designPlanStatus: "in_progress", designPlanVersion: 2,
      estimation: { workflowVersion: 2, preApproval: { reviewRoundId: "pre", estimateVersion: 1 }, designScopeRevision: 3 } }];
    expect(classify(input).state).toBe("assigned");
    input.tasks[0]!.preparationOnly = false; input.tasks[0]!.designPlanVersion = 2;
    expect(classify(input).reason).toBe("SITE_SOURCE_INVALID");
    Object.assign(input.sources[0]!, { status: "client_approved", designPlanStatus: "approved" });
    Object.assign(input.sources[0]!.estimation!, { finalApproval: { reviewRoundId: "final", estimateVersion: 7, designPlanVersion: 2, designScopeRevision: 3 }, approvedDesignScopeRevision: 3 });
    expect(classify(input).state).toBe("assigned");
    input.sources[0]!.estimation!.designScopeRevision = 4;
    expect(classify(input).reason).toBe("SITE_SOURCE_INVALID");
  });
  it("rejects a missing current review and malformed preparation or supersession", () => {
    expect(classify({ ...facts(), reviewStateInvalid: true }).reason).toBe("REVIEW_SOURCE_INVALID");
    const input = facts(); input.tasks[0]!.preparationOnly = true; input.tasks[0]!.status = "completed";
    expect(classify(input).reason).toBe("SITE_TASK_INVALID");
    input.tasks[0]!.supersededAt = "not-a-date";
    expect(classify(input).reason).toBe("SITE_TASK_INVALID");
  });
  it("preserves frozen Site review owner rather than transferring approval", () => {
    const input = facts(); input.lockedReviewOwnerIds = ["site-b"];
    expect(classify(input, { mode: "migration" }).reason).toBe("REVIEW_OWNER_MISMATCH");
  });
});
