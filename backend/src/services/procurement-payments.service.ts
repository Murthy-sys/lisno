import { UserModel } from "../models/User.js";
import type { Role } from "../domain/roles.js";
import type { PaymentHistoryPage, PaymentOrdersPage, ProcurementPaymentAction } from "../contracts/procurement-payments.js";
import { paymentCommandSchema, paymentListSchema, paymentHistoryQuerySchema, type ProcurementPaymentCommand } from "../domain/procurement-payments.js";
import { lcParse } from "../domain/procurement-lifecycle.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import type { PublicUser } from "./auth.service.js";
import { requireLifecycleProject } from "./procurement-lifecycle/access.js";
import { lcRunCommand, lcTransaction, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";
import { readOrderPayments, paymentActions } from "./procurement-payments/projection.js";
import { paymentHistory } from "./procurement-payments/history.js";
import { applyPaymentCommand } from "./procurement-payments/transactions.js";
export { readOrderPayments, readPaymentReadiness, listPaymentAlertSources } from "./procurement-payments/projection.js";
export type { ProcurementPaymentCommand } from "../domain/procurement-payments.js";

const roles: Record<ProcurementPaymentAction, readonly Role[]> = {
  propose_dates: ["procurement", "finance_head"], confirm_dates: ["finance_head", "super_admin"], authorize: ["finance_head", "super_admin"],
  record: ["procurement", "finance_head", "super_admin"], reverse: ["finance_head", "super_admin"], request_correction: ["procurement"],
  resolve_correction: ["finance_head", "super_admin"], reconcile: ["finance_head", "super_admin"], approve_retention: ["finance_head"], acknowledge_retention: ["super_admin"]
};
export function createProcurementPaymentsService(deps: LifecycleDependencies) {
  const now = deps.now ?? (() => new Date());
  return {
    async list(actor: PublicUser, projectId: string, query: unknown = {}): Promise<PaymentOrdersPage> {
      const page = lcParse(paymentListSchema, query);
      return lcTransaction(async session => {
        const project = await requireLifecycleProject(actor, projectId, session);
        const filter = { projectId, approvedRevisionId: { $type: "string" }, ...(page.vendorId ? { vendorId: page.vendorId } : {}), ...(page.orderId ? { _id: page.orderId } : {}) };
        const at = now(), items = [];
        let total = 0;
        if (page.status) {
          // Status is derived from current certification, authorization and cash.
          // Walk bounded source batches rather than filtering one visible page.
          let after: string | undefined;
          for (;;) {
            const rows = await ProjectPurchaseOrderModel.find({ ...filter, ...(after ? { _id: { $gt: after, ...(page.orderId ? { $eq: page.orderId } : {}) } } : {}) }).select({ _id: 1 }).sort({ _id: 1 }).limit(50).session(session).lean();
            if (!rows.length) break;
            for (const row of rows) {
              const dto = await readOrderPayments(projectId, String(row._id), session, at);
              const matches = page.status === "setup_required" ? dto.blockers.length > 0 : page.status === "paid" ? dto.remainingPaise === 0 : dto.milestones.some(milestone => milestone.timing === page.status);
              if (!matches) continue;
              if (total >= page.offset && items.length < page.limit) { dto.allowedActions = paymentActions(actor.role, project.status === "completed", dto); items.push(dto); }
              total++;
            }
            after = String(rows.at(-1)!._id);
            if (rows.length < 50) break;
          }
        } else {
          const rows = await ProjectPurchaseOrderModel.find(filter).select({ _id: 1 }).sort({ _id: 1 }).skip(page.offset).limit(page.limit).session(session).lean();
          total = await ProjectPurchaseOrderModel.countDocuments(filter).session(session);
          for (const row of rows) { const dto = await readOrderPayments(projectId, String(row._id), session, at); dto.allowedActions = paymentActions(actor.role, project.status === "completed", dto); items.push(dto); }
        }
        const vendorRows = await ProjectPurchaseOrderModel.aggregate([{ $match: { projectId, approvedRevisionId: { $type: "string" } } }, { $sort: { approvedAt: -1, _id: 1 } }, { $group: { _id: "$vendorId", name: { $first: "$vendorName" } } }, { $sort: { name: 1, _id: 1 } }]).session(session);
        return { projectId, serverNow: at.toISOString(), items, total, limit: page.limit, offset: page.offset, availableVendors: vendorRows.map(row => ({ id: String(row._id), name: String(row.name) })) };
      });
    },
    async history(actor: PublicUser, projectId: string, query: unknown = {}): Promise<PaymentHistoryPage> {
      const page = lcParse(paymentHistoryQuerySchema, query);
      return lcTransaction(async session => {
        await requireLifecycleProject(actor, projectId, session);
        const result = await paymentHistory(projectId, page, session);
        const people = await UserModel.find({ _id: { $in: [...new Set(result.items.map(row => row.actorId))] } }).select({ name: 1 }).session(session).lean();
        const names = new Map(people.map(person => [String(person._id), String(person.name)]));
        return { ...result, items: result.items.map(row => ({ ...row, actorName: names.get(row.actorId) ?? null })) };
      });
    },
    async command(actor: PublicUser, projectId: string, value: unknown) {
      const input: ProcurementPaymentCommand = lcParse(paymentCommandSchema, value);
      return lcRunCommand(deps, actor, projectId, input, `payment.${input.action}`, roles[input.action], async (session, project) => {
        const result = await applyPaymentCommand(actor, projectId, input, session, project, now());
        result.allowedActions = paymentActions(actor.role, project.status === "completed", result); return result;
      }, { entityId: input.orderId, reason: "reason" in input ? input.reason : input.note ?? null, allowCompleted: ["record", "reverse", "resolve_correction"].includes(input.action) || input.action === "reconcile" && Boolean(input.supersedesReconciliationId) });
    }
  };
}
