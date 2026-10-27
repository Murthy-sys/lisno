import { COLLECTIONS as C, fingerprint, sortSnapshot, type InventoryState, type Row, type Target } from "../../src/migrations/project-manager-role-inventory.js";
import type { AssignmentSyncScope } from "../../src/migrations/project-manager-assignment-sync-inventory.js";

export const syncAt = new Date("2026-10-27T10:00:00.000Z");
export const syncOwnerId = "sync-manager";
export const syncOtherId = "sync-other-manager";
export const syncActorId = "sync-super-admin";
export const syncProjectIds = Array.from({ length: 5 }, (_, index) => `sync-project-${index + 1}`);
export const syncTarget: Target = { id: "disposable-assignment-sync", database: "assignment_sync_fixture", clusterDigest: "a".repeat(64) };

export function assignmentSyncFixture(): { state: InventoryState; scope: AssignmentSyncScope } {
  const users: Row[] = [
    { _id: syncActorId, name: "Fixture administrator", email: "admin@example.test", role: "super_admin", active: true, version: 1, sessionVersion: 1 },
    { _id: syncOwnerId, name: "Fixture manager", email: "manager@example.test", emailNormalized: "manager@example.test", role: "site_manager", active: true,
      version: 3, sessionVersion: 7, accountKind: "standard", passwordHash: "synthetic-private-hash" },
    { _id: syncOtherId, name: "Other fixture manager", email: "other@example.test", role: "site_manager", active: true, version: 1, sessionVersion: 1 }
  ];
  const projects: Row[] = Array.from({ length: 12 }, (_, index) => ({ _id: `sync-project-${index + 1}`, name: `Synthetic project ${index + 1}`,
    status: "active", clientName: `Synthetic client ${index + 1}`, location: "Fixture city", plannedStartAt: syncAt, plannedEndAt: new Date("2026-12-01T00:00:00Z"),
    ...(index === 0 ? {} : { programManagerId: null }), procurementIdentityVersion: index + 1, purchaseOrderApprovalEpoch: index + 2,
    siteCompletionFenceEpoch: index + 3, updatedAt: syncAt }));
  const tasks: Row[] = syncProjectIds.map((projectId, index) => ({ _id: `sync-task-${index + 1}`, projectId, estimateId: `sync-estimate-${index + 1}`,
    kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: syncOwnerId, version: index + 2, awardApprovalEpoch: index,
    designPlanVersion: 1, preparationOnly: false, status: "open", supersededAt: null, openedAt: syncAt, dueAt: syncAt, originalDeadline: syncAt }));
  tasks.push({ _id: "sync-historical-task", projectId: syncProjectIds[0], estimateId: "old-estimate", kind: "site_execution", assigneeRole: "site_manager",
    assigneeUserId: "historic-manager", version: 8, designPlanVersion: 1, status: "completed", supersededAt: syncAt, completedAt: syncAt });
  const orphans: Row[] = Array.from({ length: 4 }, (_, index) => ({ _id: `sync-orphan-${index + 1}`, projectId: `missing-project-${index + 1}`,
    estimateId: `missing-estimate-${index + 1}`, kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: index < 2 ? syncOwnerId : null,
    version: index + 1, designPlanVersion: 1, status: index === 0 ? "completed" : "open", supersededAt: null, completedAt: index === 0 ? syncAt : null }));
  tasks.push(...orphans);
  const estimates = syncProjectIds.map((projectId, index) => ({ _id: `sync-estimate-${index + 1}`, projectId, status: "client_approved", designPlanStatus: "approved",
    designPlanVersion: 1, version: 2, immutableApproval: { actorId: "fixture-client", amountPaise: 150000 + index * 701, signature: `signature-${index}` } }));
  const rows = new Map<string, Row[]>([
    [C.users, users], [C.projects, projects], [C.tasks, tasks], [C.estimates, estimates],
    [C.states, [{ _id: "sync-current-completion", projectId: syncProjectIds[1], currentRound: 2, status: "pending_client" }]],
    [C.reviews, [
      { _id: "sync-current-review", projectId: syncProjectIds[1], round: 2, status: "pending", managerId: syncOwnerId },
      { _id: "sync-old-review", projectId: syncProjectIds[0], round: 1, status: "approved", managerId: "historic-manager", signature: "do-not-change" }
    ]],
    [C.awards, [{ _id: "sync-current-award", projectId: syncProjectIds[2], status: "pending_approvals", currentProposalRevisionId: "sync-current-proposal" }]],
    [C.proposals, [{ _id: "sync-current-proposal", projectId: syncProjectIds[2], awardId: "sync-current-award", requiredSlots: ["program_manager"], programManagerId: syncOwnerId, immutableSignature: "retain-slot-and-actor" }]],
    ["syncSignedQualityHistory", [{ _id: "quality-history", projectId: syncProjectIds[0], signedById: "historic-manager", signedAt: syncAt, result: "findings" }]],
    ["syncFinancialHistory", [{ _id: "finance-history", projectId: syncProjectIds[0], approvedNetPaise: 1247891, originalDeadline: syncAt }]]
  ]);
  const state = refreshSyncSnapshot({ rows, snapshot: [] });
  const scope: AssignmentSyncScope = { ownerId: syncOwnerId, projectIds: [...syncProjectIds],
    preservedOrphans: orphans.map(row => ({ id: String(row._id), digest: fingerprint(C.tasks, row).digest })) };
  return { state, scope };
}

export function refreshSyncSnapshot(state: InventoryState): InventoryState {
  state.snapshot = sortSnapshot([...state.rows].flatMap(([collection, rows]) => rows.map(row => fingerprint(collection, row))));
  return state;
}
