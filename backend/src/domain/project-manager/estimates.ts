import { z } from "zod";
import { normalizeProcurementText } from "../project-procurement.js";

const id = z.string().trim().min(1).max(500);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const note = z.string().transform(normalizeProcurementText).pipe(z.string().max(1000));
const commandKey = z.string().trim().min(8).max(120);
export const pmApprovedSourceSchema = z.object({
  estimateId: id, estimateVersion: version, estimateReviewRoundId: id,
  phase: z.enum(["pre", "post", "legacy"]),
  designPlanVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  sourceSnapshotId: id.nullable(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable()
}).strict().refine(source => source.phase !== "legacy" || source.designPlanVersion > 0,
  { message: "Legacy approved estimates require an approved Design version." });
const querySource = z.preprocess(value => {
  if (typeof value !== "string" || value.length > 2500) return value;
  try { return JSON.parse(value); } catch { return undefined; }
}, pmApprovedSourceSchema);
const pagination = {
  q: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
};
export const pmVendorCandidateQuerySchema = z.object({ ...pagination, expectedSource: querySource, mainLineId: id }).strict();
export const pmVendorSuggestionQuerySchema = z.object({ ...pagination,
  mainLineId: id.optional(), source: z.enum(["current", "history", "all"]).default("current") }).strict();
export const pmVendorSuggestionCreateSchema = z.object({ expectedSource: pmApprovedSourceSchema,
  mainLineId: id, vendorId: id, note: note.default(""), idempotencyKey: commandKey }).strict();
export const pmVendorSuggestionUpdateSchema = z.object({ expectedSource: pmApprovedSourceSchema,
  expectedVersion: version, idempotencyKey: commandKey, note, status: z.enum(["suggested", "withdrawn"]) }).strict();
