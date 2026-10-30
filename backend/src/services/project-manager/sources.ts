import type { ClientSession } from "mongoose";
import { ProjectScopeExceptionModel } from "../../models/ProjectScopeException.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../../models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../../models/VendorExecutionState.js";
import { executionWorkDto, cacheLatestVendorReports, defaultExecutionDaily, type ExecutionProjectionCache } from "../vendor-execution-projection.js";
import { defaultExecutionPolicy, executionLocalDate } from "../../domain/vendor-execution.js";
import { ExecutionReportingPolicyModel } from "../../models/ExecutionReportingPolicy.js";
import { approvedExecutionProgress, type PMProgressLine } from "../../domain/project-manager/progress.js";
import type { PublicUser } from "../auth.service.js";
import type { PMRow } from "./common.js";
import { readPMApprovedSource } from "./approved-source.js";
import type { ExecutionWork } from "../../contracts/vendor-execution.js";

export async function readPMSources(actor: PublicUser, project: PMRow, session: ClientSession, at: Date) {
  const projectId = String(project._id);
  const approved = await readPMApprovedSource(projectId, session);
  const source = approved.snapshot, issues = approved.issues;
  const assignments = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } }).session(session).lean();
  const states = await VendorExecutionStateModel.find({ projectId }).session(session).lean();
  const stateById = new Map(states.map(row => [String(row._id), row]));
  const cache: ExecutionProjectionCache = new Map(); cache.set(`project:${projectId}`, Promise.resolve(project));
  const policyRow = await ExecutionReportingPolicyModel.findOne({ projectId, effectiveAt: { $lte: at } }).sort({ version: -1 }).session(session).lean();
  const policy = policyRow ? { ...defaultExecutionPolicy(projectId, at), ...policyRow, projectId } : defaultExecutionPolicy(projectId, at);
  await cacheLatestVendorReports(assignments, stateById, session, cache);
  const work: ExecutionWork[] = [];
  for (const assignment of assignments) work.push(await executionWorkDto(assignment, stateById.get(String(assignment._id)) ?? null, actor, policy, at, session, defaultExecutionDaily, cache));
  const orders = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $ne: null }, cancelledAt: null }).session(session).lean();
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ _id: { $in: orders.map(row => row.approvedRevisionId) }, projectId }).session(session).lean();
  const exceptions = source ? await ProjectScopeExceptionModel.find({ projectId, estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId }).session(session).lean() : [];
  const lines: PMProgressLine[] = (source?.allLineItems ?? []).filter(line => line.included).map(line => {
    const orderLines: PMRow[] = revisions.flatMap(revision => {
      const order = orders.find(row => row._id === revision.orderId && row.approvedRevision === revision.revision && row.vendorId === revision.vendorId);
      if (!order || revision.estimateId !== source!.estimateId || revision.estimateVersion !== source!.estimateVersion || revision.estimateReviewRoundId !== source!.estimateReviewRoundId) return [];
      return (revision.lines as PMRow[]).filter(item => item.sourceLineItemKey === line.key && item.sourceSectionId === line.sectionId).map(item => ({ ...item, orderId: String(order._id), revision: revision.revision }));
    });
    const scope = orderLines.some(item => ["execution", "supply_and_execution"].includes(item.scopeType)) ? "execution" : orderLines.length && orderLines.every(item => item.scopeType === "supply") ? "supply" : "unknown";
    const allocations = orderLines.filter(item => ["execution", "supply_and_execution"].includes(item.scopeType)).map(item => {
      const matches = work.filter(w => w.orderId === item.orderId && w.orderRevision === item.revision && w.lineId === item.id && w.sourceLineItemKey === line.key && w.sourceAvailable);
      const w = matches.length === 1 ? matches[0] : null;
      const state = w ? stateById.get(w.id) : null;
      return { id: `${item.orderId}:${item.revision}:${item.id}`, quantity: Number(item.quantityMilliUnits) / 1000, uom: String(item.uomCode ?? ""),
        progress: w && state && Number.isFinite(state.progress) ? Number(state.progress) : null,
        startDate: w?.schedule?.startDate ?? null, finishDate: w?.schedule?.finishDate ?? null,
        siteVerified: Boolean(w?.verification), clientAccepted: w?.legacyStatus === "client_approved" };
    });
    const exception = exceptions.find(row => row.sourceLineItemKey === line.key && row.sourceSectionId === line.sectionId);
    return { id: line.key, quantity: line.quantity, uom: line.unit, netPaise: line.amountPaise, scope, ...(exception ? { exception: exception.kind as "not_applicable" | "externally_fulfilled" } : {}), allocations };
  });
  const progress = approvedExecutionProgress(lines, source ? `${source.estimateId}:${source.estimateVersion}:${source.estimateReviewRoundId ?? "legacy"}` : null, executionLocalDate(at, policy.timezone), issues);
  return { source, work, progress, assignments, policy, lines, localDate: executionLocalDate(at, policy.timezone) };
}
