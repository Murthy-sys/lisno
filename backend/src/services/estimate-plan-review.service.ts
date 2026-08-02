import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import mongoose from "mongoose";
import sharp, { type OverlayOptions } from "sharp";

import { annotationDocumentSchema, type AnnotationDocumentV1 } from "../domain/estimate-design.js";
import { detectAnnotationTargets } from "../domain/estimate-plan-review.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimatePlanAnnotationDraftModel } from "../models/EstimatePlanAnnotationDraft.js";
import { EstimatePlanChangeRequestModel } from "../models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../models/EstimatePlanPageRevision.js";
import type { Storage } from "../storage/storage.js";
import type { PublicUser as AuthenticatedUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import type { EstimateDesignService } from "./estimate-design.service.js";

type ClientDesignAccess = Pick<EstimateDesignService, "listClient">;
type PlanAudit = Pick<AuditService, "appendInMongoTransaction">;

export interface CreateEstimatePlanReviewServiceInput {
  estimateDesigns: ClientDesignAccess;
  storage: Storage;
  audit: PlanAudit;
  now?: () => Date;
}

export interface SavePlanDraftInput {
  version: number;
  annotations: AnnotationDocumentV1;
}

export interface SubmitPlanRequestInput {
  version: number;
  summary: string;
  annotations: AnnotationDocumentV1;
  targetDrawingIds: string[];
  snapshotToken: string;
  idempotencyKey: string;
}

function conflict(message: string) {
  return new ApiError(409, "PLAN_REVIEW_CONFLICT", message);
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
  const replaced = replacement.replacesRevisionId
    ? await EstimateDesignRevisionModel.findById(replacement.replacesRevisionId).session(session).lean()
    : null;
  const pageId = dtoId(replaced?.sourcePageId ?? replacement.sourcePageId);
  let current = await EstimatePlanPageRevisionModel.findOne({ sourcePageId: pageId })
    .sort({ revisionNumber: -1 }).session(session).lean();

  if (!current) {
    const page = await EstimateDesignSourcePageModel.findById(pageId).session(session).lean();
    if (!page) throw notFound();
    const drawings = await EstimateDesignDrawingModel.find({ estimateId: drawing.estimateId, sourcePageId: pageId, active: true })
      .sort({ _id: 1 }).session(session).lean();
    const patches = [];
    for (const candidate of drawings) {
      const latest = dtoId(candidate._id) === dtoId(drawing._id)
        ? replacement
        : await EstimateDesignRevisionModel.findOne({ drawingId: candidate._id }).sort({ revisionNumber: -1 }).session(session).lean();
      if (!latest) continue;
      const crop = dtoId(candidate._id) === dtoId(drawing._id) && replaced ? replaced.crop : latest.crop;
      patches.push({ drawingId: dtoId(candidate._id), drawingRevisionId: dtoId(latest._id), crop: { ...crop } });
    }
    patches.sort((left, right) =>
      Number(right.crop.width) * Number(right.crop.height) - Number(left.crop.width) * Number(left.crop.height) ||
      left.drawingId.localeCompare(right.drawingId)
    );
    const [created] = await EstimatePlanPageRevisionModel.create([{
      _id: `plan-page-revision-${randomUUID()}`, estimateId: dtoId(drawing.estimateId), sourcePageId: pageId,
      revisionNumber: 1, basePageReference: page.normalizedFileReference, status: "revised",
      patches: patches.map((patch, order) => ({ ...patch, order })), previousRevisionId: null, createdBy
    }], { session });
    current = created!.toObject();
  } else {
    const existing = current.patches.find((patch: Record<string, any>) => dtoId(patch.drawingId) === dtoId(drawing._id));
    if (!existing || dtoId(existing.drawingRevisionId) !== revisionId) {
      const patches = current.patches.map((patch: Record<string, any>) => ({
        drawingId: dtoId(patch.drawingId),
        drawingRevisionId: dtoId(patch.drawingId) === dtoId(drawing._id) ? revisionId : dtoId(patch.drawingRevisionId),
        crop: { ...patch.crop }, order: Number(patch.order)
      }));
      if (!existing) patches.push({ drawingId: dtoId(drawing._id), drawingRevisionId: revisionId, crop: { ...(replaced?.crop ?? replacement.crop) }, order: patches.length });
      const [created] = await EstimatePlanPageRevisionModel.create([{
        _id: `plan-page-revision-${randomUUID()}`, estimateId: dtoId(drawing.estimateId), sourcePageId: pageId,
        revisionNumber: Number(current.revisionNumber) + 1, basePageReference: current.basePageReference,
        status: "revised", patches, previousRevisionId: current._id, createdBy
      }], { session });
      current = created!.toObject();
    }
  }

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

export async function ensureEstimatePlanReviewCollections() {
  await Promise.all([
    EstimatePlanPageRevisionModel.createCollection(),
    EstimatePlanChangeRequestModel.createCollection()
  ]);
}

export function createEstimatePlanReviewService(input: CreateEstimatePlanReviewServiceInput) {
  const now = input.now ?? (() => new Date());

  async function requirePage(user: AuthenticatedUser, pageId: string) {
    const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
    if (!page) throw notFound();
    const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
    if (!upload) throw notFound();
    await input.estimateDesigns.listClient(user, dtoId(upload.estimateId));
    return { page, estimateId: dtoId(upload.estimateId) };
  }

  async function latestDrawingRows(estimateId: string, pageId: string, session?: mongoose.ClientSession) {
    const drawingQuery = EstimateDesignDrawingModel.find({ estimateId, sourcePageId: pageId, active: true }).sort({ _id: 1 });
    if (session) drawingQuery.session(session);
    const drawings = await drawingQuery.lean();
    const rows = [];
    for (const drawing of drawings) {
      const revisionQuery = EstimateDesignRevisionModel.findOne({ drawingId: drawing._id }).sort({ revisionNumber: -1 });
      if (session) revisionQuery.session(session);
      const revision = await revisionQuery.lean();
      if (revision) rows.push({ drawing, revision });
    }
    return rows;
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
          Number(right.revision.crop.width) * Number(right.revision.crop.height) - Number(left.revision.crop.width) * Number(left.revision.crop.height) ||
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
            crop: { ...row.revision.crop },
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
    const uploads = await EstimateDesignUploadModel.find({ estimateId }).lean();
    const pages = await EstimateDesignSourcePageModel.find({ uploadId: { $in: uploads.map((upload) => upload._id) } }).sort({ pageNumber: 1, _id: 1 }).lean();
    return Promise.all(pages.map(async (page) => ({ page, revision: await bootstrapPageRevision(estimateId, dtoId(page._id)) })));
  }

  async function preview(user: AuthenticatedUser, pageId: string, annotations: AnnotationDocumentV1) {
    annotationDocumentSchema.parse(annotations);
    const { page, estimateId } = await requirePage(user, pageId);
    if (annotations.imageWidth !== Number(page.width) || annotations.imageHeight !== Number(page.height)) {
      throw new ApiError(400, "INVALID_ANNOTATIONS", "Annotation dimensions must match the source page.");
    }
    const revision = await bootstrapPageRevision(estimateId, pageId);
    const rows = await latestDrawingRows(estimateId, pageId);
    const matches = detectAnnotationTargets(annotations.elements, rows.map((row) => ({ drawingId: dtoId(row.drawing._id), crop: row.revision.crop as never })), { width: Number(page.width), height: Number(page.height) });
    const titles = new Map(rows.map((row) => [dtoId(row.drawing._id), String(row.drawing.displayTitle)]));
    const targets = matches.map((match) => ({ ...match, title: titles.get(match.drawingId) ?? "Drawing" }));
    const snapshotToken = createHash("sha256").update(JSON.stringify({ pageId, revisionNumber: revision.revisionNumber, annotations, targets: targets.map((target) => target.drawingId) })).digest("hex");
    return { pageRevisionNumber: Number(revision.revisionNumber), targets, snapshotToken };
  }

  async function renderPageRevision(revision: Record<string, any>) {
    const base = await input.storage.read(String(revision.basePageReference));
    const layers: OverlayOptions[] = [];
    const patches = [...revision.patches].sort((left: Record<string, any>, right: Record<string, any>) =>
      Number(left.order) - Number(right.order)
    );
    for (const patch of patches) {
      const drawingRevision = await EstimateDesignRevisionModel.findById(patch.drawingRevisionId).lean();
      if (!drawingRevision) throw new ApiError(409, "PLAN_PATCH_MISSING", "A drawing used by this plan revision no longer exists.");
      const patchBytes = await input.storage.read(String(drawingRevision.croppedFileReference));
      const normalizedPatch = await sharp(patchBytes, { limitInputPixels: 40_000_000 })
        .resize({ width: Number(patch.crop.width), height: Number(patch.crop.height), fit: "fill" })
        .png().toBuffer();
      layers.push({ input: normalizedPatch, left: Number(patch.crop.x), top: Number(patch.crop.y) });
    }
    return sharp(base, { limitInputPixels: 40_000_000 }).composite(layers).png().toBuffer();
  }

  async function advanceForDrawingRevision(revisionId: string, createdBy = "system:design-replacement") {
    const replacement = await EstimateDesignRevisionModel.findById(revisionId).lean();
    if (!replacement) throw new ApiError(404, "DESIGN_REVISION_NOT_FOUND", "The drawing revision was not found.");
    const drawing = await EstimateDesignDrawingModel.findById(replacement.drawingId).lean();
    if (!drawing) throw new ApiError(404, "DESIGN_DRAWING_NOT_FOUND", "The drawing was not found.");
    const estimateId = dtoId(drawing.estimateId);
    const replaced = replacement.replacesRevisionId
      ? await EstimateDesignRevisionModel.findById(replacement.replacesRevisionId).lean()
      : null;
    const pageId = dtoId(replaced?.sourcePageId ?? replacement.sourcePageId);
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
    async listClient(user: AuthenticatedUser, estimateId: string) {
      const rows = await pageRows(user, estimateId);
      const drafts = await EstimatePlanAnnotationDraftModel.find({ clientId: user.id, sourcePageId: { $in: rows.map((row) => row.page._id) } }).lean();
      const draftByPage = new Map(drafts.map((draft) => [dtoId(draft.sourcePageId), draft]));
      const requests = await EstimatePlanChangeRequestModel.find({ clientId: user.id, estimateId, status: "open" }).sort({ createdAt: 1 }).lean();
      return {
        pages: rows.map(({ page, revision }) => ({
          id: dtoId(page._id), uploadId: dtoId(page.uploadId), pageNumber: Number(page.pageNumber),
          width: Number(page.width), height: Number(page.height), currentRevisionId: dtoId(revision._id),
          status: String(revision.status),
          thumbnailUrl: `/client/estimate-plan-pages/${encodeURIComponent(dtoId(page._id))}/thumbnail`,
          currentImageUrl: `/client/estimate-plan-pages/${encodeURIComponent(dtoId(page._id))}/current-image`,
          annotationDraft: draftByPage.has(dtoId(page._id)) ? draftDto(draftByPage.get(dtoId(page._id))!) : null
        })),
        openRequests: requests.map(requestDto)
      };
    },

    async pageImage(user: AuthenticatedUser, pageId: string, thumbnail = false) {
      const { estimateId } = await requirePage(user, pageId);
      const revision = await bootstrapPageRevision(estimateId, pageId);
      const bytes = await renderPageRevision(revision);
      const output = thumbnail
        ? await sharp(bytes, { limitInputPixels: 40_000_000 }).resize({ width: 160, height: 120, fit: "inside", withoutEnlargement: true }).png().toBuffer()
        : bytes;
      return Readable.from(output);
    },

    advanceForDrawingRevision,

    async saveDraft(user: AuthenticatedUser, pageId: string, draft: SavePlanDraftInput) {
      await requirePage(user, pageId);
      annotationDocumentSchema.parse(draft.annotations);
      const existing = await EstimatePlanAnnotationDraftModel.findOne({ clientId: user.id, sourcePageId: pageId }).lean();
      if (!existing && draft.version !== 0) throw conflict("The plan annotation draft changed. Refresh and try again.");
      if (existing && Number(existing.version) !== draft.version) throw conflict("The plan annotation draft changed. Refresh and try again.");
      const saved = existing
        ? await EstimatePlanAnnotationDraftModel.findOneAndUpdate(
            { _id: existing._id, version: draft.version },
            { $set: { annotations: draft.annotations }, $inc: { version: 1 } },
            { returnDocument: "after", runValidators: true }
          ).lean()
        : (await EstimatePlanAnnotationDraftModel.create({ _id: `plan-draft-${randomUUID()}`, estimateId: (await requirePage(user, pageId)).estimateId, sourcePageId: pageId, clientId: user.id, version: 1, annotations: draft.annotations })).toObject();
      if (!saved) throw conflict("The plan annotation draft changed. Refresh and try again.");
      return draftDto(saved);
    },

    previewTargets(user: AuthenticatedUser, pageId: string, value: { annotations: AnnotationDocumentV1 }) {
      return preview(user, pageId, value.annotations);
    },

    async submitRequest(user: AuthenticatedUser, pageId: string, request: SubmitPlanRequestInput) {
      const replay = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, idempotencyKey: request.idempotencyKey }).lean();
      if (replay) return requestDto(replay);
      const checked = await preview(user, pageId, request.annotations);
      if (checked.pageRevisionNumber !== request.version || checked.snapshotToken !== request.snapshotToken) throw conflict("The plan page changed. Review the detected drawings again.");
      const candidates = new Set(checked.targets.map((target) => target.drawingId));
      const selected = [...new Set(request.targetDrawingIds)].sort();
      if (selected.some((id) => !candidates.has(id)) || (candidates.size === 0 && selected.length > 0) || (candidates.size > 0 && selected.length === 0)) {
        throw new ApiError(400, "INVALID_PLAN_TARGETS", "Confirm one or more detected drawings, or submit unassigned feedback when none overlap.");
      }
      const { estimateId } = await requirePage(user, pageId);
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      const rows = await latestDrawingRows(estimateId, pageId);
      const revisionByDrawing = new Map(rows.map((row) => [dtoId(row.drawing._id), dtoId(row.revision._id)]));
      const saved = await mongoose.connection.transaction(async (session) => {
        const again = await EstimatePlanChangeRequestModel.findOne({ clientId: user.id, sourcePageId: pageId, idempotencyKey: request.idempotencyKey }).session(session).lean();
        if (again) return again;
        const [created] = await EstimatePlanChangeRequestModel.create([{
          _id: `plan-request-${randomUUID()}`, estimateId, uploadId: dtoId(page!.uploadId), sourcePageId: pageId,
          clientId: user.id, idempotencyKey: request.idempotencyKey, version: 1,
          summary: request.summary.trim(), annotations: request.annotations,
          targets: selected.map((drawingId) => ({ drawingId, requestedRevisionId: revisionByDrawing.get(drawingId), status: "open", resolvedByRevisionId: null })),
          unassigned: selected.length === 0, unassignedResolved: false, status: "open"
        }], { session });
        await input.audit.appendInMongoTransaction({ actorId: user.id, action: "estimate_plan_changes_requested", entityType: "estimate_plan_change_request", entityId: dtoId(created!._id), occurredAt: now().toISOString(), newValues: { estimateId, sourcePageId: pageId, targetCount: selected.length, unassigned: selected.length === 0, annotationCount: request.annotations.elements.length } }, session);
        return created!.toObject();
      });
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
    unassigned: Boolean(request.unassigned), status: String(request.status)
  };
}
