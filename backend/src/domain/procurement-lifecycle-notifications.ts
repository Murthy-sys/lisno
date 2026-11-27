import { z } from "zod";
import type { ProcurementNotificationKind } from "../contracts/procurement-notifications.js";
import type { LifecycleTab } from "../contracts/procurement-lifecycle.js";
import { lcAddDays, lcId, lcLocalDate, lcPage } from "./procurement-lifecycle.js";
import { executionCutoff } from "./vendor-execution.js";
export const procurementNotificationsQuery = lcPage.extend({ projectId: lcId.optional(), unreadOnly: z.enum(["true", "false"]).or(z.boolean()).transform(value => value === true || value === "true").default(false) }).strict();
export const procurementReminderWindow = (dueDate: string, timezone: string, at: Date): { kind: ProcurementNotificationKind; localDate: string; daysOverdue: number } | null => {
  const today = lcLocalDate(at, timezone);
  if (today > dueDate) return { kind: "payment_overdue", localDate: today, daysOverdue: Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000) };
  if (today === dueDate) return at >= executionCutoff(dueDate, "09:00", timezone) ? { kind: "payment_due", localDate: dueDate, daysOverdue: 0 } : null;
  const reminderDate = lcAddDays(dueDate, -3);
  return at >= executionCutoff(reminderDate, "09:00", timezone) ? { kind: "payment_upcoming", localDate: reminderDate, daysOverdue: 0 } : null;
};
export function procurementNotificationLink(role: string, projectId: string, tab: LifecycleTab, entityId: string): string {
  const base = role === "super_admin" ? "/admin/procurement/projects/" : "/procurement/projects/";
  return `${base}${encodeURIComponent(projectId)}${role === "super_admin" ? "/lifecycle" : ""}?tab=${tab}&entity=${encodeURIComponent(entityId)}`;
}
