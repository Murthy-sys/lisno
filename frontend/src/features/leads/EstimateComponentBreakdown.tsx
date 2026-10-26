import type { EstimateComponentPricing } from "../../../../shared/estimation/estimateComponentPricing";
import { configuredComponentPricing, configuredUsesComponentPricing, type ConfiguredLineDraft } from "./configuredEstimate";
import "./estimate-in-house-components.css";

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EstimateComponentBreakdown({ pricing, label }: { pricing: EstimateComponentPricing; label: string }) {
  return <details className="estimate-component-breakdown"><summary>Component selling amounts for {label} · {money(pricing.totalPaise)}</summary>
    <p>{pricing.quantity} {pricing.uom.name} · Calculated from saved component settings</p>
    {pricing.components.map(component => <div className="estimate-component-breakdown__row" key={component.id}>
      <strong>{component.basketName} / {component.subBasketName ?? "Existing In-house settings"}</strong>
      <dl><div><dt>Labour</dt><dd>{money(component.laborSellingPaise)}</dd></div><div><dt>Material</dt><dd>{money(component.materialSellingPaise)}</dd></div><div><dt>Total</dt><dd>{money(component.totalPaise)}</dd></div></dl>
    </div>)}
  </details>;
}

export function EstimateComponentPricingStatus({ line, editable }: { line: ConfiguredLineDraft; editable: boolean }) {
  if (!configuredUsesComponentPricing(line) || !line.included) return null;
  const pricing = configuredComponentPricing(line);
  if (pricing) return <EstimateComponentBreakdown pricing={pricing} label={`${line.mainLineName} in ${line.roomName}`} />;
  return <div className="estimate-component-breakdown" role="status">
    <p>{line.componentPricingIssue ?? "Component amounts are incomplete."}</p>
    {editable && line.componentPricingRetry && line.componentPricingState !== "loading" ? <button type="button" className="button button--secondary" onClick={line.componentPricingRetry}>Retry component calculation for {line.mainLineName}</button> : null}
  </div>;
}

/** Reporting attribution only. Catalogue source rows and their identities stay in place. */
export function EstimateSubBasketAmounts({ lines }: { lines: readonly ConfiguredLineDraft[] }) {
  if (!lines.some(line => line.included && configuredUsesComponentPricing(line))) return null;
  const groups = new Map<string, { label: string; amounts: number[]; sources: Array<{ key: string; label: string; amount: number | null }> }>();
  const add = (basketId: string, subBasketId: string | null, label: string, sourceKey: string, sourceLabel: string, amount: number | null) => {
    const key = JSON.stringify([basketId, subBasketId]);
    const group = groups.get(key) ?? { label, amounts: [], sources: [] };
    if (amount !== null) group.amounts.push(amount);
    group.sources.push({ key: sourceKey, label: sourceLabel, amount }); groups.set(key, group);
  };
  let incomplete = false;
  for (const line of lines.filter(row => row.included)) {
    const pricing = configuredComponentPricing(line);
    if (!configuredUsesComponentPricing(line)) continue;
    if (!pricing) { incomplete = true; continue; }
    for (const component of pricing.components) add(component.basketId, component.subBasketId,
      `${component.basketName} / ${component.subBasketName ?? "Existing In-house settings"}`, `${line.key}:${component.id}`,
      `${line.mainLineName} · ${line.roomName} · ${pricing.quantity} ${pricing.uom.name}`, component.totalPaise);
  }
  return <section className="estimate-component-breakdown" aria-label="In-house amounts by component Sub-Basket">
    <h3>In-house amounts by Sub-Basket</h3><p>Each Main Line contributes its selected components. These amounts are already included in the estimate total. Group amounts follow the component targets; items remain in their catalogue groups.</p>
    {incomplete ? <p role="status">Some component amounts are incomplete. Sub-Basket amounts below show calculated contributions only.</p> : null}
    {[...groups].map(([key, group]) => {
      const total = group.amounts.reduce((sum, value) => sum + BigInt(value), 0n);
      return <details key={key}><summary>{group.label} · {total > BigInt(Number.MAX_SAFE_INTEGER) ? "Amount unavailable" : money(Number(total))}</summary>
        <ul>{group.sources.map(source => <li key={source.key}>{source.label}<strong>{source.amount === null ? "Incomplete" : money(source.amount)}</strong></li>)}</ul>
      </details>;
    })}
  </section>;
}
