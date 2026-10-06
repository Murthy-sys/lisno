import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProcurementBasketBaseRateEditor } from "./ProcurementBasketBaseRateEditor";
import { ProcurementBasketModeEditor } from "./ProcurementBasketModeEditor";
import { listBasketEnquiries, procurementBasketKeys, type ProcurementBasketDetail } from "./procurementBasketApi";
import "./procurementBasketScope.css";

export function ProcurementBasketScopePanel({ projectId, projectName, basket, frozen }: {
  projectId: string;
  projectName: string;
  basket: ProcurementBasketDetail;
  frozen: boolean;
}) {
  const auth = useAuth();
  const standard = basket.classification === "standard";
  const automaticSubVendor = basket.automaticSubVendor;
  const canManageBaseRate = standard && automaticSubVendor && auth.user?.role === "procurement" &&
    hasFrontendPermission(auth.authorization, "procurement.purchase_orders.manage");
  const enquiries = useQuery({ queryKey: procurementBasketKeys.enquiries(projectId, basket.id),
    queryFn: ({ signal }) => listBasketEnquiries(projectId, basket.id, signal), enabled: canManageBaseRate });
  const rateEditLocked = enquiries.data?.some((enquiry) =>
    enquiry.estimateSource.estimateId === basket.estimateSource.estimateId &&
    enquiry.estimateSource.estimateVersion === basket.estimateSource.estimateVersion &&
    enquiry.estimateSource.estimateReviewRoundId === basket.estimateSource.estimateReviewRoundId &&
    (enquiry.status === "award_pending" || enquiry.status === "issued")) ?? false;
  const showRateEditor = canManageBaseRate && enquiries.isSuccess && !rateEditLocked;
  const rateEditorFrozen = frozen || enquiries.isFetching;
  const includedLines = basket.lines.filter((line) => line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0);
  const complete = standard
    ? Boolean(basket.standardCost?.complete && basket.standardCost.totalPaise !== null)
    : basket.workingTotalComplete;
  const total = complete
    ? formatPaise(standard ? basket.standardCost!.totalPaise! : basket.adjustedCostPaise)
    : "Incomplete";

  return <section className="procurement-basket__scope-panel" aria-labelledby="procurement-basket-scope-title">
    <header className="procurement-basket__scope-header">
      <div className="procurement-basket__scope-heading">
        <p>Approved scope</p>
        <h2 id="procurement-basket-scope-title">{basket.name}</h2>
        <p>{projectName}</p>
      </div>
    </header>

    {includedLines.length ? <div className="procurement-basket__scope-table-wrap">
      <table className="procurement-basket__scope-table">
        <caption>Included approved source lines for {basket.name}</caption>
        <colgroup><col className="procurement-basket__scope-description-column" /><col className="procurement-basket__scope-quantity-column" /><col className="procurement-basket__scope-amount-column" /><col className="procurement-basket__scope-amount-column" /></colgroup>
        <thead><tr><th scope="col">Item / description</th><th scope="col">Qty</th><th scope="col">Base amount</th><th scope="col">Total</th></tr></thead>
        {includedLines.map((line) => {
          const modePreview = line.mode?.state === "ready" ? line.mode.preview : null;
          const lineCost = line.standardCost;
          const baseAmount = line.baseUnitRatePaise;
          const adjustedTotal = standard ? lineCost?.adjustedCostPaise : modePreview?.adjustedCostPaise;
          const calculationQuantity = standard ? lineCost?.calculationQuantity : modePreview?.quantity;
          const issue = automaticSubVendor
            ? lineCost?.state === "observed_unverified"
              ? null
              : lineCost?.issues[0]?.message ?? (lineCost?.state === "unavailable" ? line.mode?.issues[0]?.message : null)
            : lineCost?.state === "observed_unverified"
              ? "Configuration price needs review before BOQ."
              : standard ? lineCost?.issues[0]?.message ?? line.mode?.issues[0]?.message : line.mode?.issues[0]?.message;
          return <tbody key={line.sourceLineItemKey}>
            <tr className="procurement-basket__scope-source-row">
              <th scope="row"><strong>{line.mainLineName}</strong>
                {issue ? <small className="procurement-basket__scope-issue">{issue}</small> : null}
                {!automaticSubVendor && line.mode ? <ProcurementBasketModeEditor projectId={projectId} basketId={basket.id} source={basket.estimateSource} line={line} classification={basket.classification} frozen={frozen} compact /> : null}
              </th>
              <td>{calculationQuantity ?? line.approvedQuantity} <span className="procurement-basket__scope-uom">{line.mode?.uom?.name || line.approvedUnit}</span></td>
              <td className="procurement-basket__scope-line-amount">{showRateEditor && line.source === "configuration" &&
                line.standardCost?.mode === "sub_vendor" && line.standardCost.adjustedCostPaise !== null && baseAmount !== null
                ? <ProcurementBasketBaseRateEditor projectId={projectId} basketId={basket.id}
                  estimateSource={basket.estimateSource} preparationDigest={basket.preparationDigest}
                  line={line} frozen={rateEditorFrozen} />
                : baseAmount !== null && baseAmount !== undefined ? formatPaise(baseAmount) : "Unavailable"}</td>
              <td className="procurement-basket__scope-line-amount">{adjustedTotal !== null && adjustedTotal !== undefined ? formatPaise(adjustedTotal) : "Unavailable"}</td>
            </tr>
          </tbody>;
        })}
      </table>
    </div> : <p className="procurement-basket__scope-empty">No priced approved source lines are available in this basket.</p>}

    <footer className="procurement-basket__scope-total"><span>Total</span><strong>{total}</strong></footer>
  </section>;
}
