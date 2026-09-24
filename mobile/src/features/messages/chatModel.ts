import { isRecord } from "../workspace/recordPresentation";
import { isFrontendRole, type Role } from "../../contracts/authorization";

export type PresentedPriority = "normal" | "important" | "critical";
export type PresentedIssueStatus = "open" | "resolved" | null;

export interface PresentedChatPerson {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export const CHAT_PARTICIPANT_SOURCE_KINDS = [
  "client",
  "super_admin",
  "project_assignment",
  "estimate_assignment",
  "workflow_assignment",
  "access_grant",
  "selection"
] as const;

export type PresentedChatParticipantSourceKind = (typeof CHAT_PARTICIPANT_SOURCE_KINDS)[number];

export interface PresentedChatParticipantSource {
  readonly kind: PresentedChatParticipantSourceKind;
  readonly id: string;
}

export interface PresentedChatParticipant {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly sources: readonly PresentedChatParticipantSource[];
  readonly selection: {
    readonly id: string;
    readonly version: number;
  } | null;
}

export interface PresentedChatParticipantPage {
  readonly items: readonly PresentedChatParticipant[];
  readonly setupWarnings: readonly string[];
}

export interface PresentedChatParticipantOptions {
  readonly items: readonly Pick<PresentedChatParticipant, "id" | "name" | "role">[];
  readonly hasMore: boolean;
}

export interface PresentedAttachmentPreview {
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentedAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly kind: string;
  readonly preview: PresentedAttachmentPreview | null;
}

export interface PresentedIssueCapabilities {
  readonly canRaise: boolean;
  readonly canResolve: boolean;
  readonly canReopen: boolean;
  readonly canAssign: boolean;
  readonly canAssignSelf: boolean;
}

export interface PresentedMessage {
  readonly id: string;
  readonly projectId: string;
  readonly body: string;
  /** Kept as a string for compatibility with the existing conversation screen. */
  readonly author: string;
  readonly authorId: string;
  readonly authorRole: string;
  readonly authorIdentity: PresentedChatPerson;
  readonly createdAt: string;
  readonly sequence: number;
  readonly clientMessageId: string;
  readonly priority: PresentedPriority;
  readonly version: number;
  readonly issueStatus: PresentedIssueStatus;
  readonly replyTo: {
    readonly id: string;
    readonly author: string;
    readonly authorId: string;
    readonly authorRole: string;
    readonly body: string;
    readonly attachmentSummary: {
      readonly count: number;
      readonly kind: string;
      readonly filename: string;
    } | null;
  } | null;
  readonly attachments: readonly PresentedAttachment[];
  readonly capabilities: PresentedIssueCapabilities;
}

export interface PresentedChatCounts {
  readonly openCritical: number;
  readonly openImportant: number;
  readonly unread: number;
  readonly unreadMentions: number;
}

export interface PresentedChatCapabilities {
  readonly canSend: boolean;
  readonly canManageParticipants: boolean;
  readonly canManageIssues: boolean;
}

export interface PresentedChatSummary {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly counts: PresentedChatCounts;
  readonly participantCount: number;
  readonly cursor: string;
  readonly lastReadSequence: number;
  readonly latestMessageSequence: number;
  readonly capabilities: PresentedChatCapabilities;
  readonly setupWarnings: readonly string[];
}

export type PresentedLastMessageAttachmentKind = "image" | "video" | "audio" | "document" | "archive";

export interface PresentedLastMessageAttachment {
  readonly id: string;
  readonly kind: PresentedLastMessageAttachmentKind;
  readonly filename: string;
  readonly hasPreview: boolean;
}

export interface PresentedLastMessage {
  readonly id: string;
  readonly author: { readonly id: string; readonly name: string; readonly role: string | null };
  readonly excerpt: string;
  readonly createdAt: string;
  readonly attachments: readonly PresentedLastMessageAttachment[];
  readonly attachmentCount: number;
}

export interface PresentedConversation extends PresentedChatSummary {
  readonly lastMessageAt: string | null;
  /**
   * `null` means the server reported no messages yet; `undefined` means an older
   * server did not send a preview at all.
   */
  readonly lastMessage?: PresentedLastMessage | null;
}

export interface PresentedConversationTotals {
  readonly unread: number;
  readonly critical: number;
  readonly important: number;
}

export interface PresentedOffsetPagination {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface PresentedConversationPage {
  readonly items: readonly PresentedConversation[];
  readonly pagination: PresentedOffsetPagination;
  /** Absent when an older server does not report list-wide totals. */
  readonly totals?: PresentedConversationTotals;
}

export interface PresentedMessagePage {
  readonly items: readonly PresentedMessage[];
  readonly olderCursor: string | null;
  readonly newerCursor: string | null;
  readonly snapshotCursor: string;
  readonly latestMessageSequence: number;
}

export interface ConversationActivityInput {
  readonly kind: "time" | "date";
  readonly date: Date;
  readonly dateTime: string;
}

export interface PresentedMessageTimelineItem {
  readonly message: PresentedMessage;
  readonly own: boolean;
  readonly startsGroup: boolean;
  readonly showAuthor: boolean;
  readonly showDateSeparator: boolean;
  readonly showUnreadSeparator: boolean;
  readonly dayKey: string | null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function naturalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : nonEmptyString(value) ?? undefined;
}

function presentPerson(value: unknown): PresentedChatPerson | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const role = nonEmptyString(value.role);
  return id && name && role ? { id, name, role } : null;
}

function presentCanonicalPerson(value: unknown): Pick<PresentedChatParticipant, "id" | "name" | "role"> | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  return id && name && isFrontendRole(value.role) ? { id, name, role: value.role } : null;
}

function presentParticipantSource(value: unknown): PresentedChatParticipantSource | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const kind = value.kind;
  return id && typeof kind === "string" && (CHAT_PARTICIPANT_SOURCE_KINDS as readonly string[]).includes(kind)
    ? { id, kind: kind as PresentedChatParticipantSourceKind }
    : null;
}

export function presentChatParticipant(value: unknown): PresentedChatParticipant | null {
  const person = presentCanonicalPerson(value);
  if (!person || !isRecord(value) || !Array.isArray(value.sources)) return null;

  const sources = value.sources.map(presentParticipantSource);
  if (!sources.every((source): source is PresentedChatParticipantSource => source !== null)) return null;

  let selection: PresentedChatParticipant["selection"] = null;
  if (value.selection !== null) {
    if (!isRecord(value.selection)) return null;
    const id = nonEmptyString(value.selection.id);
    const version = positiveNumber(value.selection.version);
    if (!id || version === null) return null;
    selection = { id, version };
  }

  return { ...person, sources, selection };
}

export function presentChatParticipantPage(value: unknown): PresentedChatParticipantPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.setupWarnings)) return null;
  const items = value.items.map(presentChatParticipant);
  if (!items.every((item): item is PresentedChatParticipant => item !== null)) return null;
  const setupWarnings = value.setupWarnings.map(nonEmptyString);
  if (!setupWarnings.every((warning): warning is string => warning !== null)) return null;
  return { items, setupWarnings };
}

export function presentChatParticipantOptions(value: unknown): PresentedChatParticipantOptions | null {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.hasMore !== "boolean") return null;
  const items = value.items.map(presentCanonicalPerson);
  return items.every((item): item is Pick<PresentedChatParticipant, "id" | "name" | "role"> => item !== null)
    ? { items, hasMore: value.hasMore }
    : null;
}

function presentCounts(value: unknown): PresentedChatCounts | null {
  if (!isRecord(value)) return null;
  const openCritical = naturalNumber(value.openCritical);
  const openImportant = naturalNumber(value.openImportant);
  const unread = naturalNumber(value.unread);
  const unreadMentions = naturalNumber(value.unreadMentions);
  return openCritical === null || openImportant === null || unread === null || unreadMentions === null
    ? null
    : { openCritical, openImportant, unread, unreadMentions };
}

function presentChatCapabilities(value: unknown): PresentedChatCapabilities | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.canSend !== "boolean" ||
    typeof value.canManageParticipants !== "boolean" ||
    typeof value.canManageIssues !== "boolean"
  ) return null;
  return {
    canSend: value.canSend,
    canManageParticipants: value.canManageParticipants,
    canManageIssues: value.canManageIssues
  };
}

function presentIssueCapabilities(value: unknown): PresentedIssueCapabilities | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.canRaise !== "boolean" ||
    typeof value.canResolve !== "boolean" ||
    typeof value.canReopen !== "boolean" ||
    typeof value.canAssign !== "boolean" ||
    typeof value.canAssignSelf !== "boolean"
  ) return null;
  return {
    canRaise: value.canRaise,
    canResolve: value.canResolve,
    canReopen: value.canReopen,
    canAssign: value.canAssign,
    canAssignSelf: value.canAssignSelf
  };
}

function presentAttachment(value: unknown): PresentedAttachment | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const filename = nonEmptyString(value.filename);
  const mimeType = nonEmptyString(value.mimeType);
  const kind = nonEmptyString(value.kind);
  const byteSize = naturalNumber(value.byteSize);
  if (!id || !filename || !mimeType || !kind || byteSize === null) return null;

  let preview: PresentedAttachmentPreview | null = null;
  if (value.preview !== null && value.preview !== undefined) {
    if (!isRecord(value.preview)) return null;
    const previewMimeType = nonEmptyString(value.preview.mimeType);
    const previewByteSize = naturalNumber(value.preview.byteSize);
    const width = positiveNumber(value.preview.width);
    const height = positiveNumber(value.preview.height);
    if (!previewMimeType || previewByteSize === null || width === null || height === null) return null;
    preview = { mimeType: previewMimeType, byteSize: previewByteSize, width, height };
  }

  return { id, filename, mimeType, byteSize, kind, preview };
}

function presentMessage(value: unknown): PresentedMessage | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const projectId = nonEmptyString(value.projectId);
  const author = presentPerson(value.author);
  const createdAt = nonEmptyString(value.createdAt);
  const sequence = positiveNumber(value.sequence);
  const version = positiveNumber(value.version);
  const priority = value.priority === "normal" || value.priority === "important" || value.priority === "critical"
    ? value.priority
    : null;
  const issueStatus = value.issueStatus === null || value.issueStatus === "open" || value.issueStatus === "resolved"
    ? value.issueStatus
    : undefined;
  const capabilities = presentIssueCapabilities(value.capabilities);
  if (
    !id || !projectId || !author || !createdAt || !Number.isFinite(Date.parse(createdAt)) ||
    sequence === null || version === null || typeof value.body !== "string" ||
    typeof value.clientMessageId !== "string" || !priority || issueStatus === undefined ||
    !Array.isArray(value.attachments) || !capabilities
  ) return null;

  const attachments: PresentedAttachment[] = [];
  for (const attachment of value.attachments) {
    const presented = presentAttachment(attachment);
    if (!presented) return null;
    attachments.push(presented);
  }

  let replyTo: PresentedMessage["replyTo"] = null;
  if (value.replyTo !== null) {
    if (!isRecord(value.replyTo)) return null;
    const replyId = nonEmptyString(value.replyTo.id);
    const replyAuthor = presentPerson(value.replyTo.author);
    if (!replyId || !replyAuthor || typeof value.replyTo.body !== "string") return null;
    let attachmentSummary: NonNullable<PresentedMessage["replyTo"]>["attachmentSummary"] = null;
    if (value.replyTo.attachmentSummary !== null && value.replyTo.attachmentSummary !== undefined) {
      if (isRecord(value.replyTo.attachmentSummary)) {
        const count = naturalNumber(value.replyTo.attachmentSummary.count);
        const kind = nonEmptyString(value.replyTo.attachmentSummary.kind);
        const filename = nonEmptyString(value.replyTo.attachmentSummary.filename);
        if (count === null || !kind || !filename) return null;
        attachmentSummary = { count, kind, filename };
      } else return null;
    }
    replyTo = {
      id: replyId,
      author: replyAuthor.name,
      authorId: replyAuthor.id,
      authorRole: replyAuthor.role,
      body: value.replyTo.body,
      attachmentSummary
    };
  }

  return {
    id,
    projectId,
    body: value.body,
    author: author.name,
    authorId: author.id,
    authorRole: author.role,
    authorIdentity: author,
    createdAt,
    sequence,
    clientMessageId: value.clientMessageId,
    priority,
    version,
    issueStatus,
    replyTo,
    attachments,
    capabilities
  };
}

function presentSummary(value: unknown): PresentedChatSummary | null {
  if (!isRecord(value) || !isRecord(value.project)) return null;
  const projectId = nonEmptyString(value.project.id);
  const projectName = nonEmptyString(value.project.name);
  const projectStatus = nonEmptyString(value.project.status);
  const counts = presentCounts(value.counts);
  const participantCount = naturalNumber(value.participantCount);
  const cursor = typeof value.cursor === "string" ? value.cursor : null;
  const lastReadSequence = naturalNumber(value.lastReadSequence);
  const latestMessageSequence = naturalNumber(value.latestMessageSequence);
  const capabilities = presentChatCapabilities(value.capabilities);
  if (
    !projectId || !projectName || !projectStatus || !counts || participantCount === null || cursor === null ||
    lastReadSequence === null || latestMessageSequence === null || !capabilities
  ) return null;

  return {
    project: { id: projectId, name: projectName, status: projectStatus },
    counts,
    participantCount,
    cursor,
    lastReadSequence,
    latestMessageSequence,
    capabilities,
    setupWarnings: Array.isArray(value.setupWarnings)
      ? value.setupWarnings.flatMap((warning) => typeof warning === "string" ? [warning] : [])
      : []
  };
}

export function conversationProject(record: Record<string, unknown>): { readonly id: string; readonly name: string } | null {
  const project = record.project;
  if (!isRecord(project) || typeof project.id !== "string") return null;
  return { id: project.id, name: typeof project.name === "string" && project.name.trim() ? project.name : "Project conversation" };
}

export function presentChatSummary(value: unknown, expectedProjectId?: string): PresentedChatSummary | null {
  const summary = presentSummary(value);
  return summary && (!expectedProjectId || summary.project.id === expectedProjectId) ? summary : null;
}

const LAST_MESSAGE_ATTACHMENT_KINDS: readonly PresentedLastMessageAttachmentKind[] = [
  "image", "video", "audio", "document", "archive"
];

function presentLastMessageAttachment(value: unknown): PresentedLastMessageAttachment | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const filename = nonEmptyString(value.filename);
  const kind = LAST_MESSAGE_ATTACHMENT_KINDS.find((candidate) => candidate === value.kind);
  if (!id || !filename || !kind) return null;
  return { id, kind, filename, hasPreview: value.hasPreview === true };
}

/**
 * Tolerant preview parser: `undefined` for an absent or malformed preview (so the
 * row falls back to its secondary text) and `null` only for an explicit null.
 */
function presentLastMessage(value: unknown): PresentedLastMessage | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.author)) return undefined;
  const id = nonEmptyString(value.id);
  const authorId = nonEmptyString(value.author.id);
  const authorName = nonEmptyString(value.author.name);
  const createdAt = nonEmptyString(value.createdAt);
  if (!id || !authorId || !authorName || !createdAt || typeof value.excerpt !== "string") return undefined;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.flatMap((item) => {
      const attachment = presentLastMessageAttachment(item);
      return attachment ? [attachment] : [];
    }).slice(0, 3)
    : [];
  const reportedCount = naturalNumber(value.attachmentCount);
  return {
    id,
    author: { id: authorId, name: authorName.trim(), role: nonEmptyString(value.author.role) },
    excerpt: value.excerpt.replace(/\s+/g, " ").trim(),
    createdAt,
    attachments,
    attachmentCount: Math.max(reportedCount ?? 0, attachments.length)
  };
}

function presentConversationTotals(value: unknown): PresentedConversationTotals | undefined {
  if (!isRecord(value)) return undefined;
  const unread = naturalNumber(value.unread);
  const critical = naturalNumber(value.critical);
  const important = naturalNumber(value.important);
  return unread === null || critical === null || important === null ? undefined : { unread, critical, important };
}

export function presentConversationPage(value: unknown): PresentedConversationPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)) return null;
  const limit = positiveNumber(value.pagination.limit);
  const offset = naturalNumber(value.pagination.offset);
  const total = naturalNumber(value.pagination.total);
  if (limit === null || offset === null || total === null || typeof value.pagination.hasMore !== "boolean") return null;

  const items = value.items.flatMap((item): PresentedConversation[] => {
    const summary = presentSummary(item);
    if (!summary || !isRecord(item)) return [];
    const lastMessageAt = nullableString(item.lastMessageAt);
    if (lastMessageAt === undefined) return [];
    const lastMessage = presentLastMessage(item.lastMessage);
    return [lastMessage === undefined ? { ...summary, lastMessageAt } : { ...summary, lastMessageAt, lastMessage }];
  });
  const totals = presentConversationTotals(value.totals);
  const pagination = { limit, offset, total, hasMore: value.pagination.hasMore };
  return totals ? { items, pagination, totals } : { items, pagination };
}

export function presentMessages(value: unknown): readonly PresentedMessage[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const items = value.items.map((item) => {
    const message = presentMessage(item);
    return message;
  });
  return items.every((item): item is PresentedMessage => item !== null) ? items : [];
}

export function presentMessagePage(value: unknown, expectedProjectId?: string): PresentedMessagePage | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const olderCursor = nullableString(value.olderCursor);
  const newerCursor = nullableString(value.newerCursor);
  const snapshotCursor = typeof value.snapshotCursor === "string" ? value.snapshotCursor : null;
  const latestMessageSequence = naturalNumber(value.latestMessageSequence);
  if (olderCursor === undefined || newerCursor === undefined || snapshotCursor === null || latestMessageSequence === null) return null;
  const items = value.items.map((item) => presentMessage(item));
  if (
    !items.every((item): item is PresentedMessage => item !== null) ||
    (expectedProjectId !== undefined && items.some((item) => item.projectId !== expectedProjectId))
  ) return null;
  return {
    items,
    olderCursor,
    newerCursor,
    snapshotCursor,
    latestMessageSequence
  };
}

export function mergeConversationPages(pages: readonly PresentedConversationPage[]): readonly PresentedConversation[] {
  const orderedIds: string[] = [];
  const byId = new Map<string, PresentedConversation>();
  for (const page of pages) {
    for (const conversation of page.items) {
      if (!byId.has(conversation.project.id)) orderedIds.push(conversation.project.id);
      byId.set(conversation.project.id, conversation);
    }
  }
  return orderedIds.flatMap((id) => {
    const value = byId.get(id);
    return value ? [value] : [];
  });
}

export function mergeMessagePages(
  pages: readonly Pick<PresentedMessagePage, "items">[]
): readonly PresentedMessage[] {
  const byId = new Map<string, PresentedMessage>();
  for (const page of pages) {
    for (const message of page.items) {
      const existing = byId.get(message.id);
      if (!existing || message.version >= existing.version) byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.sequence - right.sequence || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
}

export function projectInitials(projectName: string): string {
  const words = projectName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join("").toLocaleUpperCase();
  return `${Array.from(words[0]!)[0] ?? ""}${Array.from(words.at(-1)!)[0] ?? ""}`.toLocaleUpperCase();
}

export function conversationActivityInput(value: string | null, now = new Date()): ConversationActivityInput | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) return null;
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return { kind: sameDay ? "time" : "date", date, dateTime: value };
}

export function messageDayKey(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shouldGroupMessages(
  previous: PresentedMessage | undefined,
  current: PresentedMessage,
  unreadBoundaryMessageId?: string
): boolean {
  if (!previous || current.id === unreadBoundaryMessageId || previous.authorId !== current.authorId) return false;
  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  return messageDayKey(previous.createdAt) === messageDayKey(current.createdAt) &&
    Number.isFinite(previousTime) && Number.isFinite(currentTime) &&
    currentTime >= previousTime && currentTime - previousTime < 5 * 60_000;
}

export function firstUnreadMessageId(
  messages: readonly PresentedMessage[],
  lastReadSequence: number,
  currentUserId?: string
): string | null {
  return messages.find((message) =>
    message.sequence > lastReadSequence && (!currentUserId || message.authorId !== currentUserId)
  )?.id ?? null;
}

export function buildMessageTimeline(
  messages: readonly PresentedMessage[],
  options: { readonly currentUserId: string; readonly lastReadSequence: number }
): readonly PresentedMessageTimelineItem[] {
  const ordered = mergeMessagePages([{ items: messages }]);
  const unreadId = firstUnreadMessageId(ordered, options.lastReadSequence, options.currentUserId);
  return ordered.map((message, index) => {
    const previous = ordered[index - 1];
    const grouped = shouldGroupMessages(previous, message, unreadId ?? undefined);
    const dayKey = messageDayKey(message.createdAt);
    return {
      message,
      own: message.authorId === options.currentUserId,
      startsGroup: !grouped,
      showAuthor: !grouped && message.authorId !== options.currentUserId,
      showDateSeparator: !previous || dayKey !== messageDayKey(previous.createdAt),
      showUnreadSeparator: message.id === unreadId,
      dayKey
    };
  });
}

export function selectSafelyReadableMessage(options: {
  readonly messages: readonly PresentedMessage[];
  readonly visibleMessageIds: ReadonlySet<string>;
  readonly lastReadSequence: number;
  readonly hasOlderHistory: boolean;
  readonly projectId?: string;
  readonly filtered?: boolean;
  readonly active?: boolean;
}): PresentedMessage | null {
  if (options.filtered || options.active === false) return null;
  if (options.projectId && options.messages.some((message) => message.projectId !== options.projectId)) return null;
  const messages = mergeMessagePages([{ items: options.messages }]);
  if (!messages.length) return null;
  if (options.hasOlderHistory && messages[0]!.sequence > options.lastReadSequence) return null;

  let readable: PresentedMessage | null = null;
  for (const message of messages) {
    if (message.sequence <= options.lastReadSequence) continue;
    if (!options.visibleMessageIds.has(message.id)) break;
    readable = message;
  }
  return readable;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The one-line row preview: "Author: excerpt", "You: excerpt", or an attachment summary. */
export function lastMessagePreviewText(lastMessage: PresentedLastMessage, currentUserId?: string | null): string {
  const author = currentUserId && lastMessage.author.id === currentUserId ? "You" : lastMessage.author.name;
  const body = lastMessage.excerpt || (lastMessage.attachmentCount > 0
    ? lastMessage.attachments[0]?.filename ?? countLabel(lastMessage.attachmentCount, "attachment")
    : "");
  return body ? `${author}: ${body}` : author;
}

export function conversationAccessibilitySummary(
  conversation: PresentedConversation,
  activityLabel?: string | null,
  currentUserId?: string | null
): string {
  const parts = [conversation.project.name];
  if (conversation.counts.unread > 0) parts.push(countLabel(conversation.counts.unread, "unread message"));
  if (conversation.counts.unreadMentions > 0) parts.push(countLabel(conversation.counts.unreadMentions, "unread mention"));
  if (conversation.counts.openCritical > 0) parts.push(countLabel(conversation.counts.openCritical, "open critical issue"));
  if (conversation.counts.openImportant > 0) parts.push(countLabel(conversation.counts.openImportant, "open important issue"));
  if (conversation.lastMessage === null) parts.push("No messages yet");
  else if (conversation.lastMessage) {
    parts.push(`last message from ${lastMessagePreviewText(conversation.lastMessage, currentUserId)}`);
    if (conversation.lastMessage.attachmentCount > 0) {
      parts.push(countLabel(conversation.lastMessage.attachmentCount, "attachment"));
    }
  }
  if (activityLabel) parts.push(activityLabel);
  return parts.join(", ");
}

export function messageAccessibilitySummary(message: PresentedMessage, timestampLabel?: string | null): string {
  const parts = [`Message from ${message.author}`, message.authorRole];
  if (message.body.trim()) parts.push(message.body.trim());
  if (message.attachments.length) {
    parts.push(countLabel(message.attachments.length, "attachment"));
    parts.push(message.attachments.map((attachment) => attachment.filename).join(", "));
  }
  if (message.priority !== "normal") parts.push(`${message.priority} priority`);
  if (message.issueStatus) parts.push(`${message.issueStatus} issue`);
  parts.push(timestampLabel || message.createdAt);
  return parts.join(", ");
}

export function createClientMessageId(now = Date.now(), random = Math.random()): string {
  return `android-${now.toString(36)}-${random.toString(36).slice(2, 14).padEnd(8, "0")}`;
}

export function createClientUploadId(now = Date.now(), random = Math.random()): string {
  return `upload-${now.toString(36)}-${random.toString(36).slice(2, 14).padEnd(8, "0")}`;
}
