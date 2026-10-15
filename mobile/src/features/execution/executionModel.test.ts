import { buildExecutionCommand, buildPolicyCommand, makeDraft, percentage, validDate } from "./executionModel";
import type { ExecutionPolicy, ExecutionWork } from "./executionTypes";
const work = { id: "work/a", projectId: "project-a", version: 7, progress: 25, status: "in_progress", tracking: "tracked", allowedActions: ["report", "submit", "verify", "request_changes", "propose_schedule", "confirm_schedule", "hold", "resume", "exempt_evidence", "acknowledge", "setup"], imageIds: ["image/a"], submission: { id: "submission/a" }, evidenceExemption: null } as unknown as ExecutionWork;
it("pins all execution commands to the observed version and exact submission/evidence identities", () => {
  for (const action of ["setup", "acknowledge", "verify"] as const) expect(buildExecutionCommand(work, makeDraft(work, action), "same-command")).toMatchObject({ action, expectedVersion: 7, idempotencyKey: "same-command" });
  expect(buildExecutionCommand(work, { ...makeDraft(work, "report"), progress: "29", note: "Fixed the measured frame" }, "same-command")).toEqual({ action: "report", expectedVersion: 7, idempotencyKey: "same-command", progress: 29, status: "in_progress", note: "Fixed the measured frame", imageIds: ["image/a"] });
  expect(buildExecutionCommand(work, makeDraft(work, "verify"), "same-command").submissionId).toBe("submission/a");
});
it("rejects stale commands, revoked actions and changed review submissions", () => {
  expect(() => buildExecutionCommand({ ...work, version: 8 }, makeDraft(work, "report"), "same-command")).toThrow("changed");
  expect(() => buildExecutionCommand({ ...work, allowedActions: [] }, makeDraft(work, "acknowledge"), "same-command")).toThrow("no longer");
  expect(() => buildExecutionCommand(work, { ...makeDraft(work, "verify"), submissionId: "old-submission" }, "same-command")).toThrow("submission");
});
it("requires blocker resolution and reasons for regression, holds, rework and exemptions", () => {
  expect(() => buildExecutionCommand(work, { ...makeDraft(work, "report"), progress: "25", note: "No change" }, "same-command")).toThrow("reason");
  expect(() => buildExecutionCommand(work, { ...makeDraft(work, "report"), progress: "29", status: "blocked", note: "No access", reason: "Site locked" }, "same-command")).toThrow("next action");
  for (const action of ["request_changes", "hold", "resume", "exempt_evidence"] as const) expect(() => buildExecutionCommand(work, makeDraft(work, action), "same-command")).toThrow("reason");
  expect(buildExecutionCommand(work, { ...makeDraft(work, "hold"), reason: "Awaiting electrician", reviewDate: "2026-11-08" }, "same-command")).toMatchObject({ reviewDate: "2026-11-08", reason: "Awaiting electrician" });
});
it("enforces current round evidence and saved 100 percent before submission", () => {
  expect(() => buildExecutionCommand(work, { ...makeDraft(work, "submit"), note: "Ready" }, "same-command")).toThrow("100%");
  const complete = { ...work, progress: 100, imageIds: [] };
  expect(() => buildExecutionCommand(complete, { ...makeDraft(complete, "submit"), note: "Ready" }, "same-command")).toThrow("photo");
  expect(buildExecutionCommand({ ...complete, evidenceExemption: { reason: "Access restriction", grantedById: "site-manager" } }, { ...makeDraft(complete, "submit"), note: "Ready" }, "same-command").imageIds).toEqual([]);
});
it("validates calendar dates, commitments and integer progress without permissive numeric coercion", () => {
  expect(validDate("2026-02-30")).toBe(false); expect(validDate("2028-02-29")).toBe(true);
  for (const value of ["", "1.5", "1e2", "101", "-1"]) expect(() => percentage(value)).toThrow();
  expect(percentage("0")).toBe(0);
  expect(() => buildExecutionCommand(work, { ...makeDraft(work, "propose_schedule"), startDate: "2026-11-08", finishDate: "2026-11-07" }, "same-command")).toThrow("Finish");
});
it("validates prospective reporting policy shape and preserves version", () => {
  const policy: ExecutionPolicy = { projectId: "p", version: 4, timezone: "Asia/Kolkata", reminderTime: "09:00", deadlineTime: "18:00", escalationTime: "19:00", effectiveDate: "2026-11-09" };
  expect(buildPolicyCommand(policy, policy, "Earlier site start", "same-command")).toMatchObject({ expectedVersion: 4, effectiveDate: "2026-11-09", idempotencyKey: "same-command" });
  expect(() => buildPolicyCommand(policy, { ...policy, reminderTime: "25:00" }, "change", "same-command")).toThrow("HH:MM");
  expect(() => buildPolicyCommand(policy, { ...policy, version: 3 }, "change", "same-command")).toThrow("changed");
});
