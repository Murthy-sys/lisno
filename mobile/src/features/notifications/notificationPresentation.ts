import type { NavigationIconName } from "../../navigation/NavigationIcon";
import { colors } from "../../ui/tokens";

export interface ChatNotification {
  readonly id: string;
  readonly type: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly messageId: string;
  readonly actor: { readonly id: string; readonly name: string };
  readonly excerpt: string;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export type NotificationGroupKey = "today" | "yesterday" | "earlier";

export interface NotificationGroup {
  readonly key: NotificationGroupKey;
  readonly label: "Today" | "Yesterday" | "Earlier";
  readonly items: readonly ChatNotification[];
}

export interface NotificationTone {
  readonly icon: NavigationIconName;
  readonly tile: string;
  readonly iconColor: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const TONES: Readonly<Record<string, NotificationTone>> = Object.freeze({
  "chat.mention": { icon: "chat", tile: colors.primarySoft, iconColor: colors.primary },
  "chat.mention.oversight": { icon: "chat", tile: colors.infoSoft, iconColor: colors.info }
});

const FALLBACK_TONE: NotificationTone = Object.freeze({ icon: "notifications", tile: colors.surfaceMuted, iconColor: colors.inkMuted });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseItem(value: unknown): ChatNotification | null {
  if (!isRecord(value)) return null;
  const { id, type, projectId, projectName, messageId, actor, excerpt, createdAt, readAt } = value;
  if (!nonEmpty(id) || !nonEmpty(type) || !nonEmpty(projectId) || !nonEmpty(projectName) || !nonEmpty(messageId)) return null;
  if (!isRecord(actor) || !nonEmpty(actor.id) || !nonEmpty(actor.name)) return null;
  if (typeof excerpt !== "string" || !nonEmpty(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
  if (readAt !== null && typeof readAt !== "string") return null;
  return { id, type, projectId, projectName, messageId, actor: { id: actor.id, name: actor.name }, excerpt, createdAt, readAt };
}

/** Accepts the unwrapped `{ items }` page or the raw `{ data: { items } }` envelope; malformed entries are skipped. */
export function parseNotifications(data: unknown): readonly ChatNotification[] {
  const page = isRecord(data) && isRecord(data.data) ? data.data : data;
  if (!isRecord(page) || !Array.isArray(page.items)) return [];
  return page.items.map(parseItem).filter((item): item is ChatNotification => item !== null);
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupKey(createdAt: string, now: Date): NotificationGroupKey {
  const day = startOfLocalDay(new Date(createdAt));
  const today = startOfLocalDay(now);
  if (day >= today) return "today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  return day >= yesterday ? "yesterday" : "earlier";
}

export function groupNotifications(items: readonly ChatNotification[], now: Date): readonly NotificationGroup[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const groups: readonly NotificationGroup[] = [
    { key: "today", label: "Today", items: sorted.filter((item) => groupKey(item.createdAt, now) === "today") },
    { key: "yesterday", label: "Yesterday", items: sorted.filter((item) => groupKey(item.createdAt, now) === "yesterday") },
    { key: "earlier", label: "Earlier", items: sorted.filter((item) => groupKey(item.createdAt, now) === "earlier") }
  ];
  return groups.filter((group) => group.items.length > 0);
}

function clockTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function formatNotificationTime(createdAt: string, now: Date): string {
  const date = new Date(createdAt);
  const key = groupKey(createdAt, now);
  if (key === "today") return clockTime(date);
  if (key === "yesterday") return `Yesterday, ${clockTime(date)}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function notificationTone(type: string): NotificationTone {
  return TONES[type] ?? FALLBACK_TONE;
}

export function notificationMessage(item: ChatNotification): string {
  if (item.type === "chat.mention") return `${item.actor.name} mentioned you: ${item.excerpt}`;
  if (item.type === "chat.mention.oversight") return `${item.actor.name} mentioned a team member: ${item.excerpt}`;
  // Unknown future types: show only server-provided fields, never an assumed verb.
  return `${item.actor.name}: ${item.excerpt}`;
}

export function isUnread(item: ChatNotification): boolean {
  return item.readAt === null;
}

export function notificationAccessibilityLabel(item: ChatNotification, now: Date): string {
  return `${isUnread(item) ? "Unread, " : ""}${item.projectName}, ${notificationMessage(item)}, ${formatNotificationTime(item.createdAt, now)}`;
}
