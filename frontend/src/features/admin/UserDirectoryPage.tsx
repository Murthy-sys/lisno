import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { ROLE_LABELS, type Role } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  PaginationInput,
  UserDirectoryItem,
  UserDirectoryFilters,
  UserDirectorySummary
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { MetricCard } from "../../components/ui/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { adminUserKeys, getManagedUsers } from "./adminApi";
import { UserInvitationsPanel } from "./UserInvitationsPanel";
import { UserMutationDialog } from "./UserMutationDialog";
import { UserDeletionDialog } from "./UserDeletionDialog";

const PAGE_SIZE = 20;

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

/**
 * Table cells carry the compact date only; the ContextPanel keeps the
 * full-precision `dateTime` formatter above.
 */
const dateOnly = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

function requestErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "We couldn't load the user directory.";
}

/**
 * Presentation only. Never used as a key, a join value or an accessible name —
 * the avatar that renders this is `aria-hidden`.
 */
function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
}

export function UserDirectoryPage() {
  const auth = useAuth();
  const [filters, setFilters] = useState<UserDirectoryFilters>({});
  const [pagination, setPagination] = useState<PaginationInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const [selectedUser, setSelectedUser] = useState<UserDirectoryItem | null>(null);
  const [summaryUserId, setSummaryUserId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserDirectoryItem | null>(null);
  const [deletedUserIds, setDeletedUserIds] = useState<ReadonlySet<string>>(new Set());
  const [deletionRefreshing, setDeletionRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const canDelete = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "identity.users.delete");

  const normalizedFilters = useMemo<UserDirectoryFilters>(
    () => ({
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.active === undefined ? {} : { active: filters.active })
    }),
    [filters]
  );

  const usersQuery = useQuery({
    queryKey: adminUserKeys.page(normalizedFilters, pagination),
    queryFn: () => getManagedUsers(normalizedFilters, pagination),
    placeholderData: keepPreviousData
  });

  const resetOffset = () => {
    setPagination((current) =>
      current.offset === 0 ? current : { ...current, offset: 0 }
    );
  };

  const currentPageUser = usersQuery.data?.items.find(
    (user) => user.id === selectedUser?.id
  );
  const pageData = usersQuery.data;
  const directoryRows = pageData?.items.filter((item) => !deletedUserIds.has(item.id)) ?? [];
  const directoryReady = !usersQuery.isFetching && !usersQuery.isError && !usersQuery.isPlaceholderData && !deletionRefreshing;
  const currentDeletionUser = directoryRows.find((item) => item.id === deletingUser?.id);
  const showCounts = directoryReady;
  /**
   * The contract types `summary` as required, but an older or partial response
   * can still omit it at runtime. Widening to `| undefined` here keeps the
   * guard below honest instead of trusting the declared type.
   */
  const directorySummary: UserDirectorySummary | undefined = pageData?.summary;
  const summaryUser = !usersQuery.isError && !usersQuery.isPlaceholderData
    ? pageData?.items.find((user) => user.id === summaryUserId)
    : undefined;

  useEffect(() => {
    if (!currentPageUser) return;
    setSelectedUser((current) =>
      current && current.id === currentPageUser.id && current !== currentPageUser
        ? currentPageUser
        : current
    );
  }, [currentPageUser]);

  useEffect(() => {
    if (!directoryReady || !pageData || pagination.offset === 0) return;
    if (pagination.offset >= pageData.pagination.total) {
      setPagination((current) => ({ ...current, offset: Math.max(0, Math.ceil(pageData.pagination.total / current.limit) - 1) * current.limit }));
    }
  }, [directoryReady, pageData, pagination.offset]);

  return (
    <section
      className="access-administration"
      aria-labelledby="user-administration-title"
    >
      <PageHeader
        id="user-administration-title"
        eyebrow="Identity and access"
        title="User administration"
        description="Review redacted account details and change one access setting at a time."
        metadata={
          pageData && showCounts ? (
            <StatusBadge
              tone="info"
              label={`${pageData.pagination.total} visible user${
                pageData.pagination.total === 1 ? "" : "s"
              }`}
            />
          ) : undefined
        }
      />

      {directorySummary && showCounts ? (
        <div className="access-administration__metrics">
          <MetricCard label="Total users" value={directorySummary.total} />
          <MetricCard label="Active users" value={directorySummary.active} />
          <MetricCard label="Inactive users" value={directorySummary.inactive} />
          <MetricCard label="Different roles" value={directorySummary.roleCount} />
        </div>
      ) : null}

      <Surface
        as="section"
        padding="compact"
        className="access-administration__filters"
        aria-label="Directory filters"
      >
        <Field id="admin-user-search" label="Search users">
          {(controlProps) => (
            <Input
              {...controlProps}
              ref={searchRef}
              type="search"
              value={filters.search ?? ""}
              placeholder="Name or email"
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  search: event.target.value || undefined
                }));
                resetOffset();
              }}
            />
          )}
        </Field>

        <Field id="admin-user-role-filter" label="Filter by role">
          {(controlProps) => (
            <Select
              {...controlProps}
              value={filters.role ?? ""}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  role: (event.target.value || undefined) as Role | undefined
                }));
                resetOffset();
              }}
            >
              <option value="">All roles</option>
              {(pageData?.filterRoles ?? []).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="admin-user-active-filter" label="Filter by account status">
          {(controlProps) => (
            <Select
              {...controlProps}
              value={
                filters.active === undefined ? "" : String(filters.active)
              }
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({
                  ...current,
                  active: value === "" ? undefined : value === "true"
                }));
                resetOffset();
              }}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          )}
        </Field>
      </Surface>

      {usersQuery.isPending ? (
        <PageState state="loading" message="Loading the user directory…" />
      ) : usersQuery.isError ? (
        <PageState
          state="error"
          message={deletedUserIds.size > 0 ? "User deleted. The directory could not be refreshed. Refresh to see current users and totals." : requestErrorMessage(usersQuery.error)}
          action={{ label: "Try again", onAction: () => void usersQuery.refetch() }}
        />
      ) : deletionRefreshing ? (
        <PageState state="loading" message="Refreshing the user directory…" />
      ) : !pageData || directoryRows.length === 0 ? (
        <PageState state="empty" message="No users match these filters." />
      ) : (
        <Surface
          as="section"
          padding="compact"
          className="access-administration__directory"
          aria-label="User directory"
          aria-busy={usersQuery.isFetching || undefined}
        >
          <div className="access-administration__table-scroll" role="region" aria-label="User directory records" tabIndex={0}>
            <table className="access-administration__table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {directoryRows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="access-administration__identity">
                        <span className="access-administration__avatar" aria-hidden="true">
                          {initialsOf(user.name)}
                        </span>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                        {user.title ? <small>{user.title}</small> : null}
                      </span>
                    </td>
                    <td>
                      <span className="access-administration__role-chip">
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        tone={user.active ? "success" : "neutral"}
                        label={user.active ? "Active" : "Inactive"}
                      />
                    </td>
                    <td>
                      <time dateTime={user.createdAt}>
                        {dateOnly.format(new Date(user.createdAt))}
                      </time>
                    </td>
                    <td>
                      <time dateTime={user.updatedAt}>
                        {dateOnly.format(new Date(user.updatedAt))}
                      </time>
                    </td>
                    <td>
                      <div className="access-requests__row-actions">
                      <Button size="compact" variant="quiet" disabled={usersQuery.isPlaceholderData} onClick={() => setSummaryUserId(user.id)}>
                        Details <span className="sr-only">{user.name}</span>
                      </Button>
                      {user.role === "super_admin" ? null : (
                        <Button
                          size="compact"
                          variant="secondary"
                          onClick={() => setSelectedUser(user)}
                        >
                          Manage <span className="sr-only">{user.name}</span>
                        </Button>
                      )}
                      {canDelete && user.role !== "super_admin" ? (
                        <Button size="compact" variant="destructive-outline" disabled={!directoryReady} onClick={() => setDeletingUser(user)}>
                          Delete <span className="sr-only">{user.name}</span>
                        </Button>
                      ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            className="access-administration__pagination"
            aria-label="User directory pages"
          >
            {showCounts ? <p aria-live="polite">
              Showing {pageData.pagination.offset + 1}–
              {Math.min(
                pageData.pagination.offset + directoryRows.length,
                pageData.pagination.total
              )} of {pageData.pagination.total}
            </p> : null}
            <span className="access-administration__page-indicator">
              Page{" "}
              {Math.floor(
                pageData.pagination.offset /
                  (pageData.pagination.limit || PAGE_SIZE)
              ) + 1}
            </span>
            <div>
              <Button
                size="compact"
                variant="quiet"
                disabled={pagination.offset === 0}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    offset: Math.max(0, current.offset - current.limit)
                  }))
                }
              >
                Previous page
              </Button>
              <Button
                size="compact"
                variant="secondary"
                disabled={!pageData.pagination.hasMore}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    offset: current.offset + current.limit
                  }))
                }
              >
                Next page
              </Button>
            </div>
          </nav>
        </Surface>
      )}

      {auth.user && auth.authorization ? (
        <UserInvitationsPanel
          actorRole={auth.user.role}
          permissions={auth.authorization.permissions}
        />
      ) : null}

      {selectedUser && selectedUser.role !== "super_admin" && pageData ? (
        <UserMutationDialog
          user={selectedUser}
          manageableRoles={pageData.manageableRoles}
          isCurrentPageUser={Boolean(currentPageUser) && !deletedUserIds.has(selectedUser.id) && !usersQuery.isError && !usersQuery.isPlaceholderData}
          deletionReady={directoryReady && currentPageUser?.version === selectedUser.version}
          onDelete={canDelete ? () => {
            if (!directoryReady || !currentPageUser || currentPageUser.version !== selectedUser.version || currentPageUser.role === "super_admin") return;
            setSelectedUser(null);
            setSummaryUserId(null);
            setDeletingUser(currentPageUser);
          } : undefined}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
      {deletingUser ? (
        <UserDeletionDialog
          key={deletingUser.id}
          user={deletingUser}
          currentUser={currentDeletionUser}
          directoryReady={directoryReady && canDelete}
          refreshing={usersQuery.isFetching}
          fallbackFocusRef={searchRef}
          onRefresh={() => usersQuery.refetch()}
          onClose={() => setDeletingUser(null)}
          onDeleted={({ userId }) => {
            setDeletedUserIds((current) => new Set([...current, userId]));
            setDeletionRefreshing(true);
            setDeletingUser(null);
            setSelectedUser((current) => current?.id === userId ? null : current);
            setSummaryUserId((current) => current === userId ? null : current);
            if (directoryRows.length === 1 && pagination.offset > 0) {
              setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }));
            }
          }}
          onRefreshFinished={() => setDeletionRefreshing(false)}
        />
      ) : null}
      {summaryUserId ? (
        <ContextPanel key={summaryUserId} title={summaryUser?.name ?? "User details"} eyebrow="Directory record" className="administration-context-panel" onClose={() => setSummaryUserId(null)}>
          {summaryUser ? (
            <dl className="administration-summary">
              <div><dt>Email</dt><dd>{summaryUser.email}</dd></div>
              <div><dt>Role</dt><dd>{ROLE_LABELS[summaryUser.role]}</dd></div>
              {summaryUser.title ? <div><dt>Title</dt><dd>{summaryUser.title}</dd></div> : null}
              <div><dt>Status</dt><dd>{summaryUser.active ? "Active" : "Inactive"}</dd></div>
              <div><dt>Created</dt><dd>{dateTime.format(new Date(summaryUser.createdAt))}</dd></div>
              <div><dt>Updated</dt><dd>{dateTime.format(new Date(summaryUser.updatedAt))}</dd></div>
              <div><dt>User ID</dt><dd>{summaryUser.id}</dd></div>
            </dl>
          ) : <PageState state="empty" message="This user is no longer available in the current directory view." />}
        </ContextPanel>
      ) : null}
    </section>
  );
}
