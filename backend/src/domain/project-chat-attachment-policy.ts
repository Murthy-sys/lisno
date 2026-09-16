import type { ChatAttachmentPolicy } from "../contracts/project-chat.js";

export const CHAT_ATTACHMENT_DEFAULT_LIMITS: ChatAttachmentPolicy["limits"] = {
  maxAttachments: 10, maxFileBytes: 50 * 1024 * 1024, maxMessageBytes: 100 * 1024 * 1024,
  maxConcurrentTransfers: 2, maxStagedAttachments: 20, maxStagedBytes: 200 * 1024 * 1024,
  stagedTtlSeconds: 24 * 60 * 60, maxRecordingSeconds: 5 * 60
};
const formats: ChatAttachmentPolicy["formats"] = [
  {kind: "image", label: "Images", extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".tif", ".tiff"], mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff"]},
  {kind: "video", label: "Videos", extensions: [".mp4", ".mov", ".webm"], mimeTypes: ["video/mp4", "video/quicktime", "video/webm"]},
  {kind: "audio", label: "Audio", extensions: [".mp3", ".m4a", ".mp4", ".wav", ".ogg", ".opus", ".webm"], mimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"]},
  {kind: "document", label: "Documents", extensions: [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".csv"], mimeTypes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"]},
  {kind: "archive", label: "ZIP archives", extensions: [".zip"], mimeTypes: ["application/zip"]}
];
export function createProjectChatAttachmentPolicy(input: Partial<ChatAttachmentPolicy["limits"]> & {enabled?: boolean} = {}): ChatAttachmentPolicy {
  const {enabled = true, ...overrides} = input;
  const limits = {...CHAT_ATTACHMENT_DEFAULT_LIMITS, ...overrides};
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Chat attachment limits must be positive safe integers.");
  if (limits.maxAttachments > 100 || limits.maxConcurrentTransfers > 10 || limits.maxFileBytes > limits.maxMessageBytes || limits.maxFileBytes > limits.maxStagedBytes || limits.maxAttachments > limits.maxStagedAttachments) throw new Error("Chat attachment limits are inconsistent.");
  return {enabled, capabilities: {canUpload: enabled, canRecord: enabled}, limits, formats: structuredClone(formats), recordingMimeTypes: ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]};
}
