import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, FileText, Play } from "lucide-react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { chatFileSize } from "./chatAttachments";
import { ChatTransferPool } from "./chatTransfers";
import { projectChatApi, chatErrorMessage, isChatDenied } from "./projectChatApi";
import { useProjectChat } from "./ProjectChatProvider";
import type { ChatAttachment } from "./projectChatTypes";

interface MediaContextValue {
  preview: (attachment: ChatAttachment, signal: AbortSignal, ready: (url: string) => void) => Promise<void>;
  open: (attachment: ChatAttachment, download?: boolean) => void;
}
const MediaContext = createContext<MediaContextValue | null>(null);
export function ChatMediaProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const chat = useProjectChat();
  const [previewSlots] = useState(() => new ChatTransferPool(16));
  const [viewer, setViewer] = useState<{ attachment: ChatAttachment; url?: string; error?: string; progress?: number; downloading?: boolean } | null>(null);
  const original = useRef<{ controller: AbortController; url?: string } | null>(null);
  const { transfer, isCurrent, verifyAccess } = chat;
  const release = useCallback(() => { original.current?.controller.abort(); if (original.current?.url) URL.revokeObjectURL(original.current.url); original.current = null; }, []);
  useEffect(() => release, [release]);
  const preview = useCallback(async (attachment: ChatAttachment, signal: AbortSignal, ready: (url: string) => void) => {
    const current = isCurrent(projectId);
    await previewSlots.run(async () => {
      let url: string | undefined;
      try {
        const result = await transfer(() => projectChatApi.attachmentBlob(projectId, attachment.id, "preview", signal, attachment.preview!.byteSize), signal);
        if (signal.aborted || !current()) return;
        url = URL.createObjectURL(result.blob); ready(url);
        await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
      } catch (error) { if (!signal.aborted && current() && isChatDenied(error)) void verifyAccess(projectId); throw error; }
      finally { if (url) URL.revokeObjectURL(url); }
    }, signal);
  }, [isCurrent, previewSlots, projectId, transfer, verifyAccess]);
  function save(url: string, filename: string) { const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); }
  const open = useCallback((attachment: ChatAttachment, downloading = false) => {
    release();
    const run = { controller: new AbortController(), url: undefined as string | undefined };
    original.current = run;
    const current = isCurrent(projectId);
    const valid = () => original.current === run && !run.controller.signal.aborted && current();
    setViewer({ attachment, downloading });
    void transfer(() => projectChatApi.attachmentBlob(projectId, attachment.id, "content", run.controller.signal, attachment.byteSize, progress => {
      if (valid()) setViewer(value => value ? { ...value, progress: progress.totalBytes ? Math.round(progress.loadedBytes / progress.totalBytes * 100) : undefined } : value);
    }), run.controller.signal).then(({ blob }) => {
      if (!valid()) return;
      run.url = URL.createObjectURL(blob);
      setViewer({ attachment, url: run.url, downloading });
      if (downloading) save(run.url, attachment.filename);
    }).catch(error => { if (valid()) { if (isChatDenied(error)) void verifyAccess(projectId); setViewer({ attachment, downloading, error: chatErrorMessage(error) }); } });
  }, [isCurrent, projectId, release, transfer, verifyAccess]);
  return <MediaContext.Provider value={{ preview, open }}>{children}{viewer ? <Dialog title={viewer.attachment.filename} eyebrow="Shared attachment" onClose={() => { release(); setViewer(null); }}><div className="project-chat-form project-chat-media-viewer">
    {!viewer.url && !viewer.error ? <p role="status">Loading attachment{viewer.progress === undefined ? "…" : ` · ${viewer.progress}%`}</p> : null}
    {viewer.error ? <p role="alert">{viewer.error}</p> : null}
    {viewer.url && !viewer.downloading && !viewer.error ? viewer.attachment.kind === "image" ? <img src={viewer.url} alt={viewer.attachment.filename} onError={() => setViewer(value => value ? { ...value, error: "This browser cannot preview this image. Download the original file." } : value)} /> : viewer.attachment.kind === "video" ? <video src={viewer.url} controls preload="metadata" onError={() => setViewer(value => value ? { ...value, error: "This browser cannot play this video. Download the original file." } : value)} /> : viewer.attachment.kind === "audio" ? <audio src={viewer.url} controls preload="metadata" onError={() => setViewer(value => value ? { ...value, error: "This browser cannot play this audio. Download the original file." } : value)} /> : null : null}
    <p>{chatFileSize(viewer.attachment.byteSize)} · {viewer.attachment.mimeType}</p>
    <div className="project-chat-form__actions">{viewer.url ? <a className="project-chat-download" href={viewer.url} download={viewer.attachment.filename}>Download original</a> : viewer.error ? <Button onClick={() => open(viewer.attachment, viewer.downloading)}>Retry attachment</Button> : null}<Button variant="secondary" onClick={() => { release(); setViewer(null); }}>Close</Button></div>
  </div></Dialog> : null}</MediaContext.Provider>;
}

function AttachmentTile({ attachment }: { attachment: ChatAttachment }) {
  const context = useContext(MediaContext)!;
  const tile = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!attachment.preview || !tile.current) return;
    if (typeof IntersectionObserver === "undefined") { setNearby(true); return; }
    const observer = new IntersectionObserver(entries => setNearby(entries.some(entry => entry.isIntersecting)), { root: tile.current.closest(".project-chat-timeline"), rootMargin: "160px", threshold: 0 });
    observer.observe(tile.current); return () => observer.disconnect();
  }, [attachment.id, attachment.preview]);
  const { preview } = context;
  useEffect(() => {
    if (!nearby || !attachment.preview) return;
    const controller = new AbortController();
    setFailed(false);
    void preview(attachment, controller.signal, setUrl).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); setUrl(undefined); };
  }, [attachment, nearby, preview]);
  const media = ["image", "audio", "video"].includes(attachment.kind);
  return <div ref={tile} className={`project-chat-attachment project-chat-attachment--${attachment.kind}`}>
    {attachment.kind === "image" ? <button type="button" className="project-chat-attachment__image" aria-label={`View ${attachment.filename}`} onClick={() => context.open(attachment)}>{url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <span>{failed || !attachment.preview ? "Image preview unavailable" : "Photo"}<small>View original</small></span>}</button> : null}
    <div className="project-chat-attachment__label"><FileText size={18} aria-hidden="true" /><span><strong title={attachment.filename}>{attachment.filename}</strong><small>{chatFileSize(attachment.byteSize)} · {attachment.kind}</small></span></div>
    <div className="project-chat-attachment__actions">{media && attachment.kind !== "image" ? <button type="button" onClick={() => context.open(attachment)}><Play size={14} aria-hidden="true" /> Load {attachment.kind}</button> : null}<button type="button" aria-label={`Download ${attachment.filename}`} onClick={() => context.open(attachment, true)}><Download size={14} aria-hidden="true" /> Download</button></div>
  </div>;
}
export function ChatMessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  return <div className="project-chat-attachments" aria-label="Message attachments">{attachments.map(attachment => <AttachmentTile key={attachment.id} attachment={attachment} />)}</div>;
}
