import type { ClientSession } from "mongoose";
import type { LifecycleReadiness } from "../../contracts/procurement-lifecycle.js";
import type { PaymentAlertSource, PaymentMilestone, PaymentOrder, ProcurementPaymentAction } from "../../contracts/procurement-payments.js";
import { lcDigest, lcLocalDate, lcSum } from "../../domain/procurement-lifecycle.js";
import { paymentTiming } from "../../domain/procurement-payments.js";
import { ProcurementLifecycleStateModel } from "../../models/ProcurementLifecycleState.js";
import { ProcurementPaymentAccountModel } from "../../models/ProcurementPaymentAccount.js";
import { ProcurementPaymentAuthorizationModel } from "../../models/ProcurementPaymentAuthorization.js";
import { ProcurementPaymentObligationModel } from "../../models/ProcurementPaymentObligation.js";
import { ProcurementPaymentTransactionModel } from "../../models/ProcurementPaymentTransaction.js";
import { ProcurementPaymentCorrectionModel } from "../../models/ProcurementPaymentCorrection.js";
import { ProcurementPaymentRetentionModel } from "../../models/ProcurementPaymentRetention.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import type { LifecycleRow } from "../procurement-lifecycle/access.js";
import { readPaymentSource, paymentBlocker, type PaymentSource } from "./source.js";

export async function paymentRows(projectId: string, orderId: string, session: ClientSession) {
  const account = await ProcurementPaymentAccountModel.findOne({ projectId, orderId }).session(session).lean() as LifecycleRow | null;
  const authorization = account?.currentAuthorizationId ? await ProcurementPaymentAuthorizationModel.findOne({ _id: account.currentAuthorizationId, projectId, orderId }).session(session).lean() as LifecycleRow | null : null;
  const dates = await ProcurementPaymentObligationModel.find({ projectId, orderId }).sort({ accountVersion: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  const payments = await ProcurementPaymentTransactionModel.find({ projectId, orderId }).session(session).lean() as LifecycleRow[];
  const corrections = await ProcurementPaymentCorrectionModel.find({ projectId, orderId }).session(session).lean() as LifecycleRow[];
  const retentions = await ProcurementPaymentRetentionModel.find({ projectId, orderId }).sort({ accountVersion: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  return { account, authorization, dates, payments, corrections, retentions };
}
export type PaymentRows = Awaited<ReturnType<typeof paymentRows>>;
export function effectiveNewPayments(rows: PaymentRows, milestoneId: string): number {
  const reversed = new Set(rows.corrections.filter(row => row.kind === "reversal").map(row => row.transactionId));
  return lcSum(rows.payments.filter(row => !reversed.has(row._id)).flatMap(row => row.allocations.filter((part: LifecycleRow) => part.milestoneId === milestoneId).map((part: LifecycleRow) => part.amountPaise)));
}
export function effectivePaid(rows: PaymentRows, milestoneId: string): number {
  return lcSum([...(rows.account?.openingBalances ?? []).filter((row: LifecycleRow) => row.milestoneId === milestoneId).map((row: LifecycleRow) => row.amountPaise), effectiveNewPayments(rows, milestoneId)]);
}
/** A reversal restores only the immutable grant consumed by that transaction. */
export function retentionRemaining(rows: PaymentRows, grant: LifecycleRow): number {
  const reversed = new Set(rows.corrections.filter(row => row.kind === "reversal").map(row => row.transactionId));
  const consumed = lcSum(rows.payments.filter(row => !reversed.has(row._id)).flatMap(row => row.allocations.filter((part: LifecycleRow) => part.retentionId === grant._id).map((part: LifecycleRow) => part.retentionAmountPaise ?? 0)));
  return grant.amountPaise - consumed;
}
export function authorizationCurrent(source: PaymentSource, rows: PaymentRows): boolean {
  const auth = rows.authorization;
  return Boolean(auth && source.available && auth.orderRevisionId === source.order.approvedRevisionId && auth.proposalRevisionId === source.proposal?._id &&
    (auth.basis === "invoice" ? auth.assessmentRevisionId === source.assessment?._id : !source.assessment));
}
export function paymentActions(role: string | undefined, closed: boolean, source: PaymentOrder): ProcurementPaymentAction[] {
  if (!role) return [];
  if (role === "procurement") return closed ? source.milestones.some(row => row.readiness === "ready" && row.retention?.acknowledgedAt && row.retention.remainingPaise > 0 && (row.remainingPaise ?? 0) > 0) ? ["record"] : [] : ["propose_dates", ...(source.openingConfirmed && source.sourceAvailable ? ["record" as const] : []), "request_correction"];
  const openingCorrection: ProcurementPaymentAction[] = closed && source.openingReconciliation ? ["reconcile"] : [];
  if (role === "finance_head") return [...(!closed ? ["confirm_dates", "authorize", "reconcile", "approve_retention"] as const : openingCorrection), "record", "reverse", "resolve_correction"];
  if (role === "super_admin") return [...(!closed ? ["confirm_dates", "authorize", "reconcile", "acknowledge_retention"] as const : openingCorrection), "record", "reverse", "resolve_correction"];
  return [];
}
export async function projectPaymentOrder(source: PaymentSource, rows: PaymentRows, session: ClientSession, at = new Date()): Promise<PaymentOrder> {
  const projectId = String(source.order.projectId), orderId = String(source.order._id);
  const lifecycle = await ProcurementLifecycleStateModel.findOne({ projectId }).session(session).lean();
  const timezone = lifecycle?.policy?.timezone ?? "Asia/Kolkata", today = lcLocalDate(at, timezone);
  const openingConfirmed = Boolean(rows.account?.openingConfirmed || lifecycle && source.order.approvedAt && new Date(source.order.approvedAt) >= new Date(lifecycle.activatedAt));
  const currentAuth = authorizationCurrent(source, rows);
  const blockers = [...source.blockers];
  if (!lifecycle) blockers.push(paymentBlocker("PAYMENT_LIFECYCLE_SETUP", "Set up this project's procurement lifecycle before recording payments.", orderId));
  if (!openingConfirmed) blockers.push(paymentBlocker("PAYMENT_OPENING_UNKNOWN", "Finance must confirm historical opening payments, including an explicit zero if none were made.", orderId));
  if (!currentAuth && source.milestones.some(row => row.amountPaise > 0)) blockers.push(paymentBlocker("PAYMENT_AUTHORIZATION_REQUIRED", rows.authorization ? "The payment authorization source changed. Finance must reconcile it." : "Finance payment authorization is required.", orderId));
  const unresolved = rows.corrections.filter(row => row.kind === "request" && !rows.corrections.some(decision => decision.requestId === row._id));
  if (unresolved.length) blockers.push(paymentBlocker("PAYMENT_CORRECTION_PENDING", `${unresolved.length} payment correction request(s) need Finance review.`, orderId));
  const milestones: PaymentMilestone[] = source.milestones.map(milestone => {
    const confirmed = rows.dates.find(row => row.milestoneId === milestone.id && row.kind === "confirmed");
    const proposed = rows.dates.find(row => row.milestoneId === milestone.id && row.kind === "proposed" && (!confirmed || row.accountVersion > confirmed.accountVersion));
    const allocation = currentAuth ? rows.authorization!.allocations.find((row: LifecycleRow) => row.milestoneId === milestone.id) as LifecycleRow | undefined : undefined;
    const authorizationMatchesCertification = Boolean(allocation && (allocation.netPaise === 0 || milestone.certified && allocation.certificationId === milestone.certificationId && allocation.certificationToken === milestone.token));
    const paidPaise = openingConfirmed ? effectivePaid(rows, milestone.id) : null;
    const net = allocation?.netPaise ?? null;
    const remainingPaise = net !== null && paidPaise !== null ? net - paidPaise : null;
    const rowBlockers: PaymentMilestone["blockers"] = [];
    if (milestone.amountPaise > 0 && !confirmed) rowBlockers.push(paymentBlocker("PAYMENT_DATE_REQUIRED", `${milestone.name}: confirm a due date.`, `${orderId}:${milestone.id}`));
    if (milestone.amountPaise > 0 && !milestone.certified) rowBlockers.push(paymentBlocker("PAYMENT_CERTIFICATION_REQUIRED", milestone.issue ?? `${milestone.name}: required milestone certification is incomplete.`, `${orderId}:${milestone.id}`));
    if (allocation && allocation.netPaise > 0 && !authorizationMatchesCertification) rowBlockers.push(paymentBlocker("PAYMENT_CERTIFICATION_CHANGED", `${milestone.name}: certification changed after authorization.`, `${orderId}:${milestone.id}`));
    if (remainingPaise !== null && remainingPaise < 0) rowBlockers.push(paymentBlocker("PAYMENT_OVERPAID", `${milestone.name}: recorded payments exceed the current authorized payable.`, `${orderId}:${milestone.id}`));
    const approval = rows.retentions.find(row => row.kind === "approved" && row.milestoneId === milestone.id && row.authorizationId === rows.authorization?._id);
    const ack = approval ? rows.retentions.find(row => row.kind === "acknowledged" && row.approvalId === approval._id) : undefined;
    const retention = approval ? { id: String(approval._id), amountPaise: approval.amountPaise, remainingPaise: retentionRemaining(rows, approval), dueDate: approval.dueDate, ownerId: approval.ownerId, approvedAt: new Date(approval.occurredAt).toISOString(), acknowledgedAt: ack ? new Date(ack.occurredAt).toISOString() : null } : null;
    const coveredByRetention = retention?.acknowledgedAt && remainingPaise !== null && remainingPaise >= 0 && remainingPaise <= retention.remainingPaise;
    const dueDate = coveredByRetention ? retention.dueDate : confirmed?.dueDate ?? null;
    if (retention && retention.remainingPaise < 0) rowBlockers.push(paymentBlocker("PAYMENT_RETENTION_OVERDRAWN", `${milestone.name}: recorded payments exceed the retained grant.`, `${orderId}:${milestone.id}`));
    const readiness: PaymentMilestone["readiness"] = milestone.amountPaise === 0 ? "no_payment_required" : !openingConfirmed || !confirmed || !source.available ? "setup_required" : !milestone.certified ? "awaiting_certification" : !allocation || !authorizationMatchesCertification || remainingPaise !== null && remainingPaise < 0 ? "awaiting_finance" : "ready";
    blockers.push(...rowBlockers);
    return { id: milestone.id, name: milestone.name, contractGrossPaise: milestone.amountPaise, originalDueDate: confirmed?.originalDueDate ?? null, dueDate, proposedDueDate: proposed?.dueDate ?? null, authorizedGrossPaise: allocation?.grossPaise ?? null, withholdingPaise: allocation?.withholdingPaise ?? null, authorizedNetPaise: net, paidPaise, remainingPaise, readiness, timing: paymentTiming(dueDate, today, remainingPaise, milestone.amountPaise), certificationId: milestone.certificationId, certificationStatus: milestone.certificationStatus, certificationToken: milestone.token, retention, blockers: rowBlockers };
  });
  const allocated = currentAuth ? rows.authorization!.allocations as LifecycleRow[] : null;
  const paidPaise = openingConfirmed ? lcSum([...new Set([...source.milestones.map(row => row.id), ...(rows.account?.openingBalances ?? []).map((row: LifecycleRow) => row.milestoneId), ...rows.payments.flatMap(row => row.allocations.map((part: LifecycleRow) => part.milestoneId))])].map(id => effectivePaid(rows, id))) : null;
  const net = allocated ? lcSum(allocated.map(row => row.netPaise)) : null;
  const knownMilestones = new Set(source.milestones.map(row => row.id));
  if (rows.payments.some(row => row.allocations.some((part: LifecycleRow) => !knownMilestones.has(part.milestoneId)))) blockers.push(paymentBlocker("PAYMENT_HISTORICAL_ALLOCATION", "A recorded payment refers to a superseded milestone. Finance reconciliation is required.", orderId));
  return { id: orderId, projectId, vendorId: source.order.vendorId, vendorName: source.order.vendorName, orderNumber: source.order.orderNumber, orderRevisionId: source.order.approvedRevisionId ?? null, version: rows.account?.version ?? 0, sourceDigest: source.digest, sourceAvailable: source.available, openingConfirmed, openingReconciliation: rows.account?.openingReconciliationId ? { id: String(rows.account.openingReconciliationId), balances: (rows.account.openingBalances ?? []).map((row: LifecycleRow) => ({ milestoneId: row.milestoneId, amountPaise: row.amountPaise })) } : null, timezone, contractGrossPaise: Number(source.order.approvedTotalPaise ?? 0), authorizedGrossPaise: allocated ? lcSum(allocated.map(row => row.grossPaise)) : null, withholdingPaise: allocated ? lcSum(allocated.map(row => row.withholdingPaise)) : null, authorizedNetPaise: net, paidPaise, remainingPaise: net !== null && paidPaise !== null ? net - paidPaise : null, authorizationId: rows.authorization?._id ?? null, authorizationBasis: rows.authorization?.basis ?? null, assessment: source.assessment ? { revisionId: String(source.assessment._id), invoiceTotalPaise: source.assessment.invoiceTotalPaise, tdsPaise: source.assessment.tdsPaise, netPayablePaise: source.assessment.netPayablePaise } : null, milestones, blockers, corrections: rows.corrections.filter(row => row.kind === "request").map(row => {
    const decision = rows.corrections.find(item => item.requestId === row._id);
    return { id: String(row._id), transactionId: row.transactionId, reason: row.reason, requestedAt: new Date(row.occurredAt).toISOString(), requestedById: row.actorId, status: decision ? decision.kind as "resolved" | "rejected" : "pending" as const, resolution: decision ? { reason: decision.reason, actorId: decision.actorId, at: new Date(decision.occurredAt).toISOString() } : null };
  }), allowedActions: [] };
}
export async function readOrderPayments(projectId: string, orderId: string, session: ClientSession, at = new Date()): Promise<PaymentOrder> {
  return projectPaymentOrder(await readPaymentSource(projectId, orderId, session), await paymentRows(projectId, orderId, session), session, at);
}
export async function paymentOrderIds(projectId: string, session: ClientSession): Promise<string[]> {
  const orders = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $type: "string" } }).select({ _id: 1 }).sort({ _id: 1 }).session(session).lean();
  return orders.map(row => String(row._id));
}
export async function readPaymentReadiness(projectId: string, session: ClientSession, at = new Date()): Promise<LifecycleReadiness> {
  const orders: PaymentOrder[] = [];
  for (const id of await paymentOrderIds(projectId, session)) orders.push(await readOrderPayments(projectId, id, session, at));
  const blockers = orders.flatMap(order => order.blockers);
  for (const order of orders) {
    if (order.authorizationBasis === "advance") blockers.push(paymentBlocker("PAYMENT_INVOICE_RECONCILIATION", "Reconcile the advance against a Finance invoice assessment before signoff.", order.id));
    const today = lcLocalDate(at, order.timezone);
    for (const milestone of order.milestones) {
      if (milestone.remainingPaise === null || milestone.remainingPaise === 0 || milestone.contractGrossPaise === 0) continue;
      const retained = milestone.retention?.acknowledgedAt && milestone.retention.dueDate > today && milestone.remainingPaise > 0 && milestone.remainingPaise <= milestone.retention.remainingPaise;
      if (!retained) blockers.push(paymentBlocker("PAYMENT_BALANCE_OUTSTANDING", `${order.vendorName}: ${milestone.name} has an unsettled vendor balance.`, `${order.id}:${milestone.id}`));
    }
  }
  const accounts = await ProcurementPaymentAccountModel.find({ projectId, openingReconciliationId: { $type: "string" } }).select({ openingReconciliationId: 1 }).session(session).lean();
  return { ready: blockers.length === 0, sourceDigest: lcDigest(orders.map(order => ({ id: order.id, version: order.version, source: order.sourceDigest, remaining: order.remainingPaise }))), blockers, references: { paymentReconciliationIds: accounts.map(row => String(row.openingReconciliationId)), paymentRetentionIds: orders.flatMap(order => order.milestones.flatMap(row => row.retention?.acknowledgedAt ? [row.retention.id] : [])), paymentAuthorizationIds: orders.flatMap(row => row.authorizationId ? [row.authorizationId] : []), paymentOrderVersions: orders.map(row => `${row.id}:${row.version}`) } };
}
export async function listPaymentAlertSources(projectId: string, session: ClientSession, at = new Date()): Promise<PaymentAlertSource[]> {
  const result: PaymentAlertSource[] = [];
  for (const id of await paymentOrderIds(projectId, session)) {
    const order = await readOrderPayments(projectId, id, session, at);
    if (order.blockers.length) result.push({ id: `payment-setup:${id}`, projectId, orderId: id, milestoneId: null, vendorId: order.vendorId, vendorName: order.vendorName, title: `${order.vendorName}: payment setup or review required`, dueDate: null, remainingPaise: order.remainingPaise, timezone: order.timezone, kind: order.blockers.some(row => row.code === "PAYMENT_CORRECTION_PENDING") ? "payment_correction" : "payment_setup", blockers: order.blockers });
    for (const milestone of order.milestones) if (milestone.contractGrossPaise > 0 && milestone.remainingPaise !== 0 && milestone.dueDate) result.push({ id: `payment:${id}:${milestone.id}`, projectId, orderId: id, milestoneId: milestone.id, vendorId: order.vendorId, vendorName: order.vendorName, title: `${order.vendorName}: ${milestone.name}`, dueDate: milestone.dueDate, remainingPaise: milestone.remainingPaise, timezone: order.timezone, kind: "payment", blockers: milestone.blockers });
  }
  return result;
}
