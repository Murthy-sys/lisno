import { calculateMarginSellingPrice } from "./ai-estimator-knowledge-calculation.js";
import { allocateEstimatePayables } from "./estimate-gst-presentation.js";

export interface EstimatePmcPaymentSplit {
  version: 1;
  marginBps: number;
  vendorAmountPaise: number;
  lisnoAmountPaise: number;
  estimatedValuePaise: number;
  vendorPayablePaise: number;
  lisnoPayablePaise: number;
  totalPayablePaise: number;
  taxBasis: { subtotalPaise: number; gstPaise: number };
}

export interface EstimatePmcPaymentSummary {
  version: 1;
  vendorPayablePaise: number;
  lisnoPayablePaise: number;
  pmcTotalPayablePaise: number;
  otherWorkPayablePaise: number;
  roundOffPaise: number;
  customerTotalPayablePaise: number;
  nonPmcMilestoneBasisPaise: number;
}

const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function sum(values: readonly number[]): number {
  const result = values.reduce((total, value) => total + BigInt(value), 0n);
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("PMC payment amount exceeds the supported range.");
  return Number(result);
}

/** Returns only the public commercial evidence, never internal configuration inputs. */
export function readEstimatePmcPaymentSplit(value: unknown): EstimatePmcPaymentSplit | null {
  const item = record(value), tax = record(item?.taxBasis);
  if (!item || item.version !== 1 || !tax || !money(tax.subtotalPaise) || !money(tax.gstPaise) ||
      !money(item.marginBps) || item.marginBps < 1000 || item.marginBps > 2000) return null;
  const fields = ["vendorAmountPaise", "lisnoAmountPaise", "estimatedValuePaise", "vendorPayablePaise", "lisnoPayablePaise", "totalPayablePaise"] as const;
  if (fields.some(field => !money(item[field]))) return null;
  const split = Object.fromEntries(fields.map(field => [field, item[field]])) as unknown as Pick<EstimatePmcPaymentSplit, typeof fields[number]>;
  try {
    if (sum([split.vendorAmountPaise, split.lisnoAmountPaise]) !== split.estimatedValuePaise ||
        calculateMarginSellingPrice(split.vendorAmountPaise, item.marginBps) !== split.estimatedValuePaise ||
        sum([split.vendorPayablePaise, split.lisnoPayablePaise]) !== split.totalPayablePaise ||
        split.vendorPayablePaise < split.vendorAmountPaise || split.lisnoPayablePaise < split.lisnoAmountPaise ||
        (tax.subtotalPaise === 0 && tax.gstPaise !== 0)) return null;
    return { version: 1, marginBps: item.marginBps, ...split, taxBasis: { subtotalPaise: tax.subtotalPaise, gstPaise: tax.gstPaise } };
  } catch { return null; }
}

export function readEstimatePmcPaymentSummary(value: unknown): EstimatePmcPaymentSummary | null {
  const item = record(value);
  if (!item || item.version !== 1 || !Number.isSafeInteger(item.roundOffPaise) ||
      Number(item.roundOffPaise) < -50 || Number(item.roundOffPaise) > 49) return null;
  const fields = ["vendorPayablePaise", "lisnoPayablePaise", "pmcTotalPayablePaise", "otherWorkPayablePaise", "customerTotalPayablePaise", "nonPmcMilestoneBasisPaise"] as const;
  if (fields.some(field => !money(item[field]))) return null;
  const summary = Object.fromEntries(fields.map(field => [field, item[field]])) as unknown as Pick<EstimatePmcPaymentSummary, typeof fields[number]>;
  try {
    if (sum([summary.vendorPayablePaise, summary.lisnoPayablePaise]) !== summary.pmcTotalPayablePaise ||
        sum([summary.pmcTotalPayablePaise, summary.otherWorkPayablePaise, Number(item.roundOffPaise)]) !== summary.customerTotalPayablePaise ||
        summary.nonPmcMilestoneBasisPaise !== summary.otherWorkPayablePaise) return null;
    return { version: 1, ...summary, roundOffPaise: Number(item.roundOffPaise) };
  } catch { return null; }
}

interface PaymentLine {
  included?: boolean | undefined;
  pricingMode?: string | null | undefined;
  pmcVendorPayable?: boolean | null | undefined;
  amountPaise?: number | null | undefined;
  amount?: number | null | undefined;
  pmcMarginSnapshot?: unknown;
  pmcPaymentSplit?: unknown;
}
interface PaymentTotals {
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  roundOffPaise?: number | undefined;
}
function amount(line: PaymentLine): number | null {
  if (money(line.amountPaise)) return line.amountPaise;
  if (line.amountPaise != null) return null;
  const paise = typeof line.amount === "number" ? Math.round(line.amount * 100) : null;
  return money(paise) ? paise : null;
}
function checkedTotals(totals: PaymentTotals): void {
  if (![totals.subtotalPaise, totals.gstPaise, totals.totalPaise].every(money) ||
      !Number.isSafeInteger(totals.roundOffPaise ?? 0) || (totals.roundOffPaise ?? 0) < -50 || (totals.roundOffPaise ?? 0) > 49 ||
      sum([totals.subtotalPaise, totals.gstPaise, totals.roundOffPaise ?? 0]) !== totals.totalPaise) {
    throw new RangeError("PMC payment tax and estimate totals do not reconcile.");
  }
}

/** Called only by authorized saves after the existing vendor-based totals are known. */
export function buildEstimatePmcPayments<T extends PaymentLine>(lineItems: readonly T[], totals: PaymentTotals): {
  lineItems: Array<Omit<T, "pmcPaymentSplit"> & { pmcPaymentSplit?: EstimatePmcPaymentSplit }>;
  pmcPaymentSummary?: EstimatePmcPaymentSummary;
} {
  checkedTotals(totals);
  const lines = lineItems.map(({ pmcPaymentSplit: _stale, ...line }) => ({ ...line })) as Array<Omit<T, "pmcPaymentSplit"> & { pmcPaymentSplit?: EstimatePmcPaymentSplit }>;
  const included = lines.filter(line => line.included);
  if (!included.some(line => line.pricingMode === "pmc")) return { lineItems: lines };
  const net = included.map(line => amount(line) ?? 0);
  if (sum(net) !== totals.subtotalPaise) throw new RangeError("PMC payment source amounts do not match the saved estimate.");
  const gross = allocateEstimatePayables(net, totals);
  const fees = included.map(line => {
    if (line.pricingMode !== "pmc") return 0;
    const evidence = record(line.pmcMarginSnapshot), vendor = amount(line);
    if (line.pmcVendorPayable !== true || vendor === null || !evidence ||
        !money(evidence.pmcMarginBps) || evidence.pmcMarginBps < 1000 || evidence.pmcMarginBps > 2000 ||
        !money(evidence.pmcMarginAmountPaise) ||
        calculateMarginSellingPrice(vendor, evidence.pmcMarginBps) - vendor !== evidence.pmcMarginAmountPaise) {
      throw new RangeError("PMC payment details are incomplete. Refresh and save the estimate.");
    }
    return evidence.pmcMarginAmountPaise;
  });
  const grossFees = allocateEstimatePayables(fees, totals);
  let vendorPayablePaise = 0, otherWorkPayablePaise = 0;
  included.forEach((line, index) => {
    if (line.pricingMode !== "pmc") { otherWorkPayablePaise = sum([otherWorkPayablePaise, gross[index]!]); return; }
    const evidence = record(line.pmcMarginSnapshot)!;
    line.pmcPaymentSplit = {
      version: 1, marginBps: Number(evidence.pmcMarginBps), vendorAmountPaise: net[index]!, lisnoAmountPaise: fees[index]!,
      estimatedValuePaise: sum([net[index]!, fees[index]!]), vendorPayablePaise: gross[index]!, lisnoPayablePaise: grossFees[index]!,
      totalPayablePaise: sum([gross[index]!, grossFees[index]!]), taxBasis: { subtotalPaise: totals.subtotalPaise, gstPaise: totals.gstPaise }
    };
    vendorPayablePaise = sum([vendorPayablePaise, gross[index]!]);
  });
  const lisnoPayablePaise = sum(grossFees);
  return { lineItems: lines, pmcPaymentSummary: {
    version: 1, vendorPayablePaise, lisnoPayablePaise, pmcTotalPayablePaise: sum([vendorPayablePaise, lisnoPayablePaise]),
    otherWorkPayablePaise, roundOffPaise: totals.roundOffPaise ?? 0,
    customerTotalPayablePaise: sum([totals.totalPaise, lisnoPayablePaise]), nonPmcMilestoneBasisPaise: otherWorkPayablePaise
  } };
}

/** Full source validation precedes visibility filtering; a projection retains full-estimate totals. */
export function estimatePmcPaymentsAreValid(input: {
  lineItems: readonly PaymentLine[];
  subtotalPaise?: number | undefined; gstPaise?: number | undefined; totalPaise?: number | undefined; roundOffPaise?: number | undefined;
  pmcPaymentSummary?: unknown;
}, options: { requirePmcSplit?: boolean; projected?: boolean } = {}): boolean {
  try {
    const included = input.lineItems.filter(line => line.included);
    const hasSplit = input.lineItems.some(line => line.pmcPaymentSplit !== undefined);
    if (input.pmcPaymentSummary === undefined && !hasSplit) {
      return !options.requirePmcSplit || !included.some(line => line.pricingMode === "pmc");
    }
    const summary = readEstimatePmcPaymentSummary(input.pmcPaymentSummary);
    if (!summary || !money(input.subtotalPaise) || !money(input.gstPaise) || !money(input.totalPaise)) return false;
    const totals = { subtotalPaise: input.subtotalPaise, gstPaise: input.gstPaise, totalPaise: input.totalPaise, roundOffPaise: input.roundOffPaise };
    checkedTotals(totals);
    if (summary.customerTotalPayablePaise !== sum([input.totalPaise, summary.lisnoPayablePaise]) ||
        summary.roundOffPaise !== (input.roundOffPaise ?? 0)) return false;
    for (const line of input.lineItems) {
      if (line.pmcPaymentSplit !== undefined && (!line.included || line.pricingMode !== "pmc")) return false;
      if (!line.included || line.pricingMode !== "pmc") continue;
      const split = readEstimatePmcPaymentSplit(line.pmcPaymentSplit);
      if (!split || line.pmcVendorPayable !== true || split.vendorAmountPaise !== amount(line) ||
          split.taxBasis.subtotalPaise !== input.subtotalPaise || split.taxBasis.gstPaise !== input.gstPaise) return false;
    }
    if (options.projected) return true;
    if (!included.some(line => line.pricingMode === "pmc") || included.some(line => amount(line) === null)) return false;
    const reconstructed = buildEstimatePmcPayments(input.lineItems.map(line => {
      const split = readEstimatePmcPaymentSplit(line.pmcPaymentSplit);
      return { ...line, pmcMarginSnapshot: split ? { pmcMarginBps: split.marginBps, pmcMarginAmountPaise: split.lisnoAmountPaise } : undefined };
    }), totals);
    const expected = reconstructed.pmcPaymentSummary!;
    if (Object.keys(expected).some(key => expected[key as keyof EstimatePmcPaymentSummary] !== summary[key as keyof EstimatePmcPaymentSummary])) return false;
    return reconstructed.lineItems.every((line, index) => {
      const actual = readEstimatePmcPaymentSplit(input.lineItems[index]!.pmcPaymentSplit);
      return !line.pmcPaymentSplit || (actual?.vendorPayablePaise === line.pmcPaymentSplit.vendorPayablePaise &&
        actual?.lisnoPayablePaise === line.pmcPaymentSplit.lisnoPayablePaise);
    });
  } catch { return false; }
}
