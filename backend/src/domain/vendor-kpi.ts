import { ApiError } from "../middleware/errors.js";

export const VENDOR_KPI_RUBRIC_VERSION = 1;
export const VENDOR_KPI_RUBRICS = {
  execution: ["timeline", "quality", "budget", "site_discipline"],
  supplier: ["rates_offered", "service_communication", "delivery_coordination", "defect_liability_addressal", "commitment_to_timelines"]
} as const;
export type VendorKpiVendorType = keyof typeof VENDOR_KPI_RUBRICS;
export type VendorKpiCategoryScore = { key: string; score: number };

/** The API uses hundredths of one score point, so the mean stays integral. */
export function calculateVendorKpi(vendorType: VendorKpiVendorType, scores: readonly VendorKpiCategoryScore[]): number {
  const categories: readonly string[] = VENDOR_KPI_RUBRICS[vendorType];
  if (scores.length !== categories.length || new Set(scores.map(score => score.key)).size !== categories.length ||
    scores.some(score => !categories.includes(score.key) || !Number.isInteger(score.score) || score.score < 0 || score.score > 100)) {
    throw new ApiError(400, "VENDOR_KPI_INVALID_SCORES", "Complete every rating with a whole number from 0 to 100.");
  }
  return scores.reduce((total, score) => total + score.score, 0) * 100 / categories.length;
}

export function orderedVendorKpiScores(vendorType: VendorKpiVendorType, scores: readonly VendorKpiCategoryScore[]): VendorKpiCategoryScore[] {
  calculateVendorKpi(vendorType, scores);
  return VENDOR_KPI_RUBRICS[vendorType].map(key => ({ key, score: scores.find(score => score.key === key)!.score }));
}
