import type { ClientSession, Model } from "mongoose";
import type { ProposalMasterInput, ProposalMasterKind, ProposalMasterResource, ProposalMasterValue, ProposalResource, ProposalSectionValue } from "../contracts/vendor-basket-proposal.js";
import { normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../models/AiEstimatorKnowledgeSurface.js";
import { generatedKnowledgeMasterCode, validateKnowledgeMasterDescription, validateKnowledgeMasterName, validateKnowledgeMasterScale } from "./ai-estimator-knowledge-master-values.js";
import type { KnowledgeProposalMasterResolver } from "./ai-estimator-knowledge-item.service.js";

type Row = Record<string, unknown>;
export function proposalMasterResourceKind(kind: ProposalMasterKind): "uom" | "surface" {
  if (kind !== "uoms" && kind !== "surfaces") throw new ApiError(400, "VALIDATION_ERROR", "Select UOMs or surfaces.");
  return kind === "uoms" ? "uom" : "surface";
}
export function proposalMasterModel(kind: ProposalMasterKind): Model<any> {
  return proposalMasterResourceKind(kind) === "uom" ? AiEstimatorKnowledgeUomModel : AiEstimatorKnowledgeSurfaceModel;
}
export function proposalMasters(resources: readonly ProposalResource[]): ProposalMasterResource[] {
  return resources.filter((resource): resource is ProposalMasterResource => resource.kind === "uom" || resource.kind === "surface");
}
export function normalizeProposalMaster(kind: ProposalMasterKind, id: string, input: ProposalMasterInput, previous?: ProposalMasterValue): ProposalMasterValue {
  proposalMasterResourceKind(kind);
  validateKnowledgeMasterName(input.name, "name");
  if (input.description != null && typeof input.description !== "string") throw new ApiError(400, "VALIDATION_ERROR", "Description must be text.");
  validateKnowledgeMasterDescription(input.description);
  validateKnowledgeMasterScale(kind, input.decimalScale, true);
  const name = input.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  validateKnowledgeMasterName(name, "name");
  return { name, code: previous?.code ?? generatedKnowledgeMasterCode(kind, id),
    description: input.description === undefined ? previous?.description ?? null : input.description,
    ...(kind === "uoms" ? { decimalScale: input.decimalScale! } : {}) };
}
export async function assertProposalMasterAvailable(kind: ProposalMasterKind, id: string, value: ProposalMasterValue,
  resources: readonly ProposalMasterResource[], session: ClientSession): Promise<void> {
  const resourceKind = proposalMasterResourceKind(kind);
  const nameNormalized = normalizeKnowledgeIdentity(value.name); const codeNormalized = normalizeKnowledgeIdentity(value.code);
  const localConflict = resources.some((resource) => resource.kind === resourceKind && resource.resourceId !== id &&
    (normalizeKnowledgeIdentity(resource.payload.name) === nameNormalized || normalizeKnowledgeIdentity(resource.payload.code) === codeNormalized));
  const sharedConflict = await proposalMasterModel(kind).exists({ status: { $ne: "archived" }, $or: [{ nameNormalized }, { codeNormalized }] }).session(session);
  if (localConflict || sharedConflict) throw new ApiError(409, "DUPLICATE_IDENTITY", `A ${kind === "uoms" ? "UOM" : "Surface"} already uses this name or code. Rename the proposed value or select the existing shared value.`, { name: "This name or code is already in use." });
}
export function proposalMasterResolver(resources: readonly ProposalMasterResource[]): KnowledgeProposalMasterResolver {
  const uoms = new Map(resources.filter((resource) => resource.kind === "uom").map((resource) => [resource.resourceId, Object.freeze({ decimalScale: resource.payload.decimalScale! })]));
  const surfaces = new Set(resources.filter((resource) => resource.kind === "surface").map((resource) => resource.resourceId));
  return Object.freeze({ uom: (id: string) => uoms.get(id), hasSurface: (id: string) => surfaces.has(id) });
}

/** All retained references participate, including inactive history rows. */
export function proposalMasterReferenceFields(resource: ProposalResource): Array<{ row: Row; key: string }> {
  if (resource.kind !== "section") return [];
  const { sectionKey, payload } = resource.payload as ProposalSectionValue;
  const references: Array<{ row: Row; key: string }> = [];
  const add = (row: Row, key: string) => { if (typeof row[key] === "string") references.push({ row, key }); };
  if (sectionKey === "overview") add(payload, "uomId");
  if (sectionKey === "overview" || sectionKey === "scope") {
    const ids = payload.surfaceIds;
    if (Array.isArray(ids)) ids.forEach((_, index) => add(ids as unknown as Row, String(index)));
  }
  const field = sectionKey === "execution" ? "productivity" : sectionKey === "pricing" ? "priceEntries" : sectionKey === "quantity-margin" ? "slabRates" : null;
  const rows = field ? payload[field] : null;
  if (Array.isArray(rows)) for (const row of rows) if (row && typeof row === "object") add(row as Row, "uomId");
  return references;
}
