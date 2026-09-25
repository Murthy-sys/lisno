import { z } from "zod";
import { AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT, normalizeKnowledgeIdentity } from "./ai-estimator-knowledge.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";

export function normalizeProcurementText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function procurementItemIdentity(value: string): string {
  return normalizeProcurementText(value).toLowerCase();
}

const label = z.string().transform(normalizeProcurementText).pipe(z.string().min(1).max(200));
const sourceId = z.string().trim().min(1).max(500);
const sourceFields = {
  estimateId: sourceId,
  estimateVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sourceLineItemKey: sourceId
};
const itemFields = z.object({
  itemName: label,
  brand: label,
  uomId: z.string().trim().min(1).max(200),
  vendorId: z.string().trim().min(1).max(200).nullable().default(null),
  pricePaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE),
  allocatedWorkPaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE).nullable().optional()
}).strict();
export const projectProcurementItemSchema = itemFields.extend(sourceFields).superRefine((value, context) => {
  if (value.vendorId && value.allocatedWorkPaise == null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["allocatedWorkPaise"], message: "Enter the allocated work amount for this vendor." });
  allocationMatchesVendor(value, context);
});
export const procurementVendorSchema = z.object({
  name: label.refine((value) => normalizeKnowledgeIdentity(value).length <= AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
    "The normalized vendor name is too long.")
}).strict();
export const projectProcurementUpdateSchema = itemFields.extend({
  estimateId: sourceFields.estimateId.optional(),
  estimateVersion: sourceFields.estimateVersion.optional(),
  sourceLineItemKey: sourceFields.sourceLineItemKey.optional(),
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
}).superRefine((value, context) => {
  completeSourceTriple(value, context);
  allocationMatchesVendor(value, context);
});
function allocationMatchesVendor(value: { vendorId: string | null; allocatedWorkPaise?: number | null }, context: z.RefinementCtx) {
  if ((!value.vendorId && value.allocatedWorkPaise != null) || (value.vendorId && value.allocatedWorkPaise === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allocatedWorkPaise"], message: value.vendorId ? "A recorded vendor allocation cannot be cleared. Enter a positive amount or remove the vendor." : "Select a vendor before entering an allocated work amount." });
  }
}
export const projectProcurementQuerySchema = z.object({
  q: z.string().transform(normalizeProcurementText).pipe(z.string().max(100)).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();
export const projectProcurementItemQuerySchema = projectProcurementQuerySchema.extend({
  estimateId: sourceFields.estimateId.optional(),
  estimateVersion: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  sourceLineItemKey: sourceFields.sourceLineItemKey.optional(),
  unassigned: z.literal("true").transform(() => true as const).or(z.literal(true)).optional()
}).superRefine((value, context) => {
  completeSourceTriple(value, context);
  if (value.unassigned && value.estimateId !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["unassigned"], message: "Choose one estimate item or unassigned items, not both." });
});
function completeSourceTriple(value: { estimateId?: string; estimateVersion?: number; sourceLineItemKey?: string }, context: z.RefinementCtx) {
  const count = [value.estimateId, value.estimateVersion, value.sourceLineItemKey].filter((entry) => entry !== undefined).length;
  if (count !== 0 && count !== 3) context.addIssue({ code: z.ZodIssueCode.custom, path: ["estimateId"], message: "Provide estimateId, estimateVersion and sourceLineItemKey together." });
}

export type ProjectProcurementItemInput = z.infer<typeof projectProcurementItemSchema>;
export type ProcurementVendorInput = z.infer<typeof procurementVendorSchema>;
export type ProjectProcurementUpdateInput = z.infer<typeof projectProcurementUpdateSchema>;
export type ProjectProcurementQuery = z.infer<typeof projectProcurementQuerySchema>;
export type ProjectProcurementItemQuery = z.infer<typeof projectProcurementItemQuerySchema>;
export interface ProcurementEstimateSource {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  sourceSectionId: string;
  sourceLineItemKey: string;
}
export function storedProcurementSource(row: Record<string, unknown>): ProcurementEstimateSource | null {
  const fields = [row.estimateId, row.estimateVersion, row.estimateReviewRoundId, row.sourceSectionId, row.sourceLineItemKey];
  if (fields.every((value) => value === null || value === undefined)) return null;
  const parsed = z.object({ ...sourceFields, estimateReviewRoundId: sourceId.nullable(), sourceSectionId: sourceId }).safeParse(row);
  if (!parsed.success || Object.entries(parsed.data).some(([key, value]) => value !== row[key])) throw new Error("Invalid stored procurement estimate source.");
  return parsed.data;
}
export interface ProjectProcurementUomOption { id: string; code: string; name: string }
export type ProcurementReferenceStatus = "active" | "inactive" | "archived" | "unavailable";
export interface ProcurementReferenceSnapshot extends ProjectProcurementUomOption { status: ProcurementReferenceStatus }
export interface ProcurementVendorOption extends ProjectProcurementUomOption { status: "active" }
export interface ProcurementVendorPage { items: ProcurementVendorOption[]; total: number; limit: number; offset: number }
export interface ProjectProcurementItemDto {
  id: string;
  projectId: string;
  estimateSource: ProcurementEstimateSource | null;
  itemName: string;
  brand: string;
  uom: ProcurementReferenceSnapshot;
  vendor: ProcurementReferenceSnapshot | null;
  pricePaise: number;
  allocatedWorkPaise: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectProcurementPage {
  items: ProjectProcurementItemDto[];
  total: number;
  limit: number;
  offset: number;
}
