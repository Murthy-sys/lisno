import { describe, expect, it } from "vitest";
import { COLLECTIONS as C, deserialize, digest } from "../src/migrations/project-manager-role-inventory.js";
import { buildAssignmentSyncManifest, normalizeSyncScope, SYNC_VERSION, syncManifestDigest } from "../src/migrations/project-manager-assignment-sync-inventory.js";
import { assignmentSyncFixture, refreshSyncSnapshot, syncAt, syncOwnerId, syncProjectIds, syncTarget } from "./helpers/project-manager-assignment-sync.js";

function fixture() {
  const { state, scope } = assignmentSyncFixture();
  const build = () => buildAssignmentSyncManifest({ state: refreshSyncSnapshot(state), scope, target: syncTarget, now: syncAt });
  return { state, scope, build };
}

describe("scoped Project Manager assignment synchronization inventory", () => {
  it("maps precisely five valid task-only projects and records seven outside projects and four preserved orphans", () => {
    const { state, build } = fixture(); const before = digest(state);
    const manifest = build();
    expect(manifest).toMatchObject({ applicationVersion: SYNC_VERSION, conflicts: [], summary: { selected: 5, toMap: 5, alreadyMapped: 0, outsideProjects: 7, preservedOrphans: 4 } });
    expect(manifest.changes).toHaveLength(6);
    expect(manifest.changes.filter(change => change.collection === C.projects).map(change => change.id)).toEqual(syncProjectIds);
    expect(manifest.changes.filter(change => change.collection === C.users).map(change => change.id)).toEqual([syncOwnerId]);
    expect(manifest.changes.some(change => change.collection === C.tasks)).toBe(false);
    for (const change of manifest.changes.filter(change => change.collection === C.projects)) expect(deserialize(change.after.programManagerId!.value)).toBe(syncOwnerId);
    const account = manifest.changes.find(change => change.collection === C.users)!;
    expect(Object.keys(account.after).sort()).toEqual(["sessionVersion", "updatedAt", "version"]);
    expect(Number(deserialize(account.after.sessionVersion!.value))).toBe(8);
    expect(manifest.digest).toBe(syncManifestDigest(manifest));
    expect(digest(state)).toBe(before);
    expect(JSON.stringify(manifest)).not.toMatch(/synthetic-private-hash|manager@example/);
  });
  it("treats a fully mapped scope as a no-op without proposing another session increment", () => {
    const { state, build } = fixture();
    for (const project of state.rows.get(C.projects)!.filter(row => syncProjectIds.includes(row._id))) project.programManagerId = syncOwnerId;
    expect(build()).toMatchObject({ conflicts: [], changes: [], summary: { selected: 5, toMap: 0, alreadyMapped: 5 } });
  });
  it("normalizes scope ordering and rejects duplicate or unknown scope input", () => {
    const { scope } = fixture();
    expect(normalizeSyncScope({ ...scope, projectIds: [...scope.projectIds].reverse() }).projectIds).toEqual(syncProjectIds);
    for (const invalid of [{ ...scope, projectIds: [scope.projectIds[0], scope.projectIds[0]] }, { ...scope, projectIds: [] },
      { ...scope, preservedOrphans: [...scope.preservedOrphans, scope.preservedOrphans[0]] }, { ...scope, allowAnyOrphan: true }]) {
      expect(() => normalizeSyncScope(invalid)).toThrow("INVALID_SYNC_SCOPE");
    }
  });
  it.each(["program_manager", "client", "vendor"])("refuses owner role %s instead of converting it", role => {
    const { state, build } = fixture(); state.rows.get(C.users)!.find(user => user._id === syncOwnerId)!.role = role;
    expect(build().conflicts).toContainEqual({ entityId: syncOwnerId, code: "ACTIVE_CANONICAL_OWNER_REQUIRED" });
  });
  it("refuses an inactive owner and a non-unique active Super Admin", () => {
    const { state, build } = fixture(); state.rows.get(C.users)!.find(user => user._id === syncOwnerId)!.active = false;
    state.rows.get(C.users)!.push({ _id: "second-admin", role: "super_admin", active: true });
    expect(build().conflicts).toEqual(expect.arrayContaining([
      { entityId: syncOwnerId, code: "ACTIVE_CANONICAL_OWNER_REQUIRED" }, { entityId: "authorization", code: "SOLE_ACTIVE_SUPER_ADMIN_REQUIRED" }
    ]));
  });
  it.each([
    ["different scalar owner", "ASSIGNMENT_MISMATCH", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.projects)![0]!.programManagerId = "sync-other-manager"; }],
    ["different task owner", "EXISTING_TASK_OWNER_REQUIRED", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.tasks)![0]!.assigneeUserId = "sync-other-manager"; }],
    ["duplicate current task", "SITE_TASK_AMBIGUOUS", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.tasks)!.push({ ...state.rows.get(C.tasks)![0], _id: "duplicate-task" }); }],
    ["unapproved source", "SITE_SOURCE_INVALID", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.estimates)![0]!.status = "draft"; }],
    ["missing source", "SITE_SOURCE_INVALID", (state: ReturnType<typeof fixture>["state"]) => { state.rows.set(C.estimates, state.rows.get(C.estimates)!.slice(1)); }],
    ["inactive project", "ACTIVE_PROJECT_REQUIRED", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.projects)![0]!.status = "completed"; }],
    ["invalid counter", "INVALID_PROJECT_FENCE_VERSION", (state: ReturnType<typeof fixture>["state"]) => { state.rows.get(C.projects)![0]!.siteCompletionFenceEpoch = Number.MAX_SAFE_INTEGER; }]
  ] as const)("reports %s without creating an execution task or choosing another owner", (_label, code, mutate) => {
    const { state, build } = fixture(); mutate(state);
    expect(build().conflicts).toContainEqual({ entityId: syncProjectIds[0], code });
  });
  it("honors current completion and frozen procurement reviewers but preserves superseded history", () => {
    const { state, build } = fixture();
    state.rows.get(C.reviews)![0]!.managerId = "sync-other-manager";
    state.rows.get(C.proposals)![0]!.programManagerId = "sync-other-manager";
    const manifest = build();
    expect(manifest.conflicts).toContainEqual({ entityId: syncProjectIds[1], code: "REVIEW_OWNER_MISMATCH" });
    expect(manifest.conflicts).toContainEqual({ entityId: syncProjectIds[2], code: "REVIEW_OWNER_MISMATCH" });
    expect(manifest.conflicts.some(conflict => conflict.entityId === syncProjectIds[0])).toBe(false);
  });
  it("requires an exact fingerprint acknowledgement for every current orphan, including completed records", () => {
    const { state, scope, build } = fixture(); scope.preservedOrphans.shift();
    expect(build().conflicts).toContainEqual({ entityId: "sync-orphan-1", code: "ORPHAN_ACKNOWLEDGEMENT_MISMATCH" });
    state.rows.get(C.tasks)!.find(task => task._id === "sync-orphan-2")!.version++;
    expect(build().conflicts).toContainEqual({ entityId: "sync-orphan-2", code: "ORPHAN_ACKNOWLEDGEMENT_MISMATCH" });
  });
  it("does not allow an orphan acknowledgement to hide a missing selected project or a surviving source", () => {
    const { state, scope, build } = fixture();
    scope.projectIds[0] = "missing-project-1";
    state.rows.get(C.estimates)!.push({ _id: "missing-estimate-1", projectId: "missing-project-1" });
    expect(build().conflicts).toEqual(expect.arrayContaining([
      { entityId: "missing-project-1", code: "PROJECT_MISSING" }, { entityId: "sync-orphan-1", code: "ORPHAN_ACKNOWLEDGEMENT_MISMATCH" }
    ]));
  });
});
