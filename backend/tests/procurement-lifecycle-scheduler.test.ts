import { describe, it, expect } from "vitest";
import { procurementNotificationLink, procurementNotificationsQuery, procurementReminderWindow } from "../src/domain/procurement-lifecycle-notifications.js";
import { createProcurementLifecycleScheduler } from "../src/services/procurement-lifecycle-scheduler.service.js";
describe("Procurement reminder boundaries", () => {
  it("can stop an unused application scheduler without opening a database connection", async () => {
    const scheduler = createProcurementLifecycleScheduler({ audit: {} as never });
    await expect(scheduler.stop()).resolves.toBeUndefined();
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });
  it("starts the three-day reminder and due-day reminder at local 09:00", () => {
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-11-28T03:29:59Z"))).toBeNull();
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-11-28T03:30:00Z"))).toMatchObject({ kind: "payment_upcoming", localDate: "2026-11-28" });
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-12-01T03:29:59Z"))).toBeNull();
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-12-01T03:30:00Z"))).toMatchObject({ kind: "payment_due", localDate: "2026-12-01" });
  });
  it("expires date-only obligations at local midnight and coalesces outage catch-up", () => {
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-12-01T18:29:59Z"))?.kind).toBe("payment_due");
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-12-01T18:30:00Z"))).toEqual({ kind: "payment_overdue", localDate: "2026-12-02", daysOverdue: 1 });
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-12-08T06:00:00Z"))).toEqual({ kind: "payment_overdue", localDate: "2026-12-08", daysOverdue: 7 });
    expect(procurementReminderWindow("2026-12-01", "Asia/Kolkata", new Date("2026-11-30T12:00:00Z"))?.localDate).toBe("2026-11-28");
  });
  it("uses DST-aware local reminder time and role-appropriate encoded links", () => {
    expect(procurementReminderWindow("2026-03-10", "America/New_York", new Date("2026-03-07T13:59:59Z"))).toBeNull();
    expect(procurementReminderWindow("2026-03-10", "America/New_York", new Date("2026-03-10T13:00:00Z"))?.kind).toBe("payment_due");
    expect(procurementNotificationLink("super_admin", "project/x", "payments", "order & 1")).toBe("/admin/procurement/projects/project%2Fx/lifecycle?tab=payments&entity=order%20%26%201");
    expect(procurementNotificationsQuery.parse({ unreadOnly: "false" }).unreadOnly).toBe(false);
    expect(procurementNotificationsQuery.safeParse({ unreadOnly: "anything" }).success).toBe(false);
  });
});
