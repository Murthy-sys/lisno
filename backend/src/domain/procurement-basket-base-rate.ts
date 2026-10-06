import { z } from "zod";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";

const id = z.string().trim().min(1).max(500);
export const procurementBasketBaseRateSaveSchema = z.object({
  sourceLineItemKey: id,
  baseRatePaise: z.number().int().min(0).max(MAX_FINANCE_AMOUNT_PAISE).nullable(),
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  expectedEstimateSource: z.object({
    estimateId: id,
    estimateVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    estimateReviewRoundId: id.nullable()
  }).strict(),
  expectedPreparationDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u)
}).strict();

export type ProcurementBasketBaseRateSaveInput = z.infer<typeof procurementBasketBaseRateSaveSchema>;
export type ProcurementBasketProjectRate = { version: number; overridePaise: number | null };
export const DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE: ProcurementBasketProjectRate =
  { version: 0, overridePaise: null };
