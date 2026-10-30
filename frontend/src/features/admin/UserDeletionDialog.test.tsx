import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ROLE_CODES } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { UserDirectoryItem, UserDirectoryPage, UserResponsibilityCounts } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { ownAccessRequestKeys, reviewAccessRequestKeys } from "../access/accessRequestsApi";
import { executionKeys } from "../execution/executionApi";
import { vendorLoginAccessKeys } from "../procurement/vendorLoginAccessApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { adminUserKeys } from "./adminApi";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import { userInvitationKeys } from "./userInvitationsApi";

const actor = { id: "super-admin", name: "Sana Admin", email: "sana@example.test", role: "super_admin" as const };
const dates = { createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" };
const protectedUser: UserDirectoryItem = { ...actor, ...dates, active: true, version: 1 };
const staff: UserDirectoryItem = { id: "staff-a", name: "Arun Designer", email: "arun@example.test", role: "designer", active: true, version: 3, ...dates };
const vendor: UserDirectoryItem = { id: "vendor-b", name: "Nia Vendor", email: "nia@example.test", role: "vendor", active: false, version: 6, ...dates };
const deletion = (user = vendor) => ({ data: { userId: user.id, deletedAt: "2026-10-30T12:00:00.000Z", version: user.version + 1 } });
const noResponsibilities: UserResponsibilityCounts = {
  ownedActiveLeads: 0, ownedActiveEstimates: 0, initiatedActiveProjects: 0,
  assignedActiveProjects: 0, managedActiveProjects: 0, assignedExecutionProjects: 0,
  assignedWorkflowTasks: 0, ownedActiveTasks: 0, directReports: 0,
  linkedClientProjects: 0, adminInitiatorGrants: 0
};

function setupSession(canDelete = true) {
  tokenStorage.set("synthetic-admin-token");
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: actor })),
    http.get("/api/v1/auth/authorization", () => HttpResponse.json({ data: authorizationFor("super_admin", [
      "identity.self.read", "identity.authorization.read", "identity.users.read", "identity.users.update",
      ...(canDelete ? ["identity.users.delete" as const] : [])
    ]) }))
  );
}
function directory(items: UserDirectoryItem[], offset = 0, total = items.length): UserDirectoryPage {
  return {
    items, pagination: { limit: 20, offset, total, hasMore: offset + items.length < total },
    summary: { total, active: items.filter((row) => row.active).length, inactive: items.filter((row) => !row.active).length, roleCount: new Set(items.map((row) => row.role)).size },
    filterRoles: [...ROLE_CODES], manageableRoles: ["designer", "client"]
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function openDelete(name = vendor.name) {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: `Delete ${name}` });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog", { name: `Delete ${name}?` });
  return { user, trigger, dialog };
}
async function openManage(name = vendor.name) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: `Manage ${name}` }));
  const dialog = await screen.findByRole("dialog", { name: `Manage ${name}` });
  return { user, dialog };
}

describe("User deletion", () => {
  it("offers active and inactive user deletion but protects the Super Admin row", async () => {
    setupSession();
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([protectedUser, staff, vendor]) })));
    renderApp(["/admin/users"]);
    expect(await screen.findByRole("button", { name: `Delete ${staff.name}` })).toBeEnabled();
    expect(screen.getByRole("button", { name: `Delete ${vendor.name}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: `Delete ${actor.name}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Manage ${actor.name}` })).not.toBeInTheDocument();
  });

  it("does not show Delete without the deletion permission", async () => {
    setupSession(false);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([staff, vendor]) })));
    renderApp(["/admin/users"]);
    await screen.findByRole("button", { name: `Manage ${staff.name}` });
    expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    const { dialog } = await openManage(staff.name);
    expect(within(dialog).queryByRole("button", { name: "Delete user" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Deactivate user" })).toBeEnabled();
  });

  it.each([staff, vendor])("opens the shared Delete confirmation from Manage for $role and preserves status controls", async (target) => {
    setupSession();
    let removed = false;
    const bodies: unknown[] = [];
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory(removed ? [protectedUser] : [protectedUser, target]) })),
      http.delete(`/api/v1/admin/users/${target.id}`, async ({ request }) => {
        bodies.push(await request.json()); removed = true; return HttpResponse.json(deletion(target));
      })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openManage(target.name);
    expect(within(dialog).getByRole("button", { name: target.active ? "Deactivate user" : "Activate user" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    let confirmation = await screen.findByRole("alertdialog", { name: `Delete ${target.name}?` });
    expect(screen.queryByRole("dialog", { name: `Manage ${target.name}` })).not.toBeInTheDocument();
    expect(within(confirmation).getByText(target.email)).toBeVisible();
    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: `Manage ${target.name}` })).toHaveFocus());
    expect(bodies).toEqual([]);
    const reopened = await openManage(target.name);
    await user.click(within(reopened.dialog).getByRole("button", { name: "Delete user" }));
    confirmation = await screen.findByRole("alertdialog", { name: `Delete ${target.name}?` });
    await user.click(within(confirmation).getByRole("button", { name: "Delete user" }));
    await screen.findByText("User deleted");
    await screen.findByText("1 visible user");
    expect(screen.queryByText(target.email)).not.toBeInTheDocument();
    expect(bodies).toEqual([{ version: target.version }]);
  });

  it("preserves unsaved role changes and blocks Delete while a role update is pending", async () => {
    setupSession();
    const response = deferred<Response>();
    let writes = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([staff]) })),
      http.patch(`/api/v1/admin/users/${staff.id}`, () => { writes += 1; return response.promise; })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openManage(staff.name);
    const remove = within(dialog).getByRole("button", { name: "Delete user" });
    const role = within(dialog).getByRole("combobox", { name: "Role" });
    await user.selectOptions(role, "client");
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription("Save or cancel the role change before deleting.");
    await user.click(remove);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(role).toHaveValue("client");
    await user.selectOptions(role, "designer");
    expect(remove).toBeEnabled();
    await user.selectOptions(role, "client");
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(writes).toBe(1));
    expect(remove).toBeDisabled();
    expect(role).toBeDisabled();
    response.resolve(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again." } }, { status: 503 }));
    await within(dialog).findByText("User access could not be updated. Please try again.");
  });

  it("blocks Delete while activation is pending and retains the separate activation action", async () => {
    setupSession();
    const response = deferred<Response>();
    let body: unknown;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([vendor]) })),
      http.patch(`/api/v1/admin/users/${vendor.id}`, async ({ request }) => { body = await request.json(); return response.promise; })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openManage();
    await user.click(within(dialog).getByRole("button", { name: "Activate user" }));
    await waitFor(() => expect(body).toEqual({ version: vendor.version, active: true }));
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    response.resolve(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again." } }, { status: 503 }));
    await within(dialog).findByText("User access could not be updated. Please try again.");
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeEnabled();
  });

  it("keeps deactivation available without removing the account when Delete is also permitted", async () => {
    setupSession();
    let current = staff;
    let patchBody: unknown;
    let deletes = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([current]) })),
      http.patch(`/api/v1/admin/users/${staff.id}`, async ({ request }) => {
        patchBody = await request.json(); current = { ...staff, active: false, version: staff.version + 1 };
        return HttpResponse.json({ data: { user: current, revokedGrantCount: 0, responsibilities: noResponsibilities } });
      }),
      http.delete(`/api/v1/admin/users/${staff.id}`, () => { deletes += 1; return HttpResponse.json(deletion(staff)); })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openManage(staff.name);
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Deactivate user" }));
    const confirmation = await screen.findByRole("alertdialog", { name: `Deactivate ${staff.name}?` });
    expect(within(confirmation).queryByRole("button", { name: "Delete user" })).not.toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "Confirm deactivation" }));
    await screen.findByText("User access updated");
    expect(patchBody).toEqual({ version: staff.version, active: false });
    expect(screen.getByText(staff.email)).toBeVisible();
    expect(screen.getByText("1 visible user")).toBeVisible();
    expect(deletes).toBe(0);
    const reopened = await openManage(staff.name);
    expect(within(reopened.dialog).getByRole("button", { name: "Activate user" })).toBeEnabled();
    expect(within(reopened.dialog).getByRole("button", { name: "Delete user" })).toBeEnabled();
  });

  it("blocks the Manage Delete entry while directory details refresh and after refresh failure", async () => {
    setupSession();
    const response = deferred<Response>();
    let reads = 0;
    server.use(http.get("/api/v1/admin/users", () => ++reads === 1
      ? HttpResponse.json({ data: directory([vendor]) })
      : response.promise));
    const { queryClient } = renderApp(["/admin/users"]);
    const { dialog } = await openManage();
    const remove = within(dialog).getByRole("button", { name: "Delete user" });
    expect(remove).toBeEnabled();
    act(() => { void queryClient.invalidateQueries({ queryKey: adminUserKeys.all }); });
    await waitFor(() => expect(remove).toBeDisabled());
    response.resolve(HttpResponse.json({ error: { code: "READ_FAILED", message: "Refresh failed." } }, { status: 503 }));
    await within(dialog).findByText(/This user is no longer in the current directory view/);
    expect(remove).toBeDisabled();
  });

  it("does not switch to Delete while a role version conflict remains unresolved", async () => {
    setupSession();
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([staff]) })),
      http.patch(`/api/v1/admin/users/${staff.id}`, () => HttpResponse.json({
        error: { code: "VERSION_CONFLICT", message: "The user changed elsewhere." }
      }, { status: 409 }))
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openManage(staff.name);
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Role" }), "client");
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));
    await within(dialog).findByText("The user changed elsewhere.");
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveValue("designer");
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows the correct identity, initially focuses Cancel, traps focus and cancels without deleting", async () => {
    setupSession();
    let writes = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([staff, vendor]) })),
      http.delete("/api/v1/admin/users/:id", () => { writes += 1; return HttpResponse.json(deletion()); })
    );
    renderApp(["/admin/users"]);
    const { user, trigger, dialog } = await openDelete();
    expect(within(dialog).getByText(vendor.email)).toBeVisible();
    expect(dialog).toHaveAccessibleDescription(/Existing work and history will be kept/);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toHaveFocus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(writes).toBe(0);
  });

  it("removes a deleted row, refreshes server totals and invalidates affected access caches", async () => {
    setupSession();
    let items = [protectedUser, staff, vendor];
    const bodies: unknown[] = [];
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory(items) })),
      http.delete(`/api/v1/admin/users/${vendor.id}`, async ({ request }) => {
        bodies.push(await request.json()); items = [protectedUser, staff]; return HttpResponse.json(deletion());
      })
    );
    const { queryClient } = renderApp(["/admin/users"]);
    const inactivePageKey = adminUserKeys.page({ active: false }, { limit: 20, offset: 0 });
    queryClient.setQueryData(inactivePageKey, directory([vendor]));
    const keys = [dashboardKeys.all, adminProjectKeys.all, vendorLoginAccessKeys.all, executionKeys.all, userInvitationKeys.all, ownAccessRequestKeys.all, reviewAccessRequestKeys.all, projectWorkflowKeys.all, ["project-chat", "session-scope", "project", "project-a", "participant-options"]];
    for (const key of keys) queryClient.setQueryData([...key, "cached"], {});
    const { user, dialog } = await openDelete();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    await screen.findByText("User deleted");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await screen.findByText("2 visible users");
    expect(screen.queryByText(vendor.email)).not.toBeInTheDocument();
    expect(screen.getByText(staff.email)).toBeVisible();
    expect(bodies).toEqual([{ version: 6 }]);
    expect(queryClient.getQueryData<UserDirectoryPage>(inactivePageKey)?.items).toEqual([]);
    for (const key of keys) expect(queryClient.getQueryState([...key, "cached"])?.isInvalidated).toBe(true);
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search users" })).toHaveFocus());
  });

  it("blocks duplicate submission and closing while deletion is pending", async () => {
    setupSession();
    let writes = 0;
    const response = deferred<Response>();
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([vendor]) })),
      http.delete(`/api/v1/admin/users/${vendor.id}`, () => { writes += 1; return response.promise; })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openDelete();
    const confirm = within(dialog).getByRole("button", { name: "Delete user" });
    await user.dblClick(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(writes).toBe(1);
    response.resolve(HttpResponse.json({ error: { code: "CONFLICT", message: "Try deleting again." } }, { status: 409 }));
    await screen.findByText("Try deleting again.");
  });

  it("preserves the user and allows retry after a failed deletion", async () => {
    setupSession();
    let writes = 0;
    let removed = false;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory(removed ? [] : [vendor]) })),
      http.delete(`/api/v1/admin/users/${vendor.id}`, () => {
        writes += 1;
        if (writes === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Deletion is temporarily unavailable." } }, { status: 503 });
        removed = true; return HttpResponse.json(deletion());
      })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openDelete();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    await screen.findByText("Deletion is temporarily unavailable.");
    expect(within(dialog).getByText(vendor.email)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    await screen.findByText("No users match these filters.");
    expect(writes).toBe(2);
  });

  it("requires reviewing the refreshed identity and confirming again after a version conflict", async () => {
    setupSession();
    let row = staff;
    let removed = false;
    const versions: number[] = [];
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory(removed ? [] : [row]) })),
      http.delete(`/api/v1/admin/users/${staff.id}`, async ({ request }) => {
        const body = await request.json() as { version: number }; versions.push(body.version);
        if (versions.length === 1) {
          row = { ...staff, name: "Arun Updated", version: 5 };
          return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "The user changed elsewhere." } }, { status: 409 });
        }
        removed = true; return HttpResponse.json(deletion(row));
      })
    );
    renderApp(["/admin/users"]);
    const { user, dialog } = await openDelete(staff.name);
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    const review = await screen.findByRole("button", { name: "Review latest details" });
    expect(versions).toEqual([3]);
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled();
    await user.click(review);
    const updated = screen.getByRole("alertdialog", { name: "Delete Arun Updated?" });
    expect(versions).toEqual([3]);
    await user.click(within(updated).getByRole("button", { name: "Delete user" }));
    await screen.findByText("User deleted");
    expect(versions).toEqual([3, 5]);
  });

  it("blocks an open confirmation when the row changes or disappears in the directory", async () => {
    setupSession();
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json({ data: directory([vendor]) })));
    const { queryClient } = renderApp(["/admin/users"]);
    const { dialog } = await openDelete();
    act(() => queryClient.setQueryData(adminUserKeys.page({}, { limit: 20, offset: 0 }), directory([{ ...vendor, version: 7 }])));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Review latest details" })).toBeVisible();
    act(() => queryClient.setQueryData(adminUserKeys.page({}, { limit: 20, offset: 0 }), directory([])));
    expect(await screen.findByText(/This user is no longer in the current directory view/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled();
  });

  it("blocks confirmation during a background refresh and after a refetch error", async () => {
    setupSession();
    let reads = 0;
    const pending = deferred<Response>();
    server.use(http.get("/api/v1/admin/users", () => {
      reads += 1;
      return reads === 1 ? HttpResponse.json({ data: directory([vendor]) }) : pending.promise;
    }));
    const { queryClient } = renderApp(["/admin/users"]);
    const { dialog } = await openDelete();
    act(() => { void queryClient.invalidateQueries({ queryKey: adminUserKeys.all }); });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled());
    pending.resolve(HttpResponse.json({ error: { code: "READ_FAILED", message: "Refresh failed." } }, { status: 503 }));
    await screen.findByText("Refresh failed.");
    expect(within(dialog).getByRole("button", { name: "Delete user" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Refresh directory" })).toBeEnabled();
  });

  it("disables row deletion while a new filter is displaying placeholder rows", async () => {
    setupSession();
    const pending = deferred<Response>();
    server.use(http.get("/api/v1/admin/users", ({ request }) => new URL(request.url).searchParams.has("role")
      ? pending.promise
      : HttpResponse.json({ data: directory([staff, vendor]) })));
    renderApp(["/admin/users"]);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: `Delete ${vendor.name}` });
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by role" }), "vendor");
    expect(screen.getByRole("button", { name: `Delete ${vendor.name}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Delete ${staff.name}` })).toBeDisabled();
    pending.resolve(HttpResponse.json({ data: directory([vendor]) }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Delete ${vendor.name}` })).toBeEnabled());
    expect(screen.queryByRole("button", { name: `Delete ${staff.name}` })).not.toBeInTheDocument();
  });

  it("keeps committed deletion separate from refresh failure and hides stale totals until retry succeeds", async () => {
    setupSession();
    let removed = false;
    let refreshFails = true;
    let writes = 0;
    server.use(
      http.get("/api/v1/admin/users", () => removed && refreshFails
        ? HttpResponse.json({ error: { code: "READ_FAILED", message: "Refresh failed." } }, { status: 503 })
        : HttpResponse.json({ data: directory(removed ? [staff] : [staff, vendor]) })),
      http.delete(`/api/v1/admin/users/${vendor.id}`, () => { writes += 1; removed = true; return HttpResponse.json(deletion()); })
    );
    const { queryClient } = renderApp(["/admin/users"]);
    const { user, dialog } = await openDelete();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    await screen.findByText("User deleted");
    await screen.findByText(/User deleted. The directory could not be refreshed/);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Total users")).not.toBeInTheDocument();
    expect(screen.queryByText("2 visible users")).not.toBeInTheDocument();
    expect(queryClient.getQueryData<UserDirectoryPage>(adminUserKeys.page({}, { limit: 20, offset: 0 }))?.items.map((item) => item.id)).toEqual([staff.id]);
    refreshFails = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("1 visible user");
    expect(screen.queryByText(vendor.email)).not.toBeInTheDocument();
    expect(writes).toBe(1);
  });

  it("preserves filters and returns to a valid page after deleting its last row", async () => {
    setupSession();
    let removed = false;
    const paths: string[] = [];
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ ...vendor, id: `vendor-${index}`, name: `Vendor ${index}`, email: `vendor-${index}@example.test` }));
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        const url = new URL(request.url); paths.push(url.search);
        const offset = Number(url.searchParams.get("offset"));
        return HttpResponse.json({ data: directory(offset === 20 ? (removed ? [] : [vendor]) : firstPage, offset, removed ? 20 : 21) });
      }),
      http.delete(`/api/v1/admin/users/${vendor.id}`, () => { removed = true; return HttpResponse.json(deletion()); })
    );
    renderApp(["/admin/users"]);
    const user = userEvent.setup();
    await screen.findByRole("option", { name: "Vendor" });
    await user.selectOptions(await screen.findByRole("combobox", { name: "Filter by role" }), "vendor");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Next page" }));
    const { dialog } = await openDelete();
    await user.click(within(dialog).getByRole("button", { name: "Delete user" }));
    await screen.findByText("20 visible users");
    expect(screen.getByRole("combobox", { name: "Filter by role" })).toHaveValue("vendor");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(paths.at(-1)).toContain("role=vendor");
    expect(paths.at(-1)).toContain("offset=0");
    expect(screen.queryByText(vendor.email)).not.toBeInTheDocument();
  });
});
