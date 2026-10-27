import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type { ProjectPendingAction, ProjectStatusSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { getProjectStatus, projectStatusKeys } from "../project-status/projectStatusApi";
import { chatFileSize } from "./chatAttachments";
import { ChatIcon } from "./ChatIcon";
import { useChatMediaActions } from "./ChatMessageAttachments";
import { useProjectChat } from "./ProjectChatProvider";
import type { ChatAttachment, ChatMessage, ChatParticipantPage, ChatSummary } from "./projectChatTypes";
import "./chatProjectDetails.css";

export interface ChatProjectDetailsProps {
  summary: ChatSummary;
  participants?: ChatParticipantPage;
  participantsPending: boolean;
  participantsError: boolean;
  onRetryParticipants: () => void;
  messages: ChatMessage[];
  historyPending: boolean;
  historyError: boolean;
  historyIncomplete: boolean;
  filtered: boolean;
  overview?: { to: string; label: string };
  visible: boolean;
  onParticipants: () => void;
  onContext: (messageId: string) => void;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
const isDocumentVisible = () => document.visibilityState === "visible";
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const isStatusDenied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

export function ChatProjectDetails(props: ChatProjectDetailsProps) {
  const { summary, participants, participantsPending, participantsError, onRetryParticipants, overview, visible, onParticipants } = props;
  const auth = useAuth();
  const chat = useProjectChat();
  const headingId = useId();
  const participantHeadingId = useId();
  const authorized = chat.enabled && !chat.denied.has(summary.project.id) && auth.status === "authenticated" && Boolean(auth.user) && chat.userId === auth.user?.id;
  const canReadStatus = authorized && hasFrontendPermission(auth.authorization, "projects.status.read");
  const warnings = [...new Set([...summary.setupWarnings, ...(participants?.setupWarnings ?? [])])];
  const validOverview = overview?.to.startsWith("/") && !overview.to.startsWith("//") ? overview : undefined;

  if (!authorized) return null;
  return <section className="chat-project-details" aria-labelledby={headingId} hidden={!visible}>
    <header className="chat-project-details__header">
      <h2 id={headingId}>Project details</h2>
      {validOverview ? <Link className="chat-project-details__link" to={validOverview.to} title={validOverview.label}><ChatIcon name="external" size={15} />View project</Link> : null}
    </header>
    <div className="chat-project-details__identity">
      <span className="chat-project-details__avatar" aria-hidden="true">{initials(summary.project.name)}</span>
      <div><h3>{summary.project.name}</h3><span className="chat-project-details__project-status">{summary.project.status.replaceAll("_", " ")}</span></div>
    </div>
    {canReadStatus ? <WorkflowStatus key={`${chat.scope}:${auth.user!.id}:${auth.user!.role}:${summary.project.id}`} projectId={summary.project.id} identity={`${chat.scope}:${auth.user!.id}:${auth.user!.role}`} visible={visible} /> : null}
    <section className="chat-project-details__section" aria-labelledby={participantHeadingId}>
      <div className="chat-project-details__section-heading"><h3 id={participantHeadingId}>Participants <span>({summary.participantCount})</span></h3><button type="button" className="chat-project-details__text-button" aria-label="View all participants" onClick={onParticipants}>View all</button></div>
      {participantsPending && !participants ? <p className="chat-project-details__note" role="status">Loading participants…</p> : null}
      {participantsError ? <div className="chat-project-details__notice" role="alert"><p>{participants ? "Participant details may be out of date." : "Participants could not be loaded."}</p><button type="button" className="chat-project-details__text-button" onClick={onRetryParticipants}>Retry participants</button></div> : null}
      {participants?.items.length ? <ul className="chat-project-details__people">{participants.items.slice(0, 4).map(person => <li key={person.id}>
        <span className="chat-project-details__avatar chat-project-details__avatar--person" aria-hidden="true">{initials(person.name)}</span><div><strong>{person.name}</strong><span>{ROLE_LABELS[person.role]}</span></div>
      </li>)}</ul> : !participantsPending && !participantsError ? <p className="chat-project-details__note">No participant details available.</p> : null}
      {warnings.length ? <div className="chat-project-details__notice" role="status">{warnings.map(warning => <p key={warning}>{warning}</p>)}</div> : null}
    </section>
    <FilesInView {...props} />
    <p className="chat-project-details__privacy"><ChatIcon name="info" size={16} /><span>Messages and files are visible to project participants.</span></p>
  </section>;
}

function WorkflowStatus({ projectId, identity, visible }: { projectId: string; identity: string; visible: boolean }) {
  const queryClient = useQueryClient();
  const documentVisible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, () => false);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);
  const headingId = useId();
  // Keep event invalidation under the established project prefix, but isolate sessions.
  const queryKey = useMemo(() => [...projectStatusKeys.project(projectId), "chat-details", identity] as const, [identity, projectId]);
  const active = visible && documentVisible && !accessRemoved;
  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProjectStatus(projectId, signal),
    enabled: active,
    staleTime: 0,
    refetchOnWindowFocus: active,
    refetchOnReconnect: active,
    refetchInterval: false,
    retry: false
  });
  const accessDenied = isStatusDenied(status.error);
  useEffect(() => {
    if (!active) void queryClient.cancelQueries({ queryKey, exact: true });
  }, [active, queryClient, queryKey]);
  useEffect(() => () => {
    void queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.removeQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);
  useEffect(() => {
    if (!accessDenied) return;
    setAccessRemoved(true);
    void queryClient.cancelQueries({ queryKey: projectStatusKeys.project(projectId) });
    queryClient.removeQueries({ queryKey: projectStatusKeys.project(projectId) });
  }, [accessDenied, projectId, queryClient]);
  const current = status.data?.projectId === projectId ? status.data : undefined;
  useEffect(() => {
    if (current && status.isSuccess && status.isFetchedAfterMount) setAccessVerified(true);
  }, [current, status.isFetchedAfterMount, status.isSuccess]);
  if (accessRemoved || accessDenied) return null;
  const summary = accessVerified ? current : undefined;
  return <section className="chat-project-details__section" aria-labelledby={headingId}>
    <div className="chat-project-details__section-heading"><h3 id={headingId}>Workflow status</h3><button type="button" className="chat-project-details__icon-button" aria-label="Refresh workflow status" disabled={!active || status.isFetching} onClick={() => void status.refetch()}><ChatIcon name="refresh" size={16} /></button></div>
    {!summary && !status.isError && (status.isPending || status.isFetching) ? <p className="chat-project-details__note" role="status">Loading workflow status…</p> : null}
    {status.isError ? <div className="chat-project-details__notice" role="alert"><p>{summary ? "Workflow status may be out of date." : "Workflow status could not be loaded."}</p><button type="button" className="chat-project-details__text-button" disabled={!active || status.isFetching} onClick={() => void status.refetch()}>Retry workflow status</button></div> : null}
    {!summary && !status.isError && !status.isPending && !status.isFetching ? <p className="chat-project-details__note" role="status">Workflow status is unavailable.</p> : null}
    {summary ? <>
      {summary.currentStage ? <div className="chat-project-details__stage"><span>Current stage</span><strong>{summary.currentStage.label}</strong></div> : null}
      <p className="chat-project-details__note">{workflowLabels[summary.state]}</p>
      {summary.issue ? <p className="chat-project-details__notice" role="status">{summary.issue}</p> : null}
      {summary.pendingActions[0] ? <NextAction action={summary.pendingActions[0]} /> : null}
      <p className="chat-project-details__updated">Updated <time dateTime={summary.serverNow}>{dateLabel(summary.serverNow)}</time></p>
    </> : null}
  </section>;
}

const workflowLabels: Record<ProjectStatusSummary["state"], string> = {
  active: "In progress", scheduled: "Scheduled", paused: "Paused", completed: "Project completed", no_pending: "No pending tracked actions", unavailable: "Status needs review"
};

function NextAction({ action }: { action: ProjectPendingAction }) {
  return <dl className="chat-project-details__facts">
    <div><dt>Next action</dt><dd>{action.action}</dd></div>
    <div><dt>{action.state === "scheduled" ? "Scheduled with" : "Pending with"}</dt><dd>{action.people.length ? <ul>{action.people.map(person => <li key={person.id}>{person.name}<span>{ROLE_LABELS[person.role]}</span></li>)}</ul> : <>Assignment needed<span>{ROLE_LABELS[action.responsibleRole]}</span></>}</dd></div>
    {action.scheduledAt ? <div><dt>Scheduled for</dt><dd><time dateTime={action.scheduledAt}>{dateLabel(action.scheduledAt)}</time></dd></div> : null}
    {action.deadlineAt ? <div><dt>Due by</dt><dd><time dateTime={action.deadlineAt}>{dateLabel(action.deadlineAt)}</time></dd></div> : null}
    {action.blocker ? <div><dt>Waiting on</dt><dd>{action.blocker}</dd></div> : null}
  </dl>;
}

function FilesInView({ summary, messages, historyPending, historyError, historyIncomplete, filtered, onContext }: ChatProjectDetailsProps) {
  const headingId = useId();
  const files = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter(message => message.projectId === summary.project.id).flatMap(message => message.attachments.map(attachment => ({ message, attachment }))).filter(({ message, attachment }) => {
      const identity = JSON.stringify([message.id, attachment.id]);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).sort((a, b) => b.message.sequence - a.message.sequence);
  }, [messages, summary.project.id]);
  return <section className="chat-project-details__section" aria-labelledby={headingId}>
    <div className="chat-project-details__section-heading"><h3 id={headingId}>Files in this view <span>({files.length})</span></h3></div>
    <p className="chat-project-details__note">Files from the loaded message window. Loading other messages changes this list.</p>
    {filtered ? <p className="chat-project-details__note">Only the current message filter or context is included.</p> : null}
    {historyIncomplete ? <p className="chat-project-details__note">Older or newer history is not included.</p> : null}
    {historyPending ? <p className="chat-project-details__note" role="status">Loading files from messages…</p> : null}
    {historyError ? <p className="chat-project-details__notice" role="alert">{files.length ? "Message history could not refresh. Files shown may be out of date." : "Files are unavailable because message history could not be loaded."}</p> : null}
    {files.length ? <ul className="chat-project-details__files">{files.map(({ message, attachment }) => <FileRow key={JSON.stringify([message.id, attachment.id])} attachment={attachment} message={message} onContext={onContext} />)}</ul> : !historyPending && !historyError ? <p className="chat-project-details__empty">No files in the {filtered ? "current message view" : "loaded messages"}.</p> : null}
  </section>;
}

function FileRow({ attachment, message, onContext }: { attachment: ChatAttachment; message: ChatMessage; onContext: (messageId: string) => void }) {
  const media = useChatMediaActions();
  const canPreview = attachment.kind === "image" || attachment.kind === "video";
  return <li>
    <div className="chat-project-details__file-heading"><ChatIcon name="file" size={18} /><div><strong>{attachment.filename}</strong><span>{chatFileSize(attachment.byteSize)} · <time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></span></div></div>
    <div className="chat-project-details__file-actions">
      <button type="button" className="chat-project-details__text-button" aria-label={`View ${attachment.filename} in conversation`} onClick={() => onContext(message.id)}>In conversation</button>
      {canPreview ? <button type="button" className="chat-project-details__text-button" aria-label={`Preview ${attachment.filename}`} onClick={() => media.open(attachment)}>Preview</button> : null}
      <button type="button" className="chat-project-details__icon-button" aria-label={`Download ${attachment.filename}`} onClick={() => media.open(attachment, true)}><ChatIcon name="download" size={16} /></button>
    </div>
  </li>;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable";
}
