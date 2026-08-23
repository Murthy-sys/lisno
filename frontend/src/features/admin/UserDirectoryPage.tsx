import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ROLE_LABELS, type Role } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  PaginationInput,
  UserDirectoryItem,
  UserDirectoryFilters
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { adminUserKeys, getManagedUsers } from "./adminApi";
import { UserMutationDialog } from "./UserMutationDialog";

const PAGE_SIZE = 20;

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

function requestErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "We couldn't load the user directory.";
}

export function UserDirectoryPage() {
  const [filters, setFilters] = useState<UserDirectoryFilters>({});
  const [pagination, setPagination] = useState<PaginationInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const [selectedUser, setSelectedUser] = useState<UserDirectoryItem | null>(null);

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

  useEffect(() => {
    if (!currentPageUser) return;
    setSelectedUser((current) =>
      current && current.id === currentPageUser.id && current !== currentPageUser
        ? currentPageUser
        : current
    );
  }, [currentPageUser]);

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
          pageData ? (
            <StatusBadge
              tone="info"
              label={`${pageData.pagination.total} visible user${
                pageData.pagination.total === 1 ? "" : "s"
              }`}
            />
          ) : undefined
        }
      />

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
          message={requestErrorMessage(usersQuery.error)}
          action={{ label: "Try again", onAction: () => void usersQuery.refetch() }}
        />
      ) : !pageData || pageData.items.length === 0 ? (
        <PageState state="empty" message="No users match these filters." />
      ) : (
        <Surface
          as="section"
          padding="compact"
          className="access-administration__directory"
          aria-label="User directory"
          aria-busy={usersQuery.isFetching || undefined}
        >
          <div className="access-administration__table-scroll">
            <table className="access-administration__table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Updated</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="access-administration__identity">
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                        {user.title ? <small>{user.title}</small> : null}
                      </span>
                    </td>
                    <td>{ROLE_LABELS[user.role]}</td>
                    <td>
                      <StatusBadge
                        tone={user.active ? "success" : "neutral"}
                        label={user.active ? "Active" : "Inactive"}
                      />
                    </td>
                    <td>
                      <time dateTime={user.createdAt}>
                        {dateTime.format(new Date(user.createdAt))}
                      </time>
                    </td>
                    <td>
                      <time dateTime={user.updatedAt}>
                        {dateTime.format(new Date(user.updatedAt))}
                      </time>
                    </td>
                    <td>
                      {user.role === "super_admin" ? null : (
                        <Button
                          size="compact"
                          variant="secondary"
                          onClick={() => setSelectedUser(user)}
                        >
                          Manage <span className="sr-only">{user.name}</span>
                        </Button>
                      )}
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
            <p aria-live="polite">
              Showing {pageData.pagination.offset + 1}–
              {Math.min(
                pageData.pagination.offset + pageData.items.length,
                pageData.pagination.total
              )} of {pageData.pagination.total}
            </p>
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

      {selectedUser && selectedUser.role !== "super_admin" && pageData ? (
        <UserMutationDialog
          user={selectedUser}
          manageableRoles={pageData.manageableRoles}
          isCurrentPageUser={Boolean(currentPageUser)}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
    </section>
  );
}
