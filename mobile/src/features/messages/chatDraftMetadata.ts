import type { ChatMention } from "./chatModel";
/** Retain only intact structured mentions, shifting spans after the actual edit. */
export function mentionsAfterEdit(before: string, after: string, mentions: readonly ChatMention[]) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  const change = newEnd - oldEnd;
  return mentions.flatMap(mention => {
    if (mention.end === start && newEnd > start && /[\p{L}\p{N}_]/u.test(after[start] ?? "")) return [];
    if (mention.end <= start) return [mention];
    if (mention.start >= oldEnd) return [{ ...mention, start: mention.start + change, end: mention.end + change }];
    return [];
  });
}


export function isChatDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function trimMentionedMessage(body: string, mentions: readonly ChatMention[]) {
  const start = body.length - body.trimStart().length;
  const trimmed = body.trim();
  return { body: trimmed, mentions: mentions.filter(mention => mention.start >= start && mention.end <= start + trimmed.length).map(mention => ({ ...mention, start: mention.start - start, end: mention.end - start })) };
}
