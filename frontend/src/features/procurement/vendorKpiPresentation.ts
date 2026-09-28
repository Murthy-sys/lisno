import {
  VENDOR_KPI_RUBRICS,
  type VendorKpiCategoryKey,
  type VendorKpiCategoryScore,
  type VendorKpiVendorType
} from "../../../../shared/knowledge/vendorKpi";

export const formatVendorKpiScore = (scoreBps: number | null): string => {
  if (scoreBps === null || !Number.isSafeInteger(scoreBps) || scoreBps < 0 || scoreBps > 10000) return "Not rated";
  return `${(scoreBps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}/100`;
};

export const vendorKpiCategories = (type: VendorKpiVendorType) => VENDOR_KPI_RUBRICS[type];

export function validateVendorKpiScores(type: VendorKpiVendorType, values: Partial<Record<VendorKpiCategoryKey, string>>) {
  const errors: Partial<Record<VendorKpiCategoryKey, string>> = {};
  const scores: VendorKpiCategoryScore[] = [];
  for (const category of vendorKpiCategories(type)) {
    const raw = values[category.key]?.trim() ?? "";
    if (!/^(?:100|[1-9]?\d)$/.test(raw)) {
      errors[category.key] = raw === "" ? "Enter a rating from 0 to 100." : "Use a whole number from 0 to 100.";
    } else {
      scores.push({ key: category.key, score: Number(raw) });
    }
  }
  return { errors, scores, valid: Object.keys(errors).length === 0 };
}
