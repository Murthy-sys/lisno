import { VENDOR_KPI_RUBRICS, type VendorKpiAssessment, type VendorKpiVendorType } from "../../../../shared/knowledge/vendorKpi";

const scoreFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function formatVendorKpiScore(scoreBps: number | null | undefined): string {
  if (scoreBps === null) return "Not rated";
  if (scoreBps === undefined) return "Unavailable";
  if (!Number.isSafeInteger(scoreBps) || scoreBps < 0 || scoreBps > 10000) return "Unavailable";
  return `${scoreFormatter.format(scoreBps / 100)}/100`;
}

export function scoreRows(vendorType: VendorKpiVendorType, assessment: VendorKpiAssessment | null) {
  const scores = new Map(assessment?.scores.map(({ key, score }) => [key, score]));
  return VENDOR_KPI_RUBRICS[vendorType].map(category => ({ ...category, score: scores.get(category.key) ?? null }));
}
