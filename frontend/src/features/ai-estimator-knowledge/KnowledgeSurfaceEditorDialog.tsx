import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useRef,
  useState,
  type FormEvent
} from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  createKnowledgeSurface,
  listKnowledgeSurfaces,
  updateKnowledgeSurface
} from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { syncKnowledgeMasterMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeMaster, KnowledgeSurface } from "./knowledgeTypes";

export type KnowledgeSurfaceLike = KnowledgeMaster;

export interface KnowledgeSurfaceEditorDialogProps {
  readonly existing?: KnowledgeSurfaceLike;
  readonly quickAdd?: boolean;
  readonly onClose: () => void;
  readonly onSaved?: (surface: KnowledgeSurface) => void;
}

export function KnowledgeSurfaceEditorDialog({
  existing,
  quickAdd = false,
  onClose,
  onSaved
}: KnowledgeSurfaceEditorDialogProps) {
  const queryClient = useQueryClient();
  const [expectedVersion, setExpectedVersion] = useState(existing?.version ?? null);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [refreshingConflict, setRefreshingConflict] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const common = {
        name: name.trim(),
        description: description.trim() || null
      };
      if (!existing) {
        return createKnowledgeSurface({ ...common });
      }
      return updateKnowledgeSurface(existing.id, {
        expectedVersion: expectedVersion ?? existing.version,
        ...common
      });
    },
    onSuccess: (surface) => {
      void syncKnowledgeMasterMutation(queryClient, "surfaces", surface);
      onSaved?.(surface);
      onClose();
    }
  });
  const mutationError = mutation.error;
  const apiError = mutationError instanceof ApiError ? mutationError : null;
  const duplicateName = apiError?.code === "DUPLICATE_IDENTITY";
  const versionConflict = apiError?.code === "VERSION_CONFLICT";
  const resolvedNameError = duplicateName
    ? "A Surface with this name already exists."
    : apiFieldError(apiError, "name") ?? (validationAttempted && !name.trim()
      ? "Enter a Surface name."
      : undefined);
  const generalError = mutationError && !duplicateName && !versionConflict
    && !resolvedNameError
    ? mutationError.message
    : null;

  function clearMutationFeedback() {
    if (mutation.error) mutation.reset();
    setConflictNotice(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationAttempted(true);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    mutation.mutate();
  }

  async function refreshAfterConflict() {
    if (!existing || refreshingConflict) return;
    setRefreshingConflict(true);
    try {
      const latestCatalog = await collectAllKnowledgeMasterPages<KnowledgeSurface>(
        (params) => listKnowledgeSurfaces({ ...params, includeArchived: true }),
        "Surface"
      );
      const latest = latestCatalog.items.find(({ id }) => id === existing.id);
      if (!latest) {
        setConflictNotice(
          "The latest Surface could not be found. Close this dialog and refresh the Surface list."
        );
        return;
      }
      setExpectedVersion(latest.version);
      mutation.reset();
      setConflictNotice(
        "The latest Surface version is loaded. Your entered values are preserved; review them and retry."
      );
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.masterLists("surfaces")
      }).catch(() => undefined);
    } catch {
      setConflictNotice(
        "The latest Surface could not be loaded. Check your connection and try again."
      );
    } finally {
      setRefreshingConflict(false);
    }
  }

  return (
    <Dialog
      title={`${existing ? "Edit" : "Add"} Surface`}
      eyebrow="Estimation configuration"
      description={quickAdd
        ? "Save this Surface, then save Mode to apply it to the Main Line."
        : "Create a reusable Surface for Main Lines and the estimator."}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="knowledge-dialog-form knowledge-dialog-form--wide" onSubmit={submit} noValidate>
        <div className="knowledge-dialog-body">
          {versionConflict ? (
            <InlineMessage
              tone="warning"
              title="This Surface changed elsewhere"
              action={
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  busy={refreshingConflict}
                  onClick={() => void refreshAfterConflict()}
                >
                  Load latest version
                </Button>
              }
            >
              Your entered values are preserved. Load the latest version before retrying.
            </InlineMessage>
          ) : null}
          {conflictNotice ? <InlineMessage tone="info" role="status">{conflictNotice}</InlineMessage> : null}
          {generalError ? <InlineMessage tone="error" role="alert">{generalError}</InlineMessage> : null}
          <Field id="surface-name" label="Surface name" required error={resolvedNameError}>
            {(props) => (
              <Input
                {...props}
                ref={nameRef}
                data-dialog-initial-focus
                value={name}
                maxLength={240}
                placeholder="Wall surface"
                onChange={(event) => {
                  setName(event.target.value);
                  clearMutationFeedback();
                }}
              />
            )}
          </Field>
          <Field
            id="surface-examples"
            label="Examples / components"
            hint="Add examples in any format that helps the estimator understand this Surface."
            error={apiFieldError(apiError, "description")}
          >
            {(props) => (
              <Textarea
                {...props}
                value={description}
                maxLength={4000}
                placeholder="Paint, wallpaper, texture, paneling, tiles"
                onChange={(event) => {
                  setDescription(event.target.value);
                  clearMutationFeedback();
                }}
              />
            )}
          </Field>

        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" busy={mutation.isPending}>
            {existing ? "Save changes" : "Add Surface"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function apiFieldError(error: ApiError | null, field: string): string | undefined {
  if (!error?.fields) return undefined;
  return Object.entries(error.fields).find(([path]) =>
    path === field || path.endsWith(`.${field}`)
  )?.[1];
}
