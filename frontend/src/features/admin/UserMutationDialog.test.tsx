import axe from "axe-core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import { emptyResponsibilitiesHandler, responsibilityPage, responsibilityRow } from "./userResponsibilities.test-fixtures";
import { adminUserKeys } from "./adminApi";

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
  assignedExecutionProjects: 0,
  assignedWorkflowTasks: 0,
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
    emptyResponsibilitiesHandler([designer]),
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
  it("saves only the language pair, refreshes, reopens, and clears without affecting another user", async () => {
    installSession(actor);
    let current: UserDirectoryItem = { ...designer, location: "Mysuru" };
    const other: UserDirectoryItem = { ...designer, id: "other-user", name: "Other Designer", languagesKnown: ["hindi"], preferredLanguage: "hindi" };
    const patches: unknown[] = [];
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([current, other]))),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        const patch = await request.json() as Pick<UserDirectoryItem, "languagesKnown" | "preferredLanguage" | "version">;
        patches.push(patch);
        current = { ...current, ...patch, version: current.version + 1 };
        return HttpResponse.json({ data: { user: current, revokedGrantCount: 0, responsibilities: zeroCounts } });
      })
    );
    const { user, dialog } = await openDesignerDialog();
    const known = within(dialog).getByRole("button", { name: "Known languages" });
    const preferred = within(dialog).getByRole("combobox", { name: "Preferred language" });
    expect(known).toHaveAccessibleDescription("0 languages selected");
    expect(preferred).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Save languages" })).toBeDisabled();
    await user.click(known);
    const options = within(dialog).getByRole("listbox");
    await user.click(within(options).getByRole("option", { name: "Kannada" }));
    await user.click(within(options).getByRole("option", { name: "English" }));
    await user.keyboard("{Escape}");
    expect(known).toHaveFocus();
    await user.selectOptions(preferred, "tamil");
    await user.click(within(dialog).getByRole("button", { name: "Save languages" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Manage Arun Patel" })).not.toBeInTheDocument());
    expect(patches).toEqual([{ version: 3, languagesKnown: ["english", "kannada"], preferredLanguage: "tamil" }]);
    expect(screen.getByRole("region", { name: "Notifications" })).not.toHaveTextContent(/grant.*revoked/);
    await user.click(screen.getByRole("button", { name: "Manage Arun Patel" }));
    expect(screen.getByRole("button", { name: "Known languages" })).toHaveTextContent("English, Kannada");
    expect(screen.getByRole("combobox", { name: "Preferred language" })).toHaveValue("tamil");
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue("Mysuru");
    await user.click(screen.getByRole("button", { name: "Known languages" }));
    await user.click(screen.getByRole("button", { name: "Clear languages" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("combobox", { name: "Preferred language" })).toHaveValue("tamil");
    await user.selectOptions(screen.getByRole("combobox", { name: "Preferred language" }), "");
    await user.click(screen.getByRole("button", { name: "Save languages" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({ version: 4, languagesKnown: [], preferredLanguage: null });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Manage Arun Patel" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Manage Arun Patel" }));
    expect(screen.getByRole("button", { name: "Known languages" })).toHaveAccessibleDescription("0 languages selected");
    expect(screen.getByRole("combobox", { name: "Preferred language" })).toHaveValue("");
    expect(other.languagesKnown).toEqual(["hindi"]);
    expect(other.preferredLanguage).toBe("hindi");
  });

  it("treats reordered selections as unchanged and keeps profile/access edits separate without blocking recovery", async () => {
    installSession(actor);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([{ ...designer, languagesKnown: ["english", "kannada"], preferredLanguage: "tamil" }]))));
    const { user, dialog } = await openDesignerDialog();
    const known = within(dialog).getByRole("button", { name: "Known languages" });
    const role = within(dialog).getByRole("combobox", { name: "Role" });
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    await user.click(known);
    const english = within(screen.getByRole("listbox")).getByRole("option", { name: "English" });
    await user.click(english);
    expect(role).toBeDisabled();
    expect(location).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Deactivate user" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save languages" })).toBeEnabled();
    await user.click(english);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(within(dialog).getByRole("button", { name: "Save languages" })).toBeDisabled();
    expect(role).toBeEnabled();
    expect(location).toBeEnabled();
    await user.type(location, "Mysuru");
    expect(known).toBeDisabled();
    expect(within(dialog).getByRole("combobox", { name: "Preferred language" })).toBeDisabled();
    await user.clear(location);
    expect(known).toBeEnabled();
    await user.selectOptions(role, "procurement");
    expect(known).toBeDisabled();
    await user.selectOptions(role, "designer");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Preferred language" }), "hindi");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(within(dialog).getByRole("combobox", { name: "Preferred language" })).toHaveValue("hindi");
    expect(within(dialog).getByRole("button", { name: "Save languages" })).toBeEnabled();
  });

  it.each(["languagesKnown", "preferredLanguage"])("preserves both language fields and focuses rejected %s", async (field) => {
    installSession(actor);
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid languages", fields: { [field]: "Review this language selection." } } }, { status: 400 }))
    );
    const { user, dialog } = await openDesignerDialog();
    const known = within(dialog).getByRole("button", { name: "Known languages" });
    const preferred = within(dialog).getByRole("combobox", { name: "Preferred language" });
    await user.click(known);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.selectOptions(preferred, "kannada");
    await user.click(within(dialog).getByRole("button", { name: "Save languages" }));
    const control = field === "languagesKnown" ? known : preferred;
    await waitFor(() => expect(control).toHaveAccessibleDescription(/Review this language selection/));
    await waitFor(() => expect(control).toHaveFocus());
    expect(known).toHaveTextContent("English");
    expect(preferred).toHaveValue("kannada");
  });

  it("preserves a failed language save and blocks duplicate requests while pending", async () => {
    installSession(actor);
    const response = deferred<Response>();
    let count = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => { count += 1; return response.promise; })
    );
    const { user, dialog } = await openDesignerDialog();
    const preferred = within(dialog).getByRole("combobox", { name: "Preferred language" });
    await user.selectOptions(preferred, "kannada");
    await user.click(within(dialog).getByRole("button", { name: "Save languages" }));
    await waitFor(() => expect(count).toBe(1));
    expect(preferred).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Known languages" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Enter}{Escape}");
    response.resolve(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("User languages could not be updated");
    expect(preferred).toHaveValue("kannada");
    expect(preferred).toBeEnabled();
    expect(count).toBe(1);
  });

  it("loads current language values after a version conflict without replaying the stale save", async () => {
    installSession(actor);
    let current: UserDirectoryItem = { ...designer, languagesKnown: ["english"], preferredLanguage: "tamil" };
    let count = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([current]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => {
        count += 1;
        current = { ...current, version: 4, languagesKnown: ["hindi"], preferredLanguage: "kannada" };
        return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "The user changed elsewhere." } }, { status: 409 });
      })
    );
    const { user, dialog } = await openDesignerDialog();
    const preferred = within(dialog).getByRole("combobox", { name: "Preferred language" });
    await user.selectOptions(preferred, "english");
    await user.click(within(dialog).getByRole("button", { name: "Save languages" }));
    await waitFor(() => expect(preferred).toHaveValue("kannada"));
    expect(within(dialog).getByRole("button", { name: "Known languages" })).toHaveTextContent("Hindi");
    expect(within(dialog).getByText("The user changed elsewhere. Latest details are now loaded; choose the change again.")).toHaveAttribute("role", "alert");
    expect(within(dialog).getByRole("button", { name: "Save languages" })).toBeDisabled();
    expect(count).toBe(1);
  });

  it.each([
    { initial: undefined, entered: "  Whitefield, Bengaluru  ", saved: "Whitefield, Bengaluru" },
    { initial: "Mysuru", entered: "ಬೆಂಗಳೂರು", saved: "ಬೆಂಗಳೂರು" },
    { initial: "Bengaluru", entered: "   ", saved: null }
  ])("saves only location and version, refreshes the row, and retains another user ($initial → $saved)", async ({ initial, entered, saved }) => {
    installSession(actor);
    let current: UserDirectoryItem = { ...designer, location: initial };
    const other = { ...designer, id: "other-user", name: "Other Designer", location: "Pune" };
    let patchBody: unknown;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([current, other]))),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchBody = await request.json();
        current = { ...current, location: saved, version: 4 };
        return HttpResponse.json({ data: { user: current, revokedGrantCount: 0, responsibilities: zeroCounts } });
      })
    );
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    expect(location).toHaveValue(initial ?? "");
    expect(location).toHaveAccessibleDescription("City or area");
    expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();
    await user.clear(location);
    await user.type(location, entered);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Manage Arun Patel" })).not.toBeInTheDocument());
    expect(patchBody).toEqual({ version: 3, location: saved });
    expect(within(screen.getByRole("row", { name: /Arun Patel/ })).getByText(saved ?? "Not set")).toBeVisible();
    expect(within(screen.getByRole("row", { name: /Other Designer/ })).getByText("Pune")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "User location updated" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Notifications" })).not.toHaveTextContent(/grant.*revoked/);
    await user.click(screen.getByRole("button", { name: "Manage Arun Patel" }));
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue(saved ?? "");
  });

  it("keeps edits separate and protects an unsaved location when closing", async () => {
    installSession(actor);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))));
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    const role = within(dialog).getByRole("combobox", { name: "Role" });
    await user.type(location, "Mysuru");
    expect(role).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save role" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Deactivate user" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(location).toHaveValue("Mysuru");
    await user.clear(location);
    await user.selectOptions(role, "procurement");
    expect(location).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Deactivate user" })).toBeDisabled();
  });

  it("does not save a normalized unchanged location", async () => {
    installSession(actor);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([{ ...designer, location: "Mysuru" }]))));
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    await user.clear(location);
    await user.type(location, "  Mysuru  ");
    expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toBeEnabled();
  });

  it("retains and focuses location after server field validation fails", async () => {
    installSession(actor);
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => HttpResponse.json({ error: {
        code: "VALIDATION_ERROR", message: "Invalid location", fields: { location: "Review this location." }
      } }, { status: 400 }))
    );
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    await user.type(location, "Mysuru");
    await user.click(within(dialog).getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(location).toHaveAccessibleDescription(/Review this location/));
    expect(location).toHaveValue("Mysuru");
    expect(location).toHaveFocus();
  });

  it("blocks further location edits after a deleted target response even if refetch is stale", async () => {
    installSession(actor);
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => HttpResponse.json({ error: {
        code: "NOT_FOUND", message: "The requested resource was not found."
      } }, { status: 404 }))
    );
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    await user.type(location, "Mysuru");
    await user.click(within(dialog).getByRole("button", { name: "Save location" }));
    expect(await within(dialog).findByText(/This user is no longer in the current directory view/)).toBeVisible();
    expect(location).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();
  });

  it("validates location, blocks duplicate pending saves and preserves failed input", async () => {
    installSession(actor);
    const response = deferred<Response>();
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer]))),
      http.patch("/api/v1/admin/users/user-designer-arun", () => { patchCount += 1; return response.promise; })
    );
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    const save = within(dialog).getByRole("button", { name: "Save location" });
    fireEvent.change(location, { target: { value: "x".repeat(121) } });
    await user.click(save);
    expect(location).toHaveAccessibleDescription(/120 characters or fewer/);
    expect(location).toHaveFocus();
    fireEvent.change(location, { target: { value: "City\u0000area" } });
    await user.click(save);
    expect(location).toHaveAccessibleDescription(/control characters/);
    expect(patchCount).toBe(0);
    fireEvent.change(location, { target: { value: "Mysuru" } });
    await user.click(save);
    await waitFor(() => expect(patchCount).toBe(1));
    expect(location).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Enter}{Escape}");
    expect(dialog).toBeVisible();
    response.resolve(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("User location could not be updated");
    expect(location).toHaveValue("Mysuru");
    expect(location).toBeEnabled();
    expect(patchCount).toBe(1);
  });

  it("loads a conflicting location for review without replaying the stale save", async () => {
    installSession(actor);
    let current = { ...designer, location: "Mysuru" };
    let patchCount = 0;
    server.use(
      http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([current]))),
      http.patch("/api/v1/admin/users/user-designer-arun", async ({ request }) => {
        patchCount += 1;
        expect(await request.json()).toEqual({ version: 3, location: "Bengaluru" });
        current = { ...current, location: "Coimbatore", version: 4 };
        return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "The user changed elsewhere." } }, { status: 409 });
      })
    );
    const { user, dialog } = await openDesignerDialog();
    const location = within(dialog).getByRole("textbox", { name: "Location" });
    await user.clear(location);
    await user.type(location, "Bengaluru");
    await user.click(within(dialog).getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(location).toHaveValue("Coimbatore"));
    expect(within(dialog).getByText("The user changed elsewhere. Latest details are now loaded; choose the change again.")).toHaveAttribute("role", "alert");
    expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(patchCount).toBe(1);
  });

  it("announces background changes before replacing a location draft", async () => {
    installSession(actor);
    let current = { ...designer, location: "Mysuru" };
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([current]))));
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/admin/users"]);
    await user.click(await screen.findByRole("button", { name: "Manage Arun Patel" }));
    const location = screen.getByRole("textbox", { name: "Location" });
    await user.clear(location);
    await user.type(location, "Bengaluru");
    current = { ...current, location: "Coimbatore", version: 4 };
    await act(() => queryClient.invalidateQueries({ queryKey: adminUserKeys.all }));
    await waitFor(() => expect(location).toHaveValue("Coimbatore"));
    expect(screen.getByText("The user changed elsewhere. Latest details are now loaded; choose the change again.")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
  });

  it("offers canonical Project Manager but not the retired role from a stale server list", async () => {
    installSession(actor);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(directoryResponse([designer], ["designer", "program_manager", "site_manager"]))));
    const { dialog } = await openDesignerDialog();
    const roles = within(dialog).getByRole("combobox", { name: "Role" });
    expect(within(roles).queryByRole("option", { name: "Program Manager" })).not.toBeInTheDocument();
    expect(within(roles).getByRole("option", { name: "Project Manager" })).toHaveValue("site_manager");
  });
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
    let assignmentReads = 0;
    server.use(
      http.get("/api/v1/admin/users/user-designer-arun/responsibilities", ({ request }) => {
        assignmentReads++;
        return HttpResponse.json({ data: responsibilityPage({ user: designer,
          destinationRole: new URL(request.url).searchParams.get("destinationRole") as Role,
          blockingCount: 1, items: [responsibilityRow({ label: patchCount ? "Latest dependent work" : "Existing dependent work", blocksRoleChange: true })] }) });
      }),
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
    await screen.findByText("Existing dependent work");
    const previousAssignmentReads = assignmentReads;
    await user.click(within(dialog).getByRole("button", { name: "Save role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reassign dependent work first."
    );
    expect(
      screen.getByRole("dialog", { name: "Manage Arun Patel" })
    ).toBeVisible();
    expect(patchCount).toBe(1);
    expect(await screen.findByText("Latest dependent work")).toBeVisible();
    expect(assignmentReads).toBeGreaterThan(previousAssignmentReads);
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveValue("procurement");
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
      within(dialog).getByRole("option", { name: "Project Manager" })
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
    expect(within(dialog).getByRole("button", { name: /Close manage arun patel/i })).toHaveFocus();
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
      within(first.dialog).getByRole("button", { name: /Close manage arun patel/i })
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
