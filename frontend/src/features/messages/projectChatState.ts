import type { ChatAttachmentKind, ChatAttachmentSummary, ChatMention, ChatMessage, ChatPriority, ChatStagedAttachment } from "./projectChatTypes";

export interface ChatLocalAttachment {
  localId: string;
  clientUploadId: string;
  file: File;
  kind: ChatAttachmentKind;
  staged?: ChatStagedAttachment;
  progress?: number;
  error?: string;
}

export interface ChatDraft {
  body: string;
  mentions: ChatMention[];
  priority: ChatPriority;
  responsibleUserId: string;
  reply: (Pick<ChatMessage, "id" | "body" | "author"> & { attachmentSummary?: ChatAttachmentSummary | null }) | null;
  files: ChatLocalAttachment[];
}
export const emptyChatDraft = (): ChatDraft => ({ body: "", mentions: [], priority: "normal", responsibleUserId: "", reply: null, files: [] });

/** Retain only intact structured mentions, shifting spans after the actual edit. */
export function mentionsAfterEdit(before: string, after: string, mentions: ChatMention[]) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  const change = newEnd - oldEnd;
  return mentions.flatMap(mention => {
    if (mention.end === start && newEnd > start && /[\p{L}\p{N}_]/u.test(after[start])) return [];
    if (mention.end <= start) return [mention];
    if (mention.start >= oldEnd) return [{ ...mention, start: mention.start + change, end: mention.end + change }];
    return [];
  });
}

export function mergeChatMessages(pages: Array<{ items: ChatMessage[] }>) {
  const messages = new Map<string, ChatMessage>();
  for (const page of pages) for (const message of page.items) {
    const old = messages.get(message.id);
    if (!old || old.version < message.version) messages.set(message.id, message);
  }
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}

/** A high-water mark may only pass messages actually viewed in an unfiltered window. */
export function readableChatMessage(options: { messages: ChatMessage[]; visibleIds: Set<string>; lastRead: number; hasOlder: boolean; filtered: boolean; documentVisible: boolean }) {
  const { messages, visibleIds, lastRead, hasOlder, filtered, documentVisible } = options;
  if (filtered || !documentVisible || !messages.length) return null;
  // Messages share event sequence numbers. Gaps cannot prove earlier messages were viewed.
  if (hasOlder && messages[0].sequence > lastRead) return null;
  let candidate: ChatMessage | null = null;
  for (const message of messages) {
    if (message.sequence <= lastRead) continue;
    if (!visibleIds.has(message.id)) break;
    candidate = message;
  }
  return candidate;
}
