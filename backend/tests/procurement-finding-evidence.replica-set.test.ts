import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { lifecycleAt, seedLifecycleFixture } from "./fixtures/procurement-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createLifecycleFindingBridge, createProcurementFindingEvidenceService } from "../src/services/procurement-lifecycle/findings-bridge.js";
import { recordLifecycleFindingInSession } from "../src/services/procurement-findings.service.js";
import { handoverEvidenceEntityId } from "../src/services/procurement-handover.service.js";
import { readLifecycleSource } from "../src/services/procurement-lifecycle/source.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { createProjectManagerClientService } from "../src/services/project-manager/client.js";
import { ProcurementFindingModel } from "../src/models/ProcurementFinding.js";
import { ProcurementLifecycleEvidenceModel } from "../src/models/ProcurementLifecycleEvidence.js";
import { ProjectSnagModel } from "../src/models/ProjectSnag.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import type { FileStorage } from "../src/storage/storage.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const deps = { audit: createAuditService(createMemoryRepository()), now: () => lifecycleAt };
const bytes = Buffer.from("Synthetic inspection document"); const digest = createHash("sha256").update(bytes).digest("hex");
const storage = (): FileStorage => ({ save: vi.fn(), saveGenerated: vi.fn(), read: vi.fn(async () => bytes), delete: vi.fn(), open: vi.fn(async () => Readable.from([bytes])) });
const pm = createProjectManagerClientService(deps);
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-finding-origin-evidence"); for (const model of [ProcurementFindingModel, ProcurementLifecycleEvidenceModel, ProjectSnagModel, ProjectManagerEventModel, AuditEventModel]) await model.syncIndexes(); }, 120000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });
async function fixture(kind: "inspection" | "handover" | "urgent" = "inspection") {
  const f = await seedLifecycleFixture(); const evidenceId = "origin-evidence", entityId = "inspection-origin", findingId = "origin-finding";
  const evidenceEntityId = kind === "handover" ? handoverEvidenceEntityId(f.projectId) : entityId;
  await ProcurementLifecycleEvidenceModel.create({ _id: evidenceId, projectId: f.projectId, entityId: evidenceEntityId, purpose: kind === "inspection" ? "inspection" : "handover", uploaderId: f.buyer.id, storageReference: "opaque-origin-file", originalFilename: "Inspection.pdf", mimeType: "application/pdf", kind: "document", byteSize: bytes.length, sha256: digest, createdAt: lifecycleAt });
  await lcTransaction(async session => {
    const source = await readLifecycleSource(f.projectId, session);
    await recordLifecycleFindingInSession({ ...deps, createFindingInSession: createLifecycleFindingBridge(deps) }, { actor: f.buyer, projectId: f.projectId, findingId, sourceItem: source.items[2]!, title: "Damaged fitting", note: "Inspection found damage requiring repair", ownerId: f.buyer.id, dueAt: "2026-12-01T06:00:00Z", evidenceIds: [evidenceId], evidenceEntityId, origin: { kind, entityId: kind === "handover" ? findingId : entityId }, sourceDigest: source.digest }, session);
  });
  const finding = await ProcurementFindingModel.findById(findingId).lean(); return { ...f, evidenceId, entityId, findingId, snagId: finding!.snagId };
}
describe("Site Manager access to Procurement finding evidence", () => {
  it("projects and streams reciprocal origin evidence without treating it as PM repair evidence", async () => {
    const f = await fixture(); const files = storage(); const reader = createProcurementFindingEvidenceService(files);
    const item = (await pm.snagging(f.manager, f.projectId)).items[0]!;
    expect(item.evidenceIds).toEqual([]); expect(item.procurementOrigin).toEqual({ findingId: f.findingId, kind: "inspection", evidence: [{ id: f.evidenceId, name: "Inspection.pdf", mimeType: "application/pdf", kind: "document" }] });
    expect(JSON.stringify(item)).not.toContain("opaque-origin-file"); expect(JSON.stringify(item)).not.toContain(digest);
    const download = await reader.read(f.manager, f.projectId, f.snagId, f.evidenceId); const chunks: Buffer[] = []; for await (const chunk of download.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes); expect(download.filename).toBe("Inspection.pdf"); expect(files.open).toHaveBeenCalledTimes(2);
    expect((await pm.snagging(f.client, f.projectId)).items[0]!.procurementOrigin).toBeUndefined();
  });
  it("denies unrelated projects, roles, detached attachments, and wrong purpose before opening storage", async () => {
    const f = await fixture(); const other = await seedLifecycleFixture("other"); const files = storage(); const reader = createProcurementFindingEvidenceService(files);
    for (const actor of [other.manager, f.buyer, f.finance, f.client]) await expect(reader.read(actor, f.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 404 });
    await expect(reader.read(f.manager, other.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 404 });
    await expect(reader.read(f.manager, f.projectId, f.snagId, "unlinked-file")).rejects.toMatchObject({ status: 404 });
    await ProcurementLifecycleEvidenceModel.collection.updateOne({ _id: f.evidenceId }, { $set: { purpose: "payment" } });
    await expect(reader.read(f.manager, f.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 404 });
    expect((await pm.snagging(f.manager, f.projectId)).items[0]!.procurementOrigin!.evidence).toEqual([]); expect(files.open).not.toHaveBeenCalled();
  });
  it("rejects broken reciprocal linkage and preserves exact handover origin ownership", async () => {
    const f = await fixture("handover"); const files = storage(); const reader = createProcurementFindingEvidenceService(files);
    const valid = await reader.read(f.manager, f.projectId, f.snagId, f.evidenceId); valid.stream.destroy();
    await ProcurementLifecycleEvidenceModel.collection.updateOne({ _id: f.evidenceId }, { $set: { entityId: "another-handover" } });
    await expect(reader.read(f.manager, f.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 404 });
    await ProcurementFindingModel.collection.updateOne({ _id: f.findingId }, { $set: { snagId: "another-snag" } });
    expect((await pm.snagging(f.manager, f.projectId)).items[0]!.procurementOrigin).toBeUndefined();
  });
  it("rechecks current project assignment after opening and destroys the stream on revocation", async () => {
    const f = await fixture(); const other = await seedLifecycleFixture("other"); const files = storage(); let opens = 0; let finalStream: Readable | null = null;
    files.open = vi.fn(async () => {
      const stream = Readable.from([bytes]);
      if (++opens === 2) {
        finalStream = stream;
        await ProjectModel.updateOne({ _id: f.projectId }, { $set: { programManagerId: other.manager.id } });
        await ProjectWorkflowTaskModel.updateOne({ _id: `${f.projectId}-site_execution` }, { $set: { assigneeUserId: other.manager.id } });
      }
      return stream;
    });
    await expect(createProcurementFindingEvidenceService(files).read(f.manager, f.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 404 });
    expect((finalStream as Readable | null)?.destroyed).toBe(true);
  });
  it("verifies stored bytes before returning a download", async () => {
    const f = await fixture(); const files = storage(); files.open = vi.fn(async () => Readable.from([Buffer.from("changed")]));
    await expect(createProcurementFindingEvidenceService(files).read(f.manager, f.projectId, f.snagId, f.evidenceId)).rejects.toMatchObject({ status: 409, code: "WORKFLOW_MEDIA_CHANGED" });
  });
});
