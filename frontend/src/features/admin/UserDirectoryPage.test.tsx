import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  ROLE_LABELS,
  type Role
} from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const admin = {
  id: "user-admin-meera",
  name: "Meera Admin",
  email: "meera@lisno.example",
  role: "admin" as const
};

const superAdmin = {
  id: "user-super-admin",
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
  title: "Senior Designer",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z"
};

const directoryRows = [
  {
    ...superAdmin,
    active: true,
    version: 1,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z"
  },
  {
    ...admin,
    active: true,
    version: 2,
    createdAt: "2026-06-02T09:00:00.000Z",
    updatedAt: "2026-08-02T09:00:00.000Z"
  },
  designer,
  {
    id: "user-client-maya",
    name: "Maya Client",
    email: "maya@client.example",
    role: "client" as const,
    active: true,
    version: 2,
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:00:00.000Z"
  }
];

function installSession(actor: typeof admin | typeof superAdmin) {
  tokenStorage.set(`${actor.role}-token`);
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: actor })),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: authorizationFor(actor.role, [
          "identity.self.read",
          "identity.authorization.read",
          "identity.users.read",
          "identity.users.update"
        ])
      })
    )
  );
}

function page(
  items: typeof directoryRows,
  filterRoles: readonly Role[],
  manageableRoles: readonly Exclude<Role, "super_admin">[],
  offset = 0,
  total = items.length,
  hasMore = false
) {
  return {
    data: {
      items,
      pagination: { limit: 20, offset, total, hasMore },
      filterRoles,
      manageableRoles
    }
  };
}

describe("UserDirectoryPage", () => {
  it("denies Admin before the user-directory API can be called", async () => {
    installSession(admin);
    let userDirectoryRequests = 0;
    server.use(
      http.get("/api/v1/admin/users", () => {
        userDirectoryRequests += 1;
        return HttpResponse.json(page([designer], ROLE_CODES, OPERATIONAL_ROLES));
      })
    );

    renderApp(["/admin/users"]);
    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(userDirectoryRequests).toBe(0);
  });

  it("Super Admin sees every role", async () => {
    installSession(superAdmin);
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        const url = new URL(request.url);
        expect(`${url.pathname}${url.search}`).toBe(
          "/api/v1/admin/users?limit=20&offset=0"
        );
        return HttpResponse.json(
          page(
            directoryRows,
            ROLE_CODES,
            ROLE_CODES.filter((role): role is Exclude<Role, "super_admin"> =>
              role !== "super_admin"
            )
          )
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/users"]);

    await screen.findByRole("heading", { name: "User administration" });
    const directory = await screen.findByRole("region", {
      name: "User directory"
    });
    expect(
      within(directory).queryByRole("button", { name: "Manage Sana Super Admin" })
    ).not.toBeInTheDocument();
    for (const row of directoryRows.filter(({ role }) => role !== "super_admin")) {
      expect(
        within(directory).getByRole("button", { name: `Manage ${row.name}` })
      ).toBeVisible();
    }

    await user.click(
      screen.getByRole("button", { name: "Manage Arun Patel" })
    );
    const roleSelect = within(
      screen.getByRole("dialog", { name: "Manage Arun Patel" })
    ).getByRole("combobox", { name: "Role" });
    expect(
      within(roleSelect).getAllByRole("option").map((option) => option.textContent)
    ).toEqual(
      ROLE_CODES.filter((role) => role !== "super_admin").map(
        (role) => ROLE_LABELS[role]
      )
    );
    expect(
      screen.getByRole("combobox", { name: "Filter by role" })
    ).toContainElement(screen.getByRole("option", { name: "Super Admin" }));
  });

  it("directory sends canonical filters and pagination", async () => {
    installSession(superAdmin);
    const requestedPaths: string[] = [];
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        const url = new URL(request.url);
        const path = `${url.pathname}${url.search}`;
        requestedPaths.push(path);
        const offset = Number(url.searchParams.get("offset"));
        return HttpResponse.json(
          page(
            [designer],
            ROLE_CODES,
            ROLE_CODES.filter((role): role is Exclude<Role, "super_admin"> =>
              role !== "super_admin"
            ),
            offset,
            21,
            offset === 0
          )
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/users"]);
    await screen.findByRole("heading", { name: "User administration" });
    await waitFor(() =>
      expect(requestedPaths).toContain("/api/v1/admin/users?limit=20&offset=0")
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), {
      target: { value: "  maya  " }
    });
    await waitFor(() =>
      expect(requestedPaths).toContain(
        "/api/v1/admin/users?search=maya&limit=20&offset=0"
      )
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by role" }),
      "designer"
    );
    await waitFor(() =>
      expect(requestedPaths).toContain(
        "/api/v1/admin/users?search=maya&role=designer&limit=20&offset=0"
      )
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by account status" }),
      "true"
    );
    const filteredFirstPage =
      "/api/v1/admin/users?search=maya&role=designer&active=true&limit=20&offset=0";
    await waitFor(() => expect(requestedPaths).toContain(filteredFirstPage));

    await user.click(screen.getByRole("button", { name: "Next page" }));
    const expectedNextPage =
      "/api/v1/admin/users?search=maya&role=designer&active=true&limit=20&offset=20";
    await waitFor(() => expect(requestedPaths).toContain(expectedNextPage));

    expect(requestedPaths.at(-1)).toBe(expectedNextPage);
    expect(
      requestedPaths.filter((path) => path.includes("search=maya") && path.includes("offset=20"))
    ).toEqual([expectedNextPage]);
    expect(
      requestedPaths.some((path) =>
        path.includes("offset=20&search=") || path.includes("limit=20&active=")
      )
    ).toBe(false);
  });
});
