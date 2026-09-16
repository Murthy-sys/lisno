import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { chatFileSize } from "./chatAttachments";
import type { ChatLocalAttachment } from "./projectChatState";
import { ChatAudioBubble, type ChatAudioSender } from "./ChatAudioBubble";

function LocalPreview({ item }: { item: ChatLocalAttachment }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (item.kind !== "image") return;
    const value = URL.createObjectURL(item.file); setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [item.file, item.kind]);
  return item.kind === "image" && url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <FileText size={24} aria-hidden="true" />;
}
export function ChatFileTray({ files, onRemove, sender }: { files: ChatLocalAttachment[]; onRemove?: (id: string) => void; sender?: ChatAudioSender }) {
  const audioOnly = files.length > 0 && files.every(item => item.kind === "audio");
  return <ul className={`project-chat-file-tray${audioOnly ? " project-chat-file-tray--audio" : ""}`} aria-label={onRemove ? "Selected attachments" : "Outgoing attachments"}>{files.map(item => <li key={item.localId} className={item.kind === "audio" ? "project-chat-file-tray__audio" : undefined}>
    {item.kind === "audio" ? <ChatAudioBubble source={{ key: `local:${item.localId}`, filename: item.file.name, file: item.file }} sender={sender} draftLabel={Boolean(onRemove)} error={item.error} upload={!item.error && item.progress !== undefined ? item.staged ? "Sending…" : item.progress >= 100 ? "Checking audio…" : `Uploading ${item.progress}%` : undefined} /> : <><LocalPreview item={item} /><div><strong title={item.file.name}>{item.file.name}</strong><small>{item.kind} · {chatFileSize(item.file.size)}</small>{item.progress !== undefined ? <><progress aria-label={`Upload ${item.file.name}`} value={item.progress} max={100} /><small>{item.staged ? "Uploaded" : `${item.progress}% uploaded`}</small></> : null}{item.error ? <small role="status">{item.error}</small> : null}</div></>}
    {onRemove ? <button type="button" className="project-chat-icon" aria-label={`Remove ${item.file.name}`} onClick={() => onRemove(item.localId)}><X size={16} aria-hidden="true" /></button> : null}
  </li>)}</ul>;
}
