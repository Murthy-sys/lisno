import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { lifecycleAt } from "./fixtures/procurement-lifecycle.js";
import { alertModels, seedNotificationFixture } from "./fixtures/procurement-notifications.js";
import { createProcurementLifecycleScheduler } from "../src/services/procurement-lifecycle-scheduler.service.js";
import { createProcurementLifecycleNotificationsService, PROCUREMENT_SCHEDULER_ID } from "../src/services/procurement-lifecycle-notifications.service.js";
import { createProcurementInspectionsService } from "../src/services/procurement-inspections.service.js";
import { createProcurementProgressService } from "../src/services/procurement-progress.service.js";
import { createProcurementFindingsService } from "../src/services/procurement-findings.service.js";
import { createLifecycleFindingBridge } from "../src/services/procurement-lifecycle/findings-bridge.js";
import { ProcurementLifecycleNotificationModel } from "../src/models/ProcurementLifecycleNotification.js";
import { ProcurementLifecycleSchedulerLeaseModel } from "../src/models/ProcurementLifecycleSchedulerLease.js";
import { ProcurementReviewRoundModel } from "../src/models/ProcurementReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProcurementLifecycleStateModel } from "../src/models/ProcurementLifecycleState.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let at = new Date(lifecycleAt); const now = () => at;
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-lifecycle-alert-scheduler"); for (const model of alertModels) await model.syncIndexes(); }, 120000);
beforeEach(async () => { await replica.clear(); at = new Date(lifecycleAt); });
afterAll(async () => { await replica?.stop(); });
const notices = (projectId: string, kind: string) => ProcurementLifecycleNotificationModel.find({ projectId, kind }).lean();

describe("durable Procurement lifecycle alert scheduler", () => {
  it("does not create setup or payment obligations for a legacy completed project", async () => {
    const f = await seedNotificationFixture(now, "legacy");
    await ProcurementLifecycleStateModel.deleteOne({ projectId: f.projectId });
    await ProjectModel.updateOne({ _id: f.projectId }, { $set: { status: "completed" } });
    at = new Date("2027-01-15T06:00:00Z");
    const scheduler = createProcurementLifecycleScheduler(f.deps);
    await scheduler.runOnce();
    expect(await ProcurementLifecycleNotificationModel.countDocuments({ projectId: f.projectId })).toBe(0);
  });
  it("runs without a browser, deduplicates workers, and honors local reminder and expiry times", async () => {
    const f = await seedNotificationFixture(now); const a = createProcurementLifecycleScheduler(f.deps), b = createProcurementLifecycleScheduler(f.deps);
    at = new Date("2026-11-28T03:29:59Z"); await a.runOnce(); expect(await notices(f.projectId, "payment_upcoming")).toHaveLength(0);
    at = new Date("2026-11-28T03:30:00Z"); await Promise.all([a.runOnce(), b.runOnce()]); expect(await notices(f.projectId, "payment_upcoming")).toHaveLength(2);
    await a.runOnce(); expect(await notices(f.projectId, "payment_upcoming")).toHaveLength(2);
    at = new Date("2026-12-01T03:30:00Z"); await a.runOnce(); expect(await notices(f.projectId, "payment_due")).toHaveLength(2);
    at = new Date("2026-12-01T18:29:59Z"); await a.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(0);
    at = new Date("2026-12-01T18:30:00Z"); await a.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(2);
    await b.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(2);
    expect(await a.health()).toMatchObject({ status: "healthy", channel: "internal_feed", targetDelaySeconds: 900, backlog: 0 });
    expect(JSON.stringify(await a.health())).not.toContain("token");
  });

  it("recovers outages using one current overdue event per recipient/day", async () => {
    const f = await seedNotificationFixture(now); const scheduler = createProcurementLifecycleScheduler(f.deps);
    at = new Date("2026-12-09T06:00:00Z"); await scheduler.runOnce();
    expect(await notices(f.projectId, "payment_upcoming")).toHaveLength(0); expect(await notices(f.projectId, "payment_due")).toHaveLength(0);
    const rows = await notices(f.projectId, "payment_overdue"); expect(rows).toHaveLength(2); expect(rows[0]!.snapshot).toMatchObject({ daysOverdue: 8, remainingPaise: 54000 });
    await scheduler.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(2);
    at = new Date("2026-12-10T06:00:00Z"); await scheduler.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(4);
    expect(await ProcurementReviewRoundModel.countDocuments({ projectId: f.projectId, status: "missed" })).toBeGreaterThan(0);
  });

  it("persists partial-batch cursors and resumes after failure without duplicating committed alerts", async () => {
    const first = await seedNotificationFixture(now, "a"); await seedNotificationFixture(now, "b"); at = new Date("2026-12-02T06:00:00Z");
    let fail = true;
    const scheduler = createProcurementLifecycleScheduler({ ...first.deps, beforeProject: async id => { if (id.endsWith("b") && fail) throw new Error("Synthetic batch fault with private details"); } });
    await expect(scheduler.runOnce()).rejects.toThrow("Synthetic batch fault");
    expect(await ProcurementLifecycleSchedulerLeaseModel.findById(PROCUREMENT_SCHEDULER_ID).lean()).toMatchObject({ projectCursor: first.projectId, failureCode: "SCHEDULER_BATCH_FAILED" });
    expect(await notices(first.projectId, "payment_overdue")).toHaveLength(2);
    expect(await scheduler.health()).toMatchObject({ status: "degraded", backlog: 1, failureCode: "SCHEDULER_BATCH_FAILED" });
    fail = false; expect(await scheduler.runOnce()).toMatchObject({ processed: 1, wrapped: true });
    expect(await notices(first.projectId, "payment_overdue")).toHaveLength(2); expect(await notices("lifecycle-b", "payment_overdue")).toHaveLength(2);
  });

  it("rejects a live competing lease and discards work when its token expires", async () => {
    const f = await seedNotificationFixture(now); const scheduler = createProcurementLifecycleScheduler(f.deps);
    await ProcurementLifecycleSchedulerLeaseModel.create({ _id: PROCUREMENT_SCHEDULER_ID, token: "another-worker", expiresAt: new Date(at.getTime() + 5000), cadenceSeconds: 60 });
    expect(await scheduler.runOnce()).toMatchObject({ acquired: false });
    at = new Date(at.getTime() + 5001);
    let advance = true;
    const expiring = createProcurementLifecycleScheduler({ ...f.deps, leaseMs: 1000, beforeProject: async () => { if (advance) { at = new Date(at.getTime() + 1001); advance = false; } } });
    expect(await expiring.runOnce()).toMatchObject({ acquired: false, processed: 0 });
    expect(await ProcurementLifecycleNotificationModel.countDocuments()).toBe(0);
    expect(await expiring.health()).toMatchObject({ failureCode: "LEASE_EXPIRED" });
    expect(await expiring.runOnce()).toMatchObject({ acquired: true, processed: 1 });
  });

  it("rechecks settlement at publication and serves concurrent historical alerts as resolved", async () => {
    const f = await seedNotificationFixture(now); at = new Date("2026-12-02T06:00:00Z");
    let settle = true;
    const scheduler = createProcurementLifecycleScheduler({ ...f.deps, beforeProject: async () => { if (settle) { settle = false; await f.pay(); } } });
    await scheduler.runOnce(); expect(await notices(f.projectId, "payment_overdue")).toHaveLength(0);
    await f.paymentCommand({ action: "reverse", transactionId: "transfer-a", reason: "Bank reference was recorded incorrectly" });
    const outcomes = await Promise.all([scheduler.runOnce(), f.pay("replacement-transfer")]); expect(outcomes).toHaveLength(2);
    const page = await createProcurementLifecycleNotificationsService({ now }).list(f.buyer);
    expect(page.items.filter(item => item.kind === "payment_overdue" && item.status === "active")).toHaveLength(0);
    await scheduler.runOnce(); expect((await notices(f.projectId, "payment_overdue")).every(row => row.resolvedAt)).toBe(true);
  });

  it("keeps retained-payment reminders after closeout and stops new work-review obligations", async () => {
    const f = await seedNotificationFixture(now);
    const retained = await f.paymentCommand({ action: "approve_retention", milestoneId: "advance", amountPaise: 54000, dueDate: "2026-12-10", ownerId: f.finance.id, reason: "Approved warranty retention" });
    await f.paymentCommand({ action: "acknowledge_retention", retentionId: retained.milestones[0]!.retention!.id, reason: "Acknowledge ongoing retained liability" }, f.admin);
    const reviews = await ProcurementReviewRoundModel.countDocuments({ projectId: f.projectId });
    await ProjectModel.updateOne({ _id: f.projectId }, { $set: { status: "completed" } });
    at = new Date("2026-12-11T06:00:00Z"); await createProcurementLifecycleScheduler(f.deps).runOnce();
    expect(await notices(f.projectId, "payment_overdue")).toHaveLength(2);
    expect(await notices(f.projectId, "review_missed")).toHaveLength(0); expect(await notices(f.projectId, "inspection_setup")).toHaveLength(0);
    expect(await ProcurementReviewRoundModel.countDocuments({ projectId: f.projectId })).toBe(reviews);
  });

  it("derives missed reviews, overdue follow-ups, inspections, and canonical findings", async () => {
    const f = await seedNotificationFixture(now); const summary = await f.lifecycle.get(f.buyer, f.projectId);
    await createProcurementInspectionsService(f.deps).plan(f.buyer, f.projectId, { expectedVersion: 0, sourceDigest: summary.sourceDigest, idempotencyKey: "alert-inspection-plan", count: 2, windows: [{ id: "one", startsAt: "2026-11-28T06:00:00Z", endsAt: "2026-11-28T07:00:00Z" }, { id: "two", startsAt: "2026-11-29T06:00:00Z", endsAt: "2026-11-29T07:00:00Z" }], reason: "Inspect current vendor installation" });
    const reviews = createProcurementProgressService(f.deps); const round = (await reviews.list(f.buyer, f.projectId)).current!;
    await reviews.command(f.buyer, f.projectId, { action: "check", roundId: round.id, expectedVersion: round.version, sourceDigest: summary.sourceDigest, idempotencyKey: "alert-followup-check", itemId: round.members[0]!.item.id, observation: { checkedAt: at.toISOString(), status: "not_started", notes: "Vendor delivery awaited", nextAction: "Confirm delivery with vendor", nextCheckDate: "2026-11-28" } });
    await createProcurementFindingsService({ ...f.deps, createFindingInSession: createLifecycleFindingBridge(f.deps) }).report(f.buyer, f.projectId, { expectedVersion: 0, sourceDigest: summary.sourceDigest, idempotencyKey: "alert-finding-command", recordId: "alert-finding", itemId: null, title: "Damaged mounting", note: "Replace the damaged mounting before installation", ownerId: f.buyer.id, dueAt: "2026-11-28T06:00:00Z", evidenceIds: [] });
    at = new Date("2026-12-05T06:00:00Z"); await createProcurementLifecycleScheduler(f.deps).runOnce();
    const page = await createProcurementLifecycleNotificationsService({ now }).list(f.buyer);
    expect(page.items.map(row => row.kind)).toEqual(expect.arrayContaining(["review_missed", "review_followup", "inspection_missed", "finding_overdue"]));
  });

  it("bounds each batch and the opt-in background loop drains remaining projects before stopping", async () => {
    const f = await seedNotificationFixture(now, "a"); await seedNotificationFixture(now, "b"); at = new Date("2026-12-02T06:00:00Z");
    const scheduler = createProcurementLifecycleScheduler({ ...f.deps, batchSize: 1 });
    expect(await scheduler.runOnce()).toMatchObject({ processed: 1, wrapped: false }); expect(await scheduler.health()).toMatchObject({ backlog: 1 });
    scheduler.start();
    try { await vi.waitFor(async () => { expect(await notices("lifecycle-b", "payment_overdue")).toHaveLength(2); }, { timeout: 5000, interval: 50 }); }
    finally { await scheduler.stop(); }
    expect(await scheduler.health()).toMatchObject({ status: "stopped", backlog: 0 });
    const count = await ProcurementLifecycleNotificationModel.countDocuments(); scheduler.wake();
    expect(await ProcurementLifecycleNotificationModel.countDocuments()).toBe(count);
  });
});
