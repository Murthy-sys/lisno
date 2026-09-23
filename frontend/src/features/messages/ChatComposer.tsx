import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Flag, Mic, Paperclip, Send, Smile, Square, X } from "lucide-react";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { ChatActionMenu } from "./ChatActionMenu";
import { ChatEmojiPicker } from "./ChatEmojiPicker";
import { ChatFileTray } from "./ChatFileTray";
import { attachmentSummaryText, selectChatFiles } from "./chatAttachments";
import { useChatRecorder } from "./useChatRecorder";
import { mentionsAfterEdit, type ChatDraft } from "./projectChatState";
import type { ChatAttachmentPolicy, ChatParticipant, ChatPerson, ChatPriority } from "./projectChatTypes";

export function ChatComposer({ draft, participants, disabled, onChange, onSend, policy, policyError, onRetryPolicy, sender, onTypingEdit, onTypingStop }: {
  draft: ChatDraft; participants: ChatParticipant[]; disabled: boolean;
  onChange: (draft: ChatDraft) => void; onSend: () => void;
  policy?: ChatAttachmentPolicy; policyError?: string; onRetryPolicy?: () => void;
  sender?: Pick<ChatPerson, "id" | "name">;
  onTypingEdit?: (body: string) => void; onTypingStop?: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef({ start: draft.body.length, end: draft.body.length });
  const [fileAccept, setFileAccept] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canAttach = Boolean(!disabled && policy?.enabled && policy.capabilities.canUpload);
  const files = draft.files ?? [];
  function addFiles(selected: File[], recorded = false) {
    if (!policy || !canAttach) { setSelectionError("Attachments are unavailable. Your text draft is unchanged."); return; }
    if (!recorded && voice.state !== "idle") { setSelectionError("Finish or cancel the recording before adding more files."); return; }
    const result = selectChatFiles(selected, files, policy);
    setSelectionError(result.error ?? "");
    if (!result.error) onChange({ ...draft, files: result.files });
  }
  const voice = useChatRecorder(disabled ? undefined : policy, file => addFiles([file], true));
  function chooseFiles(kinds: string[]) {
    setFileAccept(policy?.formats.filter(format => kinds.includes(format.kind)).flatMap(format => format.extensions.map(extension => extension.startsWith(".") ? extension : `.${extension}`)).join(",") ?? "");
    requestAnimationFrame(() => fileInput.current?.click());
  }
  function insertEmoji(emoji: string) {
    const { start, end } = selection.current;
    const body = draft.body.slice(0, start) + emoji + draft.body.slice(end);
    const caret = start + emoji.length;
    pendingSelection.current = caret;
    onChange({ ...draft, body, mentions: mentionsAfterEdit(draft.body, body, draft.mentions) });
    onTypingEdit?.(body);
    setCursor(caret); setEmojiOpen(false);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); });
  }
  const pendingSelection = useRef<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const prefix = draft.body.slice(0, cursor);
  const match = prefix.match(/(?:^|\s)@([^@\n]{0,60})$/u);
  const search = match?.[1].toLocaleLowerCase() ?? "";
  const mentionStart = match ? prefix.length - search.length - 1 : -1;
  const suggestions = match && !dismissed ? participants.filter(person => `${person.name} ${ROLE_LABELS[person.role]}`.toLocaleLowerCase().includes(search)).slice(0, 12) : [];
  const expanded = Boolean(match && !dismissed && !disabled);
  const selectedIndex = Math.min(active, Math.max(0, suggestions.length - 1));
  const unavailableMentions = draft.mentions.some(mention => !participants.some(person => person.id === mention.userId));
  const unavailableOwner = Boolean(draft.responsibleUserId && !participants.some(person => person.id === draft.responsibleUserId));
  const tooManyMentions = new Set(draft.mentions.map(mention => mention.userId)).size > 20;
  useLayoutEffect(() => {
    if (pendingSelection.current === null) return;
    input.current?.focus(); input.current?.setSelectionRange(pendingSelection.current, pendingSelection.current);
    pendingSelection.current = null;
  }, [draft.body]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const option = document.getElementById(`${id}-person-${selectedIndex}`);
    const popup = option?.closest<HTMLElement>(".project-chat-mentions");
    if (!option || !popup) return;
    const top = option.offsetTop;
    if (top < popup.scrollTop) popup.scrollTop = top;
    else if (top + option.offsetHeight > popup.scrollTop + popup.clientHeight) popup.scrollTop = top + option.offsetHeight - popup.clientHeight;
  }, [expanded, id, selectedIndex, search]);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, Math.max(44, Math.min(160, window.innerHeight * 0.24)))}px`;
  }, [draft.body]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    let width = element.clientWidth;
    const grow = () => { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, Math.max(44, Math.min(160, window.innerHeight * 0.24)))}px`; };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (width !== element.clientWidth) { width = element.clientWidth; grow(); } });
    observer?.observe(element);
    window.addEventListener("resize", grow);
    return () => { observer?.disconnect(); window.removeEventListener("resize", grow); };
  }, []);

  function select(person: ChatParticipant) {
    if (mentionStart < 0) return;
    const text = `@${person.name}`;
    const body = `${draft.body.slice(0, mentionStart)}${text} ${draft.body.slice(cursor)}`;
    const mentions = mentionsAfterEdit(draft.body, body, draft.mentions);
    mentions.push({ userId: person.id, start: mentionStart, end: mentionStart + text.length });
    mentions.sort((a, b) => a.start - b.start);
    const nextCursor = mentionStart + text.length + 1;
    pendingSelection.current = nextCursor;
    onChange({ ...draft, body, mentions });
    onTypingEdit?.(body);
    setCursor(nextCursor); setDismissed(true);
  }
  const sendDisabled = disabled || Boolean(selectionError) || (!draft.body.trim() && !files.length) || (files.length > 0 && !canAttach) || voice.state !== "idle" || draft.body.length > 4000 || unavailableMentions || unavailableOwner || tooManyMentions;
  function submit() { if (!sendDisabled) { onTypingStop?.(); onSend(); } }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (expanded) {
      if (event.key === "Escape") { event.preventDefault(); setDismissed(true); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); setActive((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, suggestions.length)) % Math.max(1, suggestions.length)); return;
      }
      if (event.key === "Enter" && suggestions[selectedIndex]) { event.preventDefault(); select(suggestions[selectedIndex]); return; }
    }
    if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      event.preventDefault(); submit();
    }
  }
  const validation = unavailableMentions ? "A mentioned person is no longer available. Remove their mention and choose a current participant." : unavailableOwner ? "The responsible person is no longer available. Choose a current participant or Unassigned." : tooManyMentions ? "Mention up to 20 people per message." : draft.body.length > 4000 ? "Messages can contain up to 4,000 characters." : "";
  return <form className={`project-chat-composer${dragging ? " project-chat-composer--dragging" : ""}`} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} aria-label="Write a project message" onSubmit={event => { event.preventDefault(); submit(); }}>
    {draft.reply ? <div className="project-chat-composer__reply"><div><strong>Replying to {draft.reply.author.name}</strong><p>{draft.reply.body || attachmentSummaryText(draft.reply.attachmentSummary)}</p></div><IconButton label="Cancel reply" variant="quiet" icon={<X size={16} />} onClick={() => onChange({ ...draft, reply: null })} /></div> : null}
    {draft.priority !== "normal" ? <div className="project-chat-composer__selection"><button type="button" className={`project-chat-priority project-chat-priority--${draft.priority}`} onClick={() => setOptionsOpen(true)}>{draft.priority === "critical" ? "Critical" : "Important"}{draft.responsibleUserId ? ` · ${participants.find(person => person.id === draft.responsibleUserId)?.name ?? "Person unavailable"}` : ""}</button><button type="button" className="project-chat-icon" aria-label="Clear message importance" onClick={() => onChange({ ...draft, priority: "normal", responsibleUserId: "" })}><X size={16} aria-hidden="true" /></button></div> : null}
    {files.length ? <ChatFileTray files={files} sender={sender} onRemove={id => onChange({ ...draft, files: files.filter(file => file.localId !== id) })} /> : null}
    {voice.state !== "idle" ? <div className="project-chat-recording" role="status"><span>{voice.state === "requesting" ? "Requesting microphone…" : `Recording ${Math.floor(voice.elapsed / 60)}:${String(voice.elapsed % 60).padStart(2, "0")}`}</span>{voice.state === "recording" ? <button type="button" onClick={voice.stop}><Square size={14} aria-hidden="true" /> Stop recording</button> : null}<button type="button" className="ui-button ui-button--destructive-outline" onClick={voice.cancel}>Cancel recording</button></div> : null}
    <input className="sr-only" ref={fileInput} type="file" multiple accept={fileAccept} aria-label="Choose attachments" tabIndex={-1} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <div className="project-chat-composer__row">
    <div className="project-chat-composer__tools">
    {canAttach && voice.state === "idle" ? <ChatActionMenu label="Attach" icon={<Paperclip size={20} aria-hidden="true" />} items={[{ label: "Photos and videos", onSelect: () => chooseFiles(["image", "video"]) }, { label: "Documents and ZIP", onSelect: () => chooseFiles(["document", "archive"]) }, { label: "Audio files", onSelect: () => chooseFiles(["audio"]) }]} /> : null}
    <button type="button" className="project-chat-icon" aria-label="Emoji" aria-haspopup="dialog" disabled={disabled} onClick={() => { selection.current = { start: input.current?.selectionStart ?? draft.body.length, end: input.current?.selectionEnd ?? draft.body.length }; setEmojiOpen(true); }}><Smile size={20} aria-hidden="true" /></button>
    <button type="button" className="project-chat-icon project-chat-composer__importance" aria-label="Message importance" aria-haspopup="dialog" onClick={() => setOptionsOpen(true)} disabled={disabled}><Flag size={20} aria-hidden="true" /></button>
    {canAttach && policy?.capabilities.canRecord ? <button type="button" className="project-chat-icon" aria-label="Record voice note" disabled={voice.state !== "idle" || files.length >= policy.limits.maxAttachments} onClick={() => void voice.start()}><Mic size={20} aria-hidden="true" /></button> : null}
    </div>
    <div className="project-chat-composer__input" role="combobox" aria-label="Participant mentions" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-mentions` : undefined}>
      <label className="sr-only" htmlFor={`${id}-body`}>Message the project team</label>
      <Textarea id={`${id}-body`} ref={input} rows={1} value={draft.body} disabled={disabled}
        placeholder="Type a message" aria-autocomplete="list" aria-controls={expanded ? `${id}-mentions` : undefined}
        aria-activedescendant={expanded && suggestions.length ? `${id}-person-${selectedIndex}` : undefined} aria-describedby={`${id}-audience ${id}-help`} aria-invalid={Boolean(validation) || undefined}
        onKeyDown={keyDown} onBlur={onTypingStop} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; onTypingEdit?.(event.currentTarget.value); }}
        onSelect={event => { setCursor(event.currentTarget.selectionStart); selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
        onPaste={event => { const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/")); if (images.length) { event.preventDefault(); addFiles(images); } }}
        onChange={event => { const body = event.target.value; onChange({ ...draft, body, mentions: mentionsAfterEdit(draft.body, body, draft.mentions) }); onTypingEdit?.(body); setCursor(event.target.selectionStart); setActive(0); setDismissed(false); }} />
      {expanded ? <div className="project-chat-mentions"><ul id={`${id}-mentions`} role="listbox" aria-label="Project participants">
        {suggestions.map((person, index) => <li key={person.id} id={`${id}-person-${index}`} role="option" aria-selected={index === selectedIndex} onMouseDown={event => event.preventDefault()} onClick={() => select(person)}>
          <strong>{person.name}</strong><span>{ROLE_LABELS[person.role]}{participants.some(other => other.id !== person.id && other.name === person.name && other.role === person.role) ? ` · ${person.id.slice(-6)}` : ""}</span>
        </li>)}
      </ul>{!suggestions.length ? <p role="status">No matching participants.</p> : null}</div> : null}
    </div>
    <button type="submit" disabled={sendDisabled} aria-label="Send" className="project-chat-composer__send"><Send size={21} aria-hidden="true" /></button>
    </div>
    <div className="project-chat-composer__audience"><span id={`${id}-audience`}>Shared with the client and project team</span>{draft.body.length >= 3600 ? <span className="project-chat-composer__count" aria-live="polite">{draft.body.length.toLocaleString()}/4,000</span> : null}</div>
    <p id={`${id}-help`} className={validation ? "project-chat-error" : "sr-only"} role={validation ? "status" : undefined}>{validation || "Type @ to mention someone. Shift+Enter adds a line."}</p>
    {selectionError || voice.error ? <p className="project-chat-error" role="status">{selectionError || voice.error}{selectionError ? <> <button type="button" onClick={() => setSelectionError("")}>Dismiss attachment error</button></> : null}</p> : null}
    {policyError ? <p className="project-chat-error" role="status">{policyError} <button type="button" onClick={onRetryPolicy}>Retry attachments</button></p> : null}
    {emojiOpen ? <ChatEmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} /> : null}
    {optionsOpen ? <Dialog title="Message importance" eyebrow="Project discussion" description="Importance is chosen by a person. A mention does not assign responsibility." onClose={() => setOptionsOpen(false)}>
      <div className="project-chat-form">
        <Field id={`${id}-priority`} label="Importance">{props => <Select {...props} value={draft.priority} disabled={disabled} onChange={event => onChange({ ...draft, priority: event.target.value as ChatPriority, responsibleUserId: event.target.value === "normal" ? "" : draft.responsibleUserId })}><option value="normal">Normal</option><option value="important">Important</option><option value="critical">Critical</option></Select>}</Field>
        {draft.priority !== "normal" ? <Field id={`${id}-owner`} label="Responsible person (optional)">{props => <Select {...props} value={draft.responsibleUserId} disabled={disabled} onChange={event => onChange({ ...draft, responsibleUserId: event.target.value })}><option value="">Unassigned</option>{unavailableOwner ? <option value={draft.responsibleUserId} disabled>Previously selected person (unavailable)</option> : null}{participants.map(person => <option key={person.id} value={person.id}>{person.name} · {ROLE_LABELS[person.role]}</option>)}</Select>}</Field> : null}
        <div className="project-chat-form__actions"><Button onClick={() => setOptionsOpen(false)}>Done</Button></div>
      </div>
    </Dialog> : null}
  </form>;
}
