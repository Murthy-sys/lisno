import type { ClientSession } from "mongoose";
import type { PMItem, PMPanel } from "../../contracts/project-manager.js";
import { certificationReviewerRole, certificationStatus, pmCertificationActionSchema, pmCertificationSchema, pmNoticeActionSchema, pmNoticeSchema, pmVendorListSchema, type PMVendorQuery } from "../../domain/project-manager/vendors.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectVendorNoticeModel } from "../../models/ProjectVendorNotice.js";
import { ProjectPaymentCertificationModel } from "../../models/ProjectPaymentCertification.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel } from "../../models/ProcurementBasketTender.js";
import { ProjectWorkflowTaskModel } from "../../models/ProjectWorkflowTask.js";
import { FinanceLedgerEntryModel } from "../../models/FinanceLedgerEntry.js";
import { UserModel } from "../../models/User.js";
import { VendorWorkAssignmentModel } from "../../models/VendorWorkAssignment.js";
import type { PublicUser } from "../auth.service.js";
import type { VendorExecutionService } from "../vendor-execution.service.js";
import { resolveProjectManagerAssignment } from "../project-manager-assignment.service.js";
import { resolveBasketProjectApprovers } from "../procurement-basket-approvers.service.js";
import { requireExecutionActor } from "../vendor-execution-access.js";
import { assertPMEvidence } from "./evidence.js";
import { pmConflict, pmDigest, pmHistory, pmMissing, pmPanel, pmRecord, pmReplay, pmTransaction, requirePMProject, type PMDependencies, type PMRow } from "./common.js";

const readers = ["site_manager", "procurement", "designer", "finance_head", "vendor"] as const;
const date = (value: unknown) => value ? new Date(value as string).toISOString() : null;
const noticeNames: Record<string, string> = { quality: "Quality warning", absenteeism: "Absenteeism", misbehaviour: "Conduct notice", ppe: "PPE violation", cleaning: "Cleaning issue", stop_work: "Stop work" };
function invalid(message: string): never { throw new ApiError(400, "VALIDATION_ERROR", message); }

async function currentOrders(projectId: string, session: ClientSession, vendorId?: string): Promise<PMRow[]> {
  return ProjectPurchaseOrderModel.find({ projectId, ...(vendorId ? { vendorId } : {}), cancelledAt: null, approvedRevisionId: { $type: "string" }, approvedRevision: { $ne: null } }).sort({ _id: 1 }).session(session).lean();
}
function vendorToken(vendorId: string, orders: PMRow[]): string { return pmDigest({ vendorId, orders: orders.filter(row => row.vendorId === vendorId).map(row => [String(row._id), row.approvedRevisionId]).sort() }); }
async function recipientIds(projectId: string, vendorId: string, session: ClientSession): Promise<string[]> {
  const vendor = await UserModel.find({ role: "vendor", vendorId, active: true }).select({ _id: 1 }).session(session).lean();
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "procurement", assigneeRole: "procurement", supersededAt: null }).select({ assigneeUserId: 1 }).session(session).lean();
  const manager = await resolveProjectManagerAssignment(projectId, session);
  const procurement = tasks.length === 1 && tasks[0]?.assigneeUserId ? await UserModel.findOne({ _id: tasks[0].assigneeUserId, role: "procurement", active: true }).select({ _id: 1 }).session(session).lean() : null;
  return [...new Set([...vendor.map(row => String(row._id)), ...(procurement ? [String(procurement._id)] : []), ...(manager.state === "assigned" && manager.ownerId ? [manager.ownerId] : [])])];
}
async function requireCurrentVendor(projectId: string, vendorId: string, session: ClientSession): Promise<PMRow[]> {
  const orders = await currentOrders(projectId, session, vendorId); if (!orders.length) pmMissing(); return orders;
}
async function noticeDto(row: PMRow, actor: PublicUser, session: ClientSession): Promise<PMItem> {
  return { id: String(row._id), kind: "vendor_notice", title: noticeNames[row.kind] ?? "Vendor notice", status: row.status,
    severity: row.status === "resolved" ? "success" : row.kind === "stop_work" ? "critical" : "warning", version: row.version,
    sourceToken: row.sourceToken, vendorId: row.vendorId, ownerName: row.vendorName, description: row.reason, evidenceIds: row.evidenceIds,
    dueAt: row.reviewDate ? `${row.reviewDate}T00:00:00.000Z` : null,
    facts: [{ label: "Issued", value: date(row.createdAt)! }, ...(row.kind === "stop_work" ? [{ label: "Held assignments", value: String(row.assignmentIds.length) }, { label: "Resumption", value: "Resume each assignment through Site execution after review." }] : []), ...(row.resolutionReason ? [{ label: "Resolution", value: row.resolutionReason }] : [])],
    actions: row.status === "resolved" ? [] : actor.role === "site_manager" ? [{ id: "resolve", label: "Resolve notice", reasonRequired: true }] : actor.role === "vendor" && row.status === "open" ? [{ id: "acknowledge", label: "Acknowledge", reasonRequired: true }] : [],
    history: await pmHistory(row.projectId, String(row._id), session) };
}

interface CertificationSource { order: PMRow; proposal: PMRow; milestone: PMRow; token: string; reviewerIds: Record<string, string>; }
async function certificationSource(projectId: string, orderId: string, milestoneId: string, session: ClientSession, lock = false): Promise<CertificationSource> {
  const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, projectId, cancelledAt: null, approvedRevisionId: { $type: "string" } }).session(session).lean();
  if (!order?.tenderAwardId) pmConflict("This order has no issued payment milestone source.");
  const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId, projectId, tenderAwardId: order.tenderAwardId }).session(session).lean();
  const award = await ProcurementBasketAwardModel.findOne({ _id: order.tenderAwardId, projectId, status: "issued", issuedPurchaseOrderId: orderId }).session(session).lean();
  const proposal = award ? await ProcurementBasketAwardRevisionModel.findOne({ _id: award.currentProposalRevisionId, awardId: award._id, projectId }).session(session).lean() : null;
  if (!revision || !proposal || proposal.vendorId !== order.vendorId) pmConflict("The issued milestone source is unavailable.");
  const milestone = (proposal.milestones as PMRow[]).find(row => row.id === milestoneId);
  if (!milestone || !Array.isArray(milestone.reviewerSlots) || !milestone.reviewerSlots.length) pmConflict("The milestone reviewer policy is not configured.");
  const assigned = await resolveBasketProjectApprovers(projectId, String(order.estimateId), milestone.reviewerSlots, session, lock);
  if (assigned.approverBlockers.length) pmConflict(assigned.approverBlockers[0]!.message);
  const reviewerIds: Record<string, string> = {};
  for (const slot of milestone.reviewerSlots as string[]) {
    const role = certificationReviewerRole(slot); if (!role) pmConflict("The milestone reviewer policy is not supported.");
    let id: string | null = null;
    if (slot === "program_manager" || slot === "designer") {
      id = slot === "program_manager" ? proposal.programManagerId : proposal.designerId;
      const current = slot === "program_manager" ? assigned.assignedSiteManager?.id : assigned.assignedDesigner?.id;
      if (!id || id !== current) pmConflict("The issued reviewer assignment changed. Reconcile the milestone before certification.");
    }
    else {
      const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: slot === "procurement" ? "procurement" : "finance", assigneeRole: role, supersededAt: null }).session(session).lean();
      if (tasks.length === 1) id = tasks[0]?.assigneeUserId ?? null;
    }
    if (!id || !await UserModel.exists({ _id: id, role, active: true }).session(session)) pmConflict("A required milestone reviewer is missing or inactive.");
    reviewerIds[slot] = id;
  }
  if (lock) {
    const fenced = await ProjectPurchaseOrderModel.updateOne({ _id: orderId, approvedRevisionId: order.approvedRevisionId, cancelledAt: null }, { $inc: { accessAuthorityEpoch: 1 } }, { session, timestamps: false });
    if (!fenced.matchedCount) pmConflict();
  }
  return { order, proposal, milestone, reviewerIds, token: pmDigest({ orderId, revisionId: order.approvedRevisionId, proposalId: proposal._id, milestone, reviewerIds }) };
}
function allowedCertificationSlot(actor: PublicUser, row: PMRow, source: CertificationSource): string | undefined {
  return (row.requiredSlots as string[]).find(slot => certificationReviewerRole(slot) === actor.role && row.reviewerIds[slot] === actor.id && source.reviewerIds[slot] === actor.id && !(row.decisions as PMRow[]).some(decision => decision.slot === slot));
}
async function certificationDto(row: PMRow, actor: PublicUser, session: ClientSession): Promise<PMItem> {
  let source: CertificationSource | null = null;
  try { source = await certificationSource(row.projectId, row.orderId, row.milestoneId, session); } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; }
  const current = source?.token === row.sourceToken;
  const slot = source && current ? allowedCertificationSlot(actor, row, source) : undefined;
  return { id: String(row._id), kind: "certification", title: row.milestoneName, status: row.status, severity: row.status === "certified" ? "success" : row.status === "rejected" ? "warning" : "neutral", version: row.version,
    sourceId: row.orderId, orderId: row.orderId, milestoneId: row.milestoneId, sourceToken: row.sourceToken, sourceAvailable: current, vendorId: row.vendorId, ownerName: row.vendorName, amountPaise: row.amountPaise, description: row.reason,
    evidenceIds: [...new Set<string>([...(row.evidenceIds ?? []), ...(row.decisions as PMRow[]).flatMap(decision => decision.evidenceIds ?? [])])],
    facts: [{ label: "Payment", value: "Not available from payment records" }, { label: "Reviewers", value: (row.requiredSlots as string[]).map(slot => certificationReviewerRole(slot)?.replaceAll("_", " ") ?? slot).join(", ") }, { label: "Decisions", value: `${row.decisions.length} / ${row.requiredSlots.length}` }, ...(!current ? [{ label: "Source", value: "Issued source or reviewer assignment changed. Reconciliation required." }] : [])],
    actions: slot && !["certified", "rejected"].includes(row.status) ? [{ id: "certify", label: "Certify milestone", reasonRequired: true }, { id: "reject", label: "Reject", reasonRequired: true }] : [], history: await pmHistory(row.projectId, String(row._id), session) };
}

export function createProjectManagerVendorsService(deps: PMDependencies & { execution: VendorExecutionService }) {
  const now = deps.now ?? (() => new Date());
  return {
    async vendors(actor: PublicUser, projectId: string, query: PMVendorQuery = {}): Promise<PMPanel> {
      const parsed = pmVendorListSchema.safeParse(query); if (!parsed.success) invalid("Vendor list filters are invalid."); const filters = parsed.data;
      return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, false, readers);
      if (actor.role === "vendor") await requireExecutionActor(actor, session);
      const orders = await currentOrders(projectId, session, actor.role === "vendor" ? actor.vendorId : undefined);
      if (actor.role === "vendor" && !orders.length) pmMissing();
      const panel = pmPanel("vendors", now());
      const notices = await ProjectVendorNoticeModel.find({ projectId, ...(actor.role === "vendor" ? { vendorId: actor.vendorId } : {}) }).sort({ createdAt: -1, _id: 1 }).session(session).lean();
      const certifications = await ProjectPaymentCertificationModel.find({ projectId, ...(actor.role === "vendor" ? { vendorId: actor.vendorId } : {}) }).sort({ createdAt: -1, _id: 1 }).session(session).lean();
      const vendorIds = [...new Set([...orders, ...notices, ...certifications].map(row => String(row.vendorId)))];
      const records: Array<{ id: string; kind: string; vendorId: string; row?: PMRow; item?: PMItem }> = [];
      for (const vendorId of vendorIds) {
        const vendorOrders = orders.filter(row => row.vendorId === vendorId); const token = vendorToken(vendorId, orders);
        const assignments = vendorOrders.length ? await VendorWorkAssignmentModel.find({ projectId, vendorId, $or: vendorOrders.map(order => ({ orderId: order._id, orderRevision: order.approvedRevision })), status: { $ne: "superseded" } }).session(session).lean() : [];
        const item: PMItem = { id: vendorId, kind: "vendor", title: String(vendorOrders[0]?.vendorName ?? notices.find(row => row.vendorId === vendorId)?.vendorName ?? certifications.find(row => row.vendorId === vendorId)?.vendorName ?? "Previously assigned vendor"), status: !vendorOrders.length ? "historical" : assignments.some(row => row.status === "in_progress") ? "in_progress" : "assigned", severity: "neutral", version: 0, sourceToken: token, vendorId, sourceAvailable: vendorOrders.length > 0,
          facts: [{ label: "Issued orders", value: String(vendorOrders.length) }, { label: "Assignments", value: String(assignments.length) }, { label: "Attendance / quality score", value: "No calculated policy available" }], actions: actor.role === "site_manager" && vendorOrders.length ? [{ id: "issue_notice", label: "Issue notice" }] : [] };
        records.push({ id: item.id, kind: item.kind, vendorId, item });
        for (const notice of notices.filter(row => row.vendorId === vendorId)) records.push({ id: String(notice._id), kind: "vendor_notice", vendorId, row: notice });
        for (const certification of certifications.filter(row => row.vendorId === vendorId)) records.push({ id: String(certification._id), kind: "certification", vendorId, row: certification });
        for (const order of vendorOrders) {
          if (actor.role !== "vendor") {
            const cost = await FinanceLedgerEntryModel.find({ projectId, purchaseOrderId: order._id, type: "direct_spend", expenseClass: "procurement", status: "posted" }).select({ amountPaise: 1 }).session(session).lean();
            const valid = cost.every(row => Number.isSafeInteger(row.amountPaise) && row.amountPaise >= 0);
            const total = valid ? cost.reduce((sum, row) => sum + BigInt(row.amountPaise), 0n) : null;
            item.facts.push({ label: `${order.orderNumber} recorded cost`, value: total === null || total > BigInt(Number.MAX_SAFE_INTEGER) ? "Source unavailable" : cost.length ? `INR ${(Number(total) / 100).toFixed(2)}` : "Not recorded" });
          }
          if (order.tenderAwardId) {
            const award = await ProcurementBasketAwardModel.findById(order.tenderAwardId).session(session).lean();
            const proposal = award ? await ProcurementBasketAwardRevisionModel.findById(award.currentProposalRevisionId).session(session).lean() : null;
            for (const milestone of (proposal?.milestones ?? []) as PMRow[]) {
              try {
                const source = await certificationSource(projectId, String(order._id), milestone.id, session);
                const existing = certifications.some(row => row.orderRevisionId === order.approvedRevisionId && row.milestoneId === milestone.id);
                panel.sources.push({ id: `${order._id}:${milestone.id}`, label: `${order.orderNumber} · ${milestone.name}`, sourceToken: source.token, vendorId });
                if (!existing) records.push({ id: `${order._id}:${milestone.id}`, kind: "payment_milestone", vendorId, item: { id: `${order._id}:${milestone.id}`, sourceId: String(order._id), orderId: String(order._id), milestoneId: milestone.id, kind: "payment_milestone", title: milestone.name, status: "not_requested", severity: "neutral", version: 0, sourceToken: source.token, vendorId, ownerName: item.title, amountPaise: milestone.amountPaise,
                  facts: [{ label: "Order", value: order.orderNumber }, { label: "Payment", value: "Not available from payment records" }, { label: "Reviewers", value: milestone.reviewerSlots.map((slot: string) => certificationReviewerRole(slot)?.replaceAll("_", " ") ?? slot).join(", ") }], actions: actor.role === "procurement" ? [{ id: "request_certification", label: "Request certification" }] : [] } });
              } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; panel.issues.push(`${order.orderNumber}: ${(error as Error).message}`); }
            }
          }
        }
        if (vendorOrders.length) panel.sources.push({ id: vendorId, label: item.title, sourceToken: token, vendorId });
      }
      const matching = records.filter(record => (!filters.kind || record.kind === filters.kind) && (!filters.vendorId || record.vendorId === filters.vendorId));
      panel.total = matching.length;
      for (const record of matching.slice(filters.offset, filters.offset + filters.limit)) panel.items.push(record.item ?? (record.kind === "vendor_notice" ? await noticeDto(record.row!, actor, session) : await certificationDto(record.row!, actor, session)));
      const visibleIds = new Set(panel.items.map(item => item.id)); panel.sources = panel.sources.filter(source => visibleIds.has(source.id));
      panel.availability = panel.total ? "available" : "no_data";
      return panel;
    }); },
    async createNotice(actor: PublicUser, projectId: string, value: unknown): Promise<PMItem> { const parsed = pmNoticeSchema.safeParse(value); if (!parsed.success) invalid(parsed.error.issues.map(row => row.message).join(" ")); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true); const payload = { action: "create_notice", ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const orders = await requireCurrentVendor(projectId, input.vendorId, session); if (vendorToken(input.vendorId, orders) !== input.sourceToken) pmConflict("Vendor order scope changed. Refresh before issuing a notice.");
      if (await ProjectVendorNoticeModel.exists({ _id: input.recordId }).session(session)) pmConflict();
      await assertPMEvidence(projectId, input.recordId, input.evidenceIds, session);
      for (const selected of input.assignments) {
        const assignment = await VendorWorkAssignmentModel.findOne({ _id: selected.assignmentId, projectId, vendorId: input.vendorId }).session(session).lean(); if (!assignment) pmMissing();
        await deps.execution.commandInSession(actor, selected.assignmentId, { action: "hold", expectedVersion: selected.expectedVersion, idempotencyKey: `pm-hold:${pmDigest([input.recordId, selected.assignmentId]).slice(0,64)}`, reason: input.reason, reviewDate: input.reviewDate }, projectId, session);
      }
      const [row] = await ProjectVendorNoticeModel.create([{ _id: input.recordId, projectId, vendorId: input.vendorId, vendorName: orders[0]!.vendorName, sourceToken: input.sourceToken, kind: input.kind, reason: input.reason, evidenceIds: input.evidenceIds,
        assignmentIds: input.assignments.map(item => item.assignmentId), reviewDate: input.reviewDate ?? null, status: "open", version: 1, createdById: actor.id, createdAt: now() }], { session });
      const result = await noticeDto(row!.toObject(), actor, session);
      await pmRecord(deps, { projectId, entityId: input.recordId, family: "vendor_notice", actor, key: input.idempotencyKey, payload, action: "created", version: 1, reason: input.reason, result, recipientIds: await recipientIds(projectId, input.vendorId, session) }, session); return result;
    }); },
    async actNotice(actor: PublicUser, projectId: string, noticeId: string, value: unknown): Promise<PMItem> { const parsed = pmNoticeActionSchema.safeParse(value); if (!parsed.success) invalid("Enter a valid notice action and reason."); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true, ["site_manager", "vendor"]); const payload = { noticeId, ...input };
      if (actor.role === "vendor") await requireExecutionActor(actor, session);
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const row = await ProjectVendorNoticeModel.findOne({ _id: noticeId, projectId }).session(session).lean(); if (!row || actor.role === "vendor" && row.vendorId !== actor.vendorId) pmMissing();
      if (actor.role === "vendor") await requireCurrentVendor(projectId, row.vendorId, session);
      if (row.version !== input.expectedVersion || row.status === "resolved") pmConflict();
      if (input.action === "resolve" && actor.role !== "site_manager" || input.action === "acknowledge" && (actor.role !== "vendor" || row.status !== "open")) pmMissing();
      await assertPMEvidence(projectId, noticeId, input.evidenceIds, session);
      const updated = await ProjectVendorNoticeModel.findOneAndUpdate({ _id: noticeId, version: input.expectedVersion }, { $inc: { version: 1 }, $addToSet: { evidenceIds: { $each: input.evidenceIds } }, $set: input.action === "resolve" ? { status: "resolved", resolvedById: actor.id, resolvedAt: now(), resolutionReason: input.reason } : { status: "acknowledged" } }, { session, returnDocument: "after", runValidators: true }).lean(); if (!updated) pmConflict();
      const result = await noticeDto(updated, actor, session); await pmRecord(deps, { projectId, entityId: noticeId, family: "vendor_notice", actor, key: input.idempotencyKey, payload, action: input.action, version: updated.version, reason: input.reason, result, recipientIds: await recipientIds(projectId, row.vendorId, session) }, session); return result;
    }); },
    async createCertification(actor: PublicUser, projectId: string, value: unknown): Promise<PMItem> { const parsed = pmCertificationSchema.safeParse(value); if (!parsed.success) invalid("Enter a valid issued milestone and reason."); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true, ["procurement"]); const payload = { action: "request_certification", ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      if (input.expectedVersion !== 0) pmConflict(); const source = await certificationSource(projectId, input.orderId, input.milestoneId, session, true); if (source.token !== input.sourceToken) pmConflict("The issued milestone or reviewers changed.");
      if (await ProjectPaymentCertificationModel.exists({ $or: [{ _id: input.recordId }, { projectId, orderRevisionId: source.order.approvedRevisionId, milestoneId: input.milestoneId }] }).session(session)) pmConflict("A certification request already exists for this issued milestone.");
      await assertPMEvidence(projectId, input.recordId, input.evidenceIds, session);
      const [row] = await ProjectPaymentCertificationModel.create([{ _id: input.recordId, projectId, vendorId: source.order.vendorId, vendorName: source.order.vendorName, orderId: input.orderId, orderRevisionId: source.order.approvedRevisionId, proposalRevisionId: source.proposal._id,
        milestoneId: input.milestoneId, milestoneName: source.milestone.name, amountPaise: source.milestone.amountPaise, sourceToken: source.token, requiredSlots: source.milestone.reviewerSlots, reviewerIds: source.reviewerIds,
        reason: input.reason, evidenceIds: input.evidenceIds, decisions: [], status: "requested", version: 1, createdById: actor.id, createdAt: now() }], { session });
      const result = await certificationDto(row!.toObject(), actor, session); await pmRecord(deps, { projectId, entityId: input.recordId, family: "certification", actor, key: input.idempotencyKey, payload, action: "requested", version: 1, reason: input.reason, result, recipientIds: Object.values(source.reviewerIds) }, session); return result;
    }); },
    async actCertification(actor: PublicUser, projectId: string, certificationId: string, value: unknown): Promise<PMItem> { const parsed = pmCertificationActionSchema.safeParse(value); if (!parsed.success) invalid("Enter a valid certification decision and reason."); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true, ["site_manager", "designer", "procurement", "finance_head"]); const payload = { certificationId, ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const row = await ProjectPaymentCertificationModel.findOne({ _id: certificationId, projectId }).session(session).lean(); if (!row) pmMissing();
      const source = await certificationSource(projectId, row.orderId, row.milestoneId, session, true);
      if (source.token !== input.sourceToken || source.token !== row.sourceToken || row.version !== input.expectedVersion || ["certified", "rejected"].includes(row.status)) pmConflict();
      const slot = allowedCertificationSlot(actor, row, source); if (!slot) pmMissing();
      await assertPMEvidence(projectId, certificationId, input.evidenceIds, session);
      const decisions = [...row.decisions, { slot, actorId: actor.id, outcome: input.action, reason: input.reason, evidenceIds: input.evidenceIds, at: now() }];
      const updated = await ProjectPaymentCertificationModel.findOneAndUpdate({ _id: certificationId, version: input.expectedVersion }, { $inc: { version: 1 }, $set: { decisions, status: certificationStatus(row.requiredSlots, decisions) } }, { session, returnDocument: "after", runValidators: true }).lean(); if (!updated) pmConflict();
      const result = await certificationDto(updated, actor, session); await pmRecord(deps, { projectId, entityId: certificationId, family: "certification", actor, key: input.idempotencyKey, payload, action: input.action, version: updated.version, reason: input.reason, result, recipientIds: Object.values(source.reviewerIds) }, session); return result;
    }); }
  };
}
