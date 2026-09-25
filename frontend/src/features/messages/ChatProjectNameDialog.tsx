import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { invalidateProjectNameQueries } from "../../api/projectNameSync";
import { projectChatApi } from "./projectChatApi";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatSummary } from "./projectChatTypes";

export function ChatProjectNameDialog({ projectId, summary, onClose }: { projectId: string; summary: ChatSummary; onClose: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(summary.project.name);
  const [expectedVersion, setExpectedVersion] = useState(summary.project.nameVersion ?? 1);
  const mutation = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  const changed = expectedVersion !== (summary.project.nameVersion ?? 1);
  return <Dialog title="Edit project name" description="Updates the project name across your workspace." onClose={onClose} busy={mutation.busy}>
    <form className="project-chat-form" onSubmit={event => { event.preventDefault(); if (!name.trim() || name.trim().length > 200 || changed || !summary.capabilities.canRenameProject) return; const input = { name: name.trim(), expectedVersion }; void mutation.run(signal => projectChatApi.renameProject(projectId, { ...input, idempotencyKey: keyFor(input) }, signal), () => { void invalidateProjectNameQueries(queryClient, projectId); onClose(); }); }}>
      <Field id={`${id}-name`} label="Project name" required hint="Up to 200 characters.">{props => <Input {...props} maxLength={200} value={name} onChange={event => setName(event.target.value)} />}</Field>
      {changed ? <div className="project-chat-warning" role="status"><p>The current name is <strong>{summary.project.name}</strong>. Review this change before saving your name.</p><Button variant="secondary" onClick={() => setExpectedVersion(summary.project.nameVersion ?? 1)}>Review complete, keep my name</Button></div> : null}
      {mutation.error ? <p role="alert" className="project-chat-error">{mutation.error}</p> : null}
      <div className="project-chat-form__actions"><Button variant="secondary" onClick={onClose} disabled={mutation.busy}>Cancel</Button><Button type="submit" busy={mutation.busy} disabled={!name.trim() || changed || !summary.capabilities.canRenameProject}>Save project name</Button></div>
    </form>
  </Dialog>;
}
