import { Outlet, useMatch } from "react-router-dom";
import { ProjectConversationList } from "./ProjectConversationList";
import "./projectChatShell.css";

/** The same list and conversation stay mounted when the viewport changes. */
export function ProjectChatLayout() {
  const selectedProjectId = useMatch("/projects/:projectId/messages")?.params.projectId;
  return <div className={`project-messaging-layout${selectedProjectId ? " project-messaging-layout--selected" : ""}`}>
    <aside className="project-messaging-list-pane" aria-label="Project conversations">
      <ProjectConversationList selectedProjectId={selectedProjectId} />
    </aside>
    <div className="project-messaging-content"><Outlet /></div>
  </div>;
}
