import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { lifecycleAt, seedLifecycleFixture } from "./fixtures/procurement-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProcurementLifecycleService } from "../src/services/procurement-lifecycle.service.js";
import { createProcurementProgressService } from "../src/services/procurement-progress.service.js";
import { createProcurementInspectionsService, readInspectionReadiness } from "../src/services/procurement-inspections.service.js";
import { createLifecycleFindingBridge } from "../src/services/procurement-lifecycle/findings-bridge.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { ProcurementInspectionPlanModel } from "../src/models/ProcurementInspectionPlan.js";
import { ProcurementInspectionVisitModel } from "../src/models/ProcurementInspectionVisit.js";
import { ProcurementLifecycleStateModel } from "../src/models/ProcurementLifecycleState.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { ProcurementReviewRoundModel } from "../src/models/ProcurementReviewRound.js";
import { ProcurementFindingModel } from "../src/models/ProcurementFinding.js";
import { ProjectSnagModel } from "../src/models/ProjectSnag.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { ProcurementLifecycleEvidenceModel } from "../src/models/ProcurementLifecycleEvidence.js";
import type { ProcurementInspectionPage } from "../src/contracts/procurement-inspections.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let at = lifecycleAt; let serial = 0;
const random = vi.fn(() => 0.5);
const deps = { audit: createAuditService(createMemoryRepository()), now: () => at };
const lifecycle = createProcurementLifecycleService(deps);
const service = createProcurementInspectionsService({ ...deps, random, createFindingInSession: createLifecycleFindingBridge(deps) });
const key = () => `inspection-test-command-${++serial}`;
const windows = [
  { id: "morning", startsAt: "2026-11-27T07:00:00.000Z", endsAt: "2026-11-27T08:00:00.000Z" },
  { id: "afternoon", startsAt: "2026-11-27T09:00:00.000Z", endsAt: "2026-11-27T10:00:00.000Z" },
  { id: "evening", startsAt: "2026-11-27T11:00:00.000Z", endsAt: "2026-11-27T12:00:00.000Z" }
];
async function setup(count: 2 | 3 = 2) {
  const fixture = await seedLifecycleFixture();
  const summary = await lifecycle.get(fixture.buyer, fixture.projectId);
  await lifecycle.setup(fixture.buyer, fixture.projectId, { expectedVersion: 0, sourceDigest: summary.sourceDigest, idempotencyKey: key(), policy: { timezone: "Asia/Kolkata", reviewIntervalDays: 7, inspectionCount: 2 }, reason: "Start project inspections" });
  const planInput = { expectedVersion: 0, sourceDigest: summary.sourceDigest, idempotencyKey: key(), count, windows: windows.slice(0, count), reason: "Inspect staged one-day work" };
  const page = await service.plan(fixture.buyer, fixture.projectId, planInput);
  return { ...fixture, page, planInput, itemIds: summary.source.items.map(item => item.id) };
}
const visitInput = (page: ProcurementInspectionPage, slotId: string | null, itemIds: string[], extra: Record<string, unknown> = {}) => ({ expectedVersion: page.plan!.version, sourceDigest: page.sourceDigest, idempotencyKey: key(), visitId: `visit-${serial}`, slotId, inspectedAt: at.toISOString(), itemIds, notes: `Physical visit ${serial}: inspected fitting and clearances`, ...extra });
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-inspection-regression");
  for (const model of [ProcurementInspectionPlanModel, ProcurementInspectionVisitModel, ProcurementLifecycleStateModel, ProcurementLifecycleCommandModel, ProcurementReviewRoundModel, ProcurementFindingModel, ProjectSnagModel, ProjectManagerEventModel, AuditEventModel, ProcurementLifecycleEvidenceModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => { await replica.clear(); at = new Date(lifecycleAt); serial = 0; random.mockClear(); });
afterAll(async () => { await replica?.stop(); });

describe("project-wide physical inspections", () => {
  it("persists randomness across retries and reasoned unchanged-window plans", async () => {
    const f = await setup(); expect(random).toHaveBeenCalledTimes(2);
    expect(f.page.plan!.slots.map(slot => slot.plannedAt)).toEqual(["2026-11-27T07:30:00.000Z", "2026-11-27T09:30:00.000Z"]);
    expect(await service.plan(f.buyer, f.projectId, f.planInput)).toEqual(f.page); expect(random).toHaveBeenCalledTimes(2);
    const again = await service.plan(f.buyer, f.projectId, { ...f.planInput, expectedVersion: 1, idempotencyKey: key(), reason: "Confirm original planned windows" });
    expect(again.plan!.slots).toEqual(f.page.plan!.slots); expect(random).toHaveBeenCalledTimes(2);
    expect((await ProcurementInspectionPlanModel.findOne({ projectId: f.projectId }).lean())!.revisions).toHaveLength(2);
    await expect(service.plan(f.buyer, f.projectId, { ...f.planInput, expectedVersion: 2, idempotencyKey: key(), windows: windows.slice(0, 2).map(window => ({ ...window, id: `renamed-${window.id}` })), reason: "Try to regenerate original deadlines" })).rejects.toMatchObject({ status: 409 });
  });

  it("counts multi-item visits once and requires all three planned slots despite additional visits", async () => {
    const f = await setup(3); expect((await ProcurementLifecycleStateModel.findById(f.projectId).lean())!.policy.inspectionCount).toBe(3);
    at = new Date("2026-11-27T07:20:00Z"); const first = await service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds)); expect(first.items).toHaveLength(3);
    at = new Date("2026-11-27T09:20:00Z"); await service.record(f.buyer, f.projectId, visitInput(f.page, "afternoon", f.itemIds));
    at = new Date("2026-11-27T10:20:00Z"); await service.record(f.buyer, f.projectId, visitInput(f.page, null, [f.itemIds[0]!]));
    expect((await service.list(f.buyer, f.projectId)).completedCount).toBe(2);
    expect(await lcTransaction(s => readInspectionReadiness(f.projectId, s, at))).toMatchObject({ ready: false, blockers: [expect.objectContaining({ code: "INSPECTION_REQUIRED", entityId: "evening" })] });
    await expect(service.plan(f.buyer, f.projectId, { ...f.planInput, expectedVersion: 1, idempotencyKey: key(), count: 2, windows: windows.slice(0, 2), reason: "Try to lower inspection requirement" })).rejects.toMatchObject({ status: 409 });
    at = new Date("2026-11-27T11:20:00Z"); await service.record(f.buyer, f.projectId, visitInput(f.page, "evening", f.itemIds));
    expect(await lcTransaction(s => readInspectionReadiness(f.projectId, s, at))).toMatchObject({ ready: true });
    const page = await service.list(f.buyer, f.projectId); expect(page.completedCount).toBe(3); expect(page.total).toBe(4);
  });

  it("preserves original planned lateness through rescheduling and backdated recording", async () => {
    const f = await setup(); at = new Date("2026-11-27T08:30:00Z");
    const page = await service.plan(f.buyer, f.projectId, { ...f.planInput, expectedVersion: 1, idempotencyKey: key(), windows: [{ ...windows[0], startsAt: "2026-11-27T08:40:00Z", endsAt: "2026-11-27T08:50:00Z" }, windows[1]], reason: "Delayed site access after original visit was missed" });
    expect(page.plan!.slots[0]).toMatchObject({ originalPlannedAt: "2026-11-27T07:30:00.000Z", plannedAt: "2026-11-27T08:45:00.000Z", late: true });
    at = new Date("2026-11-27T10:00:00Z");
    const visit = await service.record(f.buyer, f.projectId, visitInput(page, "morning", f.itemIds, { inspectedAt: "2026-11-27T08:42:00Z" }));
    expect(visit).toMatchObject({ late: true, inspectedAt: "2026-11-27T08:42:00.000Z", recordedAt: at.toISOString() });
  });

  it("appends corrections, retains original notes, and changes the signoff snapshot without increasing quota", async () => {
    const f = await setup(); at = new Date("2026-11-27T07:20:00Z");
    const input = visitInput(f.page, "morning", f.itemIds); const original = await service.record(f.buyer, f.projectId, input);
    const before = await lcTransaction(s => readInspectionReadiness(f.projectId, s, at));
    const correction = await service.correct(f.buyer, f.projectId, original.id, { expectedVersion: 1, sourceDigest: f.page.sourceDigest, idempotencyKey: key(), correctionId: "corrected-visit", reason: "Clarify the measured clearance", inspectedAt: original.inspectedAt, itemIds: f.itemIds, notes: "Clearance was 22 mm, measured on the same visit" });
    expect(correction).toMatchObject({ revision: 2, correctionOf: original.id, inspectedAt: original.inspectedAt });
    expect(await ProcurementInspectionVisitModel.findById(original.id).lean()).toMatchObject({ notes: input.notes, revision: 1 });
    await expect(ProcurementInspectionVisitModel.updateOne({ _id: original.id }, { $set: { notes: "Rewrite original notes" } })).rejects.toThrow("immutable");
    expect((await service.list(f.buyer, f.projectId)).completedCount).toBe(1);
    const after = await lcTransaction(s => readInspectionReadiness(f.projectId, s, at)); expect(after.sourceDigest).not.toBe(before.sourceDigest); expect(after.references.inspectionVisitIds).toEqual([correction.id]);
    await expect(service.correct(f.buyer, f.projectId, original.id, { expectedVersion: 1, sourceDigest: f.page.sourceDigest, idempotencyKey: key(), correctionId: "stale-correction", reason: "Stale note correction", inspectedAt: original.inspectedAt, itemIds: f.itemIds, notes: "Stale notes" })).rejects.toMatchObject({ status: 409 });
  });

  it("records P3 defects before any P1 check and atomically creates one canonical snag", async () => {
    const f = await setup(); at = new Date("2026-11-27T07:20:00Z");
    const input = visitInput(f.page, "morning", [f.itemIds[2]!], { findings: [{ id: "inspection-finding-1", itemId: f.itemIds[2], title: "Damaged fixing", note: "Bracket is fractured and needs replacement", ownerId: f.buyer.id, dueAt: "2026-11-28T06:00:00Z", evidenceIds: [] }] });
    const visit = await service.record(f.buyer, f.projectId, input); expect(visit.findings[0]!.snagId).toBeTruthy();
    expect(await service.record(f.buyer, f.projectId, input)).toEqual(visit);
    expect(await ProjectSnagModel.countDocuments({ projectId: f.projectId })).toBe(1); expect(await ProcurementFindingModel.countDocuments({ projectId: f.projectId })).toBe(1);
    expect((await createProcurementProgressService(deps).list(f.buyer, f.projectId)).current!.checkedCount).toBe(0);
  });

  it("rejects foreign evidence, future or duplicate occurrences, and out-of-scope actors", async () => {
    const f = await setup(); at = new Date("2026-11-27T07:20:00Z"); const other = await seedLifecycleFixture("other");
    await expect(service.list(other.buyer, f.projectId)).rejects.toMatchObject({ status: 404 });
    await expect(service.list(f.finance, f.projectId)).rejects.toMatchObject({ status: 404 });
    await expect(service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds, { inspectedAt: "2026-11-27T07:30:00Z" }))).rejects.toMatchObject({ status: 409 });
    await ProcurementLifecycleEvidenceModel.collection.insertOne({ _id: "foreign-inspection-file", projectId: other.projectId, entityId: "foreign-visit", purpose: "inspection", referenceEpoch: 0 } as any);
    await expect(service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds, { evidenceIds: ["foreign-inspection-file"] }))).rejects.toMatchObject({ status: 409 });
    expect(await ProcurementInspectionVisitModel.countDocuments()).toBe(0);
    await service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds));
    await expect(service.record(f.buyer, f.projectId, visitInput(f.page, null, f.itemIds))).rejects.toMatchObject({ status: 409 });
    at = new Date("2026-11-27T07:21:00Z");
    await expect(service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds))).rejects.toMatchObject({ status: 409 });
  });

  it("requires source reconciliation without redrawing stored inspection dates and keeps GET pure", async () => {
    const f = await setup(); await AiEstimatorKnowledgeSectionModel.updateOne({ _id: `${f.lines[0]!.mainLineId}-overview` }, { $set: { "payload.closurePriority": "P2" } });
    const page = await service.list(f.buyer, f.projectId); expect(page.blockers.some(blocker => blocker.code === "INSPECTION_SOURCE_CHANGED")).toBe(true);
    await lcTransaction(s => readInspectionReadiness(f.projectId, s, at));
    expect((await ProcurementInspectionPlanModel.findOne({ projectId: f.projectId }).lean())!.version).toBe(1);
    const reconciled = await service.plan(f.buyer, f.projectId, { ...f.planInput, sourceDigest: page.sourceDigest, expectedVersion: 1, idempotencyKey: key(), reason: "Confirm coverage against current Configuration" });
    expect(random).toHaveBeenCalledTimes(2); expect(reconciled.plan!.slots).toEqual(f.page.plan!.slots);
    expect(reconciled.blockers.some(blocker => blocker.code === "INSPECTION_SOURCE_CHANGED")).toBe(false);
  });

  it("allows only one concurrent occurrence to consume a planned slot", async () => {
    const f = await setup(); at = new Date("2026-11-27T07:20:00Z");
    const outcomes = await Promise.allSettled([
      service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds)),
      service.record(f.buyer, f.projectId, visitInput(f.page, "morning", f.itemIds, { inspectedAt: "2026-11-27T07:19:00Z" }))
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await ProcurementInspectionVisitModel.countDocuments()).toBe(1);
  });
});
