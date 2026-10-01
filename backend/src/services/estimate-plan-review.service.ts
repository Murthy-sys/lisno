import { loadPublishedPlanDocuments } from "./estimate-plan-document-publication.js";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import mongoose from "mongoose";
import sharp from "sharp";

import { annotationDocumentSchema, type AnnotationDocumentV1 } from "../domain/estimate-design.js";
import { normalizeEmail } from "../domain/email.js";
import { buildEstimatePlanDocumentManifest, hashPlanDocumentManifest, planDocumentContentRect, resolveDrawingPlacement } from "../domain/estimate-plan-document.js";
import { loadEstimatePlanDocumentLineage, loadEstimatePlanDocumentManifest, renderEstimatePlanManifestPage } from "./estimate-plan-document-manifest.js";
import { derivePlanRequestStatus, detectAnnotationTargets, projectAnnotationToCrop } from "../domain/estimate-plan-review.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateDesignPlanDocumentModel } from "../models/EstimateDesignPlanDocument.js";
import type { PlanDocumentManifest } from "../contracts/estimate-plan-document.js";
import { EstimateDesignAnnotationDraftModel } from "../models/EstimateDesignAnnotationDraft.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import { EstimatePlanAnnotationDraftModel } from "../models/EstimatePlanAnnotationDraft.js";
import { EstimatePlanChangeRequestModel } from "../models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../models/EstimatePlanPageRevision.js";
import { UserModel } from "../models/User.js";
import type { Storage } from "../storage/storage.js";
import type { PublicUser as AuthenticatedUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import { synchronizeEstimateDesignReviewState } from "./estimate-design-review-state.js";
import type { EstimateDesignService } from "./estimate-design.service.js";
import type { ProjectWorkflowService } from "./project-workflow.service.js";

type ClientDesignAccess = Pick<EstimateDesignService, "listClient">;
type PlanAudit = Pick<AuditService, "appendInMongoTransaction">;

export interface CreateEstimatePlanReviewServiceInput {
  estimateDesigns: ClientDesignAccess;
  storage: Storage;
  audit: PlanAudit;
  now?: () => Date;
  projectWorkflow?: Pick<ProjectWorkflowService, "recordClientDrawingDecision">;
}

export interface SavePlanDraftInput {
  version: number;
  annotations: AnnotationDocumentV1;
  reviewRoundId?: string;
}

export interface SubmitPlanRequestInput {
  version: number;
  summary: string;
  annotations: AnnotationDocumentV1;
  targetDrawingIds: string[];
  snapshotToken: string;
  idempotencyKey: string;
  reviewRoundId?: string;
}

export interface UpdateClientPlanRequestInput {
  version: number;
  summary: string;
  annotations: AnnotationDocumentV1;
}

export interface UpdatePlanTargetsInput {
  version: number;
  targetDrawingIds: string[];
}

export interface ResolvePlanPageInput {
  version: number;
  note: string;
}

function conflict(message: string) {
  return new ApiError(409, "PLAN_REVIEW_CONFLICT", message);
}

function alreadyOpen(requestId?: string) {
  return new ApiError(
    409,
    "PLAN_REQUEST_ALREADY_OPEN",
    "A change request is already open for this design page.",
    requestId ? { requestId } : undefined
  );
}

function notFound() {
  return new ApiError(404, "ESTIMATE_NOT_FOUND", "The estimate plan was not found.");
}

function dtoId(value: unknown) {
  return String(value);
}

export async function advancePlanPageForDrawingRevision(
  revisionId: string,
  createdBy: string,
  session: mongoose.ClientSession
) {
  const replacement = await EstimateDesignRevisionModel.findById(revisionId).session(session).lean();
  if (!replacement) throw new ApiError(404, "DESIGN_REVISION_NOT_FOUND", "The drawing revision was not found.");
  const drawing = await EstimateDesignDrawingModel.findById(replacement.drawingId).session(session).lean();
  if (!drawing) throw new ApiError(404, "DESIGN_DRAWING_NOT_FOUND", "The drawing was not found.");
  const lineage = await loadEstimatePlanDocumentLineage(dtoId(drawing.estimateId), session);
  const placement = resolveDrawingPlacement(lineage, drawing, revisionId);
  const current = await advancePlanPageForDrawingRevisions({
    estimateId: dtoId(drawing.estimateId), sourcePageId: dtoId(placement.originPage._id),
    replacements: [{ drawingId: dtoId(drawing._id), requestedRevisionId: dtoId(replacement.replacesRevisionId ?? revisionId), resultRevisionId: revisionId, crop: placement.patch.destination }],
    createdBy, session
  });

  const requests = await EstimatePlanChangeRequestModel.find({
    estimateId: drawing.estimateId,
    status: "open",
    targets: { $elemMatch: { drawingId: drawing._id, status: "open" } }
  }).session(session);
  for (const request of requests) {
    const target = request.targets.find((value: Record<string, any>) => dtoId(value.drawingId) === dtoId(drawing._id) && value.status === "open");
    if (!target) continue;
    target.status = "replacement_submitted";
    target.resolvedByRevisionId = revisionId;
    request.version += 1;
    await request.save({ session });
  }
  return current;
}

export async function advancePlanPageForDrawingRevisions(input: {
  estimateId: string;
  sourcePageId: string;
  replacements: Array<{
    drawingId: string;
    requestedRevisionId: string;
    resultRevisionId: string;
    crop: { x: number; y: number; width: number; height: number };
  }>;
  createdBy: string;
  session: mongoose.ClientSession;
}) {
  if (input.replacements.length === 0) throw new Error("At least one page replacement is required.");
  const replacementByDrawing = new Map(
    input.replacements.map((replacement) => [replacement.drawingId, replacement])
  );
  if (replacementByDrawing.size !== input.replacements.length) {
    throw new Error("Plan page replacements require unique drawing IDs.");
  }
  const manifest = await loadEstimatePlanDocumentManifest(input.estimateId, { session: input.session });
  const page = manifest.documents.flatMap((document) => document.pages).find((candidate) => candidate.sourcePageId === input.sourcePageId);
  if (!page) throw notFound();
  for (const replacement of input.replacements) {
    const patch = page.patches.find((candidate) => candidate.drawingId === replacement.drawingId);
    if (!patch || patch.revisionId !== replacement.resultRevisionId) {
      throw conflict("The replacement no longer belongs to this original plan page. Refresh and try again.");
    }
  }
  const current = await EstimatePlanPageRevisionModel.findOne({
    estimateId: input.estimateId, sourcePageId: input.sourcePageId
  }).sort({ revisionNumber: -1 }).session(input.session).lean();
  const patches = page.patches.map((patch, order) => ({
    drawingId: patch.drawingId, drawingRevisionId: patch.revisionId, crop: { ...patch.destination }, order
  }));
  if (current && JSON.stringify(current.patches) === JSON.stringify(patches)) return current;

  const [created] = await EstimatePlanPageRevisionModel.create([{
    _id: `plan-page-revision-${randomUUID()}`,
    estimateId: input.estimateId,
    sourcePageId: input.sourcePageId,
    revisionNumber: current ? Number(current.revisionNumber) + 1 : 1,
    basePageReference: page.basePageReference,
    status: "revised",
    patches,
    previousRevisionId: current?._id ?? null,
    createdBy: input.createdBy
  }], { session: input.session });
  return created!.toObject();
}

export async function ensureEstimatePlanReviewCollections() {
  await Promise.all([
    EstimatePlanPageRevisionModel.createCollection(),
    EstimatePlanChangeRequestModel.createCollection()
  ]);
}

export async function approvePlanTargetsForDrawingRevision(
  revisionId: string,
  session: mongoose.ClientSession
) {
  const requests = await EstimatePlanChangeRequestModel.find({
    status: "open",
    targets: { $elemMatch: { resolvedByRevisionId: revisionId, status: "replacement_submitted" } }
  }).session(session);
  for (const request of requests) {
    let changed = false;
    for (const target of request.targets) {
      if (dtoId(target.resolvedByRevisionId) === revisionId && target.status === "replacement_submitted") {
        target.status = "approved";
        changed = true;
      }
    }
    if (!changed) continue;
    request.version += 1;
    request.status = derivePlanRequestStatus(request.targets.map((target: Record<string, any>) => target.status), Boolean(request.unassigned), Boolean(request.unassignedResolved));
    await request.save({ session });
  }
}

export function createEstimatePlanReviewService(input: CreateEstimatePlanReviewServiceInput) {
  const now = input.now ?? (() => new Date());

  async function requireDesignPlanState(
    estimateId: string,
    mode: "visible" | "reviewable",
    session?: mongoose.ClientSession
  ) {
    const query = EstimateModel.findById(estimateId);
    if (session) query.session(session);
    const estimate = await query.lean();
    if (!estimate) throw notFound();
    const status = String(estimate.status);
    if (["sent_to_client", "client_changes_requested"].includes(status)) {
      return estimate;
    }
    const designPlanStatus = String(estimate.designPlanStatus);
    const allowed = status === "client_approved" && (
      designPlanStatus === "ready_for_client" ||
      (mode === "visible" && designPlanStatus === "approved")
    );
    if (!allowed) {
      throw new ApiError(
        409,
        "DESIGN_PLAN_NOT_REVIEWABLE",
        mode === "reviewable"
          ? "This Design plan is not awaiting Client review."
          : "The current Design plan has not been submitted to the Client."
      );
    }
    return estimate;
  }

  async function requirePage(
    user: AuthenticatedUser,
    pageId: string,
    mode: "visible" | "reviewable" = "visible"
  ) {
    const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
    if (!page) throw notFound();
    const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
    if (!upload || upload.deletedAt) throw notFound();
    await input.estimateDesigns.listClient(user, dtoId(upload.estimateId));
    await requireDesignPlanState(dtoId(upload.estimateId), mode);
    return { page, estimateId: dtoId(upload.estimateId) };
  }

  function requireStaffRole(user: AuthenticatedUser) {
    if (!["super_admin", "estimator_sales", "designer", "design_manager", "design_head"].includes(user.role)) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to plan change requests.");
    }
  }

  async function requireStaffEstimate(user: AuthenticatedUser, estimateId: string, session?: mongoose.ClientSession) {
    requireStaffRole(user);
    const query = EstimateModel.findById(estimateId);
    if (session) query.session(session);
    const estimate = await query.lean();
    if (!estimate) throw notFound();
    const postApprovalDesign = String(estimate.status) === "client_approved";
    const allowed = user.role === "super_admin" || (postApprovalDesign
      ? user.role === "designer" && dtoId(estimate.designPlanDesignerId) === user.id
      : user.role === "estimator_sales"
        ? dtoId(estimate.ownerId) === user.id
        : [estimate.assignedDesignerId, estimate.assignedManagerId]
            .filter(Boolean)
            .map(dtoId)
            .includes(user.id));
    if (!allowed) throw new ApiError(403, "FORBIDDEN", "You are not assigned to this estimate.");
    return estimate;
  }

  async function requireStaffRequest(user: AuthenticatedUser, requestId: string, session?: mongoose.ClientSession) {
    const query = EstimatePlanChangeRequestModel.findById(requestId);
    if (session) query.session(session);
    const request = await query;
    if (!request) throw new ApiError(404, "PLAN_REQUEST_NOT_FOUND", "The plan change request was not found.");
    await requireStaffEstimate(user, dtoId(request.estimateId), session);
    return request;
  }

  async function latestDrawingRows(estimateId: string, pageId: string, session?: mongoose.ClientSession) {
    const lineage = await loadEstimatePlanDocumentLineage(estimateId, session);
    const latest = new Map<string, Record<string, any>>();
    for (const revision of lineage.revisions) {
      const previous = latest.get(dtoId(revision.drawingId));
      if (!previous || Number(revision.revisionNumber) > Number(previous.revisionNumber)) latest.set(dtoId(revision.drawingId), revision);
    }
    const rows = [];
    for (const drawing of lineage.drawings) {
      if (!drawing.active || drawing.deletedAt) continue;
      const revision = latest.get(dtoId(drawing._id));
      if (!revision) continue;
      const placement = resolveDrawingPlacement(lineage, drawing, dtoId(revision._id));
      if (dtoId(placement.originPage._id) === pageId) rows.push({ drawing, revision, placementCrop: placement.patch.destination, annotationCrop: planDocumentContentRect(placement.patch) });
    }
    return rows;
  }

  function staleReviewRound(): never {
    throw new ApiError(409, "DESIGN_PLAN_REVISION_CONFLICT", "The submitted Design plan changed. Refresh the plan before adding feedback.");
  }

  async function requireReviewSnapshot(estimateId: string, pageId: string, reviewRoundId?: string, session?: mongoose.ClientSession) {
    const estimate = await requireDesignPlanState(estimateId, "reviewable", session);
    const rows = await latestDrawingRows(estimateId, pageId, session);
    if (estimate.status !== "client_approved") return { rows, reviewRoundId: null };
    if (!reviewRoundId) staleReviewRound();
    const round = await DesignPlanReviewRoundModel.findOne({
      estimateId, status: { $in: ["pending", "approved", "changes_requested"] }
    }).sort({ designPlanVersion: -1 }).session(session ?? null).lean();
    if (!round || dtoId(round._id) !== reviewRoundId || round.status !== "pending" ||
        Number(round.designPlanVersion) !== Number(estimate.designPlanVersion)) staleReviewRound();
    const documents: PlanDocumentManifest[] = [];
    if (round.planDocuments?.length) {
      for (const pin of round.planDocuments) {
        const artifact = await EstimateDesignPlanDocumentModel.findOne({
          _id: pin.documentId, estimateId, sourceUploadId: pin.sourceUploadId, manifestHash: pin.manifestHash, status: "ready"
        }).select("+manifest").session(session ?? null).lean();
        if (!artifact || hashPlanDocumentManifest(artifact.manifest) !== pin.manifestHash) staleReviewRound();
        documents.push(artifact.manifest);
      }
    } else {
      documents.push(...(await loadEstimatePlanDocumentManifest(estimateId, { session, revisionIds: round.submittedRevisionIds.map(String) })).documents);
    }
    const page = documents.flatMap((document) => document.pages).find((candidate) => candidate.sourcePageId === pageId);
    if (!page || page.patches.length !== rows.length || page.patches.some((patch) => {
      const current = rows.find((row) => dtoId(row.drawing._id) === patch.drawingId);
      return !current || dtoId(current.revision._id) !== patch.revisionId ||
        (["x", "y", "width", "height"] as const).some((key) => current.placementCrop[key] !== patch.destination[key]);
    })) staleReviewRound();
    if (session) {
      // Publication and replacement both write Estimate; this prevents a read-only
      // snapshot check from racing a new round while feedback writes elsewhere.
      const locked = await EstimateModel.updateOne({
        _id: estimateId, status: "client_approved", designPlanStatus: "ready_for_client", designPlanVersion: round.designPlanVersion
      }, { $inc: { designLifecycleVersion: 1 } }, { session });
      if (locked.modifiedCount !== 1) staleReviewRound();
    }
    return { rows, reviewRoundId: dtoId(round._id) };
  }

  function reviewSnapshotToken(pageId: string, revisionNumber: number, annotations: AnnotationDocumentV1, targetIds: string[], reviewRoundId: string | null) {
    return createHash("sha256").update(JSON.stringify({ pageId, revisionNumber, annotations, targets: targetIds, reviewRoundId })).digest("hex");
  }

  async function bootstrapPageRevision(estimateId: string, pageId: string) {
    const existing = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: pageId }).sort({ revisionNumber: -1 }).lean();
    if (existing) return existing;
    await ensureEstimatePlanReviewCollections();
    try {
      return await mongoose.connection.transaction(async (session) => {
        const current = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: pageId }).sort({ revisionNumber: -1 }).session(session).lean();
        if (current) return current;
        const page = await EstimateDesignSourcePageModel.findById(pageId).session(session).lean();
        if (!page) throw notFound();
        const rows = await latestDrawingRows(estimateId, pageId, session);
        const sorted = rows.slice().sort((left, right) =>
          Number(right.placementCrop.width) * Number(right.placementCrop.height) - Number(left.placementCrop.width) * Number(left.placementCrop.height) ||
          dtoId(left.drawing._id).localeCompare(dtoId(right.drawing._id))
        );
        const [created] = await EstimatePlanPageRevisionModel.create([{
          _id: `plan-page-revision-${randomUUID()}`,
          estimateId,
          sourcePageId: pageId,
          revisionNumber: 1,
          basePageReference: page.normalizedFileReference,
          status: "awaiting_review",
          patches: sorted.map((row, order) => ({
            drawingId: dtoId(row.drawing._id),
            drawingRevisionId: dtoId(row.revision._id),
            crop: { ...row.placementCrop },
            order
          })),
          previousRevisionId: null,
          createdBy: "system:plan-review"
        }], { session });
        return created!.toObject();
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const winner = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: pageId }).sort({ revisionNumber: -1 }).lean();
        if (winner) return winner;
      }
      throw error;
    }
  }

  async function pageRows(user: AuthenticatedUser, estimateId: string) {
    await input.estimateDesigns.listClient(user, estimateId);
    const estimate = await requireDesignPlanState(estimateId, "visible");
    const published = estimate.status === "client_approved" ? await loadPublishedPlanDocuments(user, estimateId) : null;
    const lineage = await loadEstimatePlanDocumentLineage(estimateId);
    const manifest = published ? { documents: published.documents.map((document) => document.manifest) } : buildEstimatePlanDocumentManifest(lineage);
    const uploadIds = new Set(manifest.documents.map((document) => document.sourceUploadId));
    const uploads = lineage.uploads.filter((upload) => uploadIds.has(dtoId(upload._id)));
    const sourcePages = new Map(lineage.pages.map((page) => [dtoId(page._id), page]));
    const pages = manifest.documents.flatMap((document) => document.pages.map((page) => sourcePages.get(page.sourcePageId)!));
    const rows = await Promise.all(pages.map(async (page) => ({ page, revision: await bootstrapPageRevision(estimateId, dtoId(page._id)) })));
    return { uploads, rows, published };
  }

  async function clientReaderId(user: AuthenticatedUser, estimateId: string) {
    if (user.role !== "super_admin") return user.id;
    const estimate = await EstimateModel.findById(estimateId).lean();
    if (!estimate) throw notFound();
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (!lead) throw notFound();
    const client = await UserModel.findOne({
      role: "client",
      active: true,
      emailNormalized: normalizeEmail(String(lead.clientEmail))
    }).lean();
    return client ? dtoId(client._id) : null;
  }

  async function preview(user: AuthenticatedUser, pageId: string, annotations: AnnotationDocumentV1, reviewRoundId?: string) {
    annotationDocumentSchema.parse(annotations);
    const { page, estimateId } = await requirePage(user, pageId, "reviewable");
    if (annotations.imageWidth !== Number(page.width) || annotations.imageHeight !== Number(page.height)) {
      throw new ApiError(400, "INVALID_ANNOTATIONS", "Annotation dimensions must match the source page.");
    }
    const snapshot = await requireReviewSnapshot(estimateId, pageId, reviewRoundId);
    const revision = await bootstrapPageRevision(estimateId, pageId);
    const rows = snapshot.rows;
    const matches = detectAnnotationTargets(annotations.elements, rows.map((row) => ({ drawingId: dtoId(row.drawing._id), crop: row.annotationCrop })), { width: Number(page.width), height: Number(page.height) });
    const titles = new Map(rows.map((row) => [dtoId(row.drawing._id), String(row.drawing.displayTitle)]));
    const targets = matches.map((match) => ({ ...match, title: titles.get(match.drawingId) ?? "Drawing" }));
    const snapshotToken = reviewSnapshotToken(pageId, Number(revision.revisionNumber), annotations, targets.map((target) => target.drawingId), snapshot.reviewRoundId);
    return { pageRevisionNumber: Number(revision.revisionNumber), targets, snapshotToken };
  }

  async function renderPageRevision(revision: Record<string, any>) {
    const lineage = await loadEstimatePlanDocumentLineage(dtoId(revision.estimateId));
    const page = lineage.pages.find((candidate) => dtoId(candidate._id) === dtoId(revision.sourcePageId));
    if (!page) throw notFound();
    const patches = revision.patches.map((patch: Record<string, any>) => {
      const drawing = lineage.drawings.find((candidate) => dtoId(candidate._id) === dtoId(patch.drawingId));
      if (!drawing) throw conflict("A drawing used by this plan revision no longer exists.");
      const placement = resolveDrawingPlacement(lineage, drawing, dtoId(patch.drawingRevisionId));
      if (dtoId(placement.originPage._id) !== dtoId(page._id)) throw conflict("A drawing does not belong to this original plan page.");
      return placement.patch;
    });
    return renderEstimatePlanManifestPage(input.storage, {
      sourcePageId: dtoId(page._id), pageNumber: Number(page.pageNumber), width: Number(page.width), height: Number(page.height),
      basePageReference: String(page.normalizedFileReference), patches
    });
  }

  async function advanceForDrawingRevision(revisionId: string, createdBy = "system:design-replacement") {
    const replacement = await EstimateDesignRevisionModel.findById(revisionId).lean();
    if (!replacement) throw new ApiError(404, "DESIGN_REVISION_NOT_FOUND", "The drawing revision was not found.");
    const drawing = await EstimateDesignDrawingModel.findById(replacement.drawingId).lean();
    if (!drawing) throw new ApiError(404, "DESIGN_DRAWING_NOT_FOUND", "The drawing was not found.");
    const estimateId = dtoId(drawing.estimateId);
    const lineage = await loadEstimatePlanDocumentLineage(estimateId);
    const placement = resolveDrawingPlacement(lineage, drawing, revisionId);
    const pageId = dtoId(placement.originPage._id);
    await bootstrapPageRevision(estimateId, pageId);

    try {
      return await mongoose.connection.transaction((session) =>
        advancePlanPageForDrawingRevision(revisionId, createdBy, session)
      );
    } catch (error: any) {
      if (error?.code === 11000) {
        const winner = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: pageId }).sort({ revisionNumber: -1 }).lean();
        const patch = winner?.patches.find((value: Record<string, any>) => dtoId(value.drawingId) === dtoId(drawing._id));
        if (winner && patch && dtoId(patch.drawingRevisionId) === revisionId) return winner;
      }
      throw error;
    }
  }

  return {
    async listStaff(user: AuthenticatedUser, filters: { estimateId?: string; status?: "open" | "resolved" }) {
      requireStaffRole(user);
      const legacyScope = user.role === "estimator_sales"
        ? { status: { $ne: "client_approved" }, ownerId: user.id }
        : {
            status: { $ne: "client_approved" },
            $or: [
              { assignedDesignerId: user.id },
              { assignedManagerId: user.id }
            ]
          };
      const estimateFilter = user.role === "super_admin"
        ? {}
        : {
            $or: [
              legacyScope,
              ...(user.role === "designer"
                ? [{ status: "client_approved", designPlanDesignerId: user.id }]
                : [])
            ]
          };
      const estimates = await EstimateModel.find(estimateFilter).select({ _id: 1 }).lean();
      const estimateIds = estimates.map((estimate) => dtoId(estimate._id));
      const query: Record<string, any> = { estimateId: filters.estimateId ? { $in: estimateIds.filter((id) => id === filters.estimateId) } : { $in: estimateIds } };
      if (filters.status) query.status = filters.status;
      const requests = await EstimatePlanChangeRequestModel.find(query).sort({ createdAt: 1, _id: 1 }).lean();
      return requests.map(requestQueueDto);
    },

    async getStaff(user: AuthenticatedUser, requestId: string) {
      const request = await requireStaffRequest(user, requestId);
      const drawings = (await latestDrawingRows(dtoId(request.estimateId), dtoId(request.sourcePageId))).map((row) => row.drawing);
      const requestTargetByDrawing = new Map<string, Record<string, any>>(
        request.targets.map((target: Record<string, any>) => [dtoId(target.drawingId), target])
      );
      const drawingCandidates = [];
      for (const drawing of drawings) {
        const latest = await EstimateDesignRevisionModel.findOne({ drawingId: drawing._id }).sort({ revisionNumber: -1 }).lean();
        if (!latest) continue;
        const target = requestTargetByDrawing.get(dtoId(drawing._id));
        drawingCandidates.push({
          drawingId: dtoId(drawing._id), title: String(drawing.displayTitle),
          latestRevisionId: dtoId(latest._id), latestRevisionNumber: Number(latest.revisionNumber),
          status: target ? String(target.status) : null
        });
      }
      return {
        ...requestDto(request.toObject()),
        currentImageUrl: `/estimate-plan-pages/${encodeURIComponent(dtoId(request.sourcePageId))}/current-image`,
        drawingTargets: drawingCandidates.filter((candidate) => candidate.status !== null),
        drawingCandidates
      };
    },

    async updateTargets(user: AuthenticatedUser, requestId: string, change: UpdatePlanTargetsInput) {
      const ids = [...new Set(change.targetDrawingIds)].sort();
      if (ids.length === 0 || ids.length > 50) throw new ApiError(400, "INVALID_PLAN_TARGETS", "Select one or more drawings.");
      return mongoose.connection.transaction(async (session) => {
        const request = await requireStaffRequest(user, requestId, session);
        if (request.version !== change.version || request.status !== "open") throw conflict("The plan request changed. Refresh and try again.");
        const drawings = (await latestDrawingRows(dtoId(request.estimateId), dtoId(request.sourcePageId), session)).filter((row) => ids.includes(dtoId(row.drawing._id))).map((row) => row.drawing);
        if (drawings.length !== ids.length) throw new ApiError(400, "INVALID_PLAN_TARGETS", "Every target must be an active drawing on this page.");
        const targets = [];
        for (const drawing of drawings.sort((left, right) => dtoId(left._id).localeCompare(dtoId(right._id)))) {
          const revision = await EstimateDesignRevisionModel.findOne({ drawingId: drawing._id }).sort({ revisionNumber: -1 }).session(session).lean();
          if (!revision) throw new ApiError(400, "INVALID_PLAN_TARGETS", "Every target must have a drawing revision.");
          targets.push({ drawingId: dtoId(drawing._id), requestedRevisionId: dtoId(revision._id), status: "open", resolvedByRevisionId: null });
        }
        request.set({ targets, unassigned: false, unassignedResolved: false, resolutionNote: null, status: "open", version: request.version + 1 });
        await request.save({ session });
        await input.audit.appendInMongoTransaction({ actorId: user.id, action: "estimate_plan_targets_linked", entityType: "estimate_plan_change_request", entityId: requestId, occurredAt: now().toISOString(), newValues: { estimateId: dtoId(request.estimateId), sourcePageId: dtoId(request.sourcePageId), drawingIds: ids } }, session);
        return requestDto(request.toObject());
      });
    },

    async resolvePage(user: AuthenticatedUser, requestId: string, change: ResolvePlanPageInput) {
      const note = change.note.trim();
      if (!note || note.length > 1_000) throw new ApiError(400, "INVALID_RESOLUTION_NOTE", "Add a resolution note of 1,000 characters or fewer.");
      return mongoose.connection.transaction(async (session) => {
        const request = await requireStaffRequest(user, requestId, session);
        if (request.version !== change.version || request.status !== "open") throw conflict("The plan request changed. Refresh and try again.");
        if (!request.unassigned) throw new ApiError(400, "PLAN_REQUEST_HAS_TARGETS", "Drawing-targeted feedback must be resolved through its drawing revisions.");
        request.set({ unassignedResolved: true, resolutionNote: note, status: "resolved", version: request.version + 1 });
        await request.save({ session });
        await input.audit.appendInMongoTransaction({ actorId: user.id, action: "estimate_plan_page_resolved", entityType: "estimate_plan_change_request", entityId: requestId, occurredAt: now().toISOString(), newValues: { estimateId: dtoId(request.estimateId), sourcePageId: dtoId(request.sourcePageId), noteLength: note.length } }, session);
        return requestDto(request.toObject());
      });
    },

    async listClient(user: AuthenticatedUser, estimateId: string) {
      const { uploads, rows, published } = await pageRows(user, estimateId);
      const clientId = await clientReaderId(user, estimateId);
      const drafts = clientId
        ? await EstimatePlanAnnotationDraftModel.find({ clientId, sourcePageId: { $in: rows.map((row) => row.page._id) }, reviewRoundId: published ? dtoId(published.round._id) : null }).lean()
        : [];
      const draftByPage = new Map(drafts.map((draft) => [dtoId(draft.sourcePageId), draft]));
      const requests = clientId
        ? await EstimatePlanChangeRequestModel.find({ clientId, estimateId, status: "open" }).sort({ createdAt: 1 }).lean()
        : [];
      const roundQuery = published ? `?roundId=${encodeURIComponent(String(published.round._id))}` : "";
      const pages = rows.map(({ page, revision }) => {
        const document = published?.documents.find((candidate) => candidate.manifest.pages.some((source) => source.sourcePageId === dtoId(page._id)));
        return ({
          id: dtoId(page._id), uploadId: dtoId(page.uploadId), pageNumber: Number(page.pageNumber),
          width: Number(page.width), height: Number(page.height), currentRevisionId: dtoId(revision._id),
          status: String(revision.status),
          thumbnailUrl: `/client/estimate-plan-pages/${encodeURIComponent(dtoId(page._id))}/thumbnail${roundQuery}`,
          currentImageUrl: `/client/estimate-plan-pages/${encodeURIComponent(dtoId(page._id))}/current-image${roundQuery}`,
          ...(published ? { reviewRoundId: String(published.round._id) } : {}),
          ...(document?.documentId ? { document: {
            sourceUploadId: document.manifest.sourceUploadId, originalFilename: document.manifest.originalFilename,
            documentId: document.documentId, manifestHash: document.manifestHash, status: "ready",
            pageCount: document.pageCount, failureCode: null, failureMessage: null,
            pdfUrl: `/client/estimates/${encodeURIComponent(estimateId)}/design-plan-documents/${encodeURIComponent(document.documentId)}/pdf${roundQuery}`
          } } : {}),
          annotationDraft: draftByPage.has(dtoId(page._id)) ? draftDto(draftByPage.get(dtoId(page._id))!) : null
        });
      });
      return {
        uploads: uploads.map((upload) => {
          const uploadPages = pages.filter((page) => page.uploadId === dtoId(upload._id));
          return {
            id: dtoId(upload._id), originalFilename: String(upload.originalFilename), mimeType: String(upload.mimeType),
            pageCount: uploadPages.length, pages: uploadPages
          };
        }),
        pages,
        openRequests: requests.map(requestDto)
      };
    },

    async pageImage(user: AuthenticatedUser, pageId: string, thumbnail = false, roundId?: string) {
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      if (!page) throw notFound();
      const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
      if (!upload) throw notFound();
      const estimateId = String(upload.estimateId);
      const estimate = await EstimateModel.findById(estimateId).lean();
      let bytes: Buffer;
      if (estimate?.status === "client_approved" || roundId) {
        const published = await loadPublishedPlanDocuments(user, estimateId, roundId);
        const pinned = published.documents.flatMap((document) => document.manifest.pages).find((candidate) => candidate.sourcePageId === pageId);
        if (!pinned) throw notFound();
        bytes = await renderEstimatePlanManifestPage(input.storage, pinned);
      } else {
        await requirePage(user, pageId);
        bytes = await renderPageRevision(await bootstrapPageRevision(estimateId, pageId));
      }
      const output = thumbnail
        ? await sharp(bytes, { limitInputPixels: 40_000_000 }).resize({ width: 160, height: 120, fit: "inside", withoutEnlargement: true }).png().toBuffer()
        : bytes;
      return Readable.from(output);
    },

    async staffPageImage(user: AuthenticatedUser, pageId: string) {
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      if (!page) throw notFound();
      const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
      if (!upload || upload.deletedAt) throw notFound();
      await requireStaffEstimate(user, dtoId(upload.estimateId));
      const revision = await bootstrapPageRevision(dtoId(upload.estimateId), pageId);
      return Readable.from(await renderPageRevision(revision));
    },

    advanceForDrawingRevision,

    async saveDraft(user: AuthenticatedUser, pageId: string, draft: SavePlanDraftInput) {
      const { estimateId, page } = await requirePage(user, pageId, "reviewable");
      annotationDocumentSchema.parse(draft.annotations);
      if (draft.annotations.imageWidth !== Number(page.width) || draft.annotations.imageHeight !== Number(page.height)) {
        throw new ApiError(400, "INVALID_ANNOTATIONS", "Annotation dimensions must match the source page.");
      }
      return mongoose.connection.transaction(async (session) => {
        const snapshot = await requireReviewSnapshot(estimateId, pageId, draft.reviewRoundId, session);
        const existing = await EstimatePlanAnnotationDraftModel.findOne({ clientId: user.id, sourcePageId: pageId }).session(session).lean();
        const sameRound = existing && (existing.reviewRoundId ?? null) === snapshot.reviewRoundId;
        if ((!sameRound && draft.version !== 0) || (sameRound && Number(existing.version) !== draft.version)) throw conflict("The plan annotation draft changed. Refresh and try again.");
        const saved = existing
          ? await EstimatePlanAnnotationDraftModel.findOneAndUpdate(
              { _id: existing._id, version: existing.version, reviewRoundId: existing.reviewRoundId ?? null },
              { $set: { annotations: draft.annotations, reviewRoundId: snapshot.reviewRoundId }, $inc: { version: 1 } },
              { returnDocument: "after", runValidators: true, session }
            ).lean()
          : (await EstimatePlanAnnotationDraftModel.create([{ _id: `plan-draft-${randomUUID()}`, estimateId, sourcePageId: pageId, clientId: user.id, reviewRoundId: snapshot.reviewRoundId, version: 1, annotations: draft.annotations }], { session }))[0]!.toObject();
        if (!saved) throw conflict("The plan annotation draft changed. Refresh and try again.");
        return draftDto(saved);
      });
    },

    previewTargets(user: AuthenticatedUser, pageId: string, value: { annotations: AnnotationDocumentV1; reviewRoundId?: string }) {
      return preview(user, pageId, value.annotations, value.reviewRoundId);
    },

    async updateClientRequest(user: AuthenticatedUser, requestId: string, change: UpdateClientPlanRequestInput) {
      annotationDocumentSchema.parse(change.annotations);
      const summary = change.summary.trim();
      if (!summary || summary.length > 1_000 || change.annotations.elements.length === 0) {
        throw new ApiError(400, "INVALID_PLAN_REQUEST", "A change summary and at least one annotation are required.");
      }
      return mongoose.connection.transaction(async (session) => {
        const request = await EstimatePlanChangeRequestModel.findOne({ _id: requestId, clientId: user.id }).session(session);
        if (!request) throw new ApiError(404, "PLAN_REQUEST_NOT_FOUND", "The plan change request was not found.");
        await requireDesignPlanState(dtoId(request.estimateId), "reviewable", session);
        if (request.status !== "open" || request.version !== change.version) {
          throw conflict("The plan request changed. Refresh and try again.");
        }
        const previousSummary = request.summary;
        request.set({ summary, annotations: change.annotations, version: request.version + 1 });
        await request.save({ session });
        const page = await EstimateDesignSourcePageModel.findById(request.sourcePageId).session(session).lean();
        if (!page) throw notFound();
        const lineage = await loadEstimatePlanDocumentLineage(dtoId(request.estimateId), session);
        for (const target of request.targets) {
          const revision = await EstimateDesignRevisionModel.findById(target.requestedRevisionId).session(session);
          if (!revision || revision.reviewStatus !== "changes_requested") continue;
          const drawing = lineage.drawings.find((candidate) => dtoId(candidate._id) === dtoId(revision.drawingId));
          if (!drawing) throw notFound();
          const placement = resolveDrawingPlacement(lineage, drawing, dtoId(revision._id));
          const annotationCrop = planDocumentContentRect(placement.patch);
          const elements = change.annotations.elements
            .map((element) => projectAnnotationToCrop(element, annotationCrop, { width: Number(page.width), height: Number(page.height) }))
            .filter((element): element is NonNullable<typeof element> => element !== null);
          revision.set({
            changeSummary: summary,
            annotationLayerId: requestId,
            annotations: {
              schemaVersion: 1,
              imageWidth: Number(revision.crop.width),
              imageHeight: Number(revision.crop.height),
              elements
            }
          });
          await revision.save({ session });
        }
        await input.audit.appendInMongoTransaction({
          actorId: user.id,
          action: "estimate_plan_change_request_updated",
          entityType: "estimate_plan_change_request",
          entityId: requestId,
          occurredAt: now().toISOString(),
          oldValues: { summary: previousSummary },
          newValues: { summary, annotationCount: change.annotations.elements.length }
        }, session);
        return requestDto(request.toObject());
      });
    },

    async submitRequest(user: AuthenticatedUser, pageId: string, request: SubmitPlanRequestInput) {
      const replay = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, idempotencyKey: request.idempotencyKey }).lean();
      if (replay) return requestDto(replay);
      const checked = await preview(user, pageId, request.annotations, request.reviewRoundId);
      const existing = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, status: "open" }).lean();
      if (existing) throw alreadyOpen(dtoId(existing._id));
      if (checked.pageRevisionNumber !== request.version || checked.snapshotToken !== request.snapshotToken) throw conflict("The plan page changed. Review the detected drawings again.");
      const candidates = new Set(checked.targets.map((target) => target.drawingId));
      const selected = [...new Set(request.targetDrawingIds)].sort();
      if (selected.some((id) => !candidates.has(id)) || (candidates.size === 0 && selected.length > 0) || (candidates.size > 0 && selected.length === 0)) {
        throw new ApiError(400, "INVALID_PLAN_TARGETS", "Confirm one or more detected drawings, or submit unassigned feedback when none overlap.");
      }
      const { estimateId } = await requirePage(user, pageId);
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      let saved: Record<string, any>;
      try {
        saved = await mongoose.connection.transaction(async (session) => {
        const again = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, idempotencyKey: request.idempotencyKey }).session(session).lean();
        if (again) return again;
        const open = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, status: "open" }).session(session).lean();
        if (open) throw alreadyOpen(dtoId(open._id));
        const snapshot = await requireReviewSnapshot(estimateId, pageId, request.reviewRoundId, session);
        const rows = snapshot.rows;
        const currentPageRevision = await EstimatePlanPageRevisionModel.findOne({ estimateId, sourcePageId: pageId }).sort({ revisionNumber: -1 }).session(session).lean();
        const currentTargets = detectAnnotationTargets(request.annotations.elements, rows.map((row) => ({ drawingId: dtoId(row.drawing._id), crop: row.annotationCrop })), { width: Number(page!.width), height: Number(page!.height) });
        const currentToken = reviewSnapshotToken(pageId, Number(currentPageRevision?.revisionNumber), request.annotations, currentTargets.map((target) => target.drawingId), snapshot.reviewRoundId);
        if (!currentPageRevision || Number(currentPageRevision.revisionNumber) !== request.version || currentToken !== request.snapshotToken) {
          throw conflict("The plan page changed. Review the detected drawings again.");
        }
        const revisionByDrawing = new Map(rows.map((row) => [dtoId(row.drawing._id), dtoId(row.revision._id)]));
        const [created] = await EstimatePlanChangeRequestModel.create([{
          _id: `plan-request-${randomUUID()}`, estimateId, uploadId: dtoId(page!.uploadId), sourcePageId: pageId,
          clientId: user.id, idempotencyKey: request.idempotencyKey, version: 1,
          summary: request.summary.trim(), annotations: request.annotations,
          targets: selected.map((drawingId) => ({ drawingId, requestedRevisionId: revisionByDrawing.get(drawingId), status: "open", resolvedByRevisionId: null })),
          unassigned: selected.length === 0, unassignedResolved: false, status: "open"
        }], { session });
        const requestedRevisionIds = selected
          .map((drawingId) => revisionByDrawing.get(drawingId))
          .filter((revisionId): revisionId is string => Boolean(revisionId));
        await Promise.all([
          EstimatePlanAnnotationDraftModel.deleteOne({ clientId: user.id, sourcePageId: pageId }).session(session),
          EstimateDesignAnnotationDraftModel.deleteMany({ clientId: user.id, revisionId: { $in: requestedRevisionIds } }).session(session)
        ]);
        if (requestedRevisionIds.length) {
          for (const revisionId of requestedRevisionIds) {
            const revision = await EstimateDesignRevisionModel.findOne({
              _id: revisionId,
              reviewStatus: { $in: ["submitted", "approved"] }
            }).session(session);
            if (!revision) continue;
            const annotationCrop = rows.find((row) => dtoId(row.revision._id) === revisionId)?.annotationCrop;
            if (!annotationCrop) throw conflict("The drawing placement changed. Refresh and try again.");
            const elements = request.annotations.elements
              .map((element) => projectAnnotationToCrop(element, annotationCrop, { width: Number(page!.width), height: Number(page!.height) }))
              .filter((element): element is NonNullable<typeof element> => element !== null);
            revision.set({
              reviewStatus: "changes_requested",
              reviewerId: user.id,
              reviewedAt: now(),
              changeSummary: request.summary.trim(),
              annotationLayerId: dtoId(created!._id),
              annotations: {
                schemaVersion: 1,
                imageWidth: Number(revision.crop.width),
                imageHeight: Number(revision.crop.height),
                elements
              }
            });
            await revision.save({ session });
          }
        }
        const estimate = await EstimateModel.findById(estimateId).session(session).lean();
        if (estimate) {
          const occurredAt = now();
          const postApprovalDesignReview =
            String(estimate.status) === "client_approved" &&
            String(estimate.designPlanStatus) === "ready_for_client";
          if (postApprovalDesignReview && input.projectWorkflow) {
            await synchronizeEstimateDesignReviewState(
              estimateId,
              "changes_requested",
              session
            );
            await input.projectWorkflow.recordClientDrawingDecision(
              estimateId,
              user,
              "request_changes",
              request.summary.trim(),
              occurredAt,
              session
            );
          } else if (String(estimate.status) !== "client_approved") {
            await EstimateModel.updateOne(
              { _id: estimateId },
              { $set: { status: "client_changes_requested" } },
              { session }
            );
          }
          const recipientIds = (postApprovalDesignReview
            ? [estimate.designPlanDesignerId]
            : [estimate.ownerId, estimate.assignedManagerId, estimate.assignedDesignerId])
            .filter(Boolean).map(dtoId);
          const recipients = await UserModel.find({ _id: { $in: recipientIds }, active: true }).session(session).lean();
          for (const recipient of recipients) {
            const dedupeKey = `estimate_plan_changes_requested:${dtoId(created!._id)}:${dtoId(recipient._id)}`;
            await EstimateModel.updateOne(
              { _id: estimateId, "notifications.dedupeKey": { $ne: dedupeKey } },
              {
                $push: { notifications: { dedupeKey, recipientEmail: recipient.email, recipientRole: recipient.role, event: "estimate_plan_changes_requested", status: "queued", queuedAt: occurredAt } }
              },
              { session }
            );
          }
        }
        await input.audit.appendInMongoTransaction({ actorId: user.id, action: "estimate_plan_changes_requested", entityType: "estimate_plan_change_request", entityId: dtoId(created!._id), occurredAt: now().toISOString(), newValues: { estimateId, sourcePageId: pageId, targetCount: selected.length, unassigned: selected.length === 0, annotationCount: request.annotations.elements.length } }, session);
          return created!.toObject();
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === "DESIGN_PLAN_REVISION_CONFLICT") throw error;
        const open = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, status: "open" }).lean();
        if (open) throw alreadyOpen(dtoId(open._id));
        const transactionRace = (error as { name?: string; path?: string; errorLabels?: string[] });
        if (
          (transactionRace.name === "StrictModeError" && transactionRace.path === "__v") ||
          transactionRace.errorLabels?.includes("TransientTransactionError")
        ) {
          throw alreadyOpen();
        }
        throw error;
      }
      return requestDto(saved);
    }
  };
}

function draftDto(draft: Record<string, any>) {
  return { id: dtoId(draft._id), sourcePageId: dtoId(draft.sourcePageId), version: Number(draft.version), annotations: draft.annotations };
}

function requestDto(request: Record<string, any>) {
  return {
    id: dtoId(request._id), sourcePageId: dtoId(request.sourcePageId), version: Number(request.version),
    summary: String(request.summary), annotations: request.annotations,
    targets: request.targets.map((target: Record<string, any>) => ({ drawingId: dtoId(target.drawingId), requestedRevisionId: dtoId(target.requestedRevisionId), status: String(target.status), resolvedByRevisionId: target.resolvedByRevisionId ? dtoId(target.resolvedByRevisionId) : null })),
    unassigned: Boolean(request.unassigned), status: String(request.status),
    resolutionNote: request.resolutionNote ? String(request.resolutionNote) : null
  };
}

function requestQueueDto(request: Record<string, any>) {
  return {
    id: dtoId(request._id), estimateId: dtoId(request.estimateId), uploadId: dtoId(request.uploadId),
    sourcePageId: dtoId(request.sourcePageId), clientId: dtoId(request.clientId), version: Number(request.version),
    summary: String(request.summary), status: String(request.status), unassigned: Boolean(request.unassigned),
    targetCount: request.targets.length,
    targets: request.targets.map((target: Record<string, any>) => ({ drawingId: dtoId(target.drawingId), status: String(target.status) })),
    createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : String(request.createdAt)
  };
}
