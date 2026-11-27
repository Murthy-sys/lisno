import type { ClientSession } from "mongoose";
import type { PublicUser } from "../auth.service.js";
import type { ProcurementPaymentCommand } from "../../domain/procurement-payments.js";
import { allocationTotal, authorizationTotals, normalizedPaymentReference } from "../../domain/procurement-payments.js";
import { lcConflict, lcLocalDate, lcNewId, lcSum } from "../../domain/procurement-lifecycle.js";
import { ProcurementPaymentAccountModel } from "../../models/ProcurementPaymentAccount.js";
import { ProcurementPaymentAuthorizationModel } from "../../models/ProcurementPaymentAuthorization.js";
import { ProcurementPaymentObligationModel } from "../../models/ProcurementPaymentObligation.js";
import { ProcurementPaymentTransactionModel } from "../../models/ProcurementPaymentTransaction.js";
import { ProcurementPaymentCorrectionModel } from "../../models/ProcurementPaymentCorrection.js";
import { ProcurementPaymentReconciliationModel } from "../../models/ProcurementPaymentReconciliation.js";
import { ProcurementPaymentRetentionModel } from "../../models/ProcurementPaymentRetention.js";
import { ProcurementLifecycleStateModel } from "../../models/ProcurementLifecycleState.js";
import { ProjectWorkflowTaskModel } from "../../models/ProjectWorkflowTask.js";
import { UserModel } from "../../models/User.js";
import { assertLifecycleEvidence } from "../procurement-lifecycle/evidence.js";
import type { LifecycleRow } from "../procurement-lifecycle/access.js";
import { paymentRows, projectPaymentOrder, effectivePaid, effectiveNewPayments, retentionRemaining, authorizationCurrent } from "./projection.js";
import { readPaymentSource } from "./source.js";

export async function applyPaymentCommand(actor: PublicUser, projectId: string, input: ProcurementPaymentCommand, session: ClientSession, project: LifecycleRow, at: Date) {
  const lifecycle = await ProcurementLifecycleStateModel.findOne({ projectId }).session(session).lean();
  if (!lifecycle) lcConflict("Set up the procurement lifecycle before payment actions.");
  const source = await readPaymentSource(projectId, input.orderId, session, true);
  const rows = await paymentRows(projectId, input.orderId, session);
  if ((rows.account?.version ?? 0) !== input.expectedVersion) lcConflict("This order's payment record changed. Refresh before continuing.");
  if (source.digest !== input.sourceDigest) lcConflict("The issued milestone, reviewer, or Finance source changed. Refresh before continuing.");
  const openingCorrection = input.action === "reconcile" && Boolean(input.supersedesReconciliationId);
  if (!source.available && !openingCorrection && !["reverse", "request_correction", "resolve_correction"].includes(input.action)) lcConflict(source.blockers[0]?.message ?? "The payment source is unavailable.");
  const before = await projectPaymentOrder(source, rows, session, at);
  const version = input.expectedVersion + 1;
  const changes: Record<string, unknown> = { updatedAt: at, updatedById: actor.id };
  const common = { projectId, orderId: input.orderId, accountVersion: version, actorId: actor.id, occurredAt: at };
  const milestone = (id: string) => { const row = source.milestones.find(item => item.id === id); if (!row) lcConflict("Choose a milestone from this issued order."); return row; };

  if (input.action === "propose_dates" || input.action === "confirm_dates") {
    for (const value of input.dates) {
      if (milestone(value.milestoneId).amountPaise === 0) lcConflict("Zero-value milestones do not require payment dates.");
      const previous = rows.dates.find(row => row.milestoneId === value.milestoneId && row.kind === "confirmed");
      const retained = before.milestones.find(row => row.id === value.milestoneId)?.retention;
      if (retained?.acknowledgedAt && input.action === "confirm_dates" && value.dueDate !== retained.dueDate) lcConflict("An acknowledged retention date must be replaced through Finance retention approval and Admin acknowledgement.");
      await ProcurementPaymentObligationModel.create([{ _id: lcNewId("payment-date"), ...common, milestoneId: value.milestoneId, orderRevisionId: source.order.approvedRevisionId, kind: input.action === "propose_dates" ? "proposed" : "confirmed", dueDate: value.dueDate, originalDueDate: previous?.originalDueDate ?? (input.action === "confirm_dates" ? value.dueDate : null), reason: input.reason }], { session });
    }
  } else if (input.action === "authorize") {
    if (new Set(input.allocations.map(row => row.milestoneId)).size !== input.allocations.length) lcConflict("Authorize each milestone once.");
    const totals = authorizationTotals(input.allocations);
    if (!totals.grossPaise || totals.grossPaise !== totals.netPaise + totals.withholdingPaise) lcConflict("Gross, withholding, and net allocations must reconcile.");
    if (input.basis === "invoice") {
      if (!source.assessment || source.assessment._id !== input.assessmentRevisionId) lcConflict("Use the current Finance invoice assessment.");
      if (totals.grossPaise !== source.assessment.invoiceTotalPaise || totals.withholdingPaise !== source.assessment.tdsPaise || totals.netPaise !== source.assessment.netPayablePaise) lcConflict("Milestone allocations must exactly reconcile to the assessed invoice and withholding.");
      if (source.milestones.some(row => !input.allocations.some(part => part.milestoneId === row.id))) lcConflict("Include every issued milestone in the invoice allocation, including zero amounts.");
    } else {
      if (source.assessment || input.assessmentRevisionId !== null || input.allocations.length !== 1 || input.allocations[0]?.milestoneId !== "advance") lcConflict("An advance authorization must use only the issued advance milestone before invoice assessment.");
    }
    const allocations = input.allocations.map(part => {
      const current = milestone(part.milestoneId);
      if (part.grossPaise > current.amountPaise || part.grossPaise !== part.netPaise + part.withholdingPaise) lcConflict(`${current.name}: gross, withholding, and net must reconcile within the issued amount.`);
      if (before.openingConfirmed && effectivePaid(rows, current.id) > part.netPaise) lcConflict(`${current.name}: the new net authorization is below recorded vendor payments. Record a justified correction first.`);
      return { ...part, certificationId: current.certificationId, certificationToken: current.token };
    });
    const id = lcNewId("payment-authorization");
    await ProcurementPaymentAuthorizationModel.create([{ _id: id, projectId, orderId: input.orderId, vendorId: source.order.vendorId, orderRevisionId: source.order.approvedRevisionId, proposalRevisionId: source.proposal!._id, basis: input.basis, assessmentRevisionId: input.assessmentRevisionId, allocations, accountVersion: version, authorizedById: actor.id, authorizedAt: at, reason: input.reason }], { session });
    changes.currentAuthorizationId = id;
  } else if (input.action === "record") {
    if (!before.openingConfirmed) lcConflict("Finance must reconcile historical payments first.");
    if (!authorizationCurrent(source, rows)) lcConflict("Current Finance authorization is required.");
    if (new Date(input.paidAt) > at) lcConflict("A completed payment cannot have a future payment time.");
    if (allocationTotal(input.allocations) !== input.amountPaise) lcConflict("The transaction amount must equal its milestone allocations.");
    if (!input.evidenceIds.length) lcConflict("Payment evidence is required.");
    await assertLifecycleEvidence(projectId, input.transactionId, input.evidenceIds, session, "payment");
    let replaced: LifecycleRow | null = null;
    if (input.replacesTransactionId) {
      if (!["finance_head", "super_admin"].includes(actor.role)) lcConflict("Only Finance or Super Admin can replace a reversed payment.");
      replaced = rows.payments.find(row => row._id === input.replacesTransactionId) ?? null;
      if (rows.payments.some(row => row.replacesTransactionId === input.replacesTransactionId)) lcConflict("This payment already has an immutable replacement.");
      if (!replaced || !rows.corrections.some(row => row.transactionId === input.replacesTransactionId && row.kind === "reversal")) lcConflict("A replacement must link to an already reversed payment on this order.");
    }
    const allocations = input.allocations.map(part => {
      const row = before.milestones.find(item => item.id === part.milestoneId);
      if (!row || row.readiness !== "ready" || row.remainingPaise === null || row.remainingPaise < part.amountPaise) lcConflict("Each payment allocation needs a current certified, authorized balance and confirmed date.");
      const originalParts: LifecycleRow[] = replaced?.allocations.filter((prior: LifecycleRow) => prior.milestoneId === part.milestoneId) ?? [];
      // Replacing ordinary cash never consumes or restores an unrelated retained
      // grant. A retained replacement keeps the original grant lineage.
      const correctionBound = lcSum(originalParts.map(prior => prior.amountPaise - (prior.retentionAmountPaise ?? 0)));
      const originalGrant = originalParts.find(prior => (prior.retentionAmountPaise ?? 0) > 0)?.retentionId;
      const grantId = originalGrant ?? (row.retention?.acknowledgedAt ? row.retention.id : null);
      const grant = grantId ? rows.retentions.find(item => item._id === grantId && item.kind === "approved" && item.milestoneId === part.milestoneId) : undefined;
      const acknowledged = grant && rows.retentions.some(item => item.kind === "acknowledged" && item.approvalId === grant._id);
      const grantAvailable = acknowledged ? retentionRemaining(rows, grant) : 0;
      if (grantAvailable < 0) lcConflict("The retained grant requires Finance reconciliation.");
      const retentionAmountPaise = Math.min(Math.max(0, part.amountPaise - correctionBound), grantAvailable);
      if (project.status === "completed") {
        if (replaced && part.amountPaise > lcSum(originalParts.map(prior => prior.amountPaise))) lcConflict("A post-signoff replacement cannot exceed the reversed allocation.");
        if (part.amountPaise > correctionBound + retentionAmountPaise) lcConflict("After signoff only the unused retained grant or Finance replacement of a reversed payment may be recorded.");
      }
      return { ...part, id: lcNewId("payment-allocation"), retentionId: retentionAmountPaise > 0 ? grantId : null, retentionAmountPaise };
    });
    const normalizedReference = normalizedPaymentReference(input.reference);
    const duplicate = await ProcurementPaymentTransactionModel.findOne({ projectId, vendorId: source.order.vendorId, method: input.method, normalizedReference, isReferenceOrigin: true }).session(session).lean();
    if (duplicate && (!replaced || (replaced.referenceOriginId ?? replaced._id) !== duplicate._id)) lcConflict("This payment reference is already recorded. Use Finance correction/reconciliation; do not record it twice.");
    if (await ProcurementPaymentTransactionModel.exists({ _id: input.transactionId }).session(session)) lcConflict("This transaction ID is already recorded.");
    await ProcurementPaymentTransactionModel.create([{ _id: input.transactionId, projectId, orderId: input.orderId, vendorId: source.order.vendorId, orderRevisionId: source.order.approvedRevisionId, authorizationId: rows.authorization!._id, currency: "INR", amountPaise: input.amountPaise, allocations, paidAt: new Date(input.paidAt), recordedAt: at, actorId: actor.id, method: input.method, reference: input.reference, normalizedReference, isReferenceOrigin: !duplicate, referenceOriginId: duplicate?._id ?? null, evidenceIds: input.evidenceIds, note: input.note ?? null, replacesTransactionId: replaced?._id ?? null }], { session });
  } else if (input.action === "reverse" || input.action === "request_correction") {
    if (!rows.payments.some(row => row._id === input.transactionId)) lcConflict("Choose a recorded payment from this project and order.");
    if (input.action === "reverse" && rows.corrections.some(row => row.kind === "reversal" && row.transactionId === input.transactionId)) lcConflict("This payment already has an immutable reversal.");
    if (input.action === "request_correction" && rows.corrections.some(row => row.kind === "request" && row.transactionId === input.transactionId && !rows.corrections.some(decision => decision.requestId === row._id))) lcConflict("This payment already has an open correction request.");
    await ProcurementPaymentCorrectionModel.create([{ _id: lcNewId("payment-correction"), ...common, transactionId: input.transactionId, kind: input.action === "reverse" ? "reversal" : "request", reason: input.reason }], { session });
  } else if (input.action === "resolve_correction") {
    const request = rows.corrections.find(row => row._id === input.requestId && row.kind === "request");
    if (!request || rows.corrections.some(row => row.requestId === input.requestId)) lcConflict("This correction request is unavailable or already resolved.");
    if (input.decision === "corrected" && !rows.corrections.some(row => row.kind === "reversal" && row.transactionId === request.transactionId)) lcConflict("Record the immutable reversal before resolving the request as corrected.");
    await ProcurementPaymentCorrectionModel.create([{ _id: lcNewId("payment-correction"), ...common, transactionId: request.transactionId, kind: input.decision === "corrected" ? "resolved" : "rejected", requestId: input.requestId, reason: input.reason }], { session });
  } else if (input.action === "reconcile") {
    const currentId = rows.account?.openingReconciliationId ?? null;
    if (currentId ? input.supersedesReconciliationId !== currentId : Boolean(input.supersedesReconciliationId)) lcConflict("Opening correction must supersede the current reconciliation. Refresh before continuing.");
    const previous = currentId ? await ProcurementPaymentReconciliationModel.findOne({ _id: currentId, projectId, orderId: input.orderId, vendorId: rows.account!.vendorId }).session(session).lean() as LifecycleRow | null : null;
    if (currentId && !previous) lcConflict("The current opening reconciliation source is unavailable.");
    if (new Set(input.openingBalances.map(row => row.milestoneId)).size !== input.openingBalances.length) lcConflict("Reconcile each opening milestone once.");
    if (!previous && rows.payments.length) lcConflict("Initial opening reconciliation must precede new payment entries.");
    const total = lcSum(input.openingBalances.map(row => row.amountPaise));
    if ((previous || total > 0) && !input.evidenceIds.length) lcConflict("Evidence is required for opening corrections and nonzero historical opening payments.");
    await assertLifecycleEvidence(projectId, input.reconciliationId, input.evidenceIds, session, "payment");
    if (await ProcurementPaymentReconciliationModel.exists({ _id: input.reconciliationId }).session(session)) lcConflict("This reconciliation ID is already recorded.");
    const sameSource = !previous || previous.orderRevisionId === source.order.approvedRevisionId && previous.vendorId === source.order.vendorId;
    // Persist the issued/authorized limits with the opening decision. A later
    // correction remains possible if that order is cancelled or superseded,
    // without borrowing another revision's milestone identities or prices.
    let bounds: Array<{ milestoneId: string; maxPaise: number }> = previous?.bounds?.map((row: LifecycleRow) => ({ milestoneId: row.milestoneId, maxPaise: row.maxPaise })) ?? [];
    if (sameSource && source.available) {
      bounds = source.milestones.map(row => ({ milestoneId: row.id, maxPaise: before.milestones.find(item => item.id === row.id)?.authorizedNetPaise ?? bounds.find(item => item.milestoneId === row.id)?.maxPaise ?? row.amountPaise }));
    }
    if (!bounds.length) lcConflict("The historical issued or authorized opening limits are unavailable.");
    for (const part of input.openingBalances) if (!bounds.some(row => row.milestoneId === part.milestoneId)) lcConflict("Opening corrections must retain their original issued milestone scope.");
    for (const bound of bounds) {
      const openingPaise = input.openingBalances.find(row => row.milestoneId === bound.milestoneId)?.amountPaise ?? 0;
      if (lcSum([openingPaise, effectiveNewPayments(rows, bound.milestoneId)]) > bound.maxPaise) lcConflict("Corrected opening balances plus effective recorded payments exceed the authorized or issued bound.");
    }
    await ProcurementPaymentReconciliationModel.create([{ _id: input.reconciliationId, projectId, orderId: input.orderId, vendorId: previous?.vendorId ?? source.order.vendorId, orderRevisionId: previous?.orderRevisionId ?? source.order.approvedRevisionId, balances: input.openingBalances, bounds, sourceDigest: source.digest, accountVersion: version, supersedesReconciliationId: currentId, actorId: actor.id, occurredAt: at, evidenceIds: input.evidenceIds, reason: input.reason }], { session });
    changes.openingConfirmed = true; changes.openingBalances = input.openingBalances; changes.openingReconciliationId = input.reconciliationId;
  } else if (input.action === "approve_retention") {
    const row = before.milestones.find(item => item.id === input.milestoneId);
    if (!row || row.readiness !== "ready" || row.remainingPaise !== input.amountPaise || !authorizationCurrent(source, rows)) lcConflict("Retention must cover exactly the certified, authorized remaining milestone balance.");
    if (input.dueDate <= lcLocalDate(at, before.timezone)) lcConflict("Retention requires a future due date.");
    const owner = await UserModel.findOne({ _id: input.ownerId, active: true, role: { $in: ["procurement", "finance_head"] } }).session(session).lean();
    const tasks = owner ? await ProjectWorkflowTaskModel.find({ projectId, kind: owner.role === "procurement" ? "procurement" : "finance", assigneeRole: owner.role, supersededAt: null }).session(session).lean() : [];
    if (!owner || tasks.length !== 1 || tasks[0]?.assigneeUserId !== input.ownerId) lcConflict("Choose the active assigned Procurement or Finance owner for retention.");
    await ProcurementPaymentRetentionModel.create([{ _id: lcNewId("payment-retention"), ...common, milestoneId: input.milestoneId, authorizationId: rows.authorization!._id, kind: "approved", amountPaise: input.amountPaise, dueDate: input.dueDate, ownerId: input.ownerId, reason: input.reason }], { session });
  } else if (input.action === "acknowledge_retention") {
    const approval = rows.retentions.find(row => row._id === input.retentionId && row.kind === "approved");
    if (!approval || approval.authorizationId !== rows.authorization?._id || !authorizationCurrent(source, rows) || rows.retentions.some(row => row.approvalId === approval._id)) lcConflict("This Finance retention approval is stale or already acknowledged.");
    if (rows.retentions.find(row => row.kind === "approved" && row.milestoneId === approval.milestoneId)?._id !== approval._id) lcConflict("A newer Finance retention decision exists.");
    const balance = before.milestones.find(row => row.id === approval.milestoneId)?.remainingPaise;
    if (balance !== approval.amountPaise || approval.dueDate <= lcLocalDate(at, before.timezone)) lcConflict("The retained balance or due date changed.");
    await ProcurementPaymentRetentionModel.create([{ _id: lcNewId("payment-retention-ack"), ...common, milestoneId: approval.milestoneId, authorizationId: approval.authorizationId, kind: "acknowledged", approvalId: approval._id, amountPaise: approval.amountPaise, dueDate: approval.dueDate, ownerId: approval.ownerId, reason: input.reason }], { session });
  }
  if (rows.account) {
    const changed = await ProcurementPaymentAccountModel.updateOne({ _id: rows.account._id, projectId, orderId: input.orderId, version: input.expectedVersion }, { $set: changes, $inc: { version: 1 } }, { session, runValidators: true });
    if (changed.matchedCount !== 1) lcConflict();
  } else await ProcurementPaymentAccountModel.create([{ _id: lcNewId("payment-account"), projectId, orderId: input.orderId, vendorId: source.order.vendorId, version, openingConfirmed: before.openingConfirmed, openingBalances: [], ...changes }], { session });
  return projectPaymentOrder(source, await paymentRows(projectId, input.orderId, session), session, at);
}
