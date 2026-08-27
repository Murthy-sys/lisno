import { describe, expect, it } from "vitest";
import { ROLE_CODES } from "../api/authorization-contract";
import { getRoleFeedback } from "./roleFeedback";

describe("getRoleFeedback", () => {
  it.each(ROLE_CODES)("returns defined safe feedback for %s", (role) => {
    expect(getRoleFeedback(role, { situation: "workspaceLoading" })).toEqual(
      expect.any(String)
    );
    expect(getRoleFeedback(role, { situation: "clearState" }).length).toBeGreaterThan(0);
    expect(
      getRoleFeedback(role, { situation: "requestedChanges", count: 2 }).length
    ).toBeGreaterThan(0);
  });

  it.each([
    ["designer", "workspaceLoading", "Loading your projects, priorities, and client feedback…"],
    ["designer", "clearState", "You’re clear—no urgent tasks need attention."],
    ["designer", "conflict", "A newer version is available. Review the refreshed values before saving again."],
    ["design_manager", "workspaceLoading", "Loading your team, workload, and approval queue…"],
    ["design_manager", "clearState", "No team actions need attention right now."],
    ["design_manager", "conflict", "The record changed. Review the latest details before trying again."],
    ["design_head", "workspaceLoading", "Loading managers, team health, and evaluation coverage…"],
    ["design_head", "clearState", "All teams are currently within delivery thresholds."],
    ["design_head", "conflict", "This inspection changed while it was open. Refresh to continue."],
    ["estimator_sales", "workspaceLoading", "Loading leads, estimates, and client feedback…"],
    ["estimator_sales", "clearState", "No client feedback needs action."],
    ["estimator_sales", "conflict", "The request changed. Review the latest targets before resubmitting."],
    ["client", "workspaceLoading", "Loading your projects and items for review…"],
    ["client", "clearState", "Nothing needs your review right now."],
    ["client", "conflict", "This item was updated. We’ve refreshed the latest version for you."],
  ] as const)("returns the approved %s %s message", (role, situation, expected) => {
    expect(getRoleFeedback(role, { situation })).toBe(expected);
  });

  it.each([
    ["designer", "requestedChanges", 0, "No client-requested section updates are open. Approved sections remain locked."],
    ["designer", "requestedChanges", 1, "Client requested an update to 1 section. Approved sections remain locked."],
    ["designer", "requestedChanges", 2, "Client requested updates to 2 sections. Approved sections remain locked."],
    ["designer", "replacementReady", 0, "No updated sections are ready to submit."],
    ["designer", "replacementReady", 1, "1 updated section is ready to submit."],
    ["designer", "replacementReady", 2, "2 updated sections are ready to submit."],
    ["design_manager", "requestedChanges", 0, "No revised sections are waiting for review."],
    ["design_manager", "requestedChanges", 1, "Review is waiting for 1 revised section."],
    ["design_manager", "requestedChanges", 2, "Review is waiting for 2 revised sections."],
    ["design_manager", "replacementReady", 0, "No revised sections are ready for delivery review."],
    ["design_manager", "replacementReady", 1, "1 revised section is ready for delivery review."],
    ["design_manager", "replacementReady", 2, "2 revised sections are ready for delivery review."],
    ["design_head", "requestedChanges", 0, "No requested revisions are affecting delivery health."],
    ["design_head", "requestedChanges", 1, "1 requested revision is affecting delivery health."],
    ["design_head", "requestedChanges", 2, "2 requested revisions are affecting delivery health."],
    ["design_head", "replacementReady", 0, "No updated sections are moving through approval."],
    ["design_head", "replacementReady", 1, "1 updated section is moving back through approval."],
    ["design_head", "replacementReady", 2, "2 updated sections are moving back through approval."],
    ["estimator_sales", "requestedChanges", 0, "No client feedback needs section updates."],
    ["estimator_sales", "requestedChanges", 1, "Client feedback to resolve in 1 section."],
    ["estimator_sales", "requestedChanges", 2, "Client feedback to resolve in 2 sections."],
    ["estimator_sales", "replacementReady", 0, "No replacements are ready to send."],
    ["estimator_sales", "replacementReady", 1, "1 replacement is ready to send."],
    ["estimator_sales", "replacementReady", 2, "2 replacements are ready to send."],
    ["client", "requestedChanges", 0, "No image changes are awaiting an update."],
    ["client", "requestedChanges", 1, "Changes sent for 1 section. We’ll notify you when the updated image is ready."],
    ["client", "requestedChanges", 2, "Changes sent for 2 sections. We’ll notify you when the updated images are ready."],
    ["client", "replacementReady", 0, "No updated images are waiting for review."],
    ["client", "replacementReady", 1, "Image updated — please review and approve."],
    ["client", "replacementReady", 2, "2 images updated — please review and approve."],
  ] as const)("uses approved %s %s copy for %i items", (role, situation, count, expected) => {
    expect(getRoleFeedback(role, { situation, count })).toBe(expected);
  });

  it.each([-1, 1.5])( "rejects invalid counts", (count) => {
    expect(() => getRoleFeedback("client", { situation: "replacementReady", count })).toThrow(RangeError);
  });
});
