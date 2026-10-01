import { pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { inspectProcurementActiveIndex } from "./project-procurement-source-index.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";

type Authority = "legacy_staff" | "vendor_client" | "missing" | "invalid";
type ProjectSnapshot = { status: string; authority: Authority; version: number | null; decisionId: string | null };
type OrderSnapshot = { projectId: string; approvedRevision: number | null; cancelled: boolean; assignmentCount: number };
export type VendorWorkflowConflictCode =
  | "ACTIVE_AUTHORITY_MISSING_OR_INVALID"
  | "ACTIVE_AUTHORITY_VERSION_INVALID"
  | "LEGACY_AUTHORITY_HAS_PURCHASE_ORDER"
  | "VENDOR_AUTHORITY_HAS_OPEN_STAFF_TRADE_TASK"
  | "COMPLETED_VENDOR_AUTHORITY_WITHOUT_DECISION"
  | "ORDER_PROJECT_MISSING"
  | "APPROVED_ORDER_WITHOUT_VENDOR_TASK"
  | "VENDOR_TASK_ORDER_MISSING_OR_MISMATCHED"
  | "REMOVED_CHILD_REFERENCED_BY_APPROVED_ORDER"
  | "ACTIVE_PROCUREMENT_DUPLICATE_OR_INVALID_SOURCE"
  | "PROCUREMENT_INDEX_CONFLICT";

export interface VendorWorkflowInventory {
  mode: "dry-run";
  database: string;
  projects: { total: number; byStatus: Record<string, number>; activeByAuthority: Record<Authority, number>; completedByAuthority: Record<Authority, number> };
  staffTradeTasks: { total: number; unsuperseded: number; unsupersededForVendorProjects: number };
  purchaseOrders: { total: number; byStatus: Record<string, number>; withApprovedRevision: number };
  vendorTasks: { total: number; byStatus: Record<string, number>; active: number };
  procurementChildren: { active: number; removed: number; activeWithTrackedAllocation: number; activeUntrackedAllocation: number;
    trackedAllocationTotalPaise: string; activeDuplicateGroups: number; invalidActiveSources: number;
    activeIndexPresent: boolean; supersededIndexPresent: boolean; indexConflicts: string[] };
  transition: { alreadyVendorManaged: number; activeLegacyRequiresExplicitCutover: number;
    activeMissingOrInvalidRequiresReview: number; completedHistoryPreserved: number };
  conflicts: Array<{ code: VendorWorkflowConflictCode; projectId?: string; orderId?: string; childId?: string }>;
  additionalConflictCount: number;
}

const MAX_REPORTED_CONFLICTS = 100;
const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
const id = (value: unknown) => String(value ?? "");
const validAuthority = (value: unknown): Authority =>
  value === "legacy_staff" || value === "vendor_client" ? value : value == null ? "missing" : "invalid";

/** Native collection reads only: no Model.init, syncIndexes, updates, or migration writes. */
export async function inspectProjectVendorWorkflow(db: mongo.Db): Promise<VendorWorkflowInventory> {
  const projects = new Map<string, ProjectSnapshot>();
  const orders = new Map<string, OrderSnapshot>();
  const removedChildren = new Map<string, string>();
  const report: VendorWorkflowInventory = {
    mode: "dry-run", database: db.databaseName,
    projects: { total: 0, byStatus: {}, activeByAuthority: { legacy_staff: 0, vendor_client: 0, missing: 0, invalid: 0 },
      completedByAuthority: { legacy_staff: 0, vendor_client: 0, missing: 0, invalid: 0 } },
    staffTradeTasks: { total: 0, unsuperseded: 0, unsupersededForVendorProjects: 0 },
    purchaseOrders: { total: 0, byStatus: {}, withApprovedRevision: 0 },
    vendorTasks: { total: 0, byStatus: {}, active: 0 },
    procurementChildren: { active: 0, removed: 0, activeWithTrackedAllocation: 0, activeUntrackedAllocation: 0,
      trackedAllocationTotalPaise: "0", activeDuplicateGroups: 0, invalidActiveSources: 0, activeIndexPresent: false,
      supersededIndexPresent: false, indexConflicts: [] },
    transition: { alreadyVendorManaged: 0, activeLegacyRequiresExplicitCutover: 0,
      activeMissingOrInvalidRequiresReview: 0, completedHistoryPreserved: 0 },
    conflicts: [], additionalConflictCount: 0
  };
  const conflict = (code: VendorWorkflowConflictCode, fields: { projectId?: string; orderId?: string; childId?: string } = {}) => {
    if (report.conflicts.length < MAX_REPORTED_CONFLICTS) report.conflicts.push({ code, ...fields });
    else report.additionalConflictCount += 1;
  };

  for await (const row of db.collection(ProjectModel.collection.name).find({}, {
    projection: { _id: 1, status: 1, completionAuthority: 1, completionAuthorityVersion: 1, completionDecisionId: 1 }
  })) {
    const projectId = id(row._id);
    const status = id(row.status);
    const authority = validAuthority(row.completionAuthority);
    const version = Number.isSafeInteger(row.completionAuthorityVersion) && row.completionAuthorityVersion >= 1
      ? Number(row.completionAuthorityVersion) : null;
    const decisionId = typeof row.completionDecisionId === "string" && row.completionDecisionId ? row.completionDecisionId : null;
    projects.set(projectId, { status, authority, version, decisionId });
    report.projects.total += 1;
    increment(report.projects.byStatus, status);
    if (status === "active") {
      report.projects.activeByAuthority[authority] += 1;
      if (authority === "vendor_client") report.transition.alreadyVendorManaged += 1;
      else if (authority === "legacy_staff") report.transition.activeLegacyRequiresExplicitCutover += 1;
      else { report.transition.activeMissingOrInvalidRequiresReview += 1; conflict("ACTIVE_AUTHORITY_MISSING_OR_INVALID", { projectId }); }
      if (version === null) conflict("ACTIVE_AUTHORITY_VERSION_INVALID", { projectId });
    }
    if (status === "completed") {
      report.projects.completedByAuthority[authority] += 1;
      report.transition.completedHistoryPreserved += 1;
      if (authority === "vendor_client" && !decisionId) conflict("COMPLETED_VENDOR_AUTHORITY_WITHOUT_DECISION", { projectId });
    }
  }

  for await (const row of db.collection(ProjectWorkflowTaskModel.collection.name).find({ kind: "trade_execution" }, {
    projection: { projectId: 1, supersededAt: 1 }
  })) {
    report.staffTradeTasks.total += 1;
    if (row.supersededAt != null) continue;
    report.staffTradeTasks.unsuperseded += 1;
    const projectId = id(row.projectId);
    if (projects.get(projectId)?.authority === "vendor_client") {
      report.staffTradeTasks.unsupersededForVendorProjects += 1;
      conflict("VENDOR_AUTHORITY_HAS_OPEN_STAFF_TRADE_TASK", { projectId });
    }
  }

  for await (const row of db.collection(ProjectPurchaseOrderModel.collection.name).find({}, {
    projection: { _id: 1, projectId: 1, status: 1, approvedRevision: 1, cancelledAt: 1 }
  })) {
    const projectId = id(row.projectId);
    const orderId = id(row._id);
    const approvedRevision = Number.isSafeInteger(row.approvedRevision) && row.approvedRevision >= 1 ? Number(row.approvedRevision) : null;
    orders.set(orderId, { projectId, approvedRevision, cancelled: row.cancelledAt != null, assignmentCount: 0 });
    report.purchaseOrders.total += 1;
    increment(report.purchaseOrders.byStatus, id(row.status));
    if (approvedRevision !== null) report.purchaseOrders.withApprovedRevision += 1;
    const project = projects.get(projectId);
    if (!project) conflict("ORDER_PROJECT_MISSING", { projectId, orderId });
    else if (project.authority === "legacy_staff") conflict("LEGACY_AUTHORITY_HAS_PURCHASE_ORDER", { projectId, orderId });
  }

  for await (const row of db.collection(VendorWorkAssignmentModel.collection.name).find({}, {
    projection: { projectId: 1, orderId: 1, orderRevision: 1, status: 1 }
  })) {
    report.vendorTasks.total += 1;
    const status = id(row.status);
    increment(report.vendorTasks.byStatus, status);
    if (status !== "superseded") report.vendorTasks.active += 1;
    const orderId = id(row.orderId);
    const order = orders.get(orderId);
    if (!order || order.projectId !== id(row.projectId)) {
      conflict("VENDOR_TASK_ORDER_MISSING_OR_MISMATCHED", { projectId: id(row.projectId), orderId });
      continue;
    }
    if (!order.cancelled && order.approvedRevision === row.orderRevision && status !== "superseded") order.assignmentCount += 1;
  }
  for (const [orderId, order] of orders) {
    if (!order.cancelled && order.approvedRevision !== null && order.assignmentCount === 0) {
      conflict("APPROVED_ORDER_WITHOUT_VENDOR_TASK", { projectId: order.projectId, orderId });
    }
  }

  let allocatedPaise = 0n;
  const procurementCollection = db.collection(ProjectProcurementItemModel.collection.name);
  for await (const row of procurementCollection.find({}, { projection: { _id: 1, projectId: 1,
    removedAt: 1, allocatedWorkPaise: 1, allocationTrackingVersion: 1 } })) {
    if (row.removedAt != null) {
      report.procurementChildren.removed += 1;
      removedChildren.set(id(row._id), id(row.projectId));
      continue;
    }
    report.procurementChildren.active += 1;
    if (row.allocationTrackingVersion === 1 && Number.isSafeInteger(row.allocatedWorkPaise) && row.allocatedWorkPaise > 0) {
      report.procurementChildren.activeWithTrackedAllocation += 1;
      allocatedPaise += BigInt(row.allocatedWorkPaise);
    } else if (row.allocatedWorkPaise != null) report.procurementChildren.activeUntrackedAllocation += 1;
  }
  report.procurementChildren.trackedAllocationTotalPaise = allocatedPaise.toString();

  for await (const row of db.collection(ProjectPurchaseOrderRevisionModel.collection.name).find({}, {
    projection: { orderId: 1, revision: 1, "lines.procurementItemId": 1 }
  })) {
    const order = orders.get(id(row.orderId));
    if (!order || order.cancelled || order.approvedRevision !== row.revision) continue;
    for (const line of Array.isArray(row.lines) ? row.lines : []) {
      const childId = id(line.procurementItemId);
      const projectId = removedChildren.get(childId);
      if (projectId) conflict("REMOVED_CHILD_REFERENCED_BY_APPROVED_ORDER", { projectId, orderId: id(row.orderId), childId });
    }
  }

  const exists = await db.listCollections({ name: procurementCollection.collectionName }, { nameOnly: true }).hasNext();
  if (exists) {
    const index = await inspectProcurementActiveIndex(procurementCollection);
    report.procurementChildren.activeDuplicateGroups = index.activeDuplicateGroups.length;
    report.procurementChildren.invalidActiveSources = index.invalidActiveSourceIds.length;
    report.procurementChildren.activeIndexPresent = index.activeIndexPresent;
    report.procurementChildren.supersededIndexPresent = index.sourceIndexPresent || index.legacyIndexPresent;
    report.procurementChildren.indexConflicts = index.indexConflicts;
    if (index.activeDuplicateGroups.length || index.invalidActiveSourceIds.length) conflict("ACTIVE_PROCUREMENT_DUPLICATE_OR_INVALID_SOURCE");
    if (index.indexConflicts.length) conflict("PROCUREMENT_INDEX_CONFLICT");
  }
  return report;
}

/** Explicit database and dry-run only. No application model connection is opened. */
export async function runProjectVendorWorkflowInventory(argv = process.argv.slice(2), env = process.env): Promise<VendorWorkflowInventory> {
  const databaseArg = argv.find((arg) => arg.startsWith("--database="));
  if (argv.some((arg) => arg !== "--dry-run" && !arg.startsWith("--database=")) ||
      argv.filter((arg) => arg.startsWith("--database=")).length !== 1 || !databaseArg?.slice(11)) {
    throw new Error("Use --database=<database-name> [--dry-run]. This inventory never writes.");
  }
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required; no default server is selected.");
  const client = new mongo.MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    return await inspectProjectVendorWorkflow(client.db(databaseArg.slice(11)));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProjectVendorWorkflowInventory().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.conflicts.length || report.additionalConflictCount) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`Vendor workflow inventory failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
