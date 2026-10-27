import type { ClientSession } from "mongoose";
import { createHash } from "node:crypto";
import type { ValidatedWorkflowMedia } from "../../middleware/workflow-evidence-upload.js";
import type { ValidatedUpload } from "../../middleware/upload.js";
import { ProjectManagerEvidenceModel, ProjectManagerEvidenceCleanupModel } from "../../models/ProjectManagerEvidence.js";
import type { FileStorage } from "../../storage/storage.js";
import type { PublicUser } from "../auth.service.js";
import { createWorkflowEvidenceStorage } from "../workflow-evidence-storage.js";
import { ProjectVendorNoticeModel } from "../../models/ProjectVendorNotice.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { requireExecutionActor } from "../vendor-execution-access.js";
import { pmMissing, pmConflict, pmTransaction, pmNewId, requirePMProject, type PMRow } from "./common.js";

export async function assertPMEvidence(projectId: string, entityId: string, ids: readonly string[], session: ClientSession): Promise<PMRow[]> {
  if (new Set(ids).size !== ids.length || ids.length > 12) pmConflict("Select at most twelve distinct evidence files.");
  const rows = await ProjectManagerEvidenceModel.find({ _id: { $in: ids }, projectId, entityId }).session(session).lean();
  if (rows.length !== ids.length) pmConflict("Evidence must belong to this project and record.");
  if (ids.length) await ProjectManagerEvidenceModel.updateMany({ _id: { $in: ids }, projectId, entityId }, { $inc: { referenceEpoch: 1 } }, { session });
  return rows.map(row => ({ ...row, id: String(row._id) }));
}
export function createPMEvidenceService(storage: FileStorage) {
  const evidence = createWorkflowEvidenceStorage(storage);
  async function cleanup(reference: string) {
    try { if (await ProjectManagerEvidenceModel.exists({ storageReference: reference })) return; await storage.delete(reference); await ProjectManagerEvidenceCleanupModel.deleteOne({ _id: reference }); }
    catch { await ProjectManagerEvidenceCleanupModel.updateOne({ _id: reference }, { $setOnInsert: { createdAt: new Date() }, $inc: { attempts: 1 } }, { upsert: true }); }
  }
  return {
    async upload(actor: PublicUser, projectId: string, entityId: string, media: ValidatedWorkflowMedia[], document?: ValidatedUpload, signal?: AbortSignal) {
      await requirePMProject(actor, projectId, undefined, false, ["site_manager", "designer", "procurement", "finance_head"]);
      if (!entityId || entityId.length > 160 || media.length + (document ? 1 : 0) < 1 || media.length + (document ? 1 : 0) > 12) pmConflict("Choose between one and twelve evidence files.");
      const saved: PMRow[] = [];
      try {
        for (const file of media) saved.push(await evidence.saveMedia(file, signal));
        if (document) saved.push({ ...await evidence.saveProof(document), id: pmNewId("evidence"), kind: "document" });
        const result = await pmTransaction(async session => {
          await requirePMProject(actor, projectId, session, true, ["site_manager", "designer", "procurement", "finance_head"]);
          const records: PMRow[] = [];
          for (const file of saved) {
            const existing = await ProjectManagerEvidenceModel.findOne({ projectId, entityId, uploaderId: actor.id, sha256: file.sha256, byteSize: file.byteSize }).session(session).lean();
            if (existing) records.push({ ...existing, id: String(existing._id) });
            else { await ProjectManagerEvidenceModel.create([{ ...file, _id: file.id, projectId, entityId, uploaderId: actor.id, createdAt: new Date() }], { session }); records.push(file); }
          }
          return records.map(file => ({ id: file.id as string, name: file.originalFilename as string, mimeType: file.mimeType as string, kind: file.kind as string }));
        });
        await Promise.allSettled(saved.map(file => cleanup(String(file.storageReference))));
        const pending = await ProjectManagerEvidenceCleanupModel.find({}).limit(5).lean();
        await Promise.allSettled(pending.map(row => cleanup(String(row._id))));
        return result;
      } catch (error) { await Promise.allSettled(saved.map(file => cleanup(String(file.storageReference)))); throw error; }
    },
    async read(actor: PublicUser, projectId: string, id: string) {
      const authorize = async () => {
        await requirePMProject(actor, projectId, undefined, false, ["site_manager", "designer", "site_manager", "procurement", "finance_head", "vendor"]);
        if (actor.role === "vendor") {
          await requireExecutionActor(actor);
          if (!await ProjectPurchaseOrderModel.exists({ projectId, vendorId: actor.vendorId, approvedRevisionId: { $ne: null }, cancelledAt: null })) pmMissing();
          if (!await ProjectVendorNoticeModel.exists({ projectId, vendorId: actor.vendorId, evidenceIds: id })) pmMissing();
        }
      };
      await authorize();
      const row = await ProjectManagerEvidenceModel.findOne({ _id: id, projectId }).lean();
      if (!row) pmMissing();
      if (row.kind === "document") {
        const content = await storage.read(row.storageReference);
        if (content.length !== row.byteSize || createHash("sha256").update(content).digest("hex") !== row.sha256) pmConflict("Stored evidence no longer matches its original file.");
      }
      const stream = row.kind === "document" ? await storage.open(row.storageReference) : await evidence.openVerifiedMedia({ ...row, id: String(row._id) } as any);
      try { await authorize(); }
      catch (error) { stream.destroy(); throw error; }
      return { stream, mimeType: String(row.mimeType), filename: String(row.originalFilename) };
    }
  };
}
