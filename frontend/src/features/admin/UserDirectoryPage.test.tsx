import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import { adminUserKeys } from "./adminApi";

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
  },
  /*
   * Deliberately asymmetric: a second Designer makes the role counts unequal
   * and this row is the only inactive account, so an off-by-one in the tiles or
   * a status rendered without text cannot pass unnoticed.
   */
  {
    id: "user-designer-nia",
    name: "Nia Fernandes",
    email: "nia@lisno.example",
    role: "designer" as const,
    active: false,
    version: 4,
    createdAt: "2026-06-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:00:00.000Z"
  }
];

function installSession(
  actor: typeof admin | typeof superAdmin,
  extraPermissions: readonly string[] = []
) {
  tokenStorage.set(`${actor.role}-token`);
  const authorization = authorizationFor(actor.role, [
    "identity.self.read",
    "identity.authorization.read",
    "identity.users.read",
    "identity.users.update"
  ]);
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: actor })),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: {
          ...authorization,
          permissions: [...authorization.permissions, ...extraPermissions]
        }
      })
    )
  );
}

interface DirectorySummary {
  total: number;
  active: number;
  inactive: number;
  roleCount: number;
}

/**
 * Mirrors the backend contract: directory-wide and filter-independent. Tests
 * that need to prove the tiles are not derived from the loaded page pass an
 * explicit summary whose values cannot be produced from `items`.
 */
function summaryOf(items: typeof directoryRows): DirectorySummary {
  return {
    total: items.length,
    active: items.filter((row) => row.active).length,
    inactive: items.filter((row) => !row.active).length,
    roleCount: new Set(items.map((row) => row.role)).size
  };
}

function page(
  items: typeof directoryRows,
  filterRoles: readonly Role[],
  manageableRoles: readonly Exclude<Role, "super_admin">[],
  offset = 0,
  total = items.length,
  hasMore = false,
  // `null` reproduces a response that omits `summary` entirely.
  summary: DirectorySummary | null = summaryOf(items)
) {
  return {
    data: {
      items,
      pagination: { limit: 20, offset, total, hasMore },
      filterRoles,
      manageableRoles,
      ...(summary === null ? {} : { summary })
    }
  };
}

describe("UserDirectoryPage", () => {
  it("keeps directory detail bound to its stable ID and removes stale data after the row disappears", async () => {
    installSession(superAdmin);
    server.use(http.get("/api/v1/admin/users", () => HttpResponse.json(page([designer], ROLE_CODES, OPERATIONAL_ROLES))));
    const user = userEvent.setup();
    const { queryClient, router } = renderApp(["/admin/users"]);
    await user.click(await screen.findByRole("button", { name: "Details Arun Patel" }));
    const panel = screen.getByRole("dialog", { name: "Arun Patel" });
    expect(within(panel).getByText("arun@lisno.example")).toBeVisible();
    expect(within(panel).getByText(designer.id)).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/users");
    act(() => queryClient.setQueryData(adminUserKeys.page({}, { limit: 20, offset: 0 }), page([], ROLE_CODES, OPERATIONAL_ROLES).data));
    expect(await screen.findByText("This user is no longer available in the current directory view.")).toBeVisible();
    expect(within(screen.getByRole("dialog", { name: "User details" })).queryByText("arun@lisno.example")).not.toBeInTheDocument();
  });

  it("denies Admin before user or invitation APIs even with malformed invitation permissions", async () => {
    installSession(admin, [
      "identity.user_invitations.read",
      "identity.user_invitations.create",
      "identity.user_invitations.resend",
      "identity.user_invitations.revoke"
    ]);
    let userDirectoryRequests = 0;
    let invitationRequests = 0;
    server.use(
      http.get("/api/v1/admin/users", () => {
        userDirectoryRequests += 1;
        return HttpResponse.json(page([designer], ROLE_CODES, OPERATIONAL_ROLES));
      }),
      http.get("/api/v1/admin/user-invitations", () => {
        invitationRequests += 1;
        return HttpResponse.json({
          data: {
            items: [],
            pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
            invitableRoles: []
          }
        });
      })
    );

    renderApp(["/admin/users"]);
    expect(
      await screen.findByRole("heading", { name: "Access denied" })
    ).toBeVisible();
    expect(userDirectoryRequests).toBe(0);
    expect(invitationRequests).toBe(0);
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

  // AC5 — the metric row is sourced from `summary` and from nothing else.
  it("renders the four metric tiles from the summary, never from the loaded rows", async () => {
    installSession(superAdmin);
    const loadedRows = directoryRows.slice(2, 4);
    /*
     * No tile value can be produced from this page: `items.length` and
     * `pagination.total` are both 2, and 2 is not one of 7 / 6 / 1 / 3.
     */
    const summary = { total: 7, active: 6, inactive: 1, roleCount: 3 };
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(
          page(loadedRows, ROLE_CODES, OPERATIONAL_ROLES, 0, loadedRows.length, false, summary)
        )
      )
    );

    const { container } = renderApp(["/admin/users"]);
    await screen.findByRole("region", { name: "User directory" });

    const metrics = container.querySelector<HTMLElement>(
      ".access-administration__metrics"
    );
    expect(metrics).not.toBeNull();
    const tiles = Array.from(
      (metrics as HTMLElement).querySelectorAll(".metric-card")
    );
    expect(
      tiles.map((tile) => [
        tile.querySelector(".metric-card__top p")?.textContent,
        tile.querySelector(".metric-card__value")?.textContent
      ])
    ).toEqual([
      ["Total users", "7"],
      ["Active users", "6"],
      ["Inactive users", "1"],
      ["Different roles", "3"]
    ]);

    // 2 is both `items.length` and `pagination.total`; neither reaches a tile.
    expect(loadedRows).toHaveLength(2);
    expect(within(metrics as HTMLElement).queryByText("2")).not.toBeInTheDocument();
    expect(await screen.findByText("2 visible users")).toBeVisible();
  });

  it("omits the metric row entirely when the response carries no summary", async () => {
    installSession(superAdmin);
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(
          page(directoryRows, ROLE_CODES, OPERATIONAL_ROLES, 0, directoryRows.length, false, null)
        )
      )
    );

    const { container } = renderApp(["/admin/users"]);
    await screen.findByRole("region", { name: "User directory" });

    expect(
      container.querySelector(".access-administration__metrics")
    ).toBeNull();
    for (const label of [
      "Total users",
      "Active users",
      "Inactive users",
      "Different roles"
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // No placeholder zeroes stand in for the absent aggregate.
    expect(screen.queryAllByText("0")).toEqual([]);
  });

  // AC6 — identity-led table, visible Actions header, Super Admin row gating.
  it("renders the identity-led table with a visible Actions header and gated row actions", async () => {
    installSession(superAdmin);
    server.use(
      http.get("/api/v1/admin/users", () =>
        HttpResponse.json(page(directoryRows, ROLE_CODES, OPERATIONAL_ROLES))
      )
    );

    renderApp(["/admin/users"]);
    const table = await screen.findByRole("table");

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["User", "Role", "Status", "Created", "Updated", "Actions"]);
    const actionsHeader = within(table).getByRole("columnheader", {
      name: "Actions"
    });
    expect(actionsHeader.querySelector(".sr-only")).toBeNull();
    expect(actionsHeader).toBeVisible();

    const designerRow = within(table).getByRole("row", { name: /Arun Patel/ });
    const identity = designerRow.querySelector<HTMLElement>(
      ".access-administration__identity"
    );
    expect(identity).not.toBeNull();
    const avatar = (identity as HTMLElement).querySelector<HTMLElement>(
      ".access-administration__avatar"
    );
    expect(avatar).toHaveTextContent("AP");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(
      Array.from((identity as HTMLElement).children).map((child) => [
        child.tagName,
        child.textContent
      ])
    ).toEqual([
      ["SPAN", "AP"],
      ["STRONG", "Arun Patel"],
      ["SPAN", "arun@lisno.example"],
      ["SMALL", "Senior Designer"]
    ]);
    expect(
      designerRow.querySelector(".access-administration__role-chip")
    ).toHaveTextContent(ROLE_LABELS.designer);

    // Dates are compact and machine-readable, with no time component.
    const times = Array.from(designerRow.querySelectorAll("time"));
    expect(times.map((element) => element.getAttribute("datetime"))).toEqual([
      designer.createdAt,
      designer.updatedAt
    ]);
    expect(times.map((element) => element.textContent)).toEqual([
      "01 Jul 2026",
      "01 Aug 2026"
    ]);
    expect(designerRow).not.toHaveTextContent(/\d{2}:\d{2}/);

    // Status carries text, never colour alone.
    expect(within(designerRow).getByText("Active")).toBeVisible();
    expect(
      within(within(table).getByRole("row", { name: /Nia Fernandes/ })).getByText(
        "Inactive"
      )
    ).toBeVisible();

    const superAdminRow = within(table).getByRole("row", {
      name: /Sana Super Admin/
    });
    expect(
      within(superAdminRow).queryByRole("button", { name: /^Manage/ })
    ).not.toBeInTheDocument();
    expect(
      within(superAdminRow).getByRole("button", {
        name: "Details Sana Super Admin"
      })
    ).toBeVisible();
    expect(
      within(designerRow).getByRole("button", { name: "Details Arun Patel" })
    ).toBeVisible();
    expect(
      within(designerRow).getByRole("button", { name: "Manage Arun Patel" })
    ).toBeVisible();
  });

  // AC7 — range summary, page indicator and Previous/Next disabled logic.
  it("shows the page indicator and range, and advances it with Next page", async () => {
    installSession(superAdmin);
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        return HttpResponse.json(
          page([designer], ROLE_CODES, OPERATIONAL_ROLES, offset, 21, offset === 0)
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/admin/users"]);
    const pages = await screen.findByRole("navigation", {
      name: "User directory pages"
    });

    expect(within(pages).getByText("Page 1")).toBeVisible();
    expect(pages).toHaveTextContent("Showing 1–1 of 21");
    const previous = within(pages).getByRole("button", { name: "Previous page" });
    const next = within(pages).getByRole("button", { name: "Next page" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    await waitFor(() =>
      expect(within(pages).getByText("Page 2")).toBeVisible()
    );
    expect(pages).toHaveTextContent("Showing 21–21 of 21");
    expect(
      within(pages).getByRole("button", { name: "Previous page" })
    ).toBeEnabled();
    expect(within(pages).getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  // AC9 — loading, error with retry, and empty states, each free of tiles.
  it("renders loading, error with retry, and empty states without manufacturing tiles", async () => {
    installSession(superAdmin);
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let attempt = 0;
    server.use(
      http.get("/api/v1/admin/users", () => {
        attempt += 1;
        return attempt === 1
          ? firstResponse
          : HttpResponse.json(page([], ROLE_CODES, OPERATIONAL_ROLES));
      })
    );

    const user = userEvent.setup();
    const { container } = renderApp(["/admin/users"]);
    await screen.findByRole("heading", { name: "User administration" });

    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(container.querySelector(".access-administration__metrics")).toBeNull();
    expect(screen.queryAllByText("0")).toEqual([]);

    resolveFirst(
      HttpResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Directory unavailable." } },
        { status: 500 }
      ) as Response
    );

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(container.querySelector(".access-administration__metrics")).toBeNull();
    expect(screen.queryAllByText("0")).toEqual([]);

    await user.click(retry);
    expect(
      await screen.findByText("No users match these filters.")
    ).toBeVisible();
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    /*
     * An empty directory is the one state in which zeroes are real: the server
     * sent `summary`, so the tiles report it rather than being suppressed. The
     * manufactured-zero case is covered by the missing-summary test above.
     */
    const metrics = container.querySelector<HTMLElement>(
      ".access-administration__metrics"
    );
    expect(metrics).not.toBeNull();
    expect(
      Array.from(
        (metrics as HTMLElement).querySelectorAll(".metric-card__value")
      ).map((value) => value.textContent)
    ).toEqual(["0", "0", "0", "0"]);
  });
});
