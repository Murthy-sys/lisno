import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Menu, RefreshCw, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { roleHomePath } from "../../app/routePaths";
import { Sidebar } from "../../components/layout/Sidebar";
import { Drawer } from "../../components/ui/Drawer";
import { IconButton } from "../../components/ui/IconButton";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useProjectChat } from "./ProjectChatProvider";
import { projectMessagesPath } from "./ProjectChatHeader";

function messageTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return new Intl.DateTimeFormat(undefined, date.toDateString() === today.toDateString()
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

export function ProjectConversationList({ selectedProjectId }: { selectedProjectId?: string }) {
  const chat = useProjectChat();
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const list = useQuery({
    queryKey: [...chatKeys.list(chat.scope), offset],
    queryFn: ({ signal }) => projectChatApi.conversations(offset, signal),
    enabled: chat.enabled,
    retry: (count, error) => !isChatDenied(error) && count < 1,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false
  });
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [offset]);
  const items = list.data?.items.filter(item => !chat.denied.has(item.project.id)) ?? [];
  const Heading = selectedProjectId ? "h2" : "h1";

  return <>
    <header className="project-messaging-list-header">
      <div><Heading id="project-messaging-list-title">Messages</Heading><p>Project conversations</p></div>
      <div className="project-messaging-list-actions">
        <IconButton className="project-messaging-icon" label="Refresh conversations" variant="quiet" busy={list.isFetching} disabled={!chat.enabled} icon={<RefreshCw size={19} aria-hidden="true" />} onClick={() => void list.refetch()} />
        <IconButton ref={navigationTrigger} className="project-messaging-icon" label="Open navigation" variant="quiet" icon={<Menu size={21} aria-hidden="true" />} aria-expanded={navigationOpen} aria-controls="project-messaging-navigation" onClick={() => setNavigationOpen(true)} />
      </div>
    </header>
    <div className="project-messaging-list-context"><span>Your project groups</span>{list.data ? <span aria-label={`${list.data.pagination.total} project conversations`}>{list.data.pagination.total}</span> : null}</div>
    <div className="project-messaging-list-scroll" ref={scroller}>
      {!chat.enabled ? <p className="project-messaging-notice" role="status">Project messaging is not available for your current access.</p> : list.isPending ? <>
        <p className="sr-only" role="status">Loading your conversations…</p>
        <div className="project-messaging-skeleton" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <div key={index}><span /><div><i /><i /></div></div>)}</div>
      </> : null}
      {list.isError ? <div className="project-messaging-notice project-messaging-notice--error" role="alert">{list.data ? "Conversation counts may be out of date. " : ""}{chatErrorMessage(list.error)} <button type="button" onClick={() => void list.refetch()}>Retry</button></div> : null}
      {chat.enabled && list.data && !items.length ? <div className="project-messaging-list-empty"><UsersRound size={32} aria-hidden="true" /><h2>{offset ? "No conversations on this page" : "No project conversations yet"}</h2><p>{offset ? "Go back to see your other project groups." : "Your conversations appear here when you join a project team."}</p></div> : null}
      <ul className="project-messaging-conversations" aria-labelledby="project-messaging-list-title">
        {items.map(conversation => {
          const { project, counts } = conversation;
          const initials = project.name.trim().split(/\s+/u).slice(0, 2).map(part => [...part][0]).join("").toLocaleUpperCase();
          return <li key={project.id}><Link to={projectMessagesPath(project.id)} aria-current={selectedProjectId === project.id ? "page" : undefined}>
            <span className="project-messaging-avatar" aria-hidden="true">{initials || <UsersRound size={21} />}</span>
            <span className="project-messaging-row-content">
              <span className="project-messaging-row-top"><strong title={project.name}>{project.name}</strong>{conversation.lastMessageAt ? <time className={counts.unread ? "project-messaging-time--unread" : undefined} dateTime={conversation.lastMessageAt}>{messageTime(conversation.lastMessageAt)}</time> : null}</span>
              <span className="project-messaging-row-bottom"><span className="project-messaging-row-preview">{conversation.participantCount} participants · {project.status.replaceAll("_", " ")}</span><span className="project-messaging-row-counts">
                {counts.unreadMentions > 0 ? <span className="project-messaging-mention" aria-label={`${counts.unreadMentions} unread mentions`}>@</span> : null}
                {counts.unread > 0 ? <span className="project-messaging-unread" aria-label={`${counts.unread} unread messages`}>{counts.unread > 99 ? "99+" : counts.unread}</span> : null}
              </span></span>
              {counts.openCritical > 0 ? <span className="project-messaging-critical">Critical {counts.openCritical}</span> : null}
            </span>
          </Link></li>;
        })}
      </ul>
    </div>
    {list.data && (offset > 0 || list.data.pagination.hasMore) ? <nav className="project-messaging-pagination" aria-label="Conversation pages">
      <button type="button" disabled={offset === 0 || list.isFetching} onClick={() => setOffset(Math.max(0, offset - 30))}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
      <span>{list.data.items.length ? `${offset + 1}–${offset + list.data.items.length}` : "0"} of {list.data.pagination.total}</span>
      <button type="button" disabled={!list.data.pagination.hasMore || list.isFetching} onClick={() => setOffset(offset + 30)}>Next<ChevronRight size={16} aria-hidden="true" /></button>
    </nav> : null}
    <footer className="project-messaging-list-footer"><Link to={auth.user ? roleHomePath(auth.user.role) : "/"}><ArrowLeft size={16} aria-hidden="true" />Back to workspace</Link></footer>
    {auth.user && auth.authorization ? <Drawer id="project-messaging-navigation" open={navigationOpen} title="Navigation" className="project-messaging-navigation" onClose={() => setNavigationOpen(false)} returnFocusRef={navigationTrigger}>
      <Sidebar user={auth.user} authorization={auth.authorization} navigationLabel="Application navigation" onNavigate={() => setNavigationOpen(false)} onLogout={() => { setNavigationOpen(false); return auth.logout(); }} />
    </Drawer> : null}
  </>;
}
