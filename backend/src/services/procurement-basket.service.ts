import mongoose, { type ClientSession } from "mongoose";
import { projectProcurementBaskets, type ProcurementBasketDetailDto, type ProcurementBasketSummaryDto } from "../domain/procurement-basket-projection.js";
import { projectProcurementBasketModeGroups, type ProcurementBasketModeGroup } from "../domain/procurement-basket-mode-groups.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess } from "./procurement.service.js";
import { buildProjectPurchaseOrderPreparation } from "./project-purchase-order-preparation.service.js";

export interface ProcurementBasketService {
  list(actor: PublicUser, projectId: string): Promise<{ projectId: string; estimateSource: ProcurementBasketDetailDto["estimateSource"];
    baskets: ProcurementBasketSummaryDto[]; modeGroups: ProcurementBasketModeGroup[] }>;
  get(actor: PublicUser, projectId: string, basketId: string): Promise<ProcurementBasketDetailDto>;
}

/** Basket money is grouped from the approved preparation and approved PO revisions in one snapshot. */
export function createProcurementBasketService(): ProcurementBasketService {
  return {
    list(actor, projectId) {
      return transaction(async session => {
        await assertProcurementProjectAccess(actor, projectId, session);
        const { baskets, preparation, committedBySourceLine } = await preparedBasketRead(projectId, session);
        return { projectId, estimateSource: preparation.estimateSource,
          modeGroups: projectProcurementBasketModeGroups(baskets, committedBySourceLine),
          baskets: baskets.map(({ lines: _lines, projectId: _projectId, estimateSource: _estimateSource,
            preparationDigest: _preparationDigest, ...summary }) => summary) };
      });
    },
    get(actor, projectId, basketId) {
      return transaction(async session => {
        await assertProcurementProjectAccess(actor, projectId, session);
        const basket = (await preparedBaskets(projectId, session)).find(row => row.id === basketId);
        if (!basket) throw new ApiError(404, "PROCUREMENT_BASKET_NOT_FOUND", "This approved main basket is unavailable.");
        return basket;
      });
    }
  };
}

export async function preparedBaskets(projectId: string, session: ClientSession): Promise<ProcurementBasketDetailDto[]> {
  return (await preparedBasketRead(projectId, session)).baskets;
}

async function preparedBasketRead(projectId: string, session: ClientSession) {
  const preparation = await buildProjectPurchaseOrderPreparation(projectId, session);
  const approved = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $ne: null }, cancelledAt: null })
    .select({ approvedRevisionId: 1 }).session(session).lean();
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ projectId,
    _id: { $in: approved.map(order => order.approvedRevisionId) } }).select({ _id: 1, lines: 1 }).session(session).lean();
  if (revisions.length !== approved.length) throw new ApiError(409, "PROCUREMENT_BASKET_COMMITMENT_CONFLICT", "An approved order revision is missing.");
  const committedBySourceLine = new Map<string, number>();
  for (const revision of revisions) for (const line of revision.lines ?? []) {
    const sourceLineItemKey = String(line.sourceLineItemKey);
    const amount = Number(line.netPaise);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new ApiError(409, "PROCUREMENT_BASKET_COMMITMENT_CONFLICT", "An approved order amount is invalid.");
    const sum = BigInt(committedBySourceLine.get(sourceLineItemKey) ?? 0) + BigInt(amount);
    if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(409, "PROCUREMENT_BASKET_COMMITMENT_CONFLICT", "Approved commitments exceed the supported range.");
    committedBySourceLine.set(sourceLineItemKey, Number(sum));
  }
  return { preparation, committedBySourceLine, baskets: projectProcurementBaskets(preparation, committedBySourceLine) };
}

const transaction = <T>(operation: (session: ClientSession) => Promise<T>) =>
  mongoose.connection.transaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });
