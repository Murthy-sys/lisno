import { ProcurementComponentBreakdown } from "./ProcurementComponentBreakdown";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProcurementBasketBaseRateEditor } from "./ProcurementBasketBaseRateEditor";
import { ProcurementBasketModeEditor } from "./ProcurementBasketModeEditor";
import { procurementEstimateModeLabels } from "./ProcurementBasketModeGroups";
import { listBasketEnquiries, procurementBasketKeys, type ProcurementBasketDetail } from "./procurementBasketApi";
import "./procurementBasketScope.css";

export function ProcurementBasketScopePanel({ projectId, projectName, basket, frozen }: {
  projectId: string;
  projectName: string;
  basket: ProcurementBasketDetail;
  frozen: boolean;
}) {
  const auth = useAuth();
  const canManage = auth.user?.role === "procurement" &&
    hasFrontendPermission(auth.authorization, "procurement.purchase_orders.manage");
  const enquiries = useQuery({ queryKey: procurementBasketKeys.enquiries(projectId, basket.id),
    queryFn: ({ signal }) => listBasketEnquiries(projectId, basket.id, signal), enabled: canManage });
  const lockedEnquiries = enquiries.data?.filter(enquiry => enquiry.status === "award_pending" || enquiry.status === "issued") ?? [];
  const rateEditLocked = lockedEnquiries.some((enquiry) =>
    enquiry.estimateSource.estimateId === basket.estimateSource.estimateId &&
    enquiry.estimateSource.estimateVersion === basket.estimateSource.estimateVersion &&
    enquiry.estimateSource.estimateReviewRoundId === basket.estimateSource.estimateReviewRoundId);
  const showRateEditor = canManage && enquiries.isSuccess && !rateEditLocked;
  const editorFrozen = frozen || !canManage || !enquiries.isSuccess || enquiries.isFetching || rateEditLocked;
  const includedLines = basket.lines.filter((line) => line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0);
  const mixedEstimateModes = new Set(basket.lines.filter((line) => line.included).map((line) =>
    line.mode?.executionPolicy?.intent === "pmc" ? "pmc" : line.mode?.decision?.mode ?? line.mode?.executionPolicy?.intent ?? "unrecorded")).size > 1;
  const total = basket.workingTotalComplete ? formatPaise(basket.adjustedCostPaise) : "Incomplete";

  return <section className="procurement-basket__scope-panel" aria-labelledby="procurement-basket-scope-title">
    <header className="procurement-basket__scope-header">
      <div className="procurement-basket__scope-heading">
        <p>Approved scope</p>
        <h2 id="procurement-basket-scope-title">{basket.name}</h2>
        <p>{projectName}</p>
      </div>
      <dl className="procurement-basket__scope-summary">
        <div><dt>Items</dt><dd>{includedLines.length}</dd></div>
        <div><dt>Total amount</dt><dd>{total}</dd></div>
      </dl>
    </header>

    {mixedEstimateModes ? <p className="procurement-basket__estimate-scope"><strong>All approved lines.</strong> This basket contains different execution paths. Existing enquiry actions apply to the whole basket.</p> : null}

    {includedLines.length ? <div className="procurement-basket__scope-table-wrap">
      <table className="procurement-basket__scope-table">
        <caption>Included approved source lines for {basket.name}</caption>
        <colgroup><col className="procurement-basket__scope-description-column" /><col className="procurement-basket__scope-unit-column" /><col className="procurement-basket__scope-quantity-column" /><col className="procurement-basket__scope-amount-column" /><col className="procurement-basket__scope-amount-column" /></colgroup>
        <thead><tr><th scope="col">Item / description</th><th scope="col">Unit</th><th scope="col">Qty</th><th scope="col">Base amount</th><th scope="col">Total</th></tr></thead>
        {includedLines.map((line) => {
          const reconciledLineLocked = Boolean(basket.preparationSource && lockedEnquiries.some(enquiry =>
            enquiry.sourceReconciliation?.preparationSource.sourceSnapshotId === basket.preparationSource!.sourceSnapshotId &&
            enquiry.sourceReconciliation.preparationSource.sourceDigest === basket.preparationSource!.sourceDigest &&
            enquiry.sourceReconciliation.unchangedLineKeys.includes(line.sourceLineItemKey)));
          const policy = line.mode?.executionPolicy;
          const savedMode = line.mode?.decision?.mode;
          const validSavedMode = savedMode && policy?.allowedModes.includes(savedMode) ? savedMode : null;
          const modePreview = line.mode?.state === "ready" && policy && line.mode.preview &&
            validSavedMode === line.mode.preview.mode && line.mode.decision?.quantity === line.mode.preview.quantity
            ? line.mode.preview : null;
          const baseAmount = line.baseUnitRatePaise;
          const adjustedTotal = modePreview?.adjustedCostPaise;
          const calculationQuantity = modePreview?.quantity;
          const issue = line.mode?.issues[0]?.message;
          const modeLabel = policy?.intent === "pmc" ? "PMC · Vendor handoff"
            : policy?.intent === "execution" ? validSavedMode ? `Execution source: ${procurementEstimateModeLabels[validSavedMode]}` : "Execution selection pending"
              : policy?.intent === "unrecorded" ? "Mode not recorded" : "Execution details unavailable";
          return <tbody key={line.sourceLineItemKey}>
            <tr className="procurement-basket__scope-source-row" id={`procurement-source-${encodeURIComponent(line.sourceLineItemKey)}`} tabIndex={-1}>
              <th scope="row"><strong>{line.mainLineName}</strong>
                <small className="procurement-basket__estimate-mode">{modeLabel}
                  {line.estimateMode?.provenance === "legacy_basket" ? " · Historical basket default" : ""}
                </small>
                {line.estimateMode?.issues.map((modeIssue) => <small className="procurement-basket__scope-issue" key={modeIssue.code}>{modeIssue.message}</small>)}
                {issue ? <small className="procurement-basket__scope-issue">{issue}</small> : null}
                {line.mode?.inHouseComponentVisibilityIssue ? <small className="procurement-basket__scope-issue" role="status">{line.mode.inHouseComponentVisibilityIssue.message}</small> : null}
                {line.mode ? <ProcurementBasketModeEditor projectId={projectId} basketId={basket.id} source={basket.estimateSource} line={line} classification={basket.classification} frozen={editorFrozen || reconciledLineLocked} compact /> : null}
              </th>
              <td><span className="procurement-basket__scope-uom">{line.mode?.uom?.name || line.approvedUnit}</span></td>
              <td>{calculationQuantity ?? line.approvedQuantity}</td>
              <td className="procurement-basket__scope-line-amount">{showRateEditor && !reconciledLineLocked && line.source === "configuration" &&
                policy?.intent === "execution" && validSavedMode === "sub_vendor" && modePreview?.mode === "sub_vendor" && baseAmount !== null
                ? <ProcurementBasketBaseRateEditor projectId={projectId} basketId={basket.id}
                  estimateSource={basket.estimateSource} preparationDigest={basket.preparationDigest}
                  line={line} frozen={editorFrozen} />
                : baseAmount !== null && baseAmount !== undefined ? formatPaise(baseAmount) : "Unavailable"}</td>
              <td className="procurement-basket__scope-line-amount">{adjustedTotal !== null && adjustedTotal !== undefined ? formatPaise(adjustedTotal) : "Unavailable"}</td>
            </tr>
          </tbody>;
        })}
      </table>
    </div> : <p className="procurement-basket__scope-empty">No priced approved source lines are available in this basket.</p>}

    <ProcurementComponentBreakdown breakdown={basket.inHouseComponentBreakdown} sources={new Map(basket.lines.map(line => [line.sourceLineItemKey, `${line.mainLineName} · ${line.roomName}`]))} />
    <footer className="procurement-basket__scope-total"><span>Total ({includedLines.length} items)</span><strong>{total}</strong></footer>
  </section>;
}
