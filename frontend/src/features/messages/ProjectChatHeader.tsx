import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useChatProjectRegistration, useOptionalProjectChat } from "./ProjectChatProvider";
import { useChatSummary } from "./projectChatQueries";
import "./projectChat.css";

export const projectMessagesPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/messages`;

export function ProjectChatNavigation({ projectId, overviewTo, overviewLabel = "Overview" }: { projectId: string; overviewTo?: string; overviewLabel?: string }) {
  useChatProjectRegistration(projectId);
  const chat = useOptionalProjectChat();
  const summary = useChatSummary(projectId);
  const location = useLocation();
  const remember = chat?.rememberOverview;
  useEffect(() => { if (overviewTo) remember?.(projectId, overviewTo, overviewLabel); }, [overviewTo, overviewLabel, projectId, remember]);
  const target = overviewTo ? { to: overviewTo, label: overviewLabel } : chat?.overview[projectId];
  if (!chat?.enabled || chat.denied.has(projectId)) return null;
  const path = projectMessagesPath(projectId);
  return <div className="project-chat-navigation">
    <nav aria-label="Project sections">
      {target ? <Link to={target.to} aria-current={location.pathname === target.to ? "page" : undefined}>{target.label}</Link> : null}
      <Link to={path} aria-current={location.pathname === path ? "page" : undefined}><MessageCircle size={16} aria-hidden="true" />Messages
        {summary.data && summary.data.counts.unread > 0 ? <span className="project-chat-badge" aria-label={`${summary.data.counts.unread} unread messages`}>{summary.data.counts.unread}</span> : null}
        {summary.data && summary.data.counts.unreadMentions > 0 ? <span aria-label={`${summary.data.counts.unreadMentions} unread mentions`}>@ {summary.data.counts.unreadMentions}</span> : null}
      </Link>
    </nav>
    {summary.data ? <div className="project-chat-navigation__summary">
      <Link className="project-chat-priority project-chat-priority--critical" to={`${path}?filter=critical`}>Critical {summary.data.counts.openCritical}</Link>
      {summary.isError ? <span role="status">Counts may be out of date</span> : null}
    </div> : <span className="project-chat-muted" role="status">{summary.isError ? "Chat counts unavailable" : "Loading chat counts…"}</span>}
  </div>;
}

/** List/queue links check membership but never register or open an event stream. */
export function ProjectChatLink({ projectId, className, children = "Messages" }: { projectId: string; className?: string; children?: ReactNode }) {
  const chat = useOptionalProjectChat();
  const summary = useChatSummary(projectId);
  if (!chat?.enabled || chat.denied.has(projectId) || !summary.data) return null;
  return <Link to={projectMessagesPath(projectId)} className={className} aria-label={`Messages for ${summary.data.project.name}`}>{children}{summary.data.counts.unread > 0 ? ` (${summary.data.counts.unread})` : ""}</Link>;
}
