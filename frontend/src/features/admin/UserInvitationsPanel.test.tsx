import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { UserInvitationItem, UserInvitationPage } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { UserInvitationsPanel } from "./UserInvitationsPanel";

const allPermissions = [
  "identity.user_invitations.read",
  "identity.user_invitations.create",
  "identity.user_invitations.resend",
  "identity.user_invitations.revoke"
] as const;

const baseInvitation: UserInvitationItem = {
  id: "invitation-pending",
  name: "Asha Rao",
  email: "asha@example.com",
  role: "designer",
  mobile: "+91 98765 43210",
  status: "pending",
  currentLinkAvailable: true,
  availableActions: ["resend", "revoke"],
  invitedBy: {
    id: "user-super-admin",
    name: "Sana Super Admin",
    email: "sana@lisno.example",
    role: "super_admin"
  },
  issuedAt: "2026-08-23T10:00:00.000Z",
  expiresAt: "2026-08-24T10:00:00.000Z",
  deliveryStatus: "sent",
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  sentAt: "2026-08-23T10:00:01.000Z",
  version: 2,
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:01.000Z"
};

function invitation(
  id: string,
  overrides: Partial<UserInvitationItem> = {}
): UserInvitationItem {
  return { ...baseInvitation, id, ...overrides };
}

function invitationPage(items: UserInvitationItem[]): UserInvitationPage {
  return {
    items,
    pagination: { limit: 20, offset: 0, total: items.length, hasMore: false },
    invitableRoles: ["site_manager", "finance_head", "designer"]
  };
}

describe("UserInvitationsPanel", () => {
  it("requires Super Admin plus read permission and issues exactly one initial GET", async () => {
    let requestCount = 0;
    server.use(
      http.get("/api/v1/admin/user-invitations", ({ request }) => {
        requestCount += 1;
        const url = new URL(request.url);
        expect(`${url.pathname}${url.search}`).toBe(
          "/api/v1/admin/user-invitations?status=pending&limit=20&offset=0"
        );
        return HttpResponse.json({ data: invitationPage([baseInvitation]) });
      })
    );

    const { unmount } = renderWithQuery(
      <UserInvitationsPanel
        actorRole="admin"
        permissions={allPermissions}
      />
    );
    expect(screen.queryByText("Pending invitations")).not.toBeInTheDocument();
    expect(requestCount).toBe(0);
    unmount();

    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={["identity.user_invitations.read"]}
      />
    );
    expect(
      await screen.findByRole("heading", { name: "Pending invitations" })
    ).toBeVisible();
    expect(requestCount).toBe(1);
    expect(screen.queryByRole("button", { name: "Invite user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Asha Rao" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Asha Rao" })).not.toBeInTheDocument();
  });

  it("uses server role order, exact status filters, safe delivery text, and both action gates", async () => {
    const items = [
      baseInvitation,
      invitation("invitation-invalidated", {
        name: "Invalidated Invite",
        email: "invalidated@example.com",
        currentLinkAvailable: false,
        deliveryStatus: "queued",
        deliveryAttemptedAt: null,
        sentAt: null
      }),
      invitation("invitation-claimed", {
        name: "Claimed Invite",
        email: "claimed@example.com",
        currentLinkAvailable: false,
        availableActions: ["revoke"],
        deliveryStatus: "failed",
        sentAt: null
      }),
      invitation("invitation-failed", {
        name: "Failed Invite",
        status: "delivery_failed",
        availableActions: []
      }),
      invitation("invitation-expired", {
        name: "Expired Invite",
        status: "expired",
        availableActions: []
      }),
      invitation("invitation-revoked", {
        name: "Revoked Invite",
        status: "revoked",
        availableActions: []
      }),
      invitation("invitation-superseded", {
        name: "Superseded Invite",
        status: "superseded",
        availableActions: []
      }),
      invitation("invitation-accepted", {
        name: "Accepted Invite",
        status: "accepted",
        availableActions: []
      })
    ];
    const paths: string[] = [];
    server.use(
      http.get("/api/v1/admin/user-invitations", ({ request }) => {
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);
        return HttpResponse.json({ data: invitationPage(items) });
      })
    );

    const user = userEvent.setup();
    const { container } = renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={allPermissions}
      />
    );
    await screen.findByRole("heading", { name: "Pending invitations" });
    await screen.findByRole("button", { name: "Resend Asha Rao" });

    expect(
      within(screen.getByRole("combobox", { name: "Filter invitations by role" }))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["All roles", "Site Manager", "Finance Manager", "Designer"]);
    expect(
      within(screen.getByRole("combobox", { name: "Filter invitations by status" }))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual([
      "Pending",
      "Delivery Failed",
      "Expired",
      "Revoked",
      "Superseded",
      "Accepted"
    ]);

    expect(screen.getAllByText("Pending")).toHaveLength(4);
    for (const [name, status] of [
      ["Failed Invite", "Delivery Failed"],
      ["Expired Invite", "Expired"],
      ["Revoked Invite", "Revoked"],
      ["Superseded Invite", "Superseded"],
      ["Accepted Invite", "Accepted"]
    ]) {
      expect(
        within(screen.getByRole("row", { name: new RegExp(name!) })).getByText(status!)
      ).toBeVisible();
    }
    expect(
      within(screen.getByRole("row", { name: /Asha Rao/ })).getByText("Email sent")
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Invalidated Invite/ })).getByText("Email queued")
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Claimed Invite/ })).getByText("Email delivery failed")
    ).toBeVisible();
    expect(container).not.toHaveTextContent(/token|provider|https?:\/\//i);

    const eligibleRow = screen.getByRole("row", { name: /Asha Rao/ });
    expect(within(eligibleRow).getByRole("button", { name: "Resend Asha Rao" })).toBeVisible();
    expect(within(eligibleRow).getByRole("button", { name: "Revoke Asha Rao" })).toBeVisible();
    const invalidatedRow = screen.getByRole("row", { name: /Invalidated Invite/ });
    expect(invalidatedRow).toHaveTextContent("Current link unavailable—resend");
    const claimedRow = screen.getByRole("row", { name: /Claimed Invite/ });
    expect(claimedRow).toHaveTextContent("This invitation can no longer be resent—revoke it");
    expect(within(claimedRow).queryByRole("button", { name: /Resend/ })).not.toBeInTheDocument();
    expect(within(claimedRow).getByRole("button", { name: "Revoke Claimed Invite" })).toBeVisible();
    for (const name of ["Failed Invite", "Expired Invite", "Revoked Invite", "Superseded Invite", "Accepted Invite"]) {
      expect(within(screen.getByRole("row", { name: new RegExp(name) })).queryByRole("button")).not.toBeInTheDocument();
    }

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter invitations by status" }),
      "accepted"
    );
    await waitFor(() =>
      expect(paths).toContain(
        "/api/v1/admin/user-invitations?status=accepted&limit=20&offset=0"
      )
    );
  });

  it("applies each exact permission as a second gate over server actions", async () => {
    server.use(
      http.get("/api/v1/admin/user-invitations", () =>
        HttpResponse.json({ data: invitationPage([baseInvitation]) })
      )
    );
    const first = renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.create",
          "identity.user_invitations.revoke"
        ]}
      />
    );
    expect(await screen.findByRole("button", { name: "Invite user" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Revoke Asha Rao" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resend Asha Rao" })).not.toBeInTheDocument();
    first.unmount();

    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.resend"
        ]}
      />
    );
    expect(await screen.findByRole("button", { name: "Resend Asha Rao" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Asha Rao" })).not.toBeInTheDocument();
  });

  it("removes Revoke only after the mutation succeeds and the server refetch completes", async () => {
    let listCount = 0;
    server.use(
      http.get("/api/v1/admin/user-invitations", () => {
        listCount += 1;
        const item = listCount === 1
          ? baseInvitation
          : invitation("invitation-pending", {
              status: "revoked",
              availableActions: [],
              currentLinkAvailable: false,
              version: 3
            });
        return HttpResponse.json({ data: invitationPage([item]) });
      }),
      http.post("/api/v1/admin/user-invitations/invitation-pending/revoke", async ({ request }) => {
        expect(await request.json()).toEqual({ version: 2 });
        return HttpResponse.json({
          data: invitation("invitation-pending", {
            status: "revoked",
            availableActions: [],
            currentLinkAvailable: false,
            version: 3
          })
        });
      })
    );

    const user = userEvent.setup();
    renderWithQuery(
      <UserInvitationsPanel actorRole="super_admin" permissions={allPermissions} />
    );
    await user.click(await screen.findByRole("button", { name: "Revoke Asha Rao" }));
    await user.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(listCount).toBe(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Asha Rao" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Asha Rao/ })).getByText("Revoked")
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Pending invitations" })
      ).toHaveFocus()
    );
  });
});
