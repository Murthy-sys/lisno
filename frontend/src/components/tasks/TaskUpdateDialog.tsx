import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectWorkflowKeys } from "../../features/workflow/projectWorkflowApi";

import { ApiError, apiClient } from "../../api/client";
import type {
  ProjectHierarchy,
  ProjectTask,
  TaskRecord,
  TaskStatus,
  UpdateTaskInput
} from "../../api/types";
import { designerKeys } from "../../features/designer/designerApi";
import { dashboardKeys } from "../../features/admin/dashboard/superAdminDashboardApi";
import { Button } from "../ui/Button";
import { ContextPanel } from "../ui/ContextPanel";
import { Field, Input, Select, Textarea } from "../ui/Field";
import "./taskPanels.css";

const statusLabels: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  completed: "Completed"
};

const transitions: Record<TaskStatus, TaskStatus[]> = {
  not_started: ["not_started", "in_progress", "blocked"],
  in_progress: ["in_progress", "in_review", "blocked", "completed"],
  in_review: ["in_review", "in_progress", "blocked", "completed"],
  blocked: ["blocked", "not_started", "in_progress"],
  completed: ["completed"]
};

interface MutationContext {
  previous?: ProjectHierarchy;
}

export function TaskUpdateDialog({
  task,
  userId,
  onClose,
  onSaved
}: {
  task: TaskRecord;
  userId: string;
  onClose: () => void;
  onSaved: (task: TaskRecord) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [progress, setProgress] = useState(String(task.progress));
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [needsReview, setNeedsReview] = useState(false);

  useEffect(() => {
    if (conflictVersion === null || task.version === conflictVersion) return;
    setStatus(task.status);
    setProgress(String(task.progress));
    setNote("");
    setConflictVersion(null);
    setNeedsReview(true);
  }, [conflictVersion, task.progress, task.status, task.version]);

  const mutation = useMutation<
    TaskRecord,
    Error,
    UpdateTaskInput,
    MutationContext
  >({
    mutationFn: (input) =>
      apiClient.patch<TaskRecord>(`/tasks/${task.id}`, input),
    onMutate: async (input) => {
      const projectKey = designerKeys.project(task.projectId);
      await queryClient.cancelQueries({ queryKey: projectKey });
      const previous = queryClient.getQueryData<ProjectHierarchy>(projectKey);
      queryClient.setQueryData<ProjectHierarchy>(projectKey, (current) =>
        current ? replaceTask(current, task.id, input) : current
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          designerKeys.project(task.projectId),
          context.previous
        );
      }
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setValidationError(
          "This task changed on the server. We refreshed it so you can review the latest version."
        );
        setConflictVersion(task.version);
        void queryClient.refetchQueries({
          queryKey: designerKeys.project(task.projectId),
          exact: true,
          type: "active"
        });
      } else if (error instanceof ApiError && error.fields) {
        setValidationError(Object.values(error.fields)[0] ?? error.message);
      } else {
        setValidationError(
          error instanceof Error
            ? error.message
            : "The task update could not be saved."
        );
      }
    },
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow(task.projectId) }),
        queryClient.invalidateQueries({
          queryKey: designerKeys.project(task.projectId),
          exact: true
        }),
        queryClient.invalidateQueries({
          queryKey: designerKeys.kpi(userId),
          exact: true,
          refetchType: "none"
        }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      onSaved(updated);
      onClose();
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending || conflictVersion !== null || needsReview) return;
    setValidationError(null);
    const numericProgress = Number(progress);
    if (
      progress.trim() === "" ||
      !Number.isFinite(numericProgress) ||
      numericProgress < 0 ||
      numericProgress > 100
    ) {
      setValidationError("Progress must be a number from 0 to 100.");
      return;
    }
    if (status === "completed" && numericProgress !== 100) {
      setValidationError("Completed tasks require progress 100.");
      return;
    }
    if (status === "blocked" && note.trim() === "") {
      setValidationError("Add a note explaining what is blocking this task.");
      return;
    }

    const input: UpdateTaskInput = {
      version: task.version,
      status,
      progress: numericProgress,
      ...(note.trim() ? { note: note.trim() } : {})
    };
    mutation.mutate(input);
  };

  return (
    <ContextPanel
      title="Update task"
      description={`${task.title} · version ${task.version}`}
      width="medium"
      dirty={status !== task.status || progress !== String(task.progress) || note !== ""}
      onClose={onClose}
      busy={mutation.isPending}
      footer={({ requestClose }) => (
        <div className="task-panel__actions">
          <Button variant="destructive-outline" onClick={requestClose} disabled={mutation.isPending || conflictVersion !== null}>
            Cancel
          </Button>
          <Button type="submit" form={`task-update-form-${task.id}`} busy={mutation.isPending} busyLabel="Saving…" disabled={conflictVersion !== null || needsReview}>
            Save update
          </Button>
        </div>
      )}
    >
      <form id={`task-update-form-${task.id}`} className="task-panel__form" onSubmit={submit}>
        {validationError ? (
          <div className="form-alert" role="alert">{validationError}</div>
        ) : null}

        <div className="task-panel__fields">
          <Field id={`task-status-${task.id}`} label="Status">
            {(props) => <Select {...props}
              value={status}
              disabled={mutation.isPending || conflictVersion !== null || needsReview}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {transitions[task.status].map((option) => (
                <option value={option} key={option}>{statusLabels[option]}</option>
              ))}
            </Select>}
          </Field>

          <Field id={`task-progress-${task.id}`} label="Progress" hint="Percentage, from 0 to 100.">
            {(props) => <Input {...props}
              type="number"
              min="0"
              max="100"
              step="1"
              value={progress}
              disabled={mutation.isPending || conflictVersion !== null || needsReview}
              onChange={(event) => setProgress(event.target.value)}
            />}
          </Field>
        </div>

        <Field id={`task-note-${task.id}`} label={`Note ${status === "blocked" ? "(required when blocked)" : "(optional)"}`}>
          {(props) => <Textarea {...props}
            rows={4}
            value={note}
            disabled={mutation.isPending || conflictVersion !== null || needsReview}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Share what changed or what the team needs to know."
          />}
        </Field>

        {needsReview ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setNeedsReview(false)}
          >
            Review refreshed values
          </Button>
        ) : null}
      </form>
    </ContextPanel>
  );
}

function replaceTask(
  project: ProjectHierarchy,
  taskId: string,
  input: UpdateTaskInput
): ProjectHierarchy {
  return {
    ...project,
    floors: project.floors.map((floor) => ({
      ...floor,
      stages: floor.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((current) =>
          current.id === taskId
            ? ({
                ...current,
                ...(input.status !== undefined ? { status: input.status } : {}),
                ...(input.progress !== undefined
                  ? { progress: input.progress }
                  : {})
              } as ProjectTask)
            : current
        )
      }))
    }))
  };
}
