import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiClient } from "../../api/client";
import type { DesignVersion, TaskRecord } from "../../api/types";
import { designerKeys } from "../../features/designer/designerApi";
import { Dialog } from "../ui/Dialog";
import { ProgressBar } from "../ui/ProgressBar";

export function DesignUploadDialog({
  task,
  userId,
  onClose,
  onUploaded
}: {
  task: TaskRecord;
  userId: string;
  onClose: () => void;
  onUploaded: (version: DesignVersion) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (selectedFile: File) => {
      const form = new FormData();
      form.append("file", selectedFile);
      return apiClient.postMultipart<DesignVersion>(
        `/tasks/${task.id}/design-versions`,
        form
      );
    },
    onError: (uploadError) => {
      setError(
        uploadError instanceof ApiError
          ? uploadError.message
          : "The design file could not be uploaded. Please try again."
      );
    },
    onSuccess: (version) => {
      onUploaded(version);
      onClose();
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: designerKeys.project(task.projectId)
        }),
        queryClient.invalidateQueries({ queryKey: designerKeys.kpi(userId) }),
        queryClient.invalidateQueries({
          queryKey: designerKeys.designVersions(task.projectId)
        })
      ]);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a PDF or image file to upload.");
      return;
    }
    if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
      setError("Only PDF and image files are supported.");
      return;
    }
    mutation.mutate(file);
  };

  return (
    <Dialog
      title="Upload design"
      description={`Add a new design version for ${task.title}.`}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="modal-form" onSubmit={submit}>
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <div className="upload-dropzone">
          <label htmlFor={`design-file-${task.id}`}>Design file</label>
          <input
            id={`design-file-${task.id}`}
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p>PDF, PNG, JPEG, WEBP, or GIF. Server upload limits apply.</p>
          {file ? (
            <strong>{file.name} · {formatBytes(file.size)}</strong>
          ) : null}
        </div>

        {mutation.isPending ? (
          <div className="upload-progress" role="status">
            <span>Uploading securely…</span>
            <ProgressBar label="Upload in progress" />
          </div>
        ) : null}

        <div className="modal-form__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Uploading…" : "Upload file"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
