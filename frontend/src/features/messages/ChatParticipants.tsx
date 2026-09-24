import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS } from "../../api/authorization-contract";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useProjectChat } from "./ProjectChatProvider";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatParticipant, ChatRemovedParticipant } from "./projectChatTypes";

const sourceLabels = { client: "Linked client", super_admin: "Super Admin", project_assignment: "Project assignment", estimate_assignment: "Estimate assignment", workflow_assignment: "Work assignment", access_grant: "Project access grant", selection: "Selected for this conversation" };
export function ChatParticipants({ projectId, participants, removed = [], warnings, canManage }: { projectId: string; participants: ChatParticipant[]; removed?: ChatRemovedParticipant[]; warnings: string[]; canManage: boolean }) {
  const [editing, setEditing] = useState<{ mode: "remove" | "restore"; person: ChatParticipant | ChatRemovedParticipant } | "add" | null>(null);
  return <section className="project-chat-participants" aria-label="Participants">
    <p className="project-chat-muted">Shared with the client and project team. New participants can read the conversation history.</p>
    {warnings.length ? <div className="project-chat-warning" role="status">{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div> : null}
    {canManage ? <Button variant="secondary" onClick={() => setEditing("add")}>Add participant</Button> : null}
    <ul>{participants.map(person => <li key={person.id}><div><strong>{person.name}</strong><span>{ROLE_LABELS[person.role]}</span>{canManage ? <small>{[...new Set(person.sources.map(source => sourceLabels[source.kind]))].join(" · ")}</small> : null}</div>
      {canManage && person.canRemove ? <Button variant="destructive-outline" size="compact" onClick={() => setEditing({ mode: "remove", person })} aria-label={`Remove participant ${person.name}`}>Remove participant</Button> : canManage && person.removalBlockedReason ? <small>{person.removalBlockedReason}</small> : null}
    </li>)}</ul>
    {canManage ? <p className="project-chat-muted">Removal blocks conversation access while keeping project assignments and message history unchanged.</p> : null}
    {canManage && removed.length ? <section aria-label="Removed participants"><h3>Removed participants</h3><ul>{removed.map(person => <li key={person.id}><div><strong>{person.name}</strong><span>{ROLE_LABELS[person.role]}</span></div>{person.canRestore ? <Button variant="secondary" size="compact" onClick={() => setEditing({ mode: "restore", person })} aria-label={`Restore participant ${person.name}`}>Restore participant</Button> : <small>Currently unavailable for restoration</small>}</li>)}</ul></section> : null}
    {editing ? <ParticipantDialog projectId={projectId} mode={editing === "add" ? "add" : editing.mode} participant={editing === "add" ? null : editing.mode === "remove" ? participants.find(person => person.id === editing.person.id) ?? null : removed.find(person => person.id === editing.person.id) ?? null} onClose={() => setEditing(null)} /> : null}
  </section>;
}

function ParticipantDialog({ projectId, participant, mode, onClose }: { projectId: string; participant: ChatParticipant | ChatRemovedParticipant | null; mode: "add" | "remove" | "restore"; onClose: () => void }) {
  const id = useId();
  const chat = useProjectChat();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  useEffect(() => { const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer); }, [search]);
  const options = useQuery({ queryKey: [...chatKeys.project(chat.scope, projectId), "participant-options", debounced], queryFn: ({ signal }) => projectChatApi.options(projectId, debounced, signal), enabled: mode === "add" && chat.enabled && !chat.denied.has(projectId), retry: false });
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(options.error)) void verifyAccess(projectId); }, [projectId, options.error, verifyAccess]);
  function save() {
    if (!reason.trim()) return;
    if (mode !== "add" && participant && (mode === "remove" ? "canRemove" in participant && participant.canRemove : "canRestore" in participant && participant.canRestore)) {
      const input = { expectedVersion: participant.removalVersion ?? 0, reason: reason.trim() };
      void mutation.run(signal => projectChatApi[mode === "remove" ? "removeParticipant" : "restoreParticipant"](projectId, participant.id, { ...input, idempotencyKey: keyFor({ ...input, userId: participant.id, mode }) }, signal), onClose);
    } else if (mode === "add" && userId && options.data?.items.some(person => person.id === userId)) {
      const input = { userId, reason: reason.trim() };
      void mutation.run(signal => projectChatApi.selectParticipant(projectId, { ...input, idempotencyKey: keyFor(input) }, signal), onClose);
    }
  }
  return <Dialog title={mode === "remove" ? "Remove participant" : mode === "restore" ? "Restore participant" : "Add project participant"} eyebrow="Project discussion" description="This conversation is shared with the client. Changes affect conversation access only." onClose={onClose} busy={mutation.busy}>
    <form className="project-chat-form" onSubmit={event => { event.preventDefault(); save(); }}>
      {mode !== "add" ? <div><p>{mode === "remove" ? "Remove" : "Restore"} <strong>{participant?.name ?? "Participant unavailable"}</strong>?</p><p>{mode === "remove" ? "They will lose conversation access, including messages and attachments. Their assignments and historical messages remain." : "They will regain access to this conversation and its history if they are currently eligible."}</p></div> : <>
        <Field id={`${id}-search`} label="Search active people by name or role">{props => <Input {...props} value={search} onChange={event => { setSearch(event.target.value); setUserId(""); }} />}</Field>
        {options.isError ? <p role="alert" className="project-chat-error">{chatErrorMessage(options.error)} <Button variant="quiet" onClick={() => void options.refetch()}>Retry</Button></p> : options.isPending ? <p role="status">Loading eligible people…</p> : <Field id={`${id}-person`} label="Eligible participant" required hint={options.data?.hasMore ? "More people match. Refine your search." : "Trade workers appear only for trades included in the approved project source."}>{props => <Select {...props} value={userId} onChange={event => setUserId(event.target.value)}><option value="">Select a person</option>{options.data?.items.map(person => <option value={person.id} key={person.id}>{person.name} · {ROLE_LABELS[person.role]} · {person.id.slice(-6)}</option>)}</Select>}</Field>}
        {options.data && !options.data.items.length ? <p role="status">No eligible participants match. Check current assignments and approved trades.</p> : null}
      </>}
      <Field id={`${id}-reason`} label="Reason" required>{props => <Textarea {...props} rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />}</Field>
      {mutation.error ? <p role="alert" className="project-chat-error">{mutation.error}</p> : null}
      <div className="project-chat-form__actions"><Button variant="destructive-outline" onClick={onClose} disabled={mutation.busy}>Cancel</Button><Button type="submit" variant={mode === "remove" ? "destructive" : "primary"} busy={mutation.busy} disabled={!reason.trim() || (mode === "add" ? !userId : !participant || (mode === "remove" ? !("canRemove" in participant && participant.canRemove) : !("canRestore" in participant && participant.canRestore)))}>{mode === "remove" ? "Remove participant" : mode === "restore" ? "Restore participant" : "Add participant"}</Button></div>
    </form>
  </Dialog>;
}
