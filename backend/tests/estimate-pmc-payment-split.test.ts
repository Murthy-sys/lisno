import { describe, expect, it } from "vitest";
import { calculateKnowledgePmcPrice } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { allocateEstimatePayables } from "../src/domain/estimate-gst-presentation.js";
import { buildEstimatePmcPayments, estimatePmcPaymentsAreValid, readEstimatePmcPaymentSplit, readEstimatePmcPaymentSummary } from "../src/domain/estimate-pmc-payment-split.js";

function pmc(vendor: number, marginBps = 2000) {
  const calculation = calculateKnowledgePmcPrice({ baseRatePaise: vendor, lowQuantityLimit: "0", impactBps: 0, quantity: "1", quantityScale: 0, pmcMarginBps: marginBps });
  return { included: true, pricingMode: "pmc", pmcVendorPayable: true, amountPaise: calculation.finalVendorChargesPaise,
    pmcMarginSnapshot: { pmcMarginBps: calculation.pmcMarginBps, pmcMarginAmountPaise: calculation.pmcMarginAmountPaise } };
}
function totals(subtotalPaise: number, gstPaise = Math.round(subtotalPaise * .18), roundOffPaise = 0) {
  return { subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise + roundOffPaise, roundOffPaise };
}

describe("saved PMC payment disclosure", () => {
  it("preserves ₹1,000 vendor charges and adds ₹250 Lisno at configured 20%, with tax", () => {
    const basis = totals(100_000);
    const result = buildEstimatePmcPayments([pmc(100_000)], basis);
    expect(result.lineItems[0].pmcPaymentSplit).toEqual({ version: 1, marginBps: 2000, vendorAmountPaise: 100_000, lisnoAmountPaise: 25_000,
      estimatedValuePaise: 125_000, vendorPayablePaise: 118_000, lisnoPayablePaise: 29_500, totalPayablePaise: 147_500,
      taxBasis: { subtotalPaise: 100_000, gstPaise: 18_000 } });
    expect(result.pmcPaymentSummary).toMatchObject({ vendorPayablePaise: 118_000, lisnoPayablePaise: 29_500,
      customerTotalPayablePaise: 147_500, otherWorkPayablePaise: 0, nonPmcMilestoneBasisPaise: 0 });
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result }, { requirePmcSplit: true })).toBe(true);
  });

  it.each([1000, 1500, 1525, 2000])("uses %s bps with fractional quantity and inclusive low-quantity impact", marginBps => {
    const calculation = calculateKnowledgePmcPrice({ baseRatePaise: 997, lowQuantityLimit: "2.75", impactBps: 1250,
      quantity: "2.75", quantityScale: 2, pmcMarginBps: marginBps });
    const source = { ...pmc(0), amountPaise: calculation.finalVendorChargesPaise,
      pmcMarginSnapshot: { pmcMarginBps: marginBps, pmcMarginAmountPaise: calculation.pmcMarginAmountPaise } };
    const basis = totals(calculation.finalVendorChargesPaise);
    const result = buildEstimatePmcPayments([source], basis);
    expect(result.lineItems[0].pmcPaymentSplit).toMatchObject({ marginBps, vendorAmountPaise: 3086,
      lisnoAmountPaise: calculation.pmcMarginAmountPaise, estimatedValuePaise: calculation.totalPaise });
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result })).toBe(true);
  });

  it("reconciles unequal PMC rows, other work, cumulative tax and the existing round-off", () => {
    const lines = [pmc(109, 1500), { included: true, pricingMode: "sub_vendor", amountPaise: 317 }, pmc(203)];
    const basis = totals(629, 113, -42);
    const result = buildEstimatePmcPayments(lines, basis);
    const vendorGross = allocateEstimatePayables([109, 317, 203], basis);
    expect(result.pmcPaymentSummary?.vendorPayablePaise).toBe(vendorGross[0] + vendorGross[2]);
    expect(result.pmcPaymentSummary?.nonPmcMilestoneBasisPaise).toBe(vendorGross[1]);
    expect(result.pmcPaymentSummary?.customerTotalPayablePaise).toBe(basis.totalPaise + result.pmcPaymentSummary!.lisnoPayablePaise);
    expect(result.pmcPaymentSummary?.roundOffPaise).toBe(-42);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result })).toBe(true);
  });

  it("uses the recorded nonstandard tax basis for both recipients", () => {
    const basis = totals(100_000, 5000), result = buildEstimatePmcPayments([pmc(100_000)], basis);
    expect(result.lineItems[0].pmcPaymentSplit).toMatchObject({ vendorPayablePaise: 105_000, lisnoPayablePaise: 26_250 });
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result })).toBe(true);
  });

  it("clears stale splits after exclusions or mode changes without mutating source rows", () => {
    const source = buildEstimatePmcPayments([pmc(100_000)], totals(100_000)).lineItems[0];
    const result = buildEstimatePmcPayments([{ ...source, included: false }, { ...source, pricingMode: "sub_vendor" }], totals(100_000));
    expect(result.lineItems.every(line => line.pmcPaymentSplit === undefined)).toBe(true);
    expect(result.pmcPaymentSummary).toBeUndefined();
    expect(source.pmcPaymentSplit).toBeDefined();
  });

  it("allows a zero PMC scope and incomplete non-PMC draft row without inventing a fee", () => {
    const basis = totals(0), result = buildEstimatePmcPayments([pmc(0), { included: true, amountPaise: null }], basis);
    expect(result.pmcPaymentSummary?.customerTotalPayablePaise).toBe(0);
    expect(result.lineItems[0].pmcPaymentSplit?.marginBps).toBe(2000);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result })).toBe(false);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result, lineItems: [result.lineItems[0]] })).toBe(true);
  });

  it("requires fresh evidence for new PMC drafts, while preserving wholly absent historical fields", () => {
    const source = { ...pmc(100_000), pmcMarginSnapshot: undefined };
    expect(() => buildEstimatePmcPayments([source], totals(100_000))).toThrow(/Refresh and save/);
    expect(estimatePmcPaymentsAreValid({ lineItems: [source] })).toBe(true);
    expect(estimatePmcPaymentsAreValid({ lineItems: [source] }, { requirePmcSplit: true })).toBe(false);
    expect(() => buildEstimatePmcPayments([{ ...source, pmcMarginSnapshot: { pmcMarginBps: 1500, pmcMarginAmountPaise: 25000 } }], totals(100_000))).toThrow();
  });

  it("rejects partial, malformed, tax-mismatched and unreconciled disclosures", () => {
    const basis = totals(100_000), result = buildEstimatePmcPayments([pmc(100_000)], basis);
    const split = result.lineItems[0].pmcPaymentSplit!, summary = result.pmcPaymentSummary!;
    expect(readEstimatePmcPaymentSplit({ ...split, marginBps: 999 })).toBeNull();
    expect(readEstimatePmcPaymentSplit({ ...split, lisnoAmountPaise: 20_000 })).toBeNull();
    expect(readEstimatePmcPaymentSummary({ ...summary, customerTotalPayablePaise: basis.totalPaise })).toBeNull();
    expect(estimatePmcPaymentsAreValid({ ...basis, lineItems: result.lineItems })).toBe(false);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result, lineItems: [{ ...result.lineItems[0], pmcPaymentSplit: { ...split, taxBasis: { subtotalPaise: 1, gstPaise: 0 } } }] })).toBe(false);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result, lineItems: [{ ...result.lineItems[0], pmcPaymentSplit: { ...split, vendorPayablePaise: 118_001, totalPayablePaise: 147_501 } }] })).toBe(false);
  });

  it("retains full authorized totals when every detail row is hidden", () => {
    const basis = totals(100_000), result = buildEstimatePmcPayments([pmc(100_000)], basis);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result, lineItems: [] }, { projected: true })).toBe(true);
    expect(estimatePmcPaymentsAreValid({ ...basis, ...result, lineItems: [] })).toBe(false);
    expect(readEstimatePmcPaymentSplit({ ...result.lineItems[0].pmcPaymentSplit, private: "must-strip" })).not.toHaveProperty("private");
    expect(readEstimatePmcPaymentSummary({ ...result.pmcPaymentSummary, private: "must-strip" })).not.toHaveProperty("private");
  });

  it("rejects unsafe totals and overflows rather than rounding them", () => {
    expect(() => buildEstimatePmcPayments([pmc(100_000)], totals(Number.MAX_SAFE_INTEGER, 1))).toThrow();
    expect(() => buildEstimatePmcPayments([{ ...pmc(0), amountPaise: Number.MAX_SAFE_INTEGER }], totals(Number.MAX_SAFE_INTEGER, 0))).toThrow();
    expect(readEstimatePmcPaymentSummary({ version: 1, vendorPayablePaise: Number.MAX_SAFE_INTEGER, lisnoPayablePaise: 1,
      pmcTotalPayablePaise: Number.MAX_SAFE_INTEGER + 1, otherWorkPayablePaise: 0, roundOffPaise: 0,
      customerTotalPayablePaise: Number.MAX_SAFE_INTEGER + 1, nonPmcMilestoneBasisPaise: 0 })).toBeNull();
  });
});
