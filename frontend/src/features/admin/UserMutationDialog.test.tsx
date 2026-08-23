import axe from "axe-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  type Role
} from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { UserDirectoryItem } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const actor = {
  id: "user-super-admin-actor",
  name: "Sana Super Admin",
  email: "sana@lisno.example",
  role: "super_admin" as const
};

const designer = {
  id: "user-designer-arun",
  name: "Arun Patel",
  email: "arun@lisno.example",
  role: "designer" as const,
  active: true,
  version: 3,
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z"
};

const zeroCounts = {
  ownedActiveLeads: 0,
  ownedActiveEstimates: 0,
  initiatedActiveProjects: 0,
  assignedActiveProjects: 0,
  managedActiveProjects: 0,
  ownedActiveTasks: 0,
  directReports: 0,
  linkedClientProjects: 0,
  adminInitiatorGrants: 0
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function installSession(user: typeof actor) {
  tokenStorage.set(`${user.role}-token`);
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: user })),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: authorizationFor(user.role, [
          "identity.self.read",
          "identity.authorization.read",
          "identity.users.read",
          "identity.users.update"
        ])
      })
    )
  );
}

function directoryResponse(
  users: ReadonlyArray<UserDirectoryItem>,
  manageableRoles: readonly Exclude<Role, "super_admin">[] = ROLE_CODES.filter(
    (role): role is Exclude<Role, "super_admin"> => role !== "super_admin"
  )
) {
  return {
    data: {
      items: users,
      pagination: {
        limit: 20,
        offset: 0,
        total: users.length,
        hasMore: false
      },
      filterRoles: ROLE_CODES,
      manageableRoles
    }
  };
}

async function openDesignerDialog() {
  const user = userEvent.setup();
  renderApp(["/admin/users"]);
  const trigger = await screen.findByRole("button", {
    name: "Manage Arun Patel"
  });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", {
    name: "Manage Arun Patel"
  });
  return { user, trigger, dialog };
}

async function expectNoAxeViolations() {
  const context = {
    canvas: document.createElement("canvas"),
    clearRect: () => undefined,
    fillText: () => undefined,
    getImageData: () => ({
      data: new Uint8ClampedArray([255, 255, 255, 255])
    }),
    measureText: (text: string) => ({ width: Math.max(text.length, 1) * 10 })
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context);

  try {
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  } finally {
    getContext.mockRestore();
  }
}

describe("UserMutationDialog", () => {
  it("role change submits one field and version", async () => {
    installSession(actor);
    let current: UserDirectoryItem = designer;
    let patchBody: unknown;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([current]))
      ),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchBody = await request.json();
        current = {
          ...designer,
          role: "procurement" as const,
          version: 4,
          updatedAt: "2026-08-17T09:00:00.000Z"
        };
        return HttpResponse.json({
          data: {
            user: current,
            revokedGrantCount: 1,
            responsibilities: zeroCounts
          }
        });
      })
    );

    const { user, dialog } = await openDesignerDialog();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Role" }),
      "procurement"
    );
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Manage Arun Patel" })
      ).not.toBeInTheDocument()
    );
    expect(patchBody).toEqual({ version: 3, role: "procurement" });
    expect(patchBody).not.toHaveProperty("active");
    expect(
      await screen.findByRole("heading", { name: "User access updated" })
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByText(
        /1 project access grant revoked/i
      )
    ).toBeVisible();
  });

  it("deactivation explains preserved assignments", async () => {
    installSession(actor);
    let patchBody: unknown;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer]))
      ),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          data: {
            user: { ...designer, active: false, version: 4 },
            revokedGrantCount: 2,
            responsibilities: { ...zeroCounts, ownedActiveTasks: 2 }
          }
        });
      })
    );

    const { user, dialog } = await openDesignerDialog();
    await user.click(
      within(dialog).getByRole("button", { name: "Deactivate user" })
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Deactivate Arun Patel?"
    });
    expect(confirmation).toHaveTextContent(/project access grants will be revoked/i);
    expect(confirmation).toHaveTextContent(/assignments remain/i);
    await user.click(
      within(confirmation).getByRole("button", { name: "Confirm deactivation" })
    );

    expect(patchBody).toEqual({ version: 3, active: false });
    expect(patchBody).not.toHaveProperty("role");
    const notifications = screen.getByRole("region", { name: "Notifications" });
    expect(
      await within(notifications).findByText(/2 project access grants revoked/i)
    ).toBeVisible();
    expect(
      within(notifications).getByText(/2 active tasks remain assigned/i)
    ).toBeVisible();
  });

  it("responsibility conflict remains actionable", async () => {
    installSession(actor);
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer]))
      ),
      http.patch("/api/v1/admin/users/user-designer-arun", () => {
        patchCount += 1;
        return HttpResponse.json(
          {
            error: {
              code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED",
              message: "Reassign dependent work first."
            }
          },
          { status: 409 }
        );
      })
    );

    const { user, dialog } = await openDesignerDialog();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Role" }),
      "procurement"
    );
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reassign dependent work first."
    );
    expect(
      screen.getByRole("dialog", { name: "Manage Arun Patel" })
    ).toBeVisible();
    expect(patchCount).toBe(1);
    expect(
      screen.queryByRole("heading", { name: "User access updated" })
    ).not.toBeInTheDocument();
  });

  it("stale version refetches without replay", async () => {
    installSession(actor);
    let directoryVersion = 3;
    let getCount = 0;
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () => {
        getCount += 1;
        return HttpResponse.json(
          directoryResponse([{ ...designer, version: directoryVersion }])
        );
      }),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchCount += 1;
        expect(await request.json()).toEqual({ version: 3, role: "procurement" });
        directoryVersion = 4;
        return HttpResponse.json(
          {
            error: {
              code: "VERSION_CONFLICT",
              message: "The user changed elsewhere."
            }
          },
          { status: 409 }
        );
      })
    );

    const { user, dialog } = await openDesignerDialog();
    const roleSelect = within(dialog).getByRole("combobox", { name: "Role" });
    await user.selectOptions(roleSelect, "procurement");
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The user changed elsewhere."
    );
    await waitFor(() => expect(getCount).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(roleSelect).toHaveValue("designer"));
    await waitFor(() => expect(roleSelect).not.toBeDisabled());
    expect(within(dialog).getByRole("button", { name: "Save role" })).toBeDisabled();
    expect(patchCount).toBe(1);
  });

  it("keeps a filtered-out version conflict open and fail closed", async () => {
    installSession(actor);
    let conflictReturned = false;
    let filteredGetCount = 0;
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("role") === "designer") filteredGetCount += 1;
        return HttpResponse.json(
          directoryResponse(
            conflictReturned && url.searchParams.get("role") === "designer"
              ? []
              : [designer]
          )
        );
      }),
      http.patch("/api/v1/admin/users/user-designer-arun", () => {
        patchCount += 1;
        conflictReturned = true;
        return HttpResponse.json(
          {
            error: {
              code: "VERSION_CONFLICT",
              message: "The user changed elsewhere."
            }
          },
          { status: 409 }
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/users"]);
    await screen.findByRole("button", { name: "Manage Arun Patel" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by role" }),
      "designer"
    );
    await waitFor(() => expect(filteredGetCount).toBe(1));
    await user.click(screen.getByRole("button", { name: "Manage Arun Patel" }));
    const dialog = screen.getByRole("dialog", { name: "Manage Arun Patel" });
    const roleSelect = within(dialog).getByRole("combobox", { name: "Role" });
    await user.selectOptions(roleSelect, "procurement");
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));

    expect(
      await screen.findByText(
        "This user is no longer in the current directory view. Close this dialog and locate the account again."
      )
    ).toBeVisible();
    expect(dialog).toBeVisible();
    expect(roleSelect).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save role" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Deactivate user" })).toBeDisabled();
    expect(dialog).not.toHaveTextContent("Latest details are now loaded");
    expect(patchCount).toBe(1);
  });

  it("does not offer or submit a Super Admin destination", async () => {
    installSession(actor);
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer]))
      ),
      http.patch("/api/v1/admin/users/:userId", () => {
        patchCount += 1;
        return HttpResponse.error();
      })
    );

    const { dialog } = await openDesignerDialog();
    expect(
      within(dialog).queryByRole("option", { name: "Super Admin" })
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: "Site Manager" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: "Finance Manager" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Save role" })
    ).toBeDisabled();
    expect(patchCount).toBe(0);
  });

  it("directory and dialog are keyboard accessible", async () => {
    installSession(actor);
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer], OPERATIONAL_ROLES))
      ),
      http.patch("/api/v1/admin/users/:userId", () => {
        patchCount += 1;
        return HttpResponse.error();
      })
    );

    const { user, trigger, dialog } = await openDesignerDialog();
    const roleSelect = within(dialog).getByRole("combobox", { name: "Role" });
    await waitFor(() => expect(roleSelect).toHaveFocus());
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Close Manage Arun Patel" })).toHaveFocus();
    await expectNoAxeViolations();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopened = await screen.findByRole("dialog", { name: "Manage Arun Patel" });
    await user.click(within(reopened).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(patchCount).toBe(0);
  });

  it("moves focus into each deactivation confirmation and preserves its escape and cancel paths", async () => {
    installSession(actor);
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer], OPERATIONAL_ROLES))
      )
    );

    const { user, dialog } = await openDesignerDialog();
    await user.click(
      within(dialog).getByRole("button", { name: "Deactivate user" })
    );
    let confirmation = screen.getByRole("alertdialog", {
      name: "Deactivate Arun Patel?"
    });
    const confirmationCancel = within(confirmation).getByRole("button", {
      name: "Cancel deactivation"
    });
    await waitFor(() => expect(confirmationCancel).toHaveFocus());
    within(confirmation).getByRole("button", { name: "Confirm deactivation" }).focus();
    await user.tab();
    expect(confirmation).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    let reopened = screen.getByRole("dialog", { name: "Manage Arun Patel" });
    await waitFor(() =>
      expect(within(reopened).getByRole("combobox", { name: "Role" })).toHaveFocus()
    );

    await user.click(
      within(reopened).getByRole("button", { name: "Deactivate user" })
    );
    confirmation = screen.getByRole("alertdialog", {
      name: "Deactivate Arun Patel?"
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancel deactivation" })
    );
    reopened = screen.getByRole("dialog", { name: "Manage Arun Patel" });
    await waitFor(() =>
      expect(within(reopened).getByRole("combobox", { name: "Role" })).toHaveFocus()
    );
  });

  it("blocks alternate dialog transitions while role and deactivation requests are pending", async () => {
    installSession(actor);
    const roleResponse = deferred<Response>();
    const deactivationResponse = deferred<Response>();
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(directoryResponse([designer]))
      ),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchCount += 1;
        const body = (await request.json()) as Record<string, unknown>;
        return body.role === "procurement"
          ? roleResponse.promise
          : deactivationResponse.promise;
      })
    );

    const first = await openDesignerDialog();
    const firstRole = within(first.dialog).getByRole("combobox", { name: "Role" });
    await first.user.selectOptions(firstRole, "procurement");
    await first.user.click(
      within(first.dialog).getByRole("button", { name: "Save role" })
    );
    await waitFor(() => expect(patchCount).toBe(1));
    expect(within(first.dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      within(first.dialog).getByRole("button", { name: "Deactivate user" })
    ).toBeDisabled();
    expect(
      within(first.dialog).getByRole("button", { name: "Close Manage Arun Patel" })
    ).toBeDisabled();
    await first.user.keyboard("{Escape}");
    expect(first.dialog).toBeVisible();

    roleResponse.resolve(
      HttpResponse.json({
        data: {
          user: { ...designer, role: "procurement", version: 4 },
          revokedGrantCount: 0,
          responsibilities: zeroCounts
        }
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await first.user.click(
      screen.getByRole("button", { name: "Manage Arun Patel" })
    );
    const secondDialog = screen.getByRole("dialog", {
      name: "Manage Arun Patel"
    });
    await first.user.click(
      within(secondDialog).getByRole("button", { name: "Deactivate user" })
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Deactivate Arun Patel?"
    });
    await first.user.click(
      within(confirmation).getByRole("button", { name: "Confirm deactivation" })
    );
    await waitFor(() => expect(patchCount).toBe(2));
    expect(
      within(confirmation).getByRole("button", { name: "Cancel deactivation" })
    ).toBeDisabled();
    expect(
      within(confirmation).getByRole("button", { name: "Close Deactivate Arun Patel?" })
    ).toBeDisabled();
    await first.user.keyboard("{Escape}");
    expect(confirmation).toBeVisible();

    deactivationResponse.resolve(
      HttpResponse.json({
        data: {
          user: { ...designer, active: false, version: 4 },
          revokedGrantCount: 0,
          responsibilities: zeroCounts
        }
      })
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
