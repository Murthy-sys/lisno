import { z } from "zod";
import { normalizeProcurementText, projectProcurementQuerySchema, type ProcurementReferenceStatus } from "./project-procurement.js";

const id = z.string().trim().min(1).max(500);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const note = z.string().transform(normalizeProcurementText).pipe(z.string().max(1000));
export const vendorSuggestionQuerySchema = projectProcurementQuerySchema;
export const vendorSuggestionCreateSchema = z.object({
  estimateId: id, estimateVersion: version, designPlanVersion: version, vendorId: id,
  note: note.default(""), idempotencyKey: z.string().trim().min(8).max(120)
}).strict();
export const vendorSuggestionUpdateSchema = z.object({
  expectedVersion: version, note, status: z.enum(["suggested", "withdrawn"])
}).strict();
export type VendorSuggestionCreate = z.infer<typeof vendorSuggestionCreateSchema>;
export type VendorSuggestionUpdate = z.infer<typeof vendorSuggestionUpdateSchema>;
export type VendorSuggestionQuery = z.infer<typeof vendorSuggestionQuerySchema>;
export interface VendorSuggestionProject {
  projectId: string; projectName: string; estimateId: string; estimateVersion: number; designPlanVersion: number;
}
export interface ProjectVendorSuggestion {
  id: string; projectId: string; estimateId: string; estimateVersion: number;
  estimateReviewRoundId: string | null; designPlanVersion: number;
  vendor: { id: string; code: string; name: string; status: ProcurementReferenceStatus };
  note: string; status: "suggested" | "withdrawn"; version: number;
  suggestedBy: { id: string; name: string }; updatedBy: { id: string; name: string };
  createdAt: string; updatedAt: string; kpi: { status: "not_rated"; score: null };
}
export interface VendorSuggestionProjectPage { items: VendorSuggestionProject[]; total: number; limit: number; offset: number }
export interface VendorSuggestionPage {
  project: VendorSuggestionProject; items: ProjectVendorSuggestion[]; total: number; limit: number; offset: number;
  performance: { status: "not_available"; recommendations: [] };
}
