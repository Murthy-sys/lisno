import { createHash } from "node:crypto";
import { AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT } from "../domain/ai-estimator-knowledge.js";
import { ApiError } from "../middleware/errors.js";

export function generatedKnowledgeMasterCode(kind: "uoms" | "surfaces", id: string): string {
  const digest = createHash("sha256").update(id).digest("hex").slice(0, 48);
  return kind === "uoms" ? `UOM-${digest.toUpperCase()}` : `surface-${digest}`;
}

export function validateKnowledgeMasterName(value: string, field: string, max = AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT): void {
  if (typeof value !== "string" || value.normalize("NFKC").trim().length === 0 || value.length > max) throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid.`, { [field]: "Required bounded text." });
}

export function validateKnowledgeMasterDescription(value: string | null | undefined): void {
  if (value !== undefined && value !== null && value.length > AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT) throw new ApiError(400, "VALIDATION_ERROR", "Description is too long.");
}

export function validateKnowledgeMasterScale(kind: string, value: number | undefined, required: boolean): void {
  if (kind === "uoms") {
    if ((required || value !== undefined) && (!Number.isSafeInteger(value) || value! < 0 || value! > 3)) {
      throw new ApiError(400, "VALIDATION_ERROR", "UOM decimalScale must be an integer from 0 to 3.", { decimalScale: "Invalid UOM scale." });
    }
  } else if (value !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "decimalScale is valid only for UOM.", { decimalScale: "Field is not applicable." });
  }
}
