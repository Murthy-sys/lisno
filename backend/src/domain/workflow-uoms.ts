import { z } from "zod";
import { normalizeKnowledgeIdentity } from "./ai-estimator-knowledge.js";

export interface FurnitureUomOption { id: string; code: string; name: string; decimalScale: number }
export interface FurnitureUomRecord extends FurnitureUomOption {
  status: "active" | "inactive" | "archived";
  displayOrder: number;
  dependencyEpoch: number;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
}
export interface NewFurnitureUom extends Omit<FurnitureUomOption, "id"> { id: string; actorId: string; at: string }
const normalizedText = (max: number) => z.string().transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(max)).refine((value) => normalizeKnowledgeIdentity(value).length <= max, "The normalized value is too long.");
export const furnitureUomCreateSchema = z.object({ code: normalizedText(64), name: normalizedText(240), decimalScale: z.number().int().min(0).max(3).default(3) }).strict();
export type FurnitureUomCreateInput = z.input<typeof furnitureUomCreateSchema>;
export function furnitureUomOption(row: FurnitureUomOption): FurnitureUomOption {
  return { id: row.id, code: row.code, name: row.name, decimalScale: row.decimalScale };
}
