import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { ReviewAccessRequest } from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import {
  decideAccessRequest,
  ownAccessRequestKeys,
  reviewAccessRequestKeys
} from "./accessRequestsApi";

interface AccessRequestDecisionDialogProps {
  request: ReviewAccessRequest;
  decision: "approved" | "rejected";
  isCurrentRow: boolean;
  onClose(): void;
}

export function AccessRequestDecisionDialog({
  request,
  decision,
  isCurrentRow,
  onClose
}: AccessRequestDecisionDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      decideAccessRequest(
        request.id,
        decision === "approved"
          ? { version: request.version, decision }
          : { version: request.version, decision, reason: reason.trim() }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all }),
        queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      feedback.announce("Access request decision saved.");
      onClose();
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        setError(failure.message);
        await queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all });
        return;
      }
      setError("The access request decision could not be saved.");
    }
  });

  const rejected = decision === "rejected";
  const interactionBlocked = mutation.isPending || !isCurrentRow;
  const submit = () => {
    const trimmed = reason.trim();
    if (rejected && trimmed.length === 0) {
      setError("Explain why the request is rejected.");
      return;
    }
    if (rejected && trimmed.length > 1000) {
      setError("Keep the reason within 1000 characters.");
      return;
    }
    if (interactionBlocked) return;
    setError("");
    mutation.mutate();
  };

  return (
    <Dialog
      title={rejected ? "Reject access request" : "Approve access request"}
      eyebrow="Access review"
      description={`Request ${request.id} for ${request.project.id}.`}
      busy={mutation.isPending}
      onClose={onClose}
    >
      <form
        className="access-request-dialog"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <dl className="access-request-dialog__summary">
          <div><dt>Request ID</dt><dd>{request.id}</dd></div>
          <div><dt>Module</dt><dd>{request.module}</dd></div>
          <div><dt>Version</dt><dd>{request.version}</dd></div>
        </dl>
        {!isCurrentRow ? (
          <p className="access-request-dialog__error" role="alert">This request is no longer in the current review view.</p>
        ) : error && !rejected ? (
          <p className="access-request-dialog__error" role="alert">{error}</p>
        ) : null}
        {rejected ? (
          <Field id={`access-request-decision-reason-${request.id}`} label="Reason" required error={error ? <span role="alert">{error}</span> : undefined}>
            {(controlProps) => (
              <Textarea
                {...controlProps}
                data-dialog-initial-focus
                rows={5}
                value={reason}
                disabled={interactionBlocked}
                onChange={(event) => { setReason(event.target.value); setError(""); }}
              />
            )}
          </Field>
        ) : null}
        <div className="access-request-dialog__actions">
          <Button data-dialog-initial-focus={!rejected || undefined} variant="quiet" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={rejected ? "destructive" : "primary"} busy={mutation.isPending} disabled={!isCurrentRow} busyLabel={rejected ? "Rejecting…" : "Approving…"}>
            {rejected ? "Reject request" : "Approve request"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
