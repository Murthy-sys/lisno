import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { roleHomePath } from "../../app/routePaths";
import { Sidebar } from "../../components/layout/Sidebar";
import { Drawer } from "../../components/ui/Drawer";
import { IconButton } from "../../components/ui/IconButton";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useProjectChat } from "./ProjectChatProvider";
import { projectMessagesPath } from "./ProjectChatHeader";
import { ChatIcon } from "./ChatIcon";
import type { ChatConversation, ChatConversationFilter } from "./projectChatTypes";
import "./projectConversationList.css";

// Keep this breakpoint aligned with projectChatShell.css. The sidebar stays
// mounted on mobile to retain its scroll position and current page.
const desktopQuery = "(min-width: 1024px)";
const isDesktop = () => window.matchMedia(desktopQuery).matches;
const isDocumentVisible = () => document.visibilityState === "visible";
function subscribeDesktop(listener: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function subscribeDocumentVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function messageTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return new Intl.DateTimeFormat(undefined, date.toDateString() === today.toDateString()
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

const conversationFilters: Array<{ value: ChatConversationFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "critical", label: "Critical" },
  { value: "important", label: "Important" }
];

function messagePreview(conversation: ChatConversation, userId?: string) {
  const message = conversation.lastMessage;
  if (message === null && !conversation.lastMessageAt) return "No messages yet";
  if (!message) return "Message preview unavailable";
  const author = message.author.id === userId ? "You" : message.author.name;
  const attachments = message.attachmentCount > 0
    ? message.attachmentCount === 1 ? message.attachments[0]?.filename ?? "1 attachment" : `${message.attachmentCount} attachments`
    : "";
  const content = [message.excerpt, attachments].filter(Boolean).join(" · ");
  return content ? `${author}: ${content}` : "Message preview unavailable";
}

export function ProjectConversationList({ selectedProjectId }: { selectedProjectId?: string }) {
  const chat = useProjectChat();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [{ offset, search, filter }, setQuery] = useState<{ offset: number; search: string; filter: ChatConversationFilter }>({ offset: 0, search: "", filter: "all" });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop);
  const documentVisible = useSyncExternalStore(subscribeDocumentVisibility, isDocumentVisible);
  const listVisible = documentVisible && (!selectedProjectId || desktop);
  const listEnabled = chat.enabled && listVisible;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setQuery(current => current.search === nextSearch ? current : { ...current, search: nextSearch, offset: 0 });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);
  const list = useQuery({
    queryKey: [...chatKeys.list(chat.scope), { search, filter, offset }],
    queryFn: ({ signal }) => projectChatApi.conversations(offset, signal, { search, filter }),
    enabled: listEnabled,
    retry: (count, error) => !isChatDenied(error) && count < 1,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: query => isChatDenied(query.state.error) ? false : 60_000,
    refetchIntervalInBackground: false
  });
  useEffect(() => {
    // Disabling an observer stops new refetches but not an already queued retry.
    if (!listEnabled) void queryClient.cancelQueries({ queryKey: [...chatKeys.list(chat.scope), { search, filter, offset }], exact: true });
  }, [chat.scope, filter, listEnabled, offset, queryClient, search]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [offset, search, filter]);
  const data = chat.enabled && !isChatDenied(list.error) ? list.data : undefined;
  const items = data?.items.filter(item => !chat.denied.has(item.project.id)) ?? [];
  const hasSearch = Boolean(search);
  const emptyTitle = offset ? "No conversations on this page" : hasSearch ? "No matching projects" : filter !== "all" ? `No ${filter} conversations` : "No project conversations yet";
  const emptyDescription = offset ? "Go back to see your other project groups." : hasSearch ? "Try another project name or change the conversation filter." : filter !== "all" ? "Choose All to see your other project conversations." : "Your conversations appear here when you join a project team.";
  const Heading = selectedProjectId ? "h2" : "h1";
  const EmptyHeading = selectedProjectId ? "h3" : "h2";

  return <>
    <header className="project-messaging-list-header">
      <div><Heading id="project-messaging-list-title">Project messages</Heading><p>Project conversations</p></div>
      <div className="project-messaging-list-actions">
        <IconButton className="project-messaging-icon" label="Refresh conversations" variant="quiet" busy={list.isFetching} disabled={!listEnabled} icon={<ChatIcon name="refresh" size={17} />} onClick={() => void list.refetch()} />
        <IconButton ref={navigationTrigger} className="project-messaging-icon project-messaging-navigation-trigger" label="Open navigation" variant="quiet" icon={<ChatIcon name="menu" size={19} />} aria-expanded={navigationOpen} aria-controls="project-messaging-navigation" onClick={() => setNavigationOpen(true)} />
      </div>
    </header>
    <div className="project-messaging-list-tools">
      <div className="project-messaging-search">
        <ChatIcon name="search" size={16} />
        <input ref={searchField} type="search" aria-label="Search projects" placeholder="Search projects" maxLength={100} value={searchInput} disabled={!chat.enabled} onChange={event => setSearchInput(event.target.value.slice(0, 100))} />
        {searchInput ? <IconButton className="project-messaging-search-clear" label="Clear project search" variant="quiet" disabled={!chat.enabled} icon={<ChatIcon name="close" size={14} />} onClick={() => { setSearchInput(""); searchField.current?.focus(); }} /> : null}
      </div>
      <div className="project-messaging-list-filters" role="group" aria-label="Filter project conversations">
        {conversationFilters.map(option => {
          const count = option.value === "all" ? filter === "all" && !search ? data?.pagination.total : undefined : data?.totals?.[option.value];
          const unit = option.value === "all" ? "project conversations" : option.value === "unread" ? "unread conversations" : `open ${option.value} issues`;
          return <button key={option.value} type="button" aria-pressed={filter === option.value} disabled={!chat.enabled} aria-label={count === undefined ? option.label : `${option.label}, ${count} ${unit}`} onClick={() => setQuery(current => ({ ...current, filter: option.value, offset: 0 }))}>
            {option.label}{count === undefined ? null : <span aria-hidden="true">{count}</span>}
          </button>;
        })}
      </div>
    </div>
    <div className="project-messaging-list-scroll" ref={scroller}>
      {!chat.enabled ? <p className="project-messaging-notice" role="status">Project messaging is not available for your current access.</p> : list.isPending ? <>
        <p className="sr-only" role="status">Loading your conversations…</p>
        <div className="project-messaging-skeleton" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <div key={index}><span /><div><i /><i /></div></div>)}</div>
      </> : null}
      {chat.enabled && list.isError ? <div className="project-messaging-notice project-messaging-notice--error" role="alert">{data ? "Conversations and counts may be out of date. " : ""}{chatErrorMessage(list.error)} <button type="button" disabled={!listEnabled} onClick={() => void list.refetch()}>Retry</button></div> : null}
      {data && !items.length ? <div className="project-messaging-list-empty" role="status"><ChatIcon name={hasSearch ? "search" : "people"} size={26} /><EmptyHeading>{emptyTitle}</EmptyHeading><p>{emptyDescription}</p></div> : null}
      <ul className="project-messaging-conversations" aria-labelledby="project-messaging-list-title">
        {items.map(conversation => {
          const { project, counts } = conversation;
          const initials = project.name.trim().split(/\s+/u).slice(0, 2).map(part => [...part][0]).join("").toLocaleUpperCase();
          const preview = messagePreview(conversation, auth.user?.id);
          return <li key={project.id}><Link to={projectMessagesPath(project.id)} aria-current={selectedProjectId === project.id ? "page" : undefined}>
            <span className="project-messaging-avatar" aria-hidden="true">{initials || <ChatIcon name="people" size={19} />}</span>
            <span className="project-messaging-row-content">
              <span className="project-messaging-row-top"><strong title={project.name}>{project.name}</strong>{conversation.lastMessageAt ? <time className={counts.unread ? "project-messaging-time--unread" : undefined} dateTime={conversation.lastMessageAt}>{messageTime(conversation.lastMessageAt)}</time> : null}</span>
              <span className="project-messaging-row-bottom"><span className="project-messaging-row-meta">{conversation.participantCount} participants · {project.status.replaceAll("_", " ")}</span><span className="project-messaging-row-counts">
                {counts.unreadMentions > 0 ? <span className="project-messaging-mention" aria-label={`${counts.unreadMentions} unread mentions`}>@</span> : null}
                {counts.unread > 0 ? <span className="project-messaging-unread" aria-label={`${counts.unread} unread messages`}>{counts.unread > 99 ? "99+" : counts.unread}</span> : null}
              </span></span>
              <span className="project-messaging-row-bottom"><span className="project-messaging-row-preview" title={preview}>{preview}</span>{counts.openCritical > 0 ? <span className="project-messaging-critical" aria-label={`${counts.openCritical} open critical issues`}>{counts.openCritical} critical</span> : null}</span>
            </span>
          </Link></li>;
        })}
      </ul>
    </div>
    {data && (offset > 0 || data.pagination.hasMore) ? <nav className="project-messaging-pagination" aria-label="Conversation pages">
      <button type="button" disabled={offset === 0 || list.isFetching || !listEnabled} onClick={() => setQuery(current => ({ ...current, offset: Math.max(0, offset - 30) }))}><ChatIcon name="previous" size={14} />Previous</button>
      <span>{data.items.length ? `${offset + 1}–${offset + data.items.length}` : "0"} of {data.pagination.total}</span>
      <button type="button" disabled={!data.pagination.hasMore || list.isFetching || !listEnabled} onClick={() => setQuery(current => ({ ...current, offset: offset + 30 }))}>Next<ChatIcon name="next" size={14} /></button>
    </nav> : null}
    <footer className="project-messaging-list-footer"><Link to={auth.user ? roleHomePath(auth.user.role) : "/"}><ChatIcon name="back" size={15} />Back to workspace</Link></footer>
    {auth.user && auth.authorization ? <Drawer id="project-messaging-navigation" open={navigationOpen} title="Navigation" className="project-messaging-navigation" onClose={() => setNavigationOpen(false)} returnFocusRef={navigationTrigger}>
      <Sidebar user={auth.user} authorization={auth.authorization} navigationLabel="Application navigation" onNavigate={() => setNavigationOpen(false)} onLogout={() => { setNavigationOpen(false); return auth.logout(); }} />
    </Drawer> : null}
  </>;
}
