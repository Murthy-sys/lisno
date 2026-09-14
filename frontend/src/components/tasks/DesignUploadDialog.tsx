import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiClient } from "../../api/client";
import type { DesignVersion, TaskRecord } from "../../api/types";
import { designerKeys } from "../../features/designer/designerApi";
import { Button } from "../ui/Button";
import { ContextPanel } from "../ui/ContextPanel";
import { Field, FileInput } from "../ui/Field";
import { ProgressBar } from "../ui/ProgressBar";
import "./taskPanels.css";

export function DesignUploadDialog({
  task,
  onClose,
  onUploaded
}: {
  task: TaskRecord;
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
        form,
        { showGlobalLoader: false }
      );
    },
    onError: (uploadError) => {
      setError(
        uploadError instanceof ApiError
          ? uploadError.message
          : "The design file could not be uploaded. Please try again."
      );
    },
    onSuccess: async (version) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: designerKeys.project(task.projectId),
          exact: true
        }),
        queryClient.invalidateQueries({
          queryKey: designerKeys.designVersions(task.projectId),
          exact: true
        })
      ]);
      onUploaded(version);
      onClose();
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(null);
    if (!file) {
      setError("Choose a PDF or image file to upload.");
      return;
    }
    if (!isSupportedUploadSelection(file)) {
      setError("Only PDF, PNG, JPEG, and WebP files are supported.");
      return;
    }
    mutation.mutate(file);
  };

  return (
    <ContextPanel
      title="Upload design"
      description={`Add a new design version for ${task.title}.`}
      width="medium"
      dirty={file !== null}
      onClose={onClose}
      busy={mutation.isPending}
      footer={({ requestClose }) => (
        <div className="task-panel__actions">
          <Button variant="secondary" onClick={requestClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" form={`design-upload-form-${task.id}`} busy={mutation.isPending} busyLabel="Uploading…">Upload file</Button>
        </div>
      )}
    >
      <form id={`design-upload-form-${task.id}`} className="task-panel__form design-upload-form" onSubmit={submit}>
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <Field id={`design-file-${task.id}`} label="Design file" hint="PDF, PNG, JPEG, or WebP. Server upload limits apply.">
          {(props) => <FileInput {...props}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            disabled={mutation.isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />}
        </Field>
        {file ? <p className="task-panel__file" role="status">{file.name} · {formatBytes(file.size)}</p> : null}

        {mutation.isPending ? (
          <div className="upload-progress" role="status">
            <span>Uploading securely…</span>
            <ProgressBar label="Upload in progress" />
          </div>
        ) : null}
      </form>
    </ContextPanel>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

const supportedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const genericMimeTypes = new Set(["", "application/octet-stream"]);

export function isSupportedUploadSelection(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (allowedMimeTypes.has(mimeType)) return true;
  if (!genericMimeTypes.has(mimeType)) return false;
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 && supportedExtensions.has(file.name.slice(dot).toLowerCase());
}
