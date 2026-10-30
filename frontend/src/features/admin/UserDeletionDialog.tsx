import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { ManagedUserDeletionResult, UserDirectoryItem, UserDirectoryPage } from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { ownAccessRequestKeys, reviewAccessRequestKeys } from "../access/accessRequestsApi";
import { managementKeys } from "../manager/managerApi";
import { invalidateVendorAccess } from "../procurement/vendorLoginAccessApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { adminUserKeys, deleteManagedUser } from "./adminApi";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";

interface UserDeletionDialogProps {
  user: UserDirectoryItem;
  currentUser?: UserDirectoryItem;
  directoryReady: boolean;
  refreshing: boolean;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onRefresh(): Promise<unknown>;
  onDeleted(result: ManagedUserDeletionResult): void;
  onRefreshFinished(): void;
  onClose(): void;
}

export function UserDeletionDialog({
  user, currentUser, directoryReady, refreshing, fallbackFocusRef,
  onRefresh, onDeleted, onRefreshFinished, onClose
}: UserDeletionDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [confirmation, setConfirmation] = useState(user);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false);
  const needsReview = conflict || (currentUser !== undefined && currentUser.version !== confirmation.version);

  const mutation = useMutation({
    mutationFn: () => deleteManagedUser(confirmation.id, { version: confirmation.version }),
    onSuccess: async (result) => {
      // Stop an older request from restoring the row after a confirmed deletion.
      await queryClient.cancelQueries({ queryKey: adminUserKeys.all });
      queryClient.setQueriesData<UserDirectoryPage>({ queryKey: adminUserKeys.all }, (page) => page ? {
        ...page, items: page.items.filter((item) => item.id !== result.userId)
      } : page);
      onDeleted(result);
      feedback.success({ title: "User deleted", message: "Access has been revoked. Existing work and history are kept." });

      // Counts remain server-owned. Refresh failure is handled by the directory,
      // separately from the successful deletion, and cannot become a delete error.
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all }),
        queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        queryClient.invalidateQueries({ queryKey: managementKeys.team }),
        queryClient.invalidateQueries({ queryKey: managementKeys.organization }),
        queryClient.invalidateQueries({
          queryKey: ["project-chat"],
          predicate: ({ queryKey }) => queryKey[4] === "participants" || queryKey[4] === "participant-options"
        }),
        invalidateVendorAccess(queryClient)
      ]);
      onRefreshFinished();
    },
    onError: async (failure) => {
      submitting.current = false;
      if (failure instanceof ApiError) {
        setError(failure.message);
        if (failure.code === "VERSION_CONFLICT") {
          setConflict(true);
          await onRefresh();
        }
        return;
      }
      setError("The user could not be deleted. Please try again.");
    }
  });

  const protectedUser = currentUser?.role === "super_admin";
  const blocked = mutation.isPending || !directoryReady || !currentUser || protectedUser || needsReview;
  const message = !directoryReady
    ? "Refresh the directory before deleting this user."
    : !currentUser
      ? "This user is no longer in the current directory view. Close this dialog and locate the account again."
      : protectedUser
        ? "The Super Admin account cannot be deleted."
        : needsReview
          ? "The user changed elsewhere. Review the latest details before confirming deletion again."
          : error;

  return (
    <Dialog
      title={`Delete ${confirmation.name}?`}
      eyebrow="Confirm account deletion"
      description="Remove this user from the Users list and revoke their access. Existing work and history will be kept. This account cannot be reactivated here."
      tone="danger"
      role="alertdialog"
      busy={mutation.isPending}
      fallbackFocusRef={fallbackFocusRef}
      onClose={onClose}
    >
      <div className="admin-user-dialog ui-dialog__form">
        <div className="ui-dialog__body">
          <div className="admin-user-dialog__identity">
            <strong>{confirmation.name}</strong>
            <span>{confirmation.email}</span>
          </div>
          {message ? <p className="admin-user-dialog__error" role="alert">{message}</p> : null}
          {!directoryReady && !mutation.isPending ? (
            <Button variant="secondary" disabled={refreshing} onClick={() => void onRefresh()}>
              Refresh directory
            </Button>
          ) : null}
          {needsReview && directoryReady && currentUser ? (
            <Button variant="secondary" disabled={mutation.isPending} onClick={() => {
              setConfirmation(currentUser);
              setConflict(false);
              setError("");
            }}>
              Review latest details
            </Button>
          ) : null}
        </div>
        <div className="admin-user-dialog__actions ui-dialog__actions">
          <Button data-dialog-initial-focus variant="quiet" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={blocked} busy={mutation.isPending} busyLabel="Deleting…" onClick={() => {
            if (blocked || submitting.current) return;
            submitting.current = true;
            setError("");
            mutation.mutate();
          }}>Delete user</Button>
        </div>
      </div>
    </Dialog>
  );
}
