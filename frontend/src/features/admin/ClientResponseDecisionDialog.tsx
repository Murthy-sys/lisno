import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useRef,
  useState,
  type ChangeEvent,
  type RefObject
} from "react";

import { ApiError } from "../../api/client";
import type { EstimateClientResponseTaskListItem } from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FileInput, Textarea } from "../../components/ui/Field";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { adminProjectKeys } from "./adminProjectsApi";
import {
  decideEstimateClientResponse,
  estimateClientResponseKeys
} from "./estimateClientResponsesApi";

const proofAccept =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const allowedProofMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const allowedProofExtension = /\.(pdf|jpe?g|png|webp)$/iu;

interface ClientResponseDecisionDialogProps {
  task: EstimateClientResponseTaskListItem;
  decision: "approve" | "request_changes";
  isCurrentRow?: boolean;
  onClose(): void;
  onSaved(): void;
  returnFocusRef: RefObject<HTMLHeadingElement | null>;
}

function proofIsAdvisablyAllowed(file: File): boolean {
  return (
    allowedProofExtension.test(file.name) &&
    (file.type.length === 0 || allowedProofMimeTypes.has(file.type))
  );
}

export function ClientResponseDecisionDialog({
  task,
  decision,
  isCurrentRow = true,
  onClose,
  onSaved,
  returnFocusRef
}: ClientResponseDecisionDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [reasonError, setReasonError] = useState("");
  const [proofError, setProofError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [progress, setProgress] = useState(0);
  const rejected = decision === "request_changes";

  const mutation = useMutation({
    mutationFn: () =>
      decideEstimateClientResponse(
        task.id,
        {
          decision,
          note: reason,
          version: task.version,
          proof: proof!
        },
        setProgress
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: estimateClientResponseKeys.all
        }),
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all })
      ]);
      feedback.announce("Client response recorded.");
      onSaved();
      onClose();
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        const message =
          "This Client response task changed. Review the refreshed task before deciding.";
        setRequestError(message);
        feedback.announce(message);
        await queryClient.invalidateQueries({
          queryKey: estimateClientResponseKeys.all
        });
        return;
      }
      setRequestError(
        failure instanceof ApiError
          ? failure.message
          : "The Client response could not be recorded."
      );
    }
  });

  const interactionBlocked = mutation.isPending || !isCurrentRow;
  const title = rejected
    ? "Reject Client response"
    : "Approve Client response";
  const actionLabel = rejected ? "Reject" : "Approve";

  const changeProof = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setProof(selected);
    setProofError("");
    setRequestError("");
  };

  const submit = () => {
    if (interactionBlocked) return;
    const trimmedReason = reason.trim();
    const nextReasonError = rejected
      ? trimmedReason.length === 0
        ? "Explain what the Client wants changed."
        : trimmedReason.length > 1000
          ? "Keep the reason within 1000 characters."
          : ""
      : "";
    const nextProofError = !proof
      ? "Upload proof of the Client's decision."
      : !proofIsAdvisablyAllowed(proof)
        ? "Choose a PDF, JPG, PNG, or WebP proof file."
        : "";

    setReasonError(nextReasonError);
    setProofError(nextProofError);
    setRequestError("");
    if (nextReasonError) {
      reasonRef.current?.focus();
      return;
    }
    if (nextProofError) {
      proofRef.current?.focus();
      return;
    }

    setProgress(0);
    mutation.mutate();
  };

  return (
    <Dialog
      title={title}
      eyebrow="Client response proof"
      description={`Record ${task.client.name}'s response to Estimate version ${task.estimate.version}.`}
      busy={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="client-response-dialog"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <dl className="client-response-dialog__summary">
          <div><dt>Client</dt><dd>{task.client.name}</dd></div>
          <div><dt>Estimate version</dt><dd>{task.estimate.version}</dd></div>
          <div><dt>Task version</dt><dd>{task.version}</dd></div>
        </dl>

        {!isCurrentRow ? (
          <p className="client-response-dialog__error" role="alert">
            This task is no longer pending in the current inbox view.
          </p>
        ) : requestError ? (
          <p className="client-response-dialog__error" role="alert">
            {requestError}
          </p>
        ) : null}

        {rejected ? (
          <Field
            id={`client-response-reason-${task.id}`}
            label="Reason"
            required
            error={reasonError ? <span role="alert">{reasonError}</span> : undefined}
          >
            {(controlProps) => (
              <Textarea
                {...controlProps}
                ref={reasonRef}
                data-dialog-initial-focus
                rows={5}
                value={reason}
                disabled={interactionBlocked}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError("");
                  setRequestError("");
                }}
              />
            )}
          </Field>
        ) : null}

        <Field
          id={`client-response-proof-${task.id}`}
          label="Decision proof"
          required
          hint="PDF, JPG, PNG, or WebP. Server validation remains authoritative."
          error={proofError ? <span role="alert">{proofError}</span> : undefined}
        >
          {(controlProps) => (
            <FileInput
              {...controlProps}
              ref={proofRef}
              aria-label="Decision proof"
              data-dialog-initial-focus={!rejected || undefined}
              accept={proofAccept}
              disabled={interactionBlocked}
              onChange={changeProof}
            />
          )}
        </Field>

        {mutation.isPending ? (
          <ProgressBar value={progress} label="Decision proof upload" />
        ) : null}

        <div className="client-response-dialog__actions">
          <Button
            className="client-response-dialog__cancel"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={rejected ? "destructive" : "success"}
            busy={mutation.isPending}
            disabled={!isCurrentRow}
          >
            {mutation.isPending ? "Recording decision…" : actionLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
