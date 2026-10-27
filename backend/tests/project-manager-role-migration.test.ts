import { describe, expect, it, vi } from "vitest";
import { buildProjectManagerRoleManifest, COLLECTIONS as C, createProjectManagerRoleInventory, digest, fingerprint, sortSnapshot,
  type InventoryState, type NativeDb, type OwnerResolution, type Row } from "../src/migrations/project-manager-role-inventory.js";
import { parseMigrationArgs } from "../src/migrations/project-manager-role-migration.js";

const now = new Date("2026-10-27T10:00:00Z");
const target = { id: "disposable-fixture", database: "fixture", clusterDigest: "fixture-cluster" };
function fixture(): InventoryState {
  return { snapshot: [], rows: new Map([
    [C.users, [{ _id: "admin", role: "super_admin", active: true, version: 3, sessionVersion: 4 },
      { _id: "old", role: "program_manager", active: true, version: 3, sessionVersion: 4, email: "private@example.test", passwordHash: "do-not-print" },
      { _id: "site", role: "site_manager", active: true, version: 1, sessionVersion: 1 }]],
    [C.projects, [{ _id: "p", status: "active", programManagerId: "old", procurementIdentityVersion: 3 }]],
    [C.tasks, [{ _id: "t", projectId: "p", estimateId: "e", kind: "site_execution", assigneeRole: "site_manager",
      assigneeUserId: "old", version: 2, designPlanVersion: 1, preparationOnly: false, status: "open" }]],
    [C.estimates, [{ _id: "e", projectId: "p", status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1 }]]
  ]) };
}
function manifest(state: InventoryState, resolutions?: OwnerResolution[]) {
  state.snapshot = sortSnapshot([...state.rows].flatMap(([collection, rows]) => rows.map(row => fingerprint(collection, row))));
  return buildProjectManagerRoleManifest({ state, target, now, resolutions });
}
const row = (state: InventoryState, name: string): Row => state.rows.get(name)![0]!;
const codes = (state: InventoryState) => manifest(state).conflicts.map(conflict => conflict.code);

describe("Project Manager role migration inventory", () => {
  it("plans one atomic identity/project cohort without exposing credentials or changing an unchanged task", () => {
    const result = manifest(fixture());
    expect(result.conflicts).toEqual([]);
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0]).toMatchObject({ userIds: ["old"], projectIds: ["p"] });
    expect(result.assignmentSnapshots[0]).toMatchObject({ projectId: "p", projectVersion: 3, tasks: [{ id: "t", version: 2, assigneeUserId: "old" }] });
    expect(result.userSnapshots).toEqual([{ id: "old", role: "program_manager", active: true, version: 3, sessionVersion: 4 }]);
    expect(result.cohorts[0]!.changes.map(change => change.collection).sort()).toEqual([C.projects, C.users].sort());
    expect(JSON.stringify(result)).not.toMatch(/private@example|do-not-print/);
  });
  it("fills one-sided assignments, without generating missing tasks or rewriting existing task actors", () => {
    const onlyTask = fixture(); row(onlyTask, C.projects).programManagerId = null;
    expect(manifest(onlyTask).cohorts[0]!.changes.some(change => change.collection === C.tasks)).toBe(false);
    const onlyScalar = fixture(); row(onlyScalar, C.tasks).assigneeUserId = null;
    expect(manifest(onlyScalar).cohorts[0]!.changes.find(change => change.collection === C.tasks)?.after.assigneeUserId).toEqual({ present: true, value: "old" });
    onlyScalar.rows.set(C.tasks, []);
    expect(manifest(onlyScalar).cohorts[0]!.changes.some(change => change.collection === C.tasks)).toBe(false);
  });
  it.each([
    ["different owners", (s: InventoryState) => { row(s, C.tasks).assigneeUserId = "site"; }, "ASSIGNMENT_MISMATCH"],
    ["duplicate tasks", (s: InventoryState) => { s.rows.get(C.tasks)!.push({ ...row(s, C.tasks), _id: "t2" }); }, "SITE_TASK_AMBIGUOUS"],
    ["missing owner", (s: InventoryState) => { s.rows.set(C.users, []); }, "OWNER_MISSING_OR_INACTIVE"],
    ["inactive assigned owner", (s: InventoryState) => { s.rows.get(C.users)![1]!.active = false; }, "OWNER_MISSING_OR_INACTIVE"],
    ["unsupported task role", (s: InventoryState) => { row(s, C.tasks).assigneeRole = "program_manager"; }, "SITE_TASK_INVALID"],
    ["wrong source version", (s: InventoryState) => { row(s, C.tasks).designPlanVersion = 2; }, "SITE_SOURCE_INVALID"],
    ["ambiguous source", (s: InventoryState) => { s.rows.get(C.estimates)!.push({ ...row(s, C.estimates), _id: "e2" }); }, "SITE_SOURCE_INVALID"],
    ["missing source", (s: InventoryState) => { s.rows.set(C.estimates, []); }, "SITE_SOURCE_INVALID"],
    ["completed missing actor", (s: InventoryState) => { Object.assign(row(s, C.tasks), { status: "completed", assigneeUserId: null }); }, "ASSIGNMENT_MISMATCH"],
    ["malformed fence", (s: InventoryState) => { row(s, C.projects).purchaseOrderApprovalEpoch = "2"; }, "INVALID_FENCE_VERSION"],
    ["invalid user version", (s: InventoryState) => { s.rows.get(C.users)![1]!.sessionVersion = Number.MAX_SAFE_INTEGER; }, "INVALID_USER_VERSION"]
  ])("blocks %s", (_label, mutate, expected) => {
    const state = fixture(); (mutate as (state: InventoryState) => void)(state);
    expect(codes(state)).toContain(expected);
  });
  it("preserves inactive unassigned identities and completed/superseded actor history", () => {
    const state = fixture(); state.rows.get(C.users)!.push({ _id: "inactive", role: "program_manager", active: false, version: 1, sessionVersion: 1 });
    row(state, C.tasks).status = "completed";
    state.rows.get(C.tasks)!.push({ ...row(state, C.tasks), _id: "superseded", assigneeUserId: "historic", supersededAt: now });
    const result = manifest(state);
    expect(result.conflicts).toEqual([]);
    expect(result.cohorts.flatMap(cohort => cohort.changes).filter(change => change.collection === C.tasks)).toEqual([]);
    expect(result.cohorts.flatMap(cohort => cohort.changes).find(change => change.id === "inactive")?.after).not.toHaveProperty("active");
  });
  it("validates preparation sources without promoting them into execution", () => {
    const state = fixture(); Object.assign(row(state, C.tasks), { preparationOnly: true, designPlanVersion: 0 });
    Object.assign(row(state, C.estimates), { status: "draft", designPlanStatus: null, designPlanVersion: 0,
      estimation: { workflowVersion: 2, preApproval: { reviewRoundId: "round", estimateVersion: 1 } } });
    expect(manifest(state).conflicts).toEqual([]);
    delete row(state, C.estimates).estimation.preApproval;
    expect(codes(state)).toContain("SITE_SOURCE_INVALID");
  });
  it("requires reviewed stable-ID mapping to resolve owner conflict and keeps dependent owners together", () => {
    const state = fixture(); row(state, C.tasks).assigneeUserId = "site";
    const resolution = { projectId: "p", ownerId: "site", reviewedById: "admin", reason: "Reviewed project ownership" };
    const result = manifest(state, [resolution]);
    expect(result.conflicts).toEqual([]);
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0]!.userIds).toEqual(["old", "site"]);
    expect(result.resolutions).toEqual([resolution]);
    expect(manifest(state, [{ ...resolution, reviewedById: "site" }]).conflicts.map(value => value.code)).toContain("INVALID_REVIEWED_RESOLUTION");
    row(state, C.tasks).status = "completed";
    expect(manifest(state, [resolution]).conflicts.map(value => value.code)).toContain("RESOLUTION_NOT_APPLICABLE");
  });
  it("blocks duplicate active Super Admin identities and their reviewed resolutions", () => {
    const state = fixture(); row(state, C.tasks).assigneeUserId = "site";
    state.rows.get(C.users)!.push({ _id: "second-admin", role: "super_admin", active: true, version: 1, sessionVersion: 1 });
    const result = manifest(state, [{ projectId: "p", ownerId: "site", reviewedById: "admin", reason: "Reviewed" }]);
    expect(result.conflicts.map(conflict => conflict.code)).toContain("SOLE_ACTIVE_SUPER_ADMIN_REQUIRED");
    expect(result.conflicts.map(conflict => conflict.code)).toContain("INVALID_REVIEWED_RESOLUTION");
    state.rows.get(C.users)!.find(user => user._id === "second-admin")!.active = false;
    expect(manifest(state, [{ projectId: "p", ownerId: "site", reviewedById: "admin", reason: "Reviewed" }]).conflicts).toEqual([]);
  });
  it("anchors completion locks to current state and current round, preserving historical signatures", () => {
    const state = fixture(); state.rows.set(C.states, [{ _id: "state", projectId: "p", status: "pending_client", currentRound: 2 }]);
    state.rows.set(C.reviews, [{ _id: "r1", projectId: "p", round: 1, status: "approved", managerId: "historic" },
      { _id: "r2", projectId: "p", round: 2, status: "pending", managerId: "old" }]);
    expect(codes(state)).toEqual([]);
    state.rows.get(C.reviews)![1]!.managerId = "site";
    expect(codes(state)).toContain("REVIEW_OWNER_MISMATCH");
    state.rows.get(C.reviews)![1]!.status = "approved";
    expect(codes(state)).toContain("REVIEW_SOURCE_INVALID");
    row(state, C.states).status = "changes_requested";
    expect(codes(state)).toEqual([]);
  });
  it("blocks frozen procurement reviewer mismatch and usable legacy invitations", () => {
    const state = fixture(); state.rows.set(C.awards, [{ _id: "award", projectId: "p", status: "pending_approvals", currentProposalRevisionId: "proposal" }]);
    state.rows.set(C.proposals, [{ _id: "proposal", awardId: "award", projectId: "p", requiredSlots: ["program_manager"], programManagerId: "site" }]);
    expect(codes(state)).toContain("REVIEW_OWNER_MISMATCH");
    row(state, C.awards).status = "issued";
    state.rows.set(C.invitations, [{ _id: "invite", role: "program_manager", status: "pending", expiresAt: new Date(now.getTime() + 1000), tokenHash: "private-token" }]);
    expect(codes(state)).toEqual(["PENDING_LEGACY_INVITATION"]);
    row(state, C.invitations).status = "revoked";
    expect(codes(state)).toEqual([]);
  });
  it("performs only native reads and never initializes a model, collection or index", async () => {
    const state = fixture(); const write = vi.fn(() => { throw new Error("WRITE_FORBIDDEN"); });
    const db = { databaseName: "fixture", admin: () => ({ command: vi.fn(async () => ({ setName: "rs", hosts: ["fixture"] })) }),
      listCollections: vi.fn(() => ({ toArray: async () => [...state.rows.keys()].map(name => ({ name })) })),
      collection: vi.fn((name: string) => ({ find: vi.fn(() => ({ toArray: async () => state.rows.get(name) ?? [] })),
        insertOne: write, updateOne: write, createIndex: write, deleteMany: write })), createCollection: write } as unknown as NativeDb;
    const before = digest([...state.rows]);
    await createProjectManagerRoleInventory({ db, targetId: "explicit", now });
    expect(write).not.toHaveBeenCalled(); expect(digest([...state.rows])).toBe(before);
    await expect(createProjectManagerRoleInventory({ db, targetId: "", now })).rejects.toThrow("EXPLICIT_TARGET_REQUIRED");
  });
  it("requires an explicit database/target/output and rejects unknown or duplicate CLI options", () => {
    expect(parseMigrationArgs(["--database", "fixture", "--target", "local", "--manifest", "/tmp/manifest.json"]).mode).toBeUndefined();
    expect(() => parseMigrationArgs(["--target", "local"])).toThrow("EXPLICIT_DATABASE_REQUIRED");
    expect(() => parseMigrationArgs(["--mode", "apply", "--mode", "dry-run"])).toThrow("INVALID_CLI_ARGUMENTS");
  });
});
