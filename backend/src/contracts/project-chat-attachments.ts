import type { Readable } from "node:stream";
import type { ChatActor, ChatAttachmentPolicy, ChatStagedAttachment } from "./project-chat.js";
import type { ChatAttachmentRecord } from "../repositories/project-chat.js";

/** Server-internal lease. Never serialize storage references or transfer tokens. */
export interface ChatUploadReservation { record: ChatAttachmentRecord; timeoutMs: number }
export interface ProjectChatAttachmentService {
  policy(actor: ChatActor, projectId: string): Promise<ChatAttachmentPolicy>;
  beginUpload(actor: ChatActor, projectId: string, input: {uploadId: string; sizeBytes: number}): Promise<ChatUploadReservation>;
  receiveUpload(actor: ChatActor, reservation: ChatUploadReservation, file: {source: Readable; filename: string; mimeType: string; signal?: AbortSignal; multipartComplete?: Promise<void>}): Promise<ChatStagedAttachment>;
  abandonUpload(reservation: ChatUploadReservation): Promise<void>;
  discard(actor: ChatActor, projectId: string, attachmentId: string): Promise<void>;
  download(actor: ChatActor, projectId: string, attachmentId: string, variant: "content" | "preview", signal?: AbortSignal): Promise<{filename: string; mimeType: string; byteSize: number; stream: Readable}>;
  cleanup(input?: {limit?: number}): Promise<{claimed: number; deleted: number; failed: number}>;
}
