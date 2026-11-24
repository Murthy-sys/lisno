import { readEstimatePmcPaymentSplit, readEstimatePmcPaymentSummary, estimatePmcPaymentsAreValid } from "../../../../shared/estimation/estimatePmcPaymentSplit";
import type { EstimateClientReviewSnapshot } from "../../api/types";

export const clientEstimateMoney = (value: number | null) => value === null ? "Estimate unavailable" : `₹${value.toLocaleString("en-IN")}`;

/** Read the frozen customer obligation; malformed split data never falls back to vendor-only money. */
export function clientEstimateTotal(snapshot: { total?: number | null; totalPaise?: number | null; pmcPaymentSummary?: unknown; lineItems?: EstimateClientReviewSnapshot["lineItems"]; subtotalPaise?: number; gstPaise?: number; roundOffPaise?: number }): number | null {
  if (snapshot.lineItems && !estimatePmcPaymentsAreValid({ ...snapshot, totalPaise: snapshot.totalPaise ?? undefined, lineItems: snapshot.lineItems }, { projected: true })) return null;
  if (snapshot.pmcPaymentSummary !== undefined) {
    const summary = readEstimatePmcPaymentSummary(snapshot.pmcPaymentSummary);
    return summary ? summary.customerTotalPayablePaise / 100 : null;
  }
  if (snapshot.totalPaise !== undefined) return typeof snapshot.totalPaise === "number" && Number.isSafeInteger(snapshot.totalPaise) && snapshot.totalPaise >= 0 ? snapshot.totalPaise / 100 : null;
  return typeof snapshot.total === "number" && Number.isFinite(snapshot.total) && snapshot.total >= 0 ? snapshot.total : null;
}

export function clientEstimateTotalPaise(snapshot: { totalPaise: number | null; pmcPaymentSummary?: unknown }): number | null {
  return snapshot.pmcPaymentSummary === undefined ? snapshot.totalPaise : readEstimatePmcPaymentSummary(snapshot.pmcPaymentSummary)?.customerTotalPayablePaise ?? null;
}

export function PmcPaymentSummary({ value, formatMoney = clientEstimateMoney, taxInclusiveLabels = false }: {
  value: unknown;
  formatMoney?: (value: number | null) => string;
  taxInclusiveLabels?: boolean;
}) {
  if (value === undefined) return null;
  const summary = readEstimatePmcPaymentSummary(value);
  if (!summary) return <p role="status">Payment breakdown unavailable. Refresh the estimate before approving.</p>;
  return <dl className="client-commercial-totals" aria-label="PMC payment breakdown">
    <div><dt>PMC payable to Lisno{taxInclusiveLabels ? " including GST" : ""}</dt><dd>{formatMoney(summary.lisnoPayablePaise / 100)}</dd></div>
    <div><dt>PMC payable to vendors{taxInclusiveLabels ? " including GST" : ""}</dt><dd>{formatMoney(summary.vendorPayablePaise / 100)}</dd></div>
    <div><dt>Total PMC estimated value including GST</dt><dd>{formatMoney(summary.pmcTotalPayablePaise / 100)}</dd></div>
    {summary.otherWorkPayablePaise > 0 ? <div><dt>Other work including GST</dt><dd>{formatMoney(summary.otherWorkPayablePaise / 100)}</dd></div> : null}
    {summary.roundOffPaise !== 0 ? <div><dt>Round off</dt><dd>{summary.roundOffPaise < 0 ? "−" : "+"}{formatMoney(Math.abs(summary.roundOffPaise) / 100)}</dd></div> : null}
  </dl>;
}

export function PmcPaymentLine({ value }: { value: unknown }) {
  if (value === undefined) return null;
  const split = readEstimatePmcPaymentSplit(value);
  if (!split) return <p role="status">PMC payment breakdown unavailable.</p>;
  return <dl className="submitted-estimate-line__values" aria-label="Item PMC payments including GST">
    <div><dt>PMC estimated value including GST</dt><dd>{clientEstimateMoney(split.totalPayablePaise / 100)}</dd></div>
    <div><dt>Payable to Lisno · {split.marginBps / 100}% of estimated value before tax</dt><dd>{clientEstimateMoney(split.lisnoPayablePaise / 100)}</dd></div>
    <div><dt>Payable to vendor · remaining share</dt><dd>{clientEstimateMoney(split.vendorPayablePaise / 100)}</dd></div>
  </dl>;
}

