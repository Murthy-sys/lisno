import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ClientSession } from "mongoose";
import { z } from "zod";
import { ESTIMATE_PROPERTY_TYPES, getEstimateRoomDefinitions, isValidBedroomCount, requiresBedroomCount } from "../domain/estimate-room-options.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { DesignRequirementsStateModel } from "../models/DesignRequirementsState.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateRequirementModel } from "../models/EstimateRequirement.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { estimateTierChoices, fenceEstimateTierSource } from "./estimate-tiers.service.js";
import { resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";

type Row = Record<string, any>;
type Source = NonNullable<ReturnType<Awaited<ReturnType<typeof resolveEstimatorCatalogueLines>>["get"]>>;
const id = z.string().trim().min(1).max(500);
const measurement = z.number().finite().positive().max(1_000_000).nullable();
const savedLabel = z.string().min(1).max(200).refine(value => value.trim().length > 0);
export const quotationConfigureSchema = z.object({
  kind: z.literal("configure"), sourceToken: z.string().regex(/^[a-f0-9]{64}$/u),
  propertyType: savedLabel, bedroomCount: z.number().int().min(1).max(50).nullable(),
  rooms: z.array(z.object({ id, typeId: id.nullable(), label: savedLabel,
    length: measurement, width: measurement }).strict()).max(200),
  selectedMainBasketIds: z.array(id).max(200)
}).strict();
type Configure = z.infer<typeof quotationConfigureSchema>;
const changed = (): never => { throw new ApiError(409, "QUOTATION_CONFIGURATION_CHANGED", "The estimate setup changed. Refresh before saving."); };
const invalid = (): never => { throw new ApiError(400, "VALIDATION_ERROR", "Choose valid property, rooms and Main Baskets."); };
const removalMessage = "Ask your team to review this selection before removing it.";
const blocked = (): never => { throw new ApiError(409, "QUOTATION_SETUP_REMOVAL_BLOCKED", removalMessage); };
const nullableNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function quotationVisibleOverview(payload: unknown): boolean {
  return !!payload && typeof payload === "object" && !Array.isArray(payload) &&
    ((payload as Row).clientVisible === undefined || (payload as Row).clientVisible === true);
}

/** Read current Configuration only; callers establish project authority before using this helper. */
export async function visibleQuotationSources(estimate: Row, session?: ClientSession, allBaskets = false) {
  const query = AiEstimatorKnowledgeMainLineModel.find({ ...(!allBaskets ? { basketId: { $in: estimate.selectedMainBasketIds ?? [] } } : {}),
    status: { $in: ["active", "draft", "inactive"] } }).select({ _id: 1 });
  if (session) query.session(session);
  const sources = await resolveEstimatorCatalogueLines((await query.lean()).map(row => String(row._id)), session);
  const revisions = [...new Set([...sources.values()].map(source => source.line.revisionId))];
  const overviewQuery = AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisions }, sectionKey: "overview" })
    .select({ mainLineId: 1, revisionId: 1, payload: 1 });
  if (session) overviewQuery.session(session);
  const overviews = new Map<string, Row[]>();
  for (const overview of await overviewQuery.lean()) {
    const key = `${overview.mainLineId}\u0000${overview.revisionId}`;
    overviews.set(key, [...(overviews.get(key) ?? []), overview]);
  }
  const visible = new Map<string, Source>();
  for (const [mainLineId, source] of sources) {
    const matching = overviews.get(`${mainLineId}\u0000${source.line.revisionId}`) ?? [];
    if (source.line.clientVisible && matching.length === 1 && quotationVisibleOverview(matching[0]?.payload)) visible.set(mainLineId, source);
  }
  return visible;
}

function editableLine(line: Row, sources: ReadonlyMap<string, Source>, estimate: Row) {
  const source = sources.get(line.mainLineId);
  return line.source === "configuration" && (line.clientVisible === undefined || line.clientVisible === true) && source &&
    line.mainBasketId === source.line.basketId && line.subBasketId === source.line.subBasketId && line.uomId === source.line.uom.id &&
    (estimate.rooms ?? []).some((room: Row) => room.id === line.roomId);
}

type Dependencies = { roomIds: Set<string>; basketIds: Set<string>; tokenRows: unknown[]; all: boolean };
async function setupDependencies(estimate: Row, session?: ClientSession): Promise<Dependencies> {
  const result: Dependencies = { roomIds: new Set(), basketIds: new Set(), tokenRows: [], all: false };
  const lines: Row[] = estimate.lineItems ?? [];
  // A legacy row without stable membership cannot be safely assigned to a removal scope.
  result.all = lines.some(line => !line.roomId || !line.mainBasketId || !(estimate.rooms ?? []).some((room: Row) => room.id === line.roomId));
  const read = async (query: any): Promise<Row[]> => { if (session) query.session(session); return query.lean(); };
  const protectLine = (line: Row) => {
    if (line.roomId) result.roomIds.add(line.roomId);
    if (line.mainBasketId) result.basketIds.add(line.mainBasketId);
  };
  const protectMapping = (mapping: Row) => {
    if (mapping.roomId) result.roomIds.add(mapping.roomId);
    if (mapping.scopeSectionId && (estimate.selectedMainBasketIds ?? []).includes(mapping.scopeSectionId)) result.basketIds.add(mapping.scopeSectionId);
    for (const line of lines) if ((!mapping.roomId || mapping.roomId === line.roomId) &&
      (mapping.catalogueId && [line.catalogueId, line.mainLineId].includes(mapping.catalogueId) ||
        mapping.scopeSectionId && [line.mainBasketId, line.subBasketId].includes(mapping.scopeSectionId))) protectLine(line);
  };
  const requirements = await read(EstimateRequirementModel.find({ projectId: estimate.projectId, status: { $in: ["open", "included"] } })
    .select({ _id: 1, estimateId: 1, version: 1, roomId: 1, mainBasketId: 1, mainLineId: 1, lineItemIds: 1, status: 1 }).sort({ _id: 1 }));
  for (const requirement of requirements) {
    if (requirement.roomId) result.roomIds.add(requirement.roomId);
    if (requirement.mainBasketId) result.basketIds.add(requirement.mainBasketId);
    for (const line of lines) if ((requirement.lineItemIds ?? []).includes(line.id) ||
      !requirement.roomId && requirement.mainBasketId === line.mainBasketId && (!requirement.mainLineId || requirement.mainLineId === line.mainLineId)) protectLine(line);
  }
  const states = await read(DesignRequirementsStateModel.find({ _id: estimate.projectId }).select("version +history"));
  const histories = states.flatMap(state => (state.history ?? []).map((event: Row) => ({ id: event.id, lineItemId: event.lineItemId })));
  for (const line of lines) if (histories.some(event => event.lineItemId === line.id)) protectLine(line);
  const drawings = await read(EstimateDesignDrawingModel.find({ estimateId: String(estimate._id), active: true, deletedAt: null })
    .select({ _id: 1, uploadId: 1, roomId: 1, scopeSectionId: 1, catalogueId: 1 }).sort({ _id: 1 }));
  for (const drawing of drawings) protectMapping(drawing);
  // Match the round currently exposed by estimate-design.listClient, not every historical submission.
  const rounds = estimate.status === "client_approved" ? await read(DesignPlanReviewRoundModel.find({ estimateId: String(estimate._id),
    status: { $in: ["pending", "approved", "changes_requested"] } }).sort({ designPlanVersion: -1, _id: 1 }).limit(1)
    .select({ _id: 1, version: 1, submittedRevisionIds: 1, status: 1 })) : [];
  const pinnedIds = rounds.flatMap(round => round.submittedRevisionIds ?? []);
  const uploads = await read(EstimateDesignUploadModel.find({ estimateId: String(estimate._id), deletedAt: null,
    extractionStatus: { $in: ["queued", "processing", "processing_failed"] } })
    .select({ _id: 1, extractionStatus: 1, replacementDrawingId: 1, replacesRevisionId: 1, planRequestReplacement: 1 }).sort({ _id: 1 }));
  const targetRevisionIds = uploads.flatMap(upload => [upload.replacesRevisionId,
    ...(upload.planRequestReplacement?.targets ?? []).map((target: Row) => target.requestedRevisionId)].filter(Boolean));
  const targetDrawingIds = uploads.flatMap(upload => [upload.replacementDrawingId,
    ...(upload.planRequestReplacement?.targets ?? []).map((target: Row) => target.drawingId)].filter(Boolean));
  const targetDrawings = await read(EstimateDesignDrawingModel.find({ estimateId: String(estimate._id), _id: { $in: targetDrawingIds } })
    .select({ _id: 1, roomId: 1, scopeSectionId: 1, catalogueId: 1 }).sort({ _id: 1 }));
  const revisions = await read(EstimateDesignRevisionModel.find({ $or: [{ drawingId: { $in: drawings.map(drawing => drawing._id) } },
    { _id: { $in: [...pinnedIds, ...targetRevisionIds] } }] }).select({ _id: 1, drawingId: 1, revisionNumber: 1, roomId: 1, scopeSectionId: 1, catalogueId: 1 }).sort({ revisionNumber: -1, _id: 1 }));
  if (pinnedIds.some(id => !revisions.some(revision => String(revision._id) === id))) result.all = true;
  const latest = new Map<string, Row>();
  const protectedRevisions = revisions.filter(revision => {
    const isLatest = !latest.has(revision.drawingId); latest.set(revision.drawingId, revision);
    return isLatest && drawings.some(drawing => String(drawing._id) === revision.drawingId) ||
      pinnedIds.includes(String(revision._id)) || targetRevisionIds.includes(String(revision._id));
  });
  for (const revision of protectedRevisions) protectMapping(revision);
  for (const drawing of targetDrawings) protectMapping(drawing);
  for (const upload of uploads) {
    if (["queued", "processing"].includes(upload.extractionStatus)) result.all = true;
    for (const target of upload.planRequestReplacement?.targets ?? []) protectMapping(target.mapping ?? {});
  }
  result.tokenRows = [requirements, histories, drawings, protectedRevisions, rounds, uploads, targetDrawings];
  return result;
}

export async function readQuotationSetup(estimate: Row, canConfigure: boolean, session?: ClientSession) {
  const sources = await visibleQuotationSources(estimate, session, true);
  const dependencies = await setupDependencies(estimate, session);
  const selected = new Set<string>(estimate.selectedMainBasketIds ?? []);
  const baskets = new Map<string, { id: string; name: string; subBaskets: { id: string; name: string; mainLineCount: number; temporaryItemCount: number }[];
    directTemporaryItemCount: number; canSelect: boolean; canRemove: boolean; removalBlockedReason: string | null }>();
  for (const source of sources.values()) {
    const saved = (estimate.lineItems ?? []).filter((line: Row) => line.mainLineId === source.line.mainLineId);
    if (saved.some((line: Row) => line.clientVisible !== undefined && line.clientVisible !== true)) continue;
    const prior = saved[0];
    const pricingMode = ["pmc", "sub_vendor", "in_house"].includes(prior?.pricingMode) ? prior.pricingMode : "sub_vendor";
    const choices = await estimateTierChoices({ quantity: 1, uomId: source.line.uom.id, pricingMode,
      modeTier: prior?.modeTier ?? source.line.applicableTiers[0] ?? "signature" }, source, session);
    const available = choices.some(choice => choice.available);
    if (!available && !selected.has(source.line.basketId)) continue;
    const basket = baskets.get(source.line.basketId) ?? { id: source.line.basketId, name: source.mainBasketName,
      subBaskets: [], directTemporaryItemCount: 0, canSelect: false, canRemove: true, removalBlockedReason: null };
    basket.canSelect ||= available;
    if (source.line.subBasketId && source.subBasketName) {
      let sub = basket.subBaskets.find(entry => entry.id === source.line.subBasketId);
      if (!sub) { sub = { id: source.line.subBasketId, name: source.subBasketName, mainLineCount: 0, temporaryItemCount: 0 }; basket.subBaskets.push(sub); }
      if (source.line.itemType === "temporary") sub.temporaryItemCount += 1; else sub.mainLineCount += 1;
    } else if (source.line.itemType === "temporary") basket.directTemporaryItemCount += 1;
    baskets.set(basket.id, basket);
  }
  for (const basket of baskets.values()) {
    const protectedRows = (estimate.lineItems ?? []).some((line: Row) => line.mainBasketId === basket.id && !editableLine(line, sources, estimate));
    basket.canRemove = !dependencies.all && !dependencies.basketIds.has(basket.id) && !protectedRows;
    basket.removalBlockedReason = basket.canRemove ? null : removalMessage;
    basket.subBaskets.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  const rooms = (estimate.rooms ?? []).map((room: Row) => {
    const protectedRows = (estimate.lineItems ?? []).some((line: Row) => (line.roomId === room.id || !line.roomId && line.roomName === (room.label ?? room.name)) && !editableLine(line, sources, estimate));
    const canRemove = !dependencies.all && !dependencies.roomIds.has(room.id) && !protectedRows;
    return { id: String(room.id), typeId: typeof room.typeId === "string" && room.typeId ? room.typeId : null,
      label: String(room.label ?? room.name ?? room.id), length: nullableNumber(room.length), width: nullableNumber(room.width),
      sqft: typeof room.sqft === "number" && Number.isFinite(room.sqft) && room.sqft >= 0 ? room.sqft : 0,
      canRemove, removalBlockedReason: canRemove ? null : removalMessage };
  });
  const safeBaskets = [...baskets.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const setup = { propertyType: String(estimate.propertyType), bedroomCount: estimate.bedroomCount ?? null, rooms,
    selectedMainBasketIds: [...selected].filter(basketId => baskets.has(basketId)), sourceToken: "", canConfigure };
  const identities = [...sources.values()].map(source => ({ id: source.line.mainLineId, line: source.line,
    mainBasketName: source.mainBasketName, subBasketName: source.subBasketName })).sort((a, b) => a.id.localeCompare(b.id));
  setup.sourceToken = createHash("sha256").update(JSON.stringify({ estimateId: String(estimate._id), version: estimate.version,
    setup, baskets: safeBaskets, identities, dependencies: dependencies.tokenRows })).digest("hex");
  return { setup, baskets: safeBaskets, sources };
}

/** Merge the Client projection into complete server-owned membership; omitted hidden scope is retained. */
export async function configureQuotation(estimate: Row, operation: Configure, session: ClientSession) {
  const current = await readQuotationSetup(estimate, true, session);
  if (operation.sourceToken !== current.setup.sourceToken) changed();
  if (new Set(operation.rooms.map(room => room.id)).size !== operation.rooms.length ||
    new Set(operation.selectedMainBasketIds).size !== operation.selectedMainBasketIds.length) invalid();
  if (operation.propertyType !== estimate.propertyType && !(ESTIMATE_PROPERTY_TYPES as readonly string[]).includes(operation.propertyType)) invalid();
  if (requiresBedroomCount(operation.propertyType) ? !isValidBedroomCount(operation.bedroomCount) :
    operation.bedroomCount !== null && operation.bedroomCount !== (estimate.bedroomCount ?? null)) invalid();
  const definitions = getEstimateRoomDefinitions(operation.propertyType, operation.bedroomCount);
  const previousRooms = new Map<string, Row>((estimate.rooms ?? []).map((room: Row) => [room.id, room]));
  const requestedRooms = new Map(operation.rooms.map(room => [room.id, room]));
  const removedRooms = current.setup.rooms.filter((room: Row) => !requestedRooms.has(room.id));
  if (removedRooms.some((room: Row) => !room.canRemove)) blocked();
  const newTypes = new Set<string>();
  const rooms: Row[] = [];
  for (const room of [...(estimate.rooms ?? []).filter((room: Row) => requestedRooms.has(room.id)).map((room: Row) => requestedRooms.get(room.id)!),
    ...operation.rooms.filter(room => !previousRooms.has(room.id))]) {
    const prior = previousRooms.get(room.id);
    if (prior) {
      const projected = current.setup.rooms.find((entry: Row) => entry.id === room.id)!;
      if (room.typeId !== projected.typeId || room.label !== projected.label) invalid();
      if (room.length === projected.length && room.width === projected.width) rooms.push(prior);
      else rooms.push({ ...prior, length: room.length, width: room.width,
        ...(room.length !== null && room.width !== null ? { sqft: room.length * room.width } : {}) });
    } else {
      const definition = definitions.find(entry => entry.typeId === room.typeId);
      if (!definition || room.label !== definition.label || newTypes.has(room.typeId!) ||
        operation.rooms.some(other => other.id !== room.id && previousRooms.has(other.id) && other.typeId === room.typeId)) invalid();
      newTypes.add(room.typeId!);
      rooms.push({ ...room, sqft: room.length !== null && room.width !== null ? room.length * room.width : definition!.sqft });
    }
  }
  const requested = new Set(operation.selectedMainBasketIds);
  const safeIds = new Set(current.baskets.map(basket => basket.id));
  for (const basketId of requested) {
    const basket = current.baskets.find(entry => entry.id === basketId);
    if (!basket || !current.setup.selectedMainBasketIds.includes(basketId) && !basket.canSelect) invalid();
  }
  const removedBaskets = current.baskets.filter(basket => current.setup.selectedMainBasketIds.includes(basket.id) && !requested.has(basket.id));
  if (removedBaskets.some(basket => !basket.canRemove)) blocked();
  const removedRoomIds = new Set(removedRooms.map((room: Row) => room.id));
  const removedBasketIds = new Set(removedBaskets.map(basket => basket.id));
  const selectedMainBasketIds = (estimate.selectedMainBasketIds ?? []).filter((basketId: string) => !safeIds.has(basketId) || requested.has(basketId));
  for (const basketId of requested) if (!selectedMainBasketIds.includes(basketId)) selectedMainBasketIds.push(basketId);
  const selectedMainBasketClassifications = [...(estimate.selectedMainBasketClassifications ?? [])];
  for (const basketId of requested) if (!(estimate.selectedMainBasketIds ?? []).includes(basketId) &&
    !selectedMainBasketClassifications.some((entry: Row) => entry.mainBasketId === basketId))
    selectedMainBasketClassifications.push({ mainBasketId: basketId, classification: "standard" });
  const lineItems = (estimate.lineItems ?? []).filter((line: Row) => !removedRoomIds.has(line.roomId)).map((line: Row) => {
    if (!removedBasketIds.has(line.mainBasketId) || !line.included) return line;
    const next: Row = { ...line, included: false, amountPaise: 0, amount: 0 };
    delete next.componentPricing; delete next.pricingBasis;
    return next;
  });
  const next = { propertyType: operation.propertyType, bedroomCount: operation.bedroomCount === (estimate.bedroomCount ?? null) ? estimate.bedroomCount : operation.bedroomCount,
    rooms, selectedMainBasketIds, selectedMainBasketClassifications: selectedMainBasketClassifications.length ? selectedMainBasketClassifications : estimate.selectedMainBasketClassifications, lineItems };
  const unchanged = Object.entries(next).every(([key, value]) => isDeepStrictEqual(value, estimate[key]));
  if (!unchanged) {
    const involved = new Set([...requested, ...removedBasketIds]);
    for (const source of current.sources.values()) {
      if (!involved.has(source.line.basketId) && !estimate.lineItems.some((line: Row) => removedRoomIds.has(line.roomId) && line.mainLineId === source.line.mainLineId)) continue;
      await fenceEstimateTierSource({ mainLineId: source.line.mainLineId, mainBasketId: source.line.basketId,
        subBasketId: source.line.subBasketId, uomId: source.line.uom.id }, session);
    }
  }
  return next;
}
