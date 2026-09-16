import type { ChatAttachment, ChatAttachmentPolicy, ChatAttachmentSummary } from "./projectChatTypes";
import type { ChatLocalAttachment } from "./projectChatState";

export const chatFileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function attachmentSummary(attachments: ChatAttachment[]): ChatAttachmentSummary | null {
  return attachments[0] ? { count: attachments.length, kind: attachments[0].kind, filename: attachments[0].filename } : null;
}
export function attachmentSummaryText(summary?: ChatAttachmentSummary | null) {
  if (!summary) return "";
  if (summary.count > 1) return `${summary.count} attachments`;
  return ({ image: "Photo", video: "Video", audio: "Audio", document: summary.filename, archive: summary.filename })[summary.kind];
}
export function selectChatFiles(files: File[], existing: ChatLocalAttachment[], policy: ChatAttachmentPolicy): { files: ChatLocalAttachment[]; error?: string } {
  if (!policy.enabled || !policy.capabilities.canUpload) return { files: existing, error: "Attachments are not available for your current access." };
  if (existing.length + files.length > policy.limits.maxAttachments) return { files: existing, error: `Choose up to ${policy.limits.maxAttachments} files per message.` };
  if (existing.reduce((total, item) => total + item.file.size, 0) + files.reduce((total, file) => total + file.size, 0) > policy.limits.maxMessageBytes) return { files: existing, error: `Selected files must total no more than ${chatFileSize(policy.limits.maxMessageBytes)}.` };
  const selected: ChatLocalAttachment[] = [];
  for (const file of files) {
    const extension = file.name.includes(".") ? `.${file.name.split(".").at(-1)!.toLowerCase()}` : "";
    const formats = policy.formats.filter(item => item.extensions.some(value => (value.startsWith(".") ? value : `.${value}`).toLowerCase() === extension));
    const format = formats.find(item => item.mimeTypes.includes(file.type.split(";")[0])) ?? formats[0];
    if (!format) return { files: existing, error: `${file.name}: supported formats are ${policy.formats.map(item => item.label).join(", ")}.` };
    if (!file.size || file.size > policy.limits.maxFileBytes) return { files: existing, error: `${file.name}: choose a nonempty file up to ${chatFileSize(policy.limits.maxFileBytes)}.` };
    selected.push({ localId: crypto.randomUUID(), clientUploadId: crypto.randomUUID(), file, kind: format.kind });
  }
  return { files: [...existing, ...selected] };
}
