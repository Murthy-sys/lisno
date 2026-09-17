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
export const projectProcurementItemSchema = z.object({
  itemName: label,
  brand: label,
  uomId: z.string().trim().min(1).max(200),
  vendorId: z.string().trim().min(1).max(200).nullable().default(null),
  pricePaise: z.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE)
}).strict();
export const procurementVendorSchema = z.object({
  name: label.refine((value) => normalizeKnowledgeIdentity(value).length <= AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
    "The normalized vendor name is too long.")
}).strict();
export const projectProcurementUpdateSchema = projectProcurementItemSchema.extend({
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
});
export const projectProcurementQuerySchema = z.object({
  q: z.string().transform(normalizeProcurementText).pipe(z.string().max(100)).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict();

export type ProjectProcurementItemInput = z.infer<typeof projectProcurementItemSchema>;
export type ProcurementVendorInput = z.infer<typeof procurementVendorSchema>;
export type ProjectProcurementUpdateInput = z.infer<typeof projectProcurementUpdateSchema>;
export type ProjectProcurementQuery = z.infer<typeof projectProcurementQuerySchema>;
export interface ProjectProcurementUomOption { id: string; code: string; name: string }
export type ProcurementReferenceStatus = "active" | "inactive" | "archived" | "unavailable";
export interface ProcurementReferenceSnapshot extends ProjectProcurementUomOption { status: ProcurementReferenceStatus }
export interface ProcurementVendorOption extends ProjectProcurementUomOption { status: "active" }
export interface ProcurementVendorPage { items: ProcurementVendorOption[]; total: number; limit: number; offset: number }
export interface ProjectProcurementItemDto {
  id: string;
  projectId: string;
  itemName: string;
  brand: string;
  uom: ProcurementReferenceSnapshot;
  vendor: ProcurementReferenceSnapshot | null;
  pricePaise: number;
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
