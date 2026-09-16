import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { chatFileSize } from "./chatAttachments";
import type { ChatLocalAttachment } from "./projectChatState";

function LocalPreview({ item }: { item: ChatLocalAttachment }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!["image", "audio"].includes(item.kind)) return;
    const value = URL.createObjectURL(item.file); setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [item.file, item.kind]);
  return item.kind === "image" && url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : item.kind === "audio" && url ? <audio src={url} controls preload="none" aria-label={`Preview ${item.file.name}`} /> : <FileText size={24} aria-hidden="true" />;
}
export function ChatFileTray({ files, onRemove }: { files: ChatLocalAttachment[]; onRemove?: (id: string) => void }) {
  return <ul className="project-chat-file-tray" aria-label={onRemove ? "Selected attachments" : "Outgoing attachments"}>{files.map(item => <li key={item.localId}>
    <LocalPreview item={item} /><div><strong title={item.file.name}>{item.file.name}</strong><small>{item.kind} · {chatFileSize(item.file.size)}</small>{item.progress !== undefined ? <><progress aria-label={`Upload ${item.file.name}`} value={item.progress} max={100} /><small>{item.staged ? "Uploaded" : `${item.progress}% uploaded`}</small></> : null}{item.error ? <small role="status">{item.error}</small> : null}</div>
    {onRemove ? <button type="button" className="project-chat-icon" aria-label={`Remove ${item.file.name}`} onClick={() => onRemove(item.localId)}><X size={16} aria-hidden="true" /></button> : null}
  </li>)}</ul>;
}
