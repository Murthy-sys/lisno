import { z } from "zod";
import { classifyProjectManagerAssignment, type ProjectManagerAssignmentFacts } from "../domain/project-manager-assignment.js";
import { COLLECTIONS as C, digest, fingerprint, identifyTarget, proposedChange, sortSnapshot,
  type Change, type Conflict, type Fingerprint, type InventoryState, type NativeDb, type NativeSession, type Row, type Target
} from "./project-manager-role-inventory.js";

export const SYNC_VERSION = "project-manager-assignment-sync.v1" as const;
export const SYNC_RECEIPTS = "projectManagerAssignmentSyncReceipts";
const identifier = z.string().min(1).max(200).refine(value => value.trim() === value && !/[\u0000-\u001f]/u.test(value));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const syncScopeSchema = z.object({
  ownerId: identifier,
  projectIds: z.array(identifier).min(1).max(100),
  preservedOrphans: z.array(z.object({ id: identifier, digest: hash }).strict()).max(1000)
}).strict().superRefine((scope, context) => {
  if (new Set(scope.projectIds).size !== scope.projectIds.length ||
    new Set(scope.preservedOrphans.map(row => row.id)).size !== scope.preservedOrphans.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate scope identity" });
  }
});
export type AssignmentSyncScope = z.infer<typeof syncScopeSchema>;
export interface AssignmentSyncManifest {
  schemaVersion: 1;
  applicationVersion: typeof SYNC_VERSION;
  target: Target;
  inventoryAt: string;
  scope: AssignmentSyncScope;
  conflicts: Conflict[];
  changes: Change[];
  preservedOrphans: Fingerprint[];
  snapshot: Fingerprint[];
  collectionNames: string[];
  summary: { selected: number; toMap: number; alreadyMapped: number; outsideProjects: number; preservedOrphans: number };
  digest: string;
}
export function normalizeSyncScope(value: unknown): AssignmentSyncScope {
  const parsed = syncScopeSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_SYNC_SCOPE");
  return { ownerId: parsed.data.ownerId, projectIds: [...parsed.data.projectIds].sort(),
    preservedOrphans: [...parsed.data.preservedOrphans].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function syncManifestDigest(manifest: Omit<AssignmentSyncManifest, "digest"> | AssignmentSyncManifest): string {
  const { digest: ignored, ...body } = manifest as AssignmentSyncManifest;
  return digest(body);
}
export async function syncCollectionNames(db: NativeDb): Promise<string[]> {
  return (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name)
    .filter(name => ![SYNC_RECEIPTS, C.coordination].includes(name) && !name.startsWith("system.")).sort();
}
/** Native reads only. A transaction reuses preflight names because listCollections cannot run in it. */
export async function readAssignmentSyncState(db: NativeDb, session?: NativeSession, names?: readonly string[]): Promise<InventoryState> {
  if (session && !names) throw new Error("TRANSACTION_COLLECTION_NAMES_REQUIRED");
  const rows = new Map<string, Row[]>(), snapshot: Fingerprint[] = [];
  for (const name of names ?? await syncCollectionNames(db)) {
    const documents = await db.collection(name).find({}, { session }).toArray();
    rows.set(name, documents);
    for (const row of documents) snapshot.push(fingerprint(name, row));
  }
  return { rows, snapshot: sortSnapshot(snapshot) };
}
const incrementable = (value: unknown, minimum = 1): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value < Number.MAX_SAFE_INTEGER;
const owner = (value: unknown) => value == null ? null : typeof value === "string" ? value : "";

function projectFacts(project: Row, rows: (name: string) => Row[], users: Row[]): ProjectManagerAssignmentFacts {
  const id = String(project._id);
  const facts: ProjectManagerAssignmentFacts = {
    project: { id, programManagerId: owner(project.programManagerId), procurementIdentityVersion: project.procurementIdentityVersion ?? 1 },
    tasks: rows(C.tasks).filter(task => task.projectId === id && task.kind === "site_execution").map(task => ({
      id: task._id, projectId: task.projectId, estimateId: task.estimateId, kind: task.kind,
      assigneeRole: task.assigneeRole, assigneeUserId: owner(task.assigneeUserId), version: task.version ?? 1,
      designPlanVersion: task.designPlanVersion, preparationOnly: task.preparationOnly === true,
      status: task.status, supersededAt: task.supersededAt
    })),
    sources: rows(C.estimates).filter(source => source.projectId === id).map(source => ({ id: source._id,
      projectId: source.projectId, status: source.status, designPlanStatus: source.designPlanStatus,
      designPlanVersion: source.designPlanVersion ?? 0, estimation: source.estimation })),
    users: users.map(user => ({ id: user._id, role: user.role, active: user.active === true })),
    lockedReviewOwnerIds: [], reviewStateInvalid: false
  };
  const states = rows(C.states).filter(state => state.projectId === id);
  if (states.length > 1 || states.some(state => !["draft", "pending_client", "changes_requested", "client_approved"].includes(state.status))) facts.reviewStateInvalid = true;
  for (const state of states.filter(state => ["pending_client", "client_approved"].includes(state.status))) {
    const reviews = rows(C.reviews).filter(review => review.projectId === id && review.round === state.currentRound);
    if (!incrementable(state.currentRound) || reviews.length !== 1 || reviews[0]!.status !== (state.status === "client_approved" ? "approved" : "pending")) facts.reviewStateInvalid = true;
    else (facts.lockedReviewOwnerIds as string[]).push(reviews[0]!.managerId);
  }
  for (const award of rows(C.awards).filter(award => award.projectId === id && ["pending_approvals", "ready_to_issue"].includes(award.status))) {
    const proposals = rows(C.proposals).filter(proposal => proposal._id === award.currentProposalRevisionId && proposal.awardId === award._id && proposal.projectId === id);
    if (proposals.length !== 1 || !Array.isArray(proposals[0]!.requiredSlots)) facts.reviewStateInvalid = true;
    else if (proposals[0]!.requiredSlots.includes("program_manager")) (facts.lockedReviewOwnerIds as string[]).push(proposals[0]!.programManagerId);
  }
  return facts;
}

export function buildAssignmentSyncManifest(input: { state: InventoryState; target: Target; scope: unknown; now: Date }): AssignmentSyncManifest {
  const scope = normalizeSyncScope(input.scope), { state, target, now } = input;
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_INVENTORY_TIME");
  const rows = (name: string) => state.rows.get(name) ?? [];
  const users = rows(C.users), projects = rows(C.projects), tasks = rows(C.tasks), estimates = rows(C.estimates);
  const conflicts: Conflict[] = [], changes: Change[] = [], preservedOrphans: Fingerprint[] = [];
  const ownerUser = users.find(user => user._id === scope.ownerId);
  if (!ownerUser || ownerUser.role !== "site_manager" || ownerUser.active !== true) conflicts.push({ entityId: scope.ownerId, code: "ACTIVE_CANONICAL_OWNER_REQUIRED" });
  if (users.filter(user => user.active === true && user.role === "super_admin").length !== 1) conflicts.push({ entityId: "authorization", code: "SOLE_ACTIVE_SUPER_ADMIN_REQUIRED" });

  const orphans = tasks.filter(task => task.kind === "site_execution" && !task.supersededAt && !projects.some(project => project._id === task.projectId));
  const acknowledgements = new Map(scope.preservedOrphans.map(row => [row.id, row.digest]));
  for (const task of orphans) {
    const observed = fingerprint(C.tasks, task);
    if (acknowledgements.get(String(task._id)) !== observed.digest || estimates.some(estimate => estimate._id === task.estimateId)) {
      conflicts.push({ entityId: String(task._id), code: "ORPHAN_ACKNOWLEDGEMENT_MISMATCH" });
    }
    preservedOrphans.push(observed);
  }
  for (const id of acknowledgements.keys()) if (!orphans.some(task => task._id === id)) conflicts.push({ entityId: id, code: "ACKNOWLEDGED_ORPHAN_NOT_FOUND" });

  let toMap = 0, alreadyMapped = 0;
  for (const projectId of scope.projectIds) {
    const project = projects.find(row => row._id === projectId);
    if (!project) { conflicts.push({ entityId: projectId, code: "PROJECT_MISSING" }); continue; }
    const facts = projectFacts(project, rows, users);
    const classified = classifyProjectManagerAssignment(facts, { mode: "migration" });
    if (classified.state === "conflict") { conflicts.push({ entityId: projectId, code: classified.reason! }); continue; }
    if (!classified.task || classified.task.assigneeUserId !== scope.ownerId || classified.ownerId !== scope.ownerId ||
      facts.project!.programManagerId !== null && facts.project!.programManagerId !== scope.ownerId) {
      conflicts.push({ entityId: projectId, code: "EXISTING_TASK_OWNER_REQUIRED" }); continue;
    }
    if (project.status !== "active") { conflicts.push({ entityId: projectId, code: "ACTIVE_PROJECT_REQUIRED" }); continue; }
    if (!incrementable(project.procurementIdentityVersion ?? 1) || !incrementable(project.purchaseOrderApprovalEpoch ?? 0, 0) || !incrementable(project.siteCompletionFenceEpoch ?? 0, 0)) {
      conflicts.push({ entityId: projectId, code: "INVALID_PROJECT_FENCE_VERSION" }); continue;
    }
    if (facts.project!.programManagerId === scope.ownerId) { alreadyMapped++; continue; }
    toMap++;
    changes.push(proposedChange(C.projects, project, { programManagerId: scope.ownerId,
      procurementIdentityVersion: (project.procurementIdentityVersion ?? 1) + 1,
      purchaseOrderApprovalEpoch: (project.purchaseOrderApprovalEpoch ?? 0) + 1,
      siteCompletionFenceEpoch: (project.siteCompletionFenceEpoch ?? 0) + 1, updatedAt: now }));
  }
  if (toMap && ownerUser) {
    if (!incrementable(ownerUser.version) || !incrementable(ownerUser.sessionVersion)) conflicts.push({ entityId: scope.ownerId, code: "INVALID_OWNER_VERSION" });
    else changes.push(proposedChange(C.users, ownerUser, { version: ownerUser.version + 1, sessionVersion: ownerUser.sessionVersion + 1, updatedAt: now }));
  }
  const manifest: AssignmentSyncManifest = {
    schemaVersion: 1, applicationVersion: SYNC_VERSION, target, inventoryAt: now.toISOString(), scope,
    conflicts: conflicts.sort((a, b) => `${a.entityId}/${a.code}`.localeCompare(`${b.entityId}/${b.code}`)),
    changes: changes.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`)),
    preservedOrphans: sortSnapshot(preservedOrphans), snapshot: state.snapshot,
    collectionNames: [...state.rows.keys()].sort(),
    summary: { selected: scope.projectIds.length, toMap, alreadyMapped, outsideProjects: projects.length - scope.projectIds.filter(id => projects.some(p => p._id === id)).length, preservedOrphans: orphans.length }, digest: ""
  };
  manifest.digest = syncManifestDigest(manifest);
  return manifest;
}
export async function createAssignmentSyncInventory(input: { db: NativeDb; targetId: string; scope: unknown; now?: Date }): Promise<AssignmentSyncManifest> {
  const target = await identifyTarget(input.db, input.targetId);
  return buildAssignmentSyncManifest({ target, state: await readAssignmentSyncState(input.db), scope: input.scope, now: input.now ?? new Date() });
}
