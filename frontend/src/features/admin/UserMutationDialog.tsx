import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ROLE_LABELS, type Role } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  ManagedUserMutationResult,
  UpdateManagedUserInput,
  UserDirectoryItem,
  UserResponsibilityCounts
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Select } from "../../components/ui/Field";
import { adminUserKeys, updateManagedUser } from "./adminApi";

export interface UserMutationDialogProps {
  user: UserDirectoryItem;
  manageableRoles: readonly Exclude<Role, "super_admin">[];
  isCurrentPageUser: boolean;
  onClose(): void;
}

type ManageableRole = Exclude<Role, "super_admin">;

const missingCurrentPageMessage =
  "This user is no longer in the current directory view. Close this dialog and locate the account again.";

const responsibilityLabels: Readonly<
  Record<keyof UserResponsibilityCounts, [string, string]>
> = {
  ownedActiveLeads: ["active lead remains owned", "active leads remain owned"],
  ownedActiveEstimates: [
    "active estimate remains owned",
    "active estimates remain owned"
  ],
  initiatedActiveProjects: [
    "active project remains initiated",
    "active projects remain initiated"
  ],
  assignedActiveProjects: [
    "active project assignment remains",
    "active project assignments remain"
  ],
  managedActiveProjects: [
    "managed active project remains",
    "managed active projects remain"
  ],
  ownedActiveTasks: ["active task remains assigned", "active tasks remain assigned"],
  directReports: ["direct report remains assigned", "direct reports remain assigned"],
  linkedClientProjects: [
    "linked client project remains",
    "linked client projects remain"
  ],
  adminInitiatorGrants: [
    "Admin initiator grant remains recorded",
    "Admin initiator grants remain recorded"
  ]
};

function grantSummary(count: number) {
  return `${count} project access grant${count === 1 ? "" : "s"} revoked.`;
}

function retainedResponsibilitySummary(counts: UserResponsibilityCounts) {
  const summaries = (Object.entries(counts) as Array<
    [keyof UserResponsibilityCounts, number]
  >)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const [singular, plural] = responsibilityLabels[key];
      return `${count} ${count === 1 ? singular : plural}`;
    });
  return summaries.length > 0
    ? ` Assignments remain unchanged: ${summaries.join("; ")}.`
    : " Existing assignments remain unchanged.";
}

function successMessage(result: ManagedUserMutationResult) {
  return `${grantSummary(result.revokedGrantCount)}${
    result.user.active
      ? ""
      : retainedResponsibilitySummary(result.responsibilities)
  }`;
}

export function UserMutationDialog({
  user,
  manageableRoles,
  isCurrentPageUser,
  onClose
}: UserMutationDialogProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [selectedRole, setSelectedRole] = useState<Role>(user.role);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [error, setError] = useState("");
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  useEffect(() => {
    setSelectedRole(user.role);
    if (conflictVersion !== null && user.version !== conflictVersion) {
      setConflictVersion(null);
      setError(
        "The user changed elsewhere. Latest details are now loaded; choose the change again."
      );
    }
  }, [conflictVersion, user.id, user.role, user.version]);

  const mutation = useMutation({
    mutationFn: (change: UpdateManagedUserInput) =>
      updateManagedUser(user.id, change),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      feedback.success({
        title: "User access updated",
        message: successMessage(result)
      });
      onClose();
    },
    onError: async (failure) => {
      setConfirmingDeactivation(false);
      if (failure instanceof ApiError) {
        if (failure.code === "VERSION_CONFLICT") {
          setSelectedRole(user.role);
          setConflictVersion(user.version);
          setError(failure.message);
          await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
          return;
        }
        if (
          failure.code === "RESPONSIBILITY_REASSIGNMENT_REQUIRED" ||
          failure.code === "SOLE_SUPER_ADMIN_IMMUTABLE"
        ) {
          setError(failure.message);
          return;
        }
      }
      setError("User access could not be updated. Please try again.");
    }
  });

  const interactionBlocked =
    mutation.isPending || conflictVersion !== null || !isCurrentPageUser;
  const displayedError = !isCurrentPageUser
    ? missingCurrentPageMessage
    : error;

  const submitRole = () => {
    if (
      interactionBlocked ||
      selectedRole === user.role ||
      !manageableRoles.includes(selectedRole as ManageableRole)
    ) {
      return;
    }
    setError("");
    mutation.mutate({ version: user.version, role: selectedRole });
  };

  const submitActive = (active: boolean) => {
    if (interactionBlocked || active === user.active) return;
    setError("");
    mutation.mutate({ version: user.version, active });
  };

  if (confirmingDeactivation) {
    return (
      <Dialog
        key="deactivation-confirmation"
        title={`Deactivate ${user.name}?`}
        eyebrow="Confirm account change"
        description="This change takes effect immediately."
        role="alertdialog"
        busy={mutation.isPending}
        onClose={() => setConfirmingDeactivation(false)}
      >
        <div className="admin-user-dialog">
          <p className="admin-user-dialog__warning">
            Project access grants will be revoked immediately. Existing
            assignments remain in place and must be reassigned separately.
          </p>
          <div className="admin-user-dialog__actions">
            <Button
              data-dialog-initial-focus
              variant="quiet"
              disabled={mutation.isPending}
              onClick={() => setConfirmingDeactivation(false)}
            >
              Cancel deactivation
            </Button>
            <Button
              variant="destructive"
              busy={mutation.isPending}
              busyLabel="Deactivating…"
              onClick={() => submitActive(false)}
            >
              Confirm deactivation
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      key="user-mutation"
      title={`Manage ${user.name}`}
      eyebrow="Access administration"
      description="Change one access setting at a time."
      busy={mutation.isPending}
      onClose={onClose}
    >
      <div className="admin-user-dialog">
        <div className="admin-user-dialog__identity">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>

        {displayedError ? (
          <p className="admin-user-dialog__error" role="alert">
            {displayedError}
          </p>
        ) : null}

        <Field
          id={`managed-role-${user.id}`}
          label="Role"
          hint="Only destinations currently allowed by the server are shown."
        >
          {(controlProps) => (
            <Select
              {...controlProps}
              data-dialog-initial-focus
              value={selectedRole}
              disabled={interactionBlocked}
              onChange={(event) => {
                setError("");
                setSelectedRole(event.target.value as ManageableRole);
              }}
            >
              {manageableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="admin-user-dialog__role-action">
          <Button
            busy={mutation.isPending}
            busyLabel="Saving…"
            disabled={
              interactionBlocked ||
              selectedRole === user.role ||
              !manageableRoles.includes(selectedRole as ManageableRole)
            }
            onClick={submitRole}
          >
            Save role
          </Button>
        </div>

        <section
          className="admin-user-dialog__account"
          aria-labelledby={`account-status-${user.id}`}
        >
          <div>
            <h3 id={`account-status-${user.id}`}>Account status</h3>
            <p>
              {user.active
                ? "Active users can sign in and use their current access."
                : "Inactive users cannot sign in."}
            </p>
          </div>
          {user.active ? (
            <Button
              variant="destructive"
              disabled={interactionBlocked}
              onClick={() => {
                setError("");
                setConfirmingDeactivation(true);
              }}
            >
              Deactivate user
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={mutation.isPending}
              busyLabel="Activating…"
              disabled={interactionBlocked}
              onClick={() => submitActive(true)}
            >
              Activate user
            </Button>
          )}
        </section>

        <div className="admin-user-dialog__actions">
          <Button
            variant="quiet"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
