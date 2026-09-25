import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Check, ChevronDown } from "lucide-react";
import { chatDueDate } from "./ChatTrackedAction";
import { ChatMessageAttachments } from "./ChatMessageAttachments";
import { ChatFileTray } from "./ChatFileTray";
import { attachmentSummaryText } from "./chatAttachments";
import { ChatActionMenu, chatSenderColor } from "./ChatActionMenu";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { chatIssueActions } from "./ChatIssueDialog";
import { chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useProjectChat, type ChatSendAttempt } from "./ProjectChatProvider";
import { readableChatMessage } from "./projectChatState";
import type { ChatMessage } from "./projectChatTypes";

export function chatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function MessageTime({ message, own }: { message: ChatMessage; own: boolean }) {
  return <span className="project-chat-message__time"><time dateTime={message.createdAt} title={chatTime(message.createdAt)}>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</time>{own ? <span role="img" aria-label="Sent" title="Sent"><Check size={14} aria-hidden="true" /></span> : null}</span>;
}
function MessageBody({ message, own }: { message: ChatMessage; own: boolean }) {
  const parts = [];
  let start = 0;
  for (const mention of [...message.mentions].sort((a, b) => a.start - b.start)) {
    if (mention.start < start || mention.end > message.body.length) continue;
    parts.push(message.body.slice(start, mention.start));
    parts.push(<mark key={`${mention.userId}-${mention.start}`}>{message.body.slice(mention.start, mention.end)}</mark>);
    start = mention.end;
  }
  parts.push(message.body.slice(start));
  return <p className="project-chat-message__body">{parts}<MessageTime message={message} own={own} /></p>;
}

function useVisibleChatRead({ projectId, messages, lastRead, hasOlder, filtered, container }: { projectId: string; messages: ChatMessage[]; lastRead: number; hasOlder: boolean; filtered: boolean; container: RefObject<HTMLDivElement | null> }) {
  const chat = useProjectChat();
  const queryClient = useQueryClient();
  const seen = useRef(new Set<string>());
  const readPosition = useRef(lastRead);
  readPosition.current = Math.max(readPosition.current, lastRead);
  const [error, setError] = useState(false);
  const { scope, isCurrent, verifyAccess } = chat;
  useEffect(() => {
    if (filtered || !container.current || typeof IntersectionObserver === "undefined") return;
    const valid = isCurrent(projectId);
    const controller = new AbortController();
    let sending = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const visibleNow = new Set<string>();
    const check = () => {
      if (sending || controller.signal.aborted || !valid() || document.visibilityState !== "visible") return;
      for (const id of visibleNow) seen.current.add(id);
      const candidate = readableChatMessage({ messages, visibleIds: seen.current, lastRead: readPosition.current, hasOlder, filtered, documentVisible: true });
      if (!candidate) return;
      sending = true;
      void projectChatApi.read(projectId, { messageId: candidate.id, sequence: candidate.sequence }, controller.signal).then(result => {
        if (!valid() || controller.signal.aborted) return;
        readPosition.current = Math.max(readPosition.current, result.lastReadSequence);
        setError(false);
        void queryClient.invalidateQueries({ queryKey: chatKeys.summary(scope, projectId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.list(scope) });
      }).catch(failure => {
        if (!valid() || controller.signal.aborted) return;
        if (isChatDenied(failure)) void verifyAccess(projectId);
        setError(true); retryTimer = setTimeout(check, 5000);
      }).finally(() => { sending = false; if (!retryTimer && valid() && !controller.signal.aborted) queueMicrotask(check); });
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.messageId;
        if (!id) continue;
        if (entry.isIntersecting) visibleNow.add(id); else visibleNow.delete(id);
      }
      check();
    }, { root: container.current, threshold: 0.1 });
    for (const item of container.current.querySelectorAll("[data-message-id]")) observer.observe(item);
    document.addEventListener("visibilitychange", check);
    return () => { controller.abort(); observer.disconnect(); clearTimeout(retryTimer); document.removeEventListener("visibilitychange", check); };
  }, [container, filtered, hasOlder, isCurrent, messages, projectId, queryClient, verifyAccess, scope, lastRead]);
  return error;
}

export function ChatTimeline({ projectId, messages, attempts, lastRead, hasOlder, hasNewer, filtered, around, latestSequence, loadingOlder, loadingNewer, canSend, onOlder, onNewer, onLatest, onReply, onContext, onIssue, onRetry, onEditAttempt, onCancel, onDiscard }: {
  projectId: string; messages: ChatMessage[]; attempts: ChatSendAttempt[]; lastRead: number;
  hasOlder: boolean; hasNewer: boolean; filtered: boolean; around?: string; latestSequence: number;
  loadingOlder: boolean; loadingNewer: boolean; canSend: boolean;
  onOlder: () => void; onNewer: () => void; onLatest: () => void;
  onReply: (message: ChatMessage) => void; onContext: (id: string) => void; onIssue: (message: ChatMessage) => void;
  onRetry: (attempt: ChatSendAttempt) => void; onEditAttempt: (attempt: ChatSendAttempt) => void;
  onCancel?: (attempt: ChatSendAttempt) => void; onDiscard?: (attempt: ChatSendAttempt) => void;
}) {
  const { userId } = useProjectChat();
  const container = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(!filtered && !around);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const visibleAnchor = useRef<{ id: string; offset: number } | null>(null);
  const viewportSize = useRef({ width: 0, height: 0 });
  const previous = useRef<{ sequence: number; attemptCount: number } | null>(null);
  const [arrivals, setArrivals] = useState(false);
  const [unreadBoundary] = useState(lastRead);
  const readError = useVisibleChatRead({ projectId, messages, lastRead, hasOlder, filtered, container });
  const rememberPosition = useCallback(() => {
    const element = container.current;
    if (!element) return;
    viewportSize.current = { width: element.clientWidth, height: element.clientHeight };
    const bounds = element.getBoundingClientRect();
    const first = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.getBoundingClientRect().bottom > bounds.top);
    visibleAnchor.current = first?.dataset.messageId ? { id: first.dataset.messageId, offset: first.getBoundingClientRect().top - bounds.top } : null;
  }, []);
  const scrollToBottom = useCallback(() => {
    if (container.current) container.current.scrollTop = container.current.scrollHeight;
    nearBottom.current = true; setArrivals(false);
  }, []);
  const newest = messages.at(-1)?.sequence ?? 0;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const initial = previous.current === null;
    const newMessage = !initial && newest > previous.current!.sequence;
    const ownSend = attempts.length > (previous.current?.attemptCount ?? 0);
    if (anchor.current) {
      const target = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.dataset.messageId === anchor.current!.id);
      if (target) element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.current.offset;
      anchor.current = null;
    } else if (initial && around) {
      const target = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.dataset.messageId === around);
      if (target) element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
    } else if ((initial && !filtered) || ownSend || (newMessage && nearBottom.current && !hasNewer)) scrollToBottom();
    else if (newMessage) setArrivals(true);
    previous.current = { sequence: newest, attemptCount: attempts.length };
    rememberPosition();
  }, [around, attempts.length, filtered, hasNewer, messages, newest, rememberPosition, scrollToBottom]);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const resized = () => {
      if (element.clientWidth === viewportSize.current.width && element.clientHeight === viewportSize.current.height) return;
      if (nearBottom.current) element.scrollTop = element.scrollHeight;
      else if (visibleAnchor.current) {
        const saved = visibleAnchor.current;
        const target = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.dataset.messageId === saved.id);
        if (target) element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      }
      rememberPosition();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resized);
    observer?.observe(element);
    window.addEventListener("resize", resized);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resized); };
  }, [rememberPosition]);
  function rememberScroll() {
    const element = container.current;
    if (!element) return;
    // A resize can emit scroll before ResizeObserver. Retain the pre-resize intent.
    if (element.clientWidth !== viewportSize.current.width || element.clientHeight !== viewportSize.current.height) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    rememberPosition();
  }
  function older() {
    const element = container.current;
    if (element) {
      const first = [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(item => item.getBoundingClientRect().bottom > element.getBoundingClientRect().top);
      if (first?.dataset.messageId) anchor.current = { id: first.dataset.messageId, offset: first.getBoundingClientRect().top - element.getBoundingClientRect().top };
    }
    onOlder();
  }
  const missingUnreadHistory = !filtered && hasOlder && Boolean(messages[0]) && messages[0].sequence > lastRead;
  const firstUnreadId = filtered ? undefined : messages.find(message => message.sequence > unreadBoundary && message.author.id !== userId)?.id;
  const ownSender = messages.find(message => message.author.id === userId)?.author ?? { id: userId, name: "You" };
  return <div className="project-chat-timeline-wrap">
    {readError ? <p className="project-chat-warning" role="status">Read position has not synced. Retrying automatically.</p> : null}
    {missingUnreadHistory ? <p className="project-chat-muted">Earlier unread messages remain. Load earlier messages to read them in order.</p> : null}
    <div className="project-chat-timeline" ref={container} role="region" aria-label={filtered ? "Filtered project messages" : "Project conversation"} tabIndex={0} onScroll={rememberScroll}>
      {hasOlder ? <Button className="project-chat-timeline__pagination" variant="quiet" busy={loadingOlder} onClick={older}>Load earlier messages</Button> : <p className="project-chat-timeline__start">{filtered ? "Discussion results" : "Beginning of the conversation"}</p>}
      {!messages.length ? <div className="project-chat-empty"><strong>{filtered ? "No messages in this view" : "Start the project conversation"}</strong><p>{filtered ? "Choose another filter to continue the discussion." : "Ask a question, share an update, or use @ to bring in the right person."}</p></div> : null}
      {messages.map((message, index) => {
        const day = new Date(message.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
        const previousDay = index ? new Date(messages[index - 1].createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
        const own = message.author.id === userId;
        const audioOnly = !message.body && Boolean(message.attachments?.length) && message.attachments.every(attachment => attachment.kind === "audio");
        const previousMessage = messages[index - 1];
        const grouped = previousMessage?.author.id === message.author.id && day === previousDay && new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() < 300_000 && firstUnreadId !== message.id;
        const issueActions = chatIssueActions(message);
        const items = [
          ...(canSend ? [{ label: "Reply", onSelect: () => onReply(message) }] : []),
          ...(issueActions.length || message.priority !== "normal" || message.issueHistory.length ? [{ label: issueActions.length ? message.priority === "normal" ? "Flag importance" : "Manage issue" : "Issue details", onSelect: () => onIssue(message) }] : []),
          ...(filtered ? [{ label: "View in conversation", onSelect: () => onContext(message.id) }] : [])
        ];
        return <div className="project-chat-message-row" key={message.id}>{day !== previousDay ? <p className="project-chat-date"><span>{day}</span></p> : null}
          {firstUnreadId === message.id ? <p className="project-chat-unread"><span>Unread messages</span></p> : null}
          <article data-message-id={message.id} className={`project-chat-message${own ? " project-chat-message--own" : ""}${grouped ? " project-chat-message--grouped" : " project-chat-message--first"}${around === message.id ? " project-chat-message--target" : ""}`} aria-label={`Message from ${message.author.name}`}>
            <div className={grouped || own ? "sr-only" : "project-chat-message__meta"}><strong style={{ color: chatSenderColor(message.author.id) }}>{message.author.name}</strong><span>{ROLE_LABELS[message.author.role]}</span></div>
            {items.length ? <div className="project-chat-message__menu"><ChatActionMenu label={`Message options from ${message.author.name}`} items={items} icon={<ChevronDown size={16} aria-hidden="true" />} /></div> : null}
            {message.replyTo ? <button type="button" className="project-chat-quote" onClick={() => onContext(message.replyTo!.id)} aria-label={`View original message from ${message.replyTo.author.name}`}><strong style={{ color: chatSenderColor(message.replyTo.author.id) }}>{message.replyTo.author.name}</strong><span>{message.replyTo.body || attachmentSummaryText(message.replyTo.attachmentSummary)}</span></button> : null}
            {message.priority !== "normal" ? <button type="button" className={`project-chat-priority project-chat-priority--${message.priority} project-chat-message__issue`} onClick={() => onIssue(message)} aria-label={`View ${message.priority} issue details`}>{message.action?.typeName ?? (message.priority === "critical" ? "Critical" : "Important")} · {message.issueStatus === "resolved" ? "Resolved" : "Open"}</button> : null}
            {message.action ? <div className="project-chat-tracked-details"><span>Responsible: {message.responsible?.name ?? "Unavailable"}{message.responsible && !message.responsible.available ? " (unavailable)" : ""}</span><span>Due <time dateTime={message.action.dueDate}>{chatDueDate(message.action.dueDate)}</time></span>{message.raisedBy ? <span>Created by {message.raisedBy.name}</span> : null}</div> : null}
            <ChatMessageAttachments attachments={message.attachments ?? []} sender={message.author} audioTimestamp={audioOnly ? <MessageTime message={message} own={own} /> : undefined} />
            {!audioOnly ? <MessageBody message={message} own={own} /> : null}
          </article>
        </div>;
      })}
      {hasNewer ? <Button variant="quiet" className="project-chat-timeline__pagination" busy={loadingNewer} onClick={onNewer}>Load newer messages</Button> : null}
      {attempts.map(attempt => <article className="project-chat-message project-chat-message--pending" key={attempt.input.clientMessageId} aria-label="Your outgoing message">
        {attempt.files?.length ? <ChatFileTray files={attempt.files} sender={ownSender} /> : null}
        {attempt.input.action ? <p className="project-chat-tracked-details">Tracked action · Due {chatDueDate(attempt.input.action.dueDate)}</p> : null}
        {attempt.input.body ? <p className="project-chat-message__body">{attempt.input.body}</p> : null}
        <div role="status">{attempt.status === "sending" ? attempt.phase === "uploading" ? "Uploading attachments…" : attempt.phase === "cancelling" ? "Stopping transfer…" : "Sending…" : attempt.commitStarted ? "Delivery unconfirmed" : "Not sent"}</div>
        {attempt.status === "failed" ? <>{attempt.error && !attempt.files?.some(file => file.error === attempt.error) ? <p className="project-chat-error">{attempt.error}</p> : null}<div className="project-chat-message__actions"><Button variant="secondary" size="compact" disabled={!canSend} onClick={() => onRetry(attempt)}>Retry</Button>{!attempt.commitStarted ? <><Button variant="quiet" size="compact" disabled={!canSend} onClick={() => onEditAttempt(attempt)}>Edit message</Button>{onDiscard ? <Button variant="quiet" size="compact" onClick={() => onDiscard(attempt)}>Discard</Button> : null}</> : null}</div></> : onCancel ? <Button variant="quiet" size="compact" disabled={attempt.phase === "cancelling"} onClick={() => onCancel(attempt)}>Cancel transfer</Button> : null}
      </article>)}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{arrivals ? "New project messages are available." : ""}</p>
    {arrivals || (!filtered && latestSequence > newest) || hasNewer ? <Button className="project-chat-new" variant="secondary" onClick={() => { if (hasNewer || latestSequence > newest) onLatest(); else scrollToBottom(); }}>New messages · Go to latest</Button> : null}
  </div>;
}
