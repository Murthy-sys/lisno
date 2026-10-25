import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ProposalChange, ProposalCreateInput, ProposalDecisionInput, ProposalDecisionResult, ProposalDetail, ProposalHead,
  ProposalHierarchyNode, ProposalMetadata, ProposalMetadataInput, ProposalMutationResult, ProposalPage,
  ProposalPublicationSnapshot, ProposalQualityInput, ProposalReadiness, ProposalReferenceKind, ProposalResource,
  ProposalResourceKind, ProposalScope, ProposalSectionInput, ProposalSectionValue, ProposalSnapshot, ProposalStatus,
  ProposalSubmitInput, ProposalSummary, ProposalVersionInput, ProposalTarget, ProposalMasterKind, ProposalMasterInput, ProposalMasterResource,
  ProposalRequestMode, ProposalIntakeContent, ProposalIntakeInput } from "../contracts/vendor-basket-proposal.js";
import { PROPOSAL_LIMITS } from "../contracts/vendor-basket-proposal.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, createKnowledgeContentDigest, normalizeKnowledgeIdentity, type KnowledgeSectionKey } from "../domain/ai-estimator-knowledge.js";
import { deriveKnowledgeCompleteness } from "../domain/ai-estimator-knowledge-completeness.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { VendorBasketProposalModel } from "../models/VendorBasketProposal.js";
import { VendorBasketProposalResourceModel } from "../models/VendorBasketProposalResource.js";
import { VendorBasketRequestModel } from "../models/VendorBasketRequest.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeModeModel } from "../models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgePriorityModel } from "../models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeQualityControlOptionModel } from "../models/AiEstimatorKnowledgeQualityControlOption.js";
import type { PaginationInput } from "../repositories/types.js";
import { aiEstimatorKnowledgeActorGuard, aiEstimatorKnowledgeVendorActorGuard } from "./ai-estimator-knowledge-actor.js";
import { basketQualityDto, readBasketQualityRevision, mandatoryQualityParameters } from "./ai-estimator-knowledge-basket-quality.js";
import { loadKnowledgeItemDetailForProposalReference, normalizeKnowledgeProposalSectionPayload } from "./ai-estimator-knowledge-item.service.js";
import { normalizeProposalPriceCommands, projectProposalPricingPayload, publishProposalSnapshot, validateProposalSnapshot, type ProposalSaveValidationTarget } from "./vendor-basket-proposal-publication.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { systemClock, type Clock } from "./workflow.js";
import { requireTargetRequestIndexes } from "./vendor-basket-request-indexes.js";
import { appendSubmittedBasketNotification } from "./vendor-basket-request-notifications.service.js";
import { vendorBasketRequestDto } from "./vendor-basket-request.service.js";

import { assertProposalMasterAvailable, normalizeProposalMaster, proposalMasterReferenceFields, proposalMasterResourceKind, proposalMasters } from "./vendor-basket-proposal-masters.js";

type Row = Record<string, unknown>;
interface Manifest extends ProposalHead { resources: Array<{ id: string; kind: ProposalResourceKind; parentId: string | null; version: number; digest: string; bytes: number }> }
interface StoredProposal {
  requestMode?: ProposalRequestMode;
  targetKind?: "new_main_basket" | "new_sub_basket"; targetParentBasketId?: string | null; targetParentName?: string | null;
  _id: string; requesterId: string; vendorId: string | null; vendorName: string | null; basketId: string; version: number;
  schemaVersion: 1; creationKey: string; creationFingerprint: string; revisedFromId: string | null; requestId: string | null;
  working: Manifest; submitted: Manifest | null; review: Manifest | null; approved: Manifest | null;
  submissionKey: string | null; submissionFingerprint: string | null; submittedAt: Date | null;
  decisionResult: ProposalDecisionResult | null; createdAt: Date; updatedAt: Date;
}
interface Loaded { proposal: StoredProposal; request: Row | null; head: Manifest; resources: ProposalResource[] }
interface ReadOptions { snapshot?: ProposalSnapshot }
interface HierarchyOptions extends ReadOptions, PaginationInput {}
interface ReferenceOptions extends PaginationInput { kind: ProposalReferenceKind; ids?: string[] }
interface Dependencies { audit: Pick<AuditService, "appendInMongoTransaction">; now?: Clock; createId?: () => string; startSession?: () => Promise<ClientSession> }

export function createVendorBasketProposalService(dependencies: Dependencies) {
  const now = dependencies.now ?? systemClock;
  const createId = dependencies.createId ?? randomUUID;
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());
  const id = (prefix: string) => `${prefix}-${createId()}`;

  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    // Duplicate keys can be the final result of concurrent identical requests. Retry
    // in a fresh transaction so the winning command is visible to replay checks.
    for (let attempt = 0; ; attempt++) {
      const session = await startSession();
      try {
        let result!: T;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } catch (error) {
        if (!duplicate(error)) throw error;
        if (attempt > 0) throw new ApiError(409, "PROPOSAL_CONFLICT", "A matching name or request already exists. Refresh before continuing.");
      } finally { await session.endSession().catch(() => undefined); }
    }
  }

  async function audit(actor: PublicUser, proposal: StoredProposal, action: "created" | "saved" | "submitted" | "decided" | "revised", session: ClientSession, values: Row = {}) {
    const target = proposalTarget(proposal);
    await dependencies.audit.appendInMongoTransaction({ actorId: actor.id,
      action: `vendor_basket_proposal_${action}`, entityType: "vendor_basket_proposal", entityId: proposal._id,
      occurredAt: now().toISOString(), newValues: { version: proposal.version, requestId: proposal.requestId, ...values,
        requestMode: proposal.requestMode ?? "full_configuration", targetKind: target.kind, targetParentBasketId: target.kind === "new_sub_basket" ? target.basketId : null } }, session);
  }

  async function append(proposalId: string, resourceId: string, kind: ProposalResourceKind, parentId: string | null,
    payload: unknown, version: number, actor: PublicUser, session: ClientSession, headId: string): Promise<ProposalResource> {
    const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (bytes > PROPOSAL_LIMITS.resourceBytes) throw new ApiError(413, "PROPOSAL_RESOURCE_TOO_LARGE", "One saved resource must be no larger than 240 KiB.");
    const savedAt = now(); const digest = createKnowledgeContentDigest(payload);
    await VendorBasketProposalResourceModel.create([{ _id: id("proposal-resource"), proposalId, resourceId, kind, parentId,
      resourceVersion: version, payload, bytes, digest, savedById: actor.id, savedAt }], { session });
    return enrichResource({ proposalId, resourceId, kind, parentId, version, payload, digest, headId, savedById: actor.id, savedAt: savedAt.toISOString() });
  }

  async function createDraft(actor: PublicUser, input: ProposalCreateInput, session: ClientSession,
    revised?: Loaded): Promise<ProposalDetail> {
    await authorize(actor, "procurement", session, true);
    const inputVendorName = input.vendorName == null ? null : cleanName(input.vendorName);
    let vendorName = inputVendorName; const name = cleanName(input.name);
    const target = revised ? proposalTarget(revised.proposal) : normalizeTarget(input.target);
    const requestMode = revised?.proposal.requestMode ?? input.requestMode ?? "full_configuration";
    if (requestMode !== "hierarchy_intake" && requestMode !== "full_configuration") invalidIntake();
    if (requestMode !== "hierarchy_intake" && input.intake !== undefined) invalidIntake();
    const intake = requestMode === "hierarchy_intake" && !revised ? normalizeIntake(input.intake, target, true) : undefined;
    if (intake && name !== (target.kind === "new_sub_basket" ? intake.subBasket.name : intake.basket!.name)) invalidIntake();
    checkKey(input.idempotencyKey);
    const fingerprint = createKnowledgeContentDigest({ vendorId: input.vendorId ?? null, vendorName: inputVendorName, name,
      ...(target.kind === "new_sub_basket" ? { target } : {}),
      ...(requestMode === "hierarchy_intake" ? { requestMode, ...(intake ? { intake } : {}) } : {}),
      ...(revised ? { revisedFromId: revised.proposal._id, rejectedVersion: revised.proposal.version,
        rejectedRequestVersion: revised.request?.version } : {}) });
    const previous = await VendorBasketProposalModel.findOne({ requesterId: actor.id, creationKey: input.idempotencyKey }).session(session).lean().exec() as StoredProposal | null;
    if (previous) {
      if (previous.creationFingerprint !== fingerprint) keyConflict();
      return detail(await load(actor, "procurement", previous._id, {}, session), "procurement");
    }
    if (input.vendorId) {
      const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: input.vendorId, status: { $ne: "archived" } }).session(session).lean().exec();
      if (!vendor) notFound();
      if (inputVendorName !== null && vendor.nameNormalized !== normalizeKnowledgeIdentity(inputVendorName)) throw new ApiError(409, "VENDOR_CHANGED", "Refresh the saved vendor name before creating a proposal.");
      vendorName = String(vendor.name);
    }
    let parent: Row | null = null;
    if (target.kind === "new_sub_basket") {
      await requireTargetRequestIndexes(VendorBasketRequestModel.collection);
      parent = await AiEstimatorKnowledgeBasketModel.findOne({ _id: target.basketId, status: "active" }).session(session).lean().exec();
      if (!parent) throw new ApiError(409, "PARENT_BASKET_UNAVAILABLE", "Select an active Main Basket for this Sub-Basket request.");
    }
    const proposalId = id("basket-proposal"); const basketId = target.kind === "new_sub_basket" ? target.basketId : id("knowledge-basket");
    const headId = `${proposalId}:authoring`; const createdAt = now();
    let resources: ProposalResource[];
    if (revised) {
      const remap = new Map<string, string>(revised.resources.map((resource) => [resource.resourceId,
        resource.kind === "basket" ? basketId : id(resource.kind === "main_line" ? "ai-knowledge-main-line" : resource.kind === "sub_basket" ? "knowledge-sub-basket" : resource.kind === "uom" ? "knowledge-uom" : resource.kind === "surface" ? "knowledge-surface" : "proposal-node")]));
      for (const resource of revised.resources) if (resource.kind === "section" && (resource.payload as ProposalSectionValue).sectionKey === "pricing") {
        const prices = (resource.payload as ProposalSectionValue).payload.priceEntries;
        if (Array.isArray(prices)) for (const price of prices) if (typeof price.priceEntryId === "string") remap.set(price.priceEntryId, id("proposal-price"));
      }
      resources = [];
      for (const resource of revised.resources) resources.push(await append(proposalId, remap.get(resource.resourceId)!, resource.kind,
        resource.parentId ? remap.get(resource.parentId) ?? resource.parentId : null, remapResourcePayload(resource, remap), 1, actor, session, headId));
    } else {
      resources = [await append(proposalId, basketId, "basket", null, parent
        ? { name: String(parent.name), description: parent.description ?? null, displayOrder: Number(parent.displayOrder) }
        : { name, description: intake?.basket?.description ?? null, displayOrder: 0 }, 1, actor, session, headId)];
      if (parent || intake) {
        const subBasketId = id("knowledge-sub-basket");
        resources.push(await append(proposalId, subBasketId, "sub_basket", basketId,
          { name: intake?.subBasket.name ?? name, description: intake?.subBasket.description ?? null, displayOrder: 0 }, 1, actor, session, headId));
        for (const [displayOrder, line] of (intake?.mainLines ?? []).entries()) resources.push(await append(proposalId, id("ai-knowledge-main-line"), "main_line", subBasketId,
          { name: line.name, description: null, displayOrder }, 1, actor, session, headId));
      }
    }
    checkBounds(resources);
    const working = manifest(headId, 1, resources);
    const proposal: StoredProposal = { _id: proposalId, requesterId: actor.id, vendorId: input.vendorId ?? null, vendorName,
      basketId, ...(requestMode === "hierarchy_intake" ? { requestMode } : {}), targetKind: target.kind, targetParentBasketId: target.kind === "new_sub_basket" ? target.basketId : null,
      targetParentName: revised?.proposal.targetParentName ?? (parent ? String(parent.name) : null), schemaVersion: 1, version: 1, creationKey: input.idempotencyKey, creationFingerprint: fingerprint,
      revisedFromId: revised?.proposal._id ?? null, requestId: null, working, submitted: null, review: null, approved: null,
      submissionKey: null, submissionFingerprint: null, submittedAt: null, decisionResult: null, createdAt, updatedAt: createdAt };
    await VendorBasketProposalModel.create([proposal], { session });
    await audit(actor, proposal, revised ? "revised" : "created", session, { digest: working.digest, headId: working.id,
      headVersion: working.version, resources: working.resources.map((ref) => ({ resourceId: ref.id, version: ref.version, digest: ref.digest })), revisedFromId: proposal.revisedFromId });
    return detail({ proposal, request: null, head: working, resources }, "procurement");
  }

  async function mutate(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalVersionInput,
    change: (loaded: Loaded, session: ClientSession) => Promise<{ resources: ProposalResource[]; resource: ProposalResource | null }>, saveTarget?: ProposalSaveValidationTarget,
    requiredMode: ProposalRequestMode = "full_configuration"): Promise<ProposalMutationResult> {
    return transaction(async (session) => {
      await authorize(actor, scope, session, true);
      const loaded = await load(actor, scope, proposalId, {}, session);
      assertEditable(loaded, scope, input);
      if ((loaded.proposal.requestMode ?? "full_configuration") !== requiredMode) throw new ApiError(409, "PROPOSAL_MODE_MISMATCH", "Use the editor for this request's saved mode.");
      const changed = await change(loaded, session);
      const head = manifest(loaded.head.id, loaded.head.version + 1, changed.resources);
      checkBounds(changed.resources);
      if (saveTarget) {
        const findings = await validateProposalSnapshot(publicationSnapshot({ ...loaded, head, resources: changed.resources }), session, { forSave: true, saveTarget });
        if (findings.length) throw new ApiError(422, "PROPOSAL_CONFIGURATION_INVALID", "Resolve the invalid saved configuration values.",
          Object.fromEntries(findings.map((finding, index) => [`${finding.resourceId}.${finding.path ?? index}`, finding.message])));
      }
      const version = loaded.proposal.version + 1;
      const timestamp = now();
      const update = await VendorBasketProposalModel.updateOne({ _id: proposalId, version: input.expectedVersion },
        { $set: { [scope === "admin" ? "review" : "working"]: head, updatedAt: timestamp }, $inc: { version: 1 } }, { session }).exec();
      if (update.modifiedCount !== 1) versionConflict();
      if (scope === "admin") await advanceRequest(loaded, input.expectedRequestVersion!, session);
      const proposal = { ...loaded.proposal, version, updatedAt: timestamp,
        ...(scope === "admin" ? { review: head } : { working: head }) };
      const request = loaded.request && scope === "admin" ? { ...loaded.request, version: Number(loaded.request.version) + 1 } : loaded.request;
      await audit(actor, proposal, "saved", session, { digest: head.digest, resourceId: changed.resource?.resourceId ?? null,
        previousDigest: loaded.head.digest, headId: head.id, headVersion: head.version, requestVersion: request?.version ?? null,
        resources: resourceChanges(loaded.head, head) });
      return { detail: detail({ proposal, request, head, resources: changed.resources }, scope), resource: changed.resource };
    });
  }

  async function metadataChange(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalMetadataInput,
    kind: "basket" | "sub_basket" | "main_line", resourceId?: string, parentId?: string): Promise<ProposalMutationResult> {
    return mutate(actor, scope, proposalId, input, async (loaded, session) => {
      if (isSubTarget(loaded.proposal) && kind === "sub_basket" && !resourceId) parentReadOnly();
      const previous = resourceId ? requireResource(loaded, resourceId, kind) : null;
      if (parentId) requireResource(loaded, parentId, kind === "main_line" ? "sub_basket" : "basket");
      const name = cleanName(input.name);
      // Main Line identity is unique in the whole basket, matching live Configuration.
      const duplicateName = loaded.resources.some((resource) => resource.kind === kind && resource.resourceId !== previous?.resourceId
        && normalizeKnowledgeIdentity((resource.payload as ProposalMetadata).name) === normalizeKnowledgeIdentity(name));
      if (duplicateName) throw new ApiError(409, "DUPLICATE_NAME", "A resource with this name already exists in the proposal.");
      const resource = await append(proposalId, resourceId ?? id(kind === "main_line" ? "ai-knowledge-main-line" : "knowledge-sub-basket"), kind,
        previous?.parentId ?? parentId ?? (kind === "sub_basket" ? loaded.proposal.basketId : null),
        { name, description: cleanDescription(input.description === undefined ? (previous?.payload as ProposalMetadata | undefined)?.description ?? null : input.description),
          displayOrder: checkedOrder(input.displayOrder ?? (previous?.payload as ProposalMetadata | undefined)?.displayOrder ?? loaded.resources.filter((row) => row.kind === kind).length) },
        (previous?.version ?? 0) + 1, actor, session, loaded.head.id);
      const resources = loaded.resources.filter((row) => row.resourceId !== resource.resourceId).concat(resource);
      if (!previous && kind === "main_line") for (const sectionKey of AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) {
        resources.push(await append(proposalId, id("proposal-section"), "section", resource.resourceId,
          { sectionKey, applicability: "not_configured", payload: {} }, 1, actor, session, loaded.head.id));
      }
      return { resources, resource };
    });
  }

  async function remove(actor: PublicUser, scope: ProposalScope, proposalId: string, resourceId: string,
    kind: "sub_basket" | "main_line", input: ProposalVersionInput): Promise<ProposalMutationResult> {
    return mutate(actor, scope, proposalId, input, async (loaded) => {
      requireResource(loaded, resourceId, kind);
      if (kind === "sub_basket" && isSubTarget(loaded.proposal)) parentReadOnly();
      if (kind === "sub_basket" && loaded.resources.some((row) => row.kind === "main_line" && row.parentId === resourceId)) {
        throw new ApiError(409, "SUB_BASKET_NOT_EMPTY", "Remove the Sub-Basket's Main Lines first.");
      }
      const incoming = loaded.resources.filter((row) => row.resourceId !== resourceId && row.parentId !== resourceId
        && proposalIdentityFields(row).some((reference) => reference.row[reference.key] === resourceId));
      if (incoming.length) throw new ApiError(409, "PROPOSAL_RESOURCE_REFERENCED", "Remove the references to this resource first.",
        Object.fromEntries(incoming.map((row) => [row.resourceId, `Referenced by ${row.kind} ${row.parentId ?? row.resourceId}.`])));
      return { resources: loaded.resources.filter((row) => row.resourceId !== resourceId && row.parentId !== resourceId), resource: null };
    });
  }

  async function masterChange(actor: PublicUser, scope: ProposalScope, proposalId: string, kind: ProposalMasterKind,
    input: ProposalMasterInput, resourceId?: string): Promise<ProposalMutationResult> {
    const resourceKind = proposalMasterResourceKind(kind);
    return mutate(actor, scope, proposalId, input, async (loaded, session) => {
      const previous = resourceId ? requireResource(loaded, resourceId, resourceKind) as ProposalMasterResource : undefined;
      const masterId = previous?.resourceId ?? id(kind === "uoms" ? "knowledge-uom" : "knowledge-surface");
      const payload = normalizeProposalMaster(kind, masterId, input, previous?.payload);
      await assertProposalMasterAvailable(kind, masterId, payload, proposalMasters(loaded.resources), session);
      const resource = await append(proposalId, masterId, resourceKind, null, payload, (previous?.version ?? 0) + 1, actor, session, loaded.head.id);
      const resources = loaded.resources.filter((row) => row.resourceId !== masterId).concat(resource);
      // A precision change may invalidate quantities on any referencing line.
      if (previous && kind === "uoms" && previous.payload.decimalScale !== payload.decimalScale) {
        const snapshot = publicationSnapshot({ ...loaded, resources });
        for (const section of resources.filter((row) => proposalMasterReferenceFields(row).some((ref) => ref.row[ref.key] === masterId))) {
          const findings = await validateProposalSnapshot(snapshot, session, { forSave: true, saveTarget: {
            kind: "section", mainLineId: section.parentId!, sectionKey: (section.payload as ProposalSectionValue).sectionKey } });
          if (findings.length) throw new ApiError(422, "PROPOSAL_CONFIGURATION_INVALID", "Update quantities that use this UOM before changing its decimal places.",
            Object.fromEntries(findings.map((finding, index) => [`${finding.resourceId}.${finding.path ?? index}`, finding.message])));
        }
      }
      return { resources, resource };
    });
  }

  return {
    create(actor: PublicUser, input: ProposalCreateInput) { return transaction((session) => createDraft(actor, input, session)); },
    async saveIntake(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalIntakeInput): Promise<ProposalDetail> {
      const result = await mutate(actor, scope, proposalId, input, async (loaded, session) => {
        const intake = normalizeIntake(input.intake, proposalTarget(loaded.proposal));
        const basket = requireResource(loaded, loaded.proposal.basketId, "basket");
        const sub = loaded.resources.find((resource) => resource.kind === "sub_basket");
        if (!sub || loaded.resources.some((resource) => !["basket", "sub_basket", "main_line"].includes(resource.kind))) corrupt();
        if (isSubTarget(loaded.proposal) && !await AiEstimatorKnowledgeBasketModel.exists({ _id: loaded.proposal.basketId, status: "active" }).session(session)) {
          throw new ApiError(409, "PARENT_BASKET_UNAVAILABLE", "The selected Main Basket is no longer active.");
        }
        const resources: ProposalResource[] = [];
        for (const [previous, metadata] of [[basket, intake.basket], [sub, intake.subBasket]] as const) {
          resources.push(metadata ? await append(proposalId, previous.resourceId, previous.kind, previous.parentId,
            { ...metadata, displayOrder: (previous.payload as ProposalMetadata).displayOrder }, previous.version + 1, actor, session, loaded.head.id) : previous);
        }
        for (const [displayOrder, line] of intake.mainLines.entries()) {
          const previous = line.resourceId ? requireResource(loaded, line.resourceId, "main_line") : null;
          resources.push(await append(proposalId, previous?.resourceId ?? id("ai-knowledge-main-line"), "main_line", sub.resourceId,
            { name: line.name, description: null, displayOrder }, (previous?.version ?? 0) + 1, actor, session, loaded.head.id));
        }
        return { resources, resource: null };
      }, undefined, "hierarchy_intake");
      return result.detail;
    },
    async listMine(actor: PublicUser, options: PaginationInput & { status?: ProposalStatus }): Promise<ProposalPage<ProposalSummary>> {
      await authorize(actor, "procurement");
      // Join the canonical request decision state before filtering/paging; drafts have no queue record.
      const pipeline: mongoose.PipelineStage[] = [ { $match: { requesterId: actor.id } },
        { $lookup: { from: "vendorBasketRequests", localField: "requestId", foreignField: "_id", as: "decision" } },
        { $addFields: { effectiveStatus: { $ifNull: [{ $arrayElemAt: ["$decision.status", 0] }, "draft"] } } },
        ...(options.status ? [{ $match: { effectiveStatus: options.status } }] : []),
        { $sort: { updatedAt: -1, _id: 1 } }, { $facet: { rows: [{ $skip: options.offset }, { $limit: options.limit }], count: [{ $count: "total" }] } } ];
      const [result] = await VendorBasketProposalModel.aggregate(pipeline).exec();
      const items: ProposalSummary[] = [];
      for (const row of (result?.rows ?? []) as Array<StoredProposal & { decision: Row[] }>) {
        const request = row.decision[0] ?? null; const head = selectedHead(row, request, "procurement", "current");
        const resources = isSubTarget(row) ? await readResources(row._id, head) : [await readBasketResource(row._id, row.basketId, head)];
        items.push({ ...summary({ proposal: row, request, head, resources }),
          counts: { subBaskets: head.resources.filter((ref) => ref.kind === "sub_basket").length,
            mainLines: head.resources.filter((ref) => ref.kind === "main_line").length } });
      }
      return page(items, Number(result?.count?.[0]?.total ?? 0), options);
    },
    async get(actor: PublicUser, scope: ProposalScope, proposalId: string, options: ReadOptions = {}): Promise<ProposalDetail> {
      await authorize(actor, scope); return detail(await load(actor, scope, proposalId, options), scope, options.snapshot);
    },
    async hierarchy(actor: PublicUser, scope: ProposalScope, proposalId: string, options: HierarchyOptions): Promise<ProposalPage<ProposalHierarchyNode>> {
      await authorize(actor, scope); const loaded = await load(actor, scope, proposalId, options);
      const all = loaded.resources.filter((row) => row.kind === "sub_basket" || row.kind === "main_line")
        .sort((a, b) => (a.payload as ProposalMetadata).displayOrder - (b.payload as ProposalMetadata).displayOrder || a.resourceId.localeCompare(b.resourceId));
      const items = all.slice(options.offset, options.offset + options.limit).map((row) => hierarchyNode(loaded, row, scope));
      return page(items, all.length, options);
    },
    async resource(actor: PublicUser, scope: ProposalScope, proposalId: string, resourceId: string, options: ReadOptions = {}): Promise<ProposalResource> {
      await authorize(actor, scope); const loaded = await load(actor, scope, proposalId, options);
      const resource = requireResource(loaded, resourceId);
      if (scope !== "admin" && resource.kind === "section" && (resource.payload as ProposalSectionValue).sectionKey === "design") notFound();
      return resource;
    },
    async masters(actor: PublicUser, scope: ProposalScope, proposalId: string, kind: ProposalMasterKind, options: HierarchyOptions): Promise<ProposalPage<ProposalMasterResource>> {
      await authorize(actor, scope); const loaded = await load(actor, scope, proposalId, options);
      const resourceKind = proposalMasterResourceKind(kind);
      const all = proposalMasters(loaded.resources).filter((resource) => resource.kind === resourceKind)
        .sort((a, b) => a.payload.name.localeCompare(b.payload.name) || a.resourceId.localeCompare(b.resourceId));
      return page(all.slice(options.offset, options.offset + options.limit), all.length, options);
    },
    addMaster(actor: PublicUser, scope: ProposalScope, proposalId: string, kind: ProposalMasterKind, input: ProposalMasterInput) {
      return masterChange(actor, scope, proposalId, kind, input);
    },
    saveMaster(actor: PublicUser, scope: ProposalScope, proposalId: string, kind: ProposalMasterKind, resourceId: string, input: ProposalMasterInput) {
      return masterChange(actor, scope, proposalId, kind, input, resourceId);
    },
    removeMaster(actor: PublicUser, scope: ProposalScope, proposalId: string, kind: ProposalMasterKind, resourceId: string, input: ProposalVersionInput) {
      const resourceKind = proposalMasterResourceKind(kind);
      return mutate(actor, scope, proposalId, input, async (loaded) => {
        requireResource(loaded, resourceId, resourceKind);
        const incoming = loaded.resources.filter((resource) => proposalMasterReferenceFields(resource).some((ref) => ref.row[ref.key] === resourceId));
        if (incoming.length) throw new ApiError(409, "PROPOSAL_RESOURCE_REFERENCED", "Remove this value from the affected Main Lines before removing it from the proposal.",
          Object.fromEntries(incoming.map((section) => {
            const line = loaded.resources.find((resource) => resource.resourceId === section.parentId);
            return [section.resourceId, `Referenced by ${(line?.payload as ProposalMetadata | undefined)?.name ?? "a Main Line"} (${(section.payload as ProposalSectionValue).sectionKey}).`];
          })));
        return { resources: loaded.resources.filter((resource) => resource.resourceId !== resourceId), resource: null };
      });
    },
    async inheritedQuality(actor: PublicUser, scope: ProposalScope, proposalId: string) {
      return transaction(async (session) => {
        await authorize(actor, scope, session);
        const loaded = await load(actor, scope, proposalId, {}, session);
        if (!isSubTarget(loaded.proposal)) notFound();
        const parent = await AiEstimatorKnowledgeBasketModel.findById(loaded.proposal.targetParentBasketId).session(session).lean().exec();
        if (!parent || parent.status === "archived") throw new ApiError(409, "PARENT_BASKET_UNAVAILABLE", "The parent Main Basket is no longer available.");
        return basketQualityDto(parent, await readBasketQualityRevision(parent, session));
      });
    },
    async readiness(actor: PublicUser, scope: ProposalScope, proposalId: string): Promise<ProposalReadiness> {
      await authorize(actor, scope); const loaded = await load(actor, scope, proposalId, {});
      const findings = await validateProposalSnapshot(publicationSnapshot(loaded));
      return { head: publicHead(loaded.head), version: loaded.proposal.version, requestVersion: numberOrNull(loaded.request?.version), ready: findings.length === 0, findings };
    },
    saveBasket(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalMetadataInput) {
      return mutate(actor, scope, proposalId, input, async (loaded, session) => {
        if (isSubTarget(loaded.proposal)) parentReadOnly();
        const previous = requireResource(loaded, loaded.proposal.basketId, "basket");
        const resource = await append(proposalId, previous.resourceId, "basket", null,
          { name: cleanName(input.name), description: cleanDescription(input.description === undefined ? (previous.payload as ProposalMetadata).description : input.description), displayOrder: checkedOrder(input.displayOrder ?? (previous.payload as ProposalMetadata).displayOrder) },
          previous.version + 1, actor, session, loaded.head.id);
        return { resources: loaded.resources.filter((row) => row.resourceId !== previous.resourceId).concat(resource), resource };
      });
    },
    addSubBasket(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalMetadataInput) {
      return metadataChange(actor, scope, proposalId, input, "sub_basket", undefined, undefined);
    },
    saveSubBasket(actor: PublicUser, scope: ProposalScope, proposalId: string, subBasketId: string, input: ProposalMetadataInput) {
      return metadataChange(actor, scope, proposalId, input, "sub_basket", subBasketId);
    },
    removeSubBasket(actor: PublicUser, scope: ProposalScope, proposalId: string, subBasketId: string, input: ProposalVersionInput) {
      return remove(actor, scope, proposalId, subBasketId, "sub_basket", input);
    },
    addMainLine(actor: PublicUser, scope: ProposalScope, proposalId: string, subBasketId: string, input: ProposalMetadataInput) {
      return metadataChange(actor, scope, proposalId, input, "main_line", undefined, subBasketId);
    },
    saveMainLine(actor: PublicUser, scope: ProposalScope, proposalId: string, mainLineId: string, input: ProposalMetadataInput) {
      return metadataChange(actor, scope, proposalId, input, "main_line", mainLineId);
    },
    removeMainLine(actor: PublicUser, scope: ProposalScope, proposalId: string, mainLineId: string, input: ProposalVersionInput) {
      return remove(actor, scope, proposalId, mainLineId, "main_line", input);
    },
    async saveSection(actor: PublicUser, scope: ProposalScope, proposalId: string, mainLineId: string, sectionKey: KnowledgeSectionKey, input: ProposalSectionInput) {
      if (sectionKey === "design" && scope !== "admin") throw new ApiError(403, "FORBIDDEN", "Only Super Admin configures Design rules.");
      return mutate(actor, scope, proposalId, input, async (loaded, session) => {
        requireResource(loaded, mainLineId, "main_line");
        if (isSubTarget(loaded.proposal) && sectionKey === "quality") parentReadOnly();
        const findings = validateKnowledgeSectionPayload(sectionKey, input.payload);
        if (findings.length) throw new ApiError(400, "VALIDATION_ERROR", "The section contains invalid values.", Object.fromEntries(findings.map((finding) => [finding.path, finding.message])));
        const previous = loaded.resources.find((row) => row.kind === "section" && row.parentId === mainLineId && (row.payload as ProposalSectionValue).sectionKey === sectionKey);
        if (!previous && sectionKey !== "design") notFound();
        const previousPayload = previous ? (previous.payload as ProposalSectionValue).payload : {};
        const payload = sectionKey === "pricing" ? normalizeProposalPriceCommands(input.payload, previousPayload, createId)
          : normalizeKnowledgeProposalSectionPayload(sectionKey, input.payload, previousPayload);
        const resource = await append(proposalId, previous?.resourceId ?? id("proposal-section"), "section", mainLineId,
          { sectionKey, applicability: input.applicability, payload }, (previous?.version ?? 0) + 1, actor, session, loaded.head.id);
        return { resources: loaded.resources.filter((row) => row.resourceId !== previous?.resourceId).concat(resource), resource };
      }, { kind: "section", mainLineId, sectionKey });
    },
    saveQuality(actor: PublicUser, scope: ProposalScope, proposalId: string, input: ProposalQualityInput) {
      return mutate(actor, scope, proposalId, input, async (loaded, session) => {
        if (isSubTarget(loaded.proposal)) parentReadOnly();
        const findings = validateKnowledgeSectionPayload("quality", { parameters: input.parameters });
        if (findings.length) throw new ApiError(400, "VALIDATION_ERROR", "The quality checklist contains invalid values.", Object.fromEntries(findings.map((finding) => [finding.path, finding.message])));
        const previous = loaded.resources.find((row) => row.kind === "quality");
        const resource = await append(proposalId, previous?.resourceId ?? id("proposal-quality"), "quality", loaded.proposal.basketId,
          { parameters: mandatoryQualityParameters(input.parameters as Row[]) }, (previous?.version ?? 0) + 1, actor, session, loaded.head.id);
        return { resources: loaded.resources.filter((row) => row.kind !== "quality").concat(resource), resource };
      }, { kind: "quality" });
    },
    async submit(actor: PublicUser, proposalId: string, input: ProposalSubmitInput): Promise<ProposalDetail> {
      checkKey(input.idempotencyKey);
      const fingerprint = createKnowledgeContentDigest({ expectedVersion: input.expectedVersion });
      return transaction(async (session) => {
        await authorize(actor, "procurement", session, true);
        const loaded = await load(actor, "procurement", proposalId, {}, session);
        if (loaded.proposal.submissionKey === input.idempotencyKey) {
          if (loaded.proposal.submissionFingerprint !== fingerprint) keyConflict();
          return detail(loaded, "procurement");
        }
        assertEditable(loaded, "procurement", input); checkBounds(loaded.resources);
        const findings = await validateProposalSnapshot(publicationSnapshot(loaded), session);
        if (findings.length) throw new ApiError(422, "PROPOSAL_NOT_READY", "Complete the highlighted configuration before submission.", Object.fromEntries(findings.map((finding) => [finding.path ?? finding.resourceId, finding.message])));
        if (isSubTarget(loaded.proposal)) await requireTargetRequestIndexes(VendorBasketRequestModel.collection);
        const entity = proposedEntity(loaded).payload as ProposalMetadata;
        const vendorNameNormalized = loaded.proposal.vendorName == null ? null : normalizeKnowledgeIdentity(loaded.proposal.vendorName);
        const proposedNameNormalized = normalizeKnowledgeIdentity(entity.name);
        const vendorKey = loaded.proposal.vendorId ? `id:${loaded.proposal.vendorId}`
          : vendorNameNormalized === null ? "scope:configuration" : `name:${vendorNameNormalized}`;
        if (await VendorBasketRequestModel.exists({ status: "pending", targetParentBasketId: loaded.proposal.targetParentBasketId ?? null, proposedNameNormalized, $or: [{ vendorKey }, { vendorNameNormalized }] }).session(session)) {
          throw new ApiError(409, "REQUEST_PENDING", "A request for this vendor and basket target is already pending.");
        }
        if (!isSubTarget(loaded.proposal) && await AiEstimatorKnowledgeBasketModel.exists({ nameNormalized: proposedNameNormalized }).session(session)) {
          throw new ApiError(409, "BASKET_EXISTS", "A Main Basket with this name already exists in Configuration.");
        }
        const timestamp = now(); const requestId = id("vendor-basket-request");
        const request: Row = { _id: requestId, kind: "configuration_proposal", proposalId, proposalSchemaVersion: 1,
          ...(loaded.proposal.requestMode === "hierarchy_intake" ? { requestMode: "hierarchy_intake" } : {}),
          submittedDigest: loaded.head.digest, proposalCounts: counts(loaded.resources), requesterId: actor.id,
          vendorId: loaded.proposal.vendorId, vendorKey, vendorName: loaded.proposal.vendorName, vendorNameNormalized,
          proposedName: entity.name, proposedNameNormalized, status: "pending", version: 1,
          targetKind: proposalTarget(loaded.proposal).kind, targetParentBasketId: loaded.proposal.targetParentBasketId ?? null,
          targetParentName: loaded.proposal.targetParentName ?? null,
          idempotencyKey: `proposal_${proposalId}`, requestFingerprint: fingerprint, createdAt: timestamp };
        await VendorBasketRequestModel.create([request], { session });
        await appendSubmittedBasketNotification({ request: vendorBasketRequestDto(request), requester: actor }, session);
        const review = { ...loaded.head, id: `${proposalId}:review` };
        const proposal = { ...loaded.proposal, version: loaded.proposal.version + 1, requestId, submitted: loaded.head, review,
          submissionKey: input.idempotencyKey, submissionFingerprint: fingerprint, submittedAt: timestamp, updatedAt: timestamp };
        const update = await VendorBasketProposalModel.updateOne({ _id: proposalId, version: input.expectedVersion, requestId: null },
          { $set: { requestId, submitted: loaded.head, review, submissionKey: input.idempotencyKey, submissionFingerprint: fingerprint,
            submittedAt: timestamp, updatedAt: timestamp }, $inc: { version: 1 } }, { session }).exec();
        if (update.modifiedCount !== 1) versionConflict();
        await audit(actor, proposal, "submitted", session, { digest: loaded.head.digest, requestVersion: 1 });
        return detail({ ...loaded, proposal, request }, "procurement");
      });
    },
    async revise(actor: PublicUser, proposalId: string, input: ProposalSubmitInput): Promise<ProposalDetail> {
      return transaction(async (session) => {
        await authorize(actor, "procurement", session, true);
        const loaded = await load(actor, "procurement", proposalId, { snapshot: "submitted" }, session);
        if (loaded.request?.status !== "rejected") throw new ApiError(409, "PROPOSAL_NOT_REJECTED", "Only rejected requests can be revised.");
        if (loaded.proposal.version !== input.expectedVersion || Number(loaded.request.version) !== input.expectedRequestVersion) versionConflict();
        const entity = proposedEntity(loaded).payload as ProposalMetadata;
        return createDraft(actor, { vendorId: loaded.proposal.vendorId, vendorName: loaded.proposal.vendorName,
          name: entity.name, target: proposalTarget(loaded.proposal), idempotencyKey: input.idempotencyKey }, session, loaded);
      });
    },
    async changes(actor: PublicUser, proposalId: string, options: PaginationInput): Promise<ProposalPage<ProposalChange>> {
      await authorize(actor, "admin"); const loaded = await load(actor, "admin", proposalId, {});
      const original = await readResources(proposalId, loaded.proposal.submitted!);
      const before = new Map(original.map((row) => [row.resourceId, row])); const after = new Map(loaded.resources.map((row) => [row.resourceId, row]));
      const changes: ProposalChange[] = [];
      for (const resourceId of new Set([...before.keys(), ...after.keys()])) {
        const old = before.get(resourceId) ?? null; const next = after.get(resourceId) ?? null;
        if (old?.digest === next?.digest) continue;
        changes.push({ resourceId, kind: (next ?? old)!.kind, change: !old ? "added" : !next ? "removed" : "changed", before: old, after: next,
          fields: changedFields(old?.payload, next?.payload) });
      }
      changes.sort((a, b) => a.resourceId.localeCompare(b.resourceId));
      return page(changes.slice(options.offset, options.offset + options.limit), changes.length, options);
    },
    async decide(actor: PublicUser, proposalId: string, input: ProposalDecisionInput): Promise<ProposalDecisionResult> {
      checkKey(input.idempotencyKey); const reason = input.reason?.normalize("NFKC").trim() || null;
      if (input.decision === "reject" && !reason) throw new ApiError(400, "VALIDATION_ERROR", "A rejection reason is required.");
      if (reason && reason.length > 1000) throw new ApiError(400, "VALIDATION_ERROR", "The reason must be at most 1,000 characters.");
      const fingerprint = createKnowledgeContentDigest({ kind: "configuration_proposal", proposalId, decision: input.decision,
        expectedVersion: input.expectedVersion, expectedRequestVersion: input.expectedRequestVersion, reason });
      return transaction(async (session) => {
        await authorize(actor, "admin", session, true); const loaded = await load(actor, "admin", proposalId, {}, session);
        if (loaded.request?.decisionIdempotencyKey === input.idempotencyKey) {
          if (loaded.request.decisionFingerprint !== fingerprint) keyConflict();
          if (!loaded.proposal.decisionResult) throw new ApiError(409, "PROPOSAL_NOT_RESOLVABLE", "The stored decision could not be resolved.");
          return loaded.proposal.decisionResult;
        }
        assertEditable(loaded, "admin", input); checkBounds(loaded.resources);
        const timestamp = now();
        const published = input.decision === "approve" ? await publishProposalSnapshot({ snapshot: publicationSnapshot(loaded),
          actorId: actor.id, session, occurredAt: timestamp, audit: dependencies.audit, createId }) : null;
        const status = input.decision === "approve" ? "fulfilled" : "rejected";
        const result: ProposalDecisionResult = { proposalId, requestId: loaded.proposal.requestId!, status,
          version: loaded.proposal.version + 1, requestVersion: Number(loaded.request!.version) + 1,
          submittedDigest: loaded.proposal.submitted!.digest, approvedDigest: published ? loaded.head.digest : null, reason, published };
        const updated = await VendorBasketRequestModel.updateOne({ _id: loaded.proposal.requestId, kind: "configuration_proposal", proposalId,
          status: "pending", version: input.expectedRequestVersion }, { $set: { status, reason, basketId: published?.basketId ?? null,
          subBasketId: isSubTarget(loaded.proposal) ? published?.subBasketIds[0] ?? null : null,
          decidedAt: timestamp, decidedById: actor.id, decisionIdempotencyKey: input.idempotencyKey, decisionFingerprint: fingerprint }, $inc: { version: 1 } }, { session }).exec();
        if (updated.modifiedCount !== 1) versionConflict();
        const proposalUpdate = await VendorBasketProposalModel.updateOne({ _id: proposalId, version: input.expectedVersion },
          { $set: { approved: published ? loaded.head : null, decisionResult: result, updatedAt: timestamp }, $inc: { version: 1 } }, { session }).exec();
        if (proposalUpdate.modifiedCount !== 1) versionConflict();
        await audit(actor, { ...loaded.proposal, version: result.version }, "decided", session,
          { status, submittedDigest: result.submittedDigest, approvedDigest: result.approvedDigest, requestVersion: result.requestVersion, basketId: published?.basketId ?? null });
        return result;
      });
    },
    async references(actor: PublicUser, scope: ProposalScope, options: ReferenceOptions): Promise<ProposalPage<Row>> {
      await authorize(actor, scope);
      return referencePage(options);
    }
  };
}

async function authorize(actor: PublicUser, scope: ProposalScope, session?: ClientSession, mutation = false): Promise<void> {
  if (scope === "admin") {
    if (mutation) await aiEstimatorKnowledgeActorGuard.requireMutationActor(actor, session!);
    else await aiEstimatorKnowledgeActorGuard.requireReadActor(actor, session);
  } else {
    if (actor.role !== "procurement") forbidden();
    const authorized = mutation ? await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session!)
      : await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor, session);
    if (authorized.role !== "procurement") forbidden();
  }
}
async function load(actor: PublicUser, scope: ProposalScope, proposalId: string, options: ReadOptions, session?: ClientSession): Promise<Loaded> {
  const query = VendorBasketProposalModel.findOne({ _id: proposalId, ...(scope === "procurement" ? { requesterId: actor.id } : { requestId: { $ne: null } }) });
  if (session) query.session(session);
  const proposal = await query.lean().exec() as StoredProposal | null; if (!proposal) notFound();
  const requestQuery = proposal.requestId ? VendorBasketRequestModel.findById(proposal.requestId) : null;
  if (session && requestQuery) requestQuery.session(session);
  const request = requestQuery ? await requestQuery.lean().exec() as Row | null : null;
  if (proposal.requestId && (!request || request.proposalId !== proposalId || request.kind !== "configuration_proposal")) corrupt();
  const head = selectedHead(proposal, request, scope, options.snapshot ?? "current");
  return { proposal, request, head, resources: await readResources(proposalId, head, session) };
}
function selectedHead(proposal: StoredProposal, request: Row | null, scope: ProposalScope, snapshot: ProposalSnapshot): Manifest {
  if (snapshot === "submitted") { if (!proposal.submitted) notFound(); return proposal.submitted; }
  if (snapshot === "approved") { if (!proposal.approved || request?.status !== "fulfilled") notFound(); return proposal.approved; }
  if (!request) return proposal.working;
  if (request.status === "fulfilled") { if (!proposal.approved) corrupt(); return proposal.approved; }
  if (scope === "admin") { if (!proposal.review) corrupt(); return proposal.review; }
  if (!proposal.submitted) corrupt(); return proposal.submitted;
}
async function readResources(proposalId: string, head: Manifest, session?: ClientSession): Promise<ProposalResource[]> {
  if (!Array.isArray(head.resources)) corrupt();
  const query = VendorBasketProposalResourceModel.find({ proposalId, $or: head.resources.map((ref) => ({ resourceId: ref.id, resourceVersion: ref.version })) });
  if (session) query.session(session);
  const rows = await query.lean().exec();
  const resources: ProposalResource[] = rows.map((row) => enrichResource({ proposalId, resourceId: String(row.resourceId), kind: row.kind,
    parentId: row.parentId ?? null, version: row.resourceVersion, payload: row.payload, digest: row.digest,
    headId: head.id, savedById: row.savedById, savedAt: new Date(row.savedAt).toISOString() }));
  if (resources.length !== head.resources.length || resources.some((row) => {
    const ref = head.resources.find((entry) => entry.id === row.resourceId && entry.version === row.version);
    return !ref || row.digest !== ref.digest || row.digest !== createKnowledgeContentDigest(row.payload);
  }) || manifest(head.id, head.version, resources).digest !== head.digest) corrupt();
  return resources;
}
function manifest(id: string, version: number, resources: ProposalResource[]): Manifest {
  const refs = resources.map((row) => ({ id: row.resourceId, kind: row.kind, parentId: row.parentId, version: row.version, digest: row.digest, bytes: Buffer.byteLength(JSON.stringify(row.payload), "utf8") }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { id, version, digest: createKnowledgeContentDigest(refs), resources: refs };
}
async function readBasketResource(proposalId: string, basketId: string, head: Manifest): Promise<ProposalResource> {
  if (createKnowledgeContentDigest(head.resources) !== head.digest) corrupt();
  const ref = head.resources.find((entry) => entry.id === basketId && entry.kind === "basket");
  if (!ref) corrupt();
  const row = await VendorBasketProposalResourceModel.findOne({ proposalId, resourceId: basketId, resourceVersion: ref.version }).lean().exec();
  if (!row || row.digest !== ref.digest || createKnowledgeContentDigest(row.payload) !== ref.digest) corrupt();
  return { proposalId, resourceId: basketId, kind: "basket", parentId: null, version: ref.version, headId: head.id,
    payload: row.payload, digest: row.digest, savedById: row.savedById, savedAt: new Date(row.savedAt).toISOString() };
}
function publicHead(head: Manifest): ProposalHead { return { id: head.id, version: head.version, digest: head.digest }; }
function intakeContent(loaded: Loaded): ProposalIntakeContent {
  const basket = requireResource(loaded, loaded.proposal.basketId, "basket").payload as ProposalMetadata;
  const sub = loaded.resources.find((resource) => resource.kind === "sub_basket")?.payload as ProposalMetadata | undefined;
  if (!sub) corrupt();
  return { ...(isSubTarget(loaded.proposal) ? {} : { basket: { name: basket.name, description: basket.description } }),
    subBasket: { name: sub.name, description: sub.description },
    mainLines: loaded.resources.filter((resource) => resource.kind === "main_line")
      .sort((a, b) => (a.payload as ProposalMetadata).displayOrder - (b.payload as ProposalMetadata).displayOrder || a.resourceId.localeCompare(b.resourceId))
      .map((resource) => ({ resourceId: resource.resourceId, name: (resource.payload as ProposalMetadata).name })) };
}

function invalidIntake(): never { throw new ApiError(400, "VALIDATION_ERROR", "Provide only the requested basket metadata and Main Line names."); }
function intakeObject(value: unknown, keys: string[]): Row {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalidIntake();
  return value as Row;
}
function normalizeIntake(value: unknown, target: ProposalTarget, creating = false): ProposalIntakeContent {
  const content = intakeObject(value, ["basket", "subBasket", "mainLines"]);
  const metadata = (value: unknown) => {
    const row = intakeObject(value, ["name", "description"]);
    return { name: cleanName(row.name as string), description: cleanDescription(row.description as string | null)?.trim() ?? null };
  };
  if (target.kind === "new_sub_basket" ? content.basket !== undefined : content.basket === undefined) invalidIntake();
  if (!Array.isArray(content.mainLines) || content.mainLines.length > PROPOSAL_LIMITS.mainLines) invalidIntake();
  const names = new Set<string>(); const ids = new Set<string>();
  const mainLines = content.mainLines.map((value) => {
    const line = intakeObject(value, ["resourceId", "name"]); const name = cleanName(line.name as string);
    if (line.resourceId !== undefined && (creating || typeof line.resourceId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/u.test(line.resourceId) || ids.has(line.resourceId))) invalidIntake();
    if (names.has(normalizeKnowledgeIdentity(name))) throw new ApiError(409, "DUPLICATE_NAME", "Use a unique name for each Main Line.");
    names.add(normalizeKnowledgeIdentity(name));
    if (typeof line.resourceId === "string") ids.add(line.resourceId);
    return { ...(typeof line.resourceId === "string" ? { resourceId: line.resourceId } : {}), name };
  });
  return { ...(target.kind === "new_main_basket" ? { basket: metadata(content.basket) } : {}), subBasket: metadata(content.subBasket), mainLines };
}
function summary(loaded: Loaded): ProposalSummary {
  const { proposal: p, request, resources } = loaded;
  return { id: p._id, kind: "configuration_proposal", requestMode: p.requestMode ?? "full_configuration", schemaVersion: 1, requesterId: p.requesterId,
    status: (request?.status ?? "draft") as ProposalStatus, version: p.version, requestId: p.requestId, requestVersion: numberOrNull(request?.version),
    vendorId: p.vendorId, vendorName: p.vendorName ?? null, basketId: p.basketId, target: proposalTarget(p), targetParentName: p.targetParentName ?? null,
    name: (proposedEntity(loaded).payload as ProposalMetadata).name, counts: counts(resources),
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), submittedAt: p.submittedAt?.toISOString() ?? null,
    decidedAt: request?.decidedAt ? new Date(String(request.decidedAt)).toISOString() : null,
    reason: typeof request?.reason === "string" ? request.reason : null, revisedFromId: p.revisedFromId,
    publishedBasketId: typeof request?.basketId === "string" ? request.basketId : null };
}
function detail(loaded: Loaded, scope: ProposalScope, snapshot: ProposalSnapshot = "current"): ProposalDetail {
  const status = loaded.request?.status ?? "draft"; const current = snapshot === "current";
  const editable = current && (scope === "admin" ? status === "pending" : status === "draft");
  const parentEditable = editable && !isSubTarget(loaded.proposal);
  return { ...summary(loaded), capabilities: { edit: editable,
    submit: current && scope === "procurement" && status === "draft", review: scope === "admin", decide: current && scope === "admin" && status === "pending",
    revise: scope === "procurement" && status === "rejected", editParent: parentEditable,
    editQuality: parentEditable && loaded.proposal.requestMode !== "hierarchy_intake", manageSubBaskets: parentEditable && loaded.proposal.requestMode !== "hierarchy_intake" }, head: publicHead(loaded.head),
    ...(loaded.proposal.requestMode === "hierarchy_intake" ? { intake: intakeContent(loaded) } : {}),
    submittedHead: loaded.proposal.submitted ? publicHead(loaded.proposal.submitted) : null,
    approvedHead: loaded.proposal.approved ? publicHead(loaded.proposal.approved) : null,
    basket: requireResource(loaded, loaded.proposal.basketId, "basket") as ProposalResource<ProposalMetadata>,
    qualityResourceId: loaded.resources.find((row) => row.kind === "quality")?.resourceId ?? null };
}
function hierarchyNode(loaded: Loaded, row: ProposalResource, scope: ProposalScope): ProposalHierarchyNode {
  const node: ProposalHierarchyNode = { ...row, payload: row.payload as ProposalMetadata, sections: {} };
  if (row.kind !== "main_line") return node;
  const sections = loaded.resources.filter((entry) => entry.kind === "section" && entry.parentId === row.resourceId &&
    (scope === "admin" || (entry.payload as ProposalSectionValue).sectionKey !== "design"));
  for (const section of sections) node.sections[(section.payload as ProposalSectionValue).sectionKey] = section.resourceId;
  const overview = (sections.find((entry) => (entry.payload as ProposalSectionValue).sectionKey === "overview")?.payload as ProposalSectionValue | undefined)?.payload ?? {};
  const quality = loaded.resources.find((entry) => entry.kind === "quality")?.payload as { parameters: unknown[] } | undefined;
  const completeness = deriveKnowledgeCompleteness({ identity: { basketId: loaded.proposal.basketId, mainLineId: row.resourceId,
    uomId: typeof overview.uomId === "string" ? overview.uomId : null }, sections: sections.map((section) => {
      const value = section.payload as ProposalSectionValue;
      return value.sectionKey === "quality" && quality?.parameters.length ? { sectionKey: "quality", applicability: "configured", payload: quality }
        : { ...value, validationFindings: validateKnowledgeSectionPayload(value.sectionKey, value.payload).map((finding) => ({ code: finding.code, message: finding.message, blocking: true })) };
    }) });
  node.completeness = completeness;
  const basket = requireResource(loaded, loaded.proposal.basketId).payload as ProposalMetadata;
  const parent = loaded.resources.find((entry) => entry.resourceId === row.parentId)?.payload as ProposalMetadata | undefined;
  const revisionId = `${loaded.head.id}:${row.resourceId}`;
  const editable = detail(loaded, scope).capabilities.edit;
  const metadata = { version: loaded.proposal.version, createdById: loaded.proposal.requesterId, updatedById: row.savedById,
    createdAt: loaded.proposal.createdAt.toISOString(), updatedAt: row.savedAt };
  node.editorItem = { ...metadata, id: row.resourceId, itemType: "main_line", estimationVisibility: "internal", completionRequired: false,
    basketId: loaded.proposal.basketId, basketName: basket.name, subBasketId: row.parentId, subBasketName: parent?.name ?? null,
    mainLineId: row.resourceId, mainLineName: node.payload.name, description: node.payload.description, status: "draft",
    activeRevisionId: null, draftRevisionId: revisionId, revisionNumber: 1,
    uomId: typeof overview.uomId === "string" ? overview.uomId : null, priorityId: typeof overview.priorityId === "string" ? overview.priorityId : null,
    modeIds: strings(overview.modeIds), surfaceIds: strings(overview.surfaceIds), vendorIds: [], completeness,
    allowedActions: editable ? ["edit"] : [], activeRevision: null,
    draftRevision: { ...metadata, id: revisionId, mainLineId: row.resourceId, revisionNumber: 1, status: "draft", sourceRevisionId: null,
      contentDigest: loaded.head.digest, completeness, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null },
    blockers: completeness.blockers, warnings: completeness.warnings };
  return node;
}
function publicationSnapshot(loaded: Loaded): ProposalPublicationSnapshot {
  return { proposalId: loaded.proposal._id, requestMode: loaded.proposal.requestMode ?? "full_configuration", target: proposalTarget(loaded.proposal), basket: requireResource(loaded, loaded.proposal.basketId, "basket") as ProposalResource<ProposalMetadata>,
    subBaskets: loaded.resources.filter((row) => row.kind === "sub_basket") as ProposalResource<ProposalMetadata>[],
    mainLines: loaded.resources.filter((row) => row.kind === "main_line") as ProposalResource<ProposalMetadata>[],
    sections: loaded.resources.filter((row) => row.kind === "section") as ProposalResource<ProposalSectionValue>[],
    ...(proposalMasters(loaded.resources).length ? { masters: proposalMasters(loaded.resources) } : {}),
    quality: (loaded.resources.find((row) => row.kind === "quality") ?? null) as ProposalPublicationSnapshot["quality"] };
}
function assertEditable(loaded: Loaded, scope: ProposalScope, input: ProposalVersionInput): void {
  if (loaded.proposal.version !== input.expectedVersion) versionConflict();
  if (scope === "procurement") { if (loaded.request) throw new ApiError(409, "PROPOSAL_SUBMITTED", "Submitted proposals cannot be edited. Create a revision after rejection."); }
  else if (loaded.request?.status !== "pending" || Number(loaded.request.version) !== input.expectedRequestVersion) versionConflict();
}
async function advanceRequest(loaded: Loaded, expectedVersion: number, session: ClientSession): Promise<void> {
  const result = await VendorBasketRequestModel.updateOne({ _id: loaded.proposal.requestId, status: "pending", version: expectedVersion }, { $inc: { version: 1 } }, { session }).exec();
  if (result.modifiedCount !== 1) versionConflict();
}
function requireResource(loaded: Loaded, resourceId: string, kind?: ProposalResourceKind): ProposalResource {
  const resource = loaded.resources.find((row) => row.resourceId === resourceId && (!kind || row.kind === kind));
  if (!resource) notFound(); return resource;
}
function counts(resources: ProposalResource[]) { return { subBaskets: resources.filter((row) => row.kind === "sub_basket").length,
  mainLines: resources.filter((row) => row.kind === "main_line").length }; }
function checkBounds(resources: ProposalResource[]): void {
  const count = counts(resources); const bytes = resources.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.payload), "utf8"), 0);
  if (resources.filter((row) => row.kind === "uom").length > PROPOSAL_LIMITS.uoms || resources.filter((row) => row.kind === "surface").length > PROPOSAL_LIMITS.surfaces) {
    throw new ApiError(413, "PROPOSAL_LIMIT_EXCEEDED", "A proposal supports at most 100 proposed UOMs and 100 proposed surfaces.");
  }
  if (count.subBaskets > PROPOSAL_LIMITS.subBaskets || count.mainLines > PROPOSAL_LIMITS.mainLines || bytes > PROPOSAL_LIMITS.snapshotBytes) {
    throw new ApiError(413, "PROPOSAL_LIMIT_EXCEEDED", "A proposal supports up to 50 Sub-Baskets, 100 Main Lines and 8 MiB of saved content.");
  }
  let prices = 0;
  for (const row of resources.filter((entry) => entry.kind === "section")) {
    const value = row.payload as ProposalSectionValue;
    if (value.sectionKey !== "pricing") continue;
    const linePrices = Array.isArray(value.payload.priceEntries) ? value.payload.priceEntries.length : 0;
    prices += linePrices;
    if (linePrices > PROPOSAL_LIMITS.pricesPerLine) throw new ApiError(413, "PROPOSAL_PRICE_LIMIT", "A Main Line supports at most 100 price records.");
  }
  if (prices > PROPOSAL_LIMITS.prices) throw new ApiError(413, "PROPOSAL_PRICE_LIMIT", "A proposal supports at most 2,000 price records.");
}
async function referencePage(options: ReferenceOptions): Promise<ProposalPage<Row>> {
  const models = { uoms: AiEstimatorKnowledgeUomModel, taxes: AiEstimatorKnowledgeTaxRuleModel, modes: AiEstimatorKnowledgeModeModel,
    surfaces: AiEstimatorKnowledgeSurfaceModel, priorities: AiEstimatorKnowledgePriorityModel,
    "quality-frequencies": AiEstimatorKnowledgeQualityControlOptionModel, "quality-performers": AiEstimatorKnowledgeQualityControlOptionModel,
    baskets: AiEstimatorKnowledgeBasketModel, "sub-baskets": AiEstimatorKnowledgeSubBasketModel, "main-lines": AiEstimatorKnowledgeMainLineModel };
  const model = models[options.kind]; if (!model) throw new ApiError(400, "VALIDATION_ERROR", "Select a supported reference kind.");
  const quality = options.kind.startsWith("quality-");
  const filter: Row = quality ? { kind: options.kind === "quality-frequencies" ? "frequency" : "performer" }
    : options.kind === "sub-baskets" ? {} : { status: options.kind === "main-lines" || options.ids?.length ? { $ne: "archived" } : "active" };
  if (options.ids?.length) filter._id = { $in: options.ids };
  if (options.kind === "sub-baskets" || options.kind === "main-lines") {
    const baskets = await AiEstimatorKnowledgeBasketModel.find({ status: options.ids?.length ? { $ne: "archived" } : "active" }).select({ _id: 1 }).lean().exec();
    filter.basketId = { $in: baskets.map((basket) => basket._id) };
  }
  const [rows, total] = await Promise.all([model.find(filter).sort({ displayOrder: 1, _id: 1 }).skip(options.offset).limit(options.limit).lean().exec(), model.countDocuments(filter).exec()]);
  if (options.kind === "main-lines") {
    const items = await Promise.all(rows.map(async (row) => {
      const { vendorIds: _vendorIds, ...item } = await loadKnowledgeItemDetailForProposalReference(String(row._id));
      return { ...item, allowedActions: [] };
    }));
    return page(items, total, options);
  }
  const allowed = ["name", "code", "description", "displayOrder", "status", "version", "decimalScale", "semanticTier", "kind", "basketId", "subBasketId", "itemType",
    "modeKind", "executionSource", "fields", "createdById", "updatedById", "createdAt", "updatedAt"];
  const items = rows.map((row) => Object.fromEntries([["id", String(row._id)], ...allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key] instanceof Date ? row[key].toISOString() : row[key]])]));
  if (["uoms", "taxes", "modes", "surfaces", "priorities"].includes(options.kind)) for (const item of items) item.masterType = options.kind;
  if (options.kind === "taxes" && items.length) {
    const versions = await AiEstimatorKnowledgeTaxVersionModel.find({ taxRuleId: { $in: items.map((row) => row.id) }, status: "active" }).lean().exec();
    for (const item of items) item.taxVersions = versions.filter((row) => row.taxRuleId === item.id).map((row) => ({ id: String(row._id), taxRuleId: row.taxRuleId,
      versionNumber: row.versionNumber, rateBps: row.rateBps, treatment: row.treatment, applicability: row.applicability,
      effectiveFrom: new Date(row.effectiveFrom).toISOString(), effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).toISOString() : null,
      status: row.status, version: row.version }));
  }
  return page(items, total, options);
}
function page<T>(items: T[], total: number, options: PaginationInput): ProposalPage<T> { return { items, pagination: { total, limit: options.limit, offset: options.offset, hasMore: options.offset + items.length < total } }; }
function cleanName(value: string): string { const name = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
  if (!name || name.length > 240) throw new ApiError(400, "VALIDATION_ERROR", "Enter a name of at most 240 characters."); return name; }
function cleanDescription(value: string | null): string | null { if (value !== null && (typeof value !== "string" || value.length > 4000)) throw new ApiError(400, "VALIDATION_ERROR", "Description must be at most 4,000 characters."); return value; }
function checkedOrder(value: number): number { if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(400, "VALIDATION_ERROR", "Display order must be a nonnegative safe integer."); return value; }
function checkKey(key: string): void { if (!/^[A-Za-z0-9_-]{8,128}$/u.test(key)) throw new ApiError(400, "VALIDATION_ERROR", "Use a valid request key."); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" ? value : null; }
function duplicate(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }
function notFound(): never { throw new ApiError(404, "NOT_FOUND", "The proposal resource was not found."); }
function forbidden(): never { throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."); }
function corrupt(): never { throw new ApiError(409, "PROPOSAL_NOT_RESOLVABLE", "The saved proposal snapshot could not be resolved."); }
function versionConflict(): never { throw new ApiError(409, "VERSION_CONFLICT", "The proposal has changed. Refresh before saving or deciding."); }
function keyConflict(): never { throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This request key was already used with different values."); }
function remapResourcePayload(resource: ProposalResource, remap: Map<string, string>): unknown {
  const value = structuredClone(resource.payload);
  for (const { row, key } of [...proposalIdentityFields({ ...resource, payload: value }), ...proposalMasterReferenceFields({ ...resource, payload: value })]) {
    const previous = row[key] as string;
    row[key] = remap.get(previous) ?? previous;
  }
  if (resource.kind === "uom" || resource.kind === "surface") {
    const master = value as ProposalMasterResource["payload"];
    return normalizeProposalMaster(resource.kind === "uom" ? "uoms" : "surfaces", remap.get(resource.resourceId)!, { ...master, expectedVersion: 1 });
  }
  return value;
}
function proposalIdentityFields(resource: ProposalResource): Array<{ row: Row; key: string }> {
  if (resource.kind !== "section") return [];
  const section = resource.payload as ProposalSectionValue;
  // Only these canonical row fields reference proposal-owned identities.
  // Catalog ID arrays, section-local row/step IDs and user text stay unchanged.
  const references: Partial<Record<KnowledgeSectionKey, { rows: string; keys: string[] }>> = {
    pricing: { rows: "priceEntries", keys: ["priceEntryId"] },
    scope: { rows: "exclusions", keys: ["targetBasketId", "targetMainLineId"] },
    recommendations: { rows: "budgetAlterations", keys: ["targetBasketId", "targetSubBasketId", "targetMainLineId"] },
    advanced: { rows: "dependencies", keys: ["targetBasketId", "targetMainLineId"] }
  };
  const reference = references[section.sectionKey];
  const rows = reference && section.payload[reference.rows];
  const result = reference && Array.isArray(rows)
    ? rows.flatMap((row: Row) => reference.keys.filter((key) => typeof row[key] === "string").map((key) => ({ row, key }))) : [];
  if (section.sectionKey === "advanced" && Array.isArray(section.payload.inHouseComponents)) {
    for (const component of section.payload.inHouseComponents) {
      if (!component || typeof component !== "object" || Array.isArray(component)) continue;
      for (const key of ["basketId", "subBasketId"]) if (typeof component[key] === "string") result.push({ row: component, key });
    }
  }
  return result;
}
function changedFields(before: unknown, after: unknown): string[] {
  const old = before && typeof before === "object" ? before as Row : {}; const next = after && typeof after === "object" ? after as Row : {};
  return [...new Set([...Object.keys(old), ...Object.keys(next)])].filter((key) => createKnowledgeContentDigest(old[key] ?? null) !== createKnowledgeContentDigest(next[key] ?? null)).sort();
}
function resourceChanges(before: Manifest, after: Manifest): Array<{ resourceId: string; previousVersion: number | null; version: number | null }> {
  const old = new Map(before.resources.map((ref) => [ref.id, ref])); const next = new Map(after.resources.map((ref) => [ref.id, ref]));
  return [...new Set([...old.keys(), ...next.keys()])].filter((id) => old.get(id)?.version !== next.get(id)?.version)
    .map((id) => ({ resourceId: id, previousVersion: old.get(id)?.version ?? null, version: next.get(id)?.version ?? null }));
}
function enrichResource(resource: ProposalResource): ProposalResource {
  const value = resource.payload as ProposalSectionValue;
  if (resource.kind === "section" && value.sectionKey === "pricing") return { ...resource,
    editorPayload: projectProposalPricingPayload(value.payload, resource.parentId!, `${resource.headId}:${resource.parentId}`, resource.version) };
  return resource;
}

function isSubTarget(proposal: StoredProposal): boolean { return proposal.targetKind === "new_sub_basket"; }
function proposalTarget(proposal: StoredProposal): ProposalTarget {
  if (!isSubTarget(proposal)) return { kind: "new_main_basket" };
  if (!proposal.targetParentBasketId || proposal.targetParentBasketId !== proposal.basketId) corrupt();
  return { kind: "new_sub_basket", basketId: proposal.targetParentBasketId };
}
function normalizeTarget(target?: ProposalTarget): ProposalTarget {
  if (target === undefined) return { kind: "new_main_basket" };
  if (!target || typeof target !== "object") throw new ApiError(400, "VALIDATION_ERROR", "Select a valid Main Basket target.");
  if (target.kind === "new_main_basket") return { kind: "new_main_basket" };
  if (target.kind !== "new_sub_basket" || typeof target.basketId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/u.test(target.basketId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Select a valid Main Basket target.");
  }
  return { kind: "new_sub_basket", basketId: target.basketId };
}
function proposedEntity(loaded: Loaded): ProposalResource {
  if (!isSubTarget(loaded.proposal)) return requireResource(loaded, loaded.proposal.basketId, "basket");
  const subs = loaded.resources.filter((resource) => resource.kind === "sub_basket");
  if (subs.length !== 1) corrupt();
  return subs[0]!;
}
function parentReadOnly(): never {
  throw new ApiError(409, "PROPOSAL_PARENT_READ_ONLY", "The existing Main Basket and its shared Quality Parameters are read-only. Edit the proposed Sub-Basket and its Main Lines only.");
}
