import type { ClientSession } from "mongoose";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";

export type MainLineVendorLinks = {
  available: true;
  mainLineId: string;
  revisionId: string;
  revisionVersion: number;
  vendorIds: string[];
} | { available: false; mainLineId: string; reason: string };

type Row = Record<string, unknown>;
type PriceReference = { priceEntryId: string; priceVersionId: string };
const unavailableReason = "Vendors linked to this Main Line cannot be verified. Review its current saved Configuration and retry.";
const unavailable = (mainLineId: string): MainLineVendorLinks => ({ available: false, mainLineId, reason: unavailableReason });
const positiveVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const stableId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function references(section: Row): PriceReference[] | null {
  if (!["configured", "not_configured", "not_applicable"].includes(String(section.applicability)) || !positiveVersion(section.version)) return null;
  const payload = section.payload === undefined && section.applicability !== "configured" ? {} : section.payload;
  if (validateKnowledgeSectionPayload("pricing", payload).length) return null;
  const entries = (payload as Row).priceEntries;
  if (entries === undefined) return [];
  if (!Array.isArray(entries) || (section.applicability !== "configured" && entries.length > 0)) return null;
  // Configuration writes materialize commands into references. Unmaterialized commands
  // must never become a second, inferred source of vendor membership.
  const result: PriceReference[] = [];
  for (const value of entries) {
    const entry = value as Row;
    if (entry.operation !== "reference" || !stableId(entry.priceEntryId) || !stableId(entry.priceVersionId)) return null;
    result.push({ priceEntryId: entry.priceEntryId, priceVersionId: entry.priceVersionId });
  }
  return result;
}

/** Current saved Configuration membership only. Callers authorize their own project/scope. */
export async function readMainLineVendorLinks(mainLineIds: readonly string[], session: ClientSession): Promise<Map<string, MainLineVendorLinks>> {
  const ids = [...new Set(mainLineIds)];
  const result = new Map(ids.map(id => [id, unavailable(id)]));
  if (!ids.length) return result;
  const lines = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: ids } })
    .select({ status: 1, version: 1, draftRevisionId: 1, activeRevisionId: 1 }).session(session).lean();
  const selected = lines.flatMap(line => {
    const revision = selectCurrentMainLineRevision(line);
    return revision && positiveVersion(line.version) ? [{ mainLineId: String(line._id), ...revision }] : [];
  });
  const revisionIds = [...new Set(selected.map(row => row.id))];
  if (!revisionIds.length) return result;
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .select({ mainLineId: 1, status: 1, version: 1 }).session(session).lean();
  // Fetch by revision first: filtering by owner would hide a foreign section as absent.
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: "pricing" })
    .select({ mainLineId: 1, revisionId: 1, applicability: 1, payload: 1, version: 1 }).session(session).lean();
  const revisionById = new Map(revisions.map(row => [String(row._id), row]));
  const sectionsByRevision = new Map<string, Row[]>();
  for (const section of sections) {
    const rows = sectionsByRevision.get(String(section.revisionId)) ?? [];
    rows.push(section); sectionsByRevision.set(String(section.revisionId), rows);
  }
  const candidates: Array<{ mainLineId: string; revisionId: string; revisionVersion: number; refs: PriceReference[] }> = [];
  for (const line of selected) {
    const revision = revisionById.get(line.id);
    if (!revision || revision.mainLineId !== line.mainLineId || revision.status !== line.status || !positiveVersion(revision.version)) continue;
    const pricing = sectionsByRevision.get(line.id) ?? [];
    if (pricing.length > 1 || (pricing[0] && pricing[0].mainLineId !== line.mainLineId)) continue;
    const refs = pricing[0] ? references(pricing[0]) : [];
    if (refs === null) continue;
    candidates.push({ mainLineId: line.mainLineId, revisionId: line.id, revisionVersion: revision.version, refs });
  }
  const priceIds = [...new Set(candidates.flatMap(row => row.refs.map(ref => ref.priceVersionId)))];
  const prices = priceIds.length ? await AiEstimatorKnowledgePriceVersionModel.find({ _id: { $in: priceIds } })
    .select({ mainLineId: 1, revisionId: 1, priceEntryId: 1, vendorId: 1 }).session(session).lean() : [];
  const priceById = new Map(prices.map(row => [String(row._id), row]));
  const vendorIds = [...new Set(prices.flatMap(row => stableId(row.vendorId) ? [row.vendorId] : []))];
  const vendors = vendorIds.length ? await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: vendorIds } })
    .select({ _id: 1 }).session(session).lean() : [];
  const existingVendors = new Set(vendors.map(row => String(row._id)));
  for (const line of candidates) {
    const linked = new Set<string>();
    let valid = true;
    for (const ref of line.refs) {
      const price = priceById.get(ref.priceVersionId);
      if (!price || price.mainLineId !== line.mainLineId || price.revisionId !== line.revisionId ||
        price.priceEntryId !== ref.priceEntryId || !stableId(price.vendorId) || !existingVendors.has(price.vendorId)) {
        valid = false; break;
      }
      linked.add(price.vendorId);
    }
    if (valid) result.set(line.mainLineId, { available: true, mainLineId: line.mainLineId,
      revisionId: line.revisionId, revisionVersion: line.revisionVersion, vendorIds: [...linked] });
  }
  return result;
}

export async function requireMainLineVendorLinks(mainLineId: string, session: ClientSession) {
  const links = (await readMainLineVendorLinks([mainLineId], session)).get(mainLineId);
  if (!links?.available) throw new ApiError(409, "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE", links && !links.available ? links.reason : unavailableReason);
  return links;
}

/** Use after the existing Main Line write fence, in the same transaction. */
export async function requireLinkedMainLineVendor(mainLineId: string, vendorId: string, session: ClientSession): Promise<void> {
  const links = await requireMainLineVendorLinks(mainLineId, session);
  if (!links.vendorIds.includes(vendorId)) throw new ApiError(409, "VENDOR_SUGGESTION_VENDOR_NOT_LINKED",
    "This vendor is no longer linked to this Main Line in Configuration. Refresh the linked vendors before suggesting.");
}
