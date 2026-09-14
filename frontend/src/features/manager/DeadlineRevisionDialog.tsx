import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../../api/client";
import type { TaskRecord } from "../../api/types";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import "./managementWorkspace.css";

export function DeadlineRevisionDialog({ task, onClose, onConflict }: { task: TaskRecord; onClose: () => void; onConflict: () => Promise<unknown> }) {
  const client = useQueryClient();
  const formId = useId();
  const [deadline, setDeadline] = useState(task.currentDeadlineAt.slice(0, 16));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const mutation = useMutation({
    mutationFn: () => apiClient.patch<TaskRecord>(`/tasks/${task.id}/deadline`, { version: task.version, currentDeadlineAt: new Date(deadline).toISOString(), reason }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["management"] }),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow(task.projectId) }),
        client.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      onClose();
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        await onConflict();
        setRequiresRefresh(true);
        setError("This task changed. The task has been refreshed; close this panel and open it again to continue.");
      } else setError("Deadline could not be revised.");
    }
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending && !requiresRefresh) mutation.mutate();
  };
  return (
    <ContextPanel
      title="Revise deadline"
      eyebrow={task.title}
      description={`Original deadline: ${new Date(task.originalDeadlineAt).toLocaleDateString()}`}
      onClose={onClose}
      busy={mutation.isPending}
      dirty={!requiresRefresh && (deadline !== task.currentDeadlineAt.slice(0, 16) || Boolean(reason))}
      footer={({ requestClose }) => (
        <div className="management-panel-actions">
          {requiresRefresh ? <Button onClick={onClose}>Review refreshed task</Button> : <>
            <Button variant="secondary" onClick={requestClose} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" form={formId} busy={mutation.isPending} busyLabel="Saving…">Save deadline</Button>
          </>}
        </div>
      )}
    >
      <form id={formId} className="management-panel-form" onSubmit={submit}>
        <Field id={`${formId}-deadline`} label="New deadline" required>
          {(props) => <Input {...props} aria-label="New deadline" disabled={mutation.isPending || requiresRefresh} type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />}
        </Field>
        <Field id={`${formId}-reason`} label="Reason" required hint="Explain why the delivery date needs to change. The original deadline remains in the task history.">
          {(props) => <Textarea {...props} aria-label="Deadline revision reason" disabled={mutation.isPending || requiresRefresh} value={reason} onChange={(event) => setReason(event.target.value)} />}
        </Field>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </ContextPanel>
  );
}
