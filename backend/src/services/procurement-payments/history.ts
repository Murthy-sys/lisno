import type { ClientSession, PipelineStage } from "mongoose";
import type { PaymentHistoryPage, PaymentTransactionHistory } from "../../contracts/procurement-payments.js";
import { lcSum } from "../../domain/procurement-lifecycle.js";
import { ProcurementPaymentTransactionModel } from "../../models/ProcurementPaymentTransaction.js";
import { ProcurementPaymentCorrectionModel } from "../../models/ProcurementPaymentCorrection.js";
import { ProcurementPaymentReconciliationModel } from "../../models/ProcurementPaymentReconciliation.js";
import type { LifecycleRow } from "../procurement-lifecycle/access.js";

/** Paginate in Mongo before hydrating history; do not load a project's lifetime payments. */
export async function paymentHistory(projectId: string, page: { orderId?: string; vendorId?: string; transactionId?: string; limit: number; offset: number }, session: ClientSession): Promise<PaymentHistoryPage> {
  const filter = { projectId, ...(page.transactionId ? { _id: page.transactionId } : {}), ...(page.orderId ? { orderId: page.orderId } : {}), ...(page.vendorId ? { vendorId: page.vendorId } : {}) };
  const bound = page.offset + page.limit;
  // Each family contributes only its newest bounded candidates. Mongo forbids
  // unionWith in a transaction; merge these projections within the same snapshot.
  const paymentKeys = await ProcurementPaymentTransactionModel.find(filter).select({ _id: 1, recordedAt: 1 }).sort({ recordedAt: -1, _id: 1 }).limit(bound).session(session).lean();
  const openingKeys = await ProcurementPaymentReconciliationModel.find(filter).select({ _id: 1, occurredAt: 1 }).sort({ occurredAt: -1, _id: 1 }).limit(bound).session(session).lean();
  const reversalMatch: PipelineStage[] = [
    { $match: { projectId, kind: "reversal", ...(page.transactionId ? { _id: page.transactionId } : {}), ...(page.orderId ? { orderId: page.orderId } : {}) } },
    { $lookup: { from: ProcurementPaymentTransactionModel.collection.name, localField: "transactionId", foreignField: "_id", as: "payment" } },
    { $match: { "payment.projectId": projectId, ...(page.vendorId ? { "payment.vendorId": page.vendorId } : {}) } }
  ];
  const reversalKeys = await ProcurementPaymentCorrectionModel.aggregate([...reversalMatch, { $sort: { occurredAt: -1, _id: 1 } }, { $limit: bound }, { $project: { _id: 1, occurredAt: 1 } }]).session(session);
  const [reversalCount] = await ProcurementPaymentCorrectionModel.aggregate([...reversalMatch, { $count: "total" }]).session(session);
  const total = await ProcurementPaymentTransactionModel.countDocuments(filter).session(session) + await ProcurementPaymentReconciliationModel.countDocuments(filter).session(session) + (reversalCount?.total ?? 0);
  const keys = [
    ...paymentKeys.map(row => ({ _id: String(row._id), kind: "payment", at: new Date(row.recordedAt).toISOString() })),
    ...openingKeys.map(row => ({ _id: String(row._id), kind: "opening_reconciliation", at: new Date(row.occurredAt).toISOString() })),
    ...reversalKeys.map(row => ({ _id: String(row._id), kind: "reversal", at: new Date(row.occurredAt).toISOString() }))
  ].sort((a, b) => b.at.localeCompare(a.at) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)).slice(page.offset, bound);
  const rows = new Map<string, PaymentTransactionHistory>();
  const allocations = (row: LifecycleRow) => row.allocations.map((part: LifecycleRow) => ({ milestoneId: part.milestoneId, amountPaise: part.amountPaise }));
  for (const key of keys) {
    if (key.kind === "payment") {
      const row = await ProcurementPaymentTransactionModel.findOne({ _id: key._id, projectId }).session(session).lean() as LifecycleRow;
      const reversed = Boolean(await ProcurementPaymentCorrectionModel.exists({ projectId, transactionId: row._id, kind: "reversal" }).session(session));
      rows.set(key._id, { id: String(row._id), orderId: row.orderId, vendorId: row.vendorId, kind: "payment", amountPaise: row.amountPaise, allocations: allocations(row), paidAt: new Date(row.paidAt).toISOString(), recordedAt: new Date(row.recordedAt).toISOString(), actorId: row.actorId, method: row.method, reference: row.reference, note: row.note, evidenceIds: row.evidenceIds, relatedTransactionId: row.replacesTransactionId ?? null, reversed });
    } else if (key.kind === "reversal") {
      const row = await ProcurementPaymentCorrectionModel.findOne({ _id: key._id, projectId }).session(session).lean() as LifecycleRow;
      const payment = await ProcurementPaymentTransactionModel.findOne({ _id: row.transactionId, projectId }).session(session).lean() as LifecycleRow;
      rows.set(key._id, { id: String(row._id), orderId: row.orderId, vendorId: payment.vendorId, kind: "reversal", amountPaise: payment.amountPaise, allocations: allocations(payment), paidAt: null, recordedAt: new Date(row.occurredAt).toISOString(), actorId: row.actorId, method: null, reference: null, note: row.reason, evidenceIds: [], relatedTransactionId: row.transactionId, reversed: false });
    } else {
      const row = await ProcurementPaymentReconciliationModel.findOne({ _id: key._id, projectId }).session(session).lean() as LifecycleRow;
      rows.set(key._id, { id: String(row._id), orderId: row.orderId, vendorId: row.vendorId, kind: "opening_reconciliation", amountPaise: lcSum(row.balances.map((part: LifecycleRow) => part.amountPaise)), allocations: row.balances, paidAt: null, recordedAt: new Date(row.occurredAt).toISOString(), actorId: row.actorId, method: null, reference: null, note: row.reason, evidenceIds: row.evidenceIds, relatedTransactionId: null, reversed: false, supersedesReconciliationId: row.supersedesReconciliationId ?? null });
    }
  }
  return { projectId, items: keys.map(key => rows.get(key._id)!), total, limit: page.limit, offset: page.offset };
}
