import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PROJECT_LANGUAGE_OPTIONS, type ProjectLanguage } from "../../../../shared/projects/projectInitiation";

import { isActiveFrontendRole, ROLE_LABELS, type Role } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import type {
  ManagedUserMutationResult,
  UpdateManagedUserInput,
  UserDirectoryItem,
  UserResponsibilityCounts
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { adminUserKeys, updateManagedUser } from "./adminApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import { UserResponsibilitiesPanel } from "./UserResponsibilitiesPanel";
import { normalizeUserLocation, userLocationError } from "./userLocation";
import { normalizeUserLanguages } from "./userLanguages";
import { ProjectLanguageMultiSelect } from "./ProjectLanguageMultiSelect";

export interface UserMutationDialogProps {
  user: UserDirectoryItem;
  manageableRoles: readonly Exclude<Role, "super_admin">[];
  isCurrentPageUser: boolean;
  deletionReady?: boolean;
  onDelete?(): void;
  onClose(): void;
}

type ManageableRole = Exclude<Role, "super_admin">;
type LanguageField = "languagesKnown" | "preferredLanguage";

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
  assignedExecutionProjects: ["execution project remains assigned", "execution projects remain assigned"],
  assignedWorkflowTasks: ["workflow task remains assigned", "workflow tasks remain assigned"],
  ownedActiveTasks: ["active task remains assigned", "active tasks remain assigned"],
  directReports: ["direct report remains assigned", "direct reports remain assigned"],
  linkedClientProjects: [
    "linked client project remains",
    "linked client projects remain"
  ],
  adminInitiatorGrants: [
    "Sales Manager project grant remains recorded",
    "Sales Manager project grants remain recorded"
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
  manageableRoles: serverRoles,
  isCurrentPageUser,
  deletionReady = false,
  onDelete,
  onClose
}: UserMutationDialogProps) {
  const manageableRoles = serverRoles.filter(isActiveFrontendRole);
  const queryClient = useQueryClient();
  const auth = useAuth();
  const feedback = useFeedback();
  const [selectedRole, setSelectedRole] = useState<Role>(user.role);
  const [location, setLocation] = useState(user.location ?? "");
  const [locationError, setLocationError] = useState<string>();
  const locationControl = useRef<HTMLInputElement>(null);
  const [languagesKnown, setLanguagesKnown] = useState(() => normalizeUserLanguages(user.languagesKnown));
  const [preferredLanguage, setPreferredLanguage] = useState<ProjectLanguage | "">(user.preferredLanguage ?? "");
  const [languageErrors, setLanguageErrors] = useState<Partial<Record<LanguageField, string>>>({});
  const languageControls = useRef<Partial<Record<LanguageField, HTMLElement | null>>>({});
  const languageErrorFocus = useRef<LanguageField | undefined>(undefined);
  const savedLanguagesKey = normalizeUserLanguages(user.languagesKnown).join(",");
  const previousUser = useRef({ id: user.id, version: user.version });
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [error, setError] = useState("");
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setSelectedRole(user.role);
    setLocation(user.location ?? "");
    setLocationError(undefined);
    setLanguagesKnown(normalizeUserLanguages(user.languagesKnown));
    setPreferredLanguage(user.preferredLanguage ?? "");
    setLanguageErrors({});
    const refreshedVersion = previousUser.current.id === user.id && previousUser.current.version !== user.version;
    previousUser.current = { id: user.id, version: user.version };
    if ((conflictVersion !== null && user.version !== conflictVersion) || refreshedVersion) {
      setConflictVersion(null);
      setError(
        "The user changed elsewhere. Latest details are now loaded; choose the change again."
      );
    }
  }, [conflictVersion, user.id, user.location, user.role, user.version, savedLanguagesKey, user.preferredLanguage]);

  const mutation = useMutation({
    mutationFn: (change: UpdateManagedUserInput) =>
      updateManagedUser(user.id, change),
    onSuccess: async (result, change) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      feedback.success({
        title: "languagesKnown" in change ? "User languages updated" : "location" in change ? "User location updated" : "User access updated",
        message: "languagesKnown" in change ? "Language preferences saved." : "location" in change
          ? (result.user.location ? "Location saved." : "Location cleared.")
          : successMessage(result)
      });
      onClose();
    },
    onError: async (failure, change) => {
      setConfirmingDeactivation(false);
      if (failure instanceof ApiError) {
        if (failure.code === "NOT_FOUND") {
          setUnavailable(true);
          setError(missingCurrentPageMessage);
          await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
          return;
        }
        if (failure.code === "VERSION_CONFLICT") {
          setSelectedRole(user.role);
          setConflictVersion(user.version);
          setError(failure.message);
          await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
          return;
        }
        if (failure.code === "RESPONSIBILITY_REASSIGNMENT_REQUIRED") {
          setError(failure.message);
          await queryClient.invalidateQueries({ queryKey: adminUserKeys.responsibilities(user.id) });
          return;
        }
        if (failure.code === "SOLE_SUPER_ADMIN_IMMUTABLE") {
          setError(failure.message);
          return;
        }
        if ("location" in change && failure.fields?.location) {
          setLocationError(failure.fields.location);
          locationControl.current?.focus();
          return;
        }
        if ("languagesKnown" in change && failure.fields) {
          const fields: LanguageField[] = ["languagesKnown", "preferredLanguage"];
          const nextErrors: Partial<Record<LanguageField, string>> = {};
          for (const field of fields) if (failure.fields[field]) nextErrors[field] = failure.fields[field];
          if (Object.keys(nextErrors).length) {
            languageErrorFocus.current = fields.find((field) => nextErrors[field]);
            setLanguageErrors(nextErrors);
            return;
          }
        }
      }
      setError("languagesKnown" in change ? "User languages could not be updated. Please try again." : "location" in change
        ? "User location could not be updated. Please try again."
        : "User access could not be updated. Please try again.");
    }
  });

  useEffect(() => {
    if (locationError && !mutation.isPending) locationControl.current?.focus();
  }, [locationError, mutation.isPending]);
  useEffect(() => {
    if (mutation.isPending || !languageErrorFocus.current) return;
    languageControls.current[languageErrorFocus.current]?.focus();
    languageErrorFocus.current = undefined;
  }, [languageErrors, mutation.isPending]);

  const interactionBlocked =
    mutation.isPending || conflictVersion !== null || unavailable || !isCurrentPageUser || user.role === "super_admin";
  const hasRoleChanges = selectedRole !== user.role;
  const hasLocationChanges = normalizeUserLocation(location) !== normalizeUserLocation(user.location ?? "") || Boolean(userLocationError(location));
  const hasLanguageChanges = normalizeUserLanguages(languagesKnown).join(",") !== savedLanguagesKey || preferredLanguage !== (user.preferredLanguage ?? "");
  const hasChanges = hasRoleChanges || hasLocationChanges || hasLanguageChanges;
  const changedSetting = hasLanguageChanges ? "language" : hasLocationChanges ? "location" : "role";
  const deletionBlocked = interactionBlocked || !deletionReady || hasChanges;
  const displayedError = !isCurrentPageUser
    ? missingCurrentPageMessage
    : error;

  const submitRole = () => {
    if (
      interactionBlocked ||
      hasLocationChanges ||
      hasLanguageChanges ||
      selectedRole === user.role ||
      !manageableRoles.includes(selectedRole as ManageableRole)
    ) {
      return;
    }
    setError("");
    mutation.mutate({ version: user.version, role: selectedRole });
  };

  const submitActive = (active: boolean) => {
    if (interactionBlocked || hasChanges || active === user.active) return;
    setError("");
    mutation.mutate({ version: user.version, active });
  };

  const submitLocation = () => {
    if (interactionBlocked || hasRoleChanges || hasLanguageChanges || !hasLocationChanges) return;
    const validationError = userLocationError(location);
    setLocationError(validationError);
    setError("");
    if (validationError) {
      locationControl.current?.focus();
      return;
    }
    mutation.mutate({ version: user.version, location: normalizeUserLocation(location) });
  };

  const submitLanguages = () => {
    if (interactionBlocked || hasRoleChanges || hasLocationChanges || !hasLanguageChanges) return;
    setError("");
    setLanguageErrors({});
    mutation.mutate({ version: user.version, languagesKnown: normalizeUserLanguages(languagesKnown), preferredLanguage: preferredLanguage || null });
  };

  if (confirmingDeactivation) {
    return (
      <Dialog
        tone="danger"
        key="deactivation-confirmation"
        title={`Deactivate ${user.name}?`}
        eyebrow="Confirm account change"
        description="This change takes effect immediately."
        role="alertdialog"
        busy={mutation.isPending}
        onClose={() => setConfirmingDeactivation(false)}
      >
        <div className="admin-user-dialog ui-dialog__form">
          <div className="ui-dialog__body">
            <p className="admin-user-dialog__warning">
              Project access grants will be revoked immediately. Existing
              assignments remain in place and must be reassigned separately.
            </p>
          </div>
          <div className="admin-user-dialog__actions ui-dialog__actions">
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
    <ContextPanel
      key="user-mutation"
      dirty={hasChanges}
      className="administration-context-panel"
      footer={({ requestClose }) => (
        <div className="admin-user-dialog__actions">
          <Button
            variant="destructive-outline"
            disabled={mutation.isPending}
            onClick={requestClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={`managed-location-form-${user.id}`}
            busy={mutation.isPending && mutation.variables?.location !== undefined}
            busyLabel="Saving…"
            disabled={interactionBlocked || hasRoleChanges || hasLanguageChanges || !hasLocationChanges}
          >
            Save location
          </Button>
          <Button
            type="submit"
            form={`managed-languages-form-${user.id}`}
            busy={mutation.isPending && mutation.variables?.languagesKnown !== undefined}
            busyLabel="Saving…"
            disabled={interactionBlocked || hasRoleChanges || hasLocationChanges || !hasLanguageChanges}
          >
            Save languages
          </Button>
          <Button
            busy={mutation.isPending && mutation.variables?.role !== undefined}
            busyLabel="Saving…"
            disabled={
              interactionBlocked ||
              hasLocationChanges ||
              hasLanguageChanges ||
              selectedRole === user.role ||
              !manageableRoles.includes(selectedRole as ManageableRole)
            }
            onClick={submitRole}
          >
            Save role
          </Button>
        </div>
      )}
      title={`Manage ${user.name}`}
      eyebrow="Access administration"
      description="Update location, languages, or one access setting at a time."
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
              value={manageableRoles.includes(selectedRole as ManageableRole) ? selectedRole : ""}
              disabled={interactionBlocked || hasLocationChanges || hasLanguageChanges}
              onChange={(event) => {
                setError("");
                setSelectedRole(event.target.value as ManageableRole);
              }}
            >
              {!manageableRoles.includes(selectedRole as ManageableRole) ? <option value="" disabled>Choose an active role</option> : null}
              {manageableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <form id={`managed-location-form-${user.id}`} onSubmit={(event) => {
          event.preventDefault();
          submitLocation();
        }} noValidate>
          <Field id={`managed-location-${user.id}`} label="Location" hint="City or area" error={locationError}>
            {(controlProps) => (
              <Input
                {...controlProps}
                ref={locationControl}
                autoComplete="address-level2"
                value={location}
                disabled={interactionBlocked || hasRoleChanges || hasLanguageChanges}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setLocationError(undefined);
                  setError("");
                }}
              />
            )}
          </Field>
        </form>
        <form id={`managed-languages-form-${user.id}`} className="admin-user-dialog__language-form" onSubmit={(event) => {
          event.preventDefault();
          submitLanguages();
        }} noValidate>
          <Field id={`managed-languages-known-${user.id}`} label="Known languages" error={languageErrors.languagesKnown}>
            {(controlProps) => (
              <ProjectLanguageMultiSelect
                {...controlProps}
                value={languagesKnown}
                disabled={interactionBlocked || hasRoleChanges || hasLocationChanges}
                inputRef={(element) => { languageControls.current.languagesKnown = element; }}
                onChange={(value) => {
                  setLanguagesKnown(value);
                  setLanguageErrors((current) => ({ ...current, languagesKnown: undefined }));
                  setError("");
                }}
              />
            )}
          </Field>
          <Field id={`managed-preferred-language-${user.id}`} label="Preferred language" error={languageErrors.preferredLanguage}>
            {(controlProps) => (
              <Select
                {...controlProps}
                value={preferredLanguage}
                disabled={interactionBlocked || hasRoleChanges || hasLocationChanges}
                ref={(element) => { languageControls.current.preferredLanguage = element; }}
                onChange={(event) => {
                  setPreferredLanguage(event.target.value as ProjectLanguage | "");
                  setLanguageErrors((current) => ({ ...current, preferredLanguage: undefined }));
                  setError("");
                }}
              >
                <option value="">Not set</option>
                {PROJECT_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            )}
          </Field>
        </form>
        {hasChanges ? <p className="text-muted">Save or cancel the {changedSetting} change before making another change.</p> : null}
        <UserResponsibilitiesPanel user={user} destinationRole={selectedRole}
          enabled={isCurrentPageUser}
          canReadProjects={hasFrontendPermission(auth.authorization, "projects.read")} />
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
              disabled={interactionBlocked || hasChanges}
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
              busy={mutation.isPending && mutation.variables?.active === true}
              busyLabel="Activating…"
              disabled={interactionBlocked || hasChanges}
              onClick={() => submitActive(true)}
            >
              Activate user
            </Button>
          )}
        </section>
        {onDelete && user.role !== "super_admin" ? (
          <section
            className="admin-user-dialog__account"
            aria-labelledby={`account-deletion-${user.id}`}
          >
            <div>
              <h3 id={`account-deletion-${user.id}`}>Delete account</h3>
              <p>Remove this user from the list and revoke access. Work history is kept.</p>
              {hasChanges ? (
                <p id={`account-deletion-blocked-${user.id}`}>Save or cancel the {changedSetting} change before deleting.</p>
              ) : null}
            </div>
            <Button
              variant="destructive-outline"
              disabled={deletionBlocked}
              aria-describedby={hasChanges ? `account-deletion-blocked-${user.id}` : undefined}
              onClick={() => {
                if (!deletionBlocked) onDelete();
              }}
            >
              Delete user
            </Button>
          </section>
        ) : null}
      </div>
    </ContextPanel>
  );
}
