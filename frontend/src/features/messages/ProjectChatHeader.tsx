import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useChatProjectRegistration, useOptionalProjectChat } from "./ProjectChatProvider";
import { useChatSummary } from "./projectChatQueries";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import "./projectChat.css";

export const projectMessagesPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/messages`;

export function ProjectChatNavigation({ projectId, overviewTo, overviewLabel = "Overview", summaryContainer, presentation = "default" }: {
  projectId: string;
  overviewTo?: string;
  overviewLabel?: string;
  /** Undefined keeps the summary inline; null waits for a portal destination to mount. */
  summaryContainer?: HTMLElement | null;
  presentation?: "default" | "estimate-progress";
}) {
  useChatProjectRegistration(projectId);
  const chat = useOptionalProjectChat();
  const summary = useChatSummary(projectId);
  const location = useLocation();
  const remember = chat?.rememberOverview;
  useEffect(() => { if (overviewTo) remember?.(projectId, overviewTo, overviewLabel); }, [overviewTo, overviewLabel, projectId, remember]);
  const target = overviewTo ? { to: overviewTo, label: overviewLabel } : chat?.overview[projectId];
  const estimateProgress = presentation === "estimate-progress";
  const navigationClass = `project-chat-navigation${estimateProgress ? " project-chat-navigation--estimate-progress" : ""}`;
  if (!chat?.enabled || chat.denied.has(projectId)) return estimateProgress
    ? <div className={navigationClass}><ProjectStatusButton projectId={projectId} /></div>
    : <ProjectStatusButton projectId={projectId} />;
  const path = projectMessagesPath(projectId);
  const criticalSummary = summary.data ? <div className="project-chat-navigation__summary">
    <Link className="project-chat-priority project-chat-priority--critical" to={`${path}?filter=critical`}>{estimateProgress ? <NavigationSymbol kind="critical" /> : null}Critical {summary.data.counts.openCritical}</Link>
    {summary.isError ? <span role="status">Counts may be out of date</span> : null}
  </div> : <span className="project-chat-muted" role="status">{summary.isError ? "Chat counts unavailable" : "Loading chat counts…"}</span>;
  return <div className={navigationClass}>
    <nav aria-label="Project sections">
      {target ? <Link to={target.to} aria-current={location.pathname === target.to ? "page" : undefined}>{estimateProgress ? <NavigationSymbol kind="lead" /> : null}{target.label}</Link> : null}
      <Link to={path} aria-current={location.pathname === path ? "page" : undefined}>{estimateProgress ? <NavigationSymbol kind="messages" /> : <MessageCircle size={16} aria-hidden="true" />}Messages
        {summary.data && summary.data.counts.unread > 0 ? <span className="project-chat-badge" aria-label={`${summary.data.counts.unread} unread messages`}>{summary.data.counts.unread}</span> : null}
        {summary.data && summary.data.counts.unreadMentions > 0 ? <span aria-label={`${summary.data.counts.unreadMentions} unread mentions`}>@ {summary.data.counts.unreadMentions}</span> : null}
      </Link>
    </nav>
    <ProjectStatusButton projectId={projectId} participant={summary.data && !summary.isError ? true : undefined} />
    {summaryContainer === undefined ? criticalSummary : summaryContainer ? createPortal(criticalSummary, summaryContainer) : null}
  </div>;
}

function NavigationSymbol({ kind }: { kind: "lead" | "messages" | "critical" }) {
  return <svg className="project-chat-navigation__tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "lead" ? <><path d="M8 4H6a2 2 0 0 0-2 2v14h14V6a2 2 0 0 0-2-2h-2M8 2h6v4H8zM8 11h6M8 15h6" /></> : kind === "messages" ? <path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.8L3 21l1.8-4.9a9 9 0 0 1-.8-3.6A8.5 8.5 0 1 1 20 11.5Z" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>}
  </svg>;
}

/** List/queue links check membership but never register or open an event stream. */
export function ProjectChatLink({ projectId, className, children = "Messages" }: { projectId: string; className?: string; children?: ReactNode }) {
  const chat = useOptionalProjectChat();
  const summary = useChatSummary(projectId);
  if (!chat?.enabled || chat.denied.has(projectId) || !summary.data) return null;
  return <Link to={projectMessagesPath(projectId)} className={className} aria-label={`Messages for ${summary.data.project.name}`}>{children}{summary.data.counts.unread > 0 ? ` (${summary.data.counts.unread})` : ""}</Link>;
}
