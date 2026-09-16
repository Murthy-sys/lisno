import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { attachmentSummary } from "./chatAttachments";
import { ChatActionMenu, chatInitials } from "./ChatActionMenu";
import { ChatComposer } from "./ChatComposer";
import { ChatIssueDialog } from "./ChatIssueDialog";
import { ChatParticipants } from "./ChatParticipants";
import { ChatTimeline } from "./ChatTimeline";
import { useProjectChat, useChatProjectRegistration, type ChatSendAttempt } from "./ProjectChatProvider";
import { chatErrorMessage, chatKeys } from "./projectChatApi";
import { useChatMessages, useChatParticipants, useChatSummary, useChatAttachmentPolicy } from "./projectChatQueries";
import { emptyChatDraft, mergeChatMessages } from "./projectChatState";
import type { ChatFilter, ChatMessage } from "./projectChatTypes";
import "./projectChat.css";

const filters: Array<{ value: ChatFilter; label: string }> = [{ value: "all", label: "All messages" }, { value: "mentions", label: "Mentions of me" }, { value: "critical", label: "Open Critical" }, { value: "important", label: "Open Important" }, { value: "resolved", label: "Resolved" }];
const connectionLabels = { connecting: "Connecting…", live: "Live", reconnecting: "Reconnecting…", unavailable: "Live connection unavailable · checking for updates", denied: "Access removed" };

export function ProjectMessagesPage() {
  const { projectId = "" } = useParams();
  return <ProjectConversation key={projectId} projectId={projectId} />;
}
function ProjectConversation({ projectId }: { projectId: string }) {
  useChatProjectRegistration(projectId);
  const chat = useProjectChat();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filter = filters.find(item => item.value === params.get("filter"))?.value ?? "all";
  const around = params.get("message") ?? undefined;
  const summary = useChatSummary(projectId);
  const attachmentPolicy = useChatAttachmentPolicy(projectId, Boolean(summary.data));
  const participants = useChatParticipants(projectId, Boolean(summary.data));
  const history = useChatMessages(projectId, filter, around, Boolean(summary.data));
  const messages = useMemo(() => mergeChatMessages(history.data?.pages ?? []), [history.data]);
  const { reconcileMessages } = chat;
  useEffect(() => reconcileMessages(projectId, messages), [projectId, messages, reconcileMessages]);
  const [panel, setPanel] = useState<"participants" | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ChatMessage | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const composerRegion = useRef<HTMLDivElement>(null);
  const draft = chat.memory[projectId]?.draft ?? emptyChatDraft();
  const attempts = chat.memory[projectId]?.attempts ?? [];
  const committedKeys = new Set(messages.filter(message => message.author.id === chat.userId).map(message => message.clientMessageId));
  const visibleAttempts = attempts.filter(attempt => !committedKeys.has(attempt.input.clientMessageId));
  const unavailable = !chat.enabled || chat.denied.has(projectId);
  async function checkAccess() {
    setCheckingAccess(true);
    try { await chat.verifyAccess(projectId); }
    finally { setCheckingAccess(false); }
  }
  function selectFilter(value: ChatFilter) { setParams(value === "all" ? {} : { filter: value }); setPanel(null); }
  function context(messageId: string) { setParams({ message: messageId }); }
  function latest() {
    setParams({});
    void queryClient.resetQueries({ queryKey: chatKeys.messages(chat.scope, projectId, "all") });
  }
  function reply(message: ChatMessage) {
    chat.setDraft(projectId, { ...draft, reply: { id: message.id, body: message.body, author: message.author, attachmentSummary: attachmentSummary(message.attachments ?? []) } });
    requestAnimationFrame(() => composerRegion.current?.querySelector("textarea")?.focus());
  }
  function send() {
    const input = { body: draft.body, mentions: draft.mentions, priority: draft.priority, replyToId: draft.reply?.id ?? null, responsibleUserId: draft.responsibleUserId || null, clientMessageId: crypto.randomUUID() };
    void chat.send(projectId, input, true);
  }
  function editAttempt(attempt: ChatSendAttempt) {
    if (draft.body.trim() || draft.files.length || draft.reply || draft.priority !== "normal" || attempt.commitStarted || attempt.status === "sending") return;
    chat.setDraft(projectId, { body: attempt.input.body, mentions: attempt.input.mentions, priority: attempt.input.priority, responsibleUserId: attempt.input.responsibleUserId ?? "", reply: attempt.reply ?? null, files: attempt.files ?? [] });
    chat.removeAttempt(projectId, attempt.input.clientMessageId);
    composerRegion.current?.querySelector("textarea")?.focus();
  }
  const name = unavailable ? "Conversation unavailable" : summary.data?.project.name ?? "Project conversation";
  const overview = chat.overview[projectId];
  const currentFilter = filters.find(item => item.value === filter)!;
  return <section className="project-chat-page" aria-labelledby="project-chat-title">
    <header className="project-chat-header">
      <Link to="/project-messages" className="project-chat-icon project-chat-back" aria-label="Back to conversations"><ArrowLeft size={22} aria-hidden="true" /></Link>
      <div className="project-chat-identity">
        <button type="button" className="project-chat-identity__button" disabled={!summary.data || unavailable} onClick={() => setPanel("participants")} aria-label={summary.data && !unavailable ? `${summary.data.participantCount} participants` : "Group information"} aria-haspopup="dialog">
          <span className="project-chat-avatar" aria-hidden="true">{chatInitials(name)}</span>
          <span className="project-chat-identity__copy"><span className="project-chat-identity__name" aria-hidden="true">{name}</span><span className="project-chat-identity__summary">{summary.data && !unavailable ? `${summary.data.participantCount} participants` : "Project messages"}</span></span>
        </button>
        <h1 id="project-chat-title" className="sr-only">{name}</h1>
      </div>
      {summary.data && !unavailable ? <button type="button" className="project-chat-critical" onClick={() => selectFilter("critical")} aria-label={`Critical ${summary.data.counts.openCritical}`}>Critical {summary.data.counts.openCritical}</button> : null}
      <ChatActionMenu label="Conversation options" items={[
        ...(!unavailable && summary.data ? filters.map(item => ({ label: item.label, selected: filter === item.value && !around, onSelect: () => selectFilter(item.value) })) : []),
        ...(!unavailable && summary.data ? [{ label: "Group information", onSelect: () => setPanel("participants") }] : []),
        ...(overview && !unavailable ? [{ label: overview.label, to: overview.to }] : []),
        { label: "Back to workspace", to: "/" }
      ]} />
    </header>
    {unavailable ? <div className="project-chat-empty project-chat-state" role="status"><h2>Conversation unavailable</h2><p>Your account does not currently have access to this conversation.</p>{chat.enabled ? <Button variant="secondary" busy={checkingAccess} onClick={() => void checkAccess()}>Check access again</Button> : null}</div> : summary.isPending ? <p role="status" className="project-chat-state project-chat-empty">Loading project conversation…</p> : !summary.data ? <div className="project-chat-empty project-chat-state" role="alert"><p>{chatErrorMessage(summary.error)}</p><Button onClick={() => void summary.refetch()}>Retry conversation</Button></div> : <>
      <div role="status" className={`project-chat-connection${chat.connection === "live" ? " sr-only" : ""}`}><span aria-hidden="true" />{connectionLabels[chat.connection]}</div>
      {summary.isError ? <p role="status" className="project-chat-warning">Project counts may be out of date. Retrying when the connection recovers.</p> : null}
      {around || filter !== "all" ? <div className="project-chat-context-note"><span>{around ? "Viewing an earlier message in context" : currentFilter.label}</span><button type="button" className="project-chat-icon" aria-label="Return to latest messages" onClick={latest}><X size={17} aria-hidden="true" /></button></div> : null}
      <div className="project-chat-conversation">
          {history.isError ? <p role="alert" className="project-chat-warning">{history.data ? "Messages may be out of date. " : ""}{chatErrorMessage(history.error)} <Button variant="quiet" onClick={() => void history.refetch()}>Retry messages</Button></p> : null}
          {history.isPending ? <p role="status" className="project-chat-empty">Loading messages…</p> : history.data ? <ChatTimeline key={`${projectId}:${filter}:${around ?? "latest"}`} projectId={projectId} messages={messages} attempts={visibleAttempts} lastRead={summary.data.lastReadSequence} hasOlder={Boolean(history.hasNextPage)} hasNewer={Boolean(history.hasPreviousPage)} filtered={filter !== "all" || Boolean(around)} around={around} latestSequence={summary.data.latestMessageSequence} loadingOlder={history.isFetchingNextPage} loadingNewer={history.isFetchingPreviousPage} canSend={summary.data.capabilities.canSend} onOlder={() => void history.fetchNextPage()} onNewer={() => void history.fetchPreviousPage()} onLatest={latest} onReply={reply} onContext={context} onIssue={setSelectedIssue} onRetry={attempt => void chat.send(projectId, attempt.input)} onEditAttempt={editAttempt} onCancel={attempt => void chat.cancelAttempt(projectId, attempt.input.clientMessageId)} onDiscard={attempt => void chat.cancelAttempt(projectId, attempt.input.clientMessageId, true)} /> : null}
          <div ref={composerRegion} className="project-chat-composer-region">
            {participants.isError ? <p className="project-chat-warning" role="status">Participants are unavailable. Retry before sending a message. <Button variant="quiet" onClick={() => void participants.refetch()}>Retry participants</Button></p> : null}
            {(draft.body || draft.files.length || draft.reply || draft.priority !== "normal") && attempts.some(attempt => attempt.status === "failed") ? <p className="project-chat-muted">Finish or clear your current draft before editing a failed message.</p> : null}
            <ChatComposer draft={draft} participants={participants.data?.items ?? []} disabled={!summary.data.capabilities.canSend || !participants.data || participants.isError} onChange={next => chat.setDraft(projectId, next)} onSend={send} policy={attachmentPolicy.data} policyError={attachmentPolicy.isError && !attachmentPolicy.unsupported ? "Attachments are temporarily unavailable." : undefined} onRetryPolicy={() => void attachmentPolicy.refetch()} />
            {!summary.data.capabilities.canSend ? <p role="status">Sending is not available for your current access.</p> : null}
          </div>
      </div>
      {panel ? <Drawer id="project-chat-group-info" open title="Project participants" eyebrow="Group information" variant="contextual" className="project-chat-details" onClose={() => setPanel(null)}>
        {participants.isPending ? <p role="status">Loading participants…</p> : participants.isError ? <p role="alert">{chatErrorMessage(participants.error)} <Button variant="quiet" onClick={() => void participants.refetch()}>Retry</Button></p> : <ChatParticipants projectId={projectId} participants={participants.data?.items ?? []} warnings={participants.data?.setupWarnings ?? []} canManage={summary.data.capabilities.canManageParticipants} />}
      </Drawer> : null}
      {selectedIssue ? <ChatIssueDialog projectId={projectId} message={messages.find(message => message.id === selectedIssue.id) ?? selectedIssue} participants={participants.data?.items ?? []} onClose={() => setSelectedIssue(null)} /> : null}
    </>}
  </section>;
}
