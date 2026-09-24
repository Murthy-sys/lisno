import { chatDueDate, isChatDueDate } from "./ChatTrackedAction";
import { attachmentSummary, attachmentSummaryText } from "./chatAttachments";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useProjectChat } from "./ProjectChatProvider";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatIssueAction, ChatIssueInput, ChatMessage, ChatParticipant } from "./projectChatTypes";

export function chatIssueActions(message: ChatMessage) {
  const actions: Array<{ action: ChatIssueAction; label: string }> = [];
  if (message.capabilities.canRaise && message.priority === "normal") actions.push({ action: "raise", label: "Raise an issue" });
  if (message.capabilities.canRaise && message.priority === "important" && message.issueStatus === "open") actions.push({ action: "escalate", label: "Escalate to Critical" });
  if (message.capabilities.canResolve && message.issueStatus === "open") {
    actions.push({ action: "resolve", label: "Resolve issue" });
    if (message.priority === "critical") actions.push({ action: "lower", label: "Lower to Important" });
    if (!message.action) actions.push({ action: "clear", label: "Clear priority" });
  }
  if (message.capabilities.canReopen && message.issueStatus === "resolved") actions.push({ action: "reopen", label: "Reopen issue" });
  if ((message.capabilities.canAssign || message.capabilities.canAssignSelf) && message.priority !== "normal") actions.push({ action: "assign", label: "Change responsible person" });
  if (message.action && message.capabilities.canReschedule) actions.push({ action: "reschedule", label: "Change due date" });
  return actions;
}

export function ChatIssueDialog({ projectId, message: initialMessage, participants, onClose }: { projectId: string; message: ChatMessage; participants: ChatParticipant[]; onClose: () => void }) {
  const id = useId();
  const chat = useProjectChat();
  const latest = useQuery({ queryKey: [...chatKeys.project(chat.scope, projectId), "issue-context", initialMessage.id], queryFn: ({ signal }) => projectChatApi.messages(projectId, { around: initialMessage.id, limit: 1 }, signal), retry: false, enabled: chat.enabled && !chat.denied.has(projectId) });
  const message = latest.data?.items.find(item => item.id === initialMessage.id) ?? initialMessage;
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(latest.error)) void verifyAccess(projectId); }, [latest.error, projectId, verifyAccess]);
  const actions = chatIssueActions(message);
  const [action, setAction] = useState<ChatIssueAction>(actions[0]?.action ?? "raise");
  const [priority, setPriority] = useState<"important" | "critical">("important");
  const [owner, setOwner] = useState(message.capabilities.canAssign ? message.responsible?.id ?? "" : chat.userId);
  const [expectedVersion, setExpectedVersion] = useState(message.version);
  const versionChanged = expectedVersion !== message.version;
  const [dueDate, setDueDate] = useState(message.action?.dueDate ?? "");
  const [note, setNote] = useState("");
  const mutation = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  const needsNote = ["resolve", "reopen", "lower", "clear", "reschedule"].includes(action);
  const validOwner = action !== "assign" || (!owner ? !message.action : participants.some(person => person.id === owner && (message.capabilities.canAssign || person.id === chat.userId)));
  const validDueDate = action !== "reschedule" || isChatDueDate(dueDate);
  const available = !latest.isPending && !latest.isError && actions.some(item => item.action === action);
  function save() {
    if (versionChanged || !available || !validOwner || !validDueDate || (needsNote && !note.trim())) return;
    const input: Omit<ChatIssueInput, "idempotencyKey"> = {
      action, expectedVersion,
      ...(needsNote || note.trim() ? { note: note.trim() } : {}),
      ...(action === "reschedule" ? { dueDate } : {}),
      ...(action === "raise" ? { priority } : {}),
      ...(action === "assign" ? { responsibleUserId: owner || null } : {})
    };
    void mutation.run(signal => projectChatApi.issue(projectId, message.id, { ...input, idempotencyKey: keyFor(input) }, signal), onClose);
  }
  return <Dialog title="Manage discussion issue" eyebrow="Project discussion" description="Issue updates are shared with the client and project team." onClose={onClose} busy={mutation.busy}>
    <form className="project-chat-form" onSubmit={event => { event.preventDefault(); save(); }}>
      <blockquote className="project-chat-quote"><strong>{message.author.name}</strong><p>{message.body || attachmentSummaryText(attachmentSummary(message.attachments ?? []))}</p></blockquote>
      {message.priority !== "normal" ? <div className="project-chat-issue-details"><span className={`project-chat-priority project-chat-priority--${message.priority}`}>{message.priority === "critical" ? "Critical" : "Important"} · {message.issueStatus === "resolved" ? "Resolved" : "Open"}</span><p>{message.responsible ? `Responsible: ${message.responsible.name}${message.responsible.available ? "" : " (unavailable)"}` : "Unassigned"}</p>{message.raisedBy ? <p>Raised by {message.raisedBy.name}</p> : null}</div> : null}
      {message.action ? <div className="project-chat-tracked-details"><strong>{message.action.typeName}</strong><span>Due <time dateTime={message.action.dueDate}>{chatDueDate(message.action.dueDate)}</time></span><span>Original due date: <time dateTime={message.action.originalDueDate}>{chatDueDate(message.action.originalDueDate)}</time></span></div> : null}
      {message.issueHistory.length ? <section className="project-chat-history" aria-label="Recent issue history"><h3>Recent issue history</h3><ol>{message.issueHistory.map(event => <li key={event.id}><strong>{event.actor.name}</strong> · {ROLE_LABELS[event.actor.role]} · {event.action}<br /><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>{event.actionMetadata ? <p>Due {chatDueDate(event.actionMetadata.dueDate)} · Original due {chatDueDate(event.actionMetadata.originalDueDate)}</p> : null}{event.note ? <p>{event.note}</p> : null}</li>)}</ol></section> : null}
      {versionChanged ? <div className="project-chat-warning" role="status"><p>This issue has changed since you started editing. Review the current details and history above before applying your retained changes.</p><Button variant="secondary" disabled={mutation.busy || latest.isPending || latest.isError} onClick={() => setExpectedVersion(message.version)}>Review complete, keep my changes</Button></div> : null}
      {mutation.error ? <p className="project-chat-error" role="alert">{mutation.error}</p> : null}
      {latest.isPending ? <p role="status">Loading the latest issue…</p> : latest.isError ? <p role="alert">{chatErrorMessage(latest.error)} <Button variant="quiet" onClick={() => void latest.refetch()}>Retry issue</Button></p> : !available && actions.length ? <p role="status">This issue changed. Choose an available action.</p> : null}
      {actions.length ? <>
      <Field id={`${id}-action`} label="Action">{props => <Select {...props} value={available ? action : ""} onChange={event => setAction(event.target.value as ChatIssueAction)}><option value="" disabled>Choose action</option>{actions.map(item => <option key={item.action} value={item.action}>{item.label}</option>)}</Select>}</Field>
      {action === "raise" ? <Field id={`${id}-priority`} label="Importance">{props => <Select {...props} value={priority} onChange={event => setPriority(event.target.value as "important" | "critical")}><option value="important">Important</option><option value="critical">Critical</option></Select>}</Field> : null}
      {action === "assign" ? <Field id={`${id}-owner`} label="Responsible person" hint={message.capabilities.canAssign ? "A mention does not assign responsibility." : "You may take responsibility for this issue."}>{props => <Select {...props} value={owner} onChange={event => setOwner(event.target.value)}>{message.capabilities.canAssign ? <option value="">{message.action ? "Select a participant" : "Unassigned"}</option> : null}{owner && !participants.some(person => person.id === owner) ? <option value={owner} disabled>Previously selected person (unavailable)</option> : null}{participants.filter(person => message.capabilities.canAssign || person.id === chat.userId).map(person => <option key={person.id} value={person.id}>{person.name} · {ROLE_LABELS[person.role]}</option>)}</Select>}</Field> : null}
      {action === "reschedule" ? <Field id={`${id}-due`} label="New due date" required>{props => <Input {...props} type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />}</Field> : null}
      <Field id={`${id}-note`} label={action === "resolve" ? "Resolution note" : "Reason"} required={needsNote} hint="Discussion changes do not complete formal project tasks.">{props => <Textarea {...props} maxLength={1000} rows={3} value={note} onChange={event => setNote(event.target.value)} />}</Field>
      <div className="project-chat-form__actions"><Button variant="destructive-outline" disabled={mutation.busy} onClick={onClose}>Cancel</Button><Button type="submit" busy={mutation.busy} disabled={versionChanged || !available || !validOwner || !validDueDate || (needsNote && !note.trim())}>Save update</Button></div>
      </> : <div className="project-chat-form__actions"><Button variant="secondary" onClick={onClose}>Done</Button></div>}
    </form>
  </Dialog>;
}
