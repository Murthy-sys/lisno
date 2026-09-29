import type { Role } from "./roles.js";
import { ApiError } from "../middleware/errors.js";

export interface ChatAvailability {
  timezone: "Asia/Kolkata";
  writable: boolean;
  nextOpenAt: string | null;
  nextChangeAt: string;
}

const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const localParts = (now: Date) => {
  const local = new Date(now.getTime() + INDIA_OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
};
const indiaInstant = (date: string, hour: number, minute: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) - INDIA_OFFSET_MS + (hour * 60 + minute) * 60_000);
const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

export function indiaLocalDate(now: Date): string { return localParts(now).date; }
export function indiaDigestScheduledAt(date: string): string { return indiaInstant(date, 17, 0).toISOString(); }
export function indiaDigestDue(now: Date): boolean { return localParts(now).minutes >= 17 * 60; }

export function chatAvailability(role: Role, now: Date): ChatAvailability {
  const local = localParts(now);
  if (role === "client") return { timezone: "Asia/Kolkata", writable: true, nextOpenAt: null, nextChangeAt: indiaInstant(nextDate(local.date), 0, 0).toISOString() };
  const writable = local.minutes >= 7 * 60 + 30 && local.minutes < 20 * 60;
  const opening = local.minutes < 7 * 60 + 30 ? indiaInstant(local.date, 7, 30) : indiaInstant(nextDate(local.date), 7, 30);
  return {
    timezone: "Asia/Kolkata", writable,
    nextOpenAt: writable ? null : opening.toISOString(),
    nextChangeAt: (writable ? indiaInstant(local.date, 20, 0) : opening).toISOString()
  };
}

export function assertChatWritable(role: Role, now: Date): void {
  const availability = chatAvailability(role, now);
  if (availability.writable) return;
  throw new ApiError(403, "CHAT_CLOSED", "Internal chat opens at 7:30 AM India time.",
    { nextOpenAt: availability.nextOpenAt! },
    { "Retry-After": String(Math.max(1, Math.ceil((Date.parse(availability.nextOpenAt!) - now.getTime()) / 1000))) });
}
