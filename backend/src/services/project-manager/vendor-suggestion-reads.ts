import type { ClientSession } from "mongoose";
import type { PMApprovedSourceRef, PMMainLineScope, PMVendorSuggestion, PMVendorSuggestionPage,
  PMVendorSuggestionQuery } from "../../contracts/project-manager-estimates.js";
import { pmApprovedSourceSchema } from "../../domain/project-manager/estimates.js";
import { readVendorSuggestionWriteAvailability } from "../../domain/project-vendor-suggestion-scope-index.js";
import { ProjectVendorSuggestionModel } from "../../models/ProjectVendorSuggestion.js";
import { AiEstimatorKnowledgeVendorModel } from "../../models/AiEstimatorKnowledgeVendor.js";
import { UserModel } from "../../models/User.js";
import type { PublicUser } from "../auth.service.js";
import { resolveEstimatorCatalogueLines } from "../estimator-catalogue.service.js";
import { readMainLineVendorLinks } from "../main-line-vendor-links.service.js";
import { readBasketVendorRecommendationReadiness, vendorReadinessReason } from "../procurement-basket-vendor-eligibility.service.js";
import { readPMApprovedSource, readPMMainLineScopes, pmApprovedSourcesEqual } from "./approved-source.js";
import { readPMVendorSuggestionActivity } from "./vendor-suggestion-activity.js";
import type { PMRow } from "./common.js";

/** Caller must authorize this exact project in the same transaction. */
export async function readPMVendorSuggestions(actor: PublicUser, projectId: string, query: PMVendorSuggestionQuery,
  session: ClientSession, at: Date, options: { basketId?: string; procurement?: boolean; activity?: boolean } = {}): Promise<PMVendorSuggestionPage> {
  const approved = await readPMApprovedSource(projectId, session);
  const ready = await readVendorSuggestionWriteAvailability(session);
  const writeAvailability = approved.source ? ready : { available: false, reason: approved.issues[0] ?? "An approved estimate is required." };
  const current = approved.source ? { estimateId: approved.source.estimateId, estimateVersion: approved.source.estimateVersion,
    estimateReviewRoundId: approved.source.estimateReviewRoundId, designPlanVersion: approved.source.designPlanVersion } : null;
  const filter = { projectId,
    ...(options.basketId ? { mainBasketId: options.basketId, scope: "main_line" } : {}),
    ...(query.mainLineId ? { mainLineId: query.mainLineId } : {}),
    ...(query.source === "current" ? current ?? { _id: { $in: [] } } : query.source === "history" && current ? { $nor: [current] } : {}),
    ...(query.q ? { $or: ["vendorNameSnapshot", "vendorCodeSnapshot", "mainLineNameSnapshot", "note"].map(field =>
      ({ [field]: { $regex: literal(query.q!), $options: "i" } })) } : {}) };
  const total = await ProjectVendorSuggestionModel.countDocuments(filter).session(session);
  const rows: PMRow[] = await ProjectVendorSuggestionModel.find(filter).sort({ createdAt: -1, _id: 1 })
    .skip(query.offset).limit(query.limit).session(session).lean();
  const vendorIds = [...new Set(rows.map(row => String(row.vendorId)))];
  const vendors = await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: vendorIds } }).select({ code: 1, name: 1,
    status: 1, procurementProfile: 1, kpiRubricGeneration: 1, msmeCertificate: 1 }).session(session).lean();
  const people = await UserModel.find({ _id: { $in: rows.flatMap(row => [row.createdById, row.updatedById]) } })
    .select({ name: 1 }).session(session).lean();
  const vendorById = new Map(vendors.map(vendor => [String(vendor._id), vendor]));
  const names = new Map(people.map(person => [String(person._id), String(person.name)]));
  const currentScopes = new Map((await readPMMainLineScopes(approved, session)).map(scope => [scope.mainLineId, scope]));
  const configuration = await resolveEstimatorCatalogueLines([...new Set(rows.flatMap(row => row.mainLineId ? [String(row.mainLineId)] : []))], session);
  const currentLinks = await readMainLineVendorLinks(rows.flatMap(row => {
    const source = storedSource(row, approved.source);
    return row.scope === "main_line" && row.mainLineId && pmApprovedSourcesEqual(source, approved.source) ? [String(row.mainLineId)] : [];
  }), session);
  const readiness = new Map<string, Awaited<ReturnType<typeof readBasketVendorRecommendationReadiness>>[number]>();
  for (const basketId of [...new Set(rows.flatMap(row => row.mainBasketId ? [String(row.mainBasketId)] : []))]) {
    const relevantIds = new Set(rows.filter(row => row.mainBasketId === basketId).map(row => String(row.vendorId)));
    const facts = await readBasketVendorRecommendationReadiness(projectId, basketId, vendors.filter(vendor => relevantIds.has(String(vendor._id))), session);
    for (const fact of facts) readiness.set(`${basketId}:${fact.vendorId}`, fact);
  }
  const items: PMVendorSuggestion[] = rows.map(row => {
    const source = storedSource(row, approved.source);
    const sourceState = !source ? "unverified" : pmApprovedSourcesEqual(source, approved.source) ? "current" : "historical";
    const scope = storedScope(row);
    const currentScope = scope ? currentScopes.get(scope.mainLineId) : undefined;
    const scopeMatches = !!currentScope && currentScope.canSuggest && currentScope.scopeDigest === scope?.scopeDigest;
    const vendor = vendorById.get(String(row.vendorId));
    const facts = scope ? readiness.get(`${scope.mainBasketId}:${row.vendorId}`) : undefined;
    const activeConfiguration = scope ? configuration.get(scope.mainLineId)?.line : undefined;
    const configurationReady = activeConfiguration?.itemStatus === "active" && activeConfiguration.revisionStatus === "active";
    const links = scope && sourceState === "current" ? currentLinks.get(scope.mainLineId) : undefined;
    const linked = links?.available === true && links.vendorIds.includes(String(row.vendorId));
    const linkReason = !scope || sourceState !== "current" ? null : !links?.available
      ? links && !links.available ? links.reason : "Current Configuration vendor links are unavailable."
      : !linked ? "Vendor is no longer linked to this Main Line in Configuration." : null;
    const readinessReasons = !scope ? ["This is a project-wide suggestion; it does not identify a Main Line."] : [
      ...(!vendor ? ["Vendor is unavailable."] : facts ? facts.blockers.map(vendorReadinessReason) : ["Vendor bid readiness is unavailable."]),
      ...(sourceState !== "current" ? ["This suggestion belongs to a previous or unverified approved source."] : []),
      ...(!scopeMatches ? [currentScope?.unavailableReason ?? "The Main Line scope needs reconciliation."] : []),
      ...(linkReason ? [linkReason] : []),
      ...(!configurationReady ? ["Current Main Line Configuration must be activated before a bid request."] : [])];
    const owner = actor.role === "site_manager" && row.createdById === actor.id;
    const editUnavailableReason = options.procurement ? "Only the authoring Project Manager can edit this suggestion." :
      !scope ? "Project-wide suggestions are managed in the existing Admin workflow." :
      !owner ? "Only the authoring Project Manager can edit this suggestion." :
      sourceState !== "current" ? "Previous-source suggestions are retained as history." :
      !scopeMatches ? currentScope?.unavailableReason ?? "The approved Main Line scope needs reconciliation." :
      !writeAvailability.available ? writeAvailability.reason ?? "Suggestion changes are unavailable." : null;
    const reinstateReason = editUnavailableReason ?? (row.status !== "withdrawn" ? "This suggestion is not withdrawn." : null) ?? linkReason ??
      (!vendor ? "Vendor is unavailable." : facts?.canSuggest !== true ?
        facts?.blockers.filter(reason => reason.startsWith("vendor_")).map(vendorReadinessReason)[0] ?? "Vendor activation is unavailable." : null);
    return { id: String(row._id), projectId, source,
      storedSource: { estimateId: String(row.estimateId), estimateVersion: Number(row.estimateVersion),
        estimateReviewRoundId: row.estimateReviewRoundId ?? null, designPlanVersion: Number(row.designPlanVersion) },
      scope: scope ? "main_line" : "project", mainLine: scope ? { ...scope,
        ...(sourceState === "current" && currentScope?.scopeDigest === scope.scopeDigest ? { itemType: currentScope.itemType } : {}),
        ...(sourceState === "current" && currentScope ? { mainLineName: currentScope.mainLineName, mainBasketName: currentScope.mainBasketName } : {}),
        canSuggest: sourceState === "current" && scopeMatches, unavailableReason: sourceState === "current" ? currentScope?.unavailableReason ?? null : "Previous approved source." } : null,
      vendor: { id: String(row.vendorId), code: vendor?.code ?? String(row.vendorCodeSnapshot), name: vendor?.name ?? String(row.vendorNameSnapshot) },
      note: String(row.note ?? ""), status: row.status, version: Number(row.version),
      suggestedBy: { id: String(row.createdById), name: names.get(String(row.createdById)) ?? String(row.createdByName) },
      updatedBy: { id: String(row.updatedById), name: names.get(String(row.updatedById)) ?? String(row.updatedByName) },
      createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), sourceState,
      canEdit: editUnavailableReason === null, editUnavailableReason,
      ...(scope ? { reinstatementAvailability: { available: reinstateReason === null, reason: reinstateReason } } : {}),
      bidEligible: row.status === "suggested" && sourceState === "current" && scopeMatches && linked && configurationReady && facts?.eligible === true,
      readinessReasons, activity: { availability: "unavailable", items: [], truncated: false } };
  });
  if (options.activity !== false) {
    try {
      const activities = await readPMVendorSuggestionActivity(projectId, items, session, at);
      for (const item of items) item.activity = activities.get(item.id) ?? item.activity;
    } catch {
      // Do not turn a failed history lookup into a false "not invited" state.
      for (const item of items) item.activity = { availability: "unavailable", items: [], truncated: false };
    }
  }
  return { source: approved.source, items, total, limit: query.limit, offset: query.offset, writeAvailability };
}

function storedSource(row: PMRow, current: PMApprovedSourceRef | null): PMApprovedSourceRef | null {
  if (current && row.estimateId === current.estimateId && row.estimateVersion === current.estimateVersion &&
    row.estimateReviewRoundId === current.estimateReviewRoundId && row.designPlanVersion === current.designPlanVersion &&
    !row.mainLineId && row.sourcePhase == null) return current;
  const parsed = pmApprovedSourceSchema.safeParse({ estimateId: row.estimateId, estimateVersion: row.estimateVersion,
    estimateReviewRoundId: row.estimateReviewRoundId, designPlanVersion: row.designPlanVersion,
    phase: row.sourcePhase, sourceSnapshotId: row.sourceSnapshotId ?? null, sourceDigest: row.sourceDigest ?? null });
  return parsed.success ? parsed.data : null;
}
function storedScope(row: PMRow): PMMainLineScope | null {
  if (row.scope !== "main_line" || typeof row.mainLineId !== "string" || !row.mainLineId.trim() || !Array.isArray(row.scopeOccurrences)) return null;
  const occurrences = row.scopeOccurrences.filter((item: PMRow) => typeof item.sourceLineItemKey === "string" &&
    typeof item.sectionId === "string" && typeof item.roomName === "string").map((item: PMRow) => ({
    sourceLineItemKey: item.sourceLineItemKey, sectionId: item.sectionId, roomId: typeof item.roomId === "string" ? item.roomId : null, roomName: item.roomName }));
  return { mainLineId: row.mainLineId, mainLineName: String(row.mainLineNameSnapshot ?? "Main Line"),
    mainBasketId: typeof row.mainBasketId === "string" ? row.mainBasketId : null,
    mainBasketName: typeof row.mainBasketNameSnapshot === "string" ? row.mainBasketNameSnapshot : null,
    occurrences, scopeDigest: String(row.scopeDigest ?? ""), canSuggest: false, unavailableReason: null };
}
const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
