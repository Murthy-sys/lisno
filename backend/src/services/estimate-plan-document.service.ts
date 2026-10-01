import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { ClientSession } from "mongoose";

import type { PlanDocumentDto, PlanDocumentManifest, PlanDocumentManifestSet, PlanDocumentWorkspace, PreparedPlanDocument, PreparedPlanDocuments } from "../contracts/estimate-plan-document.js";
import { hashPlanDocumentManifest } from "../domain/estimate-plan-document.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateDesignPlanDocumentModel } from "../models/EstimateDesignPlanDocument.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import type { Storage } from "../storage/storage.js";
import type { PublicUser } from "./auth.service.js";
import { planDocumentNotFound, requirePlanDocumentClientRound, requirePlanDocumentStaff } from "./estimate-plan-document-access.js";
import { loadEstimatePlanDocumentManifest } from "./estimate-plan-document-manifest.js";
import { renderPlanDocumentPdf } from "./estimate-plan-pdf.js";

type Row = Record<string, any>;
type ManifestLoader = (estimateId: string, options?: { session?: ClientSession; revisionIds?: string[] }) => Promise<PlanDocumentManifestSet>;
const attemptLifetimeMs = 120_000;

function conflict(): never {
  throw new ApiError(409, "DESIGN_PLAN_DOCUMENT_STALE", "The design plan changed. Refresh the plan and prepare its updated PDF again.");
}

function digest(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }

function filename(manifest: PlanDocumentManifest, hash: string) {
  const stem = manifest.originalFilename.replace(/\.[^.]+$/, "").replace(/[\r\n"\\/]/g, "_").slice(0, 150) || "design-plan";
  return `${stem}-revised-${hash.slice(0, 8)}.pdf`;
}

function prepared(row: Row): PreparedPlanDocument {
  if (row.status !== "ready" || !row.storageReference || !row.sha256 || !row.byteSize || !row.manifest) {
    throw new ApiError(409, "DESIGN_PLAN_DOCUMENT_NOT_READY", "The updated full PDF is not ready. Prepare it before submitting.");
  }
  return {
    documentId: String(row._id), sourceUploadId: String(row.sourceUploadId), manifestHash: String(row.manifestHash),
    manifest: row.manifest as PlanDocumentManifest, filename: String(row.filename), mimeType: "application/pdf",
    byteSize: Number(row.byteSize), sha256: String(row.sha256), storageReference: String(row.storageReference)
  };
}

export function createEstimatePlanDocumentService(input: {
  storage: Storage;
  now?: () => Date;
  loadManifest?: ManifestLoader;
  render?: typeof renderPlanDocumentPdf;
}) {
  const now = input.now ?? (() => new Date());
  const loadManifest = input.loadManifest ?? loadEstimatePlanDocumentManifest;
  const render = input.render ?? renderPlanDocumentPdf;

  async function rowsFor(set: PlanDocumentManifestSet) {
    return Promise.all(set.documents.map((manifest) => EstimateDesignPlanDocumentModel.findOne({
      estimateId: manifest.estimateId, sourceUploadId: manifest.sourceUploadId,
      manifestHash: hashPlanDocumentManifest(manifest), rendererVersion: manifest.rendererVersion
    }).select("+manifest +storageReference").lean()));
  }

  function workspace(set: PlanDocumentManifestSet, rows: Array<Row | null>): PlanDocumentWorkspace {
    const documents: PlanDocumentDto[] = set.documents.map((manifest, index) => {
      const row = rows[index];
      const expired = row?.status === "preparing" && (!row.attemptExpiresAt || new Date(row.attemptExpiresAt).getTime() <= now().getTime());
      const status = expired ? "failed" : row?.status ?? "not_prepared";
      return {
        sourceUploadId: manifest.sourceUploadId, originalFilename: manifest.originalFilename,
        documentId: row ? String(row._id) : null, manifestHash: hashPlanDocumentManifest(manifest),
        status, pageCount: row?.status === "ready" ? Number(row.pageCount) : manifest.pages.length,
        pdfUrl: status === "ready" ? `/estimates/${encodeURIComponent(manifest.estimateId)}/design-plan-documents/${encodeURIComponent(String(row!._id))}/pdf` : null,
        failureCode: expired ? "DESIGN_PLAN_PREPARATION_EXPIRED" : row?.failureCode ?? null,
        failureMessage: expired ? "PDF preparation was interrupted. Try preparing the updated PDF again." : row?.failureMessage ?? null
      };
    });
    return { manifestHash: set.manifestHash, readyForSubmission: documents.length > 0 && documents.every((doc) => doc.status === "ready"), documents, reviewRoundId: null };
  }

  async function verifyBytes(document: PreparedPlanDocument) {
    const bytes = await input.storage.read(document.storageReference);
    if (bytes.length !== document.byteSize || digest(bytes) !== document.sha256) {
      throw new ApiError(409, "DESIGN_PLAN_ATTACHMENT_CONFLICT", "The stored full PDF no longer matches its review snapshot.");
    }
    return bytes;
  }

  async function build(actor: PublicUser, set: PlanDocumentManifestSet, manifest: PlanDocumentManifest) {
    const hash = hashPlanDocumentManifest(manifest);
    const key = { estimateId: manifest.estimateId, sourceUploadId: manifest.sourceUploadId, manifestHash: hash, rendererVersion: manifest.rendererVersion };
    const token = randomUUID();
    const startedAt = now();
    let row = await EstimateDesignPlanDocumentModel.findOne(key).select("+manifest +storageReference").lean();
    if (row?.status === "ready") { await verifyBytes(prepared(row)); return; }
    if (!row) {
      try {
        const created = await EstimateDesignPlanDocumentModel.create({
          _id: `plan-document-${randomUUID()}`, ...key, manifest, status: "preparing", attemptToken: token,
          attemptExpiresAt: new Date(startedAt.getTime() + attemptLifetimeMs), filename: filename(manifest, hash),
          pageCount: manifest.pages.length, createdById: actor.id
        });
        row = created.toObject();
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    const claimed = row?.attemptToken === token ? row : await EstimateDesignPlanDocumentModel.findOneAndUpdate({
      ...key, $or: [{ status: "failed" }, { status: "preparing", attemptExpiresAt: { $lte: startedAt } }]
    }, { $set: { status: "preparing", attemptToken: token, attemptExpiresAt: new Date(startedAt.getTime() + attemptLifetimeMs), failureCode: null, failureMessage: null } }, { returnDocument: "after" }).select("+manifest +storageReference").lean();
    if (!claimed) return; // A concurrent request owns this content identity.
    let generatedReference: string | undefined;
    let publicationAttempted = false;
    try {
      const bytes = await render(manifest, input.storage);
      if (bytes.length === 0 || bytes.length > 100 * 1024 * 1024) throw new ApiError(413, "DESIGN_PLAN_PDF_TOO_LARGE", "The updated PDF exceeds the supported document size.");
      const pageCount = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
      const latest = await loadManifest(manifest.estimateId);
      if (latest.manifestHash !== set.manifestHash) conflict();
      generatedReference = (await input.storage.saveGenerated({ data: bytes, extension: ".pdf" })).reference;
      const afterStorage = await loadManifest(manifest.estimateId);
      if (afterStorage.manifestHash !== set.manifestHash) conflict();
      publicationAttempted = true;
      const published = await EstimateDesignPlanDocumentModel.updateOne({
        _id: claimed._id, status: "preparing", attemptToken: token, attemptExpiresAt: { $gt: now() }
      }, { $set: { status: "ready", storageReference: generatedReference, sha256: digest(bytes), byteSize: bytes.length, pageCount,
        attemptToken: null, attemptExpiresAt: null, failureCode: null, failureMessage: null } });
      if (published.modifiedCount !== 1) conflict();
      generatedReference = undefined;
    } catch (error) {
      const safeError = error instanceof ApiError ? error : new ApiError(503, "DESIGN_PLAN_PDF_FAILED", "The updated full PDF could not be prepared. Try again.");
      // Fence the attempt before cleanup: a timed-out publication may still be
      // running on Mongo. If its outcome is unknown, retain the object.
      const fenced = await EstimateDesignPlanDocumentModel.updateOne({ _id: claimed._id, status: "preparing", attemptToken: token }, {
        $set: { status: "failed", attemptToken: null, attemptExpiresAt: null, failureCode: safeError.code, failureMessage: safeError.message }
      });
      if (generatedReference) {
        const winner = publicationAttempted && fenced.modifiedCount !== 1
          ? await EstimateDesignPlanDocumentModel.findById(claimed._id).select("+storageReference +attemptToken").lean()
          : null;
        if (winner?.status === "ready" && winner.storageReference === generatedReference) return;
        if (!publicationAttempted || fenced.modifiedCount === 1 || (winner && winner.attemptToken !== token && winner.storageReference !== generatedReference)) {
          await input.storage.delete(generatedReference);
        }
      }
      throw safeError;
    }
  }

  async function prepareSet(actor: PublicUser, estimateId: string, expectedManifestHash?: string) {
    await requirePlanDocumentStaff(actor, estimateId, true);
    const pending = await EstimateDesignUploadModel.exists({ estimateId, deletedAt: null, extractionStatus: { $in: ["queued", "processing"] } });
    if (pending) throw new ApiError(409, "DESIGN_PLAN_EXTRACTION_PENDING", "Wait for the revised drawing to finish extracting before preparing the full PDF.");
    const set = await loadManifest(estimateId);
    if (expectedManifestHash && set.manifestHash !== expectedManifestHash) conflict();
    for (const manifest of set.documents) await build(actor, set, manifest);
    const current = await loadManifest(estimateId);
    if (current.manifestHash !== set.manifestHash) conflict();
    return { set, rows: await rowsFor(set) };
  }

  return {
    async listStaff(actor: PublicUser, estimateId: string) {
      await requirePlanDocumentStaff(actor, estimateId);
      const set = await loadManifest(estimateId);
      return workspace(set, await rowsFor(set));
    },
    async prepare(actor: PublicUser, estimateId: string, expectedManifestHash: string) {
      const { set, rows } = await prepareSet(actor, estimateId, expectedManifestHash);
      return workspace(set, rows);
    },
    async prepareForSubmission(actor: PublicUser, estimateId: string): Promise<PreparedPlanDocuments> {
      const { set, rows } = await prepareSet(actor, estimateId);
      if (!rows.length || rows.some((row) => !row || row.status !== "ready")) {
        throw new ApiError(409, "DESIGN_PLAN_DOCUMENT_NOT_READY", "The updated full PDF is still being prepared. Wait and submit again.");
      }
      return { manifestHash: set.manifestHash, documents: rows.map((row) => prepared(row!)) };
    },
    async validateForSubmission(estimateId: string, documents: PreparedPlanDocuments, revisionIds: string[], session: ClientSession) {
      const set = await loadManifest(estimateId, { session });
      const currentIds = set.documents.flatMap((doc) => doc.pages.flatMap((page) => page.patches.map((patch) => patch.revisionId))).sort();
      if (JSON.stringify(currentIds) !== JSON.stringify([...revisionIds].sort())) conflict();
      if (set.manifestHash !== documents.manifestHash || set.documents.length !== documents.documents.length) conflict();
      for (const manifest of set.documents) {
        const hash = hashPlanDocumentManifest(manifest);
        const document = documents.documents.find((doc) => doc.sourceUploadId === manifest.sourceUploadId && doc.manifestHash === hash);
        if (!document) conflict();
        const row = await EstimateDesignPlanDocumentModel.findOne({
          _id: document.documentId, estimateId, sourceUploadId: manifest.sourceUploadId, manifestHash: hash,
          status: "ready", sha256: document.sha256, byteSize: document.byteSize, storageReference: document.storageReference
        }).session(session).lean();
        if (!row) conflict();
      }
    },
    async readStaff(actor: PublicUser, estimateId: string, documentId: string) {
      await requirePlanDocumentStaff(actor, estimateId);
      const set = await loadManifest(estimateId);
      const row = await EstimateDesignPlanDocumentModel.findOne({ _id: documentId, estimateId, status: "ready" }).select("+manifest +storageReference").lean();
      if (!row || !set.documents.some((doc) => doc.sourceUploadId === String(row.sourceUploadId) && hashPlanDocumentManifest(doc) === row.manifestHash)) throw planDocumentNotFound();
      const document = prepared(row);
      return { filename: document.filename, mimeType: document.mimeType, bytes: await verifyBytes(document) };
    },
    async listClient(actor: PublicUser, estimateId: string, roundId?: string): Promise<PlanDocumentWorkspace> {
      const round = await requirePlanDocumentClientRound(actor, estimateId, roundId);
      const documents: PlanDocumentDto[] = [];
      for (const pin of (round.planDocuments ?? []) as Row[]) {
        const row = await EstimateDesignPlanDocumentModel.findOne({ _id: pin.documentId, estimateId, manifestHash: pin.manifestHash, status: "ready" }).select("+manifest").lean();
        if (!row) throw planDocumentNotFound();
        documents.push({ sourceUploadId: String(row.sourceUploadId), originalFilename: String(row.manifest.originalFilename), documentId: String(row._id),
          manifestHash: String(row.manifestHash), status: "ready", pageCount: Number(row.pageCount), failureCode: null, failureMessage: null,
          pdfUrl: `/client/estimates/${encodeURIComponent(estimateId)}/design-plan-documents/${encodeURIComponent(String(row._id))}/pdf?roundId=${encodeURIComponent(String(round._id))}` });
      }
      return { manifestHash: String(round.planManifestHash ?? ""), readyForSubmission: false, documents, reviewRoundId: String(round._id) };
    },
    async readClient(actor: PublicUser, estimateId: string, documentId: string, roundId: string) {
      const round = await requirePlanDocumentClientRound(actor, estimateId, roundId);
      const pin = (round.planDocuments ?? []).find((doc: Row) => doc.documentId === documentId);
      if (!pin) throw planDocumentNotFound();
      const row = await EstimateDesignPlanDocumentModel.findOne({ _id: documentId, estimateId, manifestHash: pin.manifestHash, status: "ready" }).select("+manifest +storageReference").lean();
      if (!row) throw planDocumentNotFound();
      const document = prepared(row);
      const attachment = round.attachments.find((item: Row) => String(item.uploadId) === document.sourceUploadId);
      if (!attachment || attachment.storageReference !== document.storageReference || attachment.sha256 !== document.sha256 ||
          attachment.byteSize !== document.byteSize || attachment.filename !== document.filename || attachment.mimeType !== document.mimeType) {
        throw new ApiError(409, "DESIGN_PLAN_ATTACHMENT_CONFLICT", "The stored full PDF no longer matches its review snapshot.");
      }
      return { filename: document.filename, mimeType: document.mimeType, bytes: await verifyBytes(document) };
    }
  };
}

export type EstimatePlanDocumentService = ReturnType<typeof createEstimatePlanDocumentService>;
