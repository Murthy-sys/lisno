import { createHash } from "node:crypto";
import { mongo } from "mongoose";
import { classifyProjectManagerAssignment, type ProjectManagerAssignmentFacts } from "../domain/project-manager-assignment.js";

// Deliberately no model imports: inventory must never initialize collections or indexes.
export const MIGRATION_VERSION = "project-manager-role.v1";
export const RECEIPTS = "projectManagerRoleMigrationReceipts";
export const COLLECTIONS = {
  users: "users", projects: "projects", tasks: "projectworkflowtasks", estimates: "estimates",
  invitations: "userinvitations", states: "siteCompletionStates", reviews: "siteCompletionReviews",
  awards: "procurementBasketAwards", proposals: "procurementBasketAwardRevisions",
  coordination: "authorizationcoordinations", audits: "auditevents", events: "executionChangeEvents"
} as const;
export type Row = Record<string, any>;
export type NativeDb = mongo.Db;
export type NativeSession = mongo.ClientSession;
export interface Target { id: string; database: string; clusterDigest: string }
export interface Fingerprint { collection: string; id: string; digest: string }
export interface FieldValue { present: boolean; value?: unknown }
export interface Change {
  collection: string; id: string; beforeDigest: string;
  before: Record<string, FieldValue>; after: Record<string, FieldValue>;
}
export interface OwnerResolution { projectId: string; ownerId: string; reviewedById: string; reason: string }
export interface Conflict { entityId: string; code: string; ownerIds?: string[] }
export interface Cohort { id: string; userIds: string[]; projectIds: string[]; changes: Change[] }
export interface AssignmentSnapshot {
  projectId: string; programManagerId: string | null; projectVersion: number | null;
  tasks: { id: string; assigneeUserId: string | null; version: number | null; estimateId: string; completed: boolean; superseded: boolean }[];
}
export interface Manifest {
  schemaVersion: 1; applicationVersion: typeof MIGRATION_VERSION; target: Target; inventoryAt: string;
  resolutions: OwnerResolution[]; conflicts: Conflict[]; cohorts: Cohort[];
  assignmentSnapshots: AssignmentSnapshot[];
  userSnapshots: { id: string; role: string; active: boolean; version: number | null; sessionVersion: number | null }[];
  snapshot: Fingerprint[]; digest: string;
}
export interface InventoryState { rows: Map<string, Row[]>; snapshot: Fingerprint[] }

function sorted(value: any): any {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export function serialize(value: unknown): any { return mongo.BSON.EJSON.serialize(value, { relaxed: false }); }
export function deserialize(value: any): any { return mongo.BSON.EJSON.deserialize(value, { relaxed: false }); }
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sorted(serialize(value)))).digest("hex");
}
export function manifestDigest(manifest: Omit<Manifest, "digest"> | Manifest): string {
  const { digest: ignored, ...body } = manifest as Manifest;
  return digest(body);
}
export function fingerprint(collection: string, row: Row): Fingerprint {
  return { collection, id: JSON.stringify(sorted(serialize(row._id))), digest: digest(row) };
}
export function fingerprintKey(value: Fingerprint): string { return `${value.collection}\0${value.id}`; }
export function sortSnapshot(snapshot: Fingerprint[]): Fingerprint[] {
  return snapshot.sort((a, b) => fingerprintKey(a).localeCompare(fingerprintKey(b)));
}
export function assertIdentifier(value: unknown, code = "INVALID_IDENTIFIER"): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > 200 || /[\u0000-\u001f]/u.test(value)) throw new Error(code);
}
export async function identifyTarget(db: NativeDb, targetId: string): Promise<Target> {
  assertIdentifier(targetId, "EXPLICIT_TARGET_REQUIRED");
  if (!["admin", "local", "config"].includes(db.databaseName) && db.databaseName.trim()) {
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName || !Array.isArray(hello.hosts)) throw new Error("REPLICA_SET_REQUIRED");
    return { id: targetId, database: db.databaseName, clusterDigest: digest({ setName: hello.setName, hosts: [...hello.hosts].sort() }) };
  }
  throw new Error("EXPLICIT_APPLICATION_DATABASE_REQUIRED");
}

/** Complete, unbounded read inventory. Hashes prevent credentials/private documents entering reports.
 * Freshness is intentionally conservative: any intervening business write requires reconciliation.
 */
export async function readInventoryState(db: NativeDb, session?: NativeSession): Promise<InventoryState> {
  // listCollections is read-only and cannot run inside a transaction. Collection writes still
  // participate in the authorization/project fences acquired by apply/rollback.
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(value => value.name)
    .filter(name => name !== RECEIPTS && name !== COLLECTIONS.coordination && !name.startsWith("system.")).sort();
  const rows = new Map<string, Row[]>();
  const snapshot: Fingerprint[] = [];
  for (const name of names) {
    const documents = await db.collection(name).find({}, { session }).toArray();
    rows.set(name, documents);
    for (const row of documents) snapshot.push(fingerprint(name, row));
  }
  return { rows, snapshot: sortSnapshot(snapshot) };
}
function field(row: Row, key: string): FieldValue {
  return Object.hasOwn(row, key) ? { present: true, value: serialize(row[key]) } : { present: false };
}
export function proposedChange(collection: string, row: Row, after: Row): Change {
  return { collection, id: row._id, beforeDigest: digest(row),
    before: Object.fromEntries(Object.keys(after).map(key => [key, field(row, key)])),
    after: Object.fromEntries(Object.entries(after).map(([key, value]) => [key, { present: true, value: serialize(value) }])) };
}
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const incrementable = (value: unknown): boolean => positive(value) && value < Number.MAX_SAFE_INTEGER;
const counter = (value: unknown): number => value === undefined || value === null ? 0 : Number(value);
const validCounter = (value: unknown): boolean => value === undefined || value === null || Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < Number.MAX_SAFE_INTEGER;
const owner = (value: unknown): string | null => value == null ? null : typeof value === "string" ? value : "";

export function buildProjectManagerRoleManifest(input: {
  state: InventoryState; target: Target; now: Date; resolutions?: OwnerResolution[];
}): Manifest {
  const { state, target, now } = input;
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_INVENTORY_TIME");
  const rows = (name: string) => state.rows.get(name) ?? [];
  const users = rows(COLLECTIONS.users), projects = rows(COLLECTIONS.projects), tasks = rows(COLLECTIONS.tasks);
  const conflicts: Conflict[] = [];
  const activeSuperAdmins = users.filter(user => user.active === true && user.role === "super_admin");
  if (activeSuperAdmins.length !== 1) conflicts.push({ entityId: "authorization", code: "SOLE_ACTIVE_SUPER_ADMIN_REQUIRED" });
  const assignmentSnapshots: AssignmentSnapshot[] = [];
  const resolutions = [...(input.resolutions ?? [])].sort((a, b) => a.projectId.localeCompare(b.projectId));
  const resolutionMap = new Map<string, OwnerResolution>();
  for (const resolution of resolutions) {
    const reviewer = users.find(user => user._id === resolution.reviewedById);
    if (!resolution.projectId || !resolution.ownerId || !resolution.reason?.trim() || resolution.reason.length > 1000 ||
      resolutionMap.has(resolution.projectId) || activeSuperAdmins.length !== 1 || reviewer?.active !== true || reviewer.role !== "super_admin" ||
      !projects.some(project => project._id === resolution.projectId)) {
      conflicts.push({ entityId: resolution.projectId ?? "", code: "INVALID_REVIEWED_RESOLUTION" });
    }
    resolutionMap.set(resolution.projectId, resolution);
  }
  const affectedUsers = new Set<string>(users.filter(user => user.role === "program_manager").map(user => String(user._id)));
  const projectChanges = new Map<string, Change[]>();
  const projectUsers = new Map<string, string[]>();
  for (const project of projects) {
    const id = String(project._id);
    const projectTasks = tasks.filter(task => task.projectId === id && task.kind === "site_execution");
    const current = projectTasks.filter(task => !task.supersededAt);
    assignmentSnapshots.push({ projectId: id, programManagerId: owner(project.programManagerId),
      projectVersion: positive(project.procurementIdentityVersion ?? 1) ? project.procurementIdentityVersion ?? 1 : null,
      tasks: projectTasks.map(task => ({ id: String(task._id), assigneeUserId: owner(task.assigneeUserId),
        version: positive(task.version ?? 1) ? task.version ?? 1 : null, estimateId: String(task.estimateId),
        completed: task.status === "completed", superseded: Boolean(task.supersededAt) })).sort((a, b) => a.id.localeCompare(b.id)) });
    const ownerIds = [...new Set([owner(project.programManagerId), ...current.map(task => owner(task.assigneeUserId))].filter((id): id is string => id !== null))];
    const facts: ProjectManagerAssignmentFacts = {
      project: { id, programManagerId: owner(project.programManagerId), procurementIdentityVersion: project.procurementIdentityVersion ?? 1 },
      tasks: projectTasks.map(task => ({ id: task._id, projectId: task.projectId, estimateId: task.estimateId, kind: task.kind,
        assigneeRole: task.assigneeRole, assigneeUserId: owner(task.assigneeUserId), version: task.version ?? 1,
        designPlanVersion: task.designPlanVersion, preparationOnly: task.preparationOnly === true, status: task.status, supersededAt: task.supersededAt })),
      sources: rows(COLLECTIONS.estimates).filter(source => source.projectId === id).map(source => ({ id: source._id,
        projectId: source.projectId, status: source.status, designPlanStatus: source.designPlanStatus,
        designPlanVersion: source.designPlanVersion ?? 0, estimation: source.estimation })),
      users: users.map(user => ({ id: user._id, role: user.role, active: user.active === true })),
      lockedReviewOwnerIds: [], reviewStateInvalid: false
    };
    const completionStates = rows(COLLECTIONS.states).filter(state => state.projectId === id);
    if (completionStates.length > 1 || completionStates.some(state => !["draft", "pending_client", "changes_requested", "client_approved"].includes(state.status))) facts.reviewStateInvalid = true;
    for (const completion of completionStates.filter(state => ["pending_client", "client_approved"].includes(state.status))) {
      const reviews = rows(COLLECTIONS.reviews).filter(review => review.projectId === id && review.round === completion.currentRound);
      if (!positive(completion.currentRound) || reviews.length !== 1 || reviews[0]!.status !== (completion.status === "pending_client" ? "pending" : "approved")) facts.reviewStateInvalid = true;
      else (facts.lockedReviewOwnerIds as string[]).push(reviews[0]!.managerId);
    }
    for (const award of rows(COLLECTIONS.awards).filter(award => award.projectId === id && ["pending_approvals", "ready_to_issue"].includes(award.status))) {
      const proposals = rows(COLLECTIONS.proposals).filter(proposal => proposal._id === award.currentProposalRevisionId && proposal.awardId === award._id && proposal.projectId === id);
      if (proposals.length !== 1 || !Array.isArray(proposals[0]!.requiredSlots)) facts.reviewStateInvalid = true;
      else if (proposals[0]!.requiredSlots.includes("program_manager")) (facts.lockedReviewOwnerIds as string[]).push(proposals[0]!.programManagerId);
    }
    let classified = classifyProjectManagerAssignment(facts, { mode: "migration" });
    const resolution = resolutionMap.get(id);
    if (resolution) {
      // Only a reviewed owner mismatch can be reconciled here. Other corruption must be
      // fixed through its established workflow and inventoried again.
      const validOldOwners = ownerIds.every(id => users.some(user => user._id === id && user.active === true && ["site_manager", "program_manager"].includes(user.role)));
      if (classified.reason !== "ASSIGNMENT_MISMATCH" || !validOldOwners || current[0]?.status === "completed" || project.status === "completed") {
        conflicts.push({ entityId: id, code: "RESOLUTION_NOT_APPLICABLE", ownerIds });
      } else {
        const resolved = { ...facts, project: { ...facts.project!, programManagerId: resolution.ownerId },
          tasks: facts.tasks.map(task => task.supersededAt ? task : { ...task, assigneeUserId: resolution.ownerId }) };
        classified = classifyProjectManagerAssignment(resolved, { mode: "migration" });
      }
    }
    if (classified.state === "conflict") {
      conflicts.push({ entityId: id, code: classified.reason!, ownerIds });
      continue;
    }
    const finalOwner = classified.ownerId;
    const roleConversion = ownerIds.some(id => users.some(user => user._id === id && user.role === "program_manager"));
    const needsSync = current.length === 1 && (owner(project.programManagerId) !== finalOwner || owner(current[0]!.assigneeUserId) !== finalOwner);
    if (!roleConversion && !needsSync && !resolution) continue;
    if (!incrementable(project.procurementIdentityVersion ?? 1) || !validCounter(project.purchaseOrderApprovalEpoch) || !validCounter(project.siteCompletionFenceEpoch) ||
      current.some(task => !validCounter(task.awardApprovalEpoch) || !incrementable(task.version ?? 1))) {
      conflicts.push({ entityId: id, code: "INVALID_FENCE_VERSION" }); continue;
    }
    if (current[0]?.status === "completed" && owner(current[0]!.assigneeUserId) !== finalOwner) {
      conflicts.push({ entityId: id, code: "COMPLETED_TASK_OWNER_IMMUTABLE", ownerIds }); continue;
    }
    const dependencyUsers = [...new Set([...ownerIds, ...(finalOwner ? [finalOwner] : [])])];
    dependencyUsers.forEach(id => affectedUsers.add(id));
    projectUsers.set(id, dependencyUsers);
    const changes = [proposedChange(COLLECTIONS.projects, project, { programManagerId: finalOwner,
      procurementIdentityVersion: (project.procurementIdentityVersion ?? 1) + 1,
      purchaseOrderApprovalEpoch: counter(project.purchaseOrderApprovalEpoch) + 1,
      siteCompletionFenceEpoch: counter(project.siteCompletionFenceEpoch) + 1, updatedAt: now })];
    const task = current[0];
    if (task && owner(task.assigneeUserId) !== finalOwner && task.status !== "completed") changes.push(proposedChange(COLLECTIONS.tasks, task, {
      assigneeUserId: finalOwner, version: (task.version ?? 1) + 1, awardApprovalEpoch: counter(task.awardApprovalEpoch) + 1, updatedAt: now
    }));
    projectChanges.set(id, changes);
  }
  for (const task of tasks.filter(task => task.kind === "site_execution" && !task.supersededAt)) {
    if (!projects.some(project => project._id === task.projectId)) conflicts.push({ entityId: String(task._id), code: "PROJECT_MISSING" });
  }
  for (const invitation of rows(COLLECTIONS.invitations)) {
    if (invitation.role === "program_manager" && invitation.status === "pending" &&
      (!Number.isFinite(new Date(invitation.expiresAt).getTime()) || new Date(invitation.expiresAt) > now)) {
      conflicts.push({ entityId: String(invitation._id), code: "PENDING_LEGACY_INVITATION" });
    }
  }
  const changesByUser = new Map<string, Change>();
  for (const id of affectedUsers) {
    const user = users.find(user => user._id === id);
    if (!user || !incrementable(user.version) || !incrementable(user.sessionVersion) || typeof user.active !== "boolean") {
      conflicts.push({ entityId: id, code: "INVALID_USER_VERSION" }); continue;
    }
    changesByUser.set(id, proposedChange(COLLECTIONS.users, user, { role: "site_manager", version: user.version + 1,
      sessionVersion: user.sessionVersion + 1, updatedAt: now }));
  }
  // Connected components keep each account and every dependent project in one transaction.
  const parent = new Map<string, string>([...affectedUsers].map(id => [id, id]));
  const find = (id: string): string => { const p = parent.get(id)!; return p === id ? id : find(p); };
  for (const ids of projectUsers.values()) for (const id of ids.slice(1)) parent.set(find(id), find(ids[0]!));
  const groups = new Map<string, Cohort>();
  for (const id of [...affectedUsers].sort()) {
    const root = find(id); const group = groups.get(root) ?? { id: "", userIds: [], projectIds: [], changes: [] };
    group.userIds.push(id); if (changesByUser.has(id)) group.changes.push(changesByUser.get(id)!); groups.set(root, group);
  }
  for (const [id, ids] of projectUsers) {
    const group = groups.get(find(ids[0]!))!; group.projectIds.push(id); group.changes.push(...projectChanges.get(id)!);
  }
  const cohorts = [...groups.values()].map(group => {
    group.projectIds.sort(); group.changes.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
    group.id = digest({ userIds: group.userIds, projectIds: group.projectIds }).slice(0, 32);
    if (group.changes.length > 200) conflicts.push({ entityId: group.id, code: "COHORT_TOO_LARGE" });
    return group;
  }).sort((a, b) => a.id.localeCompare(b.id));
  conflicts.sort((a, b) => `${a.entityId}/${a.code}`.localeCompare(`${b.entityId}/${b.code}`));
  const manifest: Manifest = { schemaVersion: 1, applicationVersion: MIGRATION_VERSION, target,
    inventoryAt: now.toISOString(), resolutions, conflicts, cohorts,
    assignmentSnapshots: assignmentSnapshots.sort((a, b) => a.projectId.localeCompare(b.projectId)),
    userSnapshots: users.filter(user => affectedUsers.has(String(user._id))).map(user => ({ id: String(user._id),
      role: ["site_manager", "program_manager"].includes(user.role) ? user.role : "invalid", active: user.active === true,
      version: positive(user.version) ? user.version : null, sessionVersion: positive(user.sessionVersion) ? user.sessionVersion : null
    })).sort((a, b) => a.id.localeCompare(b.id)), snapshot: state.snapshot, digest: "" };
  manifest.digest = manifestDigest(manifest);
  return manifest;
}
export async function createProjectManagerRoleInventory(input: {
  db: NativeDb; targetId: string; now?: Date; resolutions?: OwnerResolution[];
}): Promise<Manifest> {
  const target = await identifyTarget(input.db, input.targetId);
  return buildProjectManagerRoleManifest({ state: await readInventoryState(input.db), target, now: input.now ?? new Date(), resolutions: input.resolutions });
}
