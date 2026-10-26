import type { ProcurementInHouseComponentBreakdown } from "./procurementBasketApi";
import { formatPaise } from "../finance/ProjectFinancePanel";
import "./procurementComponentBreakdown.css";

export function ProcurementComponentBreakdown({ breakdown, sources, onOpenSource }: { breakdown?: ProcurementInHouseComponentBreakdown; sources?: ReadonlyMap<string, string>; onOpenSource?: (sourceLineItemKey: string) => void }) {
  if (!breakdown) return null;
  return <section className="procurement-component-breakdown" aria-label="Current In-house component costs by Sub-Basket">
    <h3>In-house component costs by Sub-Basket</h3>
    <p>Current component costs for items selected as In-house in the approved estimate. These costs are already included in the current totals.</p>
    <p><strong>Current component cost: {breakdown.complete && breakdown.adjustedCostPaise !== null ? formatPaise(breakdown.adjustedCostPaise) : "Incomplete"}</strong></p>
    {!breakdown.complete ? <p role="status">{breakdown.unavailableSourceLineItemKeys.length} source {breakdown.unavailableSourceLineItemKeys.length === 1 ? "line needs" : "lines need"} current component pricing. Calculated contributions are shown below.</p> : null}
    {breakdown.subBaskets.map(group => <details key={JSON.stringify([group.basketId, group.subBasketId])}>
      <summary>{group.basketName ?? "Unavailable Main Basket"} / {group.subBasketName ?? (group.subBasketId === null ? "Existing In-house settings" : "Unavailable Sub-Basket")} · {formatPaise(group.adjustedCostPaise)}</summary>
      <dl><div><dt>Adjusted cost</dt><dd>{formatPaise(group.adjustedCostPaise)}</dd></div><div><dt>Selling benchmark</dt><dd>{formatPaise(group.sellingPaise)}</dd></div></dl>
      <ul>{group.contributions.map((contribution, index) => <li key={JSON.stringify([contribution.sourceLineItemKey, contribution.componentId])}>
        {onOpenSource ? <button type="button" className="button button--secondary" onClick={() => onOpenSource(contribution.sourceLineItemKey)}>{sources?.get(contribution.sourceLineItemKey) ?? `View source contribution ${index + 1}`}</button> : sources?.has(contribution.sourceLineItemKey) ? <a href={`#procurement-source-${encodeURIComponent(contribution.sourceLineItemKey)}`}>{sources.get(contribution.sourceLineItemKey)}</a> : <span>Source contribution {index + 1}</span>}<span> · {contribution.quantity} {contribution.unit}</span>
        <dl><div><dt>Labour cost</dt><dd>{formatPaise(contribution.laborAdjustedCostPaise)}</dd></div><div><dt>Material cost</dt><dd>{formatPaise(contribution.materialAdjustedCostPaise)}</dd></div></dl>
      </li>)}</ul>
    </details>)}
  </section>;
}
