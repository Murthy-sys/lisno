import { useId, useState } from "react";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { projectChatApi } from "./projectChatApi";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatDraft } from "./projectChatState";
import type { ChatActionType, ChatParticipant } from "./projectChatTypes";

export function isChatDueDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function chatDueDate(value: string) {
  return isChatDueDate(value) ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : value;
}
export function ChatTrackedActionDialog({ draft, type, participants, onChange, onClose }: { draft: ChatDraft; type: ChatActionType; participants: ChatParticipant[]; onChange: (draft: ChatDraft) => void; onClose: () => void }) {
  const id = useId();
  const unavailable = Boolean(draft.responsibleUserId && !participants.some(person => person.id === draft.responsibleUserId));
  const valid = Boolean(draft.responsibleUserId && !unavailable && isChatDueDate(draft.action?.dueDate ?? ""));
  return <Dialog title={type.name} eyebrow="Tracked message" description="Write the action details in your message. Choose a responsible participant and due date before sending." onClose={onClose}>
    <div className="project-chat-form">
      <Field id={`${id}-owner`} label="Responsible person" required>{props => <Select {...props} value={draft.responsibleUserId} onChange={event => onChange({ ...draft, responsibleUserId: event.target.value })}><option value="">Select a participant</option>{unavailable ? <option value={draft.responsibleUserId} disabled>Previously selected person (unavailable)</option> : null}{participants.map(person => <option key={person.id} value={person.id}>{person.name} · {ROLE_LABELS[person.role]}</option>)}</Select>}</Field>
      <Field id={`${id}-due`} label="Due date" required>{props => <Input {...props} type="date" value={draft.action?.dueDate ?? ""} onChange={event => onChange({ ...draft, action: { typeId: type.id, dueDate: event.target.value } })} />}</Field>
      {unavailable ? <p role="status" className="project-chat-error">Choose a current participant. The previously selected person is no longer available.</p> : null}
      <div className="project-chat-form__actions"><Button variant="secondary" onClick={onClose}>Keep draft</Button><Button disabled={!valid} onClick={onClose}>Done</Button></div>
    </div>
  </Dialog>;
}
export function AddChatActionTypeDialog({ projectId, onCreated, onClose }: { projectId: string; onCreated: (type: ChatActionType) => void; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const mutation = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  return <Dialog title="Add action type" eyebrow="Project messages" description="This type will be available in every project conversation. New types use the Important priority and Open/Resolved status." busy={mutation.busy} onClose={onClose}>
    <form className="project-chat-form" onSubmit={event => { event.preventDefault(); event.stopPropagation(); const value = name.trim(); if (!value || value.length > 60) return; void mutation.run(signal => projectChatApi.createActionType(projectId, { name: value, idempotencyKey: keyFor(value) }, signal), onCreated); }}>
      <Field id={`${id}-name`} label="Action type name" required hint="Up to 60 characters. Names must be unique.">{props => <Input {...props} value={name} maxLength={60} onChange={event => setName(event.target.value)} />}</Field>
      {mutation.error ? <p role="alert" className="project-chat-error">{mutation.error}</p> : null}
      <div className="project-chat-form__actions"><Button variant="secondary" disabled={mutation.busy} onClick={onClose}>Cancel</Button><Button type="submit" busy={mutation.busy} disabled={!name.trim()}>Add action type</Button></div>
    </form>
  </Dialog>;
}
