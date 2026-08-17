import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  REQUESTABLE_MODULES_BY_ROLE,
  type PermissionCode,
  type Role
} from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type { OwnAccessRequest } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { accessRequestsPath } from "./accessRequestsApi";

const pendingRequest: OwnAccessRequest = {
  id: "request-1",
  projectId: "project-hidden-valid",
  module: "design" as const,
  reason: "Need access",
  status: "pending" as const,
  decisionReason: null,
  reviewedAt: null,
  version: 2,
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T10:00:00.000Z"
};

function installSession(role: Role, permissions: readonly PermissionCode[]) {
  tokenStorage.set(`${role}-access-token`);
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({
        data: {
          id: `${role}-1`,
          name: `${role} user`,
          email: `${role}@lisno.example`,
          role
        }
      })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({ data: authorizationFor(role, permissions) })
    )
  );
}

function ownPage(items: OwnAccessRequest[] = []) {
  return {
    data: {
      items,
      pagination: { limit: 20, offset: 0, total: items.length, hasMore: false }
    }
  };
}

describe("MyAccessRequestsPage", () => {
  it("serializes access-request filters in canonical order", () => {
    expect(
      accessRequestsPath(
        "review",
        { module: "design", status: "pending" },
        { limit: 20, offset: 40 }
      )
    ).toBe("/access-requests/review?status=pending&module=design&limit=20&offset=40");
  });

  it.each([
    ["designer", "design"],
    ["procurement", "procurement"],
    ["finance_head", "finance"],
    ["site_manager", "execution"]
  ] as const)("eligible %s sees only the %s module", async (role, module) => {
    installSession(role, [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read",
      "access_request.create"
    ]);
    let mineCount = 0;
    server.use(
      http.get("/api/v1/access-requests/mine", ({ request }) => {
        mineCount += 1;
        expect(new URL(request.url).search).toBe("?limit=20&offset=0");
        return HttpResponse.json(ownPage());
      })
    );

    const user = userEvent.setup();
    renderApp(["/access-requests/mine"]);
    await user.click(await screen.findByRole("button", { name: "Create request" }));

    const dialog = screen.getByRole("dialog", { name: "Request project access" });
    const moduleSelect = within(dialog).getByRole("combobox", { name: "Module" });
    expect(within(moduleSelect).getAllByRole("option")).toHaveLength(1);
    expect(moduleSelect).toHaveValue(module);
    expect(within(dialog).getByRole("button", { name: "Create request" })).toBeEnabled();
    expect(mineCount).toBe(1);
    expect(REQUESTABLE_MODULES_BY_ROLE[role]).toEqual([module]);
  });

  it("Super Admin self history is read-only", async () => {
    installSession("super_admin", [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read",
      "access_request.create",
      "access_request.self.cancel"
    ]);
    server.use(
      http.get("/api/v1/access-requests/mine", () =>
        HttpResponse.json(ownPage([pendingRequest]))
      )
    );

    renderApp(["/access-requests/mine"]);
    expect(await screen.findByText("project-hidden-valid")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Module" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Primary navigation" })).queryByRole(
        "link",
        { name: "My access requests" }
      )
    ).not.toBeInTheDocument();
  });

  it.each([
    "admin",
    "estimator_sales",
    "design_manager",
    "design_head",
    "client",
    "worker_electrician",
    "worker_plumber",
    "worker_carpenter",
    "worker_painter",
    "worker_civil",
    "worker_other"
  ] as const)("denies non-request role %s without calling mine", async (role) => {
    installSession(role, [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read"
    ]);
    let mineCount = 0;
    server.use(
      http.get("/api/v1/access-requests/mine", () => {
        mineCount += 1;
        return HttpResponse.json(ownPage());
      })
    );

    renderApp(["/access-requests/mine"]);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeVisible();
    expect(mineCount).toBe(0);
  });

  it("preserves opaque own fields and cancels only a pending row with version", async () => {
    installSession("designer", [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read",
      "access_request.create",
      "access_request.self.cancel"
    ]);
    let row = pendingRequest;
    let cancelBody: unknown;
    server.use(
      http.get("/api/v1/access-requests/mine", () => HttpResponse.json(ownPage([row]))),
      http.post("/api/v1/access-requests/request-1/cancel", async ({ request }) => {
        cancelBody = await request.json();
        row = { ...row, status: "cancelled", version: 3 };
        return HttpResponse.json({ data: row });
      })
    );

    const user = userEvent.setup();
    renderApp(["/access-requests/mine"]);
    expect(await screen.findByText("project-hidden-valid")).toBeVisible();
    expect(screen.getByText("design")).toBeVisible();
    expect(screen.getAllByText("17 Aug 2026")).toHaveLength(2);
    expect(document.body).not.toHaveTextContent(/project title|resolved project/i);
    await user.click(screen.getByRole("button", { name: "Cancel request" }));

    expect(cancelBody).toEqual({ version: 2 });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument()
    );
  });

  it("renders distinct created, updated, and reviewed timestamps", async () => {
    installSession("designer", [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read"
    ]);
    server.use(
      http.get("/api/v1/access-requests/mine", () =>
        HttpResponse.json(
          ownPage([
            {
              ...pendingRequest,
              status: "approved",
              version: 3,
              updatedAt: "2026-08-18T10:00:00.000Z",
              reviewedAt: "2026-08-19T10:00:00.000Z"
            }
          ])
        )
      )
    );

    renderApp(["/access-requests/mine"]);
    expect(await screen.findByText("17 Aug 2026")).toBeVisible();
    expect(screen.getByText("18 Aug 2026")).toBeVisible();
    expect(screen.getByText("19 Aug 2026")).toBeVisible();
  });

  it("stale cancel invalidates without replay", async () => {
    installSession("designer", [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read",
      "access_request.self.cancel"
    ]);
    let version = 2;
    let cancelCount = 0;
    let getCount = 0;
    server.use(
      http.get("/api/v1/access-requests/mine", () => {
        getCount += 1;
        return HttpResponse.json(ownPage([{ ...pendingRequest, version }]));
      }),
      http.post("/api/v1/access-requests/request-1/cancel", () => {
        cancelCount += 1;
        version = 3;
        return HttpResponse.json(
          { error: { code: "VERSION_CONFLICT", message: "The request changed elsewhere." } },
          { status: 409 }
        );
      })
    );

    const user = userEvent.setup();
    renderApp(["/access-requests/mine"]);
    await user.click(await screen.findByRole("button", { name: "Cancel request" }));

    expect(await screen.findByRole("status", { name: "Application announcements" })).toHaveTextContent(
      "The access request changed elsewhere. Latest details are now shown."
    );
    await waitFor(() => expect(getCount).toBeGreaterThan(1));
    expect(cancelCount).toBe(1);
    expect(screen.getByText("Version 3")).toBeVisible();
  });
});
