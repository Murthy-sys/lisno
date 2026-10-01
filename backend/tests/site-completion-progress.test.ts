import { describe, expect, it } from "vitest";
import { isSiteVerifiedAssignment, needsSiteReverification } from "../src/services/site-completion-progress.js";

const first = { _id: "assignment-a", createdAt: new Date("2026-09-01T00:00:00Z") };
const second = { _id: "assignment-b", createdAt: new Date("2026-09-02T00:00:00Z") };

describe("Site Manager vendor work verification", () => {
  it("binds 100% to saved assignment IDs and requires re-verification after scope changes", () => {
    const site = { progress: 100, updatedAt: new Date("2026-09-01T12:00:00Z"), verifiedAssignmentIds: [first._id] };
    expect(isSiteVerifiedAssignment(site, first)).toBe(true);
    expect(isSiteVerifiedAssignment(site, second)).toBe(false);
    expect(needsSiteReverification(site, [first])).toBe(false);
    expect(needsSiteReverification(site, [first, second])).toBe(true);
    expect(needsSiteReverification(site, [])).toBe(true);
    expect(isSiteVerifiedAssignment({ ...site, progress: 0 }, first)).toBe(false);
  });

  it("preserves the verified work of older 100% states without granting it to new assignments", () => {
    const legacy = { progress: 100, updatedAt: new Date("2026-09-01T12:00:00Z"), verifiedAssignmentIds: null };
    expect(isSiteVerifiedAssignment(legacy, first)).toBe(true);
    expect(isSiteVerifiedAssignment(legacy, second)).toBe(false);
    expect(needsSiteReverification(legacy, [first])).toBe(false);
    expect(needsSiteReverification(legacy, [first, second])).toBe(true);
  });
});
