import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { tokenStorage } from "../../api/client";
import type { ProjectAccessGrant, ReviewAccessRequest } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const reviewRow: ReviewAccessRequest = {
  id: "request-1",
  projectId: "project-aurora-villa",
  module: "design" as const,
  reason: "Need access",
  status: "pending" as const,
  decisionReason: null,
  reviewedAt: null,
  version: 2,
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T10:00:00.000Z",
  requester: { id: "designer-1", name: "Arun Designer", email: "arun@lisno.example", role: "designer" as const, active: true },
  project: { id: "project-aurora-villa", resolved: true, name: "Aurora Villa" },
  reviewerId: null,
  activeGrant: null
};

const activeGrant: ProjectAccessGrant = {
  id: "grant-1",
  projectId: "project-aurora-villa",
  userId: "designer-1",
  module: "design" as const,
  source: "access_request" as const,
  accessRequestId: "request-1",
  grantedById: "super-admin-1",
  active: true,
  grantedAt: "2026-08-17T11:00:00.000Z",
  revokedAt: null,
  revokedById: null,
  revocationReason: null,
  version: 1,
  createdAt: "2026-08-17T11:00:00.000Z",
  updatedAt: "2026-08-17T11:00:00.000Z"
};

function installReviewer(role: "admin" | "super_admin") {
  tokenStorage.set(`${role}-review-token`);
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({ data: { id: `${role}-1`, name: "Reviewer", email: `${role}@lisno.example`, role } })),
    http.get("/api/v1/auth/authorization", () => HttpResponse.json({ data: authorizationFor(role, [
      "identity.self.read", "identity.authorization.read", "access_request.review.read", "access_request.review.decide", "project_access_grant.revoke"
    ]) }))
  );
}

function reviewPage(items: ReviewAccessRequest[] = []) {
  return { data: { items, pagination: { limit: 20, offset: 0, total: items.length, hasMore: false } } };
}

describe("AccessRequestInboxPage", () => {
  it("Admin inbox empty state is scoped", async () => {
    installReviewer("admin");
    server.use(http.get("/api/v1/access-requests/review", ({ request }) => {
      expect(new URL(request.url).search).toBe("?limit=20&offset=0");
      return HttpResponse.json(reviewPage());
    }));
    renderApp(["/admin/access-requests"]);
    expect(await screen.findByText("There are no requests for projects you can review.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/global|all projects/i);
  });

  it("Super Admin distinguishes resolved and unresolved projects", async () => {
    installReviewer("super_admin");
    server.use(http.get("/api/v1/access-requests/review", () => HttpResponse.json(reviewPage([
      reviewRow,
      { ...reviewRow, id: "request-unknown", projectId: "project-hidden-valid", project: { id: "project-hidden-valid", resolved: false, name: null } }
    ]))));
    renderApp(["/admin/access-requests"]);
    expect(await screen.findByText("Aurora Villa")).toBeVisible();
    expect(screen.getByText("project-hidden-valid")).toBeVisible();
    expect(screen.getByText("Unresolved project")).toBeVisible();
  });

  it("approval uses immutable row identity and invalidates both lists", async () => {
    installReviewer("super_admin");
    let row = reviewRow;
    let body: unknown;
    let reviewGets = 0;
    server.use(
      http.get("/api/v1/access-requests/review", () => { reviewGets += 1; return HttpResponse.json(reviewPage([row])); }),
      http.post("/api/v1/access-requests/request-1/decision", async ({ request }) => {
        body = await request.json();
        row = { ...row, status: "approved", version: 3, activeGrant: { id: "grant-1", version: 1, grantedAt: activeGrant.grantedAt } };
        return HttpResponse.json({ data: { request: row, grant: activeGrant } });
      })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Approve request request-1" }));
    const dialog = screen.getByRole("dialog", { name: "Approve access request" });
    expect(within(dialog).queryByRole("textbox", { name: /Project ID/i })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve request" }));
    expect(body).toEqual({ version: 2, decision: "approved" });
    expect(await screen.findByRole("status", { name: "Application announcements" })).toHaveTextContent("Access request decision saved.");
    await waitFor(() => expect(reviewGets).toBeGreaterThan(1));
  });

  it("rejection requires and trims a reason", async () => {
    installReviewer("super_admin");
    let postCount = 0;
    let body: unknown;
    server.use(
      http.get("/api/v1/access-requests/review", () => HttpResponse.json(reviewPage([reviewRow]))),
      http.post("/api/v1/access-requests/request-1/decision", async ({ request }) => {
        postCount += 1; body = await request.json();
        return HttpResponse.json({ data: { request: { ...reviewRow, status: "rejected", decisionReason: "Not in scope", version: 3 }, grant: null } });
      })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Reject request request-1" }));
    const dialog = screen.getByRole("dialog", { name: "Reject access request" });
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Explain why the request is rejected");
    expect(postCount).toBe(0);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "  Not in scope  ");
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(body).toEqual({ version: 2, decision: "rejected", reason: "Not in scope" });
    expect(postCount).toBe(1);
  });

  it("unknown approval remains pending without optimistic state or replay", async () => {
    installReviewer("super_admin");
    const unknown = { ...reviewRow, id: "request-unknown", projectId: "project-hidden-valid", project: { id: "project-hidden-valid", resolved: false, name: null } };
    let postCount = 0;
    server.use(
      http.get("/api/v1/access-requests/review", () => HttpResponse.json(reviewPage([unknown]))),
      http.post("/api/v1/access-requests/request-unknown/decision", () => { postCount += 1; return HttpResponse.json({ error: { code: "ACCESS_REQUEST_NOT_APPROVABLE", message: "The access request could not be approved." } }, { status: 409 }); })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Approve request request-unknown" }));
    const dialog = screen.getByRole("dialog", { name: "Approve access request" });
    await user.click(within(dialog).getByRole("button", { name: "Approve request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The access request could not be approved.");
    expect(dialog).toBeVisible();
    expect(postCount).toBe(1);
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.queryByText(/grant active/i)).not.toBeInTheDocument();
  });

  it("a refetched non-pending request disables the stale decision", async () => {
    installReviewer("super_admin");
    let row: ReviewAccessRequest = reviewRow;
    let postCount = 0;
    server.use(
      http.get("/api/v1/access-requests/review", () =>
        HttpResponse.json(reviewPage([row]))
      ),
      http.post("/api/v1/access-requests/request-1/decision", () => {
        postCount += 1;
        row = { ...row, status: "approved", version: 3 };
        return HttpResponse.json(
          { error: { code: "VERSION_CONFLICT", message: "The request changed elsewhere." } },
          { status: 409 }
        );
      })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(
      await screen.findByRole("button", { name: "Approve request request-1" })
    );
    const dialog = screen.getByRole("dialog", { name: "Approve access request" });
    await user.click(within(dialog).getByRole("button", { name: "Approve request" }));

    expect(
      await within(dialog).findByText(
        "This request is no longer in the current review view."
      )
    ).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeDisabled()
    );
    expect(within(dialog).getByText("Version").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Approved")).toBeVisible();
    expect(postCount).toBe(1);
  });

  it("unknown rejection displays only the generic server reason", async () => {
    installReviewer("super_admin");
    const unknown = { ...reviewRow, id: "request-unknown", projectId: "project-hidden-valid", project: { id: "project-hidden-valid", resolved: false, name: null } };
    let row = unknown;
    server.use(
      http.get("/api/v1/access-requests/review", () => HttpResponse.json(reviewPage([row]))),
      http.post("/api/v1/access-requests/request-unknown/decision", () => {
        row = { ...unknown, status: "rejected", decisionReason: "The access request could not be approved.", version: 3 };
        return HttpResponse.json({ data: { request: row, grant: null } });
      })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Reject request request-unknown" }));
    const dialog = screen.getByRole("dialog", { name: "Reject access request" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Internal lookup detail");
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await screen.findByText("The access request could not be approved.")).toBeVisible();
    expect(document.body).not.toHaveTextContent("Internal lookup detail");
  });

  it("revocation sends reason and version and exposes no Worker assignment", async () => {
    installReviewer("super_admin");
    let row: ReviewAccessRequest = { ...reviewRow, status: "approved", activeGrant: { id: "grant-1", version: 1, grantedAt: activeGrant.grantedAt } };
    let body: unknown;
    server.use(
      http.get("/api/v1/access-requests/review", () => HttpResponse.json(reviewPage([row]))),
      http.post("/api/v1/project-access-grants/grant-1/revoke", async ({ request }) => { body = await request.json(); row = { ...row, activeGrant: null }; return HttpResponse.json({ data: { ...activeGrant, active: false, version: 2, revokedAt: "now", revokedById: "super_admin-1", revocationReason: "Access no longer required" } }); })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Revoke grant grant-1" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke project access" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Access no longer required");
    await user.click(within(dialog).getByRole("button", { name: "Revoke access" }));
    expect(body).toEqual({ version: 1, reason: "Access no longer required" });
    expect(await screen.findByRole("status", { name: "Application announcements" })).toHaveTextContent("Project access revoked.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Revoke grant grant-1" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /assign|reassign/i })).not.toBeInTheDocument();
  });

  it("does not retarget an open revocation to a replacement grant", async () => {
    installReviewer("super_admin");
    let row: ReviewAccessRequest = {
      ...reviewRow,
      status: "approved",
      activeGrant: { id: "grant-1", version: 1, grantedAt: activeGrant.grantedAt }
    };
    let postCount = 0;
    server.use(
      http.get("/api/v1/access-requests/review", () =>
        HttpResponse.json(reviewPage([row]))
      ),
      http.post("/api/v1/project-access-grants/grant-1/revoke", () => {
        postCount += 1;
        row = {
          ...row,
          version: 4,
          activeGrant: { id: "grant-2", version: 1, grantedAt: activeGrant.grantedAt }
        };
        return HttpResponse.json(
          { error: { code: "VERSION_CONFLICT", message: "The grant changed elsewhere." } },
          { status: 409 }
        );
      }),
      http.post("/api/v1/project-access-grants/grant-2/revoke", () => {
        postCount += 1;
        return HttpResponse.json({ data: activeGrant });
      })
    );
    const user = userEvent.setup();
    renderApp(["/admin/access-requests"]);
    await user.click(await screen.findByRole("button", { name: "Revoke grant grant-1" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke project access" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "No longer needed");
    await user.click(within(dialog).getByRole("button", { name: "Revoke access" }));

    expect(await within(dialog).findByText("The grant changed elsewhere.")).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Revoke access" })).toBeDisabled()
    );
    expect(dialog).toHaveTextContent("Grant grant-1");
    expect(dialog).not.toHaveTextContent("grant-2");
    expect(postCount).toBe(1);
  });

  it.each(["admin", "super_admin"] as const)(
    "%s review rows expose no Worker assignment action",
    async (role) => {
      installReviewer(role);
      server.use(
        http.get("/api/v1/access-requests/review", () =>
          HttpResponse.json(
            reviewPage([
              {
                ...reviewRow,
                status: "approved",
                activeGrant: {
                  id: "grant-1",
                  version: 1,
                  grantedAt: activeGrant.grantedAt
                }
              }
            ])
          )
        )
      );

      renderApp(["/admin/access-requests"]);
      expect(await screen.findByText("Aurora Villa")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /assign|reassign/i })
      ).not.toBeInTheDocument();
    }
  );
});
