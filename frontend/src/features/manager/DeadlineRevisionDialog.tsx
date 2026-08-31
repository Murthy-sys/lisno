import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../../api/client";
import type { TaskRecord } from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";

export function DeadlineRevisionDialog({ task, onClose, onConflict }: { task: TaskRecord; onClose: () => void; onConflict: () => Promise<unknown> }) {
  const client = useQueryClient();
  const [deadline, setDeadline] = useState(task.currentDeadlineAt.slice(0, 16));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const mutation = useMutation({ mutationFn: () => apiClient.patch<TaskRecord>(`/tasks/${task.id}/deadline`, { version: task.version, currentDeadlineAt: new Date(deadline).toISOString(), reason }), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["management"] }), client.invalidateQueries({ queryKey: dashboardKeys.all })]); onClose(); }, onError: async (failure) => { if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") { await onConflict(); setRequiresRefresh(true); setError("This task changed. The task has been refreshed; close this dialog and open it again to continue."); } else setError("Deadline could not be revised."); } });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <Dialog title="Revise deadline" description={`Original deadline: ${new Date(task.originalDeadlineAt).toLocaleDateString()}`} onClose={onClose} busy={mutation.isPending}>
    <form className="modal-form" onSubmit={submit}><label>New deadline<input aria-label="New deadline" disabled={mutation.isPending || requiresRefresh} type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label><label>Reason<textarea aria-label="Deadline revision reason" disabled={mutation.isPending || requiresRefresh} required value={reason} onChange={(e) => setReason(e.target.value)} /></label>{error ? <p role="alert">{error}</p> : null}{requiresRefresh ? <button className="button button--primary" type="button" onClick={onClose}>Review refreshed task</button> : <button className="button button--primary" disabled={mutation.isPending} type="submit">{mutation.isPending ? "Saving…" : "Save deadline"}</button>}</form>
  </Dialog>;
}
