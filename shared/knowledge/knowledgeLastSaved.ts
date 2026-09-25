export interface KnowledgeSaveStamp {
  readonly createdAt: string;
  readonly updatedAt: string;
}

const MINUTE_MS = 60_000;

const KNOWLEDGE_RELATIVE_TIME = new Intl.RelativeTimeFormat("en-IN", {
  numeric: "auto"
});

/** ISO `updatedAt` of the latest author save across a workspace tab's section envelopes, or null. */
export function latestKnowledgeSectionSave(
  envelopes: readonly (KnowledgeSaveStamp | null | undefined)[]
): string | null {
  if (envelopes.length === 0) return null;

  let latestUpdatedAt: string | null = null;
  let latestSavedAt = Number.NEGATIVE_INFINITY;
  for (const envelope of envelopes) {
    // A tab shows a save time only once every envelope it needs has loaded.
    if (envelope === null || envelope === undefined) return null;

    const createdAt = Date.parse(envelope.createdAt);
    const savedAt = Date.parse(envelope.updatedAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(savedAt)) continue;
    // A new Draft copies sections with createdAt === updatedAt; that is not an author save.
    if (savedAt <= createdAt) continue;

    if (savedAt > latestSavedAt) {
      latestSavedAt = savedAt;
      latestUpdatedAt = envelope.updatedAt;
    }
  }

  return latestUpdatedAt;
}

/** "just now", or Intl long wording such as "2 minutes ago" / "yesterday"; null when the timestamp cannot be parsed. */
export function formatKnowledgeRelativeTime(
  timestamp: string,
  now: number = Date.now()
): string | null {
  const elapsed = now - Date.parse(timestamp);
  if (!Number.isFinite(elapsed)) return null;
  // Clock skew can place a fresh save slightly in the future; it still reads as just saved.
  if (elapsed < MINUTE_MS) return "just now";

  // Each unit rounds down, so the wording never overstates the elapsed time.
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 60) return KNOWLEDGE_RELATIVE_TIME.format(-minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return KNOWLEDGE_RELATIVE_TIME.format(-hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 30) return KNOWLEDGE_RELATIVE_TIME.format(-days, "day");

  const months = Math.floor(days / 30);
  if (months < 12) return KNOWLEDGE_RELATIVE_TIME.format(-months, "month");

  const years = Math.max(1, Math.floor(days / 365));
  return KNOWLEDGE_RELATIVE_TIME.format(-years, "year");
}
