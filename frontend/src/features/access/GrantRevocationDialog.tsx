import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { ReviewAccessRequest } from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { reviewAccessRequestKeys, revokeProjectAccessGrant } from "./accessRequestsApi";

interface GrantRevocationDialogProps {
  request: ReviewAccessRequest;
  isCurrentRow: boolean;
  onClose(): void;
}

export function GrantRevocationDialog({ request, isCurrentRow, onClose }: GrantRevocationDialogProps) {
  const grant = request.activeGrant;
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!grant) throw new Error("Missing active grant");
      return revokeProjectAccessGrant(grant.id, { version: grant.version, reason: reason.trim() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all });
      feedback.announce("Project access revoked.");
      onClose();
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        setError(failure.message);
        await queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all });
        return;
      }
      setError("Project access could not be revoked.");
    }
  });

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) { setError("Explain why access is being revoked."); return; }
    if (trimmed.length > 1000) { setError("Keep the reason within 1000 characters."); return; }
    if (!grant || !isCurrentRow || mutation.isPending) return;
    setError("");
    mutation.mutate();
  };

  return (
    <Dialog title="Revoke project access" eyebrow="Access review" description={grant ? `Grant ${grant.id} for request ${request.id}.` : "This grant is no longer active."} busy={mutation.isPending} onClose={onClose}>
      <form className="access-request-dialog" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {!isCurrentRow || !grant ? <p className="access-request-dialog__error" role="alert">This grant is no longer in the current review view.</p> : null}
        <Field id={`grant-revocation-reason-${grant?.id ?? request.id}`} label="Reason" required error={error ? <span role="alert">{error}</span> : undefined}>
          {(controlProps) => <Textarea {...controlProps} data-dialog-initial-focus rows={5} value={reason} disabled={mutation.isPending || !isCurrentRow || !grant} onChange={(event) => { setReason(event.target.value); setError(""); }} />}
        </Field>
        <div className="access-request-dialog__actions">
          <Button variant="quiet" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="destructive" busy={mutation.isPending} disabled={!isCurrentRow || !grant} busyLabel="Revoking…">Revoke access</Button>
        </div>
      </form>
    </Dialog>
  );
}
