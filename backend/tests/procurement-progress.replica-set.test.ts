import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { lifecycleAt, seedLifecycleFixture } from "./fixtures/procurement-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProcurementLifecycleService } from "../src/services/procurement-lifecycle.service.js";
import { createProcurementProgressService, ensureReviewRoundInSession, readReviewReadiness } from "../src/services/procurement-progress.service.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { ProcurementReviewRoundModel } from "../src/models/ProcurementReviewRound.js";
import { ProcurementProgressCheckModel } from "../src/models/ProcurementProgressCheck.js";
import { ProcurementLifecycleStateModel } from "../src/models/ProcurementLifecycleState.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { ProjectModel } from "../src/models/Project.js";
import type { ProcurementReviewDetail, ProcurementReviewRound } from "../src/contracts/procurement-progress.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let at = lifecycleAt; let serial = 0;
const deps = { audit: createAuditService(createMemoryRepository()), now: () => at };
const lifecycle = createProcurementLifecycleService(deps);
const service = createProcurementProgressService(deps);
const key = () => `progress-test-command-${++serial}`;
const observed = (extra: Record<string, unknown> = {}) => ({ checkedAt: at.toISOString(), status: "not_started", progress: 0, notes: "Procurement checked the current work", nextAction: "Confirm vendor start", nextCheckDate: at.toISOString().slice(0, 10), ...extra });
async function setup(suffix = "a") {
  const fixture = await seedLifecycleFixture(suffix);
  const summary = await lifecycle.get(fixture.buyer, fixture.projectId);
  await lifecycle.setup(fixture.buyer, fixture.projectId, { expectedVersion: 0, sourceDigest: summary.sourceDigest, idempotencyKey: key(), policy: { timezone: "Asia/Kolkata", reviewIntervalDays: 7, inspectionCount: 2 }, reason: "Start procurement lifecycle" });
  const page = await service.list(fixture.buyer, fixture.projectId);
  return { ...fixture, round: page.current! };
}
const command = (round: ProcurementReviewRound, action: string, extra: Record<string, unknown> = {}) => ({ action, roundId: round.id, expectedVersion: round.version, sourceDigest: round.currentSourceDigest, idempotencyKey: key(), ...extra });
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-review-regression");
  for (const model of [ProcurementReviewRoundModel, ProcurementProgressCheckModel, ProcurementLifecycleStateModel, ProcurementLifecycleCommandModel, AuditEventModel]) await model.syncIndexes();
}, 120000);
beforeEach(async () => { await replica.clear(); at = new Date(lifecycleAt); serial = 0; });
afterAll(async () => { await replica?.stop(); });

describe("transactional Procurement progress rounds", () => {
  it("records checks in priority order without requiring completed work, then freezes the signed round", async () => {
    const f = await setup(); let round: ProcurementReviewRound = f.round;
    const [p1, p2, p3] = round.members;
    await expect(service.command(f.buyer, f.projectId, command(round, "check", { itemId: p2!.item.id, observation: observed() }))).rejects.toMatchObject({ status: 409 });
    const input = command(round, "check", { itemId: p1!.item.id, observation: observed({ status: "blocked", delayReason: "Materials awaited", responsibleParty: "Vendor", recoveryAction: "Expedite transport", recoveryDate: "2026-11-30" }) });
    const first = await service.command(f.buyer, f.projectId, input); expect(await service.command(f.buyer, f.projectId, input)).toEqual(first);
    expect(first.members[1]!.canCheck).toBe(true); round = first;
    const firstCheck = first.members[0]!.check!;
    round = await service.command(f.buyer, f.projectId, command(round, "correct", { itemId: p1!.item.id, checkId: firstCheck.id, reason: "Supplier confirmed delivery", observation: observed({ notes: "Delivery confirmed for tomorrow" }) }));
    expect(await ProcurementProgressCheckModel.findById(firstCheck.id).lean()).toMatchObject({ notes: "Procurement checked the current work", status: "blocked" });
    expect((round as ProcurementReviewDetail).checks).toHaveLength(2);
    round = await service.command(f.buyer, f.projectId, command(round, "check", { itemId: p2!.item.id, observation: observed() }));
    round = await service.command(f.buyer, f.projectId, command(round, "check", { itemId: p3!.item.id, observation: observed() }));
    round = await service.command(f.buyer, f.projectId, command(round, "finalize", { notes: "Current weekly review complete" }));
    expect(round.status).toBe("submitted");
    expect(await lcTransaction(s => readReviewReadiness(f.projectId, s, at))).toMatchObject({ ready: true });
    await expect(service.command(f.buyer, f.projectId, command(round, "reconcile", { reason: "Try to replace the signed scope" }))).rejects.toMatchObject({ status: 409 });
    await expect(ProcurementProgressCheckModel.updateOne({ _id: firstCheck.id }, { $set: { notes: "Rewrite an earlier note" } })).rejects.toThrow("immutable");
    await AiEstimatorKnowledgeSectionModel.updateOne({ _id: `${f.lines[0]!.mainLineId}-overview` }, { $set: { "payload.closurePriority": "P2" } });
    const changed = await service.list(f.buyer, f.projectId);
    const replacement = await service.command(f.buyer, f.projectId, { action: "open", expectedVersion: 0, sourceDigest: changed.sourceDigest, idempotencyKey: key() });
    expect(replacement.sequence).toBe(2); expect(replacement.checkedCount).toBe(0);
    expect(await ProcurementReviewRoundModel.findById(round.id).lean()).toMatchObject({ status: "submitted", version: round.version });
  });

  it("serializes concurrent P1/P2 requests and rejects stale versions without duplicate observations", async () => {
    const f = await setup(); const round = f.round;
    const results = await Promise.allSettled([
      service.command(f.buyer, f.projectId, command(round, "check", { itemId: round.members[0]!.item.id, observation: observed() })),
      service.command(f.buyer, f.projectId, command(round, "check", { itemId: round.members[1]!.item.id, observation: observed() }))
    ]);
    expect(results[0]!.status).toBe("fulfilled"); expect(results[1]!.status).toBe("rejected");
    expect(await ProcurementProgressCheckModel.countDocuments({ projectId: f.projectId })).toBe(1);
    await expect(service.command(f.buyer, f.projectId, command(round, "check", { itemId: round.members[0]!.item.id, observation: observed() }))).rejects.toMatchObject({ status: 409 });
  });

  it("reconciles saved draft priority changes and keeps prior observations immutable", async () => {
    const f = await setup(); let round = await service.command(f.buyer, f.projectId, command(f.round, "check", { itemId: f.round.members[0]!.item.id, observation: observed() }));
    const saved = round.members[0]!.check!; const mainLineId = f.lines[0]!.mainLineId;
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `${mainLineId}-draft`, mainLineId, status: "draft", version: 2 } as any);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: `${mainLineId}-draft-overview`, mainLineId, revisionId: `${mainLineId}-draft`, sectionKey: "overview", payload: { closurePriority: "P3" } } as any);
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: mainLineId }, { $set: { draftRevisionId: `${mainLineId}-draft` }, $inc: { version: 1 } });
    const changed = (await service.list(f.buyer, f.projectId)).current!;
    expect(changed.sourceChanged).toBe(true);
    await expect(service.command(f.buyer, f.projectId, command(round, "check", { itemId: round.members[1]!.item.id, observation: observed() }))).rejects.toMatchObject({ status: 409 });
    round = await service.command(f.buyer, f.projectId, command(changed, "reconcile", { reason: "Use current saved Configuration priorities" }));
    const moved = round.members.find(member => member.item.id === saved.itemId)!;
    expect(moved.item.priority).toBe("P3"); expect(moved.check).toBeNull(); expect(round.checks).toHaveLength(1);
    expect(await ProcurementProgressCheckModel.findById(saved.id).lean()).toMatchObject({ sourceDigest: saved.sourceDigest });
    expect(round.members.find(member => member.item.priority === "P2")!.canCheck).toBe(true);
  });

  it("keeps reads pure, schedules missed history, and starts a fresh current round", async () => {
    const f = await setup(); at = new Date("2026-12-19T06:00:00Z");
    const before = await ProcurementReviewRoundModel.countDocuments();
    const page = await service.list(f.buyer, f.projectId);
    expect(page.current).toMatchObject({ sequence: 4, version: 0, status: "open" });
    await lcTransaction(s => readReviewReadiness(f.projectId, s, at));
    expect(await ProcurementReviewRoundModel.countDocuments()).toBe(before);
    await lcTransaction(s => ensureReviewRoundInSession(f.projectId, s, at));
    const scheduled = await service.list(f.buyer, f.projectId);
    expect(scheduled.current).toMatchObject({ sequence: 4, version: 1, status: "open" });
    expect(scheduled.items.filter(round => round.status === "missed")).toHaveLength(3);
    expect(scheduled.current!.members).toHaveLength(3);
  });

  it("preserves original deadlines and does not erase lateness with a retrospective pause or backdated observation", async () => {
    const f = await setup(); let round = f.round;
    at = new Date("2026-11-28T06:00:00Z");
    round = await service.command(f.buyer, f.projectId, command(round, "pause", { reason: "Site temporarily inaccessible" }));
    at = new Date("2026-11-30T06:00:00Z");
    round = await service.command(f.buyer, f.projectId, command(round, "resume", { reason: "Site access restored" }));
    expect(round.originalDueAt).toBe("2026-12-04T06:00:00.000Z"); expect(round.effectiveDueAt).toBe("2026-12-06T06:00:00.000Z");
    at = new Date("2026-12-07T06:00:00Z");
    round = await service.command(f.buyer, f.projectId, command(round, "pause", { reason: "Late access restriction recorded" }));
    at = new Date("2026-12-08T06:00:00Z");
    round = await service.command(f.buyer, f.projectId, command(round, "resume", { reason: "Access restored after miss" }));
    expect(round.effectiveDueAt).toBe("2026-12-06T06:00:00.000Z");
    round = await service.command(f.buyer, f.projectId, command(round, "check", { itemId: round.members[0]!.item.id, observation: observed({ checkedAt: "2026-12-05T06:00:00Z", nextCheckDate: "2026-12-08" }) }));
    expect(round.members[0]!.check).toMatchObject({ late: true, checkedAt: "2026-12-05T06:00:00.000Z", submittedAt: at.toISOString() });
  });

  it("denies another project's assignee and suppresses all editing after project completion", async () => {
    const f = await setup(); const other = await seedLifecycleFixture("other");
    await expect(service.list(other.buyer, f.projectId)).rejects.toMatchObject({ status: 404 });
    await expect(service.list(f.finance, f.projectId)).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: f.projectId }, { $set: { status: "completed" } });
    const detail = await service.get(f.buyer, f.projectId, f.round.id); expect(detail.allowedActions).toEqual([]); expect(detail.members.some(member => member.canCheck)).toBe(false);
    await expect(service.command(f.buyer, f.projectId, command(f.round, "pause", { reason: "Post-closeout mutation" }))).rejects.toMatchObject({ status: 409 });
  });
});
