import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedLifecycleFixture } from "./fixtures/procurement-lifecycle.js";
import { createLifecycleEvidenceService, assertLifecycleEvidence } from "../src/services/procurement-lifecycle/evidence.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { ProcurementLifecycleEvidenceModel, ProcurementLifecycleEvidenceCleanupModel } from "../src/models/ProcurementLifecycleEvidence.js";
import { createProcurementLifecycleScheduler } from "../src/services/procurement-lifecycle-scheduler.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import type { FileStorage, SaveFileInput } from "../src/storage/storage.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("lifecycle-evidence"); await ProcurementLifecycleEvidenceModel.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear()); afterAll(async () => replica?.stop());
const proof = { data: Buffer.from("%PDF-1.7\nSynthetic evidence"), extension: ".pdf" as const, originalFilename: "receipt.pdf", mimeType: "application/pdf" as const, sizeBytes: 27 };
function memoryFiles(onSave?: () => Promise<void>) {
  const files = new Map<string, Buffer>(); let sequence = 0;
  const save = async (input: SaveFileInput) => { const reference = `opaque-${++sequence}`; files.set(reference, input.data); await onSave?.(); return { reference }; };
  const storage: FileStorage = { save, saveGenerated: save, read: async id => files.get(id)!, open: async id => Readable.from(files.get(id)!), delete: async id => { files.delete(id); } };
  return { storage, files };
}
describe("private lifecycle evidence", () => {
  it("automatically retries failed compensation without stopping the reminder sweep", async () => {
    const a = await seedLifecycleFixture("cleanup");
    const { storage, files } = memoryFiles(async () => { await ProjectWorkflowTaskModel.updateOne({ _id: `${a.projectId}-procurement` }, { $set: { assigneeUserId: "replacement" } }); });
    const deleteFile = storage.delete; let failDelete = true;
    storage.delete = async id => { if (failDelete) { failDelete = false; throw new Error("Temporary storage failure"); } await deleteFile(id); };
    const service = createLifecycleEvidenceService(storage);
    await expect(service.upload(a.buyer, a.projectId, { entityId: "visit", purpose: "inspection" }, [], proof)).rejects.toMatchObject({ status: 404 });
    expect(files.size).toBe(1); expect(await ProcurementLifecycleEvidenceCleanupModel.countDocuments()).toBe(1);
    let failCleanup = true;
    const scheduler = createProcurementLifecycleScheduler({ audit: createAuditService(createMemoryRepository()), cleanupEvidence: async () => {
      if (failCleanup) { failCleanup = false; throw new Error("Temporary cleanup connection failure"); }
      await service.cleanupBatch();
    } });
    await expect(scheduler.runOnce()).resolves.toMatchObject({ acquired: true });
    expect(files.size).toBe(1);
    await scheduler.runOnce();
    expect(files.size).toBe(0); expect(await ProcurementLifecycleEvidenceCleanupModel.countDocuments()).toBe(0);
  });
  it("deduplicates uploads while isolating project, record, purpose and active assignment", async () => {
    const a = await seedLifecycleFixture("a"), b = await seedLifecycleFixture("b");
    const { storage, files } = memoryFiles(); const service = createLifecycleEvidenceService(storage);
    const first = await service.upload(a.buyer, a.projectId, { entityId: "transfer-a", purpose: "payment" }, [], proof);
    expect(first.items).toHaveLength(1); expect(JSON.stringify(first)).not.toMatch(/opaque-|sha256|storageReference/);
    expect(await service.upload(a.buyer, a.projectId, { entityId: "transfer-a", purpose: "payment" }, [], proof)).toEqual(first);
    expect(files.size).toBe(1); const id = first.items[0]!.id;
    await expect(service.read(b.buyer, a.projectId, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.read(a.manager, a.projectId, id)).rejects.toMatchObject({ status: 404 });
    await expect(lcTransaction(s => assertLifecycleEvidence(a.projectId, "another-transfer", [id], s, "payment"))).rejects.toMatchObject({ status: 409 });
    await expect(lcTransaction(s => assertLifecycleEvidence(a.projectId, "transfer-a", [id], s, "inspection"))).rejects.toMatchObject({ status: 409 });
    const download = await service.read(a.finance, a.projectId, id); const bytes: Buffer[] = []; for await (const chunk of download.stream) bytes.push(Buffer.from(chunk));
    expect(Buffer.concat(bytes)).toEqual(proof.data);
    await ProjectWorkflowTaskModel.updateOne({ _id: `${a.projectId}-procurement` }, { $set: { assigneeUserId: b.buyer.id } });
    await expect(service.read(a.buyer, a.projectId, id)).rejects.toMatchObject({ status: 404 });
  });
  it("cleans uploaded bytes if assignment is revoked before metadata persists", async () => {
    const a = await seedLifecycleFixture();
    const { storage, files } = memoryFiles(async () => { await ProjectWorkflowTaskModel.updateOne({ _id: `${a.projectId}-procurement` }, { $set: { assigneeUserId: "replacement" } }); });
    await expect(createLifecycleEvidenceService(storage).upload(a.buyer, a.projectId, { entityId: "visit", purpose: "inspection" }, [], proof)).rejects.toMatchObject({ status: 404 });
    expect(files.size).toBe(0); expect(await ProcurementLifecycleEvidenceModel.countDocuments()).toBe(0);
  });
  it("rejects corrupted stored bytes before returning a stream", async () => {
    const a = await seedLifecycleFixture(); const { storage, files } = memoryFiles(); const service = createLifecycleEvidenceService(storage);
    const result = await service.upload(a.buyer, a.projectId, { entityId: "visit", purpose: "inspection" }, [], proof);
    files.set([...files.keys()][0]!, Buffer.from("corrupted"));
    await expect(service.read(a.buyer, a.projectId, result.items[0]!.id)).rejects.toMatchObject({ code: "WORKFLOW_MEDIA_CHANGED" });
  });
});
