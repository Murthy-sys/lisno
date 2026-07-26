import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { TaskRecord } from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";

export function DeadlineRevisionDialog({ task, onClose }: { task: TaskRecord; onClose: () => void }) {
  const client = useQueryClient();
  const [deadline, setDeadline] = useState(task.currentDeadlineAt.slice(0, 16));
  const [reason, setReason] = useState("");
  const mutation = useMutation({ mutationFn: () => apiClient.patch<TaskRecord>(`/tasks/${task.id}/deadline`, { version: task.version, currentDeadlineAt: new Date(deadline).toISOString(), reason }), onSuccess: () => { void client.invalidateQueries(); onClose(); } });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <Dialog title="Revise deadline" description={`Original deadline: ${new Date(task.originalDeadlineAt).toLocaleDateString()}`} onClose={onClose} busy={mutation.isPending}>
    <form className="modal-form" onSubmit={submit}><label>New deadline<input aria-label="New deadline" type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label><label>Reason<textarea aria-label="Deadline revision reason" required value={reason} onChange={(e) => setReason(e.target.value)} /></label>{mutation.isError ? <p role="alert">Deadline could not be revised.</p> : null}<button className="button button--primary" type="submit">Save deadline</button></form>
  </Dialog>;
}
