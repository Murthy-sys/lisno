import type { PMVendorSuggestionQuery, ProcurementMainLineSuggestionPage } from "../contracts/project-manager-estimates.js";
import { pmVendorSuggestionQuerySchema } from "../domain/project-manager/estimates.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectVendorSuggestionModel } from "../models/ProjectVendorSuggestion.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess } from "./procurement.service.js";
import { preparedBaskets } from "./procurement-basket.service.js";
import { pmTransaction } from "./project-manager/common.js";
import { validatePMEstimateQuery } from "./project-manager/estimates.js";
import { readPMVendorSuggestions } from "./project-manager/vendor-suggestion-reads.js";
import { estimateIdentityEqual, preparationMatchesPMSource } from "./project-manager/vendor-suggestion-activity.js";

export interface ProcurementMainLineSuggestionService {
  list(actor: PublicUser, projectId: string, basketId: string, query: PMVendorSuggestionQuery): Promise<ProcurementMainLineSuggestionPage>;
}
export function createProcurementMainLineSuggestionService(options: { now?: () => Date } = {}): ProcurementMainLineSuggestionService {
  return {
    list: (actor, projectId, basketId, value) => pmTransaction(async session => {
      await assertProcurementProjectAccess(actor, projectId, session);
      const query = validatePMEstimateQuery(pmVendorSuggestionQuerySchema, value);
      const page = await readPMVendorSuggestions(actor, projectId, query, session, (options.now ?? (() => new Date()))(),
        { basketId, procurement: true, activity: false });
      let basket: Awaited<ReturnType<typeof preparedBaskets>>[number] | undefined;
      let preparationReason: string | null = null;
      try { basket = (await preparedBaskets(projectId, session)).find(item => item.id === basketId); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500) throw error;
        preparationReason = "Current Procurement preparation is unavailable. Reconcile the source before inviting vendors.";
      }
      if (!basket && !preparationReason) throw new ApiError(404, "PROCUREMENT_BASKET_NOT_FOUND", "This Main Basket is unavailable.");
      for (const suggestion of page.items) {
        const sourceMatches = suggestion.source && basket && estimateIdentityEqual(basket.estimateSource, suggestion.source) &&
          (suggestion.source.phase === "legacy" ? basket.preparationSource == null : preparationMatchesPMSource(basket.preparationSource, suggestion.source));
        const covered = sourceMatches && suggestion.mainLine && basket!.lines.filter(line => line.included &&
          line.mainLineId === suggestion.mainLine!.mainLineId && suggestion.mainLine!.occurrences.some(item => item.sourceLineItemKey === line.sourceLineItemKey));
        const reason = preparationReason ?? (!sourceMatches ? "This recommendation's approved source differs from current Procurement preparation." :
          !covered || covered.length !== suggestion.mainLine!.occurrences.length ? "The current basket does not contain the full suggested Main Line scope." :
          !basket!.boqReady ? "Complete the current basket BOQ preparation before sending bid requests." : null);
        if (reason) { suggestion.bidEligible = false; suggestion.readinessReasons.push(reason); }
      }
      const mainLines = await ProjectVendorSuggestionModel.aggregate<{ _id: string; name: string }>([
        { $match: { projectId, mainBasketId: basketId, scope: "main_line", mainLineId: { $type: "string" } } },
        { $sort: { createdAt: -1, _id: 1 } },
        { $group: { _id: "$mainLineId", name: { $first: "$mainLineNameSnapshot" } } },
        { $sort: { name: 1, _id: 1 } }, { $limit: 500 }
      ]).session(session);
      return { items: page.items, total: page.total, limit: page.limit, offset: page.offset,
        mainLines: mainLines.map(line => ({ id: line._id, name: line.name || "Main Line" })) };
    })
  };
}
