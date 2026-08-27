import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import {
  ROLE_LABELS,
  type Role
} from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  PaginationInput,
  UserInvitationAction,
  UserInvitationDeliveryStatus,
  UserInvitationFilters,
  UserInvitationItem,
  UserInvitationPresentationStatus
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { InvitationActionDialog } from "./InvitationActionDialog";
import { InviteUserDialog } from "./InviteUserDialog";
import {
  getUserInvitations,
  userInvitationKeys
} from "./userInvitationsApi";

const PAGE_SIZE = 20;
const READ = "identity.user_invitations.read";
const CREATE = "identity.user_invitations.create";
const RESEND = "identity.user_invitations.resend";
const REVOKE = "identity.user_invitations.revoke";

const statusOptions: Array<{
  value: UserInvitationPresentationStatus;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "delivery_failed", label: "Delivery Failed" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
  { value: "superseded", label: "Superseded" },
  { value: "accepted", label: "Accepted" }
];

const statusLabels = Object.fromEntries(
  statusOptions.map(({ value, label }) => [value, label])
) as Record<UserInvitationPresentationStatus, string>;

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

export interface UserInvitationsPanelProps {
  actorRole: Role;
  permissions: readonly string[];
}

interface Selection {
  invitation: UserInvitationItem;
  action: UserInvitationAction;
}

function hasPermission(permissions: readonly string[], permission: string) {
  return permissions.includes(permission);
}

function statusTone(status: UserInvitationPresentationStatus) {
  if (status === "accepted") return "success" as const;
  if (status === "delivery_failed" || status === "expired") return "warning" as const;
  if (status === "revoked" || status === "superseded") return "neutral" as const;
  return "info" as const;
}

function deliveryLabel(status: UserInvitationDeliveryStatus): string {
  if (status === "sent") return "Email sent";
  if (status === "queued") return "Email queued";
  return "Email delivery failed";
}

function invitationError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "We couldn't load invitations.";
}

function AuthorizedUserInvitationsPanel({
  permissions
}: Pick<UserInvitationsPanelProps, "permissions">) {
  const [filters, setFilters] = useState<UserInvitationFilters>({});
  const [pagination, setPagination] = useState<PaginationInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const normalizedFilters = useMemo<UserInvitationFilters>(
    () => ({
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {})
    }),
    [filters.role, filters.status]
  );
  const invitationsQuery = useQuery({
    queryKey: userInvitationKeys.page(normalizedFilters, pagination),
    queryFn: () => getUserInvitations(normalizedFilters, pagination),
    placeholderData: keepPreviousData,
    retry: false
  });
  const page = invitationsQuery.data;
  const currentInvitation = selection
    ? page?.items.find((item) => item.id === selection.invitation.id) ?? null
    : null;
  const canCreate = hasPermission(permissions, CREATE);
  const canResend = hasPermission(permissions, RESEND);
  const canRevoke = hasPermission(permissions, REVOKE);

  const setFilter = <Key extends "role" | "status">(
    key: Key,
    value: UserInvitationFilters[Key]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) =>
      current.offset === 0 ? current : { ...current, offset: 0 }
    );
  };

  const actionAllowed = (
    invitation: UserInvitationItem,
    action: UserInvitationAction
  ) =>
    invitation.availableActions.includes(action) &&
    (action === "resend" ? canResend : canRevoke);

  const closeActionDialog = (options?: { focusPanelHeading?: boolean }) => {
    setSelection(null);
    if (options?.focusPanelHeading) {
      window.setTimeout(() => panelHeadingRef.current?.focus(), 0);
    }
  };

  return (
    <Surface
      as="section"
      padding="compact"
      className="user-invitations"
      aria-labelledby="user-invitations-title"
      aria-busy={invitationsQuery.isFetching || undefined}
    >
      <header className="user-invitations__header">
        <div>
          <p className="eyebrow">Secure account setup</p>
          <h2
            ref={panelHeadingRef}
            id="user-invitations-title"
            tabIndex={-1}
          >
            User invitations
          </h2>
          <p>Review invitation history without exposing invitation links.</p>
        </div>
        {canCreate && page ? (
          <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
        ) : null}
      </header>

      <div className="user-invitations__filters" aria-label="Invitation filters">
        <Field id="invitation-role-filter" label="Filter invitations by role">
          {(controlProps) => (
            <Select
              {...controlProps}
              value={filters.role ?? ""}
              onChange={(event) =>
                setFilter("role", (event.target.value || undefined) as UserInvitationFilters["role"])
              }
            >
              <option value="">All roles</option>
              {(page?.invitableRoles ?? []).map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="invitation-status-filter" label="Filter invitations by status">
          {(controlProps) => (
            <Select
              {...controlProps}
              value={filters.status ?? ""}
              onChange={(event) =>
                setFilter(
                  "status",
                  (event.target.value || undefined) as UserInvitationFilters["status"]
                )
              }
            >
              <option value="">All actionable</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {invitationsQuery.isPending ? (
        <PageState state="loading" message="Loading invitations…" />
      ) : invitationsQuery.isError ? (
        <PageState
          state="error"
          message={invitationError(invitationsQuery.error)}
          action={{ label: "Try again", onAction: () => void invitationsQuery.refetch() }}
        />
      ) : !page || page.items.length === 0 ? (
        <PageState state="empty" message="No invitations match these filters." />
      ) : (
        <>
          <div className="access-administration__table-scroll">
            <table className="access-administration__table user-invitations__table">
              <thead>
                <tr>
                  <th scope="col">Invitee</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Invited by</th>
                  <th scope="col">Expires</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>
                      <span className="access-administration__identity">
                        <strong>{invitation.name}</strong>
                        <span>{invitation.email}</span>
                        <small>{invitation.mobile}</small>
                      </span>
                    </td>
                    <td>{ROLE_LABELS[invitation.role]}</td>
                    <td>
                      <StatusBadge
                        tone={statusTone(invitation.status)}
                        label={statusLabels[invitation.status]}
                      />
                      {invitation.status === "pending" && !invitation.currentLinkAvailable ? (
                        <small className="user-invitations__hint">
                          {invitation.availableActions.includes("resend")
                            ? "Current link unavailable—resend"
                            : "This invitation can no longer be resent—revoke it"}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <span>{deliveryLabel(invitation.deliveryStatus)}</span>
                      {invitation.deliveryStatus === "sent" && invitation.sentAt ? (
                        <small>
                          <time dateTime={invitation.sentAt}>{dateTime.format(new Date(invitation.sentAt))}</time>
                        </small>
                      ) : invitation.deliveryAttemptedAt ? (
                        <small>
                          <time dateTime={invitation.deliveryAttemptedAt}>
                            {dateTime.format(new Date(invitation.deliveryAttemptedAt))}
                          </time>
                        </small>
                      ) : null}
                    </td>
                    <td>{invitation.invitedBy.name}</td>
                    <td>
                      <time dateTime={invitation.expiresAt}>
                        {dateTime.format(new Date(invitation.expiresAt))}
                      </time>
                    </td>
                    <td>
                      <div className="user-invitations__actions">
                        {invitation.availableActions.map((action) =>
                          actionAllowed(invitation, action) ? (
                            <Button
                              key={action}
                              size="compact"
                              variant={action === "revoke" ? "quiet" : "secondary"}
                              onClick={() => setSelection({ invitation, action })}
                            >
                              {action === "resend" ? "Resend" : "Revoke"}{" "}
                              <span className="sr-only">{invitation.name}</span>
                            </Button>
                          ) : null
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="access-administration__pagination" aria-label="Invitation pages">
            <p aria-live="polite">
              Showing {page.pagination.offset + 1}–
              {Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of {page.pagination.total}
            </p>
            <div>
              <Button
                size="compact"
                variant="quiet"
                disabled={pagination.offset === 0}
                onClick={() => setPagination((current) => ({
                  ...current,
                  offset: Math.max(0, current.offset - current.limit)
                }))}
              >
                Previous page
              </Button>
              <Button
                size="compact"
                variant="secondary"
                disabled={!page.pagination.hasMore}
                onClick={() => setPagination((current) => ({
                  ...current,
                  offset: current.offset + current.limit
                }))}
              >
                Next page
              </Button>
            </div>
          </nav>
        </>
      )}

      {inviteOpen && page ? (
        <InviteUserDialog roles={page.invitableRoles} onClose={() => setInviteOpen(false)} />
      ) : null}
      {selection ? (
        <InvitationActionDialog
          invitation={selection.invitation}
          currentInvitation={currentInvitation}
          action={selection.action}
          canResend={canResend}
          canRevoke={canRevoke}
          onClose={closeActionDialog}
        />
      ) : null}
    </Surface>
  );
}

export function UserInvitationsPanel({
  actorRole,
  permissions
}: UserInvitationsPanelProps) {
  if (
    actorRole !== "super_admin" ||
    !hasPermission(permissions, READ)
  ) {
    return null;
  }
  return <AuthorizedUserInvitationsPanel permissions={permissions} />;
}
