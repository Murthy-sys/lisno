import type { ChatNotification, NotificationPage } from "../contracts/notifications.js";
export interface NotificationEmail {
  status: "pending" | "leased" | "sent" | "failed" | "disabled" | "suppressed";
  attempts: number;
  nextAttemptAt: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  deliveredAt: string | null;
  failureCode: string | null;
}
export interface NotificationRecord extends ChatNotification {
  recipientId: string;
  email: NotificationEmail;
}
export interface NotificationTransactions {
  insertNotification(record: NotificationRecord): Promise<void>;
  notification(id: string, recipientId: string): Promise<NotificationRecord | null>;
  notificationProjectIds(recipientId: string): Promise<string[]>;
  notificationPage(recipientId: string, projectIds: string[], limit: number, offset: number): Promise<{items: NotificationRecord[]; total: number; unreadCount: number}>;
  readNotification(id: string, recipientId: string, now: string): Promise<void>;
  claimNotificationEmail(now: string, leaseExpiresAt: string, token: string): Promise<NotificationRecord | null>;
  settleNotificationEmail(id: string, token: string, now: string, email: NotificationEmail): Promise<boolean>;
}
export function publicNotification(row: NotificationRecord): ChatNotification {
  const { id, type, projectId, projectName, messageId, actor, excerpt, createdAt, readAt } = row;
  return { id, type, projectId, projectName, messageId, actor, excerpt, createdAt, readAt };
}
export function notificationPage(rows: {items: NotificationRecord[]; total: number; unreadCount: number}, limit: number, offset: number): NotificationPage {
  return { items: rows.items.map(publicNotification), unreadCount: rows.unreadCount, pagination: {limit, offset, total: rows.total, hasMore: offset + limit < rows.total} };
}
