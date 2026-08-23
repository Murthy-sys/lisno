import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ROLE_LABELS } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  UserInvitationAction,
  UserInvitationItem
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import {
  resendUserInvitation,
  revokeUserInvitation,
  userInvitationKeys
} from "./userInvitationsApi";

interface InvitationActionDialogProps {
  invitation: UserInvitationItem;
  currentInvitation: UserInvitationItem | null;
  action: UserInvitationAction;
  canResend: boolean;
  canRevoke: boolean;
  onClose(): void;
}

function title(action: UserInvitationAction, name: string): string {
  return `${action === "resend" ? "Resend" : "Revoke"} invitation for ${name}`;
}

function deliveryMessage(invitation: UserInvitationItem): string {
  if (invitation.deliveryStatus === "sent") return "Email sent.";
  if (invitation.deliveryStatus === "queued") return "Email queued.";
  return "Email delivery failed. You can resend from the invitation list.";
}

export function InvitationActionDialog({
  invitation,
  currentInvitation,
  action,
  canResend,
  canRevoke,
  onClose
}: InvitationActionDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [snapshot] = useState(invitation);
  const [selectedAction, setSelectedAction] = useState(action);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState("");
  const isCurrentRow =
    currentInvitation?.id === snapshot.id &&
    currentInvitation.version === snapshot.version;
  const allowed = (candidate: UserInvitationAction) =>
    snapshot.availableActions.includes(candidate) &&
    (candidate === "resend" ? canResend : canRevoke);
  const blocked =
    conflicted ||
    !isCurrentRow ||
    !allowed(selectedAction);

  const mutation = useMutation({
    mutationFn: (candidate: UserInvitationAction) =>
      candidate === "resend"
        ? resendUserInvitation(snapshot.id, { version: snapshot.version })
        : revokeUserInvitation(snapshot.id, { version: snapshot.version }),
    retry: false,
    onSuccess: async (result, candidate) => {
      await queryClient.invalidateQueries({ queryKey: userInvitationKeys.all });
      feedback.success(
        candidate === "revoke"
          ? { title: "Invitation revoked." }
          : { title: "Invitation resent.", message: deliveryMessage(result) }
      );
      onClose();
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setConflicted(true);
        setError(
          "This invitation changed elsewhere. Close this dialog and reopen it from the refreshed list."
        );
        await queryClient.invalidateQueries({ queryKey: userInvitationKeys.all });
        return;
      }
      setError(
        failure instanceof ApiError &&
          failure.code === "INVITATION_DELIVERY_UNAVAILABLE"
          ? "Invitation delivery is unavailable. This invitation was not changed; try again later."
          : "This invitation could not be updated. Close the dialog and try again."
      );
    }
  });

  const alternate: UserInvitationAction =
    selectedAction === "resend" ? "revoke" : "resend";
  const interactionBlocked = mutation.isPending || blocked;

  return (
    <Dialog
      title={title(action, snapshot.name)}
      eyebrow="Invitation administration"
      description="Review the selected invitation before continuing."
      busy={mutation.isPending}
      onClose={onClose}
    >
      <div className="user-invitation-dialog">
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {mutation.isPending
            ? `${selectedAction === "resend" ? "Resending" : "Revoking"} invitation. Please wait.`
            : ""}
        </p>
        <div className="user-invitation-dialog__identity">
          <strong>{snapshot.name}</strong>
          <span>{snapshot.email}</span>
          <span>{ROLE_LABELS[snapshot.role]}</span>
        </div>
        {error ? (
          <p className="user-invitation-dialog__error" role="alert">{error}</p>
        ) : null}
        {!isCurrentRow && !conflicted ? (
          <p className="user-invitation-dialog__error" role="alert">
            This invitation is no longer current. Close this dialog and reopen it from the refreshed list.
          </p>
        ) : null}
        <p>
          {selectedAction === "resend"
            ? "A new email will replace the current invitation link."
            : "The current invitation will no longer be usable."}
        </p>
        <div className="user-invitation-dialog__actions">
          <Button
            variant="quiet"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          {allowed(alternate) ? (
            <Button
              variant={alternate === "revoke" ? "destructive" : "secondary"}
              disabled={interactionBlocked}
              onClick={() => {
                setError("");
                setSelectedAction(alternate);
              }}
            >
              {alternate === "resend" ? "Resend" : "Revoke"} instead
            </Button>
          ) : null}
          <Button
            data-dialog-initial-focus
            variant={selectedAction === "revoke" ? "destructive" : "primary"}
            busy={mutation.isPending}
            busyLabel={selectedAction === "resend" ? "Resending…" : "Revoking…"}
            disabled={interactionBlocked}
            onClick={() => mutation.mutate(selectedAction)}
          >
            Confirm {selectedAction}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
