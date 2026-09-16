import { MessageCircle, UsersRound } from "lucide-react";

/** The shared layout owns the list so its page and scroll survive project navigation. */
export function ProjectMessagesListPage() {
  return <section className="project-messaging-welcome" aria-label="Choose a project conversation">
    <div className="project-messaging-welcome__illustration" aria-hidden="true"><MessageCircle size={72} strokeWidth={1} /><span><UsersRound size={25} strokeWidth={1.5} /></span></div>
    <h2>Your project, in one conversation</h2>
    <p>Select a project to talk with your client and team.<br />Keep questions, updates and decisions together.</p>
    <p className="project-messaging-welcome__note">Shared with the people involved in your project.</p>
  </section>;
}
