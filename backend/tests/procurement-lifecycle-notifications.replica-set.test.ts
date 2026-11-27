import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { lifecycleActor, lifecycleAt } from "./fixtures/procurement-lifecycle.js";
import { alertModels, seedNotificationFixture } from "./fixtures/procurement-notifications.js";
import { createProcurementLifecycleScheduler } from "../src/services/procurement-lifecycle-scheduler.service.js";
import { createProcurementLifecycleNotificationsService } from "../src/services/procurement-lifecycle-notifications.service.js";
import { ProcurementLifecycleNotificationModel } from "../src/models/ProcurementLifecycleNotification.js";
import { ProcurementReviewRoundModel } from "../src/models/ProcurementReviewRound.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { ProcurementPaymentCorrectionModel } from "../src/models/ProcurementPaymentCorrection.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { ProjectPaymentCertificationModel } from "../src/models/ProjectPaymentCertification.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let at = new Date(lifecycleAt); const now = () => at;
const feed = createProcurementLifecycleNotificationsService({ now });
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-lifecycle-notification-feed"); for (const model of alertModels) await model.syncIndexes(); }, 120000);
beforeEach(async () => { await replica.clear(); at = new Date(lifecycleAt); });
afterAll(async () => { await replica?.stop(); });

describe("current authorized Procurement alert feed", () => {
  it("keeps read acknowledgement separate from the payable and refreshes resolved amounts immediately", async () => {
    const f = await seedNotificationFixture(now); at = new Date("2026-12-02T06:00:00Z"); const scheduler = createProcurementLifecycleScheduler(f.deps); await scheduler.runOnce();
    let page = await feed.list(f.buyer); const overdue = page.items.find(item => item.kind === "payment_overdue")!;
    expect(overdue).toMatchObject({ status: "active", current: { remainingPaise: 54000, daysOverdue: 1 }, responsibleName: f.buyer.name });
    expect(overdue.deepLink).toBe(`/procurement/projects/${f.projectId}?tab=payments&entity=${f.orderId}`);
    const read = await feed.read(f.buyer, overdue.id); expect(read.readAt).toBe(at.toISOString());
    expect(await feed.read(f.buyer, overdue.id)).toEqual(read);
    page = await feed.list(f.buyer); expect(page.items.find(item => item.id === overdue.id)).toMatchObject({ status: "active", readAt: at.toISOString() });
    expect(page.unreadCount).toBe(page.total - 1);
    await f.pay("partial-notification-payment", 14000);
    expect((await feed.list(f.buyer)).items.find(item => item.id === overdue.id)).toMatchObject({ snapshot: { remainingPaise: 54000 }, current: { remainingPaise: 40000 } });
    await f.pay("remaining-notification-payment", 40000);
    expect((await feed.list(f.buyer)).items.find(item => item.id === overdue.id)).toMatchObject({ status: "resolved", current: null });
    await f.paymentCommand({ action: "reverse", transactionId: "remaining-notification-payment", reason: "Recorded transfer must be reversed" });
    expect((await feed.list(f.buyer)).items.find(item => item.id === overdue.id)).toMatchObject({ status: "active", current: { remainingPaise: 40000 } });
  });

  it("revokes the old recipient after reassignment and publishes to the new current actor", async () => {
    const f = await seedNotificationFixture(now); const other = await seedNotificationFixture(now, "b"); at = new Date("2026-12-02T06:00:00Z"); const scheduler = createProcurementLifecycleScheduler(f.deps); await scheduler.runOnce();
    const old = (await feed.list(f.buyer)).items[0]!;
    await expect(feed.read(other.buyer, old.id)).rejects.toMatchObject({ status: 404 });
    await expect(feed.list(other.buyer, { projectId: f.projectId })).rejects.toMatchObject({ status: 404 });
    const replacement = lifecycleActor("replacement-buyer", "procurement"); await UserModel.collection.insertOne({ _id: replacement.id, ...replacement, active: true } as any);
    await ProjectWorkflowTaskModel.updateOne({ _id: `${f.projectId}-procurement` }, { $set: { assigneeUserId: replacement.id } });
    expect((await feed.list(f.buyer)).items).toEqual([]); await expect(feed.read(f.buyer, old.id)).rejects.toMatchObject({ status: 404 });
    expect((await feed.list(replacement)).items).toEqual([]);
    await scheduler.runOnce(); const changed = await feed.list(replacement); expect(changed.items.length).toBeGreaterThan(0); expect(changed.items.every(item => item.projectId === f.projectId)).toBe(true);
    expect(changed.items.some(item => item.id === old.id)).toBe(false);
    expect((await feed.list(other.buyer)).items.every(item => item.projectId === other.projectId)).toBe(true);
  });

  it("escalates missing assignment to the sole Admin and rejects inactive or ambiguous Admin access", async () => {
    const f = await seedNotificationFixture(now); await ProjectWorkflowTaskModel.updateOne({ _id: `${f.projectId}-procurement` }, { $set: { assigneeUserId: "missing-buyer" } });
    at = new Date("2026-12-02T06:00:00Z"); await createProcurementLifecycleScheduler(f.deps).runOnce();
    const page = await feed.list(f.admin); expect(page.items.map(item => item.kind)).toContain("procurement_assignment");
    expect(page.items.every(item => item.deepLink.startsWith(`/admin/procurement/projects/${f.projectId}/lifecycle?`))).toBe(true);
    expect(await ProcurementLifecycleNotificationModel.countDocuments({ recipientId: f.buyer.id })).toBe(0);
    await expect(feed.list(f.finance)).rejects.toMatchObject({ status: 404 }); await expect(feed.health(f.client)).rejects.toMatchObject({ status: 404 });
    const secondAdmin = lifecycleActor("extra-notification-admin", "super_admin"); await UserModel.collection.insertOne({ _id: secondAdmin.id, ...secondAdmin, active: true } as any);
    await expect(feed.list(f.admin)).rejects.toMatchObject({ status: 404 }); await expect(feed.read(f.admin, page.items[0]!.id)).rejects.toMatchObject({ status: 404 });
    await UserModel.deleteOne({ _id: secondAdmin.id }); await UserModel.updateOne({ _id: f.admin.id }, { $set: { active: false } });
    await expect(feed.health(f.admin)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps missing approval and correction attention separate from overdue payment timing and GETs pure", async () => {
    const f = await seedNotificationFixture(now); await ProjectPaymentCertificationModel.deleteOne({ _id: `${f.orderId}-cert` });
    await ProcurementPaymentCorrectionModel.collection.insertOne({ _id: "pending-alert-correction", projectId: f.projectId, orderId: f.orderId, transactionId: "transfer-needs-review", kind: "request", actorId: f.buyer.id, occurredAt: at, accountVersion: 10, reason: "Check bank reference" } as any);
    at = new Date("2026-12-02T06:00:00Z"); await createProcurementLifecycleScheduler(f.deps).runOnce();
    const before = { rounds: await ProcurementReviewRoundModel.countDocuments(), commands: await ProcurementLifecycleCommandModel.countDocuments(), notifications: await ProcurementLifecycleNotificationModel.countDocuments() };
    const page = await feed.list(f.buyer, { limit: 2 }); expect(page.items).toHaveLength(2); expect(page.total).toBeGreaterThan(2);
    const all = await feed.list(f.buyer); expect(all.items.map(item => item.kind)).toEqual(expect.arrayContaining(["payment_approval", "payment_correction", "payment_overdue"]));
    expect(await feed.health(f.buyer)).toMatchObject({ channel: "internal_feed" });
    expect({ rounds: await ProcurementReviewRoundModel.countDocuments(), commands: await ProcurementLifecycleCommandModel.countDocuments(), notifications: await ProcurementLifecycleNotificationModel.countDocuments() }).toEqual(before);
  });
});
